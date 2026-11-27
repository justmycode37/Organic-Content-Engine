// Submit a finished Hedgy evaluation round through the account worker's Postiz integration.
import {readFile, rename, writeFile} from 'node:fs/promises';
import {createHash, randomUUID} from 'node:crypto';
import {basename, join, resolve} from 'node:path';
import {HEDGY_SERIES_IDS} from '../worker/hedgy-policy.ts';
import {hedgyPostCaptionSchema} from '../worker/hedgy-caption.ts';
import {siteRequest, workerConfig} from './render-worker.mjs';

const [roundArg, integrationId, roundFlag] = process.argv.slice(2);
if (!roundArg || !integrationId) throw new Error('Usage: hedgy-round-publish.mjs <roundDir|--check> <instagramIntegrationId> [--round=N]');
// Backfilled reels from un-numbered or pre-r12 folders publish under an explicit round number (e.g. 9000+).
const roundOverride = roundFlag === undefined ? undefined : Number(/^--round=(\d+)$/.exec(roundFlag)?.[1] ?? NaN);
const checking = roundArg === '--check';
const dir = resolve(roundArg);
const round = checking ? 12 : roundOverride ?? Number(/^r(\d+)$/.exec(basename(dir))?.[1]);
if (!Number.isSafeInteger(round) || round < 12 || round > 10000) {
 throw new Error('Choose a numbered Hedgy round from r12 through r10000.');
}

const config = workerConfig();
const route = `/api/jobs/accounts/hedgy/evaluation/${round}`;
async function request(path, init) {
 return (await siteRequest(config, path, init)).json();
}
function json(body) {
 return {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body)};
}
async function save(state) {
 const receipt = join(dir, 'publication.json');
 const tmp = `${receipt}.${randomUUID()}.tmp`;
 await writeFile(tmp, JSON.stringify(state, null, 2), {mode:0o600});
 await rename(tmp, receipt);
}

if (checking) {
 const status = await request(route);
 if (status.destination && status.destination.id !== integrationId) throw new Error('The configured Hedgy destination differs from the chosen destination.');
 console.log(JSON.stringify(status));
} else {
 const spec = JSON.parse(await readFile(join(dir, 'spec.json'), 'utf8'));
 if (!HEDGY_SERIES_IDS.includes(spec.series)) throw new Error('A finished Hedgy reel is required.');
 const caption = hedgyPostCaptionSchema.parse(spec.postCaption);
 const bytes = await readFile(join(dir, 'finished.mp4'));
 const digest = createHash('sha256').update(bytes).update(caption).digest('hex');
 const state = await request(route, json({digest,integrationId}));
 if (state.lease) {
  const job = `/api/jobs/accounts/${state.id}/${state.lease}`;
  const {materialId} = await request(`${job}/output`, {method:'PUT',headers:{'content-type':'video/mp4','content-length':String(bytes.length)},body:bytes});
  const {idea}=await readFile(join(dir,'provenance.json'),'utf8').then(JSON.parse).catch(error=>{
   if(error.code==='ENOENT')return {};
   throw error;
  });
  const provenance=idea?{idea}:{};
  await request(`${job}/complete`, json({materialId,spec,provenance}));
 }
 const maxChecks = 25;
 for (let attempt = 0; attempt < maxChecks; attempt++) {
  const status = await request(route);
  await save(status);
  if (['published','failed','needs_attention'].includes(status.status) || attempt === maxChecks - 1) {
   console.log(JSON.stringify(status));
   if (['failed','needs_attention'].includes(status.status)) process.exitCode = 1;
   else if (status.status !== 'published') process.exitCode = 2;
   break;
  }
  await new Promise(resolve => setTimeout(resolve, 7500));
 }
}
