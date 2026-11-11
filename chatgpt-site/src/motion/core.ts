// Motion library core: the shared contract for code-animated Reels.
// Every scene is a pure function of time drawn on a 1080x1920 canvas, so the
// preview, a single still and the exported video are always identical.
// No DOM access here: this file must import cleanly under node --test.

export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export const W = 1080;
export const H = 1920;
export const FPS = 30;
/** Text-safe region of a Reel: clear of the platform header, caption block and right action rail. */
export const SAFE = { x: 96, y: 240, w: 888, h: 1260, right: 984, bottom: 1500, cx: 540, cy: 870 } as const;
/** Spoken/on-screen captions sit here, below the scene content. Scenes keep their own content above y = 1240. */
export const CAPTION_Y = 1380;
export const CONTENT_BOTTOM = 1240;
/** Base spacing unit. Positions and sizes should be multiples of it so everything sits on one grid. */
export const U = 12;

// ---------------------------------------------------------------- theme

export const ACCENTS = {
  red: '#FF2B2B',
  lime: '#B8FF1A',
  orange: '#FF5A00',
  blue: '#2F6BFF',
  magenta: '#FF1F8E',
  yellow: '#FFE600',
} as const;
export type AccentName = keyof typeof ACCENTS;
export type Mode = 'dark' | 'light';

/**
 * The whole palette. Rule: everything is black, white or grey; `accent` is
 * reserved for the ONE thing the viewer must look at in the current beat.
 */
export interface Theme {
  mode: Mode;
  bg: string;        // canvas
  fg: string;        // primary text and strokes
  panel: string;     // window / card fill
  panelAlt: string;  // raised or nested fill
  line: string;      // hairlines, grid, inactive strokes
  muted: string;     // inactive text, comments, secondary labels
  dim: string;       // secondary text that must still read clearly
  accent: string;    // the important thing
  onAccent: string;  // text placed on an accent fill
}

export function makeTheme(mode: Mode = 'dark', accent: AccentName = 'red'): Theme {
  const a = ACCENTS[accent] ?? ACCENTS.red;
  const dark = ['lime', 'yellow'].includes(accent) ? '#000000' : '#FFFFFF';
  return mode === 'dark'
    ? { mode, bg: '#000000', fg: '#FFFFFF', panel: '#0D0D0D', panelAlt: '#1A1A1A', line: '#2A2A2A', muted: '#6E6E6E', dim: '#B5B5B5', accent: a, onAccent: dark }
    : { mode, bg: '#FFFFFF', fg: '#000000', panel: '#F2F2F2', panelAlt: '#E4E4E4', line: '#CFCFCF', muted: '#8A8A8A', dim: '#4A4A4A', accent: a, onAccent: dark };
}

export const FONT = {
  /** Captions and body copy: bold, clean sans. Never the pixel face. */
  body: "'Inter', 'Manrope', 'Helvetica Neue', Helvetica, Arial, sans-serif",
  mono: "'JetBrains Mono', 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
} as const;
export const font = (size: number, weight = 800, family: keyof typeof FONT = 'body') => `${weight} ${size}px ${FONT[family]}`;

// ---------------------------------------------------------------- math and timing

export const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
export const lerp = (a: number, b: number, x: number) => a + (b - a) * x;
/** Progress 0..1 of an animation that starts at `start` and lasts `dur` seconds. */
export const prog = (t: number, start: number, dur: number) => (dur <= 0 ? (t >= start ? 1 : 0) : clamp((t - start) / dur));
/** Snap to the pixel grid: crisp edges on every frame. */
export const snap = (x: number, grid = 1) => Math.round(x / grid) * grid;

/** Easing. Default to `outExpo` for entrances (fast, decisive) and `outBack` for things that should hit. */
export const ease = {
  linear: (x: number) => clamp(x),
  outCubic: (x: number) => 1 - (1 - clamp(x)) ** 3,
  outQuint: (x: number) => 1 - (1 - clamp(x)) ** 5,
  outExpo: (x: number) => (clamp(x) >= 1 ? 1 : 1 - 2 ** (-10 * clamp(x))),
  inCubic: (x: number) => clamp(x) ** 3,
  inExpo: (x: number) => (clamp(x) <= 0 ? 0 : 2 ** (10 * clamp(x) - 10)),
  inOutCubic: (x: number) => { const c = clamp(x); return c < 0.5 ? 4 * c ** 3 : 1 - (-2 * c + 2) ** 3 / 2; },
  /** Overshoots by about 10% then settles. */
  outBack: (x: number) => { const c = clamp(x) - 1, s = 1.70158; return 1 + (s + 1) * c ** 3 + s * c ** 2; },
  /** Damped spring: overshoot and one visible bounce. */
  spring: (x: number) => { const c = clamp(x); return c >= 1 ? 1 : 1 - Math.exp(-7 * c) * Math.cos(11 * c); },
  /** Quantised progress for retro, stepped motion. */
  steps: (x: number, n = 6) => Math.floor(clamp(x) * n + 1e-6) / n,
};

/** Deterministic PRNG. Never use Math.random or Date in a scene: frames must be reproducible. */
export function rng(seed: number) {
  let a = (seed | 0) + 0x6d2b79f5;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Stable 0..1 hash of a pair of integers: per-cell randomness without allocating a generator. */
export const hash = (a: number, b = 0) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

// ---------------------------------------------------------------- inline markup

export interface Span { text: string; accent: boolean }
/** `*word*` marks the accent. Everything else stays neutral. */
export function parseMarkup(text: string): Span[] {
  const spans: Span[] = [];
  for (const part of String(text ?? '').split(/(\*[^*]+\*)/)) {
    if (!part) continue;
    const accent = part.length > 2 && part.startsWith('*') && part.endsWith('*');
    spans.push({ text: accent ? part.slice(1, -1) : part, accent });
  }
  return spans;
}
export const stripMarkup = (text: string) => parseMarkup(text).map(span => span.text).join('');
/** Words with their accent flag, for word-by-word layout. */
export function markupWords(text: string): Span[] {
  return parseMarkup(text).flatMap(span => span.text.split(/\s+/).filter(Boolean).map(word => ({ text: word, accent: span.accent })));
}

// ---------------------------------------------------------------- scene contract

/** Everything a scene needs to draw one frame. `t` is seconds since the scene started. */
export interface Frame {
  ctx: Ctx;
  t: number;
  dur: number;
  theme: Theme;
  /** Stable per-scene seed for deterministic variation. */
  seed: number;
  /** Position of the scene in the reel. */
  index: number;
}

export interface SceneDef<P> {
  type: string;
  /** Draws the scene content only. The player draws background, camera, transition, captions and chrome. */
  render(frame: Frame, props: P): void;
}

// ---------------------------------------------------------------- reel spec (what an agent writes)

export const ICONS = ['cursor', 'chip', 'brain', 'bolt', 'bug', 'check', 'cross', 'file', 'folder', 'gear', 'lock', 'key', 'cloud', 'database', 'server', 'globe', 'user', 'robot', 'eye', 'clock', 'search', 'star', 'heart', 'warning', 'terminal', 'code', 'image', 'play', 'arrow', 'token', 'money', 'rocket', 'skull', 'fire', 'phone'] as const;
export type IconName = (typeof ICONS)[number];

export const TRANSITIONS = ['cut', 'blocks', 'wipe', 'glitch', 'zoom', 'flash', 'shutter'] as const;
export type TransitionName = (typeof TRANSITIONS)[number];

export interface SceneBase {
  /** Seconds on screen. Most scenes should last 1.5 to 4 seconds. */
  duration: number;
  /** How this scene ENTERS. Default 'cut'. */
  transition?: TransitionName;
  /** Seconds within the scene at which something lands: the player adds a camera punch and shake. */
  hits?: number[];
  /** Caption shown under this scene (bold sans, `*accent*` markup). An array is split evenly across the scene. */
  caption?: string | string[];
  /**
   * Narration for this scene (`*accent*` markup allowed). When the reel is rendered with audio, the scene is
   * stretched to fit the spoken line and the captions follow the voice word by word, replacing `caption`.
   */
  say?: string;
}

/** Pixel title card. `text` is uppercase pixel type; mark the one key word with *asterisks*. */
export interface TitleProps { text: string; kicker?: string; sub?: string; icon?: IconName }
/** Editor window. Code types itself; `highlight` lines flash in the accent once typed. */
export interface CodeProps { code: string; filename?: string; typing?: boolean; highlight?: number[]; note?: string }
/** Before/after change in an editor window: removed lines strike out, added lines slam in with the accent. */
export interface DiffProps { filename?: string; removed: string[]; added: string[]; context?: string[] }
/** Terminal session: each command types, its output streams. */
export interface TerminalProps { title?: string; lines: { cmd?: string; out?: string; status?: 'ok' | 'fail' | 'info' }[] }
/** Pipeline of 2 to 5 boxes with a packet travelling through them. The accent node is where the story is. */
export interface FlowProps { nodes: { label: string; icon?: IconName; accent?: boolean; note?: string }[]; direction?: 'down' | 'right'; packet?: string; loop?: boolean }
/** One huge number counting up. */
export interface StatProps { value: number; label: string; from?: number; prefix?: string; suffix?: string; decimals?: number; versus?: { value: number; label: string } }
/** Horizontal bar race, 2 to 6 bars. One bar carries the accent. */
export interface BarsProps { title?: string; unit?: string; items: { label: string; value: number; accent?: boolean }[] }
/** Two things side by side; the winner takes the accent. */
export interface CompareProps { left: { label: string; points: string[] }; right: { label: string; points: string[] }; winner?: 'left' | 'right'; title?: string }
/** Rapid stack of 2 to 5 short lines. */
export interface ListProps { title?: string; items: string[]; style?: 'check' | 'cross' | 'number' | 'arrow' }
/** A sentence splitting into token chips; `predict` then shows candidate next tokens with probabilities. */
export interface TokensProps { text: string; predict?: { token: string; p: number }[]; title?: string }
/** Chat interface: user prompt types, the AI reply streams. */
export interface ChatProps { messages: { role: 'user' | 'ai'; text: string }[]; model?: string }
/** Exploded cutaway: stacked labelled layers separating to reveal what is inside. One layer is the accent. */
export interface LayersProps { title?: string; layers: { label: string; note?: string; accent?: boolean }[] }
/** Matrix of cells (attention map, memory, pixels). `pattern` drives the animation; `highlight` cells take the accent. */
export interface GridProps { title?: string; rows: number; cols: number; pattern?: 'scan' | 'attention' | 'noise' | 'fill'; highlight?: [number, number][]; rowLabels?: string[]; colLabels?: string[] }
/** Kinetic type: one word or short phrase per beat, full screen, pixel type. */
export interface KineticProps { words: string[] }
/** Release notes card: version header and tagged changes landing one by one. */
export interface ChangelogProps { version: string; product?: string; items: { tag: 'NEW' | 'FIX' | 'CHG' | 'DEL'; text: string; accent?: boolean }[] }
/** Closing card: one action, the wordmark and the handle. */
export interface OutroProps { cta: string; handle?: string; sub?: string }

export interface SceneProps {
  title: TitleProps; code: CodeProps; diff: DiffProps; terminal: TerminalProps; flow: FlowProps; stat: StatProps;
  bars: BarsProps; compare: CompareProps; list: ListProps; tokens: TokensProps; chat: ChatProps; layers: LayersProps;
  grid: GridProps; kinetic: KineticProps; changelog: ChangelogProps; outro: OutroProps;
}
export type SceneType = keyof SceneProps;
export const SCENE_TYPES = ['title', 'code', 'diff', 'terminal', 'flow', 'stat', 'bars', 'compare', 'list', 'tokens', 'chat', 'layers', 'grid', 'kinetic', 'changelog', 'outro'] as const satisfies readonly SceneType[];
export type SceneSpec = { [K in SceneType]: { type: K } & SceneBase & SceneProps[K] }[SceneType];

/** A caption timed on the finished timeline (used when narration exists). Overrides per-scene captions. */
export interface CaptionSpec { text: string; start: number; end: number }

export interface ReelSpec {
  version: 1;
  /** Working title; not drawn. */
  title?: string;
  mode?: Mode;
  accent?: AccentName;
  /** Series name, for example "UNDER THE HOOD". Not drawn by the chrome; use it as the title's kicker. */
  series?: string;
  scenes: SceneSpec[];
  captions?: CaptionSpec[];
}

export interface PlacedScene { spec: SceneSpec; start: number; end: number; index: number }
export function placeScenes(spec: ReelSpec): PlacedScene[] {
  let cursor = 0;
  return spec.scenes.map((scene, index) => {
    const frames = Math.max(1, Math.round(scene.duration * FPS));
    const placed = { spec: scene, start: cursor / FPS, end: (cursor + frames) / FPS, index };
    cursor += frames;
    return placed;
  });
}
export const reelDuration = (spec: ReelSpec) => placeScenes(spec).at(-1)?.end ?? 0;
export const reelFrames = (spec: ReelSpec) => Math.round(reelDuration(spec) * FPS);
