import { useEffect, useRef, useState } from 'react';
import { Download, FileUp, Trash2 } from 'lucide-react';
import { api, errorText, type Material } from '../api/client';
import { Button, Field, LoadError, Notice, PageHead, Spinner, Toggle } from '../components/common';
import { useLoad } from '../lib/hooks';
import { useWorkspace } from '../workspace';

export function StorageView() {
  const ws = useWorkspace();
  const library = useLoad(api.materials.list, [ws.version]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [dragging, setDragging] = useState(false);
  const [search, setSearch] = useState('');
  const picker = useRef<HTMLInputElement>(null);
  const upload = async (files: FileList | File[]) => {
    if (busy) return;
    setBusy(true);
    let successes = 0;
    try {
      for (const file of Array.from(files)) {
        setProgress(`Uploading ${file.name}…`);
        if (file.size > 100 * 1024 * 1024) { ws.toast(`${file.name}: maximum size is 100 MB.`, 'error'); continue; }
        try { await api.materials.upload(file); successes++; }
        catch (error) { ws.toast(`${file.name}: ${errorText(error)}`, 'error'); }
      }
      if (successes) ws.toast(`${successes} file${successes === 1 ? '' : 's'} added to Storage.`);
    } finally { setBusy(false); setProgress(''); library.reload(); ws.refresh(); if (picker.current) picker.current.value = ''; }
  };
  return <>
    <PageHead eyebrow="Source material" title="Storage">A home for your footage, photos, transcripts, documents, and brand references.</PageHead>
    <Notice>ChatGPT reads enabled source material through the connected Organic Content Engine tools. Text generation uses your ChatGPT plan. Video generation uses your connected Monid MCP and its balance.</Notice>
    <section className={`upload-zone ${dragging ? 'dragging' : ''}`} aria-label="Upload material"
      onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); void upload(e.dataTransfer.files); }}>
      <FileUp size={28} aria-hidden />
      <h3>{busy ? progress : 'Drop your material here'}</h3>
      <p>Any file type · up to 100 MB per file · stored privately in this workspace</p>
      <input ref={picker} type="file" multiple hidden onChange={e => { if (e.target.files) void upload(e.target.files); }} />
      <Button variant="primary" busy={busy} onClick={() => picker.current?.click()}>Choose files</Button>
    </section>
    <Notice>Add notes or transcripts to footage and documents so ChatGPT can use them. Images and text can be read directly. Uploading a file does not publish it.</Notice>
    <div className="row storage-toolbar"><Field label="Find material"><input type="search" placeholder="Search names and notes" value={search} onChange={e => setSearch(e.target.value)} /></Field><span className="muted">{library.data?.items.length ?? 0} files</span></div>
    {library.error && <LoadError message={library.error} onRetry={library.reload} />}
    {!library.data && !library.error && <Spinner label="Loading material" />}
    {library.data?.items.length === 0 && <div className="card"><h3>Your source library starts here</h3><p>Upload an interview, product photo, existing post, or a text brief. Add notes explaining what the AI should know.</p></div>}
    <div className="material-grid">{library.data?.items.filter(m => `${m.name} ${m.notes}`.toLowerCase().includes(search.toLowerCase())).map(m => <MaterialCard key={m.id} material={m} onChange={() => { library.reload(); ws.refresh(); }} />)}</div>
  </>;
}

function MaterialCard({ material, onChange }: { material: Material; onChange: () => void }) {
  const ws = useWorkspace();
  const [notes, setNotes] = useState(material.notes);
  const [busy, setBusy] = useState(false);
  useEffect(() => setNotes(material.notes), [material.notes]);
  const run = async (job: () => Promise<unknown>) => { setBusy(true); try { await job(); onChange(); } catch (e) { ws.toast(errorText(e), 'error'); } finally { setBusy(false); } };
  return <article className="card material-card">
    <div className="card-head"><h3 title={material.name}>{material.name}</h3><a aria-label={`Download ${material.name}`} href={`/api/materials/${material.id}/file`}><Download size={16} /></a></div>
    {material.mime.startsWith('video/')?<video controls preload="metadata" src={`/api/materials/${material.id}/preview`} style={{width:'100%',maxHeight:240}}/>:['image/jpeg','image/png','image/webp'].includes(material.mime)?<img alt={material.name} loading="lazy" src={`/api/materials/${material.id}/preview`} style={{width:'100%',maxHeight:240,objectFit:'contain'}}/>:null}
    <p className="muted">{material.mime} · {(material.size / 1024 / 1024).toFixed(2)} MB{material.kind === 'raw_clip' ? ' · Raw footage, finish in the Studio before publishing' : material.kind === 'finished' ? ' · Finished video' : ''}</p>
    <div className="switch-row"><b>Use for content</b><Toggle label={`Use ${material.name} for content`} checked={material.enabled} onChange={enabled => { if (!busy) void run(() => api.materials.update(material.id, { enabled })); }} /></div>
    <Field label="Context for the AI"><textarea rows={4} maxLength={12000} placeholder="What is in this file? Add key moments, facts, a transcript, or how it can be used." value={notes} onChange={e => setNotes(e.target.value)} /></Field>
    <Button disabled={busy || notes !== material.notes} onClick={() => void run(() => api.generation.create({kind:'analyze',materialId:material.id}).then(()=>{window.location.hash='#/generation';}))}>Analyze with ChatGPT</Button>
    <div className="row"><Button busy={busy} disabled={notes === material.notes} onClick={() => void run(() => api.materials.update(material.id, { notes }))}>Save notes</Button>
    <Button disabled={busy} onClick={() => void run(async () => { if (await ws.confirm({ title: 'Delete material?', body: `Remove ${material.name} and its notes from Storage?`, confirmLabel: 'Delete' })) await api.materials.remove(material.id); })}><Trash2 size={14} aria-hidden /> Delete</Button></div>
  </article>;
}
