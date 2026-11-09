import { useCallback } from 'react';
import { api } from '../api/client';
import type { FeedbackEntry, FormatInsight } from '../api/types';
import { useLoad } from '../lib/hooks';
import { useWorkspace } from '../workspace';
import { Empty, LoadError, PageHead, Spinner } from '../components/common';

const recommendation: Record<FormatInsight['recommendation'], string> = { explore: 'Explore', reuse: 'Reuse', iterate: 'Iterate', retire: 'Retire' };
export function FeedbackView() {
  const ws = useWorkspace();
  const load = useCallback(() => api.feedback.list(), [ws.version]);
  const data = useLoad(load, [load]);
  return <>
    <PageHead eyebrow="Learn" title="Feedback" actions={<button className="btn btn-secondary" onClick={data.reload}>Refresh</button>}>Track performance evidence, post outcomes, and which formats are worth repeating.</PageHead>
    {data.loading && <Spinner />}{data.error && <LoadError message={data.error} onRetry={data.reload} />}
    {data.data && <>
      <section className="panel"><div className="panel-head"><div><h2>Format insights</h2><p>Recommendations use recorded verdicts and sample counts.</p></div></div>
        {data.data.formats.length ? <div className="feedback-grid">{data.data.formats.map((f, i) => <article className="feedback-card" key={`${f.platform}-${f.format}-${i}`}><div className="feedback-card-head"><strong>{f.format}</strong><span className={`tag tag-${f.recommendation}`}>{recommendation[f.recommendation]}</span></div><div className="muted">{ws.platform(f.platform)?.displayName ?? f.platform}</div><p>{f.samples} sample{f.samples === 1 ? '' : 's'} · {f.successes} successful · {f.iterations} to iterate · {f.discards} discarded</p></article>)}</div> : <Empty title="No format insights yet">Save feedback on posts to build recommendations.</Empty>}
      </section>
      <section className="panel"><div className="panel-head"><div><h2>Recorded feedback</h2><p>Most recently updated first.</p></div></div>
        {data.data.entries.length ? <div className="table-wrap"><table className="table"><thead><tr><th>Format</th><th>Platform</th><th>Verdict</th><th>Results</th><th>Notes</th><th>Updated</th><th /></tr></thead><tbody>{[...data.data.entries].sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)).map(e => <FeedbackRow key={e.postId} entry={e} />)}</tbody></table></div> : <Empty title="No feedback recorded yet">Open a post from the library or calendar to record its performance.</Empty>}
      </section>
    </>}
  </>;
}
function FeedbackRow({ entry }: { entry: FeedbackEntry }) {
  const ws = useWorkspace();
  return <tr><td className="table-main"><strong>{entry.format}</strong></td><td>{ws.platform(entry.platform)?.displayName ?? entry.platform}</td><td>{entry.verdict ?? '—'}</td><td>{entry.impressions !== undefined ? `${entry.impressions} impressions` : '—'}</td><td className="feedback-note">{entry.notes || '—'}</td><td>{new Date(entry.updatedAt).toLocaleDateString()}</td><td><button className="link" onClick={() => ws.openPost({ kind: 'existing', id: entry.postId })}>Open post</button></td></tr>;
}
