import {
  clamp,
  ease,
  prog,
  SAFE,
  type Cue,
  type Frame,
  type LayersProps,
  type SceneDef,
} from '../core.ts';
import { fitPixel, pixelBlock, pixelHeight, pixelText, pixelWidth } from '../prim.ts';
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
  type View3D,
} from '../three.ts';

const SLAB_W = 9.5;
const SLAB_H = 0.72;
const SLAB_D = 6.7;
const STACK_Y = 0.74;
const EXPLODE_Y = 1.55;
const VIEW_BASE: Omit<View3D, 'yaw' | 'pitch'> = {
  x: 112,
  y: 320,
  w: 856,
  h: 920,
  zoom: 70,
  ortho: true,
  distance: 10,
  cell: 4,
  outline: true,
};

const meshCache = new Map<string, Mesh>();

interface LayerTiming {
  start: number;
  move: number;
  stagger: number;
  payoff: number;
  lastMoveEnd: number;
}

function timing(dur: number, count: number): LayerTiming {
  const length = Math.max(0.1, dur);
  const start = Math.min(0.18, length * 0.06);
  const move = clamp(length * 0.13, 0.16, 0.35);
  const staggerSpan = Math.min(length * 0.3, 0.9);
  const stagger = count > 1 ? staggerSpan / (count - 1) : 0;
  const lastMoveEnd = start + stagger * Math.max(0, count - 1) + move;
  const payoff = clamp(length * 0.64, lastMoveEnd + 0.08, length - 0.16);
  return { start, move, stagger, payoff, lastMoveEnd };
}

function pushBox(
  parts: Mesh[],
  width: number,
  height: number,
  depth: number,
  x: number,
  y: number,
  z: number,
  material: number,
) {
  parts.push(place(box(width, height, depth, material), { pos: [x, y, z] }));
}

function bevelledBase(index: number, accent: boolean): Mesh {
  const mesh = emptyMesh();
  const x = SLAB_W / 2;
  const z = SLAB_D / 2;
  const bevel = 0.18;
  const top = SLAB_H / 2;
  const sideTop = top - bevel;
  const bottom = -top;
  const ix = x - bevel;
  const iz = z - bevel;
  const topMaterial = accent ? 5 : 1;
  const sideMaterial = index % 2 === 0 ? 0 : 3;

  // The inset top and four angled strips make the body read as a machined slab.
  quad(mesh, [-ix, top, -iz], [ix, top, -iz], [ix, top, iz], [-ix, top, iz], topMaterial);
  quad(mesh, [-ix, top, iz], [ix, top, iz], [x, sideTop, z], [-x, sideTop, z], 2);
  quad(mesh, [ix, top, -iz], [-ix, top, -iz], [-x, sideTop, -z], [x, sideTop, -z], 2);
  quad(mesh, [-ix, top, -iz], [-ix, top, iz], [-x, sideTop, z], [-x, sideTop, -z], 2);
  quad(mesh, [ix, top, iz], [ix, top, -iz], [x, sideTop, -z], [x, sideTop, z], 2);

  quad(mesh, [-x, sideTop, z], [x, sideTop, z], [x, bottom, z], [-x, bottom, z], accent ? 5 : sideMaterial);
  quad(mesh, [x, sideTop, -z], [-x, sideTop, -z], [-x, bottom, -z], [x, bottom, -z], 0);
  quad(mesh, [-x, sideTop, -z], [-x, sideTop, z], [-x, bottom, z], [-x, bottom, -z], 3);
  quad(mesh, [x, sideTop, z], [x, sideTop, -z], [x, bottom, -z], [x, bottom, z], accent ? 5 : 0);
  quad(mesh, [-x, bottom, -z], [x, bottom, -z], [x, bottom, z], [-x, bottom, z], 3);
  return mesh;
}

function surfaceDetails(index: number): Mesh {
  const parts: Mesh[] = [];
  const top = SLAB_H / 2;
  const role = index % 3;

  // Four recessed corner fasteners give every layer a crisp mechanical edge.
  for (const x of [-4.25, 4.25]) {
    for (const z of [-2.85, 2.85]) {
      pushBox(parts, 0.2, 0.055, 0.2, x, top + 0.027, z, 4);
      pushBox(parts, 0.08, 0.06, 0.08, x, top + 0.06, z, 3);
    }
  }

  if (role === 0) {
    // A field of tiny cells, with a different cadence on each slab.
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 8; col++) {
        if ((row * 3 + col * 5 + index) % 4 === 0) continue;
        const x = -3.55 + col * 1.0;
        const z = -2.05 + row * 1.0;
        const material = (row + col + index) % 5 === 0 ? 4 : 3;
        pushBox(parts, 0.42, 0.055, 0.34, x, top + 0.028, z, material);
        if ((row + col) % 3 === 0) {
          pushBox(parts, 0.12, 0.07, 0.12, x + 0.19, top + 0.055, z - 0.12, 1);
        }
      }
    }
  } else if (role === 1) {
    // Etched traces turn at right angles and terminate in square contacts.
    const tracks = [
      { x: -3.25, z: -1.8, w: 2.15, d: 0.09 },
      { x: 1.95, z: -1.8, w: 2.55, d: 0.09 },
      { x: -2.35, z: 0.1, w: 3.1, d: 0.09 },
      { x: 1.7, z: 1.75, w: 2.8, d: 0.09 },
    ];
    tracks.forEach((track, line) => {
      pushBox(parts, track.w, 0.05, track.d, track.x, top + 0.025, track.z, line % 2 ? 3 : 4);
      const turnX = track.x + track.w * (line % 2 ? -0.32 : 0.31);
      const turnZ = track.z + (line % 2 ? 0.62 : -0.62);
      pushBox(parts, 0.09, 0.05, Math.abs(turnZ - track.z), turnX, top + 0.025, (track.z + turnZ) / 2, 3);
      pushBox(parts, 0.2, 0.06, 0.2, track.x + track.w / 2, top + 0.04, track.z, 4);
      pushBox(parts, 0.18, 0.06, 0.18, turnX, top + 0.04, turnZ, 1);
    });
  } else {
    // A package, pins and surrounding pads make this layer feel like hardware.
    pushBox(parts, 2.3, 0.09, 1.72, 0, top + 0.04, 0, 0);
    pushBox(parts, 1.62, 0.12, 1.08, 0, top + 0.13, 0, 4);
    pushBox(parts, 0.9, 0.08, 0.5, 0, top + 0.21, 0, 1);
    for (let pin = 0; pin < 8; pin++) {
      const offset = -1.1 + pin * 0.31;
      pushBox(parts, 0.1, 0.055, 0.5, offset, top + 0.04, -1.28, 3);
      pushBox(parts, 0.1, 0.055, 0.5, offset, top + 0.04, 1.28, 3);
      if (pin < 5) {
        pushBox(parts, 0.44, 0.055, 0.28, -3.05 + pin * 1.52, top + 0.03, 2.25, 4);
      }
    }
    pushBox(parts, 0.36, 0.07, 0.36, -2.8, top + 0.055, -2.35, 1);
    pushBox(parts, 0.36, 0.07, 0.36, 2.8, top + 0.055, 2.35, 1);
  }

  return merge(...parts);
}

function slabMesh(index: number, accent: boolean): Mesh {
  const key = `${index}:${accent ? 1 : 0}`;
  let mesh = meshCache.get(key);
  if (!mesh) {
    mesh = merge(bevelledBase(index, accent), surfaceDetails(index));
    meshCache.set(key, mesh);
  }
  return mesh;
}

function shortTitle(value: unknown, px: number, maxWidth: number): string {
  const words = String(value ?? '').trim().toUpperCase().split(/\s+/).filter(Boolean);
  let title = '';
  for (const word of words) {
    const candidate = title ? `${title} ${word}` : word;
    if (pixelWidth(candidate, px) <= maxWidth) title = candidate;
    else if (!title) {
      title = word;
      while (title.length > 1 && pixelWidth(title, px) > maxWidth) title = title.slice(0, -1);
      break;
    } else break;
  }
  return title;
}

function drawLeader(
  ctx: Frame['ctx'],
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
) {
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

function drawLayerLabel(
  frame: Frame,
  label: LayersProps['layers'][number],
  index: number,
  view: View3D,
  worldY: number,
  alpha: number,
) {
  const { ctx, theme } = frame;
  if (alpha <= 0) return;
  const side = index % 2 === 0 ? -1 : 1;
  const anchor = project(view, [side * (SLAB_W / 2), worldY + SLAB_H * 0.48, side * (SLAB_D / 2)]);
  const raw = String(label.label ?? 'LAYER').trim().toUpperCase().slice(0, 60);
  const fit = fitPixel(raw || 'LAYER', 220, 2, [8, 7]);
  const lines = fit.lines.slice(0, 2);
  const px = Math.max(7, fit.px);
  const note = String(label.note ?? '').trim().slice(0, 30);
  const textWidth = Math.max(...lines.map(line => pixelWidth(line.replaceAll('*', ''), px)), 56);
  const panelW = clamp(textWidth + 32, 138, 250);
  const panelH = 24 + lines.length * pixelHeight(px) + (lines.length - 1) * 5 + (note ? 30 : 0);
  const panelX = side < 0 ? SAFE.x + 8 : SAFE.right - panelW - 8;
  const panelY = clamp(anchor.y - panelH / 2, 344, 1100 - panelH);
  const railX = side < 0 ? panelX + panelW : panelX;
  const labelCenterY = panelY + panelH / 2;

  ctx.save();
  ctx.globalAlpha *= clamp(alpha);
  drawLeader(ctx, anchor.x, anchor.y, railX, labelCenterY, theme.dim);
  ctx.fillStyle = theme.panel;
  ctx.fillRect(panelX, panelY, panelW, panelH);
  ctx.strokeStyle = theme.line;
  ctx.lineWidth = 4;
  ctx.strokeRect(panelX + 2, panelY + 2, panelW - 4, panelH - 4);
  ctx.fillStyle = label.accent ? theme.accent : theme.fg;
  pixelBlock(ctx, lines, side < 0 ? panelX + 14 : panelX + panelW - 14, panelY + 12, px, {
    color: label.accent ? theme.accent : theme.fg,
    align: side < 0 ? 'left' : 'right',
    gap: 5,
  });
  if (note) {
    ctx.font = '700 18px sans-serif';
    ctx.textAlign = side < 0 ? 'left' : 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = theme.dim;
    ctx.fillText(note, side < 0 ? panelX + 14 : panelX + panelW - 14, panelY + panelH - 10, panelW - 28);
  }
  const markerX = side < 0 ? panelX + panelW - 4 : panelX;
  ctx.fillStyle = label.accent ? theme.accent : theme.fg;
  ctx.fillRect(markerX - 4, labelCenterY - 4, 8, 8);
  ctx.restore();
}

export const layersScene: SceneDef<LayersProps> = {
  type: 'layers',

  render(frame: Frame, props: LayersProps) {
    const layers = (Array.isArray(props.layers) ? props.layers : []).slice(0, 6);
    if (layers.length === 0) return;

    const { ctx, theme, t } = frame;
    const count = layers.length;
    const animation = timing(frame.dur, count);
    const title = String(props.title ?? '').trim();
    if (title) {
      pixelText(ctx, shortTitle(title, 12, SAFE.w), SAFE.cx, 246, 12, {
        color: theme.fg,
        align: 'center',
      });
    }

    // A small, slow orbit changes the silhouette without throwing labels off it.
    const view: View3D = {
      ...VIEW_BASE,
      yaw: 0.55 + Math.sin(t * 0.34) * 0.12,
      pitch: 0.48 + Math.sin(t * 0.23) * 0.025,
    };
    const objects: Object3D[] = [];
    const worldY: number[] = [];
    const center = (count - 1) / 2;

    layers.forEach((layer, index) => {
      const releaseAt = animation.start + index * animation.stagger;
      const release = ease.outBack(prog(t, releaseAt, animation.move));
      const fusedY = (index - center) * STACK_Y;
      const explodedY = (index - center) * EXPLODE_Y;
      const y = fusedY + (explodedY - fusedY) * release;
      worldY.push(y);

      const accent = Boolean(layer.accent);
      const payoff = clamp(prog(t, animation.payoff, 0.3));
      const pulse = accent ? Math.max(0, Math.sin((t - animation.payoff) * Math.PI * 3)) * payoff : 0;
      const scale = accent ? 1 + pulse * 0.045 : 1;
      objects.push({
        mesh: slabMesh(index, accent),
        pos: [0, y, 0],
        rot: [0, 0, 0],
        scale: [scale, 1, scale],
        materials: [
          { tone: 0.27 },
          { tone: 0.84 },
          { tone: 0.92 },
          { tone: 0.16 },
          { tone: 1, unlit: true },
          { accent: true },
        ],
        seed: index * 47 + 9,
      });
    });

    render3d(ctx, theme, view, objects);

    layers.forEach((layer, index) => {
      const labelAt = animation.start + index * animation.stagger + 0.04;
      const visible = ease.outExpo(prog(t, labelAt, 0.17));
      drawLayerLabel(frame, layer, index, view, worldY[index]!, visible);
    });
  },

  cues(props: LayersProps, dur: number): Cue[] {
    const count = Math.min(6, Array.isArray(props.layers) ? props.layers.length : 0);
    if (count === 0) return [];
    const animation = timing(dur, count);
    const cues: Cue[] = [{ t: animation.start, kind: 'rise', len: animation.move }];
    for (let index = 0; index < count; index++) {
      cues.push({
        t: animation.start + index * animation.stagger,
        kind: 'pop',
        step: count < 2 ? 0 : index / (count - 1),
      });
    }
    cues.push(
      { t: animation.lastMoveEnd, kind: 'impact' },
      { t: animation.payoff, kind: 'shimmer' },
    );
    return cues.filter(cue => cue.t >= 0 && cue.t < dur).sort((a, b) => a.t - b.t);
  },
};
