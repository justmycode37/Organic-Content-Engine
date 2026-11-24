// Prepare a HeyGen reference-to-video request. Generation is a separate monid run.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const profile = JSON.parse(
  readFileSync(new URL('../docs/mysteries-of-the-sky/presenter/profile.json', import.meta.url), 'utf8'),
);
const [line, seconds, output, uploadedMaster] = process.argv.slice(2);
const duration = Number(seconds);
if (!line?.trim() || !output || !Number.isInteger(duration) || duration < 5 || duration > 15) {
  throw new Error(
    'Usage: node scripts/mysteries-presenter.mjs "spoken line" <5–15 seconds> <new-request.json> [HTTPS master-video URL]',
  );
}
function masterUrl() {
  if (uploadedMaster) return uploadedMaster;
  const result = JSON.parse(
    execFileSync('monid', ['runs', 'get', '-r', profile.monidMasterRunId, '-j'], { encoding: 'utf8' }),
  );
  if (!result.output?.video_url)
    throw new Error('Monid has no master URL. Supply an HTTPS URL for the saved master video.');
  return result.output.video_url;
}
const url = new URL(masterUrl());
if (url.protocol !== 'https:') throw new Error('HeyGen needs an HTTPS reference URL');
const body = {
  prompt: profile.referenceDirection + ' Speak exactly this new line: ' + JSON.stringify(line.trim()),
  resolution: '1080p',
  duration,
  aspect_ratio: '16:9',
  seed: profile.seed,
  prompt_enhancement: 'disabled',
  reference_videos: [{ type: 'url', url: url.href }],
};
writeFileSync(output, JSON.stringify(body, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
