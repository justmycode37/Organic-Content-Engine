// A small software 3D renderer that outputs pixel art: meshes are rasterised
// with a depth buffer onto a low-resolution grid, flat shaded, then quantised
// to a few greys with ordered dither. Accent faces take the moving rainbow.
// Deterministic and dependency-free; runs wherever the 2D canvas runs.
import { hash, type Ctx, type Theme } from './core.ts';
import { CELL, bayer, blit, canDraw, hexRgb, layer, spectrumIndex } from './pix.ts';

export type Vec3 = [number, number, number];
/** Triangle soup. `p` = xyz per vertex, `t` = three vertex indices per triangle, `m` = material index per triangle. */
export interface Mesh { p: number[]; t: number[]; m: number[] }
/** `tone` 0..1 is the grey albedo (default 0.85). `accent` faces are rainbow. `unlit` ignores the light (screens, glows). */
export interface Material { tone?: number; accent?: boolean; unlit?: boolean }

// ---------------------------------------------------------------- mesh building

export const emptyMesh = (): Mesh => ({ p: [], t: [], m: [] });
function tri(mesh: Mesh, a: Vec3, b: Vec3, c: Vec3, m: number) {
  const i = mesh.p.length / 3;
  mesh.p.push(...a, ...b, ...c);
  mesh.t.push(i, i + 1, i + 2);
  mesh.m.push(m);
}
/** Adds a flat four-sided face. */
export function quad(mesh: Mesh, a: Vec3, b: Vec3, c: Vec3, d: Vec3, m = 0) { tri(mesh, a, b, c, m); tri(mesh, a, c, d, m); }

/** Box centred on the origin. `faces` can give a material per side: [right, left, top, bottom, front, back]. */
export function box(w = 1, h = 1, d = 1, m = 0, faces?: (number | undefined)[]): Mesh {
  const mesh = emptyMesh(), x = w / 2, y = h / 2, z = d / 2, f = (i: number) => faces?.[i] ?? m;
  quad(mesh, [x, -y, -z], [x, y, -z], [x, y, z], [x, -y, z], f(0));
  quad(mesh, [-x, -y, z], [-x, y, z], [-x, y, -z], [-x, -y, -z], f(1));
  quad(mesh, [-x, y, -z], [-x, y, z], [x, y, z], [x, y, -z], f(2));
  quad(mesh, [-x, -y, z], [-x, -y, -z], [x, -y, -z], [x, -y, z], f(3));
  quad(mesh, [-x, -y, -z], [-x, y, -z], [x, y, -z], [x, -y, -z], f(4));
  quad(mesh, [x, -y, z], [x, y, z], [-x, y, z], [-x, -y, z], f(5));
  return mesh;
}

/** Upright cylinder (axis = Y). `capM` is the material of the two caps. A cone when `topR` is 0. */
export function cylinder(r = 0.5, h = 1, segments = 20, m = 0, capM = m, topR = r): Mesh {
  const mesh = emptyMesh(), y = h / 2;
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2, b = ((i + 1) / segments) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
    quad(mesh, [ca * r, -y, sa * r], [ca * topR, y, sa * topR], [cb * topR, y, sb * topR], [cb * r, -y, sb * r], m);
    if (topR > 0) tri(mesh, [0, y, 0], [ca * topR, y, sa * topR], [cb * topR, y, sb * topR], capM);
    tri(mesh, [0, -y, 0], [cb * r, -y, sb * r], [ca * r, -y, sa * r], capM);
  }
  return mesh;
}
export const cone = (r = 0.5, h = 1, segments = 20, m = 0) => cylinder(r, h, segments, m, m, 0);

/** Sphere. `band(lat, lon)` may return a material per patch (lat 0..rings-1 from the top, lon 0..segments-1). */
export function sphere(r = 0.5, segments = 20, rings = 12, m = 0, band?: (lat: number, lon: number) => number | undefined): Mesh {
  const mesh = emptyMesh();
  const at = (lat: number, lon: number): Vec3 => {
    const v = (lat / rings) * Math.PI, u = (lon / segments) * Math.PI * 2;
    return [Math.sin(v) * Math.cos(u) * r, Math.cos(v) * r, Math.sin(v) * Math.sin(u) * r];
  };
  for (let lat = 0; lat < rings; lat++) for (let lon = 0; lon < segments; lon++)
    quad(mesh, at(lat, lon), at(lat, lon + 1), at(lat + 1, lon + 1), at(lat + 1, lon), band?.(lat, lon) ?? m);
  return mesh;
}

/** Ring lying flat (axis = Y). R = ring radius, r = tube radius. */
export function torus(R = 0.5, r = 0.18, segments = 24, sides = 10, m = 0): Mesh {
  const mesh = emptyMesh();
  const at = (i: number, j: number): Vec3 => {
    const u = (i / segments) * Math.PI * 2, v = (j / sides) * Math.PI * 2, k = R + r * Math.cos(v);
    return [k * Math.cos(u), r * Math.sin(v), k * Math.sin(u)];
  };
  for (let i = 0; i < segments; i++) for (let j = 0; j < sides; j++) quad(mesh, at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1), m);
  return mesh;
}

/**
 * Voxel model from bitmap rows: every non-empty character becomes a cube
 * `depth` deep. '1'..'9' pick materials 0..8, so a sprite can mix neutral and
 * accent voxels. Hidden inner faces are skipped. The model is centred and its
 * longest side is `size` units.
 */
export function voxels(rows: readonly string[], depth = 2, size = 1): Mesh {
  const mesh = emptyMesh(), h = rows.length, w = Math.max(1, ...rows.map(row => row.length));
  const s = size / Math.max(w, h), z = (depth * s) / 2;
  const at = (col: number, row: number) => { const c = rows[row]?.[col]; return c && c !== '0' && c !== ' ' && c !== '.' ? Math.max(0, (parseInt(c, 36) || 1) - 1) : -1; };
  for (let row = 0; row < h; row++) for (let col = 0; col < w; col++) {
    const m = at(col, row);
    if (m < 0) continue;
    const x0 = (col - w / 2) * s, x1 = x0 + s, y1 = (h / 2 - row) * s, y0 = y1 - s;
    quad(mesh, [x0, y0, -z], [x0, y1, -z], [x1, y1, -z], [x1, y0, -z], m);
    quad(mesh, [x1, y0, z], [x1, y1, z], [x0, y1, z], [x0, y0, z], m);
    if (at(col + 1, row) < 0) quad(mesh, [x1, y0, -z], [x1, y1, -z], [x1, y1, z], [x1, y0, z], m);
    if (at(col - 1, row) < 0) quad(mesh, [x0, y0, z], [x0, y1, z], [x0, y1, -z], [x0, y0, -z], m);
    if (at(col, row - 1) < 0) quad(mesh, [x0, y1, -z], [x0, y1, z], [x1, y1, z], [x1, y1, -z], m);
    if (at(col, row + 1) < 0) quad(mesh, [x0, y0, z], [x0, y0, -z], [x1, y0, -z], [x1, y0, z], m);
  }
  return mesh;
}

const rotate = (v: Vec3, [rx, ry, rz]: Vec3): Vec3 => {
  let [x, y, z] = v;
  if (rz) { const c = Math.cos(rz), s = Math.sin(rz); [x, y] = [x * c - y * s, x * s + y * c]; }
  if (rx) { const c = Math.cos(rx), s = Math.sin(rx); [y, z] = [y * c - z * s, y * s + z * c]; }
  if (ry) { const c = Math.cos(ry), s = Math.sin(ry); [x, z] = [x * c + z * s, -x * s + z * c]; }
  return [x, y, z];
};
/** Returns a moved copy: scale, then rotate (radians, order Z, X, Y), then translate. `m` remaps every material. */
export function place(mesh: Mesh, options: { pos?: Vec3; rot?: Vec3; scale?: number | Vec3; m?: number } = {}): Mesh {
  const { pos = [0, 0, 0], rot = [0, 0, 0], scale = 1 } = options;
  const k: Vec3 = typeof scale === 'number' ? [scale, scale, scale] : scale;
  const p: number[] = [];
  for (let i = 0; i < mesh.p.length; i += 3) {
    const v = rotate([mesh.p[i]! * k[0], mesh.p[i + 1]! * k[1], mesh.p[i + 2]! * k[2]], rot);
    p.push(v[0] + pos[0], v[1] + pos[1], v[2] + pos[2]);
  }
  return { p, t: mesh.t.slice(), m: options.m === undefined ? mesh.m.slice() : mesh.m.map(() => options.m!) };
}
export function merge(...meshes: Mesh[]): Mesh {
  const out = emptyMesh();
  for (const mesh of meshes) {
    const base = out.p.length / 3;
    for (const v of mesh.p) out.p.push(v);
    for (const i of mesh.t) out.t.push(i + base);
    for (const m of mesh.m) out.m.push(m);
  }
  return out;
}

// ---------------------------------------------------------------- rendering

export interface View3D {
  /** Region of the frame, in canvas px. The world origin projects to its centre. */
  x: number; y: number; w: number; h: number;
  /** Canvas px per world unit at the origin. */
  zoom: number;
  /** Camera orbit in radians. yaw turns around the vertical axis; pitch > 0 looks down on the scene. */
  yaw?: number; pitch?: number;
  /** Camera distance in world units; larger = flatter perspective. Ignored when `ortho`. Default 6. */
  distance?: number;
  /** Isometric-style parallel projection. */
  ortho?: boolean;
  /** Art pixel size. Default CELL. */
  cell?: number;
  /** One-pixel outline around the silhouette, and dark creases where depth jumps. Default true. */
  outline?: boolean;
  /** Optional character/semantic palette; never used as a decorative accent. */
  palette?: string[];
  /** Extra offset of the projected origin from the region centre, canvas px. */
  cx?: number; cy?: number;
}
export interface Object3D { mesh: Mesh; pos?: Vec3; rot?: Vec3; scale?: number | Vec3; materials?: Material[]; /** 0..1 build: voxels/triangles appear in random order. */ reveal?: number; seed?: number }

const DEFAULT_MATERIALS: Material[] = [{ tone: 0.85 }, { accent: true }, { tone: 0.45 }, { tone: 1, unlit: true }, { tone: 0.2 }];
const LIGHT: Vec3 = (() => { const v: Vec3 = [-0.5, 0.72, -0.48], l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; })();

type Buffers = { z: Float32Array; shade: Float32Array; kind: Uint8Array };
const buffers = new Map<number, Buffers>();

function camera(view: View3D) {
  const yaw = view.yaw ?? 0, pitch = view.pitch ?? 0, distance = view.distance ?? 6, cell = view.cell ?? CELL;
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const cols = Math.ceil(view.w / cell), rows = Math.ceil(view.h / cell);
  const ox = cols / 2 + (view.cx ?? 0) / cell, oy = rows / 2 + (view.cy ?? 0) / cell, k = view.zoom / cell;
  /** World point to buffer pixel + depth. */
  const toView = (x: number, y: number, z: number): Vec3 => {
    const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
    const y2 = y * cp + z1 * sp, z2 = -y * sp + z1 * cp;
    return [x1, y2, z2 + distance];
  };
  const toScreen = (v: Vec3): Vec3 => {
    const s = view.ortho ? k : (k * distance) / Math.max(0.2, v[2]);
    return [ox + v[0] * s, oy - v[1] * s, v[2]];
  };
  return { cols, rows, cell, toView, toScreen };
}

/** Canvas position of a world point, for attaching labels and callouts to a 3D object. */
export function project(view: View3D, point: Vec3): { x: number; y: number } {
  const cam = camera(view), s = cam.toScreen(cam.toView(...point));
  const left = Math.round(view.x / cam.cell) * cam.cell, top = Math.round(view.y / cam.cell) * cam.cell;
  return { x: left + s[0] * cam.cell, y: top + s[1] * cam.cell };
}

/**
 * Renders objects into the view region as dithered pixel art. Neutral
 * materials use the theme's greys; accent materials use the rainbow, drifting
 * with theme.time. Objects may intersect: a depth buffer sorts every pixel.
 */
export function render3d(ctx: Ctx, theme: Theme, view: View3D, objects: Object3D[]) {
  if (!canDraw()) return;
  const cam = camera(view), { cols, rows, cell } = cam, count = cols * rows;
  if (count < 1 || count > 400000) return;
  let buf = buffers.get(count);
  if (!buf) { if (buffers.size > 12) buffers.clear(); buf = { z: new Float32Array(count), shade: new Float32Array(count), kind: new Uint8Array(count) }; buffers.set(count, buf); }
  const { z: zb, shade: sb, kind: kb } = buf;
  zb.fill(Infinity); kb.fill(0);

  for (const object of objects) {
    const mesh = object.pos || object.rot || object.scale !== undefined ? place(object.mesh, object) : object.mesh;
    const materials = object.materials ?? DEFAULT_MATERIALS, reveal = object.reveal ?? 1;
    if (reveal <= 0) continue;
    for (let f = 0; f < mesh.m.length; f++) {
      // Triangles come in pairs (quads): reveal them together.
      if (reveal < 1 && hash(f >> 1, object.seed ?? 1) > reveal) continue;
      const ia = mesh.t[f * 3]! * 3, ib = mesh.t[f * 3 + 1]! * 3, ic = mesh.t[f * 3 + 2]! * 3;
      const a = cam.toView(mesh.p[ia]!, mesh.p[ia + 1]!, mesh.p[ia + 2]!);
      const b = cam.toView(mesh.p[ib]!, mesh.p[ib + 1]!, mesh.p[ib + 2]!);
      const c = cam.toView(mesh.p[ic]!, mesh.p[ic + 1]!, mesh.p[ic + 2]!);
      if (a[2] < 0.2 || b[2] < 0.2 || c[2] < 0.2) continue;
      let nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
      let ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
      let nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      const length = Math.hypot(nx, ny, nz);
      if (length < 1e-9) continue;
      nx /= length; ny /= length; nz /= length;
      // Two-sided: the normal always faces the camera, so winding never matters.
      const facing = view.ortho ? nz : nx * a[0] + ny * a[1] + nz * a[2];
      if (facing > 0) { nx = -nx; ny = -ny; nz = -nz; }
      const material = materials[mesh.m[f]!] ?? materials[0] ?? DEFAULT_MATERIALS[0]!;
      const lit = material.unlit ? 1 : 0.2 + 0.8 * Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
      const shade = Math.min(1, lit * (material.accent ? 1 : material.tone ?? 0.85));
      const kind = material.accent ? 2 : 1;
      const A = cam.toScreen(a), B = cam.toScreen(b), C = cam.toScreen(c);
      const area = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
      if (Math.abs(area) < 1e-6) continue;
      const x0 = Math.max(0, Math.floor(Math.min(A[0], B[0], C[0]))), x1 = Math.min(cols - 1, Math.ceil(Math.max(A[0], B[0], C[0])));
      const y0 = Math.max(0, Math.floor(Math.min(A[1], B[1], C[1]))), y1 = Math.min(rows - 1, Math.ceil(Math.max(A[1], B[1], C[1])));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const px = x + 0.5, py = y + 0.5;
        const w0 = ((B[0] - px) * (C[1] - py) - (B[1] - py) * (C[0] - px)) / area;
        const w1 = ((C[0] - px) * (A[1] - py) - (C[1] - py) * (A[0] - px)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) continue;
        const depth = w0 * A[2] + w1 * B[2] + w2 * C[2], i = y * cols + x;
        if (depth >= zb[i]!) continue;
        zb[i] = depth; sb[i] = shade; kb[i] = kind;
      }
    }
  }

  const buffer = layer(cols, rows, '3d');
  const image = buffer.ctx.createImageData(cols, rows), data = image.data;
  const dark = theme.mode === 'dark';
  const ramp = (view.palette ?? (theme.accentSolid.toLowerCase()==='#ffffff'?['#111111','#444444','#888888','#bbbbbb','#ffffff']:dark ? ['#17171A', '#3A3A3F', '#77777D', '#BDBDC2', '#FFFFFF'] : ['#0A0A0C', '#3C3C40', '#7C7C82', '#C0C0C5', '#F4F4F5'])).map(hexRgb);
  const colors = theme.spectrum.map(hexRgb), band = 3, drift = Math.floor(theme.time * 14);
  const edge = hexRgb(theme.fg), outline = view.outline !== false;
  const left = Math.round(view.x / cell), top = Math.round(view.y / cell);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const i = y * cols + x, o = i * 4, kind = kb[i]!;
    if (!kind) {
      if (outline && ((x > 0 && kb[i - 1]) || (x < cols - 1 && kb[i + 1]) || (y > 0 && kb[i - cols]) || (y < rows - 1 && kb[i + cols]))) { data[o] = edge[0]; data[o + 1] = edge[1]; data[o + 2] = edge[2]; data[o + 3] = 255; }
      continue;
    }
    const threshold = bayer(x + left, y + top), shade = sb[i]!;
    // A crease: this pixel sits clearly behind a neighbour, so it is drawn in the darkest tone.
    const depth = zb[i]!, crease = outline && ((x > 0 && kb[i - 1] && depth - zb[i - 1]! > 0.18) || (y > 0 && kb[i - cols] && depth - zb[i - cols]! > 0.18) || (x < cols - 1 && kb[i + 1] && depth - zb[i + 1]! > 0.18) || (y < rows - 1 && kb[i + cols] && depth - zb[i + cols]! > 0.18));
    let r: number, g: number, b: number;
    if (kind === 2) {
      const color = colors[spectrumIndex(x + left + drift, y + top, colors.length, band)]!;
      // Three brightness steps, dithered, keep the form readable inside the rainbow.
      const v = shade * 2, step = Math.min(2, Math.floor(v) + (v - Math.floor(v) > threshold ? 1 : 0)), k = crease ? 0.3 : [0.42, 0.72, 1][step]!;
      r = color[0] * k; g = color[1] * k; b = color[2] * k;
    } else {
      const v = shade * (ramp.length - 1), step = crease ? 0 : Math.min(ramp.length - 1, Math.floor(v) + (v - Math.floor(v) > threshold ? 1 : 0));
      [r, g, b] = ramp[step]!;
    }
    data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255;
  }
  buffer.ctx.putImageData(image, 0, 0);
  blit(ctx, buffer.canvas as CanvasImageSource, left * cell, top * cell, cols, rows, cell);
}
