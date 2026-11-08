import { Sparkles } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { api, errorText } from '../api/client';
import type { Idea, IdeaStatus, PlatformId } from '../api/types';
import { Button, Empty, Field, LoadError, Notice, PageHead, Pager, Spinner } from '../components/common';
import { useLoad } from '../lib/hooks';
import { hrefFor, useParams, useWorkspace } from '../workspace';

const LIMIT = 30;
const STATUS_LABEL: Record<IdeaStatus, string> = { new: 'New', drafted: 'Drafted', rejected: 'Rejected' };

export function IdeasView() {
  const ws = useWorkspace();
  const [params, setParams] = useParams();
  const pillarFilter = params.get('pillar') ?? '';
  const status = (params.get('status') ?? '') as IdeaStatus | '';
  const [offset, setOffset] = useState(0);
  useEffect(() => setOffset(0), [pillarFilter, status]);

  const firstPillar = ws.pillars.find(p => p.active) ?? ws.pillars[0];
  const [genPillar, setGenPillar] = useState('');
  const [count, setCount] = useState(5);
  const [prompt, setPrompt] = useState('');
  const [title, setTitle] = useState('');
  const [angle, setAngle] = useState('');
  const [busy, setBusy] = useState<'generate' | 'add' | null>(null);

  const pillarId = genPillar || pillarFilter || firstPillar?.id || '';
  const ideas = useLoad(
    () => api.ideas.list({ pillarId: pillarFilter || undefined, status: status || undefined, limit: LIMIT, offset }),
    [pillarFilter, status, offset, ws.version],
  );

  const generate = async (event: FormEvent) => {
    event.preventDefault();
    setBusy('generate');
    try {
      const { items } = await api.ideas.generate({ pillarId, count, prompt: prompt.trim() || undefined });
      const dropped = count - items.length;
      ws.toast(items.length === 0
        ? 'No new ideas: everything generated was a duplicate.'
        : `${items.length} idea${items.length === 1 ? '' : 's'} added${dropped > 0 ? `, ${dropped} dropped as duplicate${dropped === 1 ? '' : 's'}` : ''}.`);
      setPrompt('');
      ws.refresh();
    } catch (e) {
      ws.toast(errorText(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  const add = async (event: FormEvent) => {
    event.preventDefault();
    setBusy('add');
    try {
      await api.ideas.create({ pillarId, title: title.trim(), angle: angle.trim() || undefined });
      setTitle('');
      setAngle('');
      ws.toast('Idea added.');
      ws.refresh();
    } catch (e) {
      ws.toast(errorText(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  if (ws.pillars.length === 0) {
    return (
      <>
        <PageHead eyebrow="Plan" title="Ideas" />
        <Empty title="Ideas start from a pillar" action={<a className="btn btn-primary" href={hrefFor('pillars')}>Create a pillar</a>}>
          A pillar is a content theme. Ideas are generated from its audience, tone and keywords.
        </Empty>
      </>
    );
  }

  return (
    <>
      <PageHead eyebrow="Plan" title="Ideas">Generate from a pillar or add your own, then draft for a platform.</PageHead>

      {ws.status.generator.id === 'template' && (
        <Notice>
          The <code>template</code> generator is active. It works offline and writes prompts for you to finish, not publishable copy. Set <code>CONTENT_GENERATOR=anthropic</code> and <code>ANTHROPIC_API_KEY</code> as Site runtime values for written drafts.
        </Notice>
      )}

      <div className="split">
        <form className="card" onSubmit={e => void generate(e)}>
          <h3>Generate</h3>
          <div className="form-row">
            <Field label="Pillar">
              <select value={pillarId} onChange={e => setGenPillar(e.target.value)}>
                {ws.pillars.map(p => <option key={p.id} value={p.id}>{p.name}{p.active ? '' : ' (inactive)'}</option>)}
              </select>
            </Field>
            <Field label="How many">
              <input type="number" min={1} max={20} value={Number.isNaN(count) ? '' : count} onChange={e => setCount(e.target.valueAsNumber)} />
            </Field>
          </div>
          <Field label="Direction (optional)">
            <input maxLength={2000} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Anything this batch should focus on" />
          </Field>
          <Button variant="primary" type="submit" busy={busy === 'generate'} disabled={!!busy || !pillarId || !(count >= 1 && count <= 20)}><Sparkles size={14} aria-hidden /> Generate ideas</Button>
        </form>

        <form className="card" onSubmit={e => void add(e)}>
          <h3>Add your own</h3>
          <Field label="Title">
            <input required maxLength={200} value={title} onChange={e => setTitle(e.target.value)} />
          </Field>
          <Field label="Angle (optional)">
            <input maxLength={2000} value={angle} onChange={e => setAngle(e.target.value)} />
          </Field>
          <Button type="submit" busy={busy === 'add'} disabled={!!busy || !title.trim() || !pillarId}>Add to {ws.pillars.find(p => p.id === pillarId)?.name ?? 'pillar'}</Button>
        </form>
      </div>

      <div className="filters">
        <select aria-label="Filter by pillar" value={pillarFilter} onChange={e => setParams({ pillar: e.target.value })}>
          <option value="">All pillars</option>
          {ws.pillars.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select aria-label="Filter by status" value={status} onChange={e => setParams({ status: e.target.value })}>
          <option value="">All statuses</option>
          {(Object.keys(STATUS_LABEL) as IdeaStatus[]).map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </div>

      {ideas.error && <LoadError message={ideas.error} onRetry={ideas.reload} />}
      {!ideas.data && ideas.loading && <Spinner label="Loading ideas" />}
      {ideas.data?.items.length === 0 && <Empty title={pillarFilter || status ? 'No ideas match these filters' : 'No ideas yet'}>{pillarFilter || status ? null : 'Generate a batch above.'}</Empty>}
      <ul className="idea-list">
        {ideas.data?.items.map(idea => <IdeaRow key={idea.id} idea={idea} />)}
      </ul>
      {ideas.data && <Pager total={ideas.data.total} limit={LIMIT} offset={offset} onChange={setOffset} />}
    </>
  );
}

function IdeaRow({ idea }: { idea: Idea }) {
  const ws = useWorkspace();
  const pillar = ws.pillars.find(p => p.id === idea.pillarId);
  const fallback = pillar?.platforms[0] ?? ws.platforms.find(p => p.state === 'ready')?.id ?? ws.platforms.find(p => p.support === 'direct')?.id ?? 'bluesky';
  const [platform, setPlatform] = useState<PlatformId>(fallback);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(idea.title);
  const [angle, setAngle] = useState(idea.angle);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    try {
      await action();
      ws.refresh();
    } catch (e) {
      ws.toast(errorText(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  const draft = () => run('draft', async () => {
    const post = await api.ideas.draft(idea.id, { platform });
    ws.openPost({ kind: 'existing', id: post.id });
  });

  const remove = async () => {
    if (!await ws.confirm({ title: 'Delete this idea?', body: `"${idea.title}" is removed. Posts drafted from it stay.`, confirmLabel: 'Delete idea' })) return;
    await run('delete', () => api.ideas.remove(idea.id).then(() => ws.toast('Idea deleted.')));
  };

  const save = () => run('save', async () => {
    await api.ideas.update(idea.id, { title: title.trim(), angle: angle.trim() });
    setEditing(false);
  });

  if (editing) {
    return (
      <li className="idea">
        <div className="idea-main">
          <Field label="Title"><input maxLength={200} value={title} onChange={e => setTitle(e.target.value)} /></Field>
          <Field label="Angle"><textarea rows={2} maxLength={2000} value={angle} onChange={e => setAngle(e.target.value)} /></Field>
          <div className="row">
            <Button variant="primary" busy={busy === 'save'} disabled={!title.trim()} onClick={() => void save()}>Save</Button>
            <Button onClick={() => { setTitle(idea.title); setAngle(idea.angle); setEditing(false); }}>Discard</Button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className={`idea idea-${idea.status}`}>
      <div className="idea-main">
        <h4>{idea.title}</h4>
        {idea.angle && <p>{idea.angle}</p>}
        <div className="idea-meta">
          <span>{STATUS_LABEL[idea.status]}</span>
          <span>{pillar?.name ?? 'Unknown pillar'}</span>
          <span>{idea.source}</span>
          <button className="textbtn" onClick={() => setEditing(true)}>Edit</button>
          {idea.status === 'rejected'
            ? <button className="textbtn" disabled={!!busy} onClick={() => void run('status', () => api.ideas.update(idea.id, { status: 'new' }).then(() => {}))}>Restore</button>
            : <button className="textbtn" disabled={!!busy} onClick={() => void run('status', () => api.ideas.update(idea.id, { status: 'rejected' }).then(() => {}))}>Reject</button>}
          <button className="textbtn" disabled={!!busy} onClick={() => void remove()}>Delete</button>
        </div>
      </div>
      {idea.status !== 'rejected' && (
        <div className="idea-draft">
          <select aria-label={`Platform for ${idea.title}`} value={platform} onChange={e => setPlatform(e.target.value as PlatformId)}>
            {ws.platforms.map(p => <option key={p.id} value={p.id}>{p.displayName}{p.state === 'unsupported' ? ' (no route)' : ''}</option>)}
          </select>
          <Button busy={busy === 'draft'} disabled={!!busy} onClick={() => void draft()}>{idea.status === 'drafted' ? 'Draft again' : 'Draft'}</Button>
        </div>
      )}
    </li>
  );
}
