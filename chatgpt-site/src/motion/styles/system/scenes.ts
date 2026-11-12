import { clamp, type SceneProps, type SceneDef, type Frame, type LayoutFrame } from '../../core.ts';
import { bars, beat, box, command, PANEL, process, progress, prose, RAIL_Y, rows, state } from './draw.ts';

type Skin = { [Kind in Exclude<keyof SceneProps, 'special'>]: SceneDef<SceneProps[Kind]> };
export { process } from './draw.ts';

function number(frame: Frame, label: string, value: string) { command(frame, label, value, true); }

export const scenes: Skin = {
  title: { type: 'title', render(frame, props) {
    const matched = props.text.match(/^(\d+)\s+(.+)$/);
    if (matched) number(frame, matched[2]!, matched[1]!);
    else command(frame, props.text, undefined, progress(frame, 0) > 0);
  } },
  stat: { type: 'stat', render(frame, props) {
    const amount = frame.opening ? 1 : progress(frame, 0, .32);
    const value = (props.from ?? props.value) + (props.value - (props.from ?? props.value)) * amount;
    frame.ctx.save();
    if (props.slam) { const scale = 1 + Math.sin(clamp((frame.t - beat(frame, 0)) / .28) * Math.PI) * .045; const cx = PANEL.x + PANEL.w / 2, cy = PANEL.y + PANEL.h / 2; frame.ctx.translate(cx, cy); frame.ctx.scale(scale, scale); frame.ctx.translate(-cx, -cy); }
    number(frame, props.label, `${props.prefix ?? ''}${value.toLocaleString('en-US', { maximumFractionDigits: props.decimals ?? 0 })}${props.suffix ?? ''}`);
    frame.ctx.restore();
  } },
  bars: { type: 'bars', render: (frame, props) => bars(frame, props.title ?? '', props.items, props.unit) },
  flow: { type: 'flow', render: (frame, props) => process(frame, '', props.nodes) },
  list: { type: 'list', render: (frame, props) => rows(frame, props.items.map(label => ({ label })), props.title ?? '') },
  compare: { type: 'compare', render(frame, props) { const side = state(frame, 2) ? props.right : props.left; command(frame, side?.label ?? '', side?.points?.join(' · '), true); } },
  changelog: { type: 'changelog', render: (frame, props) => rows(frame, props.items.map(item => ({ label: item.text })), props.product ?? '') },
  terminal: { type: 'terminal', render: (frame, props) => rows(frame, props.lines.map(item => ({ label: item.cmd ? `> ${item.cmd}` : item.out ?? '', detail: item.cmd ? item.out : undefined })), '') },
  code: { type: 'code', render(frame, props) { const lines = props.code.split('\n').filter(Boolean); command(frame, lines[state(frame, lines.length)] ?? '', props.note, true); } },
  diff: { type: 'diff', render(frame, props) { const after = state(frame, 2) > 0; command(frame, after ? 'Patch' : 'Before', (after ? props.added : props.removed)?.[0], after); } },
  tokens: { type: 'tokens', render(frame, props) { command(frame, props.text, state(frame, 2) ? props.predict?.[0]?.token : undefined, true); } },
  chat: { type: 'chat', render(frame, props) { command(frame, props.messages[state(frame, props.messages.length)]?.text ?? '', undefined, true); } },
  layers: { type: 'layers', render(frame, props) {
    const index = state(frame, props.layers.length); const selected = props.layers[index]; const focused = props.focus === undefined || index >= props.focus;
    command(frame, selected?.label ?? '', focused ? selected?.note : undefined, focused);
  } },
  grid: { type: 'grid', render(frame, props) {
    const total = Math.min(64, props.rows * props.cols); box(frame);
    for (let index = 0; index < total; index++) { frame.ctx.fillStyle = index < total * progress(frame, 0, .6) ? frame.theme.accent : frame.theme.line; frame.ctx.fillRect(152 + index % 8 * 84, 520 + Math.floor(index / 8) * 44, 56, 24); }
  } },
  kinetic: { type: 'kinetic', render(frame, props) { command(frame, props.words[state(frame, props.words.length)] ?? '', undefined, true); } },
  outro: { type: 'outro', render(frame, props) { command(frame, props.cta, frame.t >= beat(frame, 1) ? props.sub : undefined, true); } },
  demo: { type: 'demo', render(frame, props) {
    const resolved = frame.t >= beat(frame, Math.max(1, (frame.events?.length ?? 0) - 1));
    command(frame, props.target ?? '', resolved ? props.after : props.before, true, props.actor);
  } },
  predict: { type: 'predict', render(frame, props) {
    const stage = state(frame, 3);
    command(frame, stage === 2 ? props.correction ?? props.answer : props.question, stage === 1 ? props.guesses?.[0] : stage === 2 && props.correction ? props.answer : undefined, stage === 2);
  } },
  quantity: { type: 'quantity', render(frame, props) {
    const subset = state(frame, 2) > 0;
    command(frame, subset ? props.unit ?? '' : props.comparator?.label ?? '', ((subset ? props.subset : props.quantity) ?? 0).toLocaleString('en-US'), true, undefined, false);
    // Objects stand for the quantity; the excluded remainder drops out of the set on the subset event.
    const total = Math.min(48, Math.ceil((props.quantity ?? 0) / (props.scale ?? 1))); const selected = Math.round(total * (props.subset ?? 0) / Math.max(1, props.quantity ?? 0));
    const drop = progress(frame, 1, .36);
    for (let index = 0; index < total; index++) {
      const out = subset && index >= selected;
      frame.ctx.fillStyle = out ? frame.theme.line : frame.theme.accent;
      frame.ctx.fillRect(PANEL.x + 56 + index % 16 * 48, RAIL_Y - 24 + Math.floor(index / 16) * 40 + (out ? drop * 24 : 0), 32, 24);
    }
  } },
  evidence: { type: 'evidence', render(frame, props) {
    const revealed = frame.t >= beat(frame, 0); command(frame, revealed ? props.quote ?? props.claim : props.claim ?? '', undefined, revealed, undefined, false);
    if (props.asset && frame.assets[props.asset] && props.rect) { const crop = props.rect; frame.ctx.drawImage(frame.assets[props.asset]!, crop.x, crop.y, crop.w, crop.h, PANEL.x + 56, PANEL.y + 360, PANEL.w - 112, 250); }
    prose(frame, `${props.source ?? ''} ${props.date ?? ''}`.trim(), PANEL.x + 56, RAIL_Y, PANEL.w - 112, 72, 1, frame.theme.dim, 72);
  } },
  scale: { type: 'scale', render(frame, props) { const level = props.levels[state(frame, props.levels.length)]; number(frame, level?.label ?? '', `${level?.value ?? 0} ${props.unit ?? ''}`); } },
  split: { type: 'split', render(frame, props) { const stage = state(frame, 3); const side = stage ? props.right : props.left; command(frame, stage === 2 ? props.answer ?? '' : side?.label ?? '', stage === 2 ? undefined : side?.value, stage > 0); } },
};

for (const scene of Object.values(scenes)) scene.layout = (frame: LayoutFrame) => {
  frame.objects.current.set('system-panel', { id: 'system-panel', kind: 'panel', rect: { ...PANEL } });
};
