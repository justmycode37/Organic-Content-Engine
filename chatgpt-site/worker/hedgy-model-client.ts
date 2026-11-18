import {z} from 'zod';
import {AppError} from './errors.ts';
import {tryReelSubscription,type ReelSubscription} from './reel-subscription.ts';

type ResponseData={id?:string;status?:string;usage?:unknown;incomplete_details?:{reason?:string};error?:unknown;output?:{content?:{type:string;text?:string}[]}[]};
type Usage=(entry:unknown)=>void|Promise<void>;
export const HEDGY_MODEL='gpt-6.2-sol',HEDGY_EFFORT='xhigh';

/** Read a terminal Responses event, including events split across chunks or CRLF lines. */
async function readResponse(response:Response):Promise<ResponseData>{
 if(response.headers.get('content-type')?.includes('application/json'))return response.json();
 if(!response.body)throw new AppError(502,'model_stream_interrupted','Model response has no stream');
 const reader=response.body.pipeThrough(new TextDecoderStream()).getReader();
 let buffer='',data:string[]=[],responseId:string|undefined;
 const event=()=>{
  const value=data.join('\n');data=[];if(!value||value==='[DONE]')return;
  const e=JSON.parse(value) as {type?:string;response?:ResponseData;error?:unknown;code?:string;message?:string};
  responseId=e.response?.id??responseId;
  if(e.type==='error')throw new AppError(502,'model_failed','Model stream reported an error',{responseId,providerError:e.error??{code:e.code,message:e.message}});
  if(['response.completed','response.incomplete','response.failed'].includes(e.type??'')){
   if(!e.response)throw new AppError(502,'model_response_invalid','Terminal model event has no response',{responseId});
   return e.response;
  }
 };
 const line=(value:string)=>{
  if(!value)return event();
  if(value.startsWith('data:'))data.push(value.slice(5).replace(/^ /,''));
 };
 try{
  for(;;){
   const {value,done}=await reader.read();
   if(value)buffer+=value;
   let i:number;
   while((i=buffer.indexOf('\n'))>=0){
    const result=line(buffer.slice(0,i).replace(/\r$/,''));buffer=buffer.slice(i+1);
    if(result)return result;
   }
   if(done){
    if(buffer){const result=line(buffer.replace(/\r$/,''));if(result)return result;}
    const result=event();if(result)return result;
    throw new AppError(502,'model_stream_interrupted','Model stream ended before a terminal response',{responseId});
   }
  }
 }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}

/** Stream long xhigh calls without a small reasoning/output cap or a two-minute deadline.
 * No transport retry: an interrupted paid request must be inspected before repeating it.
 * https://developers.openai.com/api/docs/guides/reasoning#allocating-space-for-reasoning
 */
export function hedgyClient(key:string,onUsage?:Usage,subscription?:ReelSubscription){
 return async(step:string,input:string,format?:{name:string;schema:z.ZodType})=>{
  const model=HEDGY_MODEL,effort=HEDGY_EFFORT;
  if(subscription){
   const text=await tryReelSubscription(subscription,{provider:'openai',step,model,effort,input,format},onUsage);
   if(text!==undefined)return text;
   if(!key)throw new AppError(503,'api_key_missing','Codex usage is exhausted. Configure OPENAI_API_KEY for fallback.',{step});
  }
  const started=performance.now(),base={step,model,effort,...(subscription?{billing:'api'}:{})};
  await onUsage?.({...base,status:'started'});
  let requestId:string|null=null,responseDetails:Record<string,unknown>={};
  try{
   const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
    body:JSON.stringify({model:HEDGY_MODEL,reasoning:{effort:HEDGY_EFFORT},input,store:false,stream:true,...(format?{text:{format:{type:'json_schema',name:format.name,schema:z.toJSONSchema(format.schema),strict:false}}}:{})})});
   requestId=response.headers.get('x-request-id');
   if(!response.ok){
    // Keep structured provider diagnostics in private evidence, never in the public message.
    let providerError:unknown;try{providerError=(await response.json() as {error?:unknown}).error;}catch{}
    throw new AppError(502,'model_failed',`Model request failed (HTTP ${response.status})`,{httpStatus:response.status,providerError});
   }
   const r=await readResponse(response);
   const details=responseDetails={responseId:r.id,responseStatus:r.status,incompleteReason:r.incomplete_details?.reason,providerError:r.error,usage:r.usage};
   const outputText=(r.output??[]).flatMap(v=>v.content??[]).filter(v=>v.type==='output_text').map(v=>v.text??'').join('');
   await onUsage?.({...base,requestId,...details,status:r.status,seconds:(performance.now()-started)/1000,outputText});
   if(r.status==='failed')throw new AppError(502,'model_failed','Model generation failed',details);
   if(r.status!=='completed')throw new AppError(502,'generation_incomplete','Model output did not complete',details);
   if(!outputText.trim())throw new AppError(502,'model_output_empty','Completed model response contained no text',details);
   return outputText;
  }catch(error){
   const failure=error instanceof AppError?error:Object.assign(new AppError(502,'model_connection_failed','Model request or stream failed'),{cause:error});
   const details={...base,requestId,...responseDetails,...(failure.details as object)};
   // A failed evidence write must not replace the original provider/connection exception.
   try{await onUsage?.({...details,status:'failed',code:failure.code,seconds:(performance.now()-started)/1000});}catch{}
   throw Object.assign(new AppError(failure.status,failure.code,`Hedgy ${step}: ${failure.message}`,details),{cause:failure});
  }
 };
}
