// Browser entry for `node scripts/motion.mjs icons`: every pixel icon at module sizes 6 and 3.
import { ICON_BITMAPS, icon } from './icons.ts';

declare global { interface Window { iconSheet(): string } }
window.iconSheet = () => {
    const names = Object.keys(ICON_BITMAPS) as (keyof typeof ICON_BITMAPS)[], cols = 7, cell = 190;
  const canvas = document.createElement('canvas');
  canvas.width = cols * cell; canvas.height = Math.ceil(names.length / cols) * cell;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  names.forEach((name, index) => {
    const x = (index % cols) * cell, y = Math.floor(index / cols) * cell;
    icon(ctx, name, x + 64, y + 70, 6, '#fff');
    icon(ctx, name, x + 152, y + 46, 3, '#fff');
    ctx.fillStyle = '#999'; ctx.font = '16px monospace'; ctx.fillText(String(name), x + 16, y + 160);
  });
  return canvas.toDataURL('image/png').split(',')[1]!;
};
