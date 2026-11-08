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
import { assertJobCaller, assertOwner, assertSameOrigin, readUser, resolveAccess, type Access } from './security.ts';

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
    assertSameOrigin(c);
    await next();
  });
  app.use('/api/*', bodyLimit({
    maxSize: MAX_BODY_BYTES,
    onError: () => {
      throw new AppError(413, 'payload_too_large', 'Request body too large');
    },
  }));

  // Answers with no database or valid config, so it stays a pure liveness check for anonymous callers.
  app.get('/api/health', async (c) => {
    if (!readUser(c, null)) return c.json({ ok: true });
    const container = createContainer(c.env);
    const access = await resolveAccess(c, container.config, container.settings, container.now().toISOString());
    if (access.kind !== 'owner') return c.json({ ok: true });
    return c.json({
      ok: true,
      aiConfigured: container.generator.id !== 'template' && container.config.generator.anthropicApiKey !== null,
      publishingConfigured: container.gateway.statuses().some((p) => p.state === 'ready'),
    });
  });

  app.use('/api/*', async (c, next) => {
    const container = createContainer(c.env);
    c.set('container', container);
    c.set('access', await resolveAccess(c, container.config, container.settings, container.now().toISOString()));
    await next();
  });

  app.get('/api/session', (c) => {
    const access = c.get('access');
    return c.json({
      authRequired: true,
      authenticated: access.kind === 'owner',
      forbidden: access.kind === 'forbidden',
      user: access.kind === 'anonymous' ? null : { displayName: access.user.displayName, email: access.user.email },
    });
  });
  // ChatGPT owns sign-in; it has to be a top-level navigation, never an API call.
  const sessionManaged = (c: AppContext) => c.json(errorBody('session_managed_by_chatgpt', 'Sign-in and sign-out go through /signin-with-chatgpt and /signout-with-chatgpt'), 405);
  app.post('/api/session', sessionManaged);
  app.delete('/api/session', sessionManaged);

  /** The only way background work advances on this host. Call it from a Site schedule. */
  app.post(JOB_PATH, async (c) => {
    const { config, publisher, autonomy, settings, now, redact } = c.get('container');
    await assertJobCaller(c, config, c.get('access'));
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
        if (await autonomy.isDue()) cycle = await autonomy.runCycle();
      } catch (error) {
        if (!(error instanceof AppError && error.code === 'cycle_running')) errors.push(`autonomy: ${describe(error)}`);
      }
      const lastError = errors.join('; ') || null;
      await settings.setJob(TICK_JOB, ranAt, { error: lastError });
      return { ok: lastError === null, ranAt, publish, autonomy: cycle, errors };
    })();
    return c.json(await keepAlive(c, work));
  });

  // --- Everything below is for the workspace owner only ---
  const api = new Hono<AppEnv>();
  api.use('*', async (c, next) => {
    assertOwner(c.get('access'));
    await next();
  });

  const present = (container: Container, post: Post) => ({ ...post, issues: container.gateway.validate(post.platform, post.body, post.mediaUrls) });

  api.get('/status', async (c) => {
    const { settings, autonomy, gateway, generator, posts, config } = c.get('container');
    const current = await settings.get();
    const tick = await settings.getJob(TICK_JOB);
    const [running, nextCycleAt, lastCycle, postCounts] = await Promise.all([
      autonomy.isRunning(), autonomy.nextCycleAt(), settings.getJob(CYCLE_JOB), posts.countByStatus(),
    ]);
    return c.json({
      publishMode: gateway.mode,
      publishingPaused: current.publishingPaused,
      generator: { id: generator.id, reviewRequired: generator.reviewRequired },
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
  api.get('/posts', async (c) => {
    const container = c.get('container');
    const q = readQuery(c, schemas.postQuery);
    const { items, total } = await container.posts.list(q);
    return c.json({ items: items.map((post) => present(container, post)), total, limit: q.limit, offset: q.offset });
  });
  api.post('/posts', async (c) => {
    const container = c.get('container');
    return c.json(present(container, await container.postService.create(await readBody(c, schemas.postCreate))), 201);
  });
  api.get('/posts/:id', async (c) => {
    const container = c.get('container');
    const post = await container.postService.require(c.req.param('id'));
    return c.json({ ...present(container, post), attempts: await container.posts.attempts(post.id) });
  });
  api.patch('/posts/:id', async (c) => {
    const container = c.get('container');
    return c.json(present(container, await container.postService.update(c.req.param('id'), await readBody(c, schemas.postUpdate))));
  });
  api.delete('/posts/:id', async (c) => {
    await c.get('container').postService.delete(c.req.param('id'));
    return c.body(null, 204);
  });
  api.post('/posts/:id/approve', async (c) => {
    const container = c.get('container');
    const { scheduledAt } = await readBody(c, schemas.postApprove);
    return c.json(present(container, await container.postService.approve(c.req.param('id'), scheduledAt)));
  });
  api.post('/posts/:id/schedule', async (c) => {
    const container = c.get('container');
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
    return c.json({ job, result: await autonomy.runCycle() });
  });
  api.get('/activity', async (c) => {
    const { limit, beforeId } = readQuery(c, schemas.activityQuery);
    return c.json({ items: await c.get('container').activity.list(limit, beforeId) });
  });

  app.route('/api', api);
  app.get('*', (c) => {
    if (c.req.path === '/api' || c.req.path.startsWith('/api/')) throw new AppError(404, 'not_found', 'Route not found');
    return serveAsset(c);
  });
  return app;
}
