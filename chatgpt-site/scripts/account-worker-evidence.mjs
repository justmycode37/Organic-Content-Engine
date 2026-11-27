import {spawn} from 'node:child_process';
import {appendFile,chmod,mkdir,writeFile} from 'node:fs/promises';
import {basename,join} from 'node:path';
import {createInterface} from 'node:readline';
import {createRedactor} from '../worker/logger.ts';

export const safeId=value=>String(value).replace(/[^a-zA-Z0-9_-]/g,'_');
export function accountRedactor(env=process.env,config={}){
 const secrets=Object.entries(env).filter(([name])=>/key|token|secret|password|credential|auth/i.test(name)).map(([,value])=>value).filter(v=>typeof v==='string');
 const exact=createRedactor([...secrets,...Object.values(config.headers??{})]);
 return text=>exact(String(text))
  .replace(/\bBearer\s+[^\s"'\\]+/gi,'Bearer [REDACTED]')
  .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi,'$1[REDACTED]@')
  .replace(/([?&](?:api[_-]?key|token|access_token|secret|password)=)[^&\s"']+/gi,'$1[REDACTED]');
}

function errorRecord(error,seen=new Set(),depth=0){
 if(depth>5)return '[cause depth limit]';
 if(error===null||typeof error!=='object')return {message:String(error)};
 if(seen.has(error))return '[circular cause]';seen.add(error);
 return {name:error.name,message:error.message??String(error),stack:error.stack,code:error.code,status:error.status,details:error.details,...(error.cause!==undefined?{cause:errorRecord(error.cause,seen,depth+1)}:{})};
}
function serialize(value,redact){
 const seen=new Set();
 return redact(JSON.stringify(value,(_key,item)=>{
  if(typeof item==='bigint')return String(item);
  if(item&&typeof item==='object'){if(seen.has(item))return '[circular]';seen.add(item);}
  return item;
 }));
}

export function jobEvidence(cacheRoot,job,env=process.env,config={}){
 const cache=join(cacheRoot,safeId(job.id)),redact=accountRedactor(env,config);
 const evidence={cache,env,redact,stage:'prepare',
  async prepare(){await mkdir(cache,{recursive:true,mode:0o700});await chmod(cache,0o700);},
  async usage(entry){await appendFile(join(cache,'generation-events.jsonl'),serialize({at:new Date().toISOString(),...entry},redact)+'\n',{mode:0o600});},
  failure(error){return {at:new Date().toISOString(),jobId:job.id,accountId:job.account?.id,scheduledAt:job.scheduledAt,stage:evidence.stage,error:errorRecord(error)};},
  async save(name,value){const file=join(cache,name);await writeFile(file,serialize(value,redact)+'\n',{mode:0o600});await chmod(file,0o600);},
  text(value){return serialize(value,redact);},
 };
 return evidence;
}

/** Public failures use fixed labels; raw provider messages and stacks stay private. */
export function publicFailure(error,stage){
 const code=error?.code,step=/^[a-z]+(?:-\d+)?$/.test(error?.details?.step??'')?` ${error.details.step}`:'';
 const labels={quriozity_research_unavailable:'Monid topic research returned no usable evidence.',hedgy_research_unavailable:'Monid topic research is unavailable.',hedgy_no_new_topic:'Topic research found no supported, unused story.',hedgy_topic_repeat:'The topic was already selected or used.',api_key_missing:'Generation credentials are not configured.',subscription_failed:'The subscription model request failed. Check the worker CLI sign-in and private diagnostics.',model_failed:'The model request failed.',model_connection_failed:'The model connection failed.',model_stream_interrupted:'The model stream ended before completion.',model_output_empty:'The model returned no text.',model_response_invalid:'The model response was invalid.',idea_invalid:'Ideation did not produce a valid new idea.',invalid_reel:'The generated reel did not pass validation.',renderer_failed:'The audio/video renderer failed.',generation_interrupted:'A previous generation started. Inspect its cache before retrying.'};
 let message=labels[code];
 if(code==='generation_incomplete')message=`The model output did not complete${['max_output_tokens','content_filter','max_messages'].includes(error?.details?.incompleteReason)?` (${error.details.incompleteReason})`:''}.`;
 if(!message){const raw=String(error);message=/Configure.*(?:OPENAI|ANTHROPIC|ELEVENLABS)_API_KEY/i.test(raw)?'Generation credentials are not configured.':/style reference/i.test(raw)?'Required private owner style reference is unavailable.':error?.name==='SyntaxError'&&/requested module|does not provide an export/i.test(raw)?'The installed worker code is out of sync (a module failed to load). Reinstall the account worker.':error?.reviewFailure||error?.voiceFailure||/unresolved (?:visual|pacing)|did not pass .*review/i.test(raw)?'A required quality review failed.':'Account video generation failed.';}
 const http=Number.isInteger(error?.details?.httpStatus)?` HTTP ${error.details.httpStatus}.`:'';
 return `${stage}${step}: ${message}${http} Inspect private failure.json and generation-events.jsonl.`.slice(0,300);
}

/** Preserve stderr on nonzero exit, redact before bounding the retained tail. */
export async function runAccountCommand(bin,args,env=process.env){
 const redact=accountRedactor(env);
 await new Promise((resolve,reject)=>{
  const child=spawn(bin,args,{env,stdio:['ignore','ignore','pipe']});let stderr='';
  const lines=createInterface({input:child.stderr});
  lines.on('line',line=>{stderr=(stderr+redact(line)+'\n').slice(-16384);});
  child.once('error',reject);
  child.once('close',(exitCode,signal)=>exitCode===0?resolve():reject(Object.assign(new Error(`${basename(bin)} exited ${exitCode??signal}: ${stderr}`),{code:'renderer_failed',details:{binary:basename(bin),exitCode,signal,stderr}})));
 });
}
