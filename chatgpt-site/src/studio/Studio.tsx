import { useEffect, useMemo, useRef, useState } from 'react';
import { api, errorText, type Material, type VoiceOption } from '../api/client';
import { Button, Field, Notice, Spinner } from '../components/common';
import { useWorkspace } from '../workspace';
import { EMPTY_PLAN, FRAME, VOICE_OFFSET, buildTimeline, captionsFromWords, formatCaptions, formatShots, parseCaptions, parseShots, type EditPlan, type Voice } from './plan';
import { loadClip, loadFonts, paintFrame, releaseClips, renderSupport, renderVideo, type LoadedClip } from './render';

export interface StudioClip { runId: string; materialId: string; name: string }
export interface StudioProps {
  /** Present when finishing generated footage; absent when finishing a video from Storage. */
  jobId: string | null;
  clips: StudioClip[];
  plan: EditPlan | null;
  outputName: string;
  music: Material[];
  onClose: () => void;
  onSaved: () => void;
}

/** Finishing studio: edit the plan, scrub an exact preview, export the finished vertical video. */
export function Studio({ jobId, clips, plan: initial, outputName, music, onClose, onSaved }: StudioProps) {
  const ws = useWorkspace();
  const [loaded, setLoaded] = useState<LoadedClip[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hook, setHook] = useState(initial?.hook ?? '');
  const [cta, setCta] = useState(initial?.cta ?? '');
  const [captionText, setCaptionText] = useState(() => formatCaptions(initial?.captions ?? []));
  const [shotText, setShotText] = useState<string | null>(null);
  const [musicId, setMusicId] = useState(initial?.musicMaterialId ?? '');
  const [script, setScript] = useState(initial?.voiceover ?? '');
  const [voice, setVoice] = useState<Voice | null>(initial?.voice ?? null);
  const [voicedScript, setVoicedScript] = useState(initial?.voice ? initial.voiceover : '');
  const [voices, setVoices] = useState<{ configured: boolean; voices: VoiceOption[]; defaultVoiceId: string | null } | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceId, setVoiceId] = useState(initial?.voice?.voiceId ?? '');
  const [voicing, setVoicing] = useState(false);
  const [handle, setHandle] = useState('');
  const [time, setTime] = useState(0);
  const [progress, setProgress] = useState<number | null>(null);
  const [output, setOutput] = useState<{ blob: Blob; url: string; duration: number; hasAudio: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const abort = useRef<AbortController | null>(null);
  const painting = useRef(Promise.resolve());
  const unsupported = renderSupport();

  useEffect(() => { void api.brand.get().then(brand => setHandle(brand.handle)).catch(() => undefined); }, []);
  const loadVoices = async () => {
    setVoiceError(null);
    try {
      const list = await api.voiceover.voices();
      setVoices(list);
      let remembered = '';
      try { remembered = localStorage.getItem('oce.voice.v1') ?? ''; } catch { /* storage unavailable */ }
      setVoiceId(current => [current, remembered, list.defaultVoiceId ?? ''].find(id => id && list.voices.some(item => item.id === id)) ?? '');
    } catch (error) { setVoiceError(errorText(error)); }
  };
  useEffect(() => {
    void loadVoices();
    // Loaded once per studio session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    let cancelled = false; const ready: LoadedClip[] = [];
    (async () => {
      try {
        await loadFonts();
        for (const clip of clips) { const item = await loadClip(clip.runId, `/api/materials/${encodeURIComponent(clip.materialId)}/preview`, clip.name); if (cancelled) { releaseClips([item]); return; } ready.push(item); }
        setLoaded(ready);
        setShotText(formatShots(initial?.shots ?? [], ready));
      } catch (error) { if (!cancelled) setLoadError(errorText(error)); }
    })();
    return () => { cancelled = true; abort.current?.abort(); releaseClips(ready); };
    // Clips are fixed for the lifetime of an open studio.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => { if (output) URL.revokeObjectURL(output.url); }, [output]);

  const parsed = useMemo(() => {
    const captions = parseCaptions(captionText);
    const shots = loaded && shotText !== null ? parseShots(shotText, loaded) : { shots: initial?.shots ?? [], error: null };
    const plan: EditPlan = { ...EMPTY_PLAN, hook: hook.trim(), cta: cta.trim(), captions: captions.captions, shots: shots.shots, musicMaterialId: musicId || null, voiceover: script.trim(), voice };
    return { plan, error: captions.error ?? shots.error };
  }, [captionText, shotText, hook, cta, musicId, script, voice, loaded, initial]);
  const timeline = useMemo(() => loaded ? buildTimeline(parsed.plan, loaded) : null, [parsed.plan, loaded]);
  const dropped = timeline ? parsed.plan.captions.length - timeline.captions.length : 0;
  const staleVoice = Boolean(voice && voicedScript !== script.trim());
  const longVoice = Boolean(voice && timeline && voice.duration + VOICE_OFFSET > timeline.duration + 1 / FRAME.fps);
  const busy = progress !== null;
  const locked = busy || saving || voicing;

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx || !loaded || !timeline || progress !== null) return;
    const at = Math.min(time, Math.max(0, timeline.duration - 1 / FRAME.fps));
    // Seeks are serialized: overlapping seeks on one element would draw the wrong frame.
    painting.current = painting.current.then(() => paintFrame(ctx, at, timeline, parsed.plan, handle, loaded)).catch(() => undefined);
  }, [time, timeline, parsed.plan, handle, loaded, progress, output]);

  const exportVideo = async () => {
    if (!loaded || !timeline || locked || staleVoice || longVoice) return;
    abort.current = new AbortController(); setProgress(0); setOutput(null);
    try {
      await painting.current;
      const track = music.find(item => item.id === musicId);
      const audioFile = async (id: string, label: string) => {
        const response = await fetch(`/api/materials/${encodeURIComponent(id)}/file`, { signal: abort.current!.signal });
        if (!response.ok) throw new Error(`${label} could not be loaded from Storage. Select or generate it again.`);
        return response.arrayBuffer();
      };
      const [bed, narration] = await Promise.all([track ? audioFile(track.id, 'The music file') : null, voice ? audioFile(voice.materialId, 'The voiceover') : null]);
      const result = await renderVideo({ plan: parsed.plan, clips: loaded, music: bed, voice: narration, handle, onProgress: setProgress, signal: abort.current.signal });
      setOutput({ ...result, url: URL.createObjectURL(result.blob) });
    } catch (error) { if (!abort.current.signal.aborted) ws.toast(errorText(error), 'error'); }
    finally { setProgress(null); }
  };
  const generateVoice = async () => {
    const text = script.trim();
    if (!text || !voiceId || locked) return;
    setVoicing(true);
    try {
      const take = await api.voiceover.create({ text, voiceId });
      try { localStorage.setItem('oce.voice.v1', voiceId); } catch { /* storage unavailable */ }
      setVoice(take); setVoicedScript(text); setOutput(null);
      if (take.words.length) { setCaptionText(formatCaptions(captionsFromWords(take.words))); ws.toast('Voiceover ready. Captions were re-timed to the spoken words.'); }
      else ws.toast('Voiceover ready. No word timings were returned, so captions were left as they were.');
    } catch (error) { ws.toast(errorText(error), 'error'); } finally { setVoicing(false); }
  };
  const savePlan = async () => {
    if (!jobId || locked || staleVoice) return;
    setSaving(true);
    try { await api.generation.saveEdit(jobId, parsed.plan); ws.toast('Edit saved. Automatic finishing queued.'); onSaved(); }
    catch (error) { ws.toast(errorText(error), 'error'); } finally { setSaving(false); }
  };
  const saveVideo = async () => {
    if (!output || locked || staleVoice || longVoice) return;
    setSaving(true);
    try {
      const material = await api.materials.upload(new File([output.blob], outputName, { type: 'video/mp4' }), 'finished');
      if (jobId) await api.generation.finish(jobId, { materialId: material.id, edit: parsed.plan });
      ws.toast('Finished video saved to Storage. Select it when you schedule a post.');
      ws.refresh(); onSaved(); onClose();
    } catch (error) { ws.toast(errorText(error), 'error'); } finally { setSaving(false); }
  };

  return <section className="card card-strong section studio">
    <div className="card-head"><h3>Studio</h3><Button variant="ghost" disabled={locked} onClick={onClose}>Close</Button></div>
    {unsupported && <Notice tone="alert">{unsupported}</Notice>}
    {loadError && <Notice tone="alert">{loadError}</Notice>}
    {!loaded && !loadError && <Spinner label="Loading footage" />}
    {loaded && timeline && <div className="studio-grid">
      <div className="studio-stage">
        {output ? <video className="studio-frame" controls playsInline src={output.url} /> : <canvas ref={canvas} className="studio-frame" width={FRAME.width} height={FRAME.height} aria-label="Preview of the finished frame" />}
        {!output && <input type="range" aria-label="Preview position" min={0} max={Math.max(0, timeline.duration - 1 / FRAME.fps)} step={1 / FRAME.fps} value={Math.min(time, timeline.duration)} disabled={locked} onChange={e => setTime(e.target.valueAsNumber)} />}
        <p className="muted">{output ? `Export ready · ${output.duration.toFixed(1)} s · ${(output.blob.size / 1024 / 1024).toFixed(1)} MB${output.hasAudio ? '' : ' · silent'}` : `${time.toFixed(1)} / ${timeline.duration.toFixed(1)} s · 1080 × 1920 · ${timeline.segments.length} shot${timeline.segments.length === 1 ? '' : 's'}`}</p>
      </div>
      <div className="studio-controls">
        <Field label="Hook" hint="On screen for the first seconds and on the cover frame. Eight words or fewer."><input value={hook} maxLength={80} disabled={locked} onChange={e => { setHook(e.target.value); setOutput(null); }} placeholder="The line that stops the scroll" /></Field>
        <Field label="Captions" hint='One per line as "start-end | text", in seconds on the finished video. Written for sound-off viewing.'><textarea rows={6} value={captionText} disabled={locked} onChange={e => { setCaptionText(e.target.value); setOutput(null); }} placeholder={'2.6-4.4 | First beat\n4.4-6.2 | Second beat'} /></Field>
        <Field label="Shots" hint={`One cut per line as "clip | start-end". Clips: ${loaded.map((clip, index) => `${index + 1} (${clip.duration.toFixed(1)} s)`).join(', ')}. Leave empty to play every clip in full.`}><textarea rows={4} value={shotText ?? ''} disabled={locked} onChange={e => { setShotText(e.target.value); setOutput(null); }} placeholder="1 | 0.4-3.2" /></Field>
        <Field label="End card" hint="One action, six words or fewer. Shown over the final seconds with your handle."><input value={cta} maxLength={60} disabled={locked} onChange={e => { setCta(e.target.value); setOutput(null); }} placeholder="Follow for part two" /></Field>
        <Field label="Voiceover script" hint={`Spoken by a synthetic voice. About 2.3 words per second fits: roughly ${Math.max(1, Math.floor(timeline.duration * 2.3))} words for this cut.`}><textarea className="studio-prose" rows={4} value={script} maxLength={1500} disabled={locked} onChange={e => { setScript(e.target.value); setOutput(null); }} placeholder="Say the hook first. End on the call to action." /></Field>
        {!voices && !voiceError && <Spinner label="Checking ElevenLabs connection" />}
        {voiceError && <Notice tone="alert" action={<Button disabled={locked} onClick={() => void loadVoices()}>Retry</Button>}>{voiceError}</Notice>}
        {voices && !voices.configured && <Notice>ElevenLabs is not connected yet. You can edit this video and add narration after the connection is set up.</Notice>}
        {voices?.configured && <div className="row">
          <select aria-label="Voice" value={voiceId} disabled={locked} onChange={e => setVoiceId(e.target.value)}><option value="">Select a voice</option>{voices.voices.map(item => <option key={item.id} value={item.id}>{item.name}{[item.gender, item.useCase.replace(/_/g, ' ')].filter(Boolean).length ? ` · ${[item.gender, item.useCase.replace(/_/g, ' ')].filter(Boolean).join(', ')}` : ''}{item.id === voices.defaultVoiceId ? ' · Recommended' : ''}</option>)}</select>
          <Button busy={voicing} disabled={locked || !script.trim() || !voiceId} onClick={() => void generateVoice()}>{voice ? 'Regenerate voiceover' : 'Generate voiceover'}</Button>
        </div>}
        {voices?.configured && <p className="muted">Generating a take sends this script to ElevenLabs and uses your ElevenLabs credits.</p>}
        {voices?.configured && !voices.defaultVoiceId && <Notice action={<Button disabled={locked} onClick={() => void loadVoices()}>Refresh voices</Button>}>No female default voice is available on this account. Add one in ElevenLabs, then refresh the voice list, or select a voice yourself.</Notice>}
        {voice && <Button variant="ghost" disabled={locked} onClick={() => { setVoice(null); setVoicedScript(''); setOutput(null); }}>Remove voiceover</Button>}
        {voice && <audio controls preload="none" src={`/api/materials/${encodeURIComponent(voice.materialId)}/preview`} style={{ width: '100%', marginTop: 10 }} />}
        {staleVoice && <Notice>The script changed after this voiceover was generated. Regenerate or remove the take before saving or exporting.</Notice>}
        {voice && longVoice && <Notice tone="alert">The voiceover needs {(voice.duration + VOICE_OFFSET).toFixed(1)} s but the footage is {timeline.duration.toFixed(1)} s. Shorten the script or lengthen the shots before exporting.</Notice>}
        {voice && voice.words.length > 0 && <div className="row"><Button disabled={locked} onClick={() => { setCaptionText(formatCaptions(captionsFromWords(voice.words))); setOutput(null); }}>Re-time captions to voiceover</Button></div>}
        <Field label="Music" hint="Audio files from Storage. Only use music you have the rights to publish."><select value={musicId} disabled={locked} onChange={e => { setMusicId(e.target.value); setOutput(null); }}><option value="">No music</option>{music.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        {parsed.error && <Notice tone="alert">{parsed.error}</Notice>}
        {!parsed.error && dropped > 0 && <Notice>{dropped} caption{dropped === 1 ? ' is' : 's are'} hidden because {dropped === 1 ? 'it overlaps' : 'they overlap'} the hook, the end card or another caption.</Notice>}
        {!parsed.error && !hook.trim() && <Notice>Add a hook. A video without an opening line reads as unedited.</Notice>}
        <div className="row">
          {busy ? <><Button variant="primary" busy>Exporting {Math.round((progress ?? 0) * 100)}%</Button><button type="button" className="btn btn-secondary" onClick={() => abort.current?.abort()}>Cancel</button></>
            : output ? <><Button variant="primary" busy={saving} onClick={() => void saveVideo()}>Save finished video</Button><Button disabled={locked} onClick={() => setOutput(null)}>Keep editing</Button></>
            : <><Button variant="primary" disabled={locked || staleVoice || longVoice || Boolean(unsupported) || Boolean(parsed.error) || !timeline.frames} onClick={() => void exportVideo()}>Export finished video</Button>{jobId && <Button busy={saving} disabled={locked || staleVoice || Boolean(parsed.error)} onClick={() => void savePlan()}>Save and finish automatically</Button>}</>}
        </div>
        {busy && <p className="muted">Keep this tab open and visible while the video exports.</p>}
      </div>
    </div>}
  </section>;
}
