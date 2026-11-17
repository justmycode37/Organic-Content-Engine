export type CatalogEntry={id:string;aliases?:string[];summary:string;details:string;kind:'model'|'asset'|'media'};
export interface Catalog {text:string;assets:string;has:(id:string)=>boolean;entries?:CatalogEntry[];canonicalId?:(id:string)=>string}

const normal=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const STOP=new Set('a an the and or for to of in on with from this that is are it as by one what why how show scene real object objects model models'.split(' '));
const tokens=(s:string)=>new Set(normal(s).split(' ').filter(t=>t.length>2&&!STOP.has(t)).map(t=>t.length>3?t.replace(/s$/,''):t));

/** Compatibility for supplied/test catalogues; production supplies structured entries. */
export function catalogEntries(cat:Catalog):CatalogEntry[]{
 if(cat.entries)return cat.entries;
 const models=cat.text.split(/\n(?=- )/).filter(s=>s.trim()).map(block=>{
  const match=/^- ([\w-]+)(?: \(also: ([^)]+)\))?: ([^\n]*)/.exec(block);
  return {id:match?.[1]??block.trim(),aliases:match?.[2]?.split(', '),summary:match?.[3]??block.trim(),details:block,kind:'model' as const};
 });
 const assets=cat.assets.split(/; (?=[\w-]+ \()/).filter(Boolean).map(s=>({id:s.split(' ')[0]!,summary:s,details:s,kind:'asset' as const}));
 return [...models,...assets];
}

/** All ids remain discoverable, without long parameter/control descriptions. */
export function catalogIndex(cat:Catalog){
 return catalogEntries(cat).map(e=>`${e.id}${e.aliases?.length?` [${e.aliases.join(',')}]`:''}${e.kind==='media'?`: ${e.summary}`:''}`).join('\n');
}

export function specCatalogIds(spec:{scenes:{objects:{model:string;params?:Record<string,unknown>}[]}[]}){
 return [...new Set(spec.scenes.flatMap(s=>s.objects.flatMap(o=>[o.model,...(typeof o.params?.asset==='string'?[o.params.asset]:[])])))];
}

/** Keep every explicitly used id; fill the remaining slots with relevant alternatives. */
export function catalogContext(cat:Catalog,{query='',required=[] as string[],includeIndex=false,alternatives=12}={}){
 const entries=catalogEntries(cat),wanted=new Set(required.flatMap(id=>[normal(id),normal(cat.canonicalId?.(id)??id)])),terms=tokens(query),phrase=normal(query);
 const score=(e:CatalogEntry)=>{
  const names=[e.id,...(e.aliases??[])].map(normal),words=tokens(`${e.id} ${(e.aliases??[]).join(' ')} ${e.summary}`);
  return names.reduce((n,name)=>n+(name.length>2&&` ${phrase} `.includes(` ${name} `)?20:0),0)+[...terms].reduce((n,t)=>n+(words.has(t)?1:0),0);
 };
 const selected=new Set(entries.filter(e=>[e.id,...(e.aliases??[])].some(id=>wanted.has(normal(id)))));
 for(const {entry} of entries.map(entry=>({entry,score:score(entry)})).filter(e=>e.score>0&&!selected.has(e.entry)).sort((a,b)=>b.score-a.score||a.entry.id.localeCompare(b.entry.id)).slice(0,alternatives))selected.add(entry);
 const details=entries.filter(e=>selected.has(e)).map(e=>e.details).join('\n');
 return `${includeIndex?`COMPACT CATALOGUE INDEX (discovery only):\n${catalogIndex(cat)}\n\n`:''}DOCUMENTED CANDIDATES (use only their supported parameters/actions; an omitted entry is not evidence that the full library lacks it):\n${details||'No matching entries. Request real-asset sourcing rather than inventing controls or source paths.'}`;
}
