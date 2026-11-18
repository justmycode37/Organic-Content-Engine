import {z} from 'zod';
import {AppError} from './errors.ts';

export type ReelModelRequest = {
 provider:'openai'|'anthropic';
 step:string;
 model:string;
 effort:string;
 input:string;
 format?:{name:string;schema:z.ZodType};
 images?:{mime:string;base64:string}[];
 prefix?:string;
 role?:string;
};

export type ReelSubscription = (request:ReelModelRequest)=>Promise<
 {status:'completed';text:string;usage?:unknown;requestId?:string} |
 {status:'subscription_exhausted';resetAt?:number}
>;

export async function tryReelSubscription(subscription:ReelSubscription,request:ReelModelRequest,onUsage?:(entry:unknown)=>void|Promise<void>){
 const {provider,step,model,effort,role}=request;
 const base={provider,step,model,effort,role,billing:'subscription'};
 const started=performance.now();
 await onUsage?.({...base,status:'started'});
 let result;
 try{result=await subscription(request);}
 catch(error){
  await onUsage?.({...base,status:'failed',seconds:(performance.now()-started)/1000});
  throw Object.assign(new AppError(502,'subscription_failed',`${model} subscription request failed at ${step}`,{step}),{cause:error});
 }
 const {text,...usage}=result.status==='completed'?result:{...result,text:undefined};
 await onUsage?.({...base,...usage,seconds:(performance.now()-started)/1000});
 return text;
}
