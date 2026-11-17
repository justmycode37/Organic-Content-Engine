import Anthropic from '@anthropic-ai/sdk';
import {zodOutputFormat} from '@anthropic-ai/sdk/helpers/zod';
import {z} from 'zod';
import type {Ask} from './quriozity-generation.ts';
import {QURIOZITY_MODELS,quriozityStepRole,usesOpusVisuals} from './quriozity-model-policy.ts';
import type {PromptContext} from './quriozity-prompt.ts';
type Usage=(entry:unknown)=>void;
/** Freeform renderer controls and tuples retain the original local Zod gates. */
export function opusOutputFormat(format?:{name:string;schema:z.ZodType}){
 if(!format)return null;
 const schema=z.toJSONSchema(format.schema);
 const open=(value:unknown):boolean=>!!value&&typeof value==='object'&&(Object.hasOwn(value,'prefixItems')||((value as {type?:string}).type==='object'&&typeof (value as {additionalProperties?:unknown}).additionalProperties==='object')||Object.values(value).some(v=>Array.isArray(v)?v.some(open):open(v)));
 if(open(schema))return null;
 try{
  const native=zodOutputFormat(format.schema);
  // Validate locally after logging raw output/usage. The SDK parser would throw
  // before an invalid proposal could be preserved by the bounded repair loop.
  return {type:native.type,schema:native.schema};
 }catch{return null;}
}
export function opusClient(key:string,onUsage?:Usage,beforeRequest?:(step:string)=>Promise<void|string>):Ask{
 if(!key.trim())throw new Error('Configure ANTHROPIC_API_KEY for Quriozity generation');
 const client=new Anthropic({apiKey:key.trim(),maxRetries:0,timeout:60*60*1000});
 return async(step,input,_max,format,images=[],context?:PromptContext)=>{
  const structured=opusOutputFormat(format);
  const schemaPrompt=format&&!structured?`\nReturn ONLY a valid JSON object matching this schema, with no Markdown or commentary: ${JSON.stringify(z.toJSONSchema(format.schema))}`:'';
  const prefix=context?.prefix.trim();
  const prompt=prefix?input:input+schemaPrompt;
  const content:Anthropic.MessageParam['content']=[{type:'text',text:prompt},...images.map(i=>({type:'image' as const,source:{type:'base64' as const,media_type:i.mime as 'image/png'|'image/jpeg'|'image/gif'|'image/webp',data:i.base64}}))];
  for(let attempt=0;attempt<6;attempt++){
   let requestStep=attempt&&!step.endsWith('-repair')?`${step}-repair`:step;
   requestStep=await beforeRequest?.(requestStep)||requestStep;
   const started=performance.now();
   try{
    const response=await client.messages.stream({model:QURIOZITY_MODELS.visual.model,max_tokens:128000,output_config:{effort:QURIOZITY_MODELS.visual.effort,...(structured?{format:structured}:{})},
     ...(prefix?{system:[{type:'text' as const,text:prefix+schemaPrompt,cache_control:{type:'ephemeral' as const,ttl:'1h' as const}}]}:{}),messages:[{role:'user',content}]}).finalMessage();
    onUsage?.({provider:'anthropic',step:requestStep,role:quriozityStepRole(requestStep),model:response.model,effort:QURIOZITY_MODELS.visual.effort,status:response.stop_reason,usage:response.usage,seconds:(performance.now()-started)/1000});
    if(response.stop_reason!=='end_turn')throw new Error(`Opus step ${step} stopped: ${response.stop_reason}`);
    return response.content.filter(b=>b.type==='text').map(b=>b.text).join('');
   }catch(error){
    const status=error instanceof Anthropic.APIError?error.status:undefined;
    if(!status||![429,500,502,503,504,529].includes(status)||attempt===5)throw error;
    onUsage?.({provider:'anthropic',step:requestStep,role:quriozityStepRole(requestStep),model:QURIOZITY_MODELS.visual.model,effort:QURIOZITY_MODELS.visual.effort,status:`http-${status}`,seconds:(performance.now()-started)/1000});
    await new Promise(r=>setTimeout(r,5000*(attempt+1)));
   }
  }
  throw new Error(`Opus step ${step} exhausted retries`);
 };
}
export function routeQuriozityClients(visual:Ask,sol:Ask):Ask{return (step,...args)=>usesOpusVisuals(step)?visual(step,...args):sol(step,...args);}
