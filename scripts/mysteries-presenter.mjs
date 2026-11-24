// Prepare a HeyGen reference-to-video request. Generation is a separate monid run.
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
function reference(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error('HeyGen needs an HTTPS reference URL');
  return { type: 'url', url: url.href };
}
const body = {
  prompt:
    (uploadedMaster
      ? 'Match the speaker and voice in <Video 1>. '
      : 'Match the professor in <Picture 1> and the speaking voice in <Audio 1>. ') +
    profile.referenceDirection +
    ' Speak exactly this new line: ' +
    JSON.stringify(line.trim()),
  resolution: '480p',
  duration,
  aspect_ratio: '16:9',
  seed: profile.seed,
  prompt_enhancement: 'disabled',
  ...(uploadedMaster
    ? { reference_videos: [reference(uploadedMaster)] }
    : {
        reference_images: [reference(profile.portraitUrl)],
        reference_audio: [reference(profile.voiceReferenceUrl)],
      }),
};
writeFileSync(output, JSON.stringify(body, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
