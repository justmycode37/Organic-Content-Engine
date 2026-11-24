// Produce one Hedgy reel locally with the same generation + render path as the account worker.
//   node --env-file-if-exists=.env.hedgy --env-file-if-exists=.env.motion scripts/hedgy-local-reel.mjs <outDir> [historyJson]
// Writes spec.json, provenance.json, api-usage.json, finished.mp4 and a review kit (review/) in <outDir>.
// Resumes: an existing spec.json is rendered again without new model calls.
import {mkdir,readFile,writeFile,stat} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createReelSubscription} from './reel-subscription.mjs';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const [outArg,historyArg]=process.argv.slice(2);
if(!outArg)throw new Error('Usage: hedgy-local-reel.mjs <outDir> [historyJson]');
const out=resolve(outArg);await mkdir(out,{recursive:true});
const exists=p=>stat(p).then(()=>true,()=>false);
const run=(cmd,args,env)=>new Promise((ok,fail)=>{const p=spawn(cmd,args,{stdio:'inherit',cwd:ROOT,env:{...process.env,...env}});p.on('close',c=>c===0?ok():fail(new Error(`${cmd} exited ${c}`)));});
const specFile=join(out,'spec.json');
const astraReview=process.env.HEDGY_LOCAL_ASTRA_REVIEW==='1';
if(!await exists(specFile)){
 const history=historyArg?JSON.parse(await readFile(historyArg,'utf8')):[];
 const usage=[],started=Date.now();
 const save=()=>writeFile(join(out,'api-usage.json'),JSON.stringify({startedAt:new Date(started).toISOString(),elapsedSeconds:(Date.now()-started)/1000,calls:usage},null,2));
 const {generateHedgyReel}=await import('../worker/hedgy-generation.ts');
 const {HEDGY_TOPIC}=await import('../worker/hedgy-policy.ts');
 const topic=process.env.HEDGY_TOPIC||HEDGY_TOPIC;
 const result=await generateHedgyReel({OPENAI_API_KEY:process.env.OPENAI_API_KEY},topic,async entry=>{usage.push({...entry,outputText:undefined});console.log(`[${((Date.now()-started)/1000).toFixed(0)}s] ${entry.step} ${entry.status} ${entry.billing??''}`);await save();},history,createReelSubscription(),{astraReview}).catch(async e=>{await writeFile(join(out,'failure.json'),JSON.stringify({message:e.message,code:e.code,details:e.details},null,2));return e;});
 await save();
 if(result instanceof Error)throw result;
 await writeFile(join(out,'provenance.json'),JSON.stringify(result.provenance,null,2));
 await writeFile(specFile,JSON.stringify(result.spec,null,2));
}
const {finishHedgy}=await import('./hedgy-finish.mjs');
const usageLog=join(out,'render-usage.jsonl');
const result=await finishHedgy(out,JSON.parse(await readFile(specFile,'utf8')),{onUsage:async e=>{const {outputText:_o,...entry}=e??{};console.log(`[render] ${entry.step} ${entry.status}`);await writeFile(usageLog,JSON.stringify(entry)+'\n',{flag:'a'});},subscription:createReelSubscription()});
await run(process.execPath,[join(ROOT,'scripts/review-reel.mjs'),result.finished,join(out,'review'),'2']);
console.log(`Done: ${result.finished}${result.selection?` (${result.selection.version}: ${result.selection.reason})`:''}`);
