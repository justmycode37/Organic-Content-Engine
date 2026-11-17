import Anthropic from '@anthropic-ai/sdk';
import {zodOutputFormat} from '@anthropic-ai/sdk/helpers/zod';
import {z} from 'zod';
import type {Ask} from './quriozity-generation.ts';
import {QURIOZITY_MODELS,quriozityStepRole} from './quriozity-model-policy.ts';
type Usage=(entry:unknown)=>void;
/** Freeform renderer controls and tuples retain the original local Zod gates. */
export function opusOutputFormat(format?:{name:string;schema:z.ZodType}){
 if(!format)return null;
 const schema=z.toJSONSchema(format.schema);
 const open=(value:unknown):boolean=>!!value&&typeof value==='object'&&(Object.hasOwn(value,'prefixItems')||((value as {type?:string}).type==='object'&&typeof (value as {additionalProperties?:unknown}).additionalProperties==='object')||Object.values(value).some(v=>Array.isArray(v)?v.some(open):open(v)));
 if(open(schema))return null;
 try{return zodOutputFormat(format.schema);}catch{return null;}
}
export function opusClient(key:string,onUsage?:Usage,beforeRequest?:(step:string)=>Promise<void>):Ask{
 if(!key.trim())throw new Error('Configure ANTHROPIC_API_KEY for Quriozity generation');
 const client=new Anthropic({apiKey:key.trim(),maxRetries:0,timeout:60*60*1000});
 return async(step,input,_max,format,images=[])=>{
  const structured=opusOutputFormat(format);
  const prompt=format&&!structured?`${input}\nReturn ONLY a valid JSON object matching this schema, with no Markdown or commentary: ${JSON.stringify(z.toJSONSchema(format.schema))}`:input;
  const content:Anthropic.MessageParam['content']=[{type:'text',text:prompt},...images.map(i=>({type:'image' as const,source:{type:'base64' as const,media_type:i.mime as 'image/png'|'image/jpeg'|'image/gif'|'image/webp',data:i.base64}}))];
  for(let attempt=0;attempt<6;attempt++){
   const requestStep=attempt&&!step.endsWith('-repair')?`${step}-repair`:step;
   await beforeRequest?.(requestStep);
   const started=performance.now();
   try{
    const response=await client.messages.stream({model:QURIOZITY_MODELS.generation.model,max_tokens:128000,output_config:{effort:QURIOZITY_MODELS.generation.effort,...(structured?{format:structured}:{})},messages:[{role:'user',content}]}).finalMessage();
    onUsage?.({provider:'anthropic',step:requestStep,role:quriozityStepRole(requestStep),model:response.model,effort:QURIOZITY_MODELS.generation.effort,status:response.stop_reason,usage:response.usage,seconds:(performance.now()-started)/1000});
    if(response.stop_reason!=='end_turn')throw new Error(`Opus step ${step} stopped: ${response.stop_reason}`);
    return response.content.filter(b=>b.type==='text').map(b=>b.text).join('');
   }catch(error){
    const status=error instanceof Anthropic.APIError?error.status:undefined;
    if(!status||![429,500,502,503,504,529].includes(status)||attempt===5)throw error;
    onUsage?.({provider:'anthropic',step:requestStep,role:quriozityStepRole(requestStep),model:QURIOZITY_MODELS.generation.model,effort:QURIOZITY_MODELS.generation.effort,status:`http-${status}`,seconds:(performance.now()-started)/1000});
    await new Promise(r=>setTimeout(r,5000*(attempt+1)));
   }
  }
  throw new Error(`Opus step ${step} exhausted retries`);
 };
}
export function routeQuriozityClients(generation:Ask,review:Ask):Ask{return async(step,...args)=>{
 if(quriozityStepRole(step)==='review')return review(step,...args);
 try{return await generation(step,...args);}
 catch(error){
  if(!['opus_repair_limit','opus_stage_repair_limit'].includes((error as {code?:string}).code??''))throw error;
  return review(step,...args);
 }
};}
