import { useEffect, useRef, useState } from 'react';
import { Download, FileUp, Trash2 } from 'lucide-react';
import { api, errorText, type Material } from '../api/client';
import { Button, Field, LoadError, Notice, PageHead, Spinner, Toggle } from '../components/common';
import { useLoad } from '../lib/hooks';
import { useWorkspace } from '../workspace';

export function StorageView() {
  const ws = useWorkspace();
  const library = useLoad(api.materials.list, [ws.version]);
  const account = useLoad(api.chatgpt.get, [ws.version]);
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
    <ChatGPTConnection />
    <section className={`upload-zone ${dragging ? 'dragging' : ''}`} aria-label="Upload material"
      onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); void upload(e.dataTransfer.files); }}>
      <FileUp size={28} aria-hidden />
      <h3>{busy ? progress : 'Drop your material here'}</h3>
      <p>Any file type · up to 100 MB per file · stored privately in this workspace</p>
      <input ref={picker} type="file" multiple hidden onChange={e => { if (e.target.files) void upload(e.target.files); }} />
      <Button variant="primary" busy={busy} onClick={() => picker.current?.click()}>Choose files</Button>
    </section>
    <Notice>Enabled files supply their notes and text to the AI. ChatGPT can also see up to four enabled JPEG, PNG, or WebP images under 5 MB per request. Use “Analyze with ChatGPT” to summarize text, describe images, or sample footage (requires ffmpeg; up to four frames, no audio). Add notes or transcripts for audio, PDFs, and other documents. Uploading does not publish a file.</Notice>
    {account.data?.connected && !account.data.model && <Notice>Choose a ChatGPT model above before generating content.</Notice>}
    <div className="row storage-toolbar"><Field label="Find material"><input type="search" placeholder="Search names and notes" value={search} onChange={e => setSearch(e.target.value)} /></Field><span className="muted">{library.data?.items.length ?? 0} files</span></div>
    {library.error && <LoadError message={library.error} onRetry={library.reload} />}
    {!library.data && !library.error && <Spinner label="Loading material" />}
    {library.data?.items.length === 0 && <div className="card"><h3>Your source library starts here</h3><p>Upload an interview, product photo, existing post, or a text brief. Add notes explaining what the AI should know.</p></div>}
    <div className="material-grid">{library.data?.items.filter(m => `${m.name} ${m.notes}`.toLowerCase().includes(search.toLowerCase())).map(m => <MaterialCard key={m.id} material={m} onChange={() => { library.reload(); ws.refresh(); }} />)}</div>
  </>;
}

function ChatGPTConnection() {
  const ws = useWorkspace();
  const account = useLoad(api.chatgpt.get, [ws.version]);
  const models = useLoad(async () => account.data?.connected ? api.chatgpt.models() : { items: [] }, [account.data?.connected]);
  const [busy, setBusy] = useState(false);
  const act = async (job: () => Promise<void>) => {
    setBusy(true);
    try { await job(); } catch (e) { ws.toast(errorText(e), 'error'); }
    finally { setBusy(false); account.reload(); ws.refresh(); }
  };
  return <section className="card section">
    <div className="card-head"><h3>ChatGPT</h3><span className="badge">{account.data?.connected ? 'Connected' : 'Not connected'}</span></div>
    <p>Connect your eligible ChatGPT plan to generate ideas and posts using your available usage. Your material is sent to OpenAI when generating content.</p>
    {account.error && <LoadError message={account.error} onRetry={account.reload} />}
    {account.data?.error && <Notice tone="alert">{account.data.error}</Notice>}
    {account.data?.connected ? <>
      <p>{account.data.email ?? 'ChatGPT account connected'}</p>
      <Field label="Generation model"><select disabled={busy || !models.data} value={account.data.model ?? ''} onChange={e => void act(async () => { await api.chatgpt.select(e.target.value); })}>
        <option value="" disabled>Choose an available model</option>
        {models.data?.items.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select></Field>
      {models.error && <LoadError message={models.error} onRetry={models.reload} />}
      <div className="row"><a href="https://chatgpt.com/settings/usage" target="_blank" rel="noreferrer">Manage ChatGPT usage</a>
      <Button disabled={busy} onClick={() => void act(async () => {
        const result = await api.chatgpt.disconnect();
        if (!result.revoked) ws.toast('Disconnected locally. Remote revocation was not confirmed; remove this app in ChatGPT Settings.', 'error');
      })}>Disconnect</Button></div>
    </> : <>
      {account.data && !account.data.available && <Notice>ChatGPT plan sign-in is available when running this workspace locally. Hosted deployments require an eligible registered integration.</Notice>}
      <Button variant="primary" busy={busy} disabled={!account.data?.available || account.data.connecting} onClick={() => void act(async () => {
        const { url } = await api.chatgpt.connect(); window.location.assign(url);
      })}>{account.data?.connecting ? 'Waiting for ChatGPT sign-in…' : 'Continue with ChatGPT'}</Button>
      {account.data?.connecting && <Button onClick={() => void act(async () => { await api.chatgpt.disconnect(); })}>Cancel sign-in</Button>}
    </>}
  </section>;
}

function MaterialCard({ material, onChange }: { material: Material; onChange: () => void }) {
  const ws = useWorkspace();
  const [notes, setNotes] = useState(material.notes);
  const [busy, setBusy] = useState(false);
  useEffect(() => setNotes(material.notes), [material.notes]);
  const run = async (job: () => Promise<unknown>) => { setBusy(true); try { await job(); onChange(); } catch (e) { ws.toast(errorText(e), 'error'); } finally { setBusy(false); } };
  return <article className="card material-card">
    <div className="card-head"><h3 title={material.name}>{material.name}</h3><a aria-label={`Download ${material.name}`} href={`/api/materials/${material.id}/file`}><Download size={16} /></a></div>
    <p className="muted">{material.mime} · {(material.size / 1024 / 1024).toFixed(2)} MB</p>
    <div className="switch-row"><b>Use for content</b><Toggle label={`Use ${material.name} for content`} checked={material.enabled} onChange={enabled => { if (!busy) void run(() => api.materials.update(material.id, { enabled })); }} /></div>
    <Field label="Context for the AI"><textarea rows={4} maxLength={12000} placeholder="What is in this file? Add key moments, facts, a transcript, or how it can be used." value={notes} onChange={e => setNotes(e.target.value)} /></Field>
    <Button disabled={busy || notes !== material.notes} onClick={() => void run(() => api.materials.analyze(material.id))}>Analyze with ChatGPT</Button>
    <div className="row"><Button busy={busy} disabled={notes === material.notes} onClick={() => void run(() => api.materials.update(material.id, { notes }))}>Save notes</Button>
    <Button disabled={busy} onClick={() => void run(async () => { if (await ws.confirm({ title: 'Delete material?', body: `Remove ${material.name} and its notes from Storage?`, confirmLabel: 'Delete' })) await api.materials.remove(material.id); })}><Trash2 size={14} aria-hidden /> Delete</Button></div>
  </article>;
}
