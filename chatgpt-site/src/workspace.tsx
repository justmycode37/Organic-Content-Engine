import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Pillar, PlatformId, PlatformStatus, Status } from './api/types';

export const VIEW_IDS = ['accounts', 'calendar', 'storage', 'generation', 'library', 'feedback', 'ideas', 'pillars', 'brand', 'platforms', 'automation'] as const;
export type ViewId = (typeof VIEW_IDS)[number];

export type PostTarget =
  | { kind: 'existing'; id: string }
  | { kind: 'new'; scheduledAt?: string; platform?: PlatformId; pillarId?: string };

export interface ConfirmRequest {
  title: string;
  body: ReactNode;
  confirmLabel: string;
}

export interface Workspace {
  status: Status;
  platforms: PlatformStatus[];
  pillars: Pillar[];
  /** Bumps after every change and poll. Views list it as a dependency to stay current. */
  version: number;
  refresh: () => void;
  toast: (message: string, kind?: 'info' | 'error') => void;
  confirm: (request: ConfirmRequest) => Promise<boolean>;
  openPost: (target: PostTarget) => void;
  setPublishingPaused: (paused: boolean) => Promise<void>;
  platform: (id: PlatformId) => PlatformStatus | undefined;
}

const Context = createContext<Workspace | null>(null);
export const WorkspaceProvider = Context.Provider;

export function useWorkspace(): Workspace {
  const value = useContext(Context);
  if (!value) throw new Error('useWorkspace needs WorkspaceProvider');
  return value;
}

export interface Route {
  view: ViewId;
  params: URLSearchParams;
}

function readRoute(): Route {
  const [path, search = ''] = window.location.hash.replace(/^#\/?/, '').split('?');
  const view = (VIEW_IDS as readonly string[]).includes(path) ? (path as ViewId) : 'calendar';
  return { view, params: new URLSearchParams(search) };
}

const hrefFor = (view: ViewId, params?: URLSearchParams | Record<string, string>) => {
  const search = new URLSearchParams(params).toString();
  return `#/${view}${search ? `?${search}` : ''}`;
};

export { hrefFor };

const RouteContext = createContext<Route>({ view: 'calendar', params: new URLSearchParams() });
export const RouteProvider = RouteContext.Provider;

export function useRouteState(): Route {
  const [route, setRoute] = useState(readRoute);
  useEffect(() => {
    const onChange = () => setRoute(readRoute());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

/** Query parameters of the current view, kept in the URL so reload and back both work. */
export function useParams(): [URLSearchParams, (patch: Record<string, string | null>) => void] {
  const { view, params } = useContext(RouteContext);
  const set = useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
    }
    window.location.hash = hrefFor(view, next);
  }, [view, params]);
  return [params, set];
}
