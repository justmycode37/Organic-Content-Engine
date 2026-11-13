// Architectural forms, civic places and landscapes for ACRYLLEX.
import * as THREE from 'three';
import {G,at,deg,lerp,clamp,roughen} from '../kit.ts';
import {defineModel,type ModelCtx} from './types.ts';

type V3=[number,number,number];
type Rot=[number,number,number];
const mat=(m:THREE.Mesh)=>m.material as THREE.MeshStandardMaterial;
const addBox=(ctx:ModelCtx,p:THREE.Object3D,w:number,h:number,d:number,pos:V3,tone=0.8,r=0.025,rot:Rot=[0,0,0])=>{
 const b=Math.max(0,Math.min(r,w*0.22,h*0.22,d*0.22));const m=ctx.mesh(b>0?G.rbox(w,h,d,b):G.box(w,h,d),{tone});m.position.set(...pos);m.rotation.set(deg(rot[0]),deg(rot[1]),deg(rot[2]));p.add(m);return m;
};
const addCyl=(ctx:ModelCtx,p:THREE.Object3D,r:number,h:number,pos:V3,tone=0.8,seg=32,top=r)=>{const m=ctx.mesh(G.cyl(top,r,h,seg),{tone});m.position.set(...pos);p.add(m);return m;};
/** Cylindrical beam between endpoints. */
const rodGeo=(a:V3,b:V3,r:number,seg=10)=>{
 const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),d=B.clone().sub(A),len=Math.max(1e-5,d.length());
 const g=G.cyl(r,r,len,seg);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()));g.translate((A.x+B.x)/2,(A.y+B.y)/2,(A.z+B.z)/2);return g;
};
const addRod=(ctx:ModelCtx,p:THREE.Object3D,a:V3,b:V3,r:number,tone=0.8,seg=10)=>{const m=ctx.mesh(rodGeo(a,b,r,seg),{tone});p.add(m);return m;};
const addWindow=(ctx:ModelCtx,parent:THREE.Object3D,pos:V3,w:number,h:number,rotation=0,glow=0)=>{
 const g=new THREE.Group();g.position.set(...pos);g.rotation.y=deg(rotation);parent.add(g);
 addBox(ctx,g,w+0.12,h+0.12,0.12,[0,0,0],0.96,0.018);
 addBox(ctx,g,w,h,0.045,[0,0,0.07],0.19,0.008);
 addBox(ctx,g,0.035,h,0.04,[0,0,0.105],0.82,0.006);
 addBox(ctx,g,w,0.035,0.04,[0,0,0.105],0.82,0.006);
 addBox(ctx,g,w+0.24,0.07,0.2,[0,-h/2-0.09,0.02],0.9,0.012);
 if(glow) {const pane=ctx.mesh(at(G.box(w*0.82,h*0.82,0.008),[0,0,0.098]),{tone:0.45,glow,glowControl:'lights'});g.add(pane);}
 return g;
};
const addColumn=(ctx:ModelCtx,p:THREE.Object3D,x:number,z:number,h:number,r:number=0.24,flutes=8,tone=0.87)=>{
 const prof:[number,number][]=[[0,0],[r*1.34,0],[r*1.42,0.055],[r*1.24,0.12],[r*1.12,0.16],[r,h-0.17],[r*1.12,h-0.12],[r*1.42,h-0.055],[r*1.34,h],[0,h]];
 const c=ctx.mesh(at(G.lathe(prof,32),[x,0,z]),{tone});p.add(c);
 addCyl(ctx,p,r*1.45,0.055,[x,0.028,z],0.62,32,r*1.45);addCyl(ctx,p,r*1.45,0.055,[x,h-0.028,z],0.98,32,r*1.45);
 const ribs:THREE.BufferGeometry[]=[];for(let i=0;i<flutes;i++){const a=i/flutes*Math.PI*2;ribs.push(at(G.cyl(0.009,0.009,h-0.3,8),[x+Math.cos(a)*r*0.99,h/2,z+Math.sin(a)*r*0.99]));}
 if(ribs.length)p.add(ctx.mesh(G.merge(ribs),{tone:0.54}));return c;
};
const addArchBlocks=(ctx:ModelCtx,p:THREE.Object3D,radius:number,spring:number,z:number,depth:number,tone=0.82,n=14,thickness=0.48)=>{
 for(let i=0;i<n;i++){
  const a=Math.PI-(i+0.5)*Math.PI/n,step=Math.PI*radius/n*1.02;
  addBox(ctx,p,step,thickness,depth,[Math.cos(a)*radius,spring+Math.sin(a)*radius,z],tone,0.025,[0,0,(a-Math.PI/2)*180/Math.PI]);
 }
};
const addGableRoof=(ctx:ModelCtx,p:THREE.Object3D,w:number,d:number,eave:number,ridge:number,over=0.32,tone=0.88)=>{
 const pitch=Math.atan2(ridge-eave,w/2),slope=Math.hypot(w/2,ridge-eave)+over;
 for(const s of [-1,1])addBox(ctx,p,slope,0.16,d+over*2,[s*slope/2*Math.cos(pitch),ridge-s*slope/2*Math.sin(pitch),0],tone,0.025,[0,0,s*-pitch*180/Math.PI]);
 addCyl(ctx,p,0.09,d+over*2,[0,ridge+0.02,0],1,16,0.09);
};
const grid=(nx:number,nz:number,x0:number,x1:number,z0:number,z1:number,fn:(x:number,z:number,u:number,v:number)=>number)=>{
 const p=new Float32Array((nx+1)*(nz+1)*3),idx:number[]=[];let q=0;
 for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){const u=i/nx,v=j/nz,x=lerp(x0,x1,u),z=lerp(z0,z1,v);p[q++]=x;p[q++]=fn(x,z,u,v);p[q++]=z;}
 for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i,b=a+1,c=a+nx+1,d=c+1;idx.push(a,c,b,b,c,d);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(p,3));g.setIndex(idx);g.computeVertexNormals();g.computeBoundingSphere();return {geometry:g,base:p,nx,nz};
};

// ================================================================= interiors and streets
export const roomInterior=defineModel({
 id:'room-interior',aliases:['interior-room','room-scene','empty-room'],
 describe:'A furnished room corner with floorboards, two plaster walls, a tall mullioned window, skirting and a paneled door. `lights` brightens the window.',
 controls:{lights:'0 dark window .. 1 warmly lit (default 0.25)'},defaults:{lights:0.25},size:'4.8 m room corner',
 build(ctx){
  const root=new THREE.Group();
  addBox(ctx,root,5,0.2,4.5,[0,0,0],0.62,0.035);
  addBox(ctx,root,5,3.3,0.18,[0,1.65,-2.16],0.77,0.025);
  addBox(ctx,root,0.18,3.3,4.5,[-2.41,1.65,0],0.74,0.025);
  // Wall moulding and individually visible floor planks.
  for(let y of [0.16,0.23])addBox(ctx,root,5,0.045,0.07,[0,y,-2.04],0.96,0.012);
  for(let x=-2.2;x<2.4;x+=0.42)addBox(ctx,root,0.018,0.012,4.35,[x,0.105,0],0.38,0.002);
  for(let z=-1.85;z<2;z+=0.78)addBox(ctx,root,4.85,0.012,0.018,[0,0.105,z],0.47,0.002);
  addWindow(ctx,root,[-0.6,1.95,-2.045],1.4,1.65,0,0.9);
  for(const y of [1.25,1.9,2.55])addBox(ctx,root,1.33,0.025,0.07,[-0.6,y,-1.99],0.9,0.006);
  addBox(ctx,root,0.06,2.25,0.12,[1.45,1.18,-2.04],0.98,0.012);
  addBox(ctx,root,0.94,2.08,0.07,[1.45,1.15,-1.98],0.52,0.025);
  addBox(ctx,root,0.035,2,0.025,[1.45,1.15,-1.925],0.95,0.004);
  addCyl(ctx,root,0.045,0.045,[1.8,1.15,-1.91],0.95,16,0.045);
  addBox(ctx,root,5,0.035,0.035,[0,0.22,-2.03],0.9,0.006);
  return {root,grounded:true,update(c){root.traverse(o=>{if(o instanceof THREE.Mesh&&o.material instanceof THREE.MeshStandardMaterial&&o.material.emissiveIntensity>0)o.material.emissiveIntensity=(o.material.userData.glow as number||0)*clamp(c.lights??0.25);});}};
 }
});

export const cityStreet=defineModel({
 id:'city-street',aliases:['urban-street','downtown-street','street-scene'],
 describe:'A city street canyon with a two-lane road, broken centre markings, raised pavements, shopfronts, hydrants and curved streetlamps. `traffic` animates the signals.',
 controls:{traffic:'0 red signals .. 1 green signals (default 0.5)'},defaults:{traffic:0.5},size:'18 m street segment',
 build(ctx){
  const root=new THREE.Group();addBox(ctx,root,12,0.24,14,[0,0,0],0.34,0.04);addBox(ctx,root,6.4,0.07,14,[0,0.15,0],0.16,0.018);
  for(const s of [-1,1]){
   addBox(ctx,root,2.2,0.22,14,[s*4.3,0.27,0],0.67,0.035);
   addBox(ctx,root,3.1,5.5,6.8,[s*5,3.1,-3.3],0.6,0.035);
   addBox(ctx,root,2.8,7.3,5.2,[s*5.12,4.0,3],0.7,0.035);
   for(let k=0;k<3;k++)for(let y=1.2;y<6.8;y+=1.25)addWindow(ctx,root,[s*5, y,1.05+k*1.05],0.57,0.78,s*90,0);
   for(let k=0;k<2;k++)addBox(ctx,root,0.84,2.5,0.1,[s*4.97,1.5,-4.4+k*1.6],0.12,0.015);
   // Pavement slabs and occasional bollards
   for(let z=-6;z<=6;z+=2.8){addBox(ctx,root,2.05,0.05,0.025,[s*4.3,0.4,z],0.43,0.005);addCyl(ctx,root,0.075,0.7,[s*3.25,0.78,z+0.65],0.9,16,0.075);}
   const postX=s*3.55;addCyl(ctx,root,0.09,4.6,[postX,2.7,-1.7],0.78,16,0.065);
   addRod(ctx,root,[postX,4.95,-1.7],[postX,5.55,-1.7],0.06,0.85);
   addRod(ctx,root,[postX,5.55,-1.7],[s*2.85,5.75,-1.7],0.045,0.95);
   addBox(ctx,root,0.42,0.13,0.2,[s*2.85,5.68,-1.7],0.98,0.05);
  }
  for(let z=-5.6;z<6;z+=2.4)addBox(ctx,root,0.17,0.015,1.2,[0,0.195,z],0.96,0.006);
  const signals:THREE.Mesh[]=[];
  for(const s of [-1,1]){addCyl(ctx,root,0.075,3.3,[s*3.15,1.95,5.9],0.84,14);const m=ctx.mesh(G.sphere(0.13,16,10),{tone:0.8,glow:2,glowControl:'traffic'});m.position.set(s*3.15,3.7,5.9);root.add(m);signals.push(m);}
  return {root,grounded:true,update(c){const go=clamp(c.traffic??0.5);signals.forEach((m,i)=>{mat(m).emissiveIntensity=(mat(m).userData.glow as number)*(i?go:1-go);});}};
 }
});

// ================================================================= bridges and monumental forms
export const suspensionBridge=defineModel({
 id:'suspension-bridge',aliases:['hanging-bridge','cable-bridge','suspension-span'],
 describe:'A suspension bridge spans a deep gap, with twin portal towers, a riveted deck, curved main cables and fine vertical hangers. `sway` moves the cable span in a light wind.',
 controls:{sway:'0 still .. 1 windy cable sway (default 0.15)'},defaults:{sway:0.15},size:'14 m display span',
 build(ctx){
  const root=new THREE.Group(),cables:THREE.Mesh[]=[];addBox(ctx,root,4.2,0.32,13,[0,2.75,0],0.55,0.04);
  addBox(ctx,root,4.45,0.2,13.3,[0,2.52,0],0.8,0.025);
  for(const s of [-1,1]){
   for(const z of [-4.3,4.3]){
    addBox(ctx,root,0.42,4.4,0.5,[s*1.62,4.65,z],0.9,0.035);
    addBox(ctx,root,3.55,0.36,0.58,[0,6.65,z],0.92,0.04);
    for(let k=-2;k<=2;k++)addBox(ctx,root,0.065,4.3,0.07,[s*1.62,4.63,z+k*0.11],0.62,0.01);
   }
   const cablePts:V3[]=[];for(let i=0;i<=16;i++){const z=lerp(-6.2,6.2,i/16),y=6.78-1.65*(1-Math.pow(z/6.2,2));cablePts.push([s*1.72,y,z]);}
   const cable=ctx.mesh(G.tube(cablePts,0.055,72,10),{tone:0.98});root.add(cable);cables.push(cable);
   for(let i=0;i<=18;i++){const z=lerp(-5.9,5.9,i/18),y=6.78-1.65*(1-Math.pow(z/6.2,2));if(Math.abs(z)<4.25)continue;addRod(ctx,root,[s*1.72,y,z],[s*1.72,2.95,z],0.018,0.72,8);}
  }
  // Under-deck cross girders and abutment piers.
  for(let z=-6;z<=6;z+=1.1){addBox(ctx,root,4.1,0.13,0.12,[0,2.53,z],0.72,0.014);}
  for(const s of [-1,1])for(const z of [-5.5,5.5])addBox(ctx,root,0.85,2.6,1.2,[s*1.6,1.3,z],0.55,0.04);
  return {root,grounded:true,update(c,t){const k=clamp(c.sway??0.15);cables.forEach((m,i)=>{m.position.x=(i%2?1:-1)*0.04*Math.sin(t*1.7+i)*k;});}};
 }
});

export const archBridge=defineModel({
 id:'arch-bridge',aliases:['stone-arch-bridge','masonry-bridge','arched-bridge'],
 describe:'A heavy stone road bridge with a broad semicircular arch, wedge-cut voussoirs, parapets and a second shadowed tunnel opening at the far end. `load` flexes the deck slightly.',
 controls:{load:'0 unloaded .. 1 heavy traffic load (default 0)'},defaults:{load:0},size:'12 m span',
 build(ctx){
  const root=new THREE.Group(),R=4.3,spring=2.65,z=0;
  addBox(ctx,root,10,1.05,11,[0,3.15,0],0.67,0.06);
  addBox(ctx,root,10.6,0.38,11.2,[0,3.85,0],0.88,0.045);
  for(const x of [-4.72,4.72])for(const z0 of [-3.6,0,3.6])addBox(ctx,root,0.16,0.54,0.11,[x,4.29,z0],0.95,0.018);
  addBox(ctx,root,10.5,0.25,0.28,[0,4.08,-5.3],0.92,0.035);addBox(ctx,root,10.5,0.25,0.28,[0,4.08,5.3],0.92,0.035);
  for(const s of [-1,1]){
   addBox(ctx,root,1.1,2.65,10.7,[s*(R+0.55),1.33,0],0.57,0.04);
   // Stone arch ring in the front-facing elevation, repeated at the back face.
   addArchBlocks(ctx,root,R,spring,5.52,0.55,0.9,16,0.7);
   addArchBlocks(ctx,root,R,spring,-5.52,0.55,0.68,16,0.7);
   for(let i=0;i<8;i++){const x=s*(0.65+i*0.46),y=1.1+i*0.28;addBox(ctx,root,0.26,0.16,0.25,[x,y,0],0.74,0.025);}
  }
  // Recessed arch shadow gives depth under the deck.
  const shadow=ctx.mesh(at(G.extrude([[-3.98,0],[3.98,0],[3.98,spring],[3.7,spring+0.9],[3.05,spring+1.55],[2.2,spring+2.0],[0,spring+2.25],[-2.2,spring+2.0],[-3.05,spring+1.55],[-3.7,spring+0.9],[-3.98,spring]],0.04),[0,0,5.18]),{tone:0.09});root.add(shadow);
  const deck=root.children[0] as THREE.Mesh;
  return {root,grounded:true,update(c){deck.position.y=3.15-(c.load??0)*0.018;}};
 }
});

export const pyramid=defineModel({
 id:'pyramid',aliases:['egyptian-pyramid','stone-pyramid','ancient-pyramid'],
 describe:'A stepped-sided limestone pyramid with a square plinth, staggered block courses and a darker entrance passage cut into its front. `weathering` deepens the block joints.',
 controls:{weathering:'0 crisp joints .. 1 dark weathered joints (default 0.35)'},defaults:{weathering:0.35},size:'5.5 m tall display monument',
 build(ctx){
  const root=new THREE.Group();addBox(ctx,root,6,0.22,6,[0,0.11,0],0.47,0.04);
  const levels=11,H=5.2,base=5.45;
  for(let i=0;i<levels;i++){
   const f=1-i/levels,w=base*f+0.16,y=0.22+H/levels*(i+0.5);
   const m=ctx.mesh(G.cyl(w*0.707,w*0.707,H/levels+0.015,4),{tone:0.77-i*0.012});m.rotation.y=deg(45);m.position.y=y;root.add(m);
   const edge=ctx.mesh(at(G.torus(w*0.707,0.023,6,48),[0,y-H/levels*0.48,0],[90,0,0]),{tone:0.48});edge.scale.z=1;root.add(edge);
  }
  // Monumental recessed entry with lintel and descending passage.
  addBox(ctx,root,0.82,1.35,0.18,[0,1.15,2.74],0.12,0.02);
  addBox(ctx,root,1.24,0.2,0.28,[0,1.9,2.76],0.94,0.025);
  addBox(ctx,root,1.06,0.14,0.22,[0,0.48,2.77],0.95,0.02);
  const joints:THREE.BufferGeometry[]=[];for(let row=0;row<levels-1;row++){
   const f=1-row/levels,w=base*f;const y=0.22+H/levels*(row+1);
   for(let s of [-1,1])for(let j=-3;j<=3;j++){
    const x=j*w/7;if(Math.abs(x)>w/2)continue;
    joints.push(at(G.box(0.018,0.025,0.018),[x,y,s*w/2]));joints.push(at(G.box(0.018,0.025,0.018),[s*w/2,y,x]));
   }
  }
  if(joints.length)root.add(ctx.mesh(G.merge(joints),{tone:0.34}));
  return {root,grounded:true,update(c){const k=clamp(c.weathering??0.35);root.children.forEach(o=>{if(o instanceof THREE.Mesh&&o.material instanceof THREE.MeshStandardMaterial&&o.geometry.type==='BoxGeometry')o.material.color.setScalar(lerp(0.8,0.4,k));});}};
 }
});

export const greekTemple=defineModel({
 id:'greek-temple',aliases:['classical-temple','peripteral-temple','ancient-temple'],
 describe:'A Greek peristyle temple stands on broad steps, with fluted Ionic columns around a cella, carved capitals and a triangular pediment. `glow` lights its inner sanctuary.',
 controls:{glow:'0 dark sanctuary .. 1 luminous inner chamber (default 0.2)'},defaults:{glow:0.2},size:'9 m wide temple',
 build(ctx){
  const root=new THREE.Group(),W=8.2,D=6.2;
  for(let i=0;i<3;i++)addBox(ctx,root,W-i*0.44,0.22,D-i*0.44,[0,0.11+i*0.22,0],0.65+i*0.08,0.035);
  addBox(ctx,root,4.2,2.5,2.6,[0,2.05,-0.5],0.3,0.035);
  // The doorway opens between two dark bronze leaves.
  addBox(ctx,root,1.75,2.1,0.12,[0,1.85,0.88],0.14,0.015);
  for(const s of [-1,1]){addBox(ctx,root,0.78,1.95,0.09,[s*0.4,1.76,0.96],0.52,0.02);for(let i=0;i<4;i++)addBox(ctx,root,0.028,1.75,0.025,[s*0.4+(i-1.5)*0.18,1.76,1.02],0.87,0.006);}
  const glow=ctx.mesh(at(G.box(1.25,1.7,0.03),[0,1.85,0.82]),{tone:0.8,glow:1.2,glowControl:'glow'});root.add(glow);
  const peristyle=new THREE.Group();peristyle.position.y=0.66;root.add(peristyle);
  for(const z of [-2.85,2.85])for(let x=-3.15;x<=3.16;x+=1.05)addColumn(ctx,peristyle,x,z,4.2,0.28,10,1);
  for(const x of [-3.15,3.15])for(let z=-1.25;z<=1.26;z+=1.25)addColumn(ctx,peristyle,x,z,4.2,0.28,10,1);
  addBox(ctx,root,7.35,0.36,6.6,[0,4.87,0],0.94,0.055);
  const ped=G.extrude([[-4.1,5.04],[4.1,5.04],[0,7.02]],0.9,0.025);root.add(ctx.mesh(at(ped,[0,0,2.8]),{tone:0.71}));
  addBox(ctx,root,7.9,0.18,0.24,[0,5.02,3.15],0.52,0.025);
  for(let x=-3.5;x<=3.51;x+=0.34)addBox(ctx,root,0.026,0.025,0.06,[x,4.68,3.32],0.54,0.004);
  return {root,grounded:true,update(c){mat(glow).emissiveIntensity=(mat(glow).userData.glow as number)*clamp(c.glow??0.2);}};
 }
});

export const castle=defineModel({
 id:'castle',aliases:['medieval-castle','fortress','stone-fortress'],
 describe:'A compact medieval castle has a square keep, four round corner towers, conical roofs, crenellated curtain walls and a recessed portcullis. `gate` raises the grille.',
 controls:{gate:'0 portcullis down .. 1 raised (default 0)'},defaults:{gate:0},size:'12 m wide fortress',
 build(ctx){
  const root=new THREE.Group();addBox(ctx,root,6.1,5.1,4.6,[0,2.55,-0.35],0.58,0.05);
  for(const s of [-1,1])for(const z of [-2.55,2.55]){
   const tower=new THREE.Group();tower.position.set(s*4.15,0,z);root.add(tower);
   addCyl(ctx,tower,0.94,6.6,[0,3.3,0],0.76,40,0.78);addCyl(ctx,tower,1.03,0.22,[0,5.9,0],0.96,40,1.03);
   for(let i=0;i<12;i++){const a=i/12*Math.PI*2;addBox(ctx,tower,0.22,0.45,0.22,[Math.cos(a)*0.84,6.2,Math.sin(a)*0.84],0.9,0.025);}
   addCyl(ctx,tower,0.92,0.2,[0,6.2,0],0.5,32,0.92);
   const roof=ctx.mesh(G.cone(0.88,1.65,32),{tone:0.92});roof.position.y=7.1;tower.add(roof);
   for(let y=1.6;y<5.4;y+=1.55){addBox(ctx,tower,0.24,0.65,0.03,[0,y,0.79],0.12,0.045);addBox(ctx,tower,0.24,0.65,0.03,[0,y,-0.79],0.12,0.045);}
  }
  for(const s of [-1,1])addBox(ctx,root,2.2,3.4,0.58,[s*3.0,1.7,2.48],0.67,0.035);
  // Crenellations along the curtain wall.
  for(let x=-4.4;x<=4.41;x+=0.48)for(const z of [2.5,-2.3])addBox(ctx,root,0.25,0.42,0.32,[x,3.62,z],0.96,0.02);
  for(let z=-2.3;z<=2.31;z+=0.48)for(const x of [-4.3,4.3])addBox(ctx,root,0.32,0.42,0.25,[x,3.62,z],0.96,0.02);
  addBox(ctx,root,1.9,2.65,0.15,[0,1.35,2.49],0.09,0.02);
  const grille=new THREE.Group();root.add(grille);grille.position.set(0,0,2.6);
  addBox(ctx,grille,1.45,2.35,0.08,[0,1.18,0],0.7,0.015);
  for(let x=-0.62;x<=0.621;x+=0.22)addBox(ctx,grille,0.055,2.15,0.11,[x,1.18,0.07],0.95,0.01);
  for(let y=0.2;y<2.31;y+=0.34)addBox(ctx,grille,1.38,0.045,0.1,[0,y,0.08],0.94,0.008);
  return {root,grounded:true,update(c){grille.position.y=clamp(c.gate??0)*2.1;}};
 }
});

export const lighthouse=defineModel({
 id:'lighthouse',aliases:['coastal-lighthouse','beacon-tower','seaside-beacon'],
 describe:'A tapered coastal lighthouse rises from a rocky footing, with a spiral stair suggestion, gallery rail, glass lantern room and a rotating beam. `rotate` sets the sweep speed.',
 controls:{rotate:'0 stopped .. 1 full-speed rotating beacon (default 0.6)',lights:'0 off .. 1 bright lamp (default 1)'},defaults:{rotate:0.6,lights:1},size:'18 m tower',
 build(ctx){
  const root=new THREE.Group();addCyl(ctx,root,1.75,0.55,[0,0.28,0],0.56,48,1.75);
  const tower=ctx.mesh(G.lathe([[1.18,0.45],[1.22,0.7],[1.05,8.65],[0.96,9.1],[0.89,9.1],[0.89,0.45]],48),{tone:0.89});root.add(tower);
  for(let y=1.3;y<8.4;y+=1.45){const m=ctx.mesh(at(G.box(0.31,0.66,0.035),[0,y,1.03]),{tone:0.13});root.add(m);addBox(ctx,root,0.4,0.08,0.08,[0,y+0.38,1.05],0.98,0.015);}
  for(let i=0;i<10;i++){const a=i/10*Math.PI*2;addRod(ctx,root,[Math.cos(a)*1.42,0.55,Math.sin(a)*1.42],[Math.cos(a+0.55)*1.42,1.45,Math.sin(a+0.55)*1.42],0.035,0.77,8);}
  addCyl(ctx,root,1.22,0.19,[0,9.15,0],0.52,48,1.22);addCyl(ctx,root,1.08,0.22,[0,9.35,0],0.97,48,1.08);
  addCyl(ctx,root,0.94,0.94,[0,9.91,0],0.12,48,0.94);
  for(let i=0;i<12;i++){const a=i/12*Math.PI*2;addBox(ctx,root,0.035,0.9,1.86,[Math.cos(a)*0.93,9.91,Math.sin(a)*0.93],0.88,0.006,[0,-a*180/Math.PI,0]);}
  addCyl(ctx,root,1.02,0.14,[0,10.4,0],0.92,48,1.02);const roof=ctx.mesh(G.cone(1.03,0.66,40),{tone:0.62});roof.position.y=10.78;root.add(roof);
  const lamp=new THREE.Group();lamp.position.set(0,9.9,0);root.add(lamp);
  const beam=ctx.mesh(at(G.cone(0.52,4.8,24),[0,0,2.55],[90,0,0]),{tone:1,glow:2.3,glowControl:'lights'});lamp.add(beam);
  const core=ctx.mesh(at(G.cyl(0.09,0.09,0.12,20),[0,0,0],[90,0,0]),{tone:1,glow:3.5,glowControl:'lights'});lamp.add(core);
  return {root,grounded:true,update(c){lamp.rotation.y=(c.rotate??0.6)*Math.PI*2;const k=clamp(c.lights??1);for(const m of [beam,core])mat(m).emissiveIntensity=(mat(m).userData.glow as number)*k;}};
 }
});

export const windmill=defineModel({
 id:'windmill',aliases:['wind-mill','farm-windmill','wind-turbine-mill'],
 describe:'A Dutch windmill has a tapered brick tower, cap, four broad lattice sails and a small doorway. The sails turn naturally; `wind` sets their speed.',
 controls:{wind:'0 stopped .. 1 briskly turning sails (default 0.4)'},defaults:{wind:0.4},size:'10 m tall',
 build(ctx){
  const root=new THREE.Group();addCyl(ctx,root,1.3,5.5,[0,2.75,0],0.62,40,0.88);
  for(let y=0.45;y<5.4;y+=0.42)addBox(ctx,root,2.05-(y/5.5)*0.3,0.045,0.05,[0,y,0.02],0.42,0.008);
  const cap=ctx.mesh(G.cone(1.18,1.35,32),{tone:0.84});cap.position.y=6.15;root.add(cap);
  const hub=new THREE.Group();hub.position.set(0,5.75,0.89);root.add(hub);
  for(let i=0;i<4;i++){
   const blade=new THREE.Group();blade.rotation.z=i*Math.PI/2;hub.add(blade);
   const outline:[number,number][]=[[-0.12,0.15],[0.12,0.15],[0.28,1.45],[0.48,2.45],[-0.48,2.45],[-0.28,1.45]];
   const sail=ctx.mesh(G.extrude(outline,0.09,0.015),{tone:0.94});blade.add(sail);
   addRod(ctx,blade,[0,0.08,0.055],[0,2.42,0.055],0.075,0.48,10);
   addRod(ctx,blade,[-0.43,2.4,0.055],[0.43,2.4,0.055],0.045,0.52,8);
   for(let y=0.55;y<2.3;y+=0.32){const w=0.12+(y-0.15)*0.16;addBox(ctx,blade,w*2,0.035,0.12,[0,y,0.08],0.52,0.007);}
  }
  addCyl(ctx,hub,0.31,0.28,[0,0,0.12],1,24,0.31);
  addBox(ctx,root,0.72,1.5,0.12,[0,0.82,0.9],0.12,0.025);addBox(ctx,root,0.88,0.16,0.18,[0,0.08,0.91],0.92,0.02);
  for(const s of [-1,1])addBox(ctx,root,0.2,2.8,0.15,[s*1.18,1.4,0.8],0.85,0.02);
  return {root,grounded:true,update(c,t){hub.rotation.z=t*lerp(0,1.8,clamp(c.wind??0.4));}};
 }
});

export const skyscraperDetail=defineModel({
 id:'skyscraper-detail',aliases:['tower-skyscraper','high-rise-tower','office-tower'],
 describe:'A detailed glass skyscraper has a stepped crown, corner piers, a dense grid of recessed office windows, mechanical floors and an antenna mast. `lights` turns on office floors.',
 controls:{lights:'0 dark offices .. 1 lit offices (default 0.35)'},defaults:{lights:0.35},size:'30 m display tower',
 build(ctx){
  const root=new THREE.Group();addBox(ctx,root,5.5,0.65,4.5,[0,0.33,0],0.62,0.05);
  const body=addBox(ctx,root,4.2,20,3.8,[0,10.65,0],0.4,0.025);
  for(let y=1.2;y<19.8;y+=1.25){
   for(let x=-1.8;x<=1.81;x+=0.6){
    const front=ctx.mesh(at(G.box(0.46,0.8,0.035),[x,y,1.96]),{tone:0.68,glow:0.55,glowControl:'lights'});root.add(front);
    const side=ctx.mesh(at(G.box(0.035,0.8,0.46),[2.14,y,x*0.84]),{tone:0.65,glow:0.55,glowControl:'lights'});root.add(side);
   }
   for(const z of [-1.98,1.98])addBox(ctx,root,4.2,0.06,0.07,[0,y-0.48,z],0.96,0.009);
  }
  for(const x of [-2.05,2.05])for(const z of [-1.87,1.87])addBox(ctx,root,0.18,19.8,0.18,[x,10.62,z],0.9,0.025);
  for(const x of [-1.8,-1.2,-0.6,0,0.6,1.2,1.8])addBox(ctx,root,0.045,19.8,0.07,[x,10.62,1.98],0.95,0.007);
  for(let y of [18.5,19,19.5])addBox(ctx,root,4.5,0.16,4.1,[0,y,0],0.78,0.025);
  addBox(ctx,root,3.2,1.5,3,[0,20.55,0],0.66,0.04);addBox(ctx,root,2.2,1.1,2.2,[0,21.82,0],0.8,0.035);
  addRod(ctx,root,[0,22.37,0],[0,25.3,0],0.055,0.96,12);
  for(let y=22.7;y<24.9;y+=0.55){addRod(ctx,root,[-0.5,y,0],[0.5,y+0.35,0],0.018,0.63,8);addRod(ctx,root,[0.5,y,0],[-0.5,y+0.35,0],0.018,0.63,8);}
  body.userData.landmark=true;
  return {root,grounded:true};
 }
});

export const church=defineModel({
 id:'church',aliases:['chapel','steepled-church','parish-church'],
 describe:'A stone church combines a long nave, buttressed side walls, traceried round window, arched entrance, bell tower and sharply pointed steeple with a cross.',
 size:'12 m tall church',
 build(ctx){
  const root=new THREE.Group();addBox(ctx,root,6.2,4.5,10,[0,2.25,-0.5],0.66,0.04);
  addGableRoof(ctx,root,6.5,10,4.3,6.15,0.35,0.82);
  for(const s of [-1,1])for(let z=-4.3;z<=3.5;z+=2.2){addBox(ctx,root,0.55,5.5,0.58,[s*3.06,2.75,z],0.78,0.035);addBox(ctx,root,0.75,0.22,0.75,[s*3.06,5.25,z],0.92,0.025);}
  // Front gable, rose window and deep pointed entrance.
  root.add(ctx.mesh(at(G.extrude([[-3.1,4.45],[3.1,4.45],[0,6.12]],0.35),[0,0,4.55]),{tone:0.68}));
  addBox(ctx,root,2.1,3.2,0.2,[0,1.62,4.74],0.13,0.02);
  addBox(ctx,root,1.5,2.75,0.18,[0,1.37,4.86],0.57,0.025);
  addCyl(ctx,root,0.78,0.08,[0,4.55,4.8],0.9,48,0.78);
  addCyl(ctx,root,0.62,0.1,[0,4.55,4.87],0.14,48,0.62);
  for(let i=0;i<8;i++){const a=i*Math.PI/4;addRod(ctx,root,[0,4.55,4.94],[Math.cos(a)*0.6,4.55+Math.sin(a)*0.6,4.94],0.025,0.92,8);}
  // Bell tower sits over the entrance; open belfry arches and spire.
  addBox(ctx,root,2.4,6.8,2.7,[0,6.6,3.5],0.75,0.035);
  for(const s of [-1,1]){addBox(ctx,root,0.35,1.3,0.08,[s*0.58,7.35,4.9],0.12,0.02);addBox(ctx,root,0.35,1.3,0.08,[s*0.58,7.35,2.1],0.12,0.02);}
  addBox(ctx,root,2.8,0.25,3,[0,9.9,3.5],0.94,0.035);
  const sp=ctx.mesh(G.cone(1.48,3.8,4),{tone:0.88});sp.rotation.y=deg(45);sp.position.set(0,11.9,3.5);root.add(sp);
  addRod(ctx,root,[0,13.8,3.5],[0,14.7,3.5],0.055,1,10);addRod(ctx,root,[-0.36,14.36,3.5],[0.36,14.36,3.5],0.045,1,10);
  for(let s of [-1,1])for(let z of [-3.5,0,2])addWindow(ctx,root,[s*3.13,2.45,z],0.65,1.75,s*90);
  return {root,grounded:true};
 }
});

export const stadium=defineModel({
 id:'stadium',aliases:['sports-stadium','football-stadium','arena-bowl'],
 describe:'An open-air stadium bowl has stacked oval seating tiers, a bright rectangular pitch, goal frames and four tall floodlight pylons. `crowd` raises a subtle animated wave through the stands.',
 controls:{crowd:'0 still stands .. 1 coordinated crowd wave (default 0.15)'},defaults:{crowd:0.15},size:'18 m oval arena',
 build(ctx){
  const root=new THREE.Group();
  for(let i=0;i<5;i++){
   const r=7.4-i*0.65,y=0.6+i*0.47,h=0.5;
   const ring=ctx.mesh(G.cyl(r,r,h,64),{tone:0.6+i*0.06});ring.scale.set(1,1,0.69);ring.position.y=y+h/2;root.add(ring);
   const trim=ctx.mesh(at(G.torus(r-0.06,0.055,8,72),[0,y+h,0],[90,0,0]),{tone:0.92});trim.scale.set(1,0.69,1);root.add(trim);
  }
  addBox(ctx,root,7.2,0.12,4.5,[0,0.5,0],0.48,0.02);
  for(const x of [-3.35,3.35]){addBox(ctx,root,0.08,0.82,0.08,[x,0.93,0],0.94,0.012);addBox(ctx,root,0.08,0.08,0.08,[x,1.34,0],0.94,0.012);addBox(ctx,root,0.08,0.08,0.08,[x,0.55,0],0.94,0.012);}
  for(const z of [-2.0,2.0])addBox(ctx,root,0.08,0.05,0.08,[0,0.6,z],0.95,0.01);
  const lights:THREE.Mesh[]=[];
  for(const s of [-1,1])for(const z of [-1,1]){addCyl(ctx,root,0.11,7.2,[s*6.4,3.6,z*5.7],0.83,16,0.08);const bar=addBox(ctx,root,0.42,0.12,0.9,[s*6.4,7.2,z*5.7],1,0.03);lights.push(bar);for(let i=0;i<4;i++)addBox(ctx,root,0.07,0.07,0.07,[s*6.4-0.18+i*0.12,7.14,z*5.7],1,0.015);}
  const crowd:THREE.Mesh[]=[];for(let i=0;i<32;i++){const a=i/32*Math.PI*2,r=5.3+(i%3)*0.45,m=ctx.mesh(G.sphere(0.07,8,6),{tone:i%2?0.94:0.67});m.position.set(Math.cos(a)*r,2.4+(i%4)*0.32,Math.sin(a)*r*0.68);root.add(m);crowd.push(m);}
  return {root,grounded:true,update(c,t){const k=clamp(c.crowd??0.15);crowd.forEach((m,i)=>m.position.y=2.4+(i%4)*0.32+Math.max(0,Math.sin(t*3-i*0.37))*0.18*k);}};
 }
});

export const highway=defineModel({
 id:'highway',aliases:['motorway','freeway-segment','highway-road'],
 describe:'A raised divided highway section has two asphalt carriageways, dashed lane lines, concrete median, steel guardrails, expansion joints and tapered bridge piers. `flow` pulses the lane markers.',
 controls:{flow:'0 still road .. 1 flowing traffic cue (default 0)'},defaults:{flow:0},size:'14 m road segment',
 build(ctx){
  const root=new THREE.Group();addBox(ctx,root,11,0.55,13,[0,3.0,0],0.42,0.05);
  addBox(ctx,root,10.6,0.1,12.8,[0,3.33,0],0.38,0.02);
  addBox(ctx,root,0.42,0.18,12.8,[0,3.47,0],0.76,0.025);
  for(const s of [-1,1]){
   addBox(ctx,root,0.12,0.08,12.9,[s*4.8,3.42,0],0.96,0.012);
   for(const x of [s*1.55,s*3.05])for(let z=-5.9;z<6;z+=2.5)addBox(ctx,root,0.12,0.035,1.3,[x,3.41,z],0.92,0.01);
   addBox(ctx,root,0.22,0.36,12.7,[s*5.22,3.56,0],0.82,0.04);
   for(let z=-6;z<=6;z+=0.75){addBox(ctx,root,0.1,0.12,0.12,[s*5.18,3.82,z],0.98,0.015);}
   for(const z of [-4.5,0,4.5]){addBox(ctx,root,0.46,2.8,0.72,[s*3.7,1.4,z],0.67,0.035);addBox(ctx,root,0.82,0.22,0.9,[s*3.7,2.8,z],0.77,0.03);}
  }
  const dashes:THREE.Mesh[]=[];for(let z=-5.4;z<5.5;z+=1.7){const m=addBox(ctx,root,0.13,0.04,0.8,[0,3.41,z],0.98,0.01);dashes.push(m);}
  return {root,grounded:true,update(c,t){const k=clamp(c.flow??0);dashes.forEach((m,i)=>{m.position.z=lerp(-5.4,5.4,((i/Math.max(1,dashes.length))+t*0.18*k)%1);});}};
 }
});

// ================================================================= terrain and water
export const hillsTerrain=defineModel({
 id:'hills-terrain',aliases:['rolling-hills','green-hills','hill-country'],
 describe:'Rolling hills rise in three broad ridges above a carved valley, with exposed rock bands, a winding footpath and scattered conifers. `wind` ripples the grassline.',
 controls:{wind:'0 calm .. 1 breezy hilltop motion (default 0.2)'},defaults:{wind:0.2},size:'18 m terrain patch',
 build(ctx){
  const root=new THREE.Group();
  const surf=grid(36,32,-8,8,-7,7,(x,z)=>{
   const bump=(cx:number,cz:number,r:number,h:number)=>h*Math.exp(-((x-cx)**2+(z-cz)**2)/(r*r));
   return Math.max(0.04,bump(-4,-2,3.2,4.1)+bump(1,2,3.6,3.4)+bump(4,-3,2.8,3.0)+bump(-1,-5,2.5,1.7));
  });const land=ctx.mesh(surf.geometry,{tone:0.62});root.add(land);
  for(const s of [-1,1])for(let i=0;i<8;i++){const x=s*(2.2+i*0.4),z=-5.3+(i%4)*1.4,y=0.2+1.4*Math.abs(Math.sin(i*2.17));const rock=ctx.mesh(roughen(G.ellipsoid(0.55,0.34,0.42,14,9),0.08,2,i+12),{tone:0.48});rock.position.set(x,y,z);root.add(rock);}
  // Conifers follow the ridge line; simple layered branches with strong silhouettes.
  for(const [x,z,h] of [[-5,-2,2.7],[4,-2,2.2],[2,3.4,2.5],[-2,2,1.8]] as [number,number,number][]){
   const y=0.55+1.1*Math.abs(Math.sin(x*0.61+z));addCyl(ctx,root,0.1,h*0.42,[x,y+h*0.2,z],0.44,12,0.06);
   for(let j=0;j<3;j++){const c=ctx.mesh(G.cone(h*(0.27-j*0.045),h*0.43,12),{tone:0.78-j*0.12});c.position.set(x,y+h*(0.27+j*0.22),z);root.add(c);}
  }
  const pathPts:V3[]=[];for(let i=0;i<=20;i++){const z=lerp(-6.5,6.5,i/20),x=-3+1.5*Math.sin(z*0.45),y=0.16+1.4*Math.exp(-((x+4)**2+(z+2)**2)/10)+1.0*Math.exp(-((x-1)**2+(z-2)**2)/13);pathPts.push([x,y,z]);}
  root.add(ctx.mesh(G.tube(pathPts,0.07,64,8),{tone:0.95}));
  return {root,grounded:true,update(c,t){const k=clamp(c.wind??0.2);for(let i=0;i<root.children.length;i++){const o=root.children[i]!;if(o instanceof THREE.Mesh&&o.geometry.type==='ConeGeometry')o.rotation.z=Math.sin(t*1.5+i)*0.025*k;}}};
 }
});

export const desertDunes=defineModel({
 id:'desert-dunes',aliases:['sand-dunes','desert-landscape','dune-field'],
 describe:'Long wind-carved dunes sweep across a sandy desert, their crescent crests layered over a shallow basin with scattered rocks and a small date palm. `wind` shifts the dune ripples.',
 controls:{wind:'0 still sand .. 1 moving wind ripples (default 0.25)'},defaults:{wind:0.25},size:'18 m dune patch',
 build(ctx){
  const root=new THREE.Group();
  const height=(x:number,z:number,t=0)=>0.18+2.5*Math.exp(-((z+2-0.32*x)**2)/7)+2.05*Math.exp(-((z-3+0.25*x)**2)/8)+0.11*Math.sin(x*1.8+z*0.6+t);
  const surf=grid(40,32,-8,8,-7,7,(x,z)=>height(x,z));const dune=ctx.mesh(surf.geometry,{tone:0.8});root.add(dune);
  const base=surf.base.slice();
  for(let i=0;i<12;i++){const x=-6+(i%4)*3.7,z=-5+Math.floor(i/4)*4.7;const m=ctx.mesh(roughen(G.ellipsoid(0.12+0.05*(i%3),0.1,0.16,10,7),0.035,3,i+4),{tone:0.47});m.position.set(x,height(x,z)+0.12,z);root.add(m);}
  // Date palm is a landmark on the near dune flank.
  addRod(ctx,root,[4.7,0.2,3.5],[4.45,2.0,3.5],0.13,0.52,12);
  for(let i=0;i<7;i++){const a=i/7*Math.PI*2,tx=4.45+Math.cos(a)*1.25,tz=3.5+Math.sin(a)*1.25;addRod(ctx,root,[4.45,2,3.5],[tx,2.3+0.18*Math.sin(i*2),tz],0.035,0.78,8);}
  return {root,grounded:true,update(c,t){const k=clamp(c.wind??0.25),p=dune.geometry.attributes.position!;for(let i=0;i<p.count;i++){const x=base[i*3]!,z=base[i*3+2]!;p.setY(i,height(x,z,t*k*0.7));}p.needsUpdate=true;dune.geometry.computeVertexNormals();dune.geometry.computeBoundingSphere();}};
 }
});

export const caveEntrance=defineModel({
 id:'cave-entrance',aliases:['cave-mouth','cavern-entrance','rock-cave'],
 describe:'A jagged cave mouth cuts through a massive rough rock face; broken boulders frame the black arched opening and a narrow tunnel recedes inside. `glow` reveals a faint inner glimmer.',
 controls:{glow:'0 unlit cave .. 1 faint reflected glimmer (default 0)'},defaults:{glow:0},size:'8 m rock face',
 build(ctx){
  const root=new THREE.Group();const mound=ctx.mesh(roughen(G.ellipsoid(5.2,3.7,1.35,36,22),0.14,2.5,17),{tone:0.52});mound.position.set(0,2.6,-0.4);root.add(mound);
  addBox(ctx,root,5.1,0.06,3.5,[0,0.04,0],0.36,0.01);
  const dark=ctx.mesh(at(G.extrude([[-1.55,0],[1.55,0],[1.55,1.8],[1.3,2.35],[0.85,2.7],[0,2.85],[-0.85,2.7],[-1.3,2.35],[-1.55,1.8]],0.08),[0,0.05,0.99]),{tone:0.035});root.add(dark);
  // Faceted stones around the mouth make a readable arch rim.
  for(let i=0;i<11;i++){const a=Math.PI-(i+0.5)*Math.PI/11,x=Math.cos(a)*1.62,y=1.92+Math.sin(a)*1.62;const b=ctx.mesh(G.rbox(0.53,0.47,0.54,0.07),{tone:0.66+(i%3)*0.08});b.position.set(x,y,1.05);b.rotation.z=deg((a- Math.PI/2)*180/Math.PI);root.add(b);}
  for(const s of [-1,1])for(let i=0;i<3;i++){const rock=ctx.mesh(roughen(G.ellipsoid(0.62+i*0.08,0.45,0.48,14,10),0.07,3,3+i),{tone:0.55+i*0.1});rock.position.set(s*(1.9+i*0.48),0.38+i*0.32,1.0);root.add(rock);}
  addBox(ctx,root,1.6,0.12,2.3,[0,0.11,-0.6],0.18,0.02);
  const glow=ctx.mesh(at(G.sphere(0.22,20,14),[0,0.8,-1.3]),{tone:0.8,glow:1.6,glowControl:'glow'});root.add(glow);
  return {root,grounded:true,update(c){mat(glow).emissiveIntensity=(mat(glow).userData.glow as number)*clamp(c.glow??0);}};
 }
});

export const oceanSurface=defineModel({
 id:'ocean-surface',aliases:['open-ocean','sea-surface','ocean-waves'],
 describe:'A broad open-ocean surface rolls in overlapping swells, with bright broken crests and foam streaks. `swell` controls wave height and `speed` the moving water.',
 controls:{swell:'0 glassy .. 1 large swells (default 0.55)',speed:'wave speed multiplier (default 1)'},defaults:{swell:0.55,speed:1},size:'14 × 11 m water patch',
 build(ctx){
  const root=new THREE.Group();const surf=grid(48,40,-7,7,-5.5,5.5,(x,z)=>1.15*Math.sin(x*0.72+z*0.35)+0.62*Math.sin(z*1.1-x*0.22));const water=ctx.mesh(surf.geometry,{tone:0.78});root.add(water);
  const crests:THREE.Mesh[]=[];for(let i=0;i<18;i++){const x=-6.3+(i%6)*2.5,z=-4.4+Math.floor(i/6)*4.15;const m=ctx.mesh(at(G.tube([[x-0.8,0,z],[x-0.35,0.07,z+0.05],[x+0.1,0.11,z],[x+0.65,0.04,z-0.03]],0.035,12,6),[0,0,0]),{tone:0.99});root.add(m);crests.push(m);}
  return {root,grounded:false,update(c,t){const s=clamp(c.swell??0.55),v=clamp(c.speed??1,0,4),p=water.geometry.attributes.position!;for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i);p.setY(i,s*(1.15*Math.sin(x*0.72+z*0.35+t*v)+0.62*Math.sin(z*1.1-x*0.22-t*v*0.72)));}p.needsUpdate=true;water.geometry.computeVertexNormals();water.geometry.computeBoundingSphere();crests.forEach((m,i)=>{m.position.y=0.72*s+0.12*Math.sin(t*v*1.2+i);m.rotation.z=0.025*Math.sin(t+i);});}};
 }
});

export const river=defineModel({
 id:'river',aliases:['river-channel','winding-river','stream-banks'],
 describe:'A winding river cuts through low grassy banks, with layered water, gravel bars, shoreline stones and a small footbridge. `flow` sends ripples downstream.',
 controls:{flow:'0 still water .. 1 fast current (default 0.5)'},defaults:{flow:0.5},size:'12 m river section',
 build(ctx){
  const root=new THREE.Group();
  const waterGrid=grid(38,42,-2.2,2.2,-6,6,(x,z)=>0.32+0.2*Math.sin(z*1.1+x*0.4));const waterPositions=waterGrid.geometry.attributes.position!;for(let i=0;i<waterPositions.count;i++){const z=waterPositions.getZ(i);waterPositions.setX(i,waterPositions.getX(i)+0.72*Math.sin(z*0.52));}waterGrid.geometry.computeVertexNormals();waterGrid.geometry.computeBoundingSphere();const water=ctx.mesh(waterGrid.geometry,{tone:0.32});root.add(water);
  // Broad banks flank a curved channel; short grass blades catch light.
  const left=ctx.mesh(roughen(G.ellipsoid(2.2,0.55,7,28,14),0.04,2,5),{tone:0.77});left.position.set(-3.4,0.05,0);root.add(left);
  const right=ctx.mesh(roughen(G.ellipsoid(2.2,0.58,7,28,14),0.04,2,9),{tone:0.73});right.position.set(3.4,0.05,0);root.add(right);
  for(const s of [-1,1]){
   const shore:V3[]=[];for(let i=0;i<=22;i++){const z=lerp(-6,6,i/22),x=s*(2.05+0.18*Math.sin(z*0.65));shore.push([x,0.11,z]);}
   root.add(ctx.mesh(G.tube(shore,0.055,72,8),{tone:0.95}));
   for(let i=0;i<16;i++){const z=-5.7+i*0.74,x=s*(2.3+0.25*Math.sin(z*0.6)),r=0.16+(i%3)*0.06;const m=ctx.mesh(roughen(G.ellipsoid(r,r*0.65,r*1.1,10,7),0.018,3,i),{tone:0.45+(i%2)*0.15});m.position.set(x,0.14,z);root.add(m);}
  }
  // Slender timber footbridge across the channel.
  for(let x=-1.55;x<=1.56;x+=0.38)addBox(ctx,root,0.34,0.14,1.65,[x,0.9,0],0.76,0.018,[0,0,lerp(-7,7,x/1.55)]);
  for(const s of [-1,1]){addRod(ctx,root,[s*1.65,0.3,-0.8],[s*1.65,1.05,0],0.07,0.52);addRod(ctx,root,[s*1.65,1.05,0],[s*1.65,0.3,0.8],0.07,0.52);addRod(ctx,root,[s*1.65,0.98,-0.7],[s*1.65,0.98,0.7],0.035,0.92);}
  const base=waterGrid.base.slice();
  return {root,grounded:true,update(c,t){const f=clamp(c.flow??0.5),p=water.geometry.attributes.position!;for(let i=0;i<p.count;i++){const z=base[i*3+2]!,x=base[i*3]!;p.setY(i,0.32+0.2*Math.sin(z*1.1+x*0.4-t*(0.4+f*2.2)));}p.needsUpdate=true;water.geometry.computeVertexNormals();water.geometry.computeBoundingSphere();}};
 }
});

export const waterfall=defineModel({
 id:'waterfall',aliases:['cascade','water-fall','falling-water'],
 describe:'A whitewater cascade spills over a broken rock ledge into a dark plunge pool, with stepped side cliffs, vertical streaks and animated spray. `flow` controls the falling water.',
 controls:{flow:'0 stopped trickle .. 1 full waterfall (default 0.8)'},defaults:{flow:0.8},size:'8 m cascade',
 build(ctx){
  const root=new THREE.Group();addBox(ctx,root,8,5.6,1.35,[0,2.8,-0.5],0.46,0.05);
  // Irregular cliff caps and side buttresses.
  for(let i=0;i<11;i++){const x=-3.8+i*0.76,y=5.2+0.34*Math.sin(i*1.8);const rock=ctx.mesh(roughen(G.ellipsoid(0.62,0.55,0.58,14,10),0.06,3,i+8),{tone:0.68+(i%3)*0.08});rock.position.set(x,y,0.2);root.add(rock);}
  const surf=grid(26,32,-3.7,3.7,0,4.8,(x,y)=>0.68+0.13*Math.sin(x*2.4+y*2.2));
  // grid's vertical coordinate is stored as z; remap its position to the cliff face.
  const p=surf.geometry.attributes.position!;for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getZ(i);p.setXYZ(i,x,y,0.34+0.07*Math.sin(x*2.2+y));}surf.geometry.computeVertexNormals();
  const sheet=ctx.mesh(surf.geometry,{tone:0.92});root.add(sheet);
  for(let i=0;i<10;i++){const g=new THREE.Group();g.position.set(-3.4+(i%5)*1.65,0.4+Math.floor(i/5)*0.32,0.44);root.add(g);const s=ctx.mesh(G.capsule(0.055,0.8,5,10),{tone:i%2?0.85:1});s.rotation.x=deg(90);g.add(s);}
  addBox(ctx,root,8.5,0.42,3.4,[0,0.18,0.8],0.19,0.08);
  for(let i=0;i<12;i++){const x=-3.4+i*0.62,m=ctx.mesh(G.sphere(0.08+(i%3)*0.025,10,7),{tone:0.92,glow:0.35,glowControl:'_spray'});m.position.set(x,0.38+(i%4)*0.12,0.52);root.add(m);}
  const streaks=root.children.filter(o=>o instanceof THREE.Group) as THREE.Group[];
  return {root,grounded:true,update(c,t){const f=clamp(c.flow??0.8);streaks.forEach((g,i)=>{g.visible=f>0.02;g.position.y=0.42+((t*(0.65+f*1.7)+i*0.113)%1)*4.3;g.position.x=-3.4+(i%5)*1.65+0.04*Math.sin(t*5+i);});mat(sheet).opacity=0.45+0.5*f;}};
 }
});

// ================================================================= rural shelters and structures
export const barn=defineModel({
 id:'barn',aliases:['farm-barn','red-barn','hay-barn'],
 describe:'A large gambrel-roof barn has vertical board siding, a split sliding hay door, upper loft vent, side stall doors and a metal roof ridge cupola.',
 size:'9 m wide barn',
 build(ctx){
  const root=new THREE.Group();addBox(ctx,root,8,4.3,7,[0,2.15,0],0.66,0.045);
  // Gambrel roof profile, built as thick gable plates and two roof pitches.
  const gable=G.extrude([[-4,4.28],[-4,5.35],[-2.55,6.45],[2.55,6.45],[4,5.35],[4,4.28]],7.1,0.02);root.add(ctx.mesh(gable,{tone:0.76}));
  for(const s of [-1,1]){
   addBox(ctx,root,2.15,0.2,7.7,[s*3.05,5.82,0],0.89,0.025,[0,0,s*-37]);
   addBox(ctx,root,1.82,0.2,7.7,[s*1.15,6.31,0],0.92,0.025,[0,0,s*-24]);
  }
  for(let x=-3.65;x<=3.66;x+=0.56){addBox(ctx,root,0.045,4.15,0.05,[x,2.2,3.53],0.45,0.008);addBox(ctx,root,0.045,4.15,0.05,[x,2.2,-3.53],0.45,0.008);}
  // Split doors with prominent X braces.
  for(const s of [-1,1]){addBox(ctx,root,1.55,2.75,0.18,[s*0.82,1.43,3.59],0.15,0.025);addRod(ctx,root,[s*0.82-0.68,0.3,3.71],[s*0.82+0.68,2.58,3.71],0.055,0.94);addRod(ctx,root,[s*0.82+0.68,0.3,3.71],[s*0.82-0.68,2.58,3.71],0.055,0.94);}
  addBox(ctx,root,1.12,0.55,0.16,[0,4.95,3.62],0.12,0.02);for(let x=-0.42;x<=0.43;x+=0.28)addBox(ctx,root,0.045,0.46,0.08,[x,4.95,3.72],0.9,0.008);
  addCyl(ctx,root,0.4,0.35,[0,6.65,-1.8],0.71,24,0.4);addBox(ctx,root,1.05,0.12,0.9,[0,6.85,-1.8],0.98,0.02);
  for(const s of [-1,1])for(const z of [-1.8,1.8])addBox(ctx,root,0.95,1.55,0.12,[s*4.03,1.55,z],0.13,0.025);
  return {root,grounded:true};
 }
});

export const farm=defineModel({
 id:'farm',aliases:['farmstead','farmyard','working-farm'],
 describe:'A small farmstead gathers a red barn, grain silo, split-rail fence, hay bales, furrowed field and a wind pump beside the yard. `wind` turns the pump wheel.',
 controls:{wind:'0 stopped .. 1 turning wind pump (default 0.3)'},defaults:{wind:0.3},size:'15 m farmyard',
 build(ctx){
  const root=new THREE.Group();addBox(ctx,root,15,0.14,13,[0,0,0],0.54,0.035);
  // Barn, roofs and tall corrugated silo.
  addBox(ctx,root,5.4,3.5,4.1,[-3.1,1.82,-1.7],0.62,0.04);
  const barnRoof=new THREE.Group();barnRoof.position.set(-3.1,0,-1.7);root.add(barnRoof);addGableRoof(ctx,barnRoof,5.8,4.5,3.5,5.0,0.32,0.88);
  const silo=ctx.mesh(G.lathe([[0.9,0],[1.05,0.18],[1.05,3.85],[0.92,4.1],[0,4.1]],40),{tone:0.8});silo.position.set(4.25,0,-2.3);root.add(silo);
  for(let y=0.35;y<3.8;y+=0.29)for(let i=0;i<24;i++){const a=i/24*Math.PI*2;addBox(ctx,root,0.027,0.045,0.03,[4.25+Math.cos(a)*1.04,y,-2.3+Math.sin(a)*1.04],0.51,0.004);}
  const dome=ctx.mesh(G.sphere(0.96,32,12),{tone:0.93});dome.scale.y=0.45;dome.position.set(4.25,4,-2.3);root.add(dome);
  // Furrowed crop field and hay bales.
  for(let x=-1.5;x<=5.5;x+=0.46)addBox(ctx,root,0.045,0.04,7,[x,0.1,3],0.82,0.006);
  for(let i=0;i<4;i++){const bale=ctx.mesh(G.cyl(0.45,0.45,1.05,18),{tone:0.95});bale.rotation.z=deg(90);bale.position.set(-5.4+i*1.1,0.5,4.4);root.add(bale);for(let j=-2;j<=2;j++)addBox(ctx,root,0.03,0.85,0.03,[-5.4+i*1.1,0.5,4.4+j*0.12],0.57,0.004);}
  // Split-rail fencing defines the field.
  for(const s of [-1,1])for(let z=-5.8;z<5.8;z+=1.2){addBox(ctx,root,0.12,1.15,0.12,[s*6.6,0.62,z],0.48,0.018);}
  for(const y of [0.58,1.0])for(const s of [-1,1])addBox(ctx,root,0.09,0.09,11.6,[s*6.6,y,0],0.82,0.012);
  for(let x=-5.5;x<5.6;x+=1.2)for(const y of [0.58,1.0])addBox(ctx,root,1.15,0.09,0.09,[x,y,-5.8],0.82,0.012);
  const wheel=new THREE.Group();wheel.position.set(5.7,5.1,2.7);root.add(wheel);addCyl(ctx,wheel,0.72,0.1,[0,0,0],0.85,32,0.72).rotation.x=deg(90);
  for(let i=0;i<12;i++){const a=i/12*Math.PI*2;addRod(ctx,wheel,[0,0,0],[Math.cos(a)*0.68,Math.sin(a)*0.68,0],0.035,0.95,8);}
  addRod(ctx,root,[5.7,0.2,2.7],[5.7,5.1,2.7],0.08,0.55,12);addRod(ctx,root,[4.7,5.1,2.7],[6.7,5.1,2.7],0.07,0.8,10);
  return {root,grounded:true,update(c,t){wheel.rotation.z=t*lerp(0,1.9,clamp(c.wind??0.3));}};
 }
});

export const tent=defineModel({
 id:'tent',aliases:['camping-tent','ridge-tent','canvas-shelter'],
 describe:'A pitched canvas camping tent has taut triangular end panels, a zipped front vestibule, ridge pole, ground skirt, guy lines and pegs. `open` folds the front flap back.',
 controls:{open:'0 zipped closed .. 1 front flap rolled open (default 0)'},defaults:{open:0},size:'2.4 m tent',
 build(ctx){
  const root=new THREE.Group(),W=2.7,L=3.6,H=1.9;
  addBox(ctx,root,W,0.12,L,[0,0.06,0],0.46,0.02);
  for(const s of [-1,1]){
   const side=s<0?[[-W/2,0],[0,H],[0,H-0.08],[-W/2,0.08]] as [number,number][]:[[0,H],[W/2,0],[W/2,0.08],[0,H-0.08]] as [number,number][];
   root.add(ctx.mesh(G.extrude(side,L,0.025),{tone:0.77}));
   addRod(ctx,root,[s*W/2,0.16,-L/2],[0,H,0],0.045,0.96,10);addRod(ctx,root,[s*W/2,0.16,L/2],[0,H,0],0.045,0.96,10);
  }
  const end=G.extrude([[-W/2,0],[W/2,0],[0,H]],0.07,0.015);const back=ctx.mesh(at(end,[0,0,-L/2]),{tone:0.69});root.add(back);
  const flap=new THREE.Group();flap.position.set(0,0.05,L/2+0.02);root.add(flap);
  const front=ctx.mesh(at(G.extrude([[-W/2,0],[W/2,0],[0,H]],0.055,0.01),[0,0,0]),{tone:0.84});flap.add(front);
  const door=G.extrude([[-0.48,0],[0.48,0],[0.35,1.05],[0,1.4],[-0.35,1.05]],0.07,0.01);root.add(ctx.mesh(at(door,[0,0.08,L/2+0.08]),{tone:0.2}));
  for(const s of [-1,1])for(const z of [-L/2,L/2]){addRod(ctx,root,[0,H,z],[s*W/2,0.08,z],0.035,0.52,8);addRod(ctx,root,[s*W/2,0.2,z],[s*(W/2+0.95),0.05,z+(z>0?0.65:-0.65)],0.018,0.92,6);addCyl(ctx,root,0.045,0.18,[s*(W/2+0.95),0.08,z+(z>0?0.65:-0.65)],0.68,8,0.02);}
  return {root,grounded:true,update(c){const k=clamp(c.open??0);flap.rotation.x=-k*deg(92);flap.position.y=k*0.5;}};
 }
});

export const igloo=defineModel({
 id:'igloo',aliases:['snow-igloo','ice-dome-shelter','inuit-snow-house'],
 describe:'A snow igloo is built from stepped spiral courses of ice blocks, with a low tunnel entrance, projecting keystone and curved cap stones. `warmth` glows softly from within.',
 controls:{warmth:'0 cold dark shelter .. 1 warm interior glow (default 0.1)'},defaults:{warmth:0.1},size:'3.2 m dome',
 build(ctx){
  const root=new THREE.Group(),R=1.65,H=2.55,rows=8;
  for(let row=0;row<rows;row++){
   const y=0.18+row*0.29,r=Math.sqrt(Math.max(0.05,R*R-(y-0.15)*(y-0.15))),n=Math.max(7,Math.round(2*Math.PI*r/0.56));
   for(let i=0;i<n;i++){
    const a=i/n*Math.PI*2;
    if(Math.cos(a)>0.72&&y<1.25)continue;
    const len=2*Math.PI*r/n*1.04,b=ctx.mesh(G.rbox(len,0.3,0.47,0.035),{tone:0.72+(row%2)*0.08});b.position.set(Math.sin(a)*r,y,Math.cos(a)*r);b.rotation.y=a;root.add(b);
   }
  }
  // Low tunnel and dark entrance, built from stacked blocks.
  addBox(ctx,root,1.25,0.26,1.05,[0,0.13,2.05],0.66,0.025);
  for(const s of [-1,1])for(let i=0;i<4;i++)addBox(ctx,root,0.3,0.3,1.1,[s*0.63,0.3+i*0.25,2.03],0.83,0.025);
  addBox(ctx,root,0.82,1.0,0.07,[0,0.62,2.59],0.11,0.015);
  const glow=ctx.mesh(at(G.sphere(0.14,16,12),[0,0.95,1.2]),{tone:0.8,glow:1.8,glowControl:'warmth'});root.add(glow);
  addBox(ctx,root,3.65,0.18,3.65,[0,0.09,0],0.55,0.05);
  return {root,grounded:true,update(c){mat(glow).emissiveIntensity=(mat(glow).userData.glow as number)*clamp(c.warmth??0.1);}};
 }
});

export const ironTower=defineModel({
 id:'lattice-iron-tower',aliases:['iron-truss-tower','steel-lattice-tower','pylon-tower'],
 describe:'A tall iron lattice tower tapers upward through four braced stages, with riveted legs, cross-bracing, two projecting service decks and a pointed lightning rod.',
 size:'16 m tower',
 build(ctx){
  const root=new THREE.Group(),H=15.4;
  const levels=[0,3.3,6.7,10.2,13.8],width=(y:number)=>2.9-y*0.115;
  for(const s of [-1,1])for(const q of [-1,1])addRod(ctx,root,[s*width(0)/2,0,q*width(0)/2],[s*width(13.8)/2,13.8,q*width(13.8)/2],0.085,0.64,12);
  for(let j=0;j<levels.length;j++){
   const y=levels[j]!,w=width(y);
   for(const s of [-1,1])addRod(ctx,root,[-w/2,y,s*w/2],[w/2,y,s*w/2],0.055,0.86,10);
   for(const s of [-1,1])addRod(ctx,root,[s*w/2,y,-w/2],[s*w/2,y,w/2],0.055,0.86,10);
   if(j<levels.length-1){const y2=levels[j+1]!,w2=width(y2);for(const s of [-1,1]){addRod(ctx,root,[-w/2,y,s*w/2],[w2/2,y2,s*w2/2],0.04,0.52,8);addRod(ctx,root,[w/2,y,s*w/2],[-w2/2,y2,s*w2/2],0.04,0.52,8);addRod(ctx,root,[s*w/2,y,-w/2],[-s*w2/2,y2,w2/2],0.04,0.52,8);addRod(ctx,root,[s*w/2,y,w/2],[-s*w2/2,y2,-w2/2],0.04,0.52,8);}}
  }
  for(const y of [5.2,10.7]){const w=width(y);addBox(ctx,root,w*1.9,0.13,w*1.9,[0,y,0],0.86,0.02);for(const s of [-1,1])addBox(ctx,root,0.08,0.6,w*1.9,[s*w*0.85,y+0.34,0],0.52,0.012);}
  addRod(ctx,root,[0,H,0],[0,17.4,0],0.035,0.95,10);
  for(let y=0.55;y<13.6;y+=1.2)for(const s of [-1,1])addCyl(ctx,root,0.105,0.045,[s*width(y)/2,y,s*width(y)/2],0.95,12,0.105);
  return {root,grounded:true};
 }
});

export const statue=defineModel({
 id:'statue',aliases:['monument-statue','bronze-statue','public-statue'],
 describe:'A classical robed figure stands on a carved stone plinth, one arm extended with a wreath while the other gathers a heavy fold of drapery.',
 size:'4.2 m monument',
 build(ctx){
  const root=new THREE.Group();
  addBox(ctx,root,2.7,0.38,2.4,[0,0.19,0],0.56,0.06);addBox(ctx,root,2.25,0.42,1.95,[0,0.59,0],0.84,0.045);
  addBox(ctx,root,1.7,1.55,1.5,[0,1.57,0],0.71,0.04);
  for(let y=1.1;y<2.2;y+=0.18)addBox(ctx,root,1.78,0.035,1.56,[0,y,0],0.49,0.006);
  addBox(ctx,root,1.95,0.18,1.72,[0,2.43,0],0.93,0.03);
  const robe=ctx.mesh(G.lathe([[0.02,2.48],[0.52,2.52],[0.66,2.74],[0.58,3.1],[0.43,3.55],[0.33,3.82],[0,3.86]],36),{tone:0.72});root.add(robe);
  // Long folds give the statue a single continuous, carved silhouette.
  for(let i=0;i<9;i++){const a=i/9*Math.PI*2;addRod(ctx,root,[Math.cos(a)*0.57,2.7,Math.sin(a)*0.57],[Math.cos(a*1.08)*0.31,3.76,Math.sin(a*1.08)*0.31],0.025,0.48,8);}
  const torso=ctx.mesh(G.ellipsoid(0.39,0.52,0.3,24,16),{tone:0.9});torso.position.set(0,3.95,0);root.add(torso);
  addCyl(ctx,root,0.13,0.2,[0,4.4,0],0.67,18,0.13);
  const head=ctx.mesh(G.ellipsoid(0.26,0.34,0.27,24,18),{tone:0.92});head.position.set(0,4.69,0.02);root.add(head);
  // Profile, brow and hair stay understated so it reads as a carved portrait.
  addBox(ctx,root,0.08,0.13,0.12,[0,4.69,0.28],0.86,0.025,[8,0,0]);
  for(const s of [-1,1]){const eye=ctx.mesh(at(G.sphere(0.035,10,7),[s*0.095,4.73,0.247]),{tone:0.17});root.add(eye);}
  const armL:[[number,number,number],[number,number,number]]=[[-0.27,4.18,0.02],[-0.88,4.48,0.08]],armR:[[number,number,number],[number,number,number]]=[[0.27,4.17,0.02],[0.72,3.88,0.19]];
  addRod(ctx,root,armL[0],armL[1],0.12,0.82,14);addRod(ctx,root,[armL[1][0],armL[1][1],armL[1][2]],[ -1.03,4.75,0.1],0.085,0.88,12);
  addRod(ctx,root,armR[0],armR[1],0.13,0.82,14);addRod(ctx,root,[armR[1][0],armR[1][1],armR[1][2]],[0.35,3.55,0.25],0.09,0.86,12);
  const wreath=ctx.mesh(at(G.torus(0.2,0.04,10,28),[-1.04,4.92,0.1]),{tone:1});root.add(wreath);
  for(let i=0;i<7;i++){const a=i/7*Math.PI*2;addBox(ctx,root,0.1,0.045,0.08,[-1.04+Math.cos(a)*0.2,4.92+Math.sin(a)*0.2,0.1],0.8,0.012,[0,0,a*180/Math.PI]);}
  addBox(ctx,root,2.3,0.08,2.0,[0,2.54,0],0.52,0.012);
  return {root,grounded:true};
 }
});

export const fence=defineModel({
 id:'fence',aliases:['picket-fence','garden-fence','wooden-fence'],
 describe:'A painted picket fence segment has pointed slats, two moulded rails, square end posts and metal post caps; the repeated vertical rhythm makes its scale clear.',
 size:'5 m fence panel',
 build(ctx){
  const root=new THREE.Group();addBox(ctx,root,5,0.19,0.18,[0,0.72,0],0.82,0.025);addBox(ctx,root,5,0.19,0.18,[0,1.53,0],0.86,0.025);
  for(const x of [-2.48,2.48]){addBox(ctx,root,0.28,2.35,0.32,[x,1.16,0],0.66,0.025);addBox(ctx,root,0.4,0.2,0.44,[x,2.39,0],0.95,0.035);}
  for(let x=-2.2;x<=2.21;x+=0.28){
   const pick=G.extrude([[-0.09,0],[0.09,0],[0.09,1.77],[0,1.96],[-0.09,1.77]],0.12,0.012);
   const m=ctx.mesh(at(pick,[x,0.13,0]),{tone:0.92});root.add(m);
   addBox(ctx,root,0.035,0.1,0.18,[x,0.75,0],0.58,0.006);addBox(ctx,root,0.035,0.1,0.18,[x,1.54,0],0.58,0.006);
  }
  addBox(ctx,root,5.35,0.12,0.38,[0,0.06,0],0.45,0.018);
  return {root,grounded:true};
 }
});

export const stoneWall=defineModel({
 id:'stone-wall',aliases:['masonry-wall','dry-stone-wall','stone-boundary'],
 describe:'A thick old stone wall is laid in uneven staggered courses, with chipped coping stones, pale mortar joints and a broken patch revealing its rough core.',
 size:'6 m wall section',
 build(ctx){
  const root=new THREE.Group(),stones:THREE.BufferGeometry[]=[];
  addBox(ctx,root,6.3,0.3,1.15,[0,0.15,0],0.5,0.04);
  for(let row=0;row<6;row++){
   const y=0.43+row*0.51,off=row%2?0.42:0;
   for(let x=-2.85+off;x<3;x+=1.04){
    const w=Math.min(0.94,3.15-(x+0.5));if(w<0.32)continue;
    const b=G.rbox(w,0.46,0.92,0.07);const xx=x+Math.max(0,w/2-0.47);stones.push(at(b,[xx,y,0.04],[0,(row%3-1)*2,0]));
   }
  }
  root.add(ctx.mesh(G.merge(stones),{tone:0.68}));
  for(let x=-2.9;x<=2.91;x+=1.2){const cap=ctx.mesh(roughen(G.rbox(1.05,0.24,1.18,0.08),0.018,2,x+5),{tone:0.87});cap.position.set(x,3.51,0);root.add(cap);}
  // A collapsed patch exposes irregular core rubble.
  for(let i=0;i<9;i++){const b=ctx.mesh(roughen(G.ellipsoid(0.22+0.08*(i%3),0.18,0.2,12,8),0.025,3,i+21),{tone:0.48+(i%3)*0.13});b.position.set(0.95+(i%3)*0.33,1.25+Math.floor(i/3)*0.45,0.5+(i%2)*0.1);root.add(b);}
  return {root,grounded:true};
 }
});

export const gate=defineModel({
 id:'gate',aliases:['iron-gate','estate-gate','wrought-iron-gate'],
 describe:'A pair of ornate wrought-iron gates hangs between dressed stone piers, with spear finials, scrollwork and round hinge collars. `open` swings both leaves inward.',
 controls:{open:'0 shut .. 1 fully open leaves (default 0)'},defaults:{open:0},size:'5.5 m entrance',
 build(ctx){
  const root=new THREE.Group();
  for(const s of [-1,1]){addBox(ctx,root,0.72,4.7,0.82,[s*2.8,2.35,0],0.69,0.05);addBox(ctx,root,0.98,0.35,1.02,[s*2.8,4.75,0],0.96,0.04);addCyl(ctx,root,0.3,0.34,[s*2.8,5.0,0],0.85,20,0.3);}
  const leaves:THREE.Group[]=[];
  for(const s of [-1,1]){
   const wing=new THREE.Group();wing.position.set(s*2.43,0,0);root.add(wing);leaves.push(wing);
   const sign=s;
   addBox(ctx,wing,2.35,0.16,0.1,[-sign*1.18,0.22,0],0.6,0.02);addBox(ctx,wing,2.35,0.16,0.1,[-sign*1.18,3.65,0],0.65,0.02);
   for(let i=0;i<9;i++){
    const x=-sign*(0.13+i*0.26);addCyl(ctx,wing,0.035,3.15,[x,1.95,0],0.88,10,0.035);
    const tip=ctx.mesh(G.cone(0.09,0.25,8),{tone:1});tip.position.set(x,3.68,0);wing.add(tip);
   }
   for(let y of [0.3,3.55])addBox(ctx,wing,2.34,0.1,0.16,[-sign*1.18,y,0],0.94,0.015);
   for(let i=0;i<3;i++){const x=-sign*(0.42+i*0.48);const scroll=ctx.mesh(at(G.torus(0.24,0.025,8,24,Math.PI*1.6),[x,2.0,0]),{tone:0.9});wing.add(scroll);}
   addRod(ctx,wing,[0,0.25,0],[ -sign*2.35,3.55,0],0.035,0.72,8);
  }
  return {root,grounded:true,update(c){const k=clamp(c.open??0);leaves[0]!.rotation.y=-k*deg(92);leaves[1]!.rotation.y=k*deg(92);}};
 }
});

export const romanArch=defineModel({
 id:'roman-arch',aliases:['triumphal-arch','roman-gateway','stone-triumphal-arch'],
 describe:'A freestanding Roman triumphal arch has one deep vaulted passage, paired engaged columns, carved imposts, a wedge-stone arch ring and a broad sculpted attic.',
 size:'8 m triumphal arch',
 build(ctx){
  const root=new THREE.Group(),R=2.25,spring=3.2;
  // Solid piers frame a visible passage and carry the arch stones.
  for(const s of [-1,1]){
   addBox(ctx,root,1.75,3.35,2.4,[s*(R+0.88),1.675,0],0.67,0.04);
   addBox(ctx,root,2.1,0.32,2.8,[s*(R+0.88),3.38,0],0.96,0.04);
   addColumn(ctx,root,s*(R+0.88),1.24,3.1,0.34,12);addColumn(ctx,root,s*(R+0.88),-1.24,3.1,0.34,12);
   for(let y=0.5;y<3.2;y+=0.3){addBox(ctx,root,1.42,0.035,0.05,[s*(R+0.88),y,1.22],0.46,0.006);}
  }
  addArchBlocks(ctx,root,R,spring,1.25,0.34,0.84,16,0.68);addArchBlocks(ctx,root,R,spring,-1.25,0.34,0.72,16,0.68);
  addBox(ctx,root,7.9,1.15,2.8,[0,6.18,0],0.77,0.04);
  addBox(ctx,root,8.2,0.24,3.0,[0,5.57,0],0.94,0.025);addBox(ctx,root,8.2,0.25,3.0,[0,6.83,0],0.93,0.03);
  for(let x=-3.45;x<=3.46;x+=0.62)addBox(ctx,root,0.08,0.22,2.82,[x,6.18,0],0.5,0.01);
  addBox(ctx,root,1.55,0.36,0.12,[0,6.18,1.47],0.16,0.03);
  for(const s of [-1,1]){addBox(ctx,root,0.15,0.68,0.15,[s*0.55,7.23,0],0.9,0.025);addBox(ctx,root,0.8,0.13,0.17,[s*0.5,7.52,0],0.9,0.02);}
  return {root,grounded:true};
 }
});

export const column=defineModel({
 id:'column',aliases:['classical-column','stone-column','fluted-column'],
 describe:'A freestanding fluted stone column has a stepped plinth, tapered shaft, ringed neck and a carved volute capital with a square abacus.',
 size:'4.5 m column',
 build(ctx){
  const root=new THREE.Group(),r=0.58,h=3.8;
  addBox(ctx,root,1.65,0.24,1.65,[0,0.12,0],0.52,0.035);addBox(ctx,root,1.42,0.18,1.42,[0,0.33,0],0.83,0.025);
  const body=ctx.mesh(G.lathe([[0,0.4],[0.68,0.4],[0.72,0.49],[0.61,0.58],[0.56,0.7],[0.5,h-0.35],[0.57,h-0.2],[0.68,h-0.12],[0.66,h],[0,h]],48),{tone:0.83});root.add(body);
  for(let i=0;i<20;i++){const a=i/20*Math.PI*2;addRod(ctx,root,[Math.cos(a)*0.51,0.75,Math.sin(a)*0.51],[Math.cos(a)*0.51,3.33,Math.sin(a)*0.51],0.018,0.56,6);}
  for(const y of [0.52,3.42,3.62])addCyl(ctx,root,0.66,0.07,[0,y,0],0.98,48,0.66);
  // Ionic volutes and leaf mouldings.
  for(const s of [-1,1]){
   addBox(ctx,root,0.38,0.48,1.22,[s*0.52,3.98,0],0.91,0.05);
   const curl=ctx.mesh(at(G.torus(0.22,0.055,10,32),[s*0.53,4.02,0.45],[90,0,0]),{tone:0.57});root.add(curl);
  }
  addBox(ctx,root,1.78,0.28,1.78,[0,4.38,0],0.95,0.04);
  for(let i=0;i<8;i++){const a=i/8*Math.PI*2;addBox(ctx,root,0.12,0.16,0.12,[Math.cos(a)*0.58,4.58,Math.sin(a)*0.58],0.67,0.02);}
  return {root,grounded:true};
 }
});

export const fountain=defineModel({
 id:'fountain',aliases:['tiered-fountain','public-fountain','water-feature'],
 describe:'A tiered stone fountain rises from a fluted basin, with a carved central pedestal, two scalloped bowls and arcing jets that fall into a rippling pool. `water` animates the spray.',
 controls:{water:'0 dry fountain .. 1 full jets and droplets (default 0.8)'},defaults:{water:0.8},size:'4.5 m fountain',
 build(ctx){
  const root=new THREE.Group();addCyl(ctx,root,2.35,0.38,[0,0.19,0],0.6,64,2.35);addCyl(ctx,root,2.12,0.24,[0,0.5,0],0.9,64,2.12);
  for(let i=0;i<24;i++){const a=i/24*Math.PI*2;addBox(ctx,root,0.14,0.36,0.18,[Math.cos(a)*2.16,0.38,Math.sin(a)*2.16],0.43,0.022,[0,-a*180/Math.PI,0]);}
  const pool=addCyl(ctx,root,1.95,0.11,[0,0.68,0],0.17,64,1.95);
  addCyl(ctx,root,0.52,1.5,[0,1.42,0],0.67,32,0.4);addCyl(ctx,root,0.58,0.18,[0,2.14,0],0.96,32,0.58);
  addCyl(ctx,root,1.38,0.26,[0,2.35,0],0.73,48,0.63);addCyl(ctx,root,1.22,0.12,[0,2.51,0],0.91,48,1.22);
  addCyl(ctx,root,0.34,1.05,[0,3.05,0],0.7,28,0.27);addCyl(ctx,root,0.96,0.2,[0,3.55,0],0.78,40,0.43);addCyl(ctx,root,0.82,0.12,[0,3.68,0],0.96,40,0.82);
  addCyl(ctx,root,0.2,0.55,[0,3.94,0],0.8,24,0.16);const fin=ctx.mesh(G.cone(0.28,0.65,24),{tone:0.95});fin.position.y=4.35;root.add(fin);
  const jets:THREE.Mesh[]=[];for(let i=0;i<12;i++){
   const a=i/12*Math.PI*2,x=Math.cos(a),z=Math.sin(a),start:[number,number,number]=[x*0.46,1.42,z*0.46],mid:[number,number,number]=[x*0.95,2.65,z*0.95],end:[number,number,number]=[x*1.42,0.83,z*1.42];
   const jet=ctx.mesh(G.tube([start,mid,end],0.026,18,6),{tone:1,glow:0.65,glowControl:'water'});root.add(jet);jets.push(jet);
  }
  const drops:THREE.Mesh[]=[];for(let i=0;i<24;i++){const m=ctx.mesh(G.sphere(0.045+(i%3)*0.012,10,7),{tone:1});root.add(m);drops.push(m);}
  return {root,grounded:true,update(c,t){const k=clamp(c.water??0.8);jets.forEach(m=>{m.visible=k>0.02;m.scale.setScalar(Math.max(0.001,k));mat(m).emissiveIntensity=(mat(m).userData.glow as number)*k;});drops.forEach((m,i)=>{const a=i/24*Math.PI*2,r=0.55+((t*0.45+i/24)%1)*1.0;m.visible=k>0.05;m.position.set(Math.cos(a)*r,0.9+Math.sin((t*3+i)*1.3)*k*1.5,Math.sin(a)*r);});mat(pool).userData.controlledWater=k;}};
 }
});

// ================================================================= street furniture
export const parkBench=defineModel({
 id:'park-bench',aliases:['garden-bench','public-bench','wooden-bench'],
 describe:'A park bench has five gently curved timber seat slats, a slatted backrest, cast-iron scroll side frames, armrests and bolted feet.',
 size:'1.8 m bench',
 build(ctx){
  const root=new THREE.Group();
  for(let i=0;i<5;i++)addBox(ctx,root,1.85,0.09,0.13,[0,0.52,-0.27+i*0.135],0.88,0.025,[2,0,0]);
  for(let i=0;i<5;i++)addBox(ctx,root,1.85,0.1,0.14,[0,1.13+i*0.15,-0.62],0.92,0.025,[0,0,0]);
  for(const s of [-1,1]){
   addBox(ctx,root,0.11,0.61,0.12,[s*0.72,0.34,-0.25],0.57,0.025);
   addBox(ctx,root,0.12,1.38,0.12,[s*0.72,0.72,-0.57],0.62,0.025,[0,0,-7]);
   addBox(ctx,root,0.22,0.11,0.72,[s*0.72,1.14,-0.32],0.76,0.035);
   addRod(ctx,root,[s*0.72,0.65,-0.28],[s*0.72,1.18,-0.76],0.055,0.95,10);
   addRod(ctx,root,[s*0.72,1.18,-0.76],[s*0.72,1.35,-0.4],0.05,0.95,10);
   addCyl(ctx,root,0.045,0.035,[s*0.72,0.62,0.25],0.97,12,0.045);
  }
  addBox(ctx,root,2.1,0.08,0.1,[0,0.05,0],0.53,0.015);
  return {root,grounded:true};
 }
});

export const streetLamp=defineModel({
 id:'street-lamp',aliases:['lamp-post','road-lamp','gas-streetlight'],
 describe:'A traditional cast-iron streetlamp has a fluted post, moulded collars, curved swan-neck arm, four-pane lantern and peaked cap. `on` illuminates the lamp.',
 controls:{on:'0 off .. 1 glowing lamp (default 0.8)'},defaults:{on:0.8},size:'5.5 m lamp',
 build(ctx){
  const root=new THREE.Group();addCyl(ctx,root,0.44,0.18,[0,0.09,0],0.49,32,0.44);addCyl(ctx,root,0.32,0.23,[0,0.28,0],0.85,32,0.24);
  const post=ctx.mesh(G.lathe([[0.14,0.4],[0.22,0.52],[0.13,0.76],[0.12,3.8],[0.18,4.0],[0.12,4.2],[0.1,4.5],[0.14,4.66],[0,4.7]],32),{tone:0.66});root.add(post);
  for(let y=0.65;y<4.4;y+=0.45)addCyl(ctx,root,0.145,0.045,[0,y,0],0.94,24,0.145);
  addRod(ctx,root,[0,4.55,0],[0,5.03,0],0.12,0.69,14);addRod(ctx,root,[0,5.02,0],[0.38,5.2,0],0.09,0.74,12);addRod(ctx,root,[0.38,5.2,0],[0.74,5.0,0],0.07,0.75,10);
  addCyl(ctx,root,0.32,0.14,[0.74,4.96,0],0.91,24,0.32);
  for(const s of [-1,1])for(const q of [-1,1])addBox(ctx,root,0.035,0.7,0.035,[0.74+s*0.27,4.58,q*0.27],0.94,0.004);
  const lamp=ctx.mesh(at(G.ellipsoid(0.2,0.31,0.2,20,14),[0.74,4.58,0]),{tone:1,glow:2,glowControl:'on'});root.add(lamp);
  const cap=ctx.mesh(G.cone(0.42,0.42,4),{tone:0.75});cap.rotation.y=deg(45);cap.position.set(0.74,5.45,0);root.add(cap);
  addCyl(ctx,root,0.06,0.24,[0.74,5.68,0],0.98,12,0.06);
  return {root,grounded:true,update(c){mat(lamp).emissiveIntensity=(mat(lamp).userData.glow as number)*clamp(c.on??0.8);}};
 }
});

export const busStop=defineModel({
 id:'bus-stop',aliases:['bus-shelter','bus-station-stop','transit-shelter'],
 describe:'A modern bus shelter has a curved canopy, transparent side panels, a timetable case, route marker, low bench and tactile boarding strip.',
 size:'4.5 m shelter',
 build(ctx){
  const root=new THREE.Group();addBox(ctx,root,4.8,0.14,2.1,[0,0.07,0],0.57,0.025);
  for(const x of [-2.05,2.05])for(const z of [-0.82,0.82])addBox(ctx,root,0.1,2.55,0.1,[x,1.35,z],0.78,0.02);
  // Clear side/back planes are darkened with bright framing members for contrast.
  for(const z of [-0.84,0.84]){const glass=ctx.mesh(at(G.box(3.9,2.2,0.035),[0,1.35,z]),{tone:0.14,rough:0.2});root.add(glass);for(let x=-1.8;x<=1.81;x+=0.64)addBox(ctx,root,0.028,2.2,0.05,[x,1.35,z],0.83,0.005);}
  addBox(ctx,root,0.04,2.2,1.62,[-2.02,1.35,0],0.14,0.01);addBox(ctx,root,0.04,2.2,1.62,[2.02,1.35,0],0.14,0.01);
  for(let i=0;i<9;i++)addBox(ctx,root,0.52,0.18,0.17,[-2.08+i*0.52,2.65,0],0.91,0.03,[0,0,0]);
  addBox(ctx,root,2.15,0.18,0.58,[0,0.72,-0.38],0.58,0.04);for(let x=-0.85;x<=0.86;x+=0.42)addBox(ctx,root,0.12,0.64,0.12,[x,0.38,-0.38],0.7,0.02);
  addBox(ctx,root,0.65,1.5,0.16,[-1.48,1.8,0.94],0.86,0.025);addBox(ctx,root,0.48,1.1,0.04,[-1.48,1.8,1.05],0.13,0.012);
  addBox(ctx,root,0.8,0.2,0.22,[2.25,3.1,0.5],0.92,0.025);addBox(ctx,root,0.08,1.0,0.08,[2.25,2.55,0.5],0.71,0.012);
  for(let i=0;i<7;i++)addBox(ctx,root,0.14,0.018,0.14,[-1.4+i*0.46,0.16,1.25],0.96,0.006);
  return {root,grounded:true};
 }
});

// ================================================================= civic buildings and historic sites
export const schoolBuilding=defineModel({
 id:'school-building',aliases:['schoolhouse','primary-school','school-campus-building'],
 describe:'A two-storey schoolhouse has a broad central entrance, repeated classroom windows, a clock tower, bell cupola, front steps and a flagpole.',
 size:'18 m school building',
 build(ctx){
  const root=new THREE.Group();addBox(ctx,root,13,6.2,7.2,[0,3.1,0],0.64,0.045);addBox(ctx,root,13.6,0.32,7.8,[0,6.35,0],0.91,0.035);
  for(let floor=0;floor<2;floor++)for(let x=-5.2;x<=5.21;x+=1.72)addWindow(ctx,root,[x,1.8+floor*2.65,3.67],0.96,1.45,0,0.45);
  addBox(ctx,root,2.45,3.15,0.24,[0,1.58,3.72],0.16,0.02);addBox(ctx,root,1.5,2.75,0.14,[0,1.4,3.88],0.58,0.025);
  for(let i=0;i<4;i++)addBox(ctx,root,3.3-i*0.28,0.24,1.3,[0,0.12+i*0.24,4.35],0.82,0.035);
  addBox(ctx,root,2.6,2.1,2.7,[0,7.55,0],0.75,0.04);addBox(ctx,root,2.8,0.16,2.9,[0,8.65,0],0.96,0.025);
  addCyl(ctx,root,0.62,0.1,[0,7.84,1.39],0.98,40,0.62);addCyl(ctx,root,0.49,0.08,[0,7.84,1.46],0.13,40,0.49);
  for(let i=0;i<12;i++){const a=i/12*Math.PI*2;addRod(ctx,root,[0,7.84,1.51],[Math.cos(a)*0.47,7.84+Math.sin(a)*0.47,1.51],0.022,0.89,7);}
  const roof=ctx.mesh(G.cone(1.58,1.55,4),{tone:0.84});roof.rotation.y=deg(45);roof.position.set(0,9.46,0);root.add(roof);
  addRod(ctx,root,[6.7,0,2.8],[6.7,10.2,2.8],0.06,0.58,10);addRod(ctx,root,[6.7,9.6,2.8],[7.5,9.6,2.8],0.035,0.94,8);
  for(const x of [-5.9,5.9])addBox(ctx,root,0.55,1.4,0.5,[x,0.7,4.05],0.48,0.03);
  return {root,grounded:true};
 }
});

export const hospitalBuilding=defineModel({
 id:'hospital-building',aliases:['hospital','medical-center-building','clinic-building'],
 describe:'A modern hospital has a central glazed entrance atrium, two windowed patient wings, a rooftop helipad and a large raised medical cross above the main block.',
 size:'24 m hospital',
 build(ctx){
  const root=new THREE.Group();addBox(ctx,root,15,8,6,[0,4,0],0.59,0.045);
  for(const s of [-1,1]){
   addBox(ctx,root,4.3,10.2,6.7,[s*5.5,5.1,-0.15],0.68,0.045);
   for(let y=1.4;y<9.8;y+=1.28)for(let x=-1.55;x<=1.56;x+=1.02)addWindow(ctx,root,[s*5.5+x,y,3.25],0.62,0.8,0,0.3);
   addBox(ctx,root,4.1,0.24,6.5,[s*5.5,10.25,-0.15],0.93,0.03);
  }
  // Glazed entrance atrium, canopy and recessed automatic doors.
  addBox(ctx,root,4.2,6.8,0.18,[0,3.4,3.12],0.12,0.015);
  for(let x=-1.9;x<=1.91;x+=0.55)addBox(ctx,root,0.055,6.65,0.1,[x,3.4,3.24],0.94,0.008);
  addBox(ctx,root,4.8,0.28,1.45,[0,7.05,3.5],0.9,0.04);
  addBox(ctx,root,1.35,2.5,0.16,[0,1.25,3.28],0.17,0.02);addBox(ctx,root,0.07,2.3,0.05,[0,1.25,3.39],0.92,0.009);
  addBox(ctx,root,1.0,0.85,1.0,[0,11.0,0],0.8,0.04);
  addBox(ctx,root,0.52,1.9,0.18,[0,11.2,0.62],1,0.045);addBox(ctx,root,1.9,0.52,0.18,[0,11.2,0.62],1,0.045);
  // Rooftop helipad circle and H markings.
  const ring=ctx.mesh(at(G.torus(1.85,0.055,8,48),[0,10.4,-1.1],[90,0,0]),{tone:0.96});ring.scale.set(1,0.7,1);root.add(ring);
  addBox(ctx,root,0.2,0.035,1.0,[0,10.43,-1.1],0.98,0.006);addBox(ctx,root,0.9,0.035,0.16,[0,10.43,-1.1],0.98,0.006);
  return {root,grounded:true};
 }
});

export const museumBuilding=defineModel({
 id:'museum-building',aliases:['art-museum','classical-museum','museum-facade'],
 describe:'A neoclassical museum has a wide stair approach, six monumental Ionic columns, a triangular sculpted pediment, heavy entablature and bronze double doors.',
 size:'16 m museum facade',
 build(ctx){
  const root=new THREE.Group();addBox(ctx,root,14,5.3,7.4,[0,2.65,-1.1],0.63,0.04);
  for(let i=0;i<5;i++)addBox(ctx,root,14-i*0.48,0.2,8.3-i*0.42,[0,0.1+i*0.2,0],0.7+i*0.055,0.025);
  addBox(ctx,root,12.2,0.44,1.05,[0,5.2,3.25],0.91,0.05);
  const colonnade=new THREE.Group();colonnade.position.y=1;root.add(colonnade);
  for(let x=-5.1;x<=5.11;x+=2.04)addColumn(ctx,colonnade,x,3.15,6.2,0.45,12);
  addBox(ctx,root,13.6,0.44,1.2,[0,7.48,2.82],0.95,0.05);
  const ped=G.extrude([[-6.8,7.7],[6.8,7.7],[0,10.55]],1.0,0.02);root.add(ctx.mesh(at(ped,[0,0,2.8]),{tone:0.81}));
  addBox(ctx,root,2.0,1.15,0.08,[0,8.28,3.36],0.55,0.025);
  for(let i=0;i<7;i++){const x=-0.78+i*0.26;addRod(ctx,root,[x,7.98,3.43],[x,8.54+0.12*Math.sin(i/6*Math.PI),3.43],0.035,0.94,8);}
  addBox(ctx,root,2.5,3.15,0.16,[0,1.68,2.58],0.12,0.02);for(const s of [-1,1])addBox(ctx,root,1.12,2.92,0.12,[s*0.58,1.55,2.7],0.58,0.025);
  for(let x=-5.8;x<=5.81;x+=1.45)addWindow(ctx,root,[x,2.25,2.55],0.72,1.38,0,0.15);
  addBox(ctx,root,15,0.18,8.8,[0,0.09,0],0.47,0.03);
  return {root,grounded:true};
 }
});

export const ancientRuins=defineModel({
 id:'ancient-ruins',aliases:['ruined-temple','broken-columns','classical-ruins'],
 describe:'An ancient temple ruin preserves a broken colonnade, cracked architrave, fallen drum stones and one tall fractured column on an overgrown rubble-strewn foundation.',
 size:'9 m ruin fragment',
 build(ctx){
  const root=new THREE.Group();addBox(ctx,root,9,0.34,5.7,[0,0.17,0],0.48,0.055);
  addBox(ctx,root,8.4,0.26,5.1,[0,0.47,0],0.75,0.04);
  for(const x of [-3.2,-1.1,1.0,3.15]){
   const h=x===1?5.6:(x===-1.1?3.6:4.55);const r=0.34;
   const c=ctx.mesh(G.lathe([[0,0],[r*1.3,0],[r*1.35,0.12],[r*1.08,0.22],[r*0.98,h-0.2],[r*1.32,h-0.1],[r*1.32,h],[0,h]],28),{tone:0.77});c.position.set(x,0.6,0);root.add(c);
   for(let i=0;i<8;i++){const a=i/8*Math.PI*2;addRod(ctx,root,[x+Math.cos(a)*r*0.99,0.85,Math.sin(a)*r*0.99],[x+Math.cos(a)*r*0.99,0.6+h-0.38,Math.sin(a)*r*0.99],0.018,0.49,6);}
   addCyl(ctx,root,r*1.4,0.18,[x,0.69+h,0],0.94,24,r*1.4);
  }
  // Broken lintel resting unevenly on the surviving capitals.
  const lintel=ctx.mesh(roughen(G.rbox(7.4,0.55,0.85,0.12),0.045,2,11),{tone:0.65});lintel.position.set(0,5.37,-0.1);lintel.rotation.z=deg(-3);root.add(lintel);
  const fallen=ctx.mesh(G.cyl(0.44,0.44,1.6,24),{tone:0.82});fallen.rotation.z=deg(90);fallen.position.set(-1.1,0.95,1.22);root.add(fallen);
  for(let i=0;i<18;i++){const r=0.18+(i%3)*0.1,m=ctx.mesh(roughen(G.ellipsoid(r,r*0.55,r*0.8,10,7),0.028,3,i+31),{tone:0.4+(i%4)*0.12});m.position.set(-4.1+(i%6)*1.6,0.45+(i%3)*0.13,1.6+Math.floor(i/6)*0.82);root.add(m);}
  return {root,grounded:true};
 }
});

export const greatWall=defineModel({
 id:'great-wall',aliases:['great-wall-segment','mountain-wall','ancient-defensive-wall'],
 describe:'A great defensive wall climbs over a rocky ridge, with crenellated parapets, sloped masonry faces, a watchtower, arrow slits and a stepped walkway.',
 size:'22 m wall section',
 build(ctx){
  const root=new THREE.Group();
  // A broad, gently rising wall in three linked sections.
  for(let i=0;i<5;i++){
   const z=-8+i*4,y=2.2+0.42*Math.sin(i/4*Math.PI);addBox(ctx,root,2.35,4.4,4.15,[0,y, z],0.63,0.045,[0,0,0]);
   addBox(ctx,root,3.05,0.32,4.2,[0,y+2.35,z],0.89,0.035);
   for(let x=-1.35;x<=1.36;x+=0.46){addBox(ctx,root,0.25,0.48,0.34,[x,y+2.73,z-1.45],0.97,0.02);addBox(ctx,root,0.25,0.48,0.34,[x,y+2.73,z+1.45],0.97,0.02);}
   for(let x=-0.74;x<=0.75;x+=0.74){addBox(ctx,root,0.2,0.7,0.06,[x,y+0.45,z+2.08],0.12,0.025);}
   for(let row=0;row<5;row++)for(let x=-0.95+(row%2)*0.45;x<1;x+=0.9)addBox(ctx,root,0.72,0.035,0.04,[x,y-2+row*0.72,z+2.09],0.43,0.005);
  }
  // Corner watchtower with open battlement crown.
  addBox(ctx,root,3.8,6.2,4.0,[0,5.4,6.2],0.68,0.04);addBox(ctx,root,4.25,0.32,4.45,[0,8.6,6.2],0.95,0.035);
  for(let x=-1.82;x<=1.83;x+=0.48)for(const z of [4.18,8.22])addBox(ctx,root,0.25,0.58,0.34,[x,9.04,z],0.96,0.02);
  for(let y=2;y<8;y+=1.6)for(const s of [-1,1])addBox(ctx,root,0.32,0.8,0.08,[s*1.95,y,8.25],0.13,0.025);
  for(let z=-7;z<=9;z+=1.6){addBox(ctx,root,0.15,0.15,0.75,[1.48,4.8,z],0.75,0.025);}
  return {root,grounded:true};
 }
});

export const observatory=defineModel({
 id:'observatory',aliases:['observatory-dome','astronomy-observatory','planetarium-dome'],
 describe:'A hilltop observatory has a cylindrical stone base, a split metal hemispherical dome, a narrow telescope slit and a long optical tube that tracks the sky. `open` slides the dome halves apart.',
 controls:{open:'0 closed dome .. 1 open observing slit (default 0)'},defaults:{open:0},size:'9 m observatory',
 build(ctx){
  const root=new THREE.Group();addCyl(ctx,root,3.15,4.1,[0,2.05,0],0.68,64,2.85);addCyl(ctx,root,3.2,0.3,[0,4.12,0],0.92,64,3.2);
  for(let i=0;i<16;i++){const a=i/16*Math.PI*2;addBox(ctx,root,0.18,0.85,0.06,[Math.cos(a)*2.86,2.35,Math.sin(a)*2.86],0.15,0.012,[0,-a*180/Math.PI,0]);}
  const shellA=new THREE.Group(),shellB=new THREE.Group();root.add(shellA,shellB);
  const r=3.0,geoA=new THREE.SphereGeometry(r,48,24,0,Math.PI,0,Math.PI/2),geoB=new THREE.SphereGeometry(r,48,24,Math.PI,Math.PI,0,Math.PI/2);
  const a=ctx.mesh(geoA,{tone:0.77}),b=ctx.mesh(geoB,{tone:0.87});a.position.y=4.24;b.position.y=4.24;shellA.add(a);shellB.add(b);
  for(let i=0;i<12;i++){const t=i/12*Math.PI*2,x=Math.cos(t)*2.99,z=Math.sin(t)*2.99;addRod(ctx,shellA,[0,4.3,0],[x,4.3,z],0.025,0.47,8);addRod(ctx,shellB,[0,4.3,0],[x,4.3,z],0.025,0.47,8);}
  // Telescope and equatorial fork are visible through the slit.
  addBox(ctx,root,0.48,2.15,0.1,[0,5.65,2.88],0.08,0.018);
  addCyl(ctx,root,0.18,1.3,[0,4.85,1.1],0.74,20,0.18);
  addRod(ctx,root,[-0.85,5.25,2.72],[1.55,7.25,2.05],0.22,0.82,18);
  addCyl(ctx,root,0.31,0.24,[1.53,7.24,2.05],0.98,24,0.31).rotation.z=deg(48);
  addCyl(ctx,root,0.17,0.2,[-0.86,5.24,2.72],0.5,20,0.17).rotation.z=deg(48);
  addBox(ctx,root,1.2,0.28,0.28,[0,4.75,0],0.48,0.035);
  for(let i=0;i<8;i++){const a=i*Math.PI/4;addBox(ctx,root,0.07,0.55,0.08,[Math.cos(a)*3.1,4.35,Math.sin(a)*3.1],0.93,0.015);}
  return {root,grounded:true,update(c){const k=clamp(c.open??0);shellA.position.x=-0.98*k;shellB.position.x=0.98*k;}};
 }
});

export const launchPad=defineModel({
 id:'launch-pad',aliases:['rocket-launch-pad','spaceport-pad','launch-complex'],
 describe:'A launch pad has a flame trench, four-legged service tower, cross-braced gantry, retracting umbilical arm and a bright exhaust plume. `launch` ignites the plume; `retract` swings the arm away.',
 controls:{launch:'0 engine off .. 1 full ignition plume (default 0)',retract:'0 arm attached .. 1 umbilical arm swung clear (default 0)'},defaults:{launch:0,retract:0},size:'12 m pad',
 build(ctx){
  const root=new THREE.Group();addBox(ctx,root,10,0.55,9,[0,0.28,0],0.48,0.06);
  addBox(ctx,root,4.5,0.35,5.2,[0,0.68,0],0.68,0.04);addBox(ctx,root,2.7,0.28,3.4,[0,0.97,0],0.9,0.035);
  // Four reinforced tower legs and diagonal cross braces.
  const tower=new THREE.Group();root.add(tower);
  for(const s of [-1,1])for(const q of [-1,1])addRod(ctx,tower,[s*2.15,1.0,q*1.65],[s*1.45,10.2,q*1.18],0.16,0.66,16);
  for(let y=1.7;y<10;y+=1.5){const f=(y-1)/(10.2-1);const w=lerp(2.15,1.45,f),d=lerp(1.65,1.18,f);for(const s of [-1,1]){addRod(ctx,tower,[-w,y,s*d],[w,y,s*d],0.065,0.9,10);addRod(ctx,tower,[s*w,y,-d],[s*w,y,d],0.065,0.9,10);if(y<9){const y2=y+1.5,f2=(y2-1)/(10.2-1),w2=lerp(2.15,1.45,f2),d2=lerp(1.65,1.18,f2);addRod(ctx,tower,[-w,y,s*d],[w2,y2,s*d2],0.05,0.52,8);addRod(ctx,tower,[w,y,s*d],[-w2,y2,s*d2],0.05,0.52,8);}}
   addBox(ctx,tower,4.5-0.2*f,0.13,3.6-0.2*f,[0,y+0.08,0],0.76,0.02);
  }
  const arm=new THREE.Group();arm.position.set(-1.55,7.4,0);tower.add(arm);addRod(ctx,arm,[0,0,0],[2.1,0,0],0.14,0.95,14);addRod(ctx,arm,[2.1,0,0],[2.55,-0.4,0],0.12,0.86,12);addCyl(ctx,arm,0.17,0.58,[2.48,-0.42,0],1,18,0.17);
  for(let i=0;i<4;i++){const x=-3+i*2;addCyl(ctx,root,0.11,0.18,[x,0.72,-3.0],0.92,14,0.11);}
  const plume=ctx.mesh(G.lathe([[0,0],[0.32,-0.1],[0.56,-0.55],[0.5,-1.5],[0.34,-2.65],[0.18,-3.6],[0,-4.2]],28),{tone:1,glow:2.8,glowControl:'launch'});plume.position.set(0,0.95,0);root.add(plume);
  const flameCore=ctx.mesh(G.cone(0.32,2.6,24),{tone:1,glow:4,glowControl:'launch'});flameCore.position.set(0,-0.2,0);root.add(flameCore);
  return {root,grounded:true,update(c,t){const l=clamp(c.launch??0),r=clamp(c.retract??0);arm.rotation.z=lerp(0,deg(84),r);plume.visible=l>0.01;flameCore.visible=l>0.01;plume.scale.y=Math.max(0.001,l*(1+0.09*Math.sin(t*37)));plume.scale.x=plume.scale.z=lerp(0.3,1,l);flameCore.scale.y=Math.max(0.001,l*(0.9+0.1*Math.sin(t*51)));for(const m of [plume,flameCore])mat(m).emissiveIntensity=(mat(m).userData.glow as number)*l;}};
 }
});
