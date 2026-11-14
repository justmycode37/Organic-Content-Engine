/** ACRYLLEX topic ledger: every finished reel is remembered so no topic is ever made twice. */
export interface AcryllexHistoryEntry {title?:string;topic?:string;topicKey?:string;summary?:string}

const STOP=new Set('a an the of and or to in on at for from by with without is are was were be been it its this that these those how why what when where who which do does did we you your our they them their us can could would should will so very just into than then about over under more most less after before not no yes really actually'.split(' '));

/** Kebab slug of the core subject, e.g. "Why the blue LED was so hard" → "blue-led-hard". */
export function topicKey(text:string){
 return words(text).join('-').slice(0,60);
}
function words(text:string){
 return String(text??'').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,' ').split(' ')
  .filter(w=>w&&!STOP.has(w)).map(stem);
}
/** Light stemming so invent/invented/inventing and LED/LEDs match. */
function stem(w:string){
 if(w.length>5&&w.endsWith('ing'))return w.slice(0,-3);
 if(w.length>4&&w.endsWith('ed'))return w.slice(0,-2);
 if(w.length>3&&w.endsWith('s')&&!w.endsWith('ss'))return w.slice(0,-1);
 return w;
}
/** Jaccard overlap of the content words of two topic texts (0..1). */
export function topicOverlap(a:string,b:string){
 const A=new Set(words(a)),B=new Set(words(b));if(!A.size||!B.size)return 0;
 let n=0;for(const w of A)if(B.has(w))n++;return n/(A.size+B.size-n);
}
const labels=(h:AcryllexHistoryEntry)=>[h.topic,h.title].filter((s):s is string=>!!s?.trim());
const keyOf=(h:AcryllexHistoryEntry)=>h.topicKey?.trim()||topicKey(h.topic??h.title??'');

/** The earlier reel a candidate repeats (same key, or most of the same subject words), else null. */
export function findRepeat(candidate:{topic:string;topicKey?:string;title?:string},history:AcryllexHistoryEntry[],threshold=0.6){
 const key=candidate.topicKey?.trim()||topicKey(candidate.topic);
 const texts=[candidate.topic,candidate.title].filter((s):s is string=>!!s?.trim());
 for(const h of history){
  if(key&&keyOf(h)===key)return h;
  for(const t of texts)for(const l of labels(h))if(topicOverlap(t,l)>=threshold)return h;
 }
 return null;
}
/** Seed ideas that no earlier reel has covered yet. */
export function freshSeeds(seeds:readonly string[],history:AcryllexHistoryEntry[]){
 return seeds.filter(s=>!findRepeat({topic:s},history,0.5));
}
/** Merge ledgers, newest first, one entry per topic key. */
export function mergeHistory(...lists:AcryllexHistoryEntry[][]){
 const seen=new Set<string>(),out:AcryllexHistoryEntry[]=[];
 for(const list of lists)for(const h of list??[]){if(!h||!(h.topic||h.title))continue;const k=keyOf(h);if(seen.has(k))continue;seen.add(k);out.push(h);}
 return out;
}
/** One compact line per earlier reel for the prompts (all of them, not a recent window). */
export function historyLines(history:AcryllexHistoryEntry[]){
 return history.map(h=>`- [${keyOf(h)}] ${h.topic??h.title}${h.title&&h.topic&&h.title!==h.topic?` ("${h.title}")`:''}`).join('\n')||'- none yet';
}
