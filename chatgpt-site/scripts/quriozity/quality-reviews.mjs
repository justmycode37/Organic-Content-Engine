import {createHash} from 'node:crypto';
import {mkdir,mkdtemp,readFile,writeFile,copyFile} from 'node:fs/promises';
import {join} from 'node:path';
import {QUALITY_REVIEW_VERSION,VOICE_PACING,validateDelivery,voicePacingMetrics} from '../../worker/quriozity-quality.ts';

export const reviewFingerprint=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const json=async file=>{try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}};
const save=(file,value)=>writeFile(file,JSON.stringify(value,null,1));
const measured=async(_name,fn)=>fn();
export const REVIEW_LIMITS=Object.freeze({visual:5,proposals:5,voice:5});
const visualRank=a=>{const must=a.verdict.findings.filter(f=>f.severity==='must-fix');return [a.verdict.passed&&!must.length?0:1,must.length,new Set(must.map(f=>f.scene)).size,a.verdict.findings.length,-a.attempt];};
const compareRank=(a,b)=>{for(let i=0;i<a.length;i++)if(a[i]!==b[i])return a[i]-b[i];return 0;};
export async function bestReviewedVisual(attempts){
 const ranked=[...attempts].sort((a,b)=>compareRank(visualRank(a),visualRank(b)));
 for(const attempt of ranked){
  const spec=await json(join(attempt.directory,'spec.before.json'));
  if(spec&&reviewFingerprint(spec)===attempt.beforeHash)return {spec,attempt,reason:'Passing verdict first, then fewer must-fix findings, fewer affected scenes, fewer total findings; newest reviewed version breaks ties.'};
 }
 throw new Error('No intact rendered-and-reviewed visual candidate is available');
}

/** Failed/invalid reviews never become an approved stage. Each repair gets fresh rendered evidence. */
export async function runVisualReviewStage({spec,stage,workdir,context={},renderEvidence,review,repair,measure=measured,onResult=async()=>{},maxRenderedReviews=REVIEW_LIMITS.visual,onExhaustion='best'}){
 if(!Number.isInteger(maxRenderedReviews)||maxRenderedReviews<1||maxRenderedReviews>30)throw new Error('Visual review bound must be between 1 and 30');
 const inputHash=reviewFingerprint({spec,stage,context}),dir=join(workdir,'reviews',stage.id,inputHash.slice(0,16));
 await mkdir(dir,{recursive:true});
 const accepted=await json(join(dir,'accepted.json'));
 if(accepted?.version===QUALITY_REVIEW_VERSION&&accepted.inputHash===inputHash&&accepted.passed===true&&accepted.outputHash===reviewFingerprint(accepted.spec)){
  await onResult(accepted);return accepted.spec;
 }
 const runDir=await mkdtemp(join(dir,'run-'));
 let current=spec;const attempts=[];
 const previous=await json(join(dir,'failure.json'));
 const chooseBest=async failure=>{
  const chosen=await bestReviewedVisual(attempts);
  const result={version:QUALITY_REVIEW_VERSION,stage:stage.id,inputHash,outputHash:reviewFingerprint(chosen.spec),passed:false,selectedBest:true,reviewLimit:maxRenderedReviews,selectedAttempt:chosen.attempt.attempt,selectionReason:chosen.reason,attempts,spec:chosen.spec,error:failure.error};
  await save(join(dir,'selected-best.json'),result);await onResult(result);return chosen.spec;
 };
 const applyRepair=async(record,evidence,attemptDir)=>{
  let feedback='';
  for(let proposal=1;proposal<=REVIEW_LIMITS.proposals;proposal++){
   const change=await measure(`${stage.id} repair ${record.attempt}.${proposal}`,()=>repair(current,record.verdict,stage,evidence,feedback));
   await save(join(attemptDir,`repair-${proposal}.json`),change);
   if(change.valid){
    if(reviewFingerprint(current)===reviewFingerprint(change.spec)){feedback='The failed spec was returned unchanged; fix the evidenced defects.';continue;}
    current=change.spec;record.afterHash=reviewFingerprint(current);record.repairDirectory=attemptDir;await save(join(attemptDir,'spec.after.json'),current);return;
   }
   feedback=change.problems.join('; ');
  }
  throw new Error(`${stage.id}: no valid repair; ${feedback}`);
 };
 try{
  if(previous?.attempts?.length){
   attempts.push(...previous.attempts.map(a=>({...a})));
   const last=attempts.at(-1),before=await json(join(last.directory,'spec.before.json'));
   if(!before||reviewFingerprint(before)!==last.beforeHash)throw new Error('Saved failed-review candidate is corrupt');
   current=before;
   if(attempts.length>=maxRenderedReviews){if(onExhaustion==='best')return chooseBest(previous);throw new Error(previous.error);}
   const after=last.afterHash?await json(join(last.directory,'spec.after.json')):null;
   if(after&&reviewFingerprint(after)===last.afterHash)current=after;
   else{
    const resumeDir=join(runDir,`resume-after-${last.attempt}`);await mkdir(resumeDir,{recursive:true});
    await save(join(resumeDir,'spec.before.json'),current);
    const evidence=await measure(`${stage.id} resumed repair evidence`,()=>renderEvidence(current,resumeDir,stage));
    await applyRepair(last,evidence,resumeDir);
   }
  }
  for(let attempt=attempts.length+1;attempt<=maxRenderedReviews;attempt++){
   const attemptDir=join(runDir,`attempt-${attempt}`);await mkdir(attemptDir,{recursive:true});
   await save(join(attemptDir,'spec.before.json'),current);
   const evidence=await measure(`${stage.id} evidence ${attempt}`,()=>renderEvidence(current,attemptDir,stage));
   const verdict=await measure(`${stage.id} ${attempt}`,()=>review(current,evidence,stage));
   await save(join(attemptDir,'verdict.json'),verdict);
   const record={attempt,beforeHash:reviewFingerprint(current),verdict,evidence:evidence.files??[],directory:attemptDir};attempts.push(record);
   if(verdict.passed&&!verdict.findings.some(f=>f.severity==='must-fix')){
    const result={version:QUALITY_REVIEW_VERSION,stage:stage.id,inputHash,outputHash:reviewFingerprint(current),passed:true,attempts,spec:current};
    await save(join(dir,'accepted.json'),result);await onResult(result);return current;
   }
   if(attempt===maxRenderedReviews)break;
   await applyRepair(record,evidence,attemptDir);
  }
  throw new Error(`${stage.id}: unresolved visual defects after ${maxRenderedReviews} rendered reviews`);
 }catch(e){const failure={version:QUALITY_REVIEW_VERSION,stage:stage.id,passed:false,attempts,error:e.message};await save(join(runDir,'failure.json'),failure);await save(join(dir,'failure.json'),failure);if(onExhaustion==='best'&&attempts.length)return chooseBest(failure);e.reviewFailure=failure;throw e;}
}

/** Reviews phrasing and actual timing; deliberately does not claim an audio listening judgement. */
export async function runVoiceReviews({text,workdir,context={},narrate,reviewDelivery,reviewPacing,measure=measured,onResult=async()=>{},maxTakes=REVIEW_LIMITS.voice,onExhaustion='best'}){
 if(!Number.isInteger(maxTakes)||maxTakes<1||maxTakes>20)throw new Error('Voice take bound must be between 1 and 20');
 const inputHash=reviewFingerprint({text,context,speedMode:'elevenlabs-default'}),dir=join(workdir,'reviews','voice',inputHash.slice(0,16));await mkdir(dir,{recursive:true});
 const accepted=await json(join(dir,'accepted.json'));
 if(accepted?.version===QUALITY_REVIEW_VERSION&&accepted.inputHash===inputHash&&accepted.passed===true){
  // Verify the actual audio/timings/settings, not just the old existence of a reviewed filename.
  const voice=await narrate(accepted.delivery,accepted.take);
  const metrics=voicePacingMetrics(voice.words,voice.total,accepted.delivery);
  const audioHash=reviewFingerprint((await readFile(voice.audio)).toString('base64'));
  if(!metrics.problems.length&&accepted.outputHash===reviewFingerprint({audioHash,words:voice.words,total:voice.total,delivery:accepted.delivery})){
   await onResult(accepted);return voice;
  }
 }
 const selected=await json(join(dir,'selected-best.json'));
 if(selected?.inputHash===inputHash&&selected.attempts?.length>=maxTakes){
  const chosen=selected.attempts.find(a=>a.take===selected.selectedTake);
  if(chosen){
   const audioHash=reviewFingerprint((await readFile(chosen.audio)).toString('base64'));
   if(selected.outputHash===reviewFingerprint({audioHash,words:chosen.words,total:chosen.total,delivery:chosen.delivery})){
    await onResult(selected);return {audio:chosen.audio,words:chosen.words,total:chosen.total,model:chosen.synthesis.model,voiceId:chosen.synthesis.voiceId,settings:chosen.synthesis.settings,seed:chosen.synthesis.seed};
   }
  }
 }
 const runDir=await mkdtemp(join(dir,'run-'));
 let delivery,lastVoice;const previous=await json(join(dir,'failure.json'));const attempts=[...(previous?.attempts??[])];
 for(const attempt of attempts)if(!Number.isFinite(attempt.total)){
  const generated=await json(attempt.audio.replace(/\.wav$/,'.generated.json'));
  if(generated)attempt.total=generated.total;
 }
 try{
  delivery=validateDelivery(attempts.length?attempts.at(-1).verdict.nextDelivery:await measure('voice delivery review',()=>reviewDelivery(text)),text);
  await save(join(runDir,'delivery.json'),delivery);
  for(let take=(attempts.at(-1)?.take??0)+1;take<=maxTakes;take++){
   const voice=await measure(`narration generation and preparation ${take}`,()=>narrate(delivery,take));
   lastVoice=voice;
   const audioFile=join(runDir,`take-${take}.wav`);await copyFile(voice.audio,audioFile);
   const synthesis={model:voice.model,voiceId:voice.voiceId,settings:voice.settings,seed:voice.seed};
   await save(join(runDir,`take-${take}.generated.json`),{take,delivery,synthesis,words:voice.words,total:voice.total,audio:audioFile});
   const metrics=voicePacingMetrics(voice.words,voice.total,delivery);
   const verdict=await measure(`voice pacing review ${take}`,()=>reviewPacing(text,delivery,metrics));
   const record={take,delivery,synthesis,metrics,verdict,audio:audioFile,words:voice.words,total:voice.total};attempts.push(record);await save(join(runDir,`take-${take}.json`),record);
   if(verdict.passed&&verdict.issues.length===0&&!metrics.problems.length){
    const audioHash=reviewFingerprint((await readFile(voice.audio)).toString('base64'));
    const result={version:QUALITY_REVIEW_VERSION,inputHash,outputHash:reviewFingerprint({audioHash,words:voice.words,total:voice.total,delivery}),passed:true,evidence:'text-and-generated-word-timings; no audio listening',delivery,take,attempts};
    await save(join(dir,'accepted.json'),result);await onResult(result);return voice;
   }
   if(take===maxTakes)break;
   const next=validateDelivery(verdict.nextDelivery,text);
   // A failed take is regenerated (new seed) even if the direction is unchanged.
   delivery=next;
  }
  throw new Error(`Voice pacing review: unresolved pacing findings after ${maxTakes} takes`);
 }catch(e){
  const failure={version:QUALITY_REVIEW_VERSION,passed:false,attempts,error:e.message};await save(join(runDir,'failure.json'),failure);await save(join(dir,'failure.json'),failure);
  if(onExhaustion==='best'&&attempts.length){
   const rank=a=>[a.metrics.problems.length,a.verdict.issues.length,-a.take];
   const chosen=[...attempts].sort((a,b)=>compareRank(rank(a),rank(b)))[0];
   const audioHash=reviewFingerprint((await readFile(chosen.audio)).toString('base64'));
   const outputHash=reviewFingerprint({audioHash,words:chosen.words,total:chosen.total,delivery:chosen.delivery});
   const result={...failure,inputHash,outputHash,selectedBest:true,selectedTake:chosen.take,selectionReason:'Fewest measured thought-boundary failures, then reviewer issues; newest take breaks ties. Every take retains provider-default speed.',evidence:'text-and-generated-word-timings; no audio listening',delivery:chosen.delivery};
   await save(join(dir,'selected-best.json'),result);await onResult(result);
   return {audio:chosen.audio,words:chosen.words,total:chosen.total,model:chosen.synthesis.model,voiceId:chosen.synthesis.voiceId,settings:chosen.synthesis.settings,seed:chosen.synthesis.seed};
  }
  e.voiceFailure=failure;e.lastVoice=lastVoice;throw e;
 }
}
