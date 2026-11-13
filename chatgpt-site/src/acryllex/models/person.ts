import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import {deg,clamp,lerp,G,at,roughen} from '../kit.ts';
import {defineModel,type ModelCtx,type PoseState} from './types.ts';
import {gltf,instance} from '../assets.ts';
import {HUMAN_POSES,humanPoses,humanPoseOffsets} from './human.ts';

/**
 * Real people: scanned-quality rigged bodies driven by motion capture.
 * A hidden Mixamo source rig plays the mocap clips; every frame its pose is copied onto the visible body in
 * model space (rest-pose relative), so any Mixamo-compatible body works regardless of its bone axes.
 * Named poses (sit, type, sleep, point…) are model-space joint offsets layered on the mocap idle.
 */
const CLIP_SOURCE='human-xbot';
export const BODIES=['remy','brian','james','leonard','megan','kate','louise'] as const;
const MOCAP:Record<string,string>={stand:'idle',idle:'idle',walk:'walk',run:'run',agree:'agree',nod:'agree','shake-head':'headShake',sad:'sad_pose',sneak:'sneak_pose'};
const JOINT_TO_BONE:Record<string,string>={hips:'Hips',spine:'Spine1',neck:'Neck',head:'Head',shL:'LeftArm',elL:'LeftForeArm',wrL:'LeftHand',shR:'RightArm',elR:'RightForeArm',wrR:'RightHand',hipL:'LeftUpLeg',knL:'LeftLeg',ankL:'LeftFoot',hipR:'RightUpLeg',knR:'RightLeg',ankR:'RightFoot'};
const bare=(n:string)=>n.replace(/^mixamorig\d*:?/,'');

interface Node {o:THREE.Object3D;parent:number;name:string;isBone:boolean}
function flatten(root:THREE.Object3D){const list:Node[]=[];const walk=(o:THREE.Object3D,parent:number)=>{const i=list.length;list.push({o,parent,name:bare(o.name),isBone:(o as THREE.Bone).isBone===true});for(const c of o.children)walk(c,i);};walk(root,-1);return list;}
function modelQuats(nodes:Node[],out:THREE.Quaternion[]){for(let i=0;i<nodes.length;i++){const n=nodes[i]!;const q=out[i]??(out[i]=new THREE.Quaternion());if(n.parent<0)q.identity();else q.copy(out[n.parent]!).multiply(n.o.quaternion);}return out;}

/** Skin-weighted head/neck albedo. Only the instance owns the new color attribute; skin positions stay unchanged. */
export function tintHeadAlbedo(root:THREE.Object3D,tone:number){
 if(tone===1)return;
 root.traverse(o=>{const mesh=o as THREE.SkinnedMesh;if(!mesh.isSkinnedMesh)return;
  const indices=mesh.geometry.getAttribute('skinIndex'),weights=mesh.geometry.getAttribute('skinWeight');if(!indices||!weights)return;
  const head=new Set(mesh.skeleton.bones.flatMap((bone,i)=>/^(Head|HeadTop_End|Neck)$/.test(bare(bone.name))?[i]:[]));if(!head.size)return;
  const colors=new Float32Array(indices.count*3);let affected=false;
  for(let i=0;i<indices.count;i++){let w=0;for(let j=0;j<Math.min(4,indices.itemSize);j++)if(head.has(indices.getComponent(i,j)))w+=weights.getComponent(i,j);
   const factor=lerp(1,tone,clamp(w));if(w>0)affected=true;colors[i*3]=colors[i*3+1]=colors[i*3+2]=factor;}
  if(!affected)return;
  mesh.geometry=mesh.geometry.clone();mesh.geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
  for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){material.vertexColors=true;material.needsUpdate=true;}
 });
}

export function buildPerson(ctx:ModelCtx){
 const poses=humanPoses(ctx.params),offsets=humanPoseOffsets(ctx.params),walkDistance=ctx.num('walkDistance',1.5,0.2,4),walkPhase=ctx.num('walkPhase',0,-100,100);
 const walkClock=ctx.str('walkClock','distance',['distance','time'] as const),walkPeriod=ctx.num('walkPeriod',1.2,.2,4);
 const figure=ctx.str('figure','man',['man','woman','child','elder','mannequin'] as const);
 // The anatomical body reads as a real human figure in dots (like the reference); clothed avatars looked wrong.
 const body0=ctx.str('body','',BODIES);
 const id=body0?`human-${body0}`:figure==='woman'?'human-megan':figure==='mannequin'?CLIP_SOURCE:'human-brian';
 const real=id!==CLIP_SOURCE;
 // low texture contrast: clothes and skin read through shading, like a body scan
 // evenly shaded body (like a body scan in the reference): clothing textures read as holes in the dots, so they are off unless asked for
 const inst=instance(gltf(id)?id:CLIP_SOURCE,ctx,1,!ctx.bool('textured',false)||!real||!gltf(id),0.42);const srcG=gltf(CLIP_SOURCE);
 if(!inst||!srcG)return null;
 tintHeadAlbedo(inst.root,ctx.num('headTone',1,.1,2));
 const root=new THREE.Group(),body=new THREE.Group();root.add(body);body.add(inst.root);
 const src=SkeletonUtils.clone(srcG.scene) as THREE.Object3D;
 // true bind (T) pose on both rigs before measuring rest orientations; root bones keep their file transform
 for(const r of [src,inst.root]){const done=new Set<THREE.Skeleton>();r.traverse(o=>{const sk=(o as THREE.SkinnedMesh).skeleton;if(!sk||done.has(sk))return;done.add(sk);
  const keep=sk.bones.filter(bn=>!(bn.parent as THREE.Bone|null)?.isBone).map(bn=>({bn,p:bn.position.clone(),q:bn.quaternion.clone(),s:bn.scale.clone()}));
  sk.pose();for(const k of keep){k.bn.position.copy(k.p);k.bn.quaternion.copy(k.q);k.bn.scale.copy(k.s);}});}
 const sN=flatten(src),tN=flatten(inst.root);
 const sRest=modelQuats(sN,[]).map(q=>q.clone()),tRest=modelQuats(tN,[]).map(q=>q.clone());
 const tLocalRest=tN.map(n=>n.o.quaternion.clone());
 const sIndex=new Map<string,number>();sN.forEach((n,i)=>{if(n.isBone)sIndex.set(n.name,i);});
 const tIndex=new Map<string,number>();tN.forEach((n,i)=>{if(n.isBone)tIndex.set(n.name,i);});
 const sHips=sN[sIndex.get('Hips')??0]!.o,tHips=tN[tIndex.get('Hips')??0]!.o;const sHipsY=sHips.position.y||1,tHipsRest=tHips.position.clone();
 const mixer=new THREE.AnimationMixer(src);const actions=new Map<string,THREE.AnimationAction>();
 for(const c of srcG.animations){const a=mixer.clipAction(c);a.play();a.setEffectiveWeight(0);actions.set(c.name,a);}
 // body height → metres
 inst.root.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(inst.root,true);const h=Math.max(0.5,box.max.y-box.min.y);
 const target=figure==='woman'||/megan|kate|louise/.test(id)?1.68:figure==='child'?1.15:1.8;body.scale.setScalar(target/h);if(figure==='woman')body.scale.x*=0.9;
 const stride=ctx.num('stride',0.72,0.3,1);
 // shoes make Mixamo feet read oversized in dots: scale feet/toes down (foot param), thicken only the upper body (build)
 {const foot=ctx.num('foot',0.82,0.5,1.2),bulk=ctx.num('build',1,0.7,1.5),head=ctx.num('headScale',1,0.75,1.3);inst.root.traverse(o=>{const n=bare(o.name);if(!(o as THREE.Bone).isBone)return;
   if(/^(Left|Right)(Foot|ToeBase|Toe_End)$/.test(n))o.scale.setScalar(n.endsWith('Foot')?foot:1);
   if(n==='Head')o.scale.multiplyScalar(head);
   if(bulk!==1&&/^(Spine|Spine1|Spine2)$/.test(n)){o.scale.x*=Math.cbrt(bulk);o.scale.z*=Math.cbrt(bulk);}});}
 // hair, brow and nose so the head reads as a person rather than a mannequin
 const headI=tIndex.get('Head');
 if(headI!==undefined&&!(real&&gltf(id))){const hb=tN[headI]!.o;hb.updateWorldMatrix(true,false);const ws=new THREE.Vector3();hb.getWorldScale(ws);const u=(target/h)/Math.max(1e-6,ws.x)*(1/ (target/h));
  const g=new THREE.Group();g.scale.setScalar(1/Math.max(1e-6,ws.x/ (body.scale.y)));hb.add(g);void u;
  const long=figure==='woman';
  const cap=new THREE.SphereGeometry(0.108,36,20,0,Math.PI*2,0,Math.PI*0.56);cap.scale(1,1.08,1.12);
  g.add(ctx.mesh(at(roughen(cap,0.006,60,3),[0,0.115,-0.012],[-16,0,0]),{tone:0.5,rough:0.9}));
  if(long)g.add(ctx.mesh(at(roughen(G.ellipsoid(0.115,0.19,0.075,32,24),0.006,50,2),[0,0.0,-0.07]),{tone:0.5,rough:0.9}));
  g.add(ctx.mesh(at(G.ellipsoid(0.012,0.028,0.012),[0.092,0.085,-0.005]),{tone:0.95}));g.add(ctx.mesh(at(G.ellipsoid(0.012,0.028,0.012),[-0.092,0.085,-0.005]),{tone:0.95}));
 }
 const sQ:THREE.Quaternion[]=[],tQ:THREE.Quaternion[]=[],E:THREE.Quaternion[]=tN.map(()=>new THREE.Quaternion());
 const tmp=new THREE.Quaternion(),inv=new THREE.Quaternion(),off=new THREE.Quaternion(),eul=new THREE.Euler();
 const boneJoint=new Map<number,string>();for(const [j,b] of Object.entries(JOINT_TO_BONE)){const i=tIndex.get(b);if(i!==undefined)boneJoint.set(i,j);}
 return {root,grounded:true,update(_c:Record<string,number>,t:number,pose:PoseState){
  const moving=pose.speed>0.05;
  const from=pose.from==='stand'&&moving?'walk':pose.from,to=pose.to==='stand'&&moving?'walk':pose.to,k=clamp(pose.k);
  const clipA=MOCAP[from]??'idle',clipB=MOCAP[to]??'idle';
  // natural gait: the mocap walk is blended with idle so stride and arm swing stay realistic (stride param)
  const wsum:Record<string,number>={};const add=(n:string,v:number)=>{wsum[n]=(wsum[n]??0)+v;};
  for(const [clip,v] of [[clipA,1-k],[clipB,k]] as [string,number][]){if(clip==='walk'){add('walk',v*stride);add('idle',v*(1-stride));}else add(clip,v);}
  for(const [name,a] of actions){
   const w=wsum[name]??0;a.enabled=w>0.001;a.setEffectiveWeight(w);
   const dur=a.getClip().duration;
   const walkCycle=(walkClock==='time'?t/walkPeriod:pose.travel/walkDistance)+walkPhase;
   a.time=name==='walk'?((walkCycle%1+1)%1)*dur:name==='run'?((pose.travel/3.2)*dur)%dur:t%dur;
  }
  mixer.update(0);
  modelQuats(sN,sQ);
  const PA=MOCAP[from]?offsets[from]:poses[from],PB=MOCAP[to]?offsets[to]:poses[to];
  for(let i=0;i<tN.length;i++){
   const n=tN[i]!;const q=tQ[i]??(tQ[i]=new THREE.Quaternion());
   if(n.parent<0){q.identity();E[i]!.identity();continue;}
   const parentQ=tQ[n.parent]!;const si=n.isBone?sIndex.get(n.name):undefined;
   // accumulated pose offset in model space
   E[i]!.copy(E[n.parent]!);
   const joint=boneJoint.get(i);
   if(joint&&(PA||PB)){const a=(PA as Record<string,number[]>|undefined)?.[joint]??[0,0,0],b=(PB as Record<string,number[]>|undefined)?.[joint]??[0,0,0];
    eul.set(deg(lerp(a[0]!,b[0]!,k)),deg(lerp(a[1]!,b[1]!,k)),deg(lerp(a[2]!,b[2]!,k)));off.setFromEuler(eul);E[i]!.multiply(off);}
   if(si!==undefined){
    // desired model-space orientation = pose offset · (source delta from rest) · target rest
    q.copy(E[i]!).multiply(tmp.copy(sQ[si]!).multiply(inv.copy(sRest[si]!).invert())).multiply(tRest[i]!);
    n.o.quaternion.copy(inv.copy(parentQ).invert()).multiply(q);
   }else{n.o.quaternion.copy(tLocalRest[i]!);q.copy(parentQ).multiply(n.o.quaternion);}
  }
  tHips.position.set(tHipsRest.x,tHipsRest.y*(sHips.position.y/sHipsY),tHipsRest.z);
  const ya=PA?.y??0,yb=PB?.y??0,la=PA?.lie??0,lb=PB?.lie??0;
  const lie=lerp(la,lb,k);body.rotation.z=deg(90)*lie;body.position.set(0,lerp(ya,yb,k)*(target/1.84)+0.13*lie,0);
 }};
}

export const person=defineModel({
 id:'human',aliases:['person','man','woman','child','people','scientist','engineer','worker','student','human-body'],
 describe:'A REAL person: realistic man (t-shirt, jeans, short hair) or woman (casual clothes, hair up), scanned-quality body with face and hands, moving with real motion capture (idle, natural walk and run; walks automatically when moved, feet do not slide) and smooth pose changes. Use for any human in the story.',
 params:{figure:'man | woman | child',build:'upper-body bulk 0.7 slim .. 1.5 heavy (default 1)',stride:'walk amplitude 0.3 short .. 1 full mocap (default 0.72)',walkDistance:'metres travelled per complete gait cycle (default 1.5)',walkClock:'distance (default) follows travel; time keeps a fixed cadence through eased moves',walkPeriod:'seconds per complete gait cycle when walkClock=time (default 1.2)',walkPhase:'initial gait phase in cycles (default 0)',headScale:'head proportion 0.75 .. 1.3 (default 1)',headTone:'head/neck albedo multiplier 0.1 .. 2 (default 1); affects dot density with fixed ink, without changing skin positions',poseAdjustments:'object keyed by pose name, containing joint rotations [x,y,z] in degrees and optional y offset in metres; overrides supplied static joints or adds offsets to mocap poses',foot:'foot size (default 0.82)',body:'optional alternative body: remy | brian | james | leonard (men), megan | kate | louise (women)'},
 poses:[...new Set([...Object.keys(MOCAP),...Object.keys(HUMAN_POSES)])],size:'1.8 m',
 build(ctx){const p=buildPerson(ctx);if(p)return p;const r=new THREE.Group();r.add(ctx.mesh(new THREE.CapsuleGeometry(0.2,1.3),{tone:0.8}));return {root:r,grounded:true};},
});
