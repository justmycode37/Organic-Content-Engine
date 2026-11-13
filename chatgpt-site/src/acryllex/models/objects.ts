// Office, school, sport, music, games and historic objects.
import * as THREE from 'three';
import {G,at,deg,clamp,lerp} from '../kit.ts';
import {defineModel,type ModelCtx} from './types.ts';

type V3=[number,number,number];
type P2=[number,number];
const group=(...items:THREE.Object3D[])=>{const g=new THREE.Group();if(items.length)g.add(...items);return g;};
const box=(ctx:ModelCtx,p:THREE.Object3D,w:number,h:number,d:number,pos:V3,tone=0.8,r=Math.min(w,h,d)*0.12)=>p.add(ctx.mesh(at(r>0?G.rbox(w,h,d,r):G.box(w,h,d),pos),{tone}));
const cyl=(ctx:ModelCtx,p:THREE.Object3D,r:number,h:number,pos:V3,tone=0.8,seg=32)=>p.add(ctx.mesh(at(G.cyl(r,r,h,seg),pos),{tone}));
const lathe=(ctx:ModelCtx,p:THREE.Object3D,profile:[number,number][],pos:V3,tone=0.8,seg=40)=>p.add(ctx.mesh(at(G.lathe(profile,seg),pos),{tone}));
const tube=(ctx:ModelCtx,p:THREE.Object3D,pts:V3[],r:number,tone=0.8,seg=48,radial=8)=>p.add(ctx.mesh(G.tube(pts,r,seg,radial),{tone}));
const torus=(ctx:ModelCtx,p:THREE.Object3D,R:number,r:number,pos:V3,tone=0.8,scale:V3=[1,1,1])=>p.add(ctx.mesh(at(G.torus(R,r,12,48),pos,[0,0,0],scale),{tone}));
const plate=(ctx:ModelCtx,p:THREE.Object3D,outline:P2[],depth:number,pos:V3,tone=0.8,bevel=0.003)=>p.add(ctx.mesh(at(G.extrude(outline,depth,bevel),pos),{tone}));
const ball=(ctx:ModelCtx,p:THREE.Object3D,r:number,pos:V3,tone=0.8,scale:V3=[1,1,1])=>p.add(ctx.mesh(at(G.sphere(r,24,16),pos,[0,0,0],scale),{tone}));

// ---------------------------------------------------------------- school and desk
export const pencil=defineModel({
 id:'pencil',aliases:['graphite-pencil','lead-pencil','pencils'],describe:'A sharpened yellow hexagonal pencil stands point-down, with a long wood cone, dark graphite, metal ferrule and pink eraser.',size:'0.19 m',
 build(ctx){const root=new THREE.Group();const H=0.17,R=0.006;
  lathe(ctx,root,[[0,0.012],[R*0.82,0.012],[R,0.017],[R,H-0.022],[R*0.98,H-0.018],[R*0.86,H-0.015],[R*0.82,H-0.01],[R,H-0.006],[R,H]], [0,0,0],0.92,6);
  lathe(ctx,root,[[0,0],[0.0012,0],[0.0022,0.006],[0.0045,0.014],[R*0.98,0.025],[R*0.98,0.03],[0,0.03]],[0,0,0],0.62,6);
  lathe(ctx,root,[[0,0],[0.0011,0],[0.0014,0.004],[0.0011,0.008],[0,0.008]],[0,0,0],0.18,10);
  lathe(ctx,root,[[R*0.92,H-0.024],[R*1.12,H-0.024],[R*1.12,H-0.009],[R*0.92,H-0.009]],[0,0,0],0.72,12);
  lathe(ctx,root,[[0,H-0.009],[R,H-0.009],[R*0.94,H+0.006],[R*0.82,H+0.009],[0,H+0.009]],[0,0,0],0.95,12);
  for(let i=0;i<6;i++){const a=i*Math.PI/3; tube(ctx,root,[[Math.cos(a)*R*0.96,0.035,Math.sin(a)*R*0.96],[Math.cos(a)*R*0.96,H-0.03,Math.sin(a)*R*0.96]],0.00022,0.68,12,4);}
  return {root,grounded:true};}
});

export const pen=defineModel({
 id:'pen',aliases:['ballpoint','fountain-pen','writing-pen','ballpoint-pen'],describe:'A polished capped pen stands upright with a tapered writing tip, ridged grip, metal bands, pocket clip and a rounded cap button.',size:'0.15 m',
 build(ctx){const root=new THREE.Group(),R=0.007,H=0.14;
  lathe(ctx,root,[[0,0],[0.002,0],[0.003,0.008],[R*0.72,0.02],[R*0.78,0.03],[R*0.82,0.036]],[0,0,0],0.88,32);
  lathe(ctx,root,[[R*0.8,0.032],[R,0.04],[R,H-0.022],[R*1.02,H-0.018],[R*0.9,H-0.012],[R*0.92,H-0.007],[R,H-0.003],[R,H]],[0,0,0],0.72,32);
  lathe(ctx,root,[[R,H-0.025],[R*1.12,H-0.025],[R*1.12,H-0.012],[R,H-0.012]],[0,0,0],1,32);
  lathe(ctx,root,[[0,H-0.01],[R,H-0.01],[R*0.95,H+0.006],[R*0.72,H+0.009],[0,H+0.009]],[0,0,0],0.92,24);
  for(let y=0.022;y<0.04;y+=0.004)torus(ctx,root,R*0.84,0.00055,[0,y,0],0.42);
  const clip=G.extrude([[-0.001,H-0.008],[-0.002,H-0.02],[-0.002,H-0.06],[0.001,H-0.07],[0.002,H-0.065],[0.0015,H-0.02],[0.001,H-0.008]],0.001,0.0003);
  root.add(ctx.mesh(at(clip,[R*0.72,0,0]),{tone:1}));ball(ctx,root,0.0025,[0,H+0.009,0],1);
  return {root,grounded:true};}
});

export const scissors=defineModel({
 id:'scissors',aliases:['shears','scissor'],describe:'Two crossed steel blades meet at a pivot above a pair of open oval finger loops; `open` spreads or closes the handles.',controls:{open:'0 closed .. 1 fully open (default 0.55)'},defaults:{open:0.55},size:'0.2 m',
 build(ctx){const root=new THREE.Group(),arms:THREE.Group[]=[];const pivotY=0.09;
  for(const s of [-1,1]){const arm=new THREE.Group();arm.position.set(0,pivotY,0);root.add(arm);arms.push(arm);
   // The blade grows from the pivot toward the upper outer corner.
   plate(ctx,arm,s>0?[[0,0],[0.008,0.004],[0.09,0.112],[0.091,0.12],[0.082,0.116],[0,0.008]]:[[0,0],[0.09,0.112],[0.084,0.119],[0.078,0.116],[-0.008,0.004]],0.004,[0,0,0],0.86,0.0015);
   tube(ctx,arm,[[0,0.006,0.003],[s*0.09,0.115,0.003]],0.0007,1,16,4);
   const handle=new THREE.Group();handle.position.set(s*0.018,-0.062,0);arm.add(handle);
   torus(ctx,handle,0.032,0.004,[0,-0.025,0],0.92,[0.72,1.18,0.85]);
   torus(ctx,handle,0.025,0.0018,[0,-0.025,0.001],0.35,[0.72,1.18,0.85]);
   box(ctx,arm,0.012,0.06,0.006,[s*0.005,-0.035,0],0.72,0.002);
  }
  ball(ctx,root,0.007,[0,pivotY,0.006],0.35);ball(ctx,root,0.003,[0,pivotY,0.011],1);
  return {root,grounded:true,update(c){const a=clamp(c.open??0.55);arms[0]!.rotation.z=lerp(-0.08,-0.42,a);arms[1]!.rotation.z=lerp(0.08,0.42,a);}};}
});

export const ruler=defineModel({
 id:'ruler',aliases:['measuring-ruler','school-ruler','straightedge'],describe:'A 30-centimetre ruler lies upright in view with a bevelled rectangular body, a round hanging hole and alternating long and short engraved measurement ticks.',size:'0.31 m',
 build(ctx){const root=new THREE.Group(),w=0.046,h=0.32;box(ctx,root,w,h,0.008,[0,h/2,0],0.82,0.004);
  // Front-facing graduation marks and a punched hanging hole.
  torus(ctx,root,0.006,0.0012,[0,h-0.024,0.005],0.22,[1,1,0.3]);
  root.add(ctx.mesh(at(G.cyl(0.0048,0.0048,0.001,24),[0,h-0.024,0.0045],[90,0,0]),{tone:0.12}));
  for(let i=0;i<=30;i++){const y=0.016+i*0.00945;const len=i%10===0?0.022:i%5===0?0.016:0.009;
   box(ctx,root,len,0.0024,0.0012,[w/2-0.003-len/2,y,0.005],i%5===0?0.16:0.3,0.0003);}
  for(let i=0;i<4;i++)box(ctx,root,0.001,0.0025,0.001,[0.004,0.039+i*0.008,0.005],0.28,0);
  return {root,grounded:true};}
});

export const deskGlobe=defineModel({
 id:'desk-globe',aliases:['globe','terrestrial-globe','world-globe'],describe:'A blue world globe with raised continent outlines turns inside a tilted brass meridian ring above a turned pedestal; `spin` controls its rotation.',controls:{spin:'0 stopped .. 1 steady spin (default 0.18)'},defaults:{spin:0.18},size:'0.35 m',
 build(ctx){const root=new THREE.Group(),axis=new THREE.Group(),sphere=new THREE.Group();root.add(axis);axis.position.y=0.25;axis.rotation.z=deg(23.5);axis.add(sphere);
  ball(ctx,sphere,0.104,[0,0,0],0.72);
  // Latitude bands and two longitude arcs sit just above the sphere.
  for(const lat of [-60,-30,0,30,60]){const r=0.105*Math.cos(deg(lat)),y=0.105*Math.sin(deg(lat));torus(ctx,sphere,r,0.00055,[0,y,0],lat===0?0.95:0.4,[1,1,1]);}
  for(const a of [0,Math.PI/3,2*Math.PI/3]){const mer=new THREE.Group();mer.rotation.y=a; sphere.add(mer);torus(ctx,mer,0.105,0.00055,[0,0,0],0.48,[1,1,0.12]);}
  const continent=(pts:V3[])=>tube(ctx,sphere,pts.map(([x,y,z])=>{const q=new THREE.Vector3(x,y,z).normalize().multiplyScalar(0.106);return [q.x,q.y,q.z] as V3;}),0.0015,0.95,56,5);
  continent([[-.22,.72,.65],[-.48,.82,.29],[-.56,.65,.10],[-.48,.44,.2],[-.39,.25,.34],[-.48,.02,.46],[-.27,-.25,.57],[-.24,-.55,.55],[-.08,-.68,.63],[.02,-.5,.72],[.06,-.15,.77],[-.1,.15,.82],[-.22,.35,.77],[-.22,.72,.65]]);
  continent([[.25,.72,.6],[.48,.75,.45],[.62,.63,.37],[.55,.48,.46],[.69,.33,.36],[.65,.12,.45],[.42,-.06,.72],[.36,-.38,.76],[.2,-.52,.81],[.14,-.2,.85],[.2,.05,.82],[.08,.34,.86],[.25,.72,.6]]);
  // Broad meridian and equatorial mounting hoop.
  torus(ctx,root,0.119,0.003,[0,0.25,0],0.9,[1,1,0.55]);
  lathe(ctx,root,[[0,0],[0.045,0],[0.055,0.018],[0.039,0.025],[0.025,0.06],[0.018,0.095],[0.029,0.12],[0.04,0.13],[0.03,0.14],[0,0.14]],[0,0,0],0.7,32);
  torus(ctx,root,0.04,0.003,[0,0.02,0],0.98,[1,1,0.5]);
  return {root,grounded:true,update(c,t){sphere.rotation.y=t*lerp(0.015,0.5,clamp(c.spin??0.18));}};}
});

export const notebook=defineModel({
 id:'notebook',aliases:['exercise-book','journal','schoolbook'],describe:'A closed cloth-bound notebook shows a thick stepped page block, rounded cover corners, ribbed spine, elastic closure and a fabric bookmark.',params:{format:'a5 | a4 (default a5)'},size:'0.22 m',
 build(ctx){const root=new THREE.Group(),large=ctx.str('format','a5',['a5','a4'] as const)==='a4';const w=large?0.22:0.15,h=large?0.30:0.21,d=0.026;
  box(ctx,root,w,h,d,[0,h/2,0],0.93,0.006);box(ctx,root,w-0.008,h-0.012,d*0.7,[0,h/2,0],0.56,0.003);
  box(ctx,root,w-0.012,h-0.016,d*0.66,[0,h/2,0.003],0.86,0.003);
  // Page edges and individual page grooves.
  for(let i=0;i<8;i++)box(ctx,root,w-0.014,0.0007,d*0.72,[0,h*0.22+i*h*0.075,d*0.16],0.58,0);
  box(ctx,root,0.012,h+0.002,d,[0,h/2,d*0.5],0.34,0.005);
  for(let y=0.025;y<h-0.02;y+=0.019)box(ctx,root,0.014,0.0013,d*0.12,[0,y,d*0.56],0.72,0.0006);
  box(ctx,root,0.009,h*0.36,0.003,[w*0.22,h*0.13,d*0.58],0.75,0.001);
  box(ctx,root,w*0.22,0.006,0.003,[w*0.19,h*0.31,d*0.58],0.9,0.001);
  // A narrow closure band and a bookmark protruding at the lower page edge.
  box(ctx,root,0.005,h-0.015,d*0.76,[w*0.39,h/2,d*0.34],0.38,0.0015);
  plate(ctx,root,[[-0.006,0.025],[0.006,0.025],[0.004,0],[-0.004,0]],0.002,[w*0.16,0,d*0.25],0.92,0.0005);
  return {root,grounded:true};}
});

export const stapler=defineModel({
 id:'stapler',aliases:['staple-gun','office-stapler'],describe:'A heavy metal stapler has a long lower anvil, tapered top lever, rear hinge and dark throat; `open` raises the lever.',controls:{open:'0 closed .. 1 raised lever (default 0.08)'},defaults:{open:0.08},size:'0.16 m',
 build(ctx){const root=new THREE.Group();box(ctx,root,0.15,0.012,0.065,[0,0.012,0],0.55,0.004);box(ctx,root,0.11,0.009,0.05,[0,0.024,0.005],0.92,0.003);
  // Throat and curved front nose.
  box(ctx,root,0.008,0.052,0.055,[0.071,0.045,0.004],0.28,0.002);
  const lever=new THREE.Group();lever.position.set(0,0.04,-0.025);root.add(lever);
  box(ctx,lever,0.14,0.018,0.048,[0,0.023,0.028],0.86,0.006);box(ctx,lever,0.13,0.004,0.05,[0,0.036,0.028],0.5,0.001);
  box(ctx,root,0.012,0.03,0.062,[-0.066,0.04,-0.025],0.62,0.003);
  for(let z=-0.01;z<0.045;z+=0.009)box(ctx,lever,0.004,0.002,0.034,[-0.048,0.035,z],0.26,0.0005);
  ball(ctx,root,0.006,[-0.066,0.04,0.012],0.95);
  return {root,grounded:true,update(c){lever.rotation.z=-clamp(c.open??0.08)*0.55;}};}
});

export const paperclip=defineModel({
 id:'paperclip',aliases:['paper-clip','clip'],describe:'A single continuous silver wire doubles back through two nested rounded loops, leaving the familiar long U-shaped paperclip silhouette.',size:'0.04 m',
 build(ctx){const root=new THREE.Group();const pts:V3[]=[[0.012,0.04,0],[0.019,0.037,0],[0.022,0.031,0],[0.022,0.009,0],[0.019,0.003,0],[0.008,0.002,0],[0.003,0.007,0],[0.003,0.031,0],[0.006,0.035,0],[0.015,0.035,0],[0.018,0.031,0],[0.018,0.012,0],[0.015,0.008,0],[0.008,0.008,0],[0.007,0.011,0],[0.007,0.027,0]];
  tube(ctx,root,pts,0.0013,0.86,84,8);return {root,grounded:true};}
});

export const envelope=defineModel({
 id:'envelope',aliases:['letter-envelope','mail-envelope'],describe:'A paper envelope has crisp folded side seams, a triangular front flap and a raised top flap that opens; `open` reveals the letter.',controls:{open:'0 sealed .. 1 flap opened (default 0)'},defaults:{open:0},size:'0.23 m',
 build(ctx){const root=new THREE.Group();const w=0.22,h=0.15;plate(ctx,root,[[-w/2,0],[w/2,0],[w/2,h],[0,h*0.86],[-w/2,h]],0.002,[0,h/2,0],0.8,0.001);
  // Front pocket and diagonal folded seams.
  plate(ctx,root,[[-w/2+0.004,0.005],[0,h*0.58],[w/2-0.004,0.005],[w/2-0.004,h-0.004],[-w/2+0.004,h-0.004]],0.001,[0,h/2,0.002],0.95,0.0004);
  tube(ctx,root,[[-w/2+0.005,0.005,0.003],[0,h*0.57,0.003],[w/2-0.005,0.005,0.003]],0.0008,0.5,24,4);
  const flap=new THREE.Group();flap.position.set(0,h-0.003,0.004);root.add(flap);
  plate(ctx,flap,[[-w/2+0.002,0],[w/2-0.002,0],[0,-h*0.62]],0.001,[0,-h*0.3,0],0.72,0.0004);
  return {root,grounded:true,update(c){flap.rotation.x=-clamp(c.open??0)*deg(140);}};}
});

export const briefcase=defineModel({
 id:'briefcase',aliases:['attache-case','business-case','suitcase'],describe:'A rigid leather briefcase has reinforced rounded corners, twin clasp plates, a stitched panel and a broad raised handle; `open` lifts the hinged lid.',controls:{open:'0 latched .. 1 lid open (default 0)'},defaults:{open:0},size:'0.43 m',
 build(ctx){const root=new THREE.Group(),w=0.42,h=0.28,d=0.12;box(ctx,root,w,h,d,[0,h/2,0],0.7,0.018);box(ctx,root,w-0.025,h-0.035,0.006,[0,h*0.52,d/2+0.004],0.85,0.006);
  for(const x of [-0.16,0.16]){box(ctx,root,0.045,0.032,0.008,[x,h*0.73,d/2+0.009],0.98,0.004);box(ctx,root,0.01,0.028,0.009,[x,h*0.73,d/2+0.015],0.28,0.002);}
  // Stiff handle with two feet and a curved arch.
  for(const x of [-0.075,0.075])box(ctx,root,0.025,0.045,0.03,[x,h+0.017,d/2-0.005],0.48,0.004);
  tube(ctx,root,[[-0.075,h+0.035,d/2],[-0.075,h+0.085,d/2],[-0.045,h+0.105,d/2],[0.045,h+0.105,d/2],[0.075,h+0.085,d/2],[0.075,h+0.035,d/2]],0.008,0.82,48,10);
  const lid=new THREE.Group();lid.position.set(0,h-0.012,-d/2+0.015);root.add(lid);box(ctx,lid,w,h*0.82,d*0.55,[0,h*0.41,d*0.26],0.72,0.016);
  for(const x of [-0.16,0.16])box(ctx,lid,0.05,0.026,0.009,[x,h*0.08,d*0.52],0.94,0.003);
  return {root,grounded:true,update(c){lid.rotation.x=clamp(c.open??0)*deg(112);}};}
});

export const wallet=defineModel({
 id:'wallet',aliases:['billfold','bifold-wallet','purse'],describe:'A compact bifold wallet has rounded leather panels, visible card pockets and a contrasting edge seam; `open` unfolds it to show compartments.',controls:{open:'0 folded .. 1 open flat (default 0.45)'},defaults:{open:0.45},size:'0.22 m',
 build(ctx){const root=new THREE.Group(),w=0.21,h=0.095,d=0.018;box(ctx,root,w,h,d,[0,h/2,0],0.68,0.009);
  box(ctx,root,w*0.48,h-0.012,d*0.42,[-w*0.25,h/2,d*0.58],0.86,0.005);
  for(let i=0;i<3;i++){const x=-w*0.31+i*w*0.145;plate(ctx,root,[[x-0.026,0.03],[x+0.026,0.03],[x+0.026,h-0.012],[x-0.026,h*0.69]],0.002,[0,0,d*0.78],0.42+i*0.12,0.001);}
  // stitched perimeter
  const seam=ctx.mesh(G.tube([[-w*0.46,0.009,d*0.57],[w*0.46,0.009,d*0.57],[w*0.46,h-0.009,d*0.57],[-w*0.46,h-0.009,d*0.57],[-w*0.46,0.009,d*0.57]],0.00075,64,5),{tone:0.98});root.add(seam);
  const flap=new THREE.Group();flap.position.set(0,h/2,-d/2);root.add(flap);box(ctx,flap,w*0.48,h,d,[w*0.25,0,d/2],0.72,0.008);
  return {root,grounded:true,update(c){flap.rotation.y=-clamp(c.open??0.45)*deg(158);}};}
});

export const creditCard=defineModel({
 id:'credit-card',aliases:['bank-card','payment-card','debit-card'],describe:'A rounded payment card shows a metallic chip, dark magnetic stripe and contactless symbol in the upper corner.',size:'0.086 m',
 build(ctx){const root=new THREE.Group(),w=0.086,h=0.054,d=0.0014;box(ctx,root,w,h,d,[0,h/2,0],0.8,0.004);
  box(ctx,root,0.019,0.015,0.003,[-w*0.25,h*0.58,d/2+0.002],0.96,0.002);
  box(ctx,root,0.007,0.015,0.003,[-w*0.25,h*0.58,d/2+0.0035],0.32,0.0007);
  box(ctx,root,0.012,0.0012,0.003,[-w*0.25,h*0.58,d/2+0.0035],0.32,0);
  box(ctx,root,w*0.9,0.008,0.002,[0,h*0.84,d/2+0.0018],0.2,0.0005);
  for(let i=0;i<3;i++)torus(ctx,root,0.005+i*0.003,0.0008,[w*0.32,h*0.65,d/2+0.002],0.98,[0.45,1,0.25]);
  for(let i=0;i<4;i++)box(ctx,root,0.026-i*0.002,0.0012,0.002,[-w*0.25,h*(0.30-i*0.045),d/2+0.0018],0.48,0);
  return {root,grounded:true};}
});

// ---------------------------------------------------------------- personal wear
export const wristwatch=defineModel({
 id:'wristwatch',aliases:['watch','wrist-watch','analog-watch'],describe:'A round analog wristwatch has a marked dial, bezel, crown, stitched leather strap and two moving hands; `time` sets their rate.',controls:{time:'0 stopped .. 1 fast clockwise hands (default 0.35)'},defaults:{time:0.35},size:'0.24 m long',
 build(ctx){const root=new THREE.Group();box(ctx,root,0.04,0.065,0.012,[0,0.14,0],0.52,0.012);box(ctx,root,0.04,0.065,0.012,[0,0.015,0],0.52,0.012);
  for(let y=0.035;y<0.13;y+=0.013)box(ctx,root,0.035,0.002,0.014,[0,y,0],0.72,0.001);
  const z=0.009;torus(ctx,root,0.037,0.004,[0,0.09,z],0.96);torus(ctx,root,0.032,0.0018,[0,0.09,z+0.001],0.42);
  root.add(ctx.mesh(at(G.cyl(0.03,0.03,0.004,48),[0,0.09,z-0.001],[90,0,0]),{tone:0.18}));
  const dial=new THREE.Group();dial.position.set(0,0.09,z+0.002);root.add(dial);
  for(let i=0;i<12;i++){const a=i*Math.PI/6;box(ctx,dial,i%3===0?0.002:0.001,0.006,0.001,[Math.sin(a)*0.022,Math.cos(a)*0.022,0.002],0.96,0);}
  const hour=new THREE.Group();hour.position.z=0.004;dial.add(hour);hour.add(ctx.mesh(at(G.rbox(0.0027,0.015,0.001,0.0003),[0,0.0075,0]),{tone:0.9}));
  const minute=new THREE.Group();minute.position.z=0.005;dial.add(minute);minute.add(ctx.mesh(at(G.rbox(0.0018,0.021,0.001,0.0002),[0,0.0105,0]),{tone:1}));
  ball(ctx,dial,0.003,[0,0,0.007],0.4);
  // Crown and two fluted shoulders.
  cyl(ctx,root,0.004,0.012,[0.037,0.09,0],0.76,16).rotation.z=deg(90);
  for(const y of [0.077,0.103])box(ctx,root,0.005,0.01,0.009,[0.032,y,0],0.86,0.001);
  return {root,grounded:true,update(c,t){const r=(c.time??0.35);hour.rotation.z=-t*r*0.16;minute.rotation.z=-t*r*1.5;}};}
});

export const glasses=defineModel({
 id:'glasses',aliases:['eyeglasses','spectacles','eyewear','sunglasses'],describe:'Two round metal-rimmed lenses join at a narrow bridge, with nose pads and long temples folded back; one lens is slightly darker.',size:'0.14 m wide',
 build(ctx){const root=new THREE.Group();for(const s of [-1,1]){torus(ctx,root,0.031,0.0025,[s*0.034,0.055,0],0.92,[1.05,0.92,0.3]);
   root.add(ctx.mesh(at(G.cyl(0.027,0.027,0.0008,32),[s*0.034,0.055,-0.001],[90,0,0]),{tone:s<0?0.36:0.65}));
   tube(ctx,root,[[s*0.064,0.06,0],[s*0.085,0.065,-0.003],[s*0.11,0.06,-0.025],[s*0.13,0.052,-0.062]],0.0018,0.68,32,6);
   tube(ctx,root,[[s*0.025,0.045,0.002],[s*0.019,0.038,0.008],[s*0.012,0.041,0.006]],0.0012,0.98,12,5);
  }
  tube(ctx,root,[[-0.004,0.065,0],[0,0.07,0.003],[0.004,0.065,0]],0.002,1,12,6);
  return {root,grounded:false};}
});

export const hat=defineModel({
 id:'hat',aliases:['fedora','felt-hat','brimmed-hat'],describe:'A classic felt fedora has a wide pinched brim, a tapered crown with a shallow top dent and a contrasting ribbon band.',size:'0.3 m',
 build(ctx){const root=new THREE.Group();lathe(ctx,root,[[0,0.018],[0.12,0.018],[0.15,0.02],[0.145,0.033],[0.11,0.038],[0.09,0.045],[0.09,0.13],[0.075,0.165],[0.04,0.178],[0,0.17]],[0,0,0],0.73,48);
  lathe(ctx,root,[[0.085,0.047],[0.093,0.04],[0.095,0.052],[0.088,0.059]],[0,0,0],0.3,48);
  torus(ctx,root,0.09,0.004,[0,0.052,0],0.96,[1,1,0.26]);
  // Pinched creases and a small ribbon bow.
  tube(ctx,root,[[-0.035,0.158,0.04],[-0.025,0.168,0.068],[0,0.171,0.074],[0.025,0.168,0.068],[0.035,0.158,0.04]],0.0018,0.94,24,6);
  ball(ctx,root,0.007,[0.095,0.052,0],0.96);torus(ctx,root,0.008,0.002,[0.108,0.052,0],0.8,[1.4,0.5,1]);
  return {root,grounded:true};}
});

export const sneaker=defineModel({
 id:'sneaker',aliases:['trainer','running-shoe','tennis-shoe','athletic-shoe'],describe:'A low-top sneaker has a thick rubber sole, rounded toe, raised heel counter, padded tongue, lace eyelets and bright crossed laces.',size:'0.28 m long',
 build(ctx){const root=new THREE.Group();
  ball(ctx,root,0.055,[0,0.075,0.035],0.68,[1.12,0.78,2.35]);
  // outsole and contrasting midsole wrap the toe and heel.
  ball(ctx,root,0.056,[0,0.029,0.03],0.96,[1.18,0.33,2.5]);box(ctx,root,0.105,0.012,0.16,[0,0.013,0.025],0.42,0.006);
  ball(ctx,root,0.046,[0,0.099,-0.045],0.84,[1.05,1.04,0.8]);
  // raised tongue, collar opening and heel tab
  box(ctx,root,0.049,0.091,0.045,[0,0.13,-0.015],0.9,0.012);
  torus(ctx,root,0.026,0.006,[0,0.148,-0.035],0.32,[1,0.5,1.5]);
  box(ctx,root,0.025,0.038,0.008,[0,0.142,-0.086],0.96,0.003);
  // paired eyelets and alternating lace crossings on top.
  for(let i=0;i<5;i++){const z=0.04-i*0.022,y=0.117+i*0.004;
   for(const s of [-1,1]){ball(ctx,root,0.003,[s*(0.018-i*0.001),y,z],0.24,[1,1,0.5]);}
   tube(ctx,root,[[-0.018+i*0.001,y+0.002,z],[(i%2?0.006:-0.006),y+0.008,z-0.01],[0.018-i*0.001,y+0.002,z-0.018]],0.0018,1,18,5);
  }
  for(let i=0;i<7;i++)box(ctx,root,0.092,0.0013,0.002,[0,0.026,-0.052+i*0.022],0.23,0);
  return {root,grounded:true};}
});

export const tshirt=defineModel({
 id:'t-shirt',aliases:['tee-shirt','tee','shirt'],describe:'A short-sleeved T-shirt has a broad torso, sloping shoulders, flared sleeves, ribbed crew neck and stitched hem.',size:'0.55 m tall',
 build(ctx){const root=new THREE.Group();const shape:P2[]=[[-0.13,0.55],[-0.23,0.52],[-0.34,0.40],[-0.27,0.31],[-0.20,0.36],[-0.20,0.04],[0.20,0.04],[0.20,0.36],[0.27,0.31],[0.34,0.40],[0.23,0.52],[0.13,0.55],[0.09,0.48],[-0.09,0.48]];
  plate(ctx,root,shape,0.028,[0,0,0],0.78,0.006);
  // Neck opening is a raised dark ring, with collar seam and sleeve hems.
  torus(ctx,root,0.061,0.012,[0,0.51,0.018],0.35,[1.18,0.62,0.22]);
  torus(ctx,root,0.063,0.003,[0,0.51,0.021],0.98,[1.18,0.62,0.22]);
  for(const s of [-1,1])tube(ctx,root,[[s*0.27,0.316,0.016],[s*0.285,0.36,0.016],[s*0.34,0.4,0.016]],0.0022,0.95,18,5);
  box(ctx,root,0.37,0.003,0.002,[0,0.065,0.017],0.96,0.0005);
  // Center placket-like stitch lines make the hanging garment read from a distance.
  tube(ctx,root,[[0,0.14,0.018],[0,0.44,0.018]],0.0012,0.5,24,4);
  return {root,grounded:true};}
});

export const backpack=defineModel({
 id:'backpack',aliases:['rucksack','school-bag','backpack-bag'],describe:'A rounded school backpack has a domed main compartment, deep front pocket, twin side bottle pockets, zip piping, shoulder straps and a carry loop.',size:'0.42 m tall',
 build(ctx){const root=new THREE.Group();box(ctx,root,0.29,0.36,0.16,[0,0.21,-0.005],0.72,0.055);
  box(ctx,root,0.245,0.16,0.045,[0,0.115,0.091],0.86,0.03);
  box(ctx,root,0.22,0.018,0.05,[0,0.21,0.096],0.56,0.008);
  for(const s of [-1,1]){
   ball(ctx,root,0.035,[s*0.15,0.12,0],0.9,[0.72,1.05,1.18]);
   tube(ctx,root,[[s*0.09,0.36,0.01],[s*0.14,0.33,-0.01],[s*0.145,0.21,-0.035],[s*0.105,0.06,0.025],[s*0.08,0.04,0.06]],0.012,0.35,36,8);
   // zippers and pull tabs
   tube(ctx,root,[[s*0.12,0.34,0.055],[s*0.13,0.28,0.075],[s*0.12,0.20,0.09]],0.0018,0.98,28,5);
   box(ctx,root,0.008,0.025,0.004,[s*0.12,0.19,0.098],0.94,0.002);
  }
  tube(ctx,root,[[-0.045,0.382,-0.01],[-0.045,0.43,-0.01],[0.045,0.43,-0.01],[0.045,0.382,-0.01]],0.009,0.84,28,8);
  box(ctx,root,0.19,0.055,0.006,[0,0.14,0.116],0.47,0.01);
  return {root,grounded:true};}
});

// ---------------------------------------------------------------- music
export const acousticGuitar=defineModel({
 id:'acoustic-guitar',aliases:['guitar','steel-string-guitar','folk-guitar'],describe:'An acoustic guitar has a double-waisted wooden body, dark sound hole, bridge, long fretted neck, six strings and tuning pegs; `strum` adds a gentle string vibration.',controls:{strum:'0 quiet .. 1 active strumming (default 0.25)'},defaults:{strum:0.25},size:'1.05 m tall',
 build(ctx){const root=new THREE.Group();
  const bodyShape:P2[]=[[0,0],[0.09,0.02],[0.14,0.09],[0.15,0.17],[0.13,0.24],[0.09,0.28],[0.085,0.35],[0.11,0.41],[0.105,0.49],[0.07,0.54],[0,0.56],[-0.07,0.54],[-0.105,0.49],[-0.11,0.41],[-0.085,0.35],[-0.09,0.28],[-0.13,0.24],[-0.15,0.17],[-0.14,0.09],[-0.09,0.02]];
  plate(ctx,root,bodyShape,0.075,[0,0.02,0],0.75,0.014);plate(ctx,root,bodyShape,0.012,[0,0.02,0.043],0.95,0.006);
  torus(ctx,root,0.043,0.003,[0,0.30,0.052],0.42);torus(ctx,root,0.05,0.001,[0,0.30,0.051],0.75);
  box(ctx,root,0.12,0.022,0.01,[0,0.11,0.055],0.35,0.004);box(ctx,root,0.12,0.004,0.012,[0,0.122,0.06],1,0.001);
  // Neck and peghead are slightly angled; raised fret bars cross the dark fingerboard.
  box(ctx,root,0.062,0.48,0.052,[0,0.80,0],0.48,0.008);box(ctx,root,0.051,0.48,0.008,[0,0.80,0.031],0.19,0.003);
  box(ctx,root,0.08,0.12,0.054,[0,1.09,0],0.74,0.012);
  for(let i=0;i<13;i++){const y=0.59+i*0.032;box(ctx,root,0.054,0.002,0.004,[0,y,0.037],0.96,0.0005);}
  const strings:THREE.Mesh[]=[];for(let i=0;i<6;i++){const x=-0.02+i*0.008;const st=ctx.mesh(G.tube([[x,0.12,0.065],[x,0.30,0.06],[x,1.12,0.03]],0.0007,84,4),{tone:i%2?0.65:1});root.add(st);strings.push(st);}
  for(const y of [1.07,1.12])for(let i=0;i<3;i++){const s=i<2?-1:1;const yy=y+(i===2?0.03:0);ball(ctx,root,0.004,[s*0.05,yy,0],0.95,[1,1,1.4]);tube(ctx,root,[[s*0.014,yy,0],[s*0.055,yy,0]],0.0018,0.85,8,5);}
  for(let i=0;i<3;i++)torus(ctx,root,0.119-i*0.004,0.0015,[0,0.15+i*0.15,0.038],0.38,[1,1,0.2]);
  return {root,grounded:true,update(c,t){const a=clamp(c.strum??0.25);for(let i=0;i<strings.length;i++)strings[i]!.position.x=Math.sin(t*34+i*0.7)*a*0.0015;}};}
});

export const grandPiano=defineModel({
 id:'grand-piano',aliases:['concert-grand','baby-grand','piano'],describe:'A black grand piano has a broad curved case, three legs and brass casters, a complete keyboard and a hinged lid that rises on its prop; `lid` opens it.',controls:{lid:'0 closed .. 1 fully raised (default 0.65)'},defaults:{lid:0.65},size:'1.55 m wide',
 build(ctx){const root=new THREE.Group();const w=1.5,d=1.3,h=0.72;
  // The asymmetrical footprint gives the case its wide keyboard end and rounded tail.
  const footprint:P2[]=[[-0.75,0.60],[0.75,0.60],[0.75,0.16],[0.70,-0.28],[0.55,-0.52],[0.28,-0.66],[-0.28,-0.66],[-0.55,-0.52],[-0.70,-0.28],[-0.75,0.16]];
  const shell=G.extrude(footprint,0.30,0.035);shell.rotateX(Math.PI/2);shell.translate(0,0.55,0);root.add(ctx.mesh(shell,{tone:0.86}));
  const lidShape=footprint.map(([x,z])=>[x,z+0.66] as P2);const top=G.extrude(footprint,0.018,0.006);top.rotateX(Math.PI/2);top.translate(0,0.711,0);root.add(ctx.mesh(top,{tone:0.96}));
  const rimPts:V3[]=[];
  for(const [x,z] of footprint)rimPts.push([x,0.722,z]);rimPts.push([footprint[0]![0],0.722,footprint[0]![1]]);
  tube(ctx,root,rimPts,0.004,0.48,96,6);
  box(ctx,root,1.38,0.12,0.34,[0,0.67,0.46],0.88,0.045);
  for(const [x,z] of [[-0.61,0.35],[0.61,0.35],[0,-0.55]] as [number,number][]){
   lathe(ctx,root,[[0.04,0],[0.055,0.03],[0.045,0.18],[0.032,0.28],[0.052,0.38],[0.052,0.42],[0,0.42]],[x,0,z],0.92,20);
   cyl(ctx,root,0.03,0.018,[x,0.01,z],0.95,20);
  }
  // White and raised black keys at the front, each with a bevelled key edge.
  for(let i=0;i<52;i++){const x=-0.64+i*0.0246;box(ctx,root,0.0237,0.07,0.29,[x,0.735,0.55],0.99,0.002);box(ctx,root,0.020,0.003,0.24,[x,0.772,0.55],1,0.001);}
  const blackAt=(i:number)=>![2,6].includes(i%7);
  for(let i=0;i<52;i++)if(blackAt(i)){const x=-0.64+i*0.0246+0.012;box(ctx,root,0.014,0.035,0.14,[x,0.775,0.47],0.16,0.003);}
  // Music desk and brass pedals.
  box(ctx,root,0.82,0.012,0.24,[0,0.88,-0.07],0.82,0.01);box(ctx,root,0.025,0.12,0.02,[0,0.82,-0.07],0.65,0.004);
  for(let i=0;i<3;i++)box(ctx,root,0.035,0.012,0.11,[(i-1)*0.12,0.11,0.17],0.9,0.004);
  const lid=new THREE.Group();lid.position.set(0,h,-0.66);root.add(lid);const lidGeo=G.extrude(lidShape,0.045,0.008);lidGeo.rotateX(Math.PI/2);lid.add(ctx.mesh(lidGeo,{tone:0.84}));
  const prop=ctx.mesh(at(G.cyl(0.008,0.008,0.72,12),[0,0.36,0]),{tone:0.94});root.add(prop);prop.position.set(0.46,h+0.3,-0.18);
  return {root,grounded:true,update(c){const a=clamp(c.lid??0.65);lid.rotation.x=-a*deg(53);prop.visible=a>0.08;prop.scale.y=Math.max(0.02,a);}};}
});

export const violin=defineModel({
 id:'violin',aliases:['fiddle','viola','string-violin'],describe:'A violin has a narrow waisted amber body, carved f-holes, bridge, four strings, a long ebony fingerboard, scroll and tuning pegs; `bow` moves the bow across its strings.',controls:{bow:'0 still .. 1 bowing motion (default 0)'},defaults:{bow:0},size:'0.6 m',
 build(ctx){const root=new THREE.Group(),bodyShape:P2[]=[[0,0],[0.075,0.015],[0.10,0.055],[0.09,0.105],[0.065,0.14],[0.06,0.19],[0.08,0.23],[0.1,0.29],[0.095,0.34],[0.07,0.38],[0,0.40],[-0.07,0.38],[-0.095,0.34],[-0.1,0.29],[-0.08,0.23],[-0.06,0.19],[-0.065,0.14],[-0.09,0.105],[-0.1,0.055],[-0.075,0.015]];
  plate(ctx,root,bodyShape,0.052,[0,0.02,0],0.74,0.012);plate(ctx,root,bodyShape,0.009,[0,0.02,0.03],0.9,0.004);
  // Twin f-shaped sound slots are individually traced and visible in silhouette.
  for(const s of [-1,1]){tube(ctx,root,[[s*0.04,0.22,0.037],[s*0.045,0.24,0.037],[s*0.035,0.26,0.037],[s*0.04,0.28,0.037],[s*0.047,0.30,0.037],[s*0.04,0.32,0.037]],0.003,0.2,28,6);ball(ctx,root,0.004,[s*0.04,0.22,0.038],0.15);ball(ctx,root,0.004,[s*0.04,0.32,0.038],0.15);}
  box(ctx,root,0.012,0.105,0.014,[0,0.225,0.045],0.95,0.003);box(ctx,root,0.041,0.19,0.04,[0,0.50,0],0.23,0.008);
  box(ctx,root,0.052,0.1,0.043,[0,0.645,0],0.8,0.012);ball(ctx,root,0.022,[0,0.70,0],0.66,[1,1.2,0.9]);
  for(const s of [-1,1]){ball(ctx,root,0.006,[s*0.037,0.63,0],0.92,[1,2.3,1]);tube(ctx,root,[[s*0.04,0.64,0],[s*0.055,0.65,0],[s*0.055,0.69,0]],0.003,0.88,16,6);}
  const strings:THREE.Mesh[]=[];for(let i=0;i<4;i++){const x=-0.012+i*0.008;const st=ctx.mesh(G.tube([[x,0.12,0.054],[x,0.31,0.047],[x,0.63,0.025]],0.0008,68,4),{tone:0.96});root.add(st);strings.push(st);}
  const bowG=new THREE.Group();bowG.position.set(0,0.28,0.07);root.add(bowG);box(ctx,bowG,0.012,0.34,0.01,[0,0,0],0.65,0.004);box(ctx,bowG,0.002,0.34,0.003,[0,0,0.007],0.97,0);
  return {root,grounded:true,update(c,t){bowG.rotation.z=Math.sin(t*7)*clamp(c.bow??0)*0.28;}};}
});

export const drumKit=defineModel({
 id:'drum-kit',aliases:['drums','drum-set','percussion-kit'],describe:'A compact drum kit has a front-facing bass drum, mounted toms, snare, hi-hat and two cymbals on metal stands; `beat` drives the sticks and pedal.',controls:{beat:'0 still .. 1 steady drumming (default 0)'},defaults:{beat:0},size:'1.8 m wide',
 build(ctx){const root=new THREE.Group();const bass=new THREE.Group();bass.position.set(0,0.36,0.46);root.add(bass);
  root.add(ctx.mesh(at(G.cyl(0.34,0.34,0.48,40),[0,0,0],[90,0,0]),{tone:0.56}));
  for(const z of [0.22,0.70])torus(ctx,root,0.34,0.012,[0,0.36,z],0.94,[1,1,0.12]);
  root.add(ctx.mesh(at(G.cyl(0.30,0.30,0.012,40),[0,0.36,0.71],[90,0,0]),{tone:0.88}));
  // Snare and rack toms with rims and lug bolts.
  const drum=(x:number,y:number,z:number,r:number,h:number)=>{root.add(ctx.mesh(at(G.cyl(r,r,h,32),[x,y,z],[90,0,0]),{tone:0.62}));root.add(ctx.mesh(at(G.cyl(r*0.94,r*0.94,0.009,32),[x,y,z+h/2+0.004],[90,0,0]),{tone:0.92}));for(let i=0;i<8;i++){const a=i*Math.PI/4;ball(ctx,root,0.009,[x+Math.cos(a)*r,y+Math.sin(a)*r,z],0.98,[1,1,0.55]);}};
  drum(-0.43,0.29,0.12,0.20,0.11);drum(-0.28,0.74,-0.02,0.18,0.16);drum(0.15,0.77,-0.03,0.17,0.15);drum(0.42,0.70,0.04,0.22,0.2);
  const stand=(x:number,z:number,yTop:number)=>{tube(ctx,root,[[x,0.03,z],[x,yTop,z]],0.006,0.62,10,6);for(const a of [0,2.1,4.2])tube(ctx,root,[[x,0.18,z],[x+Math.cos(a)*0.13,0.02,z+Math.sin(a)*0.13]],0.004,0.8,12,5);};
  const cymbals:THREE.Group[]=[];for(const [x,z,r] of [[-0.68,-0.1,0.23],[0.60,-0.25,0.25],[0.18,-0.36,0.16]] as [number,number,number][]){stand(x,z,1.48);const c=new THREE.Group();c.position.set(x,1.48,z);root.add(c);c.add(ctx.mesh(at(G.cyl(r*0.18,r,0.016,40),[0,0,0]),{tone:0.95}));c.add(ctx.mesh(at(G.cyl(0.025,0.025,0.025,16),[0,0.018,0]),{tone:0.45}));cymbals.push(c);}
  const sticks:THREE.Group[]=[];for(const s of [-1,1]){const st=new THREE.Group();st.position.set(s*0.10,1.03,0.27);root.add(st);box(ctx,st,0.012,0.32,0.012,[s*0.03,0,0],0.91,0.004);ball(ctx,st,0.009,[s*0.03,0.16,0],1);sticks.push(st);}
  return {root,grounded:true,update(c,t){const a=clamp(c.beat??0);sticks[0]!.rotation.z=Math.sin(t*12)*a*0.62;sticks[1]!.rotation.z=-Math.sin(t*12+1)*a*0.62;cymbals.forEach((x,i)=>{x.rotation.z=Math.sin(t*17+i)*a*0.07;x.rotation.x=Math.sin(t*15+i)*a*0.06;});}};}
});

export const trumpet=defineModel({
 id:'trumpet',aliases:['brass-trumpet','cornet','brass-instrument'],describe:'A polished trumpet curls its three brass pipes into a wide bell, with three raised piston valves, valve buttons and a mouthpiece; `play` presses the valves.',controls:{play:'0 valves up .. 1 valves pumping (default 0)'},defaults:{play:0},size:'0.5 m',
 build(ctx){const root=new THREE.Group();
  // Main lead pipe runs to the front-facing bell, with two curled return loops below it.
  tube(ctx,root,[[-0.34,0.27,0.025],[-0.28,0.27,0.025],[-0.24,0.31,0.025],[-0.12,0.31,0.025],[0.12,0.31,0.025],[0.27,0.31,0.025]],0.009,0.92,84,10);
  tube(ctx,root,[[-0.12,0.31,0.025],[-0.12,0.16,0.025],[-0.05,0.11,0.025],[0.12,0.11,0.025],[0.17,0.16,0.025],[0.17,0.31,0.025]],0.008,0.84,72,9);
  tube(ctx,root,[[0.02,0.31,0.025],[0.02,0.20,0.025],[-0.02,0.17,0.025],[-0.18,0.17,0.025],[-0.20,0.21,0.025],[-0.20,0.27,0.025]],0.007,0.72,60,8);
  const bellGeo=at(G.lathe([[0.016,0],[0.019,0.04],[0.027,0.10],[0.048,0.16],[0.078,0.21],[0.08,0.22],[0.07,0.22],[0.044,0.16],[0.023,0.09],[0.012,0.03],[0.012,0]],40),[0.27,0.31,0.03],[90,0,0]);root.add(ctx.mesh(bellGeo,{tone:0.98}));
  torus(ctx,root,0.077,0.003,[0.27,0.31,0.25],0.55,[1,1,1]);
  // Cup-shaped mouthpiece and the three piston valve stems.
  tube(ctx,root,[[-0.34,0.27,0.025],[-0.40,0.27,0.025],[-0.43,0.29,0.025]],0.006,0.88,24,8);torus(ctx,root,0.008,0.002,[-0.43,0.29,0.025],0.98,[1,1,0.5]);
  const valves:THREE.Group[]=[];for(let i=0;i<3;i++){const x=-0.08+i*0.08;lathe(ctx,root,[[0.012,0],[0.014,0.02],[0.011,0.10],[0.014,0.12],[0,0.12]],[x,0.30,0.01],0.68,20);const v=new THREE.Group();v.position.set(x,0.42,0.01);root.add(v);cyl(ctx,v,0.019,0.008,[0,0,0],0.96,24);torus(ctx,v,0.016,0.0015,[0,0.006,0],0.42,[1,1,0.3]);valves.push(v);}
  for(let i=0;i<3;i++)tube(ctx,root,[[-0.08+i*0.08,0.30,0.02],[-0.08+i*0.08,0.27,0.09],[-0.02+i*0.08,0.27,0.14]],0.0055,0.7,24,7);
  return {root,grounded:true,update(c,t){valves.forEach((v,i)=>{v.position.y=0.18-Math.max(0,Math.sin(t*9+i*2))*clamp(c.play??0)*0.018;});}};}
});

// ---------------------------------------------------------------- sport
export const soccerBall=defineModel({
 id:'soccer-ball',aliases:['football','association-football','football-ball'],describe:'A stitched black-and-white football has a central pentagon and curved pentagonal panels wrapped over its spherical surface.',size:'0.22 m',
 build(ctx){const root=new THREE.Group(),r=0.11;ball(ctx,root,r,[0,r,0],0.91);
  const patch=(normal:V3,count:number,phase:number)=>{const n=new THREE.Vector3(...normal).normalize();const u=new THREE.Vector3().crossVectors(n,new THREE.Vector3(0,1,0));if(u.length()<0.1)u.set(1,0,0);u.normalize();const v=new THREE.Vector3().crossVectors(n,u).normalize();const rad=0.019;
   const points:P2[]=[];for(let i=0;i<count;i++){const a=phase+2*Math.PI*i/count;points.push([Math.cos(a)*rad,Math.sin(a)*rad]);}
   const mesh=ctx.mesh(G.extrude(points,0.001,0.0002),{tone:0.16});mesh.position.set(n.x*(r+0.001),r+n.y*(r+0.001),n.z*(r+0.001));mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),n);root.add(mesh);
   const edge:V3[]=[];for(let i=0;i<=count;i++){const a=phase+2*Math.PI*i/count;const q=n.clone().addScaledVector(u,Math.cos(a)*0.19).addScaledVector(v,Math.sin(a)*0.19).normalize().multiplyScalar(r+0.0015);edge.push([q.x,q.y+r,q.z]);}tube(ctx,root,edge,0.0006,0.25,40,4);
  };
  patch([0,0,1],5,Math.PI/5);for(let i=0;i<5;i++){const a=i*Math.PI*2/5;patch([Math.sin(0.74)*Math.cos(a),Math.cos(0.74),Math.sin(0.74)*Math.sin(a)],5,i%2?0:Math.PI/5);}
  // seam arcs join each panel and read as stitched leather.
  for(let i=0;i<3;i++){const a=i*Math.PI/3;const pts:V3[]=[];for(let j=0;j<=24;j++){const b=j/24*Math.PI*2;pts.push([r*Math.cos(b)*Math.cos(a),r+r*Math.sin(b),r*Math.cos(b)*Math.sin(a)]);}tube(ctx,root,pts,0.0005,0.48,48,4);}
  return {root,grounded:true};}
});

export const basketball=defineModel({
 id:'basketball',aliases:['basket-ball','orange-ball'],describe:'A pebbled orange basketball is crossed by deep black curved channels, including the long seam and two sweeping side grooves.',size:'0.24 m',
 build(ctx){const root=new THREE.Group(),r=0.12;ball(ctx,root,r,[0,r,0],0.86);
  // Fine pebble dimples as a regular staggered surface field.
  const dots:THREE.BufferGeometry[]=[];for(let lat=-5;lat<=5;lat++)for(let lon=0;lon<18;lon++){
   const phi=lat*0.25,theta=lon*Math.PI*2/18+(lat%2)*0.08;const x=Math.cos(phi)*Math.cos(theta),y=Math.sin(phi),z=Math.cos(phi)*Math.sin(theta);
   dots.push(at(G.sphere(0.0012,6,4),[x*(r+0.0004),r+y*(r+0.0004),z*(r+0.0004)]));
  }
  root.add(ctx.mesh(G.merge(dots),{tone:0.43}));
  const circle=(axis:'x'|'y'|'z',offset:number)=>{const pts:V3[]=[];for(let i=0;i<=96;i++){const a=i/96*Math.PI*2;let x=0,y=0,z=0;if(axis==='y'){x=Math.cos(a)*Math.sqrt(r*r-offset*offset);y=offset;z=Math.sin(a)*Math.sqrt(r*r-offset*offset);}else if(axis==='x'){x=offset;y=Math.cos(a)*Math.sqrt(r*r-offset*offset);z=Math.sin(a)*Math.sqrt(r*r-offset*offset);}else{x=Math.cos(a)*Math.sqrt(r*r-offset*offset);y=Math.sin(a)*Math.sqrt(r*r-offset*offset);z=offset;}pts.push([x,r+y,z]);}tube(ctx,root,pts,0.0023,0.17,96,6);};
  circle('y',0);circle('x',0);circle('z',0.02);circle('z',-0.02);
  return {root,grounded:true};}
});

export const tennisRacket=defineModel({
 id:'tennis-racket',aliases:['racket','tennis-racquet','racquet'],describe:'An oval tennis-racket head surrounds a dense crossed string bed, joined to a long tapered handle with a wrapped grip and butt cap.',size:'0.69 m',
 build(ctx){const root=new THREE.Group();torus(ctx,root,0.13,0.008,[0,0.45,0],0.9,[0.78,1.36,0.6]);
  // String grid follows a narrowed oval boundary.
  for(let i=-5;i<=5;i++){const x=i*0.016;const half=0.105*Math.sqrt(Math.max(0.12,1-x*x/0.020));tube(ctx,root,[[x,0.45-half,0.003],[x,0.45+half,0.003]],0.0008,0.92,32,4);}
  for(let i=-7;i<=7;i++){const y=0.45+i*0.018;const q=(y-0.45)/0.15;const half=0.10*Math.sqrt(Math.max(0.1,1-q*q));tube(ctx,root,[[-half,y,0.004],[half,y,0.004]],0.0008,0.92,32,4);}
  tube(ctx,root,[[0,0.32,0],[0,0.22,0],[0,0.13,0],[0,0.04,0]],0.018,0.75,28,10);
  for(let i=0;i<6;i++)box(ctx,root,0.022,0.006,0.02,[0,0.095+i*0.015,0.009],i%2?0.34:0.92,0.002);
  box(ctx,root,0.034,0.014,0.03,[0,0.025,0],0.28,0.005);
  return {root,grounded:true};}
});

export const trophyCup=defineModel({
 id:'trophy-cup',aliases:['trophy','champions-cup','award-cup'],describe:'A polished two-handled trophy cup rises from a stepped engraved plinth, with flared bowl, curled handles and a small star medallion.',size:'0.32 m',
 build(ctx){const root=new THREE.Group();lathe(ctx,root,[[0,0],[0.075,0],[0.084,0.012],[0.084,0.035],[0.056,0.04],[0.048,0.08],[0.065,0.11],[0.105,0.18],[0.12,0.245],[0.115,0.255],[0.108,0.248],[0.098,0.185],[0.055,0.12],[0.035,0.09],[0.03,0.05],[0,0.05]],[0,0,0],0.96,48);
  lathe(ctx,root,[[0.03,0],[0.045,0],[0.04,0.07],[0.034,0.08],[0,0.08]],[0,0.04,0],0.82,32);
  lathe(ctx,root,[[0,0],[0.105,0],[0.115,0.012],[0.115,0.035],[0.082,0.04],[0.082,0.05],[0,0.05]],[0,0,0],0.72,40);
  lathe(ctx,root,[[0,0],[0.14,0],[0.15,0.012],[0.15,0.036],[0.12,0.044],[0.12,0.05],[0,0.05]],[0,0,0],0.92,40);
  for(const s of [-1,1])tube(ctx,root,[[s*0.098,0.225,0],[s*0.15,0.24,0],[s*0.19,0.22,0],[s*0.18,0.16,0],[s*0.14,0.15,0],[s*0.11,0.17,0]],0.009,0.84,36,9);
  torus(ctx,root,0.117,0.004,[0,0.245,0],0.5,[1,1,0.22]);
  ball(ctx,root,0.022,[0,0.17,0.12],1,[1,1,0.25]);
  // Front star mark
  const star:P2[]=[];for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,r=i%2?0.012:0.027;star.push([Math.cos(a)*r,Math.sin(a)*r]);}plate(ctx,root,star,0.002,[0,0.17,0.142],0.3,0.0005);
  return {root,grounded:true};}
});

// ---------------------------------------------------------------- chess and chance
export const chessKing=defineModel({
 id:'chess-king',aliases:['king-piece','chess-king-piece'],describe:'A carved chess king stands on a stepped circular base with a turned, ringed shaft, globular finial and tall cross finial.',size:'0.095 m',
 build(ctx){const root=new THREE.Group();lathe(ctx,root,[[0,0],[0.027,0],[0.031,0.004],[0.031,0.012],[0.024,0.017],[0.02,0.019],[0.024,0.024],[0.022,0.029],[0.014,0.032],[0.012,0.048],[0.017,0.052],[0.019,0.057],[0.014,0.061],[0.011,0.074],[0.018,0.078],[0.017,0.083],[0,0.083]],[0,0,0],0.84,36);
  for(const y of [0.018,0.031,0.053,0.078])torus(ctx,root,y<0.04?0.022:0.016,0.0015,[0,y,0],0.98,[1,1,0.7]);
  cyl(ctx,root,0.007,0.03,[0,0.098,0],0.9,16);box(ctx,root,0.028,0.006,0.006,[0,0.099,0],1,0.001);box(ctx,root,0.006,0.027,0.006,[0,0.099,0],1,0.001);
  return {root,grounded:true};}
});

export const chessPawn=defineModel({
 id:'chess-pawn',aliases:['pawn-piece','chessman'],describe:'A simple chess pawn has a weighted round foot, slender turned stem, collar and large spherical head.',size:'0.07 m',
 build(ctx){const root=new THREE.Group();lathe(ctx,root,[[0,0],[0.022,0],[0.026,0.004],[0.026,0.01],[0.019,0.014],[0.014,0.017],[0.012,0.027],[0.016,0.03],[0.015,0.034],[0.01,0.036],[0,0.036]],[0,0,0],0.76,32);
  torus(ctx,root,0.019,0.0014,[0,0.015,0],0.96,[1,1,0.6]);ball(ctx,root,0.012,[0,0.051,0],0.98);
  return {root,grounded:true};}
});

export const dicePair=defineModel({
 id:'dice-pair',aliases:['dice','pair-of-dice','die-pair'],describe:'Two ivory dice with rounded corners show deep circular pips on three visible faces; `roll` tosses and turns the pair.',controls:{roll:'0 resting .. 1 tumbling (default 0)'},defaults:{roll:0},size:'0.11 m',
 build(ctx){const root=new THREE.Group(),d1=new THREE.Group(),d2=new THREE.Group();root.add(d1,d2);d1.position.set(-0.034,0.032,0);d2.position.set(0.034,0.032,-0.018);
  const make=(g:THREE.Group,offset:number)=>{const size=0.052;box(ctx,g,size,size,size,[0,0,0],0.94,0.008);
   const face=(coords:V3[])=>coords.forEach(([x,y,z])=>{ball(ctx,g,0.004,[x,y,z],0.14,[1,1,0.34]);});const z=size/2+0.001;
   face([[0,0,z]]);face([[-0.014,-0.014,z],[0.014,0.014,z]]);
   face([[-0.014,-0.014,z],[0,0,z],[0.014,0.014,z]]);
   const x=size/2+0.001;face([[x,-0.014,-0.014],[x,0,0],[x,0.014,0.014]]);
   const y=size/2+0.001;face([[-0.014,y,-0.014],[0,y,-0.014],[0.014,y,-0.014],[-0.014,y,0.014],[0,y,0.014],[0.014,y,0.014]]);
   // Deep inset rings make the pips visible even in dot shading.
   for(const [xx,yy] of [[-0.014,-0.014],[0.014,0.014]] as [number,number][])torus(ctx,g,0.0046,0.0007,[xx,yy,z+0.0005],0.4,[1,1,0.15]);
  };
  make(d1,0);make(d2,1);
  return {root,grounded:true,update(c,t){const a=clamp(c.roll??0);d1.rotation.set(a*Math.sin(t*7)*1.9,0,a*Math.sin(t*5)*2.6);d2.rotation.set(a*Math.sin(t*7+1)*2.1,0,a*Math.sin(t*5+2)*2.6);d1.position.y=0.032+a*Math.abs(Math.sin(t*8))*0.035;d2.position.y=0.032+a*Math.abs(Math.sin(t*8+1))*0.035;}};}
});

export const playingCards=defineModel({
 id:'playing-cards',aliases:['cards','deck-of-cards','card-fan'],describe:'A fan of six playing cards shows rounded white faces, dark suit-like pips and alternating red and black corner marks.',controls:{fan:'0 stacked .. 1 wide fan (default 0.75)'},defaults:{fan:0.75},size:'0.13 m wide',
 build(ctx){const root=new THREE.Group(),cards:THREE.Group[]=[];for(let i=0;i<6;i++){const c=new THREE.Group();root.add(c);cards.push(c);box(ctx,c,0.074,0.104,0.003,[0,0.052,0],0.97,0.005);box(ctx,c,0.064,0.094,0.001,[0,0.052,0.002],0.73,0.003);
   const suit=i%2?0.18:0.84;const mark=()=>{const pts:P2[]=[[-0.005,0],[0,-0.006],[0.005,0],[0,0.006]];plate(ctx,c,pts,0.001,[0,0,0],suit,0);};
   // pip clusters and corner indices stand in for printed ranks without texture.
   for(const [x,y] of [[-0.022,0.085],[0.022,0.019]] as [number,number][]){box(ctx,c,0.004,0.013,0.001,[x,y,0.003],suit,0);}
   for(let j=0;j<5;j++){const x=(j%2?0.013:-0.013),y=0.035+j*0.008;const p=ctx.mesh(at(G.sphere(0.003,8,6),[x,y,0.004]),{tone:suit});c.add(p);}
   mark();
  }
  return {root,grounded:true,update(c){const f=clamp(c.fan??0.75);cards.forEach((card,i)=>{const k=i-2.5;card.rotation.z=k*f*0.14;card.position.x=k*f*0.018;card.position.z=i*0.0008;});}};}
});

// ---------------------------------------------------------------- historic
export const sword=defineModel({
 id:'sword',aliases:['longsword','broadsword','blade'],describe:'A straight double-edged sword has a tapered bright blade, central fuller, crossguard, wrapped grip and round pommel.',size:'0.95 m',
 build(ctx){const root=new THREE.Group(),blade:P2[]=[[-0.032,0.25],[0.032,0.25],[0.029,0.77],[0,0.94],[-0.029,0.77]];
  plate(ctx,root,blade,0.018,[0,0,0],0.95,0.003);tube(ctx,root,[[0,0.29,0.011],[0,0.78,0.011],[0,0.91,0.011]],0.003,0.32,24,5);
  plate(ctx,root,[[-0.11,0.22],[-0.09,0.19],[0,0.22],[0.09,0.19],[0.11,0.22],[0.09,0.25],[-0.09,0.25]],0.036,[0,0,0],0.78,0.006);
  box(ctx,root,0.045,0.15,0.035,[0,0.105,0],0.45,0.01);
  for(let i=0;i<6;i++)tube(ctx,root,[[-0.024,0.045+i*0.02,0.022],[0.024,0.065+i*0.02,0.022]],0.002,0.94,12,5);
  lathe(ctx,root,[[0,0],[0.029,0],[0.033,0.008],[0.03,0.017],[0.019,0.025],[0,0.026]],[0,0.018,0],0.94,24);
  for(const s of [-1,1])ball(ctx,root,0.008,[s*0.1,0.22,0],0.96);
  return {root,grounded:true};}
});

export const shield=defineModel({
 id:'shield',aliases:['kite-shield','heraldic-shield','medieval-shield'],describe:'A convex kite shield has a raised rolled rim, central metal boss, vertical reinforcement ridge and rivets along its edge.',size:'0.65 m tall',
 build(ctx){const root=new THREE.Group(),outline:P2[]=[[-0.25,0.60],[0.25,0.60],[0.28,0.43],[0.24,0.18],[0,0],[-0.24,0.18],[-0.28,0.43]];
  plate(ctx,root,outline,0.07,[0,0,0],0.68,0.025);const inner=outline.map(([x,y])=>[x*0.88,(y-0.30)*0.88+0.30] as P2);plate(ctx,root,inner,0.012,[0,0.04,0],0.9,0.01);
  // Raised central spine and cross-straps add the sculpted metalwork.
  plate(ctx,root,[[-0.025,0.08],[0.025,0.08],[0.035,0.52],[0,0.57],[-0.035,0.52]],0.01,[0,0.055,0],0.45,0.004);
  box(ctx,root,0.39,0.03,0.018,[0,0.40,0.06],0.54,0.006);
  ball(ctx,root,0.068,[0,0.35,0.075],0.98);torus(ctx,root,0.064,0.005,[0,0.35,0.08],0.38,[1,1,0.2]);
  for(let i=0;i<7;i++){const y=0.14+i*0.065;for(const s of [-1,1])ball(ctx,root,0.008,[s*(0.25-(Math.abs(y-0.3))*0.08),y,0.055],0.98);}
  return {root,grounded:true};}
});

export const bowAndArrow=defineModel({
 id:'bow-and-arrow',aliases:['bow','archery-bow','longbow'],describe:'A recurved wooden bow bends around a taut string with an arrow resting on its grip; `draw` pulls the string and arrow back.',controls:{draw:'0 relaxed .. 1 fully drawn (default 0)'},defaults:{draw:0},size:'1.5 m',
 build(ctx){const root=new THREE.Group();const limbs:V3[]=[[0,0.02,0],[0.03,0.10,0],[0.08,0.24,0],[0.115,0.39,0],[0.12,0.45,0],[0.115,0.51,0],[0.08,0.66,0],[0.03,0.76,0],[0,0.78,0]];
  tube(ctx,root,limbs,0.018,0.76,92,10);box(ctx,root,0.046,0.12,0.035,[0,0.38,0],0.48,0.009);
  const string=ctx.mesh(G.tube([[0,0.02,0.01],[0,0.40,0.01],[0,0.78,0.01]],0.0018,48,6),{tone:0.98});root.add(string);
  const arrow=new THREE.Group();root.add(arrow);tube(ctx,arrow,[[-0.20,0.40,0.035],[0.27,0.40,0.035]],0.0028,0.96,36,6);
  plate(ctx,arrow,[[0.25,0.40],[0.32,0.42],[0.32,0.38]],0.005,[0,0,0.035],0.7,0.001);
  for(const s of [-1,1])plate(ctx,arrow,[[-0.15,0.40],[-0.19,0.425],[-0.16,0.43],[-0.13,0.40]],0.002,[0,0,0.035],0.88,0.0005);
  return {root,grounded:true,update(c){const a=clamp(c.draw??0);arrow.position.x=-a*0.13;string.position.x=-a*0.08;}};}
});

export const crown=defineModel({
 id:'crown',aliases:['royal-crown','king-crown','diadem'],describe:'A gold crown has a thick jeweled band, five pointed fleur-like arches, raised beads and inset oval gems.',size:'0.22 m',
 build(ctx){const root=new THREE.Group();lathe(ctx,root,[[0,0],[0.105,0],[0.11,0.02],[0.105,0.09],[0.094,0.10],[0.085,0.09],[0.085,0.02],[0,0.02]],[0,0,0],0.9,48);
  torus(ctx,root,0.104,0.006,[0,0.017,0],0.43,[1,1,0.7]);torus(ctx,root,0.097,0.002,[0,0.088,0],0.98,[1,1,0.7]);
  for(let i=0;i<5;i++){const a=-Math.PI/2+i*Math.PI/4;const x=Math.sin(a)*0.096,z=Math.cos(a)*0.096;
   tube(ctx,root,[[x*0.88,0.09,z*0.88],[x*1.02,0.15,z*1.02],[x*0.93,0.20,z*0.93]],0.006,0.86,20,8);
   ball(ctx,root,0.012,[x*0.93,0.20,z*0.93],1);}
  for(let i=0;i<8;i++){const a=i*Math.PI/4;const x=Math.sin(a)*0.1,z=Math.cos(a)*0.1;ball(ctx,root,0.008,[x,0.055,z],i%2?0.38:0.96,[1,1.35,0.55]);}
  for(const [x,z] of [[0,0.101],[-0.07,0.07],[0.07,0.07],[0,-0.101]] as [number,number][]){ball(ctx,root,0.016,[x,0.062,z],0.22,[1,1.3,0.45]);torus(ctx,root,0.016,0.002,[x,0.062,z+0.002],1,[1,1.3,0.3]);}
  return {root,grounded:true};}
});

export const treasureChest=defineModel({
 id:'treasure-chest',aliases:['chest','pirate-chest','treasure-box'],describe:'A banded oak treasure chest has planked sides, iron corner straps, a heavy arched lid and a bright interior glow; `open` lifts the lid.',controls:{open:'0 shut .. 1 fully open (default 0)',glow:'0 dark .. 1 treasure glow (default 1)'},defaults:{open:0,glow:1},size:'0.62 m',
 build(ctx){const root=new THREE.Group(),w=0.58,h=0.31,d=0.34;box(ctx,root,w,h,d,[0,h/2,0],0.58,0.045);
  for(let i=0;i<5;i++)box(ctx,root,w-0.025,0.005,0.012,[0,0.055+i*0.058,d/2+0.006],i%2?0.77:0.44,0.002);
  for(const s of [-1,1])for(const x of [-0.27,0.27])box(ctx,root,0.028,h,0.025,[x,h/2,s*(d/2+0.008)],0.9,0.006);
  for(const x of [-0.23,0.23])box(ctx,root,0.028,h+0.01,0.025,[x,h/2,d/2+0.015],0.92,0.006);
  box(ctx,root,0.075,0.09,0.02,[0,0.24,d/2+0.02],0.96,0.007);box(ctx,root,0.022,0.045,0.023,[0,0.23,d/2+0.035],0.3,0.003);
  const glow=ctx.mesh(at(G.rbox(0.42,0.05,0.20,0.025),[0,h+0.009,0]),{tone:1,glow:2.8,glowControl:'glow'});root.add(glow);
  const lid=new THREE.Group();lid.position.set(0,h-0.015,-d/2+0.01);root.add(lid);
  box(ctx,lid,w,0.13,d,[0,0.06,d/2],0.64,0.05);
  // A curved bright cap approximates the arched barrel top while preserving a solid lid.
  lathe(ctx,lid,[[0.12,0],[0.16,0.02],[0.18,0.055],[0.17,0.11],[0.12,0.14],[0,0.14]],[0,0,d/2],0.84,40).rotation.x=deg(90);
  for(const x of [-0.23,0.23])box(ctx,lid,0.027,0.14,0.026,[x,0.06,d/2+0.01],0.96,0.005);
  const glowMat=glow.material as THREE.MeshStandardMaterial;
  return {root,grounded:true,update(c){const a=clamp(c.open??0);lid.rotation.x=-a*deg(105);glow.visible=a>0.02;glowMat.emissiveIntensity=(glow.material as THREE.MeshStandardMaterial).userData.glow as number;}};}
});

// ---------------------------------------------------------------- navigation and mechanisms
export const compass=defineModel({
 id:'compass',aliases:['magnetic-compass','navigation-compass','pocket-compass'],describe:'A pocket compass has a latched brass case, raised bezel, marked cardinal ticks and a red-tipped magnetic needle that swings; `swing` sets its motion.',controls:{swing:'0 steady north .. 1 swinging needle (default 0.25)'},defaults:{swing:0.25},size:'0.09 m',
 build(ctx){const root=new THREE.Group();root.add(ctx.mesh(at(G.cyl(0.046,0.046,0.018,48),[0,0.075,0],[90,0,0]),{tone:0.74}));
  root.add(ctx.mesh(at(G.cyl(0.040,0.040,0.001,48),[0,0.075,0.010],[90,0,0]),{tone:0.86}));
  torus(ctx,root,0.042,0.003,[0,0.075,0.012],1,[1,1,0.3]);torus(ctx,root,0.036,0.0012,[0,0.075,0.0125],0.38,[1,1,0.3]);
  const face=new THREE.Group();face.position.set(0,0.075,0.012);root.add(face);
  for(let i=0;i<32;i++){const a=i/32*Math.PI*2;const r=i%4===0?0.034:0.037;box(ctx,face,0.0012,i%4===0?0.008:0.004,0.001,[Math.sin(a)*r,Math.cos(a)*r,0.001],i%4===0?0.98:0.38,0);}
  const needle=new THREE.Group();needle.position.set(0,0,0.004);face.add(needle);
  plate(ctx,needle,[[0,0.035],[-0.004,0],[0,0.004],[0.004,0]],0.001,[0,0,0],0.96,0);plate(ctx,needle,[[0,-0.035],[-0.004,0],[0,0.004],[0.004,0]],0.001,[0,0,0],0.25,0);
  ball(ctx,needle,0.004,[0,0,0.002],1);
  // Small hanging loop and latch complete the pocket compass case.
  torus(ctx,root,0.016,0.002,[0,0.132,-0.004],0.82,[1,1,0.3]);box(ctx,root,0.012,0.012,0.007,[0,0.113,0.006],0.95,0.003);
  return {root,grounded:true,update(c,t){needle.rotation.z=Math.sin(t*2.4)*clamp(c.swing??0.25)*0.85;}};}
});

export const mapScroll=defineModel({
 id:'map-scroll',aliases:['scroll-map','rolled-map','parchment-scroll'],describe:'A parchment map hangs between two carved wooden rollers, marked with a winding dotted route and mountain ridges; `unroll` lowers the sheet.',controls:{unroll:'0 rolled up .. 1 fully unrolled (default 0.72)'},defaults:{unroll:0.72},size:'0.55 m tall',
 build(ctx){const root=new THREE.Group(),sheet=new THREE.Group();root.add(sheet);const fullH=0.36,w=0.5;
  box(ctx,root,w,0.024,0.055,[0,0.48,0],0.7,0.012);box(ctx,root,w,0.024,0.055,[0,0.12,0],0.68,0.012);
  for(const x of [-0.27,0.27]){lathe(ctx,root,[[0,0],[0.018,0],[0.02,0.008],[0.016,0.016],[0.016,0.04],[0.02,0.048],[0.018,0.055],[0,0.055]],[x,0.12,0],0.95,24);lathe(ctx,root,[[0,0],[0.018,0],[0.02,0.008],[0.016,0.016],[0.016,0.04],[0.02,0.048],[0.018,0.055],[0,0.055]],[x,0.48,0],0.95,24);}
  box(ctx,sheet,w*0.92,fullH,0.004,[0,0,0],0.87,0.002);
  // Contour strokes, coastline and a dotted expedition route are raised on the face.
  for(let i=0;i<5;i++){const y=-0.15+i*0.07;const pts:V3[]=[];for(let j=0;j<20;j++){const x=-0.19+j*0.02;pts.push([x,y+0.012*Math.sin(j*0.52+i),0.003]);}tube(ctx,sheet,pts,0.0012,i%2?0.42:0.55,48,4);}
  tube(ctx,sheet,[[-0.18,-0.14,0.004],[-0.12,-0.08,0.004],[-0.06,-0.1,0.004],[0.01,-0.01,0.004],[0.08,0.03,0.004],[0.15,0.14,0.004]],0.0016,0.22,50,5);
  for(const [x,y] of [[-0.18,-0.14],[-0.06,-0.1],[0.01,-0.01],[0.15,0.14]] as [number,number][])ball(ctx,sheet,0.004,[x,y,0.005],0.96);
  const pin=ball(ctx,root,0.012,[0.0,0.5,0],0.94);
  return {root,grounded:true,update(c){const u=clamp(c.unroll??0.72);sheet.scale.y=Math.max(0.02,u);sheet.position.y=0.48-u*fullH/2;sheet.visible=u>0.015;pin.visible=u<0.98;}};}
});

export const typewriter=defineModel({
 id:'typewriter',aliases:['manual-typewriter','vintage-typewriter','typing-machine'],describe:'A vintage typewriter has a heavy rounded case, arched paper platen, carriage-return lever, ink ribbon spools and four rows of raised round keys; `type` taps keys.',controls:{type:'0 idle .. 1 brisk typing (default 0)'},defaults:{type:0},size:'0.42 m',
 build(ctx){const root=new THREE.Group();box(ctx,root,0.40,0.16,0.30,[0,0.09,0],0.64,0.035);box(ctx,root,0.37,0.016,0.27,[0,0.178,0],0.88,0.01);
  // Carriage and black platen roller are visibly above the key deck.
  cyl(ctx,root,0.026,0.36,[0,0.31,-0.105],0.25,36).rotation.z=deg(90);
  cyl(ctx,root,0.033,0.34,[0,0.31,-0.08],0.74,32).rotation.z=deg(90);
  box(ctx,root,0.36,0.022,0.055,[0,0.35,-0.075],0.83,0.009);
  for(const s of [-1,1]){cyl(ctx,root,0.036,0.01,[s*0.19,0.31,-0.09],0.96,28).rotation.z=deg(90);torus(ctx,root,0.034,0.004,[s*0.20,0.31,-0.09],0.43,[1,1,0.25]);}
  // Paper sheet and paper bail.
  box(ctx,root,0.27,0.20,0.002,[0,0.42,-0.12],0.97,0.002);
  tube(ctx,root,[[-0.16,0.35,-0.08],[0,0.35,-0.08],[0.16,0.35,-0.08]],0.002,0.96,24,5);
  const lever=ctx.mesh(G.tube([[0.17,0.34,-0.1],[0.22,0.35,-0.1],[0.22,0.38,-0.1]],0.004,16,6),{tone:0.9});root.add(lever);
  const keys:THREE.Group[]=[];for(let row=0;row<4;row++){const count=row===3?7:9;for(let i=0;i<count;i++){const x=(i-(count-1)/2)*0.041;const y=0.205+row*0.025,z=0.08-row*0.045;const k=new THREE.Group();k.position.set(x,y,z);root.add(k);cyl(ctx,k,0.014,0.008,[0,0.006,0],0.32,20);cyl(ctx,k,0.011,0.012,[0,0.016,0],0.96,18);ball(ctx,k,0.003,[0,0.023,0],0.2,[1,1,0.5]);keys.push(k);}}
  box(ctx,root,0.14,0.012,0.033,[0,0.22,-0.004],0.93,0.007);
  // Front-facing keyboard and angled key tops remain legible from the default camera.
  box(ctx,root,0.36,0.14,0.012,[0,0.14,0.15],0.32,0.01);
  const frontKeys:THREE.Group[]=[];
  for(let row=0;row<4;row++){const count=row===3?7:9;for(let i=0;i<count;i++){const k=new THREE.Group();k.position.set((i-(count-1)/2)*0.039,0.19-row*0.033,0.16);root.add(k);
   k.add(ctx.mesh(at(G.cyl(0.009,0.009,0.007,16),[0,0,0],[90,0,0]),{tone:0.91}));
   k.add(ctx.mesh(at(G.cyl(0.0065,0.0065,0.002,14),[0,0,0.005],[90,0,0]),{tone:0.3}));torus(ctx,k,0.007,0.0008,[0,0,0.006],0.98,[1,1,0.2]);frontKeys.push(k);
  }}
  return {root,grounded:true,update(c,t){const a=clamp(c.type??0);keys.forEach((k,i)=>{k.position.y=0.205+Math.floor(i/9)*0.025-(a>0.02?Math.max(0,Math.sin(t*19+i*1.7))*a*0.008:0);});frontKeys.forEach((k,i)=>{k.position.z=0.16-(a>0.02?Math.max(0,Math.sin(t*19+i*1.7))*a*0.005:0);});}};}
});

export const filmCamera=defineModel({
 id:'film-camera',aliases:['camera','vintage-camera','movie-camera','cine-camera'],describe:'A boxy 16 mm film camera has a large stepped lens barrel, twin film magazines, side crank, viewfinder and a textured leatherette body.',size:'0.24 m',
 build(ctx){const root=new THREE.Group();box(ctx,root,0.23,0.16,0.11,[0,0.12,0],0.67,0.014);box(ctx,root,0.19,0.12,0.006,[0,0.12,0.059],0.42,0.009);
  // Concentric lens barrel and a dark glass aperture face +z.
  for(const [r,d,tone] of [[0.046,0.035,0.94],[0.038,0.028,0.55],[0.03,0.028,0.96],[0.022,0.03,0.23]] as [number,number,number][]){root.add(ctx.mesh(at(G.cyl(r,r,d,40),[0,0.12,0.08+d/2],[90,0,0]),{tone}));torus(ctx,root,r,0.002,[0,0.12,0.08+d],0.92,[1,1,0.25]);}
  ball(ctx,root,0.015,[0,0.12,0.12],0.88,[1,1,0.35]);
  // Magazines, viewfinder and take-up crank.
  for(const s of [-1,1]){cyl(ctx,root,0.052,0.07,[s*0.065,0.225,-0.01],0.78,36);torus(ctx,root,0.05,0.003,[s*0.065,0.225,0.03],0.98,[1,1,0.25]);box(ctx,root,0.08,0.055,0.06,[s*0.065,0.27,-0.015],0.86,0.012);}
  box(ctx,root,0.075,0.06,0.05,[0,0.25,-0.025],0.38,0.008);box(ctx,root,0.055,0.045,0.06,[0,0.30,-0.03],0.75,0.01);
  cyl(ctx,root,0.022,0.012,[0.115,0.10,0.01],0.96,24);torus(ctx,root,0.025,0.002,[0.115,0.10,0.019],0.45,[1,1,0.25]);
  tube(ctx,root,[[0.128,0.1,0.01],[0.16,0.08,0.01],[0.17,0.08,0.05],[0.19,0.08,0.05]],0.003,0.85,24,7);ball(ctx,root,0.006,[0.19,0.08,0.05],0.95);
  for(const x of [-0.08,-0.04,0.04,0.08])box(ctx,root,0.012,0.009,0.008,[x,0.035,0.035],0.94,0.002);
  return {root,grounded:true};}
});

export const quillInkwell=defineModel({
 id:'quill-inkwell',aliases:['quill-and-inkwell','feather-quill','inkwell'],describe:'A tall curved feather quill with a split nib leans beside a turned glass inkwell with a flared neck and dark ink opening.',size:'0.27 m',
 build(ctx){const root=new THREE.Group();lathe(ctx,root,[[0,0],[0.035,0],[0.043,0.008],[0.042,0.055],[0.03,0.064],[0.022,0.075],[0.022,0.09],[0.028,0.095],[0.025,0.10],[0,0.10]],[0.045,0,0],0.73,32);
  cyl(ctx,root,0.021,0.004,[0.045,0.095,0],0.18,28);torus(ctx,root,0.024,0.003,[0.045,0.096,0],0.96,[1,1,0.5]);
  const feather=new THREE.Group();feather.position.set(-0.03,0.09,0.02);feather.rotation.z=deg(-18);root.add(feather);
  plate(ctx,feather,[[0,0],[0.01,0.04],[0.018,0.12],[0.03,0.21],[0.018,0.20],[0.006,0.12],[-0.006,0.05]],0.003,[0,0,0],0.91,0.001);
  tube(ctx,feather,[[0,0,0.003],[0.007,0.08,0.005],[0.02,0.2,0.005]],0.0018,0.45,26,5);
  for(let i=0;i<9;i++){const y=0.045+i*0.016;const x=0.004+(y*y)*0.25;for(const s of [-1,1])tube(ctx,feather,[[x,y,0.004],[x+s*0.009,y+0.009,0.004],[x+s*0.014,y+0.016,0.004]],0.001,0.62,10,4);}
  plate(ctx,feather,[[-0.004,0.02],[0.004,0.02],[0.001,0],[-0.001,0]],0.002,[0,0,0.002],0.55,0.0003);
  return {root,grounded:true};}
});

export const magnifyingGlass=defineModel({
 id:'magnifying-glass',aliases:['magnifier','hand-lens','reading-glass'],describe:'A round magnifier has a thick polished rim around its convex glass lens and a long tapered handle capped with a hanging hole.',size:'0.22 m',
 build(ctx){const root=new THREE.Group();torus(ctx,root,0.064,0.008,[0,0.16,0],0.95,[1,1,0.38]);torus(ctx,root,0.058,0.002,[0,0.16,0.002],0.42,[1,1,0.4]);
  ball(ctx,root,0.056,[0,0.16,-0.001],0.62,[1,1,0.22]);
  // Crossed reflected glints reveal the convex lens without texture.
  tube(ctx,root,[[-0.027,0.192,0.052],[-0.015,0.204,0.052],[0.004,0.207,0.052]],0.002,0.98,16,5);
  tube(ctx,root,[[-0.031,0.18,0.053],[-0.022,0.186,0.053]],0.0015,0.9,8,4);
  tube(ctx,root,[[0,0.10,0],[0,0.055,0],[0,0.015,0]],0.014,0.72,20,8);
  for(let i=0;i<5;i++)box(ctx,root,0.026,0.004,0.02,[0,0.04+i*0.012,0.006],i%2?0.38:0.9,0.001);
  lathe(ctx,root,[[0,0],[0.014,0],[0.02,0.005],[0.016,0.012],[0,0.012]],[0,0,0],0.92,20);
  torus(ctx,root,0.008,0.0015,[0,0.008,0],0.35,[1,1,0.4]);
  return {root,grounded:true};}
});

export const keyRing=defineModel({
 id:'key-ring',aliases:['keys','keychain','bunch-of-keys','key-ring-set'],describe:'A heavy split ring carries three different brass keys with serrated teeth, long shafts, shoulders and ornate circular bows.',size:'0.12 m',
 build(ctx){const root=new THREE.Group();torus(ctx,root,0.022,0.0025,[0,0.13,0],0.94,[1,1,0.55]);torus(ctx,root,0.019,0.001,[0,0.13,0.001],0.46,[1,1,0.55]);
  const key=(x:number,y:number,z:number,angle:number,kind:number)=>{const g=new THREE.Group();g.position.set(x,y,z);g.rotation.z=deg(angle);root.add(g);
   torus(ctx,g,kind===0?0.013:0.010,0.002,[0,0,0],0.88,[1,1,0.45]);
   box(ctx,g,0.004,0.075,0.004,[0,-0.052,0],0.96,0.0015);box(ctx,g,0.007,0.009,0.006,[0,-0.018,0],0.72,0.001);
   for(let i=0;i<3+kind;i++)box(ctx,g,0.009,0.004,0.006,[0.005,-0.075+i*0.012,0],0.45,0.0008);
   for(let i=0;i<3;i++)torus(ctx,g,0.004+i*0.002,0.0008,[0,0,0.002],i===1?0.38:0.98,[1,1,0.35]);
  };
  key(-0.014,0.10,0,-28,0);key(0,0.098,0.002,0,1);key(0.014,0.10,-0.002,28,2);
  return {root,grounded:true};}
});
