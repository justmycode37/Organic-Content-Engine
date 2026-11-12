import { clamp, ease, type Frame, type SceneDef, type SceneProps } from '../../core.ts';
import { place } from '../../fx/objects.ts';
import { BODY, SUPPORT, copy, fit, rect, slam } from './draw.ts';

export function beat(frame: Frame, count = 3) {
  const events = frame.events ?? [];
  const index = events.length ? events.filter(event => event.at <= frame.t).length : Math.floor(frame.t / 0.8);
  return Math.min(Math.max(0, count - 1), index);
}

function beatProgress(frame: Frame, index: number) {
  const event = frame.events?.[index];
  return clamp((frame.t - (event?.at ?? (index + 1) * 0.8)) / 0.24);
}

/** Content column: x 140–856 (a 12% slam around x 498 still clears 96–900); headline box from y 360 down to `bottom`; captions own y 996–1240. */
const LEFT = 140, WIDTH = 716, TOP = 360, CENTRE = LEFT + WIDTH / 2;

/** One headline sized to fill its box (up to 330px Anton), with an optional supporting line under it. Returns the headline's bottom edge. */
export function headline(frame: Frame, title: string, sub = '', bottom = 920) {
  const room = (sub ? bottom - 140 : bottom) - TOP;
  const size = fit(frame, title, WIDTH, room, 330);
  const height = slam(frame, 0, () => copy(frame, title, LEFT, TOP, WIDTH, room, size, frame.theme.fg, undefined, 1), 1, TOP + room / 2, CENTRE);
  if (sub) copy(frame, sub, LEFT, TOP + height + 28, WIDTH, 112, SUPPORT, frame.theme.fg, BODY);
  return TOP + height;
}

/** Unit above, hero value filling the column (up to 340px), comparison below. */
export function number(frame: Frame, value: string, unit: string, comparison = '', impact = true) {
  const top = Math.max(496, TOP + copy(frame, unit, LEFT, TOP, WIDTH, 220, SUPPORT, frame.theme.fg, BODY) + 28);
  const room = Math.min(340, (comparison ? 840 : 960) - top);
  const size = fit(frame, value, WIDTH, room, 340, 180);
  const draw = () => copy(frame, value, LEFT, top, WIDTH, room, size, frame.theme.accent, undefined, 1);
  const height = impact ? slam(frame, 0, draw, 1, top + size / 2, CENTRE) : draw();
  if (comparison) copy(frame, comparison, LEFT, top + height + 20, WIDTH, 112, SUPPORT, frame.theme.fg, BODY);
}

/** Signal underline that slams in under the spoken highlight. */
function marker(frame: Frame, y: number, index = 0) {
  const progress = ease.outExpo(beatProgress(frame, index));
  rect(frame, LEFT, y, WIDTH * progress, 18, frame.theme.accent);
}

export function stack(frame: Frame, items: string[], title = '') {
  const values = items.length ? items : ['NO DATA'];
  headline(frame, values[beat(frame, values.length)] ?? '', title);
}

const scene = <Kind extends keyof Omit<SceneProps, 'special'>>(type: Kind, render: SceneDef<SceneProps[Kind]>['render']): SceneDef<SceneProps[Kind]> => ({
  type,
  layout(frame) { place(frame, 'subject', { x: LEFT, y: TOP, w: WIDTH, h: 600 }, 'hero'); },
  render,
});

export const scenes: { [Kind in Exclude<keyof SceneProps, 'special'>]: SceneDef<SceneProps[Kind]> } = {
  title: scene('title', (frame, props) => {
    const pages = [props.text, props.sub].filter(Boolean) as string[];
    const completed = frame.events?.filter(event => event.at <= frame.t) ?? [];
    const revealed = completed.some(event => event.kind === 'reveal' || event.kind === 'resolve');
    const current = frame.events?.length ? Number(revealed) : beat(frame, pages.length);
    const bottom = headline(frame, pages[Math.min(current, pages.length - 1)] ?? 'NO DATA', '', 900);
    const highlight = frame.events?.findIndex(event => event.kind === 'highlight') ?? -1;
    if (!revealed && highlight >= 0 && completed.includes(frame.events[highlight]!)) marker(frame, bottom + 20, highlight);
  }),
  kinetic: scene('kinetic', (frame, props) => stack(frame, props.words ?? [])),
  stat: scene('stat', (frame, props) => {
    const previous = props.versus && beat(frame, 2) === 0;
    const value = previous ? props.versus!.value : props.value ?? 0;
    number(frame, `${props.prefix ?? ''}${value.toLocaleString('en-US', { maximumFractionDigits: props.decimals ?? 0 })}${props.suffix ?? ''}`, previous ? props.versus!.label : props.label ?? '', props.versus && !previous ? `VS ${props.prefix ?? ''}${props.versus.value.toLocaleString('en-US')}${props.suffix ?? ''}` : '', props.slam ?? false);
  }),
  bars: scene('bars', (frame, props) => {
    const items = props.items ?? [];
    const selected = items[beat(frame, items.length)];
    if (!selected) return;
    const current = beat(frame, items.length);
    number(frame, `${selected.value.toLocaleString('en-US')}${props.unit ?? ''}`, selected.label);
    const maximum = Math.max(1, ...items.map(item => Math.abs(item.value)));
    const width = WIDTH * Math.abs(selected.value) / maximum;
    // The funnel narrows physically: the bar shrinks to the new value and the cut-off share drops away.
    const before = current > 0 ? WIDTH * Math.abs(items[current - 1]!.value) / maximum : width;
    const cut = ease.outExpo(beatProgress(frame, current - 1));
    rect(frame, LEFT, 900, WIDTH, 8, frame.theme.fg);
    rect(frame, LEFT, 880, before + (width - before) * cut, 52, frame.theme.accent);
    if (before > width && cut < 1) {
      frame.ctx.globalAlpha = 1 - cut;
      rect(frame, LEFT + width, 880 + cut * 90, before - width, 52, frame.theme.fg);
      frame.ctx.globalAlpha = 1;
    }
  }),
  compare: scene('compare', (frame, props) => {
    const side = beat(frame, 2) > 0 ? props.right : props.left;
    headline(frame, side?.points?.join('\n') ?? '', side?.label ?? '');
  }),
  list: scene('list', (frame, props) => stack(frame, props.items ?? [])),
  flow: scene('flow', (frame, props) => {
    const nodes = props.nodes ?? [];
    const current = beat(frame, nodes.length);
    const latest = frame.events?.filter(event => event.at <= frame.t).at(-1)?.at ?? current * 0.8;
    const travel = ease.outExpo(clamp((frame.t - latest) / 0.22));
    const start = nodes.length > 1 ? (current - (current > 0 ? 1 - travel : 0)) / (nodes.length - 1) : 1;
    rect(frame, LEFT, 900, WIDTH, 8, frame.theme.fg);
    rect(frame, LEFT, 900, (WIDTH - 64) * start, 8, frame.theme.accent);
    rect(frame, LEFT + (WIDTH - 64) * start, 872, 64, 64, frame.theme.accent);
    headline(frame, nodes[current]?.label ?? '', '', 840);
  }),
  changelog: scene('changelog', (frame, props) => stack(frame, (props.items ?? []).map(item => item.text))),
  terminal: scene('terminal', (frame, props) => stack(frame, (props.lines ?? []).flatMap(line => [line.cmd, line.out].filter(Boolean) as string[]))),
  code: scene('code', (frame, props) => stack(frame, (props.code ?? '').split('\n').filter(Boolean))),
  diff: scene('diff', (frame, props) => stack(frame, [...(props.removed ?? []).map(line => `− ${line}`), ...(props.added ?? []).map(line => `+ ${line}`)])),
  chat: scene('chat', (frame, props) => stack(frame, (props.messages ?? []).map(message => message.text))),
  tokens: scene('tokens', (frame, props) => stack(frame, [props.text, ...(props.predict ?? []).map(item => `${item.token} ${Math.round(item.p * 100)}%`)].filter(Boolean))),
  layers: scene('layers', (frame, props) => {
    const layers = props.layers ?? [];
    const current = beat(frame, layers.length);
    for (let index = 0; index < layers.length; index++) {
      const focused = props.focus === undefined ? index === current : beat(frame, 2) > 0 ? index === props.focus : index === current;
      frame.ctx.globalAlpha = focused ? 1 : 0.1;
      rect(frame, LEFT + index * 10, 296 + index * 22, WIDTH - index * 20, 14, frame.theme.fg);
    }
    frame.ctx.globalAlpha = 1;
    const focused = props.focus !== undefined && beat(frame, 2) > 0 ? layers[props.focus] : layers[current];
    headline(frame, focused?.label ?? '', focused?.note ?? '');
  }),
  grid: scene('grid', (frame, props) => {
    const rows = clamp(props.rows ?? 2, 2, 16), columns = clamp(props.cols ?? 2, 2, 16);
    const side = Math.min(580 / rows, 732 / columns);
    const active = beat(frame, rows * columns);
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
      rect(frame, 132 + column * side, 380 + row * side, side - 6, side - 6, row * columns + column === active ? frame.theme.accent : frame.theme.fg);
    }
  }),
  outro: scene('outro', (frame, props) => { headline(frame, props.cta ?? '', beat(frame, 2) > 0 ? props.sub ?? '' : ''); }),
  demo: scene('demo', (frame, props) => {
    const current = beat(frame, 3);
    const travel = ease.outExpo(beatProgress(frame, 0));
    if (current < 2) {
      rect(frame, LEFT + travel * 374, 852, 96, 96, frame.theme.accent);
      frame.ctx.strokeStyle = frame.theme.fg;
      frame.ctx.lineWidth = 12;
      frame.ctx.strokeRect(LEFT + 480, 824, 236, 152);
    } else {
      const consequence = ease.outExpo(beatProgress(frame, 1));
      rect(frame, LEFT + 480 - consequence * 480, 824, 236 + consequence * 480, 152, frame.theme.accent);
    }
    const bottom = headline(frame, current === 2 ? props.after : current === 1 ? props.action : props.before, '', 660);
    copy(frame, current === 0 ? props.actor : props.target, LEFT, bottom + 24, WIDTH, 112, SUPPORT, frame.theme.fg, BODY);
  }),
  predict: scene('predict', (frame, props) => {
    const current = beat(frame, 3);
    if (current === 0) headline(frame, props.question ?? '');
    else if (current === 1) headline(frame, props.guesses?.join(' / ') ?? '');
    else number(frame, props.answer ?? '', props.correction ?? '', props.comparison ? `${props.comparison.label}: ${props.comparison.value}` : '');
  }),
  quantity: scene('quantity', (frame, props) => {
    const extracted = beat(frame, 2) > 0;
    const quantity = Math.max(0, props.quantity ?? 0);
    const subset = clamp(props.subset ?? 0, 0, quantity);
    const cells = Math.min(100, Math.ceil(quantity));
    const colored = quantity ? Math.round(cells * subset / quantity) : 0;
    const extraction = ease.outExpo(beatProgress(frame, 0));
    copy(frame, `${extracted ? subset : quantity} ${props.unit ?? ''}`, LEFT, 332, WIDTH, 160, 112);
    for (let index = 0; index < cells; index++) {
      frame.ctx.globalAlpha = extracted && index >= colored ? 1 - extraction : 1;
      rect(frame, 132 + index % 10 * 72, 540 + Math.floor(index / 10) * 38 + (extracted && index >= colored ? extraction * 48 : 0), 60, 26, extracted && index < colored ? frame.theme.accent : frame.theme.fg);
    }
    frame.ctx.globalAlpha = 1;
    const relation = beat(frame, 3) === 2 && props.comparator ? `VS ${props.comparator.value} ${props.comparator.label}` : `1 TILE ≈ ${(cells ? quantity / cells : 0).toLocaleString('en-US', { maximumFractionDigits: 1 })}`;
    copy(frame, relation, LEFT, 880, WIDTH, 112, SUPPORT, frame.theme.fg, BODY);
  }),
  evidence: scene('evidence', (frame, props) => {
    const current = beat(frame, 3);
    if (props.asset && current < 2) {
      const image = frame.assets[props.asset];
      if (!image || !props.rect) { headline(frame, 'SOURCE IMAGE MISSING'); return; }
      const crop = props.rect;
      const progress = ease.outExpo(beatProgress(frame, 0));
      const sourceX = crop.x * progress, sourceY = crop.y * progress;
      const sourceWidth = image.width + (crop.w - image.width) * progress;
      const sourceHeight = image.height + (crop.h - image.height) * progress;
      const ratio = Math.min(732 / sourceWidth, 500 / sourceHeight);
      frame.ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 132, 360, sourceWidth * ratio, sourceHeight * ratio);
      copy(frame, props.claim ?? '', LEFT, 870, WIDTH, 112, SUPPORT, frame.theme.fg, BODY);
      return;
    }
    const text = current === 0 ? props.claim : current === 1 ? props.quote ?? props.claim : props.source;
    const bottom = headline(frame, text ?? '', current === 2 ? props.date : '', 880);
    if (current === 1) marker(frame, bottom + 20, 0);
  }),
  scale: scene('scale', (frame, props) => {
    const levels = props.levels ?? [];
    const current = beat(frame, levels.length);
    const level = levels[current];
    if (!level) return;
    const reference = levels[0]?.value ?? 1;
    number(frame, level.value.toLocaleString('en-US'), `${level.label} ${props.unit ?? ''}`, reference > 0 && current > 0 ? `${(level.value / reference).toFixed(1)}× ${props.reference}` : props.reference);
  }),
  split: scene('split', (frame, props) => {
    const current = beat(frame, 3);
    // The answer stands alone: the axis label would be a second read path next to the verdict.
    if (current === 2) headline(frame, props.answer ?? '');
    else {
      const side = current === 0 ? props.left : props.right;
      number(frame, side?.value ?? '', side?.label ?? '', props.baseline ?? '');
    }
  }),
};
