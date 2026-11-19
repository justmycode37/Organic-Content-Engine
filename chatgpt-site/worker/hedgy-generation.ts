import {z} from 'zod';
import {HEDGY_POLICY} from './hedgy-policy.ts';
import {normalizeNarration,parseEditorialJson,reviewHedgyCopy,reviewHedgyScenes,reviewHedgyStory} from './hedgy-editorial.ts';
import {hedgyPostCaptionSchema} from './hedgy-caption.ts';
import {SHOT_NAMES,SHOT_ITEMS,SHOT_TRANSITIONS,describeShotCatalog} from '../src/motion/shots/catalog.ts';
const scene=z.object({type:z.literal('hedgy'),duration:z.number().min(2).max(7),transition:z.enum(['cut','zoom','wipe','shutter','blocks','glitch','flash']).optional(),transitionSound:z.enum(['swish','rise','tick','pop','glitch','shimmer','none']).optional(),beat:z.enum(['risk','drop','hedge','offset','cost','lesson']),headline:z.string().min(1).max(28),label:z.string().min(1).max(24).optional(),secondary:z.string().min(1).max(24).optional(),mascot:z.boolean().optional(),action:z.enum(['buy','crash','contract','expiry','payout','net','upside','premium','story']),story:z.enum(['phone','worry','put','cushion','gain','backup']).optional(),sync:z.array(z.object({word:z.string().min(1).max(30),kind:z.string().min(1).max(30)}).strict()).max(8).optional(),say:z.string().min(1).max(220),caption:z.string().max(60).optional()}).strict();
/** Scenes from the general clean shot library (src/motion/shots); sync words fire the shot's events in order. */
const shotScene=z.object({type:z.literal('shot'),shot:z.enum(SHOT_NAMES as [string,...string[]]),duration:z.number().min(1.2).max(7),transition:z.enum(SHOT_TRANSITIONS).optional(),transitionDir:z.enum(['left','right','up','down']).optional(),mascot:z.boolean().optional(),params:z.record(z.string(),z.unknown()).optional(),sync:z.array(z.object({word:z.string().min(1).max(30),kind:z.string().min(1).max(30)}).strict()).max(8).optional(),say:z.string().min(1).max(220)}).strict();
const reelSpecSchema=z.object({version:z.literal(1),title:z.string().max(90),postCaption:hedgyPostCaptionSchema,series:z.literal('HEDGY / FINANCE'),mode:z.literal('dark'),accent:z.literal('mono'),music:z.enum(['drive','chill','tense','bright']),musicBrief:z.string().max(400).optional(),scenes:z.array(z.union([scene,shotScene])).min(2).max(16)}).strict().superRefine((spec,ctx)=>{
 if(spec.scenes.filter(s=>s.mascot).length>2)ctx.addIssue({code:'custom',message:'At most two mascot scenes'});
 if(/meet hedgy|not (?:financial|investment) advice|education(?:al)? only|follow for/i.test(JSON.stringify(spec)))ctx.addIssue({code:'custom',message:'No greeting, disclaimer or generic CTA'});
});

import type {Env} from './container.ts';
import {AppError} from './errors.ts';
import {hedgyClient,HEDGY_MODEL,HEDGY_EFFORT} from './hedgy-model-client.ts';
import type {ReelSubscription} from './reel-subscription.ts';
import {HEDGY_MUSIC_STYLE,HEDGY_CONCEPTS,conceptCandidates,recentlyUsed,ideaSchema,ideaProblems,type HedgyHistoryEntry,type HedgyIdea} from './hedgy-ideas.ts';
const ROLES=['hook','finance accuracy','narration','scene 1 animation','scene 2 animation','scene 3 animation','scene 4 animation','scene 5 animation','scene 6 animation','sound effects','music and pacing','captions and accessibility'];
/** Story-level checks that keep the reel on its chosen idea instead of drifting back to library defaults. */
function contentIssues(spec:z.infer<typeof reelSpecSchema>,idea:HedgyIdea){
 const shots=spec.scenes.filter(s=>s.type==='shot');if(!shots.length)return [];
 const issues:string[]=[],text=JSON.stringify(shots);
 if(!text.includes(`"${idea.heroItem}"`))issues.push(`The hero item "${idea.heroItem}" must appear in the params of the shots that show it.`);
 if(idea.heroItem!=='ticket'&&!idea.supportingItems.includes('ticket')&&/ticket/i.test(text))issues.push('Do not use tickets in this reel; show the chosen hero item instead.');
 const weak=shots.flatMap(s=>(s.sync??[]).filter(m=>/^(a|an|the|it|to|of|and|is|was)$/i.test(m.word)));if(weak.length)issues.push('Sync markers must sit on nouns or verbs, never on a/the/it/to/of/and.');
 return issues;
}
/** Ideation → reviewed narration → production plan and specialists → assembly → post-copy review. */
export async function generateHedgyReel(env:Env,topic:string,onUsage?:(usage:unknown)=>void|Promise<void>,history:HedgyHistoryEntry[]=[],subscription?:ReelSubscription){
 const key=typeof env.OPENAI_API_KEY==='string'?env.OPENAI_API_KEY.trim():'';
 if(!key&&!subscription)throw new AppError(503,'api_key_missing','Configure the server OPENAI_API_KEY');
 const ask=hedgyClient(key,onUsage,subscription);
 // 1. Ideation: a concept this account has not covered, told through a new story world and a new score.
 const candidates=conceptCandidates(history),{items:usedItems,moods}=recentlyUsed(history);
 const past=history.slice(0,12).map(h=>`- ${[h.title,h.concept,h.item&&`item ${h.item}`,h.setting,h.music&&`music ${h.music}`].filter(Boolean).join(' | ')}${h.summary?`: ${h.summary.slice(0,160)}`:''}`).join('\n')||'- none yet';
 const ideaPrompt=`${JSON.stringify(HEDGY_POLICY)}\nYou are the ideation lead for the Hedgy finance reel account (${topic}). Pick the next reel so it feels COMPLETELY different from earlier reels: a different concept, a different everyday story world and hero item, different supporting characters where possible, a different hook, and a different musical score.\nEarlier reels, newest first (do not resemble them):\n${past}\nChoose concept from exactly these ids: ${candidates.map(c=>`${c.id} (${c.name})`).join('; ')}.\nheroItem and supportingItems must be item ids from this list: ${SHOT_ITEMS.join(', ')}. ${usedItems.length?`heroItem must NOT be any of: ${usedItems.join(', ')}.`:''} Prefer an everyday world the item makes obvious (a lemonade stand, a pizza shop, a car lot, a house sale, an apple orchard, a gold vault...).\ncast: 1–3 actor ids (hedgy plus animal roles such as broker, lender, buyer, trader, rival, clerk, saver, customer, investor, fox, owl, badger, raccoon, rabbit, mouse).\nangle: the one-sentence story. hook: the first spoken line. music: one of ${moods.join(', ')}. musicBrief: a 1–3 sentence instrumental brief for THIS story within this style: ${HEDGY_MUSIC_STYLE} Name the sub-genre, lead instruments, BPM and energy arc (e.g. builds at the twist, hits on the concept reveal); it must differ from the earlier reels' music; no vocals.\nhook: the first spoken line must grab within two seconds with a relatable everyday situation or surprising question the viewer recognises from their own life (not a definition, not a greeting), and it must be something the first shot can SHOW.`;
 let idea:HedgyIdea|undefined,problems:string[]=['no idea'];
 for(let attempt=0;attempt<2&&problems.length;attempt++){
  const raw=await ask(`idea-${attempt+1}`,attempt?`${ideaPrompt}\nYour previous answer was rejected: ${problems.join('; ')}. Answer again.`:ideaPrompt,{name:'hedgy_idea',schema:ideaSchema});
  const parsed=ideaSchema.safeParse(parseEditorialJson(raw));
  if(!parsed.success){problems=parsed.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`);continue;}
  idea=parsed.data;problems=ideaProblems(idea,candidates,history);
  if(problems.length===1&&problems[0]?.startsWith('music')&&moods[0]){idea={...idea,music:moods[0]};problems=[];}
 }
 if(!idea||problems.length)throw new AppError(502,'idea_invalid',`Ideation did not produce a new idea: ${problems.join('; ')}`);
 const concept=HEDGY_CONCEPTS.find(c=>c.id===idea.concept)!;
 const ideaText=`CHOSEN IDEA (keep the concept, setting, items, cast and score): concept "${concept.name}". Story: ${idea.angle} Setting: ${idea.setting}. Hero item: ${idea.heroItem}${idea.supportingItems.length?`; supporting items: ${idea.supportingItems.join(', ')}`:''}. Cast: ${idea.cast.join(', ')}. Proposed hook: ${idea.hook} Music: ${idea.music} — ${idea.musicBrief}\nEarlier reels to stay clear of: ${history.slice(0,6).map(h=>h.title).filter(Boolean).join('; ')||'none'}.`;
 const editorial=await reviewHedgyStory(ask,ideaText);
 const catalog=describeShotCatalog();
 const direction=`Use the approved narration verbatim. Stage one continuous explanation in the existing shot library. Use the fewest shots that show all causal beats, usually 3–7, or two for a single direct comparison. Give each reveal enough time to register before introducing the next idea. Every next shot starts from the object, action or result the viewer just saw. Keep the anchor's appearance, its position, roles and quantities consistent unless the story explains a change. Match the framing for before/after comparisons and clearly establish any time jump. The last image answers the opening with the same anchor. Favor a deliberate hold or repeated setup when it helps the viewer see what changed. Cut on an action, reveal or comparison that motivates the transition. Use cut, match, push or iris only when it serves that handoff.
 Use explicit item params, the documented actors and items, and sparse readable labels. Time significant actions with cue words in the scene's say line, in spoken order. Match each shot to what the viewer hears at that moment.`;
 const brand=`${JSON.stringify(HEDGY_POLICY)}\n${direction}\n${ideaText}\nAPPROVED STORY: ${JSON.stringify(editorial.story)}\n${catalog}`;
 // 2. Plan and specialists.
 const plan=await ask('plan',`${brand} Plan the reel. Map the narration to one sequence, with a visible entry and exit state for each shot and precisely what the viewer follows across each cut. Give twelve specialists a production brief for staging this sequence.`);
 const contributions:string[]=new Array(ROLES.length);let next=0;
 const settled=await Promise.allSettled(Array.from({length:4},async()=>{while(next<ROLES.length){const i=next++;contributions[i]=`${ROLES[i]}: ${await ask(`specialist-${i+1}`,`${brand}\nProducer brief: ${plan}\nYour task: ${ROLES[i]}. Return at most 180 words of precise production instructions for the approved narration, no preamble.`)}`;}}));
 const failure=settled.find(x=>x.status==='rejected');if(failure?.status==='rejected')throw failure.reason;
 // 3. Assembly, with bounded repairs for storyboard or schema problems.
 const schema=JSON.stringify(z.toJSONSchema(reelSpecSchema));
 const finish=(value:z.infer<typeof reelSpecSchema>)=>({...value,music:idea.music,musicBrief:idea.musicBrief});
 let output=await ask('assembly',`${brand}\nAssemble a final reel JSON only, no markdown. Use series HEDGY / FINANCE, accent mono, mode dark, music ${idea.music}, musicBrief exactly as given. Every scene has type shot, a shot name from the library, params that use only listed ACTORS and ITEMS, a say line, sync markers for significant actions and a transition from cut, push, match, iris that serves the handoff into that shot. Durations are approximate; narration sets the real timing. Copy the approved narration verbatim into the say lines. Sentences may continue across shots. Keep each character in the same role for the whole reel. Do not set mascot. Also write postCaption: the finished Instagram caption shown BELOW this reel, separate from say and all on-screen text. Aim for 80–140 words of useful copy (at least 60, excluding hashtags): a compelling first-line hook, 2–3 short paragraphs that expand the story and explain its mechanism or tradeoff, and a specific takeaway. Use blank lines and finish with 3–5 distinct, relevant hashtags on their own final line, mixing the specific concept with broader finance/learning tags. Match the final narration and chosen analogy; add helpful context without inventing facts, live prices or claims of returns. No generic engagement bait, greeting, disclaimer, sales pitch or narration/stage directions; a restrained emoji is optional. Keep the whole caption under 2,200 characters. Match this JSON schema exactly: ${schema}\nBrief: ${plan}\nSpecialists:\n${contributions.join('\n')}`,{name:'hedgy_reel',schema:reelSpecSchema});
 const check=(text:string)=>{
  const parsed=reelSpecSchema.safeParse(parseEditorialJson(text));
  if(!parsed.success)return {issues:parsed.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`)};
  const issues=contentIssues(parsed.data,idea);
  const assembledNarration=parsed.data.scenes.map(scene=>scene.say).join(' ');
  if(normalizeNarration(assembledNarration)!==normalizeNarration(editorial.narration)){
   issues.push('Scene say lines must contain the exact approved narration in order.');
  }
  return issues.length?{issues}:{spec:finish(parsed.data)};
 };
 const sceneRounds=[];
 let result=check(output);
 for(let round=0;round<=3;round++){
  if(result.spec){
   const reviewed=await reviewHedgyScenes(ask,editorial.story,result.spec.scenes,catalog);
   sceneRounds.push({scenes:result.spec.scenes,...reviewed});
   if(!reviewed.problems.length)break;
   result={issues:reviewed.problems};
  }else{
   sceneRounds.push({draft:output,problems:result.issues});
  }
  if(round===3)break;
  output=await ask(`repair-${round+1}`,`Repair this reel JSON. ${direction}
Approved story (keep every spoken word in order): ${JSON.stringify(editorial.story)}. Keep the hero item (${idea.heroItem}) and preserve working scenes. Keep postCaption aligned with the final story: aim for 80–140 words (at least 60 excluding hashtags), short paragraphs separated by blank lines, and 3–5 distinct relevant hashtags on their own final line; at most 2,200 characters.
Required fixes: ${JSON.stringify(result.issues)}
JSON: ${output}
Schema: ${schema}
${catalog}`,{name:'hedgy_reel',schema:reelSpecSchema});
  result=check(output);
 }
 if(!result.spec)throw new AppError(502,'hedgy_scenes_unapproved','Hedgy scenes did not pass assembly and continuity review',{sceneRounds});
 const copy=await reviewHedgyCopy(ask,editorial.narration,{title:result.spec.title,postCaption:result.spec.postCaption});
 const spec={...result.spec,...copy.copy};
 return {spec,provenance:{orchestrator:HEDGY_MODEL,effort:HEDGY_EFFORT,specialist:HEDGY_MODEL,specialists:ROLES.length,idea:{...idea,conceptName:concept.name,title:spec.title},plan,contributions,editorial:{story:editorial.story,storyRounds:editorial.rounds,sceneRounds,copyRounds:copy.rounds}}};
}
