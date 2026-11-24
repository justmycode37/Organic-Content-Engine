// Every Hedgy run must end in a postable reel. When a stage exhausts its model repairs, these
// deterministic fallbacks finish the job from what was approved so far. Outputs are marked
// unresolved in provenance so the shortfall stays visible; they never replace an approved result.
import {SHOT_CATALOG} from '../src/motion/shots/catalog.ts';
import {WORLDS,isWorld,type WorldId} from '../src/motion/kit/world-ids.ts';
import {HEDGY_SERIES} from './hedgy-policy.ts';
import {HEDGY_MUSIC_STYLE,type HedgyConcept,type HedgyIdea} from './hedgy-ideas.ts';

/** If ideation runs out of attempts, keep one complete, renderable premise. */
export function fallbackIdea(concept:HedgyConcept,mood:'drive'|'tense'):HedgyIdea{
 return {
  concept:concept.id,angle:concept.beats.join(' ').slice(0,240),setting:concept.setting,
  heroItem:concept.heroItem,supportingItems:[],cast:['hedgy'],hook:concept.hook,music:mood,
  musicBrief:`Driving electronic score, about 110 BPM, with a bright keyboard hook and warm bass; builds into the reveal. ${HEDGY_MUSIC_STYLE}`.slice(0,400),
 };
}

/** Pick the world the idea's setting names, otherwise a shop. */
export function worldFor(setting:string,fallback:WorldId='shop'):WorldId{
 const s=setting.toLowerCase();
 const hit=WORLDS.find(w=>s.includes(w))??(/(bakery|store|grocer|counter)/.test(s)?'shop':/(coffee|café)/.test(s)?'cafe':/(apartment|house|flat|room)/.test(s)?'home':/(car|dealer)/.test(s)?'carlot':/(stock|trading)/.test(s)?'exchange':/(street|town|city)/.test(s)?'street':undefined);
 return hit??fallback;
}

/** Split narration into 8–12 phrase-sized lines without changing a single spoken word. */
export function splitNarration(narration:string,target=10){
 const words=narration.trim().split(/\s+/);
 const sentences:string[][]=[];let cur:string[]=[];
 for(const w of words){cur.push(w);if(/[.!?…]["”’)]*$/.test(w)){sentences.push(cur);cur=[];}}
 if(cur.length)sentences.push(cur);
 const lines:string[][]=[];
 for(const s of sentences){
  if(s.length<=9){lines.push(s);continue;}
  const cut=s.findIndex((w,i)=>i>=3&&i<=s.length-3&&/[,;:—–]$/.test(w));
  const at=cut>=0?cut+1:Math.ceil(s.length/2);lines.push(s.slice(0,at),s.slice(at));
 }
 while(lines.length>Math.max(target,2)){let best=0;for(let i=1;i<lines.length-1;i++)if(lines[i]!.length+lines[i+1]!.length<lines[best]!.length+lines[best+1]!.length)best=i;lines.splice(best,2,[...lines[best]!,...lines[best+1]!]);}
 return lines.map(l=>l.join(' '));
}

/** For prepared narration, the causal beats have fixed shot and event handoffs. */
const topicShots:Partial<Record<HedgyConcept['id'],readonly {shot:string;mode:string;cues:readonly string[];world?:WorldId;visitor?:boolean;actor?:'clerk'}[]>>={
 'phantom-traffic-jam':[
  {shot:'trafficwave',mode:'circulate',cues:[]},
  {shot:'trafficwave',mode:'brake',cues:['slowdown']},
  {shot:'trafficwave',mode:'wave',cues:['stopping']},
 ],
 'pufferfish-sand-nest':[
  {shot:'sandnest',mode:'trace',cues:['digging']},
  {shot:'sandnest',mode:'build',cues:['groove']},
  {shot:'sandnest',mode:'reveal',visitor:true,cues:['female','inspect']},
 ],
 'unclaimed-luggage':[
  {shot:'baggage',mode:'ride',cues:[]},
  {shot:'act',mode:'',actor:'clerk',cues:['match']},
  {shot:'baggage',mode:'inspect',world:'shop',cues:['opens']},
 ],
};

/** Stage known beats directly, or preserve the reviewed narration with its visible anchor. */
export function fallbackStoryboard(o:{narration:string;idea:HedgyIdea;concept:HedgyConcept;approvedBeats:string[];preparedStory:boolean;hook:string;payoff:string;title:string;postCaption:string;music:'drive'|'tense'|'chill'|'bright';musicBrief?:string}){
 const prepared=o.preparedStory?topicShots[o.concept.id]:undefined;
 const phrases=splitNarration(o.narration);
 const lines=prepared||phrases.length<2?o.approvedBeats:phrases;
 const world=prepared?o.concept.world:worldFor(o.idea.setting,o.concept.world);
 const scenes=lines.map((say,i)=>{
  const beat=prepared?.[i];
  const cues=beat?.cues??say.split(/\s+/).map(w=>w.replace(/[^A-Za-z0-9]/g,'')).filter(w=>w.length>3).slice(-1);
  const shot=beat?.shot??'act';
  const params=shot==='act'
   ?{world,left:beat?.actor??'hedgy',right:'none',item:o.idea.heroItem,moves:[{event:1,action:'point',who:'left'}]}
   :{world:beat?.world??world,mode:beat?.mode,...(beat?.visitor?{visitor:true}:{})};
  return {type:'shot' as const,shot,duration:3.5,transition:i?'cut' as const:undefined,params,sync:cues.map((word,k)=>({word,kind:`beat${k+1}`})),say};
 });
 return {version:1 as const,title:o.title.slice(0,90),postCaption:o.postCaption,series:HEDGY_SERIES,mode:'dark' as const,accent:'mono' as const,music:o.music,...(o.musicBrief?{musicBrief:o.musicBrief}:{}),look:'viral' as const,hook:o.hook.slice(0,60),header:o.concept.lane.toUpperCase(),payoff:o.payoff.slice(0,70),scenes};
}

/** Make a parsed-but-rejected storyboard renderable: drop params the shot never reads and fill missing fields. */
export function sanitizeStoryboard<T extends {scenes:{type:string;shot?:string;params?:Record<string,unknown>}[];hook?:string;payoff?:string;term?:string;header?:string}>(spec:T,defaults:{world:WorldId;hook:string;payoff:string;narration:string}):T{
 const said=` ${defaults.narration.toLowerCase().replace(/[^a-z0-9$% ]/g,' ').replace(/\s+/g,' ')} `;
 const scenes=spec.scenes.map(scene=>{
  if(scene.type!=='shot')return scene;
  const allowed=new Set([...(SHOT_CATALOG.find(e=>e.name===scene.shot)?.params??[]),'world','camera']);
  const params=Object.fromEntries(Object.entries(scene.params??{}).filter(([k])=>allowed.has(k)));
  if(!isWorld(params.world))params.world=defaults.world;
  return {...scene,params};
 });
 const term=spec.term&&said.includes(` ${spec.term.toLowerCase().replace(/[^a-z0-9$% ]/g,' ').replace(/\s+/g,' ').trim()} `)?spec.term:undefined;
 return {...spec,scenes,hook:spec.hook??defaults.hook.slice(0,60),payoff:spec.payoff??defaults.payoff.slice(0,70),header:spec.header??'HEDGY',term};
}

/** A valid post caption from the narration when copy generation never produced one. */
export function fallbackCaption(narration:string,concept:HedgyConcept){
 const sentences=splitNarration(narration);
 const first=sentences.shift()??concept.hook;
 const rest=sentences.join(' ');
 const paragraphs=[first,rest||concept.beats.join(' ')];
 if(paragraphs.join(' ').split(/\s+/).length<60){
  paragraphs.push(concept.context);
  if(paragraphs.join(' ').split(/\s+/).length<60)paragraphs.push(concept.beats.join(' '));
 }
 return `${paragraphs.join('\n\n')}\n\n#${concept.tag} #AnimatedStories #HowItWorks`;
}
