import { tau } from '../index.ts';
import { sky } from '../materials.ts';
const canvas = document.createElement('canvas');
canvas.width = 1280;
canvas.height = 720;
const c = canvas.getContext('2d', { alpha: false })!;

const W = canvas.width,
  H = canvas.height;
const muted = '#cebbdf',
  pink = '#f79c9a',
  ice = '#b8bbff',
  lime = sky.accent;
const grad = (x: number, y: number, w: number, h: number, colors: string[]) => {
  const g = c.createLinearGradient(x, y, x + w, y + h);
  colors.forEach((color, i) => g.addColorStop(i / (colors.length - 1), color));
  return g;
};
function words(
  s: string,
  x: number,
  y: number,
  size: number,
  style = 'sans',
  color = sky.light as string,
  align: CanvasTextAlign = 'left',
) {
  c.textAlign = align;
  c.textBaseline = 'alphabetic';
  c.font =
    style === 'title'
      ? size + 'px Georgia, serif'
      : style === 'italic'
        ? 'italic ' + size + 'px Georgia, serif'
        : style === 'mono'
          ? size + 'px Menlo, monospace'
          : '500 ' + size + 'px "Helvetica Neue", Arial, sans-serif';
  c.fillStyle = color;
  c.fillText(s, x, y);
}
function lensGlow(x: number, y: number, r: number, color: string, opacity = 1) {
  c.save();
  c.globalAlpha *= opacity;
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color + 'da');
  g.addColorStop(0.18, color + '80');
  g.addColorStop(0.62, color + '26');
  g.addColorStop(1, color + '00');
  c.fillStyle = g;
  c.fillRect(x - r, y - r, r * 2, r * 2);
  c.restore();
}
const plate = document.createElement('canvas');
plate.width = W;
plate.height = H;
function makeSky() {
  c.fillStyle = grad(0, 0, W, H, ['#080917', '#131126', '#2e1b32', '#160f24']);
  c.fillRect(0, 0, W, H);
  lensGlow(958, 248, 500, '#504d9a', 0.38);
  lensGlow(300, 750, 450, '#a34f57', 0.29);
  let seed = 14;
  const rand = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < 4800; i++) {
    const x = rand() * W,
      y = rand() * H,
      a = rand();
    c.globalAlpha = 0.028 + a * a * a * 0.35;
    c.fillStyle = i % 4 === 0 ? pink : ice;
    c.fillRect(x | 0, y | 0, i % 10 === 0 ? 2 : 1, i % 10 === 0 ? 2 : 1);
  }
  c.globalAlpha = 1;
  plate.getContext('2d')!.drawImage(canvas, 0, 0);
}
makeSky();
function dot(x: number, y: number, r: number, color: string) {
  lensGlow(x, y, r * 3, color, 0.7);
  c.fillStyle = grad(x - r, y - r, r * 2, r * 2, ['#fff7e8', color, color + '99']);
  c.beginPath();
  c.arc(x, y, r, 0, tau);
  c.fill();
}
function line(points: number[][], color: string | CanvasGradient, weight = 2) {
  c.strokeStyle = color;
  c.lineWidth = weight;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.beginPath();
  points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.stroke();
}
function ring(x: number, y: number, r: number, color: string, alpha = 1) {
  c.save();
  c.globalAlpha *= alpha;
  c.strokeStyle = color;
  c.lineWidth = 1.4;
  c.beginPath();
  c.arc(x, y, r, 0, tau);
  c.stroke();
  c.restore();
}
function target(x: number, y: number, r: number, t: number) {
  ring(x, y, r, lime, 0.89);
  ring(x, y, r + 4 + 9 * ((t / 2.8) % 1), lime, 0.4 * (1 - ((t / 2.8) % 1)));
  for (let i = 0; i < 4; i++) {
    const a = (i * tau) / 4;
    line(
      [
        [x + Math.cos(a) * (r + 3), y + Math.sin(a) * (r + 3)],
        [x + Math.cos(a) * (r + 10), y + Math.sin(a) * (r + 10)],
      ],
      lime,
      1,
    );
  }
}

export { canvas, c, W, H, muted, pink, ice, lime, grad, words, lensGlow, plate, dot, line, ring, target };
