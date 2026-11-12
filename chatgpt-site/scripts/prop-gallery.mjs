#!/usr/bin/env node
// Contact sheet for clean props. Usage: node scripts/prop-gallery.mjs out.png [filter] [--t 0,0.5,1] [--hedgy]
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { readdir, mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const PROPS = join(ROOT, 'src/motion/props');
const ACTOR = join(ROOT, 'src/motion/actor/hedgy.ts');
const KIT = join(ROOT, 'src/motion/kit/index.ts');
const CHROME = process.env.CHROME_PATH?.trim() || (process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : '/usr/bin/chromium');
const CELL_W = 360;
const CELL_H = 420;
const ROW_TITLE = 34;
const LABEL_H = 28;

function usage() {
  console.error('Usage: node scripts/prop-gallery.mjs <out.png> [filter] [--t 0,0.5,1] [--hedgy]');
  process.exit(2);
}

const args = process.argv.slice(2);
const outPath = args.shift();
if (!outPath) usage();
let filter = '';
let times = [];
let includeHedgy = false;
let kitMode = false;
let kitStrip = false;
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--hedgy') includeHedgy = true;
  else if (arg === '--kit') kitMode = true;
  else if (arg === '--kit-strip') { kitMode = true; kitStrip = true; }
  else if (arg === '--t' || arg === '--times') {
    const value = args[++i];
    if (!value) usage();
    times.push(...value.split(','));
  } else if (arg.startsWith('--t=')) times.push(...arg.slice(4).split(','));
  else if (arg.startsWith('--times=')) times.push(...arg.slice(8).split(','));
  else if (!filter) filter = arg.toLowerCase();
  else filter += ` ${arg.toLowerCase()}`;
}
const customTimes = times.length > 0;
times = (times.length ? times : ['0']).map(Number).filter(Number.isFinite);
if (!times.length) times = [0];

const entries = [];
const modules = [];
const propFiles = (kitMode ? [] : await readdir(PROPS).catch(() => []))
  .filter(file => file.endsWith('.ts'))
  .sort((a, b) => a.localeCompare(b));

for (let i = 0; i < propFiles.length; i++) {
  const file = propFiles[i];
  const entry = join(PROPS, file);
  const globalName = `__prop_gallery_${i}`;
  try {
    const result = await build({
      entryPoints: [entry], bundle: true, write: false, format: 'iife', globalName,
      platform: 'browser', target: 'es2022', logLevel: 'silent',
    });
    modules.push({ globalName, code: result.outputFiles[0].text, file });
  } catch (error) {
    const details = error?.errors?.map(item => item.text).join('; ') || error?.message || String(error);
    console.error(`[prop-gallery] bundle failed for ${file}: ${details}`);
  }
}

let hedgyModule;
if (includeHedgy && !kitMode) {
  try {
    const result = await build({
      entryPoints: [ACTOR], bundle: true, write: false, format: 'iife', globalName: '__hedgy_gallery',
      platform: 'browser', target: 'es2022', logLevel: 'silent',
    });
    hedgyModule = { globalName: '__hedgy_gallery', code: result.outputFiles[0].text };
  } catch (error) {
    const details = error?.errors?.map(item => item.text).join('; ') || error?.message || String(error);
    console.error(`[prop-gallery] bundle failed for actor/hedgy.ts: ${details}`);
  }
}

let kitModule;
if (kitMode) {
  try {
    const result = await build({
      entryPoints: [KIT], bundle: true, write: false, format: 'iife', globalName: '__kit_gallery',
      platform: 'browser', target: 'es2022', logLevel: 'silent',
    });
    kitModule = { globalName: '__kit_gallery', code: result.outputFiles[0].text };
  } catch (error) {
    const details = error?.errors?.map(item => item.text).join('; ') || error?.message || String(error);
    console.error(`[prop-gallery] kit bundle failed: ${details}`);
    process.exitCode = 1;
  }
}

const browser = await chromium.launch({ headless: true, executablePath: CHROME });
try {
  const page = await browser.newPage();
  page.on('pageerror', error => console.error(`[prop-gallery] browser error: ${error.message}`));
  await page.setContent('<!doctype html><meta charset="utf-8"><title>Prop gallery</title>');

  if (kitMode) {
    if (kitModule) {
      await page.addScriptTag({ content: kitModule.code });
      const kitTimes = customTimes ? times : [0.12, 0.28, 0.44, 0.6, 0.78, 1];
      const renderKit = async ({ atTimes, strip }) => page.evaluate(({ atTimes, strip }) => {
        const kit = window.__kit_gallery;
        const rows = ['SIGN', 'TAG', 'STAMP', 'BUBBLE', 'WORDS', 'ARROW', 'CANDLES', 'LOOP', 'BAR', 'FX'];
        const animated = ['ARROW', 'CANDLES', 'LOOP', 'FX'];
        const cellW = strip ? 220 : 420;
        const cellH = strip ? 208 : 240;
        const cols = strip ? 12 : atTimes.length;
        const list = strip ? animated : rows;
        const width = cols * cellW + 40;
        const height = list.length * cellH + 52;
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Could not create kit sheet canvas');
        ctx.fillStyle = '#151518'; ctx.fillRect(0, 0, width, height);
        const drawItem = (name, cx, cy, time, col = 0) => {
          const progress = Math.max(0, Math.min(1, time));
          if (name === 'SIGN') kit.label(ctx, 'BORROWED', cx, cy, { variant: 'sign' });
          else if (name === 'TAG') kit.label(ctx, 'SOLD OUT', cx, cy, { variant: 'tag' });
          else if (name === 'STAMP') kit.label(ctx, 'SHORT SQUEEZE', cx, cy, { variant: 'stamp', maxWidth: cellW - 16 });
          else if (name === 'BUBBLE') kit.label(ctx, 'BUY +12%', cx, cy, { variant: 'bubble' });
          else if (name === 'WORDS') {
            const words = ['LENDER', 'BROKER', 'IOU', 'BUY', '$100', '+12%'];
            const variants = ['sign', 'tag', 'stamp', 'bubble', 'sign', 'tag'];
            kit.label(ctx, words[col % words.length], cx, cy, { variant: variants[col % variants.length], maxWidth: cellW - 20 });
          }
          else if (name === 'ARROW') kit.arrow(ctx, { x: cx - 145, y: cy + 34 }, { x: cx + 142, y: cy - 38 }, { progress, curve: -18 });
          else if (name === 'CANDLES') kit.candles(ctx, cx - 155, cy - 68, 310, 184, {
            closes: 'up', count: 7, progress, t: time, seed: 17, axes: true, dollar: true,
          });
          else if (name === 'LOOP') kit.loopArrow(ctx, cx, cy, 64, { progress, spin: time * 0.14 });
          else if (name === 'BAR') kit.bar(ctx, cx - 138, cy - 18, 276, 48, { progress, color: '#FF3B30', background: '#5A5D6B' });
          else if (name === 'FX') {
            kit.ring(ctx, cx, cy, 0, time, { r: 66, duration: 0.82 });
            kit.sparks(ctx, cx, cy, 0, time, { seed: 19, count: 6, duration: 0.72 });
            kit.poof(ctx, cx - 92, cy + 18, 0, time, { seed: 11, duration: 0.82 });
            kit.speedLines(ctx, cx + 95, cy + 22, { x: 1, y: -0.2 }, time, { t0: 0, seed: 23, duration: 0.72 });
          }
        };
        if (strip) {
          for (let row = 0; row < list.length; row++) {
            const y = 26 + row * cellH;
            ctx.fillStyle = '#85858E'; ctx.font = '600 15px Arial, sans-serif'; ctx.textBaseline = 'middle';
            ctx.fillText(list[row], 12, y + 12);
            for (let col = 0; col < cols; col++) {
              const x = 20 + col * cellW;
              ctx.fillStyle = '#0B0B0D'; ctx.fillRect(x, y + 26, cellW - 4, cellH - 30);
              ctx.save(); ctx.beginPath(); ctx.rect(x, y + 26, cellW - 4, cellH - 30); ctx.clip();
              drawItem(list[row], x + (cellW - 4) / 2, y + 126, atTimes[col], col);
              ctx.restore();
            }
          }
        } else {
          for (let row = 0; row < list.length; row++) {
            const y = 26 + row * cellH;
            ctx.fillStyle = '#85858E'; ctx.font = '600 16px Arial, sans-serif'; ctx.textBaseline = 'middle';
            ctx.fillText(list[row], 8, y + 12);
            for (let col = 0; col < cols; col++) {
              const x = 20 + col * cellW;
              ctx.fillStyle = '#0B0B0D'; ctx.fillRect(x, y + 26, cellW - 4, cellH - 30);
              ctx.save(); ctx.beginPath(); ctx.rect(x, y + 26, cellW - 4, cellH - 30); ctx.clip();
              drawItem(list[row], x + (cellW - 4) / 2, y + 126, atTimes[col], col);
              ctx.restore();
              ctx.fillStyle = '#8A8A92'; ctx.font = '13px Arial, sans-serif';
              ctx.fillText(`${atTimes[col].toFixed(2)}s`, x + 8, y + cellH - 12);
            }
          }
        }
        return canvas.toDataURL('image/png').split(',')[1];
      }, { atTimes, strip });
      const output = resolve(outPath);
      await mkdir(dirname(output), { recursive: true });
      await writeFile(output, Buffer.from(await renderKit({ atTimes: kitTimes, strip: false }), 'base64'));
      console.log(`Wrote ${output} (pixel kit sheet)`);
      if (kitStrip) {
        const base = kitTimes[0] ?? 0;
        const stripTimes = Array.from({ length: 12 }, (_, index) => base + index / 30);
        const stripPath = resolve(dirname(output), `${basename(output, extname(output))}-strip.png`);
        await writeFile(stripPath, Buffer.from(await renderKit({ atTimes: stripTimes, strip: true }), 'base64'));
        console.log(`Wrote ${stripPath} (12 consecutive frames across ${animatedKitNames()})`);
      }
    }
  } else {

  const usable = [];
  for (const module of modules) {
    try {
      await page.addScriptTag({ content: module.code });
      const items = await page.evaluate(name => {
        const list = window[name]?.GALLERY;
        if (!Array.isArray(list)) return [];
        return list.map((item, index) => ({
          index,
          name: String(item?.name ?? `item ${index + 1}`),
          w: Number.isFinite(item?.w) && item.w > 0 ? item.w : 420,
          h: Number.isFinite(item?.h) && item.h > 0 ? item.h : 420,
        }));
      }, module.globalName);
      for (const item of items) usable.push({ ...item, globalName: module.globalName, file: module.file });
    } catch (error) {
      console.error(`[prop-gallery] load failed for ${module.file}: ${error?.message ?? error}`);
    }
  }

  if (hedgyModule) {
    try {
      await page.addScriptTag({ content: hedgyModule.code });
      const poses = ['idle', 'walk', 'run', 'jump', 'shock', 'celebrate', 'point', 'think', 'push', 'carry', 'fall', 'curl', 'roll', 'peek', 'sweat', 'sleep', 'wave-off'];
      for (const pose of poses) {
        usable.push({ name: `Hedgy · ${pose}`, pose, w: 310, h: 350, globalName: hedgyModule.globalName, file: 'actor/hedgy.ts' });
      }
    } catch (error) {
      console.error(`[prop-gallery] load failed for actor/hedgy.ts: ${error?.message ?? error}`);
    }
  }

  const selected = filter
    ? usable.filter(item => item.name.toLowerCase().includes(filter) || basename(item.file, '.ts').toLowerCase().includes(filter) || item.file.toLowerCase().includes(filter))
    : usable;
  if (!selected.length) {
    console.warn(`[prop-gallery] no GALLERY entries${filter ? ` matching “${filter}”` : ''}; rendering an empty stage.`);
  }

  const image = await page.evaluate(async ({ items, atTimes, cellW, cellH, rowTitle, labelH }) => {
    const columns = Math.max(1, items.length);
    const width = columns * cellW;
    const rowHeight = rowTitle + cellH + labelH;
    const height = atTimes.length * rowHeight;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not create gallery canvas');
    ctx.fillStyle = '#0B0B0D';
    ctx.fillRect(0, 0, width, height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let row = 0; row < atTimes.length; row++) {
      const t = atTimes[row];
      const top = row * rowHeight;
      ctx.fillStyle = '#86868F';
      ctx.font = '600 16px Arial, sans-serif';
      ctx.fillText(`t = ${t}s`, 36, top + rowTitle / 2);
      for (let col = 0; col < items.length; col++) {
        const item = items[col];
        const cx = col * cellW + cellW / 2;
        const cy = top + rowTitle + cellH / 2;
        ctx.save();
        ctx.beginPath();
        ctx.rect(col * cellW, top + rowTitle, cellW, cellH);
        ctx.clip();
        ctx.translate(cx, cy);
        const scale = Math.min(1, (cellW - 40) / item.w, (cellH - 60) / item.h);
        ctx.scale(scale, scale);
        if (item.pose) {
          const drawHedgy = window[item.globalName]?.drawHedgy;
          if (typeof drawHedgy === 'function') drawHedgy(ctx, { x: 0, y: 150, scale: 5.8, t, pose: item.pose, facing: 1, expression: 'neutral' });
        } else {
          const draw = window[item.globalName]?.GALLERY?.[item.index]?.draw;
          if (typeof draw === 'function') draw(ctx, 0, 0, t);
        }
        ctx.restore();
        ctx.fillStyle = '#898991';
        ctx.font = '500 17px Arial, sans-serif';
        const label = item.name.length > 38 ? `${item.name.slice(0, 35)}…` : item.name;
        ctx.fillText(label, cx, top + rowTitle + cellH + labelH / 2, cellW - 20);
      }
    }
    return canvas.toDataURL('image/png').split(',')[1];
  }, { items: selected, atTimes: times, cellW: CELL_W, cellH: CELL_H, rowTitle: ROW_TITLE, labelH: LABEL_H });

  const output = resolve(outPath);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, Buffer.from(image, 'base64'));
  console.log(`Wrote ${output} (${selected.length} entries × ${times.length} time${times.length === 1 ? '' : 's'})`);
  }
} finally {
  await browser.close();
}

function animatedKitNames() { return 'arrow, candlesticks, loop arrow, and FX'; }
