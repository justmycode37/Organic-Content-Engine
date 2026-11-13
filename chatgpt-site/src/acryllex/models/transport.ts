// Transport models: vehicles, aircraft, vessels and roadside hardware.
import * as THREE from 'three';
import {G,at,deg,lerp,clamp} from '../kit.ts';
import {defineModel,type ModelCtx} from './types.ts';

type V3=[number,number,number];
type Shape2=[number,number][];
const group=(parent?:THREE.Object3D)=>{const g=new THREE.Group();parent?.add(g);return g;};
const mesh=(ctx:ModelCtx,parent:THREE.Object3D,geo:THREE.BufferGeometry,pos:V3=[0,0,0],tone=0.8,rot:V3=[0,0,0])=>{
 const m=ctx.mesh(at(geo,pos,rot),{tone});parent.add(m);return m;
};
const box=(ctx:ModelCtx,parent:THREE.Object3D,size:V3,pos:V3,tone=0.8,bevel=0.04)=>mesh(ctx,parent,G.rbox(size[0],size[1],size[2],Math.min(bevel,...size.map(v=>v*0.45))),pos,tone);
const rod=(a:V3,b:V3,r:number,seg=12)=>{
 const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),d=B.clone().sub(A),len=Math.max(0.0001,d.length());
 const g=G.cyl(r,r,len,seg);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()));
 const p=A.add(B).multiplyScalar(0.5);g.translate(p.x,p.y,p.z);return g;
};
const bar=(ctx:ModelCtx,parent:THREE.Object3D,a:V3,b:V3,r:number,tone=0.8)=>mesh(ctx,parent,rod(a,b,r),[0,0,0],tone);
/** A thick solid side profile. Coordinates are [front/back z, height y], front is +z. */
const sideShape=(ctx:ModelCtx,parent:THREE.Object3D,profile:Shape2,width:number,x=0,tone=0.8,bevel=0.015)=>{
 const g=G.extrude(profile,width,bevel);g.rotateY(-Math.PI/2);return mesh(ctx,parent,g,[x,0,0],tone);
};
const torus=(ctx:ModelCtx,parent:THREE.Object3D,R:number,r:number,pos:V3,rot:V3,tone=0.8)=>mesh(ctx,parent,G.torus(R,r,12,48),pos,tone,rot);
const cyl=(ctx:ModelCtx,parent:THREE.Object3D,r:number,h:number,pos:V3,rot:V3=[0,0,0],tone=0.8,segments=32)=>mesh(ctx,parent,G.cyl(r,r,h,segments),pos,tone,rot);
/** A detailed wheel on an X axle; the returned group spins around that axle. */
function wheel(ctx:ModelCtx,parent:THREE.Object3D,pos:V3,r:number,spokes=10){
 const w=group(parent);w.position.set(...pos);
 torus(ctx,w,r*0.79,r*0.21,[0,0,0],[0,90,0],0.32);
 torus(ctx,w,r*0.56,r*0.045,[0,0,0],[0,90,0],0.88);
 torus(ctx,w,r*0.7,r*0.025,[0,0,0],[0,90,0],0.55);
 cyl(ctx,w,r*0.18,r*0.28,[0,0,0],[0,0,90],0.95,24);
 for(let i=0;i<spokes;i++){
  const a=i/spokes*Math.PI*2,ca=Math.cos(a),sa=Math.sin(a);
  mesh(ctx,w,rod([0,r*0.13*ca,r*0.13*sa],[0,r*0.67*ca,r*0.67*sa],r*0.018,8),[0,0,0],0.95);
 }
 // Raised tread bars catch the dithered highlights on the tyre shoulder.
 for(let i=0;i<12;i++){
  const a=i/12*Math.PI*2;
   mesh(ctx,w,G.box(r*0.17,r*0.045,r*0.07),[0,r*0.96*Math.cos(a),r*0.96*Math.sin(a)],0.25);
 }
 return w;
}
function axle(ctx:ModelCtx,parent:THREE.Object3D,x:number,z:number,y:number,tone=0.55){bar(ctx,parent,[-x,y,z],[x,y,z],0.035,tone);}
function lamp(ctx:ModelCtx,parent:THREE.Object3D,pos:V3,r=0.09,control='lights',tone=1){
 const m=ctx.mesh(G.sphere(r,16,10),{tone,glow:1.7,glowControl:control});m.position.set(...pos);parent.add(m);return m;
}
function wheelTrackUpdate(ws:THREE.Group[],c:Record<string,number>,t:number,travelScale=5){
 const spin=((c.drive??0)*t*travelScale);for(let i=0;i<ws.length;i++)ws[i]!.rotation.x=spin*(i%2?1:1);
}

// ---------------------------------------------------------------- bicycles and small motor vehicles
export const bicycle=defineModel({
 id:'bicycle',aliases:['bike','push-bike','cycle'],
 describe:'A full-size road bicycle with two wire-spoked wheels, diamond frame, chainring, crank pedals, saddle and curved handlebars. `drive` spins both wheels and the pedals.',
 controls:{drive:'0 stopped .. 1 pedalling (default 0)'},defaults:{drive:0},size:'1.8 m long',
 build(ctx){
  const root=new THREE.Group(),r=0.42,zf=0.66,zr=-0.66,y=r+0.03;
  const wf=wheel(ctx,root,[0,y,zf],r,28),wr=wheel(ctx,root,[0,y,zr],r,28);
  const bb:V3=[0,0.48,-0.12],seat:[number,number,number]=[0,1.12,-0.38],head:[number,number,number]=[0,1.03,0.48],rear:[number,number,number]=[0,y,zr],front:[number,number,number]=[0,y,zf];
  for(const [a,b,rad,tone] of [[rear,bb,0.026,0.9],[bb,seat,0.027,0.78],[seat,rear,0.024,0.7],[seat,head,0.026,0.9],[head,bb,0.034,0.8],[head,front,0.027,0.95],[seat,[0,1.15,-0.46],0.025,0.75]] as [V3,V3,number,number][]){bar(ctx,root,a,b,rad,tone);}
  bar(ctx,root,[0,1.12,-0.38],[0,1.22,-0.38],0.02,0.9);
  box(ctx,root,[0.32,0.05,0.13],[0,1.25,-0.4],0.95,0.02);
  bar(ctx,root,[0,1.01,0.42],[0,1.19,0.58],0.027,0.92);
  bar(ctx,root,[-0.19,1.19,0.58],[0.19,1.19,0.58],0.025,0.95);
  for(const s of [-1,1]){cyl(ctx,root,0.035,0.08,[s*0.23,1.19,0.58],[0,0,90],0.35,16);}
  const crank=group(root);crank.position.set(0,bb[1],bb[2]);
  torus(ctx,crank,0.15,0.018,[0,0,0],[0,90,0],0.85);
  for(const s of [-1,1]){
   bar(ctx,crank,[s*0.08,0,0],[s*0.08,0.15,0],0.018,0.95);
   box(ctx,crank,[0.2,0.045,0.07],[s*0.16,0.15,0],0.65,0.015);
  }
  // Chain run and small rear sprocket make the drivetrain legible at reel scale.
  bar(ctx,root,[0.1,bb[1]+0.02,bb[2]],[0.1,y,zr],0.009,0.45);
  bar(ctx,root,[0.1,y,zr],[0.1,bb[1]-0.02,bb[2]],0.009,0.45);
  return {root,grounded:true,update(c,t){const d=clamp(c.drive??0);wf.rotation.x=wr.rotation.x=d*t*8;crank.rotation.x=d*t*8;}};
 },
});

export const motorcycle=defineModel({
 id:'motorcycle',aliases:['motorbike','motorcycle-bike'],
 describe:'A road motorcycle with thick wheels, exposed engine cylinders, fuel tank, long saddle, twin exhaust, fork and high handlebars. `drive` spins the wheels and adds a slight engine tremor.',
 controls:{drive:'0 parked .. 1 riding (default 0)'},defaults:{drive:0},size:'2.1 m long',
 build(ctx){
  const root=new THREE.Group(),r=0.36,wf=wheel(ctx,root,[0,r,0.74],r,12),wr=wheel(ctx,root,[0,r,-0.75],r,12);
  axle(ctx,root,0.23,0.74,r,0.65);axle(ctx,root,0.23,-0.75,r,0.65);
  bar(ctx,root,[0,0.4,-0.65],[0,0.89,-0.18],0.045,0.9);bar(ctx,root,[0,0.89,-0.18],[0,0.83,0.28],0.055,0.72);
  const tank=mesh(ctx,root,G.ellipsoid(0.3,0.25,0.48),[0,0.98,0.02],0.95);tank.rotation.x=deg(-8);
  box(ctx,root,[0.46,0.15,0.7],[0,0.84,-0.46],0.25,0.06);
  mesh(ctx,root,G.ellipsoid(0.24,0.18,0.28),[0,0.62,-0.08],0.55);
  for(let i=0;i<3;i++)cyl(ctx,root,0.045,0.34,[-0.12+i*0.12,0.58,0.04],[90,0,0],0.92,16);
  bar(ctx,root,[0,0.9,0.27],[0,1.35,0.63],0.035,0.9);bar(ctx,root,[0,1.35,0.63],[0,1.39,0.78],0.03,0.9);
  bar(ctx,root,[-0.28,1.39,0.78],[0.28,1.39,0.78],0.024,0.85);
  cyl(ctx,root,0.12,0.09,[0,1.05,0.69],[90,0,0],1,24);
  for(const s of [-1,1]){
   bar(ctx,root,[s*0.16,0.53,-0.25],[s*0.25,0.36,-0.75],0.025,0.7);
   const ex=group(root);bar(ctx,ex,[s*0.22,0.4,-0.35],[s*0.25,0.27,-1.05],0.047,0.62);
   cyl(ctx,ex,0.055,0.12,[s*0.25,0.27,-1.09],[90,0,0],0.92,20);
   cyl(ctx,root,0.035,0.12,[s*0.25,0.33,-0.4],[0,0,0],0.95,16);
  }
  return {root,grounded:true,update(c,t){const d=clamp(c.drive??0);wf.rotation.x=wr.rotation.x=d*t*7;root.position.y=d*0.006*Math.sin(t*34);}};
 },
});

export const scooter=defineModel({
 id:'scooter',aliases:['motor-scooter','vespa','moped'],
 describe:'A step-through motor scooter with small wheels, broad front leg shield, floorboard, engine case, mirrors and a pillion saddle. `drive` rotates the wheels and gently rocks the scooter.',
 controls:{drive:'0 parked .. 1 riding (default 0)'},defaults:{drive:0},size:'1.8 m long',
 build(ctx){
  const root=new THREE.Group(),r=0.23,wf=wheel(ctx,root,[0,r,0.63],r,10),wr=wheel(ctx,root,[0,r,-0.62],r,10);
  box(ctx,root,[0.36,0.1,0.78],[0,0.28,-0.05],0.78,0.05);
  const shield=sideShape(ctx,root,[[0.35,0.31],[0.62,0.42],[0.71,0.86],[0.63,1.06],[0.48,1.13],[0.38,0.98],[0.39,0.59]],0.12,0,0.92,0.035);
  void shield;
  box(ctx,root,[0.42,0.13,0.62],[0,0.75,-0.38],0.62,0.06);
  mesh(ctx,root,G.ellipsoid(0.22,0.16,0.25),[0,0.49,-0.58],0.52);
  bar(ctx,root,[0,0.72,0.55],[0,1.13,0.71],0.035,0.8);bar(ctx,root,[-0.26,1.13,0.71],[0.26,1.13,0.71],0.025,0.9);
  for(const s of [-1,1]){bar(ctx,root,[s*0.16,1.12,0.7],[s*0.22,1.39,0.65],0.016,0.75);mesh(ctx,root,G.sphere(0.045,10,8),[s*0.22,1.4,0.65],0.95);}
  mesh(ctx,root,G.sphere(0.11,16,10),[0,0.91,0.65],1);
  for(const s of [-1,1]){cyl(ctx,root,0.07,0.08,[s*0.22,0.78,0.6],[0,0,0],0.9,20);}
  return {root,grounded:true,update(c,t){const d=clamp(c.drive??0);wf.rotation.x=wr.rotation.x=d*t*9;root.rotation.z=Math.sin(t*0.8)*d*0.025;}};
 },
});

// ---------------------------------------------------------------- road vehicles
type RoadSpec={id:string;aliases:string[];desc:string;length:number;width:number;wheelbase:number;radius:number;kind:'car'|'van'|'bus'|'pickup';tone?:number};
function roadVehicle(ctx:ModelCtx,s:RoadSpec){
 const root=new THREE.Group(),ws:THREE.Group[]=[],L=s.id==='semi-truck'?5.2:s.length,W=s.width,R=s.radius;
 const chassisY=R+0.18;
 box(ctx,root,[W*0.84,0.2,L*0.88],[0,chassisY,0],0.44,0.06);
 if(s.kind==='car'){
  box(ctx,root,[W,0.56,L*0.86],[0,R+0.42,0],s.tone??0.82,0.16);
  sideShape(ctx,root,[[-L*0.29,R+0.65],[-L*0.22,R+1.17],[-L*0.1,R+1.48],[L*0.15,R+1.48],[L*0.29,R+0.67]],W*0.72,0,s.tone??0.9,0.025);
  // Side glazing is split into front and rear panes by a structural B pillar.
  for(const side of [-1,1]){
   sideShape(ctx,root,[[-L*0.205,R+0.87],[-L*0.15,R+1.38],[-L*0.03,R+1.38],[-L*0.025,R+0.87]],0.016,side*(W*0.365),0.23,0.006);
   sideShape(ctx,root,[[-L*0.01,R+0.87],[0,R+1.38],[L*0.115,R+1.38],[L*0.22,R+0.87]],0.016,side*(W*0.365),0.23,0.006);
   box(ctx,root,[0.06,0.04,0.16],[side*W*0.49,R+0.68,-L*0.02],0.96,0.015);
   box(ctx,root,[0.12,0.11,0.16],[side*W*0.52,R+0.68,L*0.22],0.8,0.03);
  }
  box(ctx,root,[W*0.8,0.39,0.035],[0,R+1.01,L*0.28],0.22,0.015).rotation.x=deg(-17);
  box(ctx,root,[W*0.7,0.34,0.035],[0,R+1.03,-L*0.27],0.24,0.015).rotation.x=deg(16);
 }else if(s.kind==='bus'){
  box(ctx,root,[W,2.25,L*0.91],[0,R+1.28,0],s.tone??0.85,0.16);
  box(ctx,root,[W*0.86,0.28,L*0.87],[0,R+2.55,0],0.88,0.09);
  box(ctx,root,[W*0.79,0.92,0.04],[0,R+2.0,L*0.457],0.24,0.015);
  for(const side of [-1,1]){
   for(let i=0;i<8;i++){
    const z=-L*0.39+i*L*0.105;
    box(ctx,root,[0.035,0.84,L*0.071],[side*(W/2+0.008),R+2.05,z],i===3?0.55:0.23,0.018);
   }
   for(const z of [-L*0.18,L*0.12])box(ctx,root,[0.045,1.72,0.055],[side*(W/2+0.015),R+1.45,z],0.72,0.012);
  }
  box(ctx,root,[W*0.9,0.16,0.08],[0,R+0.65,L*0.465],0.38,0.025);
  box(ctx,root,[W*0.56,0.3,0.045],[0,R+2.61,L*0.462],0.16,0.025);
  for(const side of [-1,1]){
   bar(ctx,root,[side*(W/2+0.04),R+2.22,L*0.42],[side*(W/2+0.28),R+2.34,L*0.5],0.025,0.9);
   mesh(ctx,root,G.rbox(0.22,0.09,0.06,0.02),[side*(W/2+0.28),R+2.34,L*0.5],0.16);
  }
 }else if(s.id==='tractor'){
  box(ctx,root,[1.55,0.68,1.72],[0,R+0.55,0.54],0.82,0.17);
  box(ctx,root,[1.38,0.12,1.55],[0,R+0.92,0.54],0.94,0.05);
  box(ctx,root,[1.28,0.13,1.26],[0,2.03,-0.55],0.9,0.06);
  for(const side of [-1,1]){
   bar(ctx,root,[side*0.64,1.34,-1.16],[side*0.64,2.0,-1.16],0.045,0.9);
   bar(ctx,root,[side*0.64,2.0,-1.16],[side*0.64,2.0,0.04],0.045,0.9);
   bar(ctx,root,[side*0.64,2.0,0.04],[side*0.64,1.34,0.04],0.045,0.9);
   box(ctx,root,[0.03,0.48,0.72],[side*0.65,1.68,-0.56],0.22,0.025);
  }
  box(ctx,root,[1.02,0.47,0.045],[0,1.68,0.08],0.22,0.025);
  cyl(ctx,root,0.065,1.18,[0.48,1.91,0.19],[0,0,0],0.3,16);
  box(ctx,root,[0.6,0.42,0.08],[0,0.68,1.43],0.48,0.035);
 }else if(s.id==='semi-truck'){
  // A distinct short tractor unit ahead of the long freight trailer.
  box(ctx,root,[W*0.94,0.62,1.48],[0,0.82,0.92],0.7,0.14);
  box(ctx,root,[W*0.9,1.18,1.78],[0,1.72,-0.12],0.85,0.16);
  box(ctx,root,[W*0.88,0.13,1.65],[0,2.37,-0.12],0.96,0.06);
  box(ctx,root,[W*0.78,0.59,0.045],[0,1.97,0.79],0.23,0.025).rotation.x=deg(-12);
  for(const side of [-1,1]){
   box(ctx,root,[0.045,0.72,0.88],[side*(W/2+0.015),1.93,-0.18],0.22,0.05);
   box(ctx,root,[0.06,0.08,0.18],[side*(W/2+0.08),1.18,0.42],0.95,0.025);
   bar(ctx,root,[side*(W/2+0.05),1.84,0.49],[side*(W/2+0.32),2.14,0.88],0.025,0.88);
   box(ctx,root,[0.2,0.09,0.07],[side*(W/2+0.32),2.14,0.88],0.16,0.02);
   box(ctx,root,[0.14,0.22,0.32],[side*(W/2+0.025),0.55,-0.15],0.62,0.035);
  }
  box(ctx,root,[1.45,0.08,0.38],[0,0.53,-1.24],0.55,0.025);
 }else if(s.kind==='van'){
  box(ctx,root,[W,1.3,L*0.72],[0,R+1.03,-L*0.09],s.tone??0.86,0.12);
  sideShape(ctx,root,[[-L*0.45,R+0.45],[L*0.45,R+0.45],[L*0.45,R+1.97],[-L*0.28,R+1.97],[-L*0.44,R+1.66]],W*0.94,0,s.tone??0.86,0.025);
  box(ctx,root,[W*0.78,0.72,0.035],[0,R+1.68,L*0.43],0.23,0.02).rotation.x=deg(-15);
  for(const side of [-1,1]){
   box(ctx,root,[0.035,0.71,L*0.11],[side*(W/2+0.012),R+1.54,-L*0.25],0.23,0.02);
   box(ctx,root,[0.04,0.84,0.05],[side*(W/2+0.026),R+1.53,L*0.12],0.63,0.012);
   box(ctx,root,[0.12,0.09,0.16],[side*(W/2+0.09),R+0.92,L*0.2],0.85,0.025);
  }
 }else{
  box(ctx,root,[W,0.64,L*0.64],[0,R+0.46,L*0.08],s.tone??0.84,0.14);
  box(ctx,root,[W*0.92,0.12,L*0.29],[0,R+0.31,-L*0.31],0.42,0.035);
  for(const side of [-1,1]){
   sideShape(ctx,root,[[-L*0.12,R+0.78],[-L*0.05,R+1.42],[L*0.16,R+1.42],[L*0.28,R+0.79]],0.018,side*(W*0.47),0.13,0.008);
   box(ctx,root,[0.07,0.045,0.14],[side*W*0.48,R+0.67,L*0.23],0.95,0.015);
  }
  box(ctx,root,[W*0.78,0.43,0.04],[0,R+1.08,L*0.29],0.13,0.012).rotation.x=deg(-18);
 }
 // Front fascia, rear lights, bumpers, mirrors and wheel arches/rims.
 box(ctx,root,[W*0.66,0.22,0.08],[0,R+0.34,L*0.48],0.55,0.035);
 box(ctx,root,[W*0.72,0.12,0.09],[0,R+0.27,-L*0.48],0.6,0.025);
 box(ctx,root,[W*0.26,0.1,0.035],[0,R+0.56,L*0.483],0.22,0.015);
 const lights:THREE.Mesh[]=[];
 for(const x of [-1,1]){
  const f=lamp(ctx,root,[x*W*0.36,R+0.68,L*0.485],R*0.2,'lights');lights.push(f);
  lamp(ctx,root,[x*W*0.36,R+0.63,-L*0.485],R*0.15,'lights',0.8);
 }
 if(s.id==='tractor'){
  for(const side of [-1,1]){ws.push(wheel(ctx,root,[side*1.03,0.74,-1.0],0.7,14));ws.push(wheel(ctx,root,[side*1.0,0.38,1.05],0.36,10));}
 }else{
  const positions=s.kind==='bus'?[-L*0.39,-L*0.04,L*0.37]:[-s.wheelbase/2,s.wheelbase/2];
  for(const z of positions)for(const side of [-1,1]){const w=wheel(ctx,root,[side*(W/2+0.03),R,z],R,s.kind==='bus'?12:10);ws.push(w);}
 }
 return {root,ws,lights};
}
function roadDef(spec:RoadSpec){return defineModel({
 id:spec.id,aliases:spec.aliases,describe:spec.desc,
 controls:{drive:'0..1 spin the wheels and add a subtle road bounce',lights:'0..1 headlights and marker lights (default 0.7)'},defaults:{drive:0,lights:0.7},size:`${spec.length.toFixed(1)} m long`,
 build(ctx){const built=roadVehicle(ctx,spec);for(const l of built.lights){const mat=l.material as THREE.MeshStandardMaterial;mat.emissiveIntensity=0.35;}
  // Roof equipment and distinct service-vehicle details.
  if(spec.id==='taxi'){
   box(ctx,built.root,[0.36,0.16,0.2],[0,1.88,-0.08],1,0.045);
   for(let i=0;i<5;i++)box(ctx,built.root,[0.07,0.035,0.08],[(-2+i)*0.075,1.98,-0.08],0.45,0.012);
  }
  if(spec.id==='police-car'){
   box(ctx,built.root,[0.62,0.14,0.22],[0,1.9,-0.04],0.88,0.03);
   for(const x of [-0.2,0.2])mesh(ctx,built.root,G.sphere(0.075,12,8),[x,1.99,-0.04],1);
   for(const side of [-1,1])box(ctx,built.root,[0.04,0.1,0.76],[side*spec.width*0.51,0.91,-0.12],0.3,0.015);
  }
  if(spec.id==='ambulance'){
   const cross=group(built.root);box(ctx,cross,[0.12,0.52,0.12],[0,1.76,-0.04],1,0.02);box(ctx,cross,[0.48,0.12,0.12],[0,1.76,-0.04],1,0.02);
   box(ctx,built.root,[0.62,0.12,0.22],[0,2.1,-0.04],0.8,0.03);
  }
  if(spec.id==='fire-truck'){
   box(ctx,built.root,[0.12,0.1,3.25],[0,2.25,-0.1],0.94,0.02);
   for(const x of [-0.55,0.55]){bar(ctx,built.root,[x,1.2,-1.2],[x,2.23,-1.2],0.035,0.75);bar(ctx,built.root,[x,2.23,-1.2],[x,2.23,1.4],0.035,0.75);}
   for(const z of [-0.8,-0.35,0.1,0.55,1.0])bar(ctx,built.root,[-0.55,2.23,z],[0.55,2.23,z],0.025,0.95);
   cyl(ctx,built.root,0.08,0.18,[0,2.38,0.8],[90,0,0],0.75,20);
  }
  if(spec.id==='pickup-truck'){
   for(const side of [-1,1]){bar(ctx,built.root,[side*0.75,0.76,-1.52],[side*0.75,1.22,-1.52],0.045,0.66);bar(ctx,built.root,[side*0.75,1.22,-1.52],[side*0.75,1.22,-0.6],0.045,0.66);}
   box(ctx,built.root,[1.35,0.07,1.0],[0,0.82,-1.05],0.75,0.025);
  }
  if(spec.id==='city-bus'||spec.id==='modern-train'||spec.id==='subway-car'||spec.id==='tram'){
   // Shared roadside/rail fleet numbering and belt trim.
   box(ctx,built.root,[spec.width*0.94,0.08,0.05],[0,1.07,spec.length*0.42],0.56,0.015);
  }
  if(spec.id==='semi-truck'){
   // High rectangular freight trailer, reefer ribs, landing legs and tandem axles.
   box(ctx,built.root,[2.48,3.25,7.6],[0,2.55,-4.3],0.88,0.16);
   box(ctx,built.root,[2.53,0.14,7.7],[0,0.98,-4.3],0.5,0.035);
   for(let z=-7.7;z<-0.6;z+=0.28)box(ctx,built.root,[0.035,3.02,0.045],[1.26,2.55,z],0.67,0.01);
   for(const x of [-1.0,1.0])for(const z of [-5.9,-4.9,-3.9]){const w=wheel(ctx,built.root,[x,0.42,z],0.42,10);built.ws.push(w);}
   for(const x of [-0.85,0.85])bar(ctx,built.root,[x,0.1,-1.1],[x,0.96,-1.1],0.035,0.7);
   for(let i=0;i<3;i++)box(ctx,built.root,[0.03,0.18,0.08],[1.29,0.57,-1.1+i*0.12],0.95,0.01);
   box(ctx,built.root,[2.18,0.11,0.055],[0,2.57,-8.13],0.56,0.025);
   box(ctx,built.root,[0.045,2.72,0.035],[0,2.55,-8.14],0.45,0.012);
   for(const side of [-1,1])for(const y of [1.35,3.68])box(ctx,built.root,[0.16,0.13,0.08],[side*1.14,y,-8.14],0.97,0.02);
  }
  return {root:built.root,grounded:true,update(c,t){wheelTrackUpdate(built.ws,c,t,7);built.root.position.y=clamp(c.drive??0)*0.004*Math.sin(t*24);}};
 },
});}

export const cityBus=roadDef({id:'city-bus',aliases:['bus','transit-bus','municipal-bus'],desc:'A long low-floor city bus with a continuous band of tall windows, passenger doors, front destination panel, bumpers and three axles. `drive` spins the wheels.',length:10.4,width:2.5,wheelbase:8.0,radius:0.48,kind:'bus'});
export const semiTruck=roadDef({id:'semi-truck',aliases:['semi','tractor-trailer','articulated-lorry','freight-truck'],desc:'A tractor-trailer: compact cab, fifth-wheel joint, tall ribbed box trailer, landing legs and tandem rear axles. `drive` spins every road wheel.',length:12.2,width:2.45,wheelbase:3.5,radius:0.43,kind:'van'});
export const taxi=roadDef({id:'taxi',aliases:['cab','taxicab'],desc:'A four-door city taxi with glass cabin, taxi roof sign, door handles, grille and four detailed wheels. `drive` spins the wheels; `lights` brightens the lamps.',length:4.65,width:1.82,wheelbase:2.72,radius:0.34,kind:'car',tone:0.91});
export const ambulance=roadDef({id:'ambulance',aliases:['emergency-ambulance','ems-van'],desc:'A high-roof emergency ambulance with a cab, rear treatment compartment, side windows, roof beacons and a raised medical cross. `drive` spins the wheels; `lights` controls the beacons.',length:5.3,width:2.05,wheelbase:3.35,radius:0.38,kind:'van'});
export const fireTruck=roadDef({id:'fire-truck',aliases:['fire-engine','firetruck','ladder-truck'],desc:'A fire engine with a cab, equipment body, large wheels, roof ladder rails, cross rungs and roof beacon. `drive` spins the wheels.',length:7.8,width:2.35,wheelbase:4.4,radius:0.43,kind:'van'});
export const policeCar=roadDef({id:'police-car',aliases:['cop-car','patrol-car','police-cruiser'],desc:'A patrol sedan with separate cabin glass, side stripe, grille, four road wheels and a roof lightbar. `drive` spins the wheels; `lights` controls the lamps.',length:4.75,width:1.85,wheelbase:2.8,radius:0.34,kind:'car'});
export const pickupTruck=roadDef({id:'pickup-truck',aliases:['pickup','pickup-vehicle','ute'],desc:'A pickup with a two-seat cab, sloped windscreen, open cargo bed, raised bed rails and chunky four-wheel tyres. `drive` spins the wheels.',length:5.35,width:2.0,wheelbase:3.25,radius:0.42,kind:'pickup'});
export const tractor=roadDef({id:'tractor',aliases:['farm-tractor','agricultural-tractor'],desc:'A farm tractor with oversized rear wheels, small front wheels, engine hood, glazed cab frame, exhaust stack and rear hitch. `drive` turns its wheels.',length:4.0,width:2.1,wheelbase:2.0,radius:0.38,kind:'van'});

// ---------------------------------------------------------------- public transport and rail
function railCar(ctx:ModelCtx,kind:'train'|'subway'|'tram',length:number){
 const root=new THREE.Group(),ws:THREE.Group[]=[],W=2.7,H=3.05,R=0.38;
 const profile:Shape2=kind==='train'
  ?[[-length*0.5+0.14,0.53],[-length*0.5,0.86],[-length*0.5,2.52],[-length*0.5+0.32,2.95],[length*0.5-0.7,2.95],[length*0.5,2.72],[length*0.5+0.82,1.62],[length*0.5+0.7,0.9],[length*0.5+0.3,0.53]]
  :[[-length*0.5+0.14,0.53],[-length*0.5,0.86],[-length*0.5,2.52],[-length*0.5+0.32,2.95],[length*0.5-0.32,2.95],[length*0.5,2.55],[length*0.5,0.86],[length*0.5-0.14,0.53]];
 sideShape(ctx,root,profile,W,0,kind==='tram'?0.83:0.91,0.065);
 box(ctx,root,[W*0.87,0.12,length*0.87],[0,0.58,0],0.4,0.035);
 // Cab windows front/rear and continuous side glazing.
 for(const z of [-length*0.5+0.56,length*0.5-0.56]){
  box(ctx,root,[W*0.72,0.76,0.055],[0,2.28,z],0.32,0.025);
  box(ctx,root,[W*0.76,0.09,0.08],[0,1.85,z],0.62,0.025);
 }
 if(kind==='train'){
  box(ctx,root,[W*0.68,0.72,0.055],[0,2.19,length*0.5+0.55],0.3,0.035);
  box(ctx,root,[W*0.55,0.12,0.07],[0,1.78,length*0.5+0.48],0.55,0.02);
  for(const side of [-1,1]){
   bar(ctx,root,[side*0.68,1.1,length*0.5-0.65],[side*0.68,2.1,length*0.5+0.42],0.035,0.95);
   mesh(ctx,root,G.sphere(0.07,12,8),[side*1.05,1.02,length*0.5+0.55],1);
  }
 }
 for(const side of [-1,1]){
  for(let i=0;i<Math.floor(length/1.22);i++){
   const z=-length*0.38+i*1.18;
   box(ctx,root,[0.04,0.74,0.86],[side*(W/2+0.012),2.27,z],0.34,0.06);
   if(kind==='subway'||kind==='tram'){
    box(ctx,root,[0.045,1.5,0.08],[side*(W/2+0.02),1.58,z+0.52],0.62,0.02);
    box(ctx,root,[0.048,0.07,0.06],[side*(W/2+0.035),0.89,z+0.52],0.97,0.01);
   }
  }
  // Articulated black door pairs.
  if(kind!=='train')for(const z of [-length*0.2,length*0.18]){
   box(ctx,root,[0.05,2.0,0.57],[side*(W/2+0.025),1.55,z],0.24,0.035);
   box(ctx,root,[0.06,0.1,0.64],[side*(W/2+0.045),1.04,z],0.94,0.018);
  }
 }
 // Bogies with visible wheel pairs, axle beams and suspension housings.
 for(const z of [-length*0.32,length*0.32]){
  box(ctx,root,[W*0.76,0.2,1.22],[0,0.7,z],0.56,0.05);
  for(const dz of [-0.42,0.42]){axle(ctx,root,W*0.52,z+dz,R,0.65);for(const s of [-1,1])ws.push(wheel(ctx,root,[s*(W*0.52),R,z+dz],R,12));}
 }
 // Underfloor equipment and roof pantograph for electric stock.
 for(const z of [-length*0.14,length*0.08])box(ctx,root,[1.35,0.42,0.82],[0,0.86,z],0.52,0.1);
 if(kind==='train'||kind==='tram'){
  const pant=group(root);pant.position.set(0,3.0,0.2);
  bar(ctx,pant,[-0.5,0,0],[0,0.68,0],0.035,0.62);bar(ctx,pant,[0,0.68,0],[0.48,0,0],0.035,0.62);
  bar(ctx,pant,[-0.27,0.68,0],[0.28,0.68,0],0.022,0.94);
 }
 box(ctx,root,[W*0.7,0.08,0.1],[0,H-0.1,length*0.28],0.96,0.025);
 return {root,ws};
}
function railDef(id:string,aliases:string[],kind:'train'|'subway'|'tram',desc:string,length:number){return defineModel({
 id,aliases,describe:desc,controls:{drive:'0..1 rotate wheelsets in place (default 0)'},defaults:{drive:0},size:`${length} m single car`,
 build(ctx){const b=railCar(ctx,kind,length);return {root:b.root,grounded:true,update(c,t){wheelTrackUpdate(b.ws,c,t,5);}};},
});}
export const modernTrain=railDef('modern-train',['bullet-train','high-speed-train','express-train'], 'train','A streamlined high-speed rail car with a tapered cab nose, panoramic windscreen, roof pantograph, passenger windows and paired bogies. `drive` turns the wheelsets.',12.5);
export const subwayCar=railDef('subway-car',['metro-car','underground-train','train-car'], 'subway','A stainless metro car with flat cab ends, broad paired sliding doors, continuous passenger windows, underfloor equipment and two bogies. `drive` turns the wheelsets.',10.8);
export const tram=railDef('tram',['streetcar','trolley-car','light-rail-car'], 'tram','A compact street tram with rounded end caps, low-floor paired doors, tall windows, roof pantograph and two bogies. `drive` turns the wheels.',9.2);

export const railwayTrack=defineModel({
 id:'railway-track',aliases:['railroad-track','train-track','track-segment','railway'],
 describe:'A short railway track segment with two polished rails, web and foot profiles, six timber sleepers, rail clips and a bed of coarse ballast. `wear` subtly varies the rail surface.',
 controls:{wear:'0 new rail .. 1 weathered rail shading (default 0.2)'},defaults:{wear:0.2},size:'4 m segment',
 build(ctx){
  const root=new THREE.Group(),rails:THREE.Mesh[]=[];box(ctx,root,[2.5,0.16,4.2],[0,0.08,0],0.38,0.07);
  // Individual angular ballast stones frame the ties instead of a smooth slab.
  for(let i=0;i<48;i++){
   const z=-1.9+(i%12)*0.34,x=-1.12+Math.floor(i/12)*0.72;
   const g=G.ellipsoid(0.09+(i%3)*0.025,0.045+(i%2)*0.018,0.11,8,6);
   mesh(ctx,root,g,[x,0.2,z],0.45+(i%4)*0.08,[i*9,0,i*13]);
  }
  for(const x of [-0.79,0.79]){
   rails.push(box(ctx,root,[0.17,0.16,4.15],[x,0.49,0],0.92,0.025));
   rails.push(box(ctx,root,[0.21,0.045,4.2],[x,0.59,0],0.48,0.015));
  }
  for(let i=0;i<6;i++){
   const z=-1.7+i*0.68;box(ctx,root,[2.25,0.17,0.22],[0,0.28,z],0.65,0.05);
   for(const x of [-0.79,0.79])box(ctx,root,[0.3,0.06,0.24],[x,0.4,z],0.88,0.025);
  }
  return {root,grounded:true,update(c){const w=clamp(c.wear??0.2);for(const m of rails)(m.material as THREE.MeshStandardMaterial).roughness=0.25+0.6*w;}};
 },
});

// ---------------------------------------------------------------- steam locomotive
export const steamLocomotive=defineModel({
 id:'steam-locomotive',aliases:['steam-engine','train-engine','locomotive'],
 describe:'A steam locomotive with a round smokebox and headlamp, tall chimney, boiler bands, cab, cowcatcher, side rods and large spoked driving wheels. `drive` turns the wheels; `steam` releases rising smoke puffs.',
 controls:{drive:'0 stopped .. 1 rolling (default 0)',steam:'0 no smoke .. 1 steady exhaust'},defaults:{drive:0,steam:0.65},size:'10 m long',
 build(ctx){
  const root=new THREE.Group(),ws:THREE.Group[]=[],R=0.65;
  const boiler=mesh(ctx,root,G.lathe([[0,-1.98],[0.45,-1.98],[0.62,-1.82],[0.68,-1.55],[0.68,1.18],[0.64,1.48],[0.5,1.68],[0,1.7]],48),[0,1.45,0],0.84,[90,0,0]);
  void boiler;
  // Locomotive points +z; the boiler lathe axis is rotated onto z.
  cyl(ctx,root,0.73,0.1,[0,1.46,1.73],[90,0,0],0.48,48);
  torus(ctx,root,0.65,0.045,[0,1.46,1.79],[0,0,0],0.95);
  cyl(ctx,root,0.1,0.22,[0,2.47,0.72],[0,0,0],0.72,24);
  cyl(ctx,root,0.17,0.12,[0,2.52,0.72],[0,0,0],0.98,28);
  cyl(ctx,root,0.12,0.2,[0,3.1,-0.95],[0,0,0],0.7,24);
  cyl(ctx,root,0.23,0.16,[0,3.2,-0.95],[0,0,0],0.9,28);
  box(ctx,root,[1.4,1.75,1.55],[0,1.0,-1.92],0.68,0.12);
  box(ctx,root,[1.35,0.1,1.6],[0,1.98,-1.92],0.92,0.03);
  for(const z of [-1.5,-0.6,0.3,1.2])torus(ctx,root,0.68,0.027,[0,1.46,z],[0,0,0],0.55);
  for(const side of [-1,1]){
   box(ctx,root,[0.06,0.86,0.75],[side*0.72,1.44,-1.88],0.14,0.02);
   for(const z of [-1.1,0,1.1]){
    const w=wheel(ctx,root,[side*0.77,R,z],R,14);ws.push(w);
   }
   // Side rods tie the three coupled driving wheels together.
   bar(ctx,root,[side*0.84,R,-1.1],[side*0.84,R,1.1],0.055,0.96);
   for(const z of [-1.1,0,1.1])bar(ctx,root,[side*0.86,R,z],[side*0.86,R+0.2,z+0.12],0.035,0.82);
  }
  // Pilot wheels and sloped front cowcatcher.
  for(const side of [-1,1])ws.push(wheel(ctx,root,[side*0.58,0.3,1.95],0.28,10));
  sideShape(ctx,root,[[1.9,0.32],[2.45,0.32],[2.0,0.9],[1.85,0.9]],1.55,0,0.55,0.025);
  cyl(ctx,root,0.2,0.16,[0,2.38,2.04],[90,0,0],1,32);
  // Fixed puffs are individually positioned and scaled each frame, so updates allocate nothing.
  const puffs=[0,1,2,3,4].map((_,i)=>{
   const m=mesh(ctx,root,G.sphere(0.2+i*0.035,16,10),[0,0,0],0.9);return m;
  });
  return {root,grounded:true,update(c,t){wheelTrackUpdate(ws,c,t,4);for(let i=0;i<puffs.length;i++){const phase=(t*0.32+i*0.2)%1,active=clamp(c.steam??0.65);const p=puffs[i]!;p.visible=active>0.02;p.position.set(Math.sin(t+i)*0.07,2.72+phase*1.1,0.72+phase*0.22);const s=0.18+phase*0.38;p.scale.setScalar(s*active);(p.material as THREE.MeshStandardMaterial).opacity=1-phase*0.62;}}};
 },
});

// ---------------------------------------------------------------- ships and small boats
function hullGeo(length:number,width:number,depth:number):THREE.BufferGeometry{
 const n=32,m=14,positions:number[]=[],indices:number[]=[];
 // Open U-shaped section with a tapered bow and stern, sampled from stern (-z) to bow (+z).
 for(let i=0;i<=n;i++){
  const u=i/n,z=(u-0.5)*length,taper=Math.pow(Math.max(0.01,Math.sin(Math.PI*u)),0.68),beam=width*0.5*taper;
  for(let j=0;j<=m;j++){
   const a=Math.PI*j/m,x=Math.cos(a)*beam,y=0.48-Math.sin(a)*depth;
   positions.push(x,y,z);
  }
 }
 for(let i=0;i<n;i++)for(let j=0;j<m;j++){
  const a=i*(m+1)+j,b=a+m+1;indices.push(a,b,a+1,b,b+1,a+1);
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return g;
}
function hull(ctx:ModelCtx,root:THREE.Object3D,length:number,width:number,depth:number,tone=0.55){
 return mesh(ctx,root,hullGeo(length,width,depth),[0,0,0],tone);
}
function boatWale(ctx:ModelCtx,root:THREE.Object3D,length:number,width:number,y:number,tone=0.9){
 for(const side of [-1,1]){
  sideShape(ctx,root,[[-length*0.5+0.16,0.16],[length*0.5-0.12,0.16],[length*0.5,y-0.04],[length*0.42,y+0.11],[-length*0.42,y+0.11],[-length*0.5,y-0.02]],0.055,side*width*0.42,0.67,0.02);
  bar(ctx,root,[side*width*0.42,y,-length*0.43],[side*width*0.18,y,length*0.43],0.045,tone);
 }
}
export const cargoShip=defineModel({
 id:'cargo-ship',aliases:['container-ship','freighter','cargo-vessel'],
 describe:'A container ship with a deep tapered bow, raised stern bridge, deck cranes and stacked shipping containers in coloured geometric rows. `sail` moves the vessel gently through the water.',
 controls:{sail:'0 still .. 1 gentle sea motion (default 0)'},defaults:{sail:0},size:'90 m display vessel',
 build(ctx){
  const root=new THREE.Group();hull(ctx,root,8.8,2.25,0.78,0.82);
  sideShape(ctx,root,[[-4.4,0.12],[4.25,0.12],[4.55,0.36],[4.12,0.68],[-3.9,0.68],[-4.4,0.45]],2.22,0,0.64,0.07);
  box(ctx,root,[2.05,0.26,8.35],[0,0.43,0],0.78,0.08);
  // Containers have corner castings, corrugated sides and visible end doors.
  for(let row=0;row<3;row++)for(let col=0;col<3;col++){
   const z=-2.72+col*1.88,y=0.83+row*0.82;
   box(ctx,root,[0.88,0.72,1.72],[row%2?0.48:-0.48,y,z],0.73+(row+col)%2*0.12,0.035);
   for(let k=0;k<8;k++)box(ctx,root,[0.018,0.61,0.03],[row%2?0.93:0.03,y,z-0.72+k*0.205],0.48,0.005);
   for(const x of [row%2?0.48:-0.48])for(const zz of [z-0.78,z+0.78])for(const yy of [y-0.31,y+0.31])box(ctx,root,[0.06,0.08,0.06],[x,yy,zz],0.95,0.01);
  }
  // Deckhouse aft with bridge windows, mast, radar and access ladders.
  box(ctx,root,[1.65,1.65,1.35],[0,1.17,-3.42],0.86,0.1);
  box(ctx,root,[1.68,0.42,1.15],[0,2.18,-3.42],0.94,0.07);
  for(const side of [-1,1])for(let i=0;i<5;i++)box(ctx,root,[0.025,0.23,0.17],[side*0.85,2.18,-3.85+i*0.21],0.15,0.025);
  bar(ctx,root,[0,2.4,-3.42],[0,3.55,-3.42],0.025,0.9);
  for(const y of [2.65,3.05,3.45])bar(ctx,root,[-0.38,y,-3.42],[0.38,y,-3.42],0.015,0.7);
  cyl(ctx,root,0.18,0.05,[0,3.45,-3.42],[90,0,0],0.95,32);
  for(const side of [-1,1]){bar(ctx,root,[side*0.72,0.64,-3.9],[side*0.72,1.85,-3.9],0.02,0.65);for(let i=0;i<5;i++)bar(ctx,root,[side*0.72,0.72+i*0.21,-3.9],[side*0.72,0.72+i*0.21,-3.65],0.015,0.8);}
  const cargo=group(root);
  return {root,grounded:true,update(c,t){const k=clamp(c.sail??0);cargo.rotation.z=Math.sin(t*0.7)*k*0.02;root.position.y=Math.sin(t*0.8)*k*0.025;}};
 },
});

export const sailboat=defineModel({
 id:'sailboat',aliases:['sailing-boat','sailing-yacht','sail'],
 describe:'A small keel sailboat with pointed hull, cockpit, mast, triangular mainsail, forward jib, boom, rigging and a gently billowing sail. `wind` fills the sail and rocks the hull.',
 controls:{wind:'0 calm .. 1 full billow (default 0.45)'},defaults:{wind:0.45},size:'8 m display sailboat',
 build(ctx){
  const root=new THREE.Group();hull(ctx,root,4.2,1.15,0.48,0.78);boatWale(ctx,root,4.2,1.15,0.45,0.92);
  box(ctx,root,[0.62,0.28,1.2],[0,0.56,-0.1],0.72,0.12);
  box(ctx,root,[0.55,0.14,0.75],[0,0.72,-0.12],0.18,0.08);
  const mast=group(root);mast.position.set(0,0.53,-0.08);bar(ctx,mast,[0,0,0],[0,3.0,0],0.038,0.93);
  const main=sideShape(ctx,mast,[[0,0.12],[0,2.85],[-1.72,0.25]],0.08,0,0.95,0.005);
  const jib=sideShape(ctx,mast,[[0.07,0.26],[1.5,0.43],[0.07,2.5]],0.06,0,0.78,0.005);
  bar(ctx,mast,[0,0.28,0],[0,-0.14,0],0.035,0.77);
  for(const s of [-1,1])bar(ctx,mast,[0,0.15,0],[0,2.9,s*0.38],0.012,0.62);
  return {root,grounded:true,update(c,t){const w=clamp(c.wind??0.45),swing=Math.sin(t*1.4)*w;main.rotation.y=swing*0.1;jib.rotation.y=-swing*0.07;root.rotation.z=Math.sin(t*0.9)*w*0.018;}};
 },
});

export const yacht=defineModel({
 id:'yacht',aliases:['motor-yacht','luxury-yacht','pleasure-boat'],
 describe:'A luxury motor yacht with a swept white hull, long dark port windows, teak deck, raised two-level cabin, wraparound bridge glazing, radar mast and twin stern drives. `cruise` adds a smooth bob.',
 controls:{cruise:'0 docked .. 1 cruising motion (default 0)'},defaults:{cruise:0},size:'18 m display yacht',
 build(ctx){
  const root=new THREE.Group();hull(ctx,root,5.2,1.35,0.68,0.82);box(ctx,root,[1.18,0.18,4.75],[0,0.48,0],0.88,0.07);
  // Continuous rows of portholes distinguish the hull from a simple launch.
  for(const side of [-1,1])for(let i=0;i<10;i++){
   const z=-2.05+i*0.42;mesh(ctx,root,G.sphere(0.047,12,8),[side*(0.52-Math.abs(z)*0.055),0.58,z],0.12);
  }
  sideShape(ctx,root,[[-2.02,0.61],[2.02,0.61],[1.73,1.03],[1.25,1.36],[-1.22,1.36],[-1.7,1.02]],1.06,0,0.84,0.045);
  box(ctx,root,[1.05,0.12,2.55],[0,1.4,-0.04],0.93,0.05);
  sideShape(ctx,root,[[-0.92,1.43],[1.12,1.43],[0.93,1.9],[-0.46,1.9]],1.0,0,0.88,0.04);
  for(const side of [-1,1]){
   box(ctx,root,[0.035,0.32,1.18],[side*0.52,1.69,0.22],0.13,0.04);
   bar(ctx,root,[side*0.62,0.64,-2.1],[side*0.62,0.82,2.0],0.018,0.92);
   for(let i=0;i<4;i++)bar(ctx,root,[side*0.62,0.65,-1.8+i*0.9],[side*0.62,0.43,-1.8+i*0.9],0.012,0.75);
  }
  bar(ctx,root,[0,1.9,-0.3],[0,2.65,-0.3],0.025,0.9);torus(ctx,root,0.16,0.025,[0,2.59,-0.3],[90,0,0],0.78);
  for(const side of [-1,1]){cyl(ctx,root,0.13,0.16,[side*0.34,0.1,-2.08],[0,0,0],0.7,24);}
  return {root,grounded:true,update(c,t){const k=clamp(c.cruise??0);root.position.y=Math.sin(t*0.8)*0.025*k;root.rotation.z=Math.sin(t*0.63+1)*0.012*k;}};
 },
});

export const rowingBoat=defineModel({
 id:'rowing-boat',aliases:['rowboat','dinghy','skiff'],
 describe:'A wooden rowboat with a deep open hull, curved gunwales, three cross-benches, transom, pair of long oars and visible oarlocks. `row` sweeps the oars in a rowing rhythm.',
 controls:{row:'0 resting .. 1 rowing (default 0)'},defaults:{row:0},size:'3.5 m boat',
 build(ctx){
  const root=new THREE.Group();hull(ctx,root,3.5,1.18,0.47,0.78);boatWale(ctx,root,3.5,1.18,0.49,0.96);
  for(const z of [-0.9,0,0.9])box(ctx,root,[1.03,0.11,0.14],[0,0.49,z],0.88,0.035);
  box(ctx,root,[0.9,0.52,0.13],[0,0.53,-1.62],0.78,0.045);
  const oars:THREE.Group[]=[];
  for(const side of [-1,1]){
   const o=group(root);o.position.set(side*0.42,0.66,0.05);oars.push(o);
   bar(ctx,o,[0,0,-0.02],[side*1.12,0.1,0.53],0.04,0.94);
   box(ctx,o,[0.16,0.04,0.42],[side*1.18,0.1,0.62],0.78,0.035);
   torus(ctx,root,0.065,0.012,[side*0.43,0.57,0.03],[90,0,0],0.7);
  }
  return {root,grounded:true,update(c,t){const k=clamp(c.row??0);oars.forEach((o,i)=>{o.rotation.y=(i?1:-1)*Math.sin(t*3.1)*0.65*k;o.rotation.x=Math.cos(t*3.1)*0.08*k;});}};
 },
});

export const canoe=defineModel({
 id:'canoe',aliases:['kayak-canoe','paddling-canoe'],
 describe:'A narrow pointed canoe with raised ends, a long open cockpit, reinforced gunwale, two seats and a double-bladed paddle. `paddle` rocks the shaft through a calm stroke.',
 controls:{paddle:'0 resting .. 1 paddling (default 0)'},defaults:{paddle:0},size:'4.5 m canoe',
 build(ctx){
  const root=new THREE.Group();hull(ctx,root,4.6,0.8,0.46,0.78);boatWale(ctx,root,4.6,0.8,0.49,0.96);
  // Raised end caps, a dark well and two low thwart seats.
  sideShape(ctx,root,[[-2.17,0.45],[-2.28,0.86],[-1.8,0.69],[-1.54,0.48]],0.82,0,0.72,0.035);
  sideShape(ctx,root,[[1.52,0.48],[1.79,0.7],[2.28,0.86],[2.16,0.45]],0.82,0,0.72,0.035);
  mesh(ctx,root,G.ellipsoid(0.26,0.018,1.2),[0,0.48,0],0.16);
  for(const z of [-0.75,0.75])box(ctx,root,[0.7,0.09,0.12],[0,0.55,z],0.92,0.035);
  const p=group(root);p.position.set(0,0.87,0);bar(ctx,p,[-1.7,0,0],[1.7,0,0],0.025,0.72);
  for(const side of [-1,1])box(ctx,p,[0.46,0.045,0.1],[side*1.75,0,0],0.92,0.035);
  return {root,grounded:true,update(c,t){p.rotation.z=Math.sin(t*2.1)*0.62*clamp(c.paddle??0);}};
 },
});

export const submarine=defineModel({
 id:'submarine',aliases:['sub','submersible','underwater-vessel'],
 describe:'A deep-sea submarine with a long pressure hull, rounded bow, ringed portholes, conning tower, periscope, diving planes and four-blade stern propeller. `propeller` spins the screw.',
 controls:{propeller:'0 stopped .. 1 full screw speed (default 0)'},defaults:{propeller:0},size:'24 m display submarine',
 build(ctx){
  const root=new THREE.Group();
  const profile:[number,number][]=[[0,-2.5],[0.34,-2.5],[0.58,-2.32],[0.68,-1.95],[0.7,1.8],[0.66,2.15],[0.5,2.38],[0.25,2.5],[0,2.5]];
  mesh(ctx,root,G.lathe(profile,48),[0,0.95,0],0.86,[90,0,0]);
  // Reinforced circular bow and stern rings.
  for(const z of [-2.12,1.95])torus(ctx,root,0.61,0.055,[0,0.95,z],[90,0,0],0.55);
  for(const side of [-1,1])for(let i=0;i<7;i++){
   const z=-1.55+i*0.49;mesh(ctx,root,G.sphere(0.08,14,10),[side*0.65,1.05,z],0.14);
   torus(ctx,root,0.082,0.014,[side*0.69,1.05,z],[0,90,0],0.98);
  }
  box(ctx,root,[0.78,0.47,0.93],[0,1.95,-0.55],0.72,0.12);
  box(ctx,root,[0.58,0.31,0.58],[0,2.34,-0.55],0.9,0.09);
  bar(ctx,root,[0,2.48,-0.55],[0,3.1,-0.55],0.025,0.88);
  for(const side of [-1,1]){
   sideShape(ctx,root,[[-1.9,0.88],[-1.4,0.88],[-0.9,1.18],[-1.1,1.23]],0.13,side*0.58,0.72,0.02);
   bar(ctx,root,[side*0.52,0.88,-1.75],[side*0.72,0.88,-1.75],0.05,0.72);
  }
  const screw=group(root);screw.position.set(0,0.95,-2.58);
  cyl(ctx,screw,0.13,0.22,[0,0,0],[90,0,0],0.82,20);
  const blades=group(screw);
  for(let i=0;i<5;i++){const a=i*72;mesh(ctx,blades,G.rbox(0.12,0.64,0.05,0.025),[0,0.35,0],0.95,[0,0,a]);}
  return {root,grounded:false,update(c,t){blades.rotation.z=t*(1+clamp(c.propeller??0)*24);root.position.y=Math.sin(t*0.8)*0.025;}};
 },
});

// ---------------------------------------------------------------- aircraft
/** Planform for wings/fins, drawn in the X/Z plane and given a thin vertical section. */
function planform(ctx:ModelCtx,parent:THREE.Object3D,outline:Shape2,y:number,tone=0.82,thickness=0.14){
 const g=G.extrude(outline,thickness,Math.min(thickness*0.35,0.06));g.rotateX(Math.PI/2);return mesh(ctx,parent,g,[0,y,0],tone);
}
function axialBody(ctx:ModelCtx,parent:THREE.Object3D,profile:[number,number][],pos:V3,tone=0.9){
 return mesh(ctx,parent,G.lathe(profile,48),pos,tone,[90,0,0]);
}
function finProfile(ctx:ModelCtx,parent:THREE.Object3D,outline:Shape2,width:number,x:number,tone=0.8){
 return sideShape(ctx,parent,outline,width,x,tone,0.035);
}

export const helicopter=defineModel({
 id:'helicopter',aliases:['chopper','helo','rotorcraft'],
 describe:'A utility helicopter with glazed rounded cockpit, cabin, skids, tail boom, tail rotor and a long four-blade overhead rotor. `rotor` spins the main and tail blades; `lift` adds a gentle hover.',
 controls:{rotor:'0 stopped .. 1 rotor speed (default 0.5)',lift:'0 landed .. 1 hovering (default 0)'},defaults:{rotor:0.5,lift:0},size:'12 m display aircraft',
 build(ctx){
  const root=new THREE.Group();
  const fus=mesh(ctx,root,G.ellipsoid(0.88,0.7,1.55,40,24),[0,1.58,0.05],0.82);fus.rotation.x=deg(-2);
  mesh(ctx,root,G.ellipsoid(0.7,0.52,0.72,32,20),[0,1.68,0.85],0.16);
  // Separate angled windscreen panes and side cabin glazing.
  for(const side of [-1,1]){
   box(ctx,root,[0.028,0.54,0.62],[side*0.69,1.73,0.42],0.13,0.07).rotation.y=deg(side*10);
   box(ctx,root,[0.028,0.5,0.72],[side*0.84,1.64,-0.43],0.15,0.07);
   box(ctx,root,[0.045,0.055,0.15],[side*0.98,1.32,0.03],0.95,0.02);
   // Landing skid rails and diagonal support struts.
   bar(ctx,root,[side*0.6,0.25,-1.2],[side*0.6,0.25,1.0],0.047,0.72);
   for(const z of [-0.75,0.62])bar(ctx,root,[side*0.6,0.25,z],[side*0.42,0.96,z],0.036,0.86);
  }
  // Tail boom tapers to the tail rotor; fin and stabilizer carry control surfaces.
  const boom=axialBody(ctx,root,[[0.12,-2.7],[0.2,-2.5],[0.28,-1.45],[0.31,-0.6],[0.22,0]], [0,1.58,-1.72],0.72);
  void boom;
  finProfile(ctx,root,[[-4.25,1.52],[-3.28,1.38],[-3.3,2.47],[-3.63,2.85],[-3.88,2.84],[-4.02,1.93]],0.12,0,0.9);
  planform(ctx,root,[[-1.03,-3.05],[1.03,-3.05],[0.72,-3.48],[-0.72,-3.48]],1.65,0.86,0.12);
  // Main rotor mast and crossed blades.
  bar(ctx,root,[0,2.17,0.03],[0,2.72,0.03],0.055,0.88);
  const rotor=group(root);rotor.position.set(0,2.78,0.03);
  for(let i=0;i<4;i++){
   const b=box(ctx,rotor,[0.19,0.055,4.55],[0,0,0],0.9,0.035);b.rotation.y=deg(i*90);b.position.x=Math.sin(deg(i*90))*0.04;b.position.z=Math.cos(deg(i*90))*0.04;
   box(ctx,rotor,[0.2,0.035,0.38],[0,0,2.16],0.65,0.02);
  }
  const tailRotor=group(root);tailRotor.position.set(0.38,1.93,-4.0);
  for(let i=0;i<4;i++){const b=box(ctx,tailRotor,[0.09,0.78,0.05],[0,0,0],0.9,0.02);b.rotation.z=deg(i*90);}
  cyl(ctx,tailRotor,0.11,0.16,[0,0,0],[90,0,0],0.55,20);
  cyl(ctx,root,0.13,0.3,[0,2.83,0.03],[0,0,0],0.96,24);
  return {root,grounded:false,update(c,t){const s=lerp(0.5,18,clamp(c.rotor??0.5));rotor.rotation.y=t*s;tailRotor.rotation.z=-t*s*1.8;root.position.y=Math.sin(t*1.2)*0.08*clamp(c.lift??0);root.rotation.z=Math.sin(t*0.55)*0.012*clamp(c.lift??0);}};
 },
});

export const jetFighter=defineModel({
 id:'jet-fighter',aliases:['fighter-jet','military-jet','combat-aircraft'],
 describe:'A swept-wing fighter aircraft with a sharp pointed nose, bubble canopy, twin tail fins, wing pylons, twin engine exhausts and broad stabilators. `fly` banks the aircraft; `afterburner` lengthens glowing exhaust flames.',
 controls:{fly:'0 parked .. 1 flying bank and bob (default 0)',afterburner:'0 idle .. 1 glowing exhaust (default 0)'},defaults:{fly:0,afterburner:0},size:'15 m long',
 build(ctx){
  const root=new THREE.Group(),plane=group(root),L=8.8;
  axialBody(ctx,plane,[[0,-4.6],[0.18,-4.43],[0.35,-3.9],[0.48,-2.8],[0.51,-0.7],[0.47,1.4],[0.34,3.4],[0.2,4.15],[0,4.35]],[0,2.6,0],0.9);
  // Large sharply swept delta-like main wing.
  planform(ctx,plane,[[-0.34,1.55],[-5.1,-1.2],[-6.65,-2.65],[-6.3,-3.08],[-1.08,-2.18],[0.34,-1.05]],2.46,0.82,0.18);
  planform(ctx,plane,[[-0.2,-3.05],[-2.45,-3.6],[-2.28,-4.2],[-0.17,-3.86],[0.17,-3.86],[2.28,-4.2],[2.45,-3.6],[0.2,-3.05]],2.56,0.72,0.14);
  finProfile(ctx,plane,[[-3.95,2.58],[-3.13,2.68],[-3.58,4.28],[-4.05,4.5],[-4.26,4.43]],0.13,0.4,0.85);
  finProfile(ctx,plane,[[-3.95,2.58],[-3.13,2.68],[-3.58,4.28],[-4.05,4.5],[-4.26,4.43]],0.13,-0.4,0.85);
  // Canopy with raised frame and ejection seat silhouette.
  mesh(ctx,plane,G.ellipsoid(0.39,0.43,1.02,32,20),[0,3.0,1.72],0.18);
  for(const side of [-1,1])bar(ctx,plane,[side*0.36,2.83,0.95],[side*0.28,3.28,2.15],0.024,0.96);
  bar(ctx,plane,[0,3.38,2.05],[0,3.39,0.96],0.022,0.78);
  const flames:THREE.Mesh[]=[];
  for(const side of [-1,1]){
   // Twin engine exhausts and afterburner flame cones point aft (-z).
   cyl(ctx,plane,0.27,0.36,[side*0.29,2.55,-4.38],[90,0,0],0.45,32);
   torus(ctx,plane,0.25,0.05,[side*0.29,2.55,-4.54],[90,0,0],0.98);
   const flame=ctx.mesh(G.cone(0.19,0.86,20),{tone:0.95,glow:2.4,glowControl:'afterburner'});flame.position.set(side*0.29,2.55,-4.9);flame.rotation.x=deg(-90);plane.add(flame);flames.push(flame);
   for(const z of [-1.8,-3.05])box(ctx,plane,[0.08,0.06,0.8],[side*(2.7+(z+1.8)*0.6),2.34,z],0.55,0.025);
   // Wingtip missile rails and red/green position lamps.
   bar(ctx,plane,[side*6.18,2.52,-2.65],[side*6.65,2.52,-2.65],0.03,0.92);
   mesh(ctx,plane,G.cone(0.075,0.68,16),[side*6.65,2.53,-2.98],0.75,[-90,0,0]);
   lamp(ctx,plane,[side*6.25,2.52,-2.7],0.075,'lights');
  }
  return {root,grounded:false,update(c,t){const f=clamp(c.fly??0),a=clamp(c.afterburner??0);plane.rotation.z=Math.sin(t*0.62)*f*0.12;plane.rotation.x=Math.sin(t*0.45)*f*0.035;plane.position.y=Math.sin(t*0.85)*f*0.12;for(const m of flames){m.scale.z=0.55+1.1*a;m.visible=a>0.01;}}};
 },
});

export const passengerJet=defineModel({
 id:'passenger-jet',aliases:['widebody-airliner','jumbo-jet','long-haul-airliner'],
 describe:'A wide-body four-engine passenger jet with twin rows of cabin windows, swept wings, four hanging turbofans, winglets, landing gear and a tall tail. `fly` gently banks it and spins all four fans.',
 controls:{fly:'0 parked .. 1 cruising bank and bob (default 0)'},defaults:{fly:0},size:'45 m display airliner',
 build(ctx){
  const root=new THREE.Group(),plane=group(root),L=15.2;
  axialBody(ctx,plane,[[0,-7.9],[0.18,-7.75],[0.38,-7.45],[0.57,-6.9],[0.66,-5.7],[0.7,-3.5],[0.72,3.6],[0.69,5.6],[0.59,6.7],[0.43,7.35],[0.23,7.7],[0,7.82]],[0,3.45,0],0.94);
  // Two decks of dark cabin glazing with individually framed windows.
  for(const side of [-1,1]){
   for(let row=0;row<2;row++)for(let i=0;i<21;i++){
    const z=-5.75+i*0.56,y=3.37+row*0.3;
    mesh(ctx,plane,G.rbox(0.035,0.15,0.24,0.025),[side*0.69,y,z],0.12);
   }
   box(ctx,plane,[0.06,0.3,0.055],[side*0.69,3.38,6.8],0.12,0.02);
   box(ctx,plane,[0.06,0.3,0.055],[side*0.69,3.38,-6.95],0.12,0.02);
   // Thin body stripe and emergency exit outlines add airline scale.
   box(ctx,plane,[0.018,0.065,12.4],[side*0.714,2.92,-0.2],0.54,0.008);
   for(const z of [-2.0,1.5])box(ctx,plane,[0.025,0.4,0.34],[side*0.72,3.48,z],0.83,0.035);
  }
  // Distinct wide swept wings and hinged high-lift flap panels.
  planform(ctx,plane,[[-0.62,2.2],[-3.0,1.45],[-8.55,-3.15],[-9.25,-3.72],[-9.0,-4.08],[-3.28,-1.28],[-0.62,-1.82],[0.62,-1.82],[3.28,-1.28],[9.0,-4.08],[9.25,-3.72],[8.55,-3.15],[3.0,1.45],[0.62,2.2]],2.75,0.78,0.22);
  for(const side of [-1,1]){
   for(let i=0;i<3;i++){
    const x=side*(2.5+i*1.65),z=-0.15-i*0.3;
    box(ctx,plane,[0.42,0.19,2.15],[x,2.25,z],0.55,0.14);
   }
   // Four nacelles, two per wing, with dark front intakes and visible spinner fans.
   for(const x0 of [2.25,5.25]){
    const e=group(plane);e.position.set(side*x0,1.98,0.25-(x0-2.25)*0.18);
    axialBody(ctx,e,[[0,-1.36],[0.3,-1.3],[0.44,-1.03],[0.46,0.92],[0.38,1.22],[0.27,1.35],[0,1.35]],[0,0,0],0.88);
    cyl(ctx,e,0.365,0.09,[0,0,1.29],[90,0,0],0.12,40);
    torus(ctx,e,0.38,0.045,[0,0,1.34],[90,0,0],0.98);
    const fan=group(e);fan.position.z=1.24;
    cyl(ctx,fan,0.095,0.12,[0,0,0],[90,0,0],0.78,20);
    for(let i=0;i<9;i++){const blade=box(ctx,fan,[0.1,0.034,0.31],[0,0.18,0],0.62,0.018);blade.rotation.z=deg(i*40);}
    box(ctx,e,[0.36,0.16,2.1],[0,-0.53,-0.12],0.62,0.1);
    (plane.userData.fans??=[]).push(fan);
   }
   // Wingtip sharklets and strobes.
   finProfile(ctx,plane,[[ -4.2,2.72],[-3.4,2.72],[-3.3,3.55],[-3.75,3.78],[-4.0,3.7]],0.12,side*8.98,0.9);
   lamp(ctx,plane,[side*9.1,2.8,-3.8],0.08,'fly');
   // Main landing gear strut with paired tyres.
   bar(ctx,plane,[side*2.15,2.58,-1.38],[side*2.15,0.5,-1.38],0.075,0.66);
   for(const z of [-1.52,-1.23])wheel(ctx,plane,[side*2.15,0.42,z],0.37,10);
  }
  planform(ctx,plane,[[-0.6,-5.45],[-3.2,-6.95],[-3.3,-7.4],[-0.62,-6.85],[0.62,-6.85],[3.3,-7.4],[3.2,-6.95],[0.6,-5.45]],3.2,0.79,0.16);
  finProfile(ctx,plane,[[-6.4,3.2],[-7.72,3.35],[-7.35,6.18],[-6.9,6.58],[-6.62,6.47]],0.22,0,0.92);
  box(ctx,plane,[0.18,0.46,1.0],[0,4.05,7.0],0.12,0.06).rotation.x=deg(-22);
  // Four wheel nose gear and open cockpit glass band.
  bar(ctx,plane,[0,3.05,6.92],[0,0.45,7.0],0.07,0.7);
  for(const x of [-0.16,0.16])wheel(ctx,plane,[x,0.34,7.02],0.28,10);
  box(ctx,plane,[0.5,0.32,0.045],[0,3.83,7.2],0.1,0.04).rotation.x=deg(-15);
  const fans=plane.userData.fans as THREE.Group[];
  return {root,grounded:false,update(c,t){const f=clamp(c.fly??0);plane.rotation.z=Math.sin(t*0.6)*f*0.035;plane.rotation.x=Math.sin(t*0.45+1)*f*0.012;plane.position.y=Math.sin(t*0.8)*f*0.12;for(const fan of fans)fan.rotation.z=t*lerp(2,26,f);}};
 },
});

export const hotAirBalloon=defineModel({
 id:'hot-air-balloon',aliases:['balloon','air-balloon','montgolfier'],
 describe:'A striped hot-air balloon with a pear-shaped fabric envelope, stitched gores, open burner throat, hanging ropes, wicker basket and glowing burner. `heat` inflates the envelope and flame.',
 controls:{heat:'0 cold .. 1 burner lit and envelope full (default 0.65)',glow:'burner glow (default 1)'},defaults:{heat:0.65,glow:1},size:'18 m tall display balloon',
 build(ctx){
  const root=new THREE.Group(),env=group(root);env.position.y=2.6;
  const prof:[number,number][]=[[0,0],[0.42,0.05],[0.72,0.28],[0.91,0.72],[0.98,1.35],[0.91,2.05],[0.7,2.65],[0.42,3.08],[0.16,3.28],[0,3.3]];
  mesh(ctx,env,G.lathe(prof,56),[0,0,0],0.87);
  // Panel seams run from the crown down to the mouth.
  for(let i=0;i<12;i++){
   const a=i*Math.PI/6;
   const pts:V3[]=[];for(let j=0;j<=12;j++){const u=j/12,y=0.05+u*3.18,r=0.42+0.56*Math.sin(u*Math.PI*0.88);pts.push([Math.cos(a)*r,y,Math.sin(a)*r]);}
   for(let j=1;j<pts.length;j++)bar(ctx,env,pts[j-1]!,pts[j]!,0.009,i%2?0.55:0.98);
  }
  torus(ctx,env,0.43,0.05,[0,0.06,0],[0,0,0],0.52);
  const basket=box(ctx,root,[0.66,0.62,0.66],[0,-0.52,0],0.65,0.09);
  for(let y=-0.72;y<-0.2;y+=0.14)for(const side of [-1,1])box(ctx,root,[0.7,0.025,0.025],[0,y,side*0.34],0.92,0.008);
  for(const x of [-0.29,0.29])for(const z of [-0.29,0.29])bar(ctx,root,[x,0.02,z],[x*0.6,2.61,z*0.6],0.018,0.9);
  const flame=mesh(ctx,root,G.cone(0.22,0.44,20),[0,0.04,0],1);
  const burner=group(root);burner.position.y=0.02;cyl(ctx,burner,0.16,0.06,[0,0,0],[0,0,0],0.7,24);
  void basket;
  return {root,grounded:false,update(c,t){const h=clamp(c.heat??0.65);env.scale.set(lerp(0.85,1,h),lerp(0.75,1,h),lerp(0.85,1,h));const f=0.75+0.2*Math.sin(t*21);flame.visible=h>0.02;flame.scale.y=Math.max(0.01,h*f);(flame.material as THREE.MeshStandardMaterial).emissiveIntensity=(c.glow??1)*h;root.position.y=Math.sin(t*0.55)*0.04;}};
 },
});

export const blimp=defineModel({
 id:'blimp',aliases:['airship','dirigible','zeppelin'],
 describe:'A classic rigid airship with elongated ribbed envelope, pointed nose, tail fins, hanging gondola, mooring ropes and spinning pusher propellers. `thrust` spins the propellers and moves the gondola gently.',
 controls:{thrust:'0 idle .. 1 propellers turning (default 0)'},defaults:{thrust:0},size:'50 m display airship',
 build(ctx){
  const root=new THREE.Group();
  mesh(ctx,root,G.ellipsoid(1.15,1.05,4.1,48,32),[0,3.2,0],0.86);
  // Longitudinal seams and periodic circumferential frame bands.
  for(let i=0;i<16;i++){
   const a=i*Math.PI/8;
   bar(ctx,root,[Math.cos(a)*0.24,3.2+Math.sin(a)*0.24,-3.92],[Math.cos(a)*0.24,3.2+Math.sin(a)*0.24,3.92],0.009,0.65);
  }
  for(let i=0;i<9;i++){
   const z=-3.5+i*0.88,t=Math.sqrt(Math.max(0.08,1-(z/4.1)**2));
   torus(ctx,root,1.1*t,0.018,[0,3.2,z],[90,0,0],0.63);
  }
  planform(ctx,root,[[-0.3,-3.2],[-1.8,-4.0],[-1.95,-4.38],[0,-4.14],[1.95,-4.38],[1.8,-4.0],[0.3,-3.2]],3.16,0.78,0.11);
  finProfile(ctx,root,[[-4.02,3.15],[-3.08,3.15],[-3.68,4.45],[-4.17,4.28]],0.12,0,0.85);
  // Gondola with windows, handrails and four suspension cables.
  box(ctx,root,[0.72,0.43,2.0],[0,1.12,-0.25],0.7,0.08);
  for(const side of [-1,1]){
   for(let i=0;i<4;i++)box(ctx,root,[0.025,0.2,0.34],[side*0.37,1.19,-0.9+i*0.45],0.13,0.035);
   bar(ctx,root,[side*0.38,0.9,-1.15],[side*0.38,1.43,0.68],0.025,0.92);
  }
  for(const x of [-0.32,0.32])for(const z of [-0.92,0.54])bar(ctx,root,[x,1.34,z],[x*1.6,2.35,z*1.6],0.018,0.85);
  const fans:THREE.Group[]=[];
  for(const side of [-1,1]){
   const nac=group(root);nac.position.set(side*1.24,1.75,-0.05);
   axialBody(ctx,nac,[[0,-0.44],[0.2,-0.38],[0.24,0.25],[0.18,0.42],[0,0.45]],[0,0,0],0.72);
   const f=group(nac);f.position.z=0.43;fans.push(f);
   for(let i=0;i<4;i++){const b=box(ctx,f,[0.07,0.5,0.035],[0,0.24,0],0.9,0.02);b.rotation.z=deg(i*90);}
   cyl(ctx,f,0.08,0.1,[0,0,0],[90,0,0],0.95,16);
  }
  return {root,grounded:false,update(c,t){const f=clamp(c.thrust??0);for(const g of fans)g.rotation.z=t*lerp(1,20,f);root.position.z=Math.sin(t*0.5)*0.05*f;root.rotation.y=Math.sin(t*0.4)*0.01*f;}};
 },
});

// ---------------------------------------------------------------- personal transport and horse carriage
export const skateboard=defineModel({
 id:'skateboard',aliases:['skate-board','longboard','deck'],
 describe:'A low concave skateboard deck with raised nose and tail, grip surface, contrasting truck hangers, four polyurethane wheels and exposed axles. `roll` spins the wheels and rocks the deck.',
 controls:{roll:'0 parked .. 1 rolling (default 0)'},defaults:{roll:0},size:'0.8 m long',
 build(ctx){
  const root=new THREE.Group();
  const deck=G.rbox(0.25,0.055,0.82,0.055);const d=mesh(ctx,root,deck,[0,0.47,0],0.86);d.rotation.x=deg(-1);
  box(ctx,root,[0.21,0.012,0.57],[0,0.505,0],0.23,0.04);
  // Eight raised grip dots at each end, nose/tail kick and layered ply rim.
  for(const z of [-0.31,-0.23,0.23,0.31])for(const x of [-0.075,0.075])mesh(ctx,root,G.sphere(0.012,8,6),[x,0.517,z],0.72);
  for(const z of [-0.24,0.24]){
   bar(ctx,root,[-0.11,0.4,z],[0.11,0.4,z],0.035,0.92);
   bar(ctx,root,[0,0.38,z],[0,0.26,z],0.035,0.68);
  }
  const ws:THREE.Group[]=[];
  for(const z of [-0.26,0.26])for(const side of [-1,1]){
   const w=wheel(ctx,root,[side*0.17,0.19,z],0.13,6);ws.push(w);
  }
  box(ctx,root,[0.2,0.12,0.08],[0,0.32,-0.26],0.7,0.025);box(ctx,root,[0.2,0.12,0.08],[0,0.32,0.26],0.7,0.025);
  return {root,grounded:true,update(c,t){const k=clamp(c.roll??0);wheelTrackUpdate(ws,c,t,15);root.rotation.z=Math.sin(t*2)*k*0.03;}};
 },
});

export const horseDrawnCarriage=defineModel({
 id:'horse-drawn-carriage',aliases:['carriage','horse-carriage','coach-and-horse'],
 describe:'A harnessed horse pulling a two-wheel carriage: barrel body, neck, head, ears, mane, tail, four articulated legs, leather traces, passenger box, bench seat, shafts and spoked wheels. `walk` cycles the horse’s legs and wheel rotation.',
 controls:{walk:'0 standing .. 1 walking cycle (default 0)'},defaults:{walk:0},size:'3.8 m long',
 build(ctx){
  const root=new THREE.Group(),horse=group(root),legs:THREE.Group[]=[],ws:THREE.Group[]=[];
  // Horse body lies ahead of the carriage, facing +z.
  mesh(ctx,horse,G.ellipsoid(0.47,0.52,0.91,32,20),[0,1.23,1.05],0.69);
  const neck=mesh(ctx,horse,G.ellipsoid(0.3,0.69,0.39,28,18),[0,1.64,1.7],0.78);neck.rotation.x=deg(22);
  const head=mesh(ctx,horse,G.ellipsoid(0.25,0.35,0.36,24,16),[0,2.18,1.97],0.8);head.rotation.x=deg(-16);
  mesh(ctx,horse,G.ellipsoid(0.2,0.16,0.31,20,12),[0,2.0,2.21],0.62);
  for(const side of [-1,1]){
   mesh(ctx,horse,G.ellipsoid(0.055,0.085,0.07,12,8),[side*0.19,2.31,1.99],0.96);
   const ear=mesh(ctx,horse,G.cone(0.075,0.29,12),[side*0.14,2.55,1.87],0.78);ear.rotation.z=deg(side*-14);
   mesh(ctx,horse,G.sphere(0.035,10,8),[side*0.21,2.19,2.03],0.12);
   // Harness collar, cheek strap, and reins.
   torus(ctx,horse,0.34,0.045,[side*0.02,1.65,1.56],[90,0,0],0.53);
   bar(ctx,horse,[side*0.21,2.18,1.96],[side*0.34,1.68,1.53],0.018,0.94);
   bar(ctx,horse,[side*0.2,2.0,1.9],[side*0.2,1.34,-0.25],0.014,0.52);
  }
  // Mane and forelock; tail curves away from the cart.
  for(let i=0;i<7;i++)mesh(ctx,horse,G.cone(0.06,0.46,10),[0,1.82+i*0.09,1.48+i*0.06],0.38);
  mesh(ctx,horse,G.tube([[0,1.42,0.31],[0,1.24,-0.04],[0.04,0.88,-0.24],[0.08,0.63,-0.35]],0.065,16,8),[0,0,0],0.85);
  // Four legs with joints and dark hooves. Pair groups swing in opposite phase.
  for(const side of [-1,1])for(const z of [0.56,1.47]){
   const leg=group(horse);leg.position.set(side*0.29,1.05,z);legs.push(leg);
   bar(ctx,leg,[0,0,0],[0,-0.56,0.05],0.085,0.7);
   mesh(ctx,leg,G.sphere(0.105,12,8),[0,-0.57,0.05],0.78);
   bar(ctx,leg,[0,-0.58,0.05],[0,-0.95,0.12],0.045,0.83);
   box(ctx,leg,[0.15,0.15,0.19],[0,-1.0,0.14],0.28,0.035);
  }
  // Passenger carriage: covered box, curved roof, step, seat and two large wheels.
  const cart=group(root);cart.position.set(0,0,-1.65);
  box(ctx,cart,[1.52,1.0,1.72],[0,1.25,0],0.79,0.16);
  box(ctx,cart,[1.5,0.11,1.85],[0,1.78,0],0.95,0.05);
  box(ctx,cart,[0.06,0.78,0.08],[0.73,1.24,0.4],0.14,0.025);
  box(ctx,cart,[0.06,0.78,0.08],[-0.73,1.24,0.4],0.14,0.025);
  for(const side of [-1,1]){
   const w=wheel(ctx,cart,[side*0.93,0.69,-0.25],0.65,16);ws.push(w);
   bar(ctx,cart,[side*0.8,0.45,-1.2],[side*0.48,0.53,1.12],0.05,0.76);
   // Carriage door and small coach lamp.
   box(ctx,cart,[0.035,0.62,0.76],[side*0.77,1.23,0.03],0.63,0.06);
   mesh(ctx,cart,G.sphere(0.08,12,8),[side*0.8,1.63,0.71],1);
   // Shafts pass along the horse’s flanks and connect to its harness.
   bar(ctx,root,[side*0.45,0.84,-0.7],[side*0.45,0.88,1.36],0.055,0.73);
   bar(ctx,root,[side*0.45,0.88,1.36],[side*0.25,1.34,1.6],0.04,0.72);
  }
  box(ctx,cart,[0.82,0.16,0.65],[0,1.42,-0.4],0.93,0.07);
  return {root,grounded:true,update(c,t){const k=clamp(c.walk??0),phase=t*5;legs.forEach((l,i)=>{l.rotation.x=Math.sin(phase+(i===0||i===3?0:Math.PI))*0.42*k;});wheelTrackUpdate(ws,c,t,4);head.rotation.x=deg(-16)+Math.sin(t*2)*0.025;}};
 },
});

export const spaceShuttle=defineModel({
 id:'space-shuttle',aliases:['shuttle-orbiter','spaceplane','orbiter'],
 describe:'A space shuttle orbiter with a black-tiled belly, broad delta wings, cockpit windows, payload-bay doors, vertical tail, three main engines and two solid rocket boosters. `launch` extends the exhaust plumes.',
 controls:{launch:'0 coast .. 1 rising thrust and exhaust (default 0)'},defaults:{launch:0},size:'38 m display shuttle',
 build(ctx){
  const root=new THREE.Group(),craft=group(root);
  axialBody(ctx,craft,[[0,-5.8],[0.3,-5.7],[0.55,-5.3],[0.67,-4.4],[0.7,1.2],[0.62,3.4],[0.42,4.5],[0.2,5.2],[0,5.35]],[0,2.05,0],0.88);
  // Delta wing and tail are characteristic in silhouette.
  planform(ctx,craft,[[-0.5,2.25],[-2.2,1.4],[-5.4,-3.15],[-5.25,-3.65],[-1.3,-2.25],[0.5,-1.6],[1.3,-2.25],[5.25,-3.65],[5.4,-3.15],[2.2,1.4],[0.5,2.25]],1.9,0.8,0.2);
  finProfile(ctx,craft,[[-5.2,1.9],[-3.75,1.95],[-4.05,4.56],[-4.45,4.8],[-4.76,4.68]],0.3,0,0.85);
  box(ctx,craft,[0.94,0.05,7.3],[0,1.49,-0.38],0.22,0.08);
  // Payload-bay door seams and nose cockpit windows.
  for(const side of [-1,1]){
   box(ctx,craft,[0.025,0.045,5.4],[side*0.51,2.73,-0.35],0.57,0.01);
   for(let i=0;i<4;i++)box(ctx,craft,[0.018,0.08,0.035],[side*0.51,2.73,-2.6+i*1.48],0.72,0.008);
   mesh(ctx,craft,G.rbox(0.25,0.24,0.04,0.05),[side*0.34,2.49,4.22],0.12,[18,side*16,0]);
   // Main wheel pods and rear engine bells.
   box(ctx,craft,[0.42,0.3,0.85],[side*1.35,1.42,-1.9],0.62,0.1);
   wheel(ctx,craft,[side*1.34,0.74,-1.9],0.34,10);
   const bell=axialBody(ctx,craft,[[0.24,-0.28],[0.31,-0.22],[0.34,0.1],[0.25,0.33],[0,0.36]],[side*0.28,1.72,-5.53],0.45);
   void bell;
  }
  const boosters:THREE.Group[]=[];
  for(const side of [-1,1]){
   const b=group(craft);b.position.set(side*1.08,1.68,-0.5);boosters.push(b);
   axialBody(ctx,b,[[0,-4.95],[0.33,-4.8],[0.43,-4.35],[0.43,3.9],[0.36,4.35],[0.17,4.8],[0,4.85]],[0,0,0],0.86);
   for(const z of [-3.6,-2.2,-0.8,0.8,2.3,3.65])torus(ctx,b,0.43,0.025,[0,0,z],[90,0,0],0.55);
  }
  const flames:THREE.Mesh[]=[];
  for(let i=0;i<5;i++){
   const m=ctx.mesh(G.cone(0.18+i*0.035,1.8+i*0.2,20),{tone:1,glow:2.8,glowControl:'launch'});m.position.set(i<3?(i-1)*0.28:(i===3?-1.08:1.08),1.7,-6.55);m.rotation.x=deg(-90);craft.add(m);flames.push(m);
  }
  return {root,grounded:false,update(c,t){const k=clamp(c.launch??0);craft.position.y=0.24*k+Math.sin(t*1.1)*0.03*k;craft.rotation.z=Math.sin(t*0.45)*0.02*k;for(const f of flames){f.visible=k>0.01;f.scale.z=Math.max(0.001,k*(1+0.12*Math.sin(t*31)));}for(const b of boosters)b.rotation.z=Math.sin(t*2)*0.003*k;}};
 },
});

// ---------------------------------------------------------------- roadside objects, terminals and anchors
export const trafficLight=defineModel({
 id:'traffic-light',aliases:['signal-light','stoplight','traffic-signal'],
 describe:'A three-aspect traffic signal with hooded red, amber and green lenses, a rear housing, pole, curved mast arm and weighted base. `cycle` sets the signal cycling speed.',
 controls:{cycle:'0 pause on red .. 1 normal traffic cycle (default 0.6)'},defaults:{cycle:0.6},size:'4.5 m high',
 build(ctx){
  const root=new THREE.Group();
  box(ctx,root,[0.4,0.22,0.32],[0,1.06,0],0.42,0.07);
  box(ctx,root,[0.38,1.28,0.29],[0,1.0,0.01],0.8,0.1);
  const lenses:THREE.Mesh[]=[];
  for(let i=0;i<3;i++){
   const y=1.45-i*0.43;
   const hood=mesh(ctx,root,G.rbox(0.32,0.12,0.24,0.04),[0,y+0.12,0.14],0.54);hood.rotation.x=deg(-12);
   const lens=ctx.mesh(G.sphere(0.12,20,14),{tone:1,glow:2.2,glowControl:'cycle'});lens.position.set(0,y,0.17);root.add(lens);lenses.push(lens);
   torus(ctx,root,0.125,0.018,[0,y,0.18],[0,0,0],0.95);
   box(ctx,root,[0.025,0.055,0.025],[0,y-0.16,0.17],0.88,0.008);
  }
  cyl(ctx,root,0.14,0.19,[0,0.1,0],[0,0,0],0.55,24);
  cyl(ctx,root,0.065,2.8,[0,1.6,0],[0,0,0],0.84,24);
  box(ctx,root,[0.52,0.11,0.46],[0,0.05,0],0.55,0.04);
  bar(ctx,root,[0,2.7,0],[0,3.42,0],0.055,0.82);
  bar(ctx,root,[0,3.42,0],[1.35,3.42,0],0.055,0.82);
  bar(ctx,root,[1.35,3.42,0],[1.35,1.63,0],0.045,0.82);
  box(ctx,root,[0.37,1.17,0.28],[1.35,1.62,0],0.82,0.08);
  const sideLamp=lamp(ctx,root,[1.35,2.04,0.17],0.13,'cycle',1);
  void sideLamp;
  return {root,grounded:true,update(c,t){const k=clamp(c.cycle??0.6),phase=((t*k)/6)%1,index=phase<0.55?0:phase<0.68?1:2;lenses.forEach((m,i)=>{m.visible=i===index;});}};
 },
});

export const roadSign=defineModel({
 id:'road-sign',aliases:['warning-sign','street-sign','traffic-sign'],
 describe:'A roadside warning sign with a thick triangular border, raised central exclamation mark, rear stiffener, mounting brackets and single galvanized post. `reflect` changes the face brightness.',
 controls:{reflect:'0 matte .. 1 reflective sign face (default 0.8)'},defaults:{reflect:0.8},size:'2.2 m tall',
 build(ctx){
  const root=new THREE.Group(),tri:Shape2=[[-0.56,-0.42],[0.56,-0.42],[0,0.57]];
  mesh(ctx,root,G.extrude(tri,0.09,0.055),[0,1.63,0],0.98);
  const inner:Shape2=[[-0.39,-0.31],[0.39,-0.31],[0,0.39]];
  const face=mesh(ctx,root,G.extrude(inner,0.025,0.018),[0,1.63,0.065],0.27);
  // A raised exclamation point is legible even without typography.
  cyl(ctx,root,0.048,0.31,[0,1.69,0.088],[0,0,0],0.98,20);
  mesh(ctx,root,G.sphere(0.056,12,8),[0,1.47,0.09],0.98);
  box(ctx,root,[0.12,0.05,0.035],[0,2.03,-0.065],0.42,0.012);
  box(ctx,root,[0.12,0.05,0.035],[0,1.26,-0.065],0.42,0.012);
  cyl(ctx,root,0.052,1.22,[0,0.61,0],[0,0,0],0.7,20);
  box(ctx,root,[0.28,0.07,0.24],[0,0.035,0],0.55,0.025);
  for(const y of [1.3,1.96])box(ctx,root,[0.18,0.08,0.07],[0,y,-0.12],0.7,0.02);
  return {root,grounded:true,update(c){(face.material as THREE.MeshStandardMaterial).emissiveIntensity=clamp(c.reflect??0.8)*0.35;}};
 },
});

export const gasPump=defineModel({
 id:'gas-pump',aliases:['fuel-pump','petrol-pump','service-station-pump'],
 describe:'A forecourt fuel pump with rounded top canopy, digital price display, grade buttons, hose loop, pistol nozzle, holster and a broad protective plinth. `dispense` advances the meter and illuminates the display.',
 controls:{dispense:'0 idle .. 1 dispensing fuel (default 0)',glow:'display brightness (default 1)'},defaults:{dispense:0,glow:1},size:'1.8 m tall',
 build(ctx){
  const root=new THREE.Group();
  box(ctx,root,[0.78,1.42,0.52],[0,0.86,0],0.82,0.12);
  box(ctx,root,[0.84,0.2,0.58],[0,1.68,0],0.95,0.08);
  box(ctx,root,[0.9,0.14,0.68],[0,0.09,0],0.58,0.045);
  const display=ctx.mesh(G.rbox(0.54,0.36,0.055,0.035),{tone:0.15,glow:1.4,glowControl:'glow'});display.position.set(0,1.3,0.28);root.add(display);
  for(let row=0;row<2;row++)for(let i=0;i<4;i++)box(ctx,root,[0.075,0.055,0.035],[(-1.5+i)*0.12,0.93+row*0.13,0.285],0.95,0.015);
  for(let i=0;i<3;i++)box(ctx,root,[0.13,0.035,0.028],[0,1.05+i*0.09,0.32],i===1?0.96:0.57,0.008);
  // Thick hose loop and nozzle are mounted on the right flank.
  const hose=ctx.mesh(G.tube([[0.39,1.48,0.12],[0.62,1.43,0.12],[0.72,1.16,0.12],[0.7,0.58,0.12],[0.48,0.47,0.12],[0.39,0.83,0.12]],0.025,40,10),{tone:0.22});root.add(hose);
  box(ctx,root,[0.11,0.21,0.09],[0.39,0.84,0.23],0.64,0.025);
  bar(ctx,root,[0.43,0.92,0.22],[0.52,1.15,0.22],0.032,0.92);
  bar(ctx,root,[0.52,1.15,0.22],[0.6,1.26,0.22],0.02,0.95);
  cyl(ctx,root,0.03,0.14,[0.42,0.94,0.22],[0,0,25],0.98,12);
  const digits:THREE.Mesh[]=[];
  for(let i=0;i<7;i++){const m=box(ctx,root,[0.035,0.025,0.012],[(-3+i)*0.055,1.31,0.315],0.96,0.006);digits.push(m);}
  return {root,grounded:true,update(c,t){const d=clamp(c.dispense??0);digits.forEach((m,i)=>{m.visible=d>0.05?Math.sin(t*8+i*1.7)>-0.6:i<3;});(display.material as THREE.MeshStandardMaterial).emissiveIntensity=(c.glow??1)*(0.3+d);}};
 },
});

export const electricCarCharger=defineModel({
 id:'electric-car-charger',aliases:['ev-charger','charging-station','car-charger'],
 describe:'A public EV charging post with beveled upright case, status screen, charge-level lamps, tethered coiled cable, ergonomic connector and a steel foundation. `charge` fills the indicator and pulses the connector.',
 controls:{charge:'0 disconnected .. 1 charging (default 0.65)',glow:'indicator brightness (default 1)'},defaults:{charge:0.65,glow:1},size:'1.5 m tall',
 build(ctx){
  const root=new THREE.Group();
  box(ctx,root,[0.62,1.32,0.32],[0,0.82,0],0.84,0.13);
  box(ctx,root,[0.72,0.13,0.42],[0,0.11,0],0.56,0.04);
  const screen=ctx.mesh(G.rbox(0.43,0.36,0.04,0.03),{tone:0.14,glow:0.8,glowControl:'glow'});screen.position.set(0,1.18,0.18);root.add(screen);
  // Raised lightning mark and status bar.
  sideShape(ctx,root,[[0.14,0.68],[0.31,0.99],[0.22,0.99],[0.35,1.37],[0.1,1.07],[0.2,1.07]],0.035,0,0.96,0.008);
  const bars:THREE.Mesh[]=[];for(let i=0;i<5;i++)bars.push(mesh(ctx,root,G.sphere(0.035,12,8),[-0.24+i*0.12,0.54,0.18],0.9));
  const cord=ctx.mesh(G.tube([[0.29,1.0,0.03],[0.56,0.93,0.03],[0.64,0.62,0.03],[0.52,0.42,0.03],[0.69,0.23,0.03],[0.88,0.3,0.03],[0.91,0.68,0.03]],0.025,48,10),{tone:0.25});root.add(cord);
  const handle=group(root);handle.position.set(0.85,0.73,0.03);
  box(ctx,handle,[0.13,0.31,0.11],[0,0,0],0.76,0.035);
  box(ctx,handle,[0.16,0.07,0.15],[0,0.14,0],0.95,0.02);
  bar(ctx,handle,[0,0.05,0],[0,0.17,0.06],0.025,0.95);
  for(let i=0;i<5;i++)box(ctx,root,[0.5,0.018,0.025],[0,0.38+i*0.035,0.17],0.62,0.005);
  return {root,grounded:true,update(c,t){const q=clamp(c.charge??0.65);bars.forEach((m,i)=>{m.visible=q*5>i;m.scale.setScalar(0.65+0.35*Math.sin(t*5+i));});handle.rotation.z=Math.sin(t*2)*0.025*q;(screen.material as THREE.MeshStandardMaterial).emissiveIntensity=(c.glow??1)*(0.2+q*0.8);}};
 },
});

export const parkingMeter=defineModel({
 id:'parking-meter',aliases:['parking-pay-station','parking-ticket-meter','meter'],
 describe:'A curbside parking meter with a rounded head, angled digital display, coin slot, tariff buttons, key lock, ticket outlet and slim cast-metal post. `paid` advances the remaining-time display.',
 controls:{paid:'0 expired .. 1 maximum parking time (default 0.6)',glow:'display brightness (default 0.8)'},defaults:{paid:0.6,glow:0.8},size:'1.7 m tall',
 build(ctx){
  const root=new THREE.Group();
  box(ctx,root,[0.42,0.61,0.33],[0,1.34,0],0.78,0.11);
  box(ctx,root,[0.45,0.08,0.38],[0,1.66,0],0.95,0.04);
  box(ctx,root,[0.31,0.2,0.035],[0,1.45,0.18],0.13,0.025).rotation.x=deg(-8);
  const screen=ctx.mesh(G.rbox(0.26,0.15,0.025,0.025),{tone:0.12,glow:1,glowControl:'glow'});screen.position.set(0,1.47,0.205);root.add(screen);
  for(const x of [-0.12,0,0.12])mesh(ctx,root,G.sphere(0.032,10,8),[x,1.19,0.18],0.95);
  box(ctx,root,[0.1,0.018,0.025],[0,1.1,0.19],0.22,0.007);
  box(ctx,root,[0.17,0.1,0.04],[0,1.0,0.18],0.58,0.02);
  box(ctx,root,[0.16,0.09,0.035],[0,0.87,0.18],0.88,0.02);
  cyl(ctx,root,0.075,0.88,[0,0.43,0],[0,0,0],0.7,24);
  box(ctx,root,[0.32,0.08,0.28],[0,0.04,0],0.52,0.035);
  const digits=[] as THREE.Mesh[];for(let i=0;i<4;i++)digits.push(box(ctx,root,[0.03,0.055,0.01],[(-1.5+i)*0.055,1.47,0.225],0.95,0.006));
  return {root,grounded:true,update(c,t){const p=clamp(c.paid??0.6);digits.forEach((m,i)=>{m.visible=p>0.02&&i<Math.ceil(p*4);});(screen.material as THREE.MeshStandardMaterial).emissiveIntensity=(c.glow??0.8)*p;}};
 },
});

export const airportControlTower=defineModel({
 id:'airport-control-tower',aliases:['air-traffic-control-tower','atc-tower','control-tower'],
 describe:'An airport control tower with a tapered concrete shaft, maintenance balcony, faceted dark-glass control cab, wraparound mullions, radar antenna, aerials and rooftop beacon. `beacon` pulses the warning lamp.',
 controls:{beacon:'0 off .. 1 flashing beacon (default 0.7)'},defaults:{beacon:0.7},size:'24 m display tower',
 build(ctx){
  const root=new THREE.Group();
  mesh(ctx,root,G.cyl(0.58,0.92,6.15,12),[0,3.08,0],0.72);
  box(ctx,root,[1.72,0.2,1.55],[0,5.95,0],0.85,0.08);
  // Octagonal air-traffic cab and continuous dark glazing band.
  const n=8,outline:Shape2=[];for(let i=0;i<n;i++){const a=Math.PI/8+i*Math.PI*2/n;outline.push([Math.cos(a)*1.16,Math.sin(a)*0.67]);}
  const cab=mesh(ctx,root,G.extrude(outline,1.4,0.055),[0,6.8,0],0.86);
  void cab;
  const glass:Shape2=[];for(let i=0;i<n;i++){const a=Math.PI/8+i*Math.PI*2/n;glass.push([Math.cos(a)*1.02,Math.sin(a)*0.52]);}
  mesh(ctx,root,G.extrude(glass,1.42,0.015),[0,6.8,0.04],0.14);
  for(let i=0;i<n;i++){
   const a=Math.PI/8+i*Math.PI*2/n,x=Math.cos(a)*1.13,y=Math.sin(a)*0.65;
   bar(ctx,root,[x,6.25,y],[x,7.32,y],0.025,0.96);
  }
  box(ctx,root,[2.55,0.12,2.48],[0,7.38,0],0.63,0.05);
  // Radar dish on a cross-braced rooftop frame.
  for(const x of [-0.36,0.36])bar(ctx,root,[x,7.48,-0.3],[0,8.12,-0.3],0.028,0.8);
  const dish=mesh(ctx,root,G.sphere(0.54,24,16),[0,8.2,-0.3],0.9,[0,0,0]);dish.scale.set(0.16,0.53,0.54);
  bar(ctx,root,[0,7.68,-0.3],[0,8.25,-0.3],0.04,0.75);
  for(const x of [-0.68,0.68])bar(ctx,root,[x,7.43,0],[x,8.04,0],0.018,0.88);
  const beacon=lamp(ctx,root,[0,7.55,0],0.12,'beacon',1);
  return {root,grounded:true,update(c,t){const b=clamp(c.beacon??0.7);beacon.visible=b>0.01&&Math.sin(t*5)>0;root.rotation.y=Math.sin(t*0.15)*0.005;}};
 },
});

export const anchor=defineModel({
 id:'anchor',aliases:['ship-anchor','boat-anchor','stockless-anchor'],
 describe:'A heavy Admiralty-style ship anchor with a circular ring, straight shank, cross-stock, broad curved arms, pointed flukes and welded collars. `heave` raises the anchor from the seabed.',
 controls:{heave:'0 resting .. 1 raised and swinging (default 0)'},defaults:{heave:0},size:'2.4 m anchor',
 build(ctx){
  const root=new THREE.Group();
  // Ring crown and forged shank.
  torus(ctx,root,0.22,0.055,[0,2.04,0],[90,0,0],0.88);
  cyl(ctx,root,0.105,0.14,[0,1.75,0],[90,0,0],0.92,24);
  bar(ctx,root,[0,1.66,0],[0,-0.62,0],0.11,0.75);
  torus(ctx,root,0.12,0.045,[0,0.72,0],[90,0,0],0.98);
  // Cross-stock passes through the shank near the crown.
  bar(ctx,root,[-0.76,1.53,0],[0.76,1.53,0],0.1,0.94);
  for(const x of [-0.66,0.66])torus(ctx,root,0.09,0.03,[x,1.53,0],[90,0,0],0.58);
  // Curving arms sweep out from the crown and terminate in heavy pointed palms.
  for(const side of [-1,1]){
   const pts:V3[]=[[0,0.02,0],[side*0.33,-0.12,0],[side*0.62,-0.38,0],[side*0.78,-0.77,0],[side*0.92,-1.0,0]];
   for(let i=1;i<pts.length;i++)bar(ctx,root,pts[i-1]!,pts[i]!,0.12-i*0.012,0.82);
   const fluke:Shape2=side>0?[[0.72,-0.66],[1.16,-1.12],[0.85,-1.07],[0.92,-0.85]]:[[-0.72,-0.66],[-1.16,-1.12],[-0.85,-1.07],[-0.92,-0.85]];
   sideShape(ctx,root,fluke,0.2,0,0.96,0.035);
   bar(ctx,root,[side*0.7,-0.65,0],[side*0.93,-1.02,0],0.04,0.98);
  }
  // Raised welded boss at the shank/arm junction.
  cyl(ctx,root,0.16,0.13,[0,-0.02,0],[90,0,0],0.55,24);
  return {root,grounded:true,update(c,t){const h=clamp(c.heave??0);root.position.y=h*0.65;root.rotation.z=Math.sin(t*1.2)*0.08*h;root.rotation.x=Math.cos(t*0.9)*0.04*h;}};
 },
});
