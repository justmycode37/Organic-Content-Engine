import { clamp, ease, stripMarkup, type Frame, type LayoutFrame, type SceneBase } from '../../core.ts';
import { interpolateRect, place, previous } from '../../fx/objects.ts';
import { BODY, World, beatIndex, label, lines, wrap, type Place } from './engine.ts';

export const DISTRICTS: Record<Place, { x: number; y: number }> = {
  'SERVER CITY': { x: 0, y: 0 }, 'THE LAB': { x: 7, y: -7 },
  'THE MARKET': { x: 14, y: -14 }, CAPITOL: { x: 21, y: -21 }, 'THE HARBOR': { x: 28, y: -28 },
};

export function beatAt(frame: Pick<Frame, 'events' | 'hits' | 'dur'>, target: string, index = 0) {
  const events = frame.events ?? [];
  return events.find(event => event.target === target)?.at ?? events[index]?.at ?? frame.hits?.[index] ?? frame.dur * (index + 1) / (Math.max(3, index + 2));
}

export function response(frame: Frame, target: string, index = 0, seconds = 0.3) {
  return ease.inOutCubic(clamp((frame.t - beatAt(frame, target, index)) / seconds));
}

export function actorLayout(frame: LayoutFrame, props: Partial<SceneBase> = {}) {
  const words: string[] = stripMarkup(props.say ?? '').toLowerCase().match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? [];
  const events = (props.events ?? []).map(event => ({ ...event, at: event.at ?? frame.dur * Math.max(0, words.indexOf(stripMarkup(event.word ?? '').toLowerCase())) / Math.max(1, words.length) }));
  const travel = events.find(event => event.target === 'travel')?.at ?? frame.dur * 0.35;
  const progress = ease.inOutCubic(clamp((frame.t - travel) / 0.6));
  let destination = { x: 600 - progress * 130, y: 955 - progress * 65, w: 172, h: 195 };
  const wall = events.find(event => event.target === 'wall');
  if (wall) {
    const approach = ease.outCubic(clamp(frame.t / Math.max(0.1, wall.at)));
    const recoil = Math.sin(clamp((frame.t - wall.at) / 0.22) * Math.PI) * 0.3;
    const crossing = ease.inOutCubic(clamp((frame.t - travel) / 0.35));
    const actorY = 1.45 - approach * 1.3 + recoil - crossing * 1.6;
    const offset = frame.index ? (1 - ease.inOutCubic(clamp(frame.t / 0.75))) * 0.8 : 0;
    destination = { x: 540 + offset * 360 + (0.45 - actorY) * 150 - 86, y: 1110 + (0.45 + actorY) * 75 - 195, w: 172, h: 195 };
  }
  const carried = previous(frame, 'BIT')?.rect;
  const handoff = wall ? Math.min(0.65, Math.max(0.1, wall.at)) : 0.65;
  place(frame, 'BIT', carried ? interpolateRect(carried, destination, ease.inOutCubic(clamp(frame.t / handoff))) : destination, 'hero');
  place(frame, 'place', { x: 200, y: 665, w: 680, h: 330 }, 'target');
}

const screens = new WeakMap<object, DOMMatrix>();
/** Records the screen transform before the camera runs; headings return to it so preview scales keep working. */
export function rememberScreen(ctx: Frame['ctx']) { screens.set(ctx, ctx.getTransform()); }
export function toScreen(ctx: Frame['ctx']) { const matrix = screens.get(ctx); if (matrix) ctx.setTransform(matrix); else ctx.setTransform(1, 0, 0, 1, 0, 0); }

export function heading(frame: Frame, title: string, detail = '') {
  frame.ctx.save();
  toScreen(frame.ctx);
  // Two-row titles drop 40 px so their first row clears the MINI WORLD wordmark.
  const drop = wrap(frame.ctx, title, 780, 96, 2).rows.length > 1 ? 40 : 0;
  frame.ctx.fillStyle = frame.theme.bg;
  frame.ctx.fillRect(0, 0, 1080, (detail ? 640 : 560) + drop);
  lines(frame.ctx, title, 540, 450 + drop, 780, 96, frame.theme.fg, 2);
  if (detail) label(frame.ctx, detail, 540, 578 + drop, 760, 72, frame.theme.dim, 'center', BODY);
  frame.ctx.restore();
}

/** `shift` moves the whole close-up sideways on screen, e.g. to keep a consequence clear of the right-hand UI column. */
export function stage(frame: Frame, district: Place = 'SERVER CITY', unit = 150, shift = 0) {
  const destination = DISTRICTS[district];
  const travel = ease.inOutCubic(clamp(frame.t / 0.75));
  const offset = frame.index ? (1 - travel) * 0.8 : 0;
  const world = new World(frame, { x: 540 + shift + offset * 360 - (destination.x - destination.y) * unit, y: 1110 }, unit);
  // One diorama tile per district: its top stays paper-coloured for contrast, its clay lip shows the world is a miniature.
  world.colors.ground = { ...world.colors.ground, top: frame.theme.bg };
  world.box(destination.x - 3, destination.y - 3, -0.35, 6, 6, 0.35, 'ground');
  return { world, x: destination.x, y: destination.y };
}

export function bit(frame: Frame, world: World, x = 0.5, y = 0.8) {
  const actor = frame.objects?.current.get('BIT')?.rect;
  if (!actor) { world.bit(x, y, true); return; }
  const scale = actor.w / (world.unit * 1.24);
  const actorFrame = { ...frame, ctx: frame.ctx };
  const actorWorld = new World(actorFrame, { x: actor.x + actor.w / 2, y: actor.y + actor.h + world.unit * scale * 0.31 }, world.unit * scale);
  actorWorld.bit(-0.33, -0.29, true);
  world.add(x + y + 2, () => actorWorld.flush());
}

export function gateState(frame: Frame) {
  return { contact: response(frame, 'wall', 0, 0.18), key: response(frame, 'key', 1, 0.32), open: response(frame, 'gate', 2, 0.4), through: response(frame, 'travel', 3, 0.35) };
}

export function gate(frame: Frame, title: string) {
  const { world, x, y } = stage(frame);
  const state = gateState(frame);
  world.rack(x - 0.3, y - 2.7, 2.7, false, 0.3 + state.open * 0.7);
  const recoil = Math.sin(state.contact * Math.PI) * 0.35;
  world.box(x - 2.6, y - 0.4 - recoil * 0.2, 0, 5.2, 0.3, 1.65 * (1 - state.open), 'teal');
  const actorY = y + 0.05 + recoil - state.through * 1.8;
  bit(frame, world, x + 0.45, actorY);
  if (state.key > 0 && state.open < 1) {
    const keyHeight = 3 * (1 - state.key) ** 2;
    world.cylinder(x + 1.45, y + 0.2, 0.4 + keyHeight, 0.2, 0.12, 'key');
    world.box(x + 1.42, y + 0.2, 0.4 + keyHeight, 0.13, 0.7, 0.12, 'key');
    world.box(x + 1.42, y + 0.7, 0.4 + keyHeight, 0.3, 0.14, 0.12, 'key');
  }
  world.flush();
  heading(frame, title);
}

export function patchState(frame: Frame) {
  return { reach: response(frame, 'patch', 0, 0.45), repaired: response(frame, 'lights', 1, 0.5), release: response(frame, 'travel', 2, 0.5) };
}

export function patch(frame: Frame, title: string, detail = '') {
  const { world, x, y } = stage(frame, 'THE LAB', 150, -25);
  const state = patchState(frame);
  world.box(x - 2.1, y - 1.9, 0, 1.5, 1.2, 0.75, 'teal');
  world.ada(x - 1.1, y + 0.45, false, 0, Math.sin(state.reach * Math.PI));
  world.rack(x + 0.4, y - 1.35, 2.8, false, 0);
  for (let light = 0; light < 5; light++) {
    const calm = state.repaired >= (light + 1) / 5;
    world.box(x + 0.53, y - 0.55, 0.4 + light * 0.42, 0.25, 0.05, 0.13, calm ? 'clay' : 'alarm');
  }
  const progress = state.reach;
  world.box(x - 0.5 + progress * 1.05, y + 0.5 - progress * 1.05, 1 + Math.sin(progress * Math.PI) * 0.4, 0.36, 0.14, 0.3, progress < 1 ? 'key' : 'clay');
  bit(frame, world, x + 1.4, y + 0.7);
  world.flush();
  heading(frame, title, detail);
}

export function towerState(frame: Frame, items: { value: number }[]) {
  const times = [0, ...items.slice(1).map((_, index) => beatAt(frame, `level-${index + 1}`, index))];
  const current = Math.max(0, beatIndex(frame.t, times));
  const maximum = Math.max(1, ...items.map(item => item.value));
  return { current, at: times[current], now: items[current]?.value ?? 0, before: items[Math.max(0, current - 1)]?.value ?? 0, maximum };
}

export function tower(frame: Frame, title: string, items: { label: string; value: number }[], detail?: string) {
  const list = items.length ? items : [{ label: 'NO DATA', value: 0 }];
  const state = towerState(frame, list);
  const progress = ease.inOutCubic(clamp((frame.t - state.at) / 0.45));
  const value = state.before + (state.now - state.before) * progress;
  const { world, x, y } = stage(frame, 'THE MARKET', 140);
  const levels = 10;
  const kept = state.now / state.maximum * levels;
  const before = state.before / state.maximum * levels;
  const height = 4.0;
  for (let index = 0; index < Math.ceil(Math.max(kept, before)); index++) {
    const retained = Math.max(0, Math.min(1, kept - index));
    const old = Math.max(0, Math.min(1, before - index));
    const fragment = old + (retained - old) * progress;
    if (fragment <= 0) continue;
    const discard = retained === 0 ? progress : 0;
    world.box(x - 1.15 + discard * 3, y - 1.7, index * height / levels - discard * discard * 2, 1.7, 1.2, height / levels * 0.9 * fragment, retained ? 'key' : 'teal');
  }
  const funnel = 2.4 * (0.5 + value / state.maximum * 0.5);
  world.box(x - funnel / 2 - 0.2, y + 0.15, 0.5, 0.18, 0.8, 1.2, 'teal');
  world.box(x + funnel / 2 - 0.2, y + 0.15, 0.5, 0.18, 0.8, 1.2, 'teal');
  bit(frame, world, x + 1, y + 0.7);
  world.flush();
  heading(frame, state.now.toLocaleString('en-US'), detail ?? `${list[state.current].label} ${title === 'FUNNEL' ? '' : title}`.trim());
}

export function delivery(frame: Frame, title: string, district: Place = 'SERVER CITY', detail = '', slam = false) {
  const { world, x, y } = stage(frame, district);
  const reveal = response(frame, 'cargo', 0, 0.4), connect = response(frame, 'connect', 1, 0.4);
  if (district === 'THE HARBOR') {
    world.box(x - 4, y - 3, 0, 8, 1.3, 0.08, 'teal');
    world.box(x - 1 + connect * 2, y - 2.5, 0.1, 2.2, 0.9, 0.4, 'clay');
    for (let index = 0; index < 4; index++) world.ada(x - 1.8 + index * 0.6, y - index * 0.3, true);
  } else if (district === 'CAPITOL') {
    world.box(x - 2, y - 2.4, 0, 3, 1.2, 1.3, 'teal');
    world.prism(x - 2.2, y - 2.5, 1.3, 3.4, 1.4, 0.8);
  } else if (district === 'THE LAB') {
    world.box(x - 1.9, y - 2.2, 0, 2.1, 1.2, 1, 'teal');
    world.ada(x - 1.4, y + 0.2, false, 0, connect);
  } else if (district === 'THE MARKET') {
    world.box(x - 1.5, y - 2.3, 0, 1.2, 1.2, 1.6, 'teal');
  } else {
    world.rack(x - 1.3, y - 2, 2.8, false, connect);
  }
  const landed = slam ? response(frame, 'amount', 0, 0.2) : reveal;
  const compression = slam ? Math.sin(landed * Math.PI) * 0.18 : 0;
  world.box(x - 0.8 + connect * 0.7, y + 0.3 - connect * 1.3, 0.2 + (1 - landed) * 2.4, 0.8 + compression, 0.6 + compression, 0.6 - compression, 'key');
  bit(frame, world, x + 1, y + 0.7);
  world.flush();
  heading(frame, title, detail);
}

export function journey(frame: Frame, stations: string[]) {
  const list = stations.length ? stations : ['SCOUT', 'PATCH'];
  const times = [0, ...list.slice(1).map((_, index) => beatAt(frame, `station-${index + 1}`, index))];
  const current = Math.max(0, beatIndex(frame.t, times));
  const progress = response(frame, `station-${Math.max(1, current)}`, Math.max(0, current - 1), 0.55);
  const position = current ? current - 1 + progress : 0;
  const world = new World(frame, { x: 540 - position * 1000, y: 1090 }, 145);
  world.colors.ground.top = frame.theme.bg;
  for (let index = 0; index < list.length; index++) {
    const offset = index * 3.45;
    world.rack(offset - 0.8, -offset - 1.7, 2.5, index === current, index <= current ? 1 : 0);
    if (index === list.length - 1) world.ada(offset - 1.3, -offset + 0.5, false, 0, progress);
  }
  world.box(position * 3.45 - 0.2, -position * 3.45 + 0.3, 0.2, 0.6, 0.5, 0.6, 'key');
  bit(frame, world, position * 3.45 + 1, -position * 3.45 + 0.7);
  world.flush();
  heading(frame, list[current]);
}

export function notice(frame: Frame, title: string, entries: string[], district: Place = 'CAPITOL') {
  const list = entries.filter(Boolean);
  const times = [0, ...list.slice(1).map((_, index) => beatAt(frame, `entry-${index + 1}`, index))];
  const current = Math.max(0, beatIndex(frame.t, times));
  delivery(frame, list[current] ?? title, district);
}

export function semantic(frame: Frame, type: string, props: Record<string, any>) {
  if (type === 'demo') { gate(frame, frame.t < beatAt(frame, 'gate', 2) ? props.before ?? props.action ?? 'TRY THE GATE' : props.after ?? 'GATE OPEN'); return; }
  if (type === 'scale') { tower(frame, props.reference === 'COST PER BUG' ? 'USD/BUG' : props.unit ?? 'SCALE', props.levels ?? []); return; }
  if (type === 'quantity') {
    const subset = response(frame, 'subset', 0, 0.5);
    const compared = frame.t >= beatAt(frame, 'connect', 1);
    const { world, x, y } = stage(frame, 'THE MARKET', 135, -60);
    const total = Math.max(0, props.quantity ?? 0), scale = Math.max(1, props.scale ?? Math.ceil(total / 30), Math.ceil(total / 36));
    const selectedValue = Math.min(total, compared ? props.comparator?.value ?? 0 : props.subset ?? 0);
    const groups = [selectedValue, total - selectedValue];
    groups.forEach((amount, group) => {
      const tokens = Math.min(36, Math.ceil(amount / scale));
      for (let index = 0; index < tokens; index++) {
        const angle = index * 2.4, radius = Math.sqrt(index) * 0.7;
        // The subset leaves the pile to the front left, away from BIT and in front of the rest, so the extraction stays visible.
        const offsetX = group === 0 ? -0.5 * subset : Math.cos(angle) * radius;
        const offsetY = group === 0 ? -1 + 2.2 * subset : Math.sin(angle) * radius - 1;
        world.cylinder(x + offsetX, y + offsetY, 0, 0.32, Math.min(scale, amount - index * scale) / scale * 0.8, group === 0 ? 'key' : 'teal');
      }
    });
    bit(frame, world, x + 1.8, y + 0.8); world.flush();
    heading(frame, `${Math.round(props.quantity ?? 0).toLocaleString('en-US')}`, `${selectedValue} ${compared ? props.comparator?.label ?? '' : props.unit ?? 'SUBSET'}`);
    frame.ctx.save(); toScreen(frame.ctx);
    label(frame.ctx, `1 DRUM ≈ ${scale}`, 540, 1262, 760, 64, frame.theme.fg, 'center', BODY);
    frame.ctx.restore(); return;
  }
  if (type === 'evidence') {
    const revealed = frame.t >= beatAt(frame, 'evidence', 0);
    delivery(frame, revealed ? props.quote ?? props.claim ?? 'SOURCE' : props.source ?? 'SOURCE', 'CAPITOL', revealed ? `${props.source ?? ''} · ${props.date ?? ''}` : ''); return;
  }
  if (type === 'predict') {
    const answer = frame.t >= beatAt(frame, 'answer', 0);
    delivery(frame, answer ? props.answer ?? 'ANSWER' : props.question ?? 'WHAT CHANGES?', 'THE LAB', answer ? props.comparison?.value ?? '' : ''); return;
  }
  if (type === 'split') {
    const right = frame.t >= beatAt(frame, 'compare', 0), answer = frame.t >= beatAt(frame, 'answer', 1);
    const leftValue = Number(String(props.left?.value ?? '').replace(/[^\d.]/g, ''));
    const rightValue = Number(String(props.right?.value ?? '').replace(/[^\d.]/g, ''));
    if (Number.isFinite(leftValue) && Number.isFinite(rightValue) && leftValue > 0) {
      // The answer replaces the label under the settled right value instead of being appended to it.
      tower(frame, '', [{ label: props.left?.label ?? 'BEFORE', value: leftValue }, { label: props.right?.label ?? 'AFTER', value: rightValue }], answer ? props.answer ?? props.right?.label ?? 'AFTER' : undefined);
    } else delivery(frame, answer ? props.answer ?? 'THE DIFFERENCE' : (right ? props.right?.value : props.left?.value) ?? 'COMPARE', 'THE MARKET', answer ? '' : (right ? props.right?.label : props.left?.label) ?? '');
  }
}

export function layers(frame: Frame, props: { title?: string; layers?: { label: string; accent?: boolean }[]; focus?: number }) {
  const entries = props.layers?.length ? props.layers.slice(0, 5) : [{ label: 'NO DATA' }];
  const focus = Math.max(0, Math.min(entries.length - 1, props.focus ?? entries.findIndex(item => item.accent)));
  const selected = response(frame, 'focus', 0, 0.45);
  const { world, x, y } = stage(frame, 'THE LAB');
  entries.forEach((entry, index) => {
    const active = index === focus;
    world.box(x - 1.4 + (active ? selected : 0), y - 1.4 + (active ? selected : 0), index * 0.6, 1.8, 1.2, 0.4, active ? 'key' : 'clay');
  });
  bit(frame, world, x + 1, y + 0.7); world.flush();
  heading(frame, entries[focus].label, props.title ?? '');
}
