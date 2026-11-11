/**
 * Deterministic software 3D renderer for crisp, noir pixel art.
 *
 * Quick start: `render3d(ctx, theme, {x,y,w,h,zoom}, [{mesh: sphere(), materials:[{ramp:'steel',spec:.65}]}])`.
 * Materials may use named or explicit dark-to-light ramps. Views may add a
 * full camera (`position`, `target`, `fov`, `roll`), directional lighting,
 * ground shadows, fog and ink outlines. Objects support `reveal`, `explode`
 * and bottom-up `slice`. Legacy orbit views and all mesh helpers remain valid.
 */
// Dependency-free CPU rasterizer. Triangles are clipped in camera space,
// sampled on a low-resolution pixel grid, depth shaded, outlined and blitted.
import { hash, type Ctx, type Theme } from './core.ts';
import { CELL, bayer, blit, canDraw, hexRgb, layer, spectrumIndex } from './pix.ts';

export type Vec3 = [number, number, number];
/** Triangle soup. `p` = xyz per vertex, `t` = three vertex indices per triangle, `m` = material index per triangle. */
export interface Mesh { p: number[]; t: number[]; m: number[]; /** Optional per-vertex normals and coplanar face groups. */ n?: number[]; face?: number[] }
/** `tone` 0..1 is the ramp albedo (default 1). `accent` faces use the legacy spectrum. `unlit` ignores the light (screens, glows). */
export type RampName = 'mono' | 'bone' | 'steel' | 'ink' | 'chrome' | 'glass' | 'brown' | 'red' | 'green' | 'paper';
export interface Material {
  tone?: number; accent?: boolean; unlit?: boolean;
  /** Named colour ramp (or explicit dark->light hex ramp). Default 'mono'. Colour ramps are semantic only (brown = Hedgy/wood, red/green = losses/gains). */
  ramp?: RampName | string[];
  /** 0..1 self-illumination (screens, glows, sparks). */
  emissive?: number;
  /** 0..1 specular glint strength (metal, glass, coins). */
  spec?: number;
}

// ---------------------------------------------------------------- mesh building

export const emptyMesh = (): Mesh => ({ p: [], t: [], m: [] });
function triangleNormal(mesh: Mesh, f: number): Vec3 {
  const ia = mesh.t[f * 3]! * 3, ib = mesh.t[f * 3 + 1]! * 3, ic = mesh.t[f * 3 + 2]! * 3, ax = mesh.p[ia]!, ay = mesh.p[ia + 1]!, az = mesh.p[ia + 2]!;
  const ux = mesh.p[ib]! - ax, uy = mesh.p[ib + 1]! - ay, uz = mesh.p[ib + 2]! - az, vx = mesh.p[ic]! - ax, vy = mesh.p[ic + 1]! - ay, vz = mesh.p[ic + 2]! - az;
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}
function ensureNormals(mesh: Mesh) {
  if (mesh.n) return;
  mesh.n = [];
  for (let f = 0; f < mesh.t.length / 3; f++) mesh.n.push(...triangleNormal(mesh, f), ...triangleNormal(mesh, f), ...triangleNormal(mesh, f));
}
function ensureFaces(mesh: Mesh) {
  if (!mesh.face) { mesh.face = []; for (let f = 0; f < mesh.t.length / 3; f++) mesh.face.push(f); }
  else while (mesh.face.length < mesh.t.length / 3) mesh.face.push(mesh.face.length);
}
function tri(mesh: Mesh, a: Vec3, b: Vec3, c: Vec3, m: number, group?: number, na?: Vec3, nb?: Vec3, nc?: Vec3) {
  const i = mesh.p.length / 3;
  mesh.p.push(...a, ...b, ...c);
  mesh.t.push(i, i + 1, i + 2);
  mesh.m.push(m);
  mesh.face?.push(group ?? mesh.t.length / 3 - 1);
  if (na || mesh.n) {
    ensureNormals(mesh);
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1; nx /= len; ny /= len; nz /= len;
    mesh.n!.push(...(na ?? [nx, ny, nz]), ...(nb ?? [nx, ny, nz]), ...(nc ?? [nx, ny, nz]));
  }
}
/** Adds a flat four-sided face. */
export function quad(mesh: Mesh, a: Vec3, b: Vec3, c: Vec3, d: Vec3, m = 0) { const group = mesh.t.length / 3; ensureFaces(mesh); tri(mesh, a, b, c, m, group); tri(mesh, a, c, d, m, group); }

function quadSmooth(mesh: Mesh, a: Vec3, b: Vec3, c: Vec3, d: Vec3, m: number, na: Vec3, nb: Vec3, nc: Vec3, nd: Vec3) {
  const group = mesh.t.length / 3; ensureFaces(mesh); ensureNormals(mesh);
  tri(mesh, a, b, c, m, group, na, nb, nc); tri(mesh, a, c, d, m, group, na, nc, nd);
}

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
    const slope = h ? (r - topR) / h : 0;
    const normal = (x: number, z: number): Vec3 => { const n = Math.hypot(x, slope, z) || 1; return [x / n, slope / n, z / n]; };
    quadSmooth(mesh, [ca * r, -y, sa * r], [ca * topR, y, sa * topR], [cb * topR, y, sb * topR], [cb * r, -y, sb * r], m,
      normal(ca, sa), normal(ca, sa), normal(cb, sb), normal(cb, sb));
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
  const normalAt = (lat: number, lon: number): Vec3 => { const v = (lat / rings) * Math.PI, u = (lon / segments) * Math.PI * 2; return [Math.sin(v) * Math.cos(u), Math.cos(v), Math.sin(v) * Math.sin(u)]; };
  for (let lat = 0; lat < rings; lat++) for (let lon = 0; lon < segments; lon++)
    quadSmooth(mesh, at(lat, lon), at(lat, lon + 1), at(lat + 1, lon + 1), at(lat + 1, lon), band?.(lat, lon) ?? m,
      normalAt(lat, lon), normalAt(lat, lon + 1), normalAt(lat + 1, lon + 1), normalAt(lat + 1, lon));
  return mesh;
}

/** Ring lying flat (axis = Y). R = ring radius, r = tube radius. */
export function torus(R = 0.5, r = 0.18, segments = 24, sides = 10, m = 0): Mesh {
  const mesh = emptyMesh();
  const at = (i: number, j: number): Vec3 => {
    const u = (i / segments) * Math.PI * 2, v = (j / sides) * Math.PI * 2, k = R + r * Math.cos(v);
    return [k * Math.cos(u), r * Math.sin(v), k * Math.sin(u)];
  };
  const normalAt = (i: number, j: number): Vec3 => { const u = (i / segments) * Math.PI * 2, v = (j / sides) * Math.PI * 2; return [Math.cos(v) * Math.cos(u), Math.sin(v), Math.cos(v) * Math.sin(u)]; };
  for (let i = 0; i < segments; i++) for (let j = 0; j < sides; j++)
    quadSmooth(mesh, at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1), m,
      normalAt(i, j), normalAt(i + 1, j), normalAt(i + 1, j + 1), normalAt(i, j + 1));
  return mesh;
}

/**
 * Voxel model from bitmap rows: every non-empty character becomes a cube
 * `depth` deep. '1'..'9' pick materials 0..8, so a sprite can mix neutral and
 * accent voxels. Hidden inner faces are skipped. The model is centred and its
 * longest side is `size` units.
 */
export type VoxelPalette = Readonly<Record<string, number>> | ReadonlyMap<string, number>;
export function voxels(rows: readonly string[], depth = 2, size = 1, palette?: VoxelPalette): Mesh {
  const mesh = emptyMesh(), h = rows.length, w = Math.max(1, ...rows.map(row => row.length));
  const s = size / Math.max(w, h), z = (depth * s) / 2;
  const at = (col: number, row: number) => {
    const c = rows[row]?.[col];
    if (!c || c === '0' || c === ' ' || c === '.') return -1;
    const mapped = palette instanceof Map ? palette.get(c) : (palette as Readonly<Record<string, number>> | undefined)?.[c];
    return mapped === undefined ? Math.max(0, (parseInt(c, 36) || 1) - 1) : Math.max(0, mapped | 0);
  };
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
  const placed: Mesh = { p, t: mesh.t.slice(), m: options.m === undefined ? mesh.m.slice() : mesh.m.map(() => options.m!) };
  if (mesh.face) placed.face = mesh.face.slice();
  if (mesh.n) {
    placed.n = [];
    for (let i = 0; i < mesh.n.length; i += 3) {
      const nx = mesh.n[i]! / (k[0] || 1), ny = mesh.n[i + 1]! / (k[1] || 1), nz = mesh.n[i + 2]! / (k[2] || 1);
      const n = rotate([nx, ny, nz], rot), len = Math.hypot(...n) || 1;
      placed.n.push(n[0] / len, n[1] / len, n[2] / len);
    }
  }
  return placed;
}
export function merge(...meshes: Mesh[]): Mesh {
  const out = emptyMesh();
  const hasNormals = meshes.some(mesh => mesh.n);
  if (hasNormals) out.n = [];
  out.face = [];
  for (const mesh of meshes) {
    const base = out.p.length / 3;
    const triangleBase = out.t.length / 3;
    for (const v of mesh.p) out.p.push(v);
    for (const i of mesh.t) out.t.push(i + base);
    for (const m of mesh.m) out.m.push(m);
    for (let f = 0; f < mesh.m.length; f++) out.face.push(triangleBase + (mesh.face?.[f] ?? f));
    if (hasNormals) {
      if (mesh.n) for (const n of mesh.n) out.n!.push(n);
      else for (let f = 0; f < mesh.m.length; f++) {
        const ia = mesh.t[f * 3]! * 3, ib = mesh.t[f * 3 + 1]! * 3, ic = mesh.t[f * 3 + 2]! * 3;
        const ax = mesh.p[ia]!, ay = mesh.p[ia + 1]!, az = mesh.p[ia + 2]!, ux = mesh.p[ib]! - ax, uy = mesh.p[ib + 1]! - ay, uz = mesh.p[ib + 2]! - az, vx = mesh.p[ic]! - ax, vy = mesh.p[ic + 1]! - ay, vz = mesh.p[ic + 2]! - az;
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const len = Math.hypot(nx, ny, nz) || 1; nx /= len; ny /= len; nz /= len;
        for (let v = 0; v < 3; v++) out.n!.push(nx, ny, nz);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- rendering

export const MATERIAL_RAMPS: Readonly<Record<RampName, readonly string[]>> = {
  mono: ['#090D13', '#171D25', '#2B343E', '#46515C', '#69747E', '#9BA4AD', '#E5E8EA'],
  bone: ['#151415', '#2B2526', '#433B3A', '#655B59', '#877C77', '#B0A49B', '#E6DDD1'],
  steel: ['#0C1015', '#1D2329', '#2E373E', '#4C5760', '#6E7A83', '#9CA6AD', '#DFE3E6'],
  ink: ['#060708', '#121315', '#212326', '#313437', '#494D51', '#6C7176', '#BBC0C3'],
  chrome: ['#090B0E', '#181C20', '#2E343B', '#596169', '#8A9298', '#C6CACE', '#FFFFFF'],
  glass: ['#0C1116', '#1A2227', '#2D3840', '#43515A', '#65757D', '#9BABAF', '#E1E8E7'],
  brown: ['#160D08', '#29190F', '#432B1B', '#6C482D', '#8C6543', '#B48A60', '#E0BE91'],
  red: ['#190807', '#35100E', '#581915', '#8C2924', '#B7433B', '#D9756C', '#F4AAA0'],
  green: ['#07130A', '#102719', '#20412A', '#34663C', '#508951', '#82B17D', '#C4DDB0'],
  paper: ['#201E1C', '#383532', '#58544F', '#858077', '#A19B8F', '#CBC5B8', '#F0EBE2'],
};

export interface Ground3D { y: number; shadow?: boolean | number; grid?: boolean; color?: string; ramp?: RampName | string[] }
export interface Fog3D { near: number; far: number; color?: string }
export interface View3D {
  /** Region of the frame, in canvas px. The camera target projects to its centre. */
  x: number; y: number; w: number; h: number;
  /** Legacy canvas px per world unit; with `fov`, focal length comes from the view width instead. */
  zoom: number;
  /** Legacy orbit camera, radians. */
  yaw?: number; pitch?: number; distance?: number; ortho?: boolean;
  /** Full camera; `lookAt` aliases `target`. `fov` is vertical degrees. */
  position?: Vec3; target?: Vec3; lookAt?: Vec3; fov?: number; roll?: number; near?: number;
  /** Direction from surfaces toward the key light, in world coordinates. */
  light?: Vec3; rim?: number; ambient?: number;
  ground?: Ground3D; fog?: Fog3D;
  /** Pixel size and outline controls. A string outline is a direct colour override. */
  cell?: number; outline?: boolean | string; outlineColor?: string; ink?: boolean | string;
  creaseDepth?: number; creaseNormal?: number;
  /** Legacy ramp override for materials without an explicit ramp. */
  palette?: string[];
  cx?: number; cy?: number;
  /** Interpolate mesh vertex normals, where provided. */
  smooth?: boolean;
}
export interface InstanceTransform { pos?: Vec3; rot?: Vec3; scale?: number | Vec3 }
export interface Object3D {
  mesh: Mesh; pos?: Vec3; rot?: Vec3; scale?: number | Vec3; materials?: Material[];
  /** 0..1 random face reveal; old triangle order remains deterministic. */
  reveal?: number; seed?: number;
  /** Face-wise disassembly amount, 0..1. Faces translate along their normals and spin. */
  explode?: number;
  /** 0..1 bottom-to-top geometric reveal. */
  slice?: number;
  smooth?: boolean;
  /** Reuse one mesh for many transforms without copying its triangle arrays. */
  instances?: readonly InstanceTransform[];
  /** Select a cheaper mesh when projected radius is below `below` art pixels. */
  lod?: { mesh: Mesh; below: number };
}

/** Shared-mesh instancing for crowds and city blocks. `lod` is selected by projected size. */
export function instances(mesh: Mesh, transforms: readonly InstanceTransform[], options: { materials?: Material[]; lod?: Mesh; lodBelow?: number } = {}): Object3D {
  const object: Object3D = { mesh, instances: transforms, materials: options.materials };
  if (options.lod) object.lod = { mesh: options.lod, below: options.lodBelow ?? 7 };
  return object;
}
export const instanced = instances;

const DEFAULT_MATERIALS: Material[] = [{ tone: 0.94 }, { accent: true }, { tone: 0.55 }, { tone: 1, unlit: true }, { tone: 0.3 }];
const KEY_LIGHT: Vec3 = [-0.5, 0.72, -0.48];
type MaterialPaint = { colors: [number, number, number][]; tone: number; emissive: number; spec: number; unlit: boolean; accent: boolean };
type Buffers = { z: Float32Array; shade: Float32Array; glint: Float32Array; normals: Float32Array; mat: Uint32Array; kind: Uint8Array; image?: ImageData };
const buffers = new Map<string, Buffers>();
let workWorld = new Float32Array(0), workCamera = new Float32Array(0), workNormal = new Float32Array(0);
let clipA = new Float64Array(72), clipB = new Float64Array(72), faceFx = new Float32Array(0);

const unit = (x: number, y: number, z: number): Vec3 => { const d = Math.hypot(x, y, z) || 1; return [x / d, y / d, z / d]; };
function camera(view: View3D) {
  const cell = Math.max(1, view.cell ?? CELL), cols = Math.ceil(view.w / cell), rows = Math.ceil(view.h / cell);
  const ox = cols / 2 + (view.cx ?? 0) / cell, oy = rows / 2 + (view.cy ?? 0) / cell, distance = Math.max(0.001, view.distance ?? 6);
  let right: Vec3, up: Vec3, forward: Vec3, position: Vec3;
  const target = view.target ?? view.lookAt;
  if (view.position || target) {
    const look = target ?? [0, 0, 0] as Vec3;
    position = view.position ?? [look[0], look[1], look[2] - distance];
    forward = unit(look[0] - position[0], look[1] - position[1], look[2] - position[2]);
    const worldUp: Vec3 = [0, 1, 0];
    right = unit(worldUp[1] * forward[2] - worldUp[2] * forward[1], worldUp[2] * forward[0] - worldUp[0] * forward[2], worldUp[0] * forward[1] - worldUp[1] * forward[0]);
    up = unit(forward[1] * right[2] - forward[2] * right[1], forward[2] * right[0] - forward[0] * right[2], forward[0] * right[1] - forward[1] * right[0]);
    const roll = view.roll ?? 0;
    if (roll) { const c = Math.cos(roll), s = Math.sin(roll), r = right; right = [r[0] * c + up[0] * s, r[1] * c + up[1] * s, r[2] * c + up[2] * s]; up = [up[0] * c - r[0] * s, up[1] * c - r[1] * s, up[2] * c - r[2] * s]; }
  } else {
    const yaw = view.yaw ?? 0, pitch = view.pitch ?? 0, cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    right = [cy, 0, sy]; up = [-sy * sp, cp, cy * sp]; forward = [-sy * cp, -sp, cy * cp];
    position = [-forward[0] * distance, -forward[1] * distance, -forward[2] * distance];
  }
  const targetDepth = target ? Math.hypot(target[0] - position[0], target[1] - position[1], target[2] - position[2]) : distance;
  const focal = view.fov ? rows / (2 * Math.tan(Math.max(1, Math.min(179, view.fov)) * Math.PI / 360)) : (view.zoom / cell) * targetDepth;
  const orthoScale = view.zoom / cell, near = Math.max(0.01, view.near ?? 0.12);
  const viewPoint = (x: number, y: number, z: number): Vec3 => { const dx = x - position[0], dy = y - position[1], dz = z - position[2]; return [dx * right[0] + dy * right[1] + dz * right[2], dx * up[0] + dy * up[1] + dz * up[2], dx * forward[0] + dy * forward[1] + dz * forward[2]]; };
  const screen = (x: number, y: number, z: number): Vec3 => { const k = view.ortho ? orthoScale : focal / Math.max(near, z); return [ox + x * k, oy - y * k, z]; };
  return { cols, rows, cell, ox, oy, right, up, forward, position, focal, orthoScale, near, viewPoint, screen };
}

/** Canvas position of a world point, for attaching labels and callouts to a 3D object. */
export function project(view: View3D, point: Vec3): { x: number; y: number } {
  const cam = camera(view), v = cam.viewPoint(point[0], point[1], point[2]), s = cam.screen(v[0], v[1], v[2]);
  const left = Math.round(view.x / cam.cell) * cam.cell, top = Math.round(view.y / cam.cell) * cam.cell;
  return { x: left + s[0] * cam.cell, y: top + s[1] * cam.cell };
}

function color(hex: string): [number, number, number] {
  let value = hex.trim();
  if (/^#[0-9a-f]{3}$/i.test(value)) value = `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
  if (!/^#[0-9a-f]{6}$/i.test(value)) return [128, 128, 128];
  return hexRgb(value);
}
function rampColors(ramp: Material['ramp'] | undefined, fallback?: string[]): [number, number, number][] {
  const values = Array.isArray(ramp) ? ramp : ramp ? MATERIAL_RAMPS[ramp as RampName] : fallback ?? MATERIAL_RAMPS.mono;
  return values.map(value => color(value));
}
function matrix(rot: Vec3 | undefined, scale: number | Vec3 | undefined, inverse = false): Float64Array {
  const [rx, ry, rz] = rot ?? [0, 0, 0], sc: Vec3 = scale === undefined ? [1, 1, 1] : typeof scale === 'number' ? [scale, scale, scale] : scale;
  const sx = Math.sin(rx), cx = Math.cos(rx), sy = Math.sin(ry), cy = Math.cos(ry), sz = Math.sin(rz), cz = Math.cos(rz);
  const x = inverse ? 1 / (sc[0] || 1) : sc[0], y = inverse ? 1 / (sc[1] || 1) : sc[1], z = inverse ? 1 / (sc[2] || 1) : sc[2];
  return new Float64Array([
    (cy * cz - sy * sx * sz) * x, (-cy * sz - sy * sx * cz) * y, (-sy * cx) * z,
    (cx * sz) * x, (cx * cz) * y, (-sx) * z,
    (sy * cz + cy * sx * sz) * x, (-sy * sz + cy * sx * cz) * y, (cy * cx) * z,
  ]);
}
function projectedRadius(mesh: Mesh): number {
  let radius = 0;
  for (let i = 0; i < mesh.p.length; i += 3) radius = Math.max(radius, Math.hypot(mesh.p[i]!, mesh.p[i + 1]!, mesh.p[i + 2]!));
  return radius;
}
const radiusCache = new WeakMap<Mesh, number>();
function getRadius(mesh: Mesh) { let r = radiusCache.get(mesh); if (r === undefined) { r = projectedRadius(mesh); radiusCache.set(mesh, r); } return r; }

function ensureBuffers(cols: number, rows: number): Buffers {
  const key = `${cols}x${rows}`, count = cols * rows; let b = buffers.get(key);
  if (!b) {
    if (buffers.size > 12) buffers.clear();
    b = { z: new Float32Array(count), shade: new Float32Array(count), glint: new Float32Array(count), normals: new Float32Array(count * 3), mat: new Uint32Array(count), kind: new Uint8Array(count) };
    buffers.set(key, b);
  }
  return b;
}
function ensureWork(vertices: number) {
  const size = vertices * 3;
  if (workWorld.length < size) { workWorld = new Float32Array(size); workCamera = new Float32Array(size); workNormal = new Float32Array(size); }
  const faceSize = (vertices + 1) * 10;
  if (faceFx.length < faceSize) faceFx = new Float32Array(faceSize);
}
function clipPlane(input: Float64Array, count: number, output: Float64Array, coordinate: 1 | 2, threshold: number, keepGreater: boolean): number {
  let out = 0;
  for (let i = 0; i < count; i++) {
    const prev = (i + count - 1) % count, a = prev * 6, b = i * 6, av = input[a + coordinate]!, bv = input[b + coordinate]!;
    const inA = keepGreater ? av >= threshold : av <= threshold, inB = keepGreater ? bv >= threshold : bv <= threshold;
    if (inA !== inB) {
      const t = (threshold - av) / (bv - av), o = out++ * 6;
      for (let k = 0; k < 6; k++) output[o + k] = input[a + k]! + (input[b + k]! - input[a + k]!) * t;
      output[o + coordinate] = threshold;
    }
    if (inB) { const o = out++ * 6; for (let k = 0; k < 6; k++) output[o + k] = input[b + k]!; }
  }
  return out;
}

/** Rasterises dithered 3D materials. The synchronous scratch arrays are reused between renders. */
export function render3d(ctx: Ctx, theme: Theme, view: View3D, objects: Object3D[]) {
  if (!canDraw()) return;
  const cam = camera(view), { cols, rows, cell } = cam, count = cols * rows;
  if (count < 1 || count > 400000) return;
  const buf = ensureBuffers(cols, rows), { z: zb, shade: sb, glint: gb, normals: nb, mat: mb, kind: kb } = buf;
  zb.fill(Infinity); kb.fill(0);
  const paints: MaterialPaint[] = [], objectBases: number[] = [];
  for (const object of objects) {
    objectBases.push(paints.length);
    for (const material of object.materials ?? DEFAULT_MATERIALS) {
      const explicit = !!material.ramp;
      paints.push({ colors: rampColors(material.ramp, !explicit ? view.palette : undefined), tone: material.tone ?? 1, emissive: material.emissive ?? 0, spec: material.spec ?? 0, unlit: material.unlit ?? false, accent: material.accent ?? false });
    }
  }
  const keyWorld = unit(...(view.light ?? KEY_LIGHT)), key = [keyWorld[0] * cam.right[0] + keyWorld[1] * cam.right[1] + keyWorld[2] * cam.right[2], keyWorld[0] * cam.up[0] + keyWorld[1] * cam.up[1] + keyWorld[2] * cam.up[2], keyWorld[0] * cam.forward[0] + keyWorld[1] * cam.forward[1] + keyWorld[2] * cam.forward[2]];
  const keyLen = Math.hypot(key[0]!, key[1]!, key[2]!) || 1; key[0]! /= keyLen; key[1]! /= keyLen; key[2]! /= keyLen;
  const half = unit(key[0]!, key[1]!, key[2]! - 1), ambient = Math.max(0, Math.min(1, view.ambient ?? 0.24)), rim = Math.max(0, view.rim ?? 0.28);
  const rimDir: Vec3 = [-0.32, 0.46, -0.83], shadows: { x: number; y: number; z: number; radius: number; height: number; strength: number }[] = [];
  for (let oi = 0; oi < objects.length; oi++) {
    const object = objects[oi]!, base = objectBases[oi]!, baseMaterials = object.materials ?? DEFAULT_MATERIALS, reveal = object.reveal ?? 1;
    if (reveal <= 0) continue;
    const transforms = object.instances?.length ? object.instances : [undefined];
    for (const inst of transforms) {
      const highMesh = object.mesh, outerPos = object.pos ?? [0, 0, 0], innerPos = inst?.pos ?? [0, 0, 0];
      const innerScale = inst?.scale, outerScale = object.scale;
      const im = matrix(inst?.rot, innerScale), om = matrix(object.rot, outerScale), inm = matrix(inst?.rot, innerScale, true), onm = matrix(object.rot, outerScale, true);
      let originX = innerPos[0], originY = innerPos[1], originZ = innerPos[2];
      const px = om[0]! * originX + om[1]! * originY + om[2]! * originZ + outerPos[0], py = om[3]! * originX + om[4]! * originY + om[5]! * originZ + outerPos[1], pz = om[6]! * originX + om[7]! * originY + om[8]! * originZ + outerPos[2];
      originX = px; originY = py; originZ = pz;
      const viewOrigin = cam.viewPoint(originX, originY, originZ);
      const scaleHint = (typeof outerScale === 'number' ? Math.abs(outerScale) : outerScale ? Math.max(...outerScale.map(Math.abs)) : 1) * (typeof innerScale === 'number' ? Math.abs(innerScale) : innerScale ? Math.max(...innerScale.map(Math.abs)) : 1);
      const chosenMesh = object.lod && getRadius(highMesh) * scaleHint * cam.focal / Math.max(cam.near, viewOrigin[2]) < object.lod.below ? object.lod.mesh : highMesh;
      const mesh = chosenMesh, vCount = mesh.p.length / 3, triCount = mesh.m.length;
      ensureWork(vCount);
      let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      const iscale: Vec3 = innerScale === undefined ? [1, 1, 1] : typeof innerScale === 'number' ? [innerScale, innerScale, innerScale] : innerScale;
      const oscale: Vec3 = outerScale === undefined ? [1, 1, 1] : typeof outerScale === 'number' ? [outerScale, outerScale, outerScale] : outerScale;
      for (let v = 0; v < vCount; v++) {
        const p = v * 3, x0 = mesh.p[p]!, y0 = mesh.p[p + 1]!, z0 = mesh.p[p + 2]!;
        const x1 = im[0]! * x0 + im[1]! * y0 + im[2]! * z0 + innerPos[0], y1 = im[3]! * x0 + im[4]! * y0 + im[5]! * z0 + innerPos[1], z1 = im[6]! * x0 + im[7]! * y0 + im[8]! * z0 + innerPos[2];
        const wx = om[0]! * x1 + om[1]! * y1 + om[2]! * z1 + outerPos[0], wy = om[3]! * x1 + om[4]! * y1 + om[5]! * z1 + outerPos[1], wz = om[6]! * x1 + om[7]! * y1 + om[8]! * z1 + outerPos[2];
        workWorld[p] = wx; workWorld[p + 1] = wy; workWorld[p + 2] = wz;
        const dx = wx - cam.position[0], dy = wy - cam.position[1], dz = wz - cam.position[2];
        workCamera[p] = dx * cam.right[0] + dy * cam.right[1] + dz * cam.right[2]; workCamera[p + 1] = dx * cam.up[0] + dy * cam.up[1] + dz * cam.up[2]; workCamera[p + 2] = dx * cam.forward[0] + dy * cam.forward[1] + dz * cam.forward[2];
        if (mesh.n) {
          const nx = mesh.n[p]! / (iscale[0] || 1), ny = mesh.n[p + 1]! / (iscale[1] || 1), nz = mesh.n[p + 2]! / (iscale[2] || 1);
          const n1x = inm[0]! * nx + inm[1]! * ny + inm[2]! * nz, n1y = inm[3]! * nx + inm[4]! * ny + inm[5]! * nz, n1z = inm[6]! * nx + inm[7]! * ny + inm[8]! * nz;
          const n2x = onm[0]! * n1x + onm[1]! * n1y + onm[2]! * n1z, n2y = onm[3]! * n1x + onm[4]! * n1y + onm[5]! * n1z, n2z = onm[6]! * n1x + onm[7]! * n1y + onm[8]! * n1z, nl = Math.hypot(n2x, n2y, n2z) || 1;
          workNormal[p] = n2x / nl; workNormal[p + 1] = n2y / nl; workNormal[p + 2] = n2z / nl;
        } else workNormal[p] = workNormal[p + 1] = workNormal[p + 2] = 0;
        minX = Math.min(minX, wx); maxX = Math.max(maxX, wx); minY = Math.min(minY, wy); maxY = Math.max(maxY, wy); minZ = Math.min(minZ, wz); maxZ = Math.max(maxZ, wz);
      }
      if (view.ground) {
        const ground = view.ground, strength = typeof ground.shadow === 'number' ? Math.max(0, Math.min(1, ground.shadow)) : ground.shadow === false ? 0 : 0.58;
        if (strength) {
          const radius = Math.max(0.22, getRadius(mesh) * scaleHint * 0.68), height = Math.max(0, maxY - ground.y);
          shadows.push({ x: originX, y: ground.y, z: originZ, radius: Math.max(0.16, radius * 0.42), height: Math.max(0, minY - ground.y), strength: strength * 0.78 });
          shadows.push({ x: originX - keyWorld[0] / Math.max(0.2, keyWorld[1]) * height * 0.55, y: ground.y, z: originZ - keyWorld[2] / Math.max(0.2, keyWorld[1]) * height * 0.55, radius: radius + height * 0.18, height, strength: strength * 0.62 });
        }
      }
      const explode = Math.max(0, Math.min(1, object.explode ?? 0)), slice = Math.max(0, Math.min(1, object.slice ?? 1)), sliceY = minY + (maxY - minY) * slice;
      if (explode > 0) {
        let f = 0;
        while (f < triCount) {
          const group = mesh.face?.[f] ?? f; let end = f + 1;
          while (end < triCount && (mesh.face?.[end] ?? end) === group) end++;
          const ia = mesh.t[f * 3]! * 3, ib = mesh.t[f * 3 + 1]! * 3, ic = mesh.t[f * 3 + 2]! * 3;
          let cx = 0, cy = 0, cz = 0, n = 0;
          for (let q = f; q < end; q++) for (let k = 0; k < 3; k++) { const p = mesh.t[q * 3 + k]! * 3; cx += workWorld[p]!; cy += workWorld[p + 1]!; cz += workWorld[p + 2]!; n++; }
          cx /= n; cy /= n; cz /= n;
          const ux = workWorld[ib]! - workWorld[ia]!, uy = workWorld[ib + 1]! - workWorld[ia + 1]!, uz = workWorld[ib + 2]! - workWorld[ia + 2]!, vx = workWorld[ic]! - workWorld[ia]!, vy = workWorld[ic + 1]! - workWorld[ia + 1]!, vz = workWorld[ic + 2]! - workWorld[ia + 2]!;
          let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
          if (nx * (cx - originX) + ny * (cy - originY) + nz * (cz - originZ) < 0) { nx = -nx; ny = -ny; nz = -nz; }
          const k = group * 10; faceFx[k] = cx; faceFx[k + 1] = cy; faceFx[k + 2] = cz; faceFx[k + 3] = nx; faceFx[k + 4] = ny; faceFx[k + 5] = nz; faceFx[k + 6] = Math.cos(explode * 2.8); faceFx[k + 7] = Math.sin(explode * 2.8); faceFx[k + 8] = explode * (0.42 + Math.min(1.2, Math.hypot(cx - originX, cy - originY, cz - originZ) * 0.35)); f = end;
        }
      }
      for (let f = 0; f < triCount; f++) {
        if (reveal < 1 && hash((mesh.face?.[f] ?? f) >> 1, object.seed ?? 1) > reveal) continue;
        const ia = mesh.t[f * 3]! * 3, ib = mesh.t[f * 3 + 1]! * 3, ic = mesh.t[f * 3 + 2]! * 3, ids = [ia, ib, ic];
        for (let k = 0; k < 3; k++) {
          const p = ids[k]!, o = k * 6; let x = workWorld[p]!, y = workWorld[p + 1]!, z = workWorld[p + 2]!, nx = workNormal[p]!, ny = workNormal[p + 1]!, nz = workNormal[p + 2]!;
          if (explode > 0) {
            const group = mesh.face?.[f] ?? f, q = group * 10, cx = faceFx[q]!, cy = faceFx[q + 1]!, cz = faceFx[q + 2]!, ax = faceFx[q + 3]!, ay = faceFx[q + 4]!, az = faceFx[q + 5]!, c = faceFx[q + 6]!, s = faceFx[q + 7]!;
            const vx = x - cx, vy = y - cy, vz = z - cz, dot = vx * ax + vy * ay + vz * az;
            const rx = vx * c + (ay * vz - az * vy) * s + ax * dot * (1 - c), ry = vy * c + (az * vx - ax * vz) * s + ay * dot * (1 - c), rz = vz * c + (ax * vy - ay * vx) * s + az * dot * (1 - c), push = faceFx[q + 8]!;
            x = cx + rx + ax * push; y = cy + ry + ay * push; z = cz + rz + az * push;
            const ndot = nx * ax + ny * ay + nz * az;
            const rnx = nx * c + (ay * nz - az * ny) * s + ax * ndot * (1 - c), rny = ny * c + (az * nx - ax * nz) * s + ay * ndot * (1 - c), rnz = nz * c + (ax * ny - ay * nx) * s + az * ndot * (1 - c); nx = rnx; ny = rny; nz = rnz;
          }
          clipA[o] = x; clipA[o + 1] = y; clipA[o + 2] = z; clipA[o + 3] = nx; clipA[o + 4] = ny; clipA[o + 5] = nz;
        }
        let polygonCount = 3; let polygon = clipA;
        if (slice < 1) { polygonCount = clipPlane(clipA, polygonCount, clipB, 1, sliceY, false); polygon = clipB; if (polygonCount < 3) continue; }
        const cameraPoly = polygon === clipA ? clipB : clipA;
        for (let k = 0; k < polygonCount; k++) {
          const p = k * 6, x = polygon[p]!, y = polygon[p + 1]!, z = polygon[p + 2]!, dx = x - cam.position[0], dy = y - cam.position[1], dz = z - cam.position[2];
          cameraPoly[p] = dx * cam.right[0] + dy * cam.right[1] + dz * cam.right[2]; cameraPoly[p + 1] = dx * cam.up[0] + dy * cam.up[1] + dz * cam.up[2]; cameraPoly[p + 2] = dx * cam.forward[0] + dy * cam.forward[1] + dz * cam.forward[2];
          const nx = polygon[p + 3]!, ny = polygon[p + 4]!, nz = polygon[p + 5]!;
          cameraPoly[p + 3] = nx * cam.right[0] + ny * cam.right[1] + nz * cam.right[2]; cameraPoly[p + 4] = nx * cam.up[0] + ny * cam.up[1] + nz * cam.up[2]; cameraPoly[p + 5] = nx * cam.forward[0] + ny * cam.forward[1] + nz * cam.forward[2];
        }
        polygonCount = clipPlane(cameraPoly, polygonCount, polygon, 2, cam.near, true);
        if (polygonCount < 3) continue;
        const materialIndex = base + Math.max(0, Math.min(baseMaterials.length - 1, mesh.m[f] ?? 0)), paint = paints[materialIndex] ?? paints[base] ?? { colors: rampColors('mono'), tone: 1, emissive: 0, spec: 0, unlit: false, accent: false };
        const kind = paint.accent && !object.materials?.[mesh.m[f] ?? 0]?.ramp ? 2 : 1;
        for (let k = 1; k < polygonCount - 1; k++) {
          const a = 0, b = k * 6, c = (k + 1) * 6;
          const ax = polygon[a]!, ay = polygon[a + 1]!, az = polygon[a + 2]!, bx = polygon[b]!, by = polygon[b + 1]!, bz = polygon[b + 2]!, cx = polygon[c]!, cy = polygon[c + 1]!, cz = polygon[c + 2]!;
          const A = cam.screen(ax, ay, az), B = cam.screen(bx, by, bz), C = cam.screen(cx, cy, cz), area = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
          if (Math.abs(area) < 1e-7) continue;
          let fnx = (by - ay) * (cz - az) - (bz - az) * (cy - ay), fny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az), fnz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax), fl = Math.hypot(fnx, fny, fnz) || 1; fnx /= fl; fny /= fl; fnz /= fl;
          const facing = view.ortho ? fnz : fnx * ax + fny * ay + fnz * az, flip = facing > 0;
          if (flip) { fnx = -fnx; fny = -fny; fnz = -fnz; }
          const minX = Math.max(0, Math.floor(Math.min(A[0], B[0], C[0]))), maxX = Math.min(cols - 1, Math.ceil(Math.max(A[0], B[0], C[0]))), minYp = Math.max(0, Math.floor(Math.min(A[1], B[1], C[1]))), maxYp = Math.min(rows - 1, Math.ceil(Math.max(A[1], B[1], C[1]))), invArea = 1 / area;
          const iaz = 1 / az, ibz = 1 / bz, icz = 1 / cz, smooth = !!mesh.n && object.smooth !== false && view.smooth !== false;
          const nax = polygon[a + 3]!, nay = polygon[a + 4]!, naz = polygon[a + 5]!, nbx = polygon[b + 3]!, nby = polygon[b + 4]!, nbz = polygon[b + 5]!, ncx = polygon[c + 3]!, ncy = polygon[c + 4]!, ncz = polygon[c + 5]!;
          const lightColor = paints[materialIndex]!;
          for (let yy = minYp; yy <= maxYp; yy++) for (let xx = minX; xx <= maxX; xx++) {
            const px = xx + 0.5, py = yy + 0.5, w0 = ((B[0] - px) * (C[1] - py) - (B[1] - py) * (C[0] - px)) * invArea, w1 = ((C[0] - px) * (A[1] - py) - (C[1] - py) * (A[0] - px)) * invArea, w2 = 1 - w0 - w1;
            if (w0 < -1e-5 || w1 < -1e-5 || w2 < -1e-5) continue;
            const q0 = w0 * iaz, q1 = w1 * ibz, q2 = w2 * icz, q = q0 + q1 + q2, depth = 1 / q, index = yy * cols + xx;
            if (depth >= zb[index]!) continue;
            let nx = fnx, ny = fny, nz = fnz;
            if (smooth) { nx = (q0 * nax + q1 * nbx + q2 * ncx) / q; ny = (q0 * nay + q1 * nby + q2 * ncy) / q; nz = (q0 * naz + q1 * nbz + q2 * ncz) / q; const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl; if (flip) { nx = -nx; ny = -ny; nz = -nz; } }
            const ndl = Math.max(0, nx * key[0]! + ny * key[1]! + nz * key[2]!), ndh = Math.max(0, nx * half[0] + ny * half[1] + nz * half[2]);
            const worldUp = nx * cam.right[1] + ny * cam.up[1] + nz * cam.forward[1], hemi = ambient * (0.56 + Math.max(0, worldUp) * 0.44), diffuse = (1 - ambient) * 0.78 * ndl, rimDot = Math.max(0, nx * rimDir[0] + ny * rimDir[1] + nz * rimDir[2]), illumination = lightColor.unlit ? 1 : Math.min(1, hemi + diffuse + rim * rimDot);
            const value = lightColor.unlit ? 1 : Math.max(0, Math.min(1, illumination * lightColor.tone * (1 - lightColor.emissive) + lightColor.emissive));
            zb[index] = depth; sb[index] = value; gb[index] = lightColor.spec * Math.pow(ndh, 34); mb[index] = materialIndex; kb[index] = kind;
            const np = index * 3; nb[np] = nx; nb[np + 1] = ny; nb[np + 2] = nz;
          }
        }
      }
    }
  }

  let groundMaterial = -1;
  if (view.ground) {
    const g = view.ground, defaultRamp = theme.mode === 'dark' ? ['#09090B', '#111115', '#19191F', '#222228', '#2A2A31', '#34343C', '#414149'] : ['#A5A5AA', '#B8B8BD', '#C9C9CE', '#D6D6DB', '#E0E0E4', '#EBEBEE', '#F5F5F6'];
    const baseGround = g.color ? color(g.color) : undefined;
    const gColors = g.ramp ? rampColors(g.ramp) : baseGround ? [0.36, 0.48, 0.6, 0.72, 0.84, 0.92, 1].map(k => [baseGround[0] * k, baseGround[1] * k, baseGround[2] * k] as [number, number, number]) : defaultRamp.map(color);
    groundMaterial = paints.length; paints.push({ colors: gColors, tone: 1, emissive: 0, spec: 0, unlit: true, accent: false });
    const shadowStrength = typeof g.shadow === 'number' ? Math.max(0, Math.min(1, g.shadow)) : g.shadow === false ? 0 : 0.58;
    for (let yy = 0; yy < rows; yy++) for (let xx = 0; xx < cols; xx++) {
      const dx = xx + 0.5 - cam.ox, dy = cam.oy - (yy + 0.5);
      const rayX = view.ortho ? cam.forward[0] : cam.right[0] * (dx / cam.focal) + cam.up[0] * (dy / cam.focal) + cam.forward[0], rayY = view.ortho ? cam.forward[1] : cam.right[1] * (dx / cam.focal) + cam.up[1] * (dy / cam.focal) + cam.forward[1], rayZ = view.ortho ? cam.forward[2] : cam.right[2] * (dx / cam.focal) + cam.up[2] * (dy / cam.focal) + cam.forward[2];
      const originX = view.ortho ? cam.position[0] + cam.right[0] * dx / cam.orthoScale + cam.up[0] * dy / cam.orthoScale : cam.position[0], originY = view.ortho ? cam.position[1] + cam.right[1] * dx / cam.orthoScale + cam.up[1] * dy / cam.orthoScale : cam.position[1], originZ = view.ortho ? cam.position[2] + cam.right[2] * dx / cam.orthoScale + cam.up[2] * dy / cam.orthoScale : cam.position[2];
      if (Math.abs(rayY) < 1e-6) continue;
      const depth = (g.y - originY) / rayY;
      if (depth <= cam.near || depth >= zb[yy * cols + xx]!) continue;
      const wx = originX + rayX * depth, wz = originZ + rayZ * depth, i = yy * cols + xx;
      let shadow = 0;
      if (shadowStrength) for (const s of shadows) {
        const ux = (wx - s.x) / s.radius, uz = (wz - s.z) / s.radius, rr = ux * ux + uz * uz;
        if (rr < 1.65) shadow = Math.max(shadow, s.strength * Math.exp(-2.8 * rr));
      }
      const gridLine = g.grid && (Math.min(Math.abs(wx - Math.round(wx)), Math.abs(wz - Math.round(wz))) < 0.018);
      const dither = bayer(xx + Math.round(view.x / cell), yy + Math.round(view.y / cell));
      const shade = gridLine ? 0.18 : Math.max(0.12, 1 - Math.floor(shadow * 6 + dither) / 6 * 0.78);
      zb[i] = depth; sb[i] = shade; mb[i] = groundMaterial; kb[i] = 3;
    }
  }

  const left = Math.round(view.x / cell), top = Math.round(view.y / cell), buffer = layer(cols, rows, '3d');
  const image = buf.image ?? (buf.image = buffer.ctx.createImageData(cols, rows)), data = image.data;
  const spectrumColors = theme.spectrum.map(color), drift = Math.floor(theme.time * 14), fog = view.fog, fogColor = fog?.color ? color(fog.color) : color(theme.bg);
  const fogNear = fog?.near ?? Infinity, fogFar = Math.max(fogNear + 1e-6, fog?.far ?? Infinity), threshold = view.outline === false ? false : view.outline !== undefined && typeof view.outline === 'string' ? color(view.outline) : view.outlineColor ? color(view.outlineColor) : typeof view.ink === 'string' ? color(view.ink) : view.ink === true ? color('#08090B') : theme.mode === 'dark' ? color('#E0E1E2') : color('#101114');
  const creaseColor = color('#08090B'), band = 3;
  for (let i = 0; i < count; i++) {
    const kind = kb[i]!, o = i * 4;
    if (!kind) { data[o + 3] = 0; continue; }
    let r: number, g: number, b: number;
    if (kind === 2 && spectrumColors.length) {
      const x = i % cols, y = (i / cols) | 0, spectrum = spectrumColors[spectrumIndex(x + left + drift, y + top, spectrumColors.length, band)]!, val = sb[i]!;
      const step = Math.min(2, Math.floor(val * 2 + bayer(x + left, y + top))); const scale = [0.38, 0.69, 1][step]!; r = spectrum[0] * scale; g = spectrum[1] * scale; b = spectrum[2] * scale;
    } else {
      const paint = paints[mb[i]!] ?? paints[0], colors = paint?.colors ?? rampColors('mono'), value = Math.max(0, Math.min(1, sb[i]!)) * (colors.length - 1), low = Math.floor(value), x = i % cols, y = (i / cols) | 0;
      let step = Math.min(colors.length - 1, low + (value - low > bayer(x + left, y + top) ? 1 : 0));
      if (gb[i]! > 0.34 && bayer(x + left + drift, y + top) < gb[i]!) step = colors.length - 1;
      const c = colors[step]!; r = c[0]; g = c[1]; b = c[2];
    }
    if (fog && zb[i]! > fogNear) {
      const amount = Math.max(0, Math.min(1, (zb[i]! - fogNear) / (fogFar - fogNear))), d = bayer(i % cols + left, ((i / cols) | 0) + top), mix = Math.min(4, Math.floor(amount * 4 + d)) / 4;
      r += (fogColor[0] - r) * mix; g += (fogColor[1] - g) * mix; b += (fogColor[2] - b) * mix;
    }
    data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255;
  }
  if (threshold) {
    const er = threshold[0], eg = threshold[1], eb = threshold[2];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const i = y * cols + x, kind = kb[i]!; if (kind !== 1 && kind !== 2) continue;
      let edge = false, crease = false;
      for (let d = 0; d < 4; d++) {
        const j = d === 0 ? (x ? i - 1 : -1) : d === 1 ? (x + 1 < cols ? i + 1 : -1) : d === 2 ? (y ? i - cols : -1) : (y + 1 < rows ? i + cols : -1);
        if (j < 0 || kb[j] === 0 || kb[j] === 3) { edge = true; continue; }
        if (kb[j] !== 1 && kb[j] !== 2) continue;
        if (Math.abs(zb[i]! - zb[j]!) > (view.creaseDepth ?? 0.24)) { crease = true; continue; }
        const p = i * 3, q = j * 3, dot = nb[p]! * nb[q]! + nb[p + 1]! * nb[q + 1]! + nb[p + 2]! * nb[q + 2]!;
        if (dot < (view.creaseNormal ?? 0.62)) crease = true;
      }
      if (edge) {
        const c = i * 4; // Paint one outside cell for the crisp silhouette.
        for (let d = 0; d < 4; d++) { const j = d === 0 ? (x ? i - 1 : -1) : d === 1 ? (x + 1 < cols ? i + 1 : -1) : d === 2 ? (y ? i - cols : -1) : (y + 1 < rows ? i + cols : -1); if (j >= 0 && (kb[j] === 0 || kb[j] === 3)) { const o = j * 4; data[o] = er; data[o + 1] = eg; data[o + 2] = eb; data[o + 3] = 255; } }
        data[c + 3] = 255;
      } else if (crease) { const o = i * 4; data[o] = creaseColor[0]; data[o + 1] = creaseColor[1]; data[o + 2] = creaseColor[2]; data[o + 3] = 255; }
    }
  }
  buffer.ctx.putImageData(image, 0, 0);
  blit(ctx, buffer.canvas as CanvasImageSource, left * cell, top * cell, cols, rows, cell);
}
