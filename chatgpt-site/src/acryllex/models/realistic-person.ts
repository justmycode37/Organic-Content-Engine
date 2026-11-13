import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import {clamp,lerp,G,at,roughen,deg} from '../kit.ts';
import {defineModel,type ModelCtx,type PoseState} from './types.ts';
import {gltf,instance} from '../assets.ts';
import {HUMAN_POSES,humanPoses,humanPoseOffsets} from './human.ts';
import {HumanRig,MocapSource,TrackPlayer,applyOffsets,bindPose,emptyPose,groundFeet,parseTrack,SIDES,type OffsetPose} from './human-motion.ts';

/**
 * Real people: rigged bodies driven by motion capture, named poses and optional keyed pose/IK tracks.
 * All posing goes through the generic human rig (human-motion.ts), which works in metres in the figure's own space and
 * never scales a bone to reach a pose: the body keeps its anatomy whatever the file's bone axes or bind pose are.
 */
const CLIP_SOURCE='human-xbot';
export const BODIES=['remy','brian','james','leonard','megan','kate','louise'] as const;
export const MOCAP:Record<string,string>={stand:'idle',idle:'idle',walk:'walk',run:'run',agree:'agree',nod:'agree','shake-head':'headShake',sad:'sad_pose',sneak:'sneak_pose'};
const bare=(n:string)=>n.replace(/^mixamorig\d*:?/,'');

/** Skin-weighted head/neck albedo. Only the instance owns the new color attribute; skin positions stay unchanged. */
export function tintHeadAlbedo(root:THREE.Object3D,tone:number){
 if(tone===1)return;
 root.traverse(o=>{const mesh=o as THREE.SkinnedMesh;if(!mesh.isSkinnedMesh)return;
  const indices=mesh.geometry.getAttribute('skinIndex'),weights=mesh.geometry.getAttribute('skinWeight');if(!indices||!weights)return;
  const head=new Set(mesh.skeleton.bones.flatMap((bone,i)=>/^(Head|HeadTop_End|Neck\d*)$/.test(bare(bone.name))?[i]:[]));if(!head.size)return;
  const colors=new Float32Array(indices.count*3);let affected=false;
  for(let i=0;i<indices.count;i++){let w=0;for(let j=0;j<Math.min(4,indices.itemSize);j++)if(head.has(indices.getComponent(i,j)))w+=weights.getComponent(i,j);
   const factor=lerp(1,tone,clamp(w));if(w>0)affected=true;colors[i*3]=colors[i*3+1]=colors[i*3+2]=factor;}
  if(!affected)return;
  mesh.geometry=mesh.geometry.clone();mesh.geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
  for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){material.vertexColors=true;material.needsUpdate=true;}
 });
}

/** A preset body: the anatomical library figures pass their own asset, natural height and defaults. */
export interface PersonPreset {
 /** Preloaded asset id of an anatomical body (bones named like Mixamo, any bind pose). */
 asset?:string;
 sex?:'male'|'female';
 /** Standing height in metres when params.height is absent. */
 height?:number;
}

export function buildPerson(ctx:ModelCtx,preset:PersonPreset={}){
 const poses=humanPoses(ctx.params),offsets=humanPoseOffsets(ctx.params),walkDistance=ctx.num('walkDistance',1.5,0.2,4),walkPhase=ctx.num('walkPhase',0,-100,100);
 const walkClock=ctx.str('walkClock','distance',['distance','time'] as const),walkPeriod=ctx.num('walkPeriod',1.2,.2,4);
 const figure=ctx.str('figure',preset.sex==='female'?'woman':'man',['man','woman','child','elder','mannequin'] as const);
 const body0=ctx.str('body','',BODIES);
 const scanned=body0?`human-${body0}`:figure==='woman'?'human-megan':figure==='mannequin'?CLIP_SOURCE:'human-brian';
 const anatomical=!!preset.asset&&!body0&&ctx.str('mesh','anatomical',['anatomical','scanned'] as const)==='anatomical'&&!!gltf(preset.asset);
 const id=anatomical?preset.asset!:scanned;
 const real=id!==CLIP_SOURCE;
 // evenly shaded body (like a body scan in the reference): clothing textures read as holes in the dots, so they are off unless asked for
 const skinTone=ctx.num('tone',1,.1,2);
 const inst=instance(gltf(id)?id:CLIP_SOURCE,ctx,skinTone,anatomical||!ctx.bool('textured',false)||!real||!gltf(id),0.42);const srcG=gltf(CLIP_SOURCE);
 if(!inst||!srcG)return null;
 // The bundled MakeHuman Hair helper contains long guide strips, not a finished hairstyle.
 if(anatomical){const hair=ctx.num('hairTone',.8,.1,2),hairShown=ctx.bool('hair',false);
  inst.root.traverse(o=>{const m=o as THREE.Mesh;if(!m.isMesh)return;if(m.name==='Hair'){m.visible=hairShown;m.material=ctx.mat({tone:skinTone*hair,rough:.85});}else m.material=ctx.mat({tone:skinTone,rough:ctx.num('rough',.55,.05,1)});});}
 tintHeadAlbedo(inst.root,ctx.num('headTone',1,.1,2));
 const root=new THREE.Group(),body=new THREE.Group();root.add(body);body.add(inst.root);
 bindPose(inst.root);
 // body height → metres, uniformly: a figure is never squeezed along one axis
 inst.root.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(inst.root,true);const h=Math.max(0.5,box.max.y-box.min.y);
 const natural=preset.height??(figure==='woman'||/megan|kate|louise/.test(id)?1.68:figure==='child'?1.15:1.8);
 const target=ctx.num('height',natural,0.4,2.4);body.scale.setScalar(target/h);
 const stride=ctx.num('stride',0.72,0.3,1);
 // Uniform foot/head proportion controls only. The scanned avatars wear shoes that read oversized in dots (foot default 0.82);
 // anatomical bodies are left exactly as modelled. `build` is accepted for old specs but no longer scales the spine:
 // non-uniform scale on a rotating chain sheared the chest and head.
 {const foot=ctx.num('foot',anatomical?1:0.82,0.5,1.2),head=ctx.num('headScale',1,0.75,1.3);
  if(foot!==1||head!==1)inst.root.traverse(o=>{const n=bare(o.name);if(!(o as THREE.Bone).isBone)return;if(/^(Left|Right)Foot$/.test(n))o.scale.setScalar(foot);if(n==='Head')o.scale.multiplyScalar(head);});}
 const rig=new HumanRig(root,inst.root);
 // hair, brow and nose so the mannequin's head reads as a person
 if(!real||!gltf(id)){const hb=rig.nodes[rig.need('Head')]!.o;hb.updateWorldMatrix(true,false);const ws=hb.getWorldScale(new THREE.Vector3());
  const g=new THREE.Group();g.scale.setScalar(body.scale.y/Math.max(1e-6,ws.x));hb.add(g);
  const cap=new THREE.SphereGeometry(0.108,36,20,0,Math.PI*2,0,Math.PI*0.56);cap.scale(1,1.08,1.12);
  g.add(ctx.mesh(at(roughen(cap,0.006,60,3),[0,0.115,-0.012],[-16,0,0]),{tone:0.5,rough:0.9}));
  if(figure==='woman')g.add(ctx.mesh(at(roughen(G.ellipsoid(0.115,0.19,0.075,32,24),0.006,50,2),[0,0.0,-0.07]),{tone:0.5,rough:0.9}));
  g.add(ctx.mesh(at(G.ellipsoid(0.012,0.028,0.012),[0.092,0.085,-0.005]),{tone:0.95}));g.add(ctx.mesh(at(G.ellipsoid(0.012,0.028,0.012),[-0.092,0.085,-0.005]),{tone:0.95}));
 }
 const source=new MocapSource(SkeletonUtils.clone(srcG.scene) as THREE.Object3D,srcG.animations);
 let track:TrackPlayer|null=null;
 /** Replace the keyed track at runtime (editors, fitting tools). */
 const setTrack=(input:unknown)=>{const parsed=parseTrack(input);track=parsed?new TrackPlayer(parsed,target):null;};
 setTrack(ctx.params.track);
 const ground=ctx.bool('ground',anatomical),curl=ctx.num('fingerCurl',anatomical?0:14,-30,90);
 const sampled=emptyPose(),mix:Record<string,[number,number]>={};
 const update=(_c:Record<string,number>,t:number,pose:PoseState)=>{
  const moving=pose.speed>0.05;
  const from=pose.from==='stand'&&moving?'walk':pose.from,to=pose.to==='stand'&&moving?'walk':pose.to,k=clamp(pose.k);
  const clipA=MOCAP[from]??'idle',clipB=MOCAP[to]??'idle';
  // natural gait: the mocap walk is blended with idle so stride and arm swing stay realistic (stride param)
  for(const key of Object.keys(mix))delete mix[key];
  const add=(n:string,v:number)=>{if(v<=0)return;const dur=source.duration(n);
   const walkCycle=track?.gait(t)??(walkClock==='time'?t/walkPeriod:pose.travel/walkDistance)+walkPhase;
   const time=n==='walk'?((walkCycle%1+1)%1)*dur:n==='run'?((pose.travel/3.2)*dur)%dur:t%dur;
   mix[n]=[(mix[n]?.[0]??0)+v,time];};
  for(const [clip,v] of [[clipA,1-k],[clipB,k]] as [string,number][]){if(clip==='walk'){add('walk',v*stride);add('idle',v*(1-stride));}else add(clip,v);}
  rig.reset();rig.applyPose(source.sample(mix,sampled));
  const PA=(MOCAP[from]?offsets[from]:poses[from]) as OffsetPose|undefined,PB=(MOCAP[to]?offsets[to]:poses[to]) as OffsetPose|undefined;
  applyOffsets(rig,PA,PB,k);
  const ya=PA?.y??0,yb=PB?.y??0,la=PA?.lie??0,lb=PB?.lie??0,lie=lerp(la,lb,k);
  // sitting/crouching heights were authored for a 1.84 m figure; they move the pelvis, not the floor
  rig.hipsPos.y+=lerp(ya,yb,k)*(target/1.84);
  for(const S of SIDES)rig.fingerCurl[S]=deg(curl);
  const extra=track?.offsets(t);if(extra){applyOffsets(rig,extra,undefined,0);rig.hipsPos.y+=extra.y??0;}
  track?.apply(rig,t,pose.travel);
  // keep the soles on the floor for upright poses; lying figures are placed by the body rotation below
  const static0=!MOCAP[from]&&!!PA,static1=!MOCAP[to]&&!!PB;
  if(ground&&lie<=0)groundFeet(rig,0,1-(static0?1-k:0)-(static1?k:0));
  rig.write();
  body.rotation.z=deg(90)*lie;body.position.set(0,0.13*lie,0);
 };
 /** World positions of the measurable body points in the current pose (joints + skin anchors), for fitting and tests. */
 const landmarks=()=>{root.updateWorldMatrix(true,false);const m=new THREE.Matrix4().copy(body.matrixWorld).multiply(new THREE.Matrix4().makeScale(1/body.scale.x,1/body.scale.y,1/body.scale.z));const out:Record<string,THREE.Vector3>={};
  for(const name of ['Hips','Neck','Head',...SIDES.flatMap(S=>['Arm','ForeArm','Hand','HandMiddle1','HandMiddle4','UpLeg','Leg','Foot','ToeBase'].map(n=>S+n)),'headCenter','headTop','faceFront','chin',...SIDES.flatMap(S=>[S+'Heel',S+'Toe',S+'Ball'])]){const p=rig.point(name);if(p)out[name]=p.applyMatrix4(m);}
  return out;};
 return {root,grounded:true,update,landmarks,rig,setTrack};
}

export const PERSON_PARAMS:Record<string,string>={stride:'walk amplitude 0.3 short .. 1 full mocap (default 0.72)',walkDistance:'metres travelled per complete gait cycle (default 1.5)',walkClock:'distance (default) follows travel; time keeps a fixed cadence through eased moves',walkPeriod:'seconds per complete gait cycle when walkClock=time (default 1.2)',walkPhase:'initial gait phase in cycles (default 0)',height:'standing height in metres; the whole body scales uniformly',headTone:'head/neck albedo multiplier 0.1 .. 2 (default 1); affects dot density with fixed ink, without changing skin positions',tone:'skin albedo multiplier 0.1 .. 2 (default 1)',poseAdjustments:'object keyed by pose name, containing joint rotations [x,y,z] in degrees and optional y offset in metres; overrides supplied static joints or adds offsets to mocap poses. Spine and neck rotations are spread along the whole chain',track:'keyed pose/IK track {keys:[{t, weight, hips:{pos,rot}, spine, neck, head, handL|handR|footL|footR:{pos, pole, weight, rot, curl}}], units:"metres"|"stature"} in scene seconds and the figure\'s own space (x left, y up, z forward, origin under the standing pelvis); positions are reached with fixed limb lengths',ground:'true keeps the lowest sole on the floor in upright poses',fingerCurl:'resting finger curl in degrees'};
export const PERSON_POSES=[...new Set([...Object.keys(MOCAP),...Object.keys(HUMAN_POSES)])];

export const person=defineModel({
 id:'human',aliases:['person','man','woman','child','people','scientist','engineer','worker','student','human-body'],
 describe:'A REAL person: realistic man (t-shirt, jeans, short hair) or woman (casual clothes, hair up), scanned-quality body with face and hands, moving with real motion capture (idle, natural walk and run; walks automatically when moved, feet do not slide) and smooth pose changes. Use for any human in the story. For an unclothed anatomical figure use human-male / human-female.',
 params:{figure:'man | woman | child',...PERSON_PARAMS,headScale:'uniform head proportion 0.75 .. 1.3 (default 1)',foot:'uniform foot size (default 0.82: shoes read large in dots)',build:'deprecated, ignored: it sheared the torso; choose another body instead',body:'optional alternative body: remy | brian | james | leonard (men), megan | kate | louise (women)'},
 poses:PERSON_POSES,size:'1.8 m',
 build(ctx){const p=buildPerson(ctx);if(p)return p;const r=new THREE.Group();r.add(ctx.mesh(new THREE.CapsuleGeometry(0.2,1.3),{tone:0.8}));return {root:r,grounded:true};},
});
