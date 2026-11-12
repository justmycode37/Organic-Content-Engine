import { hash } from '../core.ts';
import {
  box, cone, cylinder, emptyMesh, merge, place, quad, sphere, torus,
  type Material, type Mesh, type Object3D, type Vec3,
} from '../three.ts';

const BONE_RAMP = ['#171717', '#303030', '#4A4A4A', '#6D6D6D', '#929292', '#BDBDBD', '#F2F2F2'];
const STEEL_RAMP = ['#090B0D', '#1B1E21', '#303438', '#4C5258', '#70777D', '#A7ADB2', '#E1E5E8'];
const CHROME_RAMP = ['#070809', '#17191B', '#2A2D30', '#4B4F53', '#7A7F84', '#BFC3C7', '#FFFFFF'];
const GLASS_RAMP = ['#07090B', '#171A1C', '#2D3134', '#454A4E', '#62686D', '#9EA5AA', '#E7EBED'];
const INK_RAMP = ['#060709', '#111316', '#202328', '#30343A', '#474D54', '#69727A', '#B9C0C6'];
const PAPER_RAMP = ['#171717', '#303030', '#494949', '#707070', '#9A9A9A', '#C5C5C5', '#F2F2F2'];
const MONO_RAMP = ['#090B0D', '#1B1E21', '#303438', '#4C5258', '#70777D', '#A7ADB2', '#E1E5E8'];

export const ASSET_MATERIALS: Material[] = [
  { tone: 0.78, ramp: BONE_RAMP },
  { tone: 0.56, ramp: STEEL_RAMP, spec: 0.42 },
  { tone: 0.9, ramp: CHROME_RAMP, spec: 0.82 },
  { tone: 0.52, ramp: GLASS_RAMP, spec: 0.7 },
  { tone: 0.18, ramp: INK_RAMP },
  { tone: 0.94, ramp: PAPER_RAMP },
  { tone: 0.48, ramp: 'brown' },
  { tone: 0.78, ramp: 'red', spec: 0.25 },
  { tone: 0.78, ramp: 'green', spec: 0.25 },
  { tone: 0.67, ramp: MONO_RAMP },
  { tone: 1, ramp: PAPER_RAMP, emissive: 0.24, unlit: true },
];

export interface AssetOptions {
  detail?: number;
  count?: number;
  seed?: number;
  floors?: number;
  rows?: number;
  cols?: number;
  values?: readonly number[];
  direction?: 'up' | 'down';
  width?: number;
  height?: number;
  depth?: number;
  [key: string]: unknown;
}
export interface AssetPart extends Object3D { name: string }
export interface AssetModel {
  name: string;
  describe: string;
  mesh: Mesh;
  materials: Material[];
  parts: AssetPart[];
}
export type AssetFactory = ((opts?: AssetOptions) => AssetModel) & { describe: string };

export const add = (mesh: Mesh, pos: Vec3 = [0, 0, 0], rot?: Vec3): Mesh =>
  place(mesh, { pos, ...(rot ? { rot } : {}) });

export function part(name: string, mesh: Mesh, pos: Vec3 = [0, 0, 0], rot?: Vec3): AssetPart {
  return { name, mesh, pos, ...(rot ? { rot } : {}) };
}
export function boxPart(name: string, w: number, h: number, d: number, material = 0, pos: Vec3 = [0, 0, 0]): AssetPart {
  return part(name, box(w, h, d, material), pos);
}
export function cylPart(name: string, radius: number, height: number, material = 0, pos: Vec3 = [0, 0, 0], segments = 24, topRadius = radius): AssetPart {
  return part(name, cylinder(radius, height, segments, material, material, topRadius), pos);
}
export function faceCyl(name: string, radius: number, depth: number, material = 0, pos: Vec3 = [0, 0, 0], segments = 24): AssetPart {
  return part(name, cylinder(radius, depth, segments, material), pos, [Math.PI / 2, 0, 0]);
}
export function faceRing(name: string, radius: number, tube: number, material = 1, pos: Vec3 = [0, 0, 0], segments = 24): AssetPart {
  return part(name, torus(radius, tube, segments, 6, material), pos, [Math.PI / 2, 0, 0]);
}
export function linkPart(name: string, a: Vec3, b: Vec3, width = 0.06, material = 1): AssetPart {
  const delta: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const length = Math.hypot(...delta);
  const horizontal = Math.hypot(delta[1], delta[2]);
  const midpoint: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  return part(name, box(width, length, width, material), midpoint, [
    Math.atan2(delta[2], delta[1]), 0, Math.atan2(-delta[0], horizontal),
  ]);
}
export function cablePart(name: string, a: Vec3, b: Vec3, radius = 0.035, material = 4): AssetPart {
  const delta: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const length = Math.hypot(...delta);
  const horizontal = Math.hypot(delta[1], delta[2]);
  const midpoint: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  return part(name, cylinder(radius, length, 8, material), midpoint, [
    Math.atan2(delta[2], delta[1]), 0, Math.atan2(-delta[0], horizontal),
  ]);
}
export function prisma(name: string, points: readonly [number, number][], depth: number, material = 0, z = 0): AssetPart {
  const mesh = emptyMesh();
  const front = points.map(([x, y]) => [x, y, -depth / 2] as Vec3);
  const back = points.map(([x, y]) => [x, y, depth / 2] as Vec3);
  for (let i = 1; i < points.length - 1; i++) {
    mesh.t.push(0, i, i + 1); mesh.m.push(material);
    const offset = points.length;
    mesh.t.push(offset, offset + i + 1, offset + i); mesh.m.push(material);
  }
  mesh.p.push(...front.flat(), ...back.flat());
  for (let i = 0; i < points.length; i++) {
    const next = (i + 1) % points.length;
    quad(mesh, front[i]!, front[next]!, back[next]!, back[i]!, material);
  }
  return part(name, mesh, [0, 0, z]);
}
export function domeMesh(radius: number, height: number, segments = 20, rings = 6, material = 0): Mesh {
  const mesh = emptyMesh();
  const at = (lat: number, lon: number): Vec3 => {
    const v = (lat / rings) * (Math.PI / 2);
    const u = (lon / segments) * Math.PI * 2;
    return [Math.sin(v) * Math.cos(u) * radius, Math.cos(v) * height, Math.sin(v) * Math.sin(u) * radius];
  };
  for (let lat = 0; lat < rings; lat++) for (let lon = 0; lon < segments; lon++) {
    const a = at(lat, lon), b = at(lat, lon + 1), c = at(lat + 1, lon + 1), d = at(lat + 1, lon);
    quad(mesh, a, b, c, d, material);
  }
  return mesh;
}
export function assemble(name: string, describe: string, parts: AssetPart[], materials: Material[] = ASSET_MATERIALS): AssetModel {
  const meshes = parts.map(p => place(p.mesh, {
    pos: p.pos ?? [0, 0, 0], rot: p.rot ?? [0, 0, 0],
    ...(p.scale === undefined ? {} : { scale: p.scale }),
  }));
  return { name, describe, mesh: merge(...meshes), materials, parts };
}
export function factory(name: string, describe: string, build: (opts: AssetOptions) => AssetModel): AssetFactory {
  const fn = ((opts: AssetOptions = {}) => build(opts)) as AssetFactory;
  fn.describe = describe;
  return fn;
}
export const countOpt = (opts: AssetOptions, fallback: number, max: number) =>
  Math.max(1, Math.min(max, Math.floor(Number(opts.count ?? fallback) || fallback)));
export const detailOpt = (opts: AssetOptions, fallback = 1) =>
  Math.max(0.35, Math.min(2, Number(opts.detail ?? fallback) || fallback));
export const seeded = (index: number, seed = 1) => hash(index + 37, seed | 0);
export const placed = (name: string, mesh: Mesh, pos: Vec3, material = 0) =>
  part(name, mesh, pos, undefined);
export const orientedCylinder = (name: string, radius: number, length: number, material: number, pos: Vec3, rot: Vec3, segments = 16) =>
  part(name, cylinder(radius, length, segments, material), pos, rot);
export const token = (name: string, radius: number, thickness: number, material = 1, pos: Vec3 = [0, 0, 0]) =>
  cylPart(name, radius, thickness, material, pos, 32);
export const smallSphere = (name: string, radius: number, material: number, pos: Vec3, segments = 10, rings = 6) =>
  part(name, sphere(radius, segments, rings, material), pos);
export const joinParts = (...parts: AssetPart[]) => merge(...parts.map(p => place(p.mesh, { pos: p.pos ?? [0, 0, 0], rot: p.rot ?? [0, 0, 0], ...(p.scale === undefined ? {} : { scale: p.scale }) })));
export { box, cone, cylinder, hash, merge, place, sphere, torus, type Mesh, type Vec3 };

