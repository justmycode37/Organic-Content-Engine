// Round-4 revisions: a continuous dive from Earth into the atom, a tail that
// stretches on the words, a full-frame airglow layer, a layered Jezero
// surface with the instrument's field of view, and a cream plate for 1867.
import { c, W, H, lensGlow, line, grad } from './stage.ts';
import { tau, ease, mix, clamp, ink, muted, lilac, coral, accent, cream, text, space, at, hud } from './aurora-core.ts';
import { path, spark, wave, dipole, gradedPlanet } from './aurora-scenes.ts';
import { oxygen } from './aurora-beats3.ts';
import { atomGlyph, photos } from './aurora.ts';

const cue = (phrase: string, after = 0) => {
  const v = at(phrase, after);
  return Number.isFinite(v) ? v : -20;
};
const electron = '#e8e4ff';
const hash = (n: number) => {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};
const note = (s: string) => s.includes('Knutsen') && hud(() => text(s, W - 48, H - 30, 16, muted + 'bb', 'right'));

// ── 01 The dive continues: Earth's glow fills the frame, the atom resolves
function atomCard(t: number) {
  const g = c.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, 760);
  g.addColorStop(0, '#2b2152');
  g.addColorStop(0.5, '#171433');
  g.addColorStop(1, '#0c0a1d');
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  // The last of the planet's limb light rushes outward as we pass through.
  const pass = ease(t, 0, 1.4);
  c.globalAlpha = 1 - pass;
  lensGlow(W / 2, H / 2, mix(300, 1400, pass), '#7d86f0', 0.8);
  c.globalAlpha = 1;
  for (let i = 0; i < 70; i++) {
    const a = hash(i) * tau,
      f = (t * 0.25 + hash(i + 3)) % 1;
    const r = 60 + f * f * 800;
    spark(W / 2 + r * Math.cos(a), H / 2 + r * Math.sin(a) * 0.7, 1.2 + f * 1.5, '#c9c6ff', 0.5 * Math.sin(Math.PI * f));
  }
  atomGlyph(W / 2, H / 2, mix(60, 220, ease(t, 0, 3.5)), t);
}

// ── 02 Uppsala, 1867, as a cream plate: the engraving in ink ────────────
function spectrometer(t: number) {
  c.fillStyle = cream;
  c.fillRect(0, 0, W, H);
  const v = c.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, 900);
  v.addColorStop(0, '#00000000');
  v.addColorStop(1, '#2a1d3a33');
  c.fillStyle = v;
  c.fillRect(0, 0, W, H);
  const e = photos.engraving,
    h = 580,
    w = (e.width / e.height) * h,
    x = W / 2 - w / 2 + 160,
    y = H / 2 - h / 2 + 10;
  c.globalAlpha = ease(t, 0, 1.2);
  c.globalCompositeOperation = 'multiply';
  c.filter = 'grayscale(1) brightness(1.2) contrast(1.8) sepia(0.35)';
  c.drawImage(e, x, y, w, h);
  c.filter = 'none';
  c.globalCompositeOperation = 'source-over';
  c.globalAlpha = 1;
  // Northern light enters the collimator.
  const tx = x + w * 0.08,
    ty = y + h * 0.12;
  line([[0, ty - 40], [tx, ty]], grad(0, 0, tx, 0, ['#5fae4a00', '#5fae4acc']), 4);
  for (let k = 0; k < 6; k++) {
    const f = (t * 0.5 + k / 6) % 1;
    spark(mix(0, tx, f), mix(ty - 40, ty, f), 2.5, '#5fae4a', Math.sin(Math.PI * f));
  }
  c.globalAlpha = ease(t, cue('anders') - 0.2, cue('anders') + 0.6);
  text('Uppsala, 1867', 90, 620, 34, '#2a1d3a', 'left', 'title');
  c.globalAlpha = 1;
}

// ── 04 One continuous field: wind, a tail that stretches, a released electron
function field(t: number, g: number) {
  space(g);
  const cx = 420,
    cy = 360,
    r = 66;
  const stretch = ease(t, cue('stretches the field') - 0.3, cue('stretches the field') + 2.5);
  const build = ease(t, cue('energy builds'), cue('energy builds') + 2);
  const release = ease(t, cue('when its released') - 0.2, cue('when its released') + 1);
  const bow = (k: number, col: string, wdt: number) =>
    line(
      path((u) => {
        const a = (u - 0.5) * 2.4,
          d = k * (1 + 0.55 * a * a);
        return [cx - d * Math.cos(a * 0.62), cy + d * Math.sin(a * 0.62) * 1.9];
      }, 120),
      col,
      wdt,
    );
  bow(250, '#f6c3b644', 12);
  bow(250, '#f6c3b6aa', 2);
  bow(170, '#a99cf099', 2);
  for (let i = 0; i < 170; i++) {
    const y0 = (hash(i) - 0.5) * 760,
      u = (hash(i + 5) + t * (0.2 + 0.06 * hash(i + 9))) % 1;
    const x = -40 + u * 1400,
      near = Math.exp(-((y0 / 260) ** 2));
    const push = x > cx - 300 ? Math.sign(y0 || 1) * near * 150 * clamp((x - (cx - 300)) / 200) : 0;
    const yy = cy + y0 + push;
    c.globalAlpha = 0.5 * Math.sin(Math.PI * u);
    line([[x - 18, yy], [x, yy]], '#f6c3b6', 1.4);
  }
  c.globalAlpha = 1;
  for (const L of [1.5, 2.1, 2.8, 3.8, 5]) line(path((u) => dipole(u, L, cx, cy, r, -1, 0.75), 120), grad(cx - 300, 0, 300, 0, ['#f0878f66', '#a99cf0cc']), 2);
  const len = mix(260, 900, stretch);
  for (let k = 0; k < 8; k++) {
    const y = (k + 1) * 14,
      pinch = release * Math.exp(-(((k - 3) / 2) ** 2));
    for (const sgn of [-1, 1]) {
      line(
        path((u) => {
          const x = cx + 50 + u * len;
          const dy = sgn * (y + mix(60, 160, stretch) * Math.sqrt(u) * (1 - 0.6 * pinch * Math.exp(-(((u - 0.55) / 0.12) ** 2))));
          return [x, cy + dy * (u < 0.06 ? u / 0.06 : 1)];
        }, 120),
        grad(cx, 0, len, 0, ['#a99cf0cc', '#8f9ce655']),
        1.8,
      );
    }
  }
  // Stored energy glows in the tail before it is released.
  if (build > 0) lensGlow(cx + 50 + len * 0.55, cy, 140, '#a99cf0', 0.35 * build * (1 - release) * (0.8 + 0.2 * Math.sin(t * 4)));
  gradedPlanet('earth', cx, cy, r, t, [-1, 0, 0.35]);
  if (release > 0) {
    // One tracked electron leads the rest back toward the pole.
    for (let k = 0; k < 16; k++) {
      const f = (t * 0.5 + k * 0.071) % 1,
        sgn = k % 2 ? 1 : -1;
      spark(mix(cx + len * 0.6, cx + 10, f), cy + sgn * mix(120, r * 0.95, f * f), 2.4, electron, release * 0.6 * Math.sin(Math.PI * f));
    }
    const f = ease(t, cue('when its released') + 0.3, cue('when its released') + 3.2);
    const ex = mix(cx + len * 0.55, cx + 12, f),
      ey = cy - mix(40, r * 0.92, f * f);
    spark(ex, ey, 5, electron, 1);
    lensGlow(ex, ey, 30, '#c9b6ff', 0.6);
  }
}

// ── 17 Airglow as a layer around the planet: day splits, night rejoins ──
function airglow(t: number, g: number) {
  space(g);
  const night = ease(t, cue('at night') - 0.4, cue('at night') + 1.4);
  const sp = cue('splits oxygen'),
    meet = cue('find each other'),
    give = cue('energy released');
  // A wide limb across the bottom, the airglow layer above it.
  const cx = 640,
    cy = 1500,
    R = 1100;
  gradedPlanet('earth', cx, cy, R, t * 0.2, [mix(-0.2, 0.15, night), mix(0.3, 0.2, night), mix(0.9, -1, night)], 0.3);
  // Night side: the disc darkens to a faint glow.
  c.fillStyle = '#05040f';
  c.globalAlpha = 0.65 * night;
  c.beginPath();
  c.arc(cx, cy, R, 0, tau);
  c.fill();
  c.fillStyle = '#ffe8c8';
  c.globalAlpha = 0.18 * (1 - night);
  c.fillRect(0, 0, W, H);
  c.globalAlpha = 1;
  // Day: ultraviolet streams in and splits molecules across the layer.
  const uvOn = 1 - night;
  for (let i = 0; i < 9; i++) {
    const f = (t * 0.45 + i / 9) % 1;
    c.globalAlpha = uvOn * Math.sin(Math.PI * f) * 0.7;
    wave(80 + i * 60 - 60, -20, mix(80 + i * 60, 300 + i * 110, f), mix(-20, 320, f), t, '#b9a2ff', 5, 16);
  }
  c.globalAlpha = 1;
  for (let i = 0; i < 26; i++) {
    const a = -0.55 + i * 0.043,
      rr = R + 70 + 50 * hash(i);
    const x = cx + rr * Math.sin(a),
      y = cy - rr * Math.cos(a);
    const split = ease(t, sp + hash(i) * 2.5, sp + hash(i) * 2.5 + 0.6) * (1 - ease(t, meet + hash(i + 3) * 2, meet + hash(i + 3) * 2 + 0.8));
    const d = 9 + 34 * split;
    oxygen(x - d, y, 9, 0, 1);
    oxygen(x + d, y, 9, 0, 1);
    // At night some recombinations hand energy to a neighbouring atom, which waits, then glows.
    const tGive = give + hash(i + 7) * 3;
    const handed = ease(t, tGive, tGive + 0.5);
    if (night > 0.5 && handed > 0 && i % 2 === 0) {
      const nx = x + 26,
        ny = y - 30;
      spark(mix(x, nx, handed), mix(y, ny, handed), 3, '#c9b6ff', handed < 1 ? 1 : 0);
      const glowAt = tGive + 0.5 + 0.7 * hash(i + 11);
      const k = clamp((t - glowAt) / 0.6);
      oxygen(nx, ny, 8, t > tGive + 0.5 && t < glowAt ? 1 : 0, 1);
      if (k > 0 && k < 1) spark(nx, ny, 6, accent, 1 - k);
    }
  }
  // The layer itself brightens into a thin green band once night falls.
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.globalAlpha = night * ease(t, give + 1, give + 4) * 0.6;
  c.strokeStyle = accent;
  c.lineWidth = 16;
  c.filter = 'blur(6px)';
  c.beginPath();
  c.arc(cx, cy, R + 95, -Math.PI / 2 - 0.62, -Math.PI / 2 + 0.62);
  c.stroke();
  c.restore();
  text(night > 0.5 ? 'night' : 'day', 72, 80, 30, ink, 'left', 'title');
  note('Heights exaggerated');
}

// ── 18 Jezero: layered terrain, rover, the spectrometer's field of view ──
function jezero(t: number) {
  const sky = c.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#08071a');
  sky.addColorStop(0.6, '#15132f');
  sky.addColorStop(1, '#2a1c36');
  c.fillStyle = sky;
  c.fillRect(0, 0, W, H);
  for (let i = 0; i < 240; i++) {
    const tw = 0.5 + 0.5 * Math.sin(t * (1 + hash(i)) + i);
    c.globalAlpha = 0.3 + 0.6 * tw * hash(i + 2);
    c.fillStyle = '#e1dcff';
    c.fillRect(hash(i) * W, hash(i + 99) * 430, hash(i + 3) > 0.9 ? 2 : 1, hash(i + 3) > 0.9 ? 2 : 1);
  }
  c.globalAlpha = 1;
  const glow = ease(t, 0.3, 3);
  const band = c.createLinearGradient(0, 160, 0, 500);
  band.addColorStop(0, accent + '00');
  band.addColorStop(1, accent + '30');
  for (let k = 0; k < 4; k++) {
    c.globalAlpha = glow * (0.3 + 0.2 * Math.sin(t * 0.9 + k * 1.7));
    c.fillStyle = band;
    c.fillRect(-100 + 40 * Math.sin(t * 0.2 + k), 150 + 26 * Math.sin(t * 0.35 + k), W + 200, 380);
  }
  c.globalAlpha = 1;
  // Perseverance's own view across Jezero, graded to night.
  const pj = photos.jezero;
  if (pj) {
    const s = (W * 1.08) / pj.width,
      w = pj.width * s,
      h = pj.height * s,
      top = 300 - 0.02 * h - 6 * t;
    c.drawImage(pj, W / 2 - w / 2 + 4 * t, top, w, h);
    c.fillStyle = grad(0, top, 0, h, ['#0b0a1c66', '#0b0a1c99', '#05040bcc']);
    c.fillRect(0, top, W, h);
    line([[0, top + 0.02 * h + 4], [W, top + 0.02 * h + 4]], accent + '33', 2);
    text('Jezero Crater · Perseverance', 80, 676, 28, ink, 'left', 'title');
    return;
  }
  // Three ridges, each a gradient with a faint rim light from the sky glow.
  for (const [base, amp, top, bottom, sp] of [
    [470, 46, '#3b2d52', '#21183a', 0.015],
    [530, 30, '#2a1f3e', '#160f26', 0.03],
    [600, 18, '#1b1328', '#0b0814', 0.06],
  ] as const) {
    const ridge = (x: number) => base - amp * Math.sin(x / 230 + 1 + t * sp) - amp * 0.4 * Math.sin(x / 80 + 2);
    c.fillStyle = grad(0, base - amp, 0, H - base + amp, [top, bottom]);
    c.beginPath();
    c.moveTo(0, H);
    for (let x = 0; x <= W; x += 12) c.lineTo(x, ridge(x));
    c.lineTo(W, H);
    c.fill();
    line(path((u) => [u * W, ridge(u * W)], 120), accent + '22', 1.5);
  }
  // Rover: body, wheels, solar panel deck, mast with camera head.
  const rx = 760,
    ry = 612;
  c.fillStyle = grad(rx, ry - 70, 0, 70, ['#1d1830', '#07060d']);
  c.beginPath();
  c.roundRect(rx, ry - 52, 200, 40, 6);
  c.fill();
  c.fillRect(rx - 10, ry - 62, 220, 10);
  for (const wx of [rx + 20, rx + 80, rx + 140, rx + 190]) {
    c.fillStyle = '#07060d';
    c.beginPath();
    c.arc(wx, ry, 16, 0, tau);
    c.fill();
    line([[wx, ry - 16], [wx, ry - 30]], '#120e1e', 4);
  }
  const look = ease(t, cue('pointed its cameras') - 0.5, cue('pointed its cameras') + 1.5);
  const mx = rx + 168,
    mt = ry - 170;
  c.fillStyle = '#0b0914';
  c.fillRect(mx, mt, 9, 110);
  c.save();
  c.translate(mx + 4, mt);
  c.rotate(-0.9 * look);
  c.fillStyle = grad(-24, -16, 48, 26, ['#2a2340', '#0b0914']);
  c.fillRect(-24, -16, 48, 24);
  c.restore();
  line([[rx - 10, ry - 62], [rx + 210, ry - 62]], accent + '44', 1.2);
  // The spectrometer's field of view: a thin outline, not a beam.
  if (look > 0.4) {
    const a = (look - 0.4) / 0.6;
    c.globalAlpha = a;
    c.setLineDash([6, 8]);
    line([[mx + 4, mt], [mx - 260, mt - 380]], '#e8e4ff88', 1.5);
    line([[mx + 4, mt], [mx + 60, mt - 400]], '#e8e4ff88', 1.5);
    c.setLineDash([]);
    c.globalAlpha = 1;
  }
  text('Jezero Crater · Perseverance', 80, 676, 28, ink, 'left', 'title');
  note('Illustration');
}

void coral;
void lilac;
export const beats6: Record<string, (t: number, g: number) => void> = {
  atomCard: (t) => atomCard(t),
  spectrometer: (t) => spectrometer(t),
  sunField: field,
  recombine: airglow,
  jezero: (t) => jezero(t),
};
