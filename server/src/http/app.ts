import { analyzeMaterial } from '../services/analyze.ts';
import { MAX_UPLOAD } from '../services/materials.ts';
import { z as validator } from 'zod';
import { randomUUID } from 'node:crypto';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { deleteCookie, setCookie } from 'hono/cookie';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { ZodError, type z } from 'zod';
import type { Container } from '../container.ts';
import type { Post } from '../domain/types.ts';
import { AppError, notFound } from '../errors.ts';
import { GenerationError } from '../generation/types.ts';
import { CYCLE_JOB } from '../services/autonomy.ts';
import * as schemas from './schemas.ts';
import {
  createSessionValue,
  isAuthenticated,
  originGuard,
  requireAuth,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  tokenMatches,
} from './security.ts';

const MAX_BODY_BYTES = 1024 * 1024;

async function readBody<S extends z.ZodType>(c: Context, schema: S): Promise<z.output<S>> {
  const raw = await c.req.text();
  if (raw.length === 0) return schema.parse({});
  // Compare the media type itself: startsWith() also accepts lookalikes such as
  // application/jsonp and application/json-seq.
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

export function createApp(container: Container): Hono {
  const { config, logger, redact, now, gateway, generator, settings, pillars, ideas, posts, activity, ideation, postService, publisher, autonomy, scheduler } = container;
  const app = new Hono();

  /** Adds what the UI needs to warn before scheduling. */
  const present = (post: Post) => ({ ...post, issues: gateway.validate(post.platform, post.body, post.mediaUrls) });

  app.onError((error, c) => {
    if (error instanceof AppError) {
      return c.json({ error: { code: error.code, message: error.message, details: error.details }, message: error.message }, error.status as 400);
    }
    if (error instanceof ZodError) {
      const details = error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
      return c.json({ error: { code: 'validation_error', message: 'Invalid request', details }, message: 'Invalid request' }, 400);
    }
    if (error instanceof GenerationError) {
      return c.json({ error: { code: 'generation_failed', message: error.message }, message: error.message }, 502);
    }
    logger.error('request failed', { path: c.req.path, error: redact(String(error)) });
    return c.json({ error: { code: 'internal_error', message: 'Internal server error' }, message: 'Internal server error' }, 500);
  });

  app.notFound((c) => c.json({ error: { code: 'not_found', message: 'Route not found' }, message: 'Route not found' }, 404));

  app.use('*', secureHeaders());
  app.use('/api/*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store');
  });
  app.use('/api/*', cors({
    origin: (origin) => (config.corsOrigins.includes(origin) ? origin : null),
    credentials: true,
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Authorization', 'Content-Type'],
    maxAge: 600,
  }));
  app.use('/api/*', originGuard(config));
  app.use('/api/*', async (c, next) => {
    if (c.req.path === '/api/materials' && c.req.method === 'POST') {
      return bodyLimit({ maxSize: MAX_UPLOAD + 65536, onError: () => { throw new AppError(413, 'payload_too_large', 'Maximum file size is 100 MB'); } })(c, next);
    }
    return bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: () => {
        throw new AppError(413, 'payload_too_large', 'Request body too large');
      },
    })(c, next);
  });

  // --- Public ---
  app.get('/api/health', (c) => {
    if (!isAuthenticated(c, config, now().getTime())) return c.json({ ok: true });
    return c.json({
      ok: true,
      aiConfigured: generator.id !== 'template',
      publishingConfigured: gateway.statuses().some((p) => p.state === 'ready'),
    });
  });

  app.get('/api/session', (c) =>
    c.json({ authRequired: config.apiToken !== null, authenticated: isAuthenticated(c, config, now().getTime()) }));

  app.post('/api/session', async (c) => {
    if (!config.apiToken) return c.json({ authRequired: false, authenticated: true });
    const { token } = await readBody(c, schemas.sessionBody);
    if (!tokenMatches(config, token)) throw new AppError(401, 'unauthorized', 'Invalid token');
    setCookie(c, SESSION_COOKIE, createSessionValue(config.apiToken, now().getTime()), {
      httpOnly: true,
      sameSite: 'Strict',
      secure: config.cookieSecure,
      path: '/api',
      maxAge: SESSION_TTL_SECONDS,
    });
    return c.json({ authRequired: true, authenticated: true });
  });

  app.delete('/api/session', (c) => {
    deleteCookie(c, SESSION_COOKIE, { path: '/api' });
    return c.body(null, 204);
  });

  // --- Everything below requires auth ---
  const api = new Hono();
  api.use('*', requireAuth(config, now));

  api.get('/status', (c) => {
    const current = settings.get();
    return c.json({
      publishMode: gateway.mode,
      publishingPaused: current.publishingPaused,
      generator: { id: generator.id, reviewRequired: generator.reviewRequired },
      autonomy: {
        enabled: current.autonomyEnabled,
        effectiveAutoApprove: current.autoApprove && !generator.reviewRequired,
        running: autonomy.isRunning,
        nextCycleAt: autonomy.nextCycleAt(),
        lastCycle: settings.getJob(CYCLE_JOB),
      },
      scheduler: scheduler.status(),
      postCounts: posts.countByStatus(),
      platformsReady: gateway.statuses().filter((p) => p.state === 'ready').map((p) => p.id),
    });
  });

  api.get('/platforms', (c) => c.json({ items: gateway.statuses(), publishMode: gateway.mode }));

  api.get('/settings', (c) => c.json(settings.get()));
  api.patch('/settings', async (c) => {
    const patch = await readBody(c, schemas.settingsUpdate);
    const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    const iso = now().toISOString();
    const updated = settings.update(defined, iso);
    activity.add({ type: 'settings.updated', message: `Updated: ${Object.keys(defined).join(', ') || 'nothing'}` }, iso);
    return c.json(updated);
  });

  api.get('/brand', (c) => c.json(settings.getBrand()));
  api.put('/brand', async (c) => c.json(settings.saveBrand(await readBody(c, schemas.brandBody), now().toISOString())));

  // Autopilot is the on/off view of the autonomy settings.
  const autopilot = () => {
    const { lastRunAt, lastResult } = settings.getJob(CYCLE_JOB);
    const running = settings.get().autonomyEnabled;
    return {
      running,
      status: running ? 'running' : 'paused',
      lastRunAt,
      nextRunAt: autonomy.nextCycleAt(),
      lastError: (lastResult as { error?: string | null } | null)?.error ?? null,
    };
  };
  const setAutopilot = (enabled: boolean) => {
    const iso = now().toISOString();
    settings.update({ autonomyEnabled: enabled }, iso);
    activity.add({ type: 'autopilot', message: enabled ? 'Autopilot started' : 'Autopilot paused' }, iso);
    return autopilot();
  };
  api.get('/autopilot', (c) => c.json(autopilot()));
  api.post('/autopilot/start', (c) => c.json(setAutopilot(true)));
  api.post('/autopilot/pause', (c) => c.json(setAutopilot(false)));

  // Local account connection and private reference library.
  api.get('/chatgpt', c => c.json(container.chatgpt.status()));
  api.post('/chatgpt/connect', async c => {
    const origin = c.req.header('origin');
    const returnUrl = origin && config.corsOrigins.includes(origin) ? origin : (config.corsOrigins[0] ?? 'http://127.0.0.1:5173');
    return c.json({ url: await container.chatgpt.start(returnUrl) });
  });
  api.delete('/chatgpt', async c => c.json(await container.chatgpt.disconnect()));
  api.get('/chatgpt/models', async c => c.json({ items: await container.chatgpt.models() }));
  api.patch('/chatgpt', async c => {
    const { model } = await readBody(c, validator.object({ model: validator.string().min(1) }).strict());
    await container.chatgpt.selectModel(model);
    return c.json(container.chatgpt.status());
  });
  api.get('/materials', c => c.json({ items: container.materials.list() }));
  api.post('/materials', async c => {
    const form = await c.req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw new AppError(400, 'file_required', 'Choose a file to upload');
    return c.json(container.materials.add(file.name, file.type, new Uint8Array(await file.arrayBuffer())), 201);
  });
  api.post('/materials/:id/analyze', async c => c.json(await analyzeMaterial(container.materials, container.chatgpt, c.req.param('id'))));
  api.patch('/materials/:id', async c => c.json(container.materials.update(c.req.param('id'), await readBody(c,
    validator.object({ notes: validator.string().max(12000).optional(), enabled: validator.boolean().optional() }).strict()))));
  api.delete('/materials/:id', c => { container.materials.remove(c.req.param('id')); return c.body(null, 204); });
  api.get('/materials/:id/file', c => {
    const file = container.materials.get(c.req.param('id'));
    c.header('Content-Type', 'application/octet-stream');
    c.header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`);
    return c.body(new Uint8Array(file.data));
  });

  // Pillars
  const requirePillar = (id: string) => {
    const pillar = pillars.get(id);
    if (!pillar) throw notFound('Pillar', id);
    return pillar;
  };
  api.get('/pillars', (c) => c.json({ items: pillars.list() }));
  api.post('/pillars', async (c) => {
    const input = await readBody(c, schemas.pillarCreate);
    const iso = now().toISOString();
    return c.json(pillars.save({ id: randomUUID(), ...input, createdAt: iso, updatedAt: iso }), 201);
  });
  api.get('/pillars/:id', (c) => c.json(requirePillar(c.req.param('id'))));
  api.patch('/pillars/:id', async (c) => {
    const pillar = requirePillar(c.req.param('id'));
    const patch = await readBody(c, schemas.pillarUpdate);
    const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    return c.json(pillars.save({ ...pillar, ...defined, updatedAt: now().toISOString() }));
  });
  api.delete('/pillars/:id', (c) => {
    const id = c.req.param('id');
    if (!pillars.delete(id)) throw notFound('Pillar', id);
    return c.body(null, 204);
  });

  // Ideas
  const requireIdea = (id: string) => {
    const idea = ideas.get(id);
    if (!idea) throw notFound('Idea', id);
    return idea;
  };
  api.get('/ideas', (c) => {
    const q = readQuery(c, schemas.ideaQuery);
    return c.json({ ...ideas.list(q), limit: q.limit, offset: q.offset });
  });
  api.post('/ideas', async (c) => c.json(ideation.addManual(await readBody(c, schemas.ideaCreate)), 201));
  api.post('/ideas/generate', async (c) => {
    const { pillarId, count, prompt } = await readBody(c, schemas.ideaGenerate);
    return c.json({ items: await ideation.generate(requirePillar(pillarId), count, prompt) }, 201);
  });
  api.get('/ideas/:id', (c) => c.json(requireIdea(c.req.param('id'))));
  api.patch('/ideas/:id', async (c) => {
    const idea = requireIdea(c.req.param('id'));
    const patch = await readBody(c, schemas.ideaUpdate);
    const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    const next = { ...idea, ...defined, updatedAt: now().toISOString() };
    try {
      ideas.update(next);
    } catch (error) {
      if (String(error).includes('UNIQUE')) throw new AppError(409, 'duplicate_idea', 'An idea with this title already exists for the pillar');
      throw error;
    }
    return c.json(next);
  });
  api.delete('/ideas/:id', (c) => {
    const id = c.req.param('id');
    if (!ideas.delete(id)) throw notFound('Idea', id);
    return c.body(null, 204);
  });
  api.post('/ideas/:id/draft', async (c) => {
    const { platform, scheduledAt } = await readBody(c, schemas.ideaDraft);
    return c.json(present(await postService.createFromIdea(c.req.param('id'), platform, scheduledAt ?? null)), 201);
  });

  // Posts
  api.get('/posts', (c) => {
    const q = readQuery(c, schemas.postQuery);
    const { items, total } = posts.list(q);
    return c.json({ items: items.map(present), total, limit: q.limit, offset: q.offset });
  });
  api.post('/posts', async (c) => c.json(present(postService.create(await readBody(c, schemas.postCreate))), 201));
  api.get('/posts/:id', (c) => {
    const post = postService.require(c.req.param('id'));
    return c.json({ ...present(post), attempts: posts.attempts(post.id) });
  });
  api.patch('/posts/:id', async (c) =>
    c.json(present(postService.update(c.req.param('id'), await readBody(c, schemas.postUpdate)))));
  api.delete('/posts/:id', (c) => {
    postService.delete(c.req.param('id'));
    return c.body(null, 204);
  });
  api.post('/posts/:id/approve', async (c) => {
    const { scheduledAt } = await readBody(c, schemas.postApprove);
    return c.json(present(postService.approve(c.req.param('id'), scheduledAt)));
  });
  api.post('/posts/:id/schedule', async (c) => {
    const { scheduledAt } = await readBody(c, schemas.postSchedule);
    return c.json(present(postService.schedule(c.req.param('id'), scheduledAt)));
  });
  api.post('/posts/:id/unschedule', (c) => c.json(present(postService.unschedule(c.req.param('id')))));
  api.post('/posts/:id/cancel', (c) => c.json(present(postService.cancel(c.req.param('id')))));
  api.post('/posts/:id/publish-now', async (c) => {
    const post = postService.require(c.req.param('id'));
    postService.assertPublishable(post.platform, post.body, post.mediaUrls);
    return c.json(present(await publisher.publishNow(post.id)));
  });
  api.post('/posts/:id/resolve', async (c) =>
    c.json(present(postService.resolve(c.req.param('id'), await readBody(c, schemas.postResolve)))));

  // Operations
  api.post('/scheduler/run', async (c) => {
    const { job } = await readBody(c, schemas.schedulerRun);
    if (job === 'publish') return c.json({ job, result: await scheduler.publishDue() });
    return c.json({ job, result: await autonomy.runCycle() });
  });
  api.get('/activity', (c) => {
    const { limit, beforeId } = readQuery(c, schemas.activityQuery);
    return c.json({ items: activity.list(limit, beforeId) });
  });

  app.route('/api', api);
  return app;
}
