// living model pack: animals and food with recognizable silhouettes and small idle motions.
import * as THREE from 'three';
import {G,at,deg,lerp,clamp} from '../kit.ts';
import {defineModel,type ModelCtx,type ModelDef} from './types.ts';

type V3=[number,number,number];
const group=(parent?:THREE.Object3D,pos?:V3)=>{const g=new THREE.Group();if(pos)g.position.set(...pos);parent?.add(g);return g;};
const mesh=(ctx:ModelCtx,parent:THREE.Object3D,geo:THREE.BufferGeometry,pos:V3=[0,0,0],tone=0.8,rot:V3=[0,0,0])=>{const m=ctx.mesh(at(geo,pos,rot),{tone});parent.add(m);return m;};
const ell=(ctx:ModelCtx,parent:THREE.Object3D,pos:V3,scale:V3,tone=0.8,rot:V3=[0,0,0])=>{const m=mesh(ctx,parent,G.ellipsoid(1,1,1,20,12),pos,tone,rot);m.scale.set(...scale);return m;};
const dotEll=(ctx:ModelCtx,parent:THREE.Object3D,pos:V3,scale:V3,tone=0.8,rot:V3=[0,0,0])=>{const m=mesh(ctx,parent,G.ellipsoid(1,1,1,10,8),pos,tone,rot);m.scale.set(...scale);return m;};
const tube=(ctx:ModelCtx,parent:THREE.Object3D,points:V3[],r:number,tone=0.8,seg=32)=>mesh(ctx,parent,G.tube(points,r,seg,8),[0,0,0],tone);
const box=(ctx:ModelCtx,parent:THREE.Object3D,pos:V3,size:V3,tone=0.8,bevel=0.02,rot:V3=[0,0,0])=>mesh(ctx,parent,G.rbox(...size,bevel),pos,tone,rot);
const eyePair=(ctx:ModelCtx,parent:THREE.Object3D,pos:V3,spread:number,r:number=0.045,forward=0.12)=>{
 const eyes:THREE.Group[]=[];
 for(const s of [-1,1]){
  const x=pos[0]+s*spread;
  const z=pos[2]+r*1.55;
  const eye=group(parent,[x,pos[1],z]);eyes.push(eye);
  ell(ctx,eye,[0,0,0],[r*1.05,r*1.05,r*0.45],0.98);
  ell(ctx,eye,[s*r*0.12,0,forward*0.52],[r*0.62,r*0.68,r*0.25],0.18);
  ell(ctx,eye,[s*r*0.15,0,forward*0.78],[r*0.31,r*0.4,r*0.17],0.08);
  ell(ctx,eye,[-r*0.1,r*0.19,forward*0.91],[r*0.11,r*0.11,r*0.07],1);
 }
 return eyes;
};
const blinkEyes=(eyes:THREE.Group[],t:number)=>{const p=(t+0.27)%4.6,b=p<0.12?Math.sin(p/0.12*Math.PI):0;for(const e of eyes)e.scale.y=1-0.86*b;};
const addLeg=(ctx:ModelCtx,parent:THREE.Object3D,pos:V3,len:number,r:number,tone=0.72,foot=0.9)=>{
 const pivot=group(parent,pos);
 ell(ctx,pivot,[0,-len*0.53,0],[r*0.72,len*0.58,r*0.72],tone);
 ell(ctx,pivot,[0,-len,0.035],[r*1.28,r*0.32,r*1.45],foot);
 return pivot;
};
const limbTube=(ctx:ModelCtx,parent:THREE.Object3D,pts:V3[],r:number,tone=0.8)=>tube(ctx,parent,pts,r,tone,20);
const latheY=(ctx:ModelCtx,parent:THREE.Object3D,profile:[number,number][],pos:V3=[0,0,0],tone=0.8,seg=40)=>mesh(ctx,parent,G.lathe(profile,seg),pos,tone);

function makeBird(ctx:ModelCtx,type:'sparrow'|'eagle'|'owl'){
 const root=group(),body=group(root,[0,0.55,0]);
 const eyes:THREE.Group[]=[];
 const isEagle=type==='eagle',isOwl=type==='owl';
 const sx=isEagle?0.48:isOwl?0.31:0.23, sy=isEagle?0.38:isOwl?0.38:0.27, sz=isEagle?0.48:isOwl?0.34:0.34;
 ell(ctx,body,[0,0.05,0],[sx,sy,sz],0.82,[isEagle?-12:8,0,0]);
 ell(ctx,body,[0,0.39,0.14],[isEagle?0.24:isOwl?0.25:0.17,isEagle?0.23:isOwl?0.24:0.17,isEagle?0.24:0.21],0.9);
 if(isOwl){
  // Broad facial disc, raised brow tufts, and forward-facing oversized eyes.
  ell(ctx,body,[0,0.37,0.325],[0.205,0.17,0.035],0.99);
  for(const s of [-1,1]){
   const eye=group(body,[s*0.09,0.42,0.365]);eyes.push(eye);
   ell(ctx,eye,[0,0,0],[0.083,0.087,0.035],0.98);
   ell(ctx,eye,[0,0,0.029],[0.052,0.058,0.018],0.18);
   ell(ctx,eye,[0,0,0.046],[0.025,0.03,0.008],0.045);
   ell(ctx,eye,[-0.015,0.023,0.056],[0.009,0.01,0.006],1);
   mesh(ctx,body,G.cone(0.05,0.16,10),[s*0.17,0.57,0.11],0.82,[0,0,s*-20]);
  }
  mesh(ctx,body,G.cone(0.045,0.12,12),[0,0.29,0.40],0.36,[0,0,180]);
 }else{
  eyes.push(...eyePair(ctx,body,[0,0.42,0.34],0.09,isEagle?0.052:0.028,0.08));
  if(isEagle){
   // Hooked beak and heavy brow.
   ell(ctx,body,[0,0.32,0.40],[0.12,0.09,0.13],0.98);
   mesh(ctx,body,G.cone(0.115,0.26,16),[0,0.25,0.52],0.62,[90,0,0]);
   for(const s of [-1,1])ell(ctx,body,[s*0.12,0.48,0.34],[0.095,0.045,0.055],0.55,[0,0,s*-9]);
  }else{
   mesh(ctx,body,G.cone(0.065,0.18,12),[0,0.34,0.43],0.95,[90,0,0]);
   ell(ctx,body,[0,0.28,0.41],[0.055,0.045,0.07],0.9);
  }
 }
 const wings:THREE.Group[]=[];
 for(const s of [-1,1]){
  const wing=group(body,[s*sx*0.74,0.12,-0.02]);wings.push(wing);
  if(isOwl){
   ell(ctx,wing,[s*0.2,-0.02,-0.01],[0.27,0.085,0.25],0.63,[0,s*-12,s*12]);
   for(let i=0;i<5;i++)ell(ctx,wing,[s*(0.15+i*0.075),-0.07,-0.09-i*0.035],[0.115,0.025,0.035],0.88,[0,s*-20,0]);
  }else{
   ell(ctx,wing,[s*0.23,0,-0.02],[isEagle?0.39:0.22,0.07,isEagle?0.29:0.22],0.62,[0,s*-14,s*4]);
   const feathers=isEagle?7:4;
   for(let i=0;i<feathers;i++){
    const u=i/(feathers-1);
    ell(ctx,wing,[s*(0.36+u*0.31),-0.01,-0.21+u*0.29],[isEagle?0.19:0.14,0.035,isEagle?0.085:0.06],i%2?0.78:0.94,[0,s*-18,s*8]);
   }
   if(isEagle)for(let i=0;i<4;i++)ell(ctx,wing,[s*(0.62+i*0.045),0,-0.15+i*0.09],[0.11,0.025,0.045],0.48,[0,s*-28,0]);
  }
 }
 // Fan of tapered tail feathers, thin legs and separated toes.
 for(let i=-2;i<=2;i++)ell(ctx,body,[i*0.045,-0.08,-sz-0.18],[0.034,0.04,0.25],i%2?0.7:0.95,[i*8,0,0]);
 for(const s of [-1,1]){
  tube(ctx,body,[[s*0.1,-0.19,0],[s*0.1,-0.38,0.04]],0.018,0.44,10);
  for(let j=-1;j<=1;j++)tube(ctx,body,[[s*0.1,-0.36,0.04],[s*0.1+j*0.06,-0.39,0.16]],0.014,0.5,8);
 }
 return {root,grounded:true,update(c:Record<string,number>,t:number){
  const flap=clamp(c.flap??(isEagle?0.18:0.05));
  wings.forEach((w,i)=>{const s=i===0?-1:1;w.rotation.z=s*(isOwl?0.06:0.08)+s*flap*Math.sin(t*(isEagle?5.7:4.2))*0.62;});
  body.position.y=0.55+0.012*Math.sin(t*2.3);
  body.rotation.z=0.018*Math.sin(t*1.1);
  blinkEyes(eyes,t);
 }};
}

function birdModel(id:'sparrow'|'eagle'|'owl',name:string,aliases:string[],size:string):ModelDef{
 return defineModel({id,aliases,describe:`A ${name} with layered feathers, bright eyes, a shaped beak and feet; it breathes and its wings beat under flap control.`,controls:{flap:'0 still .. 1 strong wing beats (default 0.18)'},defaults:{flap:0.18},size,build(ctx){return makeBird(ctx,id);}});
}
export const sparrow=birdModel('sparrow','sparrow',['songbird','small-bird'], '0.16 m tall');
export const eagle=birdModel('eagle','bald eagle',['raptor','bird-of-prey'], '0.9 m tall');
export const owl=birdModel('owl','owl',['barn-owl','night-bird'], '0.42 m tall');

function makeFish(ctx:ModelCtx,type:'fish'|'shark'|'whale'|'dolphin'){
 const root=group();root.position.y=type==='fish'?0.03:0;
 root.rotation.y=deg(-38);
 const body=group(root);
 const shark=type==='shark',whale=type==='whale',dolphin=type==='dolphin';
 const L=whale?3.2:dolphin?1.0:shark?1.15:0.58;
 const thick=whale?0.66:dolphin?0.26:shark?0.34:0.31;
 // Torso tapers toward the tail; nose and jaw define the face.
 ell(ctx,body,[0,0,0],[thick,thick*0.86,L*0.48],whale?0.84:0.78,[0,0,0]);
 if(dolphin){
  ell(ctx,body,[0,-0.025,L*0.40],[thick*0.58,thick*0.38,L*0.26],0.9);
  ell(ctx,body,[0,-0.16,L*0.43],[thick*0.48,thick*0.16,L*0.22],0.53);
 }else if(shark){
  ell(ctx,body,[0,-0.15,L*0.33],[thick*0.88,thick*0.32,L*0.18],0.45);
  // Crescent mouth opening and individually visible teeth.
  mesh(ctx,body,G.torus(thick*0.51,0.018,8,32,Math.PI),[0,-0.07,L*0.46],0.12);
  for(let i=0;i<7;i++){
   const x=(i-3)*thick*0.13;
   mesh(ctx,body,G.cone(0.022,0.07,8),[x,-0.10,L*0.46],0.97,[180,0,0]);
  }
 }else if(!whale){
  ell(ctx,body,[0,-0.12,L*0.32],[thick*0.67,thick*0.28,L*0.18],0.54);
 }
 // Eyes and gill slits sit near the front sides.
 for(const s of [-1,1]){
  ell(ctx,body,[s*thick*0.78,0.06,L*0.34],[0.035,0.038,0.025],0.08);
  if(shark)for(let i=0;i<5;i++)tube(ctx,body,[[s*thick*(0.8+i*0.1),0.09,L*0.05],[s*thick*(0.8+i*0.1),-0.09,L*0.06]],0.009,0.38,8);
  if(whale){
   ell(ctx,body,[s*thick*0.88,thick*0.08,L*0.28],[0.045,0.05,0.028],0.12);
   // pectoral flippers
   const fin=group(body,[s*thick*0.62,-0.04,L*0.02]);
   ell(ctx,fin,[s*0.44,-0.09,0.04],[0.47,0.09,0.19],0.6,[0,s*18,s*13]);
  }else{
   const fin=group(body,[s*thick*0.62,-0.05,L*0.02]);
   mesh(ctx,fin,G.extrude([[0,0],[s*0.55,-0.12],[s*0.77,-0.29],[s*0.5,-0.25],[s*0.18,-0.14]],0.045,0.015),[0,0,0],0.88,[0,0,0]);
  }
 }
 const tail=group(body,[0,0,-L*0.42]);
 ell(ctx,tail,[0,0,-L*0.20],[thick*0.16,thick*0.22,L*0.28],0.8);
 // Distinct vertical shark/dolphin flukes; whale has broad horizontal flukes.
 for(const s of [-1,1]){
  const fin=group(tail,[s*(whale?0.25:0.07),0, -L*0.36]);
  const outline:V3= [s*(whale?0.36:0.16),whale?0.09:0.28,-0.04];
  ell(ctx,fin,[outline[0]/2,outline[1]/2,outline[2]],[Math.abs(outline[0])*0.75,whale?0.055:0.19,whale?0.19:0.055],0.92,[0,s*(whale?8:0),s*(whale?0:22)]);
 }
 if(shark){mesh(ctx,body,G.extrude([[0,0],[0.08,0.35],[0.31,0.62],[0.27,0.65],[0.1,0.47],[0,0.18]],0.08,0.025),[0,thick*0.82,-L*0.05],0.95,[0,0,0]);}
 if(dolphin||!whale&&!shark){
  mesh(ctx,body,G.extrude([[0,0],[0.07,0.2],[0.23,0.38],[0.18,0.4],[0.08,0.29],[0,0.08]],0.05,0.015),[0,thick*0.82,-L*0.03],0.92);
 }
 if(whale){
  // Two blowholes on top and pleated throat grooves.
  ell(ctx,body,[0,thick*0.82,L*0.32],[0.075,0.018,0.045],0.18);
  ell(ctx,body,[0,-thick*0.53,L*0.02],[thick*0.7,thick*0.15,L*0.34],0.98);
  for(let i=0;i<7;i++)tube(ctx,body,[[(-3+i)*0.06,-thick*0.36,L*0.25],[(-3+i)*0.06,-thick*0.39,L*0.55]],0.012,0.64,10);
 }
 return {root,grounded:false,update(c:Record<string,number>,t:number){
  const swim=clamp(c.swim??0.35),wag=Math.sin(t*3.4)*0.22*swim;
  tail.rotation.y=wag;tail.rotation.x=whale?Math.sin(t*2.4)*0.06*swim:0;
  body.position.y=Math.sin(t*1.7)*(whale?0.035:0.012)*(0.5+swim);
  body.rotation.y=Math.sin(t*1.1)*0.025;
 }};
}
function fishModel(id:'fish'|'shark'|'whale'|'dolphin',aliases:string[],description:string,size:string):ModelDef{
 return defineModel({id,aliases,describe:`${description} `+'A slow swimming tail beat continues at rest; `swim` controls its strength.',controls:{swim:'0 still .. 1 strong swim cycle (default 0.35)'},defaults:{swim:0.35},size,build(ctx){return makeFish(ctx,id);}});
}
export const fish=fishModel('fish',['goldfish','tropical-fish'],'A streamlined fish with a pointed nose, layered fins, visible gills and a fan tail.','0.45 m long');
export const shark=fishModel('shark',['great-white','predator-fish'],'A great white shark with a tapered body, tall dorsal fin, gill slits, tooth-lined jaw and crescent tail.','4 m long display');
export const whale=fishModel('whale',['blue-whale','cetacean'],'A blue whale with a massive streamlined body, throat pleats, paired flippers, blowhole and broad horizontal flukes.','18 m long display');
export const dolphin=fishModel('dolphin',['bottlenose','porpoise'],'A bottlenose dolphin with its beak, forehead melon, swept flippers and curved dorsal fin.','2.4 m long');

export const octopus=defineModel({
 id:'octopus',aliases:['cephalopod','octopod'],describe:'A floating octopus with a bulbous mantle, large forward eyes and eight curling, suckered arms; `wave` changes the rippling arm motion.',controls:{wave:'0 still .. 1 broad tentacle waves (default 0.6)'},defaults:{wave:0.6},size:'1 m across',
 build(ctx){
  const root=group(),head=group(root,[0,0.55,0]);
  ell(ctx,head,[0,0.34,-0.08],[0.36,0.43,0.34],0.86,[-12,0,0]);
  ell(ctx,head,[0,0.02,0.18],[0.25,0.19,0.2],0.68);
  const eyes=eyePair(ctx,head,[0,0.1,0.32],0.12,0.075,0.1);
  const arms:THREE.Group[]=[];
  for(let i=0;i<8;i++){
   const a=i/8*Math.PI*2, x=Math.cos(a), z=Math.sin(a);
   const arm=group(head,[x*0.13,-0.08,z*0.12]);arms.push(arm);
   const pts:V3[]=[];for(let j=0;j<=8;j++){const u=j/8;pts.push([x*(0.08+u*(0.42+(i%3)*0.06))+Math.sin(u*Math.PI*2+i)*0.045,-u*(0.38+0.1*Math.sin(i)),z*(0.1+u*0.42)+Math.cos(u*Math.PI*2+i)*0.055]);}
   tube(ctx,arm,pts,0.045,0.78,32);
   // Two rows of raised suckers along the visible underside.
   for(let j=1;j<=6;j++)for(const side of [-1,1]){
    const u=j/8;dotEll(ctx,arm,[x*u*0.43+side*0.02,-u*0.36-0.025,z*u*0.4],[0.024,0.018,0.024],0.98);
   }
  }
  return {root,grounded:false,update(c,t){const w=clamp(c.wave??0.6);arms.forEach((a,i)=>{const ph=t*2.1+i*Math.PI/4;a.rotation.x=0.18*w*Math.sin(ph);a.rotation.z=0.34*w*Math.cos(ph);});head.position.y=0.55+0.025*Math.sin(t*1.5);blinkEyes(eyes,t);}};
 }
});

export const jellyfish=defineModel({
 id:'jellyfish',aliases:['jelly','medusa'],describe:'A translucent bell-shaped jellyfish with a rippled rim and a curtain of four frilled oral arms and fine trailing tentacles; `pulse` controls its bell contraction.',controls:{pulse:'0 still .. 1 steady pulsing (default 0.5)'},defaults:{pulse:0.5},size:'0.5 m across',
 build(ctx){
  const root=group(),bell=group(root,[0,0.4,0]);
  latheY(ctx,bell,[[0,0],[0.27,0],[0.39,0.08],[0.42,0.22],[0.37,0.43],[0.25,0.58],[0.08,0.64],[0,0.64]],[0,0,0],0.78,48);
  const rim:THREE.Group[]=[];
  for(let i=0;i<12;i++){const a=i/12*Math.PI*2;ell(ctx,bell,[Math.cos(a)*0.4,0.05,Math.sin(a)*0.4],[0.07,0.055,0.07],i%2?0.68:0.94);}
  for(let i=0;i<8;i++){
   const a=i/8*Math.PI*2,x=Math.cos(a),z=Math.sin(a);const tent=group(root,[x*0.08,0.42,z*0.08]);rim.push(tent);
   const len=0.52+(i%3)*0.15;
   tube(ctx,tent,[[0,0,0],[x*0.06,-len*0.35,z*0.06],[x*0.12,-len*0.72,z*0.11],[x*0.06,-len,z*0.08]],0.018,0.66,28);
   if(i<4)for(let j=0;j<4;j++)tube(ctx,tent,[[x*0.02,-0.08-j*0.045,z*0.02],[x*(0.1+j*0.018),-0.18-j*0.045,z*(0.1+j*0.018)]],0.012,0.92,8);
  }
  return {root,grounded:false,update(c,t){const p=clamp(c.pulse??0.5),q=1+0.12*p*Math.sin(t*3.2);bell.scale.set(q,1-0.14*p*Math.sin(t*3.2),q);rim.forEach((a,i)=>{a.rotation.x=0.12*Math.sin(t*1.8+i);a.rotation.z=0.12*Math.cos(t*1.8+i);});root.position.y=0.025*Math.sin(t*1.2);}};
 }
});

type QuadKind='horse'|'cow'|'pig'|'sheep'|'lion'|'bear';
function makeQuad(ctx:ModelCtx,type:QuadKind){
 const root=group(),body=group(root);
 const eyes:THREE.Group[]=[];
 root.rotation.y=deg(-34);
 const horse=type==='horse',cow=type==='cow',pig=type==='pig',sheep=type==='sheep',lion=type==='lion',bear=type==='bear';
 const h=horse?1.72:cow?1.42:pig?0.88:sheep?1.02:lion?1.18:1.28;
 const bw=horse?0.34:cow?0.38:pig?0.34:sheep?0.35:lion?0.34:0.41;
 const bl=horse?0.7:cow?0.64:pig?0.48:sheep?0.56:0.58;
 const by=h*(horse?0.56:pig?0.5:0.55),bh=h*(horse?0.19:pig?0.29:0.26);
 ell(ctx,body,[0,by,0],[bw,bh,bl],cow?0.86:sheep?0.78:0.8,[0,0,0]);
 // Large shoulder and haunch masses make the animal read as one body, not a set of rods.
 ell(ctx,body,[0,by+0.015,bl*0.57],[bw*0.9,bh*1.05,bl*0.43],0.85);
 ell(ctx,body,[0,by, -bl*0.55],[bw*1.05,bh*1.08,bl*0.48],0.74);
 const headZ=horse?0.56:cow?0.5:pig?0.37:sheep?0.48:lion?0.48:0.48;
 const headY=horse?1.37:cow?1.02:pig?0.68:sheep?0.85:lion?0.98:1.08;
 if(horse){
  ell(ctx,body,[0,1.13,0.37],[0.23,0.36,0.28],0.75,[26,0,0]);
  ell(ctx,body,[0,1.39,headZ],[0.19,0.23,0.29],0.86,[12,0,0]);
 }else if(lion){
  ell(ctx,body,[0,headY,headZ-0.05],[0.36,0.37,0.32],0.52);
  for(let i=0;i<14;i++){const a=i/14*Math.PI*2;ell(ctx,body,[Math.cos(a)*0.31,headY+Math.sin(a)*0.31,headZ-0.02],[0.13,0.17,0.13],i%3?0.69:0.9,[0,0,a*180/Math.PI]);}
  ell(ctx,body,[0,headY,headZ+0.18],[0.22,0.25,0.23],0.91);
 }else{
  ell(ctx,body,[0,headY,headZ],[cow?0.27:pig?0.25:0.23,cow?0.27:pig?0.23:0.24,cow?0.25:pig?0.27:0.23],cow?0.9:0.82,[0,0,0]);
 }
 if(horse){
  ell(ctx,body,[0,1.23,0.65],[0.15,0.17,0.25],0.66,[12,0,0]);
  ell(ctx,body,[0,1.13,0.83],[0.12,0.1,0.16],0.75);
  eyes.push(...eyePair(ctx,body,[0,1.45,0.81],0.14,0.035,0.04));
  for(const s of [-1,1]){
   mesh(ctx,body,G.cone(0.075,0.28,14),[s*0.12,1.64,0.52],0.8,[0,0,s*10]);
   ell(ctx,body,[s*0.12,1.43,0.7],[0.03,0.045,0.06],0.2);
  }
  for(let i=0;i<9;i++)ell(ctx,body,[0,1.56-i*0.065,0.37-i*0.045],[0.16,0.08,0.07],i%2?0.55:0.94,[0,0,0]);
  // Mane continues down the crest and tail has a coarse hair tassel.
 }else if(cow){
  ell(ctx,body,[0,headY-0.1,headZ+0.18],[0.21,0.13,0.14],0.64);
  eyes.push(...eyePair(ctx,body,[0,headY+0.08,headZ+0.19],0.14,0.034,0.05));
  ell(ctx,body,[0,headY-0.13,headZ+0.25],[0.19,0.1,0.13],0.98);
  for(const s of [-1,1]){
   mesh(ctx,body,G.cone(0.045,0.25,12),[s*0.16,headY+0.28,headZ-0.03],0.98,[0,0,s*17]);
   ell(ctx,body,[s*0.3,headY+0.09,headZ-0.02],[0.16,0.07,0.08],0.8,[0,0,s*12]);
   ell(ctx,body,[s*0.14,headY-0.12,headZ+0.36],[0.022,0.018,0.012],0.08);
  }
  // Distinct irregular dark hide patches on flank and rump.
  for(const [x,y,z,sx,sy,sz] of [[-0.34,by+0.1,-0.18,0.07,0.16,0.24],[0.31,by-0.04,-0.36,0.055,0.12,0.17],[0.32,by+0.1,0.03,0.05,0.13,0.14]] as number[][])ell(ctx,body,[x,y,z],[sx,sy,sz],0.23,[0,0,15]);
  ell(ctx,body,[0,by-bh*0.68,0.12],[0.18,0.12,0.16],0.88);
  for(const s of [-1,1])ell(ctx,body,[s*0.1,by-bh*0.9,0.14],[0.035,0.085,0.035],0.66);
 }else if(pig){
  eyes.push(...eyePair(ctx,body,[0,headY+0.045,headZ+0.24],0.12,0.028,0.035));
  ell(ctx,body,[0,headY-0.07,headZ+0.25],[0.18,0.12,0.095],0.97);
  for(const s of [-1,1]){
   ell(ctx,body,[s*0.07,headY-0.065,headZ+0.331],[0.033,0.05,0.012],0.1,[0,0,s*10]);
   mesh(ctx,body,G.cone(0.1,0.2,12),[s*0.15,headY+0.19,headZ-0.03],0.8,[0,0,s*25]);
  }
  ell(ctx,body,[0,headY-0.16,headZ+0.2],[0.14,0.022,0.08],0.22);
 }else if(sheep){
  ell(ctx,body,[0,headY,headZ],[0.19,0.21,0.2],0.68);
  ell(ctx,body,[0,headY-0.09,headZ+0.12],[0.13,0.12,0.12],0.52);
  eyes.push(...eyePair(ctx,body,[0,headY+0.07,headZ+0.16],0.105,0.032,0.04));
  for(const s of [-1,1])ell(ctx,body,[s*0.24,headY+0.03,headZ-0.02],[0.13,0.055,0.07],0.91,[0,0,s*15]);
  // Rounded wool locks cover the back and flanks while keeping the legs and face clear.
  for(let row=0;row<3;row++)for(let i=0;i<7;i++){
   const z=-0.42+i*0.14,x=(row-1)*0.19;
   if(Math.abs(z-headZ)<0.2&&Math.abs(x)<0.1)continue;
   ell(ctx,body,[x,by+bh*(row===1?0.55:0.15),z],[0.13,0.14,0.13],(i+row)%3?0.96:0.68);
  }
 }else if(lion){
  eyes.push(...eyePair(ctx,body,[0,headY+0.04,headZ+0.4],0.14,0.038,0.04));
  ell(ctx,body,[0,headY-0.12,headZ+0.38],[0.15,0.1,0.16],0.92);
  ell(ctx,body,[0,headY-0.04,headZ+0.5],[0.055,0.035,0.035],0.14);
  for(const s of [-1,1])ell(ctx,body,[s*0.19,headY+0.26,headZ+0.12],[0.095,0.1,0.07],0.58);
 }else{
  // Bear's compact ears, shoulder hump and broad muzzle.
  ell(ctx,body,[0,by+bh*0.72,-0.22],[bw*0.94,bh*0.8,0.33],0.71);
  eyes.push(...eyePair(ctx,body,[0,headY+0.04,headZ+0.25],0.115,0.032,0.04));
  ell(ctx,body,[0,headY-0.09,headZ+0.26],[0.18,0.13,0.15],0.93);
  ell(ctx,body,[0,headY-0.01,headZ+0.37],[0.06,0.045,0.035],0.12);
  for(const s of [-1,1]){ell(ctx,body,[s*0.19,headY+0.21,headZ-0.03],[0.1,0.11,0.07],0.68);ell(ctx,body,[s*0.19,headY+0.21,headZ+0.025],[0.055,0.065,0.02],0.37);}
 }
 // Four solid legs with shaped haunches, ankles and broad feet.
 const legs:THREE.Group[]=[];
 for(const s of [-1,1])for(const zSign of [-1,1]){
  const front=zSign>0;
  const lg=addLeg(ctx,body,[s*bw*0.66,by-bh*0.42,front?bl*0.67:-bl*0.66],horse?0.74: h*0.34,horse?0.115:0.105,front?0.76:0.67,horse?0.78:0.88);legs.push(lg);
  if(horse){ell(ctx,lg,[0,-0.70,0.035],[0.115,0.09,0.14],0.94);}
  if(bear||lion)for(let k=-1;k<=1;k++)mesh(ctx,lg,G.cone(0.018,0.065,8),[k*0.045,-h*0.35,0.105],0.94,[90,0,0]);
 }
 const tail=group(body,[0,by+bh*0.35,-bl*0.92]);
 if(horse){tube(ctx,tail,[[0,0,0],[0,-0.06,-0.22],[0,-0.22,-0.46],[0,-0.36,-0.62]],0.06,0.72,18);for(let i=0;i<7;i++)ell(ctx,tail,[(i-3)*0.025,-0.36,-0.63],[0.035,0.13,0.07],i%2?0.56:0.92,[10,0,(i-3)*5]);}
 else if(pig){tube(ctx,tail,[[0,0,0],[0.02,0.05,-0.13],[0.07,0.12,-0.18],[0.1,0.1,-0.11],[0.08,0.04,-0.1]],0.025,0.8,20);}
 else if(cow)tube(ctx,tail,[[0,0,0],[0,-0.2,-0.18],[0,-0.46,-0.25]],0.028,0.75,16);
 else if(lion){tube(ctx,tail,[[0,0,0],[0,-0.12,-0.22],[0,-0.24,-0.45]],0.026,0.73,16);ell(ctx,tail,[0,-0.29,-0.51],[0.09,0.11,0.14],0.25);}
 else tube(ctx,tail,[[0,0,0],[0,-0.11,-0.2],[0,-0.23,-0.33]],0.025,0.72,16);
 return {root,grounded:true,update(c:Record<string,number>,t:number){
  const walk=clamp(c.walk??0),cycle=t*6.2;
  legs.forEach((leg,i)=>{const phase=cycle+(i===0||i===3?0:Math.PI);leg.rotation.x=walk*0.38*Math.sin(phase);});
  body.scale.y=1+0.009*Math.sin(t*2.4);
  tail.rotation.x=0.1*Math.sin(t*1.9);tail.rotation.z=(pig?0.2:0.1)*Math.sin(t*(pig?4:1.7));
  blinkEyes(eyes,t);
 }};
}
function quadModel(id:QuadKind,aliases:string[],description:string,size:string):ModelDef{
 return defineModel({id,aliases,describe:`${description} `+'Its chest rises with a breath and its tail moves at rest; `walk` adds a slow four-beat gait.',controls:{walk:'0 idle .. 1 walking cycle (default 0)'},defaults:{walk:0},size,build(ctx){return makeQuad(ctx,id);}});
}
export const horse=quadModel('horse',['stallion','equine'],'A horse with a long arched neck, sculpted muzzle, pointed ears, flowing mane, hooves and a hair-tipped tail.','1.7 m at shoulder');
export const cow=quadModel('cow',['cattle','bovine'],'A dairy cow with a spotted barrel body, short horns, broad muzzle, udder and four cloven legs.','1.4 m tall');
export const pig=quadModel('pig',['swine','hog'],'A pink pig with a barrel body, pointed ears, round snout with nostrils, short legs and a curled tail.','0.8 m long');
export const sheep=quadModel('sheep',['lamb','woolly-sheep'],'A sheep with clustered fleece, a bare face, drooping ears and sturdy short legs.','0.9 m tall');
export const lion=quadModel('lion',['big-cat','king-of-beasts'],'A male lion with a layered circular mane, golden face, rounded ears, muscular shoulders and tufted tail.','1.2 m tall');
export const bear=quadModel('bear',['grizzly','brown-bear'],'A brown bear with a heavy shoulder hump, rounded ears, long muzzle, broad paws and claws.','1.3 m tall');

export const elephant=defineModel({
 id:'elephant',aliases:['african-elephant','pachyderm'],describe:'An African elephant with fan-shaped ears, pillar legs, broad feet, curved tusks and a trunk that curls at the tip; `walk` drives a slow weighty step.',controls:{walk:'0 idle .. 1 walking cycle (default 0)'},defaults:{walk:0},size:'3 m at shoulder',
 build(ctx){
  const root=group(),body=group(root);root.rotation.y=deg(-28);
  ell(ctx,body,[0,1.36,-0.06],[0.74,0.74,0.95],0.68);
  ell(ctx,body,[0,1.57,0.54],[0.55,0.58,0.5],0.77);
  // Huge thin ears are sculpted as softly lobed ellipsoids on each side of head.
  for(const s of [-1,1]){
   ell(ctx,body,[s*0.62,1.65,0.42],[0.46,0.56,0.13],0.94,[0,0,s*16]);
   ell(ctx,body,[s*0.68,1.64,0.53],[0.33,0.42,0.045],0.62,[0,0,s*16]);
   mesh(ctx,body,G.cone(0.105,0.67,18),[s*0.43,1.32,0.86],0.98,[0,0,s*-68]);
   ell(ctx,body,[s*0.35,1.79,0.86],[0.035,0.04,0.035],0.12);
  }
  // Curved trunk hangs from the face and curls back into a visible grasping tip.
  const trunk=group(body,[0,1.44,0.91]);
  tube(ctx,trunk,[[0,0,0],[0,-0.18,0.1],[0,-0.45,0.17],[0,-0.72,0.13],[0,-0.85,-0.01],[0,-0.79,-0.12]],0.16,0.72,36);
  ell(ctx,trunk,[0,-0.78,-0.12],[0.16,0.12,0.14],0.75);
  for(const s of [-1,1])ell(ctx,trunk,[s*0.055,-0.79,-0.235],[0.018,0.022,0.012],0.18);
  const eyes=eyePair(ctx,body,[0,1.77,1.04],0.28,0.045,0.04);
  const legs:THREE.Group[]=[];
  for(const s of [-1,1])for(const z of [-1,1]){
   const p=group(body,[s*0.48,0.84,z>0?0.52:-0.68]);legs.push(p);
   ell(ctx,p,[0,-0.42,0],[0.22,0.48,0.24],0.64);
   ell(ctx,p,[0,-0.77,0.035],[0.28,0.11,0.29],0.9);
   for(let k=-1;k<=1;k++)ell(ctx,p,[k*0.12,-0.8,0.21],[0.065,0.04,0.035],0.96);
  }
  const tail=group(body,[0,1.3,-0.95]);tube(ctx,tail,[[0,0,0],[0,-0.18,-0.18],[0,-0.38,-0.27]],0.045,0.54,16);
  for(let i=0;i<5;i++)ell(ctx,tail,[(i-2)*0.026,-0.42,-0.28],[0.03,0.1,0.035],0.17,[0,0,(i-2)*12]);
  return {root,grounded:true,update(c,t){const w=clamp(c.walk??0);legs.forEach((l,i)=>l.rotation.x=w*0.24*Math.sin(t*4+(i===0||i===3?0:Math.PI)));trunk.rotation.x=0.045*Math.sin(t*1.2);trunk.rotation.z=0.08*Math.sin(t*1.7);body.scale.y=1+0.008*Math.sin(t*1.8);blinkEyes(eyes,t);}};
 }
});

export const monkey=defineModel({
 id:'monkey',aliases:['ape','primate','macaque'],describe:'A seated macaque with a rounded head, expressive ears, pale muzzle, long hanging arms, curled feet and a looping tail; `swing` adds a loose arm and tail sway.',controls:{swing:'0 resting .. 1 playful sway (default 0.2)'},defaults:{swing:0.2},size:'0.8 m seated',
 build(ctx){
  const root=group(),torso=group(root,[0,0.78,0]);root.rotation.y=deg(-30);
  ell(ctx,torso,[0,0,0],[0.25,0.34,0.2],0.7,[10,0,0]);
  ell(ctx,torso,[0,0.3,0.12],[0.25,0.25,0.23],0.76);
  const head=group(torso,[0,0.57,0.14]);
  ell(ctx,head,[0,0,0],[0.25,0.27,0.22],0.76);
  ell(ctx,head,[0,-0.1,0.2],[0.16,0.12,0.09],0.96);
  const eyes=eyePair(ctx,head,[0,0.045,0.2],0.105,0.046,0.04);
  ell(ctx,head,[0,-0.12,0.28],[0.032,0.025,0.02],0.17);
  for(const s of [-1,1]){
   ell(ctx,head,[s*0.27,0.05,-0.02],[0.115,0.13,0.07],0.92);
   ell(ctx,head,[s*0.28,0.05,0.04],[0.06,0.075,0.025],0.59);
  }
  const arms:THREE.Group[]=[],legs:THREE.Group[]=[];
  for(const s of [-1,1]){
   const arm=group(torso,[s*0.23,0.25,0.03]);arms.push(arm);
   ell(ctx,arm,[s*0.015,-0.27,0],[0.09,0.31,0.09],0.72,[0,0,s*5]);
   ell(ctx,arm,[s*0.04,-0.57,0.09],[0.075,0.19,0.075],0.67,[10,0,s*8]);
   ell(ctx,arm,[s*0.05,-0.72,0.15],[0.09,0.075,0.11],0.94);
   for(let j=0;j<4;j++)tube(ctx,arm,[[s*0.05,-0.72,0.18],[s*(0.01+j*0.025),-0.81,0.24]],0.018,0.82,8);
   const leg=group(torso,[s*0.16,-0.22,0]);legs.push(leg);
   ell(ctx,leg,[s*0.08,-0.26,0.02],[0.13,0.27,0.14],0.65,[0,0,s*20]);
   ell(ctx,leg,[s*0.18,-0.47,0.2],[0.13,0.08,0.22],0.89,[0,0,s*12]);
   for(let j=0;j<4;j++)tube(ctx,leg,[[s*0.18,-0.47,0.28],[s*(0.1+j*0.05),-0.5,0.38]],0.018,0.78,8);
  }
  const tail=group(torso,[0,-0.04,-0.18]);tube(ctx,tail,[[0,0,0],[0,-0.04,-0.32],[0,-0.18,-0.55],[0,-0.13,-0.78],[0,0.04,-0.92],[0,0.16,-0.9]],0.035,0.6,40);
  return {root,grounded:true,update(c,t){const a=clamp(c.swing??0.2);arms.forEach((x,i)=>{const s=i===0?-1:1;x.rotation.x=0.08*Math.sin(t*1.2+i)+a*0.28*Math.sin(t*2.3+i);x.rotation.z=s*(0.06+a*0.1*Math.sin(t*1.7+i));});tail.rotation.x=0.16*Math.sin(t*1.3)*a;tail.rotation.z=0.18*Math.sin(t*1.8)*a;head.rotation.y=0.035*Math.sin(t*0.6);blinkEyes(eyes,t);}};
 }
});

export const rabbit=defineModel({
 id:'rabbit',aliases:['bunny','hare','jackrabbit'],describe:'A sitting rabbit with enormous upright ears, a soft chest, powerful folded hind legs, oversized forefeet, whiskers and a cotton tail; `hop` adds a gentle crouch-and-rise.',controls:{hop:'0 resting .. 1 repeated hops (default 0.15)'},defaults:{hop:0.15},size:'0.42 m tall',
 build(ctx){
  const root=group(),body=group(root,[0,0.34,0]);root.rotation.y=deg(-30);
  ell(ctx,body,[0,0.06,-0.06],[0.24,0.25,0.36],0.83);
  ell(ctx,body,[0,0.16,0.19],[0.17,0.19,0.2],0.92);
  const head=group(body,[0,0.4,0.26]);ell(ctx,head,[0,0.04,0.05],[0.21,0.2,0.22],0.88);
  ell(ctx,head,[0,-0.06,0.23],[0.12,0.09,0.12],0.98);
  ell(ctx,head,[0,-0.03,0.33],[0.035,0.028,0.023],0.4);
  const eyes=eyePair(ctx,head,[0,0.07,0.21],0.125,0.037,0.05);
  for(const s of [-1,1]){
   for(let j=0;j<3;j++)tube(ctx,head,[[s*0.09,-0.08,0.29],[s*(0.18+j*0.025),-0.05+j*0.04,0.34]],0.009,0.68,8);
   const ear=group(head,[s*0.11,0.19,0]);ell(ctx,ear,[0,0.24,-0.015],[0.09,0.31,0.055],0.88,[0,0,s*10]);ell(ctx,ear,[0,0.24,0.038],[0.045,0.23,0.019],0.58,[0,0,s*10]);
  }
  const legs=[] as THREE.Group[];
  for(const s of [-1,1]){
   const hind=group(body,[s*0.18,-0.06,-0.22]);legs.push(hind);ell(ctx,hind,[0,-0.04,0],[0.17,0.17,0.23],0.7);ell(ctx,hind,[0,-0.22,0.11],[0.105,0.08,0.25],0.97);
   const fore=addLeg(ctx,body,[s*0.12,-0.02,0.2],0.31,0.065,0.72,0.96);legs.push(fore);
  }
  ell(ctx,body,[0,0.08,-0.39],[0.12,0.12,0.12],1);
  return {root,grounded:true,update(c,t){const h=clamp(c.hop??0.15),pulse=Math.max(0,Math.sin(t*3.7))*h;body.position.y=0.34+0.22*pulse;body.rotation.x=-0.08*pulse;legs.forEach((l,i)=>l.rotation.x=(i%2===0?0.18:-0.12)*pulse);blinkEyes(eyes,t);}};
 }
});

export const mouse=defineModel({
 id:'mouse',aliases:['field-mouse','rodent'],describe:'A tiny mouse with a pointed muzzle, rounded pinkless ears, bright eyes, whiskers, four tiny feet and a long hairless tail; `scurry` adds quick footfalls.',controls:{scurry:'0 still .. 1 fast tiny steps (default 0.12)'},defaults:{scurry:0.12},size:'0.1 m long',
 build(ctx){
  const root=group(),body=group(root,[0,0.18,0]);root.rotation.y=deg(-34);
  ell(ctx,body,[0,0,0],[0.11,0.11,0.22],0.75,[0,0,0]);
  ell(ctx,body,[0,0.035,0.18],[0.09,0.09,0.15],0.87);
  ell(ctx,body,[0,-0.005,0.31],[0.055,0.045,0.09],0.96);
  ell(ctx,body,[0,0.0,0.39],[0.018,0.016,0.02],0.2);
  const eyes=eyePair(ctx,body,[0,0.075,0.31],0.063,0.022,0.03);
  for(const s of [-1,1]){
   ell(ctx,body,[s*0.105,0.12,0.15],[0.09,0.105,0.035],0.94);
   ell(ctx,body,[s*0.107,0.12,0.185],[0.055,0.068,0.016],0.58);
   for(let i=0;i<3;i++)tube(ctx,body,[[s*0.055,0.0,0.31],[s*(0.2+i*0.03),0.02+i*0.025,0.35]],0.006,0.82,8);
   ell(ctx,body,[s*0.06,-0.09,0.12],[0.045,0.04,0.09],0.95);
   ell(ctx,body,[s*0.06,-0.09,-0.12],[0.045,0.04,0.09],0.9);
  }
  const tail=group(body,[0,0,-0.17]);tube(ctx,tail,[[0,0,0],[0,-0.04,-0.18],[0.04,-0.06,-0.4],[0.12,-0.03,-0.61],[0.22,0.04,-0.78]],0.012,0.66,32);
  return {root,grounded:true,update(c,t){const s=clamp(c.scurry??0.12);body.position.y=0.18+0.008*Math.sin(t*2)+s*0.012*Math.abs(Math.sin(t*12));tail.rotation.z=0.1*Math.sin(t*2.4);blinkEyes(eyes,t);}};
 }
});

export const snake=defineModel({
 id:'snake',aliases:['serpent','viper','python'],describe:'A coiled snake with a raised triangular head, patterned back, forked tongue and visible jaw; `slither` sways the neck and flicks the tongue.',controls:{slither:'0 resting .. 1 active tongue and neck (default 0.25)'},defaults:{slither:0.25},size:'0.8 m coiled',
 build(ctx){
  const root=group(),coil=group(root),R=0.31;
  const pts:V3[]=[];for(let i=0;i<=96;i++){const a=i/96*Math.PI*2*1.75;const r=R*(1-0.28*i/96);pts.push([Math.cos(a)*r,0.32+Math.sin(a)*r,0.015*Math.cos(a*2)]);}
  tube(ctx,coil,pts,0.09,0.69,120);
  // A row of raised dorsal marks follows the visible upper surface of the coil.
  for(let i=4;i<87;i+=5){const a=i/96*Math.PI*2*1.75,r=R*(1-0.28*i/96);ell(ctx,coil,[Math.cos(a)*r,0.32+Math.sin(a)*r+0.07,0.075],[0.035,0.055,0.018],i%2?0.96:0.43,[0,0,-a*180/Math.PI]);}
  const neck=group(root,[0,0.16,0.23]);tube(ctx,neck,[[0,0,0],[0,0.14,0.05],[0,0.32,0.08],[0,0.48,0.11]],0.09,0.74,28);
  const head=group(neck,[0,0.48,0.11]);
  ell(ctx,head,[0,0,0.08],[0.17,0.11,0.23],0.82);
  ell(ctx,head,[0,-0.09,0.13],[0.15,0.055,0.2],0.57);
  const eyes=eyePair(ctx,head,[0,0.08,0.18],0.105,0.033,0.04);
  for(const s of [-1,1])ell(ctx,head,[s*0.055,0.035,0.28],[0.014,0.01,0.014],0.12);
  const tongue=group(head,[0,-0.07,0.29]);
  tube(ctx,tongue,[[0,0,0],[0,-0.03,0.13],[0,-0.02,0.25]],0.012,0.26,12);
  for(const s of [-1,1])tube(ctx,tongue,[[0,-0.02,0.2],[s*0.035,-0.01,0.28],[s*0.06,0.02,0.33]],0.008,0.24,8);
  tongue.visible=false;
  return {root,grounded:true,update(c,t){const s=clamp(c.slither??0.25);neck.rotation.z=0.08*Math.sin(t*1.7)+s*0.16*Math.sin(t*3.2);neck.rotation.x=0.08*Math.sin(t*1.1);coil.rotation.y=0.025*Math.sin(t*1.3);tongue.visible=s>0.12&&Math.sin(t*3.8)>0.3;blinkEyes(eyes,t);}};
 }
});

export const frog=defineModel({
 id:'frog',aliases:['tree-frog','amphibian'],describe:'A squat frog with bulging eyes set high above its mouth, a broad back, folded haunches and splayed webbed toes; `leap` drives a slow crouch and spring.',controls:{leap:'0 resting .. 1 repeated crouch-and-leap (default 0.15)'},defaults:{leap:0.15},size:'0.18 m long',
 build(ctx){
  const root=group(),body=group(root,[0,0.22,0]);
  ell(ctx,body,[0,0,0],[0.22,0.17,0.3],0.76);
  ell(ctx,body,[0,0.05,0.22],[0.18,0.13,0.17],0.9);
  ell(ctx,body,[0,-0.055,0.32],[0.14,0.035,0.09],0.56);
  const eyes:THREE.Group[]=[];
  for(const s of [-1,1]){
   const e=group(body,[s*0.13,0.18,0.23]);eyes.push(e);
   ell(ctx,e,[0,0,0],[0.105,0.12,0.1],0.96);
   ell(ctx,e,[0,0.005,0.09],[0.057,0.065,0.034],0.2);
   ell(ctx,e,[0,0.005,0.119],[0.027,0.039,0.018],0.07);
   ell(ctx,e,[-0.015,0.03,0.134],[0.01,0.012,0.006],1);
  }
  const legs:THREE.Group[]=[];
  for(const s of [-1,1]){
   const hind=group(body,[s*0.16,-0.02,-0.12]);legs.push(hind);
   ell(ctx,hind,[s*0.08,-0.03,-0.08],[0.15,0.12,0.22],0.61,[0,0,s*28]);
   ell(ctx,hind,[s*0.16,-0.14,0.05],[0.11,0.05,0.22],0.69,[0,0,s*18]);
   ell(ctx,hind,[s*0.19,-0.17,0.22],[0.14,0.035,0.12],0.96);
   for(let j=0;j<3;j++)tube(ctx,hind,[[s*0.19,-0.17,0.24],[s*(0.13+j*0.06),-0.2,0.37]],0.013,0.92,8);
   const front=group(body,[s*0.14,-0.04,0.18]);legs.push(front);
   ell(ctx,front,[s*0.04,-0.09,0.05],[0.055,0.14,0.065],0.68,[8,0,s*15]);
   ell(ctx,front,[s*0.045,-0.18,0.12],[0.1,0.035,0.09],0.9);
   for(let j=0;j<3;j++)ell(ctx,front,[s*(0.005+j*0.04),-0.19,0.19],[0.023,0.022,0.055],1,[0,0,(j-1)*10]);
  }
  return {root,grounded:true,update(c,t){const l=clamp(c.leap??0.15),p=Math.max(0,Math.sin(t*3.1))*l;body.position.y=0.22+0.19*p;body.rotation.x=-0.14*p;legs.forEach((g,i)=>g.rotation.x=(i<2?0.3:-0.15)*p);eyes.forEach((e,i)=>e.rotation.y=0.025*Math.sin(t*0.8+i));blinkEyes(eyes,t);}};
 }
});

export const turtle=defineModel({
 id:'turtle',aliases:['tortoise','sea-turtle','reptile'],describe:'A green turtle beneath a high domed shell with outlined scutes, a small beaked head and four paddle-like feet; `paddle` moves its flippers.',controls:{paddle:'0 resting .. 1 swimming strokes (default 0.2)'},defaults:{paddle:0.2},size:'0.5 m long',
 build(ctx){
  const root=group(),body=group(root,[0,0.2,0]);root.rotation.y=deg(-25);
  ell(ctx,body,[0,0,-0.04],[0.34,0.15,0.43],0.7);
  ell(ctx,body,[0,0.25,-0.06],[0.37,0.29,0.46],0.92);
  mesh(ctx,body,G.torus(0.36,0.035,10,48),[0,0.11,-0.06],0.53,[90,0,0]);
  // Scute boundaries wrap over the curved carapace; raised central and marginal plates catch light.
  for(let row=-1;row<=1;row++)for(let col=-2;col<=2;col++){
   const x=col*0.115,z=-0.06+row*0.17;
   const y=0.25+0.29*Math.sqrt(Math.max(0.05,1-(x/0.39)**2-(z/0.49)**2));
   ell(ctx,body,[x,y,z],[0.11,0.025,0.09],(row+col)%2?0.62:0.8,[0,0,0]);
  }
  const neck=group(body,[0,0.19,0.36]);ell(ctx,neck,[0,0.04,0.21],[0.14,0.13,0.28],0.7);
  ell(ctx,neck,[0,0.09,0.42],[0.17,0.14,0.17],0.83);
  ell(ctx,neck,[0,0.01,0.55],[0.09,0.07,0.08],0.95);
  const faceEyes=eyePair(ctx,neck,[0,0.14,0.57],0.105,0.027,0.04);
  const flippers:THREE.Group[]=[];
  for(const s of [-1,1])for(const front of [true,false]){
   const f=group(body,[s*0.25,0.04,front?0.23:-0.3]);flippers.push(f);
   ell(ctx,f,[s*0.2,-0.03,front?0.06:-0.05],[0.23,0.065,0.12],0.74,[0,0,s*(front?-28:28)]);
   ell(ctx,f,[s*0.39,-0.05,front?0.13:-0.12],[0.22,0.045,0.09],0.86,[0,0,s*(front?-45:45)]);
   for(let j=-1;j<=1;j++)tube(ctx,f,[[s*0.25,-0.015,front?0.07:-0.07],[s*(0.42+j*0.035),-0.01,front?0.13+j*0.05:-0.13+j*0.05]],0.008,0.56,8);
  }
  return {root,grounded:true,update(c,t){const p=clamp(c.paddle??0.2);flippers.forEach((f,i)=>{const s=i%2===0?1:-1;f.rotation.z=s*0.22*p*Math.sin(t*3+i*Math.PI/2);f.rotation.x=0.08*p*Math.cos(t*3+i);});neck.rotation.y=0.025*Math.sin(t*0.9);blinkEyes(faceEyes,t);}};
 }
});

export const butterfly=defineModel({
 id:'butterfly',aliases:['moth','lepidopteran'],describe:'A monarch butterfly with veined orange wing panels, a black segmented body, antennae and six fine legs; `flap` opens and closes the paired wings.',controls:{flap:'0 folded .. 1 full wing beat (default 0.45)'},defaults:{flap:0.45},size:'0.12 m body',
 build(ctx){
  const root=group(),body=group(root,[0,0.45,0]);
  ell(ctx,body,[0,0,0],[0.045,0.22,0.045],0.28);
  ell(ctx,body,[0,0.22,0.015],[0.06,0.07,0.06],0.82);
  ell(ctx,body,[0,0.3,0.03],[0.065,0.065,0.065],0.92);
  const eyes=eyePair(ctx,body,[0,0.31,0.075],0.035,0.014,0.02);
  for(const s of [-1,1]){
   tube(ctx,body,[[s*0.025,0.35,0.02],[s*0.06,0.44,0.02],[s*0.11,0.49,0.03]],0.009,0.25,16);
   for(let j=0;j<3;j++)tube(ctx,body,[[s*0.025,-0.03,0],[s*(0.07+j*0.012),-0.14,0.08+j*0.03]],0.009,0.56,10);
  }
  const wings:THREE.Group[]=[];
  for(const s of [-1,1]){
   const w=group(body,[s*0.035,0.08,0]);wings.push(w);
   const fore:[[number,number],[number,number],[number,number],[number,number],[number,number],[number,number]]=[[-0.02,0.02],[0.18,0.08],[0.34,0.28],[0.29,0.5],[0.13,0.57],[0.03,0.34]];
   const shape=fore.map(([x,y])=>[x*s,y] as [number,number]);
   mesh(ctx,w,G.extrude(shape,0.025,0.008),[0,0,0],0.94);
   const hind:[[number,number],[number,number],[number,number],[number,number],[number,number]]=[[-0.02,0.04],[0.15,0.11],[0.22,-0.08],[0.16,-0.31],[0.04,-0.24]];
   mesh(ctx,w,G.extrude(hind.map(([x,y])=>[x*s,y] as [number,number]),0.025,0.008),[0,0,0],0.72);
   // Dark border, radiating veins and round eyespots keep the wing graphic legible at small scale.
   for(const v of [[0.04,0.12],[0.07,0.24],[0.08,0.36],[0.08,0.46],[0.04,-0.1],[0.06,-0.2]] as [number,number][]){tube(ctx,w,[[0,0,0],[s*v[0],v[1],0.02],[s*(v[0]*1.7),v[1]*1.55,0.02]],0.006,0.22,8);}
   ell(ctx,w,[s*0.12,-0.15,0.023],[0.05,0.045,0.012],0.95);
   ell(ctx,w,[s*0.12,-0.15,0.038],[0.025,0.025,0.008],0.24);
   for(let i=0;i<5;i++)ell(ctx,w,[s*(0.13+i*0.035),0.49-i*0.035,0.02],[0.018,0.018,0.012],0.2);
  }
  return {root,grounded:false,update(c,t){const f=clamp(c.flap??0.45);wings.forEach((w,i)=>{const s=i===0?-1:1;w.rotation.z=s*(0.12+0.55*f*Math.sin(t*7));w.rotation.x=0.09*Math.sin(t*7);});body.position.y=0.45+0.015*Math.sin(t*2);blinkEyes(eyes,t);}};
 }
});

export const bee=defineModel({
 id:'bee',aliases:['bumblebee','honeybee','pollinator'],describe:'A fuzzy bumblebee with a banded oval abdomen, striped thorax, clear veined wings, antennae and dangling legs; `buzz` flutters the wings and bobs the body.',controls:{buzz:'0 hovering .. 1 fast buzzing (default 0.35)'},defaults:{buzz:0.35},size:'0.025 m long',
 build(ctx){
  const root=group(),body=group(root,[0,0.42,0]);
  ell(ctx,body,[0,0,0],[0.17,0.16,0.26],0.84,[0,0,0]);
  ell(ctx,body,[0,0,-0.25],[0.135,0.135,0.19],0.88);
  for(const z of [-0.32,-0.19,-0.06])ell(ctx,body,[0,0.01,z],[0.142,0.14,0.028],0.22);
  ell(ctx,body,[0,0.04,0.26],[0.13,0.13,0.13],0.73);
  const eyes=eyePair(ctx,body,[0,0.1,0.34],0.078,0.028,0.04);
  for(const s of [-1,1])tube(ctx,body,[[s*0.04,0.14,0.31],[s*0.08,0.27,0.32],[s*0.12,0.31,0.34]],0.012,0.24,12);
  const wings:THREE.Group[]=[];
  for(const s of [-1,1]){
   const w=group(body,[s*0.06,0.12,0.02]);wings.push(w);
   ell(ctx,w,[s*0.2,0.12,0],[0.24,0.075,0.12],0.98,[0,0,s*22]);
   ell(ctx,w,[s*0.38,0.2,-0.07],[0.2,0.055,0.095],0.76,[0,0,s*34]);
   for(let j=0;j<3;j++)tube(ctx,w,[[s*0.08,0.12,0],[s*(0.2+j*0.03),0.17,-0.01],[s*(0.38+j*0.015),0.2,-0.06]],0.007,0.48,10);
   const leg=group(body,[s*0.1,-0.09,0.1]);
   for(let j=0;j<2;j++)tube(ctx,leg,[[0,0,0],[s*0.11,-0.13,-0.04],[s*(0.17+j*0.04),-0.22,0.04]],0.014,0.5,12);
  }
  return {root,grounded:false,update(c,t){const b=clamp(c.buzz??0.35);wings.forEach((w,i)=>{w.rotation.z=(i===0?-1:1)*0.42*b*Math.sin(t*(16+22*b));w.rotation.x=0.18*b*Math.cos(t*(16+22*b));});body.position.y=0.42+0.025*Math.sin(t*4)*b;body.rotation.z=0.04*Math.sin(t*2)*b;blinkEyes(eyes,t);}};
 }
});

export const ant=defineModel({
 id:'ant',aliases:['worker-ant','insect','formicid'],describe:'A worker ant with three distinct body segments, elbowed antennae, mandibles and six long jointed legs; `march` sets the coordinated walking pace.',controls:{march:'0 still .. 1 marching legs (default 0.25)'},defaults:{march:0.25},size:'0.04 m long',
 build(ctx){
  const root=group(),body=group(root,[0,0.22,0]);
  ell(ctx,body,[0,0.01,-0.27],[0.14,0.13,0.2],0.25);
  ell(ctx,body,[0,0.02,-0.06],[0.09,0.085,0.11],0.63);
  ell(ctx,body,[0,0.02,0.08],[0.11,0.1,0.13],0.32);
  ell(ctx,body,[0,0.045,0.27],[0.15,0.14,0.16],0.24);
  const eyes=eyePair(ctx,body,[0,0.11,0.39],0.09,0.025,0.035);
  for(const s of [-1,1]){
   tube(ctx,body,[[s*0.055,0.14,0.32],[s*0.12,0.28,0.35],[s*0.2,0.34,0.4]],0.012,0.74,14);
   tube(ctx,body,[[s*0.06,-0.015,0.36],[s*0.08,-0.08,0.43],[s*0.12,-0.08,0.47]],0.016,0.18,10);
  }
  const legs:THREE.Group[]=[];
  for(const s of [-1,1])for(let i=0;i<3;i++){
   const z=0.16-i*0.15,leg=group(body,[s*0.07,0,z]);legs.push(leg);
   tube(ctx,leg,[[0,0,0],[s*0.15,-0.08,0.025],[s*0.21,-0.22,z>0?0.035:-0.035],[s*0.27,-0.28,z>0?0.08:-0.08]],0.018,0.32,14);
   ell(ctx,leg,[s*0.15,-0.08,0.025],[0.025,0.025,0.025],0.77);
  }
  return {root,grounded:true,update(c,t){const m=clamp(c.march??0.25);legs.forEach((l,i)=>{const phase=t*(5+9*m)+i*Math.PI/3;l.rotation.x=0.1*m*Math.sin(phase);l.rotation.z=(i%2?1:-1)*0.08*m*Math.cos(phase);});body.position.y=0.22+0.008*Math.sin(t*3);blinkEyes(eyes,t);}};
 }
});

export const spider=defineModel({
 id:'spider',aliases:['arachnid','tarantula','web-spider'],describe:'A hairy spider with a rounded abdomen, compact head-thorax, a cluster of eight eyes and eight bent, jointed legs; `crawl` animates alternating steps.',controls:{crawl:'0 still .. 1 creeping gait (default 0.2)'},defaults:{crawl:0.2},size:'0.16 m leg span',
 build(ctx){
  const root=group(),body=group(root,[0,0.2,0]);
  ell(ctx,body,[0,0,-0.18],[0.22,0.18,0.25],0.56);
  ell(ctx,body,[0,0.02,0.16],[0.16,0.14,0.18],0.82);
  for(let i=0;i<4;i++)for(const s of [-1,1])ell(ctx,body,[s*(0.035+i*0.035),0.1,0.35+i*0.008],[0.028,0.031,0.023],i===0?0.12:0.24);
  const legs:THREE.Group[]=[];
  for(const s of [-1,1])for(let i=0;i<4;i++){
   const leg=group(body,[s*0.11,0.02,0.11-i*0.1]);legs.push(leg);
   const spread=0.28+(i%2)*0.06,forward=0.24-i*0.06;
   tube(ctx,leg,[[0,0,0],[s*spread*0.48,0.05,forward*0.4],[s*spread,0.08,forward],[s*(spread+0.08),-0.11,forward+0.09],[s*(spread+0.11),-0.19,forward+0.13]],0.028,0.58,22);
   ell(ctx,leg,[s*spread,0.08,forward],[0.04,0.04,0.04],0.96);
   for(let k=0;k<3;k++)tube(ctx,leg,[[s*(spread+0.08),-0.11,forward+0.09],[s*(spread+0.13),-0.2-k*0.025,forward+0.13]],0.009,0.86,8);
  }
  // Spinnerets and short palp pair under the mouth.
  for(const s of [-1,1]){ell(ctx,body,[s*0.055,-0.08,-0.4],[0.035,0.045,0.065],0.94);tube(ctx,body,[[s*0.06,-0.04,0.29],[s*0.1,-0.12,0.38]],0.018,0.52,10);}
  return {root,grounded:true,update(c,t){const crawl=clamp(c.crawl??0.2);legs.forEach((l,i)=>{const phase=t*(4+8*crawl)+i*Math.PI/2;l.rotation.x=0.06*crawl*Math.sin(phase);l.rotation.z=(i%2?1:-1)*0.08*crawl*Math.sin(phase);});body.position.y=0.2+0.006*Math.sin(t*2);}};
 }
});

export const chicken=defineModel({
 id:'chicken',aliases:['hen','rooster','poultry'],describe:'A plump chicken with layered wings, upright tail feathers, bright comb and wattle, sharp beak, scaly legs and separated toes; `peck` nods its head.',controls:{peck:'0 still .. 1 repeated head pecks (default 0.15)'},defaults:{peck:0.15},size:'0.4 m tall',
 build(ctx){
  const root=group(),body=group(root,[0,0.37,0]);root.rotation.y=deg(-34);
  ell(ctx,body,[0,0.04,0],[0.25,0.29,0.34],0.84,[8,0,0]);
  const head=group(body,[0,0.35,0.2]);
  ell(ctx,head,[0,0.08,0.06],[0.17,0.18,0.18],0.92);
  const eyes=eyePair(ctx,head,[0,0.12,0.18],0.095,0.03,0.035);
  mesh(ctx,head,G.cone(0.07,0.18,12),[0,0.0,0.29],0.96,[90,0,0]);
  for(let i=0;i<3;i++)ell(ctx,head,[(i-1)*0.065,0.27+0.025*(1-Math.abs(i-1)),0.05],[0.055,0.11,0.045],0.3,[0,0,(i-1)*13]);
  ell(ctx,head,[0,-0.12,0.18],[0.055,0.11,0.045],0.28);
  for(const s of [-1,1]){
   const wing=group(body,[s*0.18,0.08,-0.03]);
   ell(ctx,wing,[s*0.07,0,0],[0.15,0.17,0.28],0.64,[0,s*-8,s*15]);
   for(let i=0;i<5;i++)ell(ctx,wing,[s*(0.08+i*0.015),-0.12,-0.16+i*0.07],[0.1,0.045,0.085],0.92,[0,s*-10,0]);
  }
  for(let i=0;i<5;i++)ell(ctx,body,[(i-2)*0.055,0.12,-0.31],[0.045,0.055,0.26],i%2?0.62:0.97,[i*4,0,(i-2)*8]);
  const legs:THREE.Group[]=[];
  for(const s of [-1,1]){
   const leg=group(body,[s*0.12,-0.18,0.05]);legs.push(leg);
   tube(ctx,leg,[[0,0,0],[0,-0.16,0.02],[0,-0.28,0.03]],0.025,0.45,12);
   for(let j=-1;j<=1;j++)tube(ctx,leg,[[0,-0.28,0.03],[j*0.07,-0.31,0.17]],0.017,0.72,8);
   tube(ctx,leg,[[0,-0.28,0.03],[0,-0.31,-0.06]],0.015,0.72,8);
  }
  return {root,grounded:true,update(c,t){const p=clamp(c.peck??0.15);head.rotation.x=0.06*Math.sin(t*1.4)+p*Math.max(0,Math.sin(t*3))*0.35;body.position.y=0.37+0.008*Math.sin(t*2);legs.forEach((l,i)=>l.rotation.x=0.035*Math.sin(t*2+i*Math.PI));blinkEyes(eyes,t);}};
 }
});

export const penguin=defineModel({
 id:'penguin',aliases:['emperor-penguin','flightless-bird'],describe:'An upright emperor penguin with a white belly bib, black back, narrow flippers, white eye patches, pointed bill and webbed feet; `waddle` sways its steps.',controls:{waddle:'0 standing .. 1 walking waddle (default 0.2)'},defaults:{waddle:0.2},size:'1.1 m tall',
 build(ctx){
  const root=group(),body=group(root,[0,0.63,0]);
  ell(ctx,body,[0,0,0],[0.32,0.54,0.27],0.22,[8,0,0]);
  ell(ctx,body,[0,-0.02,0.285],[0.255,0.44,0.105],0.98,[8,0,0]);
  ell(ctx,body,[0,0.48,0.07],[0.21,0.22,0.2],0.34);
  ell(ctx,body,[0,0.49,0.25],[0.18,0.18,0.05],0.88);
  const eyes=eyePair(ctx,body,[0,0.53,0.28],0.095,0.03,0.035);
  mesh(ctx,body,G.cone(0.095,0.32,14),[0,0.36,0.39],0.77,[90,0,0]);
  const wings:THREE.Group[]=[];
  for(const s of [-1,1]){
   const wing=group(body,[s*0.27,0.08,0]);wings.push(wing);
   ell(ctx,wing,[s*0.09,-0.1,0],[0.13,0.37,0.07],0.68,[0,0,s*15]);
   ell(ctx,wing,[s*0.16,-0.36,0.015],[0.08,0.16,0.055],0.78,[0,0,s*20]);
  }
  for(const s of [-1,1]){
   ell(ctx,body,[s*0.18,-0.57,0.09],[0.18,0.075,0.22],0.92,[0,0,s*8]);
   for(let j=-1;j<=1;j++)ell(ctx,body,[s*0.18+j*0.075,-0.59,0.26],[0.06,0.035,0.11],0.78);
  }
  return {root,grounded:true,update(c,t){const w=clamp(c.waddle??0.2);body.rotation.z=0.04*Math.sin(t*2)+w*0.15*Math.sin(t*5);wings.forEach((x,i)=>x.rotation.z=(i===0?-1:1)*0.035*Math.sin(t*2));body.position.y=0.63+0.01*Math.abs(Math.sin(t*5))*w;blinkEyes(eyes,t);}};
 }
});

export const crab=defineModel({
 id:'crab',aliases:['shore-crab','crustacean','crab-claw'],describe:'A low crab with a ridged oval carapace, two oversized pincers, eight pointed walking legs and raised eyestalks; `scuttle` drives its sideways gait.',controls:{scuttle:'0 still .. 1 sideways stepping (default 0.2)'},defaults:{scuttle:0.2},size:'0.35 m across',
 build(ctx){
  const root=group(),body=group(root,[0,0.2,0]);
  ell(ctx,body,[0,0,0],[0.36,0.16,0.26],0.83);
  ell(ctx,body,[0,0.09,0.015],[0.33,0.11,0.245],0.95);
  tube(ctx,body,[[-0.28,0.13,0],[0,0.19,0.03],[0.28,0.13,0]],0.018,0.55,24);
  const eyes:THREE.Group[]=[];
  for(const s of [-1,1]){
   const stalk=group(body,[s*0.16,0.12,0.19]);eyes.push(stalk);
   tube(ctx,stalk,[[0,0,0],[s*0.025,0.12,0.02]],0.024,0.68,10);
   ell(ctx,stalk,[s*0.025,0.14,0.025],[0.055,0.06,0.05],0.95);
   ell(ctx,stalk,[s*0.025,0.14,0.066],[0.025,0.031,0.02],0.12);
  }
  const claws:THREE.Group[]=[],legs:THREE.Group[]=[];
  for(const s of [-1,1]){
   const c=group(body,[s*0.26,0.02,0.14]);claws.push(c);
   tube(ctx,c,[[0,0,0],[s*0.13,0.08,0.16],[s*0.24,0.13,0.19]],0.045,0.69,16);
   ell(ctx,c,[s*0.28,0.13,0.2],[0.16,0.13,0.14],0.96);
   mesh(ctx,c,G.cone(0.09,0.22,12),[s*0.37,0.22,0.24],0.69,[0,0,s*45]);
   mesh(ctx,c,G.cone(0.075,0.19,12),[s*0.4,0.035,0.22],0.87,[0,0,s*-30]);
   for(let i=0;i<4;i++){
    const leg=group(body,[s*0.25,0,-0.02-i*0.08]);legs.push(leg);
    tube(ctx,leg,[[0,0,0],[s*(0.17+i*0.025),0.08,0.02],[s*(0.31+i*0.02),-0.02,-0.08],[s*(0.39+i*0.02),-0.16,-0.12]],0.031,0.65,16);
   }
  }
  return {root,grounded:true,update(c,t){const sc=clamp(c.scuttle??0.2);legs.forEach((l,i)=>{l.rotation.z=(i%2?1:-1)*0.17*sc*Math.sin(t*5+i*Math.PI/2);});claws.forEach((g,i)=>g.rotation.z=(i===0?-1:1)*0.06*Math.sin(t*1.4+i));eyes.forEach((e,i)=>e.rotation.y=0.05*Math.sin(t*0.7+i));body.position.x=0.012*Math.sin(t*3)*sc;}};
 }
});

export const dinosaur=defineModel({
 id:'dinosaur',aliases:['t-rex','tyrannosaurus','tyrannosaurus-rex'],describe:'A Tyrannosaurus rex with a huge tooth-lined skull, deep chest, tiny two-fingered arms, powerful hind legs, ridged back and counterbalancing tail; `roar` opens its jaw and rocks the body.',controls:{roar:'0 closed .. 1 roaring jaw (default 0)'},defaults:{roar:0},size:'4 m tall',
 build(ctx){
  const root=group(),body=group(root);root.rotation.y=deg(-34);
  ell(ctx,body,[0,1.43,-0.12],[0.53,0.58,0.88],0.74,[4,0,0]);
  ell(ctx,body,[0,1.55,0.48],[0.46,0.48,0.46],0.83,[0,0,0]);
  ell(ctx,body,[0,1.7,0.84],[0.37,0.32,0.47],0.9,[0,0,0]);
  const skull=group(body,[0,1.78,1.04]);
  ell(ctx,skull,[0,0,0.16],[0.37,0.3,0.48],0.84);
  ell(ctx,skull,[0,-0.22,0.21],[0.34,0.1,0.42],0.6);
  ell(ctx,skull,[0,0.09,0.35],[0.29,0.21,0.31],0.95);
  const eyes=eyePair(ctx,skull,[0,0.12,0.55],0.24,0.055,0.035);
  ell(ctx,skull,[0,-0.14,0.53],[0.3,0.08,0.25],0.24);
  for(const s of [-1,1])for(let i=0;i<6;i++){
   const z=0.04+i*0.08;
   mesh(ctx,skull,G.cone(0.044,0.13,10),[s*(0.27-i*0.012),-0.05,z],0.98,[180,0,0]);
   mesh(ctx,skull,G.cone(0.038,0.1,10),[s*(0.27-i*0.012),-0.24,z],0.92);
  }
  // Nostril and visible jaw articulation.
  for(const s of [-1,1])ell(ctx,skull,[s*0.19,0.13,0.55],[0.03,0.018,0.025],0.13);
  const jaw=group(skull,[0,-0.16,-0.02]);
  ell(ctx,jaw,[0,-0.08,0.2],[0.31,0.09,0.45],0.7);
  for(const s of [-1,1])for(let i=0;i<5;i++)mesh(ctx,jaw,G.cone(0.035,0.09,8),[s*0.23,-0.025,0.03+i*0.085],0.96,[180,0,0]);
  const tail=group(body,[0,1.42,-0.82]);tube(ctx,tail,[[0,0,0],[0,0.06,-0.28],[0,0.12,-0.62],[0,0.18,-1.0],[0,0.2,-1.35]],0.27,0.67,40);
  for(let i=0;i<8;i++)mesh(ctx,body,G.cone(0.07,0.17,8),[0,1.99-i*0.075,-0.25-i*0.17],0.98,[90,0,0]);
  const legs:THREE.Group[]=[];
  for(const s of [-1,1]){
   const thigh=group(body,[s*0.35,1.12,-0.3]);legs.push(thigh);
   ell(ctx,thigh,[s*0.02,-0.16,0],[0.25,0.39,0.32],0.67,[0,0,s*12]);
   ell(ctx,thigh,[s*0.02,-0.47,0.12],[0.14,0.32,0.17],0.75,[0,0,s*-8]);
   ell(ctx,thigh,[s*0.02,-0.72,0.24],[0.23,0.1,0.28],0.83);
   for(let j=-1;j<=1;j++)mesh(ctx,thigh,G.cone(0.035,0.12,8),[s*0.02+j*0.11,-0.78,0.46],0.98,[90,0,0]);
   // Tiny two-clawed arms, iconic against the enormous head and chest.
   tube(ctx,body,[[s*0.4,1.68,0.7],[s*0.58,1.48,0.85],[s*0.64,1.31,0.95]],0.08,0.62,16);
   for(let j=0;j<2;j++)tube(ctx,body,[[s*0.64,1.31,0.95],[s*(0.69+j*0.08),1.26,1.02]],0.025,0.94,8);
  }
  return {root,grounded:true,update(c,t){const r=clamp(c.roar??0);jaw.rotation.x=0.03+0.48*r;body.position.y=0.006*Math.sin(t*1.8)+0.018*r*Math.sin(t*4);tail.rotation.y=0.025*Math.sin(t*1.1);legs.forEach((l,i)=>l.rotation.x=0.04*Math.sin(t*1.5+i));blinkEyes(eyes,t);}};
 }
});

export const apple=defineModel({
 id:'apple',aliases:['red-apple','fruit','pomaceous-fruit'],describe:'A squat five-lobed apple with a shallow crown dimple, short woody stem and a pair of veined leaves; `turn` slowly rotates it for a changing view.',controls:{turn:'0 still .. 1 slow turn (default 0.15)'},defaults:{turn:0.15},size:'0.08 m tall',
 build(ctx){
  const root=group(),fruit=group(root);
  latheY(ctx,fruit,[[0,0],[0.09,0],[0.14,0.025],[0.18,0.09],[0.195,0.17],[0.18,0.25],[0.145,0.31],[0.08,0.33],[0.035,0.31],[0,0.3]],[0,0,0],0.86,48);
  for(let i=0;i<5;i++){const a=i/5*Math.PI*2;ell(ctx,fruit,[Math.cos(a)*0.12,0.15,Math.sin(a)*0.12],[0.07,0.13,0.07],i%2?0.9:0.72);}
  mesh(ctx,fruit,G.cyl(0.018,0.025,0.075,12),[0,0.36,0],0.54,[0,0,12]);
  const leaf=mesh(ctx,fruit,G.extrude([[0,0],[0.08,0.025],[0.16,0.11],[0.1,0.16],[0.02,0.1]],0.012,0.005),[0.04,0.34,0],0.82);
  leaf.rotation.x=deg(-18);leaf.rotation.z=deg(-20);
  tube(ctx,fruit,[[0.03,0.35,0.01],[0.11,0.42,0.015],[0.18,0.47,0.02]],0.006,0.45,8);
  return {root,grounded:true,update(c,t){fruit.rotation.y=t*0.25*clamp(c.turn??0.15);}};
 }
});

export const orange=defineModel({
 id:'orange',aliases:['citrus','mandarin','tangerine'],describe:'A round orange with a dimpled peel, indented stem end and a leafy green calyx; `turn` rolls it slowly to reveal the rind texture.',controls:{turn:'0 still .. 1 slow turn (default 0.12)'},defaults:{turn:0.12},size:'0.08 m across',
 build(ctx){
  const root=group(),fruit=group(root);
  ell(ctx,fruit,[0,0.19,0],[0.19,0.19,0.19],0.86);
  ell(ctx,fruit,[0,0.355,0],[0.065,0.018,0.065],0.65);
  mesh(ctx,fruit,G.cyl(0.015,0.02,0.05,12),[0,0.39,0],0.45);
  for(let i=0;i<5;i++){
   const a=i/5*Math.PI*2;
   ell(ctx,fruit,[Math.cos(a)*0.045,0.405,Math.sin(a)*0.045],[0.065,0.014,0.028],0.74,[0,-a*180/Math.PI,0]);
  }
  const leaves=mesh(ctx,fruit,G.extrude([[0,0],[0.12,0.04],[0.2,0.13],[0.12,0.19],[0.03,0.12]],0.012,0.004),[0.04,0.4,0],0.94,[0,18,0]);
  void leaves;
  // Shallow peel pores catch highlights without turning the fruit into a spiky ball.
  for(let lat=0;lat<6;lat++)for(let lon=0;lon<12;lon++){
   const phi=(lat+0.5)/6*Math.PI,theta=lon/12*Math.PI*2;
   const x=0.192*Math.sin(phi)*Math.cos(theta),z=0.192*Math.sin(phi)*Math.sin(theta),y=0.19+0.192*Math.cos(phi);
   dotEll(ctx,fruit,[x,y,z],[0.008,0.008,0.008],lon%3?0.98:0.63);
  }
  return {root,grounded:true,update(c,t){fruit.rotation.y=t*0.22*clamp(c.turn??0.12);}};
 }
});

export const bread=defineModel({
 id:'bread',aliases:['loaf','bread-loaf','sourdough'],describe:'A baked oval loaf with a dark rounded crust, pale split scoring, a flour-dusted crown and a cut end showing the crumb; `turn` slowly turns the loaf.',controls:{turn:'0 still .. 1 slow turn (default 0.12)'},defaults:{turn:0.12},size:'0.3 m long',
 build(ctx){
  const root=group(),loaf=group(root);loaf.rotation.y=deg(-36);
  ell(ctx,loaf,[0,0.2,0],[0.25,0.21,0.39],0.61,[0,0,0]);
  ell(ctx,loaf,[0,0.22,0.02],[0.228,0.19,0.34],0.92);
  // Raised curved score cuts on the top and a visibly cut, porous end.
  for(let i=-1;i<=1;i++)tube(ctx,loaf,[[i*0.075,0.36,-0.2],[i*0.06,0.41,-0.06],[i*0.04,0.41,0.08],[i*0.015,0.36,0.23]],0.018,0.52,18);
  ell(ctx,loaf,[0,0.2,0.39],[0.18,0.16,0.025],0.97);
  for(let i=0;i<23;i++){
   const a=i*2.399,rr=0.15*Math.sqrt((i+0.5)/23);
   dotEll(ctx,loaf,[Math.cos(a)*rr,0.2+Math.sin(a)*rr,0.417],[0.009,0.008,0.008],i%3?0.56:0.75);
  }
  for(let i=0;i<14;i++){const a=i*2.399,rr=0.17*Math.sqrt((i+0.5)/14);dotEll(ctx,loaf,[Math.cos(a)*rr,0.39,Math.sin(a)*rr*0.6],[0.008,0.005,0.008],0.98);}
  return {root,grounded:true,update(c,t){loaf.rotation.y=t*0.18*clamp(c.turn??0.12);}};
 }
});

export const cheese=defineModel({
 id:'cheese',aliases:['cheese-wedge','swiss-cheese','cheddar-wedge'],describe:'A triangular wedge of cheese with a sloping rind and round holes bored into its cut face and sides; `turn` slowly rotates the wedge.',controls:{turn:'0 still .. 1 slow turn (default 0.12)'},defaults:{turn:0.12},size:'0.18 m wedge',
 build(ctx){
  const root=group(),wedge=group(root);
  const outline:[[number,number],[number,number],[number,number],[number,number]]=[[0,0],[0.4,0],[0.4,0.24],[0.08,0.39]];
  mesh(ctx,wedge,G.extrude(outline,0.34,0.035),[0,0,0],0.88);
  // Distinct circular eyes on the broad cut face; inset dark centres give the holes depth.
  for(const [x,y,r] of [[0.13,0.13,0.045],[0.27,0.11,0.032],[0.23,0.25,0.038],[0.34,0.19,0.025],[0.11,0.27,0.025]] as number[][]){
   ell(ctx,wedge,[x,y,0.178],[r*1.18,r*1.18,0.012],0.58);
   ell(ctx,wedge,[x,y,0.19],[r*0.65,r*0.65,0.009],0.22);
  }
  for(const [x,y,r] of [[0.13,0.12,0.04],[0.28,0.17,0.029],[0.21,0.31,0.023]] as number[][]){ell(ctx,wedge,[x,y,-0.177],[r,r,0.012],0.52);}
  for(const z of [-0.1,0.1])ell(ctx,wedge,[0.405,0.15,z],[0.012,0.035,0.035],0.56);
  return {root,grounded:true,update(c,t){wedge.rotation.y=t*0.2*clamp(c.turn??0.12);}};
 }
});

export const egg=defineModel({
 id:'egg',aliases:['chicken-egg','shell-egg'],describe:'A smooth upright egg with a tapered crown and broader base; `crack` splits the shell, lifts the cap and reveals the bright yolk.',controls:{crack:'0 whole .. 1 cracked open (default 0)'},defaults:{crack:0},size:'0.06 m tall',
 build(ctx){
  const root=group();
  const bottom=group(root);
  latheY(ctx,bottom,[[0,0],[0.075,0],[0.12,0.04],[0.14,0.12],[0.145,0.22],[0.135,0.28],[0.13,0.3]],[0,0,0],0.9,40);
  // Overlay a faint crack track. The raised cap is a separate shell section.
  const cap=group(root,[0,0,0]);
  latheY(ctx,cap,[[0.12,0.29],[0.14,0.3],[0.133,0.38],[0.11,0.45],[0.075,0.51],[0.035,0.55],[0,0.56],[0.12,0.29]],[0,0,0],0.9,40);
  const yolk=ell(ctx,root,[0,0.34,0],[0.09,0.085,0.09],0.64);yolk.visible=false;
  const white=ell(ctx,root,[0,0.3,0],[0.112,0.035,0.11],0.98);white.visible=false;
  return {root,grounded:true,update(c){const f=clamp(c.crack??0);cap.position.y=0.05*f;cap.rotation.z=0.22*f;yolk.visible=f>0.08;white.visible=f>0.08;yolk.scale.set(0.09*(0.2+0.8*f),0.085*(0.2+0.8*f),0.09*(0.2+0.8*f));}};
 }
});

export const pizza=defineModel({
 id:'pizza',aliases:['pizza-pie','pepperoni-pizza','pie'],describe:'A round pepperoni pizza with a raised bubbled crust, thick cheese top, dark pepperoni rounds and radial slice cuts; `spin` turns the whole pie.',controls:{spin:'0 still .. 1 slow spin (default 0.12)'},defaults:{spin:0.12},size:'0.32 m across',
 build(ctx){
  const root=group(),pie=group(root);
  pie.rotation.x=deg(28);pie.position.y=0.19;
  mesh(ctx,pie,G.cyl(0.32,0.32,0.075,64),[0,0.065,0],0.56);
  mesh(ctx,pie,G.cyl(0.29,0.29,0.045,64),[0,0.12,0],0.78);
  mesh(ctx,pie,G.cyl(0.27,0.27,0.025,64),[0,0.151,0],0.97);
  mesh(ctx,pie,G.torus(0.29,0.035,12,64),[0,0.163,0],0.84,[90,0,0]);
  for(let i=0;i<11;i++){
   const a=i*2.399,r=0.19*Math.sqrt((i+0.5)/11);
   mesh(ctx,pie,G.cyl(0.042,0.042,0.018,24),[Math.cos(a)*r,0.173,Math.sin(a)*r],0.34);
  }
  // Deep scoring grooves separate eight slices without disconnecting the pie.
  for(let i=0;i<4;i++){const a=i*Math.PI/4; tube(ctx,pie,[[0,0.177,0],[Math.cos(a)*0.285,0.177,Math.sin(a)*0.285]],0.006,0.38,20);}
  for(let i=0;i<18;i++){const a=i*2.399,r=0.24*Math.sqrt((i+0.5)/18);dotEll(ctx,pie,[Math.cos(a)*r,0.169,Math.sin(a)*r],[0.012,0.008,0.012],0.68);}
  return {root,grounded:true,update(c,t){pie.rotation.y=t*0.45*clamp(c.spin??0.12);}};
 }
});

export const burger=defineModel({
 id:'burger',aliases:['hamburger','cheeseburger','sandwich'],describe:'A stacked burger with a domed sesame bun, lettuce frill, square cheese, thick patty and lower bun; `press` gently compresses the stack.',controls:{press:'0 tall .. 1 pressed down (default 0.1)'},defaults:{press:0.1},size:'0.12 m tall',
 build(ctx){
  const root=group(),stack=group(root);
  ell(ctx,stack,[0,0.055,0],[0.25,0.08,0.22],0.74);
  ell(ctx,stack,[0,0.14,0],[0.24,0.075,0.21],0.42);
  // Cheese corner hangs over the patty; ruffled lettuce forms a clear bright layer.
  box(ctx,stack,[0,0.235,0],[0.43,0.018,0.35],0.92,0.01);
  const leaves:THREE.BufferGeometry[]=[];
  for(let i=0;i<12;i++){const a=i/12*Math.PI*2;leaves.push(at(G.ellipsoid(0.055,0.025,0.04,12,8),[Math.cos(a)*0.235,0.26,Math.sin(a)*0.2],[0,0,i*17]));}
  stack.add(ctx.mesh(G.merge(leaves),{tone:0.64}));
  ell(ctx,stack,[0,0.31,0],[0.25,0.07,0.22],0.5);
  ell(ctx,stack,[0,0.43,0],[0.24,0.14,0.215],0.9);
  // Sesame seeds are raised oblong marks distributed over the dome.
  for(let i=0;i<15;i++){
   const a=i*2.399,rad=0.16*Math.sqrt((i+0.5)/15),y=0.43+0.13*Math.sqrt(1-(rad/0.24)**2);
   dotEll(ctx,stack,[Math.cos(a)*rad,y,Math.sin(a)*rad*0.9],[0.022,0.009,0.011],0.98,[0,-a*180/Math.PI,0]);
  }
  return {root,grounded:true,update(c){const p=clamp(c.press??0.1);stack.scale.y=1-0.12*p;stack.position.y=0;}};
 }
});

export const coffee=defineModel({
 id:'coffee',aliases:['coffee-cup','mug','hot-coffee'],describe:'A ceramic coffee cup with a flared rim, dark visible coffee surface, thick loop handle and three curling steam wisps; `steam` raises the animated vapor.',controls:{steam:'0 no steam .. 1 full rising steam (default 0.55)'},defaults:{steam:0.55},size:'0.12 m tall',
 build(ctx){
  const root=group();
  latheY(ctx,root,[[0,0],[0.095,0],[0.11,0.015],[0.12,0.08],[0.135,0.19],[0.15,0.27],[0.15,0.29],[0.125,0.29],[0.12,0.25],[0.105,0.07],[0.085,0.045],[0,0.045]],[0,0,0],0.94,48);
  mesh(ctx,root,G.torus(0.139,0.012,10,48),[0,0.285,0],0.82,[90,0,0]);
  mesh(ctx,root,G.cyl(0.118,0.118,0.014,40),[0,0.25,0],0.22);
  mesh(ctx,root,G.torus(0.085,0.018,12,36),[0.15,0.17,0],0.9,[0,90,0]);
  for(const s of [-1,1])ell(ctx,root,[s*0.12,0.17,0],[0.025,0.035,0.08],0.78);
  const wisps:THREE.Group[]=[];
  for(let i=0;i<3;i++){
   const w=group(root,[(i-1)*0.06,0.31,0]);wisps.push(w);
   tube(ctx,w,[[0,0,0],[0.025,0.07,0],[0.0,0.15,0.01],[0.035,0.23,0.02]],0.009,0.78,20);
  }
  return {root,grounded:true,update(c,t){const s=clamp(c.steam??0.55);wisps.forEach((w,i)=>{w.visible=s>0.01;w.position.y=0.31+(t*0.06+i*0.07)%0.18;w.scale.setScalar(s*(0.55+0.2*Math.sin(t*2+i)));w.rotation.z=0.1*Math.sin(t*1.7+i);});}};
 }
});

export const carrot=defineModel({
 id:'carrot',aliases:['root-carrot','vegetable'],describe:'A tapered carrot root with shallow transverse ridges, a blunt crown and a fan of cut leafy tops; `sway` moves the greens.',controls:{sway:'0 still .. 1 lively leaf sway (default 0.2)'},defaults:{sway:0.2},size:'0.25 m long',
 build(ctx){
  const root=group(),veg=group(root);
  latheY(ctx,veg,[[0,0],[0.012,0.025],[0.025,0.07],[0.045,0.14],[0.065,0.22],[0.08,0.29],[0.07,0.33],[0,0.33]],[0,0,0],0.83,40);
  for(let i=0;i<7;i++){const y=0.07+i*0.032;mesh(ctx,veg,G.torus(0.04*(0.45+y/0.33),0.004,6,24),[0,y,0],0.61,[90,0,0]);}
  const top=group(veg,[0,0.32,0]);
  for(let i=0;i<5;i++){
   const a=i/5*Math.PI*2;
   tube(ctx,top,[[0,0,0],[Math.cos(a)*0.035,0.09,Math.sin(a)*0.035],[Math.cos(a)*0.08,0.18,Math.sin(a)*0.08]],0.012,0.62,14);
   ell(ctx,top,[Math.cos(a)*0.08,0.18,Math.sin(a)*0.08],[0.035,0.12,0.025],0.96,[0,0,-a*180/Math.PI]);
  }
  return {root,grounded:true,update(c,t){const s=clamp(c.sway??0.2);top.rotation.z=0.08*s*Math.sin(t*1.8);top.rotation.x=0.07*s*Math.cos(t*1.5);}};
 }
});

export const grapes=defineModel({
 id:'grapes',aliases:['grape-cluster','bunch-of-grapes','vine-fruit'],describe:'A hanging bunch of plump grapes arranged in a tapered cluster beneath a branching stem and two broad leaves; `turn` rotates the bunch.',controls:{turn:'0 still .. 1 slow turn (default 0.1)'},defaults:{turn:0.1},size:'0.16 m bunch',
 build(ctx){
  const root=group(),bunch=group(root);
  const rows:[[number,number,number],...Array<[number,number,number]>]=[[0,0.46,0],[-0.09,0.33,0.03],[0.09,0.33,-0.03],[-0.18,0.2,0],[0,0.2,0.06],[0.18,0.2,0],[-0.12,0.07,0.035],[0,0.07,-0.06],[0.12,0.07,0.035],[-0.06,-0.06,0],[0.06,-0.06,0],[0,-0.18,0]];
  for(let i=0;i<rows.length;i++){const [x,y,z]=rows[i]!;ell(ctx,bunch,[x,y,z],[0.057,0.06,0.057],i%3===0?0.96:i%3===1?0.38:0.72);dotEll(ctx,bunch,[x-0.014,y+0.018,z+0.04],[0.009,0.009,0.006],0.98);}
  tube(ctx,bunch,[[0,0.34,0],[0,0.46,0],[0.07,0.53,0.02],[0.11,0.59,0.02]],0.018,0.54,18);
  for(const s of [-1,1]){
   const leaf=mesh(ctx,bunch,G.extrude([[0,0],[0.1,0.03],[0.18,0.11],[0.11,0.19],[0.02,0.14]],0.012,0.004),[s*0.07,0.49,0.03],0.9,[0,s*25,s*12]);
   void leaf;
   tube(ctx,bunch,[[0,0.5,0.04],[s*0.1,0.56,0.05],[s*0.2,0.63,0.04]],0.006,0.48,8);
  }
  return {root,grounded:true,update(c,t){bunch.rotation.y=t*0.25*clamp(c.turn??0.1);}};
 }
});

export const strawberry=defineModel({
 id:'strawberry',aliases:['berry','garden-strawberry'],describe:'A heart-shaped strawberry with a pointed bottom, dimpled seed rows, leafy crown and curled green stem; `turn` rotates it slowly.',controls:{turn:'0 still .. 1 slow turn (default 0.12)'},defaults:{turn:0.12},size:'0.07 m tall',
 build(ctx){
  const root=group(),fruit=group(root);
  latheY(ctx,fruit,[[0,0],[0.025,0.025],[0.055,0.09],[0.085,0.18],[0.1,0.25],[0.085,0.31],[0.045,0.34],[0,0.33]],[0,0,0],0.86,44);
  // Recessed achenes are laid in staggered bands over the curved face.
  for(let row=0;row<5;row++)for(let col=0;col<7;col++){
   const y=0.045+row*0.052,rad=0.035+0.056*Math.sin((y/0.35)*Math.PI),x=(col-3)*0.026+(row%2)*0.012;
   if(Math.abs(x)>rad)continue;
   const z=Math.sqrt(Math.max(0.001,rad*rad-x*x))+0.003;
   dotEll(ctx,fruit,[x,y,z],[0.008,0.011,0.006],0.98);
  }
  for(let i=0;i<6;i++){const a=i/6*Math.PI*2;mesh(ctx,fruit,G.extrude([[0,0],[0.08,0.02],[0.14,0.13],[0.08,0.1],[0.02,0.13]],0.012,0.003),[Math.cos(a)*0.02,0.31,Math.sin(a)*0.02],0.54,[0,a*180/Math.PI,0]);}
  tube(ctx,fruit,[[0,0.32,0],[0,0.38,0.02],[0.035,0.42,0.02]],0.01,0.58,12);
  return {root,grounded:true,update(c,t){fruit.rotation.y=t*0.3*clamp(c.turn??0.12);}};
 }
});

export const watermelon=defineModel({
 id:'watermelon',aliases:['watermelon-slice','melon-slice'],describe:'A thick triangular watermelon slice with dark green rind bands, juicy cut flesh and scattered black seeds; `turn` slowly tips the slice.',controls:{turn:'0 still .. 1 gentle turn (default 0.1)'},defaults:{turn:0.1},size:'0.3 m across',
 build(ctx){
  const root=group(),slice=group(root);
  const outline:[[number,number],[number,number],[number,number],[number,number],[number,number],[number,number],[number,number],[number,number],[number,number]]=[[-0.38,0],[0.38,0],[0.36,0.1],[0.29,0.25],[0.16,0.36],[0,0.4],[-0.16,0.36],[-0.29,0.25],[-0.36,0.1]];
  mesh(ctx,slice,G.extrude(outline,0.19,0.012),[0,0,0],0.52);
  const flesh:[[number,number],[number,number],[number,number],[number,number],[number,number],[number,number],[number,number],[number,number],[number,number]]=[[-0.34,0.09],[0.34,0.09],[0.28,0.2],[0.15,0.31],[0,0.35],[-0.15,0.31],[-0.28,0.2],[-0.34,0.11],[-0.34,0.09]];
  mesh(ctx,slice,G.extrude(flesh,0.198,0.004),[0,0,0],0.94);
  for(const [x,y] of [[-0.23,0.18],[-0.14,0.25],[-0.04,0.14],[0.07,0.27],[0.18,0.19],[0.24,0.25],[0.01,0.32]] as [number,number][]){
   dotEll(ctx,slice,[x,y,0.104],[0.012,0.026,0.009],0.12,[0,0,-x*30]);
  }
  return {root,grounded:true,update(c,t){slice.rotation.y=0.08*Math.sin(t*0.5)*clamp(c.turn??0.1);}};
 }
});

export const mushroom=defineModel({
 id:'mushroom',aliases:['toadstool','fungus','button-mushroom'],describe:'A button mushroom with a domed cap, short pale stem, rolled cap edge and fine radial gills visible underneath; `turn` turns the cap into view.',controls:{turn:'0 still .. 1 slow turn (default 0.12)'},defaults:{turn:0.12},size:'0.09 m tall',
 build(ctx){
  const root=group(),cap=group(root);
  latheY(ctx,root,[[0,0],[0.055,0],[0.07,0.03],[0.065,0.12],[0.045,0.2],[0,0.22]],[0,0,0],0.94,32);
  latheY(ctx,cap,[[0,0.19],[0.11,0.19],[0.22,0.205],[0.28,0.24],[0.27,0.3],[0.22,0.37],[0.13,0.42],[0.04,0.445],[0,0.445]],[0,0,0],0.73,48);
  mesh(ctx,cap,G.torus(0.265,0.018,8,48),[0,0.235,0],0.98,[90,0,0]);
  // Gills radiate beneath the cap, from the stem out to the margin.
  for(let i=0;i<24;i++){const a=i/24*Math.PI*2; tube(ctx,cap,[[Math.cos(a)*0.065,0.205,Math.sin(a)*0.065],[Math.cos(a)*0.15,0.197,Math.sin(a)*0.15],[Math.cos(a)*0.245,0.211,Math.sin(a)*0.245]],0.005,0.42,12);}
  for(let i=0;i<8;i++){const a=i*2.399,r=0.22*Math.sqrt((i+0.5)/8);ell(ctx,cap,[Math.cos(a)*r,0.35+0.07*Math.sqrt(1-(r/0.28)**2),Math.sin(a)*r],[0.02,0.01,0.02],i%2?0.95:0.57);}
  return {root,grounded:true,update(c,t){cap.rotation.y=t*0.22*clamp(c.turn??0.12);}};
 }
});

export const corn=defineModel({
 id:'corn',aliases:['corn-cob','maize','sweetcorn'],describe:'A golden corn cob covered in individually raised kernels, partly wrapped by pointed husk leaves with a tuft of silk; `sway` moves the husk tips.',controls:{sway:'0 still .. 1 gentle leaf movement (default 0.12)'},defaults:{sway:0.12},size:'0.22 m long',
 build(ctx){
  const root=group(),cob=group(root,[0,0.14,0]);
  ell(ctx,cob,[0,0.2,0],[0.14,0.29,0.14],0.68);
  // Kernels follow staggered rows around the oval cob.
  for(let row=0;row<11;row++)for(let col=0;col<10;col++){
   const y=-0.04+row*0.048,a=(col+(row%2)*0.5)/10*Math.PI*2;
   const rx=0.143*Math.sqrt(Math.max(0.05,1-((y-0.2)/0.34)**2));
   const x=Math.cos(a)*rx,z=Math.sin(a)*rx;
   dotEll(ctx,cob,[x,y,z],[0.038,0.034,0.037],(row+col)%4?0.95:0.76,[0,-a*180/Math.PI,0]);
  }
  const husks:THREE.Group[]=[];
  for(let i=0;i<4;i++){
   const a=i/4*Math.PI*2,h=group(cob,[Math.cos(a)*0.07,-0.06,Math.sin(a)*0.07]);husks.push(h);
   const s=mesh(ctx,h,G.extrude([[0,0],[0.13,0.06],[0.17,0.34],[0.09,0.29],[0,0.12]],0.018,0.008),[0,0,0],0.87,[0,-a*180/Math.PI,0]);
   s.rotation.x=deg(-25);s.rotation.z=deg((i%2?1:-1)*18);
   tube(ctx,h,[[0,0,0],[Math.cos(a)*0.04,0.14,Math.sin(a)*0.04],[Math.cos(a)*0.1,0.31,Math.sin(a)*0.1]],0.008,0.52,12);
  }
  for(let i=0;i<6;i++)tube(ctx,cob,[[0,0.43,0],[(i-2.5)*0.015,0.55,0.01],[((i%3)-1)*0.06,0.62+(i%2)*0.03,0.02]],0.006,0.92,12);
  return {root,grounded:true,update(c,t){const s=clamp(c.sway??0.12);husks.forEach((h,i)=>{h.rotation.z=0.04*s*Math.sin(t*1.5+i);});}};
 }
});

export const croissant=defineModel({
 id:'croissant',aliases:['crescent-roll','pastry','buttery-croissant'],describe:'A plump crescent croissant with tapered horns, laminated curved ridges and a browned underside; `turn` slowly rotates the pastry.',controls:{turn:'0 still .. 1 slow turn (default 0.1)'},defaults:{turn:0.1},size:'0.16 m wide',
 build(ctx){
  const root=group(),pastry=group(root);
  const arc:V3[]=[[-0.32,0.04,0],[-0.3,0.16,0],[-0.22,0.25,0],[-0.11,0.28,0],[0,0.22,0],[0.12,0.29,0],[0.23,0.25,0],[0.31,0.15,0],[0.34,0.035,0]];
  tube(ctx,pastry,arc,0.075,0.85,64);
  ell(ctx,pastry,[-0.32,0.04,0],[0.045,0.035,0.045],0.56);
  ell(ctx,pastry,[0.34,0.035,0],[0.04,0.032,0.04],0.57);
  // Fold ridges follow the croissant's bent laminated layers.
  for(let i=1;i<=5;i++){
   const x=-0.25+i*0.095,y=0.23+0.045*Math.sin(i*0.8);
   tube(ctx,pastry,[[x-0.035,y-0.075,0.035],[x,y-0.025,0.068],[x+0.025,y+0.03,0.055],[x+0.015,y+0.08,0.025]],0.012,0.98,16);
  }
  tube(ctx,pastry,[[-0.27,0.04,-0.02],[-0.17,0.12,-0.052],[0,0.16,-0.065],[0.16,0.13,-0.05],[0.3,0.04,-0.01]],0.018,0.42,32);
  return {root,grounded:true,update(c,t){pastry.rotation.y=t*0.2*clamp(c.turn??0.1);}};
 }
});

export const iceCream=defineModel({
 id:'ice-cream',aliases:['icecream','ice-cream-cone','gelato-cone'],describe:'A scoop of ice cream with a curled peak and rounded drips sits in a pointed waffle cone with a crosshatched pattern; `melt` lengthens the drips.',controls:{melt:'0 fresh .. 1 softening scoop (default 0.08)'},defaults:{melt:0.08},size:'0.16 m tall',
 build(ctx){
  const root=group(),cone=group(root);
  mesh(ctx,cone,G.cone(0.145,0.31,48),[0,0.155,0],0.61);
  // Waffle lattice wraps the cone as two families of diagonal ridges.
  for(let i=-5;i<=5;i++){
   const u=i/5;
   tube(ctx,cone,[[u*0.12,0.03,-0.01],[u*0.09,0.1,0.11],[u*0.05,0.2,0.13],[u*0.02,0.29,0.08]],0.006,0.96,12);
   tube(ctx,cone,[[-u*0.12,0.03,-0.01],[-u*0.09,0.1,0.11],[-u*0.05,0.2,0.13],[-u*0.02,0.29,0.08]],0.006,0.82,12);
  }
  mesh(ctx,cone,G.torus(0.14,0.012,8,40),[0,0.29,0],0.88,[90,0,0]);
  const scoop=group(cone,[0,0.37,0]);
  ell(ctx,scoop,[0,0.1,0],[0.19,0.18,0.18],0.95);
  for(let i=0;i<7;i++){const a=i/7*Math.PI*2;ell(ctx,scoop,[Math.cos(a)*0.12,0.04,Math.sin(a)*0.12],[0.08,0.1,0.08],0.8);}
  ell(ctx,scoop,[0,0.24,-0.015],[0.11,0.09,0.11],0.92,[0,0,12]);
  const drips:THREE.Group[]=[];
  for(let i=0;i<5;i++){const a=i/5*Math.PI*2,d=group(scoop,[Math.cos(a)*0.12,0.02,Math.sin(a)*0.12]);drips.push(d);ell(ctx,d,[0,-0.04,0],[0.055,0.1,0.05],0.97);}
  return {root,grounded:true,update(c,t){const m=clamp(c.melt??0.08);drips.forEach((d,i)=>{d.scale.y=0.55+0.9*m+0.05*Math.sin(t*1.2+i);});scoop.rotation.z=0.015*Math.sin(t*1.2);}};
 }
});

export const chocolate=defineModel({
 id:'chocolate',aliases:['chocolate-bar','candy-bar','chocolate-tablet'],describe:'A thick chocolate tablet in a folded foil wrapper with twelve raised scored squares and snapped edges; `break` separates and tilts the two halves.',controls:{break:'0 intact .. 1 broken apart (default 0)'},defaults:{break:0},size:'0.12 m bar',
 build(ctx){
  const root=group(),bar=group(root);
  box(ctx,bar,[0,0.07,0],[0.34,0.08,0.24],0.34,0.025);
  const halves:THREE.Group[]=[];
  for(const s of [-1,1]){
   const half=group(bar,[s*0.085,0.12,0]);halves.push(half);
   for(let i=0;i<3;i++)for(let j=0;j<2;j++){
    const x=s*(0.03+i*0.055),z=(j-0.5)*0.105;
    box(ctx,half,[x,0,z],[0.05,0.04,0.095],i%2?0.53:0.72,0.012);
    // Small inset maker mark on the centre of each moulded square.
    mesh(ctx,half,G.rbox(0.021,0.004,0.018,0.004),[x,0.023,z],0.38);
   }
  }
  // Foil wrapper is folded back at one corner, with crisp crimped edges.
  mesh(ctx,bar,G.extrude([[-0.19,0.05],[0.19,0.05],[0.19,0.22],[-0.13,0.24],[-0.2,0.17]],0.012,0.006),[0,0,-0.13],0.95);
  for(let i=0;i<7;i++)tube(ctx,bar,[[-0.18+i*0.055,0.08,-0.14],[-0.18+i*0.055,0.2,-0.14]],0.003,0.62,8);
  return {root,grounded:true,update(c){const b=clamp(c.break??0);halves.forEach((h,i)=>{const s=i===0?-1:1;h.position.x=s*(0.085+0.09*b);h.rotation.z=s*0.18*b;h.rotation.y=s*0.04*b;});}};
 }
});
