// Every Hedgy run must end in a postable reel. When a stage exhausts its model repairs, these
// deterministic fallbacks finish the job from what was approved so far. Outputs are marked
// unresolved in provenance so the shortfall stays visible; they never replace an approved result.
import {SHOT_CATALOG} from '../src/motion/shots/catalog.ts';
import {WORLDS,isWorld,type WorldId} from '../src/motion/kit/world-ids.ts';
import {HEDGY_MUSIC_STYLE,type HedgyIdea} from './hedgy-ideas.ts';

const SAFE_ITEMS=['cash','coffeeCup','smartphone','bread','car','house','pizza','bike','laptop','sneaker'];

/** An idea when ideation never produced a valid one: the first eligible concept with an unused everyday item. */
export function fallbackIdea(concept:{id:string;name:string},usedItems:readonly string[],mood:'drive'|'tense'):HedgyIdea{
 const heroItem=(SAFE_ITEMS.find(i=>!usedItems.includes(i))??'cash') as HedgyIdea['heroItem'];
 const short=concept.name.split(':')[0]!.trim();
 return {concept:concept.id,angle:`Hedgy meets ${short.toLowerCase()} in an everyday purchase and finds out why it changes what he pays.`.slice(0,240),setting:'a neighbourhood shop',heroItem,supportingItems:['cash'] as HedgyIdea['supportingItems'],cast:['hedgy','clerk'],hook:`Why does ${short.toLowerCase()} cost Hedgy money?`.slice(0,160),music:mood,musicBrief:`Driving electronic score, about 110 BPM, with a bright keyboard hook and warm bass; builds into the reveal. ${HEDGY_MUSIC_STYLE}`.slice(0,400)};
}

/** Pick the world the idea's setting names, otherwise a shop. */
export function worldFor(setting:string):WorldId{
 const s=setting.toLowerCase();
 const hit=WORLDS.find(w=>s.includes(w))??(/(bakery|store|grocer|counter)/.test(s)?'shop':/(coffee|café)/.test(s)?'cafe':/(apartment|house|flat|room)/.test(s)?'home':/(car|dealer)/.test(s)?'carlot':/(stock|trading)/.test(s)?'exchange':/(street|town|city)/.test(s)?'street':undefined);
 return hit??'shop';
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

const MOVES=[
 [{event:1,action:'walk-in',who:'left'},{event:2,action:'point',who:'left'}],
 [{event:1,action:'appear'},{event:2,action:'shock',who:'left'}],
 [{event:1,action:'give',who:'left'},{event:2,action:'celebrate',who:'right'}],
 [{event:1,action:'shake'},{event:2,action:'shock',who:'left'}],
 [{event:1,action:'grow'},{event:2,action:'point',who:'right'}],
 [{event:1,action:'take',who:'right'},{event:2,action:'shock',who:'left'}],
 [{event:1,action:'stamp',word:'WHY?'},{event:2,action:'jump',who:'left'}],
 [{event:1,action:'shrink'},{event:2,action:'point',who:'left'}],
];
/** A storyboard built only from the always-valid act shot, one phrase per shot. */
export function fallbackStoryboard(o:{narration:string;idea:HedgyIdea;hook:string;payoff:string;title:string;postCaption:string;music:'drive'|'tense'|'chill'|'bright';musicBrief?:string}){
 const world=worldFor(o.idea.setting),lines=splitNarration(o.narration);
 const other=o.idea.cast.find(c=>c!=='hedgy')??'clerk';
 const scenes=lines.map((say,i)=>{
  const keyword=say.split(/\s+/).map(w=>w.replace(/[^A-Za-z$0-9]/g,'')).filter(w=>w.length>3).slice(-2);
  const moves=MOVES[i%MOVES.length]!.map(m=>m.action==='stamp'?{...m,word:(keyword.at(-1)??'WHY').toUpperCase().slice(0,12)}:m);
  const leftItem=moves.some(m=>m.action==='give')?o.idea.heroItem:undefined;
  return {type:'shot' as const,shot:'act',duration:2.5,transition:i?'cut' as const:undefined,params:{world:i===lines.length-1&&world!=='street'?world:world,left:'hedgy',right:other,item:leftItem?undefined:o.idea.heroItem,...(leftItem?{leftItem}:{}),moves},sync:keyword.map((word,k)=>({word,kind:`beat${k+1}`})),say};
 });
 return {version:1 as const,title:o.title.slice(0,90),postCaption:o.postCaption,series:'HEDGY / FINANCE' as const,mode:'dark' as const,accent:'mono' as const,music:o.music,...(o.musicBrief?{musicBrief:o.musicBrief}:{}),look:'viral' as const,hook:o.hook.slice(0,60),header:'HEDGY',payoff:o.payoff.slice(0,70),scenes};
}

/** Make a parsed-but-rejected storyboard renderable: drop params the shot never reads and fill missing fields. */
export function sanitizeStoryboard<T extends {scenes:{type:string;shot?:string;params?:Record<string,unknown>}[];hook?:string;payoff?:string;term?:string;header?:string}>(spec:T,defaults:{world:WorldId;hook:string;payoff:string;narration:string}):T{
 const said=` ${defaults.narration.toLowerCase().replace(/[^a-z0-9$% ]/g,' ').replace(/\s+/g,' ')} `;
 const scenes=spec.scenes.map(scene=>{
  if(scene.type!=='shot')return scene;
  const allowed=new Set([...(SHOT_CATALOG.find(e=>e.name===scene.shot)?.params??[]),'world']);
  const params=Object.fromEntries(Object.entries(scene.params??{}).filter(([k])=>allowed.has(k)));
  if(!isWorld(params.world))params.world=defaults.world;
  return {...scene,params};
 });
 const term=spec.term&&said.includes(` ${spec.term.toLowerCase().replace(/[^a-z0-9$% ]/g,' ').replace(/\s+/g,' ').trim()} `)?spec.term:undefined;
 return {...spec,scenes,hook:spec.hook??defaults.hook.slice(0,60),payoff:spec.payoff??defaults.payoff.slice(0,70),header:spec.header??'HEDGY',term};
}

/** A valid post caption from the narration when copy generation never produced one. */
export function fallbackCaption(narration:string,conceptName:string){
 const term=conceptName.split(':')[0]!.trim();
 const tag=`#${term.replace(/[^A-Za-z0-9]/g,'')}`;
 const body=`${narration}\n\n${term} in one line: ${conceptName.split(':').slice(1).join(':').trim()||term}. Watch for it the next time you pay, borrow or save, because it changes what the same money gets you. Share this with someone who would get caught by it.`;
 return `${body}\n\n${tag} #MoneyTips #PersonalFinance #FinanceExplained`;
}
