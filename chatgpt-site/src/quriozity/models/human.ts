import * as THREE from 'three';
import {G,at,deg,lerp,clamp} from '../kit.ts';
import {defineModel,type ModelCtx,type PoseState} from './types.ts';

type J=[number,number,number];
type Pose=Partial<Record<Joint,J>>&{y?:number;lie?:number};
type Joint='hips'|'spine'|'neck'|'head'|'shL'|'elL'|'wrL'|'shR'|'elR'|'wrR'|'hipL'|'knL'|'ankL'|'hipR'|'knR'|'ankR';
const JOINTS:Joint[]=['hips','spine','neck','head','shL','elL','wrL','shR','elR','wrR','hipL','knL','ankL','hipR','knR','ankR'];

const STAND:Pose={shL:[2,0,10],shR:[2,0,-10],elL:[-10,0,0],elR:[-10,0,0],knL:[3,0,0],knR:[3,0,0]};
const SIT:Pose={y:-0.44,hipL:[-88,0,4],hipR:[-88,0,-4],knL:[88,0,0],knR:[88,0,0],ankL:[0,0,0],ankR:[0,0,0],shL:[-18,0,8],shR:[-18,0,-8],elL:[-55,0,0],elR:[-55,0,0],spine:[4,0,0]};
/** Named poses. Angles in degrees; x>0 swings a limb backwards, knees bend with x>0, elbows with x<0. */
export const HUMAN_POSES:Record<string,Pose>={
 stand:STAND,
 idle:STAND,
 sit:SIT,
 type:{...SIT,shL:[-42,0,10],shR:[-42,0,-10],elL:[-62,0,-8],elR:[-62,0,8],head:[12,0,0],spine:[10,0,0]},
 'type-lean':{...SIT,spine:[26,0,0],neck:[6,0,0],head:[4,0,0],shL:[-58,0,10],shR:[-58,0,-10],elL:[-52,0,-8],elR:[-52,0,8]},
 'sit-think':{...SIT,shR:[-48,0,-12],elR:[-128,0,14],wrR:[20,0,0],head:[10,0,-6],spine:[14,0,0]},
 'sit-slump':{...SIT,spine:[24,0,0],neck:[14,0,0],head:[22,0,0],shL:[-6,0,4],shR:[-6,0,-4],elL:[-30,0,0],elR:[-30,0,0]},
 lie:{lie:1,y:0,shL:[0,0,4],shR:[0,0,-4],elL:[-6,0,0],elR:[-6,0,0],hipL:[-6,0,0],hipR:[-6,0,0],knL:[10,0,0],knR:[10,0,0],head:[-4,0,0]},
 sleep:{lie:1,y:0,shL:[-10,0,6],shR:[-10,0,-6],elL:[-40,0,0],elR:[-40,0,0],hipL:[-28,0,0],hipR:[-22,0,0],knL:[40,0,0],knR:[34,0,0],head:[6,10,0],spine:[6,0,0]},
 point:{...STAND,shR:[-82,0,-12],elR:[-4,0,0],wrR:[0,0,0],head:[0,-12,0],spine:[0,-8,0]},
 'point-up':{...STAND,shR:[-160,0,-10],elR:[-4,0,0],head:[-18,0,0]},
 think:{...STAND,shR:[-36,0,-12],elR:[-132,0,18],wrR:[16,0,0],shL:[-26,0,22],elL:[-96,0,-40],head:[10,0,-8]},
 wave:{...STAND,shR:[-10,0,-142],elR:[-28,0,0]},
 cheer:{...STAND,shL:[-12,0,152],shR:[-12,0,-152],elL:[-14,0,0],elR:[-14,0,0],head:[-14,0,0],y:0.02},
 'look-up':{...STAND,neck:[-12,0,0],head:[-26,0,0],spine:[-4,0,0]},
 'look-down':{...STAND,neck:[10,0,0],head:[22,0,0]},
 hold:{...STAND,shL:[-38,0,8],shR:[-38,0,-8],elL:[-56,0,-12],elR:[-56,0,12]},
 'hold-up':{...STAND,shL:[-120,0,10],shR:[-120,0,-10],elL:[-30,0,0],elR:[-30,0,0],head:[-14,0,0]},
 shrug:{...STAND,shL:[-10,0,30],shR:[-10,0,-30],elL:[-95,40,0],elR:[-95,-40,0],head:[0,0,8]},
 crouch:{y:-0.38,hipL:[-110,0,10],hipR:[-110,0,-10],knL:[130,0,0],knR:[130,0,0],ankL:[-20,0,0],ankR:[-20,0,0],spine:[30,0,0],shL:[-40,0,8],shR:[-40,0,-8],elL:[-40,0,0],elR:[-40,0,0],head:[-20,0,0]},
 kneel:{y:-0.42,hipL:[-90,0,4],knL:[90,0,0],hipR:[0,0,-4],knR:[90,0,0],ankR:[30,0,0],spine:[6,0,0],shL:[-30,0,8],shR:[-30,0,-8],elL:[-50,0,0],elR:[-50,0,0]},
 tired:{...STAND,spine:[18,0,0],neck:[12,0,0],head:[20,0,0],shL:[8,0,4],shR:[8,0,-4],elL:[-4,0,0],elR:[-4,0,0],knL:[8,0,0],knR:[8,0,0]},
 yawn:{...STAND,shL:[-20,0,150],shR:[-20,0,-150],elL:[-60,0,0],elR:[-60,0,0],head:[-30,0,0],spine:[-8,0,0]},
 facepalm:{...STAND,shR:[-40,0,-10],elR:[-140,0,20],head:[18,0,0],spine:[8,0,0]},
 run:STAND,walk:STAND,
 fall:{lie:1,y:0,shL:[-30,0,60],shR:[-30,0,-60],elL:[-20,0,0],elR:[-20,0,0],hipL:[-20,0,10],hipR:[10,0,-10],knL:[30,0,0],knR:[20,0,0]},
};

/** Explicit offsets only, so mocap poses can be corrected without adding the static stand pose. */
export function humanPoseOffsets(params:Record<string,unknown>):Record<string,Pose>{
 const poses:Record<string,Pose>=Object.create(null);
 const edits=params.poseAdjustments;
 if(!edits||typeof edits!=='object'||Array.isArray(edits))return poses;
 for(const [name,value] of Object.entries(edits)){
  if(!value||typeof value!=='object'||Array.isArray(value))continue;
  const input=value as Record<string,unknown>,p:Pose={};
  for(const joint of JOINTS){const a=input[joint];if(Array.isArray(a)&&a.length===3&&a.every(v=>typeof v==='number'&&Number.isFinite(v)))p[joint]=a.map(v=>clamp(v,-360,360)) as J;}
  if(typeof input.y==='number'&&Number.isFinite(input.y))p.y=clamp(input.y,-2,2);
  if(typeof input.lie==='number'&&Number.isFinite(input.lie))p.lie=clamp(input.lie,0,1);
  poses[name]=p;
 }
 return poses;
}

/** Per-model pose edits in degrees/metres, without changing the shared pose bank. */
export function humanPoses(params:Record<string,unknown>):Record<string,Pose>{
 const poses:Record<string,Pose>=Object.assign(Object.create(null),HUMAN_POSES);
 for(const [name,edit] of Object.entries(humanPoseOffsets(params)))poses[name]={...(poses[name]??STAND),...edit};
 return poses;
}

function cycle(phase:number,run:boolean):Pose{
 const s=Math.sin(phase),c=Math.cos(phase),a=run?1.5:1;
 const legL=-s*26*a,legR=s*26*a;
 const kneeL=Math.max(0,Math.sin(phase+Math.PI*0.5))*(run?70:38)+6,kneeR=Math.max(0,Math.sin(phase+Math.PI*1.5))*(run?70:38)+6;
 return {
  y:(run?0.03:0.018)*Math.abs(c)-(run?0.05:0.01),
  hips:[run?10:2,s*4,0],spine:[run?10:2,-s*7,0],head:[run?-6:0,s*3,0],
  hipL:[legL,0,3],hipR:[legR,0,-3],knL:[kneeL,0,0],knR:[kneeR,0,0],
  ankL:[Math.max(0,-legL)*0.3,0,0],ankR:[Math.max(0,-legR)*0.3,0,0],
  shL:[s*22*a,0,8],shR:[-s*22*a,0,-8],elL:[-(run?80:16)-Math.max(0,-s)*14,0,0],elR:[-(run?80:16)-Math.max(0,s)*14,0,0],
 };
}

function mix(a:Pose,b:Pose,k:number):Pose{
 const out:Pose={y:lerp(a.y??0,b.y??0,k),lie:lerp(a.lie??0,b.lie??0,k)};
 for(const j of JOINTS){const x=a[j]??[0,0,0],y=b[j]??[0,0,0];out[j]=[lerp(x[0],y[0],k),lerp(x[1],y[1],k),lerp(x[2],y[2],k)];}
 return out;
}

export function buildHuman(ctx:ModelCtx){
 const poses=humanPoses(ctx.params),walkDistance=ctx.num('walkDistance',1.15,0.2,4),walkPhase=ctx.num('walkPhase',0,-100,100);
 const walkClock=ctx.str('walkClock','distance',['distance','time'] as const),walkPeriod=ctx.num('walkPeriod',1.2,.2,4);
 const figure=ctx.str('figure','man',['man','woman','child','elder'] as const);
 const hair=ctx.str('hair',figure==='woman'?'long':'short',['short','long','bun','none','cap'] as const);
 const woman=figure==='woman',child=figure==='child',elder=figure==='elder';
 const shoulder=woman?0.175:0.2,hipW=woman?0.105:0.095;
 const headTone=ctx.num('headTone',1,.1,2),skin={tone:1},headSkin={tone:headTone},headDark={tone:.42*headTone},cloth={tone:0.82},pants={tone:0.55},dark={tone:0.42};
 const root=new THREE.Group();
 const g=(name:string,p:[number,number,number],parent:THREE.Object3D)=>{const o=new THREE.Group();o.name=name;o.position.set(...p);parent.add(o);return o;};
 const body=g('body',[0,0,0],root);
 const hips=g('hips',[0,0.96,0],body);
 hips.add(ctx.mesh(G.ellipsoid(woman?0.17:0.16,0.11,0.11),pants));
 const spine=g('spine',[0,0.06,0],hips);
 const torsoProfile:[number,number][]=woman
  ?[[0.0,-0.02],[0.15,0.0],[0.125,0.12],[0.15,0.26],[0.165,0.34],[0.16,0.42],[0.12,0.48],[0.055,0.52],[0,0.53]]
  :[[0.0,-0.02],[0.15,0.0],[0.14,0.12],[0.165,0.26],[0.185,0.38],[0.18,0.44],[0.13,0.49],[0.06,0.52],[0,0.53]];
 const torso=G.lathe(torsoProfile,36);torso.scale(1,1,0.6);spine.add(ctx.mesh(torso,cloth));
 const neck=g('neck',[0,0.5,0],spine);
 neck.add(ctx.mesh(at(G.cyl(0.048,0.055,0.12,18),[0,0.04,0]),headSkin));
 const head=g('head',[0,0.09,0],neck);
 const skull=G.ellipsoid(0.094,0.118,0.108,32,24);head.add(ctx.mesh(at(skull,[0,0.1,0.005]),headSkin));
 head.add(ctx.mesh(at(G.ellipsoid(0.06,0.05,0.06),[0,0.03,0.035]),headSkin)); // jaw
 head.add(ctx.mesh(at(G.cone(0.018,0.045,10),[0,0.085,0.113],[80,0,0]),headSkin)); // nose
 head.add(ctx.mesh(at(G.ellipsoid(0.018,0.03,0.012),[0.094,0.09,0]),headSkin));head.add(ctx.mesh(at(G.ellipsoid(0.018,0.03,0.012),[-0.094,0.09,0]),headSkin));
 if(hair!=='none'){
  const capG=new THREE.SphereGeometry(0.104,28,16,0,Math.PI*2,0,Math.PI*0.52);capG.scale(1,1.05,1.08);head.add(ctx.mesh(at(capG,[0,0.115,-0.008],[-14,0,0]),headDark));
  if(hair==='long')head.add(ctx.mesh(at(G.ellipsoid(0.11,0.16,0.07),[0,0.02,-0.065]),headDark));
  if(hair==='bun')head.add(ctx.mesh(at(G.sphere(0.05,16,12),[0,0.2,-0.08]),headDark));
  if(hair==='cap')head.add(ctx.mesh(at(G.cyl(0.08,0.08,0.012,24),[0,0.17,0.08],[10,0,0],[1,1,1.3]),headDark));
 }
 const arm=(side:1|-1)=>{
  const sh=g(side>0?'shL':'shR',[side*shoulder,0.43,0],spine);
  sh.add(ctx.mesh(G.sphere(0.058,16,12),cloth));
  sh.add(ctx.mesh(G.limb(0.052,0.043,0.29),cloth));
  const el=g(side>0?'elL':'elR',[0,-0.29,0],sh);
  el.add(ctx.mesh(G.limb(0.043,0.032,0.25),skin));
  const wr=g(side>0?'wrL':'wrR',[0,-0.25,0],el);
  wr.add(ctx.mesh(at(G.ellipsoid(0.036,0.07,0.02),[0,-0.06,0.004]),skin));
  wr.add(ctx.mesh(at(G.ellipsoid(0.012,0.035,0.012),[side*0.03,-0.04,0.022],[0,0,side*-30]),skin));
 };
 arm(1);arm(-1);
 const leg=(side:1|-1)=>{
  const hp=g(side>0?'hipL':'hipR',[side*hipW,-0.03,0],hips);
  hp.add(ctx.mesh(G.limb(0.078,0.056,0.44),pants));
  const kn=g(side>0?'knL':'knR',[0,-0.44,0],hp);
  kn.add(ctx.mesh(G.limb(0.055,0.04,0.43),pants));
  const an=g(side>0?'ankL':'ankR',[0,-0.43,0],kn);
  an.add(ctx.mesh(at(G.rbox(0.09,0.065,0.25,0.028),[0,-0.035,0.055]),dark));
 };
 leg(1);leg(-1);
 const joints=Object.fromEntries(JOINTS.map(j=>[j,root.getObjectByName(j)!])) as Record<Joint,THREE.Object3D>;
 if(child)root.scale.setScalar(0.62);
 if(child)head.scale.setScalar(1.25);
 const hipsBase=hips.position.y;
 const poseOf=(name:string,time:number,travel:number)=>{
  if(name==='walk'||name==='run'){const stride=name==='run'?1.6:walkDistance,cycles=name==='walk'&&walkClock==='time'?time/walkPeriod:travel/stride;return cycle((cycles+walkPhase)*Math.PI*2,name==='run');}
  if(name==='wave'){const p={...poses.wave!};p.elR=[-28-18*Math.sin(time*9),0,0];return p;}
  return poses[name]??STAND;
 };
 return {root,grounded:true,update(_c:Record<string,number>,t:number,pose:PoseState){
  const moving=pose.speed>0.05;
  const from=pose.from==='stand'&&moving?'walk':pose.from,to=pose.to==='stand'&&moving?'walk':pose.to;
  const p=mix(poseOf(from,t,pose.travel),poseOf(to,t,pose.travel),clamp(pose.k));
  // Subtle breathing so a held pose is never frozen.
  const breathe=Math.sin(t*2.2)*0.012;
  for(const j of JOINTS){const v=p[j]??[0,0,0];joints[j].rotation.set(deg(v[0]),deg(v[1]),deg(v[2]));}
  joints.spine.rotation.x+=breathe*(elder?1:0.6)+(elder?deg(14):0);joints.head.rotation.x+=breathe*0.5;
  hips.position.y=hipsBase+(p.y??0);
  const lie=p.lie??0;
  body.rotation.z=deg(90)*lie;
  body.position.set(lie*0.0,lie*0.14,0);
 }};
}

export const human=defineModel({
 id:'human',aliases:['person','man','woman','child','people','scientist','engineer','worker','student'],
 describe:'A realistic full-body person (mannequin-like, readable silhouette) that can walk, run, sit, type, sleep, point, think, wave and more; 1.75 m tall. Place on a chair/bed with near+side:"on".',
 params:{figure:'man | woman | child | elder',hair:'short | long | bun | none | cap',walkDistance:'metres per complete gait cycle (default 1.15)',walkClock:'distance (default) follows travel; time uses a fixed walkPeriod in seconds',walkPeriod:'seconds per complete gait cycle when walkClock=time (default 1.2)',walkPhase:'initial gait phase in cycles (default 0)',headTone:'head/neck albedo multiplier 0.1 .. 2 (default 1)',poseAdjustments:'per-pose joint rotations [x,y,z] in degrees and optional y offset in metres'},
 poses:Object.keys(HUMAN_POSES),
 size:'1.75 m',
 build:buildHuman,
});
