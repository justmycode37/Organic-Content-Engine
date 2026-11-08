import { Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api, errorText } from '../api/client';
import type { Pillar, PillarInput, PlatformId } from '../api/types';
import { Button, Drawer, Empty, Field, PageHead, Toggle } from '../components/common';
import { platformIcon } from '../lib/platforms';
import { hrefFor, useWorkspace } from '../workspace';

const BLANK: PillarInput = { name: '', description: '', audience: '', tone: '', keywords: [], platforms: [], active: true };

export function PillarsView() {
  const ws = useWorkspace();
  const [editing, setEditing] = useState<Pillar | 'new' | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  const setActive = async (pillar: Pillar, active: boolean) => {
    setToggling(pillar.id);
    try {
      await api.pillars.update(pillar.id, { active });
      ws.refresh();
    } catch (e) {
      ws.toast(errorText(e), 'error');
    } finally {
      setToggling(null);
    }
  };

  const remove = async (pillar: Pillar) => {
    const ok = await ws.confirm({ title: `Delete "${pillar.name}"?`, body: 'This deletes its ideas. Posts made from them stay.', confirmLabel: 'Delete pillar' });
    if (!ok) return;
    try {
      await api.pillars.remove(pillar.id);
      ws.toast('Pillar deleted.');
      ws.refresh();
    } catch (e) {
      ws.toast(errorText(e), 'error');
    }
  };

  const create = <Button variant="primary" onClick={() => setEditing('new')}><Plus size={15} aria-hidden /> New pillar</Button>;

  return (
    <>
      <PageHead eyebrow="Configure" title="Pillars" actions={ws.pillars.length > 0 ? create : undefined}>
        Content themes. Autopilot only uses active pillars with at least one platform it can target.
      </PageHead>

      {ws.pillars.length === 0 && <Empty title="No pillars yet" action={create}>Add a theme you want to post about. Ideas are generated from it.</Empty>}

      <div className="pillar-grid">
        {ws.pillars.map(pillar => (
          <article key={pillar.id} className={`card pillar ${pillar.active ? '' : 'pillar-off'}`}>
            <div className="pillar-head">
              <h3>{pillar.name}</h3>
              <Toggle checked={pillar.active} label={`${pillar.name} active`} disabled={toggling === pillar.id} onChange={next => void setActive(pillar, next)} />
            </div>
            {pillar.description && <p>{pillar.description}</p>}
            {pillar.audience && <p className="muted">For {pillar.audience}</p>}
            {pillar.keywords.length > 0 && <div className="tags">{pillar.keywords.map(k => <span key={k}>{k}</span>)}</div>}
            {pillar.platforms.length > 0
              ? <div className="pillar-platforms">{pillar.platforms.map(id => <span key={id} title={ws.platform(id)?.displayName}>{platformIcon(id)}</span>)}</div>
              : <p className="muted">No platforms, so autopilot skips it.</p>}
            <div className="row">
              <Button onClick={() => setEditing(pillar)}>Edit</Button>
              <a className="btn btn-secondary" href={hrefFor('ideas', { pillar: pillar.id })}>Ideas</a>
              <Button variant="ghost" onClick={() => void remove(pillar)}>Delete</Button>
            </div>
          </article>
        ))}
      </div>

      {editing && <PillarDrawer pillar={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function PillarDrawer({ pillar, onClose }: { pillar: Pillar | null; onClose: () => void }) {
  const ws = useWorkspace();
  const [form, setForm] = useState<PillarInput>(pillar ? {
    name: pillar.name, description: pillar.description, audience: pillar.audience, tone: pillar.tone,
    keywords: pillar.keywords, platforms: pillar.platforms, active: pillar.active,
  } : BLANK);
  const [keywords, setKeywords] = useState(form.keywords.join(', '));
  const [busy, setBusy] = useState(false);

  const togglePlatform = (id: PlatformId) => setForm(f => ({
    ...f,
    platforms: f.platforms.includes(id) ? f.platforms.filter(p => p !== id) : [...f.platforms, id],
  }));

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const input = { ...form, name: form.name.trim(), keywords: keywords.split(',').map(k => k.trim()).filter(Boolean) };
    try {
      if (pillar) await api.pillars.update(pillar.id, input);
      else await api.pillars.create(input);
      ws.toast(pillar ? 'Pillar saved.' : 'Pillar created.');
      ws.refresh();
      onClose();
    } catch (e) {
      ws.toast(errorText(e), 'error');
      setBusy(false);
    }
  };

  return (
    <Drawer eyebrow="Pillar" title={pillar ? pillar.name : 'New pillar'} onClose={onClose}>
      <form onSubmit={e => void save(e)}>
        <Field label="Name"><input required autoFocus maxLength={120} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Description"><textarea rows={3} maxLength={2000} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></Field>
        <Field label="Audience"><input maxLength={500} value={form.audience} onChange={e => setForm({ ...form, audience: e.target.value })} /></Field>
        <Field label="Tone"><input maxLength={500} value={form.tone} onChange={e => setForm({ ...form, tone: e.target.value })} /></Field>
        <Field label="Keywords" hint="Separated by commas."><input value={keywords} onChange={e => setKeywords(e.target.value)} /></Field>
        <fieldset className="checks">
          <legend>Platforms</legend>
          {ws.platforms.map(p => (
            <label key={p.id} className="check">
              <input type="checkbox" checked={form.platforms.includes(p.id)} onChange={() => togglePlatform(p.id)} />
              {platformIcon(p.id)} {p.displayName}
              {p.state === 'unsupported' && <small>no route</small>}
            </label>
          ))}
        </fieldset>
        <label className="check check-solo">
          <input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} /> Active
        </label>
        <div className="row row-end">
          <Button onClick={onClose}>Discard</Button>
          <Button variant="primary" type="submit" busy={busy} disabled={!form.name.trim()}>{pillar ? 'Save pillar' : 'Create pillar'}</Button>
        </div>
      </form>
    </Drawer>
  );
}
