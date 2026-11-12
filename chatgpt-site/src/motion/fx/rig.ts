import { clamp, hash } from '../core.ts';

export type CameraEase = 'linear' | 'in' | 'out' | 'inOut';
export interface CameraKeyframe { t: number; x: number; y: number; zoom: number; rot: number; ease?: CameraEase }
export interface CameraWhip { at: number; direction: 'left' | 'right' | 'up' | 'down'; duration?: number; amount?: number }
export interface DollyZoom { start: number; end: number; amount?: number }
export interface CameraRigOptions {
  width?: number;
  height?: number;
  keyframes?: CameraKeyframe[];
  /** Legacy drift option; ignored when `clean` is true (the HEDGY player default). */
  handheld?: number;
  seed?: number;
  hits?: number[];
  punch?: number;
  /** Accepted for compatibility and intentionally ignored to prevent quantized shake. */
  shake?: number;
  /** Legacy camera pan; ignored when `clean` is true. */
  whip?: CameraWhip[];
  dollyZoom?: DollyZoom;
  /** Clean series mode: keep caller keyframes, but suppress impact and handheld motion. */
  clean?: boolean;
}
export interface CameraPose { x: number; y: number; zoom: number; rot: number }
export interface View3DCamera { yaw: number; pitch: number; distance: number; target: [number, number, number] }

function easeValue(value: number, mode: CameraEase = 'out') {
  const t = clamp(value);
  if (mode === 'in') return t * t;
  if (mode === 'inOut') return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  if (mode === 'out') return 1 - (1 - t) ** 3;
  return t;
}

function sampleKeyframes(time: number, frames: CameraKeyframe[]): CameraPose {
  if (!frames.length) return { x: 0, y: 0, zoom: 1, rot: 0 };
  if (time <= frames[0]!.t) return { ...frames[0]! };
  const last = frames.at(-1)!;
  if (time >= last.t) return { ...last };
  for (let i = 1; i < frames.length; i++) {
    const b = frames[i]!;
    if (time > b.t) continue;
    const a = frames[i - 1]!;
    const p = easeValue((time - a.t) / Math.max(0.0001, b.t - a.t), b.ease);
    return {
      x: a.x + (b.x - a.x) * p,
      y: a.y + (b.y - a.y) * p,
      zoom: a.zoom + (b.zoom - a.zoom) * p,
      rot: a.rot + (b.rot - a.rot) * p,
    };
  }
  return { ...last };
}

/** Build a deterministic 2D / 3D path. `clean` retains eased keyframes and suppresses handheld, hit and whip effects. */
export function createCameraRig(options: CameraRigOptions = {}) {
  const width = options.width ?? 1080, height = options.height ?? 1920;
  const seed = options.seed ?? 1;
  const frames = [...(options.keyframes ?? [])].filter(frame => Number.isFinite(frame.t)).sort((a, b) => a.t - b.t);
  const hits = (options.hits ?? []).filter(Number.isFinite);

  function poseAt(time: number): CameraPose {
    const t = Number.isFinite(time) ? time : 0;
    const pose = sampleKeyframes(t, frames);
    const handheld = options.clean ? 0 : Math.max(0, options.handheld ?? 0);
    pose.x += handheld * (Math.sin(t * 1.73 + seed * 0.013) * 0.62 + Math.sin(t * 0.71 + seed * 0.029) * 0.38);
    pose.y += handheld * (Math.sin(t * 1.31 + seed * 0.021) * 0.58 + Math.sin(t * 0.53 + seed * 0.037) * 0.42);
    pose.rot += handheld * 0.00007 * Math.sin(t * 1.11 + seed * 0.017);

    for (const [index, hit] of hits.entries()) {
      if (options.clean) break;
      const dt = t - hit;
      if (dt < 0 || dt > 0.36) continue;
      const decay = Math.exp(-dt / 0.092);
      const punch = (options.punch ?? 0) * decay;
      pose.zoom *= 1 + punch;
      // `shake` remains accepted for old shot specs, but is intentionally a no-op.
    }

    for (const whip of options.clean ? [] : options.whip ?? []) {
      const duration = Math.max(0.08, whip.duration ?? 0.3);
      const dt = t - whip.at;
      if (Math.abs(dt) > duration) continue;
      const envelope = Math.sin(Math.PI * clamp(1 - Math.abs(dt) / duration));
      const distance = (whip.amount ?? 0.32) * Math.min(width, height) * envelope;
      if (whip.direction === 'left') pose.x -= distance;
      else if (whip.direction === 'right') pose.x += distance;
      else if (whip.direction === 'up') pose.y -= distance;
      else pose.y += distance;
      pose.rot += (whip.direction === 'left' ? -1 : whip.direction === 'right' ? 1 : 0) * envelope * 0.025;
    }

    const dolly = options.dollyZoom;
    if (dolly && dolly.end > dolly.start && t > dolly.start) {
      const p = easeValue((t - dolly.start) / (dolly.end - dolly.start), 'inOut');
      pose.zoom *= 1 + ((dolly.amount ?? 0.12) * p);
    }
    pose.zoom = Math.max(0.05, pose.zoom);
    return pose;
  }

  function apply(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, time: number) {
    const pose = poseAt(time), cx = width / 2, cy = height / 2;
    ctx.translate(cx + pose.x, cy + pose.y);
    ctx.rotate(pose.rot);
    ctx.scale(pose.zoom, pose.zoom);
    ctx.translate(-cx, -cy);
  }

  function view3D(time: number): View3DCamera {
    const pose = poseAt(time);
    const dolly = options.dollyZoom;
    let dollyProgress = 0;
    if (dolly && dolly.end > dolly.start && time > dolly.start)
      dollyProgress = easeValue((time - dolly.start) / (dolly.end - dolly.start), 'inOut');
    return {
      yaw: pose.rot + pose.x / Math.max(1, width) * 0.55,
      pitch: clamp(0.32 - pose.y / Math.max(1, height) * 0.4, -0.2, 1.1),
      distance: Math.max(0.2, 8 / pose.zoom - dollyProgress * 1.2),
      target: [-pose.x / Math.max(1, width) * 8, pose.y / Math.max(1, height) * 8, 0],
    };
  }

  return { poseAt, apply, view3D };
}

/** Convenience path for a continuous deterministic handheld drift. */
export function handheldCamera(time: number, amount = 1, seed = 1): CameraPose {
  return createCameraRig({ handheld: amount, seed }).poseAt(time);
}

/** A stable tiny variation source for camera paths and motion accents. */
export const cameraNoise = (index: number, seed = 1) => hash(index, seed);
