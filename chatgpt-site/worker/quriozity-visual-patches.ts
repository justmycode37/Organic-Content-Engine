import {z} from 'zod';
import type {QuriozitySpec} from '../src/quriozity/spec.ts';

/** A small native structured-output schema avoids repeating the full reel schema. */
export const visualPatchSchema=z.object({patches:z.array(z.object({
 scene:z.number().int().min(1),
 path:z.string().min(2).max(240).describe('JSON Pointer within the scene, e.g. /camera/fill or /objects/0/scale'),
 op:z.enum(['set','remove']),
 valueJson:z.string().max(50000).describe('JSON-encoded replacement value for set; empty string for remove'),
}).strict()).min(1).max(48)}).strict();

const ROOTS=new Set(['camera','objects','events','text','hue','transition','transitionDur','ground','ao','aoRadius','aoMethod','motionFPS','motionPhase']);
const NESTED:Record<string,readonly string[]>={raster:['activity','activityRate'],light:['points']};
const UNSAFE=new Set(['__proto__','prototype','constructor']);
/** Prompt text: the only scene fields a visual repair may change. Everything else is the locked calibrated profile. */
export const EDITABLE_SCENE_FIELDS=[...ROOTS,...Object.entries(NESTED).flatMap(([root,fields])=>fields.map(f=>`${root}.${f}`))].join(', ');
export type VisualPatch=z.infer<typeof visualPatchSchema>['patches'][number];
export type DroppedPatch={scene:number;path:string;reason:string;index?:number};

/** The editable part of one authored scene, so a repair author is not shown locked profile fields as patch targets. */
export function editableSceneView<T extends Record<string,unknown>>(scene:T){
 const out:Record<string,unknown>={};
 for(const [key,value] of Object.entries(scene)){
  const fields=NESTED[key];
  if(!fields){out[key]=value;continue;}
  if(!value||typeof value!=='object')continue;
  const kept=Object.fromEntries(Object.entries(value).filter(([field])=>fields.includes(field)));
  if(Object.keys(kept).length)out[key]=kept;
 }
 return out;
}

function applyOne(out:QuriozitySpec,patch:VisualPatch,allowedScenes:ReadonlySet<number>){
 if(!allowedScenes.has(patch.scene)||patch.scene>out.scenes.length)throw new Error(`Scene ${patch.scene} is outside the evidenced repair scope`);
 if(!patch.path.startsWith('/')||/\~(?![01])/.test(patch.path))throw new Error('Invalid JSON Pointer');
 const parts=patch.path.slice(1).split('/').map(s=>s.replace(/~1/g,'/').replace(/~0/g,'~'));
 if(parts.some(s=>!s||UNSAFE.has(s)))throw new Error('Unsafe patch path');
 const [root,field]=parts;
 if(!ROOTS.has(root!)&&!(NESTED[root!]?.includes(field??'')))throw new Error(`Protected scene field: ${root}${field&&NESTED[root!]?`/${field}`:''}`);
 let parent:unknown=out.scenes[patch.scene-1];
 for(const part of parts.slice(0,-1)){
  if(!parent||typeof parent!=='object'||!Object.hasOwn(parent,part))throw new Error(`Patch parent does not exist: ${patch.path}; set its enclosing field instead`);
  parent=(parent as Record<string,unknown>)[part];
 }
 if(!parent||typeof parent!=='object')throw new Error(`Patch parent is not an object: ${patch.path}`);
 const key=parts.at(-1)!;
 const value=patch.op==='set'?JSON.parse(patch.valueJson):undefined;
 if(Array.isArray(parent)){
  if(!/^(0|[1-9]\d*)$/.test(key)&&!(key==='-'&&patch.op==='set'))throw new Error('Invalid array patch index');
  const index=key==='-'?parent.length:Number(key);
  if(index>parent.length||patch.op==='remove'&&index===parent.length)throw new Error('Array patch index out of range');
  if(patch.op==='remove')parent.splice(index,1);else parent[index]=value;
 }else{
  const object=parent as Record<string,unknown>;
  if(patch.op==='remove'){
   if(!Object.hasOwn(object,key))throw new Error(`Removed field does not exist: ${patch.path}`);
   delete object[key];
  }else object[key]=value;
 }
}

/**
 * Apply to a clone. Narration, timing and global style cannot be patched.
 * Strict mode is atomic: any invalid patch rejects the proposal. Lenient mode
 * skips each invalid patch (recording why) and keeps the valid remainder.
 */
export function applyVisualPatches(spec:QuriozitySpec,proposal:unknown,allowedScenes:ReadonlySet<number>,{lenient=false}:{lenient?:boolean}={}){
 const {patches}=visualPatchSchema.parse(proposal),out=structuredClone(spec),changed=new Set<number>(),applied:VisualPatch[]=[],dropped:DroppedPatch[]=[];
 for(const [index,patch] of patches.entries()){
  try{applyOne(out,patch,allowedScenes);}
  catch(error){if(!lenient)throw error;dropped.push({scene:patch.scene,path:patch.path,reason:(error as Error).message,index});continue;}
  applied.push(patch);changed.add(patch.scene-1);
 }
 return {spec:out,changed,applied,dropped};
}
