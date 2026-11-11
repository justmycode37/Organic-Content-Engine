import {
  clamp,
  ease,
  hash,
  prog,
  SAFE,
  type Cue,
  type Frame,
  type GridProps,
  type SceneDef,
} from '../core.ts';
import { pixelHeight, pixelText, pixelWidth } from '../prim.ts';
import {
  emptyMesh,
  project,
  quad,
  render3d,
  type Mesh,
  type Object3D,
  type View3D,
} from '../three.ts';

const MIN_DIMENSION = 2;
const MAX_DIMENSION = 16;
const FLOOR_Y = -0.56;
const TOP_SPAN = 760;
const GRID_ZOOM = 43;
const MAX_SPACING = 5.4;
const COLUMN_WIDTH = 0.82;
const VIEW_BASE: Omit<View3D, 'yaw' | 'pitch' | 'zoom'> = {
  x: 106,
  y: 360,
  w: 868,
  h: 760,
  ortho: true,
  distance: 10,
  cell: 4,
  outline: true,
};

const columnMeshes = new Map<boolean, Mesh>();

interface GridTiming {
  introStart: number;
  introDur: number;
  layoutEnd: number;
  payoff: number;
  fillSpan: number;
  fillDur: number;
  hotMove: number;
  hotSpan: number;
  hotStep: number;
}

interface HotCell {
  row: number;
  col: number;
  index: number;
}

function dimensions(props: GridProps) {
  const rows = clamp(Math.floor(Number(props.rows) || MIN_DIMENSION), MIN_DIMENSION, MAX_DIMENSION);
  const cols = clamp(Math.floor(Number(props.cols) || MIN_DIMENSION), MIN_DIMENSION, MAX_DIMENSION);
  return { rows, cols };
}

function hotCells(props: GridProps, rows: number, cols: number): HotCell[] {
  const unique = new Set<string>();
  const points: HotCell[] = [];
  for (const item of Array.isArray(props.highlight) ? props.highlight : []) {
    if (!Array.isArray(item) || item.length < 2) continue;
    const row = Math.floor(Number(item[0]));
    const col = Math.floor(Number(item[1]));
    if (row < 0 || col < 0 || row >= rows || col >= cols) continue;
    const key = `${row}:${col}`;
    if (unique.has(key)) continue;
    unique.add(key);
    points.push({ row, col, index: points.length });
    if (points.length === 32) break;
  }
  return points;
}

function timing(dur: number, highlightCount: number): GridTiming {
  const length = Math.max(0.1, dur);
  const introStart = Math.min(0.16, length * 0.035);
  const introDur = clamp(length * 0.09, 0.13, 0.24);
  const layoutEnd = introStart + introDur;
  const payoff = clamp(length * 0.64, layoutEnd + 0.2, length - 0.22);
  const fillDur = clamp(length * 0.085, 0.15, 0.22);
  const fillSpan = Math.max(0.12, payoff - layoutEnd - fillDur - 0.04);
  const hotMove = clamp(length * 0.12, 0.14, 0.32);
  const hotSpan = Math.min(length * 0.15, 0.58);
  const hotStep = highlightCount > 1 ? hotSpan / (highlightCount - 1) : 0;
  return { introStart, introDur, layoutEnd, payoff, fillSpan, fillDur, hotMove, hotSpan, hotStep };
}

function makeColumnMesh(accentTop: boolean): Mesh {
  const mesh = emptyMesh();
  const half = 0.5;

  // One closed body with a darker base and alternating side planes.
  const front = accentTop ? 5 : 0;
  const side = accentTop ? 5 : 1;
  quad(mesh, [-half, -half, half], [half, -half, half], [half, half, half], [-half, half, half], front);
  quad(mesh, [half, -half, -half], [-half, -half, -half], [-half, half, -half], [half, half, -half], side);
  quad(mesh, [-half, -half, -half], [-half, -half, half], [-half, half, half], [-half, half, -half], front);
  quad(mesh, [half, -half, half], [half, -half, -half], [half, half, -half], [half, half, half], side);
  quad(mesh, [-half, -half, -half], [half, -half, -half], [half, -half, half], [-half, -half, half], 4);

  // The nine top patches read as a dithered pixel mosaic, even on a short bar.
  const divs = 3;
  for (let row = 0; row < divs; row++) {
    for (let col = 0; col < divs; col++) {
      const x0 = -half + (col / divs) * 1;
      const x1 = -half + ((col + 1) / divs) * 1;
      const z0 = -half + (row / divs) * 1;
      const z1 = -half + ((row + 1) / divs) * 1;
      const material = accentTop
        ? 5
        : (row + col) % 4 === 0 ? 3 : (row * 2 + col) % 5 === 0 ? 4 : 2;
      quad(mesh, [x0, half, z0], [x1, half, z0], [x1, half, z1], [x0, half, z1], material);
    }
  }
  return mesh;
}

function columnMesh(accentTop: boolean): Mesh {
  let mesh = columnMeshes.get(accentTop);
  if (!mesh) {
    mesh = makeColumnMesh(accentTop);
    columnMeshes.set(accentTop, mesh);
  }
  return mesh;
}

function compactLabel(value: unknown, maxWidth: number): string {
  let label = String(value ?? '').trim().toUpperCase().replace(/\s+/g, '');
  if (!label) return '';
  while (label.length > 1 && pixelWidth(label, 5) > maxWidth) label = label.slice(0, -1);
  return label;
}

function drawPixelLeader(ctx: Frame['ctx'], x1: number, y1: number, x2: number, y2: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.lineCap = 'square';
  ctx.lineJoin = 'miter';
  ctx.beginPath();
  ctx.moveTo(Math.round(x1 / 4) * 4, Math.round(y1 / 4) * 4);
  ctx.lineTo(Math.round(x2 / 4) * 4, Math.round(y1 / 4) * 4);
  ctx.lineTo(Math.round(x2 / 4) * 4, Math.round(y2 / 4) * 4);
  ctx.stroke();
}

function drawLabels(
  frame: Frame,
  props: GridProps,
  rows: number,
  cols: number,
  spacing: number,
  startX: number,
  startZ: number,
  view: View3D,
) {
  const { ctx, theme } = frame;
  const rowLabels = (Array.isArray(props.rowLabels) ? props.rowLabels : []).slice(0, rows);
  const colLabels = (Array.isArray(props.colLabels) ? props.colLabels : []).slice(0, cols);
  const baseRow = Math.min(120, Math.max(48, spacing * Math.cos(view.yaw ?? 0) * view.zoom * 0.8));
  const baseCol = Math.min(92, Math.max(42, spacing * Math.cos(view.yaw ?? 0) * view.zoom * 1.75 - 8));

  rowLabels.forEach((raw, row) => {
    if (!String(raw ?? '').trim()) return;
    // Labels alternate edges so every row remains readable at 16 x 16.
    const onLeft = row % 2 === 0;
    const edgeCol = onLeft ? 0 : cols - 1;
    const edge = project(view, [
      startX + edgeCol * spacing + (onLeft ? -spacing * COLUMN_WIDTH / 2 : spacing * COLUMN_WIDTH / 2),
      FLOOR_Y,
      startZ + row * spacing,
    ]);
    const maxWidth = onLeft
      ? Math.max(28, Math.min(baseRow, edge.x - SAFE.x - 16))
      : Math.max(28, Math.min(baseRow, SAFE.right - edge.x - 16));
    const label = compactLabel(raw, maxWidth);
    if (!label) return;
    const labelX = onLeft ? edge.x - 10 : edge.x + 10;
    const labelY = edge.y - pixelHeight(5) / 2;
    drawPixelLeader(ctx, edge.x, edge.y, labelX, edge.y, theme.line);
    pixelText(ctx, label, labelX, labelY, 5, {
      color: theme.dim,
      align: onLeft ? 'right' : 'left',
    });
  });

  const frontZ = startZ - spacing * 0.72;
  colLabels.forEach((raw, col) => {
    if (!String(raw ?? '').trim()) return;
    const edge = project(view, [startX + col * spacing, FLOOR_Y, frontZ]);
    const label = compactLabel(raw, baseCol);
    if (!label) return;
    const track = col % 2 === 0 ? 0 : pixelHeight(5) + 6;
    const labelY = edge.y + 10 + track;
    drawPixelLeader(ctx, edge.x, edge.y, edge.x, labelY, theme.line);
    pixelText(ctx, label, edge.x, labelY, 5, { color: theme.dim, align: 'center' });
  });
}

function attentionCenters(rows: number, cols: number, seed: number): Array<[number, number]> {
  const count = Math.min(4, Math.max(2, Math.round(Math.min(rows, cols) / 3)));
  const centers: Array<[number, number]> = [];
  for (let index = 0; index < count; index++) {
    let row = Math.floor(hash(seed + index * 17, 3) * rows);
    let col = Math.floor(hash(seed + index * 31, 9) * cols);
    while (centers.some(([otherRow, otherCol]) => otherRow === row && otherCol === col)) {
      col = (col + 1) % cols;
    }
    centers.push([row, col]);
  }
  return centers;
}

function patternHeight(
  pattern: NonNullable<GridProps['pattern']>,
  row: number,
  col: number,
  rows: number,
  cols: number,
  elapsed: number,
  seed: number,
  build: GridTiming,
  centers: Array<[number, number]>,
): number {
  if (pattern === 'scan') {
    const total = Math.max(2, rows + cols - 2);
    const sweepDuration = clamp(elapsed, 0.9, 2.2);
    const phase = (elapsed * total / sweepDuration) % (total * 2);
    const head = phase <= total ? phase : total * 2 - phase;
    const distance = Math.abs(row + col - head);
    const wave = Math.max(0, 1 - distance / 2.1);
    return 0.16 + wave * 1.28;
  }

  if (pattern === 'attention') {
    const radius = Math.max(1.1, Math.min(rows, cols) * 0.13);
    let attention = 0;
    centers.forEach(([focusRow, focusCol], index) => {
      const distanceSq = (row - focusRow) ** 2 + (col - focusCol) ** 2;
      const breathe = 0.76 + 0.24 * Math.sin(elapsed * 4.2 + index * 1.7);
      attention += Math.exp(-distanceSq / (2 * radius * radius)) * breathe;
    });
    return 0.16 + Math.min(1.65, attention) * 3;
  }

  if (pattern === 'noise') {
    const cell = row * cols + col;
    const frame = Math.floor(elapsed * 7);
    const flicker = hash(cell + frame * 131, seed + row * 19 + col * 7);
    return 0.2 + flicker * 1.12;
  }

  const order = (row * cols + col) / Math.max(1, rows * cols - 1);
  const rise = ease.outBack(prog(elapsed, order * build.fillSpan, build.fillDur));
  return 0.14 + Math.max(0, rise) * 1.08;
}

function shortTitle(value: unknown, maxWidth: number): string {
  const words = String(value ?? '').trim().toUpperCase().split(/\s+/).filter(Boolean);
  let title = '';
  for (const word of words) {
    const candidate = title ? `${title} ${word}` : word;
    if (pixelWidth(candidate, 12) <= maxWidth) title = candidate;
    else if (!title) {
      title = word;
      while (title.length > 1 && pixelWidth(title, 12) > maxWidth) title = title.slice(0, -1);
      break;
    } else break;
  }
  return title;
}

export const gridScene: SceneDef<GridProps> = {
  type: 'grid',

  render(frame: Frame, props: GridProps) {
    const { ctx, theme, t } = frame;
    const { rows, cols } = dimensions(props);
    const highlights = hotCells(props, rows, cols);
    const animation = timing(frame.dur, highlights.length);
    const title = String(props.title ?? '').trim();
    if (title) {
      pixelText(ctx, shortTitle(title, SAFE.w), SAFE.cx, 246, 12, {
        color: theme.fg,
        align: 'center',
      });
    }

    // Keep the projected footprint close to 760 px for every matrix size.
    const yaw = 0.45 + Math.sin(t * 0.27) * 0.035;
    const pitch = 0.69 + Math.sin(t * 0.31) * 0.012;
    const projectedSpan = Math.max(
      1,
      (cols - 1) * Math.cos(yaw) + (rows - 1) * Math.sin(yaw),
    );
    const zoom = GRID_ZOOM;
    const view: View3D = { ...VIEW_BASE, yaw, pitch, zoom };
    const spacing = Math.min(MAX_SPACING, TOP_SPAN / (zoom * projectedSpan));
    const startX = -((cols - 1) * spacing) / 2;
    const startZ = -((rows - 1) * spacing) / 2;
    const byCell = new Map(highlights.map(cell => [`${cell.row}:${cell.col}`, cell.index]));
    const pattern = props.pattern ?? 'attention';
    const centers = attentionCenters(rows, cols, frame.seed);
    const elapsed = Math.max(0, t - animation.layoutEnd);
    const objects: Object3D[] = [];
    const palette = [
      { tone: 0.24 },
      { tone: 0.4 },
      { tone: 0.7 },
      { tone: 0.95 },
      { tone: 0.12 },
      { accent: true },
    ];

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const diagonal = (row + col) / Math.max(1, rows + cols - 2);
        const enterAt = animation.introStart + diagonal * Math.min(0.1, animation.introDur * 0.45);
        const enter = Math.max(0, ease.outBack(prog(t, enterAt, animation.introDur)));
        if (enter <= 0) continue;

        const baseHeight = patternHeight(
          pattern,
          row,
          col,
          rows,
          cols,
          elapsed,
          frame.seed,
          animation,
          centers,
        );
        const hotIndex = byCell.get(`${row}:${col}`);
        const hotStart = animation.payoff + (hotIndex ?? 0) * animation.hotStep;
        const hotProgress = hotIndex === undefined
          ? 0
          : Math.max(0, ease.outBack(prog(t, hotStart, animation.hotMove)));
        const hotBreathe = hotIndex === undefined || t < hotStart + animation.hotMove
          ? 0
          : Math.sin((t - hotStart - animation.hotMove) * 7 + hotIndex) * 0.08;
        const height = Math.max(
          0.06,
          (baseHeight + hotProgress * 2.8 + hotBreathe) * enter,
        );
        const x = startX + col * spacing;
        const z = startZ + row * spacing;
        objects.push({
          mesh: columnMesh(hotIndex !== undefined && hotProgress > 1e-6),
          pos: [x, FLOOR_Y + height / 2, z],
          scale: [spacing * COLUMN_WIDTH, height, spacing * COLUMN_WIDTH],
          materials: palette,
          seed: row * cols + col + 17,
        });
      }
    }

    render3d(ctx, theme, view, objects);
    drawLabels(frame, props, rows, cols, spacing, startX, startZ, view);
  },

  cues(props: GridProps, dur: number): Cue[] {
    const { rows, cols } = dimensions(props);
    const highlights = hotCells(props, rows, cols);
    const animation = timing(dur, highlights.length);
    const pattern = props.pattern ?? 'attention';
    const cues: Cue[] = [{ t: animation.introStart, kind: 'rise', len: animation.introDur }];

    for (let index = 0; index < 4; index++) {
      const fraction = index / 3;
      cues.push({
        t: animation.introStart + fraction * Math.min(0.1, animation.introDur * 0.45),
        kind: index === 0 ? 'pop' : 'tick',
        step: fraction,
      });
    }

    if (pattern === 'fill') {
      const steps = Math.min(12, rows, Math.max(2, Math.floor(animation.fillSpan * 10)));
      for (let index = 0; index < steps; index++) {
        const row = steps === 1 ? 0 : Math.round(index * (rows - 1) / (steps - 1));
        cues.push({
          t: animation.layoutEnd + (row / Math.max(1, rows - 1)) * animation.fillSpan,
          kind: 'tick',
          step: index / Math.max(1, steps - 1),
        });
      }
    } else if (pattern === 'scan') {
      const steps = Math.min(8, Math.max(3, rows + cols - 2));
      for (let index = 0; index < steps; index++) {
        cues.push({
          t: animation.layoutEnd + 0.16 + index * 0.24,
          kind: 'tick',
          step: index / Math.max(1, steps - 1),
        });
      }
    } else if (pattern === 'attention') {
      for (let index = 0; index < Math.min(4, Math.max(2, Math.round(Math.min(rows, cols) / 3))); index++) {
        cues.push({
          t: animation.layoutEnd + 0.12 + index * 0.08,
          kind: 'pop',
          step: index / 3,
        });
      }
    } else {
      const steps = Math.min(8, Math.max(3, Math.floor(dur * 2)));
      for (let index = 0; index < steps; index++) {
        cues.push({ t: animation.layoutEnd + 0.2 + index * 0.28, kind: 'tick', step: index / Math.max(1, steps - 1) });
      }
    }

    cues.push(
      { t: Math.max(animation.layoutEnd, animation.payoff - 0.18), kind: 'rise', len: 0.18 },
      { t: animation.payoff + animation.hotStep * Math.max(0, highlights.length - 1) + animation.hotMove, kind: 'impact' },
      { t: animation.payoff + animation.hotStep * Math.max(0, highlights.length - 1) + animation.hotMove * 0.7, kind: 'shimmer' },
    );
    return cues.filter(cue => cue.t >= 0 && cue.t < dur).sort((a, b) => a.t - b.t).slice(0, 39);
  },
};
