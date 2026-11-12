import { clamp, stripMarkup, type Frame, type SceneDef, type SceneProps, type SceneType } from '../../core.ts';
import { active, beat, copy, focusText, marker, rule } from './draw.ts';
import { sourceImage, quotation } from './source.ts';

function sequence(frame: Frame, items: string[], size = 100) {
  focusText(frame, items[active(frame, items.length)] ?? 'No record', size, 560, beat(frame, 0));
}

const title: SceneDef<SceneProps['title']> = { type: 'title', render(frame, props) {
  focusText(frame, props.text.includes('*') ? props.text : `*${stripMarkup(props.text)}*`, 132, 480, beat(frame, 0));
  marker(frame, 120, 960, 768, 12, beat(frame, 1));
} };
const stat: SceneDef<SceneProps['stat']> = { type: 'stat', render(frame, props) {
  const landing = beat(frame, 0), versus = props.versus ? beat(frame, 1) : 0;
  const zoom = props.slam ? 1 + .10 * (1 - landing) : 1;
  // The comparator pushes the number up and lands beneath it, so the difference reads as one movement.
  const lift = 150 * versus;
  frame.ctx.save(); frame.ctx.translate(120, 470 - lift); frame.ctx.scale(zoom, zoom);
  copy(frame, `${props.prefix ?? ''}${props.value.toLocaleString('en-US', { minimumFractionDigits: props.decimals ?? 0, maximumFractionDigits: props.decimals ?? 0 })}${props.suffix ?? ''}`, 0, 0, 730, { size: 208, maxLines: 1 });
  frame.ctx.restore();
  marker(frame, 120, 696 - lift, 740, 14, landing);
  copy(frame, props.label, 120, 740 - lift, 768, { size: 72, maxLines: 2 });
  if (!props.versus || versus <= 0) { marker(frame, 120, 830, 560, 12, beat(frame, 1)); return; }
  frame.ctx.save(); frame.ctx.globalAlpha *= versus; frame.ctx.translate(0, 60 * (1 - versus));
  copy(frame, `*${props.versus.value.toLocaleString('en-US')}*`, 120, 700, 768, { size: 160, maxLines: 1, progress: versus });
  copy(frame, props.versus.label, 120, 880, 768, { size: 72, maxLines: 1 });
  frame.ctx.restore();
} };
const bars: SceneDef<SceneProps['bars']> = { type: 'bars', render(frame, props) {
  const items = props.items ?? [], selected = active(frame, items.length), item = items[selected];
  if (!item) return;
  focusText(frame, item.value.toLocaleString('en-US'), 208, 500);
  copy(frame, item.label, 120, 790, 768, { size: 72, maxLines: 2 });
  const maximum = Math.max(1, ...items.map(candidate => Math.abs(candidate.value)));
  marker(frame, 120, 970, 768 * Math.abs(item.value) / maximum, 30, beat(frame, selected));
} };
const compare: SceneDef<SceneProps['compare']> = { type: 'compare', render(frame, props) {
  const side = beat(frame, 0) > .5 ? props.right : props.left;
  focusText(frame, side?.label, 112, 500);
  copy(frame, side?.points?.join(' · '), 120, 780, 768, { size: 72, maxLines: 3 });
  marker(frame, 120, 714, 768, 12, beat(frame, 1));
} };
const list: SceneDef<SceneProps['list']> = { type: 'list', render: (frame, props) => sequence(frame, props.items ?? []) };
const changelog: SceneDef<SceneProps['changelog']> = { type: 'changelog', render: (frame, props) => sequence(frame, (props.items ?? []).map(item => item.text)) };
const flow: SceneDef<SceneProps['flow']> = { type: 'flow', render(frame, props) {
  const nodes = props.nodes ?? [], selected = active(frame, nodes.length);
  focusText(frame, nodes[selected]?.label, 112, 510);
  if (selected < nodes.length - 1) {
    rule(frame, 132, 825, 132 + 600 * beat(frame, selected), 825, 1, true);
    copy(frame, nodes[selected + 1]?.label, 120, 890, 768, { size: 64, maxLines: 1 });
  }
} };
const code: SceneDef<SceneProps['code']> = { type: 'code', render: (frame, props) => sequence(frame, props.code.split('\n').filter(Boolean), 72) };
const terminal: SceneDef<SceneProps['terminal']> = { type: 'terminal', render: (frame, props) => sequence(frame, (props.lines ?? []).flatMap(line => [line.cmd, line.out].filter((value): value is string => Boolean(value))), 80) };
const diff: SceneDef<SceneProps['diff']> = { type: 'diff', render: (frame, props) => sequence(frame, [...props.removed, ...props.added], 80) };
const chat: SceneDef<SceneProps['chat']> = { type: 'chat', render: (frame, props) => sequence(frame, (props.messages ?? []).map(message => message.text), 80) };
const tokens: SceneDef<SceneProps['tokens']> = { type: 'tokens', render: (frame, props) => sequence(frame, props.text.split(/\s+/), 160) };
const kinetic: SceneDef<SceneProps['kinetic']> = { type: 'kinetic', render(frame, props) {
  const words = props.words ?? [], selected = active(frame, words.length);
  focusText(frame, `*${words[selected] ?? ''}*`, 112, 560, beat(frame, Math.max(1, selected)));
} };
const outro: SceneDef<SceneProps['outro']> = { type: 'outro', render(frame, props) {
  focusText(frame, `*${props.cta}*`, 120, 490, beat(frame, 0));
  marker(frame, 120, 950, 768, 18, beat(frame, 1));
} };
const layers: SceneDef<SceneProps['layers']> = { type: 'layers', render(frame, props) {
  const items = props.layers ?? [], selected = Math.min(items.length - 1, props.focus !== undefined && beat(frame, 0) > .5 ? props.focus : active(frame, items.length));
  items.forEach((item, index) => {
    const offset = (index - selected) * (120 + 38 * beat(frame, 0));
    frame.ctx.save(); frame.ctx.globalAlpha *= index === selected ? 1 : .10;
    if (Math.abs(offset) < 380) copy(frame, item.label, 120, 640 + offset, 768, { size: index === selected ? 96 : 64, maxLines: 1 });
    frame.ctx.restore();
  });
  marker(frame, 120, 770, 768, 12, beat(frame, 1));
} };
const grid: SceneDef<SceneProps['grid']> = { type: 'grid', render(frame, props) {
  const rows = Math.min(16, Math.max(2, props.rows)), columns = Math.min(16, Math.max(2, props.cols));
  const cells = rows * columns, revealed = Math.round(cells * beat(frame, 0));
  for (let index = 0; index < cells; index++) {
    frame.ctx.fillStyle = index < revealed ? frame.theme.accent : frame.theme.panelAlt;
    frame.ctx.fillRect(120 + index % columns * 46, 430 + Math.floor(index / columns) * 38, 30, 24);
  }
} };
const demo: SceneDef<SceneProps['demo']> = { type: 'demo', render(frame, props) {
  const contact = beat(frame, 0), result = beat(frame, 1);
  if (result > .5) { focusText(frame, props.after, 120, 560, result); return; }
  copy(frame, props.actor, 120 + contact * 330, 430, 430, { size: 72, maxLines: 2 });
  marker(frame, 450, 640, 400, 12, contact);
  copy(frame, props.target, 450, 740, 438, { size: 72, maxLines: 2 });
} };
const predict: SceneDef<SceneProps['predict']> = { type: 'predict', render(frame, props) {
  if (beat(frame, 3) > .5 && props.correction) {
    focusText(frame, props.correction, 104, 460);
    copy(frame, props.answer, 120, 900, 768, { size: 72, maxLines: 2 });
    return;
  }
  // The question stays; the first guess is locked, struck through, and the answer lands under it.
  const locked = beat(frame, 0), answered = beat(frame, 1), reason = beat(frame, 2);
  const guess = props.guesses.find(candidate => candidate !== props.answer) ?? props.guesses[0];
  copy(frame, props.question, 120, 360, 768, { size: 104, maxLines: 2 });
  if (locked > 0 && guess) {
    frame.ctx.save(); frame.ctx.globalAlpha *= locked;
    copy(frame, guess, 120, 640, 768, { size: 112, maxLines: 1, muted: answered > .5 });
    frame.ctx.fillStyle = frame.theme.fg; frame.ctx.fillRect(110, 640 + 62, (frame.ctx.measureText(guess).width + 20) * answered, 10);
    frame.ctx.restore();
  }
  if (answered > 0) copy(frame, `*${props.answer}*`, 120, 770 + 30 * (1 - answered), 768, { size: 112, maxLines: 1, progress: answered });
  if (reason > 0) {
    frame.ctx.save(); frame.ctx.globalAlpha *= reason;
    copy(frame, `${props.comparison.label}: ${props.comparison.value}`, 120, 920, 768, { size: 72, maxLines: 1 });
    frame.ctx.restore();
  }
} };
const quantity: SceneDef<SceneProps['quantity']> = { type: 'quantity', render(frame, props) {
  const extraction = beat(frame, 0), resolved = beat(frame, 1) > .5;
  const scale = Math.max(1, props.scale ?? 1) * Math.max(1, Math.ceil(props.quantity / (96 * Math.max(1, props.scale ?? 1))));
  const count = Math.ceil(props.quantity / scale), subset = clamp(props.subset, 0, props.quantity), remainder = props.quantity - subset;
  if (resolved) {
    focusText(frame, `${remainder} ${props.unit}`, 112, 460);
    copy(frame, 'Remainder', 120, 760, 768, { size: 72, maxLines: 1 });
    if (beat(frame, 2) > .5) copy(frame, `${props.comparator.label}: ${props.comparator.value}`, 120, 920, 768, { size: 64, maxLines: 2 });
    return;
  }
  for (let index = 0; index < count; index++) {
    const value = Math.min(scale, props.quantity - index * scale), marked = clamp(subset - index * scale, 0, value);
    const left = 120 + index % 12 * 62, top = 360 + Math.floor(index / 12) * 48;
    frame.ctx.fillStyle = frame.theme.fg;
    frame.ctx.fillRect(left + 36 * marked / scale, top + extraction * 100, 36 * (value - marked) / scale, 28);
    frame.ctx.fillStyle = frame.theme.accent;
    frame.ctx.fillRect(left, top, 36 * marked / scale, 28);
  }
  copy(frame, `${props.quantity} ${props.unit} · ${scale} per token`, 120, 970, 768, { size: 64, maxLines: 2 });
} };
const evidence: SceneDef<SceneProps['evidence']> = { type: 'evidence', render(frame, props) {
  if (props.asset) {
    const image = frame.assets?.[props.asset];
    sourceImage(frame, props.asset, image ? { x: 0, y: 0, w: Math.min(426, image.width), h: Math.min(70, image.height) } : props.rect, props.claim, props.source, props.date, props.rect);
  }
  else quotation(frame, props.quote ?? '', props.source, props.date);
} };
const scale: SceneDef<SceneProps['scale']> = { type: 'scale', render(frame, props) {
  const items = props.levels ?? [], selected = active(frame, items.length), level = items[selected];
  if (!level) return;
  const maximum = Math.max(1, ...items.map(item => item.value));
  const side = 560 * Math.sqrt(clamp(level.value / maximum));
  frame.ctx.fillStyle = frame.theme.accent; frame.ctx.fillRect(120, 360, side, side);
  copy(frame, `${level.label}: ${level.value} ${props.unit}`, 120, 930, 768, { size: 64, maxLines: 1 });
  const base = items[0]?.value;
  if (base > 0) copy(frame, `${(level.value / base).toFixed(2)}× ${props.reference}`, 120, 1010, 768, { size: 64, maxLines: 1 });
} };
const split: SceneDef<SceneProps['split']> = { type: 'split', render(frame, props) {
  if (beat(frame, 1) > .5) { focusText(frame, props.answer, 112, 560); return; }
  const side = beat(frame, 0) > .5 ? props.right : props.left;
  focusText(frame, side.value, 132, 500);
  copy(frame, side.label, 120, 830, 768, { size: 72, maxLines: 2 });
} };

export const proofScenes: Partial<{ [Kind in Exclude<SceneType, 'special'>]: SceneDef<SceneProps[Kind]> }> = {
  title, stat, bars, compare, list, changelog, flow, code, terminal, diff, chat, kinetic, outro, tokens, layers, grid,
  demo, predict, quantity, evidence, scale, split,
};
