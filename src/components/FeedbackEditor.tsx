import { useEffect, useState } from 'react';
import { api, errorText } from '../api/client';
import type { FeedbackEntry, Post } from '../api/types';
import { useWorkspace } from '../workspace';
import { Button, Field, Notice, Spinner } from './common';

export function FeedbackEditor({ post }: { post: Post }) {
  const ws = useWorkspace();
  const [format, setFormat] = useState('');
  const [verdict, setVerdict] = useState<FeedbackEntry['verdict']>(null);
  const [notes, setNotes] = useState('');
  const [metrics, setMetrics] = useState({ impressions: '', engagements: '', conversions: '' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [revision, setRevision] = useState(false);
  useEffect(() => {
    let active = true;
    setFormat(''); setVerdict(null); setNotes('');
    setMetrics({ impressions: '', engagements: '', conversions: '' });
    setError(''); setSaved(false); setRevision(false); setBusy(false); setLoading(true);
    api.feedback.list().then(data => {
      const entry = data.entries.find(item => item.postId === post.id);
      if (!active) return;
      if (!entry) return;
      setFormat(entry.format); setVerdict(entry.verdict); setNotes(entry.notes);
      setMetrics({ impressions: entry.impressions?.toString() ?? '', engagements: entry.engagements?.toString() ?? '', conversions: entry.conversions?.toString() ?? '' });
    }, e => { if (active) setError(errorText(e)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [post.id]);
  const persistFeedback = async () => {
    if (!format.trim()) throw new Error('Add a format before saving feedback.');
    const values = Object.fromEntries(Object.entries(metrics).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)]));
    if (Object.values(values).some(v => !Number.isFinite(v) || v < 0)) throw new Error('Metrics must be zero or a positive number.');
    await api.feedback.save(post.id, { format: format.trim(), verdict, notes, ...values });
    setSaved(true); ws.refresh();
  };
  const submit = async () => {
    setBusy(true); setError(''); setSaved(false); setRevision(false);
    try { await persistFeedback(); }
    catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  };
  const revise = async () => {
    setBusy(true); setError(''); setRevision(false);
    try {
      await persistFeedback();
      await api.posts.revise(post.id);
      ws.refresh(); setRevision(true);
    }
    catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  };
  const published = post.status === 'published';
  return <section className="feedback-editor">
    <h3>Performance feedback</h3>
    <p>Record the content format, outcome, and what you learned. Metrics are available for published posts.</p>
    {loading ? <Spinner label="Loading feedback" /> : <>
      {error && <Notice tone="alert">{error}</Notice>}{saved && <Notice>Feedback saved.</Notice>}{revision && <Notice>Revision created in the library for review.</Notice>}
      <Field label="Content format"><input value={format} maxLength={120} placeholder="e.g. Quick tip, story, carousel" onChange={e => { setFormat(e.target.value); setSaved(false); setRevision(false); }} /></Field>
      <Field label="Verdict"><select value={verdict ?? ''} onChange={e => { setVerdict((e.target.value || null) as FeedbackEntry['verdict']); setSaved(false); setRevision(false); }}><option value="">No verdict yet</option><option value="successful">Successful</option><option value="iterate">Iterate</option><option value="discard">Discard</option></select></Field>
      <Field label="Notes"><textarea rows={3} value={notes} onChange={e => { setNotes(e.target.value); setSaved(false); setRevision(false); }} placeholder="What worked, what to change, or what to try next" /></Field>
      {published ? <div className="feedback-metrics">{(['impressions', 'engagements', 'conversions'] as const).map(key => <Field key={key} label={key[0].toUpperCase() + key.slice(1)}><input type="number" min="0" step="1" value={metrics[key]} onChange={e => { setMetrics(v => ({ ...v, [key]: e.target.value })); setSaved(false); setRevision(false); }} /></Field>)}</div> : <p className="field-hint">Metrics appear after this post is published. You can record a verdict now.</p>}
      <div className="row"><Button busy={busy} onClick={() => void submit()}>Save feedback</Button>{saved && <Button busy={busy} onClick={() => void revise()}>Create revision</Button>}</div>
    </>}
  </section>;
}
