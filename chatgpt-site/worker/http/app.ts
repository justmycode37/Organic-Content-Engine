import {tickAccounts,claimAccountJob,heartbeatAccountJob,completeAccountJob,failAccountJob,accountLease,publishAccountJobs,runtime} from '../services/account-automation.ts';
import {SocialAccounts,platformOf as scopedPlatformOf} from '../services/social.ts';
import {generateHedgyReel} from '../hedgy-generation.ts';
import {listAccounts,addAccount,updateAccount,accountCreate,accountPatch} from '../services/accounts.ts';
import {videoPreflight} from '../services/video-preflight.ts';
import {preparePlanCycle} from '../services/plan-cycle.ts';
import { randomHex } from '../lib/crypto.ts';
import { getCookie,setCookie,deleteCookie } from 'hono/cookie';
import { z as validator } from 'zod';
import { unlocked,login,logout } from './password.ts';
import { platformOf } from '../services/social.ts';
import { generationRequest,requestGeneration } from '../services/generation-jobs.ts';
import { editPlan,finishVideo,saveEditPlan } from '../services/video-import.ts';
import { createVoiceover,listVoices } from '../services/voiceover.ts';
import {claimRender,renderInput,finishRender,failRender,heartbeatRender} from '../services/render-queue.ts';
import { mcpApp } from './mcp.ts';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import { ZodError, type z } from 'zod';
import { ConfigError } from '../config.ts';
import { createContainer, type Container, type Env } from '../container.ts';
import type { Post } from '../domain/types.ts';
import { AppError, notFound } from '../errors.ts';
import { GenerationError } from '../generation/types.ts';
import { CYCLE_JOB, type CycleResult } from '../services/autonomy.ts';
import type { PublishRunResult } from '../services/publisher.ts';
import { serveAsset } from './assets.ts';
import * as schemas from './schemas.ts';
import { assertJobCaller, assertRenderCaller, assertOwner, assertSameOrigin, readUser, resolveAccess, type Access } from './security.ts';

const MAX_BODY_BYTES = 1024 * 1024;
const JOB_PATH = '/api/jobs/tick';
const TICK_JOB = 'external_tick';

type AppEnv = { Bindings: Env; Variables: { container: Container; access: Access } };
type AppContext = Context<AppEnv>;

async function readBody<S extends z.ZodType>(c: Context, schema: S): Promise<z.output<S>> {
  const raw = await c.req.text();
  if (raw.length === 0) return schema.parse({});
  const mediaType = c.req.header('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (mediaType !== 'application/json') {
    throw new AppError(415, 'unsupported_media_type', 'Content-Type must be application/json');
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new AppError(400, 'invalid_json', 'Request body is not valid JSON');
  }
  return schema.parse(json);
}

const readQuery = <S extends z.ZodType>(c: Context, schema: S): z.output<S> => schema.parse(c.req.query());

const defined = <T extends object>(patch: T) =>
  Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as { [K in keyof T]: Exclude<T[K], undefined> };

/** A client disconnect must not cancel a publish in flight: the post may already be live. */
function keepAlive<T>(c: Context, work: Promise<T>): Promise<T> {
  c.executionCtx.waitUntil(work.catch(() => undefined));
  return work;
}

const errorBody = (code: string, message: string, details?: unknown) => ({ error: { code, message, details }, message });

export function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.onError((error, c) => {
    if (error instanceof AppError) return c.json(errorBody(error.code, error.message, error.details), error.status as 400);
    if (error instanceof ConfigError) return c.json(errorBody('config_invalid', error.message), 500);
    if (error instanceof ZodError) {
      const details = error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
      return c.json(errorBody('validation_error', 'Invalid request', details), 400);
    }
    if (error instanceof GenerationError) return c.json(errorBody('generation_failed', error.message), 502);
    const text = String(error);
    if (text.includes('no such table')) {
      return c.json(errorBody('database_not_migrated', 'The D1 database has no schema yet. Apply the migrations in drizzle/.'), 500);
    }
    const redact = c.get('container')?.redact ?? ((value: string) => value);
    console.error(redact(JSON.stringify({ level: 'error', message: 'request failed', path: c.req.path, error: text })));
    return c.json(errorBody('internal_error', 'Internal server error'), 500);
  });

  app.notFound((c) =>
    c.req.path.startsWith('/api/') ? c.json(errorBody('not_found', 'Route not found'), 404) : c.text('Not found', 404));

  // The Sites shell may frame the page, hence no X-Frame-Options. See README.
  app.use('*', secureHeaders({ xFrameOptions: false }));
  app.use('/api/*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store');
  });
  app.use('/api/*', async (c, next) => {
    if (!/^\/api\/social\/(instagram|tiktok|youtube|x|linkedin)\/callback$/.test(c.req.path) && !c.req.path.startsWith('/api/media/')) assertSameOrigin(c);
    await next();
  });
  app.use('/api/*', async (c,next)=>{if(/^\/api\/(materials\/[a-f0-9-]+\/content|jobs\/(?:render|accounts)\/[a-f0-9-]+\/[a-f0-9-]+\/output)$/.test(c.req.path))return bodyLimit({maxSize:100*1024*1024,onError:()=>{throw new AppError(413,'file_too_large','Maximum file size is 100 MB');}})(c,next);return bodyLimit({
    maxSize: MAX_BODY_BYTES,
    onError: () => {
      throw new AppError(413, 'payload_too_large', 'Request body too large');
    },
  })(c,next);});

  // Answers with no database or valid config, so it stays a pure liveness check for anonymous callers.
  app.get('/api/health', async (c) => {
    if (!readUser(c, null)) return c.json({ ok: true });
    const container = await createContainer(c.env);
    const access = await resolveAccess(c, container.config, container.settings, container.now().toISOString());
    if (access.kind !== 'owner') return c.json({ ok: true });
    return c.json({
      ok: true,
      aiConfigured: container.generator.id === 'chatgpt-plan' || (container.generator.id !== 'template' && container.config.generator.anthropicApiKey !== null),
      publishingConfigured: container.gateway.statuses().some((p) => p.state === 'ready'),
    });
  });

  app.get('/api/social/:platform/callback',async c=>{
 const container=await createContainer(c.env);const access=await resolveAccess(c,container.config,container.settings,new Date().toISOString());assertOwner(access);if(access.kind!=='owner'||!await unlocked(c,c.env,access.user.userId))throw new AppError(401,'password_required','Unlock the workspace and try connecting again');
 const platform=scopedPlatformOf(c.req.param('platform')),state=c.req.query('state')??'';
 const pending=await container.db.prepare('SELECT workspace_account_id FROM oauth_pending WHERE state=? AND platform=?').bind(state,platform).first<{workspace_account_id:string|null}>();
 const social=new SocialAccounts(container.db,runtime(c.env),fetch,pending?.workspace_account_id??undefined);
 try{await social.callback(platform,state,getCookie(c,'oce_oauth')??'',c.req.query('code')??'',c.req.query('error'));deleteCookie(c,'oce_oauth',{path:'/api/social'});return c.redirect('/#/accounts');}catch(error){return c.redirect(`/#/accounts?connectionError=${encodeURIComponent(error instanceof AppError?error.message:'Connection failed')}`);}
  });

  app.use('/api/*', async (c, next) => {
    const container = await createContainer(c.env);
    c.set('container', container);
    c.set('access', await resolveAccess(c, container.config, container.settings, container.now().toISOString()));
    await next();
  });

  app.get('/api/session', async (c) => {
    const access = c.get('access');
    return c.json({
      authRequired: true,
      authenticated: access.kind === 'owner' && await unlocked(c,c.env,access.user.userId),
      passwordRequired: access.kind === 'owner',
      forbidden: access.kind === 'forbidden',
      user: access.kind === 'anonymous' ? null : { displayName: access.user.displayName, email: access.user.email },
    });
  });
  app.post('/api/session',async c=>{const access=c.get('access');assertOwner(access);if(access.kind!=='owner')throw new AppError(401,'unauthorized','Sign in first');const body=await readBody(c,validator.object({token:validator.string().min(1).max(1000)}).strict());return login(c,c.env,c.get('container').db,access.user.userId,body.token);});
  app.delete('/api/session',c=>logout(c));

  /** The only way background work advances on this host. Call it from a Site schedule. */
  app.post(JOB_PATH, async (c) => {
    const { config, publisher, autonomy, settings, now, redact } = c.get('container');
    await assertJobCaller(c, config, c.get('access'));
    if (!(await settings.get()).autonomyEnabled) return c.json({ ok: true, paused: true, publish: null, autonomy: null, errors: [] });
    const ranAt = now().toISOString();
    const errors: string[] = [];
    const describe = (error: unknown) => redact(error instanceof Error ? error.message : String(error));

    const work = (async () => {
      let publish: PublishRunResult | null = null;
      let cycle: CycleResult | null = null;
      try {
        publish = await publisher.publishDue();
      } catch (error) {
        errors.push(`publish: ${describe(error)}`);
      }
      try {
        if (await autonomy.isDue()) cycle = (c.get('container').generator.id==='chatgpt-plan'?await preparePlanCycle(c.get('container')):await autonomy.runCycle()) as CycleResult;
      } catch (error) {
        if (!(error instanceof AppError && error.code === 'cycle_running')) errors.push(`autonomy: ${describe(error)}`);
      }
      const lastError = errors.join('; ') || null;
      await settings.setJob(TICK_JOB, ranAt, { error: lastError });
      return { ok: lastError === null, ranAt, publish, autonomy: cycle, errors };
    })();
    return c.json(await keepAlive(c, work));
  });

  // The always-on renderer has no browser session. It uses the existing machine credential.
  app.use('/api/jobs/render/*',async(c,next)=>{
    const container=c.get('container'),access=c.get('access');
    await assertRenderCaller(c,container.config,access);
    if(access.kind==='owner'&&!await unlocked(c,c.env,access.user.userId))throw new AppError(401,'password_required','Unlock the workspace');
    await next();
  });
  app.post('/api/jobs/render/claim',async c=>c.json(await keepAlive(c,claimRender(c.get('container')))));
  app.post('/api/jobs/render/:id/:lease/heartbeat',async c=>c.json(await heartbeatRender(c.get('container'),c.req.param('id'),c.req.param('lease'))));
  app.get('/api/jobs/render/:id/:lease/media/:materialId',async c=>{
    const f=await renderInput(c.get('container'),c.req.param('id'),c.req.param('lease'),c.req.param('materialId'));
    return new Response(f.stream,{headers:{'Content-Type':f.material.mime,'Content-Length':String(f.material.size),'Cache-Control':'no-store'}});
  });
  app.put('/api/jobs/render/:id/:lease/output',async c=>{
    if(!c.req.raw.body)throw new AppError(400,'file_missing','The renderer must upload an MP4');
    let shots;
    const raw=c.req.header('x-render-shots');
    if(raw){try{shots=editPlan.shape.shots.parse(JSON.parse(raw));}catch{throw new AppError(422,'render_invalid','Invalid rendered shot list');}}
    return c.json(await finishRender(c.get('container'),c.req.param('id'),c.req.param('lease'),c.req.raw.body,Number(c.req.header('content-length')),shots));
  });
  app.post('/api/jobs/render/:id/:lease/fail',async c=>{
    const input=await readBody(c,validator.object({code:validator.string().min(1).max(80),message:validator.string().max(500)}).strict());
    return c.json(await failRender(c.get('container'),c.req.param('id'),c.req.param('lease'),input.code,input.message));
  });

  app.use('/api/jobs/accounts/*',async(c,next)=>{await assertRenderCaller(c,{...c.get('container').config,renderWorkerToken:typeof c.env.ACCOUNT_WORKER_TOKEN==='string'?c.env.ACCOUNT_WORKER_TOKEN:null},c.get('access'));await next();});
  app.post('/api/jobs/accounts/claim',async c=>{const x=c.get('container');await publishAccountJobs(x,c.env);await tickAccounts(x,c.env);return c.json(await claimAccountJob(x));});
  app.get('/api/jobs/accounts/health',async c=>c.json({ok:true,apiConfigured:!!c.env.OPENAI_API_KEY,audioConfigured:!!c.env.ELEVENLABS_API_KEY,accounts:await listAccounts(c.get('container').db)}));
  app.post('/api/jobs/accounts/:id/:lease/heartbeat',async c=>c.json(await heartbeatAccountJob(c.get('container'),c.req.param('id'),c.req.param('lease'))));
  app.put('/api/jobs/accounts/:id/:lease/output',async c=>{
   const x=c.get('container'),id=c.req.param('id'),lease=c.req.param('lease'),job=await accountLease(x,id,lease),size=Number(c.req.header('content-length'));
   if(c.req.header('content-type')!=='video/mp4'||!c.req.raw.body||!Number.isSafeInteger(size)||size<100||size>100*1024*1024)throw new AppError(400,'output_invalid','Upload an MP4 below 100 MB');
   let m=job.output_material_id?await x.materials.get(job.output_material_id):null;
   if(!m){m=await x.materials.init({name:`reel-${id}.mp4`,mime:'video/mp4',size,kind:'finished'});await x.db.prepare('UPDATE account_automation_jobs SET output_material_id=? WHERE id=? AND lease_id=?').bind(m.id,id,lease).run();}
   if(!m.uploaded)await x.materials.upload(m.id,c.req.raw.body,size);return c.json({materialId:m.id});
  });
  app.post('/api/jobs/accounts/:id/:lease/complete',async c=>{const input=await readBody(c,validator.object({materialId:validator.string().uuid(),spec:validator.unknown(),provenance:validator.unknown()}).strict());return c.json(await completeAccountJob(c.get('container'),c.req.param('id'),c.req.param('lease'),input));});
  app.post('/api/jobs/accounts/:id/:lease/fail',async c=>c.json(await failAccountJob(c.get('container'),c.req.param('id'),c.req.param('lease'),await readBody(c,validator.object({code:validator.string().max(80),message:validator.string().max(300)}).strict()))));

  // --- Everything below is for the workspace owner only ---
  const api = new Hono<AppEnv>();
  api.use('*', async (c, next) => {
    const access=c.get('access');assertOwner(access);
    if(access.kind!=='owner'||!await unlocked(c,c.env,access.user.userId))throw new AppError(401,'password_required','Enter the workspace password');
    await next();
  });

  api.post('/accounts/:id/connect',async c=>{const x=c.get('container'),row=await x.db.prepare('SELECT value FROM accounts WHERE id=?').bind(c.req.param('id')).first<{value:string}>();if(!row)throw notFound('Account',c.req.param('id'));const account=JSON.parse(row.value);const social=new SocialAccounts(x.db,runtime(c.env),fetch,account.id);const browser=randomHex(32);const url=await social.start(scopedPlatformOf(account.platform),browser);setCookie(c,'oce_oauth',browser,{httpOnly:true,secure:true,sameSite:'Lax',path:'/api/social',maxAge:600});return c.json({url});});
  api.post('/accounts/:id/generate',async c=>{const x=c.get('container'),row=await x.db.prepare('SELECT value FROM accounts WHERE id=?').bind(c.req.param('id')).first();if(!row)throw notFound('Account',c.req.param('id'));const at=new Date(Date.now()+3600000).toISOString();const id=crypto.randomUUID();await x.db.prepare('INSERT INTO account_automation_jobs(id,account_id,scheduled_at,created_at,updated_at) VALUES(?,?,?,?,?)').bind(id,c.req.param('id'),at,new Date().toISOString(),new Date().toISOString()).run();return c.json({id,status:'pending'},202);});
  api.get('/accounts',async c=>{const x=c.get('container');const accounts=await listAccounts(x.db);const heartbeat=await x.settings.getJob('account_worker');for(const a of accounts){const social=new SocialAccounts(x.db,runtime(c.env),fetch,a.id),platform=scopedPlatformOf(a.platform);const linked=await social.account(platform);const missing=social.config(platform).missing;const issues=[...missing.map(k=>`App setup: ${k}`),...(!linked?['Connect Instagram']:[]),...(!c.env.OPENAI_API_KEY?['Generation key missing']:[]),...(!c.env.ELEVENLABS_API_KEY?['Audio key missing']:[]),...(!heartbeat.lastRunAt||Date.now()-Date.parse(heartbeat.lastRunAt)>120000?['Automation worker offline']:[]),...(!a.enabled?['Automation paused']:[])];(a as any).connectionStatus={connected:!!linked,setupRequired:missing};(a as any).health={state:issues.length?'blocked':'running',issues};const runs=await x.db.prepare('SELECT scheduled_at,status,error,external_url FROM account_automation_jobs WHERE account_id=? ORDER BY scheduled_at DESC LIMIT 30').bind(a.id).all<any>();for(const slot of a.schedule){const run=runs.results.find(r=>r.scheduled_at===slot.scheduledAt);slot.status=run?.status??(issues.length?'blocked':'planned');}(a as any).recentRuns=runs.results;if(['failed','needs_attention'].includes(runs.results[0]?.status)){issues.push(runs.results[0].error??'Latest reel needs attention');(a as any).health={state:'blocked',issues};}}return c.json({accounts});});
  api.post('/accounts',async c=>c.json(await addAccount(c.get('container').db,await readBody(c,accountCreate)),201));
  api.patch('/accounts/:id',async c=>c.json(await updateAccount(c.get('container').db,c.req.param('id'),await readBody(c,accountPatch))));

  const present = (container: Container, post: Post) => ({ ...post, issues: container.gateway.validate(post.platform, post.body, post.mediaUrls) });

  api.get('/status', async (c) => {
    const { settings, autonomy, gateway, generator, posts, config } = c.get('container');
    const current = await settings.get();
    const tick = await settings.getJob(TICK_JOB);
    const renderer = await settings.getJob('render_worker');
    const [running, nextCycleAt, lastCycle, postCounts] = await Promise.all([
      autonomy.isRunning(), autonomy.nextCycleAt(), settings.getJob(CYCLE_JOB), posts.countByStatus(),
    ]);
    return c.json({
      publishMode: gateway.mode,
      publishingPaused: current.publishingPaused,
      generator: { id: generator.id, reviewRequired: generator.reviewRequired },
      rendering: {lastSeenAt:renderer.lastRunAt,online:Boolean(renderer.lastRunAt&&Date.now()-Date.parse(renderer.lastRunAt)<90_000)},
      autonomy: {
        enabled: current.autonomyEnabled,
        effectiveAutoApprove: current.autoApprove && !generator.reviewRequired,
        running,
        nextCycleAt,
        lastCycle,
      },
      // A Worker cannot hold a timer. `enabled` and `running` stay false on purpose.
      scheduler: {
        enabled: false,
        running: false,
        tickSeconds: 0,
        mode: 'external_job',
        jobPath: JOB_PATH,
        jobCredentialConfigured: config.jobToken !== null || config.serviceAccessTrusted,
        lastTickAt: tick.lastRunAt,
        lastError: (tick.lastResult as { error?: string | null } | null)?.error ?? null,
      },
      postCounts,
      platformsReady: gateway.statuses().filter((p) => p.state === 'ready').map((p) => p.id),
    });
  });

  api.get('/platforms', (c) => {
    const { gateway } = c.get('container');
    return c.json({ items: gateway.statuses(), publishMode: gateway.mode });
  });

  api.get('/settings', async (c) => c.json(await c.get('container').settings.get()));
  api.patch('/settings', async (c) => {
    const { settings, activity, now } = c.get('container');
    const patch = defined(await readBody(c, schemas.settingsUpdate));
    const iso = now().toISOString();
    const updated = await settings.update(patch, iso);
    await activity.add({ type: 'settings.updated', message: `Updated: ${Object.keys(patch).join(', ') || 'nothing'}` }, iso);
    return c.json(updated);
  });

  api.get('/brand', async (c) => c.json(await c.get('container').settings.getBrand()));
  api.put('/brand', async (c) => {
    const { settings, now } = c.get('container');
    return c.json(await settings.saveBrand(await readBody(c, schemas.brandBody), now().toISOString()));
  });

  // Autopilot is the on/off view of the autonomy settings.
  const autopilot = async ({ settings, autonomy }: Container) => {
    const { lastRunAt, lastResult } = await settings.getJob(CYCLE_JOB);
    const running = (await settings.get()).autonomyEnabled;
    return {
      running,
      status: running ? 'running' : 'paused',
      lastRunAt,
      nextRunAt: await autonomy.nextCycleAt(),
      lastError: (lastResult as { error?: string | null } | null)?.error ?? null,
    };
  };
  const setAutopilot = async (container: Container, enabled: boolean) => {
    const iso = container.now().toISOString();
    await container.settings.update({ autonomyEnabled: enabled }, iso);
    await container.activity.add({ type: 'autopilot', message: enabled ? 'Autopilot started' : 'Autopilot paused' }, iso);
    return autopilot(container);
  };
  api.get('/autopilot', async (c) => c.json(await autopilot(c.get('container'))));
  api.post('/autopilot/start', async (c) => c.json(await setAutopilot(c.get('container'), true)));
  api.post('/autopilot/pause', async (c) => c.json(await setAutopilot(c.get('container'), false)));

  api.get('/social',async c=>c.json({items:await c.get('container').social.statuses()}));
  api.post('/social/:platform/connect',async c=>{const browser=randomHex(32);const url=await c.get('container').social.start(platformOf(c.req.param('platform')),browser);setCookie(c,'oce_oauth',browser,{httpOnly:true,secure:true,sameSite:'Lax',path:'/api/social',maxAge:600});return c.json({url});});
  api.delete('/social/:platform',async c=>c.json(await c.get('container').social.disconnect(platformOf(c.req.param('platform')))));
  api.get('/social/tiktok/creator',async c=>c.json(await c.get('container').social.creator()));
  api.get('/materials',async c=>c.json({items:await c.get('container').materials.list()}));
  api.post('/materials',async c=>c.json(await c.get('container').materials.init(await readBody(c,validator.object({name:validator.string().min(1).max(255),mime:validator.string().max(150),size:validator.number().int().positive().max(100*1024*1024),kind:validator.enum(['source','finished']).optional()}).strict())),201));
  api.put('/materials/:id/content',async c=>{if(!c.req.raw.body)throw new AppError(400,'file_missing','Choose a file');return c.json(await c.get('container').materials.upload(c.req.param('id'),c.req.raw.body,Number(c.req.header('content-length'))));});
  api.patch('/materials/:id',async c=>c.json(await c.get('container').materials.update(c.req.param('id'),await readBody(c,validator.object({notes:validator.string().max(12000).optional(),enabled:validator.boolean().optional()}).strict()))));
  api.delete('/materials/:id',async c=>{await c.get('container').materials.remove(c.req.param('id'));return c.body(null,204);});
  api.get('/materials/:id/file',async c=>{const f=await c.get('container').materials.read(c.req.param('id'));return new Response(f.stream,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(f.material.name)}`}});});
  api.get('/materials/:id/preview',async c=>{const f=await c.get('container').materials.read(c.req.param('id'),c.req.header('range'));if(!['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','audio/mpeg'].includes(f.material.mime))throw new AppError(422,'preview_unsupported','Preview is unavailable for this file');const headers=new Headers({'Content-Type':f.material.mime,'Accept-Ranges':'bytes','Cache-Control':'no-store'});const range=(c.req.header('range')?f.object.range:undefined) as {offset:number;length:number}|undefined;if(range){headers.set('Content-Range',`bytes ${range.offset}-${range.offset+range.length-1}/${f.material.size}`);headers.set('Content-Length',String(range.length));}return new Response(f.stream,{status:range?206:200,headers});});
  api.post('/generation',async c=>c.json(await requestGeneration(c.get('container'),await readBody(c,generationRequest)),201));
  api.get('/voiceover/voices',async c=>c.json(await listVoices(c.get('container'))));
  api.post('/voiceover',async c=>c.json(await createVoiceover(c.get('container'),await readBody(c,validator.object({text:validator.string().trim().min(1).max(1500),voiceId:validator.string().regex(/^[A-Za-z0-9]{8,64}$/)}).strict())),201));
  api.put('/generation/:id/edit',async c=>c.json(await saveEditPlan(c.get('container'),c.req.param('id'),(await readBody(c,validator.object({edit:editPlan}).strict())).edit)));
  api.post('/generation/:id/finish',async c=>c.json(await finishVideo(c.get('container'),c.req.param('id'),await readBody(c,validator.object({materialId:validator.string().uuid(),edit:editPlan.optional()}).strict()))));
  api.get('/generation',async c=>c.json({items:(await c.get('container').db.prepare('SELECT g.id,g.kind,g.status,g.result,g.created_at,r.error_code AS renderErrorCode,r.error_message AS renderErrorMessage FROM generation_jobs g LEFT JOIN video_renders r ON r.job_id=g.id ORDER BY g.created_at DESC LIMIT 50').all()).results}));

  // Pillars
  const requirePillar = async ({ pillars }: Container, id: string) => {
    const pillar = await pillars.get(id);
    if (!pillar) throw notFound('Pillar', id);
    return pillar;
  };
  api.get('/pillars', async (c) => c.json({ items: await c.get('container').pillars.list() }));
  api.post('/pillars', async (c) => {
    const { pillars, now } = c.get('container');
    const input = await readBody(c, schemas.pillarCreate);
    const iso = now().toISOString();
    return c.json(await pillars.save({ id: crypto.randomUUID(), ...input, createdAt: iso, updatedAt: iso }), 201);
  });
  api.get('/pillars/:id', async (c) => c.json(await requirePillar(c.get('container'), c.req.param('id'))));
  api.patch('/pillars/:id', async (c) => {
    const container = c.get('container');
    const pillar = await requirePillar(container, c.req.param('id'));
    const patch = defined(await readBody(c, schemas.pillarUpdate));
    return c.json(await container.pillars.save({ ...pillar, ...patch, updatedAt: container.now().toISOString() }));
  });
  api.delete('/pillars/:id', async (c) => {
    const id = c.req.param('id');
    if (!(await c.get('container').pillars.delete(id))) throw notFound('Pillar', id);
    return c.body(null, 204);
  });

  // Ideas
  const requireIdea = async ({ ideas }: Container, id: string) => {
    const idea = await ideas.get(id);
    if (!idea) throw notFound('Idea', id);
    return idea;
  };
  api.get('/ideas', async (c) => {
    const q = readQuery(c, schemas.ideaQuery);
    return c.json({ ...(await c.get('container').ideas.list(q)), limit: q.limit, offset: q.offset });
  });
  api.post('/ideas', async (c) => c.json(await c.get('container').ideation.addManual(await readBody(c, schemas.ideaCreate)), 201));
  api.post('/ideas/generate', async (c) => {
    const container = c.get('container');
    const { pillarId, count, prompt } = await readBody(c, schemas.ideaGenerate);
    return c.json({ items: await container.ideation.generate(await requirePillar(container, pillarId), count, prompt) }, 201);
  });
  api.get('/ideas/:id', async (c) => c.json(await requireIdea(c.get('container'), c.req.param('id'))));
  api.patch('/ideas/:id', async (c) => {
    const container = c.get('container');
    const idea = await requireIdea(container, c.req.param('id'));
    const patch = defined(await readBody(c, schemas.ideaUpdate));
    const next = { ...idea, ...patch, updatedAt: container.now().toISOString() };
    try {
      await container.ideas.update(next);
    } catch (error) {
      if (String(error).includes('UNIQUE')) throw new AppError(409, 'duplicate_idea', 'An idea with this title already exists for the pillar');
      throw error;
    }
    return c.json(next);
  });
  api.delete('/ideas/:id', async (c) => {
    const id = c.req.param('id');
    if (!(await c.get('container').ideas.delete(id))) throw notFound('Idea', id);
    return c.body(null, 204);
  });
  api.post('/ideas/:id/draft', async (c) => {
    const container = c.get('container');
    const { platform, scheduledAt } = await readBody(c, schemas.ideaDraft);
    return c.json(present(container, await container.postService.createFromIdea(c.req.param('id'), platform, scheduledAt ?? null)), 201);
  });

  // Posts
  api.get('/feedback', async (c) => c.json(await c.get('container').feedback.list()));
  api.get('/posts', async (c) => {
    const container = c.get('container');
    const q = readQuery(c, schemas.postQuery);
    const { items, total } = await container.posts.list(q);
    return c.json({ items: items.map((post) => present(container, post)), total, limit: q.limit, offset: q.offset });
  });
  api.post('/posts', async (c) => {
    const container = c.get('container');
    const input=await readBody(c,schemas.postCreate);if(input.scheduledAt)await videoPreflight(container,input);
    return c.json(present(container, await container.postService.create(input)), 201);
  });
  api.get('/posts/:id', async (c) => {
    const container = c.get('container');
    const post = await container.postService.require(c.req.param('id'));
    return c.json({ ...present(container, post), attempts: await container.posts.attempts(post.id), feedback: await container.feedback.get(post.id) });
  });
  api.put('/posts/:id/feedback', async (c) => {
    const container=c.get('container'), id=c.req.param('id'), post=await container.postService.require(id), input=await readBody(c,schemas.feedbackBody);
    if ((input.impressions!==undefined||input.engagements!==undefined||input.conversions!==undefined) && post.status!=='published') throw new AppError(422,'metrics_require_published_post','Performance metrics can only be recorded for a published post');
    await container.feedback.save({postId:id,...input,updatedAt:container.now().toISOString()});
    return c.json(await container.feedback.get(id));
  });
  api.post('/posts/:id/revise', async c => {
    const container=c.get('container'), source=await container.postService.require(c.req.param('id')), feedback=await container.feedback.get(source.id);
    if(!feedback)throw new AppError(409,'feedback_required','Add feedback before requesting a revision');
    if(!source.ideaId)throw new AppError(409,'idea_required','This post has no linked idea to revise');
    if(source.status==='scheduled'||source.status==='publishing') throw new AppError(409,'post_not_revisable','Unschedule the post before requesting a revision');
    const idea=await container.ideas.get(source.ideaId); if(!idea)throw notFound('Idea',source.ideaId);
    const pillar=await container.pillars.get(idea.pillarId);if(!pillar)throw notFound('Pillar',idea.pillarId);
    const revisionNote=`Prior post text:\n${source.body.slice(0,6000)}\n\nEditorial feedback (${feedback.verdict??'no verdict'}):\n${feedback.notes.slice(0,2000)}`;
    if(container.generator.id==='chatgpt-plan'){
      return c.json(await requestGeneration(container,{kind:'draft',ideaId:idea.id,platform:source.platform,revisionNote,sourcePostId:source.id}),202);
    }
    const body=await container.ideation.draft(pillar,idea,source.platform,revisionNote);
    const revised=container.postService.build({platform:source.platform,body,mediaUrls:source.mediaUrls,publishOptions:source.publishOptions,pillarId:source.pillarId,ideaId:source.ideaId,generator:container.generator.id,status:'needs_review',scheduledAt:null});
    await container.posts.insert(revised);
    return c.json(present(container,revised),201);
  });
  api.patch('/posts/:id', async (c) => {
    const container = c.get('container');
    const patch=await readBody(c,schemas.postUpdate);const current=await container.postService.require(c.req.param('id'));if(current.status==='scheduled')await videoPreflight(container,{...current,...defined(patch)});
    return c.json(present(container, await container.postService.update(c.req.param('id'), patch)));
  });
  api.delete('/posts/:id', async (c) => {
    await c.get('container').postService.delete(c.req.param('id'));
    return c.body(null, 204);
  });
  api.post('/posts/:id/approve', async (c) => {
    const container = c.get('container');
    await videoPreflight(container,await container.postService.require(c.req.param('id')));
    const { scheduledAt } = await readBody(c, schemas.postApprove);
    return c.json(present(container, await container.postService.approve(c.req.param('id'), scheduledAt)));
  });
  api.post('/posts/:id/schedule', async (c) => {
    const container = c.get('container');
    await videoPreflight(container,await container.postService.require(c.req.param('id')));
    const { scheduledAt } = await readBody(c, schemas.postSchedule);
    return c.json(present(container, await container.postService.schedule(c.req.param('id'), scheduledAt)));
  });
  api.post('/posts/:id/unschedule', async (c) => {
    const container = c.get('container');
    return c.json(present(container, await container.postService.unschedule(c.req.param('id'))));
  });
  api.post('/posts/:id/cancel', async (c) => {
    const container = c.get('container');
    return c.json(present(container, await container.postService.cancel(c.req.param('id'))));
  });
  api.post('/posts/:id/publish-now', async (c) => {
    const container = c.get('container');
    const post = await container.postService.require(c.req.param('id'));
    container.postService.assertPublishable(post.platform, post.body, post.mediaUrls);
    await videoPreflight(container,post);
    return c.json(present(container, await keepAlive(c, container.publisher.publishNow(post.id))));
  });
  api.post('/posts/:id/resolve', async (c) => {
    const container = c.get('container');
    return c.json(present(container, await container.postService.resolve(c.req.param('id'), await readBody(c, schemas.postResolve))));
  });

  // Operations
  api.post('/scheduler/run', async (c) => {
    const { publisher, autonomy } = c.get('container');
    const { job } = await readBody(c, schemas.schedulerRun);
    if (job === 'publish') return c.json({ job, result: await keepAlive(c, publisher.publishDue()) });
    return c.json({ job, result: c.get('container').generator.id==='chatgpt-plan'?await preparePlanCycle(c.get('container')):await autonomy.runCycle() });
  });
  api.get('/activity', async (c) => {
    const { limit, beforeId } = readQuery(c, schemas.activityQuery);
    return c.json({ items: await c.get('container').activity.list(limit, beforeId) });
  });

  app.route('/mcp',mcpApp());
  app.route('/api', api);
  app.get('*', (c) => {
    if (c.req.path === '/api' || c.req.path.startsWith('/api/')) throw new AppError(404, 'not_found', 'Route not found');
    return serveAsset(c);
  });
  return app;
}
