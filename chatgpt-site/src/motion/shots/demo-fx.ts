import { H, W, type Cue, type Frame, type ShotProps } from '../core.ts';
import { drawEnv, type EnvType } from '../env/index.ts';
import {
  applyChromaticGlitch, applyFilmGrain, applyImpactFrame, applyLetterbox, applyPixelBloom,
  applyScanlines, applyScreenFlash, applyVignette,
} from '../fx/post.ts';
import {
  drawBurst, drawEmitter, drawImpactStar, drawMotionStreak, drawShockwave, drawSpeedLines, drawTrail,
  type BurstKind, type EmitterKind,
} from '../fx/particles.ts';
import type { ShotDef } from './index.ts';

type Demo = { env: EnvType; burst?: BurstKind; emitter?: EmitterKind; overlay?: 'trail' | 'shockwave' | 'speedlines' | 'impact' | 'streak' | 'post' | 'glitch' };

const DEMOS: Record<string, Demo> = {
  coinburst: { env: 'vault', burst: 'coin', overlay: 'shockwave' },
  shards: { env: 'city', burst: 'shard', overlay: 'speedlines' },
  sparks: { env: 'stage', burst: 'spark', overlay: 'impact' },
  confetti: { env: 'city', burst: 'confetti' },
  dust: { env: 'clouds', burst: 'dust' },
  quills: { env: 'city', burst: 'quill', overlay: 'trail' },
  smoke: { env: 'stage', emitter: 'smoke' },
  sparkles: { env: 'space', emitter: 'sparkles' },
  rain: { env: 'city', emitter: 'rain' },
  banknotes: { env: 'exchange', emitter: 'banknotes' },
  snow: { env: 'clouds', emitter: 'snow' },
  embers: { env: 'stage', emitter: 'embers' },
  trail: { env: 'void', overlay: 'trail' },
  shockwave: { env: 'floor', overlay: 'shockwave' },
  speedlines: { env: 'space', overlay: 'speedlines' },
  impact: { env: 'vault', overlay: 'impact' },
  streaks: { env: 'city', overlay: 'streak' },
  post: { env: 'vault', overlay: 'post' },
  glitch: { env: 'exchange', overlay: 'glitch' },
};

const ENV_TYPES = new Set<EnvType>(['sky', 'floor', 'city', 'space', 'exchange', 'stage', 'clouds', 'ocean', 'vault', 'paper', 'void']);
const getDemo = (name: unknown): Demo => {
  const key = String(name ?? 'coinburst').toLowerCase();
  return DEMOS[key] ?? { env: ENV_TYPES.has(key as EnvType) ? key as EnvType : 'vault' };
};

export const demoFxShot: ShotDef = {
  name: 'demo-fx',
  describe: 'FX and world preview. params.demo: coinburst, shards, sparks, confetti, dust, quills, smoke, sparkles, rain, banknotes, snow, embers, trail, shockwave, speedlines, impact, streaks, post, glitch, or an environment name.',
  render(frame: Frame, props: ShotProps) {
    const { ctx, t, theme, seed } = frame;
    const demo = getDemo(props.params?.demo);
    const camera = { x: Math.sin(t * .5) * 24, y: Math.cos(t * .37) * 14, zoom: 1 + Math.sin(t * .42) * .018, rot: Math.sin(t * .24) * .016, yaw: Math.sin(t * .3) * .05, pitch: Math.cos(t * .25) * .03 };
    drawEnv(ctx, { type: demo.env, t, camera, theme, seed });

    if (demo.burst) {
      const start = .28;
      drawBurst(ctx, t, {
        center: { x: W / 2, y: 760 }, seed: seed + 23, count: demo.burst === 'coin' ? 54 : 72,
        kind: demo.burst, start, life: 1.75, speed: demo.burst === 'coin' ? 410 : 350,
        gravity: demo.burst === 'shard' ? 690 : 570, drag: .28, floor: 1140, bounce: .34,
        spin: 9, size: demo.burst === 'coin' ? 2 : 1, color: theme.fg,
      });
      if (demo.burst === 'coin') {
        drawImpactStar(ctx, t, { x: W / 2, y: 760, size: 82, start: .28, duration: .24, color: theme.fg, seed: seed + 39 });
        drawSpeedLines(ctx, t, { center: { x: W / 2, y: 760 }, count: 30, reach: 390, start: .28, duration: .22, color: theme.dim, seed: seed + 42, strength: .5 });
      }
      if (demo.burst === 'quill') {
        const points = Array.from({ length: 12 }, (_, i) => ({ x: 540 + i * 18, y: 800 - Math.sin(i * .6 + t * 2) * 54, alpha: 1 - i / 14 }));
        drawTrail(ctx, points, { color: theme.fg, width: 8 });
      }
    }

    if (demo.emitter) {
      const rain = demo.emitter === 'rain';
      const notes = demo.emitter === 'banknotes';
      drawEmitter(ctx, t, {
        kind: demo.emitter, x: 540, y: rain ? -100 : 680, width: rain || notes ? 900 : 500,
        height: rain || notes ? 1500 : 320, seed: seed + 53, rate: rain ? 26 : notes ? 4.8 : 19,
        life: rain ? 2.45 : notes ? 2.7 : 1.95, speed: rain ? 530 : notes ? 184 : demo.emitter === 'smoke' ? 74 : 145,
        wind: notes ? 24 : rain ? 12 : 9, size: notes ? 2 : 1, color: theme.dim,
      });
    }

    if (demo.overlay === 'trail') {
      const points = Array.from({ length: 24 }, (_, i) => ({
        x: 220 + i * 27, y: 760 + Math.sin(i * .43 + t * 2.8) * 140,
        alpha: i / 24,
      }));
      drawTrail(ctx, points, { color: theme.fg, width: 12 });
    } else if (demo.overlay === 'shockwave') {
      drawShockwave(ctx, t, { x: 540, y: 760, start: demo.burst === 'coin' ? .31 : .38, duration: demo.burst === 'coin' ? .92 : 1.15, radius: 22, maxRadius: 470, width: 1, seed: seed + 61, color: theme.fg });
    } else if (demo.overlay === 'speedlines') {
      drawSpeedLines(ctx, t, { center: { x: 540, y: 760 }, count: 72, start: .22, duration: .72, seed: seed + 67, color: theme.fg, strength: .82 });
    } else if (demo.overlay === 'impact') {
      drawImpactStar(ctx, t, { x: 540, y: 760, size: 200, start: .34, duration: .34, seed: seed + 71, color: theme.fg });
    } else if (demo.overlay === 'streak') {
      for (let i = 0; i < 18; i++) {
        const phase = (i / 18 + t * .23) % 1;
        drawMotionStreak(ctx, { x: 1080 * phase, y: 360 + i * 42, dx: 1, dy: .12, length: 86 + (i % 3) * 30, width: 1 + i % 2, alpha: .65, color: theme.dim });
      }
    } else if (demo.overlay === 'post') {
      drawBurst(ctx, t, { x: W / 2, y: 760, seed: seed + 73, count: 18, kind: 'spark', start: .12, life: 2.5, speed: 132, gravity: 24, drag: .08, floor: 1170, bounce: .18, size: 1, color: theme.fg });
      applyPixelBloom(ctx, { x: 0, y: 0, w: W, h: 1290, radius: 3, strength: .58, threshold: 182 });
      applyVignette(ctx, { x: 0, y: 0, w: W, h: 1290, strength: .56 });
      applyScanlines(ctx, { x: 0, y: 0, w: W, h: 1290, amount: .035, spacing: 8 });
      applyFilmGrain(ctx, { x: 0, y: 0, w: W, h: 1290, t, seed, strength: 15 });
      applyLetterbox(ctx, { x: 0, y: 0, w: W, h: H, t, start: .2, duration: .24, hold: .95, maxHeight: 72 });
    } else if (demo.overlay === 'glitch') {
      const active = t >= .72 && t < .84;
      applyChromaticGlitch(ctx, { x: 0, y: 0, w: W, h: 1290, active, shift: 12 });
      if (active) applyScreenFlash(ctx, { x: 0, y: 0, w: W, h: 1290, amount: .12 });
    }

    if (demo.overlay === 'impact') {
      applyImpactFrame(ctx, { x: 0, y: 0, w: W, h: 1290, t, at: .48, seed: seed + 79, threshold: 128 });
      applyScreenFlash(ctx, { x: 0, y: 0, w: W, h: 1290, amount: Math.max(0, 1 - Math.abs(t - .48) / .055) * .65 });
    }
  },
  cues(_props, dur): Cue[] {
    return [.28, .42, .88, 1.36].filter(t => t < dur).map((t, i) => ({ t, kind: i === 0 ? 'impact' : 'coins', gain: i === 0 ? 1 : .52, step: i / 4 }));
  },
};
