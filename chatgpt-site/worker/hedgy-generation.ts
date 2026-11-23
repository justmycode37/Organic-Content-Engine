import {z} from 'zod';
import {HEDGY_POLICY} from './hedgy-policy.ts';
import {normalizeNarration,parseEditorialJson,reviewHedgyCopy,reviewHedgyScenes,reviewHedgyStory} from './hedgy-editorial.ts';
import {hedgyPostCaptionSchema} from './hedgy-caption.ts';
import {SHOT_NAMES,SHOT_ITEMS,SHOT_TRANSITIONS,SHOT_CATALOG,describeShotCatalog} from '../src/motion/shots/catalog.ts';
import {WORLDS,WORLD_HINTS,isWorld} from '../src/motion/kit/world-ids.ts';
const scene=z.object({type:z.literal('hedgy'),duration:z.number().min(2).max(7),transition:z.enum(['cut','zoom','wipe','shutter','blocks','glitch','flash']).optional(),transitionSound:z.enum(['swish','rise','tick','pop','glitch','shimmer','none']).optional(),beat:z.enum(['risk','drop','hedge','offset','cost','lesson']),headline:z.string().min(1).max(28),label:z.string().min(1).max(24).optional(),secondary:z.string().min(1).max(24).optional(),mascot:z.boolean().optional(),action:z.enum(['buy','crash','contract','expiry','payout','net','upside','premium','story']),story:z.enum(['phone','worry','put','cushion','gain','backup']).optional(),sync:z.array(z.object({word:z.string().min(1).max(30),kind:z.string().min(1).max(30)}).strict()).max(8).optional(),say:z.string().min(1).max(220),caption:z.string().max(60).optional()}).strict();
/** Scenes from the general clean shot library (src/motion/shots); sync words fire the shot's events in order. */
const shotScene=z.object({type:z.literal('shot'),shot:z.enum(SHOT_NAMES as [string,...string[]]),duration:z.number().min(1.2).max(7),transition:z.enum(SHOT_TRANSITIONS).optional(),transitionDir:z.enum(['left','right','up','down']).optional(),mascot:z.boolean().optional(),params:z.record(z.string(),z.unknown()).optional(),sync:z.array(z.object({word:z.string().min(1).max(30),kind:z.string().min(1).max(30)}).strict()).max(8).optional(),say:z.string().min(1).max(220)}).strict();
export const hedgyReelSchema=z.object({version:z.literal(1),title:z.string().max(90),postCaption:hedgyPostCaptionSchema,series:z.literal('HEDGY / FINANCE'),mode:z.literal('dark'),accent:z.literal('mono'),music:z.enum(['drive','chill','tense','bright']),musicBrief:z.string().max(400).optional(),look:z.literal('viral').optional(),hook:z.string().min(3).max(60).optional(),header:z.string().min(2).max(40).optional(),payoff:z.string().min(3).max(70).optional(),term:z.string().min(3).max(30).optional(),scenes:z.array(z.union([scene,shotScene])).min(2).max(16)}).strict().superRefine((spec,ctx)=>{
 if(spec.scenes.filter(s=>s.mascot).length>2)ctx.addIssue({code:'custom',message:'At most two mascot scenes'});
 if(/meet hedgy|not (?:financial|investment) advice|education(?:al)? only|follow for/i.test(JSON.stringify(spec)))ctx.addIssue({code:'custom',message:'No greeting, disclaimer or generic CTA'});
});

import type {Env} from './container.ts';
import {AppError} from './errors.ts';
import {hedgyClient,hedgyCritic,HEDGY_MODEL,HEDGY_EFFORT,HEDGY_CRITIC_MODEL} from './hedgy-model-client.ts';
import type {ReelSubscription} from './reel-subscription.ts';
import {HEDGY_MUSIC_STYLE,HEDGY_CONCEPTS,conceptCandidates,recentlyUsed,ideaSchema,ideaProblems,type HedgyHistoryEntry,type HedgyIdea} from './hedgy-ideas.ts';
const ROLES=['hook','finance accuracy','narration','scene 1 animation','scene 2 animation','scene 3 animation','scene 4 animation','scene 5 animation','scene 6 animation','sound effects','music and pacing','captions and accessibility'];
/** Story-level checks that keep the reel on its chosen idea instead of drifting back to library defaults. */
function contentIssues(spec:z.infer<typeof hedgyReelSchema>,idea:HedgyIdea){
 const shots=spec.scenes.filter(s=>s.type==='shot');if(!shots.length)return [];
 const issues:string[]=[],text=JSON.stringify(shots);
 if(!text.includes(`"${idea.heroItem}"`))issues.push(`The hero item "${idea.heroItem}" must appear in the params of the shots that show it.`);
 if(idea.heroItem!=='ticket'&&!idea.supportingItems.includes('ticket')&&/ticket/i.test(text))issues.push('Do not use tickets in this reel; show the chosen hero item instead.');
 const weak=shots.flatMap(s=>(s.sync??[]).filter(m=>/^(a|an|the|it|to|of|and|is|was)$/i.test(m.word)));if(weak.length)issues.push('Sync markers must sit on nouns or verbs, never on a/the/it/to/of/and.');
 const unplaced=shots.flatMap((s,i)=>isWorld(s.params?.world)?[]:[i+1]);
 if(unplaced.length)issues.push(`Every shot needs params.world from WORLDS (${WORLDS.join(', ')}); missing or invalid in scene ${unplaced.join(', ')}.`);
 if(!spec.hook)issues.push('Set hook: the on-screen hook title for the opening (max 7 words, key word in *asterisks*).');
 for(const [i,scene] of shots.entries()){
  const allowed=new Set([...(SHOT_CATALOG.find(e=>e.name===scene.shot)?.params??[]),'world']);
  const unknown=Object.keys(scene.params??{}).filter(k=>!allowed.has(k));
  if(unknown.length)issues.push(`Scene ${i+1} (${scene.shot}): params ${unknown.join(', ')} do not exist and are ignored by the renderer. Each shot is a self-contained animation with only its documented params (${[...allowed].join(', ')}); there is no compositing, frame freezing/extension, registration or overlay. Express continuity by choosing shots and params.`);
 }
 const counts=new Map<string,number>();for(const x of shots)counts.set(x.shot,(counts.get(x.shot)??0)+1);
 const overused=[...counts].filter(([,n])=>n>3).map(([name,n])=>`${name} ×${n}`);
 if(overused.length)issues.push(`Vary the shots: ${overused.join(', ')} is used more than 3 times. Use at most 3 of any shot and never the same shot three times in a row; pick shots that act out each line.`);
 if(shots.some((x,i)=>i>1&&x.shot===shots[i-1]!.shot&&x.shot===shots[i-2]!.shot))issues.push('The same shot appears three times in a row; alternate shots so the picture keeps changing.');
 const said=spec.scenes.map(x=>x.say).join(' ').toLowerCase().replace(/[^a-z0-9$% ]/g,' ');
 if(!spec.term)issues.push('Set term: the concept name exactly as the narration says it (e.g. "moral hazard"); it appears as a big card the moment it is spoken.');
 else if(!` ${said.replace(/\s+/g,' ')} `.includes(` ${spec.term.toLowerCase().replace(/[^a-z0-9$% ]/g,' ').replace(/\s+/g,' ').trim()} `))issues.push(`term "${spec.term}" must be words the narration actually speaks, verbatim.`);
 if(!spec.payoff)issues.push('Set payoff: the answer as a big end card over the last shot (max 8 words, concrete, e.g. "$51 FOR AN *$80* BIKE"); it must match the narration.');
 const repeats=shots.flatMap((s,i)=>i&&s.shot===shots[i-1]!.shot&&JSON.stringify(s.params)===JSON.stringify(shots[i-1]!.params)?[i+1]:[]);
 if(repeats.length)issues.push(`Scene ${repeats.join(', ')} repeats the previous shot with identical params, which replays the same animation from the start; continue the action with a different shot or changed params.`);
 if(!spec.header)issues.push('Set header: a 1–4 word topic label shown at the top after the hook (e.g. "INFLATION").');
 return issues;
}
/** Ideation → reviewed narration → production plan and specialists → assembly → post-copy review. */
export async function generateHedgyReel(env:Env,topic:string,onUsage?:(usage:unknown)=>void|Promise<void>,history:HedgyHistoryEntry[]=[],subscription?:ReelSubscription){
 const key=typeof env.OPENAI_API_KEY==='string'?env.OPENAI_API_KEY.trim():'';
 if(!key&&!subscription)throw new AppError(503,'api_key_missing','Configure the server OPENAI_API_KEY');
 const ask=hedgyClient(key,onUsage,subscription),critic=hedgyCritic(ask,onUsage,subscription);
 // 1. Ideation: a concept this account has not covered, told through a new story world and a new score.
 const candidates=conceptCandidates(history),{items:usedItems,moods}=recentlyUsed(history);
 const past=history.slice(0,12).map(h=>`- ${[h.title,h.concept,h.item&&`item ${h.item}`,h.setting,h.music&&`music ${h.music}`].filter(Boolean).join(' | ')}${h.summary?`: ${h.summary.slice(0,160)}`:''}`).join('\n')||'- none yet';
 const ideaPrompt=`${JSON.stringify(HEDGY_POLICY)}\nYou are the ideation lead for the Hedgy finance reel account (${topic}). Among the eligible concepts, pick the one you can tell most clearly as an everyday event. Keep the account fresh by rotating concepts, items and music. Choose a familiar situation where the item naturally demonstrates the mechanism and a viewer immediately understands what someone wants.\nEarlier reels, newest first (do not resemble them):\n${past}\nChoose concept from exactly these ids: ${candidates.map(c=>`${c.id} (${c.name})`).join('; ')}.\nheroItem and supportingItems must be item ids from this list: ${SHOT_ITEMS.join(', ')}. ${usedItems.length?`heroItem must NOT be any of: ${usedItems.join(', ')}.`:''} Prefer an everyday world the item makes obvious (a lemonade stand, a pizza shop, a car lot, a house sale, an apple orchard, a gold vault...).\ncast: 1–3 actor ids (hedgy plus animal roles such as broker, lender, buyer, trader, rival, clerk, saver, customer, investor, fox, owl, badger, raccoon, rabbit, mouse).\nangle: pitch the story in one sentence. Say who wants what, what gets in the way, what someone does about it, and why that changes the outcome. music: one of ${moods.join(', ')}. musicBrief: a 1–3 sentence instrumental brief for THIS story within this style: ${HEDGY_MUSIC_STYLE} Name the sub-genre, lead instruments, BPM and energy arc (e.g. builds at the twist, hits on the concept reveal); it must differ from the earlier reels' music; no vocals.\nhook: open inside the situation with a specific need, choice or obstacle the first shot can show. If you ask a question, the payoff must answer that exact question.`;
 let idea:HedgyIdea|undefined,problems:string[]=['no idea'],ideaPick:unknown;
 const viralIdea=`\nVIRAL BAR: this account must grow. Pitch the version of the concept with the strongest "wait, what?" factor for a broad audience: a counterintuitive fact, a hidden cost people pay every day, or a situation everyone has been in (coffee, rent, phones, concerts, sneakers, groceries, subscriptions, a first job...). The hook must make a stranger need the answer within 3 seconds, and the payoff must be a satisfying reveal people would send to a friend.`;
 const candidatesSchema=z.object({candidates:z.array(ideaSchema).min(3).max(3)}).strict();
 for(let attempt=0;attempt<2&&problems.length;attempt++){
  const prompt=`${ideaPrompt}${viralIdea}\nReturn THREE distinct candidate ideas (different concepts or angles) as {"candidates":[...]}.`;
  const raw=await ask(`idea-${attempt+1}`,attempt?`${prompt}\nYour previous answer was rejected: ${problems.join('; ')}. Answer again.`:prompt,{name:'hedgy_ideas',schema:candidatesSchema});
  const parsedList=candidatesSchema.safeParse(parseEditorialJson(raw));
  if(!parsedList.success){problems=parsedList.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`);continue;}
  const valid=parsedList.data.candidates.filter(c=>!ideaProblems(c,candidates,history).filter(p=>!p.startsWith('music')).length);
  if(!valid.length){problems=ideaProblems(parsedList.data.candidates[0]!,candidates,history);continue;}
  // A different model family picks the idea with the best chance to stop the scroll and be shared.
  const pickSchema=z.object({index:z.number().int().min(0),why:z.string().max(600),hook:z.string().max(160)}).strict();
  const pickRaw=await critic('idea-pick',`You run a viral short-form explainer account (animated hedgehog cast, ~30 s finance reels). Pick the ONE candidate most likely to stop the scroll, be understood on first watch and get shared. Prefer relatable stakes, a surprising mechanism, and a payoff you can show with simple props. The animation can ONLY use the shot library, items and places below: reject any candidate whose key moment (the action that makes the mechanism click) cannot be acted out by these shots, even if its premise is great. Then write the strongest possible spoken opening line for it (max 12 words, a curiosity gap, no scene-setting).\nReturn JSON only: {"index":number,"why":string,"hook":string}\nCandidates: ${JSON.stringify(valid)}\n${describeShotCatalog()}\nPLACES: ${WORLDS.join(', ')}`,{name:'hedgy_idea_pick',schema:pickSchema});
  const pick=pickSchema.safeParse(parseEditorialJson(pickRaw));ideaPick=pick.data??pickRaw;
  const chosen=valid[pick.success?Math.min(valid.length-1,pick.data.index):0]!;
  idea=pick.success&&pick.data.hook.trim()?{...chosen,hook:pick.data.hook.trim().slice(0,160)}:chosen;problems=ideaProblems(idea,candidates,history);
  if(problems.length===1&&problems[0]?.startsWith('music')&&moods[0]){idea={...idea,music:moods[0]};problems=[];}
 }
 if(!idea||problems.length)throw new AppError(502,'idea_invalid',`Ideation did not produce a new idea: ${problems.join('; ')}`);
 const concept=HEDGY_CONCEPTS.find(c=>c.id===idea.concept)!;
 const ideaText=`CHOSEN IDEA (keep the concept, setting, items, cast and score): concept "${concept.name}". Story: ${idea.angle} Setting: ${idea.setting}. Hero item: ${idea.heroItem}${idea.supportingItems.length?`; supporting items: ${idea.supportingItems.join(', ')}`:''}. Cast: ${idea.cast.join(', ')}. Proposed hook: ${idea.hook} Music: ${idea.music} — ${idea.musicBrief}\nEarlier reels to stay clear of: ${history.slice(0,6).map(h=>h.title).filter(Boolean).join('; ')||'none'}.`;
 // The narration may only name things the animation can show: a spoken object with no picture breaks the reel.
 const drawable=`DRAWABLE VOCABULARY (the animation can only show these): items ${SHOT_ITEMS.join(', ')}; places ${WORLDS.join(', ')}; animal characters. Every concrete object or place the narration names must be one of these (synonyms are fine: "cash" for banknotes, "store" for shop). Do not build the story on objects outside this list (no pillars, doors, tools, vehicles other than car/bike).`;
 const editorial=await reviewHedgyStory(ask,`${ideaText}\n${drawable}`,concept.name,critic);
 const catalog=`${describeShotCatalog()}\nWORLDS (params.world on EVERY shot; the full-frame place where the shot happens, painted behind the action): ${WORLDS.map(w=>`${w} (${WORLD_HINTS[w]})`).join('; ')}. Keep the same world while the story stays in one place; change it when the story moves, and use at least two different worlds per reel so the places (home, street, shop...) carry the story. ITEM NOTES: phone shows a stock chart (trading app); smartphone is an everyday phone as a possession.`;
 const direction=`Use the approved narration verbatim. Stage one continuous explanation in the existing shot library. Split the narration into quick shots, usually 8–14 (one clause or phrase each, 1.5–3.5 s), so the picture changes whenever the words move on; a sentence may span several shots. Give each reveal enough time to register before introducing the next idea. Every next shot starts from the object, action or result the viewer just saw. Keep the anchor's appearance, its position, roles and quantities consistent unless the story explains a change. Match the framing for before/after comparisons and clearly establish any time jump. The last image answers the opening with the same anchor. Favor a deliberate hold or repeated setup when it helps the viewer see what changed. Cut on an action, reveal or comparison that motivates the transition. Use cut, match, push or iris only when it serves that handoff.
 Each shot is a self-contained animation that starts fresh; only documented params exist (no compositing, freeze-frames, frame extension or custom staging fields), so continuity comes from choosing consecutive shots that show the same actors and items. When no template shows exactly what the words say, use the act shot and script the verbs (give, take, put, drop, appear, vanish, grow, shrink, shake, stamp, walk-in, walk-out, reactions) on the sync words; every spoken action must be visible. VIRAL STAGING: the first shot must show the hook's tension instantly (a character with the problem in a recognisable place) and land an action in its first second. Cut every 1.5–3.5 s on a visible action; never hold a static pose. The final shot shows the payoff as a clear visual change. Use explicit item params, the documented actors and items, and sparse readable labels. Time significant actions with cue words in the scene's say line, in spoken order. Match each shot to what the viewer hears at that moment.`;
 const brand=`${JSON.stringify(HEDGY_POLICY)}\n${direction}\n${ideaText}\nAPPROVED STORY: ${JSON.stringify(editorial.story)}\n${catalog}`;
 // 2. Plan and specialists.
 const plan=await ask('plan',`${brand} Plan the reel. Map the narration to one sequence, with a visible entry and exit state for each shot and precisely what the viewer follows across each cut. Give twelve specialists a production brief for staging this sequence.`);
 const contributions:string[]=new Array(ROLES.length);let next=0;
 const settled=await Promise.allSettled(Array.from({length:4},async()=>{while(next<ROLES.length){const i=next++;contributions[i]=`${ROLES[i]}: ${await ask(`specialist-${i+1}`,`${brand}\nProducer brief: ${plan}\nYour task: ${ROLES[i]}. Return at most 180 words of precise production instructions for the approved narration, no preamble.`)}`;}}));
 const failure=settled.find(x=>x.status==='rejected');if(failure?.status==='rejected')throw failure.reason;
 // 3. Assembly, with bounded repairs for storyboard or schema problems.
 const schema=JSON.stringify(z.toJSONSchema(hedgyReelSchema));
 const finish=(value:z.infer<typeof hedgyReelSchema>)=>({...value,look:'viral' as const,music:idea.music,musicBrief:idea.musicBrief});
 let output=await ask('assembly',`${brand}\nAssemble a final reel JSON only, no markdown. Use series HEDGY / FINANCE, accent mono, mode dark, look viral, music ${idea.music}, musicBrief exactly as given. Set hook to the approved story's hookText ${JSON.stringify(editorial.story.hookText??'')} (max 7 words, mark the key word with *asterisks*) and header to a 1–4 word topic label, term to the concept's name exactly as spoken in the narration, and payoff to the answer as an end card (max 8 words, concrete numbers welcome, key word in *asterisks*). Give every shot params.world from WORLDS. Keep the anchor objects of a deal (the item, the money, both characters) on screen in every shot of that deal: prefer shots that show actor, counterpart and item together, and pass the same item ids so nothing vanishes or resets. Every scene has type shot, a shot name from the library, params that use only listed ACTORS and ITEMS, a say line, sync markers for significant actions and a transition from cut, push, match, iris that serves the handoff into that shot. Durations are approximate; narration sets the real timing. Copy the approved narration verbatim into the say lines. Sentences may continue across shots. Keep each character in the same role for the whole reel. Do not set mascot. Also write postCaption: the finished Instagram caption shown BELOW this reel, separate from say and all on-screen text. Aim for 80–140 words of useful copy (at least 60, excluding hashtags): a compelling first-line hook, 2–3 short paragraphs that expand the story and explain its mechanism or tradeoff, and a specific takeaway. Use blank lines and finish with 3–5 distinct, relevant hashtags on their own final line, mixing the specific concept with broader finance/learning tags. Match the final narration and chosen analogy; add helpful context without inventing facts, live prices or claims of returns. No generic engagement bait, greeting, disclaimer, sales pitch or narration/stage directions; a restrained emoji is optional. Keep the whole caption under 2,200 characters. Match this JSON schema exactly: ${schema}\nBrief: ${plan}\nSpecialists:\n${contributions.join('\n')}`,{name:'hedgy_reel',schema:hedgyReelSchema});
 const check=(text:string)=>{
  const parsed=hedgyReelSchema.safeParse(parseEditorialJson(text));
  if(!parsed.success)return {issues:parsed.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`)};
  const issues=contentIssues(parsed.data,idea);
  const assembledNarration=parsed.data.scenes.map(scene=>scene.say).join(' ');
  if(normalizeNarration(assembledNarration)!==normalizeNarration(editorial.narration)){
   issues.push('Scene say lines must contain the exact approved narration in order.');
  }
  return issues.length?{issues}:{spec:finish(parsed.data)};
 };
 const sceneRounds=[];
 let result=check(output),lastValid:ReturnType<typeof finish>|undefined;
 for(let round=0;round<=3;round++){
  if(result.spec){
   lastValid=result.spec;
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
${catalog}`,{name:'hedgy_reel',schema:hedgyReelSchema});
  result=check(output);
 }
 // Continuity is a quality review: after the repairs, keep the last schema-valid storyboard with the
 // exact narration (marked unresolved) instead of failing the reel; the rendered-frame review follows.
 let unresolvedContinuity=false;
 if(!result.spec&&lastValid){result={spec:lastValid};unresolvedContinuity=true;}
 if(!result.spec)throw new AppError(502,'hedgy_scenes_unapproved','Hedgy scenes did not pass assembly and continuity review',{sceneRounds});
 const copy=await reviewHedgyCopy(ask,editorial.narration,{title:result.spec.title,postCaption:result.spec.postCaption});
 const spec={...result.spec,...copy.copy};
 return {spec,provenance:{orchestrator:HEDGY_MODEL,effort:HEDGY_EFFORT,critic:HEDGY_CRITIC_MODEL,ideaPick,specialist:HEDGY_MODEL,specialists:ROLES.length,idea:{...idea,conceptName:concept.name,title:spec.title},plan,contributions,editorial:{story:editorial.story,storyRounds:editorial.rounds,sceneRounds,unresolvedContinuity,copyRounds:copy.rounds}}};
}

import {reviewRenderedHedgy,repairFromVisualReview} from './hedgy-visual-review.ts';
/** After rendering: Opus reviews the actual frames; Sol repairs the shot list once when it is not approved. */
export async function hedgyRenderedReview(env:Env,spec:z.infer<typeof hedgyReelSchema>,sheets:{mime:string;base64:string}[],timeline:string,onUsage?:(usage:unknown)=>void|Promise<void>,subscription?:ReelSubscription,{repair=true}:{repair?:boolean}={}){
 const key=typeof env.OPENAI_API_KEY==='string'?env.OPENAI_API_KEY.trim():'';
 const ask=hedgyClient(key,onUsage,subscription),critic=hedgyCritic(ask,onUsage,subscription);
 let review;
 try{review=await reviewRenderedHedgy(critic,spec,sheets,timeline);}catch(error){return {error:String((error as Error)?.message??error)};}
 if(!repair||!review||review.approved||!review.findings.length)return {review};
 const repaired=await repairFromVisualReview(ask,spec,review,hedgyReelSchema);
 return {review,...repaired};
}
