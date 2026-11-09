import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Save } from 'lucide-react';
import { api, errorText } from '../api/client';
import type { FeedbackEntry, FeedbackVerdict, FormatInsight, Post } from '../api/types';
import { Button, Empty, LoadError, Notice, PageHead, Spinner } from '../components/common';
import { platformIcon } from '../lib/platforms';
import { useParams, useWorkspace } from '../workspace';

type Draft = { format: string; verdict: FeedbackVerdict; notes: string; impressions: string; engagements: string; conversions: string };
const blank: Draft = { format: '', verdict: null, notes: '', impressions: '', engagements: '', conversions: '' };
const draftFrom = (entry?: FeedbackEntry): Draft => entry ? {
  format: entry.format, verdict: entry.verdict, notes: entry.notes,
  impressions: entry.impressions == null ? '' : String(entry.impressions),
  engagements: entry.engagements == null ? '' : String(entry.engagements),
  conversions: entry.conversions == null ? '' : String(entry.conversions),
} : blank;
const recommendationLabel: Record<FormatInsight['recommendation'], string> = { explore: 'Explore', reuse: 'Reuse', iterate: 'Iterate', retire: 'Retire' };

export function FeedbackView() {
  const ws = useWorkspace();
  const [params] = useParams();
  const focusedPost = params.get('post');
  const [data, setData] = useState<{ entries: FeedbackEntry[]; formats: FormatInsight[] } | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
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
    } catch (e) { setError(errorText(e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { void reload(); }, [ws.version]);

  const entries = data?.entries ?? [];
  const byPost = useMemo(() => new Map(entries.map(entry => [entry.postId, entry])), [entries]);
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
      format: draft.format.trim(), verdict: draft.verdict, notes: draft.notes.trim(),
      impressions: post.status === 'published' ? numeric(draft.impressions) : undefined,
      engagements: post.status === 'published' ? numeric(draft.engagements) : undefined,
      conversions: post.status === 'published' ? numeric(draft.conversions) : undefined,
    });
    setData(current => current ? { ...current, entries: [...current.entries.filter(entry => entry.postId !== post.id), result] } : current);
    return result;
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
            <div className="feedback-fields">
              <label className="field"><span className="field-label">Format</span><input value={draft.format} onChange={e => setDraft(post.id, { format: e.target.value })} placeholder="e.g. behind the scenes" /></label>
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
