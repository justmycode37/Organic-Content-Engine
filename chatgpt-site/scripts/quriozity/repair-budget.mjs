import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';

import {OPUS_STAGE_REPAIR_LIMIT,SOL_STAGE_REPAIR_LIMIT,repairStage,usesOpusVisuals} from '../../worker/quriozity-model-policy.ts';
export const isRepairBudgetError=error=>['opus_repair_limit','opus_stage_repair_limit','sol_stage_repair_limit'].includes(error?.code);
const limitError=(code,message)=>Object.assign(new Error(message),{code});
const countStages=rows=>rows.reduce((counts,row)=>{const stage=repairStage(row.step);counts[stage]=(counts[stage]??0)+1;return counts;},{});
async function usageRows(workdir){
 const usage=await readFile(join(workdir,'usage.jsonl'),'utf8').catch(error=>{if(error.code==='ENOENT')return '';throw error;});
 return usage.split('\n').filter(Boolean).map(line=>JSON.parse(line));
}
async function persisted(file,value){
 try{await writeFile(file,JSON.stringify(value),{flag:'wx',mode:0o600});}catch(error){if(error.code!=='EEXIST')throw error;}
 return JSON.parse(await readFile(file,'utf8'));
}
async function reserveStage(dir,step,provider,limit,historical=0){
 const stage=repairStage(step);
 if(!/^[a-z][a-z0-9-]{0,100}$/.test(stage))throw new Error('Invalid repair stage');
 const folder=join(dir,'stages',stage);await mkdir(folder,{recursive:true});
 for(let slot=historical+1;slot<=limit;slot++){
  const name=`${provider}-${slot}.json`;
  try{await writeFile(join(folder,name),JSON.stringify({provider,stage,step,slot,at:new Date().toISOString()}),{flag:'wx',mode:0o600});return join('stages',stage,name);}
  catch(error){if(error.code!=='EEXIST')throw error;}
 }
 throw limitError(`${provider}_stage_repair_limit`,`${stage}: ${limit} ${provider==='opus'?'Opus':'Sol'} repair calls already reserved for this stage.`);
}

/** Reserve before sending. Interrupted/invalid requests consume a slot; restarts cannot reset it. */
export async function opusRepairBudget(workdir){
 const dir=join(workdir,'repair-budget');await mkdir(dir,{recursive:true});
 const baseline=join(dir,'baseline.json');
 const rows=await usageRows(workdir),historicalRows=[],seen=new Set();
 for(const row of rows){
  if(row.provider!=='anthropic')continue;
  const repeat=['plan','script','storyboard','visual-realization'].includes(row.step)&&seen.has(row.step);
  if(row.step?.endsWith('-repair')||repeat)historicalRows.push(row);
  seen.add(row.step);
 }
 const saved=await persisted(baseline,{historical:historicalRows.length,historicalByStage:countStages(historicalRows),stageLimit:OPUS_STAGE_REPAIR_LIMIT,totalLimit:null});
 if(!Number.isInteger(saved.historical)||saved.historical<0)throw new Error('Invalid persisted Opus repair budget');
 // Preserve earlier usage/reservations by stage, including the old global files.
 // The old reel-wide counter is historical evidence, never a new global limit.
 const byStage=saved.historicalByStage??countStages(historicalRows.slice(0,saved.historical));
 const unattributed=Math.max(0,saved.historical-Object.values(byStage).reduce((n,v)=>n+v,0));
 const initialDir=join(dir,'stages','visual-realization');await mkdir(initialDir,{recursive:true});
 const initialFile=join(initialDir,'initial.json');
 if(rows.some(r=>r.provider==='anthropic'&&r.step==='visual-realization'))await persisted(initialFile,{historical:true,step:'visual-realization'});
 return async step=>{
  if(step==='visual-realization'){
   try{await writeFile(initialFile,JSON.stringify({step,at:new Date().toISOString()}),{flag:'wx',mode:0o600});return step;}
   catch(error){if(error.code!=='EEXIST')throw error;}
   // A restart may not buy a second free initial request. It uses the same one
   // durable repair allowance, or stops when that allowance is already spent.
   step='visual-realization-repair';
  }
  if(!step.endsWith('-repair'))return step;
  const legacyRows=await Promise.all((await readdir(dir)).filter(f=>/^call-\d+\.json$/.test(f)).map(async f=>JSON.parse(await readFile(join(dir,f),'utf8'))));
  const stage=repairStage(step),legacy=(byStage[stage]??0)+unattributed+legacyRows.filter(r=>!r.stageReservation&&repairStage(r.step)===stage).length;
  await reserveStage(dir,step,'opus',OPUS_STAGE_REPAIR_LIMIT,legacy);
  return step;
 };

}

/** Sol-only planning/delivery stages retain three durable correction slots. */
export async function solRepairBudget(workdir){
 const dir=join(workdir,'repair-budget');await mkdir(dir,{recursive:true});
 const rows=(await usageRows(workdir)).filter(r=>r.model==='gpt-6.1-sol'&&r.step?.endsWith('-repair'));
 const baseline=await persisted(join(dir,'sol-baseline.json'),{historicalByStage:countStages(rows)});
 const counts=baseline.historicalByStage;
 if(!counts||Object.values(counts).some(n=>!Number.isInteger(n)||n<0))throw new Error('Invalid persisted Sol repair budget');
 return async step=>{
  if(!step.endsWith('-repair'))return;
  if(usesOpusVisuals(step))throw limitError('visual_repairs_exhausted','Visual repair allowances cannot fall back to Sol; select the best rendered/reviewed version.');
  await reserveStage(dir,step,'sol',SOL_STAGE_REPAIR_LIMIT,counts[repairStage(step)]??0);
 };
}
