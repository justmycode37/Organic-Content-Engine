import { CONTENT_BOTTOM, SAFE, clamp, ease, prog, type Cue, type Frame, type ObjectProps, type SceneDef } from '../core.ts';
import { fitPixel, pixelBlock, pixelHeight, pixelText, pixelWidth, text, textWidth, wrapText } from '../prim.ts';
import { dither } from '../pix.ts';
import { project, render3d, type Vec3 } from '../three.ts';
import { modelParts, modelScale } from '../models.ts';

const assemblyDuration = (dur: number) => Math.min(0.56, dur * 0.24);
const pieceDuration = (dur: number) => assemblyDuration(dur) * 0.53;
const pieceStart = (dur: number, count: number, index: number) => {
  if (count < 2) return 0;
  return assemblyDuration(dur) * 0.47 * index / (count - 1);
};
const labelStart = (dur: number) => assemblyDuration(dur) + 0.1;
const calloutStart = (dur: number) => assemblyDuration(dur) + 0.18;
const calloutAt = (dur: number, index: number) => calloutStart(dur) + index * 0.11;
const calloutDuration = 0.2;

const anchors: Partial<Record<string, Vec3[]>> = {
  chip: [[0, 0.65, 0], [1.14, -0.66, 0.68], [-0.82, 0.55, -0.72]],
  server: [[0.72, 0.18, -0.84], [-0.54, 0.1, -0.78], [0.95, -0.78, -0.72]],
  database: [[0.04, 0, -0.95], [0, 0.82, 0], [0.8, -0.82, -0.4]],
  globe: [[0.75, 0.68, -0.34], [0, 0.1, -1], [-0.7, -0.3, -0.55]],
  coin: [[0, 0, -0.27], [0.8, 0.4, -0.2], [-0.75, -0.2, -0.2]],
  cube: [[-0.33, 0.33, -0.95], [0.66, 0.66, 0.66], [0, -0.66, -0.66]],
  monitor: [[0.1, 0.72, -0.2], [-0.98, 0.42, -0.2], [0.45, -1.04, 0.1]],
  phone: [[0.02, 0.35, -0.22], [-0.34, 0.79, -0.32], [0.5, -0.55, -0.2]],
  stack: [[-0.1, 0.31, 0.12], [0.18, -0.3, -0.1], [0.23, 0.92, -0.08]],
  network: [[0, 0, 0], [1.02, 0.38, 0.12], [-0.4, -0.78, 0.18]],
};

function noteLines(ctx: Frame['ctx'], note: string): string[] {
  const width = SAFE.w - 96;
  const wrapped = wrapText(ctx, note, width, 44, 700);
  const lines = wrapped.slice(0, 2);
  if (wrapped.length > 2 && lines.length) lines[lines.length - 1] += '…';
  return lines.map(line => {
    let fitted = line;
    while (fitted.length > 1 && textWidth(ctx, fitted, 44, 700) > width) fitted = `${fitted.slice(0, -2)}…`;
    return fitted;
  });
}

function drawShadow(frame: Frame, bob: number, build: number) {
  const { ctx, theme } = frame;
  const width = SAFE.w * 0.88;
  const height = 48;
  const pulse = 0.96 + Math.sin(frame.t * 2.2) * 0.025;
  const x = SAFE.cx - (width * pulse) / 2;
  const y = 958 + bob * 0.35;
  const alpha = clamp(build);
  ctx.save();
  ctx.globalAlpha *= alpha;
  dither(ctx, x, y, width * pulse, height, theme.line, (u, v) => {
    const dx = u * 2 - 1;
    const dy = (v * 2 - 1) * 1.18;
    return clamp((1 - Math.sqrt(dx * dx + dy * dy)) * 0.8);
  });
  ctx.restore();
}

function calloutLines(label: string): string[] {
  const words = label.toUpperCase().trim().split(/\s+/).filter(Boolean);
  const lines = words.flatMap(word => {
    if (word.length <= 6) return [word];
    const half = Math.ceil(word.length / 2);
    if (half <= 6) return [word.slice(0, half), word.slice(half)];
    return word.match(/.{1,6}/g) ?? [];
  });
  return lines.slice(0, 3);
}

function drawCallout(frame: Frame, view: Parameters<typeof project>[0], point: Vec3, label: string, index: number, scale: number, reveal: number) {
  const { ctx, theme } = frame;
  if (reveal <= 0) return;
  const target = project(view, [point[0] * scale, point[1] * scale, point[2] * scale]);
  const side = index % 2 === 0 ? -1 : 1;
  const endX = side < 0
    ? SAFE.x + (index === 2 ? 150 : 126)
    : SAFE.right - 126;
  const endY = [388, 628, 868][index] ?? 628;
  const lines = calloutLines(label);
  const calloutPx = 3;

  ctx.save();
  ctx.globalAlpha *= clamp(reveal);
  ctx.strokeStyle = theme.line;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(target.x, target.y);
  ctx.lineTo(endX, target.y);
  ctx.lineTo(endX, endY);
  ctx.stroke();
  ctx.fillStyle = theme.fg;
  ctx.fillRect(target.x - 4, target.y - 4, 8, 8);
  pixelBlock(ctx, lines, endX, endY - lines.length * pixelHeight(calloutPx) - 8, calloutPx, {
    color: theme.fg,
    align: side < 0 ? 'right' : 'left',
    gap: 8,
    reveal: clamp((reveal - 0.15) / 0.85),
    seed: frame.seed + index * 19,
  });
  ctx.restore();
}

export const objectScene: SceneDef<ObjectProps> = {
  type: 'object',
  render(frame: Frame, props) {
    const { ctx, t, dur, theme } = frame;
    const parts = modelParts(props.model);
    const assembly = assemblyDuration(dur);
    const bob = Math.sin(Math.max(0, t - assembly) * 2.15) * 9 * ease.outCubic(prog(t, 0, assembly));
    const build = ease.outBack(prog(t, 0, assembly));
    const scale = modelScale(props.model);
    const view = {
      x: SAFE.x + 24,
      y: 246,
      w: SAFE.w - 48,
      h: 788,
      zoom: 240,
      yaw: 0.24 + (1 - build) * 4.25 + Math.max(0, t - assembly) * 0.2,
      pitch: 0.38 + Math.sin(t * 1.15) * 0.025,
      distance: 7.5,
      cy: bob,
    };

    drawShadow(frame, bob, prog(t, 0, assembly));

    const assembledPieces = parts.flatMap((mesh, index) => {
      const raw = prog(t, pieceStart(dur, parts.length, index), pieceDuration(dur));
      if (raw <= 0) return [];
      const settle = ease.outBack(raw);
      const direction = index * 2.399;
      const distance = 0.78 * (1 - settle);
      return [{
        mesh,
        scale: scale * (0.78 + settle * 0.22),
        pos: [Math.cos(direction) * distance, Math.sin(direction * 1.7) * distance * 0.78, (index % 2 ? -1 : 1) * distance] as Vec3,
      }];
    });
    render3d(ctx, theme, view, assembledPieces);

    if (props.label) {
      const start = labelStart(dur);
      const maxWidth = SAFE.w - 96;
      const fit = fitPixel(props.label, maxWidth, 2, [14, 12]);
      let headline = fit.lines[0] ?? props.label.toUpperCase();
      if (fit.lines.length > 1) {
        while (headline.length > 0 && pixelWidth(`${headline}...`, fit.px) > maxWidth) headline = headline.slice(0, -1);
        headline = `${headline}...`;
      }
      pixelText(ctx, headline, SAFE.cx, 1006, fit.px, {
        color: theme.fg,
        align: 'center',
        reveal: ease.outBack(prog(t, start, 0.22)),
        mode: 'rise',
        seed: frame.seed,
      });
    }

    if (props.note) {
      const lines = noteLines(ctx, props.note.slice(0, 90));
      const reveal = ease.outBack(prog(t, labelStart(dur) + 0.1, 0.2));
      lines.forEach((line, index) => {
        text(ctx, line, SAFE.cx, 1148 + index * 48, {
          size: 44,
          color: theme.dim,
          align: 'center',
          weight: 700,
          alpha: clamp(reveal),
        });
      });
    }

    const labels = (props.callouts ?? []).slice(0, 3);
    const points = anchors[props.model] ?? [[0.78, 0.3, -0.7], [-0.76, 0, -0.7], [0.1, -0.72, 0.35]];
    labels.forEach((label, index) => {
      const reveal = ease.outBack(prog(t, calloutAt(dur, index), calloutDuration));
      drawCallout(frame, view, points[index] ?? points[0]!, label, index, scale, reveal);
    });
  },

  cues(props, dur): Cue[] {
    const parts = modelParts(props.model);
    const cues: Cue[] = [
      { t: 0, kind: 'rise', len: assemblyDuration(dur) },
      ...parts.map((_, index) => ({
        t: pieceStart(dur, parts.length, index),
        kind: 'pop' as const,
        step: parts.length > 1 ? index / (parts.length - 1) : 0,
      })),
      { t: assemblyDuration(dur), kind: 'impact' },
      { t: assemblyDuration(dur) + 0.04, kind: 'shimmer' },
    ];
    if (props.label) cues.push({ t: labelStart(dur), kind: 'pop', step: 0.7 });
    if (props.note) cues.push({ t: labelStart(dur) + 0.1, kind: 'pop', step: 0.8 });
    (props.callouts ?? []).slice(0, 3).forEach((_, index, all) => cues.push({
      t: calloutAt(dur, index),
      kind: 'pop',
      step: all.length > 1 ? index / (all.length - 1) : 1,
    }));
    return cues.filter(cue => cue.t < dur);
  },
};
