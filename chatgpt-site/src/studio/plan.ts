// Pure edit-plan logic for the Studio: timeline assembly, text fitting and the
// compact text formats used by the editor. No DOM access, so it runs under node --test.

export interface Shot { runId: string; start: number; end: number }
export interface Caption { text: string; start: number; end: number }
export interface TimedCaption extends Caption { words?: Word[] }
export interface Word { text: string; start: number; end: number }
/** A generated narration take: the stored audio and when each word is spoken within it. */
export interface Voice { materialId: string; voiceId: string; duration: number; words: Word[] }
export interface EditPlan { hook: string; cta: string; shots: Shot[]; captions: Caption[]; musicMaterialId: string | null; voiceover: string; voice: Voice | null }
export interface ClipInfo { runId: string; duration: number }
/** One cut on the finished timeline: `in`/`out` are seconds in the source clip, `start`/`end` in the output. */
export interface Segment { runId: string; in: number; out: number; start: number; end: number; index: number }
export interface Timeline { segments: Segment[]; duration: number; frames: number; hookEnd: number; ctaStart: number; captions: TimedCaption[] }

export const FRAME = { width: 1080, height: 1920, fps: 30 } as const;
export const MAX_DURATION = 90;
const MIN_SHOT = 0.3;
const MIN_CAPTION = 0.5;

/** Narration starts just after the first frame so the cut-in is not clipped. */
export const VOICE_OFFSET = 0.15;

export const EMPTY_PLAN: EditPlan = { hook: '', cta: '', shots: [], captions: [], musicMaterialId: null, voiceover: '', voice: null };

const toFrames = (seconds: number) => Math.round(seconds * FRAME.fps);
const round = (value: number) => Math.round(value * 100) / 100;

/**
 * Resolves a plan against the clips that actually loaded. Shots are clamped to
 * their clip, snapped to whole frames and laid back to back; with no usable
 * shots every clip plays in full. Captions are kept clear of the hook and the
 * end card and never overlap.
 */
export function buildTimeline(plan: EditPlan, clips: ClipInfo[]): Timeline {
  const durations = new Map(clips.map(clip => [clip.runId, clip.duration]));
  const wanted = plan.shots.filter(shot => durations.has(shot.runId));
  const shots = wanted.length ? wanted : clips.map(clip => ({ runId: clip.runId, start: 0, end: clip.duration }));
  const segments: Segment[] = [];
  let cursor = 0;
  for (const shot of shots) {
    const length = durations.get(shot.runId)!;
    const from = Math.min(Math.max(0, shot.start), length);
    const frames = Math.min(toFrames(Math.min(shot.end, length) - from), MAX_DURATION * FRAME.fps - cursor);
    if (frames < toFrames(MIN_SHOT)) continue;
    segments.push({ runId: shot.runId, in: from, out: from + frames / FRAME.fps, start: cursor / FRAME.fps, end: (cursor + frames) / FRAME.fps, index: segments.length });
    cursor += frames;
  }
  const duration = cursor / FRAME.fps;
  const hookEnd = plan.hook.trim() ? Math.min(2.6, duration * 0.45) : 0;
  const ctaStart = plan.cta.trim() ? duration - Math.min(2.4, duration * 0.3) : duration;
  const captions: TimedCaption[] = [];
  const spoken = plan.voice?.words.map(word => ({ ...word, start: word.start + VOICE_OFFSET, end: word.end + VOICE_OFFSET }));
  const textKey = (text: string) => text.trim().replace(/[.,;:]+$/, '').replace(/\s+/g, ' ');
  for (const caption of [...plan.captions].sort((a, b) => a.start - b.start)) {
    // Spoken captions stay visible under the opening title and end card, so no
    // narration is lost for sound-off viewers. These occupy separate safe areas.
    const start = Math.max(caption.start, plan.voice ? 0 : hookEnd, captions.at(-1)?.end ?? 0);
    const end = Math.min(caption.end, plan.voice ? duration : ctaStart);
    if (!caption.text.trim() || end - start < (plan.voice ? 1 / FRAME.fps : MIN_CAPTION)) continue;
    const words = spoken?.filter(word => word.start >= caption.start - 0.015 && word.start < caption.end - 0.015);
    const timed = words?.length && textKey(words.map(word => word.text).join(' ')) === textKey(caption.text);
    captions.push({ text: caption.text.trim(), start, end, ...(timed ? { words } : {}) });
  }
  return { segments, duration, frames: cursor, hookEnd, ctaStart, captions };
}

export function segmentAt(timeline: Timeline, time: number): Segment | null {
  return timeline.segments.find(segment => time < segment.end) ?? timeline.segments.at(-1) ?? null;
}

/** Extend trims into unused footage to fit the actual narration, without new paid shots or looping footage. */
export function fitNarration(plan: EditPlan, clips: ClipInfo[], spokenDuration: number): EditPlan {
  const timeline = buildTimeline(plan, clips);
  const target = Math.ceil((spokenDuration + VOICE_OFFSET + 0.1) * FRAME.fps);
  let missing = target - timeline.frames;
  if (missing <= 0) return plan;
  if (target > MAX_DURATION * FRAME.fps) throw new Error('The narration exceeds the maximum video length. Shorten the script.');
  const shots = timeline.segments.map(segment => ({ runId: segment.runId, start: segment.in, end: segment.out }));
  // Keep the pace within five seconds per shot while using available handles.
  for (const shot of shots) {
    const available = Math.max(0, Math.floor((Math.min(clips.find(clip => clip.runId === shot.runId)!.duration, shot.start + 5) - shot.end) * FRAME.fps));
    const extra = Math.min(missing, available);
    shot.end += extra / FRAME.fps;
    missing -= extra;
    if (missing <= 0) return { ...plan, shots };
  }
  throw new Error(`The narration needs ${(target / FRAME.fps).toFixed(1)} seconds, but the footage cannot fit it. Shorten the script and save the edit plan again.`);
}

/**
 * Turns spoken-word timings into caption beats that follow the voice: short
 * phrases that break at punctuation or a pause, each held until the next begins.
 */
export function captionsFromWords(words: Word[], offset = VOICE_OFFSET): Caption[] {
  const groups: Word[][] = [];
  let current: Word[] = [];
  for (const word of words) {
    const previous = current.at(-1);
    const length = current.reduce((sum, item) => sum + item.text.length + 1, 0);
    if (previous && (current.length >= 4 || length + word.text.length > 24 || /[.!?,;:]$/.test(previous.text) || word.start - previous.end > 0.35)) { groups.push(current); current = []; }
    current.push(word);
  }
  if (current.length) groups.push(current);
  return groups.map((group, index) => {
    const next = groups[index + 1]?.[0];
    const spoken = group.at(-1)!.end;
    const end = next && next.start - spoken < 0.5 ? next.start : spoken + 0.2;
    // A minimum hold may not cover the following phrase: its actual timing wins.
    const held = Math.max(end, group[0]!.start + 0.3);
    return { text: group.map(word => word.text).join(' ').replace(/[.,;:]+$/, ''), start: round(group[0]!.start + offset), end: round(Math.min(held, next?.start ?? held) + offset) };
  }).filter(caption => caption.text);
}

export type Measure = (text: string) => number;

function greedy(words: string[], measure: Measure, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const word of words) {
    const candidate = lines.length ? `${lines.at(-1)} ${word}` : word;
    if (lines.length && measure(candidate) <= maxWidth) lines[lines.length - 1] = candidate;
    else lines.push(word);
  }
  return lines;
}

/** Wraps to the fewest lines that fit, then narrows the block so lines are even instead of leaving an orphan word. */
export function balancedLines(text: string, measure: Measure, maxWidth: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const target = greedy(words, measure, maxWidth).length;
  let low = Math.max(...words.map(measure)), high = maxWidth;
  for (let step = 0; step < 12 && high - low > 4; step++) {
    const middle = (low + high) / 2;
    if (greedy(words, measure, middle).length <= target) high = middle; else low = middle;
  }
  return greedy(words, measure, high);
}

/** Picks the largest size whose balanced wrap fits the line limit and width; falls back to the smallest. */
export function fitText(text: string, measureAt: (size: number) => Measure, maxWidth: number, maxLines: number, sizes: number[]): { size: number; lines: string[] } {
  let last = { size: sizes.at(-1)!, lines: [] as string[] };
  for (const size of sizes) {
    const measure = measureAt(size);
    const lines = balancedLines(text, measure, maxWidth);
    last = { size, lines };
    if (lines.length <= maxLines && lines.every(line => measure(line) <= maxWidth)) return last;
  }
  return last;
}

export const easeOut = (x: number) => 1 - (1 - Math.min(1, Math.max(0, x))) ** 3;

// Editor text formats. Captions: "2.5-4.5 | Text". Shots: "1 | 0.4-3.2" where 1 is the clip number.

export const formatCaptions = (captions: Caption[]) => captions.map(c => `${round(c.start)}-${round(c.end)} | ${c.text}`).join('\n');
export const formatShots = (shots: Shot[], clips: ClipInfo[]) => shots
  .map(shot => ({ shot, number: clips.findIndex(clip => clip.runId === shot.runId) + 1 }))
  .filter(item => item.number > 0)
  .map(({ shot, number }) => `${number} | ${round(shot.start)}-${round(shot.end)}`).join('\n');

const RANGE = /^\s*(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*$/;
const rows = (text: string) => text.split('\n').map((line, index) => ({ line: line.trim(), number: index + 1 })).filter(row => row.line);

export function parseCaptions(text: string): { captions: Caption[]; error: string | null } {
  const captions: Caption[] = [];
  for (const { line, number } of rows(text)) {
    const at = line.indexOf('|');
    const range = at < 0 ? null : RANGE.exec(line.slice(0, at));
    const body = at < 0 ? '' : line.slice(at + 1).trim();
    if (!range || !body) return { captions, error: `Caption line ${number}: use "start-end | text", for example "2.5-4.5 | Your line".` };
    const start = Number(range[1]), end = Number(range[2]);
    if (end <= start) return { captions, error: `Caption line ${number}: the end must be after the start.` };
    if (body.length > 90) return { captions, error: `Caption line ${number}: keep it under 90 characters.` };
    captions.push({ text: body, start, end });
  }
  if (captions.length > 500) return { captions, error: 'Use at most 500 captions.' };
  return { captions, error: null };
}

export function parseShots(text: string, clips: ClipInfo[]): { shots: Shot[]; error: string | null } {
  const shots: Shot[] = [];
  for (const { line, number } of rows(text)) {
    const [clipText = '', rangeText = ''] = line.split('|');
    const clip = clips[Number(clipText.trim()) - 1];
    const range = RANGE.exec(rangeText);
    if (!/^\s*\d+\s*$/.test(clipText) || !clip) return { shots, error: `Shot line ${number}: start with a clip number from 1 to ${clips.length}.` };
    if (!range) return { shots, error: `Shot line ${number}: use "clip | start-end", for example "1 | 0.4-3.2".` };
    const start = Number(range[1]), end = Number(range[2]);
    if (end - start < MIN_SHOT) return { shots, error: `Shot line ${number}: a shot must last at least ${MIN_SHOT} seconds.` };
    if (start >= clip.duration) return { shots, error: `Shot line ${number}: clip ${clipText.trim()} is only ${round(clip.duration)} seconds long.` };
    shots.push({ runId: clip.runId, start, end });
  }
  if (shots.length > 16) return { shots, error: 'Use at most 16 shots.' };
  return { shots, error: null };
}
