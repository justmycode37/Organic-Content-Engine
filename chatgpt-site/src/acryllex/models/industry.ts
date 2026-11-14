// Tools, construction and heavy-industry models for ACRYLLEX.
import * as THREE from 'three';
import {G,at,deg,lerp,clamp} from '../kit.ts';
import {defineModel,type ModelCtx} from './types.ts';

type V3=[number,number,number];
const group=(...items:THREE.Object3D[])=>{const g=new THREE.Group();if(items.length)g.add(...items);return g;};
const add=(ctx:ModelCtx,p:THREE.Object3D,g:THREE.BufferGeometry,pos:V3=[0,0,0],rot:V3=[0,0,0],tone=0.8)=>{const m=ctx.mesh(at(g,pos,rot),{tone,rough:0.55});p.add(m);return m;};
const box=(ctx:ModelCtx,p:THREE.Object3D,size:V3,pos:V3,tone=0.8,r?:number)=>add(ctx,p,r===0?G.box(...size):G.rbox(...size,r??Math.min(...size)*0.12),pos,[0,0,0],tone);
const cylinder=(ctx:ModelCtx,p:THREE.Object3D,r:number,h:number,pos:V3,tone=0.8,seg=32,rot:V3=[0,0,0])=>add(ctx,p,G.cyl(r,r,h,seg),pos,rot,tone);
const tube=(ctx:ModelCtx,p:THREE.Object3D,pts:V3[],r:number,tone=0.8,seg=32)=>add(ctx,p,G.tube(pts,r,seg,8),[0,0,0],[0,0,0],tone);
const line=(ctx:ModelCtx,p:THREE.Object3D,a:V3,b:V3,r:number,tone=0.8)=>tube(ctx,p,[a,b],r,tone,6);
const wheel=(ctx:ModelCtx,p:THREE.Object3D,r:number,width:number,pos:V3,tone=0.38,spokes=8)=>{
 const g=new THREE.Group();g.position.set(...pos);p.add(g);
 add(ctx,g,G.torus(r-width*0.48,width*0.48,12,40),[0,0,0],[0,90,0],tone);
 cylinder(ctx,g,r*0.57,width*0.72,[0,0,0],0.68,24,[0,0,90]);
 for(let i=0;i<spokes;i++){const a=i/spokes*Math.PI*2;box(ctx,g,[r*0.66,width*0.15,r*0.085],[0,Math.sin(a)*r*0.28,Math.cos(a)*r*0.28],0.95,0.008).rotation.x=-a;}
 cylinder(ctx,g,r*0.15,width*0.9,[0,0,0],1,16,[0,0,90]);
 return g;
};
const gear=(ctx:ModelCtx,parent:THREE.Object3D,r:number,teeth:number,thick:number,pos:V3,tone=0.78)=>{
 const g=new THREE.Group();g.position.set(...pos);parent.add(g);
 add(ctx,g,G.lathe([[r*0.62,-thick/2],[r,-thick/2],[r,thick/2],[r*0.62,thick/2],[r*0.62,-thick/2]],teeth*3),[0,0,0],[0,0,0],tone);
 cylinder(ctx,g,r*0.34,thick*1.12,[0,0,0],0.95,24);
 for(let i=0;i<teeth;i++){const a=i/teeth*Math.PI*2;const tooth=box(ctx,g,[r*0.28,thick,r*0.115],[Math.cos(a)*(r+r*0.08),0,Math.sin(a)*(r+r*0.08)],tone,0.009);tooth.rotation.y=-a;}
 return g;
};
const rodBetween=(ctx:ModelCtx,p:THREE.Object3D,a:V3,b:V3,r:number,tone=0.8)=>{
 const d=new THREE.Vector3(b[0]-a[0],b[1]-a[1],b[2]-a[2]);const m=ctx.mesh(G.cyl(r,r,d.length(),12),{tone,rough:0.6});
 m.position.set((a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());p.add(m);return m;
};
const extruded=(ctx:ModelCtx,p:THREE.Object3D,outline:[number,number][],depth:number,pos:V3,tone=0.8,bevel=0.015)=>add(ctx,p,G.extrude(outline,depth,bevel),pos,[0,0,0],tone);

// ---------------------------------------------------------------- hand tools
export const hammer=defineModel({
 id:'hammer',aliases:['claw-hammer','carpenter-hammer','mallet','tool-hammer'],
 describe:'A steel claw hammer stands upright, with a split curved nail-pulling claw, polished striking face and ribbed rubber grip. The head rocks gently with swing.',
 controls:{swing:'0 idle .. 1 repeated hammer strike'},defaults:{swing:0},size:'0.33 m tall',
 build(ctx){
  const root=new THREE.Group(),tool=new THREE.Group();root.add(tool);
  box(ctx,tool,[0.055,0.24,0.065],[0,0.47,0],0.46,0.02);
  for(let y=0.29;y<0.49;y+=0.035)box(ctx,tool,[0.059,0.009,0.071],[0,y,0],0.86,0.003);
  const head:[number,number][]=[[-0.23,0.72],[-0.26,0.79],[-0.22,0.85],[-0.14,0.86],[-0.10,0.81],[-0.055,0.81],[-0.055,0.86],[0.18,0.86],[0.225,0.82],[0.225,0.68],[0.18,0.65],[0.035,0.65],[0.02,0.72],[-0.045,0.72],[-0.085,0.63],[-0.14,0.58],[-0.18,0.61],[-0.14,0.69]];
  extruded(ctx,tool,head,0.11,[0,0,0],0.96,0.012);
  box(ctx,tool,[0.015,0.14,0.125],[0.205,0.755,0],0.56,0.006);
  box(ctx,tool,[0.012,0.12,0.11],[-0.16,0.65,0],0.68,0.006);
  tool.scale.set(0.30,0.64,0.32);tool.position.y=-0.224;
  return {root,grounded:true,update(c,t){const s=clamp(c.swing??0);tool.rotation.z=Math.sin(t*8)*s*0.28;}};
 }
});

export const screwdriver=defineModel({
 id:'screwdriver',aliases:['driver','flathead','flat-head-screwdriver','phillips-screwdriver'],
 describe:'A long steel screwdriver has a tapered flat tip, round ferrule and thick faceted handle with a hanging hole. The shaft twists when turn is raised.',
 controls:{turn:'0..1 shaft rotation'},defaults:{turn:0},size:'0.28 m tall',
 build(ctx){
  const root=new THREE.Group(),spin=new THREE.Group();root.add(spin);
  add(ctx,spin,G.lathe([[0.002,0],[0.004,0.008],[0.006,0.025],[0.006,0.19],[0.008,0.205],[0.01,0.21],[0.01,0.224]],24),[0,0.17,0],[0,0,0],0.95);
  add(ctx,spin,G.lathe([[0.01,0.215],[0.024,0.215],[0.031,0.23],[0.032,0.26],[0.027,0.275]],24),[0,0.17,0],[0,0,0],0.58);
  add(ctx,spin,G.lathe([[0.018,0.23],[0.035,0.24],[0.047,0.27],[0.052,0.31],[0.05,0.38],[0.044,0.42],[0.025,0.44],[0.012,0.44],[0,0.435]],32),[0,0.17,0],[0,0,0],0.82);
  for(let y=0.29;y<0.41;y+=0.025){const rib=add(ctx,spin,G.torus(0.049,0.004,8,24),[0,y,0],[90,0,0],0.45);void rib;}
  cylinder(ctx,spin,0.012,0.025,[0,0.605,0],0.95,20);
  add(ctx,spin,G.torus(0.012,0.004,8,20),[0,0.627,0],[90,0,0],0.55);
  spin.scale.setScalar(0.612);spin.position.y=-0.104;
  return {root,grounded:true,update(c){spin.rotation.y=clamp(c.turn??0)*Math.PI*3;}};
 }
});

export const wrench=defineModel({
 id:'wrench',aliases:['spanner','open-end-wrench','adjustable-spanner','adjustable-wrench'],
 describe:'A forged open-end spanner has a long tapered handle, broad offset jaw with a clear U-shaped opening and a hanging hole in the grip. The handle turns.',
 controls:{turn:'0..1 rotate the wrench'},defaults:{turn:0},size:'0.26 m long',
 build(ctx){
  const root=new THREE.Group(),tool=new THREE.Group();root.add(tool);
  const o:[number,number][]=[[0.055,0.04],[-0.055,0.04],[-0.075,0.15],[-0.13,0.35],[-0.20,0.59],[-0.22,0.71],[-0.19,0.78],[-0.105,0.83],[-0.02,0.82],[0.025,0.76],[-0.04,0.70],[-0.10,0.69],[-0.12,0.65],[-0.09,0.60],[-0.025,0.42],[0.04,0.24],[0.085,0.12]];
  extruded(ctx,tool,o,0.035,[0,0,0],0.88,0.009);
  // Shallow inset on the handle and rounded jaw shoulders make the forged shape read in dither.
  cylinder(ctx,tool,0.022,0.008,[0,0.10,0.023],0.25,24,[90,0,0]);
  box(ctx,tool,[0.032,0.012,0.01],[-0.085,0.74,0.022],0.98,0.004);
  tool.scale.setScalar(0.33);tool.position.y=-0.0132;
  return {root,grounded:true,update(c){tool.rotation.z=clamp(c.turn??0)*Math.PI*2;}};
 }
});

export const handSaw=defineModel({
 id:'hand-saw',aliases:['handsaw','wood-saw','panel-saw','carpenter-saw'],
 describe:'A carpenter hand saw shows a broad tapered steel blade with a serrated tooth line and a raised pistol-grip handle with three finger openings. saw controls a short cutting stroke.',
 controls:{saw:'0 idle .. 1 cutting stroke'},defaults:{saw:0},size:'0.55 m long',
 build(ctx){
  const root=new THREE.Group(),blade=new THREE.Group();root.add(blade);
  extruded(ctx,blade,[[0.10,0.25],[0.47,0.26],[0.52,0.20],[0.45,-0.04],[0.22,-0.29],[0.08,-0.32]],0.018,[0,0,0],0.66,0.008);
  box(ctx,blade,[0.41,0.025,0.026],[0.28,0.236,0],0.95,0.006);
  for(let i=0;i<21;i++){
   const x=0.10+i*0.018,y=-0.32+(x-0.22)*(-0.25/0.23);
   extruded(ctx,blade,[[x,y],[x+0.018,y+0.012],[x+0.012,y-0.012]],0.022,[0,0,0],0.96,0);
  }
  const handle:[number,number][]=[[-0.20,0.24],[-0.08,0.20],[0.12,0.12],[0.16,0.05],[0.12,-0.11],[0.06,-0.17],[-0.12,-0.20],[-0.23,-0.15],[-0.27,-0.04],[-0.25,0.08]];
  const holes:[number,number][][]=[[[-0.16,0.12],[-0.11,-0.09],[-0.04,-0.11],[0.00,-0.03],[-0.035,0.12]],[[-0.20,0.06],[-0.16,-0.08],[-0.13,-0.07],[-0.10,0.12]]];
  add(ctx,blade,G.extrude(handle,0.065,0.014,holes),[0,0,0],[0,0,0],0.9);
  for(const x of [-0.16,-0.07,0.02])cylinder(ctx,blade,0.015,0.01,[x,0.04,0.038],0.52,16,[90,0,0]);
  blade.scale.setScalar(0.70);blade.position.y=0.224;
  return {root,grounded:true,update(c,t){blade.position.x=Math.sin(t*13)*clamp(c.saw??0)*0.016;}};
 }
});

export const powerDrill=defineModel({
 id:'power-drill',aliases:['electric-drill','cordless-drill','drill','drill-driver'],
 describe:'A cordless drill has a pistol grip, vented motor housing, trigger, battery pack, toothed chuck and a long bit pointing forward. bit spins the chuck and bit.',
 controls:{bit:'0 idle .. 1 fast bit rotation'},defaults:{bit:0},size:'0.28 m long',
 build(ctx){
  const root=new THREE.Group(),tool=new THREE.Group();root.add(tool);
  box(ctx,tool,[0.13,0.12,0.24],[0,0.53,-0.035],0.82,0.035);
  box(ctx,tool,[0.12,0.18,0.12],[0,0.44,0.07],0.9,0.035);
  box(ctx,tool,[0.085,0.25,0.095],[0,0.265,0.025],0.72,0.023);
  box(ctx,tool,[0.12,0.075,0.14],[0,0.12,0.015],0.88,0.018);
  box(ctx,tool,[0.075,0.035,0.12],[0,0.39,0.10],0.28,0.009);
  for(const x of [-0.045,-0.015,0.015,0.045])for(let i=0;i<4;i++)box(ctx,tool,[0.009,0.008,0.055],[x,0.54-i*0.025,0.093],0.28,0.002);
  box(ctx,tool,[0.035,0.025,0.05],[0.02,0.435,0.15],1,0.006);
  const chuck=new THREE.Group();chuck.position.set(0,0.55,0.105);tool.add(chuck);
  add(ctx,chuck,G.lathe([[0.05,0],[0.052,0.035],[0.04,0.075],[0.028,0.12],[0.018,0.15],[0.013,0.19],[0.002,0.26]],24),[0,0,0],[90,0,0],0.98);
  for(let i=0;i<3;i++){const a=i*Math.PI*2/3;const jaw=box(ctx,chuck,[0.014,0.014,0.085],[Math.cos(a)*0.032,Math.sin(a)*0.032,0.055],0.48,0.004);jaw.rotation.z=a;}
  tool.scale.setScalar(0.48);tool.position.y=-0.039;
  return {root,grounded:true,update(c,t){chuck.rotation.z=t*lerp(1,35,clamp(c.bit??0));}};
 }
});

export const pliers=defineModel({
 id:'pliers',aliases:['combination-pliers','linemans-pliers','long-nose-pliers','pliers-tool'],
 describe:'Combination pliers show two forged jaws with serrated gripping faces, a round pivot pin and two separated rubber-coated handles. grip closes and opens the jaws.',
 controls:{grip:'0 open .. 1 jaws closed'},defaults:{grip:0.35},size:'0.21 m long',
 build(ctx){
  const root=new THREE.Group(),hinges:THREE.Group[]=[];
  for(const s of [-1,1]){
   const arm=new THREE.Group();arm.position.set(0,0.47,0);arm.rotation.z=s*0.18;root.add(arm);hinges.push(arm);
   extruded(ctx,arm,[[-0.025,0.04],[0.025,0.04],[0.05,0.23],[0.035,0.32],[0,0.39],[-0.035,0.32],[-0.05,0.23]],0.045,[s*0.024,0,0],0.88,0.01);
   box(ctx,arm,[0.045,0.34,0.06],[s*0.09,-0.20,0],0.72,0.019);
   box(ctx,arm,[0.052,0.30,0.066],[s*0.09,-0.22,0.008],0.94,0.018);
   for(let y=-0.3;y<-.08;y+=0.035)box(ctx,arm,[0.057,0.008,0.07],[s*0.09,y,0.012],0.48,0.003);
  }
  cylinder(ctx,root,0.055,0.07,[0,0.47,0],0.95,28,[90,0,0]);
  cylinder(ctx,root,0.025,0.078,[0,0.47,0],0.35,20,[90,0,0]);
  root.scale.setScalar(0.26);root.position.y=-0.026;
  return {root,grounded:true,update(c){const g=clamp(c.grip??0.35);hinges[0]!.rotation.z=-lerp(0.18,0.035,g);hinges[1]!.rotation.z=lerp(0.18,0.035,g);}};
 }
});

export const ladder=defineModel({
 id:'ladder',aliases:['extension-ladder','step-ladder','construction-ladder'],
 describe:'A tall aluminum extension ladder has paired rails, evenly spaced rounded rungs, overlapping sliding sections, locking catches and rubber feet. extend moves the upper section.',
 controls:{extend:'0 retracted .. 1 raised extension'},defaults:{extend:0.45},size:'4.5 m tall',
 build(ctx){
  const root=new THREE.Group(),upper=new THREE.Group(),H=4.5;
  for(const z of [-0.18,0.18]){
   rodBetween(ctx,root,[-0.31,0.06,z],[0.31,H*0.48,z],0.035,0.92);
   rodBetween(ctx,upper,[-0.31,0.04,z],[0.31,H*0.47,z],0.03,0.72);
   for(let i=0;i<10;i++){const y=0.22+i*0.205;rodBetween(ctx,root,[-0.31*(1-y/H*0.45),y,z],[0.31*(1-y/H*0.45),y,z],0.018,0.96);}
   for(let i=0;i<10;i++){const y=0.18+i*0.205;rodBetween(ctx,upper,[-0.31,y,z],[0.31,y,z],0.015,0.8);}
  }
  for(const s of [-1,1]){
   box(ctx,root,[0.15,0.045,0.08],[s*0.30,0.035,0],0.32,0.012);
   box(ctx,root,[0.07,0.07,0.10],[s*0.26,2.22,0],0.42,0.012);
  }
  root.add(upper);
  return {root,grounded:true,update(c){upper.position.y=clamp(c.extend??0.45)*1.7;}};
 }
});

export const wheelbarrow=defineModel({
 id:'wheelbarrow',aliases:['barrow','garden-cart','builders-wheelbarrow','wheel-barrow'],
 describe:'A builders wheelbarrow has a deep flared metal tub, front wheel with fork and axle, rear legs and two long handles with grips. tip raises and empties the tray slightly.',
 controls:{tip:'0 resting .. 1 tipping the tray'},defaults:{tip:0},size:'1.4 m long',
 build(ctx){
  const root=new THREE.Group(),tray=new THREE.Group();root.add(tray);
  // Open metal basin: flat floor, high flared side walls and a raised front lip.
  box(ctx,tray,[0.76,0.075,0.74],[0,0.76,0.08],0.55,0.025);
  for(const s of [-1,1]){
   const wall=G.extrude([[-0.48,0.77],[0.38,0.77],[0.47,1.07],[0.34,1.16],[-0.40,1.02]],0.045,0.015);
   add(ctx,tray,wall,[s*0.37,0,0],[0,s*90,0],0.86);
  }
  box(ctx,tray,[0.75,0.29,0.055],[0,0.91,0.43],0.78,0.035);
  box(ctx,tray,[0.73,0.035,0.07],[0,1.07,0.42],0.98,0.012);
  for(const x of [-0.37,0.37])rodBetween(ctx,root,[x,0.12,-0.23],[x*0.8,0.72,-0.23],0.025,0.85);
  for(const x of [-0.31,0.31]){
   rodBetween(ctx,root,[x,0.12,-0.23],[x,0.13,-0.92],0.025,0.88);
   rodBetween(ctx,root,[x,0.17,-0.83],[x,0.12,-1.25],0.024,0.78);
   add(ctx,root,G.capsule(0.04,0.16,5,12),[x,0.12,-1.36],[90,0,0],0.55);
  }
  const w=wheel(ctx,root,0.27,0.12,[0,0.28,0.53],0.35,8);
  for(const x of [-0.18,0.18])rodBetween(ctx,root,[x,0.37,0.53],[x*0.65,0.79,0.47],0.025,0.92);
  root.scale.set(0.75,0.9,0.64);
  return {root,grounded:true,update(c){tray.rotation.x=clamp(c.tip??0)*0.23;tray.position.z=-clamp(c.tip??0)*0.08;w.rotation.x=0;}};
 }
});

export const toolbox=defineModel({
 id:'toolbox',aliases:['tool-chest','tool-case','portable-toolbox'],
 describe:'A portable steel toolbox has a bevelled deep case, hinged lifting lid, arched carry handle, front latch and two reinforced side seams. open raises the lid.',
 controls:{open:'0 shut .. 1 lid open'},defaults:{open:0},size:'0.5 m wide',
 build(ctx){
  const root=new THREE.Group(),lid=new THREE.Group();
  box(ctx,root,[0.52,0.24,0.30],[0,0.16,0],0.72,0.035);
  box(ctx,root,[0.46,0.025,0.24],[0,0.29,0],0.52,0.009);
  lid.position.set(0,0.30,-0.13);root.add(lid);
  box(ctx,lid,[0.52,0.10,0.30],[0,0.055,0.13],0.92,0.035);
  box(ctx,lid,[0.42,0.025,0.26],[0,0.105,0.13],0.62,0.012);
  for(const x of [-0.14,0.14])rodBetween(ctx,lid,[x,0.10,0.13],[x,0.21,0.13],0.018,0.55);
  rodBetween(ctx,lid,[-0.14,0.21,0.13],[0.14,0.21,0.13],0.018,0.96);
  box(ctx,root,[0.065,0.075,0.035],[0,0.24,0.17],1,0.01);
  box(ctx,root,[0.028,0.07,0.018],[0,0.24,0.195],0.35,0.006);
  return {root,grounded:true,update(c){lid.rotation.x=-clamp(c.open??0)*1.35;}};
 }
});

export const tapeMeasure=defineModel({
 id:'tape-measure',aliases:['measuring-tape','tape-measurement','retractable-tape'],
 describe:'A compact tape measure has a rounded square case, belt clip, wrist loop, lock button and a yellow graduated steel blade with hooked end. extend pays out the blade.',
 controls:{extend:'0 retracted .. 1 blade extended'},defaults:{extend:0.62},size:'blade extends 1.2 m',
 build(ctx){
  const root=new THREE.Group(),blade=new THREE.Group();
  box(ctx,root,[0.30,0.28,0.13],[0,0.15,0],0.78,0.055);
  box(ctx,root,[0.19,0.07,0.028],[0,0.18,0.075],0.96,0.025);
  box(ctx,root,[0.06,0.035,0.025],[0,0.31,0.06],0.48,0.01);
  box(ctx,root,[0.035,0.19,0.045],[-0.17,0.12,-0.02],0.8,0.012);
  const L=1.2;
  blade.position.set(0.14,0.17,0);root.add(blade);
  box(ctx,blade,[L,0.06,0.012],[L/2,0,0],0.96,0.002);
  for(let i=1;i<25;i++)box(ctx,blade,[0.003,i%5===0?0.045:0.024,0.004],[i*0.046,0,0.01],0.2,0);
  box(ctx,blade,[0.055,0.09,0.025],[L,0,0],0.48,0.006);
  return {root,grounded:true,update(c){const e=clamp(c.extend??0.62);blade.scale.x=Math.max(0.01,e);blade.visible=e>0.015;}};
 }
});

export const chainsaw=defineModel({
 id:'chainsaw',aliases:['chain-saw','petrol-chainsaw','logger-saw','saw-chain'],
 describe:'A petrol chainsaw has a toothed guide bar with looped chain, vented engine housing, rear throttle grip, raised front wrap handle and exhaust cover. chain controls the moving loop.',
 controls:{chain:'0 idle .. 1 chain running'},defaults:{chain:0},size:'0.7 m long',
 build(ctx){
  const root=new THREE.Group(),body=new THREE.Group(),links:THREE.Mesh[]=[];root.add(body);
  box(ctx,body,[0.30,0.29,0.25],[-0.28,0.35,0],0.82,0.06);
  box(ctx,body,[0.22,0.22,0.16],[-0.32,0.36,0.145],0.95,0.04);
  for(let i=0;i<5;i++)box(ctx,body,[0.025,0.17,0.012],[-0.37+i*0.045,0.36,0.23],0.3,0.004);
  // Guide bar in the front-facing plane; a bright perimeter and individual cutters read as chain links.
  extruded(ctx,body,[[-0.12,0.29],[0.47,0.29],[0.62,0.34],[0.64,0.40],[0.58,0.45],[-0.12,0.45]],0.065,[0,0,0],0.77,0.025);
  const chainPts:V3[]=[];
  for(let i=0;i<=20;i++){const u=i/20;chainPts.push([-0.08+u*0.67,0.27,0.055]);}
  for(let i=0;i<=12;i++){const a=-Math.PI/2+i/12*Math.PI;chainPts.push([0.49+Math.cos(a)*0.13,0.37+Math.sin(a)*0.13,0.055]);}
  for(let i=20;i>=0;i--){const u=i/20;chainPts.push([-0.08+u*0.67,0.47,0.055]);}
  for(let i=0;i<=12;i++){const a=Math.PI/2+i/12*Math.PI;chainPts.push([-0.08+Math.cos(a)*0.10,0.37+Math.sin(a)*0.10,0.055]);}
  tube(ctx,body,chainPts,0.008,0.98,72);
  for(let i=0;i<22;i++){
   const x=-0.04+i*0.027;
   extruded(ctx,body,[[x,0.265],[x+0.014,0.245],[x+0.022,0.275]],0.024,[0,0,0],0.48,0);
   extruded(ctx,body,[[x,0.475],[x+0.014,0.495],[x+0.022,0.465]],0.024,[0,0,0],0.48,0);
  }
  for(let i=0;i<48;i++){const link=ctx.mesh(G.rbox(0.027,0.022,0.020,0.004),{tone:i%3===0?0.98:0.55});body.add(link);links.push(link);}
  tube(ctx,body,[[-0.26,0.50,0],[-0.20,0.72,0],[-0.03,0.75,0],[0.04,0.63,0]],0.022,0.96);
  box(ctx,body,[0.09,0.23,0.10],[-0.42,0.21,-0.01],0.72,0.025);
  box(ctx,body,[0.28,0.045,0.08],[-0.39,0.08,0],0.88,0.015);
  root.scale.set(0.60,0.50,0.60);root.position.y=-0.029;
  return {root,grounded:true,update(c,t){
   const speed=clamp(c.chain??0),perimeter=1.14+Math.PI*0.23;
   body.rotation.z=Math.sin(t*18)*0.012*speed;
   for(let i=0;i<links.length;i++){
    let d=(i/links.length*perimeter+t*speed*0.28)%perimeter;
    const p=links[i]!;
    if(d<0.57){p.position.set(-0.08+d,0.47,0.071);p.rotation.z=0;}
    else if((d-=0.57)<Math.PI*0.13){const a=Math.PI/2-d/0.13;p.position.set(0.49+Math.cos(a)*0.13,0.37+Math.sin(a)*0.13,0.071);p.rotation.z=a-Math.PI/2;}
    else if((d-=Math.PI*0.13)<0.57){p.position.set(0.49-(d),0.27,0.071);p.rotation.z=Math.PI;}
    else {d-=0.57;const a=-Math.PI/2-d/0.10;p.position.set(-0.08+Math.cos(a)*0.10,0.37+Math.sin(a)*0.10,0.071);p.rotation.z=a-Math.PI/2;}
   }
  }};
 }
});

// ---------------------------------------------------------------- mobile construction equipment
export const excavator=defineModel({
 id:'excavator',aliases:['digger','crawler-excavator','backhoe','excavator-digger'],
 describe:'A tracked excavator has a glazed cab, rotating upper house, long two-part hydraulic boom, piston rods and toothed bucket. swing rotates the house, boom raises the arm and bucket curls the scoop.',
 controls:{swing:'0..1 house rotation',boom:'0 low .. 1 raised arm',bucket:'0 open .. 1 curled scoop'},defaults:{swing:0,boom:0.45,bucket:0.35},size:'7 m long',
 build(ctx){
  const root=new THREE.Group(),tracks=new THREE.Group(),house=new THREE.Group(),upper=new THREE.Group();root.add(tracks);
  for(const s of [-1,1]){
   add(ctx,tracks,G.torus(0.34,0.10,12,48),[s*0.42,0.31,-0.10],[0,90,0],0.36);
   for(let i=0;i<10;i++){const a=i/10*Math.PI*2;box(ctx,tracks,[0.18,0.055,0.07],[s*0.42,0.31+Math.sin(a)*0.33,-0.10+Math.cos(a)*0.33],0.58,0.01);}
   for(let i=0;i<4;i++)wheel(ctx,tracks,0.11,0.08,[s*0.42,0.28,-0.42+i*0.22],0.3,6);
  }
  box(ctx,tracks,[0.70,0.16,0.85],[0,0.30,-0.10],0.55,0.05);
  house.position.set(0,0.39,0);root.add(house);house.add(upper);
  box(ctx,upper,[0.72,0.48,0.76],[0,0.34,-0.18],0.78,0.09);
  box(ctx,upper,[0.61,0.44,0.55],[0,0.78,-0.32],0.76,0.05);
  box(ctx,upper,[0.48,0.33,0.43],[0,0.80,0.02],0.17,0.04);
  for(const s of [-1,1]){box(ctx,upper,[0.025,0.34,0.45],[s*0.252,0.80,0.02],0.92,0.008);box(ctx,upper,[0.44,0.025,0.04],[0,0.96,0.02],0.94,0.008);}
  // A two-link articulated boom carries its own hydraulic cylinders and pivot bosses.
  const pivot=new THREE.Group();pivot.position.set(0,0.92,0.12);upper.add(pivot);
  rodBetween(ctx,pivot,[0,0,0],[0,0.18,0.73],0.095,0.93);
  rodBetween(ctx,pivot,[0,0,0.06],[0,0.14,0.70],0.055,0.68);
  const stick=new THREE.Group();stick.position.set(0,0.18,0.73);pivot.add(stick);
  rodBetween(ctx,stick,[0,0,0],[0,-0.06,0.67],0.067,0.96);
  rodBetween(ctx,stick,[0,0.03,0.02],[0,-0.03,0.63],0.035,0.62);
  const bucket=new THREE.Group();bucket.position.set(0,-0.06,0.69);stick.add(bucket);
  extruded(ctx,bucket,[[-0.19,0.10],[-0.13,0.03],[-0.09,-0.14],[0.02,-0.27],[0.20,-0.27],[0.25,-0.14],[0.12,-0.07],[0.10,0.10]],0.22,[0,0,0],0.7,0.025);
  for(let i=0;i<4;i++)extruded(ctx,bucket,[[-0.16+i*0.10,-0.22],[-0.13+i*0.10,-0.33],[-0.09+i*0.10,-0.22]],0.18,[0,0,0],0.98,0.005);
  cylinder(ctx,bucket,0.095,0.28,[0,0.10,0],0.96,20,[90,0,0]);
  root.scale.set(2.0,1.2,3.4);root.position.y=0.04;
  return {root,grounded:true,update(c){house.rotation.y=clamp(c.swing??0)*Math.PI*1.6;pivot.rotation.x=lerp(-0.25,0.65,clamp(c.boom??0.45));stick.rotation.x=lerp(-0.65,0.42,clamp(c.bucket??0.35));bucket.rotation.x=lerp(-0.4,0.55,clamp(c.bucket??0.35));}};
 }
});

export const bulldozer=defineModel({
 id:'bulldozer',aliases:['dozer','crawler-dozer','earthmover','bulldozer-vehicle'],
 describe:'A crawler bulldozer has broad steel tracks, enclosed cab, engine grille and a wide curved front blade with side arms and hydraulic rams. blade raises and tilts to push earth.',
 controls:{blade:'0 low .. 1 raised',tilt:'0 level .. 1 angled blade'},defaults:{blade:0.12,tilt:0},size:'6 m long',
 build(ctx){
  const root=new THREE.Group(),tracks=new THREE.Group(),frame=new THREE.Group(),blade=new THREE.Group();root.add(tracks,frame,blade);
  for(const s of [-1,1]){
   add(ctx,tracks,G.torus(0.38,0.12,12,48),[s*0.48,0.38,-0.05],[0,90,0],0.34);
   for(let i=0;i<12;i++){const a=i/12*Math.PI*2;box(ctx,tracks,[0.20,0.045,0.075],[s*0.48,0.38+Math.sin(a)*0.37,-0.05+Math.cos(a)*0.37],0.55,0.01);}
   for(let i=0;i<4;i++)wheel(ctx,tracks,0.12,0.09,[s*0.48,0.34,-0.38+i*0.21],0.32,6);
  }
  box(ctx,frame,[0.75,0.34,0.82],[0,0.60,-0.08],0.72,0.08);
  box(ctx,frame,[0.64,0.50,0.50],[0,1.05,-0.31],0.78,0.06);
  box(ctx,frame,[0.51,0.34,0.42],[0,1.08,-0.01],0.14,0.04);
  for(const s of [-1,1]){box(ctx,frame,[0.03,0.36,0.43],[s*0.27,1.08,-0.01],0.94,0.01);box(ctx,frame,[0.47,0.025,0.035],[0,1.26,-0.01],0.94,0.006);}
  box(ctx,frame,[0.62,0.11,0.05],[0,0.76,0.37],0.40,0.015);
  // Blade is a broad curved moldboard with a hardened cutting edge.
  add(ctx,blade,new THREE.CylinderGeometry(0.72,0.72,1.22,32,1,true,0.25,2.65),[0,0.46,0.48],[90,0,0],0.83);
  box(ctx,blade,[1.42,0.10,0.12],[0,0.06,0.50],0.52,0.025);
  for(const s of [-1,1]){
   rodBetween(ctx,root,[s*0.38,0.47,0.25],[s*0.78,0.38,0.53],0.05,0.72);
   rodBetween(ctx,root,[s*0.45,0.65,0.02],[s*0.57,0.83,0.45],0.025,0.98);
  }
  root.scale.set(2.0,2.2,4.0);
  return {root,grounded:true,update(c){const h=clamp(c.blade??0.12);blade.position.y=lerp(0,0.38,h);blade.rotation.y=(clamp(c.tilt??0)-0.5)*0.24;}};
 }
});

export const towerCrane=defineModel({
 id:'tower-crane',aliases:['construction-crane','building-crane','crane','towering-crane'],
 describe:'A tower crane rises on a cross-braced mast with long counter-jib, lattice working jib, operator cab, trolley and hanging hook. rotate swings the jib and lift raises or lowers the load.',
 controls:{rotate:'0..1 slew the crane',lift:'0 hook low .. 1 hook raised'},defaults:{rotate:0,lift:0.45},size:'32 m tall',
 build(ctx){
  const root=new THREE.Group(),top=new THREE.Group();root.add(top);
  box(ctx,root,[1.15,0.18,1.15],[0,0.09,0],0.45,0.035);
  for(const x of [-0.44,0.44])for(const z of [-0.44,0.44])box(ctx,root,[0.14,0.34,0.14],[x,0.34,z],0.68,0.02);
  for(const y of [0.48,1.2,1.92,2.64,3.36,4.08])for(const s of [-1,1]){
   box(ctx,root,[0.09,0.06,0.09],[s*0.44,y,0],0.92,0.01);box(ctx,root,[0.09,0.06,0.09],[0,y,s*0.44],0.92,0.01);
  }
  for(let i=0;i<6;i++){
   const y=i*0.72;rodBetween(ctx,root,[-0.44,y,0.44],[0.44,y+0.72,0.44],0.022,0.83);rodBetween(ctx,root,[0.44,y,-0.44],[-0.44,y+0.72,-0.44],0.022,0.83);
   rodBetween(ctx,root,[0.44,y,0.44],[-0.44,y+0.72,0.44],0.022,0.83);rodBetween(ctx,root,[-0.44,y,-0.44],[0.44,y+0.72,-0.44],0.022,0.83);
  }
  top.position.y=4.14;root.add(top);
  box(ctx,top,[0.22,0.30,0.22],[0,0.18,0],0.92,0.035);
  box(ctx,top,[0.42,0.30,0.42],[0,0.46,-0.23],0.72,0.05);
  box(ctx,top,[0.33,0.23,0.36],[0,0.47,-0.21],0.15,0.025);
  // Triangular lattice jib on the long side, counterweight on the short side.
  for(const s of [-1,1]){
   const end=s>0?4.4:-1.7;
   rodBetween(ctx,top,[0,0.64,0],[0,0.77,end],0.06,0.9);
   rodBetween(ctx,top,[0,0.88,0],[0,0.77,end],0.06,0.88);
   for(let i=0;i<8;i++){const z=end*i/8;rodBetween(ctx,top,[0,0.64,z],[0,0.88,z+end/8],0.018,0.74);rodBetween(ctx,top,[0,0.88,z],[0,0.64,z+end/8],0.018,0.74);}
  }
  box(ctx,top,[0.50,0.25,0.78],[0,0.65,-1.19],0.48,0.045);
  const trolley=new THREE.Group();top.add(trolley);trolley.position.set(0,0.72,0.25);
  box(ctx,trolley,[0.22,0.11,0.18],[0,0,0],0.92,0.025);
  const hook=new THREE.Group();top.add(hook);
  cylinder(ctx,hook,0.012,1,[0,0,0],0.97,12);
  add(ctx,hook,G.torus(0.065,0.016,10,24,Math.PI*1.7),[0,-0.55,0],[0,0,90],0.96);
  root.scale.setScalar(6.15);
  return {root,grounded:true,update(c){top.rotation.y=clamp(c.rotate??0)*Math.PI*2;trolley.position.z=lerp(-0.2,3.9,clamp(c.lift??0.45));hook.position.set(0,lerp(1.75,0.25,clamp(c.lift??0.45)),trolley.position.z);}};
 }
});

export const cementMixer=defineModel({
 id:'cement-mixer',aliases:['concrete-mixer-truck','mixer-truck','cement-truck','concrete-truck'],
 describe:'A concrete mixer truck has a cab, six heavy wheels, striped revolving drum, rear ladder and discharge chute. drum rotates as it mixes and drive turns the wheels.',
 controls:{drum:'0..1 drum rotation',drive:'0..1 wheel rotation'},defaults:{drum:0.3,drive:0},size:'8 m long',
 build(ctx){
  const root=new THREE.Group(),body=new THREE.Group(),drum=new THREE.Group(),drumSpin=new THREE.Group(),wheels:THREE.Group[]=[];root.add(body);
  box(ctx,body,[1.35,0.55,4.5],[0,0.92,-0.15],0.58,0.08);
  box(ctx,body,[1.48,0.10,4.4],[0,0.61,-0.18],0.82,0.025);
  box(ctx,body,[1.22,1.10,1.28],[0,1.04,1.45],0.82,0.09);
  box(ctx,body,[1.03,0.56,0.07],[0,1.23,2.12],0.16,0.018);
  for(const s of [-1,1]){box(ctx,body,[0.06,0.65,0.9],[s*0.64,1.20,1.45],0.93,0.012);box(ctx,body,[0.08,0.32,0.06],[s*0.67,1.44,1.80],0.9,0.015);}
  box(ctx,body,[1.12,0.10,0.12],[0,1.63,1.47],0.9,0.025);
  drum.position.set(0,1.23,-0.62);drum.rotation.x=deg(-24);body.add(drum);drum.add(drumSpin);
  add(ctx,drumSpin,G.lathe([[0.58,-1.0],[0.72,-0.86],[0.83,-0.55],[0.88,-0.10],[0.83,0.35],[0.68,0.79],[0.62,0.91],[0.56,0.91]],48),[0,0,0],[90,0,0],0.88);
  for(let i=0;i<2;i++){
   const spiral:V3[]=[];for(let j=0;j<=48;j++){const u=j/48,a=u*Math.PI*5+i*Math.PI;spiral.push([Math.cos(a)*0.86,Math.sin(a)*0.86,-0.79+u*1.52]);}tube(ctx,drumSpin,spiral,0.045,0.56,96);
  }
  for(const z of [-0.75,0.72])add(ctx,drumSpin,G.torus(0.85,0.027,8,48),[0,0,z],[0,0,0],0.5);
  // Chute and rear hopper.
  box(ctx,body,[0.40,0.44,0.45],[0,0.88,-2.2],0.72,0.04);
  rodBetween(ctx,body,[0,0.90,-2.05],[0,0.58,-2.72],0.11,0.92);
  box(ctx,body,[0.52,0.08,0.38],[0,0.54,-2.75],0.88,0.025);
  for(const z of [-1.65,-0.75,0.15])for(const s of [-1,1])wheels.push(wheel(ctx,body,0.43,0.24,[s*0.78,0.43,z],0.35,8));
  root.scale.set(1.6,1.5,1.8);
  return {root,grounded:true,update(c,t){drumSpin.rotation.z=t*lerp(1,9,clamp(c.drum??0.3));const a=t*clamp(c.drive??0)*8;for(const w of wheels)w.rotation.x=a;}};
 }
});

export const forklift=defineModel({
 id:'forklift',aliases:['fork-lift','fork-truck','pallet-forklift','warehouse-forklift'],
 describe:'A counterbalanced forklift has solid tyres, rear-steering wheel, open driver cage, overhead guard, tall mast and two horizontal forks. lift raises the carriage and forks.',
 controls:{lift:'0 forks low .. 1 raised'},defaults:{lift:0.12},size:'2.8 m tall',
 build(ctx){
  const root=new THREE.Group(),mast=new THREE.Group(),forks=new THREE.Group();
  box(ctx,root,[1.25,0.72,1.8],[0,0.72,-0.12],0.82,0.10);
  box(ctx,root,[1.03,0.78,0.44],[0,1.12,0.56],0.76,0.07);
  box(ctx,root,[0.82,0.43,0.08],[0,1.18,0.80],0.15,0.025);
  const seat=new THREE.Group();seat.position.set(0,1.11,-0.16);root.add(seat);
  box(ctx,seat,[0.46,0.11,0.42],[0,0,0],0.38,0.035);box(ctx,seat,[0.45,0.43,0.10],[0,0.24,-0.16],0.52,0.035);
  for(const x of [-0.58,0.58])for(const z of [-0.64,0.57])box(ctx,root,[0.08,1.42,0.08],[x,1.55,z],0.88,0.018);
  for(const y of [2.20,2.25])box(ctx,root,[1.25,0.08,1.45],[0,y,-0.02],0.9,0.02);
  for(const s of [-1,1]){wheel(ctx,root,0.31,0.20,[s*0.68,0.31,0.55],0.32,6);wheel(ctx,root,0.25,0.17,[s*0.68,0.25,-0.71],0.32,6);}
  mast.position.set(0,0,1.00);root.add(mast);
  for(const x of [-0.48,0.48])box(ctx,mast,[0.10,2.05,0.12],[x,1.12,0],0.55,0.02);
  for(let y=0.22;y<2.2;y+=0.34)box(ctx,mast,[0.98,0.055,0.11],[0,y,0],0.68,0.012);
  const carriage=new THREE.Group();carriage.position.z=0.14;mast.add(carriage);
  box(ctx,carriage,[1.08,0.16,0.18],[0,0,0],0.94,0.025);
  for(const x of [-0.37,0.37]){
   box(ctx,forks,[0.12,0.075,0.95],[x,0.10,0.58],0.94,0.025);
   box(ctx,forks,[0.12,0.55,0.10],[x,0.35,0.12],0.92,0.025);
  }
  forks.position.set(0,0,1.12);root.add(forks);
  root.scale.setScalar(1.22);
  return {root,grounded:true,update(c){const y=clamp(c.lift??0.12)*1.25;carriage.position.y=y;forks.position.y=y;}};
 }
});

// ---------------------------------------------------------------- fixed industrial structures and energy
export const factory=defineModel({
 id:'factory',aliases:['industrial-factory','manufacturing-plant','mill','factory-building'],
 describe:'An industrial factory has a sawtooth roof, tall paneled walls, glowing multi-pane windows, loading doors and three banded smokestacks. smoke controls rising plumes and window glow.',
 controls:{smoke:'0 off .. 1 smoke plumes',lights:'0 dark .. 1 lit factory windows'},defaults:{smoke:0.35,lights:0.35},size:'24 m wide',
 build(ctx){
  const root=new THREE.Group(),plumes:THREE.Group[]=[];
  box(ctx,root,[5.8,2.6,3.6],[0,1.3,0],0.65,0.08);
  for(let i=0;i<4;i++){
   const z=-1.25+i*0.92;
   const roof:[number,number][]=[[-0.8,2.6],[0.75,2.6],[0.75,3.18],[0.28,3.48],[-0.35,2.84],[-0.8,2.84]];
   extruded(ctx,root,roof,0.88,[0,0,z],0.9,0.02);
   for(let x=-2.5;x<=2.5;x+=0.84)box(ctx,root,[0.06,0.10,0.88],[x,2.70,z],0.48,0.01);
  }
  box(ctx,root,[1.15,1.65,0.08],[0.2,0.83,1.85],0.83,0.035);
  box(ctx,root,[0.94,1.34,0.035],[0.2,0.77,1.90],0.19,0.02);
  for(const x of [-2.2,-1.1,1.45,2.45])for(const y of [1.1,1.85]){
   box(ctx,root,[0.62,0.48,0.055],[x,y,1.84],0.95,0.025);
   root.add(ctx.mesh(at(G.rbox(0.48,0.34,0.02,0.01),[x,y,1.88]),{tone:0.16,glow:1.3,glowControl:'lights',rough:0.4}));
   box(ctx,root,[0.022,0.35,0.025],[x,y,1.90],0.88,0.004);
   box(ctx,root,[0.48,0.022,0.025],[x,y,1.90],0.88,0.004);
  }
  for(let i=0;i<3;i++){
   const x=-1.85+i*1.85,y=3.6+i*0.12;
   add(ctx,root,G.lathe([[0.24,0],[0.22,0.12],[0.19,1.0],[0.17,1.15],[0.24,1.15]],32),[x,y,0.2],[0,0,0],0.82);
   for(const h of [0.16,0.8,1.05])add(ctx,root,G.torus(0.19-h*0.02,0.018,8,32),[x,y+h,0.2],[0,0,0],0.98);
   const puff=new THREE.Group();puff.position.set(x,y+1.2,0.2);root.add(puff);plumes.push(puff);
   for(let j=0;j<3;j++)add(ctx,puff,G.sphere(0.16+j*0.045,12,8),[0.02*j,j*0.20,0], [0,0,0],0.28);
  }
  root.scale.setScalar(4.1);
  return {root,grounded:true,update(c,t){for(let i=0;i<plumes.length;i++){const p=plumes[i]!;const s=clamp(c.smoke??0.35);p.visible=s>0.02;p.position.y=4.8+((t*0.35+i*0.31)%0.8);p.scale.setScalar(s*(0.65+0.25*Math.sin(t*2+i)));}}};
 }
});

export const oilPumpjack=defineModel({
 id:'oil-pumpjack',aliases:['pumpjack','nodding-donkey','oil-well-pump','beam-pump'],
 describe:'An oil pumpjack stands on a braced A-frame with horsehead beam, walking beam, counterweight, crank and polished sucker rod. pump rocks the horsehead up and down.',
 controls:{pump:'0 idle .. 1 pumping cycle'},defaults:{pump:0.45},size:'8 m tall',
 build(ctx){
  const root=new THREE.Group(),beam=new THREE.Group();
  for(const s of [-1,1]){
   rodBetween(ctx,root,[s*0.62,0.10,0],[0,3.15,0],0.10,0.82);
   rodBetween(ctx,root,[s*0.62,0.10,0],[0.18,3.15,0],0.08,0.67);
   rodBetween(ctx,root,[s*0.62,0.10,0],[s*0.43,0.10,0],0.08,0.6);
  }
  box(ctx,root,[0.28,0.16,0.72],[0,0.10,0],0.48,0.025);
  for(const y of [0.55,1.25,2.0])rodBetween(ctx,root,[-0.5,y,0],[0.5,y,0],0.045,0.75);
  beam.position.set(0,3.23,0);root.add(beam);
  rodBetween(ctx,beam,[-1.45,0,0],[1.4,0,0],0.13,0.94);
  rodBetween(ctx,beam,[-1.12,0.03,0],[0.92,0.03,0],0.18,0.68);
  add(ctx,beam,G.ellipsoid(0.35,0.45,0.33),[-1.4,-0.10,0],[0,0,0],0.82);
  add(ctx,beam,G.ellipsoid(0.30,0.38,0.32),[1.35,-0.10,0],[0,0,0],0.7);
  // Walking beam saddle, crank wheel and connecting pitman.
  cylinder(ctx,root,0.32,0.38,[0,1.60,0],0.42,40,[90,0,0]);
  for(let i=0;i<12;i++){const a=i*Math.PI/6;rodBetween(ctx,root,[Math.cos(a)*0.27,1.60+Math.sin(a)*0.27,0],[Math.cos(a+0.15)*0.27,1.60+Math.sin(a+0.15)*0.27,0],0.02,0.96);}
  rodBetween(ctx,root,[0.15,1.53,0.20],[0.95,3.17,0.20],0.035,0.92);
  rodBetween(ctx,root,[0.95,3.2,0],[0.95,2.45,0],0.025,0.98);
  box(ctx,root,[0.72,0.50,0.25],[0.95,2.25,0],0.68,0.07);
  root.scale.setScalar(2.15);root.position.y=-0.043;
  return {root,grounded:true,update(c,t){beam.rotation.z=Math.sin(t*2*Math.PI)*0.16*clamp(c.pump??0.45);}};
 }
});

export const oilRig=defineModel({
 id:'oil-rig',aliases:['offshore-oil-rig','drilling-rig','derrick','oil-platform'],
 describe:'An offshore oil rig has a broad jacket platform on four cross-braced legs, deck modules, perimeter railings and a tall lattice derrick with crown block and drilling pipe. drill turns the string.',
 controls:{drill:'0 idle .. 1 drill string rotating'},defaults:{drill:0},size:'38 m tall',
 build(ctx){
  const root=new THREE.Group();box(ctx,root,[3.4,0.32,2.7],[0,2.35,0],0.72,0.07);
  for(const x of [-1.35,1.35])for(const z of [-1.0,1.0]){
   rodBetween(ctx,root,[x*0.72,0.12,z*0.72],[x,2.35,z],0.10,0.82);
   for(let y=0.5;y<2.4;y+=0.5)rodBetween(ctx,root,[x*0.72+(x-x*0.72)*(y/2.5),y,z*0.72],[x,y,z],0.045,0.62);
  }
  for(const y of [0.35,0.90,1.5,2.35])for(const s of [-1,1]){rodBetween(ctx,root,[s*1.35,y,-1],[s*1.35,y,1],0.035,0.74);rodBetween(ctx,root,[-1.35,y,s*1],[1.35,y,s*1],0.035,0.74);}
  box(ctx,root,[1.5,0.72,0.86],[-0.60,2.90,-0.20],0.86,0.06);
  box(ctx,root,[0.82,0.52,0.55],[0.88,2.80,-0.20],0.57,0.05);
  for(let x=-1.35;x<=1.35;x+=0.45)rodBetween(ctx,root,[x,2.58,-1.1],[x,2.84,-1.1],0.018,0.9);
  for(const s of [-1,1])rodBetween(ctx,root,[-1.35,2.84,s*1.1],[1.35,2.84,s*1.1],0.018,0.9);
  // Derrick is a tapered, cross-braced mast over the drill floor.
  for(const s of [-1,1]){
   rodBetween(ctx,root,[s*0.72,2.54,0.28],[s*0.18,5.4,0.28],0.07,0.95);
   rodBetween(ctx,root,[s*0.72,2.54,-0.28],[s*0.18,5.4,-0.28],0.07,0.95);
  }
  for(let y=2.7;y<5.3;y+=0.48){const k=(5.4-y)/2.86,w=0.18+k*0.54;for(const z of [-0.28,0.28])rodBetween(ctx,root,[-w,y,z],[w,y,z],0.024,0.7);}
  for(let y=2.65;y<5.1;y+=0.6){const k=(5.4-y)/2.86,w=0.18+k*0.54;rodBetween(ctx,root,[-w,y,-0.28],[w,y+0.6,-0.28],0.02,0.74);rodBetween(ctx,root,[w,y,-0.28],[-w,y+0.6,-0.28],0.02,0.74);}
  const drill=new THREE.Group();drill.position.set(0,2.35,0);root.add(drill);
  cylinder(ctx,drill,0.07,2.4,[0,-1.0,0],0.98,20);
  cylinder(ctx,drill,0.12,0.22,[0,0.12,0],0.57,20);
  for(let y=-2.1;y<0.05;y+=0.45)add(ctx,drill,G.torus(0.072,0.012,8,20),[0,y,0],[90,0,0],0.56);
  for(let i=0;i<4;i++)box(ctx,root,[0.25,0.52,0.22],[-1.05+i*0.54,2.8,0.86],0.83,0.025);
  root.scale.setScalar(7);root.position.y=-0.84;
  return {root,grounded:true,update(c,t){drill.rotation.y=t*clamp(c.drill??0)*7;}};
 }
});

export const windTurbine=defineModel({
 id:'wind-turbine',aliases:['windmill-turbine','wind-generator','wind-farm-turbine','turbine'],
 describe:'A modern wind turbine has a tapered tower, nacelle, three long swept blades and ladder access. blades rotate continuously, sped up by spin.',
 controls:{spin:'0 slow idle .. 1 fast blade rotation'},defaults:{spin:0.35},size:'80 m tall',
 build(ctx){
  const root=new THREE.Group(),rotor=new THREE.Group();
  add(ctx,root,G.lathe([[0.47,0],[0.40,2],[0.31,4],[0.22,6.3],[0.17,8.0],[0.14,8.3]],32),[0,0,0],[0,0,0],0.84);
  box(ctx,root,[0.20,4.3,0.045],[0,2.8,0.40],0.55,0.015);
  const nacelle=new THREE.Group();nacelle.position.set(0,8.28,0);root.add(nacelle);
  box(ctx,nacelle,[0.48,0.34,1.18],[0,0.03,-0.32],0.84,0.08);
  add(ctx,nacelle,G.sphere(0.27,24,14),[0,0.04,0.36],[0,0,0],0.98);
  rotor.position.set(0,0.04,0.59);nacelle.add(rotor);
  cylinder(ctx,rotor,0.15,0.26,[0,0,0],0.58,28,[90,0,0]);
  for(let i=0;i<3;i++){
   const blade=new THREE.Group();blade.rotation.z=i*2*Math.PI/3;rotor.add(blade);
   extruded(ctx,blade,[[0,0],[0.07,0.16],[0.11,0.68],[0.08,1.48],[0.035,2.35],[0,2.65],[-0.035,2.28],[-0.08,1.38],[-0.09,0.63],[-0.05,0.12]],0.09,[0,0.18,0],0.96,0.02);
   line(ctx,blade,[0,0.3,0.052],[0,2.45,0.052],0.015,0.63);
  }
  for(let i=0;i<6;i++)box(ctx,root,[0.035,0.11,0.04],[-0.08,0.25+i*0.27,0.43],0.92,0.01);
  root.scale.setScalar(7.3);
  return {root,grounded:true,update(c,t){rotor.rotation.z=t*lerp(0.2,3.8,clamp(c.spin??0.35));}};
 }
});

export const coolingTower=defineModel({
 id:'cooling-tower',aliases:['nuclear-cooling-tower','hyperboloid-tower','power-plant-tower','cooling-stack'],
 describe:'A huge hyperboloid cooling tower flares at the base and rim around a narrow waist, with a reinforced concrete lip and rising vapor plume. steam controls the plume.',
 controls:{steam:'0 clear .. 1 broad rising plume'},defaults:{steam:0.45},size:'44 m tall',
 build(ctx){
  const root=new THREE.Group(),cloud=new THREE.Group();
  const profile:[number,number][]=[[1.28,0],[1.48,0.12],[1.65,0.72],[1.82,1.55],[1.96,2.50],[1.98,3.35],[1.86,4.10],[1.65,4.90],[1.55,5.05],[1.48,5.05],[1.55,4.83],[1.72,4.06],[1.84,3.32],[1.82,2.55],[1.68,1.63],[1.51,0.78],[1.34,0.18],[1.28,0]];
  add(ctx,root,G.lathe(profile,64),[0,0,0],[0,0,0],0.82);
  add(ctx,root,G.torus(1.53,0.075,12,64),[0,5.02,0],[0,0,0],0.96);
  add(ctx,root,G.torus(1.42,0.06,12,64),[0,0.12,0],[0,0,0],0.55);
  // Subtle vertical ribs and broad inspection galleries break the shell surface.
  for(let i=0;i<16;i++){const a=i*Math.PI/8;const r=1.30+0.42*Math.sin(Math.min(Math.PI/2,Math.max(0,(i%8)/8*Math.PI)));line(ctx,root,[Math.cos(a)*1.36,0.2,Math.sin(a)*1.36],[Math.cos(a)*1.50,4.84,Math.sin(a)*1.50],0.012,0.64);void r;}
  for(const y of [0.70,1.65,3.35,4.20]){
   const rad=y<1.5?1.55+y*0.13:y<3.4?1.92-(y-2.5)*0.02:1.94-(y-3.3)*0.35;
   add(ctx,root,G.torus(Math.max(1.55,rad),0.016,6,64),[0,y,0],[0,0,0],0.58);
  }
  cloud.position.y=5.1;root.add(cloud);
  for(let i=0;i<6;i++)add(ctx,cloud,G.sphere(0.34+(i%3)*0.09,16,10),[(i%3-1)*0.31,i*0.20,((i*7)%3-1)*0.22],[0,0,0],0.35);
  root.scale.setScalar(8.7);
  return {root,grounded:true,update(c,t){const s=clamp(c.steam??0.45);cloud.visible=s>0.015;cloud.position.y=5.08+(t*0.24%0.7);cloud.scale.setScalar(s*(0.82+0.15*Math.sin(t*1.7)));}};
 }
});

export const powerPylon=defineModel({
 id:'power-pylon',aliases:['electricity-pylon','transmission-tower','hydro-tower','high-voltage-pylon'],
 describe:'A high-voltage transmission pylon has a tapered steel lattice mast, broad crossarms, stacked insulator strings and three sagging power lines stretching to either side. sway lightly moves the cables.',
 controls:{sway:'0..1 cable movement in the wind'},defaults:{sway:0.15},size:'28 m tall',
 build(ctx){
  const root=new THREE.Group(),wires:THREE.Group[]=[];
  const levels=[2.2,3.0,3.8,4.6,5.4,6.2,7.0];
  for(const s of [-1,1])rodBetween(ctx,root,[s*1.5,0,0],[s*0.12,7.2,0],0.045,0.86);
  for(let i=0;i<6;i++){
   const y=i*1.15,w=1.5-(y/7.2)*1.38;
   rodBetween(ctx,root,[-w,y,0],[w,y,0],0.035,0.84);
   rodBetween(ctx,root,[-w,y,0],[w,y+1.15,0],0.018,0.7);rodBetween(ctx,root,[w,y,0],[-w,y+1.15,0],0.018,0.7);
  }
  for(const y of levels){
   const span=1.9-(y/7.2)*0.15;
   rodBetween(ctx,root,[-span,y,0],[span,y,0],0.055,0.95);
   for(const s of [-1,1]){
    const x=s*span;
    for(let j=0;j<4;j++)add(ctx,root,G.lathe([[0.11-j*0.01,0],[0.12-j*0.01,0.05],[0.10-j*0.01,0.09],[0,0.09]],12),[x,y-0.25-j*0.13,0],[0,0,0],0.65);
   }
  }
  for(const z of [-0.20,0,0.20]){
   const wire=new THREE.Group();root.add(wire);wires.push(wire);
   tube(ctx,wire,[[-5.2,7.0,z],[0,6.55,z],[5.2,7.0,z]],0.026,0.96,48);
   for(const s of [-1,1])rodBetween(ctx,root,[s*1.90,7.0,z],[s*4.8,7.0,z],0.020,0.6);
  }
  box(ctx,root,[2.8,0.14,0.48],[0,0.10,0],0.45,0.03);
  root.scale.setScalar(3.9);
  return {root,grounded:true,update(c,t){const s=clamp(c.sway??0.15);for(let i=0;i<wires.length;i++){wires[i]!.position.y=Math.sin(t*1.4+i*1.2)*s*0.10;}}};
 }
});

export const pipeline=defineModel({
 id:'pipeline',aliases:['oil-pipeline','pipe-line','industrial-pipe','water-main'],
 describe:'A heavy industrial pipeline runs across steel supports through flanged elbows, bolted joints and a large handwheel valve. flow pulses through the line and turns the valve wheel.',
 controls:{flow:'0 idle .. 1 flowing',valve:'0 shut .. 1 fully open'},defaults:{flow:0.35,valve:0.7},size:'4 m section',
 build(ctx){
  const root=new THREE.Group();
  tube(ctx,root,[[-1.7,0.75,0],[-0.8,0.75,0],[-0.5,0.75,0],[-0.5,0.75,0.75],[0.35,0.75,0.75],[0.35,0.75,0],[1.75,0.75,0]],0.17,0.82,80);
  for(const x of [-1.7,-0.8,0.35,1.65]){
   add(ctx,root,G.torus(0.19,0.025,10,40),[x,0.75,0],[90,0,0],0.96);
   for(let i=0;i<8;i++){const a=i*Math.PI/4;add(ctx,root,G.sphere(0.027,8,6),[x,0.75+Math.cos(a)*0.19,Math.sin(a)*0.19],[0,0,0],0.47);}
  }
  for(const x of [-1.35,1.25]){
   box(ctx,root,[0.44,0.13,0.48],[x,0.065,0],0.52,0.03);
   box(ctx,root,[0.14,0.57,0.14],[x,0.35,0],0.7,0.02);
   box(ctx,root,[0.50,0.07,0.5],[x,0.66,0],0.8,0.02);
  }
  const valve=new THREE.Group();valve.position.set(0.35,1.15,0.75);root.add(valve);
  cylinder(ctx,valve,0.08,0.62,[0,0,0],0.88,18);
  add(ctx,valve,G.torus(0.31,0.026,10,40),[0,0.36,0],[90,0,0],0.96);
  for(let i=0;i<5;i++){const a=i*Math.PI*2/5;rodBetween(ctx,valve,[0,0.36,0],[Math.cos(a)*0.31,0.36,Math.sin(a)*0.31],0.018,0.88);}
  cylinder(ctx,valve,0.055,0.10,[0,0.36,0],0.55,16,[90,0,0]);
  const markers:THREE.Group[]=[];
  for(let i=0;i<5;i++){const bead=new THREE.Group();root.add(bead);add(ctx,bead,G.sphere(0.055,10,8),[0,0,0],[0,0,0],0.98);markers.push(bead);}
  return {root,grounded:true,update(c,t){valve.rotation.z=clamp(c.valve??0.7)*Math.PI*2;for(let i=0;i<markers.length;i++){const k=(t*0.5*clamp(c.flow??0.35)+i/markers.length)%1;markers[i]!.position.set(-1.7+k*3.45,0.75,0);markers[i]!.visible=(c.flow??0.35)>0.02;}}};
 }
});

export const conveyorBelt=defineModel({
 id:'conveyor-belt',aliases:['conveyor','conveyor-system','belt-conveyor','factory-conveyor'],
 describe:'An inclined belt conveyor has a continuous dark rubber surface, closely spaced rollers, steel trestle frame, end drums and boxes traveling uphill. speed moves the cargo and belt.',
 controls:{speed:'0 stopped .. 1 conveyor running'},defaults:{speed:0.45},size:'4 m long',
 build(ctx){
  const root=new THREE.Group(),cargo:THREE.Group[]=[],belt=new THREE.Group();root.add(belt);
  const A:V3=[-1.9,0.45,0],B:V3=[1.9,1.5,0];
  rodBetween(ctx,root,[-2.0,0.42,0],[2.0,1.48,0],0.085,0.72);
  rodBetween(ctx,belt,[-1.95,0.52,0],[1.95,1.58,0],0.045,0.3);
  for(let i=0;i<14;i++){
   const k=i/13,x=lerp(A[0],B[0],k),y=lerp(A[1],B[1],k);
   rodBetween(ctx,root,[x,y-0.12,-0.47],[x,y-0.12,0.47],0.035,0.55);
  }
  for(const x of [-1.55,-0.45,0.7,1.65]){
   const y=lerp(A[1],B[1],(x+1.9)/3.8);
   for(const s of [-1,1])rodBetween(ctx,root,[x,y-0.12,s*0.40],[x-0.2,y*0.25,s*0.40],0.035,0.8);
  }
  for(const x of [-1.92,1.92])add(ctx,root,G.torus(0.12,0.05,10,32),[x,lerp(A[1],B[1],(x+1.9)/3.8),0],[90,0,0],0.78);
  for(let i=0;i<3;i++){
   const b=new THREE.Group();root.add(b);box(ctx,b,[0.38,0.36,0.42],[0,0.20,0],0.88,0.035);
   box(ctx,b,[0.39,0.025,0.43],[0,0.39,0],0.58,0.008);
   for(const x of [-0.08,0.08])box(ctx,b,[0.02,0.24,0.012],[x,0.20,0.218],0.55,0.003);
   cargo.push(b);
  }
  return {root,grounded:true,update(c,t){const speed=clamp(c.speed??0.45);for(let i=0;i<cargo.length;i++){const k=((t*speed*0.18+i/cargo.length)%1);cargo[i]!.position.set(lerp(-1.7,1.65,k),lerp(0.45,1.50,k),0);}}};
 }
});

export const shippingContainer=defineModel({
 id:'shipping-container',aliases:['freight-container','cargo-container','intermodal-container','sea-container'],
 describe:'A corrugated shipping container has a tall rectangular steel shell, deep vertical ribs, corner castings, bottom rails and double end doors with locking bars. turn eases the container around.',
 controls:{turn:'0..1 rotate to show the doors'},defaults:{turn:0.18},size:'6.1 m long',
 build(ctx){
  const root=new THREE.Group();
  box(ctx,root,[2.44,2.59,6.06],[0,1.295,0],0.62,0.08);
  for(let z=-2.88;z<=2.89;z+=0.18)for(const x of [-1.24,1.24])box(ctx,root,[0.09,2.45,0.08],[x,1.30,z],0.98,0.015);
  for(const x of [-1.22,1.22])for(const y of [0.12,2.55])box(ctx,root,[0.08,0.10,6.02],[x,y,0],0.48,0.018);
  for(const x of [-1.18,1.18])for(const z of [-2.98,2.98]){
   box(ctx,root,[0.15,2.62,0.15],[x,1.30,z],0.96,0.025);
   box(ctx,root,[0.18,0.18,0.18],[x,2.62,z],0.5,0.025);
   box(ctx,root,[0.18,0.16,0.18],[x,0.09,z],0.5,0.025);
  }
  box(ctx,root,[2.35,0.12,6.0],[0,0.08,0],0.4,0.025);
  box(ctx,root,[2.35,0.09,6.0],[0,2.60,0],0.95,0.02);
  for(const s of [-1,1]){
   box(ctx,root,[1.12,2.42,0.07],[s*0.57,1.31,-3.05],0.76,0.025);
   box(ctx,root,[0.035,2.28,0.09],[s*0.38,1.31,-3.10],0.98,0.008);
   for(const y of [0.25,0.75,1.25,1.75,2.25])box(ctx,root,[0.08,0.04,0.10],[s*0.38,y,-3.11],0.42,0.008);
   for(const y of [0.28,2.30])box(ctx,root,[0.20,0.10,0.12],[s*0.57,y,-3.11],0.98,0.02);
  }
  const rot=new THREE.Group();rot.add(...root.children);root.add(rot);
  return {root,grounded:true,update(c){rot.rotation.y=clamp(c.turn??0.18)*Math.PI*2;}};
 }
});

export const containerStack=defineModel({
 id:'container-stack',aliases:['stacked-containers','shipping-containers','cargo-stack','containers'],
 describe:'Three corrugated freight containers are stacked two high in an offset dockside pile, with ribbed steel sides, corner castings and locking doors. turn rotates the stack.',
 controls:{turn:'0..1 rotate stack'},defaults:{turn:0.12},size:'8 m high',
 build(ctx){
  const root=new THREE.Group(),stack=new THREE.Group();root.add(stack);
  const make=(x:number,y:number,z:number,L:number,tone:number)=>{
   const c=new THREE.Group();c.position.set(x,y,z);stack.add(c);
   box(ctx,c,[2.44,2.59,L],[0,1.295,0],tone,0.07);
   for(let zz=-L/2+0.1;zz<L/2;zz+=0.18)for(const xx of [-1.24,1.24])box(ctx,c,[0.09,2.45,0.08],[xx,1.3,zz],0.98,0.015);
   for(const xx of [-1.22,1.22])for(const yy of [0.12,2.55])box(ctx,c,[0.08,0.10,L],[xx,yy,0],0.48,0.018);
   for(const xx of [-1.18,1.18])for(const zz of [-L/2,L/2]){
    box(ctx,c,[0.14,2.62,0.14],[xx,1.30,zz],0.96,0.02);
    box(ctx,c,[0.17,0.17,0.17],[xx,2.62,zz],0.5,0.02);
   }
   box(ctx,c,[2.34,0.09,L],[0,0.08,0],0.42,0.02);
   for(const s of [-1,1]){
    box(ctx,c,[1.1,2.4,0.06],[s*0.56,1.30,-L/2-0.03],0.72,0.02);
    box(ctx,c,[0.035,2.25,0.08],[s*0.4,1.30,-L/2-0.08],0.98,0.008);
   }
  };
  make(0,0,0,6.0,0.68);make(0,2.64,0,6.0,0.86);make(0.15,5.28,0,6.0,0.57);
  return {root,grounded:true,update(c){stack.rotation.y=clamp(c.turn??0.12)*Math.PI*2;}};
 }
});

export const oilBarrel=defineModel({
 id:'oil-barrel',aliases:['drum','steel-drum','55-gallon-drum','fuel-barrel'],
 describe:'A steel oil drum has a rolled top and bottom lip, three circumferential strengthening ribs, offset bung caps and a curved barrel wall. roll makes it turn on its side.',
 controls:{roll:'0 upright .. 1 laid over and rolling'},defaults:{roll:0},size:'0.88 m tall',
 build(ctx){
  const root=new THREE.Group(),drum=new THREE.Group();root.add(drum);
  add(ctx,drum,G.lathe([[0.25,0],[0.29,0.025],[0.30,0.07],[0.29,0.12],[0.29,0.76],[0.30,0.81],[0.28,0.86],[0.25,0.88],[0,0.88],[0,0]],48),[0,0,0],[0,0,0],0.82);
  for(const y of [0.13,0.39,0.65,0.82])add(ctx,drum,G.torus(y===0.82?0.29:0.30,0.018,8,48),[0,y,0],[0,0,0],0.98);
  add(ctx,drum,G.torus(0.275,0.014,8,48),[0,0.055,0],[0,0,0],0.52);
  cylinder(ctx,drum,0.035,0.018,[0.11,0.895,0],0.42,20);
  add(ctx,drum,G.torus(0.03,0.009,8,24),[0.11,0.906,0],[0,0,0],0.96);
  cylinder(ctx,drum,0.021,0.018,[-0.10,0.895,0],0.48,16);
  return {root,grounded:true,update(c){const r=clamp(c.roll??0);drum.rotation.z=-r*Math.PI/2;drum.position.y=r*0.30;}};
 }
});

export const anvil=defineModel({
 id:'anvil',aliases:['blacksmith-anvil','smithing-anvil','forge-anvil'],
 describe:'A blacksmith anvil has a broad flat face, tapered horn, hardy and pritchel holes, waisted body and wide foot. strike makes the face rock with a brief rebound.',
 controls:{strike:'0 idle .. 1 repeated hammer strikes'},defaults:{strike:0},size:'0.55 m wide',
 build(ctx){
  const root=new THREE.Group();
  const profile:[number,number][]=[[-0.37,0.04],[0.37,0.04],[0.43,0.10],[0.36,0.17],[0.17,0.24],[0.14,0.42],[0.43,0.47],[0.59,0.53],[0.57,0.59],[-0.27,0.59],[-0.57,0.53],[-0.59,0.48],[-0.24,0.42],[-0.17,0.24],[-0.36,0.17]];
  add(ctx,root,G.extrude(profile,0.42,0.02),[0,0,0],[0,0,0],0.82);
  box(ctx,root,[0.78,0.035,0.45],[0,0.585,0],0.98,0.008);
  box(ctx,root,[0.11,0.025,0.04],[0.32,0.608,0.23],0.18,0.005);
  cylinder(ctx,root,0.025,0.018,[-0.13,0.61,0.225],0.18,20,[90,0,0]);
  // Flared horn edge and heel cap emphasize the long, flat working face.
  box(ctx,root,[0.06,0.035,0.44],[-0.52,0.54,0.22],0.98,0.01);
  box(ctx,root,[0.05,0.035,0.44],[0.53,0.56,0.22],0.96,0.01);
  root.scale.set(0.48,0.9,0.75);root.position.y=-0.036;
  return {root,grounded:true,update(c,t){const s=clamp(c.strike??0);root.position.y=-0.036+0.008*s*Math.max(0,Math.sin(t*7));root.rotation.z=Math.sin(t*7)*0.018*s;}};
 }
});

export const nutBolt=defineModel({
 id:'nut-bolt',aliases:['bolt-and-nut','hex-bolt','threaded-fastener','screw-bolt'],
 describe:'A hex-head steel bolt stands beside a matching hex nut, with beveled corners, threaded shaft, spiral thread ridge and a socket mark. turn rotates the bolt.',
 controls:{turn:'0..1 rotate the fastener'},defaults:{turn:0},size:'0.18 m display',
 build(ctx){
  const root=new THREE.Group(),bolt=new THREE.Group();root.add(bolt);
  const hex=(r:number,h:number)=>G.extrude(Array.from({length:6},(_,i)=>[Math.cos(i*Math.PI/3)*r,Math.sin(i*Math.PI/3)*r] as [number,number]),h,0.008);
  add(ctx,bolt,G.lathe([[0.044,0.04],[0.052,0.05],[0.052,0.075],[0.045,0.09],[0,0.09]],32),[0,0,0],[0,0,0],0.96);
  cylinder(ctx,bolt,0.026,0.13,[0,0.01,0],0.72,28);
  const helix:V3[]=[];for(let i=0;i<=120;i++){const u=i/120,a=u*Math.PI*2*7;helix.push([Math.cos(a)*0.029,-0.045+u*0.11,Math.sin(a)*0.029]);}tube(ctx,bolt,helix,0.004,0.98,160);
  add(ctx,bolt,hex(0.052,0.045),[0,0.112,0],[0,0,0],0.88);
  box(ctx,bolt,[0.042,0.009,0.009],[0,0.137,0],0.3,0.002);
  const nut=new THREE.Group();root.add(nut);nut.position.set(0.13,0,0.06);
  add(ctx,nut,G.extrude(Array.from({length:6},(_,i)=>[Math.cos(i*Math.PI/3)*0.07,Math.sin(i*Math.PI/3)*0.07] as [number,number]),0.045,0.009,[[[0.04,0],[0.02,0.035],[-0.02,0.035],[-0.04,0],[-0.02,-0.035],[0.02,-0.035]]]),[0,0.07,0],[90,0,0],0.83);
  add(ctx,nut,G.torus(0.046,0.008,8,24),[0,0.10,0],[0,0,0],0.96);
  root.scale.setScalar(0.70);root.position.y=0.0385;
  return {root,grounded:true,update(c){bolt.rotation.y=clamp(c.turn??0)*Math.PI*4;}};
 }
});

export const gearMachine=defineModel({
 id:'gear-machine',aliases:['gear-driven-machine','gearbox','industrial-gears','mechanical-gear-train'],
 describe:'An exposed gear train sits inside a steel bearing frame, with three meshing toothed wheels, shafts, bolts and a hand crank. drive turns the gears at linked ratios.',
 controls:{drive:'0 idle .. 1 fast gear rotation'},defaults:{drive:0.35},size:'1.2 m high',
 build(ctx){
  const root=new THREE.Group(),housing=new THREE.Group();root.add(housing);
  for(const x of [-0.58,0.58])for(const z of [-0.36,0.36])box(ctx,housing,[0.10,1.0,0.10],[x,0.50,z],0.55,0.02);
  box(ctx,housing,[1.32,0.12,0.88],[0,0.08,0],0.75,0.025);box(ctx,housing,[1.32,0.12,0.88],[0,0.92,0],0.75,0.025);
  const cover=box(ctx,housing,[1.20,0.10,0.055],[0,0.50,0.42],0.44,0.015);void cover;
  const gears=[gear(ctx,root,0.32,12,0.10,[-0.38,0.52,0.18],0.92),gear(ctx,root,0.22,10,0.10,[0.18,0.52,0.18],0.68),gear(ctx,root,0.15,8,0.10,[0.58,0.52,0.18],0.96)];
  // The helper's axle is local Y; the bearing shafts and crank run along Z.
  for(const wheel of gears)wheel.rotation.x=Math.PI/2;
  for(const [x,r] of [[-0.38,0.32],[0.18,0.22],[0.58,0.15]] as [number,number][]){
   cylinder(ctx,root,0.055,0.82,[x,0.52,0],0.52,20,[90,0,0]);
   add(ctx,root,G.torus(r*0.3,0.012,8,24),[x,0.52,-0.45],[0,0,0],0.95);
  }
  const crank=new THREE.Group();crank.position.set(-0.38,0.52,-0.47);root.add(crank);
  rodBetween(ctx,crank,[0,0,0],[0,0.22,0],0.025,0.96);rodBetween(ctx,crank,[0,0.22,0],[0.18,0.22,0],0.025,0.96);
  add(ctx,crank,G.capsule(0.025,0.16,5,12),[0.20,0.22,0],[0,0,90],0.6);
  root.scale.setScalar(1.2);root.position.y=-0.024;
  return {root,grounded:true,update(c,t){const a=t*clamp(c.drive??0.35)*4;gears[0]!.rotation.y=a;gears[1]!.rotation.y=-a*12/10;gears[2]!.rotation.y=a*12/8;crank.rotation.z=a;}};
 }
});

export const weldingTorch=defineModel({
 id:'welding-torch',aliases:['oxy-acetylene-torch','welding-gun','cutting-torch','torch-welder'],
 describe:'A gas welding torch has a knurled handle, twin control valves, angled mixer neck, brass nozzle, twin supply hoses and a bright adjustable welding flame. weld ignites it and glow sets its brightness.',
 controls:{weld:'0 off .. 1 welding flame',glow:'0..1 flame brightness'},defaults:{weld:0,glow:1},size:'0.35 m long',
 build(ctx){
  const root=new THREE.Group(),flame=new THREE.Group();
  add(ctx,root,G.lathe([[0.035,0],[0.052,0.03],[0.055,0.28],[0.044,0.33],[0.03,0.36],[0,0.36]],24),[0,0.22,0],[0,0,0],0.7);
  for(let y=0.05;y<0.24;y+=0.03)add(ctx,root,G.torus(0.054,0.005,6,24),[0,y,0],[0,0,0],0.96);
  for(const x of [-0.07,0.07]){
   cylinder(ctx,root,0.022,0.12,[x,0.49,0],0.93,16);
   box(ctx,root,[0.08,0.025,0.025],[x,0.55,0],0.6,0.006);
   add(ctx,root,G.torus(0.032,0.007,8,20),[x,0.44,0],[90,0,0],0.4);
  }
  rodBetween(ctx,root,[0,0.55,0],[0,0.72,0.20],0.032,0.85);
  rodBetween(ctx,root,[0,0.72,0.20],[0,0.82,0.45],0.024,0.95);
  add(ctx,root,G.lathe([[0.025,0],[0.038,0.03],[0.03,0.10],[0.018,0.13],[0.008,0.17],[0.002,0.18]],24),[0,0.80,0.44],[0,0,0],0.98);
  tube(ctx,root,[[0.06,0.12,0],[-0.14,0.06,0],[-0.23,-0.08,0],[-0.23,-0.34,0]],0.018,0.62,32);
  tube(ctx,root,[[-0.05,0.12,0.02],[-0.30,0.02,0.03],[-0.38,-0.12,0.03],[-0.38,-0.34,0.03]],0.018,0.86,32);
  flame.position.set(0,0.96,0.46);root.add(flame);
  flame.add(ctx.mesh(at(G.cone(0.045,0.32,20),[0,0.13,0]),{tone:1,glow:2.2,glowControl:'glow'}));
  flame.add(ctx.mesh(at(G.cone(0.022,0.23,16),[0,0.28,0]),{tone:1,glow:3.2,glowControl:'glow'}));
  root.scale.setScalar(0.22);root.position.y=0.075;
  return {root,grounded:true,update(c,t){const w=clamp(c.weld??0);flame.visible=w>0.01;flame.scale.set(lerp(0.65,1.15,w),w*(1+0.08*Math.sin(t*37)),lerp(0.65,1.15,w));}};
 }
});

export const hardHat=defineModel({
 id:'hard-hat',aliases:['hardhat','safety-helmet','construction-helmet','helmet'],
 describe:'A protective hard hat has a domed shell, broad projecting brim, rolled front peak, inner suspension band and raised reinforcement ribs. turn rotates the helmet for its profile.',
 controls:{turn:'0..1 rotate helmet'},defaults:{turn:0.12},size:'0.30 m wide',
 build(ctx){
  const root=new THREE.Group(),hat=new THREE.Group();root.add(hat);
  add(ctx,hat,G.lathe([[0,0.28],[0.12,0.37],[0.22,0.44],[0.34,0.45],[0.40,0.40],[0.42,0.32],[0.40,0.29],[0.36,0.34],[0.31,0.39],[0.20,0.39],[0.10,0.34],[0,0.29]],48),[0,0,0],[0,0,0],0.9);
  add(ctx,hat,G.ellipsoid(0.46,0.035,0.40,32,12),[0,0.30,0],[0,0,0],0.98);
  box(ctx,hat,[0.27,0.045,0.16],[0,0.33,0.34],0.82,0.025);
  for(const s of [-1,1]){
   add(ctx,hat,G.torus(0.24,0.012,8,32),[0,0.35,0],[0,0,0],0.48);
   rodBetween(ctx,hat,[s*0.24,0.34,0],[s*0.12,0.43,0],0.015,0.6);
  }
  for(const x of [-0.15,0,0.15])box(ctx,hat,[0.035,0.12,0.28],[x,0.43,-0.02],0.72,0.015);
  root.scale.setScalar(0.34);root.position.y=-0.0901;
  return {root,grounded:true,update(c){hat.rotation.y=clamp(c.turn??0.12)*Math.PI*2;}};
 }
});

export const trafficCone=defineModel({
 id:'traffic-cone',aliases:['road-cone','safety-cone','construction-cone','pylon-cone'],
 describe:'A roadwork traffic cone has a weighted square rubber base, tapered hollow-looking body and two reflective bands around its sloping surface. tip knocks the cone onto its side.',
 controls:{tip:'0 upright .. 1 lying over'},defaults:{tip:0},size:'0.75 m tall',
 build(ctx){
  const root=new THREE.Group(),cone=new THREE.Group();root.add(cone);
  box(ctx,cone,[0.62,0.09,0.62],[0,0.045,0],0.38,0.045);
  add(ctx,cone,G.lathe([[0.045,0.10],[0.07,0.12],[0.25,0.74],[0.26,0.76],[0.01,0.76],[0.045,0.10]],48),[0,0,0],[0,0,0],0.94);
  for(const y of [0.35,0.51]){
   const r=0.25*(1-(y-0.12)/0.64)+0.07;
   add(ctx,cone,G.torus(r,0.025,8,40),[0,y,0],[0,0,0],0.2);
  }
  add(ctx,cone,G.torus(0.068,0.012,8,24),[0,0.73,0],[0,0,0],0.5);
  return {root,grounded:true,update(c){const a=clamp(c.tip??0);cone.rotation.z=-a*1.35;cone.position.y=a*0.30;}};
 }
});

export const scaffolding=defineModel({
 id:'scaffolding',aliases:['construction-scaffold','scaffold-tower','steel-scaffold','work-platform'],
 describe:'A four-bay construction scaffold has steel standards, ledgers, diagonal cross-braces, toe boards, plank platforms and ladder access. sway flexes the frame subtly.',
 controls:{sway:'0..1 gentle construction-site sway'},defaults:{sway:0.1},size:'5 m tall',
 build(ctx){
  const root=new THREE.Group(),frame=new THREE.Group();root.add(frame);
  const xs=[-1,0,1],zs=[-0.48,0.48],ys=[0.08,1.45,2.82,4.19];
  for(const x of xs)for(const z of zs){rodBetween(ctx,frame,[x,0.06,z],[x,4.45,z],0.035,0.94);for(let y=0.3;y<4.4;y+=0.5)add(ctx,frame,G.torus(0.038,0.006,6,16),[x,y,z],[90,0,0],0.5);}
  for(const y of ys)for(const z of zs)for(let i=0;i<2;i++)rodBetween(ctx,frame,[xs[i]!,y,z],[xs[i+1]!,y,z],0.028,0.78);
  for(const y of ys)for(const x of xs)rodBetween(ctx,frame,[x,y,-0.48],[x,y,0.48],0.028,0.78);
  for(const z of zs)for(let i=0;i<2;i++)for(let l=0;l<3;l++){
   const y=ys[l]!;rodBetween(ctx,frame,[xs[i]!,y,z],[xs[i+1]!,y+1.37,z],0.022,0.65);rodBetween(ctx,frame,[xs[i+1]!,y,z],[xs[i]!,y+1.37,z],0.022,0.65);
  }
  for(const y of [1.45,2.82,4.19]){
   box(ctx,frame,[2.08,0.08,0.88],[0,y,0],0.76,0.018);
   for(const z of [-0.45,0.45])box(ctx,frame,[2.1,0.10,0.05],[0,y+0.09,z],0.92,0.012);
   for(let x=-0.9;x<=0.9;x+=0.3)box(ctx,frame,[0.02,0.015,0.78],[x,y+0.05,0],0.43,0.002);
  }
  for(const y of [1.45,2.82,4.19]){
   for(let i=0;i<7;i++)rodBetween(ctx,frame,[-0.9,y-1.25+i*0.18,-0.34],[-0.9,y-1.25+i*0.18,0.34],0.018,0.96);
   rodBetween(ctx,frame,[-0.9,y-1.3,-0.32],[-0.9,y,-0.32],0.025,0.66);rodBetween(ctx,frame,[-0.9,y-1.3,0.32],[-0.9,y,0.32],0.025,0.66);
  }
  root.scale.setScalar(1.12);root.position.y=-0.028;
  return {root,grounded:true,update(c,t){const s=clamp(c.sway??0.1);frame.rotation.z=Math.sin(t*1.2)*s*0.015;}};
 }
});

export const brickWall=defineModel({
 id:'brick-wall',aliases:['masonry-wall','brickwork','wall-under-construction','bricklaying'],
 describe:'A half-built running-bond brick wall shows staggered masonry, visible mortar joints, stepped unfinished top, foundation course and a bricklayer trowel. build adds courses of brick.',
 controls:{build:'0 foundation only .. 1 full wall'},defaults:{build:0.55},size:'2.4 m wide',
 build(ctx){
  const root=new THREE.Group(),bricks:THREE.Group[]=[];const rows=8,cols=8;
  box(ctx,root,[2.48,0.13,0.32],[0,0.065,0],0.48,0.015);
  for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
   const b=new THREE.Group(),offset=row%2?0.5:0;
   const x=-1.05+col*0.30+offset;
   if(x>1.16)continue;
   box(ctx,b,[0.285,0.14,0.30],[x,0.15+row*0.145,0],0.72+(row+col)%3*0.07,0.012);
   // A shallow struck joint on the front makes individual blocks legible.
   box(ctx,b,[0.25,0.009,0.012],[x,0.15+row*0.145-0.055,0.157],0.43,0.002);
   root.add(b);bricks.push(b);
  }
  box(ctx,root,[1.00,0.035,0.07],[-0.75,0.11,0.31],0.92,0.008);
  const trowel=new THREE.Group();root.add(trowel);
  extruded(ctx,trowel,[[-0.10,0],[0.10,0],[0.16,0.18],[-0.16,0.18]],0.025,[0.60,0.20,0.28],0.96,0.008);
  rodBetween(ctx,trowel,[0.60,0.20,0.30],[0.66,0.38,0.30],0.018,0.55);
  add(ctx,trowel,G.capsule(0.025,0.12,5,10),[0.66,0.45,0.30],[0,0,0],0.78);
  return {root,grounded:true,update(c){const f=clamp(c.build??0.55),limit=Math.ceil(f*bricks.length);for(let i=0;i<bricks.length;i++)bricks[i]!.visible=i<limit;trowel.visible=f>0.15&&f<0.98;}};
 }
});

export const steelIBeam=defineModel({
 id:'steel-ibeam',aliases:['i-beam','girder','steel-girder','structural-beam','h-beam'],
 describe:'A structural steel I-beam shows broad parallel flanges joined by a deep web, crisp cut ends and small flange fillets. turn rotates the beam to reveal its I-shaped section.',
 controls:{turn:'0..1 roll the beam'},defaults:{turn:0.12},size:'4 m long',
 build(ctx){
  const root=new THREE.Group(),beam=new THREE.Group();root.add(beam);
  box(ctx,beam,[0.82,0.14,3.1],[0,0.66,0],0.96,0.025);
  box(ctx,beam,[0.82,0.14,3.1],[0,0.07,0],0.78,0.025);
  box(ctx,beam,[0.15,0.50,3.1],[0,0.36,0],0.55,0.018);
  for(const z of [-1.56,1.56]){
   box(ctx,beam,[0.82,0.14,0.04],[0,0.66,z],1,0.006);
   box(ctx,beam,[0.82,0.14,0.04],[0,0.07,z],0.92,0.006);
   for(const x of [-0.3,-0.15,0,0.15,0.3])cylinder(ctx,beam,0.018,0.015,[x,0.62,z],0.98,12,[90,0,0]);
  }
  root.scale.setScalar(1.27);
  return {root,grounded:true,update(c){beam.rotation.y=clamp(c.turn??0.12)*Math.PI*2;}};
 }
});

export const generator=defineModel({
 id:'generator',aliases:['diesel-generator','portable-generator','backup-generator','genset'],
 describe:'A portable generator has a tubular steel cage, fuel tank, vented engine block, muffler exhaust, control panel with socket and warning lights, and heavy feet. run adds a steady engine vibration.',
 controls:{run:'0 off .. 1 running'},defaults:{run:0.25},size:'0.9 m wide',
 build(ctx){
  const root=new THREE.Group(),engine=new THREE.Group();root.add(engine);
  box(ctx,engine,[0.92,0.64,0.64],[0,0.54,0],0.76,0.06);
  box(ctx,engine,[0.80,0.18,0.62],[0,0.96,-0.02],0.88,0.04);
  box(ctx,engine,[0.40,0.31,0.08],[-0.22,0.53,0.36],0.18,0.02);
  for(let i=0;i<8;i++)box(ctx,engine,[0.29,0.018,0.02],[-0.22,0.42+i*0.035,0.412],0.72,0.004);
  for(const x of [-0.28,0.05,0.32])cylinder(ctx,engine,0.05,0.025,[x,0.59,0.425],iTone(x),18,[90,0,0]);
  box(ctx,engine,[0.28,0.26,0.08],[0.29,0.65,0.36],0.90,0.025);
  cylinder(ctx,engine,0.045,0.012,[0.22,0.70,0.41],0.98,18,[90,0,0]);
  cylinder(ctx,engine,0.038,0.012,[0.34,0.70,0.41],0.48,18,[90,0,0]);
  // Rectangular cage with rounded protective rails and lifting handle.
  for(const x of [-0.53,0.53])for(const z of [-0.42,0.42])rodBetween(ctx,root,[x,0.1,z],[x,1.2,z],0.028,0.96);
  for(const y of [0.12,1.16])for(const z of [-0.42,0.42])rodBetween(ctx,root,[-0.53,y,z],[0.53,y,z],0.028,0.8);
  for(const y of [0.12,1.16])for(const x of [-0.53,0.53])rodBetween(ctx,root,[x,y,-0.42],[x,y,0.42],0.028,0.8);
  rodBetween(ctx,root,[-0.38,1.16,-0.42],[-0.38,1.36,-0.42],0.028,0.96);rodBetween(ctx,root,[-0.38,1.36,-0.42],[0.38,1.36,-0.42],0.028,0.96);rodBetween(ctx,root,[0.38,1.36,-0.42],[0.38,1.16,-0.42],0.028,0.96);
  add(ctx,root,G.lathe([[0.04,0],[0.06,0.03],[0.06,0.14],[0.04,0.18]],20),[0.49,0.99,0.15],[0,0,0],0.55);
  for(const x of [-0.36,0.36])box(ctx,root,[0.12,0.09,0.52],[x,0.055,0],0.42,0.025);
  root.scale.set(0.9,0.62,0.85);root.position.y=-0.006;
  return {root,grounded:true,update(c,t){const r=clamp(c.run??0.25);engine.position.y=0.54+Math.sin(t*32)*0.006*r;engine.rotation.z=Math.sin(t*16)*0.003*r;}};
 }
});
function iTone(x:number){return x>0?0.82:0.56;}

export const waterTower=defineModel({
 id:'water-tower',aliases:['elevated-water-tank','water-tank-tower','standpipe','municipal-water-tower'],
 describe:'An elevated municipal water tower has a bulbous riveted steel tank, conical roof, overflow pipe, access ladder and four cross-braced legs. fill raises the visible water line inside the tank.',
 controls:{fill:'0 empty .. 1 full tank'},defaults:{fill:0.65},size:'28 m tall',
 build(ctx){
  const root=new THREE.Group(),tank=new THREE.Group(),water=new THREE.Group(),level=new THREE.Group();
  for(const s of [-1,1]){
   rodBetween(ctx,root,[s*1.05,0.08,s*0.78],[s*0.48,3.85,s*0.38],0.08,0.82);
   for(let y=0.65;y<3.85;y+=0.72){const k=y/3.85,x=s*(1.05-k*0.57),z=s*(0.78-k*0.4);rodBetween(ctx,root,[x,y,z],[x-s*0.18,y+0.72,z-s*0.12],0.035,0.62);}
  }
  for(const y of [0.14,0.75,1.48,2.20,2.92,3.75])for(const s of [-1,1])rodBetween(ctx,root,[s*(1.05-y/3.85*0.57),y,-0.78+y/3.85*0.4],[s*(1.05-y/3.85*0.57),y,0.78-y/3.85*0.4],0.032,0.72);
  for(const x of [-0.55,0.55])rodBetween(ctx,root,[x,3.82,-0.45],[x,4.30,-0.45],0.09,0.9);
  tank.position.y=4.0;root.add(tank);
  add(ctx,tank,G.lathe([[0.68,0],[0.82,0.08],[0.98,0.25],[1.0,0.52],[0.92,0.82],[0.70,1.00],[0.62,1.02],[0.60,0.92],[0.78,0.76],[0.84,0.5],[0.8,0.26],[0.68,0.08],[0.68,0]],48),[0,0,0],[0,0,0],0.82);
  add(ctx,tank,G.torus(0.69,0.035,10,48),[0,0.03,0],[0,0,0],0.96);
  add(ctx,tank,G.torus(0.63,0.025,10,48),[0,0.98,0],[0,0,0],0.7);
  add(ctx,tank,G.cone(0.73,0.38,40),[0,1.17,0],[0,0,0],0.94);
  for(let i=0;i<16;i++){const a=i*Math.PI/8;add(ctx,tank,G.sphere(0.018,8,6),[Math.cos(a)*0.84,0.55,Math.sin(a)*0.84],[0,0,0],0.45);}
  // A sight gauge exposes the changing water level on the front of the tank.
  add(ctx,water,G.cyl(0.78,0.78,0.012,40),[0,0,0],[0,0,0],0.43);tank.add(water);
  box(ctx,tank,[0.105,0.76,0.035],[0.69,0.52,0.75],0.16,0.025);
  for(let i=0;i<5;i++)box(ctx,tank,[0.13,0.018,0.04],[0.69,0.20+i*0.16,0.77],0.92,0.004);
  box(ctx,level,[0.052,0.66,0.022],[0,0.33,0],0.98,0.008);tank.add(level);
  tube(ctx,root,[[0.68,4.20,0],[0.92,4.0,0],[1.03,3.72,0],[1.03,3.30,0]],0.035,0.62);
  for(let i=0;i<12;i++)rodBetween(ctx,root,[0.48,0.20+i*0.22,0.78],[0.48,0.33+i*0.22,0.78],0.018,0.94);
  rodBetween(ctx,root,[0.48,0.2,0.78],[0.48,2.72,0.78],0.022,0.65);
  root.scale.setScalar(5.22);root.position.y=-0.418;
  return {root,grounded:true,update(c){const f=clamp(c.fill??0.65);water.position.y=0.18+f*0.58;water.visible=f>0.01;level.position.set(0.69,0.15+f*0.33,0.79);level.scale.y=f;level.visible=f>0.01;}};
 }
});

export const dam=defineModel({
 id:'dam',aliases:['hydroelectric-dam','reservoir-dam','concrete-dam','spillway'],
 describe:'A massive curved concrete dam blocks a reservoir, with upstream water, buttresses, arched spillway gates and channels pouring down the stepped face. release controls the spillway flow.',
 controls:{release:'0 gates shut .. 1 water released'},defaults:{release:0.32},size:'140 m high',
 build(ctx){
  const root=new THREE.Group(),waterfalls:THREE.Group[]=[];
  extruded(ctx,root,[[-3.0,0],[3.0,0],[2.25,4.65],[-2.25,4.65]],1.5,[0,0,0],0.70,0.08);
  // Crown road and parapet at the top.
  box(ctx,root,[6.0,0.15,0.48],[0,4.7,0],0.94,0.04);
  for(let x=-2.7;x<=2.7;x+=0.45)box(ctx,root,[0.12,0.24,0.42],[x,4.86,0],0.58,0.025);
  // Wide reservoir shelf behind the curved dam face.
  add(ctx,root,new THREE.CylinderGeometry(3.75,3.75,0.28,64,1,true,0,Math.PI*0.76),[0,4.35,-0.72],[0,0,0],0.34);
  for(let i=0;i<8;i++){
   const x=-2.3+i*0.66;
   box(ctx,root,[0.42,0.74,0.13],[x,4.26,0.32],i%2?0.90:0.78,0.025);
   box(ctx,root,[0.34,0.52,0.05],[x,4.27,0.40],0.16,0.02);
   const spill=new THREE.Group();root.add(spill);waterfalls.push(spill);
   add(ctx,spill,G.box(0.30,2.5,0.08),[x,1.75,0.44],[0,0,0],0.88);
   for(let j=0;j<3;j++)add(ctx,spill,G.sphere(0.09,10,6),[x+(j-1)*0.10,0.5,0.50],[0,0,0],0.96);
  }
  // Buttress ribs project from the downstream face.
  for(let i=0;i<7;i++){
   const x=-2.7+i*0.9;
   extruded(ctx,root,[[-0.28,0.1],[0.28,0.1],[0.18,4.35],[-0.18,4.35]],0.42,[x,0,0.48],0.52,0.012);
   for(let y=0.45;y<4.2;y+=0.7)box(ctx,root,[0.55,0.055,0.48],[x,y,0.67],0.86,0.01);
  }
  // Turbine house and tailrace outlet.
  box(ctx,root,[1.8,0.58,1.0],[0,0.60,-0.85],0.78,0.07);
  for(const x of [-0.55,0,0.55])add(ctx,root,G.torus(0.16,0.025,8,32),[x,0.68,-1.38],[90,0,0],0.96);
  root.scale.setScalar(28.1);
  return {root,grounded:true,update(c,t){const f=clamp(c.release??0.32);for(let i=0;i<waterfalls.length;i++){const w=waterfalls[i]!;w.visible=((i/2|0)%2===0)?f>0.1:f>0.65;w.scale.y=lerp(0.3,1.15,f)*(0.92+0.08*Math.sin(t*5+i));}}};
 }
});
