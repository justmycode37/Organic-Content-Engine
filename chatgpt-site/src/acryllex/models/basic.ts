import * as THREE from 'three';
import {G,at,deg,rng,lerp,clamp,smooth,roughen} from '../kit.ts';
import {defineModel,type ModelCtx} from './types.ts';

type Part={shape:string;size?:number[];r?:number;r2?:number;h?:number;R?:number;arc?:number;profile?:[number,number][];outline?:[number,number][];depth?:number;points?:[number,number,number][];pos?:[number,number,number];rot?:[number,number,number];scale?:number|[number,number,number];tone?:number;color?:string;glow?:number};

function partGeometry(p:Part):THREE.BufferGeometry|null{
 const s=p.size??[];const n=(v:number|undefined,f:number)=>Number.isFinite(v)?Math.max(0.0005,Math.min(50,v as number)):f;
 switch(p.shape){
  case 'box':return G.box(n(s[0],1),n(s[1],1),n(s[2],1));
  case 'rbox':case 'rounded-box':return G.rbox(n(s[0],1),n(s[1],1),n(s[2],1));
  case 'sphere':return G.sphere(n(p.r,0.5));
  case 'ellipsoid':return G.ellipsoid(n(s[0],0.5),n(s[1],0.3),n(s[2],0.4));
  case 'cylinder':return G.cyl(n(p.r,0.3),n(p.r2??p.r,0.3),n(p.h,1));
  case 'cone':return G.cone(n(p.r,0.3),n(p.h,0.6));
  case 'capsule':return G.capsule(n(p.r,0.2),n(p.h,0.6));
  case 'torus':return G.torus(n(p.R,0.5),n(p.r,0.1),16,48,deg(p.arc??360));
  case 'lathe':return Array.isArray(p.profile)&&p.profile.length>=2?G.lathe(p.profile.slice(0,64)):null;
  case 'extrude':return Array.isArray(p.outline)&&p.outline.length>=3?G.extrude(p.outline.slice(0,128),n(p.depth,0.1),0.004):null;
  case 'tube':return Array.isArray(p.points)&&p.points.length>=2?G.tube(p.points.slice(0,64),n(p.r,0.03)):null;
  case 'plane':return G.box(n(s[0],1),0.004,n(s[1],1));
  default:return null;
 }
}

/** Build anything from primitives. Used when no catalogue model matches. */
export const compose=defineModel({
 id:'compose',
 describe:'Build ANY object from primitives: params.parts = [{shape:"box"|"rbox"|"sphere"|"ellipsoid"|"cylinder"|"cone"|"capsule"|"torus"|"lathe"|"extrude"|"tube"|"plane", size:[w,h,d] (box/rbox/ellipsoid radii/plane [w,d]), r, r2, h, R, arc, profile:[[radius,y]...] (lathe, revolved around Y), outline:[[x,y]...] + depth (extrude), points:[[x,y,z]...] + r (tube), pos:[x,y,z], rot:[deg x,y,z], scale, tone 0.2..1, color, glow}] in metres, y up, front faces +z. Up to 60 parts. params.grounded:false to float.',
 params:{parts:'array of primitive parts (see describe)',grounded:'true (default) | false'},
 controls:{glow:'0..1 scales parts that set glow'},
 build(ctx){
  const root=new THREE.Group();const parts=(Array.isArray(ctx.params.parts)?ctx.params.parts:[]) as Part[];
  for(const p of parts.slice(0,60)){
   if(!p||typeof p!=='object')continue;const g=partGeometry(p);if(!g)continue;
   const sc=p.scale;at(g,(p.pos??[0,0,0]) as [number,number,number],(p.rot??[0,0,0]) as [number,number,number],typeof sc==='number'||Array.isArray(sc)?sc as number:1);
   root.add(ctx.mesh(g,{tone:clamp(Number(p.tone??0.9),0.1,1),color:typeof p.color==='string'?p.color:undefined,glow:Number(p.glow)||undefined}));
  }
  if(!root.children.length)root.add(ctx.mesh(G.rbox(1,1,1),{tone:0.9}));
  return {root,grounded:ctx.bool('grounded',true)};
 },
});

/** Voxel sculpture from text rows (layers bottom→top, rows back→front, '#' filled). */
export const voxels=defineModel({
 id:'voxels',aliases:['voxel','blocks','pixel-sculpture'],
 describe:'A sculpture of cubes: params.layers = array of layers (bottom to top), each an array of strings (rows back to front) where "#" is a cube, "." empty; params.cell metres per cube (default 0.1).',
 params:{layers:'string[][]',cell:'metres per cube'},
 build(ctx){
  const cell=ctx.num('cell',0.1,0.005,2);const layers=(Array.isArray(ctx.params.layers)?ctx.params.layers:[]) as string[][];
  const root=new THREE.Group();const geos:THREE.BufferGeometry[]=[];
  layers.slice(0,40).forEach((rows,y)=>(Array.isArray(rows)?rows:[]).slice(0,40).forEach((row,z)=>String(row).slice(0,40).split('').forEach((ch,x)=>{if(ch!=='.'&&ch!==' ')geos.push(at(G.box(cell*0.96,cell*0.96,cell*0.96),[x*cell,y*cell+cell/2,z*cell]));})));
  if(geos.length){const g=G.merge(geos);g.computeBoundingBox();const c=g.boundingBox!.getCenter(new THREE.Vector3());g.translate(-c.x,0,-c.z);root.add(ctx.mesh(g,{tone:0.95}));}
  else root.add(ctx.mesh(G.box(cell,cell,cell),{tone:1}));
  return {root,grounded:true};
 },
});

export const cube=defineModel({
 id:'cube',aliases:['block','box-shape'],
 describe:'A solid cube (abstract idea, building block, "first principles").',
 build(ctx){const r=new THREE.Group();r.add(ctx.mesh(at(G.box(1,1,1),[0,0.5,0]),{tone:1}));return {root:r,grounded:false};},
});

export const cubes=defineModel({
 id:'cubes',aliases:['cube-cluster','cluster','fragments'],
 describe:'A floating cluster of many cubes of different sizes (complexity, ideas, data); `spread` 0 packed .. 1 exploded apart.',
 params:{count:'10..80'},controls:{spread:'0 packed .. 1 scattered'},
 build(ctx){
  const n=Math.round(ctx.num('count',36,10,80)),r=rng(ctx.seed),root=new THREE.Group();const items:{m:THREE.Mesh;base:THREE.Vector3;dir:THREE.Vector3}[]=[];
  for(let i=0;i<n;i++){const s=0.12+r()*0.28;const m=ctx.mesh(G.box(s,s,s),{tone:0.6+r()*0.4});const base=new THREE.Vector3((r()-0.5)*0.9,(r()-0.5)*0.9,(r()-0.5)*0.9);m.position.copy(base);m.rotation.set(r()*0.4,r()*0.6,0);root.add(m);items.push({m,base,dir:base.clone().normalize().multiplyScalar(0.6+r()*0.8)});}
  return {root,grounded:false,update(c){const k=c.spread??0;for(const it of items)it.m.position.copy(it.base).addScaledVector(it.dir,k);}};
 },
});

export const arrow=defineModel({
 id:'arrow',aliases:['pointer','direction'],
 describe:'A thick 3D arrow pointing right (+x); rotate it with rot to point elsewhere.',
 build(ctx){const r=new THREE.Group();r.add(ctx.mesh(G.extrude([[-0.5,-0.09],[0.15,-0.09],[0.15,-0.22],[0.5,0],[0.15,0.22],[0.15,0.09],[-0.5,0.09]],0.12,0.01),{tone:1}));return {root:r,grounded:false};},
});

export const building=defineModel({
 id:'building',aliases:['office-building','skyscraper','tower','lab','laboratory','factory','company'],
 describe:'A modern multi-storey building with a grid of recessed windows; `lights` turns windows on.',
 params:{floors:'2..40',width:'metres'},controls:{lights:'0..1 lit windows'},
 build(ctx){
  const floors=Math.round(ctx.num('floors',8,2,40)),w=ctx.num('width',12,4,40),h=floors*3.4,d=w*0.7,root=new THREE.Group();
  root.add(ctx.mesh(at(G.box(w,h,d),[0,h/2,0]),{tone:0.75}));
  const cols=Math.max(3,Math.round(w/2.2)),r=rng(ctx.seed);
  for(let f=0;f<floors;f++)for(let c=0;c<cols;c++){const lit=r()>0.5;root.add(ctx.mesh(at(G.box(w/cols*0.62,2.1,0.2),[-w/2+(c+0.5)*w/cols,1.9+f*3.4,d/2+0.02]),{tone:0.25,glow:lit?1.2:0,glowControl:'lights'}));}
  root.add(ctx.mesh(at(G.box(w*1.03,0.5,d*1.03),[0,h+0.25,0]),{tone:0.9}));
  return {root,grounded:true};
 },
});

export const city=defineModel({
 id:'city',aliases:['skyline','cityscape','town'],
 describe:'A city skyline of many buildings with window grids, seen from the side; `build` 0..1 makes buildings rise from the ground.',
 params:{count:'6..40 buildings'},controls:{build:'0 flat .. 1 full height (default 1)'},defaults:{build:1},
 build(ctx){
  const n=Math.round(ctx.num('count',18,6,40)),r=rng(ctx.seed),root=new THREE.Group();const items:THREE.Group[]=[];let x=0;
  for(let i=0;i<n;i++){const w=4+r()*7,h=8+r()*r()*55,d=6+r()*6,g=new THREE.Group();
   g.add(ctx.mesh(at(G.box(w,h,d),[0,h/2,0]),{tone:0.55+r()*0.4}));
   const rows=Math.floor(h/3.2),cols=Math.max(2,Math.floor(w/1.6));
   const win=[] as THREE.BufferGeometry[];for(let a=0;a<rows;a++)for(let b=0;b<cols;b++)if(r()>0.25)win.push(at(G.box(w/cols*0.55,1.6,0.3),[-w/2+(b+0.5)*w/cols,1.8+a*3.2,d/2]));
   if(win.length)g.add(ctx.mesh(G.merge(win),{tone:1}));
   g.position.set(x+w/2,0,(r()-0.5)*8);x+=w+0.6;root.add(g);items.push(g);}
  root.children.forEach(c=>c.position.x-=x/2);
  return {root,grounded:true,update(c){const k=c.build??1;items.forEach((g,i)=>{const kk=smooth(clamp(k*1.6-i/items.length*0.6));g.scale.y=Math.max(0.001,kk);});}};
 },
});

export const stairs=defineModel({
 id:'stairs',aliases:['staircase','steps','level-up'],
 describe:'A wide staircase rising to the right (progress, levelling up).',
 params:{steps:'3..14'},
 build(ctx){const n=Math.round(ctx.num('steps',7,3,14)),root=new THREE.Group();for(let i=0;i<n;i++)root.add(ctx.mesh(at(G.box(0.5,0.3*(i+1),3),[i*0.5,0.15*(i+1),0]),{tone:0.7+0.3*i/n}));return {root,grounded:true};},
});

export const wave=defineModel({
 id:'wave',aliases:['ocean-wave','ocean','sea','water','tsunami'],
 describe:'A big curling ocean wave (barrel) with a foamy crest, animated; `calm` 1 flattens it to gentle sea swells.',
 controls:{calm:'0 big curl .. 1 calm sea'},
 build(ctx){
  const root=new THREE.Group();const geo=new THREE.PlaneGeometry(8,4,160,80);geo.rotateX(-Math.PI/2);
  const pos=geo.attributes.position!;const base=Float32Array.from(pos.array as Float32Array);
  const m=ctx.mesh(geo,{tone:0.9,side:THREE.DoubleSide});root.add(m);
  return {root,grounded:false,update(c,t){
   const calm=c.calm??0;
   for(let i=0;i<pos.count;i++){
    const x=base[i*3]!,z=base[i*3+2]!;
    const swell=0.08*Math.sin(x*2.1-t*1.6+z*1.3)+0.05*Math.sin(x*3.7+z*2.9+t*1.1);
    // a curl: lift near crest line and push forward over the trough
    const crest=Math.exp(-Math.pow((x-0.6*Math.sin(t*0.3)+z*0.15)/1.2,2));const h=crest*1.6*(1-calm);
    const curl=crest*Math.max(0,(z+0.5))*0.5*(1-calm);
    pos.setXYZ(i,x-curl*0.6,swell+h*smooth(clamp((z+2)/3)),z+curl*0.2);
   }
   pos.needsUpdate=true;geo.computeVertexNormals();
  }};
 },
});

export const bed=defineModel({
 id:'bed',aliases:['mattress','bedroom'],
 describe:'A single bed with headboard, mattress, pillow and blanket; a person `on` it in pose "sleep" lies under the blanket.',
 size:'2 m long',
 build(ctx){
  const root=new THREE.Group();
  root.add(ctx.mesh(at(G.box(2.0,0.25,0.95),[0,0.22,0]),{tone:0.55}));
  for(const x of [-0.95,0.95])for(const z of [-0.42,0.42])root.add(ctx.mesh(at(G.box(0.06,0.12,0.06),[x,0.06,z]),{tone:0.5}));
  root.add(ctx.mesh(at(G.rbox(1.95,0.2,0.92,0.06),[0,0.44,0]),{tone:0.9}));
  root.add(ctx.mesh(at(G.rbox(0.08,0.95,0.98,0.03),[-1.02,0.5,0]),{tone:0.65}));
  root.add(ctx.mesh(at(G.rbox(0.4,0.12,0.6,0.05),[-0.72,0.6,0]),{tone:1}));
  return {root,grounded:true,anchors:{seat:[0.05,0.55,0],top:[0,0.55,0]},seatFacing:0};
 },
});

/** Shared surface helper for organic shapes. */
export function blob(ctx:ModelCtx,rx:number,ry:number,rz:number,rough=0.03,freq=8,tone=0.9){return ctx.mesh(roughen(G.ellipsoid(rx,ry,rz,64,48),rough,freq,ctx.seed%7),{tone});}

export const brain=defineModel({
 id:'brain',aliases:['mind','human-brain'],
 describe:'A human brain seen from the side: two folded hemispheres with gyri, cerebellum and brain stem; `active` makes regions flicker with light (thinking/dreaming).',
 controls:{active:'0..1 flickering activity'},
 build(ctx){
  const root=new THREE.Group();
  const cortex=(side:number)=>{const g=G.ellipsoid(0.34,0.27,0.2,96,72);const p=g.attributes.position!;const v=new THREE.Vector3();
   for(let i=0;i<p.count;i++){v.set(p.getX(i),p.getY(i),p.getZ(i));const n=v.clone().normalize();const fold=0.016*Math.sin(v.x*38+Math.sin(v.y*21)*2.4)+0.012*Math.sin(v.y*44+v.z*31+Math.sin(v.x*17)*2)+0.008*Math.sin(v.z*60+v.x*23);v.addScaledVector(n,fold);if(v.y<-0.12)v.y=lerp(v.y,-0.12,0.5);p.setXYZ(i,v.x,v.y,v.z);}
   g.computeVertexNormals();return at(g,[0,0,side*0.105]);};
  root.add(ctx.mesh(cortex(1),{tone:0.95}),ctx.mesh(cortex(-1),{tone:0.95}));
  root.add(ctx.mesh(roughen(at(G.ellipsoid(0.15,0.09,0.17,48,32),[-0.2,-0.2,0]),0.008,40,3),{tone:0.8}));
  root.add(ctx.mesh(at(G.cyl(0.05,0.04,0.22,16),[-0.08,-0.3,0],[0,0,-15]),{tone:0.7}));
  const sparks:THREE.Mesh[]=[];const r=rng(ctx.seed);
  for(let i=0;i<14;i++){const s=ctx.mesh(at(G.sphere(0.035,10,8),[(r()-0.5)*0.55,(r()-0.2)*0.4,(r()>0.5?1:-1)*(0.2+r()*0.06)]),{tone:1,glow:4,glowControl:'active'});s.visible=false;root.add(s);sparks.push(s);}
  return {root,grounded:false,update(c,t){const a=c.active??0;sparks.forEach((s,i)=>{s.visible=a>0.01&&Math.sin(t*(3+i%5)+i*1.7)>0.2;});}};
 },
});

export const atom=defineModel({
 id:'atom',aliases:['nucleus','electron','particle'],
 describe:'A Bohr-style atom: clustered nucleus of protons/neutrons with electrons orbiting on three tilted rings (animated).',
 params:{electrons:'1..6'},controls:{speed:'orbit speed multiplier (default 1)'},defaults:{speed:1},
 build(ctx){
  const root=new THREE.Group(),r=rng(ctx.seed);
  for(let i=0;i<14;i++){const v=new THREE.Vector3(r()-0.5,r()-0.5,r()-0.5).normalize().multiplyScalar(0.09*Math.cbrt(r()));root.add(ctx.mesh(at(G.sphere(0.06,16,12),[v.x,v.y,v.z]),{tone:i%2?1:0.6}));}
  const n=Math.round(ctx.num('electrons',3,1,6));const rings:{g:THREE.Group;e:THREE.Mesh}[]=[];
  for(let i=0;i<n;i++){const g=new THREE.Group();g.rotation.set(deg(70),deg(i*180/n),deg(20+i*25));g.add(ctx.mesh(G.torus(0.62,0.006,6,96),{tone:0.6}));const e=ctx.mesh(G.sphere(0.04,14,10),{tone:1,glow:2});g.add(e);root.add(g);rings.push({g,e});}
  return {root,grounded:false,update(c,t){const sp=c.speed??1;rings.forEach(({e},i)=>{const a=t*sp*(1.6+i*0.4)+i*2;e.position.set(Math.cos(a)*0.62,Math.sin(a)*0.62,0);});}};
 },
});

export const lattice=defineModel({
 id:'lattice',aliases:['crystal','crystal-lattice','molecule-grid','semiconductor-crystal','gallium-nitride'],
 describe:'A crystal lattice: a cube of atoms (two alternating kinds, big and small) joined by bonds. `crack` splits the crystal along a jagged fault and pushes the halves apart; `defects` knocks atoms out of place.',
 params:{n:'3..6 atoms per edge'},controls:{crack:'0 intact .. 1 broken apart',defects:'0 perfect .. 1 messy'},
 build(ctx){
  const n=Math.round(ctx.num('n',4,3,6)),root=new THREE.Group(),A=new THREE.Group(),B=new THREE.Group();root.add(A,B);
  const step=0.3,off=(n-1)*step/2,r=rng(ctx.seed);const atoms:{m:THREE.Mesh;base:THREE.Vector3;jit:THREE.Vector3}[]=[];
  const side=(x:number,y:number)=>x+y*0.35+(((x*7+y*3)%2)-0.5)*0.15>off*0.9;
  for(let x=0;x<n;x++)for(let y=0;y<n;y++)for(let z=0;z<n;z++){
   const big=(x+y+z)%2===0;const p=new THREE.Vector3(x*step-off,y*step-off,z*step-off);
   const m=ctx.mesh(G.sphere(big?0.075:0.05,18,14),{tone:big?1:0.7});m.position.copy(p);
   (side(x*step,y*step)?B:A).add(m);atoms.push({m,base:p.clone(),jit:new THREE.Vector3(r()-0.5,r()-0.5,r()-0.5).multiplyScalar(0.16)});
   for(const [dx,dy,dz] of [[1,0,0],[0,1,0],[0,0,1]] as const){if(x+dx>=n||y+dy>=n||z+dz>=n)continue;
    const q=new THREE.Vector3((x+dx)*step-off,(y+dy)*step-off,(z+dz)*step-off);const sameSide=side(x*step,y*step)===side((x+dx)*step,(y+dy)*step);if(!sameSide)continue;
    const mid=p.clone().add(q).multiplyScalar(0.5);const bond=ctx.mesh(G.cyl(0.014,0.014,step,8),{tone:0.55});bond.position.copy(mid);if(dx)bond.rotation.z=Math.PI/2;if(dz)bond.rotation.x=Math.PI/2;(side(x*step,y*step)?B:A).add(bond);}
  }
  return {root,grounded:false,update(c){const k=c.crack??0,d=c.defects??0;A.position.set(-0.25*k,-0.08*k,0);A.rotation.z=deg(-8)*k;B.position.set(0.25*k,0.08*k,0);B.rotation.z=deg(8)*k;for(const a of atoms)a.m.position.copy(a.base).addScaledVector(a.jit,d);}};
 },
});

export const sun=defineModel({
 id:'sun',aliases:['star'],
 describe:'The sun: a bright glowing sphere with a rippling surface and halo.',
 build(ctx){const r=new THREE.Group();r.add(ctx.mesh(roughen(G.sphere(1,64,48),0.02,9,2),{tone:1,glow:3}));return {root:r,grounded:false,update(_c,t){r.rotation.y=t*0.1;}};},
});

export const moon=defineModel({
 id:'moon',aliases:['planet-moon'],
 describe:'The moon: a grey sphere covered with round craters.',
 build(ctx){const g=G.sphere(1,96,64);const p=g.attributes.position!,v=new THREE.Vector3(),rr=rng(ctx.seed+3);const craters=Array.from({length:28},()=>({c:new THREE.Vector3(rr()-0.5,rr()-0.5,rr()-0.5).normalize(),s:0.06+rr()*0.22}));
  for(let i=0;i<p.count;i++){v.set(p.getX(i),p.getY(i),p.getZ(i));let d=0;for(const c of craters){const a=v.angleTo(c.c)/c.s;if(a<1.25)d+=a<1?-(1-a*a)*0.05*c.s*3:0.02*c.s*3*(1.25-a)*4;}v.multiplyScalar(1+d);p.setXYZ(i,v.x,v.y,v.z);}
  g.computeVertexNormals();const r=new THREE.Group();r.add(ctx.mesh(g,{tone:0.9}));return {root:r,grounded:false};},
});
