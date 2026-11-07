import type {
  ActivityEvent, Autopilot, Brand, CycleResult, Idea, IdeaStatus, Page, Pillar, PillarInput, PlatformId,
  PlatformStatus, Post, PostCreate, PostDetail, PostQuery, PublishMode, PublishRunResult, Session, Settings, Status,
} from './types';

const BASE = '/api';
const PAGE_MAX = 200;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null = null,
    readonly details: unknown[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /**
   * Network failure, or the dev proxy reporting that nothing is listening. The backend's own
   * errors always carry a code, so a real 502 `generation_failed` does not count.
   */
  get unreachable() {
    return this.status === 0 || (this.status >= 500 && this.code === null);
  }
}

let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

async function request<T>(path: string, init?: { method?: string; json?: unknown }): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method: init?.method ?? 'GET',
      headers: init?.json !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: init?.json !== undefined ? JSON.stringify(init.json) : undefined,
    });
  } catch {
    throw new ApiError('Cannot reach the backend.', 0);
  }
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    if (response.ok) throw new ApiError('The backend returned a non-JSON response.', response.status);
  }
  if (!response.ok) {
    const failure = body as { error?: { code?: string; message?: string; details?: unknown[] }; message?: string } | null;
    const error = new ApiError(
      failure?.error?.message ?? failure?.message ?? `Request failed (${response.status}).`,
      response.status,
      failure?.error?.code ?? null,
      Array.isArray(failure?.error?.details) ? failure.error.details : [],
    );
    // A wrong token at the login form is not a lost session.
    if (error.status === 401 && !path.startsWith('/session')) onUnauthorized();
    throw error;
  }
  return body as T;
}

/** The message, plus the per-field or per-issue reasons the backend attached. */
export function errorText(error: unknown): string {
  if (!(error instanceof ApiError)) return error instanceof Error ? error.message : 'Something went wrong.';
  const reasons = error.details.flatMap(detail => {
    const { path, message } = (detail ?? {}) as { path?: string; message?: string };
    if (!message) return [];
    return [path ? `${path}: ${message}` : message];
  });
  return reasons.length ? `${error.message}: ${reasons.join('; ')}` : error.message;
}

function query(params: object): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

const at = (id: string) => encodeURIComponent(id);
const post = <T>(path: string, json?: unknown) => request<T>(path, { method: 'POST', json });

export const api = {
  session: {
    get: () => request<Session>('/session'),
    login: (token: string) => post<Session>('/session', { token }),
    logout: () => request<void>('/session', { method: 'DELETE' }),
  },
  status: () => request<Status>('/status'),
  platforms: () => request<{ items: PlatformStatus[]; publishMode: PublishMode }>('/platforms'),
  settings: {
    get: () => request<Settings>('/settings'),
    update: (patch: Partial<Settings>) => request<Settings>('/settings', { method: 'PATCH', json: patch }),
  },
  autopilot: {
    get: () => request<Autopilot>('/autopilot'),
    start: () => post<Autopilot>('/autopilot/start'),
    pause: () => post<Autopilot>('/autopilot/pause'),
  },
  brand: {
    get: () => request<Brand>('/brand'),
    save: (brand: Brand) => request<Brand>('/brand', { method: 'PUT', json: brand }),
  },
  pillars: {
    list: () => request<{ items: Pillar[] }>('/pillars'),
    create: (input: PillarInput) => post<Pillar>('/pillars', input),
    update: (id: string, patch: Partial<PillarInput>) => request<Pillar>(`/pillars/${at(id)}`, { method: 'PATCH', json: patch }),
    remove: (id: string) => request<void>(`/pillars/${at(id)}`, { method: 'DELETE' }),
  },
  ideas: {
    list: (q: { pillarId?: string; status?: IdeaStatus; limit?: number; offset?: number }) => request<Page<Idea>>(`/ideas${query(q)}`),
    create: (input: { pillarId: string; title: string; angle?: string }) => post<Idea>('/ideas', input),
    generate: (input: { pillarId: string; count?: number; prompt?: string }) => post<{ items: Idea[] }>('/ideas/generate', input),
    update: (id: string, patch: { title?: string; angle?: string; status?: 'new' | 'rejected' }) => request<Idea>(`/ideas/${at(id)}`, { method: 'PATCH', json: patch }),
    remove: (id: string) => request<void>(`/ideas/${at(id)}`, { method: 'DELETE' }),
    draft: (id: string, input: { platform: PlatformId; scheduledAt?: string }) => post<Post>(`/ideas/${at(id)}/draft`, input),
  },
  posts: {
    list: (q: PostQuery) => request<Page<Post>>(`/posts${query(q)}`),
    /** Every post matching the query. The API caps a page at 200. */
    listAll: async (q: Omit<PostQuery, 'limit' | 'offset'>) => {
      const items: Post[] = [];
      for (;;) {
        const page = await api.posts.list({ ...q, limit: PAGE_MAX, offset: items.length });
        items.push(...page.items);
        if (page.items.length === 0 || items.length >= page.total) return items;
      }
    },
    get: (id: string) => request<PostDetail>(`/posts/${at(id)}`),
    create: (input: PostCreate) => post<Post>('/posts', input),
    update: (id: string, patch: { platform?: PlatformId; body?: string; mediaUrls?: string[] }) => request<Post>(`/posts/${at(id)}`, { method: 'PATCH', json: patch }),
    remove: (id: string) => request<void>(`/posts/${at(id)}`, { method: 'DELETE' }),
    approve: (id: string, scheduledAt?: string) => post<Post>(`/posts/${at(id)}/approve`, scheduledAt ? { scheduledAt } : {}),
    schedule: (id: string, scheduledAt: string) => post<Post>(`/posts/${at(id)}/schedule`, { scheduledAt }),
    unschedule: (id: string) => post<Post>(`/posts/${at(id)}/unschedule`),
    cancel: (id: string) => post<Post>(`/posts/${at(id)}/cancel`),
    publishNow: (id: string) => post<Post>(`/posts/${at(id)}/publish-now`),
    resolve: (id: string, input: { outcome: 'published' | 'not_published'; externalUrl?: string }) => post<Post>(`/posts/${at(id)}/resolve`, input),
  },
  scheduler: {
    runPublish: () => post<{ job: 'publish'; result: PublishRunResult }>('/scheduler/run', { job: 'publish' }),
    runCycle: () => post<{ job: 'autonomy'; result: CycleResult }>('/scheduler/run', { job: 'autonomy' }),
  },
  activity: (q: { limit?: number; beforeId?: number }) => request<{ items: ActivityEvent[] }>(`/activity${query(q)}`),
};
