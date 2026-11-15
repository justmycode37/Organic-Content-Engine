import {z} from 'zod';
import type {Ask} from './acryllex-generation.ts';
import {ACRYLLEX_POLICY} from './acryllex-policy.ts';
import type {AcryllexSpec} from '../src/acryllex/spec.ts';
import {specSchema,specProblems} from '../src/acryllex/schema.ts';
import {applyStyleProfile} from '../src/acryllex/style-profile.ts';
import {CAMERA_DIRECTION_RULES,cameraProblems,planCameras} from '../src/acryllex/camera-direction.ts';
import {SHOT_TRANSITION_RULES,transitionProblems,planTransitions} from '../src/acryllex/shot-transitions.ts';

export const QUALITY_REVIEW_VERSION=4;
export const VISUAL_REVIEW_STAGES=[
 {id:'visual-subject-review',focus:'Subject recognition, source fidelity, anatomy, physical contact and materials. Name the visible hero of EVERY scene. Flag crude substitutes, broken silhouettes, floating contacts, misleading diagrams and unsupported source articulation. A recognisable subject can still be physically wrong.'},
 {id:'visual-composition-review',focus:'Composition at phone size: hero size and crop, negative space, clutter, occlusion, contrast, black background, fixed ink style, headline/caption safe areas and readability. Check every scene, including frames during text reveal.'},
 {id:'visual-continuity-review',focus:'Visual storytelling and motion across the ordered frame samples: one continuous explanation, recurring anchor, consistent hue meanings, clear cause and effect, purposeful camera variety, stable geometry, entrances/exits, and handovers between scenes. Inspect both sides of every cut. These are sampled frames, not a full-motion playback; do not claim to have watched a video.'},
 {id:'visual-style-reference-review',focus:'Direct comparison against the owner-approved PERFECT animation-style reference attached to this review. The reference is the authority: compare contrast and black level, sparse shadow dots versus dense highlights, normalized dot pitch/spacing/roundness/softness, fixed ink, local grain activity, black negative space, typography/type-on treatment, camera motion and particle/morph/transition cadence. Inspect every scene and the matched temporal motion strips. Naming style:reference-recording is not proof of a match. Report visible mismatches with reference and reel frame evidence. Match the animation treatment across different subjects, not the reference subject matter. Normalize dot pitch to output width and allow composition appropriate to the reel aspect ratio; do not copy a specific reference scene layout. Prefer source/material/framing repairs within the shared calibrated profile; flag an actual calibration mismatch explicitly rather than pretending locked fields changed.'},
 {id:'visual-final-review',focus:'Final combined visual gate on the ACTUAL spoken word timings. Recheck subject realism, composition, text, continuity AND fidelity to the attached perfect owner style reference after all earlier repairs. Do actions and text land on the intended words? Can the viewer read and understand each scene before its cut? Inspect cut boundaries for blank frames and lost heroes. Report remaining regressions, including failures from any earlier visual specialty.'},
] as const;
export type VisualStage=typeof VISUAL_REVIEW_STAGES[number];
type Img={mime:string;base64:string};
type Catalog={text:string;assets:string;has:(id:string)=>boolean};
const parse=(raw:string)=>{try{return JSON.parse(raw);}catch{const m=/\{[\s\S]*\}/.exec(raw);if(m)return JSON.parse(m[0]);throw new Error('Review did not return JSON');}};
const verdictSchema=z.object({passed:z.boolean(),summary:z.string().min(1),findings:z.array(z.object({scene:z.number().int().min(1),severity:z.enum(['must-fix','suggestion']),problem:z.string(),evidence:z.string(),change:z.string()}).strict()).max(60)}).strict();
export type VisualVerdict=z.infer<typeof verdictSchema>;

/** A review is a verdict on the supplied rendered evidence, separate from authoring a repair. */
export async function reviewVisuals(ask:Ask,spec:AcryllexSpec,sheets:Img[],frameIndex:string,_cat:Catalog,thread='',stage:VisualStage=VISUAL_REVIEW_STAGES[0]){
 if(['visual-style-reference-review','visual-final-review'].includes(stage.id)&&(!frameIndex.includes('OWNER-APPROVED PERFECT STYLE REFERENCE')||sheets.length<3))throw new Error(`${stage.id}: owner style-reference evidence is required`);
 const raw=await ask(stage.id,`You are an independent ACRYLLEX visual reviewer. Required focus: ${stage.focus}\nPolicy: ${JSON.stringify(ACRYLLEX_POLICY)}\nGolden thread: ${thread}\nAttached evidence: ${frameIndex}\nJudge the RENDERED frames, not the author's intentions. Inspect every scene in order, at early/middle/late points and cut boundaries. Source comparisons establish source fidelity, not unverified realism or animation capability. Identify concrete scene/frame evidence for each finding and a feasible change. Keep suggestions separate from must-fix defects. passed=true only when no must-fix findings remain. Do not make cosmetic changes to manufacture a review benefit. Return a verdict only; a separate author repairs failures.\nSpec with narration: ${JSON.stringify(spec)}`,0,{name:'acryllex_visual_verdict',schema:verdictSchema},sheets);
 const verdict=verdictSchema.parse(parse(raw));
 if(verdict.findings.some(f=>f.scene>spec.scenes.length))throw new Error(`${stage.id}: finding references a missing scene`);
 return {...verdict,passed:verdict.passed&&!verdict.findings.some(f=>f.severity==='must-fix')};
}

/** Runtime timing fields are not authorable; preserve them exactly through a visual repair. */
function authorSpec(spec:AcryllexSpec){
 const {beat:_,...base}=spec;
 return {...base,scenes:base.scenes.map(({words:_,...scene})=>({...scene,
  // The camera planner emits 40ms hard cuts; the authoring schema starts at
  // 50ms. Present a valid authoring value that still qualifies as a hard cut.
  ...(scene.events?{events:scene.events.map(e=>e.camera&&e.easing==='hold'&&e.dur===0.04?{...e,dur:0.05}:e)}:{}),
 }))};
}
export async function repairVisuals(ask:Ask,spec:AcryllexSpec,review:VisualVerdict,cat:Catalog,stage:VisualStage,sheets:Img[],validationFeedback=''){
 const raw=await ask(`${stage.id}-repair`,`${JSON.stringify(ACRYLLEX_POLICY)}\n${CAMERA_DIRECTION_RULES}\n${SHOT_TRANSITION_RULES}\nRepair the must-fix findings from ${stage.id}: ${JSON.stringify(review)}. Preserve good earlier work. Keep scene count, order and EVERY say line EXACTLY. Never change duration; runtime words/beat are restored separately. Use at most four objects per scene. Keep event durations >=0.05 seconds. For authored camera hard cuts use easing:"hold", dur:0.05; the 0.04 value in the shot rules describes internal planner output and is not valid authoring JSON. Use only verified catalogue assets and supported controls; do not invent a source/rig. If the requested repair needs an unavailable asset, leave the issue unresolved rather than fake one. Return the complete authorable spec JSON.\nPrevious invalid proposal feedback: ${validationFeedback||'none'}\nCatalogue: ${cat.text}\nAssets: ${cat.assets}\nInput spec: ${JSON.stringify(authorSpec(spec))}\nSchema: ${JSON.stringify(z.toJSONSchema(specSchema))}`,0,{name:'acryllex_visual_repair',schema:specSchema},sheets);
 let data:unknown;try{data=parse(raw);}catch{return {valid:false as const,problems:['invalid JSON'],proposal:raw};}
 const p=specSchema.safeParse(data);
 if(!p.success)return {valid:false as const,problems:p.error.issues.map(e=>`${e.path.join('.')}: ${e.message}`),proposal:raw};
 const cameras=planCameras(applyStyleProfile({...p.data,style:'reference-recording'} as AcryllexSpec));
 const cuts=planTransitions(cameras.spec);const proposed=cuts.spec;
 const problems=[...specProblems(proposed,cat.has),...cameraProblems(proposed),...transitionProblems(proposed)];
 if(proposed.scenes.length!==spec.scenes.length||proposed.scenes.some((s,i)=>s.say!==spec.scenes[i]?.say))problems.push('Narration/scene order changed');
 if(proposed.scenes.some((s,i)=>s.duration!==spec.scenes[i]?.duration))problems.push('Scene duration changed');
 if(problems.length)return {valid:false as const,problems,proposal:raw};
 const out={...proposed,title:spec.title,musicBrief:spec.musicBrief,...(spec.beat?{beat:spec.beat}:{}),scenes:proposed.scenes.map((s,i)=>({...s,...(spec.scenes[i]!.words?{words:spec.scenes[i]!.words}:{})}))};
 return {valid:true as const,spec:out,changes:[...cameras.changes,...cuts.changes],proposal:raw};
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
export async function reviewNarrationDelivery(ask:Ask,text:string){
 const raw=await ask('voice-delivery-review',`Review this narration for natural connected speech to one curious person. ElevenLabs must use its unchanged DEFAULT SPEED. Do not propose a speed setting, slowing, speeding up or time stretching. Mark natural thought boundaries with punctuation; allow a sentence to flow across visual scene cuts. Keep EVERY word, spelling, order and whitespace word boundary; only punctuation may change. Preserve contractions and hyphens within words. Select at most eight meaningful thought boundaries using 1-based whitespace word indices, with brief pause hints. Never pause just because a scene ends, never inside a connected phrase, and never add long pauses to hit a word-rate target. Pause hints are guidance, not mandatory silence lengths. This is text direction, not an audio listening review.\nNarration: ${text}`,0,{name:'acryllex_delivery',schema:deliverySchema});
 return validateDelivery(parse(raw),text);
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
 const raw=await ask('voice-pacing-review',`Review the GENERATED narration's word timings at ElevenLabs' unchanged DEFAULT SPEED. Speed must never be changed. WPM and fastest-phrase measurements are descriptive, not pass/fail thresholds; do not fail a take solely for those numbers or ask for slower speech. Check connected phrasing, genuinely missing thought boundaries and disruptive internal pauses. Preferred pause hints are guidance; a small shortfall is not a defect when the boundary is clear. If needed, suggest punctuation only. Keep every word and whitespace word boundary unchanged; do not insert SSML/audio tags or add long silences to reach a word-rate target. On a pass, nextDelivery must equal the current delivery. You have TEXT AND ALIGNMENT ONLY; no audio is attached. Do not claim to hear pronunciation, emotion, timbre, breaths or artifacts, or certify audible naturalness.\nOriginal: ${text}\nDirection: ${JSON.stringify(delivery)}\nActual measurements: ${JSON.stringify(metrics)}\nTiming policy: ${JSON.stringify(VOICE_PACING)}`,0,{name:'acryllex_voice_verdict',schema:voiceVerdictSchema});
 const verdict=voiceVerdictSchema.parse(parse(raw));
 validateDelivery(verdict.nextDelivery,text);
 return {...verdict,passed:verdict.passed&&verdict.issues.length===0&&metrics.problems.length===0,evidence:'text-and-generated-word-timings; no audio listening'};
}
