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
 if(!await exists(out))await runner(process.execPath,[join(ROOT,'scripts/motion-audio.mjs'),specFile,out],renderEnv(spec));
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
  const s1=await sheets(v1.kit);
  const first=await hedgyRenderedReview({OPENAI_API_KEY:env.OPENAI_API_KEY},spec,s1.images,s1.timeline,onUsage,subscription);
  await writeFile(join(dir,'visual-review-v1.json'),JSON.stringify(first,null,2));
  selection={version:'render-v1',reason:first.review?`visual review score ${first.review.score}${first.review.approved?' (approved)':''}`:`visual review unavailable: ${first.error??'invalid'}`};
  if(first.spec){
   const v2=await renderVersion(dir,'render-v2',first.spec,{runner});
   const s2=await sheets(v2.kit);
   const second=await hedgyRenderedReview({OPENAI_API_KEY:env.OPENAI_API_KEY},first.spec,s2.images,s2.timeline,onUsage,subscription,{repair:false}).catch(error=>({error:String(error?.message??error)}));
   const {spec:_ignored,...secondRecord}=second;
   await writeFile(join(dir,'visual-review-v2.json'),JSON.stringify(secondRecord,null,2));
   // Never discard a better earlier version merely because a repair was attempted.
   const a=first.review?.score??0,b=second.review?.score??a;
   if(b>=a){selection={version:'render-v2',reason:`repair scored ${b} vs ${a}`};spec=first.spec;}
   else selection={version:'render-v1',reason:`repair scored ${b} vs ${a}; kept the original`};
  }
 }
 await copyFile(join(dir,`${selection.version}.mp4`),finished);
 await copyFile(join(dir,`${selection.version}.json`),join(dir,'spec.json'));
 for(const extra of ['.audio.json'])if(await exists(join(dir,`${selection.version}.mp4${extra}`)))await copyFile(join(dir,`${selection.version}.mp4${extra}`),join(dir,`finished.mp4${extra}`));
 await writeFile(join(dir,'selection.json'),JSON.stringify(selection,null,2));
 return {finished,spec,selection};
}
