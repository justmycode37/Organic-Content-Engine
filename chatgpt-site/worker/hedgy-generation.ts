import {z} from 'zod';
import {HEDGY_POLICY} from './hedgy-policy.ts';
import {SHOT_NAMES,SHOT_ITEMS,SHOT_TRANSITIONS,describeShotCatalog} from '../src/motion/shots/catalog.ts';
const scene=z.object({type:z.literal('hedgy'),duration:z.number().min(2).max(7),transition:z.enum(['cut','zoom','wipe','shutter','blocks','glitch','flash']).optional(),transitionSound:z.enum(['swish','rise','tick','pop','glitch','shimmer','none']).optional(),beat:z.enum(['risk','drop','hedge','offset','cost','lesson']),headline:z.string().min(1).max(28),label:z.string().min(1).max(24).optional(),secondary:z.string().min(1).max(24).optional(),mascot:z.boolean().optional(),action:z.enum(['buy','crash','contract','expiry','payout','net','upside','premium','story']),story:z.enum(['phone','worry','put','cushion','gain','backup']).optional(),sync:z.array(z.object({word:z.string().min(1).max(30),kind:z.string().min(1).max(30)}).strict()).max(8).optional(),say:z.string().min(1).max(220),caption:z.string().max(60).optional()}).strict();
/** Scenes from the general clean shot library (src/motion/shots); sync words fire the shot's events in order. */
const shotScene=z.object({type:z.literal('shot'),shot:z.enum(SHOT_NAMES as [string,...string[]]),duration:z.number().min(1.2).max(7),transition:z.enum(SHOT_TRANSITIONS).optional(),transitionDir:z.enum(['left','right','up','down']).optional(),mascot:z.boolean().optional(),params:z.record(z.string(),z.unknown()).optional(),sync:z.array(z.object({word:z.string().min(1).max(30),kind:z.string().min(1).max(30)}).strict()).max(8).optional(),say:z.string().min(1).max(220)}).strict();
const reelSpecSchema=z.object({version:z.literal(1),title:z.string().max(90),series:z.literal('HEDGY / FINANCE'),mode:z.literal('dark'),accent:z.literal('mono'),music:z.enum(['drive','chill','tense','bright']),musicBrief:z.string().max(400).optional(),scenes:z.array(z.union([scene,shotScene])).min(5).max(16)}).strict().superRefine((spec,ctx)=>{
 if(spec.scenes.filter(s=>s.mascot).length>2)ctx.addIssue({code:'custom',message:'At most two mascot scenes'});
 if(/meet hedgy|not (?:financial|investment) advice|education(?:al)? only|follow for/i.test(JSON.stringify(spec)))ctx.addIssue({code:'custom',message:'No greeting, disclaimer or generic CTA'});
});

import type {Env} from './container.ts';
import {AppError} from './errors.ts';
import {HEDGY_MUSIC_STYLE,HEDGY_CONCEPTS,conceptCandidates,recentlyUsed,ideaSchema,ideaProblems,type HedgyHistoryEntry,type HedgyIdea} from './hedgy-ideas.ts';
const ROLES=['hook','finance accuracy','narration','scene 1 animation','scene 2 animation','scene 3 animation','scene 4 animation','scene 5 animation','scene 6 animation','sound effects','music and pacing','captions and accessibility'];
/** Story-level checks that keep the reel on its chosen idea instead of drifting back to library defaults. */
function contentIssues(spec:z.infer<typeof reelSpecSchema>,idea:HedgyIdea){
 const shots=spec.scenes.filter(s=>s.type==='shot');if(!shots.length)return [];
 const issues:string[]=[],text=JSON.stringify(shots);
 if(!text.includes(`"${idea.heroItem}"`))issues.push(`The hero item "${idea.heroItem}" must appear in the params of the shots that show it.`);
 if(idea.heroItem!=='ticket'&&!idea.supportingItems.includes('ticket')&&/ticket/i.test(text))issues.push('Do not use tickets in this reel; show the chosen hero item instead.');
 const names=shots.map(s=>s.type==='shot'?s.shot:''),counts=new Map<string,number>();for(const n of names)counts.set(n,(counts.get(n)??0)+1);
 const distinct=counts.size,need=Math.min(7,shots.length);if(distinct<need)issues.push(`Use at least ${need} different shots (only ${distinct}).`);
 const over=[...counts].filter(([n,c])=>c>(n==='present'?1:2)).map(([n])=>n);if(over.length)issues.push(`Shots used too often (max 2, present max 1): ${over.join(', ')}.`);
 if(names.some((n,i)=>i&&n===names[i-1]))issues.push('Never use the same shot in two consecutive scenes.');
 const weak=shots.flatMap(s=>(s.sync??[]).filter(m=>/^(a|an|the|it|to|of|and|is|was)$/i.test(m.word)));if(weak.length)issues.push('Sync markers must sit on nouns or verbs, never on a/the/it/to/of/and.');
 return issues;
}
/** Ideation → plan → 12 specialists → assembly (→ one repair). History makes each reel a new concept, item, setting and score. */
export async function generateHedgyReel(env:Env,topic:string,onUsage?:(usage:unknown)=>void,history:HedgyHistoryEntry[]=[]){
 const key=typeof env.OPENAI_API_KEY==='string'?env.OPENAI_API_KEY.trim():'';
 if(!key)throw new AppError(503,'api_key_missing','Configure the server OPENAI_API_KEY');
 async function ask(model:string,input:string,max:number,format?:{name:string;schema:z.ZodType}){
 const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model,reasoning:{effort:model==='gpt-6-luna'?'low':'medium'},input,max_output_tokens:max,store:false,...(format?{text:{format:{type:'json_schema',name:format.name,schema:z.toJSONSchema(format.schema),strict:false}}}:{})}),signal:AbortSignal.timeout(120000)});
 if(!response.ok)throw new AppError(502,'model_failed',`${model} request failed (${response.status}); check model access and API billing`);
 const r=await response.json() as {usage?:unknown;status?:string;output?:{content?:{type:string;text?:string}[]}[]};
 onUsage?.({model,usage:r.usage,status:r.status,output:r.output});
 if(r.status!=='completed')throw new AppError(502,'generation_incomplete','Model output incomplete');
 return (r.output??[]).flatMap(v=>v.content??[]).filter(v=>v.type==='output_text').map(v=>v.text??'').join('');
 }
 const json=(text:string)=>{try{return JSON.parse(text)}catch{return undefined}};
 // 1. Ideation: a concept this account has not covered, told through a new story world and a new score.
 const candidates=conceptCandidates(history),{items:usedItems,moods}=recentlyUsed(history);
 const past=history.slice(0,12).map(h=>`- ${[h.title,h.concept,h.item&&`item ${h.item}`,h.setting,h.music&&`music ${h.music}`].filter(Boolean).join(' | ')}${h.summary?`: ${h.summary.slice(0,160)}`:''}`).join('\n')||'- none yet';
 const ideaPrompt=`${JSON.stringify(HEDGY_POLICY)}\nYou are the ideation lead for the Hedgy finance reel account (${topic}). Pick the next reel so it feels COMPLETELY different from earlier reels: a different concept, a different everyday story world and hero item, different supporting characters where possible, a different hook, and a different musical score.\nEarlier reels, newest first (do not resemble them):\n${past}\nChoose concept from exactly these ids: ${candidates.map(c=>`${c.id} (${c.name})`).join('; ')}.\nheroItem and supportingItems must be item ids from this list: ${SHOT_ITEMS.join(', ')}. ${usedItems.length?`heroItem must NOT be any of: ${usedItems.join(', ')}.`:''} Prefer an everyday world the item makes obvious (a lemonade stand, a pizza shop, a car lot, a house sale, an apple orchard, a gold vault...).\ncast: 1–3 actor ids (hedgy plus animal roles such as broker, lender, buyer, trader, rival, clerk, saver, customer, investor, fox, owl, badger, raccoon, rabbit, mouse).\nangle: the one-sentence story. hook: the first spoken line. music: one of ${moods.join(', ')}. musicBrief: a 1–3 sentence instrumental brief for THIS story within this style: ${HEDGY_MUSIC_STYLE} Name the sub-genre, lead instruments, BPM and energy arc (e.g. builds at the twist, hits on the concept reveal); it must differ from the earlier reels' music; no vocals.\nhook: the first spoken line must grab within two seconds with a relatable everyday situation or surprising question the viewer recognises from their own life (not a definition, not a greeting), and it must be something the first shot can SHOW.`;
 let idea:HedgyIdea|undefined,problems:string[]=['no idea'];
 for(let attempt=0;attempt<2&&problems.length;attempt++){
  const raw=await ask('gpt-6.1-sol',attempt?`${ideaPrompt}\nYour previous answer was rejected: ${problems.join('; ')}. Answer again.`:ideaPrompt,3000,{name:'hedgy_idea',schema:ideaSchema});
  const parsed=ideaSchema.safeParse(json(raw));
  if(!parsed.success){problems=parsed.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`);continue;}
  idea=parsed.data;problems=ideaProblems(idea,candidates,history);
  if(problems.length===1&&problems[0]?.startsWith('music')&&moods[0]){idea={...idea,music:moods[0]};problems=[];}
 }
 if(!idea||problems.length)throw new AppError(502,'idea_invalid',`Ideation did not produce a new idea: ${problems.join('; ')}`);
 const concept=HEDGY_CONCEPTS.find(c=>c.id===idea.concept)!;
 const ideaText=`CHOSEN IDEA (binding): concept "${concept.name}". Story: ${idea.angle} Setting: ${idea.setting}. Hero item: ${idea.heroItem}${idea.supportingItems.length?`; supporting items: ${idea.supportingItems.join(', ')}`:''}. Cast: ${idea.cast.join(', ')}. Hook: ${idea.hook} Music: ${idea.music} — ${idea.musicBrief}\nEarlier reels to stay clear of: ${history.slice(0,6).map(h=>h.title).filter(Boolean).join('; ')||'none'}.`;
 const brand=JSON.stringify(HEDGY_POLICY)+'\nCreate an original 25-40 second mechanism-led finance story about the chosen idea. STORY: open on the hook (a relatable moment the viewer has lived), then setup → twist → consequence, and only at the end name the concept with a one-line takeaway. Plain everyday words, short clear sentences, 55–75 spoken words, one idea per sentence. PICTURE: every shot must visibly ACT OUT the words spoken over it (a stranger with the sound off can say what happens), using the shot whose describe line matches that verb; never a character just standing next to an object. Use at least 7 different shots, no shot more than twice, never the same shot twice in a row, `present` at most once. Put sync words only on the nouns and verbs where the action lands (never on a, the, it, to). Use 10–14 quick shots; one meaningful action every 0.4–0.8 seconds; at most three big things per shot; no disclaimer or greeting. Avoid arithmetic and avoid quoting strike prices. Tell ONE concrete, relatable story in the chosen setting with the same characters and the chosen hero item throughout, then name the concept at the end. Build the reel ONLY from `shot` scenes of this library. For each scene choose the shot whose idea matches the sentence, set params (actors, items, short words for signs) so the picture shows exactly what the narration says — always set item params explicitly, because library defaults show tickets — and add sync markers: `word` = the narration word on which an action should land, in spoken order (`kind` = that word in lower case); the shot plays its events in that order.\n'+ideaText+'\n'+describeShotCatalog();
 // 2. Plan and specialists.
 const plan=await ask('gpt-6.1-sol',`${brand} Plan this reel. Give a concrete scene and narration brief for twelve specialists.`,5000);
 const contributions:string[]=new Array(ROLES.length);let next=0;
 const settled=await Promise.allSettled(Array.from({length:4},async()=>{while(next<ROLES.length){const i=next++;contributions[i]=`${ROLES[i]}: ${await ask('gpt-6-luna',`${brand}\nProducer brief: ${plan}\nYour task: ${ROLES[i]}. Return at most 180 words of precise production instructions, no preamble.`,8000)}`;}}));
 const failure=settled.find(x=>x.status==='rejected');if(failure?.status==='rejected')throw failure.reason;
 // 3. Assembly, with one repair for schema or story problems.
 const schema=JSON.stringify(z.toJSONSchema(reelSpecSchema));
 const finish=(value:z.infer<typeof reelSpecSchema>)=>({...value,music:idea.music,musicBrief:idea.musicBrief});
 let output=await ask('gpt-6.1-sol',`${brand}\nAssemble a final reel JSON only, no markdown. Use series HEDGY / FINANCE, accent mono, mode dark, music ${idea.music}, musicBrief exactly as given. Every scene has type shot, a shot name from the library, params that use only listed ACTORS and ITEMS, a say line, 1–3 sync markers and a transition from cut, push, match, iris (never the same one three times in a row). Durations are approximate; narration sets the real timing. Sentences must form one connected paragraph and may continue across shots. Keep each character in the same role for the whole reel. Do not set mascot. Match this JSON schema exactly: ${schema}\nBrief: ${plan}\nSpecialists:\n${contributions.join('\n')}`,10000,{name:'hedgy_reel',schema:reelSpecSchema});
 const check=(text:string)=>{const parsed=reelSpecSchema.safeParse(json(text));if(!parsed.success)return {issues:parsed.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`)};const issues=contentIssues(parsed.data,idea);return issues.length?{issues}:{spec:finish(parsed.data)};};
 let result=check(output);
 for(let repair=0;repair<2&&!result.spec;repair++){output=await ask('gpt-6.1-sol',`Repair this reel JSON. Keep its story, hero item (${idea.heroItem}) and numerically correct hypothetical intact. Problems: ${JSON.stringify(result.issues)}\nJSON: ${output}\nSchema: ${schema}`,10000,{name:'hedgy_reel',schema:reelSpecSchema});result=check(output);}
 if(!result.spec)throw new AppError(502,'invalid_reel',`Producer returned an invalid reel specification: ${result.issues?.slice(0,3).join('; ')}`);
 return {spec:result.spec,provenance:{orchestrator:'gpt-6.1-sol',effort:'medium',specialist:'gpt-6-luna',specialists:ROLES.length,idea:{...idea,conceptName:concept.name,title:result.spec.title},plan,contributions}};
}
