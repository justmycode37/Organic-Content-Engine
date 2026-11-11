import {z} from 'zod';
import {HEDGY_POLICY} from './hedgy-policy.ts';
const scene=z.object({type:z.literal('hedgy'),duration:z.number().min(2).max(7),transition:z.enum(['cut','zoom','wipe','shutter','blocks','glitch','flash']).optional(),transitionSound:z.enum(['swish','rise','tick','pop','glitch','shimmer','none']).optional(),beat:z.enum(['risk','drop','hedge','offset','cost','lesson']),headline:z.string().min(1).max(28),label:z.string().min(1).max(24).optional(),secondary:z.string().min(1).max(24).optional(),mascot:z.boolean().optional(),action:z.enum(['buy','crash','contract','expiry','payout','net','upside','premium','story']),story:z.enum(['phone','worry','put','cushion','gain','backup']).optional(),sync:z.array(z.object({word:z.string().min(1).max(30),kind:z.string().min(1).max(30)}).strict()).max(8).optional(),say:z.string().min(1).max(220),caption:z.string().max(60).optional()}).strict();
const reelSpecSchema=z.object({version:z.literal(1),title:z.string().max(90),series:z.literal('HEDGY / FINANCE'),mode:z.literal('dark'),accent:z.literal('mono'),music:z.enum(['drive','chill','tense','bright']),scenes:z.array(scene).min(5).max(8)}).strict().superRefine((spec,ctx)=>{
 if(spec.scenes.filter(s=>s.mascot).length>2)ctx.addIssue({code:'custom',message:'At most two mascot scenes'});
 if(/meet hedgy|not (?:financial|investment) advice|education(?:al)? only|follow for/i.test(JSON.stringify(spec)))ctx.addIssue({code:'custom',message:'No greeting, disclaimer or generic CTA'});
});

import type {Env} from './container.ts';
import {AppError} from './errors.ts';
const ROLES=['hook','finance accuracy','narration','scene 1 animation','scene 2 animation','scene 3 animation','scene 4 animation','scene 5 animation','scene 6 animation','sound effects','music and pacing','captions and accessibility'];
/** Fixed fan-out: 14 bounded calls, at most four concurrent; no subscription fallback. */
export async function generateHedgyReel(env:Env,topic:string,onUsage?:(usage:unknown)=>void){
 const key=typeof env.OPENAI_API_KEY==='string'?env.OPENAI_API_KEY.trim():'';
 if(!key)throw new AppError(503,'api_key_missing','Configure the server OPENAI_API_KEY');
 async function ask(model:string,input:string,max:number,structured=false){
 const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model,reasoning:{effort:model==='gpt-6-luna'?'low':'medium'},input,max_output_tokens:max,store:false,...(structured?{text:{format:{type:'json_schema',name:'hedgy_reel',schema:z.toJSONSchema(reelSpecSchema),strict:false}}}:{})}),signal:AbortSignal.timeout(120000)});
 if(!response.ok)throw new AppError(502,'model_failed',`${model} request failed (${response.status}); check model access and API billing`);
 const r=await response.json() as {usage?:unknown;status?:string;output?:{content?:{type:string;text?:string}[]}[]};
 onUsage?.({model,usage:r.usage,status:r.status,output:r.output});
 if(r.status!=='completed')throw new AppError(502,'generation_incomplete','Model output incomplete');
 return (r.output??[]).flatMap(v=>v.content??[]).filter(v=>v.type==='output_text').map(v=>v.text??'').join('');
 }
 const brand=JSON.stringify(HEDGY_POLICY)+'\nCreate an original 25-40 second mechanism-led finance story about the requested topic. Use 7–8 quick shots and at most 70 spoken words; one meaningful action every 0.4–0.8 seconds; max two hero assemblies per frame; no disclaimer or greeting. Avoid arithmetic and avoid quoting strike prices. Explain the cost of protection in plain language. Prefer coherent analogy-led story actions phone, worry, put, cushion, gain, backup.';
 const plan=await ask('gpt-6.1-sol',`${brand} Plan a reel on ${topic}. Give a concrete scene and narration brief for twelve specialists.`,5000);
 const contributions:string[]=new Array(ROLES.length);let next=0;
 const settled=await Promise.allSettled(Array.from({length:4},async()=>{while(next<ROLES.length){const i=next++;contributions[i]=`${ROLES[i]}: ${await ask('gpt-6-luna',`${brand}\nProducer brief: ${plan}\nYour task: ${ROLES[i]}. Return at most 180 words of precise production instructions, no preamble.`,8000)}`;}}));
 const failure=settled.find(x=>x.status==='rejected');if(failure?.status==='rejected')throw failure.reason;
 const schema=JSON.stringify((await import('zod')).z.toJSONSchema(reelSpecSchema));
 let output=await ask('gpt-6.1-sol',`${brand}\nAssemble a final reel JSON only, no markdown. Use series HEDGY / FINANCE, accent mono. Each scene type hedgy with semantic beat risk, drop, hedge, offset, cost, lesson. Set action to a concrete matching financial event (buy, crash, contract, expiry, payout, net, upside, premium). Provide sync word/kind markers to align actions to the narration. For an analogy-led explanation use action story with story phone, worry, put, cushion, gain, backup. Sentences must form one connected paragraph and may continue across shots. Never use unrelated generic spinning icons. Set mascot true only when he is part of the example, in 1 or 2 scenes. Match this JSON schema exactly: ${schema}\nBrief: ${plan}\nSpecialists:\n${contributions.join('\n')}`,10000,true);
 let value:unknown;try{value=JSON.parse(output)}catch{throw new AppError(502,'invalid_reel','Producer returned invalid JSON')}
 let parsed=reelSpecSchema.safeParse(value);
 if(!parsed.success){output=await ask('gpt-6.1-sol',`Repair this reel JSON to match the schema exactly. Keep its story and numerically correct hypothetical intact. Validation errors: ${JSON.stringify(parsed.error.issues)}\nJSON: ${output}\nSchema: ${schema}`,10000,true);try{value=JSON.parse(output)}catch{throw new AppError(502,'invalid_reel','Repair returned invalid JSON')}parsed=reelSpecSchema.safeParse(value);}
 if(!parsed.success)throw new AppError(502,'invalid_reel','Producer returned an invalid reel specification');
 return {spec:parsed.data,provenance:{orchestrator:'gpt-6.1-sol',effort:'medium',specialist:'gpt-6-luna',specialists:ROLES.length,plan,contributions}};
}
