/** Source-backed geometry and action, transported through the unchanged dot renderer. */
export const REFERENCE_IMAGES = ['reference-image','photo','photograph','image','reference-photo'];
export const REFERENCE_VIDEOS = ['reference-video','reference-footage','recorded-subject'];
const norm=(id:string)=>id.toLowerCase().trim().replace(/[\s_]+/g,'-');
export function referenceKind(id:string):'image'|'video'|undefined{
 const key=norm(id);return REFERENCE_IMAGES.includes(key)?'image':REFERENCE_VIDEOS.includes(key)?'video':undefined;
}
/** Source supersampling changes the luminance field, never pixel pitch, ink, lighting or post contrast. */
export function referenceDefaults(params:Record<string,unknown>={}):Record<string,unknown>{
 if(params.preserveAspect===false)throw new Error('reference media must preserve source proportions');
 return {blur:0,preserveAspect:true,monochrome:true,sampleScale:3,loop:false,sourceTransfer:'srgb',...params};
}

/** Flat references support a recorded view, reveals, framing and translation; never invented articulation. */
export function referenceProblems(scene:{camera?:{angle?:string;move?:string};objects?:any[];events?:any[]}):string[]{
 const out:string[]=[];
 for(const object of scene.objects??[]){
  if(!referenceKind(String(object.model)))continue;
  const id=object.id,fail=(message:string)=>out.push(`reference ${id}: ${message}`);
  if(object.pose)fail('poses require a rigged mesh or recorded action');
  if(object.params?.preserveAspect===false)fail('source proportions must be preserved');
  if(object.idle&&object.idle!=='none')fail('idle must be none; the reference has one captured viewpoint');
  const tilted=(v:unknown)=>Array.isArray(v)&&(Number(v[0])!==0||Number(v[1])!==0);
  if(tilted(object.rot)||(object.keyframes??[]).some((k:any)=>tilted(k.rot)))fail('out-of-plane rotation requires a scan or a new source viewpoint');
  if(object.stretch&&Math.abs(object.stretch[0]-object.stretch[1])>1e-6)fail('nonuniform stretch distorts the source anatomy');
  for(const key of Object.keys(object.controls??{}))if(key!=='speed')fail(`unsupported control ${key}; motion must exist in the source`);
  for(const e of scene.events??[])if(e.target===id){
   if(e.pose||e.morph||tilted(e.turn))fail('pose, morph and out-of-plane turns require an editable model');
   for(const key of Object.keys(e.set??{}))if(key!=='speed')fail(`unsupported control ${key}`);
   if(e.fx&&e.fx!=='scan'&&e.fx!=='glint')fail(`effect ${e.fx} deforms a photographic subject`);
  }
  const cameras=[scene.camera,...(scene.events??[]).map((e:any)=>e.camera)].filter(Boolean);
  for(const camera of cameras){
   if(camera.angle&&camera.angle!=='front')fail('use a front camera; camera angles cannot reconstruct unseen geometry');
   if(camera.move&&['orbit','orbit-left','rise','fall','crane','drift'].includes(camera.move))fail('use static/push/pull framing for a captured view');
  }
 }
 return [...new Set(out)];
}
