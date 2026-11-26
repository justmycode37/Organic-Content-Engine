// "The Light Oxygen Makes". Real astronaut photographs are graded into the
// dusk palette; diagrams of fields, atoms and spectra are schematic.
import { c, W, H, lensGlow, line, grad } from './stage.ts';
import { drawPlanet, preparePlanets } from '../index.ts';
import {
  tau,
  ease,
  mix,
  clamp,
  ink,
  muted,
  lilac,
  coral,
  blush,
  accent,
  cream,
  text,
  grade,
  load,
  cover,
  tiles,
  mosaicClip,
  space,
  directFrame,
  continuous,
  arriveByMosaic,
  lockCamera,
  cutTo,
  hud,
  at,
  type Cue,
} from './aurora-core.ts';
import { scenes2, gradedPlanet } from './aurora-scenes.ts';
import cutUrl from './aurora/angstrom-cut.png';
import limbUrl from './aurora/iss-curtain-limb.jpg';
import pillarsUrl from './aurora/iss-red-pillars.jpg';
import redGreenUrl from './aurora/iss-red-green.jpg';
import swirlUrl from './aurora/iss-swirl.jpg';
import blanketUrl from './aurora/iss-blanket.jpg';
import oceanUrl from './aurora/iss-indian-ocean.jpg';
import airglowUrl from './aurora/iss-airglow.jpg';
import armUrl from './aurora/iss-arm.jpg';
import australisUrl from './aurora/iss-australis.jpg';
import milkyUrl from './aurora/milky-way.jpg';
import engravingUrl from './aurora/spectrometer.jpg';
import stormUrl from './aurora/storm-connecticut.jpg';
import bandUrl from './aurora/iss-green-band.jpg';
import layersUrl from './aurora/iss-layers.jpg';
import bandCloudsUrl from './aurora/iss-band-clouds.jpg';
import curtainUrl from './aurora/iss-curtain.jpg';
import { beats2 } from './aurora-beats.ts';
import { beats3 } from './aurora-beats3.ts';
import { beats4 } from './aurora-beats4.ts';
import { beats5 } from './aurora-beats5.ts';
import { beats6 } from './aurora-beats6.ts';
import { beats7 } from './aurora-beats7.ts';
import mclennanUrl from './aurora/mclennan-cut.png';
import jezeroUrl from './aurora/jezero.jpg';

const raw = {
  cut: load(cutUrl),
  mclennan: load(mclennanUrl),
  jezero: load(jezeroUrl),
  limb: load(limbUrl),
  pillars: load(pillarsUrl),
  redGreen: load(redGreenUrl),
  swirl: load(swirlUrl),
  blanket: load(blanketUrl),
  ocean: load(oceanUrl),
  airglow: load(airglowUrl),
  arm: load(armUrl),
  australis: load(australisUrl),
  milky: load(milkyUrl),
  engraving: load(engravingUrl),
  storm: load(stormUrl),
  band: load(bandUrl),
  layers: load(layersUrl),
  bandClouds: load(bandCloudsUrl),
  curtainPhoto: load(curtainUrl),
};
export const photos: Record<string, HTMLCanvasElement> = {};
Object.assign(window, {
  motionAssetsReady: Promise.all([...Object.values(raw).map((i) => i.decode()), preparePlanets(['earth', 'mars', 'sun'])]).then(
    () => {
      for (const [k, img] of Object.entries(raw)) {
        if (k === 'cut' || k === 'mclennan') photos[k] = grade(img, false, 1.15);
        else if (k === 'milky') photos[k] = grade(img, false, 1.25);
        else if (k === 'jezero') photos[k] = grade(img, false, 0.8);
        else if (k === 'engraving') {
          // Light lines on dark: invert the engraving before grading.
          const inv = document.createElement('canvas');
          inv.width = img.width;
          inv.height = img.height;
          const x = inv.getContext('2d')!;
          x.filter = 'invert(1)';
          x.drawImage(img, 0, 0);
          photos.engravingInv = grade(inv, false, 1.2);
          photos[k] = grade(img, false, 1);
        }
        else photos[k] = grade(img, true, k === 'storm' ? 1.35 : 1.1);
        // Keep the cutout's transparency.
        if (k === 'cut' || k === 'mclennan') {
          const x = photos[k].getContext('2d')!;
          x.globalCompositeOperation = 'destination-in';
          x.drawImage(img, 0, 0);
        }
      }
    },
  ),
});

export function earth(x: number, y: number, r: number, t: number, light: [number, number, number] = [-0.9, 0.3, 0.3]) {
  drawPlanet(c, {
    body: 'earth',
    center: [x, y],
    radius: r,
    latitude: 0.55,
    longitude: -1.3 + 0.03 * t,
    roll: 0.12,
    light,
    ambient: 0.05,
  });
}

// ── Opening ──────────────────────────────────────────────────────────────
// Ångström on paper. Graded tiles of auroral photographs gather around him,
// then the mosaic takes over the whole frame (as in the reference's first shot).
const opening = tiles(16, 31);
function portrait(t: number) {
  c.fillStyle = cream;
  c.fillRect(0, 0, W, H);
  const fill = ease(t, 0.2, 5.5) * 0.55 + ease(t, 5.6, 7.4) * 0.45;
  const drawTiles = (front: boolean) => {
    for (const q of opening) {
      const behind = q.at < 0.55;
      if (behind === front) continue;
      if (q.at > fill) continue;
      const age = clamp((fill - q.at) * 8);
      c.save();
      c.beginPath();
      c.rect(q.x, q.y, q.size + 0.5, q.size + 0.5);
      c.clip();
      c.globalAlpha = age;
      if (q.kind < 0.18) cover(photos.pillars, 1.4, 0.5 + 0.2 * Math.sin(q.x), 0.4);
      else if (q.kind < 0.3) {
        c.fillStyle = '#1c1d4a';
        c.fillRect(q.x, q.y, q.size, q.size);
      } else cover(photos.limb, 1.15, 0.5, 0.5);
      c.strokeStyle = '#ffffff22';
      c.lineWidth = 1;
      c.strokeRect(q.x + 0.5, q.y + 0.5, q.size - 1, q.size - 1);
      c.restore();
    }
  };
  drawTiles(false);
  const p = photos.cut,
    h = 700,
    w = (p.width / p.height) * h;
  c.drawImage(p, W * 0.56 - w / 2, H - h + 30 + 8 * (1 - ease(t, 0, 3)), w, h);
  drawTiles(true);
}
// From orbit: the astronaut's view along the limb, pushed slowly.
function orbit(t: number) {
  cover(photos.limb, 1.08 + 0.012 * t, 0.5, 0.55, -6 * t);
}
// Every photon the same wavelength: one bright line in a dark spectrum.
function oneLine(t: number, g: number) {
  space(g);
  const x0 = 140,
    x1 = 1140,
    y = 330,
    hgt = 110;
  const band = c.createLinearGradient(x0, 0, x1, 0);
  ['#2a1d5a', '#2a3a86', '#256a7a', '#4b7a3a', '#7a6a2e', '#7a3a30'].forEach((col, i, a) => band.addColorStop(i / (a.length - 1), col + '55'));
  c.fillStyle = band;
  c.fillRect(x0, y, x1 - x0, hgt);
  const lx = x0 + ((557.7 - 400) / 300) * (x1 - x0);
  const on = ease(t, 0.4, 1.6);
  lensGlow(lx, y + hgt / 2, 160 * on, accent, 0.8 * on);
  c.fillStyle = accent;
  c.globalAlpha = on;
  c.fillRect(lx - 3, y - 20 * on, 6, hgt + 40 * on);
  c.globalAlpha = ease(t, 1.4, 2.2);
  text('557.7 nm', lx, y + hgt + 80, 46, accent, 'center');
  c.globalAlpha = 1;
  for (const [w, s] of [
    [400, '400'],
    [500, '500'],
    [600, '600'],
    [700, '700 nm'],
  ] as const)
    text(s, x0 + ((w - 400) / 300) * (x1 - x0), y - 22, 18, muted, 'center');
}
// Earth rises over the graded Milky Way band.
function earthBand(t: number) {
  c.fillStyle = '#0b0a1c';
  c.fillRect(0, 0, W, H);
  const m = photos.milky;
  const s = (W * 1.5) / m.width;
  c.drawImage(m, W / 2 - m.width * s * (0.5 + 0.004 * t), H / 2 - (m.height * s) / 2, m.width * s, m.height * s);
  const r = mix(60, 150, ease(t, 0, 6)) * (1 + 3 * ease(t, Math.max(1, at('the color comes') - 1.6), at('the color comes') + 0.3) ** 2);
  gradedPlanet('earth', W / 2, H / 2, r, t, [-0.6, 0.2, 0.75]);
}
// A minimal oxygen atom on dark, like the reference's line-drawn atom.
export function atomGlyph(x: number, y: number, r: number, t: number, glow = 1) {
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI) / 3 + 0.3;
    c.save();
    c.translate(x, y);
    c.rotate(a);
    c.strokeStyle = '#e7b2c4';
    c.lineWidth = Math.max(1.2, r / 90);
    c.beginPath();
    c.ellipse(0, 0, r, r * 0.36, 0, 0, tau);
    c.stroke();
    const e = t * (0.9 + 0.2 * i) + i * 2;
    const ex = r * Math.cos(e),
      ey = r * 0.36 * Math.sin(e);
    lensGlow(ex, ey, r * 0.12, coral, 0.8);
    c.fillStyle = blush;
    c.beginPath();
    c.arc(ex, ey, Math.max(2.5, r * 0.035), 0, tau);
    c.fill();
    c.restore();
  }
  lensGlow(x, y, r * 0.4 * glow, coral, 0.7);
  c.fillStyle = grad(x - r * 0.1, y - r * 0.1, r * 0.2, r * 0.2, [blush, coral]);
  c.beginPath();
  c.arc(x, y, Math.max(4, r * 0.08), 0, tau);
  c.fill();
}
function atomCard(t: number) {
  c.fillStyle = '#16131f';
  c.fillRect(0, 0, W, H);
  atomGlyph(W / 2, H / 2, mix(20, 210, ease(t, 0, 4) ** 0.7), t);
}
// Title over the graded photograph.
function title(t: number) {
  cover(photos.pillars, 1.05 + 0.01 * t, 0.5, 0.55);
  c.fillStyle = grad(0, 0, W * 0.7, 0, ['#0d0a1ecc', '#0d0a1e55', '#0d0a1e00']);
  c.fillRect(0, 0, W, H);
  c.globalAlpha = ease(t, 0.3, 1.2);
  text('Mysteries of the Sky', 80, 300, 20, muted, 'left', 'caps');
  c.globalAlpha = ease(t, 0.7, 1.8);
  text('The Light', 76, 380, 76, ink, 'left', 'title');
  text('Oxygen Makes', 76, 462, 76, ink, 'left', 'title');
  c.globalAlpha = 1;
}
// Full-frame photograph with a slow push and drift.
function photoShot(name: string, zoom: number, fx: number, fy: number, drift: number) {
  return (t: number) => {
    cover(photos[name], zoom + 0.012 * t, fx, fy, drift * t);
    // Shimmer: the same frame, slightly displaced and pulsing, lifts the glow.
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = 0.07 + 0.05 * Math.sin(t * 1.9);
    cover(photos[name], zoom + 0.012 * t + 0.004, fx, fy - 0.004 * Math.sin(t * 0.8), drift * t + 3 * Math.sin(t * 1.3));
    c.restore();
    for (let i = 0; i < 40; i++) {
      const h = (Math.sin(i * 127.1) * 43758.5) % 1,
        k = (Math.sin(i * 311.7) * 43758.5) % 1;
      const x = ((Math.abs(h) * W + t * (6 + 10 * Math.abs(k))) % (W + 40)) - 20,
        y = Math.abs(k) * H * 0.45;
      c.globalAlpha = 0.25 + 0.25 * Math.sin(t * 2 + i);
      c.fillStyle = '#e8e4ff';
      c.fillRect(x, y, 1.6, 1.6);
    }
    c.globalAlpha = 1;
  };
}

let chain = { base: '', start: 0 };
export const photoKeys = ['orbit', 'swirl', 'blanket', 'ocean', 'redGreen', 'pillars', 'airglowPhoto', 'arm', 'australis', 'band', 'layers', 'bandClouds', 'curtainPhoto', 'storm'];
const scenes: Record<string, (t: number, g: number) => void> = {
  portrait,
  orbit,
  oneLine,
  earthBand,
  atomCard,
  title,
  swirl: photoShot('swirl', 1.06, 0.5, 0.5, -5),
  blanket: photoShot('blanket', 1.06, 0.5, 0.6, 5),
  ocean: photoShot('ocean', 1.06, 0.5, 0.55, -5),
  redGreen: photoShot('redGreen', 1.06, 0.45, 0.5, 4),
  pillars: photoShot('pillars', 1.06, 0.5, 0.5, -4),
  airglowPhoto: photoShot('airglow', 1.08, 0.5, 0.35, -3),
  arm: photoShot('arm', 1.06, 0.5, 0.45, 4),
  australis: photoShot('australis', 1.1, 0.5, 0.45, -4),
  band: photoShot('band', 1.06, 0.5, 0.4, -4),
  layers: photoShot('layers', 1.06, 0.5, 0.5, 4),
  bandClouds: photoShot('bandClouds', 1.08, 0.5, 0.4, -4),
  curtainPhoto: photoShot('curtainPhoto', 1.08, 0.5, 0.45, 4),
  ...scenes2,
  ...beats2,
  ...beats3,
  ...beats4,
  ...beats5,
  ...beats6,
  ...beats7,
};
// Rowan's interview lines play over the matching diagram with his name.
for (const [key, base] of [
  ['rowanCollision', 'collisionRowan'],
  ['rowanColumn', 'column'],
  ['rowanSpectrum', 'photoVsSpectrum'],
] as const) {
  scenes[key] = (t, g) => {
    scenes[base](t, g);
    const a = ease(t, 0.2, 0.8) * (1 - ease(t, 4.5, 5.2));
    hud(() => {
      const scrim = c.createRadialGradient(W / 2, 690, 10, W / 2, 690, 320);
      scrim.addColorStop(0, '#0d0a1ed0');
      scrim.addColorStop(1, '#0d0a1e00');
      c.globalAlpha = a;
      c.fillStyle = scrim;
      c.fillRect(W / 2 - 340, 600, 680, 120);
      text('Professor Rowan Ellery', W / 2, 700, 28, ink, 'center', 'title');
      c.globalAlpha = 1;
    });
  };
}
arriveByMosaic(['orbit', 'title', 'swirl', 'pillars', 'australis']);
lockCamera(['portrait']);
cutTo([...photoKeys, 'rainbow']);
continuous(['portrait']);
Object.assign(window, {
  auroraFrame(k: string, t: number, current?: Cue) {
    const base = k.split('~')[0];
    if (!scenes[base]) throw new Error('Unknown aurora scene: ' + k);
    const cue0 = current ?? { key: k, t, g: t, left: 99 };
    // A run of cuts on the same scene (alternate framings) keeps the scene's clock.
    const prevBase = cue0.prev?.split('~')[0];
    if (!(prevBase === base && chain.base === base)) chain = { base, start: cue0.g - cue0.t };
    const T = cue0.g - chain.start;
    const cueT = { ...cue0, t: T, left: cue0.left + (cue0.t - T) };
    return directFrame((key, time, g) => {
      const [name, frame] = key.split('~');
      if (!frame) return scenes[name](time, g);
      const [z, fx, fy] = frame.split(':').map(Number);
      const zz = z * (1 + 0.012 * Math.min(time, 12));
      c.save();
      c.translate(W / 2, H / 2);
      c.scale(zz, zz);
      c.translate(-fx, -fy);
      scenes[name](time, g);
      c.restore();
    }, cueT);
  },
});
export { scenes, ink, muted, lilac, coral, line };
