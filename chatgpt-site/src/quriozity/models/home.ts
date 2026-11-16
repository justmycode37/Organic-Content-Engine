// Home, kitchen, furniture and bathroom model pack.
import * as THREE from 'three';
import {G,at,deg,lerp,clamp} from '../kit.ts';
import {defineModel} from './types.ts';

type V3=[number,number,number];
const rb=(ctx:any,w:number,h:number,d:number,p:V3,tone=0.8,r?:number)=>ctx.mesh(at(G.rbox(w,h,d,r),p),{tone});
const bx=(ctx:any,w:number,h:number,d:number,p:V3,tone=0.8)=>ctx.mesh(at(G.box(w,h,d),p),{tone});
const cy=(ctx:any,r:number,h:number,p:V3,tone=0.8,seg=32)=>ctx.mesh(at(G.cyl(r,r,h,seg),p),{tone});
const ring=(ctx:any,R:number,r:number,p:V3,tone=0.8,rot:V3=[0,0,0])=>ctx.mesh(at(G.torus(R,r,12,48),p,rot),{tone});
const tube=(ctx:any,pts:V3[],r:number,tone=0.8)=>ctx.mesh(G.tube(pts,r,32,10),{tone});
const turn=(ctx:any,profile:[number,number][],p:V3,tone=0.8,seg=40)=>ctx.mesh(at(G.lathe(profile,seg),p),{tone});
const frontDisc=(ctx:any,r:number,depth:number,p:V3,tone=0.8)=>ctx.mesh(at(G.cyl(r,r,depth,40),p,[90,0,0]),{tone});

// ---------------------------------------------------------------- furniture
export const sofa=defineModel({
 id:'sofa',aliases:['couch','settee','loveseat'],
 describe:'A three-seat sofa with thick rolled arms, separate seat and back cushions, stitched piping and short timber feet. `sit` gives the cushions a gentle occupied sag.',
 controls:{sit:'0 empty .. 1 gently compressed'},defaults:{sit:0},size:'2.1 m wide',
 build(ctx){
  const root=new THREE.Group();
  root.add(rb(ctx,1.98,0.24,0.78,[0,0.34,-0.02],0.52,0.08));
  root.add(rb(ctx,1.96,0.56,0.24,[0,0.67,-0.31],0.7,0.09));
  for(const s of [-1,1]){
   root.add(rb(ctx,0.27,0.58,0.82,[s*0.88,0.49,0.03],0.86,0.09));
   root.add(rb(ctx,0.23,0.2,0.68,[s*0.88,0.82,0.0],0.94,0.09));
   for(const z of [-0.3,0.3]){
    root.add(turn(ctx,[[0.055,0],[0.06,0.012],[0.05,0.055],[0.035,0.075],[0,0.078]],[s*0.78,0,z],0.48,16));
   }
  }
  const seats:THREE.Mesh[]=[];
  for(let i=0;i<3;i++){
   const m=rb(ctx,0.53,0.18,0.56,[(i-1)*0.57,0.57,0.04],0.98,0.07);root.add(m);seats.push(m);
   root.add(tube(ctx,[[ (i-1)*0.57-0.22,0.66,0.32],[(i-1)*0.57+0.22,0.66,0.32]],0.007,0.52));
   const b=rb(ctx,0.53,0.38,0.2,[(i-1)*0.57,0.9,-0.25],0.9,0.08);b.rotation.x=deg(-7);root.add(b);
   for(const x of [-0.15,0.15])root.add(cy(ctx,0.009,0.012,[(i-1)*0.57+x,0.91,-0.14],0.48,10));
  }
  for(const x of [-0.82,0.82])for(const z of [-0.29,0.32])root.add(turn(ctx,[[0.025,0],[0.035,0.02],[0.028,0.13],[0.022,0.17],[0,0.17]],[x,0,z],0.62,16));
  return {root,grounded:true,update(c){const k=clamp(c.sit??0);seats.forEach((m,i)=>{m.position.y=-0.055*k*(i===1?1:0.78);m.scale.y=1-0.12*k;});}};
 }
});

export const armchair=defineModel({
 id:'armchair',aliases:['easy-chair','lounge-chair','reading-chair'],
 describe:'A deep upholstered armchair with a tall tufted back, broad padded arms, a loose seat cushion and four tapered feet. `sit` sinks the seat slightly.',
 controls:{sit:'0 empty .. 1 occupied'},defaults:{sit:0},size:'0.9 m wide',
 build(ctx){
  const root=new THREE.Group(),seat=rb(ctx,0.66,0.18,0.62,[0,0.46,0.05],0.97,0.08);root.add(seat);
  root.add(rb(ctx,0.72,0.6,0.22,[0,0.82,-0.23],0.78,0.09));
  for(const s of [-1,1]){
   root.add(rb(ctx,0.2,0.44,0.68,[s*0.42,0.55,0.04],0.88,0.08));
   root.add(rb(ctx,0.19,0.16,0.59,[s*0.42,0.79,0.02],0.95,0.075));
   for(const z of [-0.35,0.35])root.add(turn(ctx,[[0.035,0],[0.046,0.02],[0.032,0.14],[0.024,0.17],[0,0.17]],[s*0.31,0,z],0.58,16));
  }
  for(const x of [-0.3,0,0.3])root.add(cy(ctx,0.012,0.014,[x,0.83,-0.105],0.48,10));
  for(const x of [-0.32,0.32])for(const z of [-0.23,0.29])root.add(turn(ctx,[[0.022,0],[0.03,0.02],[0.022,0.16],[0,0.16]],[x,0,z],0.58,16));
  return {root,grounded:true,update(c){const k=clamp(c.sit??0);seat.position.y=-0.06*k;seat.scale.y=1-0.12*k;}};
 }
});

export const diningTable=defineModel({
 id:'dining-table',aliases:['dinner-table','kitchen-table','dining-set-table'],
 describe:'A solid dining table with a thick bevelled timber top, apron rails, four tapered legs and visible corner joinery. `height` raises the table between coffee and dining height.',
 controls:{height:'0 low coffee table .. 1 dining height (default 1)'},defaults:{height:1},size:'1.6 m long',
 build(ctx){
  const root=new THREE.Group(),frame=new THREE.Group();root.add(frame);
  frame.add(rb(ctx,1.62,0.09,0.92,[0,0.73,0],0.98,0.035));
  frame.add(rb(ctx,1.34,0.12,0.66,[0,0.62,-0.02],0.56,0.025));
  for(const x of [-0.66,0.66])for(const z of [-0.34,0.34]){
   frame.add(turn(ctx,[[0.035,0],[0.052,0.02],[0.058,0.18],[0.047,0.42],[0.052,0.68],[0.045,0.73],[0,0.73]],[x,0,z],0.67,20));
   frame.add(rb(ctx,0.1,0.09,0.1,[x,0.67,z],0.86,0.018));
  }
  for(const z of [-0.31,0.31])frame.add(bx(ctx,1.2,0.06,0.035,[0,0.58,z],0.74));
  for(const x of [-0.63,0.63])frame.add(bx(ctx,0.035,0.06,0.58,[x,0.58,0],0.74));
  return {root,grounded:true,anchors:{top:[0,0.79,0]},update(c){const k=clamp(c.height??1);frame.scale.y=lerp(0.62,1,k);}};
 }
});

export const bookshelf=defineModel({
 id:'bookshelf',aliases:['bookcase','shelving-unit','shelf-unit'],
 describe:'A tall open bookcase with five shelves, thick side stiles, an inset back and tightly packed books with varied spines and a few leaning volumes.',
 size:'1.2 m wide, 1.9 m tall',
 build(ctx){
  const root=new THREE.Group();
  root.add(rb(ctx,1.12,1.86,0.08,[0,0.95,-0.25],0.48,0.025));
  for(const x of [-0.57,0.57])root.add(rb(ctx,0.09,1.9,0.5,[x,0.95,0],0.88,0.025));
  root.add(rb(ctx,1.23,0.08,0.54,[0,1.91,0],0.96,0.03));
  root.add(rb(ctx,1.23,0.1,0.55,[0,0.06,0],0.6,0.025));
  for(let j=0;j<4;j++){
   const y=0.43+j*0.36;
   root.add(rb(ctx,1.16,0.065,0.53,[0,y,0],0.92,0.02));
   for(let i=0;i<8;i++){
    const w=0.08+(i%3)*0.012,h=0.24+((i*7+j*3)%5)*0.022,x=-0.48+i*0.123;
    const book=rb(ctx,w,h,0.18,[x,y+0.035+h/2,-0.04],i%2?0.72:0.96,0.006);root.add(book);
    root.add(bx(ctx,w*0.62,0.012,0.012,[x,y+0.06+h*0.68,0.055],0.42));
    root.add(bx(ctx,w*0.52,0.01,0.012,[x,y+0.06+h*0.75,0.055],0.54));
   }
   for(let i=0;i<3;i++){
    const h=0.27+i*0.03;const x=0.31+i*0.09;const b=rb(ctx,0.075,h,0.18,[x,y+0.035+h/2,-0.04],0.85,0.006);b.rotation.z=deg((i-1)*7);root.add(b);
   }
  }
  return {root,grounded:true,anchors:{top:[0,1.99,0]}};
 }
});

export const wardrobe=defineModel({
 id:'wardrobe',aliases:['closet','armoire','clothes-cupboard'],
 describe:'A full-height double-door wardrobe with a moulded cornice and plinth, centre seam, paired metal pulls, panelled doors and short feet.',
 size:'1.3 m wide, 2.1 m tall',
 build(ctx){
  const root=new THREE.Group();
  root.add(rb(ctx,1.28,2.04,0.68,[0,1.04,-0.02],0.58,0.045));
  root.add(rb(ctx,1.4,0.13,0.76,[0,2.13,-0.02],0.94,0.035));
  root.add(rb(ctx,1.36,0.12,0.73,[0,0.12,-0.02],0.46,0.025));
  for(const s of [-1,1]){
   root.add(rb(ctx,0.59,1.78,0.035,[s*0.3,1.1,0.34],0.9,0.025));
   root.add(rb(ctx,0.48,1.62,0.018,[s*0.3,1.1,0.37],0.68,0.012));
   for(const y of [0.35,1.85])root.add(rb(ctx,0.48,0.025,0.025,[s*0.3,y,0.39],0.97,0.008));
   root.add(cy(ctx,0.018,0.02,[s*0.22,1.12,0.4],0.98,20));
   root.add(cy(ctx,0.009,0.16,[s*0.22,1.04,0.42],0.8,16));
   for(const z of [-0.31,0.28])root.add(turn(ctx,[[0.03,0],[0.042,0.02],[0.034,0.15],[0,0.15]],[s*0.52,0,z],0.62,16));
  }
  root.add(bx(ctx,0.012,1.78,0.02,[0,1.1,0.39],0.35));
  return {root,grounded:true};
 }
});

// ---------------------------------------------------------------- lighting
export const floorLamp=defineModel({
 id:'floor-lamp',aliases:['standing-lamp','standard-lamp','reading-floor-light'],
 describe:'A slender standing lamp with a weighted circular base, turned metal stem, pull chain and a tapered fabric shade that glows when switched on.',
 controls:{light:'0 off .. 1 on (default 0.8)'},defaults:{light:0.8},size:'1.7 m tall',
 build(ctx){
  const root=new THREE.Group();
  root.add(turn(ctx,[[0,0],[0.22,0],[0.25,0.025],[0.22,0.06],[0.12,0.09],[0,0.1]],[0,0,0],0.72));
  root.add(turn(ctx,[[0.055,0.08],[0.043,0.13],[0.033,0.22],[0.025,0.65],[0.026,1.35],[0.04,1.42],[0.035,1.48],[0,1.48]],[0,0,0],0.88,24));
  root.add(turn(ctx,[[0.11,1.37],[0.19,1.42],[0.24,1.67],[0.23,1.7],[0.14,1.62],[0.06,1.5],[0,1.49]],[0,0,0],0.9,32));
  root.add(turn(ctx,[[0.13,1.43],[0.17,1.48],[0.21,1.65],[0.2,1.67],[0.12,1.58],[0.05,1.5],[0,1.5]],[0,0,0],1,32));
  root.add(ring(ctx,0.23,0.012,[0,1.68,0],0.58,[90,0,0]));
  const bulb=ctx.mesh(G.sphere(0.055,20,12),{tone:1,glow:2.1,glowControl:'light'});bulb.position.set(0,1.48,0);root.add(bulb);
  const chain=tube(ctx,[[0.13,1.44,0],[0.17,1.32,0],[0.17,1.22,0]],0.003,0.54);root.add(chain);
  return {root,grounded:true};
 }
});

export const deskLamp=defineModel({
 id:'desk-lamp',aliases:['task-light','architect-lamp','anglepoise-lamp'],
 describe:'An adjustable architect desk lamp with a weighted round base, two hinged arm segments, visible pivot knobs and a deep conical shade; `aim` tilts the head and `light` glows the bulb.',
 controls:{aim:'0 upright .. 1 extended forward',light:'0 off .. 1 on (default 0.8)'},defaults:{aim:0.45,light:0.8},size:'0.6 m tall',
 build(ctx){
  const root=new THREE.Group(),arm1=new THREE.Group(),arm2=new THREE.Group(),head=new THREE.Group();
  root.add(turn(ctx,[[0,0],[0.14,0],[0.17,0.025],[0.14,0.055],[0,0.06]],[0,0,0],0.74));
  root.add(cy(ctx,0.055,0.035,[0,0.08,0],0.52));
  arm1.position.set(0,0.12,0);root.add(arm1);
  arm1.add(tube(ctx,[[0,0,0],[0,0.27,0.02]],0.018,0.85));
  arm1.add(arm2);arm2.position.set(0,0.27,0.02);
  arm2.add(tube(ctx,[[0,0,0],[0,0.24,0]],0.015,0.85));
  for(const [g,y] of [[arm1,0],[arm2,0.24]] as [THREE.Group,number][]){
   g.add(cy(ctx,0.04,0.025,[0,y,0],0.98,24));
   g.add(cy(ctx,0.012,0.03,[0,y,0.02],0.48,16));
  }
  head.position.set(0,0.24,0);arm2.add(head);
  head.add(turn(ctx,[[0.16,0],[0.17,0.025],[0.12,0.15],[0.09,0.21],[0,0.22]],[0,0,0],0.93,32));
  head.add(turn(ctx,[[0.12,0.02],[0.1,0.12],[0.07,0.19],[0,0.2]],[0,0,0],0.72,32));
  const bulb=ctx.mesh(at(G.sphere(0.055,20,12),[0,-0.02,0]),{tone:1,glow:2.4,glowControl:'light'});head.add(bulb);
  return {root,grounded:true,update(c){const a=clamp(c.aim??0.45);arm1.rotation.z=lerp(deg(-8),deg(-47),a);arm2.rotation.z=lerp(deg(65),deg(25),a);head.rotation.z=lerp(deg(-45),deg(-5),a);}};
 }
});

// ---------------------------------------------------------------- kitchen appliances
export const fridge=defineModel({
 id:'fridge',aliases:['refrigerator','icebox','cold-storage'],
 describe:'A tall refrigerator with separate freezer seam, black gasket, recessed handle and interior shelves revealed as the door swings open on its left hinge. `open` 0 closed .. 1 fully open.',
 controls:{open:'0 closed .. 1 door open'},defaults:{open:0},size:'0.85 m wide, 1.9 m tall',
 build(ctx){
  const root=new THREE.Group();
  root.add(rb(ctx,0.82,1.84,0.72,[0,0.95,-0.02],0.68,0.035));
  root.add(rb(ctx,0.77,1.78,0.04,[0,0.95,-0.38],0.25,0.018));
  for(const y of [0.12,1.35,1.88])root.add(rb(ctx,0.8,0.035,0.76,[0,y,-0.02],0.84,0.012));
  const shelves:THREE.Group[]=[];
  for(let i=0;i<4;i++){
   const shelf=new THREE.Group();shelf.position.set(0,0.45+i*0.22,-0.03);root.add(shelf);shelves.push(shelf);
   shelf.add(rb(ctx,0.68,0.018,0.53,[0,0,0],0.94,0.006));
   shelf.add(bx(ctx,0.68,0.045,0.018,[0,0.035,0.25],0.58));
  }
  root.add(rb(ctx,0.72,0.02,0.22,[0,0.17,-0.02],0.92,0.01));
  // Door local front is +z; pivot at the left edge.
  const door=new THREE.Group();door.position.set(-0.41,0,0.39);root.add(door);
  door.add(rb(ctx,0.8,1.78,0.11,[0.4,0.95,0.04],0.96,0.035));
  door.add(rb(ctx,0.73,1.7,0.025,[0.4,0.95,0.105],0.79,0.02));
  door.add(rb(ctx,0.025,1.72,0.025,[0.02,0.95,0.11],0.4,0.008));
  door.add(rb(ctx,0.035,0.55,0.05,[0.69,0.9,0.13],0.3,0.015));
  for(const y of [0.23,0.5,0.77])door.add(rb(ctx,0.63,0.018,0.12,[0.4,y,0.15],0.9,0.008));
  for(const y of [0.2,0.75,1.31,1.75])root.add(cy(ctx,0.04,0.025,[-0.38,y,-0.38],0.48,16));
  return {root,grounded:true,update(c){door.rotation.y=deg(105*clamp(c.open??0));}};
 }
});

export const oven=defineModel({
 id:'oven',aliases:['cooker','range-cooker','stove-oven'],
 describe:'A freestanding oven and four-burner hob with cast-iron rings, front control knobs, a black glass door window and a wide tubular handle.',
 size:'0.6 m wide',
 build(ctx){
  const root=new THREE.Group();
  root.add(rb(ctx,0.62,0.88,0.62,[0,0.48,0],0.7,0.04));
  root.add(rb(ctx,0.64,0.1,0.66,[0,0.95,0],0.94,0.025));
  // hob and concentric burner rings
  for(const x of [-0.19,0.19])for(const z of [-0.18,0.18]){
   root.add(ring(ctx,0.09,0.012,[x,1.01,z],0.4,[90,0,0]));
   root.add(ring(ctx,0.058,0.01,[x,1.015,z],0.8,[90,0,0]));
   root.add(cy(ctx,0.034,0.014,[x,1.014,z],0.58));
  }
  root.add(rb(ctx,0.55,0.5,0.035,[0,0.51,0.324],0.86,0.025));
  root.add(rb(ctx,0.44,0.32,0.025,[0,0.51,0.35],0.16,0.03));
  root.add(rb(ctx,0.5,0.08,0.045,[0,0.78,0.37],0.42,0.025));
  for(const x of [-0.22,0,0.22]){
   root.add(cy(ctx,0.05,0.035,[x,0.9,0.37],0.9,24));
   root.add(bx(ctx,0.012,0.045,0.012,[x,0.96,0.395],0.3));
  }
  for(const x of [-0.22,0.22])root.add(cy(ctx,0.018,0.025,[x,0.09,0],0.28,16));
  return {root,grounded:true,anchors:{top:[0,1,0]}};
 }
});

export const microwave=defineModel({
 id:'microwave',aliases:['microwave-oven','microwave-cooker'],
 describe:'A countertop microwave with a hinged dark viewing window, perforated safety screen, right-side keypad, rotary timer dial and bright interior lamp.',
 controls:{open:'0 shut .. 1 door swung open',light:'0 dark .. 1 inside lamp'},defaults:{open:0,light:0.6},size:'0.5 m wide',
 build(ctx){
  const root=new THREE.Group();
  root.add(rb(ctx,0.52,0.31,0.38,[0,0.2,0],0.78,0.04));
  root.add(rb(ctx,0.43,0.23,0.018,[0,0.2,0.2],0.18,0.018));
  root.add(rb(ctx,0.38,0.19,0.025,[0,0.2,0.22],0.44,0.015));
  const lit=rb(ctx,0.025,0.11,0.015,[0.12,0.2,0.24],0.98,0.006);const mat=lit.material as THREE.MeshStandardMaterial;mat.emissiveIntensity=0.4;mat.emissive.set('#ffffff');root.add(lit);
  const door=new THREE.Group();door.position.set(-0.2,0.2,0.2);root.add(door);
  door.add(rb(ctx,0.42,0.25,0.035,[0.21,0,0.025],0.93,0.018));
  door.add(rb(ctx,0.27,0.14,0.012,[0.17,0,0.05],0.12,0.012));
  for(let i=0;i<7;i++)for(let j=0;j<5;j++)door.add(cy(ctx,0.003,0.002,[0.08+i*0.025,-0.045+j*0.022,0.058],0.48,8));
  for(let i=0;i<3;i++)for(let j=0;j<4;j++)door.add(rb(ctx,0.045,0.028,0.012,[0.39+i%2*0.06,-0.07+Math.floor(i/2)*0.06+j*0.045,0.035],0.88,0.006));
  const dial=ctx.mesh(at(G.cyl(0.043,0.043,0.025,24),[0.23,0.2,0.23],[90,0,0]),{tone:0.92});root.add(dial);
  return {root,grounded:true,update(c){door.rotation.y=-deg(105*clamp(c.open??0));lit.visible=(c.light??0.6)>0.01;}};
 }
});

export const kettle=defineModel({
 id:'kettle',aliases:['tea-kettle','electric-kettle','teapot-kettle'],
 describe:'A polished electric kettle with a rounded metal body, hinged lid, curved pouring spout, large loop handle, base ring and rising animated steam. `boil` controls steam.',
 controls:{boil:'0 cold .. 1 boiling'},defaults:{boil:0.65},size:'0.25 m tall',
 build(ctx){
  const root=new THREE.Group();
  root.add(turn(ctx,[[0,0.035],[0.09,0.035],[0.13,0.07],[0.15,0.15],[0.14,0.24],[0.1,0.3],[0.04,0.33],[0,0.33]],[0,0,0],0.9,44));
  root.add(ring(ctx,0.125,0.015,[0,0.055,0],0.48,[90,0,0]));
  root.add(turn(ctx,[[0,0.32],[0.06,0.32],[0.09,0.34],[0.065,0.36],[0,0.36]],[0,0,0],0.78,32));
  root.add(cy(ctx,0.035,0.018,[0,0.375,0],0.92));
  // spout leans forward and up
  const spout=ctx.mesh(at(G.lathe([[0.032,0],[0.05,0.015],[0.047,0.045],[0.035,0.1],[0.018,0.16],[0,0.165]],24),[0,0.13,0.12],[-25,0,0]),{tone:0.9});root.add(spout);
  root.add(tube(ctx,[[0.105,0.28,-0.01],[0.18,0.31,-0.015],[0.205,0.27,-0.015],[0.19,0.13,-0.015],[0.12,0.09,-0.015]],0.018,0.8));
  const steam=new THREE.Group();steam.position.set(0,0.39,0.12);root.add(steam);
  const puffs:THREE.Mesh[]=[];
  for(let i=0;i<3;i++){const m=ctx.mesh(G.sphere(0.022+i*0.004,16,10),{tone:0.9});m.position.set(Math.sin(i*2)*0.012,i*0.05,0);steam.add(m);puffs.push(m);}
  return {root,grounded:true,update(c,t){const b=clamp(c.boil??0.65);steam.visible=b>0.02;puffs.forEach((p,i)=>{p.position.y=i*0.05+((t*0.18+i*0.31)%0.16);p.position.x=Math.sin(t*2+i*1.8)*0.025;p.scale.setScalar(b*(0.6+0.4*Math.sin(t*6+i)));});}};
 }
});

export const toaster=defineModel({
 id:'toaster',aliases:['bread-toaster','pop-up-toaster'],
 describe:'A two-slot chrome toaster with deep bread slots, side lever, browning dial, crumb tray and two golden toast slices that spring up with `toast`.',
 controls:{toast:'0 down .. 1 popped up',browning:'0 pale .. 1 dark'},defaults:{toast:0.65,browning:0.55},size:'0.3 m wide',
 build(ctx){
  const root=new THREE.Group();
  root.add(rb(ctx,0.34,0.22,0.24,[0,0.15,0],0.9,0.055));
  root.add(rb(ctx,0.29,0.06,0.2,[0,0.27,0],0.97,0.025));
  for(const x of [-0.075,0.075]){
   root.add(rb(ctx,0.045,0.012,0.19,[x,0.306,-0.005],0.15,0.006));
   const toast=rb(ctx,0.052,0.18,0.018,[x,0.39,-0.005],0.72,0.016);root.add(toast);
   const crust=rb(ctx,0.058,0.19,0.014,[x,0.39,-0.015],0.95,0.02);root.add(crust);
   (toast as any).userData={toast:true};(crust as any).userData={toast:true};
  }
  root.add(rb(ctx,0.035,0.07,0.025,[0.19,0.2,0.015],0.48,0.01));
  root.add(cy(ctx,0.035,0.028,[0.2,0.17,0.04],0.2,24));
  root.add(bx(ctx,0.008,0.045,0.01,[0.2,0.17,0.058],0.96));
  root.add(rb(ctx,0.2,0.018,0.12,[0,0.025,-0.01],0.58,0.006));
  const slices=root.children.filter(o=>o instanceof THREE.Mesh && (o as THREE.Mesh).userData.toast) as THREE.Mesh[];
  const toastColors=slices.map(m=>(m.material as THREE.MeshStandardMaterial).color.clone());
  return {root,grounded:true,update(c){const k=clamp(c.toast??0.65),brown=clamp(c.browning??0.55);for(let i=0;i<slices.length;i++){const m=slices[i]!;m.position.y=lerp(0,0.12,k);(m.material as THREE.MeshStandardMaterial).color.copy(toastColors[i]!).multiplyScalar(lerp(1,0.64,brown));}}};
 }
});

export const coffeeMachine=defineModel({
 id:'coffee-machine',aliases:['espresso-machine','coffee-maker','espresso-maker'],
 describe:'A compact espresso machine with a water tank, metal brew head, locking portafilter, twin spouts, drip grate, cup and three tactile buttons. `brew` draws a coffee stream.',
 controls:{brew:'0 idle .. 1 pouring'},defaults:{brew:0},size:'0.35 m tall',
 build(ctx){
  const root=new THREE.Group();
  root.add(rb(ctx,0.34,0.32,0.26,[0,0.18,-0.015],0.72,0.04));
  root.add(rb(ctx,0.29,0.31,0.05,[0,0.36,-0.1],0.94,0.025));
  root.add(rb(ctx,0.21,0.16,0.025,[0,0.51,-0.03],0.22,0.02));
  for(const x of [-0.07,0,0.07])root.add(cy(ctx,0.022,0.012,[x,0.58,0.0],0.98,18));
  root.add(rb(ctx,0.16,0.08,0.1,[0,0.28,0.12],0.48,0.02));
  root.add(cy(ctx,0.03,0.035,[0,0.22,0.18],0.25,24));
  root.add(tube(ctx,[[0,0.24,0.17],[0,0.19,0.18],[0.08,0.17,0.18]],0.012,0.7));
  // portafilter handle and twin outlets
  root.add(cy(ctx,0.075,0.03,[0,0.33,0.15],0.66,32));
  root.add(tube(ctx,[[0,0.33,0.17],[0,0.29,0.24],[0,0.28,0.34]],0.018,0.82));
  for(const x of [-0.04,0.04])root.add(turn(ctx,[[0.006,0],[0.008,0.03],[0.006,0.045],[0,0.045]],[x,0.25,0.18],0.75,12));
  root.add(rb(ctx,0.27,0.025,0.23,[0,0.04,0.04],0.86,0.01));
  for(let i=0;i<6;i++)root.add(bx(ctx,0.012,0.006,0.18,[-0.1+i*0.04,0.057,0.04],0.36));
  const cup=new THREE.Group();cup.position.set(0,0.07,0.25);root.add(cup);
  cup.add(turn(ctx,[[0.045,0],[0.048,0.008],[0.055,0.08],[0.05,0.085],[0,0.085]],[0,0,0],0.92,24));
  cup.add(tube(ctx,[[0.05,0.06,0],[0.085,0.07,0],[0.09,0.03,0],[0.05,0.025,0]],0.007,0.82));
  const coffee=cy(ctx,0.019,0.001,[0,0.02,0.18],0.28,20);root.add(coffee);
  return {root,grounded:true,update(c){const b=clamp(c.brew??0);coffee.visible=b>0.03;coffee.scale.y=b*22;}};
 }
});

export const washingMachine=defineModel({
 id:'washing-machine',aliases:['washer','laundry-machine','front-loader'],
 describe:'A front-loading washing machine with a thick circular chrome porthole, dark glass door, perforated spinning drum, detergent drawer and selector dial. `spin` turns the drum.',
 controls:{spin:'0 stopped .. 1 fast spin'},defaults:{spin:0.5},size:'0.65 m wide',
 build(ctx){
  const root=new THREE.Group();
  root.add(rb(ctx,0.64,0.82,0.62,[0,0.44,0],0.72,0.045));
  root.add(rb(ctx,0.56,0.07,0.035,[-0.02,0.76,0.325],0.94,0.015));
  root.add(bx(ctx,0.11,0.025,0.012,[-0.19,0.77,0.35],0.3));
  for(let i=0;i<3;i++)root.add(bx(ctx,0.035,0.012,0.012,[-0.21+i*0.04,0.77,0.36],0.9));
  const dial=ctx.mesh(at(G.cyl(0.055,0.055,0.025,32),[0.19,0.77,0.35],[90,0,0]),{tone:0.94});root.add(dial);
  const ringGroup=new THREE.Group();ringGroup.position.set(0,0.43,0.33);root.add(ringGroup);
  ringGroup.add(ring(ctx,0.205,0.028,[0,0,0],0.98));
  ringGroup.add(ring(ctx,0.166,0.009,[0,0,0.02],0.54));
  ringGroup.add(frontDisc(ctx,0.16,0.018,[0,0,0.018],0.16));
  const drum=new THREE.Group();drum.position.z=-0.01;ringGroup.add(drum);
  drum.add(ring(ctx,0.105,0.012,[0,0,-0.012],0.68));
  for(let i=0;i<8;i++){
   const a=i*Math.PI/4;
   const d=rb(ctx,0.018,0.11,0.018,[Math.cos(a)*0.073,Math.sin(a)*0.073,-0.005],0.72,0.007);d.rotation.z=a;drum.add(d);
   for(let j=0;j<3;j++)drum.add(cy(ctx,0.004,0.004,[Math.cos(a)*(0.075+j*0.019),Math.sin(a)*(0.075+j*0.019),0.006],0.9,8));
  }
  for(const x of [-0.22,0.22])root.add(turn(ctx,[[0.035,0],[0.045,0.02],[0.032,0.13],[0.026,0.17],[0,0.17]],[x,0,-0.23],0.4,16));
  return {root,grounded:true,update(c,t){drum.rotation.z=t*lerp(0.6,20,clamp(c.spin??0.5));}};
 }
});

export const sink=defineModel({
 id:'sink',aliases:['washbasin','bathroom-sink','kitchen-sink'],
 describe:'A deep inset sink with a raised counter rim, oval basin, central drain, overflow slots and a high arched mixer tap with two handles.',
 controls:{water:'0 off .. 1 running'},defaults:{water:0},size:'0.7 m wide',
 build(ctx){
  const root=new THREE.Group();
  for(const x of [-0.345,0.345])root.add(rb(ctx,0.07,0.1,0.55,[x,0.84,0],0.96,0.025));
  for(const z of [-0.235,0.235])root.add(rb(ctx,0.62,0.1,0.08,[0,0.84,z],0.96,0.025));
  root.add(rb(ctx,0.66,0.03,0.46,[0,0.77,0],0.54,0.02));
  const basin=ctx.mesh(at(G.ellipsoid(0.27,0.02,0.18,40,20),[0,0.83,0.035]),{tone:0.16});root.add(basin);
  root.add(ctx.mesh(at(G.torus(0.22,0.012,12,48),[0,0.865,0.035],[90,0,0],[1.25,0.83,1]),{tone:0.98}));
  root.add(ctx.mesh(at(G.ellipsoid(0.27,0.006,0.18,40,20),[0,0.91,0.035]),{tone:0.04}));
  root.add(ctx.mesh(at(G.torus(0.22,0.009,12,48),[0,0.905,0.035],[90,0,0],[1.25,0.83,1]),{tone:0.9}));
  root.add(ring(ctx,0.047,0.009,[0,0.79,0.035],0.95,[90,0,0]));
  root.add(cy(ctx,0.028,0.014,[0,0.787,0.035],0.15));
  for(let i=0;i<3;i++)root.add(bx(ctx,0.024,0.003,0.004,[0.25+i*0.03,0.75,-0.16],0.38));
  root.add(tube(ctx,[[-0.16,0.89,-0.19],[-0.16,1.06,-0.19],[-0.14,1.14,-0.13],[-0.09,1.16,-0.04],[0,1.16,0.01],[0.1,1.11,0.02],[0.11,0.94,0.02]],0.018,0.93));
  root.add(cy(ctx,0.025,0.02,[0,1.15,0.01],0.68));
  for(const x of [-0.2,0.2]){
   root.add(cy(ctx,0.035,0.04,[x,0.92,-0.18],0.85,24));
   root.add(bx(ctx,0.012,0.05,0.012,[x,0.97,-0.18],0.34));
  }
  const stream=cy(ctx,0.006,0.15,[0.1,0.88,0.02],0.95,10);root.add(stream);
  return {root,grounded:true,update(c,t){const w=clamp(c.water??0);stream.visible=w>0.02;stream.scale.y=w*(0.8+0.2*Math.sin(t*14));}};
 }
});

export const toilet=defineModel({
 id:'toilet',aliases:['wc','water-closet','commode'],
 describe:'A modern toilet with a high rectangular cistern and flush button, curved pedestal bowl, raised oval seat ring and dark visible water opening. `flush` swirls the water.',
 controls:{flush:'0 idle .. 1 flushing'},defaults:{flush:0},size:'0.7 m tall',
 build(ctx){
  const root=new THREE.Group();
  root.add(rb(ctx,0.43,0.56,0.2,[0,0.96,-0.14],0.94,0.035));
  root.add(rb(ctx,0.37,0.48,0.08,[0,0.97,-0.02],0.68,0.02));
  root.add(rb(ctx,0.2,0.28,0.22,[0,0.68,-0.04],0.86,0.045));
  root.add(cy(ctx,0.037,0.025,[0,1.23,-0.02],0.25,24));
  root.add(turn(ctx,[[0,0.05],[0.16,0.05],[0.18,0.1],[0.19,0.3],[0.16,0.38],[0.12,0.45],[0.1,0.49],[0,0.49]],[0,0,0],0.92,44));
  const bowl=ctx.mesh(at(G.ellipsoid(0.26,0.14,0.32,40,24),[0,0.42,0.12]),{tone:0.94});root.add(bowl);
  const water=new THREE.Group();water.position.set(0,0.535,0.16);water.add(ctx.mesh(G.ellipsoid(0.17,0.009,0.22,32,16),{tone:0.12}));root.add(water);
  const seat=new THREE.Group();seat.position.set(0,0.565,0.1);root.add(seat);
  const tor=ctx.mesh(at(G.torus(0.18,0.032,12,48),[0,0,0],[90,0,0],[1.3,0.9,1]),{tone:0.7});seat.add(tor);
  const lip=ctx.mesh(at(G.torus(0.18,0.012,10,48),[0,0.002,0],[90,0,0],[1.3,0.9,1]),{tone:0.99});seat.add(lip);
  for(const x of [-0.12,0.12])root.add(cy(ctx,0.018,0.018,[x,0.565,-0.2],0.45,16));
  return {root,grounded:true,update(c,t){const f=clamp(c.flush??0);water.rotation.y=t*lerp(0.2,13,f);water.scale.x=1-0.18*f;water.scale.z=1-0.18*f;}};
 }
});

export const bathtub=defineModel({
 id:'bathtub',aliases:['bath','soaking-tub','freestanding-tub'],
 describe:'A deep freestanding bathtub with a rolled oval rim, sculpted outer skirt, inset dark basin, overflow plate and separate curved floor-mounted taps.',
 size:'1.7 m long',
 build(ctx){
  const root=new THREE.Group();
  root.add(rb(ctx,1.62,0.45,0.72,[0,0.3,0],0.9,0.16));
  const inner=ctx.mesh(at(G.ellipsoid(0.58,0.01,0.24,48,24),[0,0.585,0]),{tone:0.08});root.add(inner);
  const rim=ctx.mesh(at(G.torus(0.6,0.05,14,56),[0,0.59,0],[90,0,0],[1.2,0.58,1]),{tone:0.99});root.add(rim);
  for(const x of [-0.53,0.53])for(const z of [-0.25,0.25])root.add(turn(ctx,[[0.035,0],[0.05,0.02],[0.04,0.12],[0,0.12]],[x,0,z],0.56,16));
  root.add(ring(ctx,0.035,0.008,[0,0.56,0.22],0.95));
  root.add(cy(ctx,0.019,0.012,[0,0.56,0.22],0.22));
  for(const x of [-0.18,0.18]){
   root.add(cy(ctx,0.03,0.08,[x,0.71,-0.22],0.94,24));
   root.add(tube(ctx,[[x,0.75,-0.22],[x,0.88,-0.2],[x*0.6,0.93,-0.13],[0,0.93,-0.08]],0.014,0.88));
   root.add(cy(ctx,0.027,0.035,[x,0.76,-0.22],0.4,20));
  }
  return {root,grounded:true};
 }
});

export const shower=defineModel({
 id:'shower',aliases:['shower-stall','rain-shower','showerhead'],
 describe:'A walk-in shower with a tiled back panel, low square tray, tall riser rail, adjustable hand spray, overhead rain head and a coiled flexible hose.',
 size:'0.9 m square',
 build(ctx){
  const root=new THREE.Group();
  root.add(rb(ctx,0.92,0.1,0.92,[0,0.06,-0.02],0.96,0.05));
  root.add(rb(ctx,0.86,0.025,0.83,[0,0.115,0],0.48,0.02));
  for(let i=0;i<5;i++)root.add(bx(ctx,0.86,0.008,0.01,[0,0.2+i*0.16,-0.47],0.65));
  for(let i=0;i<4;i++)root.add(bx(ctx,0.01,0.75,0.008,[-0.34+i*0.22,0.58,-0.465],0.6));
  root.add(tube(ctx,[[0.29,0.13,-0.34],[0.29,1.68,-0.34],[0.15,1.74,-0.34],[0.08,1.74,-0.34]],0.018,0.9));
  const head=new THREE.Group();head.position.set(0.08,1.72,-0.34);root.add(head);
  head.add(cy(ctx,0.04,0.08,[0,0,0],0.9));
  const plate=ctx.mesh(at(G.cyl(0.14,0.14,0.018,40),[0.08,-0.055,0],[180,0,0]),{tone:0.97});head.add(plate);
  for(let i=0;i<5;i++)for(let j=0;j<5;j++)head.add(cy(ctx,0.006,0.006,[-0.04+i*0.03,-0.067,-0.06+j*0.03],0.34,8));
  root.add(tube(ctx,[[0.31,1.27,-0.33],[0.4,1.25,-0.31],[0.43,1.18,-0.31],[0.39,1.1,-0.31],[0.31,1.12,-0.32],[0.29,1.19,-0.33]],0.012,0.78));
  for(const y of [1.17,1.53])root.add(cy(ctx,0.035,0.018,[0.29,y,-0.32],0.48,20));
  root.add(tube(ctx,[[0.3,1.25,-0.32],[0.47,1.0,-0.25],[0.39,0.76,-0.25],[0.48,0.48,-0.25],[0.32,0.21,-0.29]],0.009,0.62));
  return {root,grounded:true};
 }
});

// ---------------------------------------------------------------- tableware
export const mug=defineModel({
 id:'mug',aliases:['coffee-cup','tea-cup','drinking-mug'],
 describe:'A sturdy ceramic mug with a thick rolled rim, visible hollow interior, curved side handle and a small foot ring.',
 size:'0.11 m tall',
 build(ctx){
  const root=new THREE.Group();
  root.add(turn(ctx,[[0,0.005],[0.047,0.005],[0.052,0.014],[0.05,0.095],[0.047,0.105],[0.044,0.103],[0.044,0.018],[0,0.018]],[0,0,0],0.92,40));
  root.add(ring(ctx,0.048,0.006,[0,0.102,0],0.99,[90,0,0]));
  root.add(ring(ctx,0.04,0.003,[0,0.012,0],0.6,[90,0,0]));
  const handle=ctx.mesh(at(G.torus(0.033,0.007,10,32),[0.064,0.058,0]),{tone:0.9});root.add(handle);
  return {root,grounded:true};
 }
});

export const plate=defineModel({
 id:'plate',aliases:['dinner-plate','serving-plate','dishware'],
 describe:'A shallow ceramic dinner plate with a gently recessed well, raised lip, concentric foot ring and fine double grooves around its broad rim.',
 size:'0.27 m diameter',
 build(ctx){
  const root=new THREE.Group();
  root.add(turn(ctx,[[0,0.008],[0.082,0.008],[0.095,0.012],[0.12,0.019],[0.139,0.033],[0.145,0.041],[0.139,0.046],[0.132,0.039],[0.115,0.029],[0.095,0.023],[0,0.023]],[0,0,0],0.94,56));
  root.add(ring(ctx,0.129,0.0025,[0,0.04,0],0.55,[90,0,0]));
  root.add(ring(ctx,0.113,0.002,[0,0.029,0],0.72,[90,0,0]));
  root.add(turn(ctx,[[0,0],[0.076,0],[0.08,0.006],[0.073,0.01],[0,0.01]],[0,0,0],0.55,40));
  return {root,grounded:true};
 }
});

export const cutlerySet=defineModel({
 id:'cutlery-set',aliases:['silverware','flatware','fork-spoon-knife'],
 describe:'A neatly arranged fork, table knife and spoon, each with a shaped handle, polished shoulders and clear tines, blade and bowl.',
 size:'0.24 m long',
 build(ctx){
  const root=new THREE.Group();
  // Fork: four separated tines and a tapered shoulder.
  root.add(rb(ctx,0.025,0.11,0.012,[-0.095,0.058,0],0.9,0.01));
  const forkShoulder=ctx.mesh(at(G.extrude([[-0.02,0],[-0.018,0.05],[-0.04,0.1],[-0.035,0.13],[0.035,0.13],[0.04,0.1],[0.018,0.05],[0.02,0]],0.012,0.003),[-0.095,0.11,0]),{tone:0.98});root.add(forkShoulder);
  for(let i=0;i<4;i++)root.add(rb(ctx,0.007,0.072,0.012,[-0.12+i*0.017,0.208,0],0.82,0.003));
  // Spoon
  root.add(rb(ctx,0.024,0.15,0.012,[0,0.078,0],0.88,0.01));
  const bowl=ctx.mesh(at(G.ellipsoid(0.041,0.06,0.014,28,18),[0,0.205,0]),{tone:0.98});root.add(bowl);
  const inset=ctx.mesh(at(G.ellipsoid(0.027,0.043,0.004,24,14),[0,0.208,0.014]),{tone:0.56});root.add(inset);
  // Knife: rounded handle and a tapered, beveled blade.
  root.add(rb(ctx,0.028,0.115,0.018,[0.095,0.058,0],0.78,0.012));
  const blade=ctx.mesh(at(G.extrude([[-0.014,0],[0.014,0],[0.027,0.11],[0.022,0.17],[0.016,0.202],[-0.006,0.202],[-0.012,0.14]],0.012,0.002),[0.095,0.13,0]),{tone:0.98});root.add(blade);
  root.add(bx(ctx,0.006,0.07,0.019,[0.095,0.055,0.012],0.38));
  return {root,grounded:true};
 }
});

export const cookingPot=defineModel({
 id:'cooking-pot',aliases:['saucepan','stockpot','soup-pot'],
 describe:'A deep lidded cooking pot with a rolled rim, domed fitted lid and knob, two sturdy riveted side handles and a heavy base.',
 size:'0.24 m wide',
 build(ctx){
  const root=new THREE.Group();
  root.add(turn(ctx,[[0,0.03],[0.105,0.03],[0.12,0.05],[0.12,0.16],[0.112,0.21],[0.12,0.22],[0.12,0.235],[0.105,0.24],[0,0.24]],[0,0,0],0.88,44));
  root.add(ring(ctx,0.117,0.008,[0,0.23,0],0.98,[90,0,0]));
  root.add(turn(ctx,[[0,0.235],[0.055,0.235],[0.095,0.246],[0.108,0.26],[0.095,0.27],[0.04,0.275],[0,0.276]],[0,0,0],0.76,40));
  root.add(cy(ctx,0.024,0.028,[0,0.3,0],0.94));
  for(const s of [-1,1]){
   root.add(tube(ctx,[[s*0.1,0.18,0],[s*0.17,0.19,0],[s*0.2,0.16,0],[s*0.17,0.12,0],[s*0.1,0.13,0]],0.014,0.84));
   for(const y of [0.14,0.18])root.add(cy(ctx,0.008,0.012,[s*0.104,y,0],0.42,12));
  }
  root.add(ring(ctx,0.108,0.009,[0,0.04,0],0.48,[90,0,0]));
  return {root,grounded:true};
 }
});

export const fryingPan=defineModel({
 id:'frying-pan',aliases:['skillet','frypan','saute-pan'],
 describe:'A broad shallow frying pan with a rolled rim, dark nonstick cooking surface, heavy underside and long riveted handle.',
 size:'0.5 m including handle',
 build(ctx){
  const root=new THREE.Group();
  root.add(turn(ctx,[[0,0.045],[0.13,0.045],[0.145,0.055],[0.145,0.13],[0.138,0.15],[0.13,0.15],[0.13,0.125],[0,0.125]],[0,0.07,0.08],0.88,48));
  root.add(ring(ctx,0.142,0.009,[0,0.22,0.08],0.98,[90,0,0]));
  const cook=ctx.mesh(at(G.cyl(0.127,0.127,0.006,48),[0,0.218,0.08]),{tone:0.18});root.add(cook);
  root.add(tube(ctx,[[0,0.16,-0.02],[0,0.17,-0.16],[0,0.18,-0.36]],0.025,0.68));
  root.add(rb(ctx,0.075,0.05,0.14,[0,0.18,-0.38],0.82,0.02));
  for(const x of [-0.035,0.035])root.add(cy(ctx,0.009,0.01,[x,0.18,-0.025],0.4,12));
  return {root,grounded:true};
 }
});

export const wineGlass=defineModel({
 id:'wine-glass',aliases:['wineglass','goblet','stemmed-glass'],
 describe:'A clear stemmed wine glass with a broad stable foot, slender stem, thin tall bowl tapering elegantly toward its rim and a gently rolled lip.',
 size:'0.22 m tall',
 build(ctx){
  const root=new THREE.Group();
  root.add(turn(ctx,[[0,0.005],[0.052,0.005],[0.06,0.012],[0.053,0.018],[0.012,0.023],[0.007,0.035],[0.006,0.095],[0.015,0.105],[0.034,0.115],[0.052,0.14],[0.063,0.18],[0.06,0.21],[0.054,0.218],[0.05,0.213],[0.055,0.18],[0.047,0.15],[0.03,0.13],[0.012,0.12],[0,0.12]],[0,0,0],0.48,48));
  root.add(ring(ctx,0.056,0.003,[0,0.214,0],0.92,[90,0,0]));
  return {root,grounded:true};
 }
});

export const bottle=defineModel({
 id:'bottle',aliases:['glass-bottle','beverage-bottle','flask-bottle'],
 describe:'A reusable glass bottle with a broad rounded shoulder, long narrow neck, threaded cap, heavy punted base and a raised label panel.',
 size:'0.3 m tall',
 build(ctx){
  const root=new THREE.Group();
  root.add(turn(ctx,[[0,0.01],[0.052,0.01],[0.062,0.02],[0.064,0.15],[0.057,0.19],[0.037,0.215],[0.027,0.235],[0.026,0.285],[0.031,0.29],[0.031,0.315],[0.027,0.325],[0.022,0.321],[0.022,0.292],[0.019,0.285],[0,0.285]],[0,0,0],0.84,48));
  root.add(ring(ctx,0.03,0.004,[0,0.31,0],0.42,[90,0,0]));
  for(let y=0.294;y<0.322;y+=0.008)root.add(ring(ctx,0.03,0.0018,[0,y,0],0.65,[90,0,0]));
  root.add(rb(ctx,0.084,0.082,0.012,[0,0.12,0.059],0.98,0.018));
  root.add(rb(ctx,0.062,0.058,0.008,[0,0.12,0.068],0.38,0.01));
  root.add(ring(ctx,0.058,0.002,[0,0.028,0],0.42,[90,0,0]));
  return {root,grounded:true};
 }
});

export const vase=defineModel({
 id:'vase',aliases:['flower-vase','decorative-vase','urn'],
 describe:'A sculptural ceramic vase with a flared foot, rounded belly, narrow neck, turned collar and visible open mouth.',
 size:'0.32 m tall',
 build(ctx){
  const root=new THREE.Group();
  root.add(turn(ctx,[[0,0.005],[0.075,0.005],[0.085,0.015],[0.09,0.045],[0.12,0.085],[0.14,0.14],[0.145,0.19],[0.13,0.24],[0.09,0.28],[0.06,0.29],[0.055,0.31],[0.064,0.32],[0.07,0.33],[0.066,0.34],[0.05,0.335],[0.048,0.31],[0.043,0.29],[0,0.29]],[0,0,0],0.93,56));
  root.add(ring(ctx,0.064,0.004,[0,0.332,0],0.56,[90,0,0]));
  root.add(turn(ctx,[[0,0.012],[0.07,0.012],[0.075,0.018],[0.07,0.025],[0,0.025]],[0,0,0],0.5,40));
  return {root,grounded:true};
 }
});

// ---------------------------------------------------------------- room fixtures and decor
export const wallClock=defineModel({
 id:'wall-clock',aliases:['clock-face','analog-clock','timepiece'],
 describe:'A round wall clock with a stepped bezel, bright face, twelve raised hour markers and two tapered hands that advance smoothly with `time`.',
 controls:{time:'0..1 full clock revolution per unit'},defaults:{time:0.15},size:'0.36 m diameter',
 build(ctx){
  const root=new THREE.Group();
  root.add(ring(ctx,0.17,0.018,[0,0,0],0.93));
  root.add(ring(ctx,0.147,0.006,[0,0,0.012],0.55));
  root.add(frontDisc(ctx,0.148,0.012,[0,0,0.003],0.8));
  for(let i=0;i<60;i++){
   const a=i*Math.PI/30,r=i%5===0?0.125:0.133,len=i%5===0?0.022:0.009;
   const m=ctx.mesh(at(G.rbox(i%5===0?0.008:0.003,len,0.004,0.001),[Math.sin(a)*r,Math.cos(a)*r,0.015],[0,0,-a]),{tone:i%5===0?0.22:0.48});root.add(m);
  }
  const hours=new THREE.Group(),minutes=new THREE.Group(),seconds=new THREE.Group();root.add(hours,minutes,seconds);
  hours.add(rb(ctx,0.012,0.074,0.009,[0,0.035,0.026],0.19,0.005));
  minutes.add(rb(ctx,0.008,0.106,0.007,[0,0.051,0.031],0.3,0.003));
  seconds.add(rb(ctx,0.003,0.128,0.004,[0,0.062,0.036],0.48,0.001));
  root.add(cy(ctx,0.012,0.014,[0,0,0.04],0.95,20));
  root.add(cy(ctx,0.025,0.012,[0,0.145,-0.005],0.48,20));
  return {root,grounded:false,update(c,t){const v=(c.time??0.15)+t*0.002;seconds.rotation.z=-v*Math.PI*2;minutes.rotation.z=-v*Math.PI/60;hours.rotation.z=-v*Math.PI/720;}};
 }
});

export const windowFrame=defineModel({
 id:'window-frame',aliases:['window','casement-window','sash-window'],
 describe:'A double-pane house window with a deep timber surround, projecting sill, central mullions, top rail and two small sash locks.',
 size:'1.1 m wide, 1.3 m tall',
 build(ctx){
  const root=new THREE.Group();
  root.add(rb(ctx,1.04,1.2,0.11,[0,0.75,0],0.9,0.045));
  root.add(rb(ctx,0.86,1.0,0.035,[0,0.75,0.066],0.16,0.012));
  for(const x of [-0.43,0.43])root.add(rb(ctx,0.07,1.04,0.12,[x,0.75,0.09],0.98,0.015));
  for(const y of [0.23,1.27])root.add(rb(ctx,0.94,0.07,0.12,[0,y,0.09],0.98,0.015));
  root.add(rb(ctx,0.045,0.96,0.08,[0,0.75,0.115],0.94,0.012));
  root.add(rb(ctx,0.88,0.045,0.08,[0,0.75,0.115],0.94,0.012));
  root.add(rb(ctx,1.24,0.1,0.3,[0,0.11,0.12],0.72,0.025));
  for(const x of [-0.12,0.12]){
   root.add(cy(ctx,0.015,0.018,[x,1.25,0.16],0.4,16));
   root.add(bx(ctx,0.006,0.045,0.012,[x,1.27,0.174],0.95));
  }
  for(const x of [-0.36,0.36])root.add(bx(ctx,0.008,0.008,0.02,[x,0.22,0.13],0.5));
  return {root,grounded:true};
 }
});

export const fireplace=defineModel({
 id:'fireplace',aliases:['mantelpiece','hearth','fireplace-mantel'],
 describe:'A masonry fireplace with a thick projecting mantel, carved surround, deep dark firebox, stacked logs and lively glowing flames controlled by `fire`.',
 controls:{fire:'0 cold .. 1 burning'},defaults:{fire:0.8},size:'1.5 m wide',
 build(ctx){
  const root=new THREE.Group();
  root.add(rb(ctx,1.45,1.12,0.42,[0,0.61,-0.02],0.62,0.05));
  root.add(rb(ctx,1.02,0.82,0.08,[0,0.52,0.22],0.9,0.045));
  root.add(rb(ctx,0.78,0.58,0.06,[0,0.5,0.275],0.12,0.035));
  root.add(rb(ctx,0.96,0.12,0.62,[0,1.2,0.04],0.96,0.045));
  for(const x of [-0.59,0.59]){
   root.add(rb(ctx,0.18,0.84,0.13,[x,0.58,0.25],0.82,0.025));
   for(let y=0.25;y<1.02;y+=0.15)root.add(bx(ctx,0.19,0.012,0.14,[x,y,0.32],0.52));
  }
  root.add(rb(ctx,1.25,0.08,0.48,[0,0.13,0.06],0.72,0.03));
  for(const x of [-0.2,0,0.2]){
   const log=rb(ctx,0.33,0.055,0.06,[x,0.26,0.31],0.46,0.025);log.rotation.z=deg(x*18);root.add(log);
  }
  const fire=new THREE.Group();fire.position.set(0,0.33,0.3);root.add(fire);
  for(let i=0;i<5;i++){
   const flame=ctx.mesh(at(G.cone(0.075+(i%2)*0.025,0.28+(i%3)*0.04,20),[(i-2)*0.115,0.12,0]),{tone:i%2?0.85:1,glow:2.4,glowControl:'fire'});fire.add(flame);
   const inner=ctx.mesh(at(G.cone(0.035,0.17,16),[(i-2)*0.115,0.065,0.035]),{tone:1,glow:3.1,glowControl:'fire'});fire.add(inner);
  }
  return {root,grounded:true,update(c,t){const f=clamp(c.fire??0.8);fire.visible=f>0.01;fire.scale.y=f*(1+0.08*Math.sin(t*17)+0.04*Math.sin(t*29));fire.scale.x=f*(1+0.05*Math.sin(t*13));}};
 }
});

export const mirror=defineModel({
 id:'mirror',aliases:['wall-mirror','looking-glass','vanity-mirror'],
 describe:'A tall oval mirror in a thick bevelled frame with a bright inner bevel, decorative corner rosettes and a small hanging loop.',
 size:'0.7 m tall',
 build(ctx){
  const root=new THREE.Group();
  const frame=ctx.mesh(at(G.torus(0.27,0.045,16,56),[0,0.76,0]),{tone:0.78});frame.scale.y=1.28;frame.position.y=-0.213;root.add(frame);
  const inner=ctx.mesh(at(G.torus(0.25,0.012,10,56),[0,0.76,0.018]),{tone:0.98});inner.scale.y=1.28;inner.position.y=-0.213;root.add(inner);
  const glass=ctx.mesh(at(G.ellipsoid(0.255,0.327,0.008,40,24),[0,0.76,0.005]),{tone:0.48,rough:0.12});root.add(glass);
  for(const s of [-1,1])for(const y of [0.47,1.05]){
   const gem=ctx.mesh(at(G.sphere(0.032,16,10),[s*0.228,y,0.05]),{tone:0.94});root.add(gem);
  }
  root.add(cy(ctx,0.035,0.018,[0,1.17,-0.01],0.45,20));
  return {root,grounded:true};
 }
});

export const rug=defineModel({
 id:'rug',aliases:['carpet','area-rug','floor-mat'],
 describe:'A thick rectangular woven rug with bound raised edges, a contrasting inset border, central medallion and short knotted fringe along both ends.',
 size:'1.8 m long',
 build(ctx){
  const root=new THREE.Group();
  root.add(rb(ctx,1.22,0.045,1.78,[0,0.035,0],0.64,0.06));
  root.add(rb(ctx,1.04,0.012,1.58,[0,0.064,0],0.94,0.035));
  root.add(rb(ctx,0.96,0.008,1.5,[0,0.073,0],0.5,0.025));
  for(const x of [-0.45,0.45])root.add(rb(ctx,0.018,0.012,1.42,[x,0.08,0],0.9,0.007));
  for(const z of [-0.7,0.7])root.add(rb(ctx,0.94,0.012,0.018,[0,0.08,z],0.9,0.007));
  const med=ctx.mesh(at(G.torus(0.24,0.018,10,40),[0,0.082,0],[90,0,0],[1,1.35,1]),{tone:0.86});root.add(med);
  root.add(ctx.mesh(at(G.ellipsoid(0.17,0.012,0.25,32,18),[0,0.079,0]),{tone:0.73}));
  for(const z of [-0.94,0.94])for(let i=0;i<13;i++){
   const x=-0.49+i*0.082;
   root.add(tube(ctx,[[x,0.045,z],[x,0.042,z+(z<0?-0.06:0.06)],[x+0.012,0.04,z+(z<0?-0.12:0.12)]],0.009,0.95));
  }
  return {root,grounded:true};
 }
});

export const pottedPlant=defineModel({
 id:'potted-plant',aliases:['houseplant','indoor-plant','plant-in-pot'],
 describe:'A leafy indoor plant in a tapered terracotta pot with rolled rim and saucer, several branching stems and broad pointed leaves at different heights.',
 controls:{breeze:'0 still .. 1 soft breeze'},defaults:{breeze:0.2},size:'0.8 m tall',
 build(ctx){
  const root=new THREE.Group();
  root.add(turn(ctx,[[0,0.035],[0.13,0.035],[0.15,0.055],[0.13,0.25],[0.1,0.29],[0.095,0.29],[0.12,0.06],[0,0.06]],[0,0,0],0.66,40));
  root.add(ring(ctx,0.13,0.012,[0,0.29,0],0.95,[90,0,0]));
  root.add(turn(ctx,[[0,0.02],[0.15,0.02],[0.16,0.035],[0.15,0.05],[0,0.05]],[0,0,0],0.48,40));
  root.add(cy(ctx,0.1,0.008,[0,0.285,0],0.26,32));
  const pivots:THREE.Group[]=[];
  const branches:[[number,number,number],[number,number,number]][]=[[[0,0.29,0],[0,0.66,0]],[[0,0.34,0],[-0.18,0.58,0.02]],[[0,0.35,0],[0.18,0.6,-0.02]],[[0,0.38,0],[0,0.77,-0.03]],[[0,0.32,0],[-0.19,0.45,-0.02]],[[0,0.36,0],[0.22,0.43,0.02]]];
  for(const [a,b] of branches){
   root.add(tube(ctx,[a,[b[0]*0.55,b[1]*0.72,b[2]],b],0.009,0.55));
   const leafGroup=new THREE.Group();leafGroup.position.set(...b);root.add(leafGroup);pivots.push(leafGroup);
   const leaf=ctx.mesh(at(G.ellipsoid(0.065,0.13,0.025,24,16),[0,0.07,0],[0,0,deg((b[0]>=0?1:-1)*24)]),{tone:0.94});leafGroup.add(leaf);
   const vein=tube(ctx,[[0,0,0.025],[0,0.07,0.026],[0,0.17,0.02]],0.003,0.4);leafGroup.add(vein);
   const side=ctx.mesh(at(G.ellipsoid(0.045,0.09,0.022,20,14),[b[0]>=0?0.045:-0.045,0.04,-0.012],[0,0,deg(b[0]>=0?28:-28)]),{tone:0.72});leafGroup.add(side);
  }
  return {root,grounded:true,update(c,t){const b=clamp(c.breeze??0.2);pivots.forEach((p,i)=>{p.rotation.z=Math.sin(t*1.4+i*1.7)*0.06*b;});}};
 }
});

export const ceilingFan=defineModel({
 id:'ceiling-fan',aliases:['ceiling-ventilator','fan-blades','overhead-fan'],
 describe:'A ceiling fan with a mounting cup, short downrod, sculpted motor housing and five broad swept blades that rotate continuously with `spin`.',
 controls:{spin:'0 stopped .. 1 normal speed'},defaults:{spin:0.65},size:'1.2 m blade span',
 build(ctx){
  const root=new THREE.Group();
  root.add(turn(ctx,[[0,0],[0.12,0],[0.14,0.035],[0.1,0.07],[0,0.07]],[0,0.18,0],0.88,32));
  root.add(cy(ctx,0.045,0.18,[0,0.08,0],0.7));
  root.add(turn(ctx,[[0,0],[0.11,0],[0.15,0.06],[0.12,0.14],[0.08,0.21],[0,0.22]],[0,-0.04,0],0.94,40));
  const rotor=new THREE.Group();rotor.position.y=-0.2;root.add(rotor);
  rotor.add(cy(ctx,0.09,0.045,[0,0,0],0.6));
  for(let i=0;i<5;i++){
   const a=i*Math.PI*2/5;
   const blade=ctx.mesh(at(G.extrude([[0,-0.06],[0.18,-0.05],[0.55,0.08],[0.59,0.18],[0.52,0.22],[0.16,0.08]],0.035,0.012),[0,0,0],[90,0,0]),{tone:0.95});
   blade.rotation.y=-a;blade.position.set(Math.sin(a)*0.07,0,Math.cos(a)*0.07);rotor.add(blade);
   rotor.add(cy(ctx,0.014,0.015,[Math.sin(a)*0.08,0,Math.cos(a)*0.08],0.46,12));
  }
  return {root,grounded:false,update(c,t){rotor.rotation.y=t*lerp(0.3,13,clamp(c.spin??0.65));}};
 }
});

export const vacuumCleaner=defineModel({
 id:'vacuum-cleaner',aliases:['vacuum','hoover','upright-vacuum'],
 describe:'An upright vacuum cleaner with a wide floor head, rotating brush roller, clear dust canister, motor housing, flexible hose, handle grip and rear wheels.',
 controls:{run:'0 idle .. 1 brush and body running'},defaults:{run:0},size:'0.9 m tall',
 build(ctx){
  const root=new THREE.Group();
  root.add(rb(ctx,0.42,0.1,0.24,[0,0.09,0.08],0.62,0.045));
  root.add(cy(ctx,0.045,0.06,[-0.18,0.065,-0.02],0.25,24));
  root.add(cy(ctx,0.045,0.06,[0.18,0.065,-0.02],0.25,24));
  const brush=new THREE.Group();brush.position.set(0,0.14,0.11);root.add(brush);
  const roller=cy(ctx,0.025,0.34,[0,0,0],0.92,32);roller.rotation.z=deg(90);brush.add(roller);
  for(let i=0;i<12;i++){
   const bristle=bx(ctx,0.34,0.045,0.012,[0,0,0],i%2?0.32:0.96);bristle.rotation.x=i*Math.PI/6;brush.add(bristle);
  }
  root.add(tube(ctx,[[0,0.16,0.08],[0,0.36,-0.01],[0,0.61,-0.08],[0,0.75,-0.05]],0.045,0.8));
  root.add(rb(ctx,0.26,0.27,0.24,[0,0.49,0.0],0.72,0.06));
  root.add(rb(ctx,0.2,0.34,0.17,[0,0.69,-0.02],0.9,0.06));
  const can=ctx.mesh(at(G.cyl(0.082,0.075,0.26,36),[0,0.49,0.135]),{tone:0.96});root.add(can);
  root.add(ring(ctx,0.078,0.006,[0,0.63,0.135],0.46,[90,0,0]));
  for(const y of [0.43,0.49,0.55])root.add(ring(ctx,0.076,0.003,[0,y,0.135],0.58,[90,0,0]));
  root.add(tube(ctx,[[0.12,0.48,0.05],[0.22,0.48,0.01],[0.25,0.61,0.0],[0.2,0.76,-0.02],[0.08,0.8,-0.03]],0.016,0.52));
  root.add(tube(ctx,[[-0.07,0.8,-0.02],[-0.05,0.94,-0.04],[0,1.02,-0.04]],0.026,0.64));
  root.add(rb(ctx,0.2,0.045,0.06,[0,1.02,-0.04],0.94,0.02));
  return {root,grounded:true,update(c,t){const k=clamp(c.run??0);brush.rotation.x=t*lerp(0,22,k);}};
 }
});

export const clothesIron=defineModel({
 id:'clothes-iron',aliases:['steam-iron','flat-iron','ironing-iron'],
 describe:'A steam iron with a pointed soleplate, raised smooth body, arching grip, heel rest, temperature dial, water window and rows of steam holes. `steam` animates vapor.',
 controls:{steam:'0 dry .. 1 steam bursts'},defaults:{steam:0},size:'0.28 m long',
 build(ctx){
  const root=new THREE.Group();
  const plan:[number,number][]=[[0,0.3],[0.15,0.12],[0.18,-0.16],[0.14,-0.25],[-0.14,-0.25],[-0.18,-0.16],[-0.15,0.12]];
  const sole=ctx.mesh(at(G.extrude(plan,0.045,0.018),[0,0.055,0],[90,0,0]),{tone:0.58});root.add(sole);
  const shell=ctx.mesh(at(G.extrude([[0,0.27],[0.12,0.1],[0.14,-0.15],[-0.13,-0.15],[-0.12,0.1]],0.1,0.035),[0,0.1,0],[90,0,0]),{tone:0.92});root.add(shell);
  root.add(tube(ctx,[[-0.11,-0.02,-0.17],[-0.12,0.15,-0.16],[-0.09,0.25,-0.12],[-0.06,0.27,0.02],[0.06,0.27,0.02],[0.09,0.25,-0.12],[0.12,0.15,-0.16],[0.11,-0.02,-0.17]],0.018,0.72));
  root.add(cy(ctx,0.035,0.018,[0,0.17,-0.11],0.32,24));
  root.add(ring(ctx,0.035,0.005,[0,0.181,-0.11],0.98));
  root.add(rb(ctx,0.045,0.065,0.012,[0.12,0.16,-0.05],0.22,0.006));
  for(let i=0;i<5;i++)for(const s of [-1,1])root.add(cy(ctx,0.005,0.003,[s*(0.045+i*0.018),0.085,0.18-i*0.047],0.24,8));
  const steam=new THREE.Group();steam.position.set(0,0.06,0.2);root.add(steam);
  for(let i=0;i<4;i++){
   const p=ctx.mesh(G.sphere(0.012,12,8),{tone:0.9});p.position.set((i-1.5)*0.05,0,0);steam.add(p);
   (p as any).userData.phase=i*0.25;
  }
  return {root,grounded:true,update(c,t){const s=clamp(c.steam??0);steam.visible=s>0.02;steam.children.forEach((p,i)=>{p.position.y=((t*0.16+(p.userData.phase as number))%0.18);p.scale.setScalar(s);});}};
 }
});

export const bathroomScale=defineModel({
 id:'bathroom-scale',aliases:['weighing-scale','bath-scale','digital-scale'],
 describe:'A low bathroom scale with four metal sensor pads, a raised glass platform, anti-slip edge and a backlit digital weight display.',
 controls:{weight:'0..1 changes the display reading'},defaults:{weight:0.58},size:'0.32 m wide',
 build(ctx){
  const root=new THREE.Group();
  root.add(rb(ctx,0.31,0.045,0.34,[0,0.045,0],0.68,0.035));
  root.add(rb(ctx,0.285,0.012,0.31,[0,0.075,0],0.93,0.03));
  for(const x of [-0.105,0.105])for(const z of [-0.1,0.1]){
   root.add(cy(ctx,0.036,0.006,[x,0.084,z],0.44,28));
   root.add(ring(ctx,0.031,0.004,[x,0.088,z],0.98,[90,0,0]));
  }
  root.add(rb(ctx,0.13,0.035,0.06,[0,0.09,-0.115],0.16,0.01));
  const digits:THREE.Mesh[]=[];
  for(let i=0;i<3;i++){
   const d=rb(ctx,0.014,0.023,0.003,[-0.03+i*0.03,0.093,-0.08],0.98,0.002);root.add(d);digits.push(d);
  }
  return {root,grounded:true,update(c){const w=clamp(c.weight??0.58);digits.forEach((d,i)=>{d.scale.y=0.65+0.35*((Math.floor(w*100)+i*3)%10)/9;});}};
 }
});

export const doorbell=defineModel({
 id:'doorbell',aliases:['door-bell','bell-push','entry-chime-button'],
 describe:'A compact wall-mounted doorbell with a bevelled backplate, bright circular push button, concentric bezel, mounting screws and glowing ring while pressed.',
 controls:{press:'0 released .. 1 pressed'},defaults:{press:0},size:'0.08 m wide',
 build(ctx){
  const root=new THREE.Group();
  root.add(rb(ctx,0.09,0.14,0.025,[0,0.075,0],0.62,0.016));
  root.add(rb(ctx,0.065,0.11,0.015,[0,0.075,0.019],0.95,0.012));
  root.add(ring(ctx,0.027,0.006,[0,0.075,0.032],0.35));
  const button=frontDisc(ctx,0.022,0.012,[0,0.075,0.032],0.98);const mat=button.material as THREE.MeshStandardMaterial;mat.emissive.set('#ffffff');mat.emissiveIntensity=0.2;root.add(button);
  for(const y of [0.025,0.125])root.add(cy(ctx,0.006,0.006,[0,y,0.035],0.22,12));
  return {root,grounded:false,update(c){const p=clamp(c.press??0);button.position.z=-p*0.008;mat.emissiveIntensity=0.2+2*p;}};
 }
});

export const lightSwitch=defineModel({
 id:'light-switch',aliases:['wall-switch','rocker-switch','toggle-switch'],
 describe:'A wall switch with a stepped rectangular faceplate, inset rocker paddle, pivot line and two visible screw heads. `on` flips the rocker and glows its indicator.',
 controls:{on:'0 off .. 1 on'},defaults:{on:0},size:'0.09 m tall',
 build(ctx){
  const root=new THREE.Group();
  root.add(rb(ctx,0.09,0.13,0.018,[0,0.075,0],0.94,0.014));
  root.add(rb(ctx,0.06,0.092,0.012,[0,0.076,0.018],0.62,0.012));
  const rocker=new THREE.Group();rocker.position.set(0,0.076,0.028);root.add(rocker);
  rocker.add(rb(ctx,0.045,0.07,0.012,[0,0,0],0.98,0.01));
  rocker.add(bx(ctx,0.046,0.003,0.006,[0,0,0.01],0.38));
  for(const y of [0.027,0.125]){
   root.add(cy(ctx,0.006,0.004,[0,y,0.03],0.32,12));
   root.add(bx(ctx,0.0015,0.007,0.006,[0,y,0.033],0.86));
  }
  const led=ctx.mesh(at(G.sphere(0.006,10,8),[0.022,0.039,0.035]),{tone:1,glow:1.8,glowControl:'on'});root.add(led);
  return {root,grounded:false,update(c){rocker.rotation.x=deg(lerp(9,-9,clamp(c.on??0)));led.visible=(c.on??0)>0.5;}};
 }
});

export const bunkBed=defineModel({
 id:'bunk-bed',aliases:['double-decker-bed','loft-bunk','two-tier-bed'],
 describe:'A two-level bunk bed with four tall corner posts, ladder rungs, guard rails around the upper mattress, two pillows and neatly tucked blankets.',
 size:'2.1 m tall, 1.9 m long',
 build(ctx){
  const root=new THREE.Group(),bed=new THREE.Group();root.add(bed);
  for(const x of [-0.95,0.95])for(const z of [-0.46,0.46]){
   bed.add(rb(ctx,0.075,2.08,0.075,[x,1.04,z],0.72,0.018));
   bed.add(cy(ctx,0.013,0.02,[x,2.09,z],0.98,16));
  }
  for(const y of [0.38,1.42]){
   for(const z of [-0.42,0.42])bed.add(rb(ctx,1.82,0.24,0.07,[0,y,z],0.87,0.025));
   bed.add(rb(ctx,1.82,0.12,0.92,[0,y-0.12,0],0.48,0.035));
   bed.add(rb(ctx,1.7,0.16,0.84,[0,y+0.02,0],0.94,0.055));
   bed.add(rb(ctx,0.38,0.1,0.28,[-0.61,y+0.13,-0.15],0.99,0.045));
   bed.add(rb(ctx,0.88,0.08,0.7,[0.27,y+0.14,0.06],0.72,0.045));
  }
  for(const x of [-0.95,0.95])bed.add(rb(ctx,0.07,0.22,0.075,[x,1.78,0],0.94,0.02));
  // Guard rails along both sides of top bunk.
  for(const z of [-0.46,0.46]){
   bed.add(rb(ctx,1.84,0.28,0.065,[0,1.78,z],0.92,0.025));
   bed.add(bx(ctx,1.72,0.04,0.045,[0,1.68,z],0.52));
  }
  // End ladder with two side rails and six round rungs.
  for(const z of [-0.34,0.34])bed.add(tube(ctx,[[0.96,0.05,z],[0.96,1.95,z]],0.027,0.76));
  for(let i=0;i<6;i++){const rung=ctx.mesh(at(G.cyl(0.02,0.02,0.68,18),[0.96,0.15+i*0.31,0],[90,0,0]),{tone:0.9});bed.add(rung);}
  return {root,grounded:true};
 }
});

export const crib=defineModel({
 id:'crib',aliases:['baby-crib','cot','infant-cot'],
 describe:'A safe baby crib with rounded corner posts, closely spaced vertical slats on all four sides, a firm mattress, fitted sheet and turned finials.',
 size:'1.3 m long',
 build(ctx){
  const root=new THREE.Group();
  root.add(rb(ctx,1.22,0.1,0.68,[0,0.37,0],0.68,0.03));
  root.add(rb(ctx,1.12,0.12,0.58,[0,0.47,0],0.94,0.055));
  root.add(rb(ctx,1.0,0.025,0.5,[0,0.54,0],0.76,0.025));
  for(const x of [-0.59,0.59])for(const z of [-0.32,0.32]){
   root.add(turn(ctx,[[0.04,0],[0.06,0.02],[0.045,0.22],[0.055,0.72],[0.05,0.82],[0.035,0.85],[0,0.85]],[x,0.02,z],0.82,24));
   root.add(cy(ctx,0.035,0.045,[x,0.89,z],0.98,20));
  }
  for(const z of [-0.32,0.32]){
   root.add(rb(ctx,1.12,0.085,0.06,[0,0.76,z],0.94,0.025));
   for(let i=0;i<13;i++)root.add(turn(ctx,[[0.012,0],[0.018,0.02],[0.015,0.63],[0.01,0.66],[0,0.66]],[ -0.51+i*0.085,0.12,z],0.88,12));
  }
  for(const x of [-0.59,0.59]){
   root.add(rb(ctx,0.07,0.08,0.58,[x,0.76,0],0.92,0.02));
   for(let i=0;i<7;i++)root.add(turn(ctx,[[0.012,0],[0.018,0.02],[0.015,0.63],[0.01,0.66],[0,0.66]],[x,0.12,-0.25+i*0.083],0.86,12));
  }
  for(const x of [-0.42,0.42])root.add(turn(ctx,[[0.025,0],[0.032,0.02],[0.024,0.15],[0,0.15]],[x,0,0],0.48,16));
  return {root,grounded:true};
 }
});

export const trashCan=defineModel({
 id:'trash-can',aliases:['wastebasket','rubbish-bin','garbage-can'],
 describe:'A lidded pedal bin with a tapered brushed-metal body, dark top opening, foot pedal and rounded hinged lid that flips open with `open`.',
 controls:{open:'0 closed .. 1 lid raised'},defaults:{open:0},size:'0.45 m tall',
 build(ctx){
  const root=new THREE.Group();
  root.add(turn(ctx,[[0,0.025],[0.16,0.025],[0.18,0.055],[0.2,0.39],[0.19,0.43],[0.17,0.44],[0,0.44]],[0,0,0],0.74,48));
  root.add(turn(ctx,[[0,0.43],[0.19,0.43],[0.205,0.45],[0.205,0.47],[0.18,0.48],[0,0.48]],[0,0,0],0.96,48));
  const lid=new THREE.Group();lid.position.set(0,0.47,-0.19);root.add(lid);
  lid.add(rb(ctx,0.42,0.045,0.42,[0,0.025,0.19],0.94,0.08));
  lid.add(rb(ctx,0.31,0.012,0.31,[0,0.05,0.19],0.14,0.06));
  root.add(rb(ctx,0.15,0.055,0.08,[0,0.08,0.2],0.62,0.025));
  root.add(cy(ctx,0.035,0.03,[0,0.1,0.25],0.84,20));
  for(let i=0;i<10;i++)root.add(ring(ctx,0.192,0.002,[0,0.1+i*0.03,0],0.5,[90,0,0]));
  return {root,grounded:true,update(c){lid.rotation.x=-deg(75*clamp(c.open??0));}};
 }
});

export const shoppingBag=defineModel({
 id:'shopping-bag',aliases:['paper-shopping-bag','grocery-bag','carrier-bag'],
 describe:'A structured paper shopping bag with gusseted folded sides, a folded top cuff, reinforced base and two arched cord handles.',
 size:'0.35 m tall',
 build(ctx){
  const root=new THREE.Group();
  root.add(rb(ctx,0.36,0.29,0.18,[0,0.17,0],0.82,0.025));
  root.add(rb(ctx,0.33,0.025,0.17,[0,0.02,0],0.56,0.012));
  root.add(rb(ctx,0.36,0.035,0.19,[0,0.32,0],0.96,0.015));
  for(const s of [-1,1]){
   const gusset=ctx.mesh(at(G.extrude([[0,0],[0.1,0.02],[0.1,0.28],[0,0.3]],0.012),[s*0.17,0.02,0],[0,s*90,0]),{tone:0.58});root.add(gusset);
  }
  for(const x of [-0.07,0.07]){
   root.add(tube(ctx,[[x-0.035,0.32,0.09],[x-0.035,0.4,0.09],[x-0.028,0.47,0.09],[x,0.49,0.09],[x+0.028,0.47,0.09],[x+0.035,0.4,0.09],[x+0.035,0.32,0.09]],0.009,0.72));
   for(const s of [-1,1])root.add(cy(ctx,0.012,0.008,[x+s*0.035,0.31,0.09],0.42,12));
  }
  return {root,grounded:true};
 }
});

export const umbrellaStand=defineModel({
 id:'umbrella-stand',aliases:['umbrella-holder','umbrella-rack','hall-stand'],
 describe:'A tall umbrella stand with a weighted drip tray, perforated metal cylinder, decorative rim and several upright umbrellas with hooked handles.',
 size:'0.65 m tall',
 build(ctx){
  const root=new THREE.Group();
  root.add(turn(ctx,[[0,0],[0.18,0],[0.2,0.025],[0.18,0.05],[0,0.06]],[0,0,0],0.66,40));
  root.add(turn(ctx,[[0,0.04],[0.14,0.04],[0.16,0.08],[0.15,0.55],[0.14,0.6],[0,0.6]],[0,0,0],0.78,40));
  root.add(ring(ctx,0.15,0.012,[0,0.58,0],0.96,[90,0,0]));
  for(let i=0;i<12;i++)for(let y=0.14;y<0.53;y+=0.12){
   const a=i*Math.PI/6;root.add(cy(ctx,0.006,0.008,[Math.cos(a)*0.151,y,Math.sin(a)*0.151],0.35,8));
  }
  for(let i=0;i<3;i++){
   const a=i*2.1,x=Math.cos(a)*0.06,z=Math.sin(a)*0.06;
   const umbrella=new THREE.Group();umbrella.position.set(x,0.05,z);root.add(umbrella);
   umbrella.add(cy(ctx,0.008,0.84,[0,0.45,0],0.55,12));
   umbrella.add(turn(ctx,[[0,0.73],[0.02,0.74],[0.052,0.79],[0.05,0.85],[0.036,0.91],[0.02,0.96],[0,0.99]],[0,0,0],0.9,24));
   umbrella.add(tube(ctx,[[0,0.47,0],[0.018,0.54,0],[0.045,0.54,0],[0.06,0.58,0],[0.055,0.63,0]],0.009,0.92));
   for(let j=0;j<6;j++)umbrella.add(tube(ctx,[[0,0.73,0],[Math.cos(j*Math.PI/3)*0.03,0.78,Math.sin(j*Math.PI/3)*0.03]],0.004,0.5));
  }
  return {root,grounded:true};
 }
});
