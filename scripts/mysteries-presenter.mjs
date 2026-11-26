// Prepare a HeyGen reference-to-video request. Generation is a separate monid run.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';

const profile = JSON.parse(
  readFileSync(new URL('../docs/mysteries-of-the-sky/presenter/profile.json', import.meta.url), 'utf8'),
);
function reference(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error('HeyGen needs an HTTPS reference URL');
  return { type: 'url', url: url.href };
}
export function interviewPlan(line) {
  return {
    provider: 'heygen',
    endpoint: '/v1/video/heygen-avatar-6-i2v',
    speech: {
      provider: 'elevenlabs',
      endpoint: '/text-to-speech',
      body: { ...profile.elevenLabsVoice, text: line.trim() },
    },
    audioUrlFrom: 'speech.output.audio.download_link',
    body: {
      model: 'heygen-avatar-6-turbo',
      resolution: '1080p',
      reference_images: [reference(profile.portraitUrl)],
      motion_prompt:
        'A physicist explaining a measurement to a colleague over a webcam. Locked framing. Bring a hand visibly into frame at chest height to illustrate the physical idea. Let it settle between points.',
      motion_expressiveness: 'default',
    },
  };
}
export function presenterRequest(line, duration, uploadedMaster) {
  return {
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
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [line, seconds, output, uploadedMaster] = process.argv.slice(2);
  const duration = Number(seconds);
  if (!line?.trim() || !output || !Number.isInteger(duration) || duration < 5 || duration > 15) {
    throw new Error(
      'Usage: node scripts/mysteries-presenter.mjs "spoken line" <5–15 seconds> <new-request.json> [HTTPS master-video URL]',
    );
  }
  const body = presenterRequest(line, duration, uploadedMaster);
  writeFileSync(output, JSON.stringify(body, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
}
