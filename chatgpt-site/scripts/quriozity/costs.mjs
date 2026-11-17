// Published Standard rates, verified 2026-11-17. Reporting only: never a cutoff.
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const PRICE_SOURCES={verified:'2026-11-17',openai:'https://developers.openai.com/api/docs/pricing',opus:'https://platform.claude.com/docs/en/models/opus-5-5/overview',audio:'https://elevenlabs.io/pricing/api'};
export function modelCost(entry){
 const u=entry.usage;if(!u)return null;
 if(entry.model?.startsWith('gpt-6.1-sol')){
  const i=u.input_tokens??0,d=u.input_tokens_details??{},cached=d.cached_tokens??0,write=d.cache_write_tokens??d.cache_creation_tokens??0,longWrite=d.cache_write_tokens_details?.ttl_12h_tokens??0,m=i>272000?2:1;
  return ((i-cached-write)*2*m+cached*.1*m+(write-longWrite)*2.5*m+longWrite*5*m+(u.output_tokens??0)*10*(m===2?1.5:1))/1e6;
 }
 if(entry.model?.startsWith('claude-opus-5-5')){
  const write=u.cache_creation_input_tokens??0,longWrite=u.cache_creation?.ephemeral_1h_input_tokens??0;
  return ((u.input_tokens??0)*4+(u.output_tokens??0)*20+(u.cache_read_input_tokens??0)*.2+(write-longWrite)*5+longWrite*8)/1e6;
 }
 throw new Error(`No verified Quriozity price for ${entry.model}`);
}
export function audioCost(entry){
 if(entry.provider!=='elevenlabs'||entry.status!==200)return null;
 if(entry.endpoint?.includes('/text-to-speech/')&&Number.isFinite(entry.characters))return entry.characters/1000*.08;
 const seconds=entry.generatedSeconds??entry.seconds;
 if(entry.endpoint?.includes('music')&&Number.isFinite(seconds))return seconds/60*.15;
 if(entry.endpoint?.includes('sound-generation')&&Number.isFinite(seconds))return seconds/60*.12;
 return null;
}
export function summarizeCosts(rows){
 const byProvider={},byStage={},unmetered=[];
 let modelUsd=0,audioEstimateUsd=0;
 for(const row of rows){
  const cost=row.model?modelCost(row):audioCost(row),provider=row.model?.startsWith('claude-')?'anthropic':row.model?'openai':row.provider??'unknown',stage=row.step??row.endpoint??'unknown';
  if(cost===null){unmetered.push({provider,stage,status:row.status});continue;}
  if(row.model)modelUsd+=cost;else audioEstimateUsd+=cost;
  byProvider[provider]=(byProvider[provider]??0)+cost;byStage[stage]=(byStage[stage]??0)+cost;
 }
 return {priceSources:PRICE_SOURCES,modelUsd,audioEstimateUsd,estimatedTotalUsd:modelUsd+audioEstimateUsd,byProvider,byStage,unmetered,
  basis:'Recorded token usage at published Standard rates, including reasoning output and provider cache writes/reads. Audio uses published character/minute rates. Not an invoice: excludes tax, account discounts, unknown interrupted usage and amortized cached audio.',
  orientation:{opusUsd:3,openaiUsd:3,hardCutoff:false},
  repairHeavyScenario:{estimatedUsd:7*modelCost({model:'claude-opus-5-5',usage:{input_tokens:100000,output_tokens:16000}})+10*modelCost({model:'gpt-6.1-sol',usage:{input_tokens:80000,output_tokens:4000}})+30*modelCost({model:'gpt-6.1-sol',usage:{input_tokens:8000,output_tokens:6000}})+.5,notAHardMaximum:true,assumptions:'7 Opus calls at 100k input/16k output; 10 Sol visual reviews at 80k input/4k output; 30 Sol planning/review/correction calls at 8k input/6k output; $0.50 audio. No cache hits; excludes asset search fan-out and large-output outliers.'}};
}
export async function writeCostSummary(workdir){
 const rows=(await readFile(join(workdir,'usage.jsonl'),'utf8')).split('\n').filter(Boolean).map(line=>JSON.parse(line));
 const summary=summarizeCosts(rows);await writeFile(join(workdir,'cost-summary.json'),JSON.stringify(summary,null,2),{mode:0o600});return summary;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const summary=await writeCostSummary(resolve(process.argv[2]));
 console.log(JSON.stringify(summary,null,2));
}
