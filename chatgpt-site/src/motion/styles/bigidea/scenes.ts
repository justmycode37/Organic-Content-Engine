import { clamp, ease, type Frame, type LayoutFrame, type SceneDef, type SceneProps } from '../../core.ts';
import { HERO, change, clean, headline, label, markedWord, numeral, stage, type } from './layout.ts';

function keyWord(value: string) {
  return markedWord(value) ?? clean(value).split(/\s+/).find(word => /\d/.test(word));
}

function sequence(frame: Frame, entries: string[], title?: string) {
  const current = stage(frame, Math.max(1, entries.length));
  const value = entries[current] ?? title ?? 'One idea.';
  headline(frame, value, title, undefined, keyWord(value));
}

// Register the hero where this layout family really draws it, so push and morph land on the visible object.
const anchor = (rect: typeof HERO[keyof typeof HERO]) => (frame: LayoutFrame) => {
  frame.objects.current.set('idea', { id: 'idea', kind: 'hero', rect });
};
const layout = anchor(HERO.headline), numberLayout = anchor(HERO.number), motifLayout = anchor(HERO.motif);

const formatNumber = (value: number, decimals = 0) => value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
/** `[number, rest]` when a line leads with a number such as `*948* Linux bugs` or `104 fixes so far`. */
const leadingNumber = (value: string) => /^\*?([$€£]?\d[\d.,]*[%×KMB]?)\*?\s+(.+)$/s.exec(value.trim());

/** Progress of the move between two stages: 0 before event `index`, eased to 1 over 240 ms after it. */
const between = (frame: Frame, index: number) => index < 0 ? 1 : change(frame, index);

export const scenes: Partial<{ [Key in Exclude<keyof SceneProps, 'special'>]: SceneDef<SceneProps[Key]> }> = {
  // A title that leads with a number opens as a full-size numeral (readable at frame 0); the first event swaps in
  // its consequence line, the second underlines the number.
  title: { type: 'title', layout: (frame, props) => (leadingNumber(props.text) ? numberLayout : layout)(frame), render(frame, props) {
    const lead = leadingNumber(props.text);
    if (!lead) { headline(frame, props.text, props.kicker, props.sub, keyWord(props.text)); return; }
    const [, value, meaning] = lead;
    numeral(frame, clean(value), props.sub && change(frame) > 0 ? props.sub : clean(meaning!), props.kicker, { from: 1, slam: 1 });
  } },
  kinetic: { type: 'kinetic', layout, render: (frame, props) => sequence(frame, props.words ?? []) },
  // Without `versus` the number slams from 55 % on the first event. With `versus` the prior value stands at full size
  // in ink, then the current value replaces it in the accent on the first event; the second event underlines it.
  stat: { type: 'stat', layout: numberLayout, render(frame, props) {
    const format = (value: number) => `${props.prefix ?? ''}${formatNumber(Number.isFinite(value) ? value : 0, props.decimals)}${props.suffix ?? ''}`;
    if (!props.versus) { numeral(frame, format(props.value), props.label, undefined, props.slam === false ? { from: 1, slam: 1 } : {}); return; }
    if (change(frame) === 0) numeral(frame, format(props.versus.value), props.versus.label, undefined, { from: 1, slam: 1, mark: 0, color: frame.theme.fg });
    else numeral(frame, format(props.value), props.label, undefined, { from: .78 });
  } },
  // One number at a time, replaced on each event; a single bar below shrinks or grows from the previous value to the
  // current one, so a funnel visibly narrows instead of stacking rows.
  bars: { type: 'bars', layout: numberLayout, render(frame, props) {
    const items = props.items ?? [];
    const current = stage(frame, Math.max(1, items.length));
    const item = items[current];
    if (!item) return;
    const maximum = Math.max(1, ...items.map(entry => Math.abs(entry.value)));
    const previous = items[Math.max(0, current - 1)] ?? item;
    const move = between(frame, current - 1);
    const width = 780 * (Math.abs(previous.value) + (Math.abs(item.value) - Math.abs(previous.value)) * move) / maximum;
    const last = current === items.length - 1;
    numeral(frame, `${formatNumber(item.value)}${props.unit ?? ''}`, item.label, undefined, { from: current ? .82 : 1, slam: current ? move : 1, mark: 0, color: last || item.accent ? frame.theme.accent : frame.theme.fg });
    frame.ctx.fillStyle = frame.theme.line;
    frame.ctx.fillRect(96, 1188, 780, 24);
    frame.ctx.fillStyle = frame.theme.accent;
    frame.ctx.fillRect(96, 1188, width, 24);
  } },
  compare: { type: 'compare', layout, render(frame, props) {
    const selected = change(frame) > 0 ? props.right : props.left;
    sequence(frame, selected?.points ?? [], selected?.label);
  } },
  list: { type: 'list', layout, render: (frame, props) => sequence(frame, props.items ?? [], props.title) },
  flow: { type: 'flow', layout, render: (frame, props) => sequence(frame, (props.nodes ?? []).map(node => node.label), 'SIMPLIFIED PIPELINE') },
  code: { type: 'code', layout, render: (frame, props) => sequence(frame, props.code.split('\n').filter(Boolean), props.filename) },
  diff: { type: 'diff', layout, render(frame, props) {
    sequence(frame, change(frame) > 0 ? props.added : props.removed, props.filename);
  } },
  terminal: { type: 'terminal', layout, render(frame, props) {
    sequence(frame, (props.lines ?? []).flatMap(line => [line.cmd, line.out].filter((value): value is string => Boolean(value))), props.title);
  } },
  changelog: { type: 'changelog', layout, render: (frame, props) => sequence(frame, (props.items ?? []).map(item => item.text), props.product) },
  chat: { type: 'chat', layout, render: (frame, props) => sequence(frame, (props.messages ?? []).map(message => message.text)) },
  tokens: { type: 'tokens', layout, render(frame, props) {
    const predicted = props.predict?.[stage(frame, props.predict.length)];
    headline(frame, change(frame) > 0 && predicted ? `${predicted.token} ${Math.round(predicted.p * 100)}%` : props.text);
  } },
  layers: { type: 'layers', layout, render(frame, props) {
    const layers = props.layers ?? [];
    const current = props.focus ?? stage(frame, Math.max(1, layers.length));
    const layer = layers[current];
    const reveal = change(frame);
    frame.ctx.strokeStyle = frame.theme.fg;
    frame.ctx.lineWidth = 8;
    frame.ctx.strokeRect(300, 504 - reveal * 96, 396, 396);
    frame.ctx.fillStyle = frame.theme.accent;
    frame.ctx.fillRect(348, 552 + reveal * 96, 300, 300);
    type(frame, layer?.label, { y: 1032, size: 96, height: 180 });
  } },
  grid: { type: 'grid', layout, render: (frame, props) => numeral(frame, `${props.rows} × ${props.cols}`, props.title ?? 'Rows × columns') },
  outro: { type: 'outro', layout, render(frame, props) {
    headline(frame, props.cta, undefined, props.sub, keyWord(props.cta));
    const progress = change(frame);
    frame.ctx.strokeStyle = frame.theme.accent;
    frame.ctx.lineWidth = 12;
    frame.ctx.beginPath();
    frame.ctx.moveTo(300, 1008);
    frame.ctx.lineTo(360 + progress * 48, 1068 + progress * 48);
    frame.ctx.lineTo(408 + progress * 288, 1116 - progress * 204);
    frame.ctx.stroke();
  } },
  // Contact then consequence. A `block`/`stop` action makes the actor hit the wall and recoil, and the wall thickens:
  // the same objects, the opposite outcome.
  demo: { type: 'demo', layout: motifLayout, render(frame, props) {
    const contact = change(frame), resolved = change(frame, 1);
    const blocked = /\b(block|stop|deny|refuse)/i.test(props.action);
    label(frame, resolved > 0 ? props.after : props.before);
    const { ctx, theme } = frame;
    const recoil = blocked ? Math.sin(Math.PI * clamp((frame.t - (frame.events?.[0]?.at ?? frame.dur / 3) - .12) / .36)) * 72 * (contact > .5 ? 1 : 0) : 0;
    const x = blocked ? 228 + contact * 174 - recoil : 228 + contact * 270;
    ctx.fillStyle = theme.accent;
    ctx.beginPath(); ctx.arc(x, 702, blocked ? 36 : 36 + resolved * 72, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = theme.fg;
    ctx.lineWidth = blocked ? 12 + resolved * 24 : 12;
    if (blocked) ctx.strokeRect(438, 552, 300, 300);
    else ctx.strokeRect(438 - resolved * 156, 552 - resolved * 108, 300 + resolved * 120, 300 + resolved * 120);
    type(frame, resolved > 0 ? props.target : props.actor, { y: 1056, size: 96, height: 168 });
  } },
  predict: { type: 'predict', layout, render(frame, props) {
    const current = stage(frame, 3);
    if (current === 2) {
      numeral(frame, props.comparison.value, props.comparison.label, props.correction);
      return;
    }
    label(frame, props.question);
    type(frame, current ? props.answer : props.guesses.join(' / '), { y: 516, size: current ? 240 : 128, color: current ? frame.theme.accent : frame.theme.fg, height: 480 });
    if (current && props.correction) label(frame, props.correction, 1080);
  } },
  quantity: { type: 'quantity', layout, render(frame, props) {
    const extracted = change(frame) > 0, remainder = change(frame, 1) > 0;
    numeral(frame, String(remainder ? props.quantity - props.subset : extracted ? props.subset : props.quantity), remainder ? `Remaining ${props.unit}` : props.unit);
    const width = extracted ? 780 * props.subset / Math.max(1, props.quantity) : 780;
    frame.ctx.fillStyle = frame.theme.accent;
    frame.ctx.fillRect(96, 1188, remainder ? 780 - width : width, 16);
    if (remainder && props.comparator) type(frame, `${props.comparator.value} ${props.comparator.label}`, { y: 1080, size: 64, face: 'sans', height: 96 });
  } },
  evidence: { type: 'evidence', layout, render(frame, props) {
    const image = props.asset ? frame.assets[props.asset] : undefined;
    if (image) {
      const { x, y, w, h } = props.rect ?? { x: 0, y: 0, w: image.width, h: image.height };
      frame.ctx.drawImage(image, x, y, w, h, 96, 432, 780, 540);
    } else headline(frame, change(frame) > 0 ? props.quote ?? props.claim : props.claim);
    label(frame, change(frame, 1) > 0 ? props.date : props.source, 1080);
  } },
  // Area-true discs. The first level stays as a solid accent disc; each later level grows as an ink ring around it
  // from the previous size, so the small value stays visible inside the large one. The number swaps on the event.
  scale: { type: 'scale', layout: motifLayout, render(frame, props) {
    const levels = props.levels ?? [];
    const current = stage(frame, Math.max(1, levels.length));
    const selected = levels[current];
    if (!selected) return;
    const { ctx, theme } = frame;
    const maximum = Math.max(1, ...levels.map(level => level.value));
    const diameter = (value: number) => 540 * Math.sqrt(Math.max(0, value) / maximum);
    const first = levels[0]!;
    if (current > 0) {
      const previous = levels[current - 1]!;
      const grown = diameter(previous.value) + (diameter(selected.value) - diameter(previous.value)) * ease.outBack(change(frame, current - 1));
      ctx.strokeStyle = theme.fg;
      ctx.lineWidth = 12;
      ctx.beginPath(); ctx.arc(498, 702, Math.max(6, grown / 2), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = theme.accent;
    ctx.beginPath(); ctx.arc(498, 702, diameter(first.value) / 2, 0, Math.PI * 2); ctx.fill();
    label(frame, selected.label);
    type(frame, formatNumber(selected.value), { y: 1032, size: 156, height: 180, color: current ? theme.fg : theme.accent });
  } },
  // Left value, then the right value replaces it while the left shrinks into the top label; the answer lands as the
  // sum or verdict. A number-led answer settles as a numeral with its underline.
  split: { type: 'split', layout: numberLayout, render(frame, props) {
    if (change(frame, 1) > 0) {
      const lead = leadingNumber(props.answer);
      if (lead) numeral(frame, clean(lead[1]), clean(lead[2]!), undefined, { from: .78, slam: change(frame, 1), mark: change(frame, 1) });
      else headline(frame, props.answer, undefined, undefined, keyWord(props.answer));
      return;
    }
    if (change(frame) === 0) { numeral(frame, props.left.value, props.left.label, props.axis, { from: 1, slam: 1, mark: 0, color: frame.theme.fg }); return; }
    numeral(frame, props.right.value, props.right.label, `${clean(props.left.value)} ${props.left.label} +`, { from: .78, mark: 0 });
  } },
};
