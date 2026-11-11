import {StorageView} from './views/Storage';
import {AccountsView} from './views/Accounts';
import {GenerationView} from './views/Generation';
import { CalendarDays, FlaskConical, Layers3, Lightbulb, LoaderCircle, LogOut, Menu, Palette, Radio, Bot, Tags, OctagonPause, Play, X, ChartNoAxesCombined } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, ApiError, errorText, setUnauthorizedHandler } from './api/client';
import type { Pillar, PlatformStatus, Session, Status } from './api/types';
import { Button, ConfirmDialog, IconButton, Notice } from './components/common';
import { PostDrawer } from './components/PostDrawer';
import { AutomationView } from './views/Automation';
import { BrandView } from './views/Brand';
import { CalendarView } from './views/Calendar';
import { IdeasView } from './views/Ideas';
import { FeedbackView } from './views/Feedback';
import { LibraryView } from './views/Library';
import { LoginView, signOutHref } from './views/Login';
import { PillarsView } from './views/Pillars';
import { PlatformsView } from './views/Platforms';
import { hrefFor, RouteProvider, useRouteState, WorkspaceProvider, type ConfirmRequest, type PostTarget, type ViewId, type Workspace } from './workspace';

const POLL_MS = 30_000;
/** Longer than this since the job endpoint last ran counts as no schedule calling it. */
const TICK_STALE_MS = 2 * 60 * 60_000;

const NAV: { id: ViewId; label: string; icon: ReactNode; group: 'Plan' | 'Configure' }[] = [
  { id: 'accounts', label: 'Accounts', icon: <Bot size={16} aria-hidden />, group: 'Plan' },
  { id: 'calendar', label: 'Calendar', icon: <CalendarDays size={16} aria-hidden />, group: 'Plan' },
  { id: 'library', label: 'Library', icon: <Layers3 size={16} aria-hidden />, group: 'Plan' },
  { id: 'feedback', label: 'Feedback', icon: <ChartNoAxesCombined size={16} aria-hidden />, group: 'Plan' },
  { id: 'storage', label: 'Storage', icon: <Layers3 size={16} aria-hidden />, group: 'Plan' },
  { id: 'generation', label: 'ChatGPT', icon: <Bot size={16} aria-hidden />, group: 'Plan' },
  { id: 'ideas', label: 'Ideas', icon: <Lightbulb size={16} aria-hidden />, group: 'Plan' },
  { id: 'pillars', label: 'Pillars', icon: <Tags size={16} aria-hidden />, group: 'Configure' },
  { id: 'brand', label: 'Brand', icon: <Palette size={16} aria-hidden />, group: 'Configure' },
  { id: 'platforms', label: 'Platforms', icon: <Radio size={16} aria-hidden />, group: 'Configure' },
  { id: 'automation', label: 'Automation', icon: <Bot size={16} aria-hidden />, group: 'Configure' },
];

function Unreachable({ message, onRetry }: { message: string | null; onRetry: () => void }) {
  return (
    <main className="gate">
      <div className="gate-card">
        <div className="mark">O</div>
        <h1>Cannot load this workspace</h1>
        <p>This workspace has no offline data, so it needs the Site's backend to respond.</p>
        {message && <Notice tone="alert">{message}</Notice>}
        <Button variant="primary" onClick={onRetry}>Try again</Button>
      </div>
    </main>
  );
}

export default function App() {
  const [phase, setPhase] = useState<'loading' | 'login' | 'ready' | 'unreachable'>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const check = useCallback(() => {
    setPhase('loading');
    api.session.get().then(
      next => {
        setSession(next);
        setPhase(next.authenticated ? 'ready' : 'login');
      },
      error => {
        setFailure(errorText(error));
        setPhase('unreachable');
      },
    );
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(check);
    check();
  }, [check]);

  if (phase === 'loading') return <main className="gate"><LoaderCircle className="spin" size={20} aria-label="Loading" /></main>;
  if (phase === 'unreachable') return <Unreachable message={failure} onRetry={check} />;
  if (phase === 'login') return <LoginView session={session} onDone={check} />;
  return <Shell user={session?.user ?? null} onUnreachable={error => { setFailure(error); setPhase('unreachable'); }} />;
}

interface Core {
  status: Status;
  platforms: PlatformStatus[];
  pillars: Pillar[];
}

function Shell({ user, onUnreachable }: { user: Session['user']; onUnreachable: (message: string) => void }) {
  const route = useRouteState();
  const [core, setCore] = useState<Core | null>(null);
  const [version, setVersion] = useState(0);
  const [offline, setOffline] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [post, setPost] = useState<PostTarget | null>(null);
  const [toasts, setToasts] = useState<{ id: number; message: string; kind: 'info' | 'error' }[]>([]);
  const [confirmation, setConfirmation] = useState<(ConfirmRequest & { resolve: (ok: boolean) => void }) | null>(null);
  const hasCore = useRef(false);
  const toastId = useRef(0);

  const refresh = useCallback(() => {
    Promise.all([api.status(), api.platforms(), api.pillars.list()]).then(
      ([status, platforms, pillars]) => {
        hasCore.current = true;
        setCore({ status, platforms: platforms.items, pillars: pillars.items });
        setOffline(false);
        setVersion(v => v + 1);
      },
      error => {
        if (!(error instanceof ApiError) || error.status === 401 || error.code === 'forbidden_user') return;
        if (!hasCore.current) onUnreachable(errorText(error));
        else setOffline(true);
      },
    );
  }, [onUnreachable]);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(() => { if (!document.hidden) refresh(); }, POLL_MS);
    const onVisible = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [refresh]);

  useEffect(() => {
    const label = NAV.find(item => item.id === route.view)?.label;
    document.title = `${label} · Organic Content Engine`;
    setMenuOpen(false);
  }, [route.view]);

  const dismiss = useCallback((id: number) => setToasts(list => list.filter(t => t.id !== id)), []);
  const toast = useCallback<Workspace['toast']>((message, kind = 'info') => {
    const id = ++toastId.current;
    setToasts(list => [...list.slice(-3), { id, message, kind }]);
    window.setTimeout(() => dismiss(id), kind === 'error' ? 10_000 : 6_000);
  }, [dismiss]);

  const confirm = useCallback<Workspace['confirm']>(request => new Promise(resolve => setConfirmation({ ...request, resolve })), []);

  const setPublishingPaused = useCallback<Workspace['setPublishingPaused']>(async paused => {
    if (!paused) {
      const live = core?.status.publishMode === 'live';
      const ok = await confirm({
        title: 'Resume publishing?',
        body: live
          ? 'Mode is live. Scheduled posts that are due will go out to real accounts the next time the job endpoint runs or you process due posts.'
          : 'Mode is dry run, so due posts will be simulated and nothing will be posted.',
        confirmLabel: 'Resume publishing',
      });
      if (!ok) return;
    }
    try {
      await api.settings.update({ publishingPaused: paused });
      toast(paused ? 'Publishing paused. Nothing goes out, including publish-now.' : 'Publishing resumed.');
      refresh();
    } catch (error) {
      toast(errorText(error), 'error');
    }
  }, [confirm, core?.status.publishMode, refresh, toast]);

  const workspace = useMemo<Workspace | null>(() => core && {
    ...core,
    version,
    refresh,
    toast,
    confirm,
    setPublishingPaused,
    openPost: setPost,
    platform: id => core.platforms.find(p => p.id === id),
  }, [core, version, refresh, toast, confirm, setPublishingPaused]);

  if (!workspace) return <main className="gate"><LoaderCircle className="spin" size={20} aria-label="Loading" /></main>;

  const { status, platforms } = workspace;
  const counts = status.postCounts;
  const review = counts.needs_review ?? 0;
  const attention = (['needs_attention', 'failed', 'blocked'] as const).find(s => (counts[s] ?? 0) > 0);
  const attentionTotal = (counts.needs_attention ?? 0) + (counts.failed ?? 0) + (counts.blocked ?? 0);
  const ready = platforms.filter(p => p.state === 'ready').length;
  const paused = status.publishingPaused;
  const dryRun = status.publishMode === 'dry_run';
  const { lastTickAt } = status.scheduler;
  const noRecentTick = !lastTickAt || Date.now() - Date.parse(lastTickAt) > TICK_STALE_MS;
  const waitingOnJob = noRecentTick && (status.autonomy.enabled || (counts.scheduled ?? 0) > 0);
  const badge = (id: ViewId) => id === 'library' && review > 0 ? <span className="count" title={`${review} waiting for review`}>{review}</span>
    : id === 'platforms' ? <span className="count count-quiet">{ready}/{platforms.length}</span>
    : id === 'automation' ? <span className={`count count-quiet`}>{status.autonomy.enabled ? 'On' : 'Off'}</span>
    : null;

  return (
    <WorkspaceProvider value={workspace}>
      <RouteProvider value={route}>
        <div className="shell">
          {menuOpen && <div className="scrim scrim-menu" onClick={() => setMenuOpen(false)} />}


          <div className="main">
            <main className="content">
              <AccountsView />
            </main>
          </div>

          {post && <PostDrawer key={post.kind === 'existing' ? post.id : 'new'} target={post} onClose={() => setPost(null)} />}

          {confirmation && (
            <ConfirmDialog
              title={confirmation.title}
              body={confirmation.body}
              confirmLabel={confirmation.confirmLabel}
              onResult={ok => { confirmation.resolve(ok); setConfirmation(null); }}
            />
          )}

          <div className="toasts" aria-live="polite">
            {toasts.map(t => (
              <div key={t.id} className={`toast ${t.kind === 'error' ? 'toast-error' : ''}`}>
                <span>{t.message}</span>
                <button aria-label="Dismiss" onClick={() => dismiss(t.id)}><X size={14} aria-hidden /></button>
              </div>
            ))}
          </div>
        </div>
      </RouteProvider>
    </WorkspaceProvider>
  );
}
