import {createHash} from 'node:crypto';
import {mkdir,mkdtemp,readFile,writeFile,copyFile} from 'node:fs/promises';
import {join} from 'node:path';
import {QUALITY_REVIEW_VERSION,VOICE_PACING,validateDelivery,voicePacingMetrics} from '../../worker/acryllex-quality.ts';

export const reviewFingerprint=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const json=async file=>{try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}};
const save=(file,value)=>writeFile(file,JSON.stringify(value,null,1));
const measured=async(_name,fn)=>fn();

/** Failed/invalid reviews never become a completed stage. Each repair gets fresh rendered evidence. */
export async function runVisualReviewStage({spec,stage,workdir,context={},renderEvidence,review,repair,measure=measured,onResult=async()=>{}}){
 const inputHash=reviewFingerprint({spec,stage,context}),dir=join(workdir,'reviews',stage.id,inputHash.slice(0,16));
 await mkdir(dir,{recursive:true});
 const accepted=await json(join(dir,'accepted.json'));
 if(accepted?.version===QUALITY_REVIEW_VERSION&&accepted.inputHash===inputHash&&accepted.passed===true&&accepted.outputHash===reviewFingerprint(accepted.spec)){
  await onResult(accepted);return accepted.spec;
 }
 const runDir=await mkdtemp(join(dir,'run-'));
 let current=spec;const attempts=[];
 try{
  for(let attempt=1;attempt<=3;attempt++){
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
   if(attempt===3)break;
   let feedback='',fixed=false;
   for(let proposal=1;proposal<=3;proposal++){
    const change=await measure(`${stage.id} repair ${attempt}.${proposal}`,()=>repair(current,verdict,stage,evidence,feedback));
    await save(join(attemptDir,`repair-${proposal}.json`),change);
    if(change.valid){
     if(reviewFingerprint(current)===reviewFingerprint(change.spec)){feedback='The failed spec was returned unchanged; fix the evidenced defects.';continue;}
     current=change.spec;record.afterHash=reviewFingerprint(current);
     await save(join(attemptDir,'spec.after.json'),current);fixed=true;break;
    }
    feedback=change.problems.join('; ');
   }
   if(!fixed)throw new Error(`${stage.id}: no valid repair; ${feedback}`);
  }
  throw new Error(`${stage.id}: unresolved visual defects after 3 rendered reviews`);
 }catch(e){const failure={version:QUALITY_REVIEW_VERSION,stage:stage.id,passed:false,attempts,error:e.message};await save(join(runDir,'failure.json'),failure);await save(join(dir,'failure.json'),failure);throw e;}
}

/** Reviews phrasing and actual timing; deliberately does not claim an audio listening judgement. */
export async function runVoiceReviews({text,workdir,context={},narrate,reviewDelivery,reviewPacing,measure=measured,onResult=async()=>{}}){
 const inputHash=reviewFingerprint({text,context}),dir=join(workdir,'reviews','voice',inputHash.slice(0,16));await mkdir(dir,{recursive:true});
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
 const runDir=await mkdtemp(join(dir,'run-'));
 let delivery;const attempts=[];
 try{
  delivery=validateDelivery(await measure('voice delivery review',()=>reviewDelivery(text)),text);
  await save(join(runDir,'delivery.json'),delivery);
  for(let take=1;take<=3;take++){
   const voice=await measure(`narration generation and preparation ${take}`,()=>narrate(delivery,take));
   const audioFile=join(runDir,`take-${take}.wav`);await copyFile(voice.audio,audioFile);
   const synthesis={model:voice.model,voiceId:voice.voiceId,settings:voice.settings,seed:voice.seed};
   await save(join(runDir,`take-${take}.generated.json`),{take,delivery,synthesis,words:voice.words,total:voice.total,audio:audioFile});
   const metrics=voicePacingMetrics(voice.words,voice.total,delivery);
   const verdict=await measure(`voice pacing review ${take}`,()=>reviewPacing(text,delivery,metrics));
   const record={take,delivery,synthesis,metrics,verdict,audio:audioFile,words:voice.words};attempts.push(record);await save(join(runDir,`take-${take}.json`),record);
   if(verdict.passed&&verdict.issues.length===0&&!metrics.problems.length){
    const audioHash=reviewFingerprint((await readFile(voice.audio)).toString('base64'));
    const result={version:QUALITY_REVIEW_VERSION,inputHash,outputHash:reviewFingerprint({audioHash,words:voice.words,total:voice.total,delivery}),passed:true,evidence:'text-and-generated-word-timings; no audio listening',delivery,take,attempts};
    await save(join(dir,'accepted.json'),result);await onResult(result);return voice;
   }
   const next=validateDelivery(verdict.nextDelivery,text);
   if(metrics.wpm>VOICE_PACING.maxWpm||metrics.fastestPhraseWpm>VOICE_PACING.maxPhraseWpm){
    next.speed=+Math.max(VOICE_PACING.minSpeed,Math.min(next.speed,delivery.speed*0.95,delivery.speed*VOICE_PACING.targetWpm/metrics.wpm)).toFixed(3);
   }
   // A failed take is regenerated (new seed) even if the direction is unchanged.
   delivery=next;
  }
  throw new Error('Voice pacing review: narration still rushed or missing natural pauses after 3 takes');
 }catch(e){const failure={version:QUALITY_REVIEW_VERSION,passed:false,attempts,error:e.message};await save(join(runDir,'failure.json'),failure);await save(join(dir,'failure.json'),failure);throw e;}
}
