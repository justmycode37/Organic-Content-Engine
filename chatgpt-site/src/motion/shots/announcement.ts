import { clamp, ease, type Cue, type Frame, type ShotProps } from '../core.ts';
import { drawHedgy } from '../actor/hedgy.ts';
import { drawEnv } from '../env/index.ts';
import { createCameraRig } from '../fx/rig.ts';
import { drawBurst } from '../fx/particles.ts';
import { applyPixelBloom } from '../fx/post.ts';
import { fitPixel, pixelText } from '../prim.ts';
import { CELL, bayer } from '../pix.ts';
import type { ShotDef } from './index.ts';

function eventTime(props: ShotProps, kind: string, dur: number, fallback: number) {
  const event = props.events?.find(item => item.kind.toLowerCase() === kind);
  return clamp(event?.at ?? fallback, 0, Math.max(0, dur));
}

function numberParam(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback;
}

function textParam(value: unknown) {
  const text = typeof value === 'string' ? value : 'REUNION';
  const clean = text.toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim().slice(0, 18);
  return clean || 'REUNION';
}

function lightTiming(dur: number, reunionAt: number, count: number) {
  const remaining = Math.max(.12, dur - reunionAt);
  return {
    gap: count > 1 ? Math.min(.13, Math.max(.05, remaining * .68 / (count - 1))) : 0,
    length: Math.min(.15, Math.max(.06, remaining * .16)),
  };
}

function ditherCone(ctx: Frame['ctx'], ax: number, ay: number, reach: number, halfWidth: number, energy: number, seed: number) {
  const top = Math.floor(ay / CELL) * CELL, bottom = Math.min(1240, Math.ceil((ay + reach) / CELL) * CELL);
  for (let y = top; y < bottom; y += CELL) {
    const v = clamp((y - ay) / Math.max(1, reach));
    const half = Math.max(CELL, halfWidth * v);
    const left = Math.max(0, Math.floor((ax - half) / CELL) * CELL), right = Math.min(1080, Math.ceil((ax + half) / CELL) * CELL);
    for (let x = left; x < right; x += CELL) {
      const across = Math.abs((x + CELL / 2 - ax) / half);
      const density = energy * (1 - v * .42) * (1 - across * .44);
      const threshold = (bayer(x / CELL + seed, y / CELL + seed * 3) + .08) % 1;
      if (density <= threshold) continue;
      ctx.fillStyle = density > .72 ? '#D8D8DC' : density > .43 ? '#99999F' : '#68686E';
      ctx.fillRect(x, y, CELL, CELL);
    }
  }
}

function drawStage(ctx: Frame['ctx'], t: number, dur: number, theme: Frame['theme'], lightCount: number, reunionAt: number) {
  const light = lightTiming(dur, reunionAt, lightCount);
  // Far stage arch and receding floor establish the long journey through the gap.
  ctx.fillStyle = '#0B0B0D'; ctx.fillRect(205, 468, 670, 370);
  ctx.fillStyle = '#36363C'; ctx.fillRect(222, 458, 636, CELL * 3);
  ctx.fillStyle = '#111114'; ctx.fillRect(254, 492, 572, 275);
  ctx.fillStyle = '#55555B'; ctx.fillRect(274, 505, 532, CELL * 2);
  ctx.fillStyle = '#202024'; ctx.fillRect(304, 523, 472, 212);
  ctx.fillStyle = '#6D6D73'; ctx.fillRect(338, 713, 404, CELL * 2);
  ctx.fillStyle = '#B7B7BC'; ctx.fillRect(386, 733, 308, CELL);
  ctx.fillStyle = '#08080A'; ctx.beginPath(); ctx.moveTo(132, 876); ctx.lineTo(948, 876); ctx.lineTo(844, 946); ctx.lineTo(236, 946); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#54545A'; ctx.fillRect(132, 869, 816, CELL * 2);
  ctx.fillStyle = '#A4A4A9'; ctx.fillRect(132, 869, 816, CELL);

  // Deep stepped balcony ribs; light travels across them in a timed white cascade.
  for (let i = 0; i < lightCount; i++) {
    const y = 388 + i * 79, half = 258 + i * 67, front = y + 18;
    ctx.fillStyle = i % 2 ? '#17171B' : '#202024';
    ctx.fillRect(540 - half, y, half * 2, 27);
    ctx.fillStyle = '#56565C'; ctx.fillRect(540 - half, y, half * 2, CELL);
    ctx.fillStyle = '#09090B'; ctx.fillRect(540 - half + 8, y + 27, half * 2 - 16, 12);
    for (let x = 540 - half + 22; x < 540 + half - 15; x += 38) {
      ctx.fillStyle = '#2B2B30'; ctx.fillRect(x, y + 9, 22, 8);
    }
    const lightProgress = clamp((t - reunionAt - i * light.gap) / light.length);
    if (lightProgress > 0) {
      const cells = Math.ceil((2 * half - 36) / 34 * ease.outCubic(lightProgress));
      for (let cell = 0; cell < cells; cell++) {
        const x = 540 - half + 18 + cell * 34;
        ctx.fillStyle = (cell + i) % 5 === 0 ? '#FFFFFF' : '#D6D6D9';
        ctx.fillRect(x, front, 23, CELL * 2);
        if ((cell + i) % 3 === 0) { ctx.fillStyle = '#F1F1F3'; ctx.fillRect(x + 4, front - 6, 11, CELL); }
      }
      ctx.fillStyle = '#B5B5BA';
      ctx.fillRect(540 - half, front + 13, 2 * half, CELL);
    }
  }
  // Three broad, ordered-dither spotlights, fed by the stage shutter at reunion.
  const beamLength = Math.min(.36, Math.max(.18, dur * .18));
  const beam = ease.outCubic((t - reunionAt + beamLength * .32) / beamLength);
  if (beam > 0) {
    ditherCone(ctx, 376, 482, 414, 216, .72 * beam, 7);
    ditherCone(ctx, 704, 482, 414, 216, .72 * beam, 19);
    ditherCone(ctx, 540, 476, 355, 120, .52 * beam, 31);
    for (const [x, y] of [[376, 474], [540, 468], [704, 474]]) {
      ctx.fillStyle = '#DCDCE0'; ctx.fillRect(x - 15, y, 30, 14);
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(x - 8, y - 7, 16, 7);
      ctx.fillStyle = '#55555B'; ctx.fillRect(x - 21, y + 14, 42, 5);
    }
  }

  // Foreground lower balcony carries Hedgy; its rails slide under the crane move.
  ctx.fillStyle = '#08080A'; ctx.beginPath(); ctx.moveTo(-35, 1127); ctx.lineTo(1110, 1127); ctx.lineTo(1080, 1238); ctx.lineTo(0, 1238); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#49494F'; ctx.fillRect(0, 1122, 1080, CELL * 3);
  ctx.fillStyle = '#C2C2C6'; ctx.fillRect(0, 1122, 1080, CELL);
  ctx.fillStyle = '#222227'; ctx.fillRect(0, 1141, 1080, 11);
  for (let i = 0; i < 13; i++) {
    const x = 22 + i * 86;
    ctx.fillStyle = '#6D6D73'; ctx.fillRect(x, 1144, CELL * 2, 75);
    ctx.fillStyle = '#303035'; ctx.fillRect(x + CELL * 2, 1150, CELL * 2, 68);
    ctx.fillStyle = '#98989E'; ctx.fillRect(x, 1215, CELL * 4, CELL * 2);
  }
  ctx.fillStyle = theme.line; ctx.fillRect(0, 1234, 1080, CELL * 2);
}

function drawCurtain(ctx: Frame['ctx'], open: number, t: number) {
  const gapL = 540 - open * 432, gapR = 540 + open * 432;
  // Two tall, heavy leaves with alternating velvet ribs and clipped pixel folds.
  ctx.fillStyle = '#17171A'; ctx.fillRect(-12, -8, gapL + 12, 1300);
  for (let x = -8; x < gapL; x += 28) {
    const rib = Math.floor((x + 8) / 28), pulse = Math.sin(rib * .63 + t * .28) * 4;
    const width = Math.min(20, gapL - x);
    ctx.fillStyle = rib % 2 ? '#252529' : '#35353B'; ctx.fillRect(x + 4, 0, width, 1288);
    ctx.fillStyle = rib % 3 === 0 ? '#66666C' : '#44444A'; ctx.fillRect(x + 4 + Math.round(pulse), 0, 4, 1288);
    ctx.fillStyle = '#111114'; ctx.fillRect(x + 22, 0, 6, 1288);
  }
  ctx.fillStyle = '#151518'; ctx.fillRect(gapR, -8, 1092 - gapR, 1300);
  for (let x = gapR; x < 1092; x += 28) {
    const rib = Math.floor((x - gapR) / 28), pulse = Math.sin(rib * .62 + t * .3 + 1) * 4;
    const width = Math.min(20, 1092 - x);
    ctx.fillStyle = rib % 2 ? '#333339' : '#202024'; ctx.fillRect(x + 4, 0, width, 1288);
    ctx.fillStyle = rib % 3 === 0 ? '#55555B' : '#414147'; ctx.fillRect(x + 4 + Math.round(pulse), 0, 4, 1288);
    ctx.fillStyle = '#111114'; ctx.fillRect(x + 22, 0, 6, 1288);
  }
  // Polished inner hem makes the opening read as weighty fabric, not a wipe mask.
  ctx.fillStyle = '#B0B0B5'; ctx.fillRect(gapL - 5, 0, 5, 1288);
  ctx.fillStyle = '#74747A'; ctx.fillRect(gapL, 0, 5, 1288);
  ctx.fillStyle = '#BDBDC2'; ctx.fillRect(gapR, 0, 5, 1288);
  ctx.fillStyle = '#74747A'; ctx.fillRect(gapR + 5, 0, 4, 1288);
  // A monumental valance and an inner silver track frame the stage reveal.
  ctx.fillStyle = '#242428'; ctx.fillRect(-8, 0, 1096, 76);
  ctx.fillStyle = '#5C5C62'; ctx.fillRect(0, 69, 1080, 8);
  ctx.fillStyle = '#A5A5AA'; ctx.fillRect(0, 73, 1080, CELL);
  for (let x = 18; x < 1080; x += 42) {
    ctx.fillStyle = x % 3 === 0 ? '#6D6D73' : '#37373D'; ctx.fillRect(x, 79, 10, 18);
  }
}

function drawPoster(ctx: Frame['ctx'], t: number, announceAt: number, reunionAt: number, word: string, seed: number) {
  const span = Math.max(.18, reunionAt - announceAt);
  const fold = ease.outCubic((t - announceAt) / span);
  const height = Math.round(360 * fold / CELL) * CELL;
  const x = 306, y = 280, w = 468;
  // Folded paper is attached to a black stage rail; the folds remain visible after it opens.
  ctx.fillStyle = '#0A0A0C'; ctx.fillRect(x - 24, y - 20, w + 48, 25);
  ctx.fillStyle = '#B8B8BD'; ctx.fillRect(x - 12, y - 16, w + 24, 5);
  ctx.fillStyle = '#35353A'; ctx.fillRect(x, y - 34, w, 20);
  ctx.fillStyle = '#C3C3C7'; ctx.fillRect(x + 8, y - 30, w - 16, 7);
  if (height > 0) {
    ctx.fillStyle = '#D4D4D7'; ctx.fillRect(x, y, w, height);
    ctx.fillStyle = '#F2F2F3'; ctx.fillRect(x + 8, y + 4, w - 16, Math.max(0, height - 8));
    ctx.fillStyle = '#A9A9AE'; ctx.fillRect(x + 20, y + 12, 8, Math.max(0, height - 24));
    ctx.fillStyle = '#B1B1B6'; ctx.fillRect(x + w - 28, y + 12, 8, Math.max(0, height - 24));
    // Concert-poster grain and a central fold remain fine-pixel detail, not a gradient.
    for (let row = 0; row < Math.floor(height / CELL); row++) {
      for (let col = 0; col < Math.floor(w / CELL); col++) {
        if (bayer(col + seed, row + seed * 5) > .91) {
          ctx.fillStyle = '#B8B8BD'; ctx.fillRect(x + col * CELL, y + row * CELL, CELL, CELL);
        }
      }
    }
    if (fold > .78) {
      ctx.fillStyle = '#8D8D93'; ctx.fillRect(536, y + 4, CELL, height - 8);
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(532, y + 4, CELL, height - 8);
    }
    const typeReveal = ease.outCubic((t - (announceAt + span * .56)) / Math.max(.07, span * .44));
    if (height >= 172) {
      const fitted = fitPixel(word, 410, 1, [10, 9, 8, 7, 6]);
      pixelText(ctx, fitted.lines[0] ?? 'REUNION', 540, y + Math.max(64, Math.round(height * .53 - 34)), fitted.px, { color: '#131316', align: 'center', reveal: typeReveal, mode: 'type', seed });
    }
    if (height > 116) {
      ctx.fillStyle = '#6B6B71'; ctx.fillRect(x + 54, y + height - 54, w - 108, CELL);
      ctx.fillStyle = '#99999F'; ctx.fillRect(x + 92, y + height - 37, w - 184, CELL);
    }
  }
  // A slight paper kick on the reveal is made from stepped shadow and curled corners.
  if (fold > .2) {
    ctx.fillStyle = '#7A7A80'; ctx.fillRect(x + 4, y + height - 8, 13, 8);
    ctx.fillStyle = '#F8F8FA'; ctx.fillRect(x + w - 17, y + height - 12, 13, 8);
  }
}

export const announcementShot: ShotDef = {
  name: 'announcement',
  describe: 'Curtain-reveal set piece with a folding concert poster, a white tier-by-tier light sweep, Hedgy shock pose, dithered spotlights and pixel bloom; params: posterWord, lightCount (3–9).',
  render(frame: Frame, props: ShotProps) {
    const { ctx, t: rawT, dur, theme, seed } = frame;
    const t = clamp(rawT, 0, Math.max(.01, dur));
    const p = props.params ?? {};
    const lightCount = Math.round(numberParam(p.lightCount, 7, 3, 9));
    const word = textParam(p.posterWord);
    const announcesAt = eventTime(props, 'announces', dur, dur * .14);
    const reunionAt = eventTime(props, 'reunion', dur, dur * .50);
    const open = ease.outCubic((t - announcesAt) / Math.min(.72, Math.max(.28, dur * .38)));
    const cam = createCameraRig({
      width: 1080, height: 1920, seed: seed + 41, handheld: 1.6,
      keyframes: [
        { t: 0, x: 0, y: 4, zoom: 1.015, rot: 0, ease: 'linear' },
        { t: announcesAt, x: -6, y: -10, zoom: 1.025, rot: 0, ease: 'out' },
        { t: reunionAt, x: 6, y: -48, zoom: 1.045, rot: -.004, ease: 'inOut' },
        { t: dur, x: -3, y: -126, zoom: 1.075, rot: .006, ease: 'inOut' },
      ], hits: [reunionAt], punch: .016, shake: 3.2,
    });
    const camera = cam.poseAt(t);
    drawEnv(ctx, { type: 'stage', t, theme, seed, camera: { x: camera.x, y: camera.y, zoom: camera.zoom, rot: camera.rot, yaw: camera.rot * 1.2, pitch: .23 } });

    ctx.save(); cam.apply(ctx, t);
    drawStage(ctx, t, dur, theme, lightCount, reunionAt);
    // Tall architecture and distant roof trusses stay visible between the curtain ribs.
    for (let side = 0; side < 2; side++) {
      const x = side === 0 ? 74 : 976;
      ctx.fillStyle = '#17171B'; ctx.fillRect(x, 140, 30, 880);
      ctx.fillStyle = '#707076'; ctx.fillRect(x + (side ? 20 : 4), 140, 5, 880);
      ctx.fillStyle = '#2C2C31'; ctx.fillRect(side ? 880 : 108, 255, 92, 22);
      for (let brace = 0; brace < 6; brace++) {
        const by = 205 + brace * 142;
        ctx.fillStyle = brace % 2 ? '#424248' : '#5A5A60'; ctx.fillRect(x - 22, by, 74, 7);
        ctx.fillStyle = '#1B1B1F'; ctx.fillRect(x + (side ? -28 : 25), by - 18, 6, 42);
      }
    }
    drawPoster(ctx, t, announcesAt, reunionAt, word, seed + 3);
    // Curtain leaves are nearest; the poster and lit tiers stay behind the moving fabric.
    drawCurtain(ctx, open, t);
    const pose = t < reunionAt ? 'idle' : 'shock';
    const poseT = Math.max(0, t - reunionAt);
    // The lower-balcony hero is clearly foregrounded against the reveal.
    ctx.fillStyle = '#070709'; ctx.fillRect(688, 1095, 340, 31);
    ctx.fillStyle = '#BDBDC2'; ctx.fillRect(688, 1090, 340, 5);
    ctx.fillStyle = '#55555B'; ctx.fillRect(714, 1126, 9, 98);
    ctx.fillStyle = '#77777D'; ctx.fillRect(993, 1126, 9, 98);
    drawHedgy(ctx, { x: 850, y: 1148, scale: 1.65, t: poseT, pose, facing: -1, look: 'up', expression: pose === 'shock' ? 'shocked' : 'worried' });
    ctx.fillStyle = '#A9A9AE'; ctx.fillRect(714, 1214, 288, CELL * 2);
    ctx.fillStyle = '#27272B'; ctx.fillRect(714, 1222, 288, CELL * 2);

    // Fine dust and paper flecks burst from the stage toward the lens on the reunion beat.
    drawBurst(ctx, t, { center: { x: 540, y: 716 }, seed: seed + 101, count: 76, kind: 'dust', start: reunionAt - .04, life: 1.25, speed: 430, gravity: -8, drag: .12, floor: 5000, size: 1, color: '#E1E1E4' });
    drawBurst(ctx, t, { center: { x: 540, y: 616 }, seed: seed + 127, count: 34, kind: 'confetti', start: reunionAt + .02, life: 1.1, speed: 342, spread: 5.4, gravity: 190, drag: .2, floor: 1300, spin: 8, size: 2, color: '#F0F0F2' });
    ctx.restore();

    // Dithered white pixels bleed into their neighbours without losing the hard pixel edges.
    if (t >= reunionAt - .04) applyPixelBloom(ctx, { x: 96, y: 148, w: 888, h: 980, threshold: 178, radius: 2, strength: .44, cell: CELL });
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const announcesAt = eventTime(props, 'announces', dur, dur * .14);
    const reunionAt = eventTime(props, 'reunion', dur, dur * .50);
    const lights = Math.round(numberParam(props.params?.lightCount, 7, 3, 9));
    const light = lightTiming(dur, reunionAt, lights);
    const cues: Cue[] = [
      { t: Math.max(0, Number((announcesAt - .06).toFixed(3))), kind: 'rise', len: .22, pan: 0, gain: .56 },
      { t: Number(announcesAt.toFixed(3)), kind: 'servo', pan: .15, gain: .7 },
      { t: Number(reunionAt.toFixed(3)), kind: 'crack', pan: 0, gain: .9 },
      { t: Number(reunionAt.toFixed(3)), kind: 'whoosh', pan: 0, gain: .68 },
    ];
    for (let i = 0; i < lights; i++) {
      const at = reunionAt + i * light.gap;
      if (at < dur) cues.push({ t: Number(at.toFixed(3)), kind: 'tick', pan: (i / Math.max(1, lights - 1) - .5) * .8, gain: .42 + i * .018, step: i / Math.max(1, lights - 1) });
    }
    return cues.filter(cue => cue.t <= dur);
  },
};
