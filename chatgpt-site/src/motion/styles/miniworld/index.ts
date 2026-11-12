import { z } from 'zod';
import { ACCENTS, clamp, ease, markupWords, type Frame, type LayoutFrame, type SceneBase, type SceneDef, type SceneProps, type Theme } from '../../core.ts';
import { place } from '../../fx/objects.ts';
import type { SpecialScene, StyleDef } from '../style.ts';
import { BODY, PLACES, label, plate } from './engine.ts';
import { actorLayout, beatAt, rememberScreen, bit, delivery, gate, heading, journey, layers, notice, patch, response, semantic, stage, tower } from './choreography.ts';

const short = (max = 70) => z.string().min(1).max(max);
const count = z.number().min(0).max(1e9);
const placeData = z.object({ place: z.enum(PLACES), title: short(48), note: short(40).optional() }).strict();
const stackData = z.object({ title: short(40), items: z.array(z.object({ label: short(24), value: count, accent: z.boolean().optional() }).strict()).min(1).max(4) }).strict();
const journeyData = z.object({ stations: z.array(short(18)).min(2).max(5) }).strict();
const consequenceData = z.object({ title: short(40), cause: short(40), effect: short(40), localAccess: z.boolean().optional() }).strict();
const versusData = z.object({ title: short(40), left: z.object({ label: short(16), value: count }).strict(), right: z.object({ label: short(16), value: count }).strict() }).strict();
const castData = z.object({ character: z.enum(['BIT', 'ADA', 'THE CROWD']), role: short(40) }).strict();

const drawPlace = (frame: Frame, data: z.infer<typeof placeData>) => delivery(frame, data.title, data.place);
const drawStack = (frame: Frame, title: string, items: { label: string; value: number }[]) => tower(frame, title, items);
const drawJourney = (frame: Frame, stations: string[]) => journey(frame, stations);
const drawConsequence = (frame: Frame, data: z.infer<typeof consequenceData>) => data.localAccess ? gate(frame, data.title) : patch(frame, data.title);
const drawVersus = (frame: Frame, data: z.infer<typeof versusData>) => tower(frame, data.title, [data.left, data.right]);
const drawCast = (frame: Frame, data: z.infer<typeof castData>) => {
  if (data.character === 'ADA') { patch(frame, data.role); return; }
  if (data.character === 'BIT') { delivery(frame, data.role); return; }
  const { world, x, y } = stage(frame, 'THE HARBOR');
  const move = response(frame, 'travel', 0, 0.6);
  for (let index = 0; index < 5; index++) world.ada(x - 1.5 + index * 0.65 + move, y - index * 0.3, true);
  bit(frame, world, x + 1, y + 0.8); world.flush();
  heading(frame, data.role);
};
function specialLayout(frame: LayoutFrame, kind: 'place' | 'stack' | 'journey') {
  // These specials reuse the same BIT placement as the shared MINI WORLD scenes. Keep it as the
  // transition target and expose each special's larger focal region for explicit camera targets.
  actorLayout(frame, { events: frame.events });
  frame.objects.current.delete('place');
  if (kind === 'place') place(frame, 'place', { x: 168, y: 660, w: 744, h: 360 }, 'support');
  else if (kind === 'stack') place(frame, 'stack', { x: 360, y: 630, w: 420, h: 460 }, 'support');
  else place(frame, 'journey', frame.objects.current.get('BIT')?.rect ?? { x: 600, y: 955, w: 172, h: 195 }, 'support');
}
const drawStat = (frame: Frame, props: SceneProps['stat']) => {
  // Before the slam the sign names the quantity; the number replaces it as the cargo lands. Never a fake zero.
  const changed = frame.opening || frame.t >= beatAt(frame, 'amount', 0);
  const amount = (props.value ?? 0).toLocaleString('en-US', { minimumFractionDigits: props.decimals ?? 0, maximumFractionDigits: props.decimals ?? 0 });
  delivery(frame, changed ? `${props.prefix ?? ''}${amount}${props.suffix ?? ''}` : props.label ?? 'THE BILL', 'THE MARKET', changed ? props.label ?? '' : '', props.slam ?? false);
};
const drawCompare = (frame: Frame, props: SceneProps['compare']) => notice(frame, props.title ?? 'COMPARE', [props.left?.label ?? '', props.right?.label ?? ''], 'THE MARKET');
const drawGrid = (frame: Frame, props: SceneProps['grid']) => delivery(frame, props.title ?? 'SERVER CITY');
function def<K extends keyof SceneProps>(type: K, render: (frame: Frame, props: SceneProps[K]) => void): SceneDef<SceneProps[K]> {
  return { type, layout: (frame, props) => actorLayout(frame, props as Partial<SceneBase>), render };
}

const specials: Record<string, SpecialScene> = {
  place: { schema: placeData, purpose: 'Open on a recurring place: one big sign, the orange story object lands on the street.', hook: true, bed: 'blocks', layout: frame => specialLayout(frame, 'place'), render: (frame, { data }) => drawPlace(frame, data) },
  stack: { schema: stackData, purpose: 'One tower that shrinks or grows step by step through up to four exact counts.', hook: true, bed: 'blocks', layout: frame => specialLayout(frame, 'stack'), render: (frame, { data }) => drawStack(frame, data.title, data.items) },
  journey: { schema: journeyData, purpose: 'Camera follows BIT station to station through a two-to-five-step process.', layout: frame => specialLayout(frame, 'journey'), render: (frame, { data }) => drawJourney(frame, data.stations) },
  consequence: { schema: consequenceData, purpose: 'A visible consequence: a rack-by-rack ripple, or the local-access gate and key.', render: (frame, { data }) => drawConsequence(frame, data) },
  versus: { schema: versusData, purpose: 'Two towers on one shared scale; the right one grows block by block.', bed: 'blocks', render: (frame, { data }) => drawVersus(frame, data) },
  cast: { schema: castData, purpose: 'Introduce or revisit one member of the fixed recurring cast.', hook: true, bed: 'pop', render: (frame, { data }) => drawCast(frame, data) },
};

const placeholders: Record<string, unknown> = {
  place: { place: 'SERVER CITY', title: 'WORLD PREVIEW', note: 'SCENE DATA UNAVAILABLE' },
  stack: { title: 'NO COUNT DATA', items: [{ label: 'UNAVAILABLE', value: 0 }] },
  journey: { stations: ['DATA', 'UNAVAILABLE'] },
  consequence: { title: 'WORLD PREVIEW', cause: 'SCENE DATA UNAVAILABLE', effect: 'NO RESULT CLAIMED' },
  versus: { title: 'NO COMPARISON DATA', left: { label: 'LEFT', value: 0 }, right: { label: 'RIGHT', value: 0 } },
  cast: { character: 'BIT', role: 'SCENE DATA UNAVAILABLE' },
};
for (const [kind, special] of Object.entries(specials)) {
  const render = special.render;
  special.render = (frame, props) => {
    const result = special.schema.safeParse(props?.data);
    render(frame, { kind, data: result.success ? result.data : placeholders[kind] });
  };
}

export const miniworldStyle: StyleDef = {
  name: 'miniworld',
  description: 'MINI WORLD: a frame-filling clay city, continuous BIT, word-timed contact and consequences.',
  defaultMode: 'light', defaultAccent: 'orange',
  theme(mode, accent): Theme {
    const accents = mode === 'dark'
      ? { ...ACCENTS, orange: '#F6A47F', red: '#F39483', blue: '#9AB9ED', lime: '#BBD08A', yellow: '#E8C477', magenta: '#E4A0C3' }
      : { ...ACCENTS, orange: '#A93F24', red: '#C84F46', blue: '#416DB1', lime: '#75923C', yellow: '#BA8626', magenta: '#AB5079' };
    return mode === 'light'
      ? { mode, bg: '#EAE6DC', fg: '#263E45', panel: '#F8F3E8', panelAlt: '#DDD8CD', line: '#B8B8AA', muted: '#6C817B', dim: '#486860', accent: accents[accent], onAccent: '#FFF8E9' }
      : { mode, bg: '#182E3B', fg: '#EEF0DE', panel: '#304550', panelAlt: '#4B5E63', line: '#425C61', muted: '#819B9B', dim: '#A5C4BE', accent: accents[accent], onAccent: '#182E3B' };
  },
  fonts: [{ family: 'Nunito', file: 'fonts/Nunito.ttf', weight: '200 1000' }, { family: 'Miniworld Sans', file: 'fonts/DM-Sans.ttf', weight: '100 1000' }],
  background(frame) { rememberScreen(frame.ctx); frame.ctx.fillStyle = frame.theme.bg; frame.ctx.fillRect(0, 0, 1080, 1920); },
  chrome(frame) { label(frame.ctx, 'MINI WORLD', 96, 320, 350, 48, frame.theme.dim, 'left'); },
  caption(frame, caption, time) {
    const { ctx, theme } = frame;
    const words = markupWords(caption.text).reduce<ReturnType<typeof markupWords>>((result, word) => {
      if (/^[.,!?;:]+$/.test(word.text) && result.length) result[result.length - 1].text += word.text;
      else result.push({ ...word });
      return result;
    }, []);
    let size = 68, rows: typeof words[] = [];
    for (; size >= 24; size -= 2) {
      rows = []; ctx.font = `800 ${size}px ${BODY}`;
      const chunks = words.flatMap(word => {
        const parts: typeof words = []; let part = '';
        for (const character of word.text) {
          if (part && ctx.measureText(part + character).width > 790) { parts.push({ ...word, text: part }); part = character; }
          else part += character;
        }
        if (part) parts.push({ ...word, text: part });
        return parts;
      });
      for (const word of chunks) {
        const last = rows.at(-1);
        if (last && ctx.measureText([...last, word].map(item => item.text).join(' ')).width <= 790) last.push(word);
        else rows.push([word]);
      }
      if (rows.length <= 3) break;
    }
    // Each new caption pops up 16 px; it is fully readable from its first frame.
    const lift = 16 * (1 - ease.outCubic(clamp((time - caption.start) / 0.14)));
    rows.slice(0, 3).forEach((row, index) => {
      ctx.font = `800 ${size}px ${BODY}`;
      const width = Math.min(790, ctx.measureText(row.map(word => word.text).join(' ')).width);
      const y = 1380 + index * (size + 24) + lift;
      plate(ctx, 540 - width / 2 - 24, y - size / 2 - 13, width + 48, size + 26, theme.panel, 18);
      let x = 540 - width / 2;
      row.forEach(word => {
        const wordWidth = ctx.measureText(word.text).width;
        label(ctx, word.text, x, y, Math.min(wordWidth + 1, 790), size, word.accent ? theme.accent : theme.fg, 'left', BODY);
        x += wordWidth + ctx.measureText(' ').width;
      });
    });
  },
  camera(frame) { frame.ctx.save(); },
  impact() {},
  transition(ctx, name, phase, theme) {
    if (name === 'cut') return;
    // A clay slab whips right to left across the cut, in the direction of the camera glide; it never holds a blank frame.
    const progress = ease.inOutCubic((phase + 1) / 2), width = 420, x = 1080 - progress * (1080 + width);
    ctx.save(); ctx.fillStyle = theme.panelAlt;
    ctx.beginPath(); ctx.moveTo(x + 120, 0); ctx.lineTo(x + width + 120, 0); ctx.lineTo(x + width - 120, 1920); ctx.lineTo(x - 120, 1920); ctx.closePath(); ctx.fill();
    ctx.restore();
  },
  scenes: {
    demo: def('demo', (frame, props) => semantic(frame, 'demo', props)),
    predict: def('predict', (frame, props) => semantic(frame, 'predict', props)),
    quantity: def('quantity', (frame, props) => semantic(frame, 'quantity', props)),
    evidence: def('evidence', (frame, props) => semantic(frame, 'evidence', props)),
    scale: def('scale', (frame, props) => semantic(frame, 'scale', props)),
    split: def('split', (frame, props) => semantic(frame, 'split', props)),
    title: def('title', (frame, props) => delivery(frame, props.text ?? 'MINI WORLD')),
    kinetic: def('kinetic', (frame, props) => notice(frame, 'MINI WORLD', props.words ?? [])),
    stat: def('stat', drawStat),
    bars: def('bars', (frame, props) => tower(frame, props.title ?? 'COUNTS', props.items ?? [])),
    compare: def('compare', drawCompare),
    list: def('list', (frame, props) => notice(frame, props.title ?? 'NOTICE', props.items ?? [])),
    flow: def('flow', (frame, props) => journey(frame, (props.nodes ?? []).map(item => item.label))),
    changelog: def('changelog', (frame, props) => notice(frame, props.product ?? 'PATCH STATUS', (props.items ?? []).map(item => item.text))),
    terminal: def('terminal', (frame, props) => notice(frame, props.title ?? 'SERVER CITY', (props.lines ?? []).map(item => item.out ?? item.cmd ?? ''), 'SERVER CITY')),
    code: def('code', (frame, props) => notice(frame, props.filename ?? 'THE LAB', (props.code ?? '').split('\n'), 'THE LAB')),
    diff: def('diff', (frame, props) => patch(frame, frame.t < beatAt(frame, 'patch', 0) ? (props.removed ?? [])[0] ?? 'BEFORE' : (props.added ?? [])[0] ?? 'PATCHED')),
    chat: def('chat', (frame, props) => notice(frame, props.model ?? 'THE LAB', (props.messages ?? []).map(item => item.text), 'THE LAB')),
    outro: def('outro', (frame, props) => delivery(frame, props.cta ?? 'PATCH YOUR KERNEL', 'THE HARBOR')),
    tokens: def('tokens', (frame, props) => notice(frame, props.title ?? 'WORD BLOCKS', [props.text ?? '', ...(props.predict ?? []).map(item => item.token)])),
    layers: def('layers', layers),
    grid: def('grid', drawGrid),
  },
  specials,
};
