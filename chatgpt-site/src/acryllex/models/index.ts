import type {ModelDef} from './types.ts';
import {person} from './person.ts';
import {ASSETS,findAsset,assetModel,importedMesh,footage} from '../assets.ts';
import * as tech from './tech.ts';
import * as basic from './basic.ts';
import * as biology from './biology.ts';
import * as nature from './nature.ts';
import * as animals from './animals.ts';
import * as everyday from './everyday.ts';
import * as science from './science.ts';
import * as home from './home.ts';
import * as industry from './industry.ts';
import * as transport from './transport.ts';
import * as places from './places.ts';
import * as living from './living.ts';
import * as objects from './objects.ts';
import * as computing from './computing.ts';
import * as reference from './reference.ts';
import * as shapes from './shapes.ts';

/** Every model module exports ModelDefs; add new modules here. */
// reference/shapes first so their ids win over older packs
const MODULES:Record<string,unknown>[]=[{person,importedMesh,footage},reference,shapes,tech,basic,biology,nature,animals,everyday,science,home,industry,transport,places,living,objects,computing];

export const MODELS:ModelDef[]=MODULES.flatMap(m=>Object.values(m).filter((v):v is ModelDef=>!!v&&typeof v==='object'&&'id' in v&&'build' in v&&typeof (v as ModelDef).build==='function'));

const BY_ID=new Map<string,ModelDef>();
for(const m of MODELS){if(!BY_ID.has(m.id))BY_ID.set(m.id,m);}
for(const m of MODELS)for(const a of m.aliases??[])if(!BY_ID.has(a))BY_ID.set(a,m);

const norm=(s:string)=>s.toLowerCase().trim().replace(/[\s_]+/g,'-');
export function findModel(id:string):ModelDef|undefined{
 const k=norm(id);if(BY_ID.has(k))return BY_ID.get(k);
 const singular=k.replace(/s$/,'');if(BY_ID.has(singular))return BY_ID.get(singular);
 const a=findAsset(k);if(a){const def=assetModel(a);BY_ID.set(k,def);return def;}
 return undefined;
}

/** Catalogue text for the generator. */
export function describeModels(){
 return MODELS.map(m=>{
  const bits=[`- ${m.id}${m.aliases?.length?` (also: ${m.aliases.slice(0,6).join(', ')})`:''}: ${m.describe}`];
  if(m.params&&Object.keys(m.params).length)bits.push(`  params: ${Object.entries(m.params).map(([k,v])=>`${k}=${v}`).join('; ')}`);
  if(m.controls&&Object.keys(m.controls).length)bits.push(`  controls: ${Object.entries(m.controls).map(([k,v])=>`${k} (${v})`).join('; ')}`);
  if(m.poses?.length)bits.push(`  poses: ${m.poses.join(', ')}`);
  return bits.join('\n');
 }).join('\n');
}

/** Compact list of the real photoscanned / animated assets (ids usable as model ids). */
export function describeAssets(){
 return ASSETS.filter(a=>!a.id.startsWith('human-')&&!BY_ID.has(norm(a.id))).map(a=>`${a.id} (${a.name}; ${a.size.map(v=>v.toFixed(2)).join('x')} m${a.anim?'; animated':''})`).join('; ');
}
