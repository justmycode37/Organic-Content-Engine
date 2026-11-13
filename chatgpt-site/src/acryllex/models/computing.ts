// Computing, electronics and communications models for ACRYLLEX.
import * as THREE from 'three';
import {G,at,deg,clamp} from '../kit.ts';
import {defineModel,type ModelCtx} from './types.ts';

type V3=[number,number,number];
const group=(...items:THREE.Object3D[])=>{const g=new THREE.Group();if(items.length)g.add(...items);return g;};
const add=(ctx:ModelCtx,root:THREE.Object3D,geo:THREE.BufferGeometry,pos:V3,tone=0.8,rot:V3=[0,0,0])=>{
 const m=ctx.mesh(at(geo,pos,rot),{tone});root.add(m);return m;
};
const panel=(ctx:ModelCtx,root:THREE.Object3D,w:number,h:number,d:number,pos:V3,tone=0.85)=>{
 const m=ctx.mesh(at(G.rbox(w,h,d,Math.min(w,h,d)*0.12),pos),{tone});root.add(m);return m;
};
const faceBox=(ctx:ModelCtx,root:THREE.Object3D,w:number,h:number,d:number,x:number,y:number,z:number,tone=0.2)=>{
 return add(ctx,root,G.rbox(w,h,d,Math.min(w,h,d)*0.16),[x,y,z],tone);
};
const faceDisc=(ctx:ModelCtx,root:THREE.Object3D,r:number,depth:number,x:number,y:number,z:number,tone=0.8)=>{
 return add(ctx,root,G.cyl(r,r,depth,32),[x,y,z],tone,[90,0,0]);
};
const faceRing=(ctx:ModelCtx,root:THREE.Object3D,r:number,tube:number,x:number,y:number,z:number,tone=0.9)=>{
 return add(ctx,root,G.torus(r,tube,12,40),[x,y,z],tone,[0,0,0]);
};
const led=(ctx:ModelCtx,root:THREE.Object3D,x:number,y:number,z:number,r=0.002,control='glow',tone=1)=>{
 const m=ctx.mesh(at(G.sphere(r,12,8),[x,y,z]),{tone,glow:2,glowControl:control});root.add(m);return m;
};
const frontCylinder=(ctx:ModelCtx,root:THREE.Object3D,r:number,depth:number,x:number,y:number,z:number,tone=0.8)=>{
 return add(ctx,root,G.cyl(r,r,depth,36),[x,y,z],tone,[90,0,0]);
};

export const smartphone=defineModel({
 id:'smartphone',aliases:['smart-phone','mobile-phone','touchscreen-phone','iphone','android-phone'],
 describe:'A modern glass-front smartphone with a thin metal rail, edge buttons, camera island, speaker slit and bright edge-to-edge screen. brightness controls screen glow and touch animates a visible ripple.',
 controls:{brightness:'0 dark .. 1 bright (default 0.8)',touch:'0 idle .. 1 tap ripple'},defaults:{brightness:0.8,touch:0},size:'0.15 m tall',
 build(ctx){
  const root=new THREE.Group(),w=0.071,h=0.147,d=0.009;
  panel(ctx,root,w,h,d,[0,h/2,0],0.74);
  faceBox(ctx,root,w-0.004,h-0.004,0.0015,0,h/2,d/2+0.001,0.16);
  const glass=ctx.mesh(at(G.rbox(w-0.009,h-0.015,0.0008,0.0004),[0,h/2,d/2+0.002]),{tone:0.46,glow:0.7,glowControl:'brightness'});root.add(glass);
  const island=faceBox(ctx,root,0.027,0.005,0.001,0,h-0.009,d/2+0.003,0.48);
  led(ctx,root,0.011,h-0.009,d/2+0.004,0.0018,'brightness');
  for(const s of [-1,1])for(const y of [0.108,0.128])add(ctx,root,G.rbox(0.002,0.012,0.003,0.0008),[s*(w/2+0.001),y,0],0.8);
  const ripple=ctx.mesh(at(G.torus(0.006,0.0007,8,32),[0.017,0.068,d/2+0.004]),{tone:1,glow:1.2,glowControl:'_touch'});root.add(ripple);
  return {root,grounded:true,anchors:{screen:[0,h/2,d/2]},update(c,t){
   const b=clamp(c.brightness??0.8),tap=clamp(c.touch??0);
   (glass.material as THREE.MeshStandardMaterial).emissiveIntensity=0.04+0.38*b;
   (island.material as THREE.MeshStandardMaterial).emissiveIntensity=0.08+0.18*b;
   ripple.visible=tap>0.01;ripple.scale.setScalar(0.5+tap*1.9+0.15*Math.sin(t*8));
  }};
 },
});

export const punchCard=defineModel({
 id:'punch-card',aliases:['punched-card','computer-card','ibm-card','hollerith-card'],
 describe:'An ivory 80-column punched card with twelve rows of crisp rectangular holes, a clipped corner and a subtle ruled grid. insert moves the card through a vintage reader.',
 controls:{insert:'0 out .. 1 fed into reader'},defaults:{insert:0},size:'0.19 m wide',
 build(ctx){
  const root=new THREE.Group(),w=0.187,h=0.083,d=0.0013;
  add(ctx,root,G.extrude([[-w/2,-h/2],[w/2,-h/2],[w/2,h/2-0.008],[w/2-0.008,h/2],[-w/2,h/2]],d,0.0004),[0,h/2,0],0.88);
  const holes:THREE.BufferGeometry[]=[];
  for(let col=0;col<24;col++)for(let row=0;row<8;row++){
   const x=-0.083+col*0.0072,y=0.013-row*0.0035;
   holes.push(at(G.rbox(0.0032,0.0022,0.0005,0.0005),[x,y+h/2,d/2+0.0005]));
  }
  root.add(ctx.mesh(G.merge(holes),{tone:0.14}));
  const lines:THREE.BufferGeometry[]=[];
  for(let i=0;i<=24;i++)lines.push(at(G.box(0.00035,0.031,0.00035),[-0.086+i*0.0072,h/2+0.002,d/2+0.0006]));
  for(let j=0;j<9;j++)lines.push(at(G.box(0.174,0.0003,0.00035),[0,h/2+0.017-j*0.0035,d/2+0.0006]));
  root.add(ctx.mesh(G.merge(lines),{tone:0.55}));
  const reader=group();reader.position.set(0,h+0.012,-0.004);root.add(reader);
  add(ctx,reader,G.rbox(0.205,0.012,0.03,0.004),[0,0,0],0.52);
  add(ctx,reader,G.box(0.18,0.003,0.005),[0,-0.003,0.012],0.15);
  return {root,grounded:true,update(c){const f=clamp(c.insert??0);root.position.z=-0.035*f;reader.position.z=-0.004-0.045*f;}};
 },
});

export const vacuumTube=defineModel({
 id:'vacuum-tube',aliases:['thermionic-valve','radio-valve','electron-tube'],
 describe:'A vintage glass vacuum tube with a pinched waist, mica support discs, glowing heater filament, internal plate stack, metal top cap and a circle of base pins. glow energizes its filament.',
 controls:{glow:'0 dark .. 1 heated filament (default 0.65)'},defaults:{glow:0.65},size:'0.08 m tall',
 build(ctx){
  const root=new THREE.Group(),glass=ctx.mesh(G.lathe([[0.018,0.012],[0.021,0.016],[0.021,0.027],[0.019,0.033],[0.021,0.04],[0.021,0.066],[0.018,0.075],[0.014,0.078],[0.014,0.081],[0.013,0.081],[0.014,0.075],[0.017,0.066],[0.017,0.04],[0.015,0.033],[0.017,0.027],[0.017,0.017],[0.014,0.015],[0,0.015]],48),{tone:0.38,rough:0.2});
  root.add(glass);
  add(ctx,root,G.lathe([[0.022,0],[0.024,0.002],[0.024,0.012],[0.021,0.016],[0,0.016]],40),[0,0,0],0.7);
  for(const y of [0.021,0.034,0.055])add(ctx,root,G.cyl(0.016,0.016,0.0015,28),[0,y,0],0.55);
  for(const x of [-0.006,0.006])add(ctx,root,G.box(0.0025,0.022,0.009),[x,0.045,0],0.78);
  const filament=ctx.mesh(G.tube([[-0.002,0.027,0.001],[0.003,0.033,0.001],[-0.003,0.039,0.001],[0.003,0.045,0.001],[-0.002,0.052,0.001]],0.00065,40,6),{tone:1,glow:3,glowControl:'glow'});root.add(filament);
  const leads:THREE.BufferGeometry[]=[];
  for(let i=0;i<7;i++){const a=i/7*Math.PI*2;leads.push(at(G.cyl(0.0008,0.0008,0.022,8),[Math.cos(a)*0.014,0.009,Math.sin(a)*0.014]));}
  root.add(ctx.mesh(G.merge(leads),{tone:0.85}));
  return {root,grounded:true,update(c){const g=clamp(c.glow??0.65);(filament.material as THREE.MeshStandardMaterial).emissiveIntensity=0.3+2*g;}};
 },
});

export const floppyDisk=defineModel({
 id:'floppy-disk',aliases:['3.5-inch-disk','diskette','floppy'],
 describe:'A 3.5-inch floppy disk with a square ridged plastic shell, exposed sliding metal shutter, hub window, write-protect notch and round hub. eject pulls the shutter and disk partly apart.',
 controls:{eject:'0 inserted .. 1 ejected'},defaults:{eject:0},size:'0.09 m square',
 build(ctx){
  const root=new THREE.Group(),w=0.09,h=0.094,d=0.004;
  panel(ctx,root,w,h,d,[0,h/2,0],0.68);
  add(ctx,root,G.rbox(0.067,0.057,0.001,0.004),[0,h/2+0.001,d/2+0.001],0.28);
  add(ctx,root,G.box(0.064,0.047,0.001),[0,h/2-0.012,d/2+0.002],0.54);
  const shutter=group();shutter.position.set(0,0,d/2+0.003);root.add(shutter);
  add(ctx,shutter,G.rbox(0.072,0.014,0.002,0.002),[0,h-0.012,0],0.92);
  add(ctx,shutter,G.box(0.004,0.012,0.002),[0,h-0.026,0],0.92);
  faceDisc(ctx,root,0.009,0.001,0,h/2-0.014,d/2+0.004,0.12);
  add(ctx,root,G.box(0.013,0.003,0.001),[-0.035,0.011,d/2+0.002],0.14);
  add(ctx,root,G.box(0.004,0.009,0.001),[0.035,0.011,d/2+0.002],0.16);
  for(const [x,y] of [[-0.037,0.006],[0.037,0.006],[-0.037,h-0.006],[0.037,h-0.006]] as [number,number][])add(ctx,root,G.cyl(0.0015,0.0015,0.001,12),[x,y,d/2+0.003],0.75,[90,0,0]);
  return {root,grounded:true,update(c){const e=clamp(c.eject??0);shutter.position.x=0.006*e;root.position.z=-0.008*e;}};
 },
});

export const crtMonitor=defineModel({
 id:'crt-monitor',aliases:['crt','cathode-ray-monitor','computer-screen'],
 describe:'A deep-backed beige CRT monitor with a bulging curved glass screen, thick rounded bezel, ventilation slots, power LED and a weighted swivel foot. signal paints the screen with a subtle scan line.',
 controls:{signal:'0 blank .. 1 active raster (default 0.7)',glow:'screen glow (default 0.7)'},defaults:{signal:0.7,glow:0.7},size:'0.42 m wide',
 build(ctx){
  const root=new THREE.Group();
  panel(ctx,root,0.37,0.29,0.28,[0,0.48,-0.015],0.76);
  faceBox(ctx,root,0.323,0.245,0.018,0,0.5,0.13,0.64);
  const screen=ctx.mesh(at(G.ellipsoid(0.143,0.103,0.01,40,24),[0,0.52,0.143]),{tone:0.3,glow:0.55,glowControl:'glow'});root.add(screen);
  add(ctx,root,G.torus(0.156,0.004,8,48),[0,0.52,0.145],0.92);
  add(ctx,root,G.rbox(0.32,0.012,0.008,0.003),[0,0.365,0.143],0.61);
  led(ctx,root,0.133,0.371,0.151,0.004,'signal');
  for(let i=0;i<7;i++)add(ctx,root,G.box(0.006,0.003,0.01),[-0.12+i*0.012,0.346,-0.04],0.34);
  add(ctx,root,G.cyl(0.037,0.046,0.17,36),[0,0.245,-0.01],0.72);
  panel(ctx,root,0.19,0.018,0.13,[0,0.15,-0.005],0.9);
  const scan=add(ctx,root,G.box(0.275,0.001,0.001),[0,0.5,0.152],0.85);
  return {root,grounded:true,anchors:{screen:[0,0.52,0.15]},update(c,t){const q=clamp(c.signal??0.7);scan.visible=q>0.05;scan.position.y=0.42+0.19*((t*0.9)%1);(screen.material as THREE.MeshStandardMaterial).emissiveIntensity=0.08+0.5*q*(c.glow??0.7);}};
 },
});

export const keyboard=defineModel({
 id:'keyboard',aliases:['computer-keyboard','typing-keyboard','qwerty-keyboard'],
 describe:'A low-profile QWERTY keyboard with a gently sloped deck, sculpted rows of individual keycaps, long space bar, cursor cluster and numeric keypad. type animates a traveling burst of pressed keys.',
 controls:{type:'0 idle .. 1 typing'},defaults:{type:0},size:'0.44 m wide',
 build(ctx){
  const root=new THREE.Group(),deck=group(),w=0.44,d=0.14;
  deck.position.y=0.042;deck.rotation.x=deg(38);root.add(deck);
  add(ctx,deck,G.rbox(w,0.018,d,0.008),[0,0.015,0],0.46,[-5,0,0]);
  const keys:THREE.Group[]=[];
  const rows=[14,14,13,12,9],zs=[0.047,0.025,0.003,-0.019,-0.041];
  for(let row=0;row<5;row++){
   const n=rows[row]!,gap=0.004,kw=(0.392-(n-1)*gap)/n;
   for(let col=0;col<n;col++){
    const k=new THREE.Group();k.position.set(-0.196+kw/2+col*(kw+gap),0.027,zs[row]!);deck.add(k);keys.push(k);
    k.add(ctx.mesh(at(G.rbox(kw,0.009,0.014,0.002),[0,0,0]),{tone:(row+col)%4===0?1:0.91}));
   }
  }
  add(ctx,deck,G.rbox(0.118,0.009,0.014,0.002),[-0.008,0.027,-0.063],0.9);
  for(let i=0;i<4;i++)add(ctx,deck,G.rbox(0.018,0.009,0.014,0.002),[0.13+(i%2)*0.022,0.027,-0.052-Math.floor(i/2)*0.018],0.88);
  return {root,grounded:true,update(c,t){const power=clamp(c.type??0);for(let i=0;i<keys.length;i++){const wave=Math.max(0,Math.sin(t*17-i*0.61));keys[i]!.position.y=0.027-0.004*power*wave;}}};
 },
});

export const computerMouse=defineModel({
 id:'computer-mouse',aliases:['mouse','pc-mouse','optical-mouse'],
 describe:'A sculpted ergonomic optical mouse with split left and right buttons, a ridged scroll wheel, thumb groove, side buttons and a tiny glowing sensor. click depresses the buttons.',
 controls:{click:'0 released .. 1 clicked'},defaults:{click:0},size:'0.11 m long',
 build(ctx){
  const root=new THREE.Group();
  const shell=ctx.mesh(at(G.ellipsoid(0.034,0.017,0.053,40,24),[0,0.018,0]),{tone:0.92});root.add(shell);
  add(ctx,root,G.box(0.0015,0.012,0.047),[0,0.029,0.012],0.58);
  add(ctx,root,G.rbox(0.012,0.006,0.021,0.004),[0,0.034,0.019],0.76);
  for(let i=0;i<5;i++)add(ctx,root,G.box(0.014,0.001,0.001),[0,0.038,0.013+i*0.003],0.92);
  for(const s of [-1,1])add(ctx,root,G.rbox(0.004,0.004,0.012,0.001),[s*0.031,0.019,-0.006],0.9);
  const clickParts:THREE.Object3D[]=[];root.traverse(o=>{if((o as THREE.Mesh).isMesh&&o!==shell&&o.position.y>0.025){o.userData.baseY=o.position.y;clickParts.push(o);}});
  led(ctx,root,0,0.006,-0.034,0.003,'click',0.6);
  return {root,grounded:true,update(c){const q=clamp(c.click??0);for(let i=0;i<clickParts.length;i++){const o=clickParts[i]!;o.position.y=(o.userData.baseY as number)-0.0015*q;}}};
 },
});

export const gameController=defineModel({
 id:'game-controller',aliases:['gamepad','console-controller','video-game-pad'],
 describe:'A twin-grip game controller with a sculpted bridge, twin analog sticks, cross-shaped D-pad, four action buttons, shoulder triggers and a glowing center status light. press drives a pulsing button.',
 controls:{press:'0 idle .. 1 button press'},defaults:{press:0},size:'0.16 m wide',
 build(ctx){
  const root=new THREE.Group();
  panel(ctx,root,0.155,0.046,0.073,[0,0.047,0],0.68);
  for(const s of [-1,1]){
   const grip=ctx.mesh(at(G.capsule(0.018,0.045,6,16),[s*0.049,0.043,0.012],[0,0,s*-16]),{tone:0.78});root.add(grip);
   add(ctx,root,G.rbox(0.045,0.011,0.014,0.004),[s*0.058,0.073,-0.031],0.88);
  }
  add(ctx,root,G.rbox(0.006,0.019,0.002,0.001),[-0.047,0.056,0.038],0.95);
  add(ctx,root,G.rbox(0.019,0.006,0.002,0.001),[-0.047,0.056,0.038],0.95);
  for(const [x,y] of [[0.047,0.064],[0.06,0.052],[0.034,0.052],[0.047,0.04]] as [number,number][]){
   add(ctx,root,G.sphere(0.0045,16,10),[x,y,0.038],0.95);
  }
  for(const x of [-0.022,0.022]){
   add(ctx,root,G.torus(0.009,0.0015,8,32),[x,0.055,0.038],0.36);
   add(ctx,root,G.cyl(0.006,0.006,0.004,20),[x,0.055,0.039],0.82);
   add(ctx,root,G.cyl(0.002,0.002,0.004,16),[x,0.055,0.042],0.94);
  }
  const act=add(ctx,root,G.sphere(0.0028,12,8),[0,0.062,0.039],0.9);
  led(ctx,root,0,0.066,0.04,0.002,'press');
  return {root,grounded:true,update(c){act.scale.setScalar(0.7+0.7*clamp(c.press??0));}};
 },
});

export const vrHeadset=defineModel({
 id:'vr-headset',aliases:['virtual-reality-headset','vr-goggles','virtual-reality-goggles'],
 describe:'A wraparound VR headset with a broad padded face gasket, twin recessed lenses, forehead cushion, adjustable side straps and an arched headband. immerse lifts the headband slightly and wakes the lenses.',
 controls:{immerse:'0 resting .. 1 worn and active'},defaults:{immerse:0},size:'0.21 m wide',
 build(ctx){
  const root=new THREE.Group();
  panel(ctx,root,0.21,0.095,0.085,[0,0.12,0.018],0.78);
  add(ctx,root,G.rbox(0.198,0.078,0.012,0.012),[0,0.12,0.067],0.55);
  for(const x of [-0.047,0.047]){
   faceRing(ctx,root,0.028,0.004,x,0.12,0.076,0.92);
   const l=frontCylinder(ctx,root,0.021,0.003,x,0.12,0.2);
   (l.material as THREE.MeshStandardMaterial).emissive.setRGB(0.04,0.08,0.16);
   add(ctx,root,G.torus(0.01,0.0018,8,24),[x,0.12,0.079],0.85);
  }
  for(const s of [-1,1])add(ctx,root,G.box(0.026,0.018,0.012),[s*0.112,0.12,-0.012],0.58);
  const band=ctx.mesh(G.tube([[-0.105,0.15,-0.018],[-0.09,0.215,-0.038],[0,0.237,-0.043],[0.09,0.215,-0.038],[0.105,0.15,-0.018]],0.008,48,12),{tone:0.82});root.add(band);
  add(ctx,root,G.rbox(0.16,0.018,0.055,0.008),[0,0.087,-0.02],0.91);
  return {root,grounded:true,update(c){const a=clamp(c.immerse??0);band.position.y=0.045*a;(band.material as THREE.MeshStandardMaterial).emissiveIntensity=0.12+0.45*a;}};
 },
});

export const quadcopterDrone=defineModel({
 id:'quadcopter-drone',aliases:['quadcopter','camera-drone','quad-rotor-drone'],
 describe:'A camera quadcopter with four swept arms, raised rotor pods, broad two-blade propellers, a gimbal camera beneath the nose and landing skids. rotors speeds up all four propellers.',
 controls:{rotors:'0 stopped .. 1 fast spin'},defaults:{rotors:0},size:'0.42 m rotor span',
 build(ctx){
  const root=new THREE.Group(),y=0.14;
  panel(ctx,root,0.12,0.045,0.18,[0,y,0],0.76);
  add(ctx,root,G.ellipsoid(0.057,0.022,0.064,28,16),[0,y+0.005,0.026],0.9);
  const rotors:THREE.Group[]=[];
  for(const s of [-1,1])for(const z of [-1,1]){
   const x=s*0.15,zz=z*0.15;
   root.add(ctx.mesh(G.tube([[0,y,0],[x*0.64,y+0.008,zz*0.64],[x,y+0.018,zz]],0.007,18,10),{tone:0.62}));
   add(ctx,root,G.cyl(0.017,0.02,0.018,24),[x,y+0.031,zz],0.9);
   const rotor=new THREE.Group();rotor.position.set(x,y+0.044,zz);root.add(rotor);rotors.push(rotor);
   rotor.add(ctx.mesh(at(G.rbox(0.012,0.003,0.15,0.002),[0,0,0]),{tone:0.95}));
   rotor.add(ctx.mesh(at(G.rbox(0.012,0.003,0.15,0.002),[0,0,0],[0,90,0]),{tone:0.95}));
   add(ctx,root,G.cyl(0.004,0.004,0.005,14),[x,y+0.047,zz],0.48);
  }
  const cam=group();cam.position.set(0,y-0.039,0.083);root.add(cam);
  add(ctx,cam,G.rbox(0.046,0.032,0.038,0.007),[0,-0.025,0],0.62);
  frontCylinder(ctx,cam,0.012,0.005,0,-0.025,0.09);
  faceRing(ctx,cam,0.014,0.002,0,-0.025,0.022,0.9);
  for(const s of [-1,1])add(ctx,root,G.capsule(0.003,0.095,4,10),[s*0.079,y-0.086,0.03],0.65);
  return {root,grounded:true,update(c,t){const a=clamp(c.rotors??0);for(let i=0;i<rotors.length;i++)rotors[i]!.rotation.y=t*(4+72*a)*(i%2?1:-1);}};
 },
});

export const smartwatch=defineModel({
 id:'smartwatch',aliases:['smart-watch','fitness-watch','wearable-watch'],
 describe:'A square smartwatch with rounded black glass, digital dial, side crown, speaker ports, heart-rate sensor and a flexible band with punched adjustment holes. notify lights the face and adds a pulsing notification dot.',
 controls:{notify:'0 quiet .. 1 notification active'},defaults:{notify:0},size:'0.045 m face',
 build(ctx){
  const root=new THREE.Group(),watch=new THREE.Group();watch.position.y=0.13;root.add(watch);
  const upper=ctx.mesh(at(G.rbox(0.027,0.11,0.006,0.003),[0,0.075,-0.002]),{tone:0.56});watch.add(upper);
  const lower=ctx.mesh(at(G.rbox(0.027,0.11,0.006,0.003),[0,-0.075,-0.002]),{tone:0.56});watch.add(lower);
  for(let i=0;i<5;i++)add(ctx,watch,G.cyl(0.0013,0.0013,0.001,10),[0,-0.088+i*0.01,-0.002],0.9,[90,0,0]);
  panel(ctx,watch,0.043,0.047,0.011,[0,0,0.008],0.85);
  faceBox(ctx,watch,0.036,0.04,0.0015,0,0,0.014,0.45);
  const screen=ctx.mesh(at(G.rbox(0.031,0.035,0.001,0.0004),[0,0,0.015]),{tone:0.4,glow:0.5,glowControl:'notify'});watch.add(screen);
  add(ctx,watch,G.torus(0.011,0.0014,8,32),[0,0.006,0.016],0.9);
  for(let i=0;i<8;i++){const a=i*Math.PI/4;add(ctx,watch,G.box(0.0014,0.004,0.001),[Math.cos(a)*0.008,Math.sin(a)*0.008,0.016],0.9);}
  const dot=ctx.mesh(at(G.sphere(0.0035,14,10),[0.009,0.01,0.017]),{tone:1,glow:2.4,glowControl:'notify'});watch.add(dot);
  add(ctx,watch,G.cyl(0.004,0.004,0.006,16),[0.024,0,0.007],0.9);
  const sensor=ctx.mesh(at(G.torus(0.006,0.001,8,28),[0,-0.012,-0.002]),{tone:0.65});watch.add(sensor);
  return {root,grounded:true,update(c,t){const n=clamp(c.notify??0);dot.visible=n>0.02;dot.scale.setScalar(0.7+0.4*n+0.2*n*Math.sin(t*7));(screen.material as THREE.MeshStandardMaterial).emissiveIntensity=0.1+0.4*n;}};
 },
});

export const wirelessEarbuds=defineModel({
 id:'wireless-earbuds',aliases:['wireless-earbud-case','bluetooth-earbuds','true-wireless-earbuds'],
 describe:'Two stemmed wireless earbuds nest in a glossy clamshell charging case with an open hinged lid, sculpted ear tips, dark acoustic grilles and a tiny charge indicator. lid opens and the case status glows.',
 controls:{lid:'0 closed .. 1 open',charge:'0 empty .. 1 full (default 0.7)'},defaults:{lid:0.8,charge:0.7},size:'0.06 m case',
 build(ctx){
  const root=new THREE.Group();
  panel(ctx,root,0.062,0.025,0.044,[0,0.014,0],0.84);
  add(ctx,root,G.rbox(0.056,0.005,0.039,0.006),[0,0.028,-0.001],0.95);
  const lid=group();lid.position.set(0,0.03,-0.018);root.add(lid);
  lid.add(ctx.mesh(at(G.rbox(0.061,0.028,0.006,0.007),[0,0.014,0]),{tone:0.8}));
  add(ctx,lid,G.rbox(0.049,0.018,0.002,0.006),[0,0.014,0.004],0.4);
  for(const s of [-1,1]){
   add(ctx,root,G.ellipsoid(0.009,0.006,0.008,20,14),[s*0.014,0.032,0.003],0.92);
   add(ctx,root,G.capsule(0.003,0.019,5,10),[s*0.014,0.019,0.003],0.9,[0,0,s*8]);
   add(ctx,root,G.sphere(0.0045,16,12),[s*0.014,0.039,0.006],0.8);
   faceDisc(ctx,root,0.0032,0.001,s*0.014,0.04,0.01,0.16);
  }
  const charge=led(ctx,root,0,0.016,0.023,0.002,'charge');
  return {root,grounded:true,update(c){lid.rotation.x=-deg(104*clamp(c.lid??0.8));charge.visible=(c.charge??0.7)>0.02;}};
 },
});

export const usbStick=defineModel({
 id:'usb-stick',aliases:['usb-flash-drive','flash-drive','thumb-drive'],
 describe:'A compact USB flash drive with a ridged rounded body, exposed metal Type-A plug, dark connector tongue, retention eyelet and a pinprick activity LED. activity pulses while data moves.',
 controls:{activity:'0 idle .. 1 transferring data'},defaults:{activity:0},size:'0.055 m long',
 build(ctx){
  const root=new THREE.Group();
  add(ctx,root,G.rbox(0.031,0.012,0.037,0.005),[0,0.009,-0.005],0.78);
  add(ctx,root,G.rbox(0.024,0.008,0.023,0.003),[0,0.008,0.031],0.55);
  add(ctx,root,G.box(0.018,0.004,0.015),[0,0.008,0.051],0.92);
  for(const x of [-0.007,0.007])add(ctx,root,G.box(0.002,0.001,0.011),[x,0.010,0.051],0.42);
  add(ctx,root,G.torus(0.006,0.0015,8,32),[0,0.009,-0.029],0.7,[90,0,0]);
  const light=led(ctx,root,0.009,0.015,-0.015,0.0017,'activity');
  for(let i=0;i<3;i++)add(ctx,root,G.box(0.027,0.0008,0.002),[0,0.015,-0.014+i*0.004],0.92);
  return {root,grounded:true,update(c,t){const a=clamp(c.activity??0);light.visible=a>0.05;light.scale.setScalar(0.6+0.5*a*(1+Math.sin(t*9)));}};
 },
});

export const hardDrive=defineModel({
 id:'hard-drive',aliases:['hard-disk-drive','hdd','disk-drive'],
 describe:'An opened 3.5-inch hard drive reveals its bright circular platter, spindle hub, curved actuator arm and read head inside a silver chassis with screw holes and a propped cover. spin accelerates the platter.',
 controls:{spin:'0 stopped .. 1 operating speed'},defaults:{spin:0},size:'0.15 m wide',
 build(ctx){
  const root=new THREE.Group();
  panel(ctx,root,0.147,0.026,0.102,[0,0.014,0],0.56);
  for(const s of [-1,1])add(ctx,root,G.box(0.009,0.029,0.097),[s*0.069,0.023,0],0.78);
  add(ctx,root,G.box(0.133,0.006,0.006),[0,0.021,0.047],0.84);
  const platter=group();platter.position.set(-0.012,0.029,-0.004);root.add(platter);
  platter.add(ctx.mesh(at(G.cyl(0.041,0.041,0.003,64),[0,0,0]),{tone:0.91,rough:0.25}));
  for(const r of [0.01,0.017,0.024,0.031,0.038])platter.add(ctx.mesh(at(G.torus(r,0.00055,6,56),[0,0.002,0],[90,0,0]),{tone:0.59}));
  platter.add(ctx.mesh(at(G.cyl(0.008,0.008,0.004,32),[0,0.003,0]),{tone:0.7}));
  const arm=group();arm.position.set(0.047,0.034,0.033);root.add(arm);
  arm.add(ctx.mesh(G.tube([[0,0,0],[-0.025,0,0.001],[-0.052,0,-0.039]],0.0023,22,8),{tone:0.86}));
  arm.add(ctx.mesh(at(G.rbox(0.008,0.003,0.008,0.001),[-0.053,0,-0.039]),{tone:0.35}));
  for(const [x,z] of [[-0.061,0.04],[0.061,0.04],[-0.061,-0.04],[0.061,-0.04]] as [number,number][])add(ctx,root,G.cyl(0.002,0.002,0.002,12),[x,0.031,z],0.92);
  const lid=group();lid.position.set(0,0.044,-0.055);root.add(lid);
  lid.add(ctx.mesh(at(G.rbox(0.146,0.003,0.1,0.003),[0,0,0]),{tone:0.88}));
  return {root,grounded:true,update(c,t){platter.rotation.y=t*(2+85*clamp(c.spin??0));lid.rotation.x=-0.75;}};
 },
});

export const cpuChip=defineModel({
 id:'cpu-chip',aliases:['microprocessor','processor-chip','central-processing-unit'],
 describe:'A square silicon CPU package with a polished stepped heat spreader, tiny centered die, substrate layers and fine metallic pins along all four edges. compute sends a moving glow across the die.',
 controls:{compute:'0 idle .. 1 active computation'},defaults:{compute:0},size:'0.04 m package',
 build(ctx){
  const root=new THREE.Group();
  panel(ctx,root,0.04,0.006,0.04,[0,0.004,0],0.46);
  panel(ctx,root,0.034,0.004,0.034,[0,0.009,0],0.83);
  panel(ctx,root,0.022,0.002,0.022,[0,0.012,0],0.61);
  const die=panel(ctx,root,0.012,0.0015,0.012,[0,0.014,0],0.19);
  add(ctx,root,G.rbox(0.007,0.0008,0.007,0.001),[0,0.015,0],1);
  const pins:THREE.BufferGeometry[]=[];
  for(let i=0;i<12;i++)for(const s of [-1,1]){
   const p=-0.017+i*0.0031;
   pins.push(at(G.box(0.001,0.002,0.00055),[s*0.0195,0.001,p]));
   pins.push(at(G.box(0.00055,0.002,0.001),[p,0.001,s*0.0195]));
  }
  root.add(ctx.mesh(G.merge(pins),{tone:0.96}));
  const tracer=led(ctx,root,0,0.016,0,0.0016,'compute');
  return {root,grounded:true,update(c,t){const q=clamp(c.compute??0);tracer.position.x=-0.004+0.008*((t*0.65)%1);tracer.visible=q>0.03;(die.material as THREE.MeshStandardMaterial).emissiveIntensity=0.12+0.6*q;}};
 },
});

export const graphicsCard=defineModel({
 id:'graphics-card',aliases:['gpu','video-card','graphics-adapter'],
 describe:'A long dual-slot graphics card with an aluminum heatsink, two oversized axial fans, a reinforced backplate, exposed gold PCIe edge and a row of display connectors. load spins the fans and pulses the status light.',
 controls:{load:'0 idle .. 1 rendering load'},defaults:{load:0},size:'0.29 m long',
 build(ctx){
  const root=new THREE.Group(),w=0.285,h=0.042,d=0.12;
  panel(ctx,root,w,h,d,[0,0.038,0],0.66);
  add(ctx,root,G.rbox(w-0.012,0.003,d-0.012,0.003),[0,0.061,0],0.82);
  const fans:THREE.Group[]=[];
  for(const x of [-0.069,0.069]){
   const fan=new THREE.Group();fan.position.set(x,0.041,d/2+0.002);root.add(fan);fans.push(fan);
   fan.add(ctx.mesh(at(G.torus(0.043,0.003,10,40),[0,0,0]),{tone:0.92}));
   fan.add(ctx.mesh(at(G.cyl(0.039,0.039,0.002,40),[0,0,0]),{tone:0.3}));
   fan.add(ctx.mesh(at(G.cyl(0.01,0.01,0.006,24),[0,0,0.003]),{tone:0.8}));
   for(let i=0;i<9;i++){
    const a=i*Math.PI*2/9;
    const blade=ctx.mesh(at(G.rbox(0.009,0.003,0.024,0.002),[Math.cos(a)*0.024,Math.sin(a)*0.024,0.004],[0,0,a*180/Math.PI+25]),{tone:0.77});fan.add(blade);
   }
  }
  add(ctx,root,G.rbox(0.006,h+0.019,0.13,0.001),[w/2+0.003,0.038,0],0.91);
  for(let i=0;i<4;i++)add(ctx,root,G.box(0.003,0.026,0.0008),[w/2+0.007,0.037,-0.047+i*0.028],0.18);
  const pins:THREE.BufferGeometry[]=[];for(let i=0;i<34;i++)pins.push(at(G.box(0.003,0.001,0.002),[-0.135+i*0.008,0.006,d/2-0.018]));
  root.add(ctx.mesh(G.merge(pins),{tone:0.95}));
  const activity=led(ctx,root,0,0.066,-d/2+0.01,0.002,'load');
  return {root,grounded:true,update(c,t){const p=clamp(c.load??0);for(let i=0;i<fans.length;i++)fans[i]!.rotation.z=t*(3+68*p);activity.visible=p>0.04;}};
 },
});

export const motherboard=defineModel({
 id:'motherboard',aliases:['pc-motherboard','mainboard','system-board'],
 describe:'A full-size motherboard with a socketed CPU, four DIMM slots, chipset heatsinks, PCIe slots, rear I/O edge and dense rows of capacitors and connectors. power sends a bright signal around the board.',
 controls:{power:'0 off .. 1 powered'},defaults:{power:0},size:'0.3 m board',
 build(ctx){
  const root=new THREE.Group(),w=0.244,h=0.305,d=0.008;
  panel(ctx,root,w,h,d,[0,h/2,0],0.46);
  // CPU socket and memory slots
  add(ctx,root,G.rbox(0.084,0.084,0.004,0.006),[-0.043,0.206,d/2+0.003],0.82);
  add(ctx,root,G.rbox(0.057,0.057,0.002,0.002),[-0.043,0.206,d/2+0.006],0.18);
  for(let i=0;i<4;i++){
   const x=0.025+i*0.022;
   add(ctx,root,G.rbox(0.012,0.122,0.006,0.003),[x,0.206,d/2+0.004],i%2?0.9:0.64);
   add(ctx,root,G.box(0.014,0.004,0.002),[x,0.144,d/2+0.005],0.93);
  }
  for(const [x,y,wid,hei] of [[0.043,0.062,0.16,0.011],[-0.012,0.095,0.13,0.009],[0.034,0.123,0.1,0.008]] as [number,number,number,number][]){
   add(ctx,root,G.rbox(wid,hei,0.006,0.003),[x,y,d/2+0.004],0.78);
  }
  for(let i=0;i<11;i++){
   const x=-0.102+i*0.019;
   add(ctx,root,G.cyl(0.0045,0.0045,0.008,14),[x,0.259,d/2+0.006],0.91);
   add(ctx,root,G.cyl(0.0045,0.0045,0.008,14),[x,0.034,d/2+0.006],0.7);
  }
  add(ctx,root,G.rbox(0.044,0.086,0.009,0.003),[0.084,0.075,d/2+0.006],0.67);
  // dense traces and headers
  const traces:THREE.BufferGeometry[]=[];
  for(let i=0;i<16;i++){
   const x=-0.105+i*0.014;
   traces.push(at(G.box(0.0007,0.07,0.0008),[x,0.14,d/2+0.002]));
  }
  root.add(ctx.mesh(G.merge(traces),{tone:0.57}));
  const activity=led(ctx,root,0.101,0.281,d/2+0.007,0.002,'power');
  const status=led(ctx,root,-0.085,0.09,d/2+0.007,0.0016,'power');
  return {root,grounded:true,update(c,t){const q=clamp(c.power??0);activity.visible=q>0.03;status.visible=q>0.03&&Math.sin(t*8)>-0.25;}};
 },
});

export const satelliteDish=defineModel({
 id:'satellite-dish',aliases:['parabolic-dish','satellite-antenna','dish-antenna'],
 describe:'A parabolic satellite dish on an adjustable mast and tripod, with a rolled rim, central feed horn on a forward support arm, coax cable and azimuth clamps. aim sweeps the dish across the sky and signal lights the feed.',
 controls:{aim:'0 left .. 1 right',signal:'0 no lock .. 1 strong satellite lock'},defaults:{aim:0.5,signal:0.75},size:'1.2 m dish',
 build(ctx){
  const root=new THREE.Group(),mast=0.54;
  add(ctx,root,G.cyl(0.017,0.026,0.76,20),[0,0.38,0],0.61);
  for(let i=0;i<3;i++){const a=i*Math.PI*2/3;add(ctx,root,G.capsule(0.013,0.28,5,12),[Math.cos(a)*0.12,0.08,Math.sin(a)*0.12],0.66,[0,0,Math.cos(a)*-28]);}
  add(ctx,root,G.cyl(0.065,0.065,0.035,28),[0,mast,0],0.82);
  const dish=group();dish.position.set(0,mast+0.04,0.01);root.add(dish);
  dish.add(ctx.mesh(at(G.lathe([[0,0],[0.035,0.005],[0.075,0.019],[0.12,0.044],[0.165,0.077],[0.19,0.102],[0.194,0.108]],48),[0,0,0],[90,0,0]),{tone:0.78}));
  dish.add(ctx.mesh(at(G.torus(0.19,0.004,10,48),[0,0,0.108]),{tone:0.95}));
  for(let i=0;i<5;i++){
   const a=i*Math.PI*2/5;
   dish.add(ctx.mesh(G.tube([[0,0,0.004],[Math.cos(a)*0.105,Math.sin(a)*0.105,0.06]],0.0018,8,6),{tone:0.62}));
  }
  const feed=group();feed.position.set(0,0,0.21);dish.add(feed);
  add(ctx,feed,G.cyl(0.007,0.009,0.05,18),[0,0,0],0.82,[90,0,0]);
  add(ctx,feed,G.sphere(0.014,18,12),[0,0,0.025],0.9);
  add(ctx,feed,G.torus(0.012,0.002,8,24),[0,0,0.038],0.7);
  const cable=ctx.mesh(G.tube([[0,mast,0],[0.035,mast-0.08,-0.04],[0.02,0.2,-0.035],[0.01,0.04,0]],0.002,24,8),{tone:0.28});root.add(cable);
  const sig=led(ctx,feed,0,0.001,0.04,0.003,'signal');
  return {root,grounded:true,update(c,t){dish.rotation.x=deg(-25+50*clamp(c.aim??0.5));dish.rotation.y=0.025*Math.sin(t*0.6);sig.visible=(c.signal??0.75)>0.02;}};
 },
});

export const vintageRadio=defineModel({
 id:'vintage-radio',aliases:['transistor-radio','table-radio','old-radio'],
 describe:'A mid-century tabletop radio with a polished wooden cabinet, woven speaker grille, ivory push buttons, glowing horizontal tuning scale, two knurled control knobs and a curved carry handle. tune moves the dial and backlight.',
 controls:{tune:'0 low frequency .. 1 high frequency',power:'0 off .. 1 on'},defaults:{tune:0.38,power:0.6},size:'0.32 m wide',
 build(ctx){
  const root=new THREE.Group(),w=0.32,h=0.19,d=0.12;
  panel(ctx,root,w,h,d,[0,h/2,0],0.66);
  faceBox(ctx,root,0.165,0.111,0.005,-0.067,0.099,d/2+0.004,0.31);
  const grille:THREE.BufferGeometry[]=[];
  for(let i=0;i<9;i++)grille.push(at(G.box(0.002,0.098,0.002),[-0.145+i*0.019,0.099,d/2+0.007]));
  for(let i=0;i<7;i++)grille.push(at(G.box(0.158,0.002,0.002),[-0.067,0.05+i*0.016,d/2+0.007]));
  root.add(ctx.mesh(G.merge(grille),{tone:0.82}));
  const scale=faceBox(ctx,root,0.105,0.03,0.004,0.091,0.146,d/2+0.005,0.18);
  const light=ctx.mesh(at(G.box(0.1,0.019,0.002),[0.091,0.146,d/2+0.009]),{tone:0.95,glow:1.3,glowControl:'power'});root.add(light);
  for(let i=0;i<9;i++)add(ctx,root,G.box(0.001,0.008,0.001),[0.043+i*0.012,0.146,d/2+0.011],0.2);
  const needle=add(ctx,root,G.box(0.002,0.024,0.002),[0.043+0.1*0.38,0.146,d/2+0.012],1);
  for(const x of [0.092,0.139]){
   faceRing(ctx,root,0.018,0.003,x,0.069,d/2+0.006,0.96);
   frontCylinder(ctx,root,0.013,0.012,x,0.069,d/2+0.008,0.52);
   for(let i=0;i<12;i++){const a=i*Math.PI/6;add(ctx,root,G.box(0.0015,0.004,0.001),[x+Math.cos(a)*0.014,0.069+Math.sin(a)*0.014,d/2+0.014],0.9);}
  }
  for(let i=0;i<4;i++)add(ctx,root,G.rbox(0.037,0.012,0.012,0.003),[-0.098+i*0.045,0.029,d/2+0.003],0.94);
  const handle=ctx.mesh(G.tube([[-0.1,h-0.006,-0.028],[-0.09,h+0.04,-0.03],[0,h+0.052,-0.03],[0.09,h+0.04,-0.03],[0.1,h-0.006,-0.028]],0.006,36,10),{tone:0.86});root.add(handle);
  return {root,grounded:true,update(c){const f=clamp(c.tune??0.38);needle.position.x=0.043+0.1*f;(scale.material as THREE.MeshStandardMaterial).emissiveIntensity=0.1+0.4*(c.power??0.6);}};
 },
});

export const rotaryTelephone=defineModel({
 id:'rotary-telephone',aliases:['rotary-phone','dial-telephone','old-telephone'],
 describe:'A classic desk telephone with a heavy sloped base, circular rotary dial and finger holes, metal cradle hooks, and a curved handset with flared earpieces. dial spins the numbered ring back to rest.',
 controls:{dial:'0 at rest .. 1 rotate and return'},defaults:{dial:0},size:'0.24 m wide',
 build(ctx){
  const root=new THREE.Group();
  const base=ctx.mesh(at(G.rbox(0.23,0.065,0.2,0.027),[0,0.046,0]),{tone:0.72});root.add(base);
  const slope=group();slope.position.set(0,0.082,0.018);slope.rotation.x=-deg(24);root.add(slope);
  slope.add(ctx.mesh(at(G.cyl(0.076,0.079,0.008,48),[0,0,0.043],[90,0,0]),{tone:0.9}));
  slope.add(ctx.mesh(at(G.torus(0.068,0.004,10,48),[0,0,0.05]),{tone:0.34}));
  const dial=group();dial.position.set(0,0,0.05);slope.add(dial);
  dial.add(ctx.mesh(at(G.cyl(0.056,0.056,0.004,48),[0,0,0]),{tone:0.62}));
  for(let i=0;i<10;i++){
   const a=i*Math.PI*2/10;
   dial.add(ctx.mesh(at(G.torus(0.006,0.002,8,20),[Math.cos(a)*0.04,Math.sin(a)*0.04,0.004]),{tone:0.15}));
   dial.add(ctx.mesh(at(G.box(0.007,0.004,0.002),[Math.cos(a)*0.04,Math.sin(a)*0.04,0.005]),{tone:0.95}));
  }
  dial.add(ctx.mesh(at(G.cyl(0.018,0.018,0.003,24),[0,0,0.005]),{tone:0.92}));
  for(const x of [-0.08,0.08])add(ctx,root,G.cyl(0.007,0.007,0.022,18),[x,0.086,-0.054],0.96);
  const handset=ctx.mesh(G.tube([[-0.105,0.142,-0.045],[-0.11,0.16,-0.045],[-0.07,0.177,-0.04],[0,0.185,-0.04],[0.07,0.177,-0.04],[0.11,0.16,-0.045],[0.105,0.142,-0.045]],0.012,48,12),{tone:0.82});root.add(handset);
  for(const x of [-0.105,0.105]){
   add(ctx,root,G.cyl(0.021,0.024,0.022,32),[x,0.143,-0.045],0.9,[0,0,x>0?22:-22]);
   add(ctx,root,G.torus(0.016,0.002,8,28),[x,0.143,-0.031],0.45);
  }
  const cord=ctx.mesh(G.tube([[0.1,0.15,-0.045],[0.13,0.13,-0.055],[0.14,0.1,-0.055],[0.13,0.07,-0.05],[0.11,0.07,-0.05]],0.002,36,6),{tone:0.36});root.add(cord);
  return {root,grounded:true,update(c){const d=clamp(c.dial??0);dial.rotation.z=-Math.sin(d*Math.PI)*d*deg(300);}};
 },
});

export const cassetteTape=defineModel({
 id:'cassette-tape',aliases:['compact-cassette','audio-cassette','tape-cassette'],
 describe:'A transparent compact cassette shows two toothed reels, wound tape, capstan holes, five front windows, screw bosses and a labeled center panel. play turns both reels and pulls a thin tape span between them.',
 controls:{play:'0 paused .. 1 playing'},defaults:{play:0},size:'0.1 m wide',
 build(ctx){
  const root=new THREE.Group(),w=0.102,h=0.064,d=0.006;
  panel(ctx,root,w,h,d,[0,h/2,0],0.74);
  faceBox(ctx,root,0.09,0.034,0.001,0,h/2+0.001,d/2+0.001,0.28);
  const reels:THREE.Group[]=[];
  for(const x of [-0.027,0.027]){
   const reel=group();reel.position.set(x,0.043,d/2+0.003);root.add(reel);reels.push(reel);
   reel.add(ctx.mesh(at(G.cyl(0.018,0.018,0.002,40),[0,0,0]),{tone:0.86}));
   reel.add(ctx.mesh(at(G.torus(0.014,0.0016,8,32),[0,0,0.002]),{tone:0.3}));
   reel.add(ctx.mesh(at(G.cyl(0.005,0.005,0.003,20),[0,0,0.003]),{tone:0.22}));
   for(let i=0;i<6;i++){const a=i*Math.PI/3;reel.add(ctx.mesh(at(G.box(0.002,0.021,0.002),[Math.cos(a)*0.007,Math.sin(a)*0.007,0.004],[0,0,i*60]),{tone:0.96}));}
  }
  root.add(ctx.mesh(G.tube([[-0.027,0.043,d/2+0.008],[-0.015,0.023,d/2+0.008],[0,0.018,d/2+0.008],[0.015,0.023,d/2+0.008],[0.027,0.043,d/2+0.008]],0.0009,36,6),{tone:0.15}));
  for(const [x,y] of [[-0.043,0.006],[0.043,0.006],[-0.043,h-0.006],[0.043,h-0.006],[-0.014,0.006],[0.014,0.006]] as [number,number][])frontCylinder(ctx,root,0.003,0.002,x,y,d/2+0.001,0.12);
  add(ctx,root,G.rbox(0.049,0.013,0.001,0.002),[0,0.047,d/2+0.004],0.91);
  for(let i=0;i<5;i++)add(ctx,root,G.box(0.0007,0.006,0.001),[-0.018+i*0.009,0.047,d/2+0.005],0.37);
  return {root,grounded:true,update(c,t){const p=clamp(c.play??0);for(let i=0;i<2;i++)reels[i]!.rotation.z=t*(3+26*p)*(i?1:-1);}};
 },
});

export const recordPlayer=defineModel({
 id:'record-player',aliases:['turntable','vinyl-player','phonograph'],
 describe:'A belt-drive record player with a broad black vinyl LP, concentric grooves, center label, spindle, hinged dust cover, tonearm and cartridge. spin rotates the record while the stylus tracks inward.',
 controls:{spin:'0 stopped .. 1 playing'},defaults:{spin:0},size:'0.43 m wide',
 build(ctx){
  const root=new THREE.Group(),w=0.43,d=0.34;
  panel(ctx,root,w,0.085,d,[0,0.052,0],0.63);
  panel(ctx,root,w-0.024,0.012,d-0.02,[0,0.101,0],0.78);
  const record=group();record.position.set(-0.055,0.111,0);root.add(record);
  record.add(ctx.mesh(at(G.cyl(0.137,0.137,0.004,72),[0,0,0]),{tone:0.24,rough:0.35}));
  for(let r=0.074;r<0.13;r+=0.006)record.add(ctx.mesh(at(G.torus(r,0.00065,6,48),[0,0.002,0],[90,0,0]),{tone:0.58}));
  record.add(ctx.mesh(at(G.cyl(0.04,0.04,0.002,48),[0,0.003,0]),{tone:0.88}));
  record.add(ctx.mesh(at(G.cyl(0.003,0.003,0.004,18),[0,0.004,0]),{tone:0.22}));
  const platter=add(ctx,root,G.cyl(0.15,0.15,0.006,72),[-0.055,0.106,0],0.48);
  add(ctx,root,G.rbox(0.19,0.018,0.12,0.012,4),[0.11,0.113,-0.06],0.56);
  const arm=group();arm.position.set(0.13,0.128,-0.047);root.add(arm);
  arm.add(ctx.mesh(at(G.cyl(0.006,0.006,0.085,20),[0,0,0.045],[90,0,0]),{tone:0.9}));
  arm.add(ctx.mesh(at(G.sphere(0.012,16,12),[0,0,0]),{tone:0.62}));
  arm.add(ctx.mesh(at(G.rbox(0.018,0.009,0.03,0.003),[0,0,0.091]),{tone:0.8}));
  arm.add(ctx.mesh(at(G.cone(0.003,0.022,12),[0,-0.005,0.103],[0,0,0]),{tone:0.98}));
  add(ctx,root,G.cyl(0.009,0.009,0.006,20),[0.18,0.1,0.115],0.9);
  const cover=group();cover.position.set(0,0.094,-0.15);root.add(cover);
  cover.add(ctx.mesh(at(G.rbox(0.4,0.15,0.003,0.006),[0,0.075,0]),{tone:0.35}));
  return {root,grounded:true,update(c,t){const s=clamp(c.spin??0);record.rotation.y=t*(1+34*s);arm.rotation.y=-0.4*s;cover.rotation.x=-0.04;}};
 },
});

export const dataCenterAisle=defineModel({
 id:'data-center-aisle',aliases:['server-aisle','server-room','datacenter'],
 describe:'A cold data-center aisle between facing rows of full-height server racks, with perforated doors, dense hot-swap bays, blinking status LEDs, cable trays and overhead aisle lights. activity animates a wave of rack lights.',
 controls:{activity:'0 standby .. 1 busy data-center traffic'},defaults:{activity:0.45},size:'2.5 m aisle',
 build(ctx){
  const root=new THREE.Group(),lights:THREE.Mesh[]=[];
  for(const s of [-1,1])for(let row=0;row<3;row++){
   const x=s*0.54,z=-0.66+row*0.66;
   panel(ctx,root,0.42,2.1,0.66,[x,1.05,z],0.57);
   faceBox(ctx,root,0.37,1.96,0.014,x,1.06,z+0.338,0.27);
   for(let k=0;k<12;k++){
    const y=0.19+k*0.15;
    add(ctx,root,G.rbox(0.31,0.108,0.008,0.006),[x,y,z+0.35],0.68);
    add(ctx,root,G.box(0.23,0.003,0.002),[x-0.02,y+0.033,z+0.356],0.87);
    for(let j=0;j<3;j++)add(ctx,root,G.box(0.018,0.014,0.003),[x-0.102+j*0.027,y-0.022,z+0.357],0.42);
    lights.push(ctx.mesh(at(G.sphere(0.003,10,8),[x+0.104,y+0.028,z+0.359]),{tone:0.95,glow:1.4,glowControl:'activity'}));root.add(lights[lights.length-1]!);
   }
   for(const xx of [x-0.185,x+0.185])add(ctx,root,G.box(0.008,2.05,0.012),[xx,1.05,z+0.35],0.86);
  }
  for(const s of [-1,1])add(ctx,root,G.box(0.22,0.11,2.14),[s*0.54,2.17,0],0.88);
  add(ctx,root,G.box(0.2,0.06,1.5),[0,2.22,0],0.55);
  for(let i=0;i<5;i++)add(ctx,root,G.box(0.09,0.006,0.42),[0,2.14,-0.7+i*0.34],0.92);
  return {root,grounded:true,update(c,t){const a=clamp(c.activity??0.45);for(let i=0;i<lights.length;i++){const m=lights[i]!;m.visible=((Math.sin(t*3+i*1.7)+1)/2)<0.25+0.7*a;}}};
 },
});

export const dslrCamera=defineModel({
 id:'dslr-camera',aliases:['digital-slr-camera','digital-camera','camera-body'],
 describe:'A DSLR camera with a deep rubberized grip, pentaprism viewfinder hump, top status LCD, shutter button, raised flash and a large removable zoom lens with concentric focus rings. shutter briefly closes the aperture.',
 controls:{shutter:'0 open .. 1 exposure'},defaults:{shutter:0},size:'0.15 m wide',
 build(ctx){
  const root=new THREE.Group();
  panel(ctx,root,0.145,0.105,0.058,[0,0.083,0],0.58);
  add(ctx,root,G.rbox(0.064,0.036,0.046,0.014),[-0.014,0.151,-0.001],0.78);
  add(ctx,root,G.rbox(0.038,0.061,0.012,0.009),[0.052,0.075,0.03],0.76);
  faceBox(ctx,root,0.026,0.017,0.003,0.016,0.137,0.032,0.14);
  const lens=group();lens.position.set(-0.012,0.087,0.036);root.add(lens);
  for(const [r,th,z,tone] of [[0.048,0.007,0,0.82],[0.041,0.006,0.012,0.54],[0.035,0.006,0.023,0.93],[0.028,0.004,0.032,0.58]] as [number,number,number,number][]){
   lens.add(ctx.mesh(at(G.cyl(r,r,th,48),[0,0,z],[90,0,0]),{tone}));
   lens.add(ctx.mesh(at(G.torus(r-th/2,0.0016,8,40),[0,0,z+th/2+0.001]),{tone:0.9}));
  }
  const aperture=ctx.mesh(at(G.cyl(0.023,0.023,0.003,40),[0,0,0.037],[90,0,0]),{tone:0.12});lens.add(aperture);
  lens.add(ctx.mesh(at(G.torus(0.025,0.002,8,40),[0,0,0.039]),{tone:0.95}));
  add(ctx,root,G.box(0.035,0.005,0.018),[0.037,0.145,-0.004],0.86);
  add(ctx,root,G.cyl(0.006,0.006,0.006,16),[0.052,0.141,0.02],0.92);
  const flash=add(ctx,root,G.rbox(0.032,0.009,0.008,0.002),[-0.014,0.149,0.025],0.94);
  const status=led(ctx,root,0.065,0.13,0.022,0.002,'shutter');
  return {root,grounded:true,update(c,t){const s=clamp(c.shutter??0);aperture.scale.setScalar(1-0.55*s);flash.scale.y=1+0.6*s;status.visible=s>0.03;(aperture.material as THREE.MeshStandardMaterial).emissiveIntensity=0.5*s;}};
 },
});

export const printer=defineModel({
 id:'printer',aliases:['inkjet-printer','desktop-printer','paper-printer'],
 describe:'A compact inkjet printer with a hinged scanner lid, control panel, paper input tray, output slot, drive rollers and a sheet emerging into the front catch tray. print feeds the paper forward.',
 controls:{print:'0 idle .. 1 printing page'},defaults:{print:0},size:'0.43 m wide',
 build(ctx){
  const root=new THREE.Group(),w=0.43,d=0.31;
  panel(ctx,root,w,0.26,d,[0,0.15,0],0.76);
  panel(ctx,root,w+0.008,0.025,d+0.012,[0,0.286,-0.004],0.91);
  add(ctx,root,G.rbox(0.23,0.008,0.095,0.004),[0,0.285,-0.018],0.33);
  add(ctx,root,G.box(0.29,0.006,0.11),[0,0.29,-0.176],0.66);
  add(ctx,root,G.rbox(0.24,0.02,0.015,0.004),[0,0.26,-0.168],0.88);
  add(ctx,root,G.box(0.28,0.016,0.012),[0,0.055,0.154],0.3);
  for(const x of [-0.13,0.13])add(ctx,root,G.cyl(0.008,0.008,0.28,18),[x,0.066,0.04],0.52,[90,0,0]);
  faceBox(ctx,root,0.035,0.02,0.004,0.156,0.255,0.159,0.14);
  const power=led(ctx,root,0.175,0.264,0.158,0.002,'print');
  const sheet=group();sheet.position.set(0,0.119,0.153);root.add(sheet);
  sheet.add(ctx.mesh(at(G.box(0.21,0.001,0.27),[0,0,0]),{tone:0.98}));
  for(let i=0;i<9;i++)sheet.add(ctx.mesh(at(G.box(0.15,0.0007,0.001),[0,0.001,-0.09+i*0.022]),{tone:0.5}));
  return {root,grounded:true,update(c,t){const p=clamp(c.print??0);sheet.position.z=0.153+0.12*p*((t*0.5)%1);sheet.position.y=0.119+0.014*p*((t*0.5)%1);power.visible=p>0.02;}};
 },
});

export const printer3d=defineModel({
 id:'3d-printer',aliases:['desktop-3d-printer','fused-filament-printer','additive-printer'],
 describe:'An open-frame Cartesian 3D printer with four uprights, top crossbars, moving X gantry, print head and nozzle, textured build plate and a small ribbed printed part. progress raises the part one visible layer at a time.',
 controls:{progress:'0 empty bed .. 1 finished print',print:'0 stopped .. 1 active head motion'},defaults:{progress:0.45,print:0},size:'0.45 m tall',
 build(ctx){
  const root=new THREE.Group(),bedY=0.18;
  for(const x of [-0.19,0.19])for(const z of [-0.17,0.17]){
   add(ctx,root,G.box(0.018,0.43,0.018),[x,0.225,z],0.82);
  }
  for(const y of [0.04,0.41])for(const z of [-0.17,0.17])add(ctx,root,G.box(0.4,0.018,0.018),[0,y,z],0.88);
  for(const y of [0.04,0.41])for(const x of [-0.19,0.19])add(ctx,root,G.box(0.018,0.018,0.35),[x,y,0],0.72);
  panel(ctx,root,0.33,0.018,0.29,[0,bedY,0],0.58);
  add(ctx,root,G.rbox(0.27,0.012,0.23,0.004),[0,bedY+0.015,0],0.91);
  const gantry=group();gantry.position.set(0,0.35,0);root.add(gantry);
  gantry.add(ctx.mesh(at(G.box(0.36,0.014,0.024),[0,0,0]),{tone:0.62}));
  const head=group();head.position.set(0,0,0.015);gantry.add(head);
  head.add(ctx.mesh(at(G.rbox(0.062,0.054,0.05,0.008),[0,-0.035,0]),{tone:0.83}));
  head.add(ctx.mesh(at(G.cone(0.009,0.028,16),[0,-0.076,0],[0,0,0]),{tone:0.94}));
  add(ctx,root,G.rbox(0.18,0.11,0.17,0.02),[0,0.26,0],0.43);
  const layers:THREE.Mesh[]=[];
  for(let i=0;i<12;i++){
   const z=0.026;
   const m=ctx.mesh(at(G.rbox(0.025+i*0.002,0.012,0.025+i*0.001,0.004),[0,bedY+0.03+i*0.012,z]),{tone:0.85});root.add(m);layers.push(m);
  }
  return {root,grounded:true,update(c,t){const p=clamp(c.progress??0.45),run=clamp(c.print??0);for(let i=0;i<layers.length;i++)layers[i]!.visible=p>(i+1)/layers.length;gantry.position.x=run*(0.105*Math.sin(t*3));gantry.position.y=0.35+run*(0.008*Math.sin(t*9));head.position.z=0.015+run*0.08*Math.cos(t*2);}};
 },
});

export const mainframeComputer=defineModel({
 id:'mainframe-computer',aliases:['room-sized-computer','early-computer','mainframe-room'],
 describe:'A row of early room-sized computer cabinets with switch panels, punched-card slots, wire bundles and prominent magnetic tape reels on open front bays. compute spins the reels and sweeps a bank of status lamps.',
 controls:{compute:'0 idle .. 1 processing job'},defaults:{compute:0.25},size:'3 m cabinet row',
 build(ctx){
  const root=new THREE.Group(),reels:THREE.Group[]=[],lamps:THREE.Mesh[]=[];
  for(let i=0;i<3;i++){
   const x=(i-1)*0.82;
   panel(ctx,root,0.76,2.15,0.67,[x,1.075,-0.02],0.62);
   faceBox(ctx,root,0.68,1.99,0.016,x,1.08,0.327,0.28);
   for(let row=0;row<4;row++){
    const y=1.69-row*0.36;
    faceBox(ctx,root,0.59,0.29,0.012,x,y,0.339,0.48);
    if(row<2){
     for(const s of [-1,1]){
      const reel=group();reel.position.set(x+s*0.16,y,0.35);root.add(reel);reels.push(reel);
      reel.add(ctx.mesh(at(G.cyl(0.102,0.102,0.018,48),[0,0,0],[90,0,0]),{tone:0.84}));
      reel.add(ctx.mesh(at(G.torus(0.083,0.004,10,48),[0,0.011,0]),{tone:0.3}));
      reel.add(ctx.mesh(at(G.cyl(0.023,0.023,0.024,32),[0,0.014,0]),{tone:0.68}));
      for(let k=0;k<8;k++){const a=k*Math.PI/4;reel.add(ctx.mesh(at(G.box(0.004,0.058,0.003),[Math.cos(a)*0.052,Math.sin(a)*0.052,0.016],[0,0,k*45]),{tone:0.95}));}
     }
     root.add(ctx.mesh(G.tube([[x-0.16,y,0.37],[x-0.12,y-0.11,0.38],[x,y-0.14,0.38],[x+0.13,y-0.12,0.38],[x+0.16,y,0.37]],0.0016,32,8),{tone:0.96}));
    }else{
     for(let k=0;k<8;k++){
      add(ctx,root,G.box(0.038,0.065,0.009),[x-0.23+k*0.066,y,0.349],0.16);
      const m=ctx.mesh(at(G.sphere(0.004,10,8),[x-0.22+k*0.066,y+0.1,0.352]),{tone:1,glow:1.5,glowControl:'compute'});root.add(m);lamps.push(m);
     }
    }
   }
   for(let k=0;k<5;k++)add(ctx,root,G.box(0.08,0.004,0.005),[x,0.12+k*0.025,0.34],0.75);
  }
  add(ctx,root,G.box(2.65,0.09,0.72),[0,2.2,-0.02],0.86);
  add(ctx,root,G.box(2.65,0.07,0.72),[0,0.035,-0.02],0.48);
  const cable=ctx.mesh(G.tube([[-0.65,0.12,0.35],[-0.78,0.04,0.25],[-0.6,0.02,0.1],[0,0.02,0.08],[0.6,0.02,0.1],[0.78,0.04,0.25],[0.65,0.12,0.35]],0.012,48,10),{tone:0.24});root.add(cable);
  return {root,grounded:true,update(c,t){const q=clamp(c.compute??0.25);for(let i=0;i<reels.length;i++)reels[i]!.rotation.z=t*(2+20*q);for(let i=0;i<lamps.length;i++)lamps[i]!.visible=q>0.03&&Math.sin(t*5+i*1.3)>-0.6;}};
 },
});

export const ramStick=defineModel({
 id:'ram-stick',aliases:['memory-stick','dimm-memory','ram-module'],
 describe:'A desktop DIMM memory module with a long dark green PCB, eight raised memory chips, a notched gold contact comb and a small activity LED. activity pulses along the chip row.',
 controls:{activity:'0 idle .. 1 memory traffic'},defaults:{activity:0},size:'0.13 m long',
 build(ctx){
  const root=new THREE.Group(),w=0.133,h=0.03,d=0.004;
  panel(ctx,root,w,h,d,[0,h/2,0],0.48);
  for(let i=0;i<8;i++){
   const x=-0.055+i*0.0155;
   add(ctx,root,G.rbox(0.011,0.018,0.005,0.002),[x,0.019,d/2+0.003],0.83);
   add(ctx,root,G.box(0.001,0.014,0.001),[x,0.019,d/2+0.006],0.26);
  }
  const contacts:THREE.BufferGeometry[]=[];
  for(let i=0;i<26;i++){
   const x=-0.063+i*0.005;
   if(i!==12&&i!==13)contacts.push(at(G.box(0.0032,0.006,0.001),[x,0.003,d/2+0.001]));
  }
  root.add(ctx.mesh(G.merge(contacts),{tone:0.96}));
  const activity=led(ctx,root,0.059,0.027,d/2+0.004,0.002,'activity');
  for(const x of [-0.06,0.06])add(ctx,root,G.cyl(0.0017,0.0017,0.001,12),[x,0.027,d/2+0.002],0.92);
  return {root,grounded:true,update(c,t){const a=clamp(c.activity??0);activity.visible=a>0.03&&Math.sin(t*10)>-0.6;}};
 },
});

export const fibreOpticBundle=defineModel({
 id:'fibre-optic-bundle',aliases:['fiber-optic-bundle','fiber-optic-cable','optical-fiber'],
 describe:'A cutaway bundle of fine fibre-optic strands fans out from a protective black jacket, each strand ending in a bright polished ferrule and a distinct glowing glass core. signal sends light pulses down the fibres.',
 controls:{signal:'0 dark .. 1 active light transmission'},defaults:{signal:0.8},size:'0.35 m display length',
 build(ctx){
  const root=new THREE.Group(),strands:THREE.Mesh[]=[];
  add(ctx,root,G.cyl(0.071,0.071,0.1,40),[0,-0.015,-0.12],0.42,[90,0,0]);
  add(ctx,root,G.torus(0.068,0.006,12,40),[0,-0.015,-0.066],0.86);
  const colors=[0.95,0.84,0.72,1,0.9,0.78,0.96];
  for(let i=0;i<7;i++){
   const a=i*Math.PI*2/7,x=Math.cos(a)*0.08,z=Math.sin(a)*0.08;
   const path:[[number,number,number],[number,number,number],[number,number,number],[number,number,number]]=[
    [Math.cos(a)*0.028,-0.015,-0.09],[Math.cos(a)*0.035,-0.005,-0.02],[x*0.72,0.025,z*0.72],[x,0.085,z]
   ];
   const strand=ctx.mesh(G.tube(path,0.003,42,8),{tone:colors[i]!,glow:1.8,glowControl:'signal'});root.add(strand);strands.push(strand);
   add(ctx,root,G.cyl(0.008,0.008,0.026,20),[x*0.92,0.085,z*0.92],0.82,[90,0,0]);
   add(ctx,root,G.sphere(0.006,16,10),[x,0.085,z],1);
  }
  return {root,grounded:false,update(c,t){const q=clamp(c.signal??0.8);for(let i=0;i<strands.length;i++){const m=strands[i]!;m.visible=q>0.01;(m.material as THREE.MeshStandardMaterial).emissiveIntensity=0.2+1.8*q*(0.7+0.3*Math.sin(t*5-i));}}};
 },
});

export const smartSpeaker=defineModel({
 id:'smart-speaker',aliases:['voice-assistant-speaker','smart-home-speaker','voice-speaker'],
 describe:'A fabric-wrapped smart speaker cylinder with a perforated acoustic grille, smooth top touch surface, four microphone buttons, a luminous 360-degree light ring and a small mute switch. listen animates the ring as it hears speech.',
 controls:{listen:'0 standby .. 1 listening',volume:'0 silent .. 1 loud'},defaults:{listen:0,volume:0.35},size:'0.09 m tall',
 build(ctx){
  const root=new THREE.Group(),r=0.047,h=0.17;
  add(ctx,root,G.lathe([[0,0],[r-0.006,0],[r,0.009],[r,h-0.012],[r-0.004,h],[0,h]],56),[0,0,0],0.48);
  const ribs:THREE.BufferGeometry[]=[];
  for(let i=0;i<44;i++){const a=i*Math.PI*2/44;ribs.push(at(G.box(0.0011,h*0.8,0.001),[Math.cos(a)*(r+0.0002),h*0.5,Math.sin(a)*(r+0.0002)],[0,-a*180/Math.PI,0]));}
  root.add(ctx.mesh(G.merge(ribs),{tone:0.72}));
  add(ctx,root,G.cyl(0.044,0.044,0.004,48),[0,h-0.002,0],0.86);
  const ring=ctx.mesh(at(G.torus(0.039,0.0028,10,64),[0,h+0.001,0],[90,0,0]),{tone:1,glow:2.4,glowControl:'listen'});root.add(ring);
  add(ctx,root,G.torus(0.025,0.001,8,40),[0,h+0.003,0],0.52,[90,0,0]);
  for(let i=0;i<4;i++){const a=i*Math.PI/2;add(ctx,root,G.sphere(0.003,12,8),[Math.cos(a)*0.017,h+0.004,Math.sin(a)*0.017],0.3);}
  const mute=add(ctx,root,G.rbox(0.012,0.003,0.006,0.001),[0,h*0.57,r-0.002],0.88);
  return {root,grounded:true,update(c,t){const l=clamp(c.listen??0),v=clamp(c.volume??0.35);ring.scale.setScalar(1+0.06*l*Math.sin(t*8));(ring.material as THREE.MeshStandardMaterial).emissiveIntensity=0.2+0.9*l+0.2*v;mute.visible=true;}};
 },
});

export const securityCamera=defineModel({
 id:'security-camera',aliases:['cctv-camera','surveillance-camera','dome-camera'],
 describe:'A wall-mounted bullet security camera with a bolted mounting plate, adjustable arm, sun hood, glass lens, infrared LED ring and articulated swivel joint. pan sweeps the camera across its monitored area.',
 controls:{pan:'0 left .. 1 right',night:'0 daylight .. 1 infrared night mode'},defaults:{pan:0.5,night:0},size:'0.28 m long',
 build(ctx){
  const root=new THREE.Group();
  panel(ctx,root,0.09,0.14,0.018,[0,0.72,-0.15],0.7);
  for(let i=0;i<4;i++)add(ctx,root,G.cyl(0.006,0.006,0.005,12),[-0.03+(i%2)*0.06,0.67+Math.floor(i/2)*0.1,-0.138],0.94,[90,0,0]);
  root.add(ctx.mesh(G.tube([[0,0.72,-0.14],[0,0.82,-0.1],[0,0.83,-0.03]],0.014,18,12),{tone:0.62}));
  const joint=group();joint.position.set(0,0.83,-0.03);root.add(joint);
  joint.add(ctx.mesh(at(G.sphere(0.025,20,14),[0,0,0]),{tone:0.88}));
  const cam=group();cam.position.set(0,0.01,0.05);joint.add(cam);
  cam.add(ctx.mesh(at(G.rbox(0.115,0.083,0.19,0.025),[0,0,0]),{tone:0.72}));
  add(ctx,cam,G.rbox(0.132,0.013,0.19,0.006),[0,0.048,0.006],0.86);
  frontCylinder(ctx,cam,0.032,0.01,0,0,0.099,0.18);
  faceRing(ctx,cam,0.034,0.004,0,0,0.107,0.92);
  const iris=frontCylinder(ctx,cam,0.019,0.008,0,0,0.11,0.12);
  faceRing(ctx,cam,0.022,0.002,0,0,0.116,0.62);
  const ir:THREE.Mesh[]=[];
  for(let i=0;i<8;i++){const a=i*Math.PI/4,m=ctx.mesh(at(G.sphere(0.003,10,8),[Math.cos(a)*0.043,Math.sin(a)*0.03,0.115]),{tone:1,glow:1.6,glowControl:'night'});cam.add(m);ir.push(m);}
  return {root,grounded:true,update(c){joint.rotation.y=deg(50*(clamp(c.pan??0.5)-0.5));iris.scale.setScalar(1+0.12*clamp(c.night??0));}};
 },
});

export const barcodeScanner=defineModel({
 id:'barcode-scanner',aliases:['handheld-barcode-reader','barcode-reader','laser-scanner'],
 describe:'A pistol-grip retail barcode scanner with an angled scan head, glossy red scanning window, trigger, hand grip, top status lights and a barcode printed along the side. scan sweeps a visible red beam across a product.',
 controls:{scan:'0 idle .. 1 active scan'},defaults:{scan:0},size:'0.18 m tall',
 build(ctx){
  const root=new THREE.Group();
  const head=ctx.mesh(at(G.rbox(0.12,0.076,0.095,0.025),[0,0.145,0]),{tone:0.65});root.add(head);
  add(ctx,root,G.capsule(0.023,0.097,6,16),[0,0.065,-0.012],0.88,[0,0,-12]);
  add(ctx,root,G.rbox(0.018,0.028,0.014,0.005),[0,0.087,0.026],0.9);
  const window=add(ctx,root,G.rbox(0.078,0.044,0.004,0.01),[0,0.154,0.05],0.12);
  add(ctx,root,G.torus(0.039,0.002,8,36),[0,0.154,0.053],0.86);
  for(let i=0;i<8;i++)add(ctx,root,G.box(0.002,0.035,0.002),[-0.037+i*0.01,0.145,-0.049],0.92);
  const beam=ctx.mesh(G.plane(0.18,0.24),{tone:1,glow:2.8,glowControl:'scan',side:THREE.DoubleSide});beam.position.set(0,0.11,0.19);beam.rotation.x=deg(-25);root.add(beam);
  const status=led(ctx,root,0.044,0.18,0.006,0.002,'scan');
  return {root,grounded:true,update(c,t){const a=clamp(c.scan??0);beam.visible=a>0.02;beam.rotation.y=0.3*Math.sin(t*6)*a;window.scale.x=1+0.08*a;status.visible=a>0.05;}};
 },
});

export const atmMachine=defineModel({
 id:'atm-machine',aliases:['cash-machine','bank-machine','automatic-teller'],
 describe:'A full-height ATM cabinet with a deep privacy hood around its screen, tactile keypad, card slot, receipt outlet, cash dispenser and side security camera. transact illuminates the screen and dispenses a banknote.',
 controls:{transact:'0 idle .. 1 transaction in progress',cash:'0 empty .. 1 dispense'},defaults:{transact:0,cash:0},size:'1.5 m tall',
 build(ctx){
  const root=new THREE.Group(),w=0.57,d=0.42;
  panel(ctx,root,w,1.48,d,[0,0.74,0],0.68);
  add(ctx,root,G.rbox(w+0.025,0.09,d+0.02,0.02),[0,1.51,0],0.84);
  faceBox(ctx,root,0.39,0.32,0.035,0,1.17,d/2+0.012,0.55);
  const screen=ctx.mesh(at(G.rbox(0.33,0.25,0.006,0.002),[0,1.17,d/2+0.034]),{tone:0.36,glow:1,glowControl:'transact'});root.add(screen);
  for(const s of [-1,1])add(ctx,root,G.box(0.035,0.28,0.045),[s*0.205,1.17,d/2+0.02],0.62);
  for(let row=0;row<4;row++)for(let col=0;col<3;col++){
   const x=0.085+col*0.055,y=0.86-row*0.055;
   add(ctx,root,G.rbox(0.042,0.033,0.014,0.005),[x,y,d/2+0.025],0.91);
   add(ctx,root,G.box(0.018,0.002,0.002),[x,y,d/2+0.034],0.2);
  }
  add(ctx,root,G.rbox(0.11,0.008,0.026,0.003),[-0.128,0.86,d/2+0.022],0.16);
  add(ctx,root,G.box(0.075,0.006,0.028),[-0.12,0.67,d/2+0.02],0.22);
  add(ctx,root,G.rbox(0.28,0.06,0.08,0.015),[0,0.47,d/2+0.018],0.51);
  const note=group();note.position.set(0,0.5,d/2+0.045);root.add(note);
  note.add(ctx.mesh(at(G.box(0.16,0.001,0.065),[0,0,0]),{tone:0.95}));
  for(let i=0;i<5;i++)note.add(ctx.mesh(at(G.box(0.1,0.0007,0.001),[0,0.001,-0.025+i*0.012]),{tone:0.45}));
  const receipt=add(ctx,root,G.box(0.09,0.001,0.12),[0.18,0.69,d/2+0.055],0.95);
  const camera=frontCylinder(ctx,root,0.006,0.003,0.24,1.4,d/2+0.014,0.16);
  const lamp=led(ctx,root,0,1.34,d/2+0.038,0.002,'transact');
  return {root,grounded:true,update(c,t){const a=clamp(c.transact??0),cash=clamp(c.cash??0);(screen.material as THREE.MeshStandardMaterial).emissiveIntensity=0.08+0.5*a;note.position.y=0.5+0.12*cash*((t*0.5)%1);note.visible=cash>0.02;receipt.scale.y=1+2*a;lamp.visible=a>0.05;camera.scale.setScalar(1+0.1*a);}};
 },
});

export const tablet=defineModel({
 id:'tablet',aliases:['tablet-computer','ipad','touch-tablet'],
 describe:'A slim 10-inch tablet with a broad edge-to-edge glass display, chamfered aluminum rim, front camera, subtle home sensor, twin speakers and two slim side controls. brightness controls the screen and touch ripples across the glass.',
 controls:{brightness:'0 dark .. 1 bright (default 0.75)',touch:'0 idle .. 1 tap'},defaults:{brightness:0.75,touch:0},size:'0.25 m tall',
 build(ctx){
  const root=new THREE.Group(),w=0.19,h=0.26,d=0.009;
  panel(ctx,root,w,h,d,[0,h/2,0],0.76);
  faceBox(ctx,root,w-0.014,h-0.018,0.0015,0,h/2,d/2+0.001,0.13);
  const screen=ctx.mesh(at(G.rbox(w-0.025,h-0.03,0.001,0.0004),[0,h/2,d/2+0.002]),{tone:0.42,glow:0.7,glowControl:'brightness'});root.add(screen);
  led(ctx,root,0,h-0.009,d/2+0.003,0.0016,'brightness');
  add(ctx,root,G.torus(0.004,0.0007,8,24),[0,0.012,d/2+0.002],0.86);
  for(const s of [-1,1])for(let i=0;i<6;i++)add(ctx,root,G.box(0.002,0.002,0.001),[s*0.08,0.021+i*0.004,d/2+0.002],0.5);
  for(const s of [-1,1])add(ctx,root,G.rbox(0.0025,0.022,0.003,0.001),[s*(w/2+0.001),0.225,0],0.87);
  const ripple=ctx.mesh(at(G.torus(0.01,0.001,8,36),[0.038,0.125,d/2+0.003]),{tone:1,glow:1.3,glowControl:'_touch'});root.add(ripple);
  return {root,grounded:true,anchors:{screen:[0,h/2,d/2]},update(c){const b=clamp(c.brightness??0.75),tap=clamp(c.touch??0);(screen.material as THREE.MeshStandardMaterial).emissiveIntensity=0.08+0.45*b;ripple.visible=tap>0.02;ripple.scale.setScalar(0.5+1.6*tap);}};
 },
});

export const ethernetSwitch=defineModel({
 id:'ethernet-switch',aliases:['network-switch','ethernet-hub','rack-switch'],
 describe:'A rack-mount Ethernet switch with a ventilated 1U steel chassis, twelve square RJ45 ports, paired link and activity LEDs, two fiber uplinks, rack ears and a recessed reset button. traffic animates link lights.',
 controls:{traffic:'0 idle .. 1 network traffic'},defaults:{traffic:0.45},size:'0.44 m wide',
 build(ctx){
  const root=new THREE.Group(),linkLights:THREE.Mesh[]=[],activityLights:THREE.Mesh[]=[],w=0.44,h=0.044,d=0.21;
  panel(ctx,root,w,h,d,[0,h/2,0],0.62);
  add(ctx,root,G.box(0.026,h+0.012,0.018),[-w/2-0.013,h/2,0.015],0.85);
  add(ctx,root,G.box(0.026,h+0.012,0.018),[w/2+0.013,h/2,0.015],0.85);
  for(let i=0;i<12;i++){
   const x=-0.18+i*0.032;
   faceBox(ctx,root,0.025,0.018,0.004,x,0.027,d/2+0.004,0.13);
   add(ctx,root,G.box(0.018,0.003,0.002),[x,0.026,d/2+0.007],0.72);
   const m=ctx.mesh(at(G.sphere(0.0018,10,8),[x-0.006,0.042,d/2+0.004]),{tone:1,glow:1.3,glowControl:'traffic'});root.add(m);linkLights.push(m);
   const n=ctx.mesh(at(G.sphere(0.0018,10,8),[x+0.006,0.042,d/2+0.004]),{tone:0.7,glow:1.3,glowControl:'traffic'});root.add(n);activityLights.push(n);
  }
  for(const x of [-0.17,-0.13])faceRing(ctx,root,0.005,0.001,x,0.02,d/2+0.004,0.9);
  for(let i=0;i<8;i++)add(ctx,root,G.box(0.001,0.004,0.001),[-0.19+i*0.018,0.004,-0.09],0.83);
  return {root,grounded:true,update(c,t){const a=clamp(c.traffic??0.45);for(let i=0;i<linkLights.length;i++){linkLights[i]!.visible=a>0.02;activityLights[i]!.visible=a>0.02&&Math.sin(t*13+i*1.8)<-0.05;}}};
 },
});

export const projector=defineModel({
 id:'projector',aliases:['video-projector','digital-projector','beamer'],
 describe:'A tabletop video projector with a stepped optical lens barrel, concentric glass rings, focus controls, top cooling vents, rear connection panel and four rubber feet. power wakes the lens and projects a glowing beam.',
 controls:{power:'0 off .. 1 projecting',focus:'0 soft .. 1 sharp'},defaults:{power:0,focus:0.7},size:'0.32 m wide',
 build(ctx){
  const root=new THREE.Group();
  panel(ctx,root,0.32,0.12,0.25,[0,0.15,0],0.7);
  add(ctx,root,G.rbox(0.28,0.035,0.19,0.018),[0,0.225,-0.015],0.85);
  const lens=group();lens.position.set(0,0.163,0.128);root.add(lens);
  for(const [r,depth,tone] of [[0.05,0.014,0.5],[0.043,0.012,0.89],[0.034,0.008,0.55],[0.026,0.006,0.9],[0.02,0.004,0.14]] as [number,number,number][]){
   lens.add(ctx.mesh(at(G.cyl(r,r,depth,48),[0,0,0],[90,0,0]),{tone}));
   lens.add(ctx.mesh(at(G.torus(r-depth/2,0.002,8,40),[0,0,depth/2+0.001]),{tone:0.95}));
  }
  const glass=ctx.mesh(at(G.cyl(0.016,0.016,0.004,36),[0,0,0.008],[90,0,0]),{tone:0.25,glow:1.4,glowControl:'power'});lens.add(glass);
  for(let i=0;i<12;i++)add(ctx,root,G.box(0.008,0.002,0.001),[-0.12+i*0.022,0.237,-0.045],0.34);
  faceBox(ctx,root,0.08,0.032,0.004,0.102,0.191,0.127,0.15);
  for(let i=0;i<4;i++)add(ctx,root,G.box(0.015,0.006,0.004),[-0.11+i*0.026,0.14,-0.13],0.91);
  for(const x of [-0.12,0.12])for(const z of [-0.085,0.085])add(ctx,root,G.cyl(0.012,0.012,0.09,18),[x,0.045,z],0.42);
  const beam=ctx.mesh(G.cone(0.092,0.48,32),{tone:0.92,glow:1.6,glowControl:'power'});beam.position.set(0,0.16,0.39);beam.rotation.x=-Math.PI/2;root.add(beam);
  const lamp=led(ctx,root,0.129,0.214,0.091,0.002,'power');
  return {root,grounded:true,update(c,t){const p=clamp(c.power??0),f=clamp(c.focus??0.7);beam.visible=p>0.02;beam.scale.set(0.55+0.55*f,1,0.55+0.55*f);beam.rotation.z=0.012*Math.sin(t*0.7)*p;lamp.visible=p>0.05;(glass.material as THREE.MeshStandardMaterial).emissiveIntensity=0.2+1.3*p;}};
 },
});

export const computerTower=defineModel({
 id:'computer-tower',aliases:['desktop-tower','pc-tower','gaming-pc'],
 describe:'A modern desktop PC tower with a ventilated front mesh, tempered-glass side window, visible internal motherboard and two illuminated case fans, rear expansion slots, feet and a top power button. load spins the cooling fans and pulses the power light.',
 controls:{load:'0 idle .. 1 heavy processing'},defaults:{load:0.3},size:'0.44 m tall',
 build(ctx){
  const root=new THREE.Group(),w=0.2,h=0.44,d=0.39;
  panel(ctx,root,w,h,d,[0,h/2,0],0.58);
  faceBox(ctx,root,w-0.014,h-0.022,0.012,0,h/2,d/2+0.008,0.33);
  for(let i=0;i<22;i++)add(ctx,root,G.box(w-0.055,0.0014,0.001),[0,0.035+i*0.008,d/2+0.016],0.79);
  // Transparent side window with the graphics card and two cooling fans visible through it.
  add(ctx,root,G.rbox(0.012,h-0.055,d-0.06,0.008),[w/2+0.004,h/2,-0.012],0.48);
  add(ctx,root,G.rbox(0.003,0.25,0.21,0.006),[w/2+0.012,0.25,-0.025],0.66);
  const fans:THREE.Group[]=[],frontFans:THREE.Group[]=[];
  for(const z of [-0.105,0.095]){
   const fan=group();fan.position.set(w/2+0.018,0.30,z);root.add(fan);fans.push(fan);
   fan.add(ctx.mesh(at(G.torus(0.05,0.004,10,40),[0,0,0],[0,90,0]),{tone:1,glow:0.7,glowControl:'load'}));
   fan.add(ctx.mesh(at(G.cyl(0.044,0.044,0.004,36),[0,0,0],[0,0,90]),{tone:0.34}));
   fan.add(ctx.mesh(at(G.cyl(0.012,0.012,0.008,24),[0,0,0.003]),{tone:0.72}));
   for(let i=0;i<7;i++){
    const a=i*Math.PI*2/7;
    const blade=ctx.mesh(at(G.rbox(0.006,0.002,0.025,0.001),[Math.cos(a)*0.026,Math.sin(a)*0.026,0.005],[0,0,i*360/7+18]),{tone:0.83});fan.add(blade);
   }
  }
  for(const y of [0.14,0.27]){
   const fan=group();fan.position.set(0,y,d/2+0.019);root.add(fan);frontFans.push(fan);
   fan.add(ctx.mesh(at(G.torus(0.046,0.003,10,40),[0,0,0]),{tone:1,glow:0.65,glowControl:'load'}));
   fan.add(ctx.mesh(at(G.cyl(0.041,0.041,0.003,36),[0,0,0]),{tone:0.24}));
   fan.add(ctx.mesh(at(G.cyl(0.009,0.009,0.004,24),[0,0,0.002]),{tone:0.8}));
   for(let i=0;i<7;i++){
    const a=i*Math.PI*2/7;
    fan.add(ctx.mesh(at(G.rbox(0.006,0.002,0.021,0.001),[Math.cos(a)*0.023,Math.sin(a)*0.023,0.003],[0,0,i*360/7+18]),{tone:0.88}));
   }
  }
  for(let i=0;i<3;i++)add(ctx,root,G.box(0.005,0.075,0.008),[0.04+i*0.018,0.14,0.08],0.9);
  add(ctx,root,G.box(0.06,0.012,0.11),[0.034,0.31,-0.025],0.74);
  add(ctx,root,G.box(0.006,0.34,0.012),[0.105,0.21,0.08],0.87);
  for(let i=0;i<4;i++)add(ctx,root,G.cyl(0.004,0.004,0.002,12),[0.105,0.045+i*0.02,-0.13],0.92,[90,0,0]);
  add(ctx,root,G.cyl(0.008,0.008,0.004,18),[0.075,h-0.007,d/2+0.017],0.82);
  const power=led(ctx,root,0.055,h-0.008,d/2+0.018,0.002,'load');
  for(const x of [-0.075,0.075])for(const z of [-0.15,0.15])add(ctx,root,G.rbox(0.055,0.018,0.07,0.006),[x,0.01,z],0.38);
  return {root,grounded:true,update(c,t){const p=clamp(c.load??0.3);for(let i=0;i<fans.length;i++)fans[i]!.rotation.x=t*(3+60*p);for(let i=0;i<frontFans.length;i++)frontFans[i]!.rotation.z=t*(3+60*p);power.visible=p>0.02;}};
 },
});

export const humanoidRobot=defineModel({
 id:'humanoid-robot',aliases:['android','humanoid','bipedal-robot'],
 describe:'A compact humanoid robot with a domed sensor head, dark face screen and two bright eyes, ribbed neck, articulated shoulder and hip joints, plated torso, hands and broad feet. wave raises one arm and the head tracks gently.',
 controls:{wave:'0 arm down .. 1 wave',look:'0 forward .. 1 scan side to side'},defaults:{wave:0,look:0},size:'1.6 m tall',
 poses:['stand'],
 build(ctx){
  const root=new THREE.Group();
  panel(ctx,root,0.46,0.48,0.25,[0,1.03,0],0.8);
  add(ctx,root,G.rbox(0.35,0.12,0.12,0.025),[0,1.29,0],0.94);
  add(ctx,root,G.rbox(0.35,0.13,0.12,0.025),[0,0.78,0],0.6);
  add(ctx,root,G.cyl(0.11,0.12,0.12,28),[0,1.36,0],0.58);
  const head=group();head.position.set(0,1.52,0);root.add(head);
  head.add(ctx.mesh(at(G.rbox(0.3,0.25,0.24,0.07),[0,0,0]),{tone:0.85}));
  head.add(ctx.mesh(at(G.rbox(0.23,0.105,0.015,0.025),[0,0.005,0.128]),{tone:0.14}));
  for(const x of [-0.063,0.063]){
   const eye=ctx.mesh(at(G.sphere(0.025,18,12),[x,0.01,0.141]),{tone:1,glow:1.6,glowControl:'look'});head.add(eye);
  }
  add(ctx,head,G.box(0.045,0.004,0.005),[0,-0.035,0.14],0.56);
  for(const s of [-1,1]){
   for(let i=0;i<3;i++)add(ctx,root,G.torus(0.066-i*0.006,0.003,8,24),[0,1.39+i*0.018,0],0.9);
   add(ctx,root,G.sphere(0.074,20,14),[s*0.27,1.25,0],0.72);
   const arm=group();arm.position.set(s*0.29,1.23,0);root.add(arm);
   arm.add(ctx.mesh(at(G.capsule(0.047,0.24,6,14),[s*0.01,-0.155,0],[0,0,s*8]),{tone:0.82}));
   arm.add(ctx.mesh(at(G.sphere(0.054,18,12),[s*0.015,-0.31,0]),{tone:0.65}));
   arm.add(ctx.mesh(at(G.capsule(0.035,0.19,6,12),[s*0.02,-0.44,0],[0,0,s*-6]),{tone:0.88}));
   arm.add(ctx.mesh(at(G.rbox(0.063,0.055,0.07,0.018),[s*0.02,-0.565,0.012]),{tone:0.92}));
   for(let i=0;i<3;i++)arm.add(ctx.mesh(at(G.capsule(0.008,0.027,4,8),[s*0.02+(i-1)*0.018,-0.602,0.03]),{tone:0.7}));
   const leg=group();leg.position.set(s*0.13,0.63,0);root.add(leg);
   leg.add(ctx.mesh(at(G.capsule(0.062,0.3,6,16),[0,-0.12,0]),{tone:0.76}));
   leg.add(ctx.mesh(at(G.sphere(0.064,18,12),[0,-0.32,0]),{tone:0.61}));
   leg.add(ctx.mesh(at(G.capsule(0.055,0.22,6,16),[0,-0.46,0]),{tone:0.84}));
   leg.add(ctx.mesh(at(G.rbox(0.14,0.075,0.22,0.025),[0,-0.59,0.045]),{tone:0.68}));
   if(s===1)(root.userData as {wave?:THREE.Group}).wave=arm;
  }
  const arm=(root.userData as {wave?:THREE.Group}).wave!;
  return {root,grounded:true,update(c,t){const w=clamp(c.wave??0),look=clamp(c.look??0);arm.rotation.z=-0.95*w+0.16*w*Math.sin(t*7);head.rotation.y=0.38*look*Math.sin(t*1.4);}};
 },
});
