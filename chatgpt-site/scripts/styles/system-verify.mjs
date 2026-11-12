import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseReelSpec, lintReel } from '../../src/motion/spec.ts';
import { reelDuration } from '../../src/motion/core.ts';
import { systemStyle } from '../../src/motion/styles/system/index.ts';
import { openMotionPage, loadRequirements } from '../motion.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const output = `${root}output/styles/system`;
await mkdir(output, { recursive: true });
const example = JSON.parse(await readFile(`${root}chatgpt-site/motion-examples/system.json`, 'utf8'));
const reference = { ...JSON.parse(await readFile(`${root}output/video/patch-notes-948-linux-root-bugs.json`, 'utf8')), style: 'system' };
const parsed = parseReelSpec(example);
assert.equal(parsed.ok, true, JSON.stringify(parsed));
assert.deepEqual(lintReel(example), []);
assert.ok(reelDuration(example) >= 30 && reelDuration(example) <= 45);
await writeFile(`${output}/reference-system.json`, JSON.stringify(reference, null, 2));
const extra = [
  { type: 'title', text: 'A *precise* interface', sub: 'No retro pixel typography.', kicker: 'SYSTEM QA' },
  { type: 'code', filename: 'inspection.ts', code: 'const status = "online";\nvalidate(report);\nreview(patch);', highlight: [2], note: 'Illustrative code' },
  { type: 'diff', filename: 'revision.ts', removed: ['unsafe(input)'], added: ['validate(input)'] },
  { type: 'chat', model: 'Review bus', messages: [{ role: 'user', text: 'Has this patch been reviewed?' }, { role: 'ai', text: 'Human review is required before disclosure.' }] },
  { type: 'tokens', text: 'The next system update', predict: [{ token: 'arrives', p: .64 }, { token: 'waits', p: .36 }] },
  { type: 'layers', title: 'Validation stack', layers: [{ label: 'Agent output' }, { label: 'VM validation' }, { label: 'Human review' }] },
  { type: 'grid', title: 'Illustrative matrix', rows: 6, cols: 8, highlight: [[2, 4]] },
  { type: 'special', kind: 'dashboard', data: { title: 'Other metric modes', metrics: [{ label: 'EXAMPLE GAUGE', value: 75, max: 100, kind: 'gauge' }, { label: 'SUPPLIED SERIES', value: 8, kind: 'sparkline', series: [1, 3, 2, 5, 6, 8] }], note: 'ILLUSTRATIVE TEST DATA / NOT RESEARCH EVIDENCE' } },
];
const coverage = { version: 1, style: 'system', scenes: extra.map(scene => ({ duration: 2, caption: 'A *readable* system interface.', ...scene })) };
assert.equal(parseReelSpec(coverage).ok, true);
await writeFile(`${output}/coverage-system.json`, JSON.stringify(coverage, null, 2));
const { browser, page } = await openMotionPage();
const checks = [];
try {
  for (const [name, spec] of [['example', example], ['reference', reference], ['coverage', coverage]]) {
    await loadRequirements(page, spec);
    let start = 0;
    for (const scene of spec.scenes) {
      for (const offset of [0, .1, .3, scene.duration * .6, scene.duration - 1 / 30]) {
        const time = start + offset;
        const result = await page.evaluate(([input, seconds]) => {
          const original = CanvasRenderingContext2D.prototype.fillText;
          const overflow = [];
          CanvasRenderingContext2D.prototype.fillText = function (text, x, y, ...rest) {
            const width = this.measureText(text).width;
            const transform = this.getTransform();
            if (x >= 96 && y >= 240 && y <= 1560 && (x + width > 984.5 || x < 95.5)) overflow.push({ text, x, y, width, transform: transform.a });
            return original.call(this, text, x, y, ...rest);
          };
          try { window.motion.shot(input, seconds); } finally { CanvasRenderingContext2D.prototype.fillText = original; }
          return overflow;
        }, [spec, time]);
        assert.deepEqual(result, [], `${name} text overflow at ${time}`);
        checks.push({ name, time, status: 'passed' });
      }
      start += scene.duration;
    }
  }
} finally { await browser.close(); }
await writeFile(`${output}/verification.json`, JSON.stringify({ exampleLint: lintReel(example), exampleDuration: reelDuration(example), sharedSkins: Object.keys(systemStyle.scenes), checks }, null, 2));
console.log(`PASS: zero example lint, ${checks.length} browser frame checks, ${Object.keys(systemStyle.scenes).length} shared skins, ${reelDuration(example)}s`);
