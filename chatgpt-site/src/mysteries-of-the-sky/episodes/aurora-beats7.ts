// Round-5 revisions: McLennan on cream before the Toronto tube, and the
// opening atom drawn as the film's own oxygen sphere.
import { c, W, H, lensGlow } from './stage.ts';
import { ease, mix, clamp, cream, text, cover, tiles, tau } from './aurora-core.ts';
import { spark } from './aurora-scenes.ts';
import { oxygen } from './aurora-beats3.ts';
import { photos } from './aurora.ts';

const set = tiles(16, 77);
function mclennan(t: number) {
  c.fillStyle = cream;
  c.fillRect(0, 0, W, H);
  for (let x = 0; x <= W; x += W / 24) {
    c.fillStyle = '#b9b0a230';
    c.fillRect(x, 0, 1, H);
  }
  for (let y = 0; y <= H; y += W / 24) {
    c.fillStyle = '#b9b0a230';
    c.fillRect(0, y, W, 1);
  }
  // Tiles of the green auroral line gather around him, as Ångström's did.
  const fill = ease(t, 0.3, 4) * 0.45;
  for (const q of set) {
    if (q.at > fill || (q.x < 480 && q.y > 520)) continue;
    const age = clamp((fill - q.at) * 10),
      s = q.size * (0.6 + 0.4 * age);
    c.save();
    c.beginPath();
    c.rect(q.x + (q.size - s) / 2, q.y + (q.size - s) / 2, s, s);
    c.clip();
    if (q.kind < 0.4) cover(photos.band, 1.3, 0.4 + 0.3 * Math.sin(q.y), 0.4);
    else {
      c.fillStyle = '#1c1d4a';
      c.fillRect(q.x, q.y, q.size, q.size);
    }
    c.restore();
  }
  const p = photos.mclennan,
    h = 680,
    w = (p.width / p.height) * h,
    z = 1 + 0.04 * ease(t, 0, 6);
  c.drawImage(p, W * 0.66 - (w * z) / 2, H - h * z + 20, w * z, h * z);
  c.globalAlpha = ease(t, 0.4, 1.2);
  text('Toronto, 1925', 90, 600, 36, '#2a1d3a', 'left', 'title');
  text('John McLennan', 92, 644, 24, '#4a3b58', 'left', 'title');
  c.globalAlpha = 1;
}
// The opening atom: the same lit oxygen sphere used later, with faint orbits.
function atomCard(t: number) {
  const g = c.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, 760);
  g.addColorStop(0, '#2b2152');
  g.addColorStop(0.5, '#171433');
  g.addColorStop(1, '#0c0a1d');
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  const pass = ease(t, 0, 1.4);
  c.globalAlpha = 1 - pass;
  lensGlow(W / 2, H / 2, mix(300, 1400, pass), '#7d86f0', 0.8);
  c.globalAlpha = 1;
  const r = mix(30, 110, ease(t, 0, 3.5));
  for (let i = 0; i < 3; i++) {
    c.save();
    c.translate(W / 2, H / 2);
    c.rotate((i * Math.PI) / 3 + 0.3 + t * 0.05);
    c.strokeStyle = '#e7b2c455';
    c.lineWidth = 1.5;
    c.beginPath();
    c.ellipse(0, 0, r * 2.2, r * 0.8, 0, 0, tau);
    c.stroke();
    const e = t * (0.9 + 0.2 * i) + i * 2;
    spark(r * 2.2 * Math.cos(e), r * 0.8 * Math.sin(e), Math.max(2.5, r * 0.04), '#ffd9c9', 1);
    c.restore();
  }
  oxygen(W / 2, H / 2, r, 0, 1);
}
export const beats7: Record<string, (t: number, g: number) => void> = {
  mclennan: (t) => mclennan(t),
  atomCard: (t) => atomCard(t),
};
