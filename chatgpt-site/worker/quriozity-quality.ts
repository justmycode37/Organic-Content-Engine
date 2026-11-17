import {z} from 'zod';
import type {Ask} from './quriozity-generation.ts';
import {QURIOZITY_POLICY} from './quriozity-policy.ts';
import type {QuriozitySpec} from '../src/quriozity/spec.ts';
import {specSchema,sceneSchema,specProblems} from '../src/quriozity/schema.ts';
import {CAMERA_DIRECTION_RULES,cameraProblems} from '../src/quriozity/camera-direction.ts';
import {SHOT_TRANSITION_RULES,transitionProblems} from '../src/quriozity/shot-transitions.ts';
import {SOL_STAGE_REPAIR_LIMIT} from './quriozity-model-policy.ts';
import {catalogContext,specCatalogIds,type Catalog} from './quriozity-catalog-context.ts';
import {applyVisualPatches,visualPatchSchema} from './quriozity-visual-patches.ts';

export const QUALITY_REVIEW_VERSION=7;
export const VISUAL_REVIEW_STAGES=[
 {id:'visual-subject-review',focus:'Subject recognition, source fidelity, anatomy, physical contact and materials. Name the visible hero of EVERY scene. Flag crude substitutes, broken silhouettes, floating contacts, misleading diagrams and unsupported source articulation. A recognisable subject can still be physically wrong.'},
 {id:'visual-composition-review',focus:'Composition at phone size: hero size and crop, negative space, clutter, occlusion, contrast, pure white paper background, black fixed ink style with only essential rare accents, headline/caption safe areas and readability. Check every scene, including frames during text reveal.'},
 {id:'visual-continuity-review',focus:'Visual storytelling and motion across the ordered frame samples: one continuous explanation, recurring anchor, consistent hue meanings, clear cause and effect, purposeful camera variety, stable geometry, entrances/exits, and handovers between scenes. Inspect both sides of every cut. These are sampled frames, not a full-motion playback; do not claim to have watched a video.'},
 {id:'visual-style-reference-review',focus:'Direct comparison against the owner-approved PERFECT animation-style reference attached to this review. The reference is the authority: compare ink/paper separation, sparse shadow dots versus dense lit coverage, normalized dot pitch/spacing/roundness/softness, fixed ink, local grain activity, black negative space, typography/type-on treatment, camera motion and particle/morph/transition cadence. Inspect every scene and the matched temporal motion strips. Naming style:reference-recording is not proof of a match. Report visible mismatches with reference and reel frame evidence. The owner explicitly changed the original blue-on-black recording to white paper and black ink; do not flag that requested polarity/color change as a mismatch. Compare normalized ink coverage, dot structure and motion. Match the animation treatment across different subjects, not the reference subject matter. Normalize dot pitch to output width and allow composition appropriate to the reel aspect ratio; do not copy a specific reference scene layout. Prefer source/material/framing repairs within the shared calibrated profile; flag an actual calibration mismatch explicitly rather than pretending locked fields changed.'},
 {id:'visual-final-review',focus:'Final combined visual gate on the ACTUAL spoken word timings. Recheck subject realism, composition, text, continuity AND fidelity to the attached perfect owner style reference after all earlier repairs. Do actions and text land on the intended words? Can the viewer read and understand each scene before its cut? Inspect cut boundaries for blank frames and lost heroes. Report remaining regressions, including failures from any earlier visual specialty.'},
] as const;
export type VisualStage=typeof VISUAL_REVIEW_STAGES[number];
type Img={mime:string;base64:string};
const parse=(raw:string)=>{try{return JSON.parse(raw);}catch{const m=/\{[\s\S]*\}/.exec(raw);if(m)return JSON.parse(m[0]);throw new Error('Review did not return JSON');}};
export const verdictSchema=z.object({passed:z.boolean(),summary:z.string().min(1),findings:z.array(z.object({scene:z.number().int().min(1),severity:z.enum(['must-fix','suggestion']),problem:z.string(),evidence:z.string(),change:z.string()}).strict()).max(60)}).strict();
export type VisualVerdict=z.infer<typeof verdictSchema>;

/** A review is a verdict on the supplied rendered evidence, separate from authoring a repair. */
export async function reviewVisuals(ask:Ask,spec:QuriozitySpec,sheets:Img[],frameIndex:string,_cat:Catalog,thread='',stage:VisualStage=VISUAL_REVIEW_STAGES[0]){
 if(['visual-style-reference-review','visual-final-review'].includes(stage.id)&&(!frameIndex.includes('OWNER-APPROVED PERFECT STYLE REFERENCE')||sheets.length<3))throw new Error(`${stage.id}: owner style-reference evidence is required`);
 const prefix=`You are an independent QURIOZITY visual reviewer.\nPolicy: ${JSON.stringify(QURIOZITY_POLICY)}\nJudge the RENDERED frames, not the author's intentions. Inspect every scene in order, at early/middle/late points and cut boundaries. Source comparisons establish source fidelity, not unverified realism or animation capability. Identify concrete scene/frame evidence for each finding and a feasible change. Keep suggestions separate from must-fix defects. passed=true only when no must-fix findings remain. Do not make cosmetic changes to manufacture a review benefit. Return a verdict only; a separate author repairs failures.`;
 const raw=await ask(stage.id,`Required focus: ${stage.focus}\nGolden thread: ${thread}\nAttached evidence: ${frameIndex}\nSpec with narration: ${JSON.stringify(spec)}`,0,{name:'quriozity_visual_verdict',schema:verdictSchema},sheets,{prefix});
 const verdict=verdictSchema.parse(parse(raw));
 if(verdict.findings.some(f=>f.scene>spec.scenes.length))throw new Error(`${stage.id}: finding references a missing scene`);
 return {...verdict,passed:verdict.passed&&!verdict.findings.some(f=>f.severity==='must-fix')};
}

/** Runtime timing fields are not authorable; preserve them exactly through a visual repair. */
export function authorSpec(spec:QuriozitySpec){
 const {beat:_,...base}=spec;
 return {...base,scenes:base.scenes.map(({words:_,...scene})=>({...scene,
  // The camera planner emits 40ms hard cuts; the authoring schema starts at
  // 50ms. Present a valid authoring value that still qualifies as a hard cut.
  ...(scene.events?{events:scene.events.map(e=>e.camera&&e.easing==='hold'&&e.dur===0.04?{...e,dur:0.05}:e)}:{}),
 }))};
}
export async function repairVisuals(ask:Ask,spec:QuriozitySpec,review:VisualVerdict,cat:Catalog,stage:Pick<VisualStage,'id'>|{id:'storyboard-review'},sheets:Img[],validationFeedback=''){
 const allowed=new Set(review.findings.filter(f=>f.severity==='must-fix').map(f=>f.scene));
 const author=authorSpec(spec),query=`${spec.title} ${spec.scenes.map(s=>s.say).join(' ')}`;
 const prefix=`${JSON.stringify(QURIOZITY_POLICY)}\n${CAMERA_DIRECTION_RULES}\n${SHOT_TRANSITION_RULES}\nMake targeted JSON Pointer patches within the evidenced scenes, never rewrite a whole reel. Only visual fields are editable; narration, durations, words, scene order and global settings are protected. Use at most four objects per scene and event durations >=0.05. For authored camera hard cuts use easing:"hold", dur:0.05; 0.04 is internal planner output. For set, valueJson contains the JSON-encoded value; for remove it is empty. A nested parent must exist; otherwise set the enclosing field. Arrays use zero-based indices; /- appends. Keep good earlier work and use only documented assets/controls. Do not fake unavailable sources or rigs.\n${catalogContext(cat,{query,required:specCatalogIds(spec)})}\nScene field schema (say/duration are context only): ${JSON.stringify(z.toJSONSchema(sceneSchema))}`;
 const scenes=author.scenes.flatMap((s,i)=>allowed.has(i+1)?[{scene:i+1,...s}]:[]);
 const journey=spec.scenes.map((s,i)=>({scene:i+1,say:s.say,hue:s.hue,models:s.objects.map(o=>o.model),camera:s.camera}));
 const raw=await ask(`${stage.id}-repair`,`Repair must-fix findings from ${stage.id}: ${JSON.stringify(review)}\nPrevious invalid proposal feedback: ${validationFeedback||'none'}\nReel journey (context only): ${JSON.stringify(journey)}\nEditable scenes: ${JSON.stringify(scenes)}`,0,{name:'quriozity_visual_patch',schema:visualPatchSchema},sheets,{prefix});
 let data:unknown;try{data=parse(raw);}catch{return {valid:false as const,problems:['invalid JSON'],proposal:raw};}
 let patched:ReturnType<typeof applyVisualPatches>;
 try{patched=applyVisualPatches(author,data,allowed);}catch(error){return {valid:false as const,problems:[(error as Error).message],proposal:raw};}
 const p=specSchema.safeParse(patched.spec);
 if(!p.success)return {valid:false as const,problems:p.error.issues.map(e=>`${e.path.join('.')}: ${e.message}`),proposal:raw};
 // Apply the validated patches to the runtime original. Do not run journey-wide
 // planners here: even the changed scene's unrelated fields must stay intact.
 const proposed=applyVisualPatches(spec,data,allowed).spec;
 const problems=[...specProblems(proposed,cat.has),...cameraProblems(proposed),...transitionProblems(proposed)];
 if(proposed.scenes.length!==spec.scenes.length||proposed.scenes.some((s,i)=>s.say!==spec.scenes[i]?.say))problems.push('Narration/scene order changed');
 if(proposed.scenes.some((s,i)=>s.duration!==spec.scenes[i]?.duration))problems.push('Scene duration changed');
 if(problems.length)return {valid:false as const,problems,proposal:raw};
 const out={...proposed,title:spec.title,musicBrief:spec.musicBrief,...(spec.beat?{beat:spec.beat}:{}),scenes:proposed.scenes.map((s,i)=>({...s,...(spec.scenes[i]!.words?{words:spec.scenes[i]!.words}:{})}))};
 return {valid:true as const,spec:out,changes:visualPatchSchema.parse(data).patches.map(p=>`scene ${p.scene}: ${p.op} ${p.path}`),proposal:raw};
}

// Native provider speed is fixed. Timing measurements never authorize a rate change.
export const VOICE_PACING={speedMode:'elevenlabs-default',minSentencePause:0.18} as const;
export const spokenTokens=(text:string)=>text.toLowerCase().match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)??[];
const deliverySchema=z.object({text:z.string().min(1),notes:z.string(),pauses:z.array(z.object({afterWord:z.number().int().min(1),minSeconds:z.number().min(0.18).max(1.5),why:z.string()}).strict()).max(8)}).strict();
export type Delivery=z.infer<typeof deliverySchema>;
export function validateDelivery(value:unknown,original:string){
 const d=deliverySchema.parse(value);
 // Words AND whitespace boundaries stay identical, so captions and scene-word mapping remain valid.
 const chunks=(s:string)=>s.trim().split(/\s+/).map(w=>spokenTokens(w).join('|'));
 if(JSON.stringify(chunks(d.text))!==JSON.stringify(chunks(original)))throw new Error('Voice delivery must preserve every spoken word and word boundary; punctuation only');
 const count=original.trim().split(/\s+/).length;
 if(d.pauses.some(p=>p.afterWord>=count))throw new Error('Voice pause must precede another word');
 return d;
}
export async function reviewNarrationDelivery(ask:Ask,text:string,onAttempt?:(record:{attempt:number;raw:string;valid:boolean;error?:string})=>Promise<unknown>,onExhaustion:'stop'|'best'='stop'){
 const prompt=`Review this narration for natural connected speech to one curious person. ElevenLabs must use its unchanged DEFAULT SPEED. Do not propose a speed setting, slowing, speeding up or time stretching. Mark natural thought boundaries with punctuation; allow a sentence to flow across visual scene cuts. Keep EVERY word, spelling, order and whitespace word boundary; only punctuation may change. Preserve contractions and hyphens within words. Select at most eight meaningful thought boundaries using 1-based whitespace word indices, with brief pause hints between 0.18 and 1.5 seconds. Never pause just because a scene ends, never inside a connected phrase, and never add long pauses to hit a word-rate target. Pause hints are guidance, not mandatory silence lengths. This is text direction, not an audio listening review.\nNarration: ${text}`;
 let feedback='';
 for(let attempt=0;attempt<=SOL_STAGE_REPAIR_LIMIT;attempt++){
  const raw=await ask(attempt?'voice-delivery-review-repair':'voice-delivery-review',`${prompt}${feedback}`,0,{name:'quriozity_delivery',schema:deliverySchema});
  let delivery:Delivery;
  try{delivery=validateDelivery(parse(raw),text);}
  catch(error){
   await onAttempt?.({attempt,raw,valid:false,error:(error as Error).message});
   if(attempt===SOL_STAGE_REPAIR_LIMIT){
    if(onExhaustion!=='best')throw error;
    const original={text,notes:'Retained original reviewed narration after all delivery corrections were invalid; provider-default speed.',pauses:[]};
    await onAttempt?.({attempt:attempt+1,raw:JSON.stringify(original),valid:true,error:'Delivery corrections exhausted; original reviewed words retained.'});
    return validateDelivery(original,text);
   }
   feedback=`\nCorrect the invalid direction using the original narration and the schema. Validation: ${(error as Error).message}. Previous response: ${raw}`;
   continue;
  }
  await onAttempt?.({attempt,raw,valid:true});return delivery;
 }
 throw new Error('Voice delivery repair limit reached');
}
type Word={text:string;start:number;end:number};
export function voicePacingMetrics(words:Word[],total:number,delivery:Delivery){
 const original=delivery.text.trim().split(/\s+/);
 if(!words.length||words.length!==original.length||!Number.isFinite(total)||total<=0)throw new Error('Voice alignment must match the narration before pacing review');
 words.forEach((w,i)=>{if(JSON.stringify(spokenTokens(w.text))!==JSON.stringify(spokenTokens(original[i]!))||!Number.isFinite(w.start)||!Number.isFinite(w.end)||w.start<0||w.end<=w.start||w.end>total+0.03||i>0&&w.start<words[i-1]!.end-0.03)throw new Error(`Invalid voice alignment at word ${i+1}`);});
 const span=words.at(-1)!.end-words[0]!.start;
 const wpm=60*words.length/span;
 let fastestPhraseWpm=0;
 for(let i=0;i+12<=words.length;i++)fastestPhraseWpm=Math.max(fastestPhraseWpm,720/(words[i+11]!.end-words[i]!.start));
 const gaps=words.slice(0,-1).map((w,i)=>({afterWord:i+1,text:w.text,gapSeconds:+Math.max(0,words[i+1]!.start-w.end).toFixed(3)}));
 const requested=new Map(delivery.pauses.map(p=>[p.afterWord,p.minSeconds]));
 const pauses=gaps.filter(g=>requested.has(g.afterWord)||/[.!?]["'”’)]*$/.test(original[g.afterWord-1]!)).map(g=>({...g,minimumSeconds:VOICE_PACING.minSentencePause,preferredSeconds:requested.get(g.afterWord)}));
 const problems=pauses.filter(p=>p.gapSeconds+0.015<p.minimumSeconds).map(p=>`Missing thought boundary after word ${p.afterWord}: ${p.gapSeconds}s, needs ${p.minimumSeconds}s`);
 return {wordCount:words.length,totalSeconds:total,wpm:+wpm.toFixed(1),fastestPhraseWpm:+fastestPhraseWpm.toFixed(1),pauses,gaps,problems};
}
const voiceVerdictSchema=z.object({passed:z.boolean(),summary:z.string(),issues:z.array(z.string()),nextDelivery:deliverySchema}).strict();
export async function reviewVoicePacing(ask:Ask,text:string,delivery:Delivery,metrics:ReturnType<typeof voicePacingMetrics>){
 const raw=await ask('voice-pacing-review',`Review the GENERATED narration's word timings at ElevenLabs' unchanged DEFAULT SPEED. Speed must never be changed. WPM and fastest-phrase measurements are descriptive, not pass/fail thresholds; do not fail a take solely for those numbers or ask for slower speech. Check connected phrasing, genuinely missing thought boundaries and disruptive internal pauses. Preferred pause hints are guidance; a small shortfall is not a defect when the boundary is clear. If needed, suggest punctuation only. Keep every word and whitespace word boundary unchanged; do not insert SSML/audio tags or add long silences to reach a word-rate target. On a pass, nextDelivery must equal the current delivery. You have TEXT AND ALIGNMENT ONLY; no audio is attached. Do not claim to hear pronunciation, emotion, timbre, breaths or artifacts, or certify audible naturalness.\nOriginal: ${text}\nDirection: ${JSON.stringify(delivery)}\nActual measurements: ${JSON.stringify(metrics)}\nTiming policy: ${JSON.stringify(VOICE_PACING)}`,0,{name:'quriozity_voice_verdict',schema:voiceVerdictSchema});
 const verdict=voiceVerdictSchema.parse(parse(raw));
 validateDelivery(verdict.nextDelivery,text);
 return {...verdict,passed:verdict.passed&&verdict.issues.length===0&&metrics.problems.length===0,evidence:'text-and-generated-word-timings; no audio listening'};
}
