// Builds the ACRYLLEX anatomical bodies (human-male, human-female) from MakeHuman's CC0 base mesh, macro targets, rig and weights.
//   node scripts/acryllex/build-humans.mjs [--src <dir with MakeHuman data>] [--out <dir>]
// Sources are fetched at a pinned commit when --src is absent. Output: one skinned .glb per body in metres, Y up, facing +Z,
// feet on y=0, with identity bone rest rotations (a bone's local translation is its model-space offset).
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

export const MAKEHUMAN_COMMIT='a8bc2d54ff0ac92e78ff71431b1023eda42bf482';
const REMOTE=`https://raw.githubusercontent.com/makehumancommunity/makehuman/${MAKEHUMAN_COMMIT}/makehuman/data/`;
const SITE=fileURLToPath(new URL('../../',import.meta.url));
const exists=p=>access(p).then(()=>true,()=>false);

const tri=v=>({min:Math.max(0,1-2*v),max:Math.max(0,2*v-1),average:1-Math.abs(2*v-1)});
/** MakeHuman macro modelling: every target weight is the product of its factor values, exactly as the application combines them. */
export function macroTargets({sex,muscle=.5,weight=.5,height=.5,proportions=.5,cup=.5,firmness=.5,ethnicity={caucasian:1/3,asian:1/3,african:1/3}}){
 const out=[],m=tri(muscle),w=tri(weight),h=tri(height),p=tri(proportions),c=tri(cup),f=tri(firmness);
 for(const [e,v] of Object.entries(ethnicity))if(v>0)out.push([`macrodetails/${e}-${sex}-young`,v]);
 for(const mk of ['min','average','max'])for(const wk of ['min','average','max']){
  const mw=m[mk]*w[wk];if(mw<=0)continue;const stem=`${sex}-young-${mk}muscle-${wk}weight`;
  if(!(mk==='average'&&wk==='average'))out.push([`macrodetails/universal-${stem}`,mw]);
  for(const hk of ['min','max'])if(h[hk]>0)out.push([`macrodetails/height/${stem}-${hk}height`,mw*h[hk]]);
  if(p.max>0)out.push([`macrodetails/proportions/${stem}-idealproportions`,mw*p.max]);
  if(p.min>0)out.push([`macrodetails/proportions/${stem}-uncommonproportions`,mw*p.min]);
  if(sex==='female')for(const ck of ['min','average','max'])for(const fk of ['min','average','max']){
   const cf=c[ck]*f[fk];if(cf>0&&!(ck==='average'&&fk==='average'))out.push([`breast/${stem}-${ck}cup-${fk}firmness`,mw*cf]);}
 }
 return out;
}

/** Two explicit adult bodies. The female is modelled from the female targets, never by scaling the male. */
export const RECIPES={
 'human-male':{sex:'male',muscle:.8,weight:.5,proportions:.75,hair:'cap'},
 'human-female':{sex:'female',muscle:.55,weight:.45,proportions:.75,cup:.45,firmness:.6,hair:'cap'},
};

// MakeHuman default rig → compact rig with Mixamo-compatible names. Every source bone not listed follows its parent's group.
const FINGER=['Thumb','Index','Middle','Ring','Pinky'];
function groupOf(name){
 const side=name.endsWith('.L')?'Left':name.endsWith('.R')?'Right':'',n=side?name.slice(0,-2):name;
 const direct={root:'Hips',pelvis:'Hips',spine05:'Spine',spine04:'Spine1',spine03:'Spine2',spine02:'Spine3',spine01:'Spine4',breast:'Spine3',neck01:'Neck',neck02:'Neck1',neck03:'Neck2',head:'Head',
  clavicle:'Shoulder',shoulder01:'Shoulder',upperarm01:'Arm',upperarm02:'ArmRoll',lowerarm01:'ForeArm',lowerarm02:'ForeArmRoll',wrist:'Hand',upperleg01:'UpLeg',upperleg02:'UpLeg',lowerleg01:'Leg',lowerleg02:'Leg',foot:'Foot'};
 const centre=new Set(['Hips','Spine','Spine1','Spine2','Spine3','Spine4','Neck','Neck1','Neck2','Head']);
 if(direct[n])return centre.has(direct[n])?direct[n]:side+direct[n];
 const finger=/^finger(\d)-(\d)$/.exec(n);if(finger)return `${side}Hand${FINGER[Number(finger[1])-1]}${finger[2]}`;
 if(/^metacarpal/.test(n))return side+'Hand';
 if(/^toe/.test(n))return side+'ToeBase';
 return null;
}
/** [bone, parent, MakeHuman joint (or list averaged) that places its head]. */
function skeletonLayout(){
 const b=[['Hips',null,'spine05____head'],['Spine','Hips','spine05____head'],['Spine1','Spine','spine04____head'],['Spine2','Spine1','spine03____head'],['Spine3','Spine2','spine02____head'],['Spine4','Spine3','spine01____head'],
  ['Neck','Spine4','neck01____head'],['Neck1','Neck','neck02____head'],['Neck2','Neck1','neck03____head'],['Head','Neck2','head____head'],['HeadTop_End','Head','head____tail']];
 for(const [S,s] of [['Left','L'],['Right','R']]){
  b.push([`${S}Shoulder`,'Spine4',`clavicle.${s}____head`],[`${S}Arm`,`${S}Shoulder`,`upperarm01.${s}____head`],[`${S}ArmRoll`,`${S}Arm`,`upperarm02.${s}____head`],[`${S}ForeArm`,`${S}ArmRoll`,`lowerarm01.${s}____head`],[`${S}ForeArmRoll`,`${S}ForeArm`,`lowerarm02.${s}____head`],[`${S}Hand`,`${S}ForeArmRoll`,`wrist.${s}____head`]);
  FINGER.forEach((f,i)=>{for(let k=1;k<=3;k++)b.push([`${S}Hand${f}${k}`,k===1?`${S}Hand`:`${S}Hand${f}${k-1}`,`finger${i+1}-${k}.${s}____head`]);b.push([`${S}Hand${f}4`,`${S}Hand${f}3`,`finger${i+1}-3.${s}____tail`]);});
  b.push([`${S}UpLeg`,'Hips',`upperleg01.${s}____head`],[`${S}Leg`,`${S}UpLeg`,`lowerleg01.${s}____head`],[`${S}Foot`,`${S}Leg`,`foot.${s}____head`],[`${S}ToeBase`,`${S}Foot`,[1,2,3,4,5].map(i=>`toe${i}-1.${s}____head`)],[`${S}Toe_End`,`${S}ToeBase`,[`toe2-3.${s}____tail`,`toe3-3.${s}____tail`]]);
 }
 return b;
}

async function source(dir,rel){
 const file=join(dir,rel);if(await exists(file))return readFile(file,'utf8');
 const r=await fetch(REMOTE+rel,{signal:AbortSignal.timeout(120000)});if(!r.ok)throw new Error(`MakeHuman source missing (${r.status}): ${rel}`);
 const text=await r.text();await mkdir(dirname(file),{recursive:true});await writeFile(file,text);return text;
}

function parseObj(text){
 const v=[],groups=new Map();let cur=null;
 for(const line of text.split('\n')){
  if(line.startsWith('v ')){const p=line.split(/\s+/);v.push(+p[1],+p[2],+p[3]);}
  else if(line.startsWith('g ')){const name=line.slice(2).trim();cur=groups.get(name)??[];groups.set(name,cur);}
  else if(line.startsWith('f ')&&cur)cur.push(line.trim().split(/\s+/).slice(1).map(t=>parseInt(t,10)-1));
 }
 return {v:Float64Array.from(v),groups};
}
function applyTarget(v,text,w){for(const line of text.split('\n')){if(!line||line[0]==='#')continue;const p=line.trim().split(/\s+/);if(p.length<4)continue;const i=+p[0]*3;v[i]+=w*+p[1];v[i+1]+=w*+p[2];v[i+2]+=w*+p[3];}}

/** Build one body. Returns {glb:Uint8Array, report}. */
export async function buildBody(id,srcDir){
 const recipe=RECIPES[id];if(!recipe)throw new Error(`unknown body ${id}`);
 const obj=parseObj(await source(srcDir,'3dobjs/base.obj')),v=obj.v;
 const targets=macroTargets(recipe);for(const [name,w] of targets)applyTarget(v,await source(srcDir,`targets/${name}.target`),w);
 const skel=JSON.parse(await source(srcDir,'rigs/default.mhskel')),weights=JSON.parse(await source(srcDir,'rigs/default_weights.mhw')).weights;
 // decimetres → metres; ground the soles and put the pelvis on the vertical axis
 const jointRaw=name=>{const ids=skel.joints[name];if(!ids)throw new Error(`joint ${name}`);const p=[0,0,0];for(const i of ids){p[0]+=v[i*3];p[1]+=v[i*3+1];p[2]+=v[i*3+2];}return p.map(x=>x/ids.length);};
 const bodyFaces=obj.groups.get('body');let minY=Infinity;for(const f of bodyFaces)for(const i of f)minY=Math.min(minY,v[i*3+1]);
 const hip=jointRaw('spine05____head');const toM=p=>[(p[0]-hip[0])*.1,(p[1]-minY)*.1,(p[2]-hip[2])*.1];
 const joint=spec=>{const list=Array.isArray(spec)?spec:[spec];const p=[0,0,0];for(const n of list){const q=toM(jointRaw(n));p[0]+=q[0];p[1]+=q[1];p[2]+=q[2];}return p.map(x=>x/list.length);};
 const layout=skeletonLayout(),bones=layout.map(([name,parent,j])=>({name,parent,head:joint(j)}));
 // exact bilateral symmetry of the rig
 for(const b of bones){if(!b.parent||/^(Spine|Neck|Head|Hips)/.test(b.name))b.head[0]=0;}
 for(const b of bones)if(b.name.startsWith('Right')){const l=bones.find(x=>x.name==='Left'+b.name.slice(5));b.head=[-l.head[0],l.head[1],l.head[2]];}
 const index=new Map(bones.map((b,i)=>[b.name,i]));
 // skin weights merged into the compact rig
 const groupCache=new Map();const resolve=name=>{if(groupCache.has(name))return groupCache.get(name);let n=name,g=null;while(n&&!(g=groupOf(n)))n=skel.bones[n]?.parent;const r=g??'Hips';groupCache.set(name,r);return r;};
 const vw=new Map();
 for(const [bone,list] of Object.entries(weights)){const bi=index.get(resolve(bone));if(bi===undefined)throw new Error(`no bone for ${bone}`);for(const [vi,w] of list){let m=vw.get(vi);if(!m)vw.set(vi,m=new Map());m.set(bi,(m.get(bi)??0)+w);}}
 const head=index.get('Head');
 const mesh=(name,groups)=>{
  const faces=groups.flatMap(g=>obj.groups.get(g)??[]);const remap=new Map(),pos=[],ji=[],jw=[],idx=[];
  const use=i=>{let k=remap.get(i);if(k===undefined){k=remap.size;remap.set(i,k);pos.push(...toM([v[i*3],v[i*3+1],v[i*3+2]]));
   const top=[...(vw.get(i)??new Map([[head,1]]))].sort((a,b)=>b[1]-a[1]).slice(0,4);const sum=top.reduce((s,x)=>s+x[1],0)||1;
   for(let q=0;q<4;q++){ji.push(top[q]?.[0]??0);jw.push((top[q]?.[1]??0)/sum);}}return k;};
  for(const f of faces){const a=f.map(use);for(let k=1;k+1<a.length;k++)idx.push(a[0],a[k],a[k+1]);}
  const n=new Float64Array(pos.length);
  for(let t=0;t<idx.length;t+=3){const [a,b,c]=[idx[t]*3,idx[t+1]*3,idx[t+2]*3];const ux=pos[b]-pos[a],uy=pos[b+1]-pos[a+1],uz=pos[b+2]-pos[a+2],wx=pos[c]-pos[a],wy=pos[c+1]-pos[a+1],wz=pos[c+2]-pos[a+2];
   const nx=uy*wz-uz*wy,ny=uz*wx-ux*wz,nz=ux*wy-uy*wx;for(const o of [a,b,c]){n[o]+=nx;n[o+1]+=ny;n[o+2]+=nz;}}
  for(let i=0;i<n.length;i+=3){const l=Math.hypot(n[i],n[i+1],n[i+2])||1;n[i]/=l;n[i+1]/=l;n[i+2]/=l;}
  return {name,pos:Float32Array.from(pos),normal:Float32Array.from(n),joints:Uint8Array.from(ji),weights:Float32Array.from(jw),index:pos.length/3>65535?Uint32Array.from(idx):Uint16Array.from(idx)};
 };
 const meshes=[mesh('Body',['body']),mesh('Eyes',['helper-l-eye','helper-r-eye'])];
 if(recipe.hair==='cap')meshes.push(mesh('Hair',['helper-hair']));
 // ---- glTF ----
 const chunks=[];let offset=0;const views=[],accessors=[];
 const push=(arr,target)=>{const bytes=new Uint8Array(arr.buffer,arr.byteOffset,arr.byteLength);const pad=(4-bytes.length%4)%4;views.push({buffer:0,byteOffset:offset,byteLength:bytes.length,...(target?{target}:{})});chunks.push(bytes);if(pad)chunks.push(new Uint8Array(pad));offset+=bytes.length+pad;return views.length-1;};
 const acc=(arr,type,componentType,target,extra={})=>{const size={SCALAR:1,VEC3:3,VEC4:4,MAT4:16}[type];accessors.push({bufferView:push(arr,target),componentType,count:arr.length/size,type,...extra});return accessors.length-1;};
 const bounds=p=>{const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<p.length;i++){min[i%3]=Math.min(min[i%3],p[i]);max[i%3]=Math.max(max[i%3],p[i]);}return {min,max};};
 const nodes=bones.map(b=>{const p=b.parent?bones[index.get(b.parent)].head:[0,0,0];return {name:b.name,translation:[b.head[0]-p[0],b.head[1]-p[1],b.head[2]-p[2]],children:[]};});
 bones.forEach((b,i)=>{if(b.parent)nodes[index.get(b.parent)].children.push(i);});for(const n of nodes)if(!n.children.length)delete n.children;
 const ibm=new Float32Array(bones.length*16);bones.forEach((b,i)=>{ibm.set([1,0,0,0,0,1,0,0,0,0,1,0,-b.head[0],-b.head[1],-b.head[2],1],i*16);});
 const skin={joints:bones.map((_,i)=>i),skeleton:0,inverseBindMatrices:acc(ibm,'MAT4',5126)};
 const gltfMeshes=meshes.map(m=>({name:m.name,primitives:[{attributes:{POSITION:acc(m.pos,'VEC3',5126,34962,bounds(m.pos)),NORMAL:acc(m.normal,'VEC3',5126,34962),JOINTS_0:acc(m.joints,'VEC4',5121,34962),WEIGHTS_0:acc(m.weights,'VEC4',5126,34962)},indices:acc(m.index,'SCALAR',m.index instanceof Uint32Array?5125:5123,34963),material:m.name==='Body'?0:m.name==='Hair'?1:2}]}));
 const meshNodes=meshes.map((m,i)=>({name:m.name,mesh:i,skin:0}));const armature={name:'HumanArmature',children:[0,...meshNodes.map((_,i)=>nodes.length+i)]};
 const height=bounds(meshes[0].pos).max[1];
 const json={asset:{version:'2.0',generator:'acryllex build-humans.mjs',copyright:'Body geometry, rig and weights derived from MakeHuman assets (CC0 1.0).',extras:{id,source:'https://github.com/makehumancommunity/makehuman',commit:MAKEHUMAN_COMMIT,license:'CC0-1.0',recipe,targets:targets.map(([n,w])=>[n,+w.toFixed(4)]),height:+height.toFixed(4)}},
  scene:0,scenes:[{name:id,nodes:[nodes.length+meshNodes.length]}],nodes:[...nodes,...meshNodes,armature],meshes:gltfMeshes,skins:[skin],
  materials:[{name:'Skin',pbrMetallicRoughness:{baseColorFactor:[.8,.8,.8,1],metallicFactor:0,roughnessFactor:.6}},{name:'Hair',pbrMetallicRoughness:{baseColorFactor:[.35,.35,.35,1],metallicFactor:0,roughnessFactor:.9}},{name:'Eyes',pbrMetallicRoughness:{baseColorFactor:[.9,.9,.9,1],metallicFactor:0,roughnessFactor:.4}}],
  accessors,bufferViews:views,buffers:[{byteLength:offset}]};
 const jsonBytes=Buffer.from(JSON.stringify(json));const jpad=(4-jsonBytes.length%4)%4,total=12+8+jsonBytes.length+jpad+8+offset;
 const out=Buffer.alloc(total);let o=0;out.writeUInt32LE(0x46546C67,o);o+=4;out.writeUInt32LE(2,o);o+=4;out.writeUInt32LE(total,o);o+=4;
 out.writeUInt32LE(jsonBytes.length+jpad,o);o+=4;out.writeUInt32LE(0x4E4F534A,o);o+=4;jsonBytes.copy(out,o);o+=jsonBytes.length;out.fill(0x20,o,o+jpad);o+=jpad;
 out.writeUInt32LE(offset,o);o+=4;out.writeUInt32LE(0x004E4942,o);o+=4;for(const c of chunks){out.set(c,o);o+=c.length;}
 const at=n=>bones[index.get(n)].head,len=(a,b)=>Math.hypot(at(a)[0]-at(b)[0],at(a)[1]-at(b)[1],at(a)[2]-at(b)[2]);
 return {glb:out,report:{id,height:+height.toFixed(3),vertices:meshes.map(m=>[m.name,m.pos.length/3]),bones:bones.length,metres:{hipHeight:+at('LeftUpLeg')[1].toFixed(3),thigh:+len('LeftUpLeg','LeftLeg').toFixed(3),shin:+len('LeftLeg','LeftFoot').toFixed(3),upperArm:+len('LeftArm','LeftForeArm').toFixed(3),foreArm:+len('LeftForeArm','LeftHand').toFixed(3),shoulderWidth:+(2*at('LeftArm')[0]).toFixed(3),hipWidth:+(2*at('LeftUpLeg')[0]).toFixed(3),neckHeight:+at('Neck')[1].toFixed(3)}}};
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const arg=k=>{const i=process.argv.indexOf(k);return i>0?process.argv[i+1]:undefined;};
 const src=arg('--src')??join(SITE,'.acryllex-assets','makehuman',MAKEHUMAN_COMMIT),out=arg('--out')??join(SITE,'src/acryllex/assets/humans');
 await mkdir(out,{recursive:true});
 for(const id of Object.keys(RECIPES)){const {glb,report}=await buildBody(id,src);await writeFile(join(out,`${id}.glb`),glb);console.log(JSON.stringify({...report,bytes:glb.length}));}
}
