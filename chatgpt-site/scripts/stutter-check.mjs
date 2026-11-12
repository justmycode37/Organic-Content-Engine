#!/usr/bin/env node
// Objective frame cadence and visual smoothness report for rendered reels.
// Usage: node scripts/stutter-check.mjs <mp4> [outDir]; outDir stores every per-frame metric as JSON.
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const input = process.argv[2];
const outDir = process.argv[3];
if (!input) throw new Error('Usage: node scripts/stutter-check.mjs <mp4> [outDir]');

function fraction(value) {
  const [a, b] = String(value ?? '').split('/').map(Number);
  return b ? a / b : a || 0;
}

function runProbe(path) {
  const result = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=codec_name,width,height,r_frame_rate,avg_frame_rate,duration,nb_frames,nb_read_frames', '-of', 'json', path], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || `ffprobe exited ${result.status}`);
  const stream = JSON.parse(result.stdout).streams?.[0];
  if (!stream) throw new Error('No video stream found');
  return stream;
}

async function decodeLuma(path) {
  const width = 54, height = 96, frameBytes = width * height;
  const child = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', path, '-vf', `scale=${width}:${height}:flags=area,format=gray`, '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'gray', 'pipe:1'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.setEncoding('utf8'); child.stderr.on('data', chunk => { stderr += chunk; });
  const frames = [];
  let pending = Buffer.alloc(0);
  for await (const chunk of child.stdout) {
    pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
    while (pending.length >= frameBytes) {
      frames.push(Uint8Array.from(pending.subarray(0, frameBytes)));
      pending = pending.subarray(frameBytes);
    }
  }
  const status = await new Promise((resolveExit, reject) => {
    child.once('error', reject);
    child.once('close', resolveExit);
  });
  if (status !== 0) throw new Error(stderr || `ffmpeg exited ${status}`);
  if (pending.length) throw new Error(`Incomplete decoded frame (${pending.length}/${frameBytes} bytes)`);
  return { frames, width, height };
}

const { frames, width, height } = await decodeLuma(input);
if (!frames.length) throw new Error('No frames decoded');
const stream = runProbe(input);
const fps = fraction(stream.avg_frame_rate) || fraction(stream.r_frame_rate);
const nominalFps = fraction(stream.r_frame_rate);
const duration = Number(stream.duration) || frames.length / fps;
const expectedFrames = Math.round(duration * fps);
const stageRows = Math.floor(height * 1290 / 1920);
const wholeSize = width * height;

function metrics(frame) {
  let luma = 0, highFrequency = 0;
  for (let y = 1; y < stageRows - 1; y++) for (let x = 1; x < width - 1; x++) {
    const i = y * width + x, value = frame[i];
    luma += value;
    highFrequency += Math.abs(2 * value - frame[i - 1] - frame[i + 1]) + Math.abs(2 * value - frame[i - width] - frame[i + width]);
  }
  const count = Math.max(1, (width - 2) * (stageRows - 2));
  return { luma: luma / count, highFrequency: highFrequency / (count * 2) };
}

function frameDifference(a, b, limit = wholeSize) {
  let absolute = 0, changed = 0, exact = true;
  for (let i = 0; i < limit; i++) {
    const delta = Math.abs(a[i] - b[i]);
    absolute += delta;
    if (delta > 2) changed++;
    if (delta !== 0) exact = false;
  }
  return { mean: absolute / limit, changed: changed / limit, exact };
}

function estimateMotion(previous, current) {
  let best = { dx: 0, dy: 0, score: Infinity };
  const xMin = 6, xMax = width - 6, yMin = 6, yMax = stageRows - 6;
  for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
    let sum = 0, samples = 0;
    for (let y = yMin; y < yMax; y++) for (let x = xMin; x < xMax; x++) {
      const i = y * width + x, j = (y - dy) * width + x - dx;
      if (Math.max(previous[i], current[j]) < 24) continue;
      // Edge-weighted matching makes a moving object count more than a flat field.
      const edgeA = Math.abs(previous[i - 1] - previous[i + 1]) + Math.abs(previous[i - width] - previous[i + width]);
      const edgeB = Math.abs(current[j - 1] - current[j + 1]) + Math.abs(current[j - width] - current[j + width]);
      const weight = 1 + Math.min(32, edgeA + edgeB) / 16;
      sum += Math.abs(previous[i] - current[j]) * weight;
      samples++;
    }
    const score = samples ? sum / samples : 0;
    if (score < best.score) best = { dx, dy, score };
  }
  // The luma proxy is 20 source px per sample.
  return { x: best.dx * 20, y: best.dy * 20, score: best.score };
}

const frameStats = frames.map(metrics);
const diffs = [undefined];
const motions = [undefined];
let exactDuplicates = 0, nearDuplicatePairs = 0, maxNearRun = 0, nearRun = 0, nearRunStart = 0;
const duplicateTimes = [], nearRunTimes = [];
const pairMeanDifferences = [], pairChangedFractions = [];
const nearFlags = new Array(frames.length).fill(false);
for (let i = 1; i < frames.length; i++) {
  const diff = frameDifference(frames[i - 1], frames[i]);
  diffs.push(diff);
  pairMeanDifferences.push(diff.mean); pairChangedFractions.push(diff.changed);
  if (diff.exact) { exactDuplicates++; duplicateTimes.push(i / fps); }
  const near = diff.mean <= 1.25 && diff.changed <= 0.05;
  nearFlags[i] = near;
  if (near) { nearDuplicatePairs++; if (nearRun === 0) nearRunStart = i - 1; nearRun++; }
  else {
    if (nearRun > maxNearRun) maxNearRun = nearRun;
    if (nearRun >= 12) nearRunTimes.push({ time: nearRunStart / fps, frames: nearRun });
    nearRun = 0;
  }
  motions.push(estimateMotion(frames[i - 1], frames[i]));
}
if (nearRun > maxNearRun) maxNearRun = nearRun;
if (nearRun >= 12) nearRunTimes.push({ time: nearRunStart / fps, frames: nearRun });

// A scene cut changes the image once and then settles. A one-frame flash changes
// the luma out and back, so it is not hidden by this cut mask.
const cutFrames = new Set();
for (let i = 1; i < diffs.length - 1; i++) {
  const here = diffs[i]?.mean ?? 0, next = diffs[i + 1]?.mean ?? 0;
  if (here >= 12 && next <= Math.min(4, here * 0.22)) cutFrames.add(i);
}

const speedViolations = [], jerkViolations = [], flashTimes = [], lumaJumpTimes = [], flickerTimes = [];
const jerkByFrame = new Array(frames.length).fill(null);
const speeds = [], jerks = [];
for (let i = 1; i < motions.length; i++) {
  const motion = motions[i];
  if (!motion) continue;
  const speed = Math.hypot(motion.x, motion.y);
  speeds.push(speed);
  if (speed > 60 && !cutFrames.has(i)) speedViolations.push({ time: i / fps, pxPerFrame: Math.round(speed * 10) / 10 });
  if (i >= 2 && !cutFrames.has(i) && !cutFrames.has(i - 1) && !cutFrames.has(i - 2)) {
    const previous = motions[i - 1], before = motions[i - 2];
    if (previous && before) {
      const jerk = Math.hypot(motion.x - 2 * previous.x + before.x, motion.y - 2 * previous.y + before.y);
      jerks.push(jerk);
      jerkByFrame[i] = jerk;
      if (jerk > 28) jerkViolations.push({ time: i / fps, pxPerFrame2: Math.round(jerk * 10) / 10 });
    }
  }
  if (i > 0 && i + 1 < frames.length) {
    const before = frameStats[i - 1].luma, now = frameStats[i].luma, after = frameStats[i + 1].luma;
    const into = Math.abs(now - before), out = Math.abs(after - now), rebound = Math.abs(after - before);
    if (into >= 18 && out >= 18 && rebound <= 6) flashTimes.push(i / fps);
    else if (into >= 18 && !cutFrames.has(i)) lumaJumpTimes.push({ time: i / fps, delta: Math.round(into * 10) / 10 });
    const hfDelta = Math.abs(frameStats[i].highFrequency - frameStats[i - 1].highFrequency);
    const hfLimit = Math.max(16, frameStats[i - 1].highFrequency * 0.5);
    if (hfDelta > hfLimit && !cutFrames.has(i)) flickerTimes.push({ time: i / fps, delta: Math.round(hfDelta * 10) / 10 });
  }
}

const sorted = values => [...values].sort((a, b) => a - b);
const percentile = (values, p) => sorted(values)[Math.min(values.length - 1, Math.floor(values.length * p))] ?? 0;
const cfr = Math.abs(fps - 30) < 0.01 && Math.abs(nominalFps - 30) < 0.01 && frames.length === expectedFrames;
const perFrame = frames.map((frame, index) => {
  const motion = motions[index], diff = diffs[index], stats = frameStats[index];
  return {
    frame: index,
    timeSeconds: index / fps,
    meanLuma: stats.luma,
    highFrequencyEnergy: stats.highFrequency,
    meanAbsoluteFrameDelta: diff?.mean ?? 0,
    exactDuplicateOfPrevious: diff?.exact ?? false,
    nearDuplicateOfPrevious: nearFlags[index],
    isCutCandidate: cutFrames.has(index),
    globalMotionPxPerFrame: motion ? { x: motion.x, y: motion.y, magnitude: Math.hypot(motion.x, motion.y) } : null,
    jerkPxPerFrame2: jerkByFrame[index],
  };
});
const violations = [];
if (!cfr) violations.push({ kind: 'cadence', detail: `decoded ${frames.length}/${expectedFrames} frames at ${fps.toFixed(3)} fps (nominal ${nominalFps.toFixed(3)})` });
for (const time of duplicateTimes) violations.push({ kind: 'exact-duplicate', time });
for (const item of nearRunTimes) violations.push({ kind: 'near-duplicate-run>=12', ...item });
for (const item of speedViolations) violations.push({ kind: 'motion-speed', ...item });
for (const item of jerkViolations) violations.push({ kind: 'motion-jerk', ...item });
for (const time of flashTimes) violations.push({ kind: 'flash', time });
for (const item of lumaJumpTimes) violations.push({ kind: 'luma-jump', ...item });
for (const item of flickerTimes) violations.push({ kind: 'high-frequency-flicker', ...item });

const report = {
  file: resolve(input),
  dimensions: `${stream.width}x${stream.height}`,
  frames: frames.length,
  durationSeconds: duration,
  fps: { average: fps, nominal: nominalFps, cfr },
  thresholds: { maxSpeedPxPerFrame: 60, maxJerkPxPerFrame2: 28, flashLumaJump: 18, lumaJump: 18, highFrequencyJumpFloor: 16, highFrequencyJumpRelative: 0.5, nearDuplicateRunFrames: 12 },
  duplicates: { exactAdjacent: exactDuplicates, nearDuplicatePairs, maxNearDuplicateRunFrames: maxNearRun, nearRunThresholdFrames: 12, nearPairThreshold: { meanLumaDeltaMax: 1.25, changedPixelFractionMax: 0.05 }, meanFrameDeltaP50: percentile(pairMeanDifferences, 0.5), meanFrameDeltaP95: percentile(pairMeanDifferences, 0.95), changedFractionP50: percentile(pairChangedFractions, 0.5) },
  motion: { estimateScalePxPerSample: 20, medianPxPerFrame: percentile(speeds, 0.5), p95PxPerFrame: percentile(speeds, 0.95), maxPxPerFrame: Math.max(0, ...speeds), speedViolations: speedViolations.length, maxJerkPxPerFrame2: Math.max(0, ...jerks), jerkViolations: jerkViolations.length },
  flicker: { flashCount: flashTimes.length, lumaJumpCount: lumaJumpTimes.length, highFrequencyJumpCount: flickerTimes.length, maxLumaStep: Math.max(0, ...frameStats.slice(1).map((item, i) => Math.abs(item.luma - frameStats[i].luma))), maxHighFrequencyStep: Math.max(0, ...frameStats.slice(1).map((item, i) => Math.abs(item.highFrequency - frameStats[i].highFrequency))) },
  violations,
  perFrame,
};

console.log(`${violations.length ? 'FAIL' : 'PASS'} stutter check — ${report.dimensions}, ${frames.length} frames / ${fps.toFixed(3)} fps / ${duration.toFixed(2)} s`);
console.log(`duplicates: ${exactDuplicates} exact, ${nearDuplicatePairs} near; longest near run ${maxNearRun} frames`);
console.log(`motion: median ${report.motion.medianPxPerFrame.toFixed(1)}, p95 ${report.motion.p95PxPerFrame.toFixed(1)}, max ${report.motion.maxPxPerFrame.toFixed(1)} px/frame; jerk violations ${jerkViolations.length}`);
console.log(`flicker: ${flashTimes.length} flashes, ${lumaJumpTimes.length} luma jumps, ${flickerTimes.length} high-frequency jumps`);
if (violations.length) {
  console.log('violations:');
  for (const item of violations.slice(0, 80)) console.log(`  ${item.kind}${item.time === undefined ? '' : ` @ ${item.time.toFixed(3)}s`}${item.pxPerFrame === undefined ? '' : ` (${item.pxPerFrame} px/frame)`}${item.pxPerFrame2 === undefined ? '' : ` (${item.pxPerFrame2} px/frame²)`}${item.delta === undefined ? '' : ` (Δ ${item.delta})`}`);
  if (violations.length > 80) console.log(`  … ${violations.length - 80} more`);
}

if (outDir) {
  const directory = resolve(outDir);
  await mkdir(directory, { recursive: true });
  const reportPath = resolve(directory, `${basename(input).replace(/\.[^.]+$/, '')}-stutter-report.json`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`report: ${reportPath}`);
}

if (violations.length) process.exitCode = 1;
