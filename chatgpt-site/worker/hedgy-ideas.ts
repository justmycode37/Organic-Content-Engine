import {z} from 'zod';
import {SHOT_ITEMS} from '../src/motion/shots/catalog.ts';

/** Each entry gives the writer a factual starting point and a drawable story. */
export const HEDGY_CONCEPTS=[
 {
  id:'phantom-traffic-jam',lane:'everyday mysteries',name:'The traffic jam that moves backward',
  heroItem:'car',setting:'a closed test track',world:'testtrack',tag:'PhantomTraffic',
  hook:'How can a traffic jam travel backward?',
  payoff:'The jam moves backward',
  context:'Researchers reproduced the effect on a circular track without a junction or an obstacle. Small speed changes grew as drivers reacted to one another.',
  beats:[
   'On a circular track, every driver starts out moving forward.',
   'When traffic is packed together, one small slowdown makes the next driver slow more.',
   'Soon, each car moves forward again, but the next car back is stopping. The jam itself travels backward.',
  ],
  reveal:'Use trafficwave on the test track. A small slowdown grows into a backward-moving wave in dense traffic. Keep the same circulation direction and car count across shots.',
  source:'https://hdl.handle.net/11094/93262',
 },
 {
  id:'pufferfish-sand-nest',lane:'animal behavior',name:'The tiny fish that builds a giant circle',
  heroItem:'pufferfish',setting:'the sandy seabed',world:'seabed',tag:'Pufferfish',
  hook:'Why is this tiny fish digging in circles?',
  payoff:'The circle is a nest',
  context:'Researchers found that the ridges and grooves help gather fine sand in the centre, where the nest is used for spawning.',
  beats:[
   'On the seabed, a tiny pufferfish starts digging lines in the sand.',
   'Over days, his fins push sand aside, groove by groove, until the circle is about two metres wide.',
   'A female can inspect the finished nest when choosing a mate. That’s why he dug the circle.',
  ],
  reveal:'Use sandnest to follow a male white-spotted pufferfish cutting radial grooves with its fins and reveal the finished courtship nest. Keep the fish present through the reveal, with visitor enabled when the female arrives.',
  source:'https://pmc.ncbi.nlm.nih.gov/articles/PMC3696902/',
 },
 {
  id:'unclaimed-luggage',lane:'hidden journeys',name:'The store that sells what was in lost luggage',
  heroItem:'suitcase',setting:'an airport and a baggage reseller',world:'airport',tag:'LostLuggage',
  hook:'Where can a lost suitcase end up?',
  payoff:'Some contents get a second life',
  context:'Suitcases that arrive late are usually returned through the airline. The reseller describes receiving bags after a much longer search for their owners.',
  beats:[
   'Hedgy’s suitcase is circling a baggage belt. Hedgy is waiting at a different airport.',
   'The airline tries to match the suitcase to its owner. Most delayed bags arrive, but a few stay unclaimed.',
   'A U.S. reseller buys some unclaimed bags. It opens them and sorts the contents to sell, donate, or recycle.',
  ],
  reveal:'Use baggage in ride mode at the airport and inspect mode at the reseller. Follow the same suitcase through the search, explicitly mark time passing, and distinguish a rare unclaimed bag from a routine delay. Keep any example of the contents drawable.',
  source:'https://www.unclaimedbaggage.com/pages/how-it-works',
 },
 {
  id:'apple-cold-storage',lane:'everyday mysteries',name:'How a crisp apple can be months old',
  heroItem:'apple',setting:'an orchard, cold storage and a grocery shop',world:'shop',tag:'AppleStorage',
  hook:'How can this crisp apple be months old?',
  payoff:'Cold and low oxygen buy time',
  context:'The storage conditions are controlled after harvest so that fruit can reach a shop well beyond the picking season.',
  beats:[
   'Hedgy picks a crisp apple long after harvest season.',
   'Some growers keep apples refrigerated in sealed rooms with very little oxygen.',
   'The cold and low oxygen slow how quickly the fruit uses up its stored sugars and ripens. That gives the same apple more time to reach the shop in good condition.',
  ],
  reveal:'Use the same apple at harvest, in cold storage, and at the shop. Show time passing and label the low-oxygen room. Avoid claiming the apple stops changing altogether.',
  source:'https://www.ars.usda.gov/research/publications/publication/?seqNo115=169263',
 },
 {
  id:'sneakers-at-sea',lane:'hidden journeys',name:'The lost sneakers that mapped ocean currents',
  heroItem:'sneaker',setting:'a beach and the open ocean',world:'park',tag:'OceanCurrents',
  hook:'Why did brand-new sneakers wash up on a beach?',
  payoff:'Lost shoes traced ocean currents',
  context:'The locations of the spill and the beach finds gave researchers real observations to compare with models of surface currents.',
  beats:[
   'After a ship lost containers in a Pacific storm, sneakers started washing up along the coast.',
   'The shoes floated. Winds and surface currents carried them away from where the containers fell overboard.',
   'Researchers used the spill and where shoes washed ashore to study that drift. A lost sneaker became a clue to how the ocean moves.',
  ],
  reveal:'Follow one representative sneaker from a shipping crate to the coast, then widen to show how the landing places became clues. Avoid inventing the route of any individual shoe.',
  source:'https://sos.noaa.gov/catalog/live-programs/go-with-the-flow-the-hansa-carriers-lost-shoes/',
 },
] as const;
export type HedgyConcept=(typeof HEDGY_CONCEPTS)[number];
export type HedgyConceptId=HedgyConcept['id'];
/** Hedgy keeps action and forward motion, led by a clear melody rather than trailer drama. */
export const HEDGY_MOODS=['drive','tense'] as const;
export const HEDGY_MUSIC_STYLE='Energetic, melodic electronic / experimental indie instrumental with strong rhythmic drive and a clearly audible melodic hook. Favor fast, percussive piano-like or slightly gritty electric-keyboard patterns, answering synth phrases, syncopated accents, moving warm bass and tight supporting drums. Roughly 90–120 BPM with brisk double-time melodic motion; vary the lead, rhythm and harmony between stories. Keep plenty of action and forward momentum, with slightly less cinematic drama: controlled builds, no huge trailer booms or aggressive industrial distortion. Leave space for narration. Never sparse slow solo piano, ambient meditation, sleepy lo-fi, cute whimsy or orchestral comedy; no vocals.';

/** What a past reel used; built from stored provenance (or a title for older reels). */
export interface HedgyHistoryEntry {title?:string;concept?:string;item?:string;music?:string;musicBrief?:string;setting?:string;summary?:string}

export const ideaSchema=z.object({
 concept:z.string(),
 angle:z.string().min(1).max(240),
 setting:z.string().min(1).max(160),
 heroItem:z.enum(SHOT_ITEMS as unknown as [string,...string[]]),
 supportingItems:z.array(z.enum(SHOT_ITEMS as unknown as [string,...string[]])).max(4),
 cast:z.array(z.string().min(1).max(30)).min(1).max(3),
 hook:z.string().min(1).max(160),
 music:z.enum(HEDGY_MOODS),
 musicBrief:z.string().min(40).max(400),
}).strict();
export type HedgyIdea=z.infer<typeof ideaSchema>;

const shuffle=<T,>(list:readonly T[],random:()=>number)=>{const a=[...list];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j]!,a[i]!];}return a;};

/** Unused stories first. Move the last reel's lane down when there are other fresh stories. */
export function conceptCandidates(history:HedgyHistoryEntry[],count=5,random=Math.random){
 const lastUse=(id:string)=>history.findIndex(h=>h.concept===id);
 const firstKnown=history.map(h=>HEDGY_CONCEPTS.find(c=>c.id===h.concept)).find(Boolean);
 const fresh=HEDGY_CONCEPTS.filter(c=>lastUse(c.id)<0);
 const pilotIds=new Set<string>(HEDGY_CONCEPTS.slice(0,3).map(c=>c.id));
 const freshOrdered=shuffle(fresh,random).sort((a,b)=>
  Number(a.lane===firstKnown?.lane)-Number(b.lane===firstKnown?.lane)||
  Number(pilotIds.has(b.id))-Number(pilotIds.has(a.id)));
 const primary=freshOrdered.filter((c,i)=>freshOrdered.findIndex(other=>other.lane===c.lane)===i);
 const alternatives=freshOrdered.filter(c=>!primary.includes(c));
 const old=HEDGY_CONCEPTS.filter(c=>lastUse(c.id)>=0).sort((a,b)=>lastUse(b.id)-lastUse(a.id));
 return [...primary,...alternatives,...old].slice(0,count);
}
/** Items and moods that the next reel must avoid. */
export function recentlyUsed(history:HedgyHistoryEntry[]){
 const items=[...new Set(history.slice(0,10).map(h=>h.item).filter(Boolean) as string[])];
 const lastMood=history.find(h=>h.music)?.music;
 const moods=HEDGY_MOODS.filter(m=>m!==lastMood);
 return {items,moods};
}
/** Problems that make an idea repeat earlier reels; empty when it is acceptable. */
export function ideaProblems(idea:HedgyIdea,candidates:readonly {id:string}[],history:HedgyHistoryEntry[]){
 const {items,moods}=recentlyUsed(history),problems:string[]=[];
 if(!candidates.some(c=>c.id===idea.concept))problems.push(`concept must be one of: ${candidates.map(c=>c.id).join(', ')}`);
 if(items.includes(idea.heroItem))problems.push(`heroItem ${idea.heroItem} was used recently; choose another`);
 if(!moods.includes(idea.music))problems.push(`music must be one of: ${moods.join(', ')}`);
 return problems;
}
