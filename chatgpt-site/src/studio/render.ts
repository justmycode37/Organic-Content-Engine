// Exports the finished video in the browser: frame-accurate canvas compositing,
// H.264 + AAC through WebCodecs, muxed to a fast-start MP4. No server transcoding exists.
import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import { FONT_FAMILY, drawFrame, type FrameSource } from './draw.ts';
import { FRAME, VOICE_OFFSET, buildTimeline, type ClipInfo, type EditPlan, type Segment, type Timeline } from './plan.ts';

export interface LoadedClip extends ClipInfo { video: HTMLVideoElement; bytes: ArrayBuffer; url: string }
export interface RenderResult { blob: Blob; duration: number; hasAudio: boolean }

const SAMPLE_RATE = 48000;
const MAX_BYTES = 92 * 1024 * 1024; // Storage accepts 100 MB; leave room for the container.
const VIDEO_CODECS = ['avc1.640028', 'avc1.4d0028', 'avc1.42e028'];

export class RenderError extends Error {}

export function renderSupport(): string | null {
  if (typeof VideoEncoder === 'undefined' || typeof AudioEncoder === 'undefined' || typeof VideoFrame === 'undefined' || typeof AudioData === 'undefined' || typeof OfflineAudioContext === 'undefined')
    return 'This browser cannot export video. Use a current version of Chrome, Edge or Safari.';
  return null;
}

function once(target: EventTarget, type: string, failure: string, ms = 15000) {
  return new Promise<void>((resolve, reject) => {
    const done = (error?: Error) => { clearTimeout(timer); target.removeEventListener(type, ok); target.removeEventListener('error', bad); error ? reject(error) : resolve(); };
    const ok = () => done(), bad = () => done(new RenderError(failure));
    const timer = setTimeout(bad, ms);
    target.addEventListener(type, ok, { once: true }); target.addEventListener('error', bad, { once: true });
  });
}

/** Downloads a clip fully so seeking is exact and its audio can be decoded. */
export async function loadClip(runId: string, src: string, label: string): Promise<LoadedClip> {
  const response = await fetch(src, { credentials: 'same-origin' });
  if (!response.ok) throw new RenderError(`${label} could not be loaded (${response.status}).`);
  const bytes = await response.arrayBuffer();
  const url = URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' }));
  const video = document.createElement('video');
  video.muted = true; video.playsInline = true; video.preload = 'auto'; video.src = url;
  try { await once(video, 'loadeddata', `${label} is not a video this browser can decode.`); }
  catch (error) { URL.revokeObjectURL(url); throw error; }
  if (!Number.isFinite(video.duration) || !video.videoWidth) { URL.revokeObjectURL(url); throw new RenderError(`${label} has no readable video track.`); }
  return { runId, duration: video.duration, video, bytes, url };
}

export function releaseClips(clips: LoadedClip[]) {
  for (const clip of clips) { clip.video.removeAttribute('src'); clip.video.load(); URL.revokeObjectURL(clip.url); }
}

export async function seekTo(video: HTMLVideoElement, time: number) {
  const target = Math.min(Math.max(0, time), Math.max(0, video.duration - 0.02));
  if (Math.abs(video.currentTime - target) < 0.0005 && video.readyState >= 2 && !video.seeking) return;
  const seeked = once(video, 'seeked', 'A clip stopped responding while seeking.');
  video.currentTime = target;
  await seeked;
}

export const sourceFor = (clips: LoadedClip[]) => (segment: Segment): FrameSource | null => {
  const clip = clips.find(item => item.runId === segment.runId);
  return clip ? { image: clip.video, width: clip.video.videoWidth, height: clip.video.videoHeight } : null;
};

/** Seeks the footage for `time` and draws the finished frame. Shared by the preview and the export. */
export async function paintFrame(ctx: CanvasRenderingContext2D, time: number, timeline: Timeline, plan: EditPlan, handle: string, clips: LoadedClip[]) {
  const segment = timeline.segments.find(item => time < item.end) ?? timeline.segments.at(-1);
  const clip = segment && clips.find(item => item.runId === segment.runId);
  if (segment && clip) await seekTo(clip.video, segment.in + (time - segment.start));
  drawFrame(ctx, time, timeline, plan, handle, sourceFor(clips));
}

export async function loadFonts() {
  try { await Promise.all([document.fonts.load(`800 96px ${FONT_FAMILY}`), document.fonts.load(`600 44px ${FONT_FAMILY}`)]); } catch { /* falls back to the system face */ }
}

async function decodeAudio(bytes: ArrayBuffer): Promise<AudioBuffer | null> {
  const context = new OfflineAudioContext(2, 1, SAMPLE_RATE);
  try { return await context.decodeAudioData(bytes.slice(0)); } catch { return null; } // No audio track.
}

/** Mixes narration over clip sound and an optional music bed, then levels the result. */
export async function mixAudio(timeline: Timeline, clips: LoadedClip[], music: ArrayBuffer | null, voice: ArrayBuffer | null): Promise<AudioBuffer | null> {
  const context = new OfflineAudioContext(2, Math.ceil(timeline.duration * SAMPLE_RATE), SAMPLE_RATE);
  const decoded = new Map<string, AudioBuffer | null>();
  for (const clip of clips) decoded.set(clip.runId, await decodeAudio(clip.bytes));
  const narration = voice ? await decodeAudio(voice) : null;
  if (voice && !narration) throw new RenderError('The voiceover could not be decoded. Generate it again.');
  if (narration && narration.duration + VOICE_OFFSET > timeline.duration + 1 / FRAME.fps)
    throw new RenderError(`The voiceover needs ${(narration.duration + VOICE_OFFSET).toFixed(1)} seconds, but the cut is ${timeline.duration.toFixed(1)} seconds. Shorten the script or lengthen the shots before exporting.`);
  // Under narration everything else drops back so the voice stays intelligible.
  const clipLevel = narration ? 0.12 : 1;
  let voiced = false;
  for (const segment of timeline.segments) {
    const buffer = decoded.get(segment.runId);
    if (!buffer || segment.in >= buffer.duration) continue;
    voiced = true;
    const node = context.createBufferSource(), gain = context.createGain(), fade = 0.02;
    node.buffer = buffer;
    gain.gain.setValueAtTime(0, segment.start);
    gain.gain.linearRampToValueAtTime(clipLevel, segment.start + fade);
    gain.gain.setValueAtTime(clipLevel, Math.max(segment.start + fade, segment.end - fade));
    gain.gain.linearRampToValueAtTime(0, segment.end);
    node.connect(gain).connect(context.destination);
    node.start(segment.start, segment.in, segment.end - segment.start);
  }
  const bed = music ? await decodeAudio(music) : null;
  if (music && !bed) throw new RenderError('The selected music file could not be decoded. Use MP3, M4A or WAV.');
  if (bed) {
    const node = context.createBufferSource(), gain = context.createGain(), level = narration ? 0.14 : voiced ? 0.2 : 0.8;
    node.buffer = bed; node.loop = true;
    gain.gain.setValueAtTime(0, 0);
    gain.gain.linearRampToValueAtTime(level, Math.min(0.4, timeline.duration / 4));
    gain.gain.setValueAtTime(level, Math.max(0.4, timeline.duration - 1));
    gain.gain.linearRampToValueAtTime(0, timeline.duration);
    node.connect(gain).connect(context.destination);
    node.start(0);
  }
  if (narration) {
    const node = context.createBufferSource(), gain = context.createGain();
    node.buffer = narration;
    // Only the last few samples fade, avoiding a click without fading spoken words.
    const end = Math.min(timeline.duration, VOICE_OFFSET + narration.duration);
    gain.gain.setValueAtTime(1, Math.max(VOICE_OFFSET, end - 0.02));
    gain.gain.linearRampToValueAtTime(0, end);
    node.connect(gain).connect(context.destination);
    node.start(VOICE_OFFSET);
  }
  if (!voiced && !bed && !narration) return null;
  const mix = await context.startRendering();
  let peak = 0, energy = 0;
  for (let channel = 0; channel < mix.numberOfChannels; channel++) for (const sample of mix.getChannelData(channel)) { peak = Math.max(peak, Math.abs(sample)); energy += sample * sample; }
  if (peak < 1e-4) return null;
  // Level to about -18 dBFS RMS with a -1 dBFS ceiling, so every export plays at a consistent loudness.
  const rms = Math.sqrt(energy / (mix.length * mix.numberOfChannels));
  const boost = Math.min(0.126 / rms, 0.89 / peak, 8);
  for (let channel = 0; channel < mix.numberOfChannels; channel++) { const data = mix.getChannelData(channel); for (let i = 0; i < data.length; i++) data[i]! *= boost; }
  return mix;
}

async function videoConfig(bitrate: number): Promise<VideoEncoderConfig> {
  for (const codec of VIDEO_CODECS) {
    const config: VideoEncoderConfig = { codec, width: FRAME.width, height: FRAME.height, bitrate, framerate: FRAME.fps, latencyMode: 'quality', avc: { format: 'avc' } };
    if ((await VideoEncoder.isConfigSupported(config)).supported) return config;
  }
  throw new RenderError('This browser cannot encode H.264 at 1080x1920. Use a current version of Chrome, Edge or Safari.');
}

export interface RenderInput {
  plan: EditPlan;
  clips: LoadedClip[];
  music: ArrayBuffer | null;
  /** Narration audio for `plan.voice`, when one has been generated. */
  voice: ArrayBuffer | null;
  handle: string;
  onProgress: (fraction: number) => void;
  signal?: AbortSignal;
}

export async function renderVideo({ plan, clips, music, voice, handle, onProgress, signal }: RenderInput): Promise<RenderResult> {
  const unsupported = renderSupport();
  if (unsupported) throw new RenderError(unsupported);
  const timeline = buildTimeline(plan, clips);
  if (!timeline.frames) throw new RenderError('There is no footage on the timeline. Check the shot list.');
  await loadFonts();

  const audioConfig: AudioEncoderConfig = { codec: 'mp4a.40.2', sampleRate: SAMPLE_RATE, numberOfChannels: 2, bitrate: 160000 };
  if (!(await AudioEncoder.isConfigSupported(audioConfig)).supported) throw new RenderError('This browser cannot encode AAC audio. Use a current version of Chrome, Edge or Safari.');
  const bitrate = Math.floor(Math.min(10_000_000, (MAX_BYTES * 8) / timeline.duration - audioConfig.bitrate!));
  const config = await videoConfig(bitrate);
  // Validate and decode every selected audio track before the expensive frame render.
  if (Boolean(plan.voice) !== Boolean(voice)) throw new RenderError('The voiceover audio is missing. Generate it again or remove it before exporting.');
  const mix = await mixAudio(timeline, clips, music, voice);
  if (signal?.aborted) throw new RenderError('Export cancelled.');

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width: FRAME.width, height: FRAME.height, frameRate: FRAME.fps },
    audio: { codec: 'aac', numberOfChannels: 2, sampleRate: SAMPLE_RATE },
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });
  let failure: Error | null = null;
  const fail = (error: Error) => { failure ??= error; };
  const videoEncoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: fail });
  const audioEncoder = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: fail });
  videoEncoder.configure(config);
  audioEncoder.configure(audioConfig);

  try {
    const canvas = document.createElement('canvas');
    canvas.width = FRAME.width; canvas.height = FRAME.height;
    const ctx = canvas.getContext('2d', { alpha: false })!;
    const frameMicros = 1_000_000 / FRAME.fps;
    for (let index = 0; index < timeline.frames; index++) {
      if (signal?.aborted) throw new RenderError('Export cancelled.');
      if (failure) throw failure;
      await paintFrame(ctx, index / FRAME.fps, timeline, plan, handle, clips);
      const frame = new VideoFrame(canvas, { timestamp: Math.round(index * frameMicros), duration: Math.round(frameMicros) });
      videoEncoder.encode(frame, { keyFrame: index % (FRAME.fps * 2) === 0 });
      frame.close();
      while (videoEncoder.encodeQueueSize > 6) await new Promise(resolve => setTimeout(resolve, 4));
      if (index % 5 === 0) { onProgress(0.92 * (index / timeline.frames)); await new Promise(resolve => setTimeout(resolve, 0)); }
    }
    await videoEncoder.flush();

    // A silent track is still written: some platforms reject video-only files.
    const total = Math.ceil(timeline.duration * SAMPLE_RATE);
    for (let offset = 0; offset < total; offset += SAMPLE_RATE) {
      if (signal?.aborted) throw new RenderError('Export cancelled.');
      const frames = Math.min(SAMPLE_RATE, total - offset);
      const data = new Float32Array(frames * 2);
      if (mix) for (let channel = 0; channel < 2; channel++) data.set(mix.getChannelData(Math.min(channel, mix.numberOfChannels - 1)).subarray(offset, offset + frames), channel * frames);
      const chunk = new AudioData({ format: 'f32-planar', sampleRate: SAMPLE_RATE, numberOfFrames: frames, numberOfChannels: 2, timestamp: Math.round((offset / SAMPLE_RATE) * 1_000_000), data });
      audioEncoder.encode(chunk);
      chunk.close();
    }
    await audioEncoder.flush();
    if (failure) throw failure;
    muxer.finalize();
    onProgress(1);
    return { blob: new Blob([muxer.target.buffer], { type: 'video/mp4' }), duration: timeline.duration, hasAudio: Boolean(mix) };
  } finally {
    if (videoEncoder.state !== 'closed') videoEncoder.close();
    if (audioEncoder.state !== 'closed') audioEncoder.close();
  }
}
