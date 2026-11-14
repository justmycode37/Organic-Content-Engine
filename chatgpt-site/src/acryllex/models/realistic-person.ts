import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import {clamp,lerp,G,at,roughen,deg} from '../kit.ts';
import {defineModel,type ModelCtx,type PoseState} from './types.ts';
import {gltf,instance} from '../assets.ts';
import {HUMAN_POSES,humanPoses,humanPoseOffsets} from './human.ts';
import {HumanRig,MocapSource,TrackPlayer,applyOffsets,bindPose,emptyPose,groundFeet,parseTrack,SIDES,type OffsetPose} from './human-motion.ts';
import {CapturedFingerSource,fingerFrames,applyCapturedFingers,trackCurlSides} from './human-fingers.ts';
import {createPoseCorrectives} from './human-correctives.ts';
import {headAccentLight,parseHeadAccentLight} from './human-head-accent-light.ts';
import {neutralArms,blendLocalEndpoints} from './human-static.ts';
import {createStaticFloor} from './human-floor.ts';
import {parseRecordedMotion,recordedMotionKey,RecordedMotionSource} from './recorded-motion.ts';

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

/** Pose-independent material regions blend through the skin weights and preserve the existing head/vertex albedo. */
function tintRegionAlbedo(root:THREE.Object3D,input:unknown){
 if(!input||typeof input!=='object'||Array.isArray(input))return;
 const values=input as Record<string,unknown>,tone=(name:string)=>typeof values[name]==='number'&&Number.isFinite(values[name])?clamp(values[name] as number,.1,2):1;
 const torso=tone('torso'),pelvis=tone('pelvis'),legs=tone('legs');if(torso===1&&pelvis===1&&legs===1)return;
 root.traverse(o=>{const mesh=o as THREE.SkinnedMesh;if(!mesh.isSkinnedMesh)return;
  const indices=mesh.geometry.getAttribute('skinIndex'),weights=mesh.geometry.getAttribute('skinWeight');if(!indices||!weights)return;
  const tones=mesh.skeleton.bones.map(b=>{const n=bare(b.name);return /^Spine/.test(n)?torso:n==='Hips'?pelvis:/^(Left|Right)(UpLeg|Leg|Foot|Toe)/.test(n)?legs:1;});
  const previous=mesh.geometry.getAttribute('color'),colors=new Float32Array(indices.count*3);
  for(let i=0;i<indices.count;i++){let sum=0,total=0;for(let j=0;j<Math.min(4,indices.itemSize);j++){const w=weights.getComponent(i,j);sum+=w*(tones[indices.getComponent(i,j)]??1);total+=w;}
   const factor=total>0?sum/total:1;for(let j=0;j<3;j++)colors[i*3+j]=(previous?.getComponent(i,j)??1)*factor;}
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
 const accentConfig=parseHeadAccentLight(ctx.params.headAccentLight);
 const poses=humanPoses(ctx.params),offsets=humanPoseOffsets(ctx.params),walkDistance=ctx.num('walkDistance',1.5,0.2,4),walkPhase=ctx.num('walkPhase',0,-100,100);
 const walkClock=ctx.str('walkClock','distance',['distance','time'] as const),walkPeriod=ctx.num('walkPeriod',1.2,.2,4);
 const figure=ctx.str('figure',preset.sex==='female'?'woman':'man',['man','woman','child','elder','mannequin'] as const);
 const body0=ctx.str('body','',BODIES);
 const scanned=body0?`human-${body0}`:figure==='woman'?'human-megan':figure==='mannequin'?CLIP_SOURCE:'human-brian';
 const anatomical=!!preset.asset&&!body0&&ctx.str('mesh','anatomical',['anatomical','scanned'] as const)==='anatomical'&&!!gltf(preset.asset);
 const id=anatomical?preset.asset!:scanned;
 const neutralBase=ctx.str('staticPoseBase',anatomical?'neutral':'idle',['neutral','idle'] as const)==='neutral';
 const staticFloorPolicy=ctx.str('staticFloor',anatomical?'skin':'none',['none','skin'] as const);
 if(anatomical&&neutralBase){
  // Counterbalance a deep squat from the arms-down base; preserve explicit per-joint edits.
  const edit=offsets.crouch;
  poses.crouch={...poses.crouch,shL:edit?.shL??[-115,0,8],shR:edit?.shR??[-115,0,-8],elL:edit?.elL??[-5,0,0],elR:edit?.elR??[-5,0,0]};
 }
 const recordedConfig=parseRecordedMotion(ctx.params.recordedMotion);
 if(recordedConfig)for(const name of Object.keys(recordedConfig.actions))if(!PERSON_POSES.includes(name))throw new Error(`recordedMotion: bind an existing human pose name, got ${name}`);
 const motionTemplate=recordedConfig?gltf(recordedMotionKey(recordedConfig)):undefined;
 if(recordedConfig&&!motionTemplate)throw new Error('recordedMotion: source was not preloaded');
 const recorded=recordedConfig&&motionTemplate?new RecordedMotionSource(motionTemplate,recordedConfig):null;
 const isStatic=(name:string)=>!recorded?.hasBody(name)&&!MOCAP[name]&&!!poses[name];

 const real=id!==CLIP_SOURCE;
 // evenly shaded body (like a body scan in the reference): clothing textures read as holes in the dots, so they are off unless asked for
 const skinTone=ctx.num('tone',1,.1,2);
 const inst=instance(gltf(id)?id:CLIP_SOURCE,ctx,skinTone,anatomical||!ctx.bool('textured',false)||!real||!gltf(id),0.42,{sourceAlpha:ctx.bool('sourceAlpha',true),sourceHairSide:ctx.bool('sourceHairSide',false)});const srcG=gltf(CLIP_SOURCE);
 if(!inst||!srcG){if(recorded){recorded.dispose();throw new Error('recordedMotion: required target body/legacy motion asset missing');}return null;}
 // The bundled MakeHuman Hair helper contains long guide strips, not a finished hairstyle.
 if(anatomical){const hair=ctx.num('hairTone',.8,.1,2),hairShown=ctx.bool('hair',false);
  inst.root.traverse(o=>{const m=o as THREE.Mesh;if(!m.isMesh)return;if(m.name==='Hair'){m.visible=hairShown;m.material=ctx.mat({tone:skinTone*hair,rough:.85});}else m.material=ctx.mat({tone:skinTone,rough:ctx.num('rough',.55,.05,1)});});}
 tintHeadAlbedo(inst.root,ctx.num('headTone',1,.1,2));
 tintRegionAlbedo(inst.root,ctx.params.regionTones);
 const root=new THREE.Group(),body=new THREE.Group();root.add(body);body.add(inst.root);
 bindPose(inst.root);
 // body height → metres, uniformly: a figure is never squeezed along one axis
 inst.root.updateMatrixWorld(true);const box=new THREE.Box3();
 inst.root.traverse(o=>{const mesh=o as THREE.Mesh;if(!mesh.isMesh)return;let visible=true;for(let p:THREE.Object3D|null=o;p;p=p.parent)if(!p.visible){visible=false;break;}if(visible)box.expandByObject(mesh,true);});
 const h=Math.max(0.5,box.max.y-box.min.y);
 const natural=preset.height??(figure==='woman'||/megan|kate|louise/.test(id)?1.68:figure==='child'?1.15:1.8);
 const target=ctx.num('height',natural,0.4,2.4);body.scale.setScalar(target/h);
 const stride=ctx.num('stride',0.72,0.3,1);
 // Uniform foot/head proportion controls only. The scanned avatars wear shoes that read oversized in dots (foot default 0.82);
 // anatomical bodies are left exactly as modelled. `build` is accepted for old specs but no longer scales the spine:
 // non-uniform scale on a rotating chain sheared the chest and head.
 {const foot=ctx.num('foot',anatomical?1:0.82,0.5,1.2),head=ctx.num('headScale',1,0.75,1.3);
  if(foot!==1||head!==1)inst.root.traverse(o=>{const n=bare(o.name);if(!(o as THREE.Bone).isBone)return;if(/^(Left|Right)Foot$/.test(n))o.scale.setScalar(foot);if(n==='Head')o.scale.multiplyScalar(head);});}
 // bindPose has already run above. Capture the authored uniform head/foot proportions instead of resetting them again.
 const rig=new HumanRig(root,inst.root,{bindPose:false});
 headAccentLight(inst.root,accentConfig);
 const fingerSource=recorded?.config.fingers?new CapturedFingerSource(recorded):null;
 const targetFingerFrames=fingerSource?.frames.size?fingerFrames(rig,[...new Set([...fingerSource.frames.values()].map(frame=>frame.side))]):null;
 const correctives=createPoseCorrectives(rig,inst.root),poseCorrectives=ctx.bool('poseCorrectives',false);
 // Converted scans need not put their bind-pose soles at local Y=0. Contacts use the measured skin floor.
 const groundFloor=Math.min(...SIDES.map(S=>rig.point(S+'Sole')?.y??0));
 const floorContact=anatomical&&neutralBase&&staticFloorPolicy==='skin'?createStaticFloor(rig,inst.root):null;
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
  const from=pose.from==='stand'&&moving&&!recorded?.hasBody('stand')?'walk':pose.from,to=pose.to==='stand'&&moving&&!recorded?.hasBody('stand')?'walk':pose.to,k=clamp(pose.k);
  const clipA=MOCAP[from]??'idle',clipB=MOCAP[to]??'idle';
  // natural gait: the mocap walk is blended with idle so stride and arm swing stay realistic (stride param)
  for(const key of Object.keys(mix))delete mix[key];
  const add=(n:string,v:number)=>{if(v<=0)return;const dur=source.duration(n);
   const walkCycle=track?.gait(t)??(walkClock==='time'?t/walkPeriod:pose.travel/walkDistance)+walkPhase;
   const time=n==='walk'?((walkCycle%1+1)%1)*dur:n==='run'?((pose.travel/3.2)*dur)%dur:t%dur;
   mix[n]=[(mix[n]?.[0]??0)+v,time];};
  for(const [clip,v] of [[clipA,1-k],[clipB,k]] as [string,number][]){if(clip==='walk'){add('walk',v*stride);add('idle',v*(1-stride));}else add(clip,v);}
  const PA=(recorded?.hasBody(from)||MOCAP[from]?offsets[from]:poses[from]) as OffsetPose|undefined,PB=(recorded?.hasBody(to)||MOCAP[to]?offsets[to]:poses[to]) as OffsetPose|undefined;
  if(recorded&&(recorded.hasBody(from)||recorded.hasBody(to))){
   const endpoint=(name:string,P:OffsetPose|undefined)=>()=>{
    rig.reset();
    if(recorded.hasBody(name))rig.applyPose(recorded.sample(name,t));
    else if(neutralBase&&isStatic(name)){rig.applyPose(emptyPose());neutralArms(rig);}
    else{for(const key of Object.keys(mix))delete mix[key];const clip=MOCAP[name]??'idle';if(clip==='walk'){add('walk',stride);add('idle',1-stride);}else add(clip,1);rig.applyPose(source.sample(mix,sampled));}
    applyOffsets(rig,P,undefined,0);
   };
   if(from===to)endpoint(from,PA)();else blendLocalEndpoints(rig,endpoint(from,PA),endpoint(to,PB),k);
  }else if(neutralBase&&(isStatic(from)||isStatic(to))){
   const endpoint=(name:string,P:OffsetPose|undefined)=>()=>{
    rig.reset();
    if(isStatic(name)){rig.applyPose(emptyPose());neutralArms(rig);}
    else{
     for(const key of Object.keys(mix))delete mix[key];
     const clip=MOCAP[name]??'idle';if(clip==='walk'){add('walk',stride);add('idle',1-stride);}else add(clip,1);
     rig.applyPose(source.sample(mix,sampled));
    }
    applyOffsets(rig,P,undefined,0);
   };
   if(from===to)endpoint(from,PA)();else blendLocalEndpoints(rig,endpoint(from,PA),endpoint(to,PB),k);
  }else{
   rig.reset();rig.applyPose(source.sample(mix,sampled));
   applyOffsets(rig,PA,PB,k);
  }
  const ya=PA?.y??0,yb=PB?.y??0,la=PA?.lie??0,lb=PB?.lie??0,lie=lerp(la,lb,k);
  // sitting/crouching heights were authored for a 1.84 m figure; they move the pelvis, not the floor
  rig.hipsPos.y+=lerp(ya,yb,k)*(target/1.84);
  let settled=false;
  const uprightStatic=(name:string,P:OffsetPose|undefined)=>isStatic(name)&&(P?.lie??0)<=0;
  if(ground&&floorContact?.valid){
   const weight=(uprightStatic(from,PA)?1-k:0)+(uprightStatic(to,PB)?k:0);
   if(weight>0){
    settled=true;
    const delta=(name:string)=>{const edit=offsets[name];if(edit?.y===undefined)return 0;return MOCAP[name]?edit.y:edit.y-(HUMAN_POSES[name]?.y??0);};
    const authored=(delta(from)*(1-k)+delta(to)*k)*(target/1.84);
    rig.hipsPos.y-=authored;
    const uprightMocap=(name:string,P:OffsetPose|undefined)=>!isStatic(name)&&(P?.lie??0)<=0;
    const mocapWeight=(uprightMocap(from,PA)?1-k:0)+(uprightMocap(to,PB)?k:0);
    if(mocapWeight>0){
     rig.solve();const base=rig.readPose(),restore=()=>{rig.reset();rig.applyPose(base);};
     blendLocalEndpoints(rig,restore,()=>{restore();groundFeet(rig,groundFloor);},mocapWeight);
    }
    floorContact.settle(weight);rig.hipsPos.y+=authored;
   }
  }
  for(const S of SIDES)rig.fingerCurl[S]=deg(curl);
  const extra=track?.offsets(t);if(extra){applyOffsets(rig,extra,undefined,0);rig.hipsPos.y+=extra.y??0;}
  track?.apply(rig,t,pose.travel);
  // Keyed tracks retain the final sole guard; unkeyed settled statics keep their knee plane.
  if(ground&&lie<=0&&(!settled||track))groundFeet(rig,groundFloor);
  if(fingerSource&&targetFingerFrames){
   const fa=recorded?.has(pose.from)?pose.from:from,fb=recorded?.has(pose.to)?pose.to:to;
   applyCapturedFingers(rig,targetFingerFrames,fingerSource.sample(fa,t),fingerSource.sample(fb,t),k,{enabled:true,explicitSceneCurl:Object.hasOwn(ctx.params,'fingerCurl'),trackCurlSides:trackCurlSides(track?.track),curlPriority:recordedConfig?.fingerCurlPriority});
  }
  correctives.update(poseCorrectives);
  rig.write();
  body.rotation.z=deg(90)*lie;body.position.set(0,0.13*lie,0);
 };
 /** World positions of the measurable body points in the current pose (joints + skin anchors), for fitting and tests. */
 const landmarks=()=>{root.updateWorldMatrix(true,false);const m=new THREE.Matrix4().copy(body.matrixWorld).multiply(new THREE.Matrix4().makeScale(1/body.scale.x,1/body.scale.y,1/body.scale.z));const out:Record<string,THREE.Vector3>={};
  for(const name of ['Hips','Neck','Head',...SIDES.flatMap(S=>['Arm','ForeArm','Hand','HandMiddle1','HandMiddle4','UpLeg','Leg','Foot','ToeBase'].map(n=>S+n)),'headCenter','headTop','faceFront','chin',...SIDES.flatMap(S=>[S+'Heel',S+'Toe',S+'Ball'])]){const p=rig.point(name);if(p)out[name]=p.applyMatrix4(m);}
  return out;};
 return {root,grounded:true,update,landmarks,rig,setTrack,...(recorded?{dispose:()=>recorded.dispose()}:{} )};
}

export const PERSON_PARAMS:Record<string,string>={recordedMotion:'optional bone-only GLB {file|url,sha256?,actions:{existingPose:clipName|{clip,start?,end?,timeOrigin?,speed?,loop?}},heading:initial|follow|preserve,baselineY?,body:true,fingers:false,fingerCurlPriority:authored|capture}. Recorded body motion replaces the named pose by default; clocks are absolute scene seconds. XZ is in-place; object moves supply world path. Units metres/Y-up/+Z bind. Optional captured fingers compose after hand IK; body:false keeps authored body motion. Authored curl wins unless capture priority is explicit. Missing finger tracks and chair contacts are not inferred.',stride:'walk amplitude 0.3 short .. 1 full mocap (default 0.72)',walkDistance:'metres travelled per complete gait cycle (default 1.5)',walkClock:'distance (default) follows travel; time keeps a fixed cadence through eased moves',walkPeriod:'seconds per complete gait cycle when walkClock=time (default 1.2)',walkPhase:'initial gait phase in cycles (default 0)',height:'standing height in metres; the whole body scales uniformly',staticPoseBase:'neutral (anatomical default) | idle (scan default); static neutral poses use arms-down anatomical frames and local endpoint blends',staticFloor:'skin (anatomical default) | none; with ground=true, skin settles upright neutral static feet before authored tracks. Consumes bank y placement; explicit y edits remain relative to bank y',sourceAlpha:'true (default) preserves authored transparency coverage; false retains legacy material conversion. Plain mode keeps scene-hue albedo; textured mode keeps existing luminance detail. Does not change sidedness',sourceHairSide:'false (default); true keeps authored sidedness on named/tagged Hair surfaces during material conversion. Independent of sourceAlpha; preserves alpha and the existing forceSinglePass policy',poseCorrectives:'false (default); true enables authored hip/knee skin corrections for reviewed bends on anatomical assets. Extreme/custom bends require contact review',headTone:'head/neck albedo multiplier 0.1 .. 2 (default 1); affects dot density with fixed ink, without changing skin positions',tone:'skin albedo multiplier 0.1 .. 2 (default 1)',headAccentLight:'optional {position:[x,y,z],target:[x,y,z],intensity,innerAngleDeg:12,outerAngleDeg:20,distance:3}; fixed world-space metres; an art-directed unshadowed Lambertian head/neck accent linked by skin weights. Omitted/false/0 or intensity:0 is off; preserves existing global lighting, shadows and specular',regionTones:'optional {torso,pelvis,legs} material multipliers 0.1 .. 2, default 1; blend continuously through skin weights, compose with headTone and keep the output ink fixed',poseAdjustments:'object keyed by pose name, containing joint rotations [x,y,z] in degrees and optional y offset in metres; overrides supplied static joints or adds offsets to mocap poses. Spine and neck rotations are spread along the whole chain',track:'keyed pose/IK track {keys:[{t, weight, hips:{pos,rot}, spine, neck, head, handL|handR|footL|footR:{pos, velocity, softness, pole, weight, rot, curl}, floor, floorWeight}], units:"metres"|"stature"} in scene seconds and the figure\'s own space (x left, y up, z forward, origin under the standing pelvis); fixed limb lengths, with optional sole-plane contact independent of trunk blending',ground:'true enables floor contact; neutral skin placement preserves explicit y edits, and keyed tracks retain the final sole-plane guard',fingerCurl:'resting finger curl in degrees'};
export const PERSON_POSES=[...new Set([...Object.keys(MOCAP),...Object.keys(HUMAN_POSES)])];

export const person=defineModel({
 id:'human',aliases:['person','man','woman','child','people','scientist','engineer','worker','student','human-body'],
 describe:'A REAL person: realistic man (t-shirt, jeans, short hair) or woman (casual clothes, hair up), scanned-quality body with face and hands, moving with real motion capture (idle, natural walk and run; walks automatically when moved, with distance-aware gait and keyed hand/foot contacts) and smooth pose changes. Use for any human in the story. For an unclothed anatomical figure use human-male / human-female.',
 params:{figure:'man | woman | child',...PERSON_PARAMS,headScale:'uniform head proportion 0.75 .. 1.3 (default 1)',foot:'uniform foot size (default 0.82: shoes read large in dots)',build:'deprecated, ignored: it sheared the torso; choose another body instead',body:'optional alternative body: remy | brian | james | leonard (men), megan | kate | louise (women)'},
 poses:PERSON_POSES,size:'1.8 m',
 build(ctx){const p=buildPerson(ctx);if(p)return p;const r=new THREE.Group();r.add(ctx.mesh(new THREE.CapsuleGeometry(0.2,1.3),{tone:0.8}));return {root:r,grounded:true};},
});
