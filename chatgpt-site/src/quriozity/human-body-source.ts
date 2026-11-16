/** Shared browser/Node contract for an explicitly supplied, self-contained human GLB. */
export interface BodySourceConfig {src:string;remote:boolean;sha256?:string}
function fail(s:string):never{throw new Error(`bodySource: ${s}`);}
export const MAX_BODY_BYTES=128*1024*1024;
export const BODY_BONES=['Hips','Spine','Neck','Head',...['Left','Right'].flatMap(s=>['Shoulder','Arm','ForeArm','Hand','UpLeg','Leg','Foot','ToeBase'].map(n=>s+n))];
export const bodyBoneName=(n:string)=>n.replace(/^mixamorig\d*:?/,'');

/** Only omission disables an import. Explicit malformed/null/false values must not fall back to another person. */
export function parseBodySource(value:unknown,body?:unknown):BodySourceConfig|null{
 if(value===undefined)return null;
 if(!value||typeof value!=='object'||Array.isArray(value))return fail('expected {file|url,sha256?}');
 if(body!==undefined&&body!==null&&body!=='')fail('cannot combine bodySource with params.body');
 const v=value as Record<string,unknown>;
 for(const k of Object.keys(v))if(!['file','url','sha256'].includes(k))fail(`unknown option ${k}`);
 const file=Object.hasOwn(v,'file'),url=Object.hasOwn(v,'url');
 if(file===url)fail('provide exactly one file or url');
 const raw=file?v.file:v.url;if(typeof raw!=='string'||!raw.trim()||raw.includes('\0'))return fail('file/url must be a nonempty string');
 const src=raw.trim();
 if(url){let u:URL;try{u=new URL(src);}catch{return fail('invalid URL');}if(u.protocol!=='https:'||u.username||u.password||u.hash)fail('url must be HTTPS without credentials or fragment');if(!u.pathname.toLowerCase().endsWith('.glb'))fail('source must be a .glb');}
 else if(!src.toLowerCase().endsWith('.glb')||/^[a-z][a-z\d+.-]*:\/\//i.test(src))fail('file must be a local .glb path');
 const pin=v.sha256===undefined?undefined:typeof v.sha256==='string'&&/^[a-f\d]{64}$/i.test(v.sha256)?v.sha256.toLowerCase():fail('sha256 must have64hex digits');
 return {src,remote:url,...(pin?{sha256:pin}:{})};
}
/** Source identity + optional content pin; escaping prevents source strings from colliding with key fields. */
export const bodySourceKey=(c:BodySourceConfig)=>`human-body:${c.sha256??'unpin'}:${c.remote?'url':'file'}:${encodeURIComponent(c.src)}`;

/** Container/preload validation only. Actual loaded skin, bind geometry and rest-frame checks run at construction. */
export function inspectHumanBodyGLB(bytes:Uint8Array):Record<string,any>{
 if(bytes.byteLength<28||bytes.byteLength>MAX_BODY_BYTES)fail('invalid GLB size (maximum128MiB)');
 const d=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(d.getUint32(0,true)!==0x46546c67||d.getUint32(4,true)!==2||d.getUint32(8,true)!==bytes.length)fail('invalid GLB2 header');
 let g:Record<string,any>|undefined,binBytes=-1,binOffset=-1;
 for(let at=12;at<bytes.length;){
  if(at+8>bytes.length)fail('truncated GLB chunk');const n=d.getUint32(at,true),kind=d.getUint32(at+4,true);at+=8;
  if(n%4||at+n>bytes.length)fail('invalid GLB chunk length');
  if(at===20){if(kind!==0x4e4f534a)fail('first GLB chunk must be JSON');try{g=JSON.parse(new TextDecoder().decode(bytes.subarray(at,at+n)));}catch{fail('invalid GLB JSON');}}
  else if(kind===0x4e4f534a)fail('duplicate GLB JSON');
  if(kind===0x004e4942){if(binBytes!==-1)fail('duplicate GLB BIN');binBytes=n;binOffset=at;}
  at+=n;
 }
 if(!g||g.asset?.version!=='2.0'||binBytes<0||g.buffers?.length!==1||g.buffers[0].uri!==undefined)fail('self-contained GLB with embedded BIN required');
 if(!Number.isInteger(g.buffers[0].byteLength)||g.buffers[0].byteLength<1||g.buffers[0].byteLength>binBytes||binBytes-g.buffers[0].byteLength>3)fail('invalid embedded buffer size');
 const views=g.bufferViews??[];
 for(const v of views)if(v.buffer!==0||!Number.isSafeInteger(v.byteLength)||v.byteLength<0||!Number.isSafeInteger(v.byteOffset??0)||(v.byteOffset??0)<0||(v.byteOffset??0)+v.byteLength>g.buffers[0].byteLength)fail('invalid bufferView');
 for(const image of g.images??[]){
  if(image.mimeType!==undefined&&!['image/png','image/jpeg','image/webp'].includes(image.mimeType))fail('embedded textures must be PNG/JPEG/WebP');
  if(image.uri!==undefined){if(typeof image.uri!=='string'||!/^data:image\/(?:png|jpeg|webp);base64,/i.test(image.uri))fail('external or unsupported image URI forbidden; embed PNG/JPEG/WebP textures in GLB');}
  else if(!Number.isInteger(image.bufferView)||!views[image.bufferView])fail('image must use embedded bufferView or data URI');
 }
 const nodes=g.nodes;if(!Array.isArray(nodes)||nodes.length<1||nodes.length>4096)fail('invalid node count');
 const valid=(i:unknown):i is number=>Number.isInteger(i)&&(i as number)>=0&&(i as number)<nodes.length,parents=new Map<number,number>();
 for(let i=0;i<nodes.length;i++){
  const n=nodes[i];if(!n||typeof n!=='object'||(n.children!==undefined&&!Array.isArray(n.children)))fail('invalid node');
  for(const c of n.children??[]){if(!valid(c)||parents.has(c))fail('invalid/multiple node parent');parents.set(c,i);}
 }
 for(let i=0;i<nodes.length;i++){const seen=new Set<number>();let n=i;while(parents.has(n)){if(seen.has(n))fail('cyclic hierarchy');seen.add(n);n=parents.get(n)!;}}
 if(!Array.isArray(g.skins)||!g.skins.length)fail('skinned body required');
 const joints=new Set<number>();
 for(const skin of g.skins){if(!Array.isArray(skin.joints)||!skin.joints.length||skin.joints.some((i:unknown)=>!valid(i))||new Set(skin.joints).size!==skin.joints.length)fail('invalid skin joints');for(const i of skin.joints)joints.add(i);}
 const names=new Map<string,number>();
 for(const i of joints){let ancestor=i;while(parents.has(ancestor)){ancestor=parents.get(ancestor)!;if(nodes[ancestor].mesh!==undefined)fail('joint hierarchy must sit outside mesh subtrees');}const name=bodyBoneName(String(nodes[i].name??''));if(names.has(name))fail(`duplicate bone label ${name}`);names.set(name,i);}
 for(const name of BODY_BONES)if(!names.has(name))fail(`missing canonical bone ${name}`);
 const under=(child:string,parent:string)=>{let i=names.get(child)!;while(parents.has(i)){i=parents.get(i)!;if(i===names.get(parent))return;}fail(`${child} must descend from ${parent}`);};
 under('Spine','Hips');under('Neck','Spine');under('Head','Neck');
 for(const s of ['Left','Right']){under(s+'Shoulder','Spine');under(s+'Arm',s+'Shoulder');under(s+'ForeArm',s+'Arm');under(s+'Hand',s+'ForeArm');under(s+'UpLeg','Hips');under(s+'Leg',s+'UpLeg');under(s+'Foot',s+'Leg');under(s+'ToeBase',s+'Foot');}
 // GLTFLoader normalizes weights, including replacing an all-zero vector with first-joint influence.
 // Validate the authored bytes first so malformed anatomy is never silently repaired during loading.
 const accessors=g.accessors??[],checkedWeights=new Set<number>();
 const weights=(index:number)=>{
  if(checkedWeights.has(index))return;const a=accessors[index],size=({5121:1,5123:2,5126:4} as Record<number,number>)[a.componentType];
  if(a.type!=='VEC4'||!size||!Number.isSafeInteger(a.count)||a.count<1||a.sparse)fail('weights require a dense VEC4 accessor');
  if(a.componentType===5126?a.normalized===true:a.normalized!==true)fail('integer skin weights must be normalized');
  const view=views[a.bufferView],offset=a.byteOffset??0,width=4*size,stride=view?.byteStride??width;
  if(!view||!Number.isSafeInteger(offset)||offset<0||offset%size||!Number.isSafeInteger(stride)||stride<width||stride%size||(view.byteStride!==undefined&&(stride>252||stride%4))||offset+(a.count-1)*stride+width>view.byteLength)fail('invalid weight accessor bounds/stride');
  const divisor=a.componentType===5121?255:a.componentType===5123?65535:1,tolerance=.002+(divisor===1?0:2/divisor);
  for(let i=0;i<a.count;i++){
   let sum=0;for(let k=0;k<4;k++){const at=binOffset+(view.byteOffset??0)+offset+i*stride+k*size,w=(size===4?d.getFloat32(at,true):size===2?d.getUint16(at,true):d.getUint8(at))/divisor;if(!Number.isFinite(w)||w<0||w>1)fail('invalid authored skin weight');sum+=w;}
   if(Math.abs(sum-1)>tolerance)fail('authored skin weights must sum to1');
  }
  checkedWeights.add(index);
 };
 let count=0;
 for(const node of nodes)if(node.mesh!==undefined){const mesh=g.meshes?.[node.mesh],skin=g.skins[node.skin];if(!mesh||!skin)fail('body mesh nodes must be skinned');for(const p of mesh.primitives??[]){if(p.mode!==undefined&&p.mode!==4)fail('body primitives must be triangles');for(const name of ['POSITION','JOINTS_0','WEIGHTS_0'])if(!accessors[p.attributes?.[name]])fail(`missing skin attribute ${name}`);if(accessors[p.attributes.WEIGHTS_0].count!==accessors[p.attributes.POSITION].count)fail('skin/position accessor counts must match');weights(p.attributes.WEIGHTS_0);count++;}}
 if(!count)fail('body must contain a skinned triangle mesh');
 return g;
}
