import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

import {OPUS_REPAIR_LIMIT} from '../../worker/quriozity-model-policy.ts';
export {OPUS_REPAIR_LIMIT};
export const isRepairBudgetError=error=>error?.code==='opus_repair_limit';

/** Reserve before sending. Interrupted/invalid requests consume a slot; restarts cannot reset it. */
export async function opusRepairBudget(workdir){
 const dir=join(workdir,'repair-budget');await mkdir(dir,{recursive:true});
 const baseline=join(dir,'baseline.json');
 let historical=0;
 const seen=new Set();
 const usage=await readFile(join(workdir,'usage.jsonl'),'utf8').catch(error=>{if(error.code==='ENOENT')return '';throw error;});
 for(const line of usage.split('\n').filter(Boolean)){
  const row=JSON.parse(line);if(row.provider!=='anthropic')continue;
  const repeat=['plan','script','storyboard'].includes(row.step)&&seen.has(row.step);
  if(row.step?.endsWith('-repair')||repeat)historical++;
  seen.add(row.step);
 }
 try{await writeFile(baseline,JSON.stringify({historical,limit:OPUS_REPAIR_LIMIT}),{flag:'wx',mode:0o600});}
 catch(error){if(error.code!=='EEXIST')throw error;}
 const saved=JSON.parse(await readFile(baseline,'utf8'));
 if(!Number.isInteger(saved.historical)||saved.historical<0)throw new Error('Invalid persisted Opus repair budget');
 return async step=>{
  if(!step.endsWith('-repair'))return;
  for(let slot=saved.historical+1;slot<=OPUS_REPAIR_LIMIT;slot++){
   try{
    await writeFile(join(dir,`call-${slot}.json`),JSON.stringify({slot,step,at:new Date().toISOString()}),{flag:'wx',mode:0o600});
    return;
   }catch(error){if(error.code!=='EEXIST')throw error;}
  }
  throw Object.assign(new Error(`${OPUS_REPAIR_LIMIT} Opus repair calls already reserved for this reel; retain the best reviewed candidate.`),{code:'opus_repair_limit'});
 };
}
