import {
  clamp,
  ease,
  prog,
  type Cue,
  type FlowProps,
  type Frame,
  type IconName,
  type SceneDef,
} from '../core.ts';
import { pixelHeight, pixelText, pixelWidth, text, textWidth } from '../prim.ts';
import { iconMesh } from '../icon3d.ts';
import {
  box,
  emptyMesh,
  merge,
  place,
  project,
  quad,
  render3d,
  type Mesh,
  type Object3D,
  type Vec3,
  type View3D,
} from '../three.ts';

const MAX_NODES = 5;
const VIEW_ZOOM = 110;
const VIEW_YAW = 0.72;
const VIEW_PITCH = 0.62;
const REGION = { x: 96, y: 240, w: 888, h: 1000 } as const;
const LABEL_PX = 7;
const NOTE_SIZE = 22;
const NOTE_LEADING = 28;

type FlowNode = {
  label: string;
  icon?: IconName;
  note?: string;
  accent?: boolean;
};

type FlowPoint = {
  x: number;
  y: number;
  z: number;
  nodeIndex?: number;
};

type FlowLayout = {
  nodes: FlowNode[];
  points: FlowPoint[];
  distances: number[];
  totalDistance: number;
  direction: 'down' | 'right';
  looping: boolean;
  platformW: number;
  platformD: number;
};

type FlowTiming = {
  enterStart: number;
  enterStagger: number;
  enterDuration: number;
  labelDuration: number;
  travelStart: number;
  travelSpan: number;
};

const platformMeshes = new Map<string, Mesh>();
const conduitMeshes = new Map<string, Mesh>();
const packetMesh = box(0.22, 0.22, 0.22, 1);
const trailMeshes = [box(0.14, 0.14, 0.14, 1), box(0.10, 0.10, 0.10, 1)];

function viewAt(t: number): View3D {
  return {
    ...REGION,
    zoom: VIEW_ZOOM,
    yaw: VIEW_YAW + Math.sin(t * 1.15) * 0.045,
    pitch: VIEW_PITCH,
    ortho: true,
    cell: 4,
    outline: true,
  };
}

function nodeList(props: FlowProps): FlowNode[] {
  if (!Array.isArray(props.nodes)) return [];
  return props.nodes.slice(0, MAX_NODES).map(node => ({
    label: String(node?.label ?? ''),
    icon: node?.icon,
    note: String(node?.note ?? ''),
    accent: Boolean(node?.accent),
  }));
}

function pointDistance(a: FlowPoint, b: FlowPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

function makeLayout(props: FlowProps): FlowLayout {
  const nodes = nodeList(props);
  const direction = props.direction === 'right' ? 'right' : 'down';
  const looping = Boolean(props.loop) && nodes.length > 1;
  const n = nodes.length;
  const nodePoints: FlowPoint[] = [];

  if (n === 1) {
    nodePoints.push({ x: 0, y: 0, z: 0, nodeIndex: 0 });
  } else if (direction === 'down') {
    // Broad stepped platforms make the vertical route read clearly at every count.
    const screenYSpan = 640;
    const worldYSpan = screenYSpan / (VIEW_ZOOM * Math.cos(VIEW_PITCH));
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      nodePoints.push({
        x: 0,
        y: (0.5 - u) * worldYSpan,
        z: 0,
        nodeIndex: i,
      });
    }
  } else {
    const xSpan = 7.8;
    for (let i = 0; i < n; i++) {
      const u = n === 1 ? 0.5 : i / (n - 1);
      nodePoints.push({
        x: (u - 0.5) * xSpan,
        y: Math.sin(i * 1.15) * 0.14,
        z: 0,
        nodeIndex: i,
      });
    }
  }

  const points = [...nodePoints];
  if (looping && direction === 'down') {
    const leftLane = Math.min(...nodePoints.map(point => point.x)) - 4.55;
    points.push(
      { x: leftLane, y: nodePoints[n - 1]!.y, z: 0 },
      { x: leftLane, y: nodePoints[0]!.y, z: 0 },
      { ...nodePoints[0]! },
    );
  } else if (looping) {
    // Counter the camera's yaw so the return leg stays level on screen, below labels.
    const screenLane = -4.15;
    const laneY = (x: number) => (screenLane + x * Math.sin(VIEW_YAW) * Math.sin(VIEW_PITCH)) / Math.cos(VIEW_PITCH);
    points.push(
      { x: nodePoints[n - 1]!.x, y: laneY(nodePoints[n - 1]!.x), z: 0 },
      { x: nodePoints[0]!.x, y: laneY(nodePoints[0]!.x), z: 0 },
      { ...nodePoints[0]! },
    );
  }

  const distances = [0];
  for (let i = 1; i < points.length; i++) {
    distances.push(distances[i - 1]! + pointDistance(points[i - 1]!, points[i]!));
  }

  return {
    nodes,
    points,
    distances,
    totalDistance: distances.at(-1) ?? 0,
    direction,
    looping,
    platformW: direction === 'down' ? 8.2 : 1.08,
    platformD: direction === 'down' ? 1.16 : 0.82,
  };
}

function timingFor(layout: FlowLayout, dur: number): FlowTiming {
  const enterStart = dur * 0.035;
  const enterStagger = Math.min(0.055, dur * 0.025);
  const enterDuration = Math.min(0.24, dur * 0.16);
  const labelDuration = Math.min(0.18, enterDuration);
  const builtAt = enterStart + Math.max(0, layout.nodes.length - 1) * enterStagger + enterDuration * 0.45;
  const travelStart = Math.max(dur * 0.22, builtAt);
  const travelSpan = layout.looping ? Math.max(0.72, dur * 0.38) : Math.max(0.18, dur * 0.62);
  return { enterStart, enterStagger, enterDuration, labelDuration, travelStart, travelSpan };
}

function nodeArrival(layout: FlowLayout, timing: FlowTiming, index: number): number {
  if (layout.totalDistance <= 0) return timing.travelStart;
  return timing.travelStart + timing.travelSpan * (layout.distances[index]! / layout.totalDistance);
}

function mod(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function samplePath(layout: FlowLayout, distance: number): FlowPoint {
  if (layout.points.length <= 1 || layout.totalDistance <= 0) return layout.points[0] ?? { x: 0, y: 0, z: 0 };
  const d = clamp(distance, 0, layout.totalDistance);
  for (let i = 1; i < layout.points.length; i++) {
    const end = layout.distances[i]!;
    if (d > end) continue;
    const start = layout.distances[i - 1]!;
    const span = Math.max(0.0001, end - start);
    const u = clamp((d - start) / span);
    const a = layout.points[i - 1]!;
    const b = layout.points[i]!;
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u };
  }
  return layout.points.at(-1)!;
}

function packetPosition(layout: FlowLayout, timing: FlowTiming, t: number): FlowPoint {
  if (layout.totalDistance <= 0) return layout.points[0] ?? { x: 0, y: 0, z: 0 };
  if (t <= timing.travelStart) return layout.points[0]!;
  if (layout.looping) {
    const u = mod(t - timing.travelStart, timing.travelSpan) / timing.travelSpan;
    return samplePath(layout, u * layout.totalDistance);
  }
  const u = clamp((t - timing.travelStart) / timing.travelSpan);
  return samplePath(layout, u * layout.totalDistance);
}

function lastHitTime(layout: FlowLayout, timing: FlowTiming, index: number, t: number): number | null {
  const first = nodeArrival(layout, timing, index);
  if (t < first) return null;
  if (!layout.looping) return first;
  const cycle = Math.floor((t - first) / timing.travelSpan);
  return first + cycle * timing.travelSpan;
}

function platformMesh(width: number, depth: number): Mesh {
  const key = `${width.toFixed(2)}:${depth.toFixed(2)}`;
  const cached = platformMeshes.get(key);
  if (cached) return cached;

  const bevel = 0.12;
  const mesh = emptyMesh();
  const parts: Mesh[] = [
    place(box(width + 0.16, 0.15, depth + 0.16, 4), { pos: [0, -0.16, 0] }),
    place(box(width, 0.18, depth, 2, [2, 4, 2, 4, 2, 2]), { pos: [0, -0.01, 0] }),
    place(box(width - bevel * 2, 0.06, depth - bevel * 2, 0), { pos: [0, 0.17, 0] }),
  ];

  const ox = width / 2, oz = depth / 2;
  const ix = ox - bevel, iz = oz - bevel;
  const outer = [
    [-ox, 0.08, -oz], [ox, 0.08, -oz], [ox, 0.08, oz], [-ox, 0.08, oz],
  ] as Vec3[];
  const inner = [
    [-ix, 0.20, -iz], [ix, 0.20, -iz], [ix, 0.20, iz], [-ix, 0.20, iz],
  ] as Vec3[];
  for (let i = 0; i < 4; i++) {
    const next = (i + 1) % 4;
    quad(mesh, outer[i]!, outer[next]!, inner[next]!, inner[i]!, i === 1 ? 2 : 0);
    const lowA: Vec3 = [outer[i]![0], -0.10, outer[i]![2]];
    const lowB: Vec3 = [outer[next]![0], -0.10, outer[next]![2]];
    quad(mesh, lowA, lowB, outer[next]!, outer[i]!, i === 0 ? 2 : 4);
  }
  quad(mesh, inner[0]!, inner[1]!, inner[2]!, inner[3]!, 0);

  // A tiny service panel and edge marks stay visible around a standing icon.
  const markY = 0.245;
  parts.push(place(box(width * 0.28, 0.035, 0.20, 4), { pos: [width * 0.23, markY, depth * 0.22] }));
  for (let i = 0; i < 3; i++) {
    parts.push(place(box(0.10, 0.035, 0.14, i === 1 ? 0 : 2), {
      pos: [width * (0.12 + i * 0.11), markY + 0.02, depth * 0.22],
    }));
  }
  for (const x of [-1, 1]) for (const z of [-1, 1]) {
    parts.push(place(box(0.065, 0.04, 0.065, 0), {
      pos: [x * (width / 2 - 0.15), 0.235, z * (depth / 2 - 0.13)],
    }));
  }

  const built = merge(mesh, ...parts);
  platformMeshes.set(key, built);
  return built;
}

function conduitMesh(length: number): Mesh {
  const safeLength = Math.max(0.12, length);
  const key = safeLength.toFixed(2);
  const cached = conduitMeshes.get(key);
  if (cached) return cached;

  const parts: Mesh[] = [
    box(safeLength, 0.12, 0.12, 2),
    place(box(safeLength, 0.035, 0.05, 0), { pos: [0, 0.04, 0] }),
  ];
  for (let x = -safeLength / 2 + 0.14; x < safeLength / 2 - 0.08; x += 0.34) {
    parts.push(place(box(0.045, 0.14, 0.15, 4), { pos: [x, 0, 0] }));
  }
  const built = merge(...parts);
  conduitMeshes.set(key, built);
  return built;
}

function drawPixelLine(
  ctx: Frame['ctx'],
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  if (length < 8) return;
  ctx.fillStyle = color;
  for (let d = 0; d < length; d += 12) {
    const x = Math.round((x1 + (dx * d) / length) / 4) * 4;
    const y = Math.round((y1 + (dy * d) / length) / 4) * 4;
    ctx.fillRect(x - 2, y - 2, 4, 4);
  }
}

function pixelLines(value: string, width: number, px: number, maxLines: number): string[] {
  const clean = value.replaceAll('*', '').trim().replace(/\s+/g, ' ').toUpperCase();
  if (!clean) return [];
  const lines: string[] = [];
  let line = '';
  let truncated = false;
  for (const word of clean.split(' ')) {
    let pieces = [word];
    if (pixelWidth(word, px) > width) {
      pieces = [];
      let piece = '';
      for (const character of word) {
        if (piece && pixelWidth(piece + character, px) > width) {
          pieces.push(piece);
          piece = character;
        } else piece += character;
      }
      if (piece) pieces.push(piece);
    }
    for (const piece of pieces) {
      const candidate = line ? `${line} ${piece}` : piece;
      if (line && pixelWidth(candidate, px) > width) {
        lines.push(line);
        line = piece;
      } else line = candidate;
      if (lines.length >= maxLines) {
        truncated = true;
        break;
      }
    }
    if (truncated) break;
  }
  if (!truncated && line) lines.push(line);
  if (lines.length > maxLines) lines.length = maxLines;
  if (truncated && lines.length) {
    let tail = lines[lines.length - 1]!;
    while (tail && pixelWidth(`${tail}...`, px) > width) tail = tail.slice(0, -1);
    lines[lines.length - 1] = `${tail}...`;
  }
  return lines;
}

function sansLines(ctx: Frame['ctx'], value: string, width: number, size: number, maxLines: number): string[] {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines: string[] = [];
  let line = '';
  let truncated = false;
  for (const word of words) {
    let pieces = [word];
    if (textWidth(ctx, word, size, 800) > width) {
      pieces = [];
      let piece = '';
      for (const character of word) {
        if (piece && textWidth(ctx, piece + character, size, 800) > width) {
          pieces.push(piece);
          piece = character;
        } else piece += character;
      }
      if (piece) pieces.push(piece);
    }
    for (const piece of pieces) {
      const candidate = line ? `${line} ${piece}` : piece;
      if (line && textWidth(ctx, candidate, size, 800) > width) {
        lines.push(line);
        line = piece;
      } else line = candidate;
      if (lines.length >= maxLines) {
        truncated = true;
        break;
      }
    }
    if (truncated) break;
  }
  if (!truncated && line) lines.push(line);
  if (lines.length > maxLines) lines.length = maxLines;
  if (truncated && lines.length) {
    let tail = lines[lines.length - 1]!;
    while (tail && textWidth(ctx, `${tail}...`, size, 800) > width) tail = tail.slice(0, -1);
    lines[lines.length - 1] = `${tail}...`;
  }
  return lines;
}

function addConduits(layout: FlowLayout, t: number, timing: FlowTiming, objects: Object3D[]) {
  for (let i = 1; i < layout.points.length; i++) {
    const a = layout.points[i - 1]!;
    const b = layout.points[i]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 0.18) continue;
    const ux = dx / distance;
    const uy = dy / distance;
    const trimAtNode = () => {
      const alongX = Math.abs(ux) < 0.0001 ? Infinity : (layout.platformW / 2) / Math.abs(ux);
      const alongY = Math.abs(uy) < 0.0001 ? Infinity : 0.24 / Math.abs(uy);
      return Math.min(alongX, alongY);
    };
    const trimA = a.nodeIndex === undefined ? 0 : trimAtNode();
    const trimB = b.nodeIndex === undefined ? 0 : trimAtNode();
    const length = Math.max(0.12, distance - trimA - trimB);
    const startX = a.x + ux * trimA;
    const startY = a.y + uy * trimA;
    const endX = b.x - ux * trimB;
    const endY = b.y - uy * trimB;
    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2 + 0.23;
    const revealStart = timing.enterStart + Math.min(i - 1, layout.nodes.length - 1) * timing.enterStagger;
    const reveal = ease.outCubic(prog(t, revealStart, Math.min(0.2, timing.enterDuration)));
    objects.push({
      mesh: conduitMesh(length),
      pos: [midX, midY, 0],
      rot: [0, 0, Math.atan2(dy, dx)],
      reveal,
      seed: i * 67 + 12,
    });
  }
}

function addPacket(layout: FlowLayout, timing: FlowTiming, t: number, objects: Object3D[]) {
  if (layout.nodes.length < 2 || t < timing.travelStart) return;
  const position = packetPosition(layout, timing, t);
  const packetY = position.y + 0.28;
  objects.push({ mesh: packetMesh, pos: [position.x, packetY, position.z], materials: [{ accent: true }] });

  for (let i = 0; i < trailMeshes.length; i++) {
    const tailDistance = (i + 1) * 0.32;
    let tail: FlowPoint;
    if (layout.looping) {
      const u = mod(t - timing.travelStart, timing.travelSpan) / timing.travelSpan;
      const along = mod(u * layout.totalDistance - tailDistance, layout.totalDistance);
      tail = samplePath(layout, along);
    } else {
      tail = samplePath(layout, Math.max(0, (t - timing.travelStart) / timing.travelSpan * layout.totalDistance - tailDistance));
    }
    objects.push({
      mesh: trailMeshes[i]!,
      pos: [tail.x, tail.y + 0.28, tail.z],
      materials: [{ accent: true }],
    });
  }
}

function drawNodeLabels(frame: Frame, layout: FlowLayout, timing: FlowTiming, view: View3D) {
  const { ctx, theme } = frame;
  const width = layout.direction === 'down' ? 460 : 236;

  layout.nodes.forEach((node, index) => {
    const enterAt = timing.enterStart + index * timing.enterStagger;
    const reveal = ease.outCubic(prog(frame.t, enterAt, timing.labelDuration));
    if (reveal <= 0) return;

    const point = layout.points[index]!;
    const label = pixelLines(node.label, width, LABEL_PX, 2);
    const noteSize = layout.direction === 'down' ? 20 : NOTE_SIZE;
    const noteLeading = layout.direction === 'down' ? 24 : NOTE_LEADING;
    const note = sansLines(ctx, node.note ?? '', width, noteSize, layout.direction === 'down' ? 2 : 1);
    const labelHeight = label.length * pixelHeight(LABEL_PX) + Math.max(0, label.length - 1) * 4;
    const noteHeight = note.length ? note.length * noteLeading : 0;
    const totalHeight = labelHeight + (note.length ? 8 + noteHeight : 0);

    let anchor: { x: number; y: number };
    let align: CanvasTextAlign;
    let leaderA: { x: number; y: number };
    let leaderB: { x: number; y: number };
    let labelTop: number;

    ctx.save();
    ctx.globalAlpha *= reveal;
    if (layout.direction === 'down') {
      anchor = project(view, [point.x - 0.35, point.y + 0.14, point.z]);
      align = 'left';
      labelTop = anchor.y - totalHeight / 2;
      const divider = project(view, [point.x - 0.95, point.y + 0.14, point.z]);
      drawPixelLine(ctx, divider.x, divider.y - 25, divider.x, divider.y + 25, theme.line);
      const iconEdge = project(view, [point.x - 1.45, point.y + 0.14, point.z]);
      drawPixelLine(ctx, iconEdge.x, iconEdge.y, divider.x - 8, divider.y, theme.dim);
      leaderA = divider;
      leaderB = { x: anchor.x - 10, y: anchor.y };
    } else {
      const evenLoop = layout.looping && layout.nodes.length % 2 === 0;
      const endpoint = index === 0 || index === layout.nodes.length - 1;
      const above = layout.looping && endpoint
        ? true
        : evenLoop ? index % 2 === 1 : index % 2 === 0;
      const labelWorldY = point.y + (above ? 3.3 : -1.85);
      anchor = project(view, [point.x, labelWorldY, point.z]);
      align = 'center';
      labelTop = anchor.y;
      const port = project(view, [point.x + (above ? 0.82 : -0.82), point.y + (above ? 0.92 : 0.12), point.z]);
      const textEdge = { x: anchor.x, y: above ? labelTop + totalHeight + 12 : labelTop - 12 };
      leaderA = port;
      leaderB = textEdge;
    }

    drawPixelLine(ctx, leaderA.x, leaderA.y, leaderB.x, leaderB.y, theme.dim);
    label.forEach((line, row) => {
      pixelText(ctx, line, anchor!.x, labelTop + row * (pixelHeight(LABEL_PX) + 4), LABEL_PX, {
        color: theme.fg,
        align,
        reveal,
        mode: 'type',
      });
    });

    const noteY = labelTop + labelHeight + (note.length ? 8 : 0);
    note.forEach((line, row) => {
      text(ctx, line, anchor!.x, noteY + noteSize + row * noteLeading, {
        size: noteSize,
        color: theme.dim,
        weight: 800,
        align,
      });
    });

    // A small square marks the wire termination without adding another accent.
    ctx.fillStyle = theme.dim;
    ctx.fillRect(Math.round(leaderA.x / 4) * 4 - 2, Math.round(leaderA.y / 4) * 4 - 2, 4, 4);
    ctx.restore();
  });
}

export const flowScene: SceneDef<FlowProps> = {
  type: 'flow',

  cues(props, dur) {
    const layout = makeLayout(props);
    const timing = timingFor(layout, dur);
    const cues: Cue[] = [];
    const n = layout.nodes.length;
    if (!n) return cues;

    cues.push({ t: 0, kind: 'rise', len: Math.min(0.2, timing.enterDuration) });
    for (let i = 0; i < n; i++) {
      const at = timing.enterStart + i * timing.enterStagger;
      if (at < dur) {
        cues.push({ t: at, kind: 'pop', step: n > 1 ? i / (n - 1) : 0 });
        const typeAt = at + 0.02;
        if (typeAt < dur) cues.push({ t: typeAt, kind: 'type', len: timing.labelDuration });
      }
    }

    if (n > 1 && timing.travelStart < dur) {
      cues.push({ t: timing.travelStart, kind: 'pop', step: 0 });
      if (timing.travelStart + 0.035 < dur) cues.push({ t: timing.travelStart + 0.035, kind: 'swish' });
      const accentIndex = layout.nodes.findIndex(node => node.accent);
      let shimmerSent = false;
      if (accentIndex >= 0) {
        const payoff = nodeArrival(layout, timing, accentIndex);
        const riseAt = Math.max(0, payoff - 0.14);
        if (riseAt < payoff && riseAt < dur) cues.push({ t: riseAt, kind: 'rise', len: payoff - riseAt });
      }
      if (accentIndex === 0 && timing.travelStart + 0.025 < dur) {
        cues.push({ t: timing.travelStart + 0.025, kind: 'shimmer' });
        shimmerSent = true;
      }

      for (let i = 1; i < n; i++) {
        let at = nodeArrival(layout, timing, i);
        let cycle = 0;
        while (at < dur) {
          cues.push({ t: at, kind: cycle === 0 ? 'impact' : 'tick', step: i / Math.max(1, n - 1) });
          if (i === accentIndex && !shimmerSent) {
            cues.push({ t: at + 0.025 < dur ? at + 0.025 : at, kind: 'shimmer' });
            shimmerSent = true;
          }
          if (!layout.looping) break;
          cycle++;
          at += timing.travelSpan;
        }
      }
      if (layout.looping) {
        const returnAt = timing.travelStart + timing.travelSpan;
        if (returnAt < dur) cues.push({ t: returnAt, kind: 'tick', step: 1 });
      }
    }

    return cues.filter(cue => cue.t >= 0 && cue.t < dur).sort((a, b) => a.t - b.t).slice(0, 38);
  },

  render(frame: Frame, props: FlowProps) {
    const { t, dur, ctx, theme } = frame;
    const layout = makeLayout(props);
    const n = layout.nodes.length;
    if (!n) return;

    const timing = timingFor(layout, dur);
    const view = viewAt(t);
    const accentIndex = layout.nodes.findIndex(node => node.accent);
    const accentArrival = accentIndex >= 0 ? nodeArrival(layout, timing, accentIndex) : Infinity;
    const activatedIndex = t >= accentArrival ? accentIndex : -1;
    const objects: Object3D[] = [];

    addConduits(layout, t, timing, objects);

    layout.nodes.forEach((node, index) => {
      const point = layout.points[index]!;
      const enterAt = timing.enterStart + index * timing.enterStagger;
      const rawEnter = prog(t, enterAt, timing.enterDuration);
      const entrance = Math.max(0, ease.outBack(rawEnter));
      const reveal = ease.outCubic(rawEnter);
      const hit = lastHitTime(layout, timing, index, t);
      const age = hit === null ? 10 : Math.max(0, t - hit);
      const bounceLift = hit === null ? 0 : Math.sin(Math.min(age, 0.34) * 20) * Math.exp(-age * 9) * 0.18;
      const bounceScale = hit === null ? 1 : 1 + Math.exp(-age * 11) * Math.cos(age * 22) * 0.095;
      const idle = Math.sin(t * 2.1 + index * 0.9) * 0.025;
      const rainbow = index === activatedIndex;
      const allRainbow = rainbow ? Array.from({ length: 5 }, () => ({ accent: true })) : undefined;
      const neutral = [
        { tone: 0.56 },
        { accent: false },
        { tone: 0.44 },
        { tone: 1, unlit: true },
        { tone: 0.18 },
      ];
      const scaleY = bounceScale * entrance;

      objects.push({
        mesh: platformMesh(layout.platformW, layout.platformD),
        pos: [point.x, point.y + bounceLift + idle, point.z],
        scale: [entrance, scaleY, entrance],
        reveal,
        seed: frame.seed + index * 19,
        materials: allRainbow ?? neutral,
      });

      if (node.icon) {
        const iconEnter = clamp(rawEnter * 1.28);
        const iconX = point.x + (layout.direction === 'down' ? -2.65 : 0);
        objects.push({
          mesh: iconMesh(node.icon),
          pos: [iconX, point.y + 0.82 + bounceLift + idle, point.z],
          rot: [0, 0.35 + t * 0.17 + index * 0.42, 0],
          scale: 0.58 * entrance * bounceScale,
          reveal: iconEnter,
          seed: frame.seed + 700 + index * 31,
          materials: [{ tone: 0.94, accent: rainbow }],
        });
      }
    });

    addPacket(layout, timing, t, objects);
    render3d(ctx, theme, view, objects);
    drawNodeLabels(frame, layout, timing, view);
  },
};
