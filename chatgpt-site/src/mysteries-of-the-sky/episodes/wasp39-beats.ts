// Story beats timed to the recorded narration. Times inside each beat are
// seconds from its cut; comments give the phrase each change lands on.
// Light curves plot the ERS release; chemistry, balances, rays and the
// SO₂ band shapes are schematic illustrations.
import { c, ice, pink, lime, muted, words, line, grad, lensGlow } from './stage.ts';
import observations from './wasp39-data.json';
import model from './wasp39-model.json';
import { cue } from './direction.ts';
import { field } from './wasp39-showpieces.ts';

type Globe = (x: number, y: number, r: number, look?: 'wasp' | 'saturn' | 'jupiter' | 'star') => void;
const tau = Math.PI * 2;
const ease = (t: number, a: number, b: number) => {
  const f = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return f * f * (3 - 2 * f);
};
const mix = (a: number, b: number, f: number) => a + (b - a) * f;
function dot(x: number, y: number, r: number, color: string) {
  c.fillStyle = color;
  c.beginPath();
  c.arc(x, y, r, 0, tau);
  c.fill();
}
function label(s: string, x: number, y: number, size = 22, color = muted, align: CanvasTextAlign = 'center') {
  words(s, x, y, size, 'mono', color, align);
}
// A shaded atom: a soft glow, a lit sphere and a darker rim.
function atom(x: number, y: number, r: number, color: string, alpha = 1) {
  if (alpha <= 0) return;
  c.save();
  c.globalAlpha *= alpha;
  lensGlow(x, y, r * 2.2, color, 0.35);
  const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, '#fff6ee');
  g.addColorStop(0.35, color);
  g.addColorStop(1, '#2c1f38');
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, r, 0, tau);
  c.fill();
  c.restore();
}
function bond(a: number[], b: number[], alpha = 1) {
  if (alpha <= 0) return;
  c.save();
  c.globalAlpha *= alpha;
  line([a, b], grad(a[0], a[1], b[0] - a[0] || 1, b[1] - a[1] || 1, ['#d9c9e6', '#8f7aa8']), 6);
  c.restore();
}
const S = '#e7bf72',
  O = '#f08a8c',
  Hc = '#cfd5ff';

export function makeBeats(globe: Globe): Record<string, (t: number) => void> {
  // "Put Saturn on a set of scales": the beam settles level on "roughly the mass".
  function mass(t: number) {
    const tilt = 0.22 * (1 - ease(t, 0.6, 2.6)) * Math.cos(t * 2.2) + 0.01 * Math.sin(t * 1.3);
    const cx = 640,
      cy = 250,
      arm = 330;
    const ends = [-1, 1].map((s) => [cx + s * arm * Math.cos(tilt), cy + s * arm * Math.sin(tilt)]);
    c.fillStyle = grad(cx - 30, cy, 60, 380, ['#9a86b4', '#3b2d4c']);
    c.beginPath();
    c.moveTo(cx - 14, cy);
    c.lineTo(cx + 14, cy);
    c.lineTo(cx + 54, 640);
    c.lineTo(cx - 54, 640);
    c.fill();
    line([ends[0], ends[1]], grad(cx - arm, 0, 2 * arm, 0, ['#c8b5dc', '#f2d9e2', '#c8b5dc']), 7);
    lensGlow(cx, cy, 30, ice, 0.6);
    ends.forEach(([x, y], i) => {
      line(
        [
          [x - 70, y + 120],
          [x, y],
          [x + 70, y + 120],
        ],
        '#bba8cf88',
        1.6,
      );
      c.fillStyle = grad(x - 95, y + 120, 190, 22, ['#b29ccb', '#6c5689']);
      c.beginPath();
      c.ellipse(x, y + 124, 95, 14, 0, 0, tau);
      c.fill();
      const appear = ease(t, 0.1 + i * 0.5, 0.9 + i * 0.5);
      if (i === 0) globe(x, y + 124 - 72 * appear, 66 * appear, 'saturn');
      else globe(x, y + 124 - 72 * appear, 66 * appear, 'wasp');
      c.globalAlpha = appear;
      label(i ? 'WASP-39 b' : 'Saturn', x, y + 185, 24);
      c.globalAlpha = 1;
    });
    c.globalAlpha = ease(t, 2.2, 2.9);
    label('≈ the same mass', cx, 668, 26, lime);
    c.globalAlpha = 1;
  }
  // "Puff it up until it's wider than Jupiter."
  function inflate(t: number) {
    const grow = ease(t, 0.1, 1.5);
    const rj = 132,
      rw = mix(84, 168, grow);
    globe(380, 370, rj, 'jupiter');
    globe(900, 370, rw, 'wasp');
    c.save();
    c.setLineDash([6, 10]);
    c.strokeStyle = '#d9c8e866';
    c.lineWidth = 1.5;
    for (const y of [370 - rj, 370 + rj]) {
      c.beginPath();
      c.moveTo(220, y);
      c.lineTo(1120, y);
      c.stroke();
    }
    c.restore();
    label('Jupiter', 380, 600, 24);
    label('WASP-39 b', 900, 600, 24);
    c.globalAlpha = ease(t, 1.2, 1.8);
    label('1.27 × wider', 900, 640, 24, lime);
    c.globalAlpha = 1;
  }
  // "An entire year goes by in just over four Earth days."
  function year(t: number) {
    const x = 640,
      y = 360,
      rx = 470,
      ry = 150;
    const orbit = Array.from({ length: 161 }, (_, i) => [x + rx * Math.cos((i / 160) * tau), y + ry * Math.sin((i / 160) * tau)]);
    line(orbit, grad(x - rx, y, 2 * rx, 0, [ice + '88', '#695f88', pink + 'aa']), 2);
    const phase = Math.max(0, t - 0.4) / 3.6,
      a = Math.PI / 2 + tau * phase;
    const px = x + rx * Math.cos(a),
      py = y + ry * Math.sin(a);
    // A fading trail shows the distance covered so far.
    for (let k = 1; k < 26; k++) {
      const b = a - k * 0.06;
      lensGlow(x + rx * Math.cos(b), y + ry * Math.sin(b), 12, pink, 0.4 * (1 - k / 26));
    }
    if (py < y) globe(px, py, 34);
    globe(x, y, 104, 'star');
    if (py >= y) globe(px, py, 34);
    const days = Math.min(phase, 1) * 4.06;
    words('Day ' + days.toFixed(1), 640, 640, 40, 'sans', phase >= 1 ? lime : '#f3e7ef', 'center');
  }
  // "From here, about seven hundred light-years away, the star and planet run
  // together into a point." The pair shrinks into one dot; every four days it dims.
  function point(t: number, settled: boolean) {
    const merge = settled ? 1 : ease(t, 0.3, 4.6);
    const sep = mix(150, 0, merge),
      r = mix(120, 7, merge);
    const pulse = ease(t, 3.8, 5.4) * Math.max(0, Math.sin(((t - 3.6) / 2.6) * Math.PI)) ** 6;
    // The camera pulls back through a crowded field as the pair merges.
    field(t * 2.8, mix(2.6, 1.05, merge) + 0.032 * Math.sin(t * 0.95) * merge, [640, 360]);
    c.fillStyle = '#120f26';
    c.globalAlpha = 0.5;
    c.fillRect(0, 0, 1280, 720);
    c.globalAlpha = 1;
    lensGlow(640, 360, mix(260, 70, merge), '#f79c9a', 0.55 * (1 - 0.35 * pulse));
    c.globalAlpha = 1 - 0.39 * pulse;
    globe(640 - sep * 0.4, 360, r, 'star');
    c.globalAlpha = 1;
    if (merge < 0.97) globe(640 + sep, 360, Math.max(2, r * 0.3), 'wasp');
    lensGlow(640, 360, 14 * merge, '#fff1ea', merge * (1 - 0.4 * pulse));
    c.globalAlpha = ease(t, 0.8, 1.6);
    words('700 light-years', 640, 600, 44, 'sans', '#f3e7ef', 'center');
    c.globalAlpha = 1;
  }

  // Transit and its light curve stay on screen together from baseline to recovery.
  const R = 150,
    r = R * Math.sqrt(0.02),
    starX = 640,
    starY = 215;
  const contact = (t: number) => starX - R - r + (t - 7) * 95; // leading edge bites at 7 s
  function overlap(d: number) {
    if (d >= R + r) return 0;
    if (d <= R - r) return (r * r) / (R * R);
    const a = r * r * Math.acos((d * d + r * r - R * R) / (2 * d * r)),
      b = R * R * Math.acos((d * d + R * R - r * r) / (2 * d * R)),
      k = 0.5 * Math.sqrt((-d + r + R) * (d + r - R) * (d - r + R) * (d + r + R));
    return (a + b - k) / (Math.PI * R * R);
  }
  function transitCurve(t: number) {
    globe(starX, starY, R, 'star');
    const px = contact(t);
    c.fillStyle = grad(px - r, starY - r, 2 * r, 2 * r, ['#322034', '#0d0c17']);
    dot(px, starY, r, '#120d1c');
    const X = (s: number) => 150 + s * 70,
      Y = (f: number) => 470 + f * 6000;
    line(
      [
        [150, 420],
        [150, 600],
        [1140, 600],
      ],
      '#c4b5cd77',
      1.4,
    );
    label('Light counted', 150, 405, 20, muted, 'left');
    label('Time', 1140, 632, 20, muted, 'right');
    const pts: number[][] = [];
    for (let s = 0; s <= Math.min(t, 14); s += 0.12) {
      const d = Math.abs(contact(s) - starX);
      pts.push([X(s), Y(overlap(d)) + 1.5 * Math.sin(s * 37)]);
    }
    pts.forEach(([x, y]) => dot(x, y, 2.6, ice));
    const head = pts.at(-1)!;
    if (t < 14) lensGlow(head[0], head[1], 26, lime, 0.8);
    // "Roughly two percent of the light goes missing."
    const b = ease(t, 11.2, 11.9);
    if (b > 0) {
      c.globalAlpha = b;
      const x = X(8.8) - 0;
      line(
        [
          [x - 10, Y(0)],
          [x, Y(0)],
          [x, Y(0.02)],
          [x - 10, Y(0.02)],
        ],
        lime,
        2,
      );
      words('2%', x + 14, (Y(0) + Y(0.02)) / 2 + 12, 34, 'sans', lime);
      c.globalAlpha = 1;
    }
  }

  // Looking up versus toward the horizon through the same layer of air.
  function rays(t: number, slant: boolean) {
    const ground = 610,
      top = 330,
      ox = 330;
    c.fillStyle = grad(0, top, 0, ground - top, ['#7a6fc000', '#7a6fc055', '#c87c8a66']);
    c.fillRect(0, top, 1280, ground - top);
    line(
      [
        [0, ground],
        [1280, ground],
      ],
      grad(0, 0, 1280, 0, ['#8b6e9a', '#d79a9a', '#8b6e9a']),
      3,
    );
    label('A layer of air', 1180, top - 14, 20, muted, 'right');
    atom(ox, ground - 12, 12, '#f3e7ef');
    const v = slant ? 1 : ease(t, 0, 1.2);
    line(
      [
        [ox, 60],
        [ox, mix(60, ground - 24, v)],
      ],
      ice + '66',
      2,
    );
    line(
      [
        [ox, top],
        [ox, mix(top, ground - 24, slant ? 1 : ease(t, 0.6, 1.4))],
      ],
      ice,
      6,
    );
    label('short path', ox - 18, (top + ground) / 2, 20, ice, 'right');
    const verticalProgress = (t * 0.67 + 0.4) % 1;
    const pulseY = mix(83, ground - 24, verticalProgress);
    lensGlow(ox, pulseY, 33, ice, Math.sin(Math.PI * verticalProgress) * v);
    if (!slant) return;
    // The ray swings down toward the horizon; its path inside the layer grows.
    const angle = mix(Math.PI / 2, 0.16, ease(t, 0.3, 3.2));
    const dx = Math.cos(angle),
      dy = -Math.sin(angle);
    const enter = (top - (ground - 24)) / dy;
    const far = Math.min(enter, 1500);
    const sx = ox + dx * far,
      sy = ground - 24 + dy * far;
    line(
      [
        [ox + dx * 1600, ground - 24 + dy * 1600],
        [ox, ground - 24],
      ],
      pink + '55',
      2,
    );
    line(
      [
        [sx, sy],
        [ox, ground - 24],
      ],
      pink,
      6,
    );
    const along = (t * 0.45) % 1;
    lensGlow(mix(sx, ox, along), mix(sy, ground - 24, along), 18, pink, 0.9);
    c.globalAlpha = ease(t, 2.6, 3.4);
    label('long path through the same air', Math.min(945, mix(sx, ox, 0.5)), mix(sy, ground - 24, 0.5) - 26, 22, pink);
    c.globalAlpha = 1;
  }

  // "A single dip becomes many slightly different dips": measured light curves.
  const curveKeys = Object.keys(observations.light) as (keyof typeof observations.light)[];
  function manyDips(t: number) {
    const rows = [1, 3, 4, 5, 6, 7, 9];
    rows.forEach((k, i) => {
      const data = observations.light[curveKeys[k]];
      const y0 = 140 + i * 72,
        reveal = ease(t, i * 0.25, i * 0.25 + 1.6);
      const col = grad(150, 0, 980, 0, [ice, pink]);
      c.globalAlpha = reveal;
      data.forEach(([h, v], j) => {
        if (j / data.length > reveal) return;
        c.fillStyle = col;
        c.fillRect(160 + (h + 4.7) * 100 - 2, y0 + (1.002 - v) * 2300 - 2, 4, 4);
      });
      label(Number(curveKeys[k]).toFixed(2) + ' μm', 1170, y0 + 8, 18, muted, 'left');
      c.globalAlpha = 1;
    });
    label('Measured light curves, one per wavelength', 160, 670, 20, muted, 'left');
  }

  // The published model under the measured points: the 4.05 μm rise is missed.
  function shortfall(t: number) {
    const lo = 3.85,
      hi = 4.25;
    const X = (w: number) => 150 + ((w - lo) / (hi - lo)) * 980,
      Y = (p: number) => 533 - (p - 2.06) * 2450;
    words('Transit depth', 150, 132, 24, 'sans', muted);
    for (const depth of [2.08, 2.12, 2.16, 2.2]) {
      line([[150, Y(depth)], [1130, Y(depth)]], '#bfb4d431', 1.1);
      label(depth.toFixed(2) + '%', 133, Y(depth) + 6, 18, muted, 'right');
    }
    const pts = observations.spectrum.filter(([w]) => w >= lo && w <= hi);
    const curve = (model as number[][]).filter(([w]) => w >= lo && w <= hi);
    const drawn = Math.max(2, Math.ceil(ease(t, 0.2, 2.2) * curve.length));
    line(
      curve.slice(0, drawn).map(([w, p]) => [X(w), Y(p)]),
      pink,
      3,
    );
    const gap = ease(t, 2.4, 3.6);
    for (const [w, p, e] of pts) {
      const hot = Math.abs(w - 4.045) < 0.044;
      const m = curve.reduce((a, b) => (Math.abs(b[0] - w) < Math.abs(a[0] - w) ? b : a))[1];
      if (hot && gap > 0) {
        c.fillStyle = grad(0, Y(p), 0, Y(m) - Y(p), [lime + '66', lime + '08']);
        c.globalAlpha = gap;
        c.fillRect(X(w) - 12, Y(p), 24, Y(m) - Y(p));
        c.globalAlpha = 1;
      }
      line(
        [
          [X(w), Y(p - e)],
          [X(w), Y(p + e)],
        ],
        hot ? lime : ice + 'aa',
        2.2,
      );
      if (hot) lensGlow(X(w), Y(p), 22, lime, 0.5);
      dot(X(w), Y(p), 5.5, hot ? lime : ice);
    }
    words('Published equilibrium model', 1130, 132, 24, 'sans', pink, 'right');
    for (const w of [3.9, 4.0, 4.1, 4.2]) label(w.toFixed(1) + ' μm', X(w), 600, 19);
  }

  // Ten seconds of photochemistry, one step per phrase. Intermediate steps are omitted.
  function reaction(t: number) {
    // Altitude band: deep at the bottom, the starlit upper layer at the top.
    const warm = ease(t, 8.4, 10);
    c.fillStyle = grad(0, 60, 0, 600, ['#8f6fd0' + Math.round(40 + 60 * warm).toString(16), '#3a2b5a22', '#2a1c3000']);
    c.fillRect(60, 60, 1160, 600);
    label('higher', 92, 92, 20, muted, 'left');
    label('deeper', 92, 650, 20, muted, 'left');
    line(
      [
        [76, 80],
        [76, 660],
      ],
      grad(0, 80, 0, 580, [ice, muted + '33']),
      2,
    );
    // The parcel rises with its hydrogen sulfide.
    const rise = ease(t, 0.3, 10);
    const cx = 560,
      cy = mix(520, 300, rise);
    lensGlow(cx, cy, 190, '#b58ac8', 0.22);
    // Ultraviolet arrives from above from "Ultraviolet light" onward.
    const uv = ease(t, 10.4, 11.2) * (1 - ease(t, 29.4, 31.7));
    for (let i = 0; i < 6; i++) {
      const f = (t * 0.6 + i / 6) % 1,
        x = 760 + i * 60 - f * 120,
        y = -20 + f * 300;
      c.globalAlpha = uv * Math.sin(Math.PI * f);
      line(
        Array.from({ length: 30 }, (_, k) => [x - k * 4, y - k * 10 + 5 * Math.sin(k * 1.3 + t * 9)]),
        '#b9a2ff',
        2,
      );
    }
    c.globalAlpha = 1;
    // Water splits at "break up water molecules" (12.4 s).
    const split = ease(t, 12.4, 13.4);
    const wx = 860,
      wy = cy - 40;
    const water = ease(t, 10.6, 11.6);
    // Water splits into OH and a free H. The OH takes one hydrogen from the
    // hydrogen sulfide ("Those fragments help strip hydrogen"), the H the other.
    const pull1 = ease(t, 16.4, 17.6),
      take1 = ease(t, 17.4, 18.6),
      pull2 = ease(t, 18.2, 19.0),
      take2 = ease(t, 19.0, 19.9);
    const freeX = mix(wx + 34, wx + 120, split),
      freeY = mix(wy - 26, wy - 80, split);
    const hX = mix(freeX, cx - 96, pull2) + mix(0, -283, take2),
      hY = mix(freeY, cy + 20, pull2) + mix(0, -150, take2);
    const ohX = mix(wx, cx + 110, pull1) + mix(0, 380, take1),
      ohY = mix(wy, cy, pull1) + mix(0, -160, take1);
    if (water > 0) {
      if (split < 1) bond([ohX, ohY], [freeX, freeY], water * (1 - split));
      bond([ohX, ohY], [ohX - 34, ohY + 26], water);
      atom(ohX, ohY, 26, O, water);
      atom(ohX - 34, ohY + 26, 14, Hc, water);
      atom(hX, hY, 14, Hc, water);
    }
    // Hydrogen sulfide loses one hydrogen to each fragment, then gains two oxygens.
    const sAppear = ease(t, 0, 0.7);
    const hydrogens = [
      [cx - 46, cy + 34],
      [cx + 46, cy + 34],
    ];
    hydrogens.forEach(([x, y], i) => {
      const leave = i ? take1 : take2;
      const tx = i ? ohX + 30 : hX + 28,
        ty = i ? ohY + 26 : hY;
      const hx = mix(x, tx, leave),
        hy = mix(y, ty, leave);
      bond([cx, cy], [hx, hy], sAppear * (1 - leave));
      atom(hx, hy, 15, Hc, sAppear);
    });
    const oxy = ease(t, 20.6, 22.6);
    for (const s of [-1, 1]) {
      const ex = cx + s * 64,
        ey = cy - 30;
      const ox = mix(cx + s * 420, ex, oxy),
        oy = mix(cy - 260, ey, oxy);
      if (oxy > 0.95) bond([cx, cy], [ex, ey], ease(t, 22.2, 22.8));
      atom(ox, oy, 26, O, ease(t, 20.1, 20.8));
    }
    atom(cx, cy, 42, S, sAppear);
    const name = t < 17.6 ? 'H₂S' : t < 19.8 ? 'HS' : t < 22.6 ? 'S' : 'SO₂';
    c.globalAlpha = sAppear;
    words(name, cx, cy + 92, 30, 'sans', name === 'SO₂' ? pink : '#f3e7ef', 'center');
    c.globalAlpha = water * (1 - ease(t, 15.5, 16.4));
    label(split > 0.5 ? 'OH + H' : 'H₂O', wx, wy + 76, 22);
    c.globalAlpha = ease(t, 22.3, 23.2) * (1 - ease(t, 29, 30));
    label('Several reactions shown as one step', cx, cy + 141, 25, '#e9cddd');
    c.globalAlpha = 1;
    // "The star was doing two jobs."
    const jobs = ease(t, 31.6, 32.6);
    if (jobs > 0) {
      c.globalAlpha = jobs;
      const y = 515;
      const pass = (t * 0.5) % 1;
      line([[107, y], [1150, y]], grad(107, 0, 1043, 0, [ice + '46', ice, ice + '70']), 3.2);
      lensGlow(mix(107, 1150, pass), y, 27, ice, 0.9);
      label('Infrared reaches Webb', 1150, y + 46, 23, ice, 'right');
      const absorption = ease(t, 35.2, 36);
      c.globalAlpha = absorption;
      const upper = Array.from({ length: 62 }, (_, i) => [174 + i * 5.7, 150 + 13 * Math.sin(i * 0.62 - t * 8)]);
      line(upper, grad(174, 0, 351, 0, ['#daccff', '#b59ce99f']), 3.5);
      label('UV drives the chemistry', 177, 120, 23, '#daccff', 'left');
      c.globalAlpha = 1;
    }
  }

  // Two edges of the planet meet the star at different times.
  function limbs(t: number) {
    const sx = 640,
      sy = 300,
      sr = 226,
      pr = 64;
    const py = sy + 140;
    globe(sx, sy, sr, 'star');
    const key = [
      [0, 150],
      [7, sx - sr],
      [11.3, sx - sr + 30],
      [12.6, sx + sr],
      [14.8, sx + sr + 90],
    ];
    let x = key[0][1];
    for (let i = 1; i < key.length; i++)
      if (t >= key[i - 1][0]) x = mix(key[i - 1][1], key[i][1], ease(t, key[i - 1][0], key[i][0]));
    dot(x, py, pr, '#140e1f');
    // Leading limb (right) is the morning side; trailing (left) the evening side.
    for (const [side, color, name] of [
      [1, ice, 'morning'],
      [-1, pink, 'evening'],
    ] as const) {
      const ex = x + side * pr;
      const onStar = Math.hypot(ex - sx, py - sy) < sr;
      const a0 = side > 0 ? -0.7 : Math.PI - 0.7;
      line(
        Array.from({ length: 30 }, (_, i) => {
          const a = a0 + (1.4 * i) / 29;
          return [x + (pr + 5) * Math.cos(a), py + (pr + 5) * Math.sin(a)];
        }),
        color,
        onStar ? 6 : 3,
      );
      if (onStar) lensGlow(ex, py, 40, color, 0.6);
      c.globalAlpha = onStar ? 1 : 0.5;
      label(name, ex, py + pr + 44, 24, color, 'center');
      c.globalAlpha = 1;
    }
  }
  // Morning and evening arcs; the evening side warms on "evening side is warmer" (+10 s).
  function edges(t: number) {
    const x = 640,
      y = 360,
      r = 250;
    globe(x, y, r);
    const warm = ease(t, 9.8, 11.2);
    for (const [side, color, name] of [
      [1, ice, 'morning'],
      [-1, pink, 'evening'],
    ] as const) {
      const a0 = side > 0 ? -0.6 : Math.PI - 0.6;
      const width = side < 0 ? mix(7, 14, warm) : 7;
      line(
        Array.from({ length: 40 }, (_, i) => {
          const a = a0 + (1.2 * i) / 39;
          return [x + (r + 8) * Math.cos(a), y + (r + 8) * Math.sin(a)];
        }),
        side < 0 ? grad(x - r - 20, y - r, 40, 2 * r, ['#f79c9a', '#ffb38a', '#f79c9a']) : color,
        width,
      );
      for (let j = 0; j < 3; j++) {
        const f = (t * 0.22 + j / 3) % 1,
          a = a0 + 1.2 * f;
        lensGlow(x + (r + 8) * Math.cos(a), y + (r + 8) * Math.sin(a), 26 + (side < 0 ? 20 * warm : 0), color, Math.sin(Math.PI * f));
      }
      label(name, x + side * (r + 40), y + 6, 24, color, side > 0 ? 'left' : 'right');
    }
    c.globalAlpha = warm;
    label('warmer', x - r - 40, y + 40, 22, '#ffb38a', 'right');
    c.globalAlpha = 1;
  }
  // The same light curve, with ingress and egress shaded by the limb they probe.
  function curveEdges(t: number) {
    const row = observations.light[curveKeys[6]];
    const X = (h: number) => 144 + (h + 4.7) * 105,
      Y = (v: number) => 222 + (1.002 - v) * 11000;
    const shade = ease(t, 0.4, 1.4);
    for (const [a, b, color] of [
      [-1.45, -1.1, ice],
      [1.1, 1.45, pink],
    ] as const) {
      c.fillStyle = grad(0, 190, 0, 380, [color + '00', color + '55']);
      c.globalAlpha = shade;
      c.fillRect(X(a), 190, X(b) - X(a), 377);
      c.globalAlpha = 1;
    }
    line(
      [
        [144, 193],
        [144, 567],
        [1155, 567],
      ],
      '#c4b5cd88',
    );
    for (const h of [-4, -2, 0, 2, 4]) label(String(h), X(h), 604, 19);
    label('Hours from mid-transit', 1150, 655, 20, muted, 'right');
    row.forEach(([h, v]) => dot(X(h), Y(v), 3, h < -1.1 && h > -1.45 ? ice : h > 1.1 && h < 1.45 ? pink : '#e6dcef'));
    c.globalAlpha = shade;
    label('morning limb first', X(-1.3), 170, 20, ice);
    label('evening limb last', X(1.3), 170, 20, pink);
    c.globalAlpha = 1;
  }

  // Several pipelines, one spectrum: three illustrative reductions agree.
  function pipelines(t: number) {
    const lo = 3.6,
      hi = 4.6;
    const X = (w: number) => 150 + ((w - lo) / (hi - lo)) * 980,
      Y = (p: number) => 560 - (p - 2.07) * 1700;
    const pts = observations.spectrum.filter(([w]) => w >= lo && w <= hi);
    c.fillStyle = grad(0, 0, 1280, 720, ['#30253a', '#6b4053', '#342941']);
    c.fillRect(-90, -50, 1460, 820);
    for (const depth of [2.1, 2.2, 2.3]) {
      line([[150, Y(depth)], [1130, Y(depth)]], '#f4c5da32', 1);
      label(depth.toFixed(1) + '%', 136, Y(depth) + 6, 19, muted, 'right');
    }
    words('Light blocked', 155, 160, 23, 'sans', muted);
    words('Wavelength (μm)', 1130, 628, 22, 'sans', muted, 'right');
    for (const w of [3.6, 3.8, 4.0, 4.2, 4.4, 4.6]) label(w.toFixed(1), X(w), 588, 18);
    [ice, pink, '#daccff'].forEach((col, k) => {
      const a = ease(t, k * 0.8, k * 0.8 + 1);
      c.globalAlpha = a;
      dot(596 + k * 170, 152, 5, col);
      words('Analysis ' + (k + 1), 614 + k * 170, 160, 21, 'sans', col);
      pts.forEach(([w, p], i) => {
        const jitter = 0.004 * Math.sin(i * 2.3 + k * 1.7);
        const stage = ease(t, k * 0.75 + i * 0.027, k * 0.75 + i * 0.027 + 0.45);
        c.globalAlpha = a * stage;
        dot(X(w) + (k - 1) * 5, Y(p + jitter), 4.5, col);
      });
    });
    c.globalAlpha = 1;
    label('Illustrative analysis offsets', 150, 631, 19, muted, 'left');
  }

  return {
    mass,
    inflate,
    year,
    deepfield: (t) => point(t, false),
    starpoint: (t) => point(t, true),
    transitcurve: transitCurve,
    vertical: (t) => rays(t, false),
    slant: (t) => rays(t, true),
    manydips: manyDips,
    shortfall,
    reaction,
    limbs,
    edges,
    curveedges: curveEdges,
    pipelines,
  };
}
export { cue };
