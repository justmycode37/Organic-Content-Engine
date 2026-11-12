import * as THREE from 'three';
import {deg,clamp,lerp} from '../kit.ts';
import {defineModel,type ModelCtx,type PoseState} from './types.ts';
import {gltf,instance} from '../assets.ts';

/** Bone offsets (degrees, local XYZ) layered on top of the motion-capture idle frame. Tuned on the Mixamo rig. */
type Offs=Record<string,[number,number,number]>;
export const PERSON_POSES:Record<string,{clip?:string;offs?:Offs;lie?:number;drop?:number}>={
 stand:{clip:'idle'},idle:{clip:'idle'},walk:{clip:'walk'},run:{clip:'run'},
 agree:{clip:'agree'},nod:{clip:'agree'},'shake-head':{clip:'headShake'},sad:{clip:'sad_pose'},sneak:{clip:'sneak_pose'},
 sit:{clip:'idle',drop:0.0,offs:{LeftUpLeg:[-90,0,0],RightUpLeg:[-90,0,0],LeftLeg:[90,0,0],RightLeg:[90,0,0],LeftArm:[0,0,0],RightArm:[0,0,0],LeftForeArm:[0,0,0],RightForeArm:[0,0,0]}},
};

export interface Rig {root:THREE.Object3D;bones:Map<string,THREE.Bone>;mixer:THREE.AnimationMixer;actions:Map<string,THREE.AnimationAction>;rest:Map<string,THREE.Quaternion>}

const CLIP_SOURCES=['human-xbot'];
function clipsFor(target:string){
 const out=new Map<string,THREE.AnimationClip>();
 for(const src of CLIP_SOURCES){const g=gltf(src);if(!g)continue;for(const c of g.animations){const name=c.name.toLowerCase()==='idle'?'idle':c.name.toLowerCase()==='walk'?'walk':c.name.toLowerCase()==='run'?'run':c.name;if(out.has(name)&&src!==target)continue;
  // Cross-rig: drop hip translation (units differ between exports); same rig keeps the vertical bob only.
  const tracks=c.tracks.filter(tr=>!/Hips\.position$/.test(tr.name)||src===target).map(tr=>{if(!/Hips\.position$/.test(tr.name))return tr;const v=tr.values.slice();for(let i=0;i<v.length;i+=3){v[i]=v[0]!;v[i+2]=v[2]!;}return new THREE.VectorKeyframeTrack(tr.name,Array.from(tr.times),Array.from(v));});
  out.set(name,new THREE.AnimationClip(name,c.duration,tracks));}}
 return out;
}

export function buildPerson(ctx:ModelCtx){
 const figure=ctx.str('figure','man',['man','woman','child','elder','soldier','mannequin'] as const);
 const id=figure==='soldier'?'human-soldier':'human-xbot';
 const inst=instance(id,ctx,0.95);
 if(!inst)return null;
 const root=new THREE.Group(),body=new THREE.Group();root.add(body);body.add(inst.root);
 const bones=new Map<string,THREE.Bone>();inst.root.traverse(o=>{if((o as THREE.Bone).isBone)bones.set(o.name.replace(/^mixamorig:?/,''),o as THREE.Bone);});
 const mixer=new THREE.AnimationMixer(inst.root);const actions=new Map<string,THREE.AnimationAction>();
 for(const [name,clip] of clipsFor(id)){const a=mixer.clipAction(clip);a.play();a.setEffectiveWeight(0);actions.set(name,a);}
 if(figure==='child')root.scale.setScalar(0.62);
 if(figure==='woman')body.scale.set(0.9,0.95,0.9);
 if(figure==='elder')body.scale.set(1,0.97,1);
 const tmp=new THREE.Quaternion(),e=new THREE.Euler();
 const weightsFor=(pose:string)=>PERSON_POSES[pose]??PERSON_POSES.stand!;
 return {root,grounded:true,update(_c:Record<string,number>,t:number,pose:PoseState){
  const moving=pose.speed>0.05;
  const from=pose.from==='stand'&&moving?'walk':pose.from,to=pose.to==='stand'&&moving?'walk':pose.to;
  const A=weightsFor(from),B=weightsFor(to),k=clamp(pose.k);
  // clip weights and deterministic clip time (walk/run phase locked to distance travelled: no foot sliding)
  for(const [name,a] of actions){
   let w=0;if((A.clip??'idle')===name)w+=1-k;if((B.clip??'idle')===name)w+=k;
   a.setEffectiveWeight(w);a.enabled=w>0.001;
   const dur=a.getClip().duration;
   if(name==='walk')a.time=((pose.travel/1.42)*dur)%dur;
   else if(name==='run')a.time=((pose.travel/2.6)*dur)%dur;
   else a.time=t%dur;
  }
  mixer.update(0);
  // procedural pose offsets (sit, type, sleep...)
  const keys=new Set([...Object.keys(A.offs??{}),...Object.keys(B.offs??{})]);
  for(const name of keys){const b=bones.get(name);if(!b)continue;const x=A.offs?.[name]??[0,0,0],y=B.offs?.[name]??[0,0,0];
   e.set(deg(lerp(x[0],y[0],k)),deg(lerp(x[1],y[1],k)),deg(lerp(x[2],y[2],k)));tmp.setFromEuler(e);b.quaternion.multiply(tmp);}
  const lie=lerp(A.lie??0,B.lie??0,k);body.rotation.z=deg(90)*lie;body.position.y=0.12*lie;
 }};
}

export const person=defineModel({
 id:'human',aliases:['person','man','woman','people','scientist','engineer','worker','student','human-body','mannequin'],
 describe:'A REAL-looking person: realistic full human body (smooth scanned-mannequin look) with motion-captured idle/walk/run; walks automatically when moved (pose follows travel, no sliding). figure: man | woman | child | elder.',
 params:{figure:'man | woman | child | elder'},
 poses:Object.keys(PERSON_POSES),size:'1.8 m',
 build(ctx){const p=buildPerson(ctx);if(p)return p;const r=new THREE.Group();r.add(ctx.mesh(new THREE.CapsuleGeometry(0.2,1.3),{tone:0.8}));return {root:r,grounded:true};},
});
