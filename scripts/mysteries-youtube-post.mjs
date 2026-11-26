// Publish a finished Mysteries of the Sky episode to its YouTube channel through Postiz.
//   POSTIZ_API_KEY=... node scripts/mysteries-youtube-post.mjs <episode-doc-dir> <video.mp4> [thumbnail.png]
// The description is built from the episode's narration (opening) and source ledger.
// A receipt is written next to the video; an existing receipt prevents a second post.
import { existsSync, openAsBlob } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

const [docDir, video, thumbnail] = process.argv.slice(2);
const key = process.env.POSTIZ_API_KEY?.trim();
if (!docDir || !video) throw new Error('Usage: mysteries-youtube-post.mjs <episode-doc-dir> <video.mp4> [thumbnail]');
if (!key) throw new Error('Set POSTIZ_API_KEY');
const api = 'https://api.postiz.com/public/v1';
const receipt = video.replace(/\.mp4$/, '') + '.youtube.json';
if (existsSync(receipt)) {
  console.log('Already posted: ' + (await readFile(receipt, 'utf8')));
  process.exit(0);
}

async function call(path, init = {}) {
  const r = await fetch(api + path, { ...init, headers: { ...init.headers, Authorization: key }, signal: AbortSignal.timeout(600000) });
  const text = await r.text();
  if (!r.ok) throw new Error(`Postiz ${path} failed (${r.status}): ${text.slice(0, 300)}`);
  return JSON.parse(text);
}
async function upload(file, type) {
  const form = new FormData();
  form.append('file', await openAsBlob(file, { type }), basename(file).replace(/[^a-zA-Z0-9._-]/g, '_'));
  const media = await call('/upload', { method: 'POST', body: form });
  if (!media.id || !media.path) throw new Error('Upload not confirmed for ' + basename(file));
  return { id: media.id, path: media.path };
}

const narration = await readFile(join(docDir, 'narration.md'), 'utf8');
const sources = await readFile(join(docDir, 'sources.md'), 'utf8').catch(() => '');
const title = narration.split('\n')[0].replace(/^#\s*/, '').trim();
// The hook: the first chapter's opening sentences.
const firstChapter = narration.split(/\n## /)[1]?.split('\n').slice(1).join(' ').replace(/\*\*/g, '').trim() ?? '';
const hook = firstChapter.split(/(?<=[.?!])\s+/).slice(0, 3).join(' ');
const links = [];
for (const [, label, url] of sources.matchAll(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g))
  if (!links.some((l) => l.url === url)) links.push({ label: label.replace(/\s+/g, ' ').trim(), url });
const description = [
  hook,
  '',
  'Narrated by Titan, with Professor Rowan Ellery, a fictional AI presenter. Diagrams are schematic illustrations of the measurements described.',
  '',
  links.length ? 'Sources' : '',
  ...links.slice(0, 20).map((l) => `${l.label} — ${l.url}`),
  '',
  'Mysteries of the Sky',
]
  .join('\n')
  .slice(0, 4900);

const channels = await call('/integrations');
const target = channels.find((c) => c.identifier === 'youtube' && !c.disabled && /mysteryofthesky|mysteriesinsky/i.test(`${c.name}${c.profile}`));
if (!target) throw new Error('No connected Mysteries of the Sky YouTube channel in Postiz');

console.log('Uploading ' + basename(video));
const media = await upload(video, 'video/mp4');
const thumb = thumbnail ? await upload(thumbnail, thumbnail.endsWith('.png') ? 'image/png' : 'image/jpeg') : undefined;
const created = new Date().toISOString();
const result = await call('/posts', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    type: 'now',
    date: created,
    shortLink: false,
    tags: [],
    posts: [
      {
        integration: { id: target.id },
        value: [{ content: description, image: [media] }],
        settings: {
          __type: 'youtube',
          title: title.slice(0, 100),
          type: 'public',
          selfDeclaredMadeForKids: 'no',
          made_with_ai: true,
          ...(thumb ? { thumbnail: thumb } : {}),
        },
      },
    ],
  }),
});
const postId = Array.isArray(result) ? result.find((x) => x.integration === target.id)?.postId : undefined;
if (!postId) throw new Error('Postiz did not confirm a post ID: ' + JSON.stringify(result).slice(0, 300));
const state = { title, postId, channel: target.profile, created, video: basename(video) };
await writeFile(receipt, JSON.stringify(state, null, 2));

// Follow the post until YouTube reports it published (or an error).
for (let i = 0; i < 80; i++) {
  await new Promise((r) => setTimeout(r, 15000));
  const start = new Date(Date.parse(created) - 86400000).toISOString(),
    end = new Date(Date.now() + 86400000).toISOString();
  const list = await call(`/posts?${new URLSearchParams({ startDate: start, endDate: end })}`);
  const post = list.posts?.find((p) => p.id === postId);
  if (post?.state === 'ERROR' || post?.error) {
    Object.assign(state, { state: 'error', error: post.error ?? 'error' });
    break;
  }
  if (post?.releaseURL) {
    Object.assign(state, { state: 'published', url: post.releaseURL });
    break;
  }
}
await writeFile(receipt, JSON.stringify(state, null, 2));
console.log(JSON.stringify(state));
if (state.state === 'error') process.exitCode = 1;
