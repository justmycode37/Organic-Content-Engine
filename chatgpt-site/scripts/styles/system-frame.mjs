// Writes single full-size SYSTEM example frames for review: node scripts/styles/system-frame.mjs <seconds>... 
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { openMotionPage, loadRequirements } from '../motion.mjs';

const specPath = resolve('motion-examples/system.json');
const directory = resolve('../output/v2/system/frames');
const spec = JSON.parse(await readFile(specPath, 'utf8'));
const { browser, page } = await openMotionPage();
await mkdir(directory, { recursive: true });
try {
  await loadRequirements(page, spec, specPath);
  for (const time of process.argv.slice(2).map(Number)) {
    const png = await page.evaluate(({ spec, time }) => window.motion.shot(spec, time, 1), { spec, time });
    const file = join(directory, `system-${time.toFixed(2)}s.png`);
    await writeFile(file, Buffer.from(png, 'base64'));
    console.log(file);
  }
} finally { await browser.close(); }
