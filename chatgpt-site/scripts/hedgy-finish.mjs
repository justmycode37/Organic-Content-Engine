// Render a Hedgy spec, let a second model review the actual frames, repair the shot list once and
// render again; keeps the better-scored version as finished.mp4. Used by the account worker and
// scripts/hedgy-local-reel.mjs. Every version, review and the selection reason are saved in `dir`.
import {readFile,writeFile,stat,copyFile,readdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const exists=p=>stat(p).then(()=>true,()=>false);
function run(cmd,args,env){return new Promise((ok,fail)=>{const p=spawn(cmd,args,{stdio:'inherit',cwd:ROOT,env:{...process.env,...env}});p.on('close',c=>c===0?ok():fail(new Error(`${cmd} ${args[0]?.split('/').at(-1)} exited ${c}`)));});}

/** Narration pace: viral specs keep the voice at its natural tempo; older specs keep the slower legacy tempo. */
export const renderEnv=spec=>({MOTION_SPEECH_TEMPO:process.env.MOTION_SPEECH_TEMPO??(spec.look==='viral'?'1':'0.85'),MOTION_LEAD:process.env.MOTION_LEAD??'0.04',MOTION_TAIL:process.env.MOTION_TAIL??(spec.look==='viral'?'0.08':'0.12')});

async function renderVersion(dir,name,spec,{runner=run}={}){
 const specFile=join(dir,`${name}.json`),out=join(dir,`${name}.mp4`),kit=join(dir,`${name}-review`);
 await writeFile(specFile,JSON.stringify(spec,null,2));
 // A transient provider/render failure gets one more attempt; audio clips already made are cached.
 if(!await exists(out))await runner(process.execPath,[join(ROOT,'scripts/motion-audio.mjs'),specFile,out],renderEnv(spec)).catch(()=>runner(process.execPath,[join(ROOT,'scripts/motion-audio.mjs'),specFile,out],renderEnv(spec)));
 if(!await exists(join(kit,'motion.txt')))await runner(process.execPath,[join(ROOT,'scripts/review-reel.mjs'),out,kit,'2']);
 return {out,kit};
}
async function sheets(kit){
 const files=(await readdir(kit)).filter(f=>/^sheet-\d+\.png$/.test(f)).sort();
 return {images:await Promise.all(files.map(async f=>({mime:'image/png',base64:(await readFile(join(kit,f))).toString('base64')}))),timeline:await readFile(join(kit,'sheets.txt'),'utf8')};
}

export async function finishHedgy(dir,spec,{env=process.env,onUsage,subscription,runner}={}){
 const finished=join(dir,'finished.mp4');
 if(await exists(finished))return {finished};
 const {hedgyRenderedReview}=await import('../worker/hedgy-generation.ts');
 const v1=await renderVersion(dir,'render-v1',spec,{runner});
 let selection={version:'render-v1',reason:'no visual review'};
 if(spec.look==='viral'){
  // Up to MAX_REPAIRS review→repair→render cycles; every render is reviewed and the best-scored one is kept
  // (never discard a better earlier version merely because a later repair was attempted).
  const MAX_REPAIRS=Number(env.HEDGY_VISUAL_REPAIRS??2);
  let current={version:'render-v1',spec,kit:v1.kit},best={version:'render-v1',spec,score:-1};
  for(let round=1;;round++){
   const s=await sheets(current.kit);
   const canRepair=round<=MAX_REPAIRS;
   const reviewed=await hedgyRenderedReview({OPENAI_API_KEY:env.OPENAI_API_KEY},current.spec,s.images,s.timeline,onUsage,subscription,{repair:canRepair}).catch(error=>({error:String(error?.message??error)}));
   const {spec:repairedSpec,...record}=reviewed;
   await writeFile(join(dir,`visual-review-v${round}.json`),JSON.stringify(record,null,2));
   const score=reviewed.review?.score;
   if(score!==undefined&&score>best.score)best={version:current.version,spec:current.spec,score};
   if(best.score<0&&score===undefined&&round===1)selection={version:'render-v1',reason:`visual review unavailable: ${reviewed.error??'invalid'}`};
   if(!canRepair||!repairedSpec||reviewed.review?.approved)break;
   const name=`render-v${round+1}`;
   const next=await renderVersion(dir,name,repairedSpec,{runner}).catch(async error=>{await writeFile(join(dir,`${name}-error.txt`),String(error?.message??error));return undefined;});
   if(!next)break;
   current={version:name,spec:repairedSpec,kit:next.kit};
  }
  if(best.score>=0){selection={version:best.version,reason:`best reviewed render (score ${best.score})`};spec=best.spec;}
 }
 await copyFile(join(dir,`${selection.version}.mp4`),finished);
 await copyFile(join(dir,`${selection.version}.json`),join(dir,'spec.json'));
 for(const extra of ['.audio.json'])if(await exists(join(dir,`${selection.version}.mp4${extra}`)))await copyFile(join(dir,`${selection.version}.mp4${extra}`),join(dir,`finished.mp4${extra}`));
 await writeFile(join(dir,'selection.json'),JSON.stringify(selection,null,2));
 return {finished,spec,selection};
}
