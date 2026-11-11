import { SAFE, ease, hash, prog, type BarsProps, type Cue, type Frame, type SceneDef } from '../core.ts';
import { fitPixel, pixelBlock, pixelHeight, pixelText, pixelWidth, text, textWidth } from '../prim.ts';
import { dither } from '../pix.ts';
import { emptyMesh, project, quad, render3d, type Mesh, type Object3D, type Vec3, type View3D } from '../three.ts';

const MAX_BARS = 6;
const FLOOR_Y = -2.25;
const MAX_BAR_HEIGHT = 4.65;
const DEPTH = 0.68;
const meshCache = new Map<string, Mesh>();

interface BarTiming {
  start: number;
  stagger: number;
  grow: number;
  order: number[];
  finishes: number[];
  payoff: number;
}

function barTiming(dur: number, count: number, accentIndex: number): BarTiming {
  const start = Math.min(0.16, dur * 0.08);
  const stagger = Math.min(0.08, dur * 0.05);
  const grow = Math.min(0.52, Math.max(0.22, dur * 0.27));
  const order = Array.from({ length: count }, (_, index) => index)
    .filter(index => index !== accentIndex);
  if (accentIndex >= 0) order.push(accentIndex);
  const finishes = Array(count).fill(start) as number[];
  order.forEach((index, rank) => { finishes[index] = start + rank * stagger + grow; });
  return { start, stagger, grow, order, finishes, payoff: finishes[accentIndex] ?? start + grow };
}

function beveledBar(width: number, depth: number, accent: boolean): Mesh {
  const key = `${width.toFixed(3)}:${depth.toFixed(3)}:${accent}`;
  const cached = meshCache.get(key);
  if (cached) return cached;

  const mesh = emptyMesh();
  const x = width / 2;
  const z = depth / 2;
  const bevel = Math.min(width, depth) * 0.12;
  const bevelY = 0.12;
  const bottomY = -0.5;
  const shoulderY = 0.5 - bevelY;
  const topY = 0.5;
  const outer = [
    [-x, -z], [x, -z], [x, z], [-x, z],
  ] as const;
  const inner = [
    [-x + bevel, -z + bevel], [x - bevel, -z + bevel],
    [x - bevel, z - bevel], [-x + bevel, z - bevel],
  ] as const;
  const faceMaterials = [2, 3, 4, 2];

  for (let side = 0; side < 4; side++) {
    const next = (side + 1) % 4;
    const [x0, z0] = outer[side]!;
    const [x1, z1] = outer[next]!;
    const [ix0, iz0] = inner[side]!;
    const [ix1, iz1] = inner[next]!;

    quad(mesh,
      [x0, bottomY, z0], [x1, bottomY, z1],
      [x1, shoulderY, z1], [x0, shoulderY, z0],
      accent && side === 0 ? 1 : faceMaterials[side]!,
    );
    quad(mesh,
      [x0, shoulderY, z0], [x1, shoulderY, z1],
      [ix1, topY, iz1], [ix0, topY, iz0],
      accent && side === 0 ? 1 : faceMaterials[side]!,
    );
  }
  quad(mesh,
    [inner[0]![0], topY, inner[0]![1]],
    [inner[1]![0], topY, inner[1]![1]],
    [inner[2]![0], topY, inner[2]![1]],
    [inner[3]![0], topY, inner[3]![1]],
    accent ? 1 : 0,
  );

  if (meshCache.size > 36) meshCache.clear();
  meshCache.set(key, mesh);
  return mesh;
}

function groupSpan(count: number): number {
  if (count <= 2) return 7.6;
  if (count === 3) return 8.45;
  if (count === 4) return 9.05;
  if (count === 5) return 9.65;
  return 10.1;
}

function worldX(index: number, count: number): number {
  if (count <= 1) return 0;
  return (index - (count - 1) / 2) * (groupSpan(count) / (count - 1));
}

function shortPixelText(raw: string, width: number, sizes: number[]): { px: number; lines: string[] } {
  const source = String(raw ?? '').trim().toUpperCase().replace(/\s+/g, ' ') || '—';
  const words = source.split(' ');

  for (const px of sizes) {
    const lines: string[] = [];
    let current = '';
    let complete = true;
    for (const word of words) {
      if (pixelWidth(word, px) > width) { complete = false; break; }
      const candidate = current ? `${current} ${word}` : word;
      if (pixelWidth(candidate, px) <= width) current = candidate;
      else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    if (complete && lines.length <= 2) return { px, lines };
  }

  const px = sizes.at(-1) ?? 6;
  const fitWord = (word: string) => {
    let result = word;
    while (result.length > 1 && pixelWidth(result, px) > width) result = result.slice(0, -1);
    return result;
  };
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const fittedWord = fitWord(word);
    const candidate = current ? `${current} ${fittedWord}` : fittedWord;
    if (pixelWidth(candidate, px) <= width) current = candidate;
    else {
      if (current) lines.push(current);
      current = fittedWord;
    }
  }
  if (current) lines.push(current);
  if (lines.length <= 2) return { px, lines };

  const first = fitWord(words[0] ?? source);
  let remainder = words.slice(1).join(' ') || first;
  while (remainder.length > 1 && pixelWidth(remainder, px) > width) remainder = remainder.slice(0, -1);
  return { px, lines: [first, remainder] };
}

function wrapBarLabel(ctx: Frame['ctx'], raw: string, width: number): { size: number; lines: string[] } {
  const source = String(raw ?? '').trim().toUpperCase().replace(/\s+/g, ' ') || 'BAR';

  for (const size of [22, 20, 18, 16]) {
    const lines: string[] = [];
    let current = '';

    const place = (chunk: string) => {
      const candidate = current ? `${current} ${chunk}` : chunk;
      if (textWidth(ctx, candidate, size, 700) <= width) current = candidate;
      else {
        if (current) lines.push(current);
        current = chunk;
      }
    };

    for (const word of source.split(' ')) {
      let remaining = word;
      while (remaining && textWidth(ctx, remaining, size, 700) > width) {
        let length = 1;
        while (length < remaining.length && textWidth(ctx, remaining.slice(0, length + 1), size, 700) <= width) length++;
        place(remaining.slice(0, length));
        remaining = remaining.slice(length);
        if (remaining) {
          if (current) lines.push(current);
          current = '';
        }
      }
      if (remaining) place(remaining);
    }
    if (current) lines.push(current);
    if (lines.length <= 2 && lines.every(line => textWidth(ctx, line, size, 700) <= width)) return { size, lines };
  }

  return { size: 16, lines: [source.slice(0, 4), source.slice(4, 8)] };
}

function projectedColumnGap(count: number): number {
  if (count <= 1) return 230;
  const first = project(chartView, pointOnFloor(worldX(0, count), 0));
  const second = project(chartView, pointOnFloor(worldX(1, count), 0));
  return Math.abs(second.x - first.x);
}

function labelColumnWidth(count: number): number {
  return count <= 1 ? 230 : Math.max(72, Math.min(310, projectedColumnGap(count) * 0.68));
}

function valueColumnWidth(count: number): number {
  return count <= 1 ? 230 : Math.max(100, Math.min(280, projectedColumnGap(count) - 8));
}

function formattedBarValue(value: number, unit: string, width: number): { px: number; text: string } {
  const safe = Number.isFinite(value) ? value : 0;
  const standard = new Intl.NumberFormat('en-US', { maximumFractionDigits: Math.abs(safe) >= 1000 ? 0 : 2 }).format(safe);
  const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumSignificantDigits: 3 }).format(safe);
  for (const text of [`${standard}${unit}`, `${compact}${unit}`]) {
    for (const px of [10, 9, 8, 7, 6]) {
      if (pixelWidth(text, px) <= width) return { px, text };
    }
  }
  const px = 6;
  let text = `${compact}${unit}`;
  while (text.length > 1 && pixelWidth(`${text.slice(0, -1)}…`, px) > width) text = text.slice(0, -1);
  return { px, text: text.length ? `${text}...` : '...' };
}

const chartView: View3D = {
  x: SAFE.x,
  y: 458,
  w: SAFE.w,
  h: 660,
  zoom: 94,
  yaw: 0.72,
  pitch: 0.53,
  ortho: true,
  outline: true,
};

function floorYAt(x: number): number {
  return FLOOR_Y + x * Math.sin(chartView.yaw ?? 0) * Math.tan(chartView.pitch ?? 0);
}

function pointOnFloor(x: number, z: number): Vec3 {
  return [x, floorYAt(x), z];
}

function drawDashedGridLine(
  ctx: Frame['ctx'],
  a: Vec3,
  b: Vec3,
  color: string,
  seed: number,
) {
  const p1 = project(chartView, a);
  const p2 = project(chartView, b);
  const length = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const steps = Math.max(1, Math.floor(length / 18));
  ctx.save();
  ctx.globalAlpha *= 0.72;
  ctx.fillStyle = color;
  for (let step = 0; step <= steps; step++) {
    if (hash(step, seed) < 0.2) continue;
    const u = step / steps;
    const x = Math.round((p1.x + (p2.x - p1.x) * u) / 4) * 4;
    const y = Math.round((p1.y + (p2.y - p1.y) * u) / 4) * 4;
    ctx.fillRect(x, y, 4, 4);
  }
  ctx.restore();
}

function drawFloor(ctx: Frame['ctx'], theme: Frame['theme'], t: number) {
  const corners = [
    project(chartView, pointOnFloor(-5, -1.4)),
    project(chartView, pointOnFloor(5, -1.4)),
    project(chartView, pointOnFloor(5, 1.4)),
    project(chartView, pointOnFloor(-5, 1.4)),
  ];

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(corners[0]!.x, corners[0]!.y);
  corners.slice(1).forEach(point => ctx.lineTo(point.x, point.y));
  ctx.closePath();
  ctx.clip();
  const bounds = corners.reduce((rect, point) => ({
    left: Math.min(rect.left, point.x),
    right: Math.max(rect.right, point.x),
    top: Math.min(rect.top, point.y),
    bottom: Math.max(rect.bottom, point.y),
  }), { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity });
  ctx.fillStyle = theme.panelAlt;
  ctx.globalAlpha = 0.24;
  ctx.fillRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);
  ctx.globalAlpha = 0.48;
  dither(ctx, bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top,
    theme.line, (u, v) => 0.08 + 0.18 * (1 - v) + 0.025 * Math.sin(u * Math.PI * 10), 4);
  ctx.restore();

  for (let index = -5; index <= 5; index++) {
    drawDashedGridLine(ctx,
      pointOnFloor(index, -1.4), pointOnFloor(index, 1.4), theme.line, 300 + index,
    );
  }
  for (let index = -1; index <= 1; index++) {
    drawDashedGridLine(ctx,
      pointOnFloor(-5, index * 0.7), pointOnFloor(5, index * 0.7), theme.line, 400 + index,
    );
  }
  drawDashedGridLine(ctx, pointOnFloor(-5, -1.4), pointOnFloor(5, -1.4), theme.dim, 510);
  drawDashedGridLine(ctx, pointOnFloor(5, -1.4), pointOnFloor(5, 1.4), theme.line, 511);
  drawDashedGridLine(ctx, pointOnFloor(5, 1.4), pointOnFloor(-5, 1.4), theme.line, 512);
  drawDashedGridLine(ctx, pointOnFloor(-5, 1.4), pointOnFloor(-5, -1.4), theme.line, 513);

  const sweep = (t * 2.2) % 10;
  const sweepPoint = project(chartView, pointOnFloor(-5 + sweep, 1.4));
  ctx.fillStyle = theme.dim;
  ctx.globalAlpha = 0.36;
  ctx.fillRect(sweepPoint.x, sweepPoint.y - 4, 8, 4);
  ctx.globalAlpha = 1;
}

function schedule(rows: BarsProps['items'], dur: number): { rows: BarsProps['items']; accent: number; timing: BarTiming } {
  const safeRows = (Array.isArray(rows) ? rows : []).slice(0, MAX_BARS).map(row => ({
    label: String(row?.label ?? ''),
    value: Number.isFinite(Number(row?.value)) ? Number(row.value) : 0,
    accent: Boolean(row?.accent),
  }));
  const requested = safeRows.findIndex(row => row.accent);
  const accent = requested >= 0
    ? requested
    : safeRows.reduce((best, row, index) => Math.abs(row.value) > Math.abs(safeRows[best]?.value ?? 0) ? index : best, 0);
  return { rows: safeRows, accent, timing: barTiming(dur, safeRows.length, accent) };
}

export const barsScene: SceneDef<BarsProps> = {
  type: 'bars',

  render(frame, props) {
    const { ctx, theme, t, dur } = frame;
    const { rows, accent, timing } = schedule(props.items, dur);
    if (!rows.length) return;

    drawFloor(ctx, theme, t);

    const maximum = Math.max(1, ...rows.map(row => Math.abs(row.value)));
    const width = Math.min(2.25, groupSpan(rows.length) / (rows.length * 1.55));
    const accentFinish = timing.payoff;
    const objects: Object3D[] = [];
    const heights: number[] = [];

    rows.forEach((row, index) => {
      const rank = timing.order.indexOf(index);
      const rowStart = timing.start + rank * timing.stagger;
      const progress = prog(t, rowStart, timing.grow);
      const growth = Math.max(0, ease.outBack(progress));
      const ratio = Math.abs(row.value) / maximum;
      const age = Math.max(0, t - accentFinish);
      const pulse = index === accent && t >= accentFinish
        ? 1 + 0.09 * Math.exp(-age * 12) * Math.cos(age * 26)
        : 1;
      const height = Math.max(0, MAX_BAR_HEIGHT * ratio * growth * pulse);
      heights[index] = height;
      if (height <= 0.015) return;

      const x = worldX(index, rows.length);
      objects.push({
        mesh: beveledBar(width, DEPTH, index === accent),
        pos: [x, floorYAt(x) + height / 2, 0],
        scale: [1, height, 1],
        materials: [
          { tone: 0.9 }, { accent: true }, { tone: 0.64 },
          { tone: 0.36 }, { tone: 0.74 },
        ],
      });
    });
    render3d(ctx, theme, chartView, objects);

    if (props.title?.trim()) {
      const title = shortPixelText(props.title, SAFE.w - 48, [12, 10, 9, 8]);
      pixelBlock(ctx, title.lines, SAFE.cx, 400, title.px, {
        color: theme.fg,
        align: 'center',
        gap: title.px * 1.4,
      });
      ctx.fillStyle = theme.line;
      ctx.fillRect(SAFE.cx - 72, 400 + pixelHeight(title.px) + 14, 144, 4);
    }

    rows.forEach((row, index) => {
      const x = worldX(index, rows.length);
      const height = heights[index] ?? 0;
      const top = project(chartView, [x, floorYAt(x) + height, 0]);
      const value = formattedBarValue(row.value, String(props.unit ?? ''), valueColumnWidth(rows.length));
      const labelColor = index === accent && t >= timing.finishes[index] ? theme.accent : theme.dim;
      const payoffAge = Math.max(0, t - timing.finishes[index]!);
      const labelDy = index === accent && t >= timing.finishes[index]!
        ? -Math.round(Math.exp(-payoffAge * 10) * Math.sin(payoffAge * 24) * 12)
        : 0;
      const rank = timing.order.indexOf(index);
      const rowStart = timing.start + rank * timing.stagger;
      const valueReveal = ease.outBack(prog(t, rowStart + timing.grow * 0.38, timing.grow * 0.32));

      pixelText(ctx, value.text, top.x, top.y - pixelHeight(value.px) - 16 + labelDy, value.px, {
        color: labelColor,
        align: 'center',
        reveal: valueReveal,
      });

      const floor = project(chartView, pointOnFloor(x, 0));
      const label = wrapBarLabel(ctx, row.label || `BAR ${index + 1}`, labelColumnWidth(rows.length));
      const nameReveal = ease.outExpo(prog(t, rowStart + timing.grow * 0.54, timing.grow * 0.34));
      ctx.save();
      ctx.globalAlpha *= nameReveal;
      label.lines.forEach((line, lineIndex) => {
        text(ctx, line, floor.x, floor.y + 52 + lineIndex * (label.size + 5), {
          size: label.size,
          weight: 700,
          color: index === accent ? theme.fg : theme.dim,
          align: 'center',
          baseline: 'top',
        });
      });
      ctx.restore();
    });

    if (accent >= 0 && t >= accentFinish && t - accentFinish < 0.55) {
      drawPayoffPixels(ctx, theme, rows[accent]!.value, maximum, worldX(accent, rows.length), heights[accent]!, t - accentFinish, frame.seed);
    }
  },

  cues(props, dur) {
    const { rows, accent, timing } = schedule(props.items, dur);
    if (!rows.length) return [];
    const cues: Cue[] = [{ t: 0, kind: 'rise', len: Math.max(0.04, timing.payoff - timing.start) }];
    if (props.title?.trim()) cues.push({ t: 0, kind: 'pop', step: 0 });
    timing.order.forEach((index, rank) => {
      cues.push({ t: timing.start + rank * timing.stagger, kind: 'pop', step: rank / Math.max(1, rows.length - 1) });
    });
    cues.push(
      { t: timing.finishes[accent] ?? timing.payoff, kind: 'impact' },
      { t: timing.finishes[accent] ?? timing.payoff, kind: 'shimmer' },
    );
    return cues.filter(cue => cue.t >= 0 && cue.t < dur).slice(0, 16);
  },
};

function drawPayoffPixels(
  ctx: Frame['ctx'],
  theme: Frame['theme'],
  value: number,
  maximum: number,
  x: number,
  height: number,
  age: number,
  seed: number,
) {
  const top = project(chartView, [x, floorYAt(x) + height, 0]);
  const strength = Math.max(0, 1 - age / 0.85);
  if (strength <= 0) return;

  ctx.save();
  for (let index = 0; index < 32; index++) {
    const h = hash(index + seed * 3, Math.round(value + maximum));
    const along = hash(index, seed + 11);
    const edge = index % 4;
    const left = top.x - 56;
    const right = top.x + 56;
    let originX: number;
    let originY: number;
    let vx: number;
    let vy: number;

    if (edge === 0) {
      originX = left - 8 - h * 28;
      originY = top.y + along * pixelHeight(8);
      vx = -70 - h * 110;
      vy = -120 + along * 150;
    } else if (edge === 1) {
      originX = right + 8 + h * 28;
      originY = top.y + along * pixelHeight(8);
      vx = 70 + h * 110;
      vy = -120 + along * 150;
    } else if (edge === 2) {
      originX = left + along * (right - left);
      originY = top.y - 8 - h * 28;
      vx = (along - 0.5) * 180;
      vy = -100 - h * 110;
    } else {
      originX = left + along * (right - left);
      originY = top.y + pixelHeight(8) + 8 + h * 22;
      vx = (along - 0.5) * 180;
      vy = 50 + h * 90;
    }

    const px = Math.round((originX + vx * age) / 4) * 4;
    const py = Math.round((originY + vy * age + 165 * age * age) / 4) * 4;
    ctx.globalAlpha = strength * (0.62 + h * 0.38);
    ctx.fillStyle = index % 5 === 0 ? theme.accent : theme.dim;
    const size = index % 3 === 0 ? 12 : 8;
    ctx.fillRect(px, py, size, size);
  }
  ctx.restore();
}
