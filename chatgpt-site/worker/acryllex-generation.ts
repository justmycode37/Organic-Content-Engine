import {z} from 'zod';
import {ACRYLLEX_POLICY} from './acryllex-policy.ts';
import {specSchema,specProblems} from '../src/acryllex/schema.ts';
import type {AcryllexSpec} from '../src/acryllex/spec.ts';

/** Every ACRYLLEX step runs on gpt-6.1-sol at medium reasoning effort (owner rule). */
const MODEL='gpt-6.1-sol',EFFORT='medium';

export interface AcryllexHistoryEntry {title?:string;topic?:string;summary?:string}
type Usage=(entry:unknown)=>void;
type Img={mime:string;base64:string};

export function solClient(key:string,onUsage?:Usage){
 return async function ask(step:string,input:string,max:number,format?:{name:string;schema:z.ZodType},images:Img[]=[]){
  const content:unknown[]=[{type:'input_text',text:input},...images.map(i=>({type:'input_image',image_url:`data:${i.mime};base64,${i.base64}`}))];
  let last='';
  for(let attempt=0;attempt<3;attempt++){
   const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
    body:JSON.stringify({model:MODEL,reasoning:{effort:EFFORT},input:[{role:'user',content}],max_output_tokens:max,store:false,...(format?{text:{format:{type:'json_schema',name:format.name,schema:z.toJSONSchema(format.schema),strict:false}}}:{})}),signal:AbortSignal.timeout(300000)});
   if(!response.ok){last=`${response.status}`;if(response.status>=500||response.status===429){await new Promise(r=>setTimeout(r,4000*(attempt+1)));continue;}throw new Error(`Sol request failed (${response.status}) at step ${step}`);}
   const r=await response.json() as {usage?:unknown;status?:string;output?:{content?:{type:string;text?:string}[]}[]};
   onUsage?.({step,model:MODEL,effort:EFFORT,usage:r.usage,status:r.status});
   if(r.status!=='completed'){last=String(r.status);continue;}
   return (r.output??[]).flatMap(v=>v.content??[]).filter(v=>v.type==='output_text').map(v=>v.text??'').join('');
  }
  throw new Error(`Sol step ${step} did not complete (${last})`);
 };
}
export type Ask=ReturnType<typeof solClient>;
const json=(t:string)=>{try{return JSON.parse(t)}catch{const m=/\{[\s\S]*\}/.exec(t);if(m)try{return JSON.parse(m[0])}catch{}return undefined}};

export const ACRYLLEX_TOPIC_SEEDS=[
 'Why the blue LED was so hard to invent','Why we sleep','Why we dream','Why the sky is blue','Why ice floats','Why we yawn','Why onions make you cry','How a tiny chip holds billions of switches',
 'Why airplanes can fly','Why the ocean is salty','How a microwave heats food','Why cats purr','Why we get goosebumps','How GPS knows where you are','Why time slows near a black hole','Why bubbles are round',
 'How noise-cancelling headphones work','Why leaves change colour','Why we have fingerprints','How vaccines teach your body','Why glass is transparent','How birds navigate','Why a spinning top stays up','Why we hiccup',
];

const ideaSchema=z.object({topic:z.string(),question:z.string(),hook:z.string(),angle:z.string(),facts:z.array(z.string()).min(4).max(12),heroObjects:z.array(z.string()).max(8),twist:z.string(),answer:z.string()}).strict();
const scriptSchema=z.object({title:z.string().max(90),lines:z.array(z.string().min(3).max(220)).min(8).max(16),musicBrief:z.string().max(400),factNotes:z.array(z.string()).max(12)}).strict();
const reviewSchema=z.object({ok:z.boolean(),problems:z.array(z.string()).max(20)}).strict();

const STORY_RULES=`NARRATION: 100-140 spoken words total, split into 12-16 short lines; each line is ONE scene (5-12 words) so the picture cuts fast. Storytelling like a great documentary narrator talking to a friend: open with a hook question or striking everyday image the viewer has wondered about (no greeting), build a concrete journey with stakes and a twist (who tried, what failed, what changed), then a satisfying, clear answer and a short memorable last line. Simple words, short sentences, concrete numbers only when correct. No CTA, no "did you know", no "let's dive in".\nTALK ABOUT THE REAL THINGS: name and describe the actual subject (DNA, genes, cells, the banana, the person) in most lines; use at most one short analogy in the whole script, never an extended metaphor that replaces the subject. Lead with the surprising fact, then explain what it truly means.\nPLAIN LANGUAGE IS MANDATORY: a curious 12-year-old must understand every sentence on first listen. No jargon (never words like p-type, band gap, energy gap, charge carriers, substrate, doping, photons, wavelength-nm); replace mechanisms with everyday analogies and concrete images ("the crystal kept cracking like thin ice"). Prefer people doing things and physical objects over abstract physics: every line must be something a camera could film (a person, a machine, a crystal, a lamp, a phone). At most one technical name in the whole script. It is better to explain ONE idea beautifully than five precisely.`;

const VISUAL_RULES=`VISUAL LANGUAGE (ACRYLLEX): pure black stage; each scene has ONE hue (blue, azure, red, white, amber, green, cyan, violet, orange, pink) and the objects are real 3D models drawn as dither dots in that hue. Use hue as meaning and keep it consistent (e.g. the hero subject in blue, problems/failure in red, history/people in white, success in the subject's real colour). Objects may override hue for real colours that matter (red/green/blue LEDs).
RECOGNISABILITY IS THE TOP RULE: one big hero object per scene (2-3 things max, people count). A stranger with the sound off must name every object and say what HAPPENS. Pick the model whose describe line matches; set its params; choose a camera angle that shows its silhouette (three-quarter is default; front for faces/screens and for people walking left/right, who are then seen in profile; top for maps/boards). People are real motion-captured human figures: use them whenever the story has a person (inventor, scientist, sleeper, crowd of 2-3). The camera auto-frames the objects; use camera.fill 0.6-0.95 and camera.focus/camera events for close-ups ("inside the chip").
ACTION AND PACE (the reel is cut to a 100 BPM beat — it must feel energetic, never a slideshow): 2-4 events in EVERY scene so something changes about every 0.6-1 s (object arrives, morphs, lights up, turns, cracks, a person walks/turns/points, the camera pushes or snaps to a close-up); stagger them through the sentence; start each scene with motion already happening (enterAt 0). Use morphs often, camera events in at least a third of the scenes, and vary entrances (assemble, drop, pop, slide, walk-in). Every scene visibly acts out its sentence. Put events on the spoken word where the action happens: set controls (glow 1 on "lit", crack 1 on "cracked", open 1 on "opened"), pose changes for people (sit, type, sleep, think, point, cheer, tired, look-up...), move (walk to another object: move.near + side), turn, scaleTo, hue change, show/hide (materialize, assemble, pop, drop, shatter, dissolve), camera moves. 1-4 events per scene; something meaningful changes every ~1 s. Entrances: materialize (default), assemble (voxels fly together, great for "built", "invented"), pop, drop, rise, walk-in-left/right for people. Exits rarely (shatter for "failed", "broke"). MORPH (signature move): one object turns into another as a swirling point cloud — declare the second object in the same scene with enter:"none", then event {at:"word", target:"first", morph:"second"}; use it for change over time (old → new, cause → result, abacus → calculator → laptop), several in a row is great. OBJECT EFFECTS (one-shot, on the spoken word, never change what the object is): event {at:"word", target:"id", fx:"..."} with fx = heartbeat (pounds once like a heart; fxCount 2-3 for a beating heart), shockwave (a bright wave runs over the surface as it absorbs a hit; fxFrom: top/left/right/front/... = where it is hit), ripple (liquid wobble), shake (rattles), squash (springy impact), recoil (knocked back, fxFrom = side hit), hop (small jump), glint (light sweeps across a shiny surface), scan (scan line passes over it: analysed, x-rayed), charge (powers up and releases), flicker (failing light), glitch (digital error). fxAmount 0.5 subtle .. 2 strong. Use them to punctuate verbs: hit, hurts, beats, absorbs, analyses, powers, breaks down. A lone hero object turns slowly by default.
SHOW THE SUBJECT ITSELF: the topic's own things (for a DNA-and-banana story: the DNA helix, the banana, cells, a person) must be the heroes of most scenes, big and beautiful. A metaphor prop (a book for a genome, etc.) may appear in at most two scenes; never build the whole reel out of one metaphor.
REAL THINGS ONLY: never draw abstract diagrams (bars, slabs, layers, plus signs, generic blocks). "compose" is only for a real physical object that is missing from the catalogue, modelled carefully with 8+ parts so it is recognisable. If a sentence is abstract, show the person or the real object it is about instead.
SIZES: models are in real metres. When a small object (LED, chip, crystal, phone, bulb) shares a scene with a person, set its scale so it is 0.4-0.8 m big and place it at chest height next to them (pos y about 1.0) so both read clearly; a single small object alone needs no scale.
CONTINUITY: reuse the same hero objects/people across scenes so it feels like one story; vary angles and compositions between consecutive scenes.
TEXT: at most one text item per scene (two only for a prefix+word combo), 1-4 words that add meaning (a year, a number, a name, the key idea) — never the whole sentence (the narration is already shown as a small mono line). Styles: headline (condensed caps; set highlight to the key word -> hue box), number (huge digits for years/quantities), tag (grey box label), prefix (hue box word part). Positions: top (default), upper, lower, bottom, top-left, top-right, or [x,y] fractions of the frame. Time text with at = the spoken word. Reference moves you can use: highlight a word PREFIX (text "REVISIT", highlight "RE" -> RE in a hue box), tint:true (letters in the scene hue), plate:true + zoom:[[at,1.4],[at,1.9]] (headline on a black plate that grows on the beat), glitch:[at...] (dither glitch hits), cps (typing speed, default 13). About half the scenes should have no text.\nCAMERA EXTRAS: camera.follow:"<id>" makes a tracking shot that travels with a walking person; camera.pos/look (metres) + fov place the camera explicitly (e.g. inside a tunnel); scene.light {dir:[x,y,z] camera space, key 0.4-1} sets the light (key from the side = strong face contrast). Objects take origin:"model" to keep model coordinates. Environment models (tunnel, curl-wave, concrete-stairs, skyline with build/solid controls, maze with build/scatter, block-cluster with burst) fill the frame on their own.
TRANSITIONS: mostly cut; dissolve for time jumps; wipe rarely.`;

function schemaText(){return JSON.stringify(z.toJSONSchema(specSchema));}

/** Ideation → script → fact check → storyboard → storyboard review. Every call: Sol, medium. */
export interface Catalog {text:string;assets:string;has:(id:string)=>boolean}
const catalogText=(c:Catalog)=>`${c.text}\nREAL SCANNED OBJECTS (photoscans; use the id as model; prefer these and the catalogue above over "compose"): ${c.assets}`;
export async function generateAcryllexReel(env:{OPENAI_API_KEY?:string},topicHint:string,cat:Catalog,onUsage?:Usage,history:AcryllexHistoryEntry[]=[]){
 const key=env.OPENAI_API_KEY?.trim();if(!key)throw new Error('Configure OPENAI_API_KEY');
 const ask=solClient(key,onUsage);const log:Record<string,unknown>={};
 const past=history.slice(0,20).map(h=>`- ${h.title??h.topic}`).join('\n')||'- none yet';
 // 1. Ideation
 let idea:z.infer<typeof ideaSchema>|undefined;
 for(let i=0;i<2&&!idea;i++){
  const raw=await ask('ideation',`${JSON.stringify(ACRYLLEX_POLICY)}\nYou are the editor of ACRYLLEX, a reel channel of curious explainers: things people are curious about but never thought about before.${topicHint?` Requested topic: ${topicHint}.`:` Choose a topic that is NOT one of the earlier reels below. Seed ideas: ${ACRYLLEX_TOPIC_SEEDS.join('; ')}.`}\nEarlier reels (avoid):\n${past}\nReturn the idea: topic, the viewer's question, a hook line, the story angle (a concrete narrative with people/objects, not a lecture), 5-10 verified key facts (with years/names where relevant; only facts you are certain of), the 3-6 hero objects the story needs (as physical, drawable 3D things), the twist, and the clear answer.`,4000,{name:'acryllex_idea',schema:ideaSchema});
  const p=ideaSchema.safeParse(json(raw));if(p.success)idea=p.data;
 }
 if(!idea)throw new Error('Ideation failed');log.idea=idea;
 // 2. Script
 let script:z.infer<typeof scriptSchema>|undefined;let feedback='';
 for(let round=0;round<3;round++){
  const raw=await ask('script',`${STORY_RULES}\nWrite the narration for this ACRYLLEX reel.\nIdea: ${JSON.stringify(idea)}\n${script?`Previous draft: ${JSON.stringify(script)}\nFact-check / editor feedback to fix: ${feedback}`:''}\nAlso write musicBrief: a 1-2 sentence note for the 100 BPM melodic electronic score (synth lead melody, arpeggios, pad chords, electric bass; which mood, lead sound and melody character fit this story and where the big moment is; no vocals) and factNotes (each claim with how certain it is).`,6000,{name:'acryllex_script',schema:scriptSchema});
  const p=scriptSchema.safeParse(json(raw));if(!p.success){feedback=p.error.issues.map(i=>i.message).join('; ');continue;}
  script=p.data;
  // 3. Fact check + story review
  const rv=reviewSchema.safeParse(json(await ask('fact-check',`You are a strict science/history fact-checker and story editor for a short explainer reel. Check every claim in this narration for factual accuracy (names, dates, numbers, causality) and check the storytelling: hook in the first line, clear journey, twist, satisfying answer, easy to follow when heard once, 100-140 words, no CTA/greeting. Also fail it if any sentence uses jargon a 12-year-old would not know, or describes something that cannot be shown as real physical objects or people. When you ask for a factual fix, the fix must stay simple and visual (do not ask for more technical precision than a general audience needs; simplifications are fine if not false). ok=true only if nothing must change.\nNarration lines: ${JSON.stringify(script.lines)}\nWriter's fact notes: ${JSON.stringify(script.factNotes)}`,4000,{name:'acryllex_review',schema:reviewSchema})));
  if(rv.success&&rv.data.ok)break;
  feedback=rv.success?rv.data.problems.join('; '):'Reviewer output invalid; tighten facts.';log[`scriptReview${round}`]=feedback;
 }
 if(!script)throw new Error('Script failed');log.script=script;
 // 4. Storyboard
 const catalog=catalogText(cat);
 const base=`${VISUAL_RULES}\nMODEL CATALOGUE (use these ids; "compose" builds anything else from primitives):\n${catalog}\n\nSPEC JSON SCHEMA: ${schemaText()}\nSpec notes: version 1, series "ACRYLLEX", one scene per narration line with say = that line EXACTLY (same words, same order). Objects: id (short), model, params, optional pos [x,y,z] in metres (bottom centre) or near+side relative to another object, rot [deg], scale (relative size; models use real metres, so scale small things like an LED up when next to a person), enter/exit, idle (spin-slow is nice for single hero objects), controls (initial), pose (people). Event "at" = a word from the say line (preferred) or seconds.`;
 let spec:AcryllexSpec|undefined;let problems:string[]=[];let raw='';
 for(let attempt=0;attempt<3;attempt++){
  raw=await ask('storyboard',attempt===0?`${base}\nTitle: ${script.title}\nmusicBrief: ${script.musicBrief}\nNarration lines (one scene each):\n${script.lines.map((l,i)=>`${i+1}. ${l}`).join('\n')}\nStory idea: ${JSON.stringify(idea)}\nBuild the full reel spec JSON.`:`${base}\nFix this reel spec. Problems: ${problems.join(' | ')}\nSpec: ${raw}`,24000,{name:'acryllex_spec',schema:specSchema});
  const p=specSchema.safeParse(json(raw));
  if(!p.success){problems=p.error.issues.slice(0,12).map(i=>`${i.path.join('.')}: ${i.message}`);continue;}
  problems=specProblems(p.data as AcryllexSpec,cat.has);spec=p.data as AcryllexSpec;if(!problems.length)break;
 }
 if(!spec)throw new Error(`Storyboard invalid: ${problems.slice(0,3).join('; ')}`);
 // 5. Storyboard review (director pass, text only)
 const review=await ask('storyboard-review',`${VISUAL_RULES}\nMODEL CATALOGUE:\n${catalog}\nYou are the visual director. Review this ACRYLLEX reel spec scene by scene against the rules: is every object the best model for what is said and instantly recognisable; does each scene visibly ACT OUT its sentence with events on the right words; is there a clear hero and at most 3 things; are hues meaningful and consistent; is there continuity and variety of angles; is the text minimal and meaningful; are scales sensible when objects of different sizes share a scene. Then return the IMPROVED full spec JSON (same narration lines exactly).\nSpec: ${JSON.stringify(spec)}\nSchema: ${schemaText()}`,24000,{name:'acryllex_spec',schema:specSchema});
 const rp=specSchema.safeParse(json(review));
 if(rp.success&&!specProblems(rp.data as AcryllexSpec,cat.has).length&&sameLines(spec,rp.data as AcryllexSpec))spec=rp.data as AcryllexSpec;else log.storyboardReviewRejected=rp.success?specProblems(rp.data as AcryllexSpec,cat.has):'invalid';
 spec={...spec,version:1,series:'ACRYLLEX',title:script.title,musicBrief:script.musicBrief};
 return {spec,provenance:{model:MODEL,effort:EFFORT,steps:['ideation','script','fact-check','storyboard','storyboard-review','visual-review','sound-design','sound-review'],...log}};
}
const sameLines=(a:AcryllexSpec,b:AcryllexSpec)=>a.scenes.map(s=>s.say).join(' ')===b.scenes.map(s=>s.say).join(' ');

/** Visual review layer: Sol looks at rendered frames (two per scene) and returns an improved spec. */
export async function reviewVisuals(ask:Ask,spec:AcryllexSpec,sheets:Img[],frameIndex:string,cat:Catalog){
 const raw=await ask('visual-review',`${VISUAL_RULES}\nMODEL CATALOGUE:\n${catalogText(cat)}\nYou are the visual QA director of ACRYLLEX. The attached contact sheets are the RENDERED reel (${frameIndex}). Judge like a stranger with the sound off: for each scene, can you instantly name every object and say what happens? Is the hero big and clear, is anything cut off, cluttered, too small, overlapping text, unreadable, or the wrong model? Does the frame match the sentence? Then return the IMPROVED full spec JSON (keep every say line exactly; you may change models, params, scale, camera angle/fill/focus, events, text, hue). Only change what improves clarity and storytelling.\nSpec: ${JSON.stringify(spec)}\nSchema: ${schemaText()}`,24000,{name:'acryllex_spec',schema:specSchema},sheets);
 const p=specSchema.safeParse(json(raw));
 if(!p.success)return {spec,notes:'visual review output invalid; kept spec'};
 const s=p.data as AcryllexSpec;const probs=specProblems(s,cat.has);
 if(probs.length||!sameLines(spec,s))return {spec,notes:`visual review rejected: ${probs.slice(0,3).join('; ')||'narration changed'}`};
 return {spec:{...s,musicBrief:spec.musicBrief,title:spec.title},notes:'applied'};
}

const cueSchema=z.object({cues:z.array(z.object({at:z.number(),kind:z.string().max(30).optional(),prompt:z.string().max(200).optional(),gain:z.number().min(0).max(2).optional(),length:z.number().min(0.1).max(8).optional(),why:z.string().max(120).optional()}).strict()).max(80)}).strict();
export type Cue=z.infer<typeof cueSchema>['cues'][number];

/** Sound design layer: Sol turns the timeline into a cue sheet (library kinds or new ElevenLabs prompts). */
export async function designSound(ask:Ask,timeline:string,auto:Cue[],kinds:string[]){
 const raw=await ask('sound-design',`You are the sound designer for an ACRYLLEX reel: punchy, premium tech explainer cut to a driving 100 BPM melodic electronic track (synth lead, arpeggios, pads, electric bass). Sound must make EVERY visual action hit: each entrance, morph, light-up, crack, cut, text snap and camera move gets its own tight, tactile effect that lands exactly on it; cuts get a deep hit; reveals get a riser into an impact. Dense and rhythmic (about 1.5-2.5 cues per second), deep and clean rather than harsh, never masking the narrator's words (keep effects short during dense speech). Avoid cartoon sounds, harsh highs, and anything during dense speech that masks words.\nLibrary kinds: ${kinds.join(', ')}. For an action the library cannot express, write a short ElevenLabs sound-effect prompt (real-world, specific, single event, e.g. "a glass crystal cracks with a dry crisp snap"). Return the FINAL cue sheet: keep good automatic cues, remove true clutter only (up to ~2.5 cues per second, no two cues within 0.1 s), add missing ones (object specific sounds: an LED clicking on, a heart beating, a door opening), set gain (0.3 subtle .. 1.2 hero) and length.\nTimeline (narration words with times, scenes, visual events):\n${timeline}\nAutomatic cues: ${JSON.stringify(auto)}`,12000,{name:'acryllex_cues',schema:cueSchema});
 const p=cueSchema.safeParse(json(raw));return p.success?p.data.cues:auto;
}

/** Sound review layer: Sol audits the cue sheet + measured mix stats and returns corrections. */
export async function reviewSound(ask:Ask,timeline:string,cues:Cue[],stats:string){
 const raw=await ask('sound-review',`You are the re-recording mixer reviewing the sound of an ACRYLLEX explainer reel before release. Quality bar: premium documentary. Check: every visible action that deserves a sound has one and lands on it; nothing masks narration words; no repeated identical sounds in a row that feel cheap; density energetic and rhythmic (1.5-2.5 cues/s), every visual action audible; the final answer moment has the strongest but tasteful hit; transitions are smooth. Measured stats of the current mix: ${stats}. Return the corrected FINAL cue sheet (same format).\nTimeline:\n${timeline}\nCue sheet: ${JSON.stringify(cues)}`,12000,{name:'acryllex_cues',schema:cueSchema});
 const p=cueSchema.safeParse(json(raw));return p.success?p.data.cues:cues;
}
