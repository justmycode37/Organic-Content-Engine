import { ExternalLink } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from '../api/client';
import type { PlatformId, Post, PostDetail } from '../api/types';
import { fmtDateTime, fromLocalInput, toLocalInput } from '../lib/dates';
import { countChars } from '../lib/hooks';
import { PLATFORM_IDS } from '../lib/platforms';
import { CAN_CANCEL, CAN_DELETE, CAN_EDIT, CAN_PUBLISH_NOW, CAN_SCHEDULE, CAN_UNSCHEDULE, STATUS, StatusBadge } from '../lib/postStatus';
import { useWorkspace, type PostTarget } from '../workspace';
import { Button, Drawer, Field, Notice, Spinner } from './common';

interface Form {
  platform: PlatformId;
  body: string;
  media: string;
  pillarId: string;
  time: string;
}

const mediaList = (text: string) => text.split('\n').map(line => line.trim()).filter(Boolean);

const formFrom = (post: Post): Form => ({
  platform: post.platform,
  body: post.body,
  media: post.mediaUrls.join('\n'),
  pillarId: post.pillarId ?? '',
  time: toLocalInput(post.scheduledAt),
});

/** What publish-now actually did. Only `published` is reported as delivered. */
function publishOutcome(post: Post, name: string): { message: string; kind: 'info' | 'error' } {
  const reason = post.lastErrorMessage ? ` ${post.lastErrorMessage}` : '';
  switch (post.status) {
    case 'published': return { message: `Published to ${name}.`, kind: 'info' };
    case 'simulated': return { message: 'Dry run: simulated. Nothing was posted.', kind: 'info' };
    case 'blocked': return { message: `Blocked. Nothing was posted.${reason}`, kind: 'error' };
    case 'failed': return { message: `Failed. Nothing was posted.${reason}`, kind: 'error' };
    case 'needs_attention': return { message: `Outcome unknown. Check ${name}, then record what you found.`, kind: 'error' };
    case 'scheduled': return { message: `Not posted yet. A retry is scheduled for ${fmtDateTime(post.nextAttemptAt)}.${reason}`, kind: 'error' };
    default: return { message: `Post is now ${STATUS[post.status].label}.`, kind: 'info' };
  }
}

export function PostDrawer({ target, onClose }: { target: PostTarget; onClose: () => void }) {
  const ws = useWorkspace();
  const [post, setPost] = useState<PostDetail | null>(null);
  const [form, setForm] = useState<Form>(() => {
    const defaults = target.kind === 'new' ? target : null;
    const platform = defaults?.platform ?? ws.platforms.find(p => p.state === 'ready')?.id ?? ws.platforms.find(p => p.support === 'direct')?.id ?? 'bluesky';
    return { platform, body: '', media: '', pillarId: defaults?.pillarId ?? '', time: toLocalInput(defaults?.scheduledAt) };
  });
  const [loading, setLoading] = useState(target.kind === 'existing');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [liveUrl, setLiveUrl] = useState('');

  const adopt = useCallback((detail: PostDetail) => {
    setPost(detail);
    setForm(formFrom(detail));
  }, []);

  useEffect(() => {
    if (target.kind !== 'existing') return;
    api.posts.get(target.id).then(adopt, e => setError(errorText(e))).finally(() => setLoading(false));
  }, [target, adopt]);

  // A publish in flight settles on the server; keep the drawer honest until it does.
  const inFlight = post?.status === 'publishing';
  const postId = post?.id;
  useEffect(() => {
    if (!inFlight || !postId) return;
    const timer = window.setInterval(() => { api.posts.get(postId).then(adopt, () => {}); }, 5000);
    return () => window.clearInterval(timer);
  }, [inFlight, postId, adopt]);

  const status = post?.status ?? null;
  const editable = !status || CAN_EDIT.includes(status);
  const platform = ws.platform(form.platform);
  const name = platform?.displayName ?? form.platform;
  const chars = countChars(form.body);
  const maxChars = platform?.limits.maxChars ?? 0;
  const media = mediaList(form.media);
  const originalTime = toLocalInput(post?.scheduledAt);
  const timeChanged = form.time !== originalTime;
  const contentDirty = post
    ? form.body !== post.body || form.platform !== post.platform || form.media !== post.mediaUrls.join('\n')
    : form.body !== '' || form.media !== '';
  const timeInFuture = !!form.time && new Date(form.time).getTime() > Date.now();
  const paused = ws.status.publishingPaused;
  const dryRun = ws.status.publishMode === 'dry_run';
  const unsupported = platform?.state === 'unsupported';

  const close = async () => {
    if (contentDirty && !await ws.confirm({ title: 'Discard your edits?', body: 'Your unsaved changes to this post will be lost.', confirmLabel: 'Discard edits' })) return;
    onClose();
  };

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await action();
      ws.refresh();
    } catch (e) {
      setError(errorText(e));
      ws.refresh();
    } finally {
      setBusy(null);
    }
  };

  /** Saves edits first, so an action never runs on stale text. Keeps what it saved if the action then fails. */
  const persist = async (): Promise<Post> => {
    const content = { platform: form.platform, body: form.body, mediaUrls: media };
    if (!post) {
      const created = await api.posts.create({ ...content, pillarId: form.pillarId || undefined });
      setPost({ ...created, attempts: [] });
      return created;
    }
    if (!contentDirty) return post;
    const updated = await api.posts.update(post.id, content);
    setPost({ ...updated, attempts: post.attempts });
    return updated;
  };

  const settle = async (id: string) => adopt(await api.posts.get(id));

  const save = () => run('save', async () => {
    const saved = await persist();
    await settle(saved.id);
    ws.toast('Saved.');
  });

  /** Approve keeps a future proposed time, or takes the next free slot, unless a new time was chosen. */
  const approve = () => run('approve', async () => {
    const chosen = timeChanged ? fromLocalInput(form.time) ?? undefined : undefined;
    if (!post && chosen) {
      const created = await api.posts.create({ platform: form.platform, body: form.body, mediaUrls: media, pillarId: form.pillarId || undefined, scheduledAt: chosen });
      await settle(created.id);
      ws.toast(`Scheduled for ${fmtDateTime(created.scheduledAt)}.`);
      return;
    }
    const saved = await persist();
    const approved = await api.posts.approve(saved.id, chosen);
    await settle(approved.id);
    ws.toast(`Scheduled for ${fmtDateTime(approved.scheduledAt)}.`);
  });

  const reschedule = () => run('schedule', async () => {
    const at = fromLocalInput(form.time);
    if (!at) throw new Error('Choose a date and time first.');
    const saved = await persist();
    const scheduled = await api.posts.schedule(saved.id, at);
    await settle(scheduled.id);
    ws.toast(`Scheduled for ${fmtDateTime(scheduled.scheduledAt)}.`);
  });

  const simple = (key: string, action: (id: string) => Promise<Post>, message: string) => run(key, async () => {
    if (!post) return;
    const next = await action(post.id);
    await settle(next.id);
    ws.toast(message);
  });

  const publishNow = async () => {
    const body = dryRun
      ? 'Mode is dry run. No request is sent, and the post ends as Simulated. Nothing is delivered.'
      : platform?.canPublishLive
        ? `This sends a real post to ${name} right now. It cannot be undone from here.`
        : `${name} has no complete credentials, so this will end as Blocked. Nothing will be posted.`;
    const ok = await ws.confirm({ title: dryRun ? 'Simulate this post now?' : `Publish to ${name} now?`, body, confirmLabel: dryRun ? 'Run dry run' : 'Publish now' });
    if (!ok) return;
    await run('publish', async () => {
      const saved = await persist();
      const result = await api.posts.publishNow(saved.id);
      await settle(result.id);
      const outcome = publishOutcome(result, name);
      ws.toast(outcome.message, outcome.kind);
    });
  };

  const remove = async () => {
    if (!post) return;
    const ok = await ws.confirm({ title: 'Delete this post?', body: 'It is removed from the workspace. This cannot be undone.', confirmLabel: 'Delete post' });
    if (!ok) return;
    await run('delete', async () => {
      await api.posts.remove(post.id);
      ws.toast('Post deleted.');
      onClose();
    });
  };

  const resolve = (outcome: 'published' | 'not_published') => run(`resolve-${outcome}`, async () => {
    if (!post) return;
    const url = liveUrl.trim();
    const next = await api.posts.resolve(post.id, { outcome, externalUrl: outcome === 'published' && url ? url : undefined });
    await settle(next.id);
    ws.toast(outcome === 'published' ? 'Recorded as published.' : 'Recorded as not published.');
  });

  const isDraftLike = !status || status === 'draft' || status === 'needs_review';
  const canSchedule = status ? CAN_SCHEDULE.includes(status) : true;
  const approveLabel = status === 'needs_review'
    ? 'Approve'
    : form.time ? 'Schedule' : 'Schedule next free slot';

  const footer = !loading && (
    <>
      <div className="foot-left">
        {status && CAN_DELETE.includes(status) && <Button variant="ghost" busy={busy === 'delete'} disabled={!!busy} onClick={() => void remove()}>Delete</Button>}
        {status && CAN_CANCEL.includes(status) && <Button variant="ghost" busy={busy === 'cancel'} disabled={!!busy} onClick={() => void simple('cancel', api.posts.cancel, 'Post cancelled.')}>Cancel post</Button>}
        {status && CAN_UNSCHEDULE.includes(status) && <Button variant="ghost" busy={busy === 'unschedule'} disabled={!!busy} onClick={() => void simple('unschedule', api.posts.unschedule, 'Moved back to drafts.')}>Back to draft</Button>}
      </div>
      <div className="foot-right">
        {(!status || CAN_PUBLISH_NOW.includes(status)) && (
          <Button
            busy={busy === 'publish'}
            disabled={!!busy || paused || unsupported}
            title={paused ? 'Publishing is paused' : unsupported ? `${name} has no publishing route` : undefined}
            onClick={() => void publishNow()}
          >
            {dryRun ? 'Simulate now' : 'Publish now'}
          </Button>
        )}
        {editable && (!post || contentDirty) && <Button busy={busy === 'save'} disabled={!!busy} onClick={() => void save()}>{post ? 'Save' : 'Save draft'}</Button>}
        {isDraftLike && <Button variant="primary" busy={busy === 'approve'} disabled={!!busy} onClick={() => void approve()}>{approveLabel}</Button>}
        {!isDraftLike && canSchedule && (
          <Button variant="primary" busy={busy === 'schedule'} disabled={!!busy || !timeInFuture || (status === 'scheduled' && !timeChanged)} title={timeInFuture ? undefined : 'Choose a time in the future'} onClick={() => void reschedule()}>
            {status === 'scheduled' ? 'Reschedule' : 'Schedule again'}
          </Button>
        )}
      </div>
    </>
  );

  return (
    <Drawer eyebrow={post ? name : 'New post'} title={post ? 'Post' : 'Create a post'} onClose={() => void close()} footer={footer || undefined}>
      {loading && <Spinner />}
      {error && <Notice tone="alert">{error}</Notice>}
      {!loading && (target.kind === 'new' || post) && (
        <>
          {post && (
            <section className="post-state">
              <div className="post-state-head">
                <StatusBadge status={post.status} />
                {post.externalUrl && <a className="link" href={post.externalUrl} target="_blank" rel="noreferrer">View on {name} <ExternalLink size={12} aria-hidden /></a>}
              </div>
              <p>{STATUS[post.status].help}</p>
              {post.lastErrorCode && <p className="post-error"><code>{post.lastErrorCode}</code> {post.lastErrorMessage}</p>}
              {post.nextAttemptAt && <p>Next attempt: {fmtDateTime(post.nextAttemptAt)}</p>}
            </section>
          )}

          {post?.status === 'needs_attention' && (
            <section className="resolve">
              <h3>What happened on {name}?</h3>
              <p>The server will not guess, because a wrong guess means a duplicate post. Check the account, then record it.</p>
              <Field label="Link to the live post (optional)">
                <input type="url" value={liveUrl} placeholder="https://" onChange={e => setLiveUrl(e.target.value)} />
              </Field>
              <div className="row">
                <Button variant="primary" busy={busy === 'resolve-published'} disabled={!!busy} onClick={() => void resolve('published')}>It went live</Button>
                <Button busy={busy === 'resolve-not_published'} disabled={!!busy} onClick={() => void resolve('not_published')}>It did not post</Button>
              </div>
            </section>
          )}

          {post?.generator === 'template' && editable && (
            <Notice>Written by the template generator: a prompt for you to finish, not publishable copy.</Notice>
          )}

          <Field label="Platform" hint={platformHint(platform, dryRun)}>
            <select value={form.platform} disabled={!editable} onChange={e => setForm({ ...form, platform: e.target.value as PlatformId })}>
              {PLATFORM_IDS.map(id => {
                const p = ws.platform(id);
                return <option key={id} value={id}>{p?.displayName ?? id}{p?.state === 'unsupported' ? ' (no route)' : ''}</option>;
              })}
            </select>
          </Field>

          <Field label="Text">
            <textarea rows={8} value={form.body} readOnly={!editable} onChange={e => setForm({ ...form, body: e.target.value })} placeholder="What do you want to say?" />
          </Field>
          <div className={`counter ${maxChars && chars > maxChars ? 'counter-over' : ''}`}>{chars} / {maxChars.toLocaleString()}</div>

          <Field
            label="Media URLs"
            hint={platform?.limits.requiresMedia
              ? `${name} requires media. One https URL per line, up to 10.`
              : platform?.limits.supportsMedia === false
                ? 'This route is text only: a post with media is rejected, not posted without it.'
                : 'One https URL per line, up to 10.'}
          >
            <textarea rows={2} value={form.media} readOnly={!editable} onChange={e => setForm({ ...form, media: e.target.value })} />
          </Field>

          {!post && (
            <Field label="Pillar">
              <select value={form.pillarId} onChange={e => setForm({ ...form, pillarId: e.target.value })}>
                <option value="">None</option>
                {ws.pillars.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
          )}

          {canSchedule && (
            <Field label="Date and time" hint={scheduleHint(post, form.time)}>
              <input type="datetime-local" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} />
            </Field>
          )}

          {post && !contentDirty && post.issues.length > 0 && (
            <Notice tone="alert">
              <b>Cannot publish as written</b>
              <ul>{post.issues.map(issue => <li key={issue.code}>{issue.message}</li>)}</ul>
            </Notice>
          )}

          {post && (
            <dl className="meta">
              <dt>Origin</dt><dd>{post.origin === 'autonomous' ? 'Autopilot' : 'Manual'}{post.generator ? ` · ${post.generator}` : ''}</dd>
              {post.scheduledAt && <><dt>Scheduled</dt><dd>{fmtDateTime(post.scheduledAt)}</dd></>}
              {post.publishedAt && <><dt>Published</dt><dd>{fmtDateTime(post.publishedAt)}</dd></>}
              {post.externalId && <><dt>External ID</dt><dd><code>{post.externalId}</code></dd></>}
              <dt>Created</dt><dd>{fmtDateTime(post.createdAt)}</dd>
            </dl>
          )}

          {post && post.attempts.length > 0 && (
            <section>
              <h3>Publish attempts</h3>
              <ol className="attempts">
                {post.attempts.map(a => (
                  <li key={a.id}>
                    <b>#{a.attemptNumber} {a.outcome.replace('_', ' ')}</b>
                    <span>{a.mode === 'dry_run' ? 'Dry run' : 'Live'}{a.route ? ` · ${a.route}` : ''} · {fmtDateTime(a.finishedAt)}</span>
                    {a.message && <span>{a.code ? <code>{a.code}</code> : null} {a.message}</span>}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </>
      )}
    </Drawer>
  );
}

function platformHint(platform: ReturnType<ReturnType<typeof useWorkspace>['platform']>, dryRun: boolean): string | undefined {
  if (!platform) return undefined;
  if (platform.state === 'unsupported') return 'No publishing route. You can draft here, but it cannot be scheduled without a configured gateway.';
  if (dryRun) return 'Dry run: this will end as Simulated. Nothing is posted.';
  if (platform.state === 'missing_credentials') return `Missing ${platform.missingEnv.join(', ')}. This post would end as Blocked.`;
  return undefined;
}

function scheduleHint(post: Post | null, time: string): string {
  if (post?.status === 'needs_review') return 'Your local time. Approve keeps a future proposed time; otherwise it takes the next free slot.';
  if (!time && (!post || post.status === 'draft')) return 'Your local time. Leave empty to use the next free posting slot.';
  return 'Your local time.';
}
