import {execFile} from 'node:child_process';
import {access,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {homedir,tmpdir} from 'node:os';
import {join} from 'node:path';
import {z} from 'zod';

const timeout=60*60*1000;
const quotaCodes=new Set(['usage_limit_reached','usage_limit_exceeded','usageLimitExceeded']);
const claudeWindows=new Set(['five_hour','seven_day','seven_day_opus','seven_day_sonnet','seven_day_haiku','overage']);
const json=value=>{try{return JSON.parse(value);}catch{return undefined;}};
const quota=resetAt=>({status:'subscription_exhausted',resetAt});

// The account worker also holds API, voice and publishing credentials.
// Child processes only need the user's standard CLI login and executable path.
function subscriptionEnv(env){
 return Object.fromEntries(['HOME','USER','LOGNAME','PATH','TMPDIR','LANG','LC_ALL'].filter(key=>env[key]).map(key=>[key,env[key]]));
}

async function executable(env,key,binary,candidates){
 if(env[key])return env[key];
 for(const candidate of candidates){
  try{await access(candidate);return candidate;}catch(error){if(error.code!=='ENOENT')throw error;}
 }
 return binary;
}

function runCli(binary,args,{cwd,env,input,timeoutMs=timeout}){
 return new Promise((resolve,reject)=>{
  const child=execFile(binary,args,{cwd,env,timeout:timeoutMs,killSignal:'SIGKILL',maxBuffer:48*1024*1024},(error,stdout,stderr)=>{
   if(error&&typeof error.code!=='number'){
    reject(new Error(`${binary} could not finish (${error.code??error.signal??'process error'})`));
    return;
   }
   resolve({exitCode:error?.code??0,stdout,stderr});
  });
  child.stdin.on('error',()=>{}); // CLIs can exit before consuming a large image or prompt.
  child.stdin.end(input);
 });
}

function codexResult({exitCode,stdout,stderr},structured){
 const events=stdout.split('\n').map(json).filter(Boolean);
 const final=events.at(-1);
 const output=events.filter(e=>e.type==='item.completed'&&e.item?.type==='agent_message').at(-1)?.item.text;
 if(exitCode===0&&final?.type==='turn.completed'&&output?.trim()){
  const text=structured?json(output)?.json:output;
  if(typeof text==='string'&&text.trim())return {status:'completed',text,usage:final.usage};
 }
 // Only a terminal admission rejection may fall back. An interrupted turn
 // that already produced an answer must consume its original attempt.
 if(exitCode!==0&&!output&&!events.some(e=>e.type.startsWith('item.')||e.type==='error'&&/^Reconnecting\b/i.test(e.message??''))){
  for(const e of events.filter(e=>e.type==='turn.failed'||e.type==='error').reverse()){
   const message=e.error?.message??e.message;
   const error=json(message)?.error??e.error;
   if(quotaCodes.has(error?.code??error?.type))return quota(error.resets_at);
   if(/^You(?:'|’)ve hit your usage limit\b/i.test(message??''))return quota();
  }
 }
 throw new Error(`Codex did not return a complete response: ${final?.error?.message??stderr.slice(-600)}`);
}

function claudeResult({exitCode,stdout,stderr},model){
 const events=stdout.split('\n').map(json).filter(Boolean);
 const messages=events.filter(e=>e.type==='assistant'&&!e.parent_tool_use_id);
 const result=events.filter(e=>e.type==='result').at(-1);
 const limits=events.filter(e=>e.type==='rate_limit_event').map(e=>e.rate_limit_info);
 const completed=messages.filter(e=>!e.error&&e.message?.id);
 const latest=completed.at(-1);
 if(exitCode===0&&result?.subtype==='success'&&result.stop_reason==='end_turn'&&result.num_turns===1&&result.result?.trim()&&
   latest?.message.model===model&&completed.every(e=>e.message.model===model)&&
   !events.some(e=>['api_retry','model_refusal_fallback'].includes(e.subtype))){
  return {status:'completed',text:result.result,usage:result.usage,requestId:latest.request_id};
 }
 // A burst, authentication or server error is distinct from a plan window
 // being exhausted. Do not resend if Claude already started model output.
 if(result?.is_error&&!completed.length&&!events.some(e=>['api_retry','model_refusal_fallback'].includes(e.subtype))){
  const rejected=limits.findLast(l=>l?.status==='rejected'&&(l.errorCode==='credits_required'||claudeWindows.has(l.rateLimitType)));
  if(rejected)return quota(rejected.resetsAt);
 }
 const reason=result?.errors?.[0]??messages.at(-1)?.error??result?.subtype??stderr.slice(-600);
 throw new Error(`Claude Code did not complete one ${model} turn: ${reason}`);
}

function promptFor({input,prefix,format},envelope=false){
 const schema=format?JSON.stringify(z.toJSONSchema(format.schema)):'';
 return [prefix?.trim(),input,schema&&`Return a JSON value matching this schema, with no Markdown: ${schema}`,
  envelope&&'Put the serialized JSON value in the json string field of the response envelope.'].filter(Boolean).join('\n\n');
}

async function codexRequest(request,settings,cwd,run){
 const binary=await executable(settings,'OCE_CODEX_BIN','codex',['/opt/homebrew/bin/codex','/usr/local/bin/codex']);
 const args=['exec','--json','--ephemeral','--ignore-user-config','--skip-git-repo-check','--sandbox','read-only',
  '--disable','shell_tool','--disable','unified_exec','--disable','multi_agent','--disable','plugins','--disable','skill_search',
  '-m',request.model,'-c',`model_reasoning_effort="${request.effort}"`,'-c','forced_login_method="chatgpt"','-c','web_search="disabled"'];
 for(const [index,image] of (request.images??[]).entries()){
  const extension={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif'}[image.mime];
  if(!extension)throw new Error(`Unsupported review image type: ${image.mime}`);
  const path=join(cwd,`frame-${index}.${extension}`);
  await writeFile(path,Buffer.from(image.base64,'base64'),{mode:0o600});
  args.push('--image',path);
 }
 if(request.format){
  const schema=join(cwd,'schema.json');
  await writeFile(schema,JSON.stringify({type:'object',properties:{json:{type:'string'}},required:['json'],additionalProperties:false}));
  args.push('--output-schema',schema);
 }
 args.push('--','-');
 return codexResult(await run(binary,args,{cwd,env:subscriptionEnv(settings),input:promptFor(request,!!request.format)}),!!request.format);
}

async function claudeRequest(request,settings,cwd,run){
 const binary=await executable(settings,'OCE_CLAUDE_BIN','claude',[join(settings.HOME??homedir(),'.local','bin','claude'),'/opt/homebrew/bin/claude','/usr/local/bin/claude']);
 const env={...subscriptionEnv(settings),CLAUDE_CODE_MAX_RETRIES:'0',CLAUDE_CODE_NONSTREAMING_TIMEOUT_RETRIES:'0',CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK:'1',
  CLAUDE_CODE_DISABLE_REFUSAL_RETRY:'1',CLAUDE_CODE_DISABLE_REFUSAL_FALLBACK:'1',
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1',DISABLE_AUTOUPDATER:'1'};
 const auth=await run(binary,['auth','status'],{cwd,env,timeoutMs:20000});
 const account=json(auth.stdout);
 if(auth.exitCode!==0||account?.loggedIn!==true||account.authMethod!=='claude.ai'||account.apiProvider!=='firstParty'){
  throw new Error('Claude Code needs a signed-in Claude subscription on the account worker Mac.');
 }
 const args=['-p','--input-format','stream-json','--output-format','stream-json','--verbose','--no-session-persistence',
  '--safe-mode','--strict-mcp-config','--tools','','--permission-mode','dontAsk','--max-turns','1','--model',request.model,'--effort',request.effort];
 const content=[{type:'text',text:promptFor(request)},...(request.images??[]).map(image=>({
  type:'image',source:{type:'base64',media_type:image.mime,data:image.base64}
 }))];
 const input=JSON.stringify({type:'user',message:{role:'user',content},parent_tool_use_id:null,session_id:''})+'\n';
 return claudeResult(await run(binary,args,{cwd,env,input}),request.model);
}

export function createReelSubscription({env=process.env,run=runCli,now=Date.now}={}){
 const exhaustedUntil=new Map();
 return async request=>{
  const {provider}=request;
  const resetAt=exhaustedUntil.get(provider);
  if(resetAt>now()/1000)return quota(resetAt);
  const cwd=await mkdtemp(join(tmpdir(),'oce-reel-'));
  try{
   const result=await (provider==='openai'?codexRequest:claudeRequest)(request,env,cwd,run);
   if(result.status==='subscription_exhausted'&&Number.isFinite(result.resetAt))exhaustedUntil.set(provider,result.resetAt);
   return result;
  }finally{await rm(cwd,{recursive:true,force:true});}
 };
}
