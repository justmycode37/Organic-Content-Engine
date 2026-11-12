import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { openMotionPage, loadRequirements } from '../motion.mjs';
import { resolveSceneEvents } from '../../src/motion/player.ts';

const specPath = resolve('motion-examples/system.json');
const directory = resolve('../output/v2/system');
const spec = JSON.parse(await readFile(specPath, 'utf8'));
const before = JSON.parse(execFileSync('git', ['show', '0376834:chatgpt-site/motion-examples/system.json'], { encoding: 'utf8' }));
const duration = spec.scenes.reduce((sum, scene) => sum + scene.duration, 0);
const times = Array.from({ length: Math.ceil(duration * 2) }, (_, index) => index / 2);
const { browser, page } = await openMotionPage();
await mkdir(directory, { recursive: true });
try {
  await loadRequirements(page, spec, specPath);
  const samples = await page.evaluate(({ spec, times }) => {
    const original = CanvasRenderingContext2D.prototype.fillText;
    let drawn = [];
    CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
      drawn.push({ text, size: Number(this.font.match(/([\d.]+)px/)?.[1] ?? 0) });
      return original.call(this, text, ...args);
    };
    try {
      return times.map(time => {
        drawn = [];
        const png = window.motion.shot(spec, time, .25);
        return { time, png, words: drawn.flatMap(item => item.text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? []).length, minimumFont: Math.min(...drawn.map(item => item.size)) };
      });
    } finally { CanvasRenderingContext2D.prototype.fillText = original; }
  }, { spec, times });
  for (let start = 0; start < samples.length; start += 24) {
    const batch = samples.slice(start, start + 24);
    const png = await page.evaluate(async samples => {
      const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = Math.ceil(samples.length / 4) * 512;
      const context = canvas.getContext('2d'); context.fillStyle = '#202124'; context.fillRect(0, 0, canvas.width, canvas.height);
      for (const [index, sample] of samples.entries()) {
        const image = new Image(); image.src = `data:image/png;base64,${sample.png}`; await image.decode();
        const left = index % 4 * 270; const top = Math.floor(index / 4) * 512;
        context.drawImage(image, left, top); context.fillStyle = '#ffffff'; context.font = '18px sans-serif';
        context.fillText(`${sample.time.toFixed(1)}s`, left + 8, top + 500);
      }
      return canvas.toDataURL('image/png').split(',')[1];
    }, batch);
    await writeFile(join(directory, `system-half-second-${start / 24 + 1}.png`), Buffer.from(png, 'base64'));
  }
  let cursor = 0;
  const events = spec.scenes.flatMap(scene => { const resolved = resolveSceneEvents(scene).map(event => ({ ...event, at: cursor + event.at })); cursor += scene.duration; return resolved; });
  const starts = spec.scenes.reduce((result, scene) => [...result, (result.at(-1) ?? 0) + scene.duration], [0]).slice(0, -1);
  const points = [...starts, ...events.map(event => event.at), duration].sort((left, right) => left - right);
  const metrics = {
    duration, narrationWords: spec.scenes.reduce((sum, scene) => sum + scene.say.split(/\s+/).length, 0),
    samples: samples.map(({ png, ...sample }) => sample),
    minimumWords: Math.min(...samples.map(sample => sample.words)), maximumWords: Math.max(...samples.map(sample => sample.words)),
    minimumFont: Math.min(...samples.map(sample => sample.minimumFont)),
    declaredEvents: events.length, declaredEventsPerTenSeconds: events.length * 10 / duration,
    eventsIncludingEntrancesPerTenSeconds: (events.length + starts.length) * 10 / duration,
    maximumEventGap: Math.max(...points.slice(1).map((point, index) => point - points[index])),
    before: { duration: before.scenes.reduce((sum, scene) => sum + scene.duration, 0), declaredEvents: before.scenes.reduce((sum, scene) => sum + (scene.events?.length ?? 0), 0), auditedWordRange: [32, 59], note: 'Word range from supplied audit; not a newly rendered baseline. Old implicit visual state changes were not counted.' },
  };
  await writeFile(join(directory, 'system-review.json'), JSON.stringify(metrics, null, 2) + '\n');
  console.log(JSON.stringify({ ...metrics, samples: `${samples.length} half-second frames` }, null, 2));
} finally { await browser.close(); }
