import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {HumanRig} from '../src/acryllex/models/human-motion.ts';
import {RecordedMotionSource,parseRecordedMotion} from '../src/acryllex/models/recorded-motion.ts';
import {CapturedFingerSource,fingerFrames,applyCapturedFingers,trackCurlSides} from '../src/acryllex/models/human-fingers.ts';

const digits=['Thumb','Index','Middle','Ring','Pinky'];
function template({scale=1,spread=1,restTwist=0,animated=true}={}){
 const scene=new THREE.Group(),bones=new Map();
 const add=(name,parent,p,q)=>{const b=new THREE.Bone();b.name=name;b.position.fromArray(p.map(v=>v*scale));if(q)b.quaternion.copy(q);(parent?bones.get(parent):scene).add(b);bones.set(name,b);return b;};
 add('Hips',null,[0,.9,0]);add('Spine','Hips',[0,.14,0]);add('Spine1','Spine',[0,.15,0]);add('Spine2','Spine1',[0,.15,0]);add('Neck','Spine2',[0,.14,0]);add('Head','Neck',[0,.12,0]);
 for(const [side,s]of[['Left',1],['Right',-1]]){
  add(side+'Arm','Spine2',[s*.18,0,0]);add(side+'ForeArm',side+'Arm',[s*.24,0,0]);add(side+'Hand',side+'ForeArm',[s*.22,0,0]);
  add(side+'UpLeg','Hips',[s*.09,-.04,0]);add(side+'Leg',side+'UpLeg',[0,-.4,0]);add(side+'Foot',side+'Leg',[0,-.38,0]);add(side+'ToeBase',side+'Foot',[0,-.04,.13]);
  for(const[digit,i]of digits.map((d,i)=>[d,i]))for(let j=1;j<=3;j++){
   const p=j===1?(digit==='Thumb'?[s*.04,-.025,.045*spread]:[s*(.07-.005*i),0,(2-i)*.022*spread]):[s*.025,0,digit==='Thumb'?.012:0];
   add(side+'Hand'+digit+j,j===1?side+'Hand':side+'Hand'+digit+(j-1),p,new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),restTwist*(j===1?1:.5)));
  }
 }
 scene.updateMatrixWorld(true);const tracks=[];
 if(animated)for(const[side,s]of[['Left',1],['Right',-1]])for(const digit of digits)for(let j=1;j<=3;j++){
  const name=side+'Hand'+digit+j,rest=bones.get(name).quaternion,values=[];
  for(const angle of[0,.25,.6])values.push(...new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,-s),angle/j).multiply(rest).toArray());
  tracks.push(new THREE.QuaternionKeyframeTrack(name+'.quaternion',[0,1,2],values));
 }
 else tracks.push(new THREE.QuaternionKeyframeTrack('Hips.quaternion',[0,2],[0,0,0,1,0,0,0,1]));
 return{scene,animations:[new THREE.AnimationClip('typing',2,tracks)]};
}
const config=extra=>parseRecordedMotion({file:'synthetic.glb',actions:{sit:'typing'},...extra});
function target(options){const t=template(options),space=new THREE.Group();space.add(t.scene);return new HumanRig(space,t.scene,{bindPose:false});}
function local(r,name){r.solve();const id=r.need(name),n=r.nodes[id];return r.Q[n.parent].clone().invert().multiply(r.Q[id]);}
const closeQ=(a,b)=>assert.ok(1-Math.min(1,Math.abs(a.dot(b)))<1e-12,`quaternion mismatch ${a.toArray()} / ${b.toArray()}`);
const bodyState=r=>{r.solve();return r.nodes.flatMap((n,i)=>n.name.includes('Hand')&&digits.some(d=>n.name.includes(d))?[]:[{name:n.name,p:r.P[i].toArray(),q:r.Q[i].toArray()}]);};

test('body and finger controls validate independently and retain legacy defaults',()=>{
 const t=template();for(const extra of[{}, {body:true,fingers:false}]){const s=new RecordedMotionSource(t,config(extra));assert.equal(s.has('sit'),true);assert.equal(s.hasBody('sit'),true);s.dispose();}
 const s=new RecordedMotionSource(t,config({body:false,fingers:true,fingerCurlPriority:'capture'}));assert.equal(s.has('sit'),true);assert.equal(s.hasBody('sit'),false);assert.equal(s.hasBody('stand'),false);s.dispose();
 for(const extra of[{body:0},{body:'false'},{fingers:1},{fingers:'true'},{fingerCurlPriority:'automatic'},{fingerCurlPriority:false}])assert.throws(()=>config(extra),/recordedMotion/);
});

test('source-self captured rotations reproduce actual parent-local clip quaternions',()=>{
 const t=template(),s=new RecordedMotionSource(t,config()),f=new CapturedFingerSource(s),r=target(),frames=fingerFrames(r),sample=f.sample('sit',1);
 assert.equal(sample.size,30);const before=bodyState(r),positions=r.nodes.map(n=>n.o.position.toArray());
 assert.equal(applyCapturedFingers(r,frames,sample,sample,.5,{enabled:true}).applied,30);
 for(const[name]of sample){const node=s.rig.nodes[s.rig.need(name)].o;closeQ(local(r,name),node.quaternion);}
 assert.deepEqual(bodyState(r),before);assert.deepEqual(r.nodes.map(n=>n.o.position.toArray()),positions);s.dispose();
});

test('different hand lengths and rest spread preserve local offsets after real arm IK',()=>{
 const s=new RecordedMotionSource(template(),config()),f=new CapturedFingerSource(s),sample=f.sample('sit',1.37),r=target({scale:.8,spread:1.35,restTwist:.18}),frames=fingerFrames(r),offsets=r.nodes.map(n=>n.off.toArray());
 r.ik('Left','arm',new THREE.Vector3(.38,1.01,.12),{pole:new THREE.Vector3(.25,.75,-.2)});r.solve();const hand=r.getNamed('LeftHand').clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),.4));r.setNamed('LeftHand',hand);r.solve();const before=bodyState(r);
 applyCapturedFingers(r,frames,sample,sample,0,{enabled:true});assert.deepEqual(bodyState(r),before);assert.deepEqual(r.nodes.map(n=>n.off.toArray()),offsets);
 const q=local(r,'LeftHandIndex1'),first=r.pos('LeftHandIndex3').clone().sub(r.pos('LeftHand'));
 r.setNamed('LeftHand',hand.clone().premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),.8)));r.solve();const moved=bodyState(r);applyCapturedFingers(r,frames,sample,sample,1,{enabled:true});closeQ(local(r,'LeftHandIndex1'),q);assert.deepEqual(bodyState(r),moved);assert.ok(r.pos('LeftHandIndex3').clone().sub(r.pos('LeftHand')).distanceTo(first)>.005);s.dispose();
});

test('authored zero/track curl wins by default; capture priority is explicit and weighted',()=>{
 const s=new RecordedMotionSource(template(),config()),f=new CapturedFingerSource(s),sample=f.sample('sit',1);
 for(const opts of[{explicitSceneCurl:true},{trackCurlSides:new Set(['Left','Right'])}]){const r=target(),before=bodyState(r),targets=r.target.map(q=>q?.toArray()??null);assert.equal(applyCapturedFingers(r,fingerFrames(r),sample,sample,1,{enabled:true,...opts}).applied,0);assert.deepEqual(bodyState(r),before);assert.deepEqual(r.target.map(q=>q?.toArray()??null),targets);}
 const r=target();assert.equal(applyCapturedFingers(r,fingerFrames(r),sample,sample,1,{enabled:true,explicitSceneCurl:true,trackCurlSides:new Set(['Left','Right']),curlPriority:'capture'}).applied,30);
 const left=target(),q=local(left,'LeftHandIndex1');assert.deepEqual(applyCapturedFingers(left,fingerFrames(left),sample,sample,1,{enabled:true,trackCurlSides:new Set(['Left'])}).sides,['Right']);closeQ(local(left,'LeftHandIndex1'),q);
 assert.deepEqual([...trackCurlSides({keys:[{handL:{curl:0}},{handR:{curl:10}}]})],['Left','Right']);s.dispose();
});

test('zero-weight, omitted/off and fingerless sources perform no target writes',()=>{
 const s=new RecordedMotionSource(template(),config()),sample=new CapturedFingerSource(s).sample('sit',1);
 for(const[a,b,k,enabled]of[[null,sample,0,true],[sample,null,1,true],[sample,sample,1,false],[null,null,1,true]]){const r=target(),before=r.target.map(q=>q?.toArray()??null);assert.equal(applyCapturedFingers(r,fingerFrames(r),a,b,k,{enabled}).applied,0);assert.deepEqual(r.target.map(q=>q?.toArray()??null),before);}
 const empty=new RecordedMotionSource(template({animated:false}),config()),fingerless=new CapturedFingerSource(empty);assert.equal(fingerless.sample('sit',1),null);assert.equal(fingerless.sample('unknown',1),null);s.dispose();empty.dispose();
});

test('unused or incomplete palm frames preserve usable data without breaking a valid capture',()=>{
 for(const animated of [false,true]){const s=new RecordedMotionSource(template({spread:0,animated}),config({body:false,fingers:true})),f=new CapturedFingerSource(s);assert.equal(f.sample('sit',1),null);assert.equal(f.frames.size,0);s.dispose();}
 const t=template(),thumb=t.scene.getObjectByName('LeftHandThumb1'),child=t.scene.getObjectByName('LeftHandThumb2');t.scene.getObjectByName('LeftHand').attach(child);thumb.removeFromParent();t.animations[0].tracks=t.animations[0].tracks.filter(x=>!x.name.startsWith('LeftHandThumb1.'));
 const s=new RecordedMotionSource(t,config()),sample=new CapturedFingerSource(s).sample('sit',1);assert.ok(sample.has('LeftHandIndex1'));assert.equal(sample.has('LeftHandThumb2'),false);
 const u=template(),base=u.scene.getObjectByName('LeftHandThumb1');u.scene.getObjectByName('LeftHand').attach(u.scene.getObjectByName('LeftHandThumb2'));base.removeFromParent();const space=new THREE.Group();space.add(u.scene);const r=new HumanRig(space,u.scene,{bindPose:false});r.fingerCurl.Left=.3;r.solve();const curl=local(r,'LeftHandThumb2');
 applyCapturedFingers(r,fingerFrames(r),sample,sample,1,{enabled:true});closeQ(local(r,'LeftHandThumb2'),curl);s.dispose();
});

test('captured action blends and legacy endpoints preserve evaluated local curl without doubling it',()=>{
 const s=new RecordedMotionSource(template(),config({actions:{stand:{clip:'typing',start:0,end:1},sit:{clip:'typing',start:1,end:2}}})),f=new CapturedFingerSource(s);
 const a=f.sample('stand',.5),qa=s.rig.nodes[s.rig.need('LeftHandIndex1')].o.quaternion.clone(),b=f.sample('sit',.5),qb=s.rig.nodes[s.rig.need('LeftHandIndex1')].o.quaternion.clone(),r=target();
 applyCapturedFingers(r,fingerFrames(r),a,b,.35,{enabled:true});closeQ(local(r,'LeftHandIndex1'),qa.clone().slerp(qb,.35));
 const legacy=target();legacy.fingerCurl.Left=.2;legacy.solve();const before=local(legacy,'LeftHandIndex1');
 applyCapturedFingers(legacy,fingerFrames(legacy),null,b,.5,{enabled:true});closeQ(local(legacy,'LeftHandIndex1'),before.slerp(qb,.5));assert.equal(legacy.fingerCurl.Left,0);s.dispose();
});

test('action clocks, endpoint holds, instance isolation and disposal remain deterministic',()=>{
 const t=template(),original=t.animations[0].tracks.map(x=>[...x.values]),s=new RecordedMotionSource(t,config({actions:{sit:{clip:'typing',start:.2,end:1.8,speed:-1,timeOrigin:.3}}})),peer=new RecordedMotionSource(t,config()),f=new CapturedFingerSource(s),p=new CapturedFingerSource(peer),snapshot=q=>[...q].map(([n,q])=>[n,q.toArray()]);
 const first=snapshot(f.sample('sit',.8)),unrelated=snapshot(p.sample('sit',.1));f.sample('sit',1.7);assert.deepEqual(snapshot(f.sample('sit',.8)),first);assert.deepEqual(snapshot(p.sample('sit',.1)),unrelated);
 assert.deepEqual(snapshot(f.sample('sit',100)),snapshot(f.sample('sit',101)));assert.deepEqual(t.animations[0].tracks.map(x=>[...x.values]),original);s.dispose();s.dispose();assert.throws(()=>f.sample('sit',.8),/disposed/);peer.dispose();
});
