import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Save } from 'lucide-react';
import { api, errorText } from '../api/client';
import type { FeedbackEntry, FeedbackVerdict, FormatInsight, InstagramAnalyticsPage, InstagramPostAnalytics, InstagramSnapshot, Post } from '../api/types';
import { Button, Empty, LoadError, Notice, PageHead, Spinner } from '../components/common';
import { platformIcon } from '../lib/platforms';
import { useParams, useWorkspace } from '../workspace';

type Draft = { format: string; style: string; hookVariant: string; claimsLedgerFile: string; verdict: FeedbackVerdict; notes: string; impressions: string; engagements: string; conversions: string };
const blank: Draft = { format: '', style: '', hookVariant: '', claimsLedgerFile: '', verdict: null, notes: '', impressions: '', engagements: '', conversions: '' };
const draftFrom = (entry?: FeedbackEntry): Draft => entry ? {
  format: entry.format, style: entry.style ?? '', hookVariant: entry.hookVariant ?? '', claimsLedgerFile: entry.claimsLedgerFile ?? '', verdict: entry.verdict, notes: entry.notes,
  impressions: entry.impressions == null ? '' : String(entry.impressions),
  engagements: entry.engagements == null ? '' : String(entry.engagements),
  conversions: entry.conversions == null ? '' : String(entry.conversions),
} : blank;
const recommendationLabel: Record<FormatInsight['recommendation'], string> = { explore: 'Explore', reuse: 'Reuse', iterate: 'Iterate', retire: 'Retire' };
const countText = (value: number | null | undefined) => value == null ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
const rateText = (value: number | null | undefined) => value == null ? '—' : `${(value * 100).toFixed(1)}%`;
const timeText = (value: number | null | undefined) => {
  if (value == null) return '—';
  const seconds = value / 1000;
  return seconds >= 60 ? `${(seconds / 60).toFixed(1)} min` : `${seconds.toFixed(1)} s`;
};
const whenText = (value: string | null) => value ? new Date(value).toLocaleString() : 'Not collected yet';

function SnapshotPanel({ analytics }: { analytics?: InstagramPostAnalytics }) {
  if (!analytics?.snapshots.length) return <div className="instagram-analytics-panel"><strong>Instagram Reel analytics</strong><p>Snapshots are created and collected by the next authenticated background tick.</p></div>;
  return <div className="instagram-analytics-panel">
    <strong>Instagram Reel analytics</strong>
    <div className="instagram-snapshot-list">
      {analytics.snapshots.map((snapshot: InstagramSnapshot) => {
        const metrics = snapshot.metrics;
        return <section className="instagram-snapshot" key={snapshot.ageBucket}>
          <header><strong>+{snapshot.ageBucket}</strong><span className={`instagram-snapshot-status snapshot-${snapshot.status}`}>{snapshot.status}</span><small>{snapshot.capturedAt ? `Collected ${whenText(snapshot.capturedAt)}` : `Due ${whenText(snapshot.scheduledAt)}`}</small></header>
          {metrics && <dl className="instagram-metrics-grid">
            <div><dt>Views</dt><dd>{countText(metrics.views)}</dd></div>
            <div><dt>Reach</dt><dd>{countText(metrics.reach)}</dd></div>
            <div><dt>Likes</dt><dd>{countText(metrics.likes)}</dd></div>
            <div><dt>Comments</dt><dd>{countText(metrics.comments)}</dd></div>
            <div><dt>Saves</dt><dd>{countText(metrics.saves)}</dd></div>
            <div><dt>Shares</dt><dd>{countText(metrics.shares)}</dd></div>
            <div><dt>Total interactions</dt><dd>{countText(metrics.totalInteractions)}</dd></div>
            <div><dt>Likes / reach</dt><dd>{rateText(metrics.likesPerReach)}</dd></div>
            <div><dt>Shares / reach</dt><dd>{rateText(metrics.sharesPerReach)}</dd></div>
            <div><dt>Saves / reach</dt><dd>{rateText(metrics.savesPerReach)}</dd></div>
            <div><dt>Average watch</dt><dd>{timeText(metrics.averageWatchTimeMs)}</dd></div>
            <div><dt>Total watch</dt><dd>{timeText(metrics.totalWatchTimeMs)}</dd></div>
          </dl>}
          {snapshot.errorMessage && <p className="instagram-snapshot-error">{snapshot.errorMessage}</p>}
        </section>;
      })}
    </div>
  </div>;
}

export function FeedbackView() {
  const ws = useWorkspace();
  const [params] = useParams();
  const focusedPost = params.get('post');
  const [data, setData] = useState<{ entries: FeedbackEntry[]; formats: FormatInsight[] } | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [instagramAnalytics, setInstagramAnalytics] = useState<InstagramAnalyticsPage | null>(null);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [retryMessage, setRetryMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [actionError, setActionError] = useState<Record<string, string>>({});

  const reload = async () => {
    setLoading(true); setError(null);
    try {
      const [feedback, allPosts] = await Promise.all([api.feedback(), api.posts.listAll({})]);
      setData(feedback); setPosts(allPosts);
      setDrafts(Object.fromEntries(allPosts.map(post => [post.id, draftFrom(feedback.entries.find(entry => entry.postId === post.id))])));
      try { setInstagramAnalytics(await api.instagramAnalytics()); setAnalyticsError(null); }
      catch (analyticsFailure) { setAnalyticsError(errorText(analyticsFailure)); }
    } catch (e) { setError(errorText(e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { void reload(); }, [ws.version]);

  const entries = data?.entries ?? [];
  const byPost = useMemo(() => new Map(entries.map(entry => [entry.postId, entry])), [entries]);
  const postAnalytics = useMemo(() => new Map((instagramAnalytics?.posts ?? []).map(item => [item.postId, item])), [instagramAnalytics]);
  const setDraft = (id: string, patch: Partial<Draft>) => {
    setDrafts(current => ({ ...current, [id]: { ...(current[id] ?? blank), ...patch } }));
    setSaved(current => current === id || current === `revised:${id}` ? null : current);
  };
  const putFeedback = async (post: Post) => {
    const draft = drafts[post.id] ?? blank;
    const numeric = (value: string) => {
      if (!value.trim()) return undefined;
      const number = Number(value);
      if (!Number.isInteger(number) || number < 0) throw new Error('Metrics must be whole numbers greater than or equal to zero.');
      return number;
    };
    const result = await api.posts.feedback(post.id, {
      format: draft.format.trim(), style: draft.style.trim() || null, hookVariant: draft.hookVariant.trim() || null,
      claimsLedgerFile: draft.claimsLedgerFile.trim() || null, verdict: draft.verdict, notes: draft.notes.trim(),
      impressions: post.status === 'published' ? numeric(draft.impressions) : undefined,
      engagements: post.status === 'published' ? numeric(draft.engagements) : undefined,
      conversions: post.status === 'published' ? numeric(draft.conversions) : undefined,
    });
    setData(current => current ? { ...current, entries: [...current.entries.filter(entry => entry.postId !== post.id), result] } : current);
    return result;
  };
  const retryFailedSnapshots = async () => {
    setBusy('instagram-retry'); setRetryMessage(null); setAnalyticsError(null);
    try {
      const result = await api.retryInstagramAnalytics();
      setRetryMessage(`${result.requeued} failed snapshot${result.requeued === 1 ? '' : 's'} queued for the next background tick.`);
      setInstagramAnalytics(await api.instagramAnalytics());
    } catch (e) { setAnalyticsError(errorText(e)); }
    finally { setBusy(null); }
  };
  const save = async (post: Post) => {
    setBusy(post.id); setActionError(current => ({ ...current, [post.id]: '' })); setSaved(null);
    try {
      await putFeedback(post);
      setSaved(post.id); ws.refresh();
    } catch (e) { setActionError(current => ({ ...current, [post.id]: errorText(e) })); }
    finally { setBusy(null); }
  };
  const revise = async (post: Post) => {
    setBusy(`revise:${post.id}`); setActionError(current => ({ ...current, [post.id]: '' }));
    try {
      await putFeedback(post);
      const result = await api.posts.revise(post.id);
      ws.refresh();
      setSaved('status' in result && result.status === 'pending' ? `queued:${post.id}` : `revised:${post.id}`);
    }
    catch (e) { setActionError(current => ({ ...current, [post.id]: errorText(e) })); }
    finally { setBusy(null); }
  };

  const feedbackPosts = posts;
  const recommendationCopy: Record<FormatInsight['recommendation'], string> = {
    explore: 'There is not enough feedback to establish a pattern yet.',
    reuse: 'This format has a positive track record; consider using it again.',
    iterate: 'Keep the format, then adjust its execution based on the notes.',
    retire: 'This format has underperformed across its recorded examples.',
  };

  return <>
    <PageHead eyebrow="Plan" title="Feedback" actions={<Button onClick={() => void reload()}>Refresh</Button>}>
      Recommendations use recorded feedback and available performance evidence. Metrics are optional; unpublished posts can have a manual verdict.
    </PageHead>
    {error && <LoadError message={error} onRetry={() => void reload()} />}
    {loading && !data && <Spinner label="Loading feedback" />}
    {data && <>
      <section className="feedback-section">
        <div className="feedback-section-heading"><div><h2>Instagram comparison by format and style</h2><p>Each row compares the same post age. Rates are per reach; unavailable values stay unknown.</p></div>{instagramAnalytics?.posts.some(post => post.snapshots.some(snapshot => snapshot.status === 'failed')) && <Button busy={busy === 'instagram-retry'} onClick={() => void retryFailedSnapshots()}>Retry failed snapshots</Button>}</div>
        {retryMessage && <Notice>{retryMessage}</Notice>}
        {analyticsError && <Notice tone="alert">Instagram analytics could not be loaded: {analyticsError}</Notice>}
        {!analyticsError && !instagramAnalytics?.comparisons.length && <Empty title="No Instagram snapshots yet">Published Reels are measured at 1 hour, 24 hours, 72 hours, 7 days and 28 days by the authenticated background tick.</Empty>}
        {!!instagramAnalytics?.comparisons.length && <div className="instagram-comparison-scroll"><table className="instagram-comparison-table"><thead><tr><th>Age</th><th>Format</th><th>Style</th><th>Samples</th><th>Likes / reach</th><th>Shares / reach</th><th>Saves / reach</th><th>Average watch</th></tr></thead><tbody>
          {instagramAnalytics.comparisons.map((item, index) => <tr key={`${item.ageBucket}:${item.format}:${item.style}:${index}`}><td>+{item.ageBucket}</td><td>{item.format}</td><td>{item.style}</td><td>{item.samples}</td><td>{rateText(item.likesPerReach)}</td><td>{rateText(item.sharesPerReach)}</td><td>{rateText(item.savesPerReach)}</td><td>{timeText(item.averageWatchTimeMs)}</td></tr>)}
        </tbody></table></div>}
      </section>
      <section className="feedback-section">
        <h2>Format insights</h2>
        {!data.formats.length && <Empty title="No format patterns yet">Record feedback on posts to build up format recommendations.</Empty>}
        {!!data.formats.length && <div className="feedback-insights">
          {data.formats.map((item, index) => <article className="feedback-insight" key={`${item.platform}:${item.format}:${index}`}>
            <div className="with-icon">{platformIcon(item.platform)}<strong>{item.format}</strong><span className="muted">· {ws.platform(item.platform)?.displayName ?? item.platform}</span></div>
            <span className={`feedback-recommendation rec-${item.recommendation}`}>{recommendationLabel[item.recommendation]}</span>
            <p>{recommendationCopy[item.recommendation]}</p>
            <small>{item.samples} sample{item.samples === 1 ? '' : 's'} · {item.successes} successful · {item.iterations} to iterate · {item.discards} discarded</small>
          </article>)}
        </div>}
      </section>
      <section className="feedback-section">
        <h2>Post outcomes</h2>
        {feedbackPosts.length === 0 && <Empty title="No published posts to review">Once posts are published, record their format and how they performed here.</Empty>}
        {feedbackPosts.map(post => {
          const draft = drafts[post.id] ?? blank; const entry = byPost.get(post.id);
          const metricsAllowed = post.status === 'published';
          return <article key={post.id} id={`feedback-${post.id}`} className={`feedback-post ${focusedPost === post.id ? 'feedback-focused' : ''}`}>
            <header className="feedback-post-head"><div className="with-icon">{platformIcon(post.platform)}<strong>{ws.platform(post.platform)?.displayName ?? post.platform}</strong><span className="muted">· {post.body.trim().split('\n')[0] || 'Empty post'}</span></div>{entry && <small>Updated {new Date(entry.updatedAt).toLocaleDateString()}</small>}</header>
            {post.platform === 'instagram' && metricsAllowed && <SnapshotPanel analytics={postAnalytics.get(post.id)} />}
            <div className="feedback-fields">
              <label className="field"><span className="field-label">Format preset</span><input value={draft.format} onChange={e => setDraft(post.id, { format: e.target.value })} placeholder="e.g. under-the-hood" /></label>
              <label className="field"><span className="field-label">Style</span><input value={draft.style} onChange={e => setDraft(post.id, { style: e.target.value })} placeholder="patch, breaking, proof…" /></label>
              <label className="field"><span className="field-label">Hook variant</span><input value={draft.hookVariant} onChange={e => setDraft(post.id, { hookVariant: e.target.value })} placeholder="e.g. hook-a" /></label>
              <label className="field feedback-ledger"><span className="field-label">Claims ledger file</span><input value={draft.claimsLedgerFile} onChange={e => setDraft(post.id, { claimsLedgerFile: e.target.value })} placeholder="e.g. claims.json" /></label>
              <label className="field"><span className="field-label">Verdict</span><select value={draft.verdict ?? ''} onChange={e => setDraft(post.id, { verdict: (e.target.value || null) as FeedbackVerdict })}><option value="">No verdict</option><option value="successful">Successful</option><option value="iterate">Iterate</option><option value="discard">Discard</option></select></label>
              <label className="field"><span className="field-label">Impressions</span><input type="number" min="0" step="1" disabled={!metricsAllowed} value={draft.impressions} onChange={e => setDraft(post.id, { impressions: e.target.value })} /></label>
              <label className="field"><span className="field-label">Engagements</span><input type="number" min="0" step="1" disabled={!metricsAllowed} value={draft.engagements} onChange={e => setDraft(post.id, { engagements: e.target.value })} /></label>
              <label className="field"><span className="field-label">Conversions</span><input type="number" min="0" step="1" disabled={!metricsAllowed} value={draft.conversions} onChange={e => setDraft(post.id, { conversions: e.target.value })} /></label>
              <label className="field feedback-notes"><span className="field-label">Notes</span><textarea rows={2} value={draft.notes} onChange={e => setDraft(post.id, { notes: e.target.value })} placeholder="What worked, and what would you change?" /></label>
            </div>
            {actionError[post.id] && <Notice tone="alert">{actionError[post.id]}</Notice>}
            <div className="feedback-actions"><Button variant="primary" busy={busy === post.id} onClick={() => void save(post)}><Save size={14} aria-hidden /> Save feedback</Button>{saved === post.id && <span className="feedback-saved" role="status">Saved</span>}{entry && <Button busy={busy === `revise:${post.id}`} onClick={() => void revise(post)}><ArrowRight size={14} aria-hidden /> Create revision draft</Button>}{saved === `revised:${post.id}` && <span className="feedback-saved" role="status">Revision draft created</span>}{saved === `queued:${post.id}` && <span className="feedback-saved" role="status">Revision queued for ChatGPT generation</span>}</div>
          </article>;
        })}
      </section>
    </>}
  </>;
}
