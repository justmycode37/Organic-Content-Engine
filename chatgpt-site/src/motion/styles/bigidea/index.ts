import { z } from 'zod';
import { H, SAFE, W, clamp, ease, makeTheme, type Frame } from '../../core.ts';
import { drawTransition } from '../../fx/transitions.ts';
import { place } from '../../fx/objects.ts';
import type { StyleDef } from '../style.ts';
import { HERO, change, clean, headline, label, motif, numeral, stage, type } from './layout.ts';
import { scenes } from './scenes.ts';

const short = (maximum: number) => z.string().trim().min(1).max(maximum);
const shape = z.enum(['circle', 'square', 'arrow', 'lock', 'dot']);
const accentWord = short(24).regex(/^\S+$/, 'Use one accented word');
const cover = z.object({ headline: short(72), kicker: short(64).optional(), deck: short(120).optional(), emphasis: accentWord.optional(), fullBleed: z.boolean().optional() }).strict().refine(data => !data.emphasis || data.headline.includes(data.emphasis), { message: 'emphasis must occur in headline', path: ['emphasis'] });
const number = z.object({ value: short(18).regex(/^[^\n\r]+$/), meaning: short(90), note: short(100).optional() }).strict();
const state = z.object({ value: short(18).regex(/^[^\n\r]+$/), label: short(40), note: short(70).optional() }).strict();
const contrast = z.object({ before: state, after: state, takeaway: short(100).optional() }).strict();
const quote = z.object({ text: short(240), attribution: short(100), context: short(120).optional() }).strict();
const object = z.object({ motif: shape, line: short(90), kicker: short(64).optional(), asset: short(40).optional(), fullBleed: z.boolean().optional() }).strict();
const statement = z.object({ text: short(160), emphasis: accentWord.optional(), kicker: short(64).optional() }).strict().refine(data => !data.emphasis || data.text.includes(data.emphasis), { message: 'emphasis must occur in text', path: ['emphasis'] });

function readData<Data>(frame: Frame, schema: z.ZodType<Data>, input: unknown): Data | undefined {
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data;
  headline(frame, 'One idea.', 'INCOMPLETE COVER', 'Check this scene’s data against its style schema.');
  return undefined;
}

// Beat one: the prior state is struck through. Beat two: the current state replaces it oversized in the accent.
// The resolve event adds the current state's note (the caveat) instead of a second headline.
function drawContrast(frame: Frame, data: z.infer<typeof contrast>) {
  // The strike draws in 120 ms and holds struck for a beat; the replacement lands 260 ms after the event.
  const at = frame.events?.[0]?.at ?? frame.dur / 3;
  const strike = ease.outExpo(clamp((frame.t - at) / .12));
  const progress = ease.outExpo(clamp((frame.t - at - .26) / .24));
  const swapped = frame.t >= at + .26;
  const current = swapped ? data.after : data.before;
  // `$3,094/exploit` keeps its denominator in the data; the hero shows the amount, the label carries "per exploit".
  const [amount, per] = current.value.split('/');
  label(frame, per ? `${current.label}, per ${per}` : current.label);
  const height = type(frame, amount, { y: 516, size: swapped ? 160 + 200 * progress : 200, height: 504, color: swapped ? frame.theme.accent : frame.theme.fg });
  if (!swapped && strike > 0) {
    frame.ctx.fillStyle = frame.theme.accent;
    frame.ctx.fillRect(SAFE.x, 516 + height * .42, 804 * strike, 20);
  }
  if (current.note && (!swapped || change(frame, 1) > 0)) label(frame, current.note, 1056);
  if (data.takeaway && change(frame, 1) > 0 && !current.note) headline(frame, data.takeaway);
}

export const bigideaStyle: StyleDef = {
  name: 'bigidea',
  description: 'BIG IDEA: moving magazine covers; monumental editorial type, paper white or ink black, one thought and one coloured focal point.',
  defaultMode: 'light',
  defaultAccent: 'red',
  theme(mode, accent) {
    const base = makeTheme(mode, accent);
    return { ...base, accent: accent === 'red' && mode === 'light' ? '#C7192C' : base.accent, bg: mode === 'light' ? '#FAF9F5' : '#111111', fg: mode === 'light' ? '#111111' : '#FAF9F5', dim: mode === 'light' ? '#55544F' : '#B9B8B1', line: mode === 'light' ? '#CECDC7' : '#44443F' };
  },
  fonts: [
    { family: 'BigIdea Archivo', file: 'fonts/ArchivoBlack-Regular.ttf', weight: '400' },
    { family: 'BigIdea Instrument', file: 'fonts/InstrumentSerif-Regular.ttf', weight: '400' },
    { family: 'BigIdea Sans', file: 'fonts/DMSans-Variable.ttf', weight: '100 1000' },
  ],
  background(frame) {
    frame.ctx.fillStyle = frame.theme.bg;
    frame.ctx.fillRect(0, 0, W, H);
  },
  // Breathing push across the scene; a hit lands as one decisive block push, never a shake.
  camera(frame, hits) {
    const progress = clamp(frame.t / Math.max(.001, frame.dur));
    const punch = hits.filter(hit => Number.isFinite(hit) && frame.t >= hit).reduce((sum, hit) => sum + .012 * (1 - ease.outExpo(clamp((frame.t - hit) / .24))), 0);
    const scale = 1 + progress * .03 + punch;
    frame.ctx.save();
    frame.ctx.translate(96, 744);
    frame.ctx.scale(scale, scale);
    frame.ctx.translate(-96, -744);
  },
  impact() {},
  transition(ctx, name, phase, theme, seed, context) {
    if (['morph', 'push', 'slide', 'whip'].includes(name)) { drawTransition(ctx, name, phase, theme, seed, context); return; }
    if (name === 'cut' || !Number.isFinite(phase)) return;
    const incoming = phase >= 0, amount = incoming ? 1 - clamp(phase) : clamp(phase + 1);
    ctx.save();
    ctx.fillStyle = name === 'flash' ? theme.fg : theme.bg;
    if (name === 'zoom') {
      ctx.beginPath(); ctx.arc(W / 2, H / 2, Math.hypot(W, H) * amount, 0, Math.PI * 2); ctx.fill();
    } else if (name === 'shutter') {
      ctx.fillRect(0, 0, W, H * amount / 2); ctx.fillRect(0, H * (1 - amount / 2), W, H * amount / 2);
    } else ctx.fillRect(incoming ? W * (1 - amount) : 0, 0, W * amount, H);
    ctx.restore();
  },
  chrome() {},
  caption(frame, caption, time) {
    if (time < caption.start || time >= caption.end || !clean(caption.text).trim()) return;
    type(frame, caption.text, { y: 1368, size: 68, face: 'sans', weight: 600, width: 780, height: 216, leading: 1.12 });
  },
  scenes,
  specials: {
    cover: {
      schema: cover, hook: true,
      purpose: 'Open with one monumental cover line and a supporting editorial deck.',
      layout(frame, { data }) {
        const parsed = cover.safeParse(data);
        if (!parsed.success) return;
        const [value] = parsed.data.headline.split('\n');
        place(frame, 'idea', /^[\d.,]+$/.test(value ?? '') ? HERO.number : HERO.headline, 'hero');
      },
      render(frame, props) {
        const data = readData(frame, cover, props.data);
        if (!data) return;
        const [value, ...meaning] = data.headline.split('\n');
        // A number cover is readable at full size on frame 0; the first event swaps the meaning line for the deck.
        if (/^[\d.,]+$/.test(value!)) numeral(frame, value, data.deck && change(frame) > 0 ? data.deck : meaning.join(' ') || data.deck || '', data.kicker, { from: 1, slam: 1 });
        else headline(frame, data.headline, data.kicker, data.deck, data.emphasis);
      },
    },
    numeral: {
      schema: number, hook: true,
      purpose: 'Make one exact number the motif, with its meaning immediately beneath.',
      layout(frame, { data }) { if (number.safeParse(data).success) place(frame, 'idea', HERO.number, 'hero'); },
      render: (frame, props) => { const data = readData(frame, number, props.data); if (data) numeral(frame, data.value, data.meaning, data.note, frame.opening ? { from: 1, slam: 1 } : {}); },
    },
    contrast: {
      schema: contrast,
      purpose: 'Contrast a small prior state with an oversized current state, without a dashboard.',
      layout(frame, { data }) { if (contrast.safeParse(data).success) place(frame, 'idea', HERO.number, 'hero'); },
      render: (frame, props) => { const data = readData(frame, contrast, props.data); if (data) drawContrast(frame, data); },
    },
    quote: {
      schema: quote,
      purpose: 'Hold a source-exact pull quote in high-contrast serif with attribution and scope.',
      layout(frame, { data }) { if (quote.safeParse(data).success) place(frame, 'idea', { x: SAFE.x, y: 516, w: 804, h: 660 }, 'hero'); },
      render(frame, props) {
        const data = readData(frame, quote, props.data);
        if (!data) return;
        label(frame, data.attribution);
        const clauses = data.text.split(/\n|(?<=[.!?])\s+/);
        const current = clauses[stage(frame, clauses.length)] ?? data.text;
        type(frame, `“${current}”`, { y: 516, face: 'serif', size: 128, height: 660, color: frame.theme.accent });
      },
    },
    object: {
      schema: object, hook: true,
      purpose: 'Give one procedural motif or image surprising scale with a single explanatory line.',
      layout(frame, { data }) { if (object.safeParse(data).success) place(frame, 'idea', HERO.motif, 'hero'); },
      render(frame, props) {
        const data = readData(frame, object, props.data);
        if (!data) return;
        motif(frame, data.motif, data.fullBleed, data.asset);
        if (data.kicker) label(frame, data.kicker);
        type(frame, data.line, { y: 1056, size: 96, height: 168 });
      },
    },
    statement: {
      schema: statement, hook: true,
      purpose: 'Set one quotable sentence with exactly one optional coloured word.',
      layout(frame, { data }) { if (statement.safeParse(data).success) place(frame, 'idea', HERO.headline, 'hero'); },
      render: (frame, props) => {
        const data = readData(frame, statement, props.data);
        if (!data) return;
        const thoughts = data.text.split('\n');
        const current = thoughts[stage(frame, thoughts.length)] ?? data.text;
        headline(frame, current, data.kicker, undefined, data.emphasis && current.includes(data.emphasis) ? data.emphasis : undefined);
      },
    },
  },
};
