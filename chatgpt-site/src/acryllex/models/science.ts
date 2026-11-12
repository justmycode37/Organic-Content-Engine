// science model pack (see docs/acryllex.md). Export ModelDefs from this file.
import * as THREE from 'three';
import {G,at,deg,rng,lerp,clamp,smooth,ease,hash1,roughen} from '../kit.ts';
import {defineModel,type ModelCtx} from './types.ts';

type V3=[number,number,number];

// ---------------------------------------------------------------- helpers
/** Cylinder between two points (for rods, bonds, struts, traces). */
function rod(a:V3,b:V3,r:number,seg=10,r2=r){
 const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),d=B.clone().sub(A),len=Math.max(1e-5,d.length());
 const g=G.cyl(r2,r,len,seg);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()));
 const m=A.add(B).multiplyScalar(0.5);g.translate(m.x,m.y,m.z);return g;
}
/** Unit beam geometry along +x from 0 to 1 (radius r0 at start, r1 at end). */
function beamGeo(r0:number,r1:number,seg=12){const g=G.cyl(r1,r0,1,seg);g.rotateZ(-Math.PI/2);g.translate(0.5,0,0);return g;}
const _q=new THREE.Quaternion(),_X=new THREE.Vector3(1,0,0),_d=new THREE.Vector3(),_Y=new THREE.Vector3(0,1,0);
/** Point a beamGeo mesh from a to b, drawn to fraction k. */
function aim(m:THREE.Object3D,a:THREE.Vector3,b:THREE.Vector3,k:number){
 _d.copy(b).sub(a);const len=_d.length();m.position.copy(a);
 if(len>1e-6)m.quaternion.setFromUnitVectors(_X,_d.multiplyScalar(1/len));
 m.scale.set(Math.max(1e-4,len*clamp(k)),1,1);m.visible=k>0.003;
}
/** Invisible two-point geometry that keeps camera framing stable while animated parts are hidden or scaled. */
function bounds(ctx:ModelCtx,parent:THREE.Object3D,min:V3,max:V3){
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array([...min,...max]),3));
 const m=ctx.mesh(g,{tone:0.01});m.visible=false;parent.add(m);return m;
}
/** See-through glass: stochastic transparency that survives the engine's per-frame opacity reveal. */
function glassy(m:THREE.Mesh,k:number){
 const mat=m.material as THREE.MeshStandardMaterial;let v=1;
 Object.defineProperty(mat,'opacity',{get:()=>v*k,set:(x:number)=>{v=x;},configurable:true});
 return m;
}
const vec=(ctx:ModelCtx,key:string,f:V3):THREE.Vector3=>{const v=ctx.params[key];if(Array.isArray(v)&&v.length>=3&&v.slice(0,3).every(n=>Number.isFinite(Number(n))))return new THREE.Vector3(...v.slice(0,3).map(n=>clamp(Number(n),-50,50)) as V3);return new THREE.Vector3(...f);};
const nums=(ctx:ModelCtx,key:string,f:number[]):number[]=>{const v=ctx.params[key];if(Array.isArray(v)){const a=v.map(Number).filter(Number.isFinite).slice(0,24);if(a.length)return a;}return f;};
const colorParam=(ctx:ModelCtx,key='color')=>{const v=ctx.params[key];return typeof v==='string'&&v.trim()?v.trim().toLowerCase():undefined;};
const wrapUp=(root:THREE.Object3D,y:number)=>{root.position.y=y;const w=new THREE.Group();w.add(root);return w;};
/** Smooth 0..1 sub-range of a control. */
const seg=(k:number,a:number,b:number)=>smooth((k-a)/(b-a));

/** Tube whose centreline is recomputed every frame (no allocation): springs, waves. */
function dynTube(ctx:ModelCtx,n:number,radial:number,r:number,opts:Parameters<ModelCtx['mesh']>[1]){
 const verts=(n+1)*(radial+1),pos=new Float32Array(verts*3),idx:number[]=[];
 for(let i=0;i<n;i++)for(let j=0;j<radial;j++){const a=i*(radial+1)+j,b=a+radial+1;idx.push(a,b,a+1,b,b+1,a+1);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();
 const mesh=ctx.mesh(g,opts);const pts=Array.from({length:n+1},()=>new THREE.Vector3());
 const t=new THREE.Vector3(),nn=new THREE.Vector3(),bb=new THREE.Vector3(),ref=new THREE.Vector3();
 let rr=r;
 return {mesh,setRadius(v:number){rr=v;},set(fn:(u:number,out:THREE.Vector3)=>void,refAxis:THREE.Vector3=_Y){
  for(let i=0;i<=n;i++)fn(i/n,pts[i]!);
  for(let i=0;i<=n;i++){
   t.copy(pts[Math.min(n,i+1)]!).sub(pts[Math.max(0,i-1)]!).normalize();
   ref.copy(refAxis);if(Math.abs(t.dot(ref))>0.95)ref.set(0,0,1);
   nn.crossVectors(ref,t).normalize();bb.crossVectors(t,nn).normalize();
   for(let j=0;j<=radial;j++){const a=j/radial*Math.PI*2,c=Math.cos(a)*rr,s=Math.sin(a)*rr,p=pts[i]!;
    const k=(i*(radial+1)+j)*3;pos[k]=p.x+nn.x*c+bb.x*s;pos[k+1]=p.y+nn.y*c+bb.y*s;pos[k+2]=p.z+nn.z*c+bb.z*s;}
  }
  g.attributes.position!.needsUpdate=true;g.computeVertexNormals();g.computeBoundingSphere();
 }};
}

/** Polyline walker: point at arc-length fraction u. */
function polyline(points:THREE.Vector3[]){
 const L:number[]=[0];for(let i=1;i<points.length;i++)L.push(L[i-1]!+points[i]!.distanceTo(points[i-1]!));
 const total=L[L.length-1]||1;
 return {total,at(u:number,out:THREE.Vector3){const d=clamp(u)*total;let i=1;while(i<L.length-1&&L[i]!<d)i++;const a=points[i-1]!,b=points[i]!,s=(d-L[i-1]!)/Math.max(1e-6,L[i]!-L[i-1]!);return out.copy(a).lerp(b,clamp(s));}};
}

// ---------------------------------------------------------------- optics
const SPECTRUM=['#ff1a1a','#ff7a10','#ffe01a','#2bea3a','#18c8ff','#2850ff','#8a2bff'];

export const prism=defineModel({
 id:'prism',aliases:['glass-prism','triangular-prism','dispersion','rainbow-prism','spectrum','newton-prism'],
 describe:'A glass triangular prism with bright bevelled edges; a white light beam enters the left face, bends inside and leaves the right face fanned into a rainbow (red bent least at top .. violet bent most at bottom). `split` animates it: 0 no light, 0..0.4 white beam travels in, 0.4..1 rainbow fans out.',
 controls:{split:'0 no light .. 1 full rainbow (default 1)'},defaults:{split:1},size:'0.6 m prism, beams ~3.4 m wide',
 build(ctx){
  const root=new THREE.Group(),s=0.62,h=s*Math.sqrt(3)/2,D=0.34;
  const A:[number,number]=[-s/2,-h/3],B:[number,number]=[s/2,-h/3],C:[number,number]=[0,2*h/3];
  const body=ctx.mesh(G.extrude([A,B,C],D,0.012),{tone:0.75,rough:0.12,side:THREE.DoubleSide});glassy(body,0.42);root.add(body);
  // crisp edges (glass edges catch light)
  const edges:THREE.BufferGeometry[]=[];const P=[A,B,C];
  for(let i=0;i<3;i++){const p=P[i]!,q=P[(i+1)%3]!;for(const z of [D/2,-D/2])edges.push(rod([p[0],p[1],z],[q[0],q[1],z],0.006,8));edges.push(rod([p[0],p[1],D/2],[p[0],p[1],-D/2],0.006,8));}
  root.add(ctx.mesh(G.merge(edges),{tone:1,rough:0.2}));
  // light path (minimum-deviation geometry)
  const H1=new THREE.Vector3(lerp(A[0],C[0],0.47),lerp(A[1],C[1],0.47),0),H2=new THREE.Vector3(-H1.x,H1.y,0);
  const P0=new THREE.Vector3(-1.7,H1.y-Math.tan(deg(17))*(1.7+H1.x),0);
  const white=ctx.mesh(beamGeo(0.014,0.014),{color:'#ffffff',tone:1,glow:2.2,glowControl:'beam'});root.add(white);
  const inner=ctx.mesh(beamGeo(0.012,0.02),{color:'#ffffff',tone:1,glow:1.6,glowControl:'beam'});root.add(inner);
  const rays=SPECTRUM.map((c,i)=>{const m=ctx.mesh(beamGeo(0.009,0.02),{color:c,tone:1,glow:2.4,glowControl:'beam'});root.add(m);
   const a=deg(-(14+i*2.6)),len=1.55;const s0=new THREE.Vector3(H2.x+0.004*i,H2.y-0.006*i,0);return {m,s0,e:new THREE.Vector3(s0.x+Math.cos(a)*len,s0.y+Math.sin(a)*len,0)};});
  // faint fan sheet behind the rays so the spectrum reads as a band
  bounds(ctx,root,[-1.75,-0.85,-0.2],[1.75,0.45,0.2]);
  return {root,grounded:false,update(c){
   const k=clamp(c.split??1);c.beam=1;
   aim(white,P0,H1,seg(k,0,0.32));aim(inner,H1,H2,seg(k,0.32,0.42));
   rays.forEach((r,i)=>aim(r.m,r.s0,r.e,seg(k,0.42+i*0.015,0.92+i*0.012)));
  }};
 },
});

export const lightBeam=defineModel({
 id:'light-beam',aliases:['beam','ray','light-ray','beam-of-light','photon-beam','laser-beam'],
 describe:'A glowing ray of light from point `from` to point `to` with bright pulses travelling along it. `on` 0..1 shoots the beam out from its start.',
 params:{from:'[x,y,z] metres (default [-1.2,0,0])',to:'[x,y,z] (default [1.2,0,0])',color:'hue name or hex (default scene hue)',width:'beam radius m (default 0.02)'},
 controls:{on:'0 off .. 1 full beam (default 1)',speed:'pulse speed (default 1)'},defaults:{on:1,speed:1},
 build(ctx){
  const root=new THREE.Group(),a=vec(ctx,'from',[-1.2,0,0]),b=vec(ctx,'to',[1.2,0,0]),col=colorParam(ctx),w=ctx.num('width',0.02,0.003,0.5);
  if(a.distanceTo(b)<0.01)b.x+=1;
  const core=ctx.mesh(beamGeo(w*0.6,w*0.6),{color:col,tone:1,glow:2.6,glowControl:'on'});
  const sheath=ctx.mesh(beamGeo(w*1.5,w*1.5,16),{color:col,tone:0.5,glow:0.5,glowControl:'on'});glassy(sheath,0.35);
  root.add(core,sheath);
  const src=ctx.mesh(G.sphere(w*1.8,16,12),{color:col,tone:1,glow:3,glowControl:'on'});src.position.copy(a);root.add(src);
  const pulses=[0,1,2,3].map(()=>{const m=ctx.mesh(G.capsule(w*1.25,w*5,4,10),{color:col,tone:1,glow:4,glowControl:'on'});m.rotation.z=Math.PI/2;const g=new THREE.Group();g.add(m);root.add(g);return g;});
  const dir=b.clone().sub(a).normalize();pulses.forEach(p=>p.quaternion.setFromUnitVectors(_X,dir));
  bounds(ctx,root,[Math.min(a.x,b.x),Math.min(a.y,b.y)-w*2,Math.min(a.z,b.z)],[Math.max(a.x,b.x),Math.max(a.y,b.y)+w*2,Math.max(a.z,b.z)]);
  const tmp=new THREE.Vector3();
  return {root,grounded:false,update(c,t){
   const k=ease.out(clamp(c.on??1));aim(core,a,b,k);aim(sheath,a,b,k);src.visible=k>0.003;
   pulses.forEach((p,i)=>{const u=((t*0.55*(c.speed??1))+i/4)%1;p.visible=k>0.02&&u<k;p.position.copy(tmp.copy(a).lerp(b,u));});
  }};
 },
});

export const laser=defineModel({
 id:'laser',aliases:['laser-pointer','laser-module','lab-laser','laser-emitter'],
 describe:'A lab laser: ribbed metal housing with heat-sink fins, a front lens collar and a status light, firing a thin intense beam out of the front (+x). `on` fires the beam.',
 params:{color:'beam colour (hue name or hex, default scene hue)',length:'beam length m (default 1.6)'},
 controls:{on:'0 off .. 1 firing (default 1)'},defaults:{on:1},size:'0.45 m housing',
 build(ctx){
  const root=new THREE.Group(),col=colorParam(ctx),L=ctx.num('length',1.6,0.2,20);
  root.add(ctx.mesh(at(G.rbox(0.36,0.12,0.12,0.014),[0,0,0]),{tone:0.78,rough:0.35}));
  const fins:THREE.BufferGeometry[]=[];for(let i=0;i<9;i++)fins.push(at(G.box(0.012,0.15,0.15),[-0.15+i*0.025,0,0]));
  root.add(ctx.mesh(G.merge(fins),{tone:0.95,rough:0.4}));
  root.add(ctx.mesh(at(G.box(0.1,0.006,0.124),[0.08,0.063,0]),{tone:0.45}));
  root.add(ctx.mesh(at(G.cyl(0.05,0.05,0.05,32),[0.205,0,0],[0,0,90]),{tone:0.65}));
  root.add(ctx.mesh(at(G.cyl(0.042,0.046,0.04,32),[0.245,0,0],[0,0,90]),{tone:0.9,rough:0.3}));
  root.add(ctx.mesh(at(G.torus(0.032,0.006,8,32),[0.266,0,0],[0,90,0]),{tone:1}));
  root.add(ctx.mesh(at(G.cyl(0.026,0.026,0.004,24),[0.265,0,0],[0,0,90]),{color:col,tone:0.6,glow:2,glowControl:'on'}));
  root.add(ctx.mesh(at(G.cyl(0.012,0.012,0.012,16),[0.05,0.066,0.035]),{color:'#ff3030',tone:0.8,glow:2.5,glowControl:'on'}));
  root.add(ctx.mesh(at(G.cyl(0.018,0.018,0.06,16),[-0.21,0,0],[0,0,90]),{tone:0.5}));
  root.add(ctx.mesh(G.tube([[-0.24,0,0],[-0.32,-0.02,0],[-0.36,-0.1,0.04]],0.01,16,8),{tone:0.4}));
  for(const z of [-0.04,0.04])root.add(ctx.mesh(at(G.box(0.05,0.05,0.012),[0,-0.085,z]),{tone:0.55}));
  root.add(ctx.mesh(at(G.rbox(0.2,0.02,0.14,0.006),[0,-0.12,0]),{tone:0.7}));
  const beam=ctx.mesh(beamGeo(0.008,0.009),{color:col,tone:1,glow:3.2,glowControl:'on'});root.add(beam);
  const spot=ctx.mesh(G.sphere(0.022,16,12),{color:col,tone:1,glow:4,glowControl:'on'});root.add(spot);
  const a=new THREE.Vector3(0.268,0,0),b=new THREE.Vector3(0.268+L,0,0);
  bounds(ctx,root,[-0.4,-0.13,-0.08],[0.3+L,0.1,0.08]);
  return {root:wrapUp(root,0.13),grounded:true,update(c){const k=ease.out(clamp(c.on??1));aim(beam,a,b,k);spot.position.copy(a).lerp(b,k);spot.visible=k>0.98;}};
 },
});

export const magnet=defineModel({
 id:'magnet',aliases:['horseshoe-magnet','magnetic-field','magnetism','u-magnet'],
 describe:'A horseshoe magnet (arch up, two legs down) with shiny pole tips — the N pole tip darker, the S tip bright — and curved magnetic field lines looping between the poles with particles flowing N→S. `field` 0..1 grows the field lines out.',
 controls:{field:'0 no field .. 1 full field lines (default 1)'},defaults:{field:1},size:'0.5 m',
 build(ctx){
  const root=new THREE.Group(),R=0.17,w=0.075,leg=0.22;
  const outline:[number,number][]=[];const n=40;
  for(let i=0;i<=n;i++){const a=Math.PI*i/n;outline.push([Math.cos(a)*(R+w),Math.sin(a)*(R+w)]);}
  outline.push([-(R+w),-leg],[-(R-w),-leg]);
  for(let i=n;i>=0;i--){const a=Math.PI*i/n;outline.push([Math.cos(a)*(R-w),Math.sin(a)*(R-w)]);}
  outline.push([R-w,-leg],[R+w,-leg]);
  const shape=[...outline.slice(0,n+1),[-(R+w),-leg],[-(R-w),-leg],...outline.slice(n+3)] as [number,number][];
  root.add(ctx.mesh(G.extrude(shape,0.1,0.012),{tone:0.8,rough:0.45}));
  // pole tips: N darker, S bright, with a groove separating them from the body
  root.add(ctx.mesh(at(G.rbox(2*w+0.008,0.09,0.112,0.01),[-R,-leg-0.045,0]),{tone:0.45,rough:0.3}));
  root.add(ctx.mesh(at(G.rbox(2*w+0.008,0.09,0.112,0.01),[R,-leg-0.045,0]),{tone:1,rough:0.3}));
  for(const x of [-R,R])root.add(ctx.mesh(at(G.box(2*w+0.012,0.008,0.116),[x,-leg+0.002,0]),{tone:0.3}));
  // N / S letters as raised strokes on the tips
  const letter=(pts:V3[][],x:number)=>{const g:THREE.BufferGeometry[]=[];for(const l of pts)for(let i=1;i<l.length;i++)g.push(rod([l[i-1]![0]+x,l[i-1]![1],0.058],[l[i]![0]+x,l[i]![1],0.058],0.006,6));return G.merge(g);};
  const y0=-leg-0.075,y1=-leg-0.018;
  root.add(ctx.mesh(letter([[[-0.022,y0,0],[-0.022,y1,0],[0.022,y0,0],[0.022,y1,0]]],-R),{tone:1}));
  const sPts:V3[]=[];for(let i=0;i<=16;i++){const u=i/16;const yy=lerp(y1,y0,u);const xx=0.02*Math.sin(u*Math.PI*2+Math.PI)*(u<0.5?1:1);sPts.push([-xx,yy,0]);}
  root.add(ctx.mesh(letter([sPts],R),{tone:0.35}));
  // field lines: arcs from N tip down and round into S tip
  const lines:{g:THREE.Group;pts:THREE.Vector3[];curve:THREE.CatmullRomCurve3}[]=[];const flow:{m:THREE.Mesh;li:number;ph:number}[]=[];
  const tipY=-leg-0.09;
  [0.06,0.14,0.24,0.36].forEach((d,i)=>{
   const pts:THREE.Vector3[]=[];for(let j=0;j<=20;j++){const a=Math.PI*j/20;pts.push(new THREE.Vector3(-R*Math.cos(a)*(1+i*0.32),tipY-Math.sin(a)*d*1.3,0));}
   const curve=new THREE.CatmullRomCurve3(pts);const g=new THREE.Group();
   const m=ctx.mesh(new THREE.TubeGeometry(curve,64,0.006,6),{tone:0.6,glow:0.7,glowControl:'field'});g.add(m);root.add(g);lines.push({g,pts,curve});
   for(let k=0;k<3;k++){const p=ctx.mesh(G.sphere(0.013,10,8),{tone:1,glow:2.4,glowControl:'field'});root.add(p);flow.push({m:p,li:i,ph:k/3});}
  });
  // outer side loops
  for(const s of [-1,1]){const pts:V3[]=[[s*R*0.9,tipY,0],[s*(R+0.16),tipY-0.02,0],[s*(R+0.3),0.0,0],[s*(R+0.2),0.24,0],[s*0.02,0.36,0]];
   const g=new THREE.Group();g.add(ctx.mesh(G.tube(pts,0.005,48,6),{tone:0.45,glow:0.5,glowControl:'field'}));root.add(g);lines.push({g,pts:pts.map(p=>new THREE.Vector3(...p)),curve:new THREE.CatmullRomCurve3(pts.map(p=>new THREE.Vector3(...p)))});}
  bounds(ctx,root,[-0.55,-0.95,-0.06],[0.55,0.42,0.06]);
  return {root,grounded:false,update(c,t){
   const k=clamp(c.field??1);
   lines.forEach((l,i)=>{const kk=ease.out(seg(k,i*0.08,0.6+i*0.06));l.g.scale.setScalar(Math.max(1e-3,kk));l.g.visible=kk>0.01;l.g.position.set(0,tipY*(1-kk)+0*kk,0);l.g.position.y=(1-kk)*tipY;});
   flow.forEach(f=>{const u=(t*0.28+f.ph)%1;lines[f.li]!.curve.getPointAt(u,f.m.position);f.m.visible=k>0.85;});
  }};
 },
});

// ---------------------------------------------------------------- mechanics
function gearGeo(teeth:number,mod:number,thick:number,hole:number){
 const Rp=mod*teeth/2,Ra=Rp+mod,Rd=Rp-1.25*mod,out:[number,number][]=[];
 for(let i=0;i<teeth;i++){const a=i/teeth*Math.PI*2,p=Math.PI*2/teeth;
  // involute-ish trapezoid tooth centred on angle a
  out.push([Math.cos(a-p*0.5)*Rd,Math.sin(a-p*0.5)*Rd]);
  out.push([Math.cos(a-p*0.27)*Rd,Math.sin(a-p*0.27)*Rd]);
  out.push([Math.cos(a-p*0.2)*(Rp),Math.sin(a-p*0.2)*(Rp)]);
  out.push([Math.cos(a-p*0.12)*Ra,Math.sin(a-p*0.12)*Ra]);
  out.push([Math.cos(a+p*0.12)*Ra,Math.sin(a+p*0.12)*Ra]);
  out.push([Math.cos(a+p*0.2)*(Rp),Math.sin(a+p*0.2)*(Rp)]);
  out.push([Math.cos(a+p*0.27)*Rd,Math.sin(a+p*0.27)*Rd]);
 }
 const holes:[number,number][][]=[];const circ=(cx:number,cy:number,r:number,n=24)=>Array.from({length:n},(_,i)=>[cx+Math.cos(-i/n*Math.PI*2)*r,cy+Math.sin(-i/n*Math.PI*2)*r] as [number,number]);
 holes.push(circ(0,0,hole));
 const spokes=teeth>=14?5:0;
 if(spokes){const r0=hole*2.0,r1=Rd*0.78;for(let i=0;i<spokes;i++){const a0=i/spokes*Math.PI*2+0.32,a1=(i+1)/spokes*Math.PI*2-0.32,arc:[number,number][]=[];
  for(let j=0;j<=10;j++){const a=lerp(a0,a1,j/10);arc.push([Math.cos(a)*r1,Math.sin(a)*r1]);}
  for(let j=10;j>=0;j--){const a=lerp(a0+0.12,a1-0.12,j/10);arc.push([Math.cos(a)*r0,Math.sin(a)*r0]);}
  holes.push(arc.reverse());}}
 return {geo:G.extrude(out,thick,thick*0.12,holes),Rp,Ra,Rd};
}
function addGear(ctx:ModelCtx,teeth:number,mod:number,thick:number,tone:number){
 const g=new THREE.Group(),hole=Math.max(mod*1.2,mod*teeth*0.08);const {geo,Rp,Rd}=gearGeo(teeth,mod,thick,hole);
 g.add(ctx.mesh(geo,{tone,rough:0.35}));
 g.add(ctx.mesh(at(G.cyl(hole*1.9,hole*1.9,thick*1.5,32,true),[0,0,0],[90,0,0]),{tone:Math.min(1,tone+0.1),side:THREE.DoubleSide}));
 g.add(ctx.mesh(at(G.torus(hole*1.9,thick*0.12,8,40),[0,0,thick*0.75]),{tone:1}));
 g.add(ctx.mesh(at(G.torus(Rd*0.93,thick*0.08,6,64),[0,0,thick*0.52]),{tone:Math.max(0.35,tone-0.25)}));
 // keyway + axle
 g.add(ctx.mesh(at(G.box(hole*0.5,hole*0.5,thick*1.55),[0,hole*0.95,0]),{tone:0.4}));
 return {g,Rp};
}
function axle(ctx:ModelCtx,r:number,len:number){return ctx.mesh(at(G.cyl(r,r,len,24),[0,0,0],[90,0,0]),{tone:0.5});}

export const gear=defineModel({
 id:'gear',aliases:['cog','cogwheel','gear-wheel','sprocket'],
 describe:'A single spoked metal gear (cogwheel) with crisp teeth, hub and axle, facing the camera and turning. `speed` sets rotation speed (0 stops).',
 params:{teeth:'8..48 (default 20)'},controls:{speed:'rotation speed (default 1)'},defaults:{speed:1},size:'0.5 m',
 build(ctx){
  const n=Math.round(ctx.num('teeth',20,8,48)),root=new THREE.Group();
  const {g}=addGear(ctx,n,0.5/(n+2),0.08,0.88);root.add(g);root.add(axle(ctx,0.02,0.2));
  return {root,grounded:false,update(c,t){g.rotation.z=-t*0.6*(c.speed??1);}};
 },
});

export const gears=defineModel({
 id:'gears',aliases:['gear-train','cogs','meshing-gears','gearbox','machinery','mechanism'],
 describe:'Three meshing gears (big, medium, small) turning together at correct ratios — teeth interlock exactly; the small one spins fastest. `speed` sets rotation speed.',
 controls:{speed:'rotation speed (default 1)'},defaults:{speed:1},size:'1 m',
 build(ctx){
  const root=new THREE.Group(),m=0.02;
  const specs=[{n:30,tone:0.85,ang:0},{n:18,tone:1,ang:deg(-28)},{n:12,tone:0.7,ang:deg(55)}];
  const gs=specs.map(s=>{const {g,Rp}=addGear(ctx,s.n,m,0.07,s.tone);root.add(g);return {g,Rp,n:s.n};});
  // positions: gear1 at origin, gear2 right-down, gear3 meshes with gear2 above-right
  const p:THREE.Vector3[]=[new THREE.Vector3()];
  const d1=gs[0]!.Rp+gs[1]!.Rp;p.push(new THREE.Vector3(Math.cos(specs[1]!.ang)*d1,Math.sin(specs[1]!.ang)*d1,0.0));
  const d2=gs[1]!.Rp+gs[2]!.Rp;p.push(p[1]!.clone().add(new THREE.Vector3(Math.cos(specs[2]!.ang)*d2,Math.sin(specs[2]!.ang)*d2,0)));
  gs.forEach((g,i)=>{g.g.position.copy(p[i]!);const a=axle(ctx,0.016,0.18);a.position.copy(p[i]!);root.add(a);});
  // back plate tying them together
  root.add(ctx.mesh(at(G.rbox(1.1,0.75,0.025,0.02),[0.3,-0.03,-0.09]),{tone:0.38}));
  for(const [x,y] of [[-0.18,0.28],[0.8,0.28],[-0.18,-0.35],[0.8,-0.35]] as const)root.add(ctx.mesh(at(G.cyl(0.018,0.018,0.02,16),[x,y,-0.07],[90,0,0]),{tone:0.9}));
  return {root,grounded:false,update(c,t){
   const th0=-t*0.5*(c.speed??1);gs[0]!.g.rotation.z=th0;
   let prev=th0;
   for(let i=1;i<gs.length;i++){const a=gs[i-1]!,b=gs[i]!,tc=Math.atan2(p[i]!.y-p[i-1]!.y,p[i]!.x-p[i-1]!.x);
    const th=tc+Math.PI-Math.PI/b.n-(a.n/b.n)*(prev-tc);b.g.rotation.z=th;prev=th;}
  }};
 },
});

export const spring=defineModel({
 id:'spring',aliases:['coil-spring','hookes-law','spring-mass','elasticity'],
 describe:'A shiny steel coil spring hanging from a bracket with a weight hooked underneath; `stretch` pulls it longer (coils spread evenly), `bounce` makes the weight bob up and down smoothly. params.hanging:false shows a free-standing spring.',
 params:{hanging:'true (default) | false',turns:'5..20 (default 11)'},
 controls:{stretch:'0 rest .. 1 stretched to 1.8x',bounce:'0..1 oscillation'},size:'1.4 m',
 build(ctx){
  const hanging=ctx.bool('hanging',true),turns=Math.round(ctx.num('turns',11,5,20)),root=new THREE.Group(),R=0.11,L0=0.62,wire=0.014;
  const coil=dynTube(ctx,turns*28+40,10,wire,{tone:0.95,rough:0.25});root.add(coil.mesh);
  const top=hanging?1.35:0.02+L0;
  const weight=new THREE.Group();root.add(weight);
  if(hanging){
   root.add(ctx.mesh(at(G.rbox(0.6,0.05,0.2,0.012),[0,top+0.1,0]),{tone:0.6}));
   root.add(ctx.mesh(at(G.box(0.05,0.08,0.05),[0,top+0.04,0]),{tone:0.5}));
   weight.add(ctx.mesh(at(G.torus(0.03,0.007,8,24),[0,-0.03,0],[0,90,0]),{tone:0.9}));
   weight.add(ctx.mesh(at(G.cyl(0.006,0.006,0.06,8),[0,-0.08,0]),{tone:0.9}));
   weight.add(ctx.mesh(at(G.lathe([[0,0],[0.1,0],[0.11,0.01],[0.11,0.16],[0.1,0.17],[0.04,0.2],[0,0.2]],40),[0,-0.31,0]),{tone:0.75,rough:0.35}));
   weight.add(ctx.mesh(at(G.cyl(0.111,0.111,0.012,40),[0,-0.25,0]),{tone:0.45}));
   bounds(ctx,root,[-0.3,top-L0*2.1-0.4,-0.1],[0.3,top+0.13,0.1]);
  }else{root.add(ctx.mesh(at(G.cyl(0.18,0.18,0.02,40),[0,0.01,0]),{tone:0.55}));bounds(ctx,root,[-0.2,0,-0.2],[0.2,0.02+L0*1.9,0.2]);}
  const up=new THREE.Vector3(0,1,0);
  return {root,grounded:true,update(c,t){
   const st=clamp(c.stretch??0),b=clamp(c.bounce??0);
   const L=L0*(1+0.8*st)+b*0.12*Math.sin(t*Math.PI*2/1.1)*L0;
   const lead=0.05;
   coil.set((u,o)=>{
    if(hanging){
     const y=top-u*L;
     if(u<0.04){const k=u/0.04;o.set(R*(1-k)*0.0+0,top-k*lead,0);o.x=lerp(0,R,smooth(k));return;}
     if(u>0.96){const k=(u-0.96)/0.04;o.set(lerp(R,0,smooth(k)),top-L-k*lead,0);return;}
     const v=(u-0.04)/0.92,a=v*turns*Math.PI*2;o.set(Math.cos(a)*R,top-lead*0-(L)*v,Math.sin(a)*R);void y;
    }else{const a=u*turns*Math.PI*2,flat=u<0.04||u>0.96;o.set(Math.cos(a)*R,0.03+(flat?(u<0.5?0:L):clamp((u-0.04)/0.92)*L),Math.sin(a)*R);}
   },up);
   weight.position.y=top-L-lead;
  }};
 },
});

export const pendulum=defineModel({
 id:'pendulum',aliases:['swinging-pendulum','clock-pendulum','oscillation','simple-pendulum'],
 describe:'A physics pendulum: a heavy bright ball on a thin rod hanging from a pivot on a stand, swinging with a true period for its length, and a faint dotted arc showing its path. `swing` sets the amplitude.',
 params:{length:'0.3..2 m (default 1)'},controls:{swing:'0 at rest .. 1 swings ±28° (default 1)'},defaults:{swing:1},size:'1.4 m tall',
 build(ctx){
  const L=ctx.num('length',1,0.3,2),root=new THREE.Group(),H=L+0.35;
  root.add(ctx.mesh(at(G.rbox(0.7,0.05,0.4,0.015),[0,0.025,0]),{tone:0.6}));
  root.add(ctx.mesh(at(G.cyl(0.02,0.022,H,20),[-0.3,H/2+0.05,0]),{tone:0.85}));
  root.add(ctx.mesh(at(G.cyl(0.016,0.016,0.34,20),[-0.14,H+0.05,0],[0,0,90]),{tone:0.85}));
  root.add(ctx.mesh(at(G.sphere(0.028,16,12),[-0.3,H+0.05,0]),{tone:0.95}));
  root.add(ctx.mesh(at(G.cyl(0.022,0.022,0.06,20),[0.03,H+0.05,0],[90,0,0]),{tone:1}));
  const arm=new THREE.Group();arm.position.set(0.03,H+0.05,0);root.add(arm);
  arm.add(ctx.mesh(at(G.cyl(0.006,0.006,L,10),[0,-L/2,0]),{tone:0.9}));
  arm.add(ctx.mesh(at(G.sphere(0.075,32,24),[0,-L,0]),{tone:1,rough:0.25}));
  arm.add(ctx.mesh(at(G.torus(0.075,0.008,8,40),[0,-L,0],[90,0,0]),{tone:0.55}));
  const dots:THREE.BufferGeometry[]=[];for(let i=-10;i<=10;i++){const a=deg(28)*i/10;dots.push(at(G.sphere(0.008,8,6),[0.03+Math.sin(a)*(L+0.12),H+0.05-Math.cos(a)*(L+0.12),0]));}
  root.add(ctx.mesh(G.merge(dots),{tone:0.5}));
  const T=2*Math.PI*Math.sqrt(L/9.81);
  bounds(ctx,root,[-0.4,0,-0.2],[0.03+Math.sin(deg(28))*L+0.1,H+0.1,0.2]);
  return {root,grounded:true,update(c,t){arm.rotation.z=deg(28)*clamp(c.swing??1)*Math.sin(t*Math.PI*2/T);}};
 },
});

export const newtonsCradle=defineModel({
 id:'newtons-cradle',aliases:['newton-cradle','momentum-balls','executive-toy','conservation-of-momentum'],
 describe:"Newton's cradle: five polished steel balls hung by V-shaped threads from a chrome frame; the end ball swings in, strikes the row, and the ball at the other end flies out. `swing` sets amplitude.",
 controls:{swing:'0 still .. 1 full clicks (default 1)'},defaults:{swing:1},size:'0.5 m',
 build(ctx){
  const root=new THREE.Group(),r=0.04,L=0.3,H=0.42,D=0.12;
  root.add(ctx.mesh(at(G.rbox(0.6,0.04,0.3,0.012),[0,0.02,0]),{tone:0.45}));
  const fr:THREE.BufferGeometry[]=[];for(const z of [-D,D]){fr.push(G.tube([[-0.26,0.04,z],[-0.26,H-0.04,z],[-0.24,H,z],[0.24,H,z],[0.26,H-0.04,z],[0.26,0.04,z]],0.008,64,10));}
  root.add(ctx.mesh(G.merge(fr),{tone:0.95,rough:0.25}));
  const balls=[-2,-1,0,1,2].map(i=>{const g=new THREE.Group();g.position.set(i*2*r,H,0);root.add(g);
   g.add(ctx.mesh(at(G.sphere(r,32,24),[0,-L,0]),{tone:1,rough:0.18}));
   g.add(ctx.mesh(at(G.cyl(0.006,0.006,0.012,8),[0,-L+r+0.004,0]),{tone:0.7}));
   const th=G.merge([rod([0,-L+r,0],[0,0,-D],0.0022,5),rod([0,-L+r,0],[0,0,D],0.0022,5)]);g.add(ctx.mesh(th,{tone:0.75}));return g;});
  const T=1.1;
  return {root,grounded:true,update(c,t){const A=deg(32)*clamp(c.swing??1),s=Math.sin(t*Math.PI*2/T);
   balls.forEach((b,i)=>{b.rotation.x=0;b.rotation.z=i===0?-A*Math.max(0,-s)*-1*-1*(s<0?1:0)*-1:i===4?A*Math.max(0,s):0;});
   balls[0]!.rotation.z=s<0?A*s:0;}};
 },
});

export const robotArm=defineModel({
 id:'robot-arm',aliases:['robotic-arm','industrial-robot','robot','automation','factory-robot','manipulator'],
 describe:'An industrial robot arm: round base, rotating turret, shoulder, two arm segments with cable runs and joint caps, wrist and a two-finger gripper; it smoothly sweeps and dips as if picking parts. `work` animates it, `grip` closes the gripper.',
 controls:{work:'0 still .. 1 working motion (default 1)',grip:'0 open .. 1 closed'},defaults:{work:1},size:'1.6 m reach',
 build(ctx){
  const root=new THREE.Group();
  root.add(ctx.mesh(at(G.cyl(0.32,0.34,0.08,48),[0,0.04,0]),{tone:0.55}));
  const bolts:THREE.BufferGeometry[]=[];for(let i=0;i<8;i++){const a=i/8*Math.PI*2;bolts.push(at(G.cyl(0.018,0.018,0.02,10),[Math.cos(a)*0.28,0.09,Math.sin(a)*0.28]));}root.add(ctx.mesh(G.merge(bolts),{tone:1}));
  const turret=new THREE.Group();turret.position.y=0.08;root.add(turret);
  turret.add(ctx.mesh(at(G.cyl(0.22,0.26,0.22,48),[0,0.11,0]),{tone:0.9,rough:0.4}));
  turret.add(ctx.mesh(at(G.rbox(0.3,0.26,0.34,0.05),[0,0.32,0]),{tone:0.92,rough:0.4}));
  const shoulder=new THREE.Group();shoulder.position.set(0,0.38,0);turret.add(shoulder);
  for(const z of [-0.2,0.2]){shoulder.add(ctx.mesh(at(G.cyl(0.13,0.13,0.06,40),[0,0,z],[90,0,0]),{tone:0.75}));shoulder.add(ctx.mesh(at(G.cyl(0.07,0.07,0.065,32),[0,0,z*1.02],[90,0,0]),{tone:0.4}));}
  const up1=0.75;shoulder.add(ctx.mesh(at(G.rbox(0.17,up1,0.22,0.05),[0,up1/2,0]),{tone:1,rough:0.4}));
  shoulder.add(ctx.mesh(at(G.box(0.1,up1*0.6,0.01),[0,up1/2,0.112]),{tone:0.55}));
  shoulder.add(ctx.mesh(G.tube([[-0.1,0.05,0.08],[-0.13,0.35,0.06],[-0.1,0.7,0.06]],0.018,24,8),{tone:0.4}));
  const elbow=new THREE.Group();elbow.position.y=up1;shoulder.add(elbow);
  elbow.add(ctx.mesh(at(G.cyl(0.1,0.1,0.26,40),[0,0,0],[90,0,0]),{tone:0.75}));
  elbow.add(ctx.mesh(at(G.cyl(0.05,0.05,0.27,24),[0,0,0],[90,0,0]),{tone:0.4}));
  const fl=0.62;elbow.add(ctx.mesh(at(G.cyl(0.07,0.09,fl,32),[0,fl/2,0]),{tone:0.95,rough:0.4}));
  elbow.add(ctx.mesh(at(G.cyl(0.095,0.095,0.04,32),[0,0.08,0]),{tone:0.5}));
  const wrist=new THREE.Group();wrist.position.y=fl;elbow.add(wrist);
  wrist.add(ctx.mesh(at(G.sphere(0.075,32,24),[0,0,0]),{tone:0.7}));
  wrist.add(ctx.mesh(at(G.cyl(0.06,0.06,0.1,32),[0,0.08,0]),{tone:0.9}));
  wrist.add(ctx.mesh(at(G.rbox(0.18,0.05,0.08,0.012),[0,0.15,0]),{tone:0.55}));
  const fingers=[-1,1].map(s=>{const f=new THREE.Group();f.position.set(s*0.06,0.17,0);wrist.add(f);
   f.add(ctx.mesh(at(G.rbox(0.025,0.13,0.06,0.008),[0,0.065,0]),{tone:1}));f.add(ctx.mesh(at(G.box(0.012,0.04,0.062),[-s*0.016,0.11,0]),{tone:0.45}));return {f,s};});
  return {root,grounded:true,update(c,t){
   const w=clamp(c.work??1),ph=t*0.9;
   turret.rotation.y=w*0.7*Math.sin(ph*0.5);
   const dip=ease.inOutSine(0.5+0.5*Math.sin(ph));
   shoulder.rotation.z=deg(-28)+w*deg(-14)*dip;elbow.rotation.z=deg(-62)+w*deg(-26)*dip;wrist.rotation.z=deg(-55)+w*deg(20)*dip;
   wrist.rotation.y=w*0.6*Math.sin(ph*0.5);
   const g=clamp(c.grip??0);fingers.forEach(({f,s})=>{f.position.x=s*lerp(0.06,0.028,g);});
  }};
 },
});

// ---------------------------------------------------------------- electronics
function pinsQFP(per:number,half:number,pitch:number){
 const g:THREE.BufferGeometry[]=[];
 for(let side=0;side<4;side++)for(let i=0;i<per;i++){const o=(i-(per-1)/2)*pitch;
  const parts=[at(G.box(0.03,0.006,pitch*0.45),[half+0.015,0.018,o]),at(G.box(0.006,0.022,pitch*0.45),[half+0.03,0.008,o]),at(G.box(0.026,0.006,pitch*0.45),[half+0.043,-0.003,o])];
  for(const p of parts){p.rotateY(side*Math.PI/2);g.push(p);}}
 return G.merge(g);
}
function dieGeo(size:number,seed:number){
 const r=rng(seed),g:THREE.BufferGeometry[]=[];const n=4,c=size/n;
 for(let i=0;i<n;i++)for(let j=0;j<n;j++){if(r()<0.18)continue;const w=c*(0.55+r()*0.3),d=c*(0.55+r()*0.3);g.push(at(G.box(w,0.004,d),[-size/2+(i+0.5)*c,0.002,-size/2+(j+0.5)*c]));}
 for(let i=0;i<=n;i++){g.push(at(G.box(size,0.002,0.003),[0,0.001,-size/2+i*c]));g.push(at(G.box(0.003,0.002,size),[-size/2+i*c,0.001,0]));}
 return G.merge(g);
}
function buildChip(ctx:ModelCtx,kind:'qfp'|'cpu'|'dip'){
 const root=new THREE.Group(),lid=new THREE.Group();root.add(lid);
 const die=new THREE.Group();root.add(die);
 let dieY=0.02,lidLift=0.25;
 if(kind==='qfp'){
  const s=0.4;root.add(ctx.mesh(at(G.rbox(s,0.022,s,0.006),[0,0.011,0]),{tone:0.38}));
  lid.add(ctx.mesh(at(G.rbox(s,0.022,s,0.008),[0,0.033,0]),{tone:0.42,rough:0.5}));
  lid.add(ctx.mesh(at(G.cyl(0.014,0.014,0.004,20),[-s/2+0.04,0.044,-s/2+0.04]),{tone:0.2}));
  lid.add(ctx.mesh(G.merge([0,1,2].map(i=>at(G.box(0.18-i*0.05,0.002,0.012),[-0.02-i*0.025,0.0445,0.05+i*0.03]))),{tone:0.75}));
  root.add(ctx.mesh(pinsQFP(14,s/2,0.026),{tone:1,rough:0.25}));
  // bond wires from die to lead frame
  const w:THREE.BufferGeometry[]=[];for(let side=0;side<4;side++)for(let i=0;i<10;i++){const o=(i-4.5)*0.022;const p=G.tube([[0.065,0.024,o*0.5],[0.12,0.04,o*0.8],[0.17,0.024,o]],0.0018,8,4);p.rotateY(side*Math.PI/2);w.push(p);}
  die.add(ctx.mesh(G.merge(w),{tone:0.95}));
  die.add(ctx.mesh(at(G.box(0.13,0.006,0.13),[0,0.021,0]),{tone:0.55}));
  die.add(ctx.mesh(at(dieGeo(0.12,ctx.seed),[0,0.024,0]),{tone:1,glow:1.2,glowControl:'active'}));
  dieY=0.02;
 }else if(kind==='cpu'){
  const s=0.45;root.add(ctx.mesh(at(G.rbox(s,0.02,s,0.004),[0,0.01,0]),{tone:0.6}));
  const pads:THREE.BufferGeometry[]=[];for(let i=0;i<16;i++)for(let j=0;j<16;j++){if(i>5&&i<10&&j>5&&j<10)continue;pads.push(at(G.box(0.014,0.004,0.014),[-0.2+i*0.0267,-0.001,-0.2+j*0.0267]));}
  root.add(ctx.mesh(G.merge(pads),{tone:1}));
  const caps:THREE.BufferGeometry[]=[];for(let i=0;i<10;i++){caps.push(at(G.box(0.012,0.008,0.024),[-0.18+i*0.04,0.024,0.2]));caps.push(at(G.box(0.012,0.008,0.024),[-0.18+i*0.04,0.024,-0.2]));}
  root.add(ctx.mesh(G.merge(caps),{tone:0.85}));
  root.add(ctx.mesh(at(G.extrude([[-0.215,-0.215],[-0.17,-0.215],[-0.215,-0.17]],0.004),[0,0.022,0],[-90,0,0]),{tone:1}));
  lid.add(ctx.mesh(at(G.rbox(0.34,0.012,0.34,0.004),[0,0.026,0]),{tone:0.8,rough:0.35}));
  lid.add(ctx.mesh(at(G.rbox(0.28,0.03,0.28,0.012),[0,0.044,0]),{tone:0.98,rough:0.25}));
  lid.add(ctx.mesh(G.merge([0,1,2].map(i=>at(G.box(0.16-i*0.04,0.002,0.012),[-0.03,0.06,-0.06+i*0.035]))),{tone:0.55}));
  die.add(ctx.mesh(at(G.box(0.16,0.012,0.12),[0,0.026,0]),{tone:0.5}));
  die.add(ctx.mesh(at(dieGeo(0.15,ctx.seed),[0,0.032,0],[0,0,0],[1,1,0.75]),{tone:1,glow:1.2,glowControl:'active'}));
  lidLift=0.3;
 }else{
  const L=0.5,W=0.17;root.add(ctx.mesh(at(G.rbox(L,0.02,W,0.006),[0,0.05,0]),{tone:0.38}));
  lid.add(ctx.mesh(at(G.rbox(L,0.03,W,0.008),[0,0.075,0]),{tone:0.42}));
  lid.add(ctx.mesh(at(G.cyl(0.03,0.03,0.008,24,false),[-L/2,0.088,0]),{tone:0.15}));
  lid.add(ctx.mesh(at(G.cyl(0.012,0.012,0.004,16),[-L/2+0.05,0.09,0.045]),{tone:0.2}));
  const legs:THREE.BufferGeometry[]=[];for(let i=0;i<8;i++)for(const s of [-1,1]){const x=-0.2125+i*0.0607;
   legs.push(at(G.box(0.03,0.006,0.03),[x,0.06,s*(W/2+0.012)]),at(G.box(0.03,0.04,0.006),[x,0.04,s*(W/2+0.027)]),at(G.box(0.012,0.06,0.006),[x,-0.01,s*(W/2+0.027)]));}
  root.add(ctx.mesh(G.merge(legs),{tone:1,rough:0.25}));
  die.add(ctx.mesh(at(G.box(0.1,0.006,0.08),[0,0.063,0]),{tone:0.55}));
  die.add(ctx.mesh(at(dieGeo(0.08,ctx.seed),[0,0.067,0]),{tone:1,glow:1.2,glowControl:'active'}));
  dieY=0.06;lidLift=0.2;
 }
 void dieY;
 return {root,update(c:Record<string,number>,t:number){const k=ease.inOut(clamp(c.reveal??0));lid.position.y=lidLift*k;lid.position.x=-0.08*k;lid.rotation.z=deg(14)*k;
  die.visible=k>0.02||kind==='qfp'&&false;die.visible=k>0.02;c.active=(c.active??0)*(0.85+0.15*Math.sin(t*6));}};
}
function chipDef(id:string,aliases:string[],kind:'qfp'|'cpu'|'dip',describe:string){
 return defineModel({
  id,aliases,describe,
  params:{kind:'qfp (square chip, legs on 4 sides) | cpu (processor with metal lid, pads underneath) | dip (black chip with two rows of legs)',flat:'true lies flat; default false presents it tilted toward the camera'},
  controls:{reveal:'0 closed .. 1 lid lifts off to show the glowing silicon die inside',active:'0..1 die circuitry glows'},defaults:{active:1},size:'0.45 m display scale',
  build(ctx){
   const k=ctx.str('kind',kind,['qfp','cpu','dip'] as const);const c=buildChip(ctx,k);
   const tilt=new THREE.Group();tilt.add(c.root);if(!ctx.bool('flat',false))tilt.rotation.x=deg(52);
   bounds(ctx,c.root,[-0.25,-0.02,-0.25],[0.25,0.38,0.25]);
   return {root:tilt,grounded:false,update(cc,t){c.update(cc,t);}};
  },
 });
}
export const chip=chipDef('chip',['microchip','integrated-circuit','ic','semiconductor-chip','silicon-chip','computer-chip','qfp'],'qfp','A black microchip (square IC package) with rows of bright gull-wing metal legs on all four sides, a pin-1 dot and laser-etched markings, presented tilted toward the camera. `reveal` lifts the top off to show the glowing silicon die and gold bond wires.');
export const cpu=chipDef('cpu',['processor','cpu-chip','microprocessor','gpu','ai-chip'],'cpu','A computer processor (CPU): square substrate with a gold contact-pad grid underneath, tiny capacitors, a corner triangle marker and a shiny metal heat-spreader lid, tilted toward the camera. `reveal` lifts the lid to show the glowing die.');

export const circuitBoard=defineModel({
 id:'circuit-board',aliases:['pcb','motherboard','printed-circuit-board','electronics','circuit','board'],
 describe:'A printed circuit board: dark board with bright copper traces fanning out from a central chip to vias, plus a second chip, capacitors, resistors, a crystal, pin header and mounting holes; tilted toward the camera. `pulse` sends glowing signals racing along the traces.',
 params:{flat:'true lies flat (default false: tilted toward camera)'},controls:{pulse:'0 none .. 1 signals flowing (default 1)'},defaults:{pulse:1},size:'1.2 x 0.8 m display scale',
 build(ctx){
  const board=new THREE.Group(),W=1.2,Dp=0.8,T=0.03,r=rng(ctx.seed);
  board.add(ctx.mesh(at(G.rbox(W,T,Dp,0.012),[0,0,0]),{tone:0.4,rough:0.7}));
  const top=T/2;
  // mounting holes
  const holes:THREE.BufferGeometry[]=[];for(const x of [-0.54,0.54])for(const z of [-0.34,0.34])holes.push(at(G.torus(0.026,0.008,8,28),[x,top,z],[90,0,0]));board.add(ctx.mesh(G.merge(holes),{tone:1}));
  const holeIn:THREE.BufferGeometry[]=[];for(const x of [-0.54,0.54])for(const z of [-0.34,0.34])holeIn.push(at(G.cyl(0.018,0.018,0.004,20),[x,top+0.001,z]));board.add(ctx.mesh(G.merge(holeIn),{tone:0.12}));
  // traces fanning from the central chip
  const traces:THREE.Vector3[][]=[];const per=7,half=0.11,pitch=0.026;
  for(let side=0;side<4;side++){const n=side%2===0?new THREE.Vector2(1,0):new THREE.Vector2(0,1),sg=side<2?1:-1;const nx=n.x*sg,nz=n.y*sg,tx=-nz,tz=nx;
   const limit=side%2===0?0.47:0.3;
   for(let i=0;i<per;i++){const o=(i-(per-1)/2)*pitch;const p0=[nx*(half+0.04)+tx*o,nz*(half+0.04)+tz*o];
    const p1=[p0[0]!+nx*0.03,p0[1]!+nz*0.03];const a=Math.abs(o)*1.6,s=Math.sign(o);
    const p2=[p1[0]!+nx*a+tx*s*a,p1[1]!+nz*a+tz*s*a];const reach=limit-(0.06*((i*3+side)%3));
    const cur=nx!==0?Math.abs(p2[0]!):Math.abs(p2[1]!);const p3=[p2[0]!+nx*Math.max(0.02,reach-cur),p2[1]!+nz*Math.max(0.02,reach-cur)];
    traces.push([p0,p1,p2,p3].map(([x,z])=>new THREE.Vector3(x,top+0.002,z)));}}
  // a few long buses to the corners
  traces.push([[-0.2,-0.3],[-0.2,-0.36],[0.3,-0.36],[0.36,-0.3]].map(([x,z])=>new THREE.Vector3(x!,top+0.002,z!)));
  traces.push([[0.2,0.3],[0.2,0.365],[-0.3,0.365],[-0.4,0.27]].map(([x,z])=>new THREE.Vector3(x!,top+0.002,z!)));
  const tg:THREE.BufferGeometry[]=[],vias:THREE.BufferGeometry[]=[];
  for(const tr of traces){for(let i=1;i<tr.length;i++){const a=tr[i-1]!,b=tr[i]!;const len=a.distanceTo(b);if(len<1e-4)continue;const g=G.box(len,0.003,0.009);g.rotateY(-Math.atan2(b.z-a.z,b.x-a.x));g.translate((a.x+b.x)/2,a.y,(a.z+b.z)/2);tg.push(g);tg.push(at(G.cyl(0.0045,0.0045,0.003,10),[b.x,b.y,b.z]));}
   const e=tr[tr.length-1]!;vias.push(at(G.torus(0.011,0.0045,6,18),[e.x,top+0.003,e.z],[90,0,0]));}
  board.add(ctx.mesh(G.merge(tg),{tone:0.9,rough:0.35}));board.add(ctx.mesh(G.merge(vias),{tone:1}));
  // central chip
  const cc=new THREE.Group();cc.position.y=top;board.add(cc);
  cc.add(ctx.mesh(at(G.rbox(0.2,0.03,0.2,0.006),[0,0.02,0]),{tone:0.35}));
  cc.add(ctx.mesh(at(G.cyl(0.008,0.008,0.003,12),[-0.075,0.036,-0.075]),{tone:0.15}));
  cc.add(ctx.mesh(at(G.box(0.1,0.002,0.008),[0,0.036,0.02]),{tone:0.7}));
  const cp:THREE.BufferGeometry[]=[];for(let side=0;side<4;side++)for(let i=0;i<per;i++){const g=at(G.box(0.04,0.006,0.01),[half+0.01,0.006,(i-(per-1)/2)*pitch]);g.rotateY(side*Math.PI/2);cp.push(g);}
  cc.add(ctx.mesh(G.merge(cp),{tone:1}));
  // secondary chip (DIP-ish)
  const c2=new THREE.Group();c2.position.set(-0.38,top,-0.24);board.add(c2);
  c2.add(ctx.mesh(at(G.rbox(0.2,0.03,0.08,0.006),[0,0.018,0]),{tone:0.35}));
  const c2p:THREE.BufferGeometry[]=[];for(let i=0;i<6;i++)for(const s of [-1,1])c2p.push(at(G.box(0.012,0.008,0.03),[-0.075+i*0.03,0.006,s*0.05]));c2.add(ctx.mesh(G.merge(c2p),{tone:1}));
  // electrolytic capacitors
  for(const [x,z,h] of [[0.4,-0.24,0.1],[0.48,-0.12,0.08],[0.3,-0.28,0.07]] as const){const g=new THREE.Group();g.position.set(x,top,z);board.add(g);
   g.add(ctx.mesh(at(G.cyl(0.035,0.035,h,32),[0,h/2,0]),{tone:0.85,rough:0.4}));g.add(ctx.mesh(at(G.cyl(0.033,0.033,0.004,32),[0,h+0.001,0]),{tone:0.55}));
   g.add(ctx.mesh(G.merge([at(G.box(0.05,0.002,0.006),[0,h+0.004,0]),at(G.box(0.006,0.002,0.05),[0,h+0.004,0])]),{tone:1}));g.add(ctx.mesh(at(G.box(0.012,h*0.9,0.004),[0,h/2,0.035]),{tone:0.45}));}
  // resistors
  for(let i=0;i<4;i++){const g=new THREE.Group();g.position.set(-0.46+i*0.07,top,0.2+0.0*i);board.add(g);
   g.add(ctx.mesh(at(G.capsule(0.012,0.04,4,12),[0,0.016,0],[90,0,0]),{tone:0.8}));
   g.add(ctx.mesh(G.merge([-0.012,0,0.012].map(z=>at(G.cyl(0.0135,0.0135,0.004,12),[0,0.016,z],[90,0,0]))),{tone:0.4}));
   g.add(ctx.mesh(G.merge([rod([0,0.016,-0.03],[0,0.002,-0.045],0.002,5),rod([0,0.016,0.03],[0,0.002,0.045],0.002,5)]),{tone:1}));}
  // crystal
  board.add(ctx.mesh(at(G.capsule(0.022,0.05,6,16),[0.4,top+0.022,0.24],[0,0,90]),{tone:0.95,rough:0.2}));
  // pin header
  const hp:THREE.BufferGeometry[]=[];for(let i=0;i<10;i++){hp.push(at(G.box(0.008,0.07,0.008),[-0.18+i*0.04,top+0.035,-0.37]));}
  board.add(ctx.mesh(at(G.box(0.42,0.025,0.035),[0.0,top+0.0125,-0.37]),{tone:0.3}));board.add(ctx.mesh(G.merge(hp),{tone:1}));
  // signal pulses
  const lines=traces.map(tr=>polyline(tr));
  const pulses=lines.map((l,i)=>{const m=ctx.mesh(G.sphere(0.011,10,8),{tone:1,glow:4,glowControl:'pulse'});board.add(m);return {m,l,ph:r(),sp:0.5+r()*0.5,dir:i%2};});
  const root=new THREE.Group();root.add(board);if(!ctx.bool('flat',false))board.rotation.x=deg(55);
  return {root,grounded:false,update(c,t){const k=clamp(c.pulse??1);
   for(const p of pulses){const u=(t*p.sp*0.6+p.ph)%1;const uu=p.dir?u:1-u;p.l.at(uu,p.m.position);p.m.position.y+=0.006;p.m.visible=k>0.02&&hash1(Math.floor(t*p.sp*0.6+p.ph)+p.ph*97)<0.35+0.65*k;}}};
 },
});

export const transistor=defineModel({
 id:'transistor',aliases:['bjt','mosfet','switch-transistor','to-92','power-transistor'],
 describe:'A transistor: small black D-shaped body with a flat marked face and three metal legs (kind "to220": a power transistor with a metal heat tab and hole). `current` sends glowing charge dots up one leg and out another.',
 params:{kind:'to92 (default) | to220'},controls:{current:'0..1 flowing charge'},size:'0.4 m display scale',
 build(ctx){
  const kind=ctx.str('kind','to92',['to92','to220'] as const),root=new THREE.Group();const legX=kind==='to92'?[-0.05,0,0.05]:[-0.1,0,0.1];
  let bodyBottom=0.3;
  if(kind==='to92'){
   const o:[number,number][]=[];o.push([-0.09,-0.03]);for(let i=0;i<=24;i++){const a=Math.PI+Math.PI*i/24;o.push([Math.cos(a)*0.09,-0.03-Math.sin(a)*0.09*0.9]);}o.push([0.09,-0.03]);
   const shape=o.map(([x,y])=>[x,-y] as [number,number]);
   root.add(ctx.mesh(at(G.extrude(shape,0.2,0.008),[0,0.4,0],[-90,0,0]),{tone:0.4,rough:0.5}));
   root.add(ctx.mesh(G.merge([at(G.box(0.1,0.006,0.002),[0,0.45,0.031]),at(G.box(0.07,0.006,0.002),[0,0.42,0.031]),at(G.box(0.12,0.006,0.002),[0,0.39,0.031])]),{tone:0.85}));
   bodyBottom=0.3;
  }else{
   root.add(ctx.mesh(at(G.rbox(0.3,0.26,0.1,0.01),[0,0.43,0]),{tone:0.38}));
   const tab=G.extrude([[-0.15,0],[0.15,0],[0.15,0.2],[0.11,0.24],[-0.11,0.24],[-0.15,0.2]],0.02,0.004,[Array.from({length:24},(_,i)=>[Math.cos(-i/24*Math.PI*2)*0.045,0.12+Math.sin(-i/24*Math.PI*2)*0.045] as [number,number])]);
   root.add(ctx.mesh(at(tab,[0,0.54,-0.04]),{tone:1,rough:0.25}));
   root.add(ctx.mesh(G.merge([at(G.box(0.18,0.008,0.002),[0,0.47,0.051]),at(G.box(0.12,0.008,0.002),[0,0.43,0.051])]),{tone:0.85}));
   bodyBottom=0.3;
  }
  const legs:THREE.Vector3[][]=legX.map((x,i)=>i===1?[new THREE.Vector3(x,bodyBottom,0),new THREE.Vector3(x,bodyBottom-0.05,0),new THREE.Vector3(x,bodyBottom-0.09,-0.03),new THREE.Vector3(x,0,-0.03)]:[new THREE.Vector3(x,bodyBottom,0),new THREE.Vector3(x,0,0)]);
  const lg:THREE.BufferGeometry[]=[];for(const l of legs)for(let i=1;i<l.length;i++)lg.push(rod(l[i-1]!.toArray() as V3,l[i]!.toArray() as V3,kind==='to92'?0.008:0.012,8));
  root.add(ctx.mesh(G.merge(lg),{tone:0.95,rough:0.25}));
  const walkers=[0,2].map(i=>polyline(legs[i]!));
  const dots=Array.from({length:8},(_,i)=>{const m=ctx.mesh(G.sphere(0.016,10,8),{tone:1,glow:3.5,glowControl:'current'});root.add(m);return {m,leg:i%2,ph:Math.floor(i/2)/4};});
  return {root,grounded:true,update(c,t){const k=clamp(c.current??0);for(const d of dots){const u=(t*0.5+d.ph)%1;walkers[d.leg]!.at(d.leg?1-u:u,d.m.position);d.m.visible=k>0.02;}}};
 },
});

export const electronFlow=defineModel({
 id:'electron-flow',aliases:['electric-current','current-flow','electricity','electrons-in-wire','conductor'],
 describe:'A see-through wire segment: copper ions sit in a fixed grid inside while glowing electrons drift along it (left to right); `current` sets how fast they flow.',
 controls:{current:'0 still (jiggle only) .. 1 fast flow (default 0.6)'},defaults:{current:0.6},size:'2.4 m long',
 build(ctx){
  const root=new THREE.Group(),L=2.4,R=0.24,r=rng(ctx.seed);
  const shell=ctx.mesh(at(G.cyl(R,R,L,48,true),[0,0,0],[0,0,90]),{tone:0.75,rough:0.2,side:THREE.DoubleSide});glassy(shell,0.28);root.add(shell);
  for(const x of [-L/2,L/2])root.add(ctx.mesh(at(G.torus(R,0.012,8,48),[x,0,0],[0,90,0]),{tone:1}));
  const ions:THREE.BufferGeometry[]=[];for(let i=0;i<12;i++)for(let j=0;j<3;j++)for(let k=0;k<3;k++){const y=(j-1)*0.12,z=(k-1)*0.12;if(y*y+z*z>R*R*0.8)continue;ions.push(at(G.sphere(0.035,14,10),[-L/2+0.1+i*0.2,y,z]));}
  root.add(ctx.mesh(G.merge(ions),{tone:0.55}));
  const es=Array.from({length:26},()=>{const m=ctx.mesh(G.sphere(0.022,10,8),{tone:1,glow:3});root.add(m);return {m,x:r(),y:(r()-0.5)*R*1.3,z:(r()-0.5)*R*1.3,ph:r()*6};});
  return {root,grounded:false,update(c,t){const k=c.current??0.6;for(const e of es){const x=((e.x+t*0.18*k)%1);e.m.position.set(-L/2+x*L,e.y+0.02*Math.sin(t*5+e.ph),e.z+0.02*Math.cos(t*4+e.ph));}}};
 },
});

// ---------------------------------------------------------------- energy / space
export const solarPanel=defineModel({
 id:'solar-panel',aliases:['solar','photovoltaic','solar-cell','pv-panel','solar-power','solar-module'],
 describe:'A solar panel on a tilted ground stand: aluminium frame around a 6x10 grid of dark monocrystalline cells with clipped corners, silver busbars and bright gaps. `shine` sweeps a glint of sunlight across the cells (absorbing energy).',
 controls:{shine:'0..1 travelling glint across cells'},size:'1.7 m',
 build(ctx){
  const root=new THREE.Group(),panel=new THREE.Group();const cols=6,rows=10,cs=0.155,gap=0.012,W=cols*(cs+gap)+0.06,H=rows*(cs+gap)+0.06;
  panel.add(ctx.mesh(at(G.box(W-0.03,H-0.03,0.02),[0,0,-0.005]),{tone:0.95}));
  const fr:THREE.BufferGeometry[]=[at(G.box(W,0.04,0.05),[0,H/2-0.02,0]),at(G.box(W,0.04,0.05),[0,-H/2+0.02,0]),at(G.box(0.04,H,0.05),[W/2-0.02,0,0]),at(G.box(0.04,H,0.05),[-W/2+0.02,0,0])];
  panel.add(ctx.mesh(G.merge(fr),{tone:0.8,rough:0.35}));
  const c0=cs/2,cut=cs*0.14,oct:[number,number][]=[[-c0+cut,-c0],[c0-cut,-c0],[c0,-c0+cut],[c0,c0-cut],[c0-cut,c0],[-c0+cut,c0],[-c0,c0-cut],[-c0,-c0+cut]];
  const groups:THREE.BufferGeometry[][]=Array.from({length:cols+rows},()=>[]);const bus:THREE.BufferGeometry[]=[];
  for(let i=0;i<cols;i++)for(let j=0;j<rows;j++){const x=-W/2+0.03+(i+0.5)*(cs+gap),y=-H/2+0.03+(j+0.5)*(cs+gap);
   groups[i+(rows-1-j)]!.push(at(G.extrude(oct,0.006),[x,y,0.008]));
   for(const dx of [-0.045,0,0.045])bus.push(at(G.box(0.004,cs*0.98,0.002),[x+dx,y,0.0115]));
   for(let f=0;f<5;f++)bus.push(at(G.box(cs*0.96,0.0012,0.0015),[x,y-cs*0.4+f*cs*0.2,0.0112]));}
  const cellMeshes=groups.map((g,i)=>{const m=ctx.mesh(G.merge(g),{tone:0.4,rough:0.18,glow:0.0001,glowControl:`sw${i}`});m.material=ctx.mat({tone:0.4,rough:0.18,glow:1.6,glowControl:`sw${i}`});panel.add(m);return m;});
  panel.add(ctx.mesh(G.merge(bus),{tone:0.78}));
  // junction box on back
  panel.add(ctx.mesh(at(G.rbox(0.2,0.14,0.05,0.01),[0,H*0.3,-0.04]),{tone:0.55}));
  panel.position.set(0,0.75,0);panel.rotation.x=deg(-35);root.add(panel);
  const legs:THREE.BufferGeometry[]=[];for(const x of [-W/2+0.12,W/2-0.12]){legs.push(rod([x,0,0.5],[x,0.75-Math.sin(deg(55))*H/2*0.02+0.3,0.28],0.022,10));legs.push(rod([x,0,-0.48],[x,1.18,-0.3],0.022,10));legs.push(rod([x,0.02,-0.6],[x,0.02,0.6],0.025,10));}
  root.add(ctx.mesh(G.merge(legs),{tone:0.65}));
  const n=cellMeshes.length;void cellMeshes;
  return {root,grounded:true,update(c,t){const k=clamp(c.shine??0);const p=((t*0.45)%1.6)-0.3;for(let i=0;i<n;i++){const d=i/(n-1)-p;c[`sw${i}`]=k*Math.exp(-d*d*60);}}};
 },
});

function wingPanel(ctx:ModelCtx,w:number,h:number){
 const g=new THREE.Group();
 g.add(ctx.mesh(at(G.box(w,0.012,h),[w/2,0,0]),{tone:0.9}));
 const cells:THREE.BufferGeometry[]=[];const nx=4,nz=6;for(let i=0;i<nx;i++)for(let j=0;j<nz;j++)for(const s of [1,-1])cells.push(at(G.box(w/nx*0.86,0.004,h/nz*0.86),[(i+0.5)*w/nx,s*0.007,-h/2+(j+0.5)*h/nz]));
 g.add(ctx.mesh(G.merge(cells),{tone:0.42,rough:0.2}));return g;
}
export const satellite=defineModel({
 id:'satellite',aliases:['space-satellite','spacecraft','communications-satellite','gps-satellite','probe'],
 describe:'A satellite in orbit: foil-wrapped body with a big dish antenna and feed horn, thruster nozzle, and two long solar-panel wings on booms; it drifts slowly. `deploy` unfolds the solar wings from folded stacks; `signal` pulses the dish.',
 controls:{deploy:'0 folded .. 1 wings fully open (default 1)',signal:'0..1 glowing transmit pulses from the dish'},defaults:{deploy:1},size:'4 m span',
 build(ctx){
  const root=new THREE.Group(),bus=new THREE.Group();root.add(bus);
  bus.add(ctx.mesh(roughen(G.rbox(0.6,0.7,0.6,0.03,2),0.008,40,3),{tone:0.85,rough:0.3}));
  const ribs:THREE.BufferGeometry[]=[];for(const y of [-0.36,0.36])ribs.push(at(G.box(0.64,0.03,0.64),[0,y,0]));for(const x of [-0.31,0.31])for(const z of [-0.31,0.31])ribs.push(at(G.box(0.03,0.72,0.03),[x,0,z]));
  bus.add(ctx.mesh(G.merge(ribs),{tone:1}));
  bus.add(ctx.mesh(at(G.box(0.22,0.18,0.01),[0.08,0.08,0.305]),{tone:0.4}));
  const dish=new THREE.Group();dish.position.set(0,0.62,0.08);dish.rotation.x=deg(30);bus.add(dish);
  const prof:[number,number][]=[];for(let i=0;i<=16;i++){const r=0.38*i/16;prof.push([r,r*r*0.7]);}prof.push([0.385,0.105]);
  dish.add(ctx.mesh(G.lathe(prof,48),{tone:0.95,side:THREE.DoubleSide,rough:0.35}));
  dish.add(ctx.mesh(at(G.torus(0.383,0.012,8,64),[0,0.1,0],[90,0,0]),{tone:1}));
  const st:THREE.BufferGeometry[]=[];for(let i=0;i<3;i++){const a=i/3*Math.PI*2;st.push(rod([Math.cos(a)*0.34,0.08,Math.sin(a)*0.34],[0,0.3,0],0.006,6));}dish.add(ctx.mesh(G.merge(st),{tone:0.8}));
  dish.add(ctx.mesh(at(G.cone(0.05,0.08,20),[0,0.27,0],[180,0,0]),{tone:0.7}));
  bus.add(ctx.mesh(at(G.cyl(0.04,0.04,0.3,16),[0,0.42,0]),{tone:0.6}));
  const sig=[0,1,2].map(()=>{const m=ctx.mesh(at(G.torus(0.3,0.012,6,48),[0,0,0],[90,0,0]),{tone:0.8,glow:2.5,glowControl:'sigx'});const g=new THREE.Group();g.add(m);dish.add(g);return g;});
  bus.add(ctx.mesh(at(G.lathe([[0.04,0],[0.07,-0.04],[0.13,-0.18],[0.12,-0.19],[0.03,-0.03]],32),[0,-0.37,0]),{tone:0.65,side:THREE.DoubleSide}));
  bus.add(ctx.mesh(at(G.cyl(0.2,0.22,0.06,40),[0,-0.39,0]),{tone:0.5}));
  const wings=[-1,1].map(s=>{
   const boom=new THREE.Group();boom.position.set(s*0.3,0,0);bus.add(boom);
   boom.add(ctx.mesh(at(G.cyl(0.025,0.025,0.4,16),[s*0.2,0,0],[0,0,90]),{tone:0.75}));
   boom.add(ctx.mesh(at(G.cyl(0.05,0.05,0.06,20),[s*0.03,0,0],[0,0,90]),{tone:0.5}));
   const panels:THREE.Group[]=[];let parent:THREE.Object3D=boom;
   for(let i=0;i<3;i++){const hinge=new THREE.Group();hinge.position.set(i===0?s*0.4:s*0.58,0,0);parent.add(hinge);const p=wingPanel(ctx,0.56,0.95);if(s<0)p.scale.x=-1;hinge.add(p);panels.push(hinge);parent=hinge;}
   return {boom,panels,s};});
  bounds(ctx,root,[-2.2,-0.6,-0.5],[2.2,1.0,0.5]);
  return {root,grounded:false,update(c,t){
   const k=ease.inOut(clamp(c.deploy??1));
   wings.forEach(w=>w.panels.forEach((h,i)=>{h.rotation.z=(i===0?1:i%2?-2:2)*w.s*(1-k)*deg(88)*(i===0?1:1);}));
   wings.forEach(w=>w.boom.rotation.x=0.15*Math.sin(t*0.3));
   bus.rotation.y=Math.sin(t*0.25)*0.12;
   const s=clamp(c.signal??0);sig.forEach((g,i)=>{const u=(t*0.6+i/3)%1;g.position.y=0.3+u*0.8;g.scale.setScalar(0.4+u*1.2);g.visible=s>0.02;});c.sigx=s;
  }};
 },
});

export const telescope=defineModel({
 id:'telescope',aliases:['refractor','astronomy','observatory-telescope','spyglass'],
 describe:'A refracting telescope on a tripod: long tube with dew shield and dark objective lens at the front, a finder scope on top, focuser, star diagonal and eyepiece at the back, alt-az mount with slow-motion knobs. `aim` tilts it from low to high in the sky.',
 controls:{aim:'0 level .. 1 steep up (default 0.45)'},defaults:{aim:0.45},size:'1.8 m',
 build(ctx){
  const root=new THREE.Group(),Hh=1.08;
  const legs:THREE.BufferGeometry[]=[],braces:THREE.BufferGeometry[]=[];
  for(let i=0;i<3;i++){const a=i/3*Math.PI*2+Math.PI/6,fx=Math.cos(a),fz=Math.sin(a);
   legs.push(rod([fx*0.06,Hh,fz*0.06],[fx*0.42,0,fz*0.42],0.022,12,0.016));legs.push(rod([fx*0.06,Hh,fz*0.06],[fx*0.24,Hh*0.42,fz*0.24],0.026,12));
   braces.push(rod([fx*0.25,0.42,fz*0.25],[0,0.4,0],0.01,8));legs.push(at(G.sphere(0.02,8,6),[fx*0.42,0.01,fz*0.42]));}
  root.add(ctx.mesh(G.merge(legs),{tone:0.75}));root.add(ctx.mesh(G.merge(braces),{tone:0.55}));
  root.add(ctx.mesh(at(G.cyl(0.12,0.12,0.02,3),[0,0.4,0]),{tone:0.6}));
  root.add(ctx.mesh(at(G.cyl(0.09,0.1,0.06,32),[0,Hh+0.03,0]),{tone:0.9}));
  const yoke=new THREE.Group();yoke.position.set(0,Hh+0.06,0);root.add(yoke);
  yoke.add(ctx.mesh(at(G.rbox(0.08,0.24,0.06,0.015),[0,0.12,-0.1]),{tone:0.85}));
  yoke.add(ctx.mesh(at(G.cyl(0.045,0.045,0.04,24),[0,0.2,-0.14],[90,0,0]),{tone:0.5}));
  yoke.add(ctx.mesh(at(G.cyl(0.03,0.03,0.05,16),[0,0.04,0.08],[90,0,0]),{tone:1}));
  const ota=new THREE.Group();ota.position.set(0,0.2,0);yoke.add(ota);
  const tube=new THREE.Group();tube.rotation.y=-Math.PI/2;ota.add(tube);// tube runs along +x after this group (local +z)
  const L=1.15;tube.add(ctx.mesh(at(G.cyl(0.07,0.07,L,40),[0,0,0.1],[90,0,0]),{tone:0.95,rough:0.35}));
  tube.add(ctx.mesh(at(G.cyl(0.088,0.085,0.3,40,true),[0,0,0.1+L/2-0.13],[90,0,0]),{tone:0.85,side:THREE.DoubleSide}));
  tube.add(ctx.mesh(at(G.torus(0.086,0.008,8,40),[0,0,0.1+L/2+0.02]),{tone:1}));
  tube.add(ctx.mesh(at(G.cyl(0.068,0.068,0.01,40),[0,0,0.1+L/2-0.1],[90,0,0]),{tone:0.2,rough:0.1}));
  for(const z of [-0.08,0.22])tube.add(ctx.mesh(at(G.torus(0.075,0.012,8,40),[0,0,z]),{tone:0.55}));
  tube.add(ctx.mesh(at(G.box(0.03,0.02,0.4),[0,-0.085,0.07]),{tone:0.6}));
  tube.add(ctx.mesh(at(G.cyl(0.05,0.07,0.08,32),[0,0,0.1-L/2-0.03],[90,0,0]),{tone:0.7}));
  tube.add(ctx.mesh(at(G.cyl(0.03,0.03,0.12,24),[0,0,0.1-L/2-0.12],[90,0,0]),{tone:0.9}));
  for(const s of [-1,1])tube.add(ctx.mesh(at(G.cyl(0.018,0.018,0.06,16),[s*0.06,-0.03,0.1-L/2-0.06],[0,0,90]),{tone:1}));
  tube.add(ctx.mesh(at(G.rbox(0.07,0.07,0.07,0.012),[0,0,0.1-L/2-0.2]),{tone:0.8}));
  tube.add(ctx.mesh(at(G.cyl(0.022,0.022,0.1,24),[0,0.08,0.1-L/2-0.2]),{tone:0.65}));
  tube.add(ctx.mesh(at(G.cyl(0.03,0.03,0.04,24),[0,0.15,0.1-L/2-0.2]),{tone:0.4}));
  // finder
  tube.add(ctx.mesh(at(G.cyl(0.022,0.022,0.28,24),[0,0.12,-0.1],[90,0,0]),{tone:0.9}));
  tube.add(ctx.mesh(at(G.cyl(0.03,0.025,0.06,24),[0,0.12,0.06],[90,0,0]),{tone:0.75}));
  for(const z of [-0.18,-0.03])tube.add(ctx.mesh(at(G.box(0.012,0.06,0.012),[0,0.09,z]),{tone:0.5}));
  return {root,grounded:true,update(c){const a=clamp(c.aim??0.45);ota.rotation.z=deg(lerp(2,55,a));}};
 },
});

export const microscope=defineModel({
 id:'microscope',aliases:['light-microscope','lab-microscope','compound-microscope','magnify'],
 describe:'A compound lab microscope seen from the side: heavy base with lamp, curved arm, stage with slide and clips, rotating nosepiece with three objective lenses, an angled eyepiece tube and big focus knobs. `light` switches on the lamp under the stage.',
 controls:{light:'0 off .. 1 lamp on (default 1)'},defaults:{light:1},size:'0.45 m',
 build(ctx){
  const root=new THREE.Group(),S=new THREE.Group();S.rotation.y=-Math.PI/2;root.add(S);// side profile built in XY (x = toward viewer side)
  // base
  S.add(ctx.mesh(at(G.rbox(0.26,0.045,0.19,0.018),[0.02,0.0225,0]),{tone:0.75}));
  S.add(ctx.mesh(at(G.cyl(0.035,0.04,0.025,32),[0.06,0.055,0]),{tone:0.5}));
  S.add(ctx.mesh(at(G.cyl(0.025,0.025,0.005,32),[0.06,0.07,0]),{tone:0.9,glow:2.5,glowControl:'light'}));
  // arm (C-shape)
  const arm:[number,number][]=[[-0.1,0.04],[-0.05,0.04],[-0.045,0.12],[-0.035,0.2],[-0.02,0.27],[0.01,0.31],[0.05,0.33],[0.06,0.37],[0.0,0.39],[-0.04,0.36],[-0.075,0.3],[-0.095,0.21],[-0.105,0.12]];
  S.add(ctx.mesh(G.extrude(arm,0.055,0.008),{tone:0.95,rough:0.4}));
  // stage
  S.add(ctx.mesh(at(G.rbox(0.15,0.014,0.15,0.004),[0.06,0.15,0]),{tone:0.5}));
  S.add(ctx.mesh(at(G.box(0.05,0.01,0.05),[-0.02,0.135,0]),{tone:0.6}));
  S.add(ctx.mesh(at(G.box(0.07,0.003,0.11),[0.06,0.1585,0]),{tone:1}));
  for(const z of [-0.04,0.04])S.add(ctx.mesh(at(G.box(0.05,0.004,0.008),[0.04,0.162,z]),{tone:0.95}));
  S.add(ctx.mesh(at(G.cyl(0.02,0.022,0.03,24),[0.06,0.128,0]),{tone:0.65}));
  // knobs
  for(const z of [-0.04,0.04]){S.add(ctx.mesh(at(G.cyl(0.032,0.032,0.018,32),[-0.06,0.16,z*1.2],[90,0,0]),{tone:1}));S.add(ctx.mesh(at(G.cyl(0.02,0.02,0.03,24),[-0.06,0.16,z*1.6],[90,0,0]),{tone:0.65}));}
  // head + nosepiece + objectives
  S.add(ctx.mesh(at(G.rbox(0.09,0.05,0.06,0.012),[0.04,0.36,0]),{tone:0.85}));
  S.add(ctx.mesh(at(G.cyl(0.035,0.04,0.025,32),[0.06,0.325,0]),{tone:0.65}));
  const obj:THREE.BufferGeometry[]=[],tips:THREE.BufferGeometry[]=[];
  [[0,0.075],[deg(40),0.06],[deg(-40),0.05]].forEach(([a=0,l=0])=>{const dx=Math.sin(a)*0.025,dz=Math.cos(a)*0.0;const g=at(G.cyl(0.011,0.014,l,20),[0.06+dx,0.31-l/2,dz],[0,0,deg(-a)]);obj.push(g);tips.push(at(G.torus(0.012,0.003,6,20),[0.06+dx*1.6,0.31-l+0.004,0],[90,0,0]));});
  S.add(ctx.mesh(G.merge(obj),{tone:0.95,rough:0.25}));S.add(ctx.mesh(G.merge(tips),{tone:0.45}));
  // eyepiece tube angled back
  S.add(ctx.mesh(rod([0.04,0.37,0],[-0.02,0.47,0],0.017,24),{tone:0.9}));
  S.add(ctx.mesh(rod([-0.02,0.47,0],[-0.032,0.49,0],0.022,24),{tone:0.5}));
  S.add(ctx.mesh(at(G.torus(0.019,0.004,8,24),[-0.033,0.492,0],[90,0,30]),{tone:1}));
  return {root,grounded:true};
 },
});

// ---------------------------------------------------------------- lab glass
interface VesselShape {inner:[number,number][];wall:number}
function vessel(ctx:ModelCtx,parent:THREE.Object3D,shape:VesselShape,liquidColor:string|undefined,pos:V3=[0,0,0],glassK=0.32){
 const g=new THREE.Group();g.position.set(...pos);parent.add(g);
 const inner=shape.inner,y0=inner[0]![1],y1=inner[inner.length-1]![1],w=shape.wall;
 const rAt=(y:number)=>{for(let i=1;i<inner.length;i++){const a=inner[i-1]!,b=inner[i]!;if(y<=b[1])return lerp(a[0],b[0],clamp((y-a[1])/Math.max(1e-6,b[1]-a[1])));}return inner[inner.length-1]![0];};
 const outer:[number,number][]=[[0,y0-w],...inner.map(([r,y])=>[r+w,y] as [number,number])];
 const glass=ctx.mesh(G.lathe(outer,48),{tone:0.9,rough:0.08,side:THREE.DoubleSide});glassy(glass,glassK);g.add(glass);
 g.add(ctx.mesh(at(G.torus(inner[inner.length-1]![0]+w*0.5,w*0.9,8,48),[0,y1,0],[90,0,0]),{tone:1,rough:0.15}));
 g.add(ctx.mesh(at(G.torus(Math.max(0.005,inner[0]![0]+w*0.2),w*0.8,6,48),[0,y0-w*0.3,0],[90,0,0]),{tone:0.85}));
 // liquid at 24 precomputed levels (no per-frame allocation)
 const N=24,levels:THREE.BufferGeometry[]=[];
 for(let i=1;i<=N;i++){const top=y0+(y1-y0)*0.96*i/N;const prof:[number,number][]=[[0,y0+0.001]];const steps=18;
  for(let s=0;s<=steps;s++){const y=lerp(y0+0.001,top,s/steps);prof.push([Math.max(0.001,rAt(y)-0.002),y]);}prof.push([0,top]);levels.push(G.lathe(prof,40));}
 const liquid=ctx.mesh(levels[0]!,{tone:0.78,color:liquidColor,rough:0.3});g.add(liquid);
 const surf:THREE.BufferGeometry=G.torus(1,0.004,6,40);surf.rotateX(Math.PI/2);const meniscus=ctx.mesh(surf,{tone:1,color:liquidColor});g.add(meniscus);
 const r=rng(ctx.seed+pos[0]*1000);
 const bubbles=Array.from({length:10},()=>{const m=ctx.mesh(G.sphere(1,10,8),{tone:1,color:liquidColor});g.add(m);return {m,a:r()*Math.PI*2,rr:r()*0.6,ph:r(),sz:0.5+r()*0.6,sp:0.6+r()*0.6};});
 const scale=Math.max(...inner.map(p=>p[0]));
 return {y0,y1,rAt,update(fill:number,bub:number,t:number){
  const f=clamp(fill);const i=Math.round(f*N);liquid.visible=i>0;if(i>0)liquid.geometry=levels[i-1]!;
  const top=y0+(y1-y0)*0.96*i/N;const rt=Math.max(0.001,rAt(top)-0.002);meniscus.visible=i>0;meniscus.position.y=top;meniscus.scale.set(rt,1,rt);
  bubbles.forEach((b,j)=>{const u=(t*0.35*b.sp+b.ph)%1;const y=lerp(y0+0.01,top-0.004,u);const rr=Math.max(0,rAt(y)-0.012)*b.rr;
   b.m.position.set(Math.cos(b.a+u*2)*rr,y,Math.sin(b.a+u*2)*rr);const s=scale*0.045*b.sz*(0.6+0.4*u);b.m.scale.setScalar(s);b.m.visible=i>1&&j<Math.round(bub*10)&&top-y0>0.02;});
 }};
}
const glassCtl={fill:'0 empty .. 1 full liquid level (default 0.55)',bubbles:'0..1 rising bubbles (boiling / reaction)'};

export const flask=defineModel({
 id:'flask',aliases:['erlenmeyer','erlenmeyer-flask','conical-flask','chemistry','round-bottom-flask','potion','lab-flask'],
 describe:'A glass chemistry flask (see-through glass with bright rim, liquid inside): conical Erlenmeyer by default or kind "round" (round-bottom flask with long neck). `fill` sets the liquid level, `bubbles` makes bubbles rise.',
 params:{kind:'erlenmeyer | round',color:'liquid colour (default scene hue)'},controls:glassCtl,defaults:{fill:0.55},size:'0.3 m',
 build(ctx){
  const kind=ctx.str('kind','erlenmeyer',['erlenmeyer','round'] as const),root=new THREE.Group();
  let inner:[number,number][];
  if(kind==='round'){inner=[];for(let i=0;i<=20;i++){const a=-Math.PI/2+i/20*(Math.PI-0.32);inner.push([Math.cos(a)*0.12,0.125+Math.sin(a)*0.12]);}inner.push([0.03,0.25],[0.03,0.38],[0.036,0.39]);}
  else inner=[[0.125,0.006],[0.128,0.015],[0.125,0.03],[0.034,0.2],[0.03,0.215],[0.03,0.29],[0.036,0.3]];
  const v=vessel(ctx,root,{inner,wall:0.006},colorParam(ctx),[0,0.006,0]);
  // graduation marks on the front
  if(kind==='erlenmeyer'){const marks:THREE.BufferGeometry[]=[];for(let i=1;i<=4;i++){const y=0.006+i*0.035,r=v.rAt(i*0.035)+0.0065;marks.push(at(G.box(i%2?0.03:0.05,0.003,0.002),[0,y,r]));}root.add(ctx.mesh(G.merge(marks),{tone:1}));}
  else{root.add(ctx.mesh(at(G.torus(0.13,0.008,8,48),[0,0.012,0],[90,0,0]),{tone:0.5}));}
  return {root,grounded:true,update(c,t){v.update(c.fill??0.55,clamp(c.bubbles??0),t);}};
 },
});

export const beaker=defineModel({
 id:'beaker',aliases:['lab-beaker','measuring-beaker','glass-beaker'],
 describe:'A glass lab beaker: straight see-through walls, pouring spout, white graduation marks up the front, liquid inside. `fill` sets the level, `bubbles` makes bubbles rise.',
 params:{color:'liquid colour (default scene hue)'},controls:glassCtl,defaults:{fill:0.55},size:'0.25 m',
 build(ctx){
  const root=new THREE.Group();
  const v=vessel(ctx,root,{inner:[[0.088,0.004],[0.092,0.012],[0.092,0.22],[0.097,0.232]],wall:0.005},colorParam(ctx),[0,0.005,0]);
  root.add(ctx.mesh(at(G.cone(0.02,0.03,12),[0,0.24,0.098],[-70,0,0]),{tone:0.9}));
  const marks:THREE.BufferGeometry[]=[];for(let i=1;i<=9;i++){const y=0.02+i*0.021;marks.push(at(G.box(i%2?0.022:0.045,0.0026,0.002),[-0.02+(i%2?-0.011:0),y,0.098]));}
  root.add(ctx.mesh(G.merge(marks),{tone:1}));
  root.add(ctx.mesh(G.merge([at(G.box(0.012,0.012,0.002),[0.025,0.17,0.098]),at(G.box(0.012,0.012,0.002),[0.025,0.12,0.098])]),{tone:0.95}));
  return {root,grounded:true,update(c,t){v.update(c.fill??0.55,clamp(c.bubbles??0),t);}};
 },
});

export const testTubes=defineModel({
 id:'test-tubes',aliases:['test-tube','test-tube-rack','tubes','lab','experiment','samples'],
 describe:'A rack of glass test tubes with rounded bottoms, each filled to a different level; `fill` raises all levels, `bubbles` makes them fizz.',
 params:{count:'1..7 (default 5)',colors:'optional list of liquid colours, one per tube'},controls:glassCtl,defaults:{fill:0.8},size:'0.4 m',
 build(ctx){
  const n=Math.round(ctx.num('count',5,1,7)),root=new THREE.Group(),gap=0.075,W=n*gap+0.06;
  const cols=Array.isArray(ctx.params.colors)?(ctx.params.colors as unknown[]).map(x=>typeof x==='string'?x:undefined):[];
  root.add(ctx.mesh(at(G.rbox(W,0.02,0.1,0.006),[0,0.01,0]),{tone:0.6}));
  const plate=G.extrude([[-W/2,-0.05],[W/2,-0.05],[W/2,0.05],[-W/2,0.05]],0.016,0.003,Array.from({length:n},(_,i)=>Array.from({length:20},(_,j)=>[-W/2+0.03+(i+0.5)*gap+Math.cos(-j/20*Math.PI*2)*0.024,Math.sin(-j/20*Math.PI*2)*0.024] as [number,number])));
  root.add(ctx.mesh(at(plate,[0,0.15,0],[90,0,0]),{tone:0.8}));
  for(const x of [-W/2+0.012,W/2-0.012])root.add(ctx.mesh(at(G.box(0.02,0.15,0.09),[x,0.085,0]),{tone:0.7}));
  const vs:{v:ReturnType<typeof vessel>;f:number}[]=[];const base=[0.75,0.45,0.9,0.6,0.35,0.8,0.55];
  for(let i=0;i<n;i++){const inner:[number,number][]=[];for(let j=0;j<=8;j++){const a=-Math.PI/2+j/8*Math.PI/2;inner.push([Math.cos(a)*0.018,0.018+Math.sin(a)*0.018]);}inner.push([0.018,0.2],[0.021,0.205]);
   vs.push({v:vessel(ctx,root,{inner,wall:0.003},cols[i],[-W/2+0.03+(i+0.5)*gap,0.03,0],0.38),f:base[i%7]!});}
  return {root,grounded:true,update(c,t){const f=c.fill??0.8,b=clamp(c.bubbles??0);vs.forEach(({v,f:ff})=>v.update(f*ff,b,t));}};
 },
});

// ---------------------------------------------------------------- chemistry
type Atom={el:string;p:THREE.Vector3};
const EL:Record<string,{r:number;tone:number;cpk:string}>={H:{r:0.12,tone:1,cpk:'#f4f4f4'},C:{r:0.2,tone:0.42,cpk:'#6a6a6a'},N:{r:0.19,tone:0.65,cpk:'#3a5cff'},O:{r:0.2,tone:0.82,cpk:'#ff2a2a'},S:{r:0.24,tone:0.9,cpk:'#ffd21f'},P:{r:0.23,tone:0.7,cpk:'#ff8a1f'},Cl:{r:0.23,tone:0.72,cpk:'#2aea4a'},Na:{r:0.26,tone:0.6,cpk:'#ab5cf2'},F:{r:0.17,tone:0.9,cpk:'#90e050'}};
function moleculeData(kind:string):{atoms:[string,number,number,number][];bonds:[number,number,number][]}{
 const t=1.09/Math.sqrt(3);
 switch(kind){
  case 'co2':return {atoms:[['C',0,0,0],['O',-1.16,0,0],['O',1.16,0,0]],bonds:[[0,1,2],[0,2,2]]};
  case 'o2':return {atoms:[['O',-0.6,0,0],['O',0.6,0,0]],bonds:[[0,1,2]]};
  case 'h2':return {atoms:[['H',-0.37,0,0],['H',0.37,0,0]],bonds:[[0,1,1]]};
  case 'n2':return {atoms:[['N',-0.55,0,0],['N',0.55,0,0]],bonds:[[0,1,3]]};
  case 'ch4':return {atoms:[['C',0,0,0],['H',t,t,t],['H',t,-t,-t],['H',-t,t,-t],['H',-t,-t,t]],bonds:[[0,1,1],[0,2,1],[0,3,1],[0,4,1]]};
  case 'nh3':{const a:[string,number,number,number][]=[['N',0,0.12,0]];for(let i=0;i<3;i++){const q=i/3*Math.PI*2+0.5;a.push(['H',Math.cos(q)*0.94,-0.26,Math.sin(q)*0.94]);}return {atoms:a,bonds:[[0,1,1],[0,2,1],[0,3,1]]};}
  case 'c6h6':{const a:[string,number,number,number][]=[],b:[number,number,number][]=[];for(let i=0;i<6;i++){const q=i/6*Math.PI*2+Math.PI/6;a.push(['C',Math.cos(q)*1.39,Math.sin(q)*1.39,0]);}for(let i=0;i<6;i++){const q=i/6*Math.PI*2+Math.PI/6;a.push(['H',Math.cos(q)*2.48,Math.sin(q)*2.48,0]);b.push([i,(i+1)%6,i%2?1:2],[i,i+6,1]);}return {atoms:a,bonds:b};}
  case 'caffeine':{
   const a:[string,number,number,number][]=[],b:[number,number,number][]=[];const R=1.4;
   const hx=(deg:number)=>[Math.cos(deg*Math.PI/180)*R,Math.sin(deg*Math.PI/180)*R] as const;
   const ring6=[['N',150],['C',210],['N',270],['C',330],['C',30],['C',90]] as const;// N1 C2 N3 C4 C5 C6
   ring6.forEach(([e,d])=>{const [x,y]=hx(d);a.push([e,x,y,0]);});
   const pc=R*Math.cos(Math.PI/6)+1.4/(2*Math.tan(Math.PI/5)),PR=1.4/(2*Math.sin(Math.PI/5));
   const pent=[['N',72],['C',0],['N',-72]] as const;// N7 C8 N9
   pent.forEach(([e,d])=>a.push([e,pc+Math.cos(d*Math.PI/180)*PR,Math.sin(d*Math.PI/180)*PR,0]));
   b.push([0,1,1],[1,2,1],[2,3,1],[3,4,2],[4,5,1],[5,0,1],[4,6,1],[6,7,1],[7,8,2],[8,3,1]);
   const out=(i:number,cx:number,cy:number,len:number,el:string,order:number)=>{const [,x,y]=a[i]!;const d=Math.hypot(x-cx,y-cy);a.push([el,x+(x-cx)/d*len,y+(y-cy)/d*len,0]);b.push([i,a.length-1,order]);return a.length-1;};
   out(1,0,0,1.23,'O',2);out(5,0,0,1.23,'O',2);
   const methyl=(i:number,cx:number,cy:number)=>{const c=out(i,cx,cy,1.47,'C',1);const [,x,y]=a[c]!;const [,px,py]=a[i]!;const dx=(x-px)/1.47,dy=(y-py)/1.47;
    for(let k=0;k<3;k++){const q=k/3*Math.PI*2;const ox=-dy*Math.cos(q),oy=dx*Math.cos(q),oz=Math.sin(q);a.push(['H',x+dx*0.36+ox*1.02,y+dy*0.36+oy*1.02,oz*1.02]);b.push([c,a.length-1,1]);}};
   methyl(0,0,0);methyl(2,0,0);methyl(6,pc,0);out(7,pc,0,1.08,'H',1);
   return {atoms:a,bonds:b};}
  default:return {atoms:[['O',0,0.12,0],['H',-0.757,-0.47,0],['H',0.757,-0.47,0]],bonds:[[0,1,1],[0,2,1]]};
 }
}
export const molecule=defineModel({
 id:'molecule',aliases:['ball-and-stick','compound','h2o','water-molecule','co2','caffeine','methane','chemical'],
 describe:'A ball-and-stick molecule with accurate geometry: kind h2o (bent water), co2 (linear, double bonds), o2, h2, n2 (triple), ch4 (tetrahedral methane), nh3, c6h6 (benzene ring), caffeine, or custom. Atoms sized and toned by element (C dark, O/N mid, H small bright); double bonds show as two sticks. `split` breaks the bonds and flies atoms apart, `vibrate` makes bonds stretch.',
 params:{kind:"h2o | co2 | o2 | h2 | n2 | ch4 | nh3 | c6h6 | caffeine | custom",atoms:'custom: [{el:"C",pos:[x,y,z] (Å)}...]',bonds:'custom: [[i,j,order]...]',cpk:'true = real element colours (O red, N blue, H white, C grey)'},
 controls:{split:'0 bonded .. 1 atoms flown apart',vibrate:'0..1 bond vibration'},size:'~1 m display',
 build(ctx){
  const kind=ctx.str('kind','h2o',['h2o','co2','o2','h2','n2','ch4','nh3','c6h6','caffeine','custom'] as const);const cpk=ctx.bool('cpk',false);
  let data=moleculeData(kind);
  if(kind==='custom'){const A=Array.isArray(ctx.params.atoms)?ctx.params.atoms as unknown[]:[];const atoms:[string,number,number,number][]=[];
   for(const x of A.slice(0,80)){if(!x||typeof x!=='object')continue;const o=x as {el?:unknown;pos?:unknown};const p=Array.isArray(o.pos)?o.pos.map(Number):[];if(p.length<3||!p.slice(0,3).every(Number.isFinite))continue;atoms.push([String(o.el??'C'),clamp(p[0]!,-30,30),clamp(p[1]!,-30,30),clamp(p[2]!,-30,30)]);}
   const B=Array.isArray(ctx.params.bonds)?ctx.params.bonds as unknown[]:[];const bonds:[number,number,number][]=[];
   for(const x of B.slice(0,120)){if(!Array.isArray(x))continue;const [i,j,o]=x.map(Number);if(Number.isInteger(i)&&Number.isInteger(j)&&i!>=0&&j!>=0&&i!<atoms.length&&j!<atoms.length&&i!==j)bonds.push([i!,j!,clamp(Math.round(o||1),1,3)]);}
   if(atoms.length)data={atoms,bonds};else data=moleculeData('h2o');}
  const S=0.42,root=new THREE.Group();const cen=new THREE.Vector3();
  const atoms:Atom[]=data.atoms.map(([el,x,y,z])=>({el:EL[el]?el:(EL[el.charAt(0).toUpperCase()+el.slice(1).toLowerCase()]?el.charAt(0).toUpperCase()+el.slice(1).toLowerCase():'C'),p:new THREE.Vector3(x,y,z).multiplyScalar(S)}));
  atoms.forEach(a=>cen.add(a.p));cen.multiplyScalar(1/atoms.length);atoms.forEach(a=>a.p.sub(cen));
  const meshes=atoms.map(a=>{const e=EL[a.el]!;const m=ctx.mesh(G.sphere(e.r*S*1.05/0.42*0.42,40,30),{tone:e.tone,rough:0.32,color:cpk?e.cpk:undefined});m.position.copy(a.p);root.add(m);
   const ring=ctx.mesh(G.torus(e.r*S/0.42*0.42*1.0,0.004,6,40),{tone:Math.min(1,e.tone+0.25),color:cpk?e.cpk:undefined});ring.visible=false;return m;});
  const bondR=0.03;
  const bonds=data.bonds.map(([i,j,o])=>{const sticks:THREE.Mesh[]=[];for(let k=0;k<o;k++){const m=ctx.mesh(beamGeo(o>1?bondR*0.7:bondR,o>1?bondR*0.7:bondR,14),{tone:0.75,rough:0.4});root.add(m);sticks.push(m);}return {i,j,o,sticks};});
  // perpendicular for multi-bonds: in the molecule plane when possible
  const plane=new THREE.Vector3(0,0,1);
  const dirs=atoms.map(a=>a.p.clone().normalize());const r=rng(ctx.seed);const spin=atoms.map(()=>new THREE.Vector3(r()-0.5,r()-0.5,r()-0.5));
  const pa=new THREE.Vector3(),pb=new THREE.Vector3(),off=new THREE.Vector3(),d=new THREE.Vector3(),cur=atoms.map(a=>a.p.clone());
  let ext=0;atoms.forEach(a=>ext=Math.max(ext,a.p.length()));bounds(ctx,root,[-ext-0.2,-ext-0.2,-ext-0.2],[ext+0.2,ext+0.2,ext+0.2]);
  return {root,grounded:false,update(c,t){
   const sp=ease.inOut(clamp(c.split??0)),vb=clamp(c.vibrate??0);
   atoms.forEach((a,i)=>{cur[i]!.copy(a.p);if(dirs[i]!.lengthSq()>0)cur[i]!.addScaledVector(dirs[i]!,sp*0.9*(0.6+ext));if(atoms.length===2&&i===1)cur[i]!.x+=0;cur[i]!.addScaledVector(a.p,vb*0.06*Math.sin(t*14+i*1.3));cur[i]!.addScaledVector(spin[i]!,sp*0.4);meshes[i]!.position.copy(cur[i]!);});
   for(const b of bonds){const A=cur[b.i]!,B=cur[b.j]!;d.copy(B).sub(A);const len=d.length();d.normalize();
    off.crossVectors(d,plane);if(off.lengthSq()<1e-4)off.crossVectors(d,_Y);off.normalize();
    const brk=clamp(1-sp*4);
    b.sticks.forEach((m,k)=>{const o=(k-(b.o-1)/2)*0.075;pa.copy(A).addScaledVector(off,o);pb.copy(B).addScaledVector(off,o);
     // broken bonds retract into their atoms
     const mid=pa.clone().lerp(pb,0.5);aim(m,pa,pb,1);m.position.lerp(mid,1-brk);m.scale.x*=brk;m.visible=brk>0.02;});}
  }};
 },
});

// ---------------------------------------------------------------- charts / waves
export const waveGraph=defineModel({
 id:'wave-graph',aliases:['sine-wave','waveform','light-wave','sound-wave','em-wave','electromagnetic-wave','frequency','wavelength','signal-wave'],
 describe:'A 3D sine wave travelling along an axis arrow, drawn as a thick glowing line with vertical stems down to the axis and a wavelength marker bracket. kind "em" adds a perpendicular magnetic wave (horizontal) like the classic electromagnetic-wave diagram. `amp` scales height, `speed` sets travel speed.',
 params:{kind:'sine | em',wavelength:'metres (default 0.9)',amplitude:'metres (default 0.35)',length:'metres (default 3)',color:'line colour'},
 controls:{amp:'0 flat .. 1 full amplitude (default 1)',speed:'travel speed (default 1)',draw:'0..1 draws the wave out from the left (default 1)'},defaults:{amp:1,speed:1,draw:1},size:'3 m',
 build(ctx){
  const kind=ctx.str('kind','sine',['sine','em'] as const),lam=ctx.num('wavelength',0.9,0.1,10),A=ctx.num('amplitude',0.35,0.02,3),L=ctx.num('length',3,0.5,20),col=colorParam(ctx);
  const root=new THREE.Group(),x0=-L/2;
  root.add(ctx.mesh(at(G.cyl(0.008,0.008,L+0.15,10),[0.075,0,0],[0,0,90]),{tone:0.6}));
  root.add(ctx.mesh(at(G.cone(0.03,0.09,16),[L/2+0.19,0,0],[0,0,-90]),{tone:0.75}));
  const N=Math.round(clamp(L/lam*36,60,400));
  const e=dynTube(ctx,N,10,0.022,{tone:1,color:col,glow:0.9,glowControl:'lineglow'});root.add(e.mesh);
  const b=kind==='em'?dynTube(ctx,N,10,0.016,{tone:0.7}):null;if(b)root.add(b.mesh);
  const nst=Math.round(clamp(L/lam*12,12,120));
  const stems=Array.from({length:nst},(_,i)=>{const m=ctx.mesh(at(G.cyl(0.0045,0.0045,1,6),[0,0.5,0]),{tone:0.55,color:col});m.position.x=x0+(i+0.5)*L/nst;root.add(m);return m;});
  const bstems=b?Array.from({length:nst},(_,i)=>{const m=ctx.mesh(at(G.cyl(0.0035,0.0035,1,6),[0,0.5,0],[90,0,0]),{tone:0.4});m.position.x=x0+(i+0.5)*L/nst;root.add(m);return m;}):[];
  // wavelength bracket
  const br=new THREE.Group();const by=A+0.14;br.add(ctx.mesh(G.merge([rod([0,by,0],[lam,by,0],0.005,6),rod([0,by-0.04,0],[0,by+0.04,0],0.005,6),rod([lam,by-0.04,0],[lam,by+0.04,0],0.005,6)]),{tone:0.85}));
  root.add(br);
  bounds(ctx,root,[-L/2,-A-0.05,b?-A:-0.05],[L/2+0.24,A+0.2,b?A:0.05]);
  const k=Math.PI*2/lam;
  return {root,grounded:false,update(c,t){
   const amp=A*clamp(c.amp??1,0,2),ph=t*(c.speed??1)*2.2,dr=clamp(c.draw??1);c.lineglow=1;
   const env=(x:number)=>smooth((dr*(L+0.4)-(x-x0))/0.4);
   e.set((u,o)=>{const x=x0+u*L;o.set(x,amp*Math.sin(k*x-ph)*env(x),0);});
   b?.set((u,o)=>{const x=x0+u*L;o.set(x,0,amp*0.8*Math.sin(k*x-ph)*env(x));},new THREE.Vector3(0,1,0));
   stems.forEach(m=>{const x=m.position.x,y=amp*Math.sin(k*x-ph)*env(x);m.scale.y=Math.abs(y)<0.003?0.003:y;m.visible=Math.abs(y)>0.012;});
   bstems.forEach(m=>{const x=m.position.x,z=amp*0.8*Math.sin(k*x-ph)*env(x);m.scale.z=Math.abs(z)<0.003?0.003:z;m.visible=Math.abs(z)>0.012;});
   // bracket sits over a crest-to-crest span
   const crest=(ph/k+lam/4)%lam;br.position.x=x0+((crest%lam)+lam)%lam;br.visible=dr>0.6&&amp>0.02;br.position.y=amp-A;
  }};
 },
});

export const barChart3d=defineModel({
 id:'bar-chart-3d',aliases:['bar-chart','bar-graph','chart','statistics','histogram','data-bars'],
 describe:'A 3D bar chart on a base plate with a back grid wall and axis lines: one rounded bar per value (params.values), heights to scale; params.highlight index makes one bar bright and the rest dimmer. `grow` raises the bars one after another.',
 params:{values:'array of numbers (default [3,5,4,7,9])',highlight:'index of bar to emphasise (optional)'},controls:{grow:'0 flat .. 1 full height (default 1)'},defaults:{grow:1},size:'1.6 m',
 build(ctx){
  const vals=nums(ctx,'values',[3,5,4,7,9]).map(v=>Math.max(0,v));const max=Math.max(1e-6,...vals),n=vals.length,hi=ctx.params.highlight===undefined?-1:Math.round(ctx.num('highlight',-1,-1,n-1));
  const bw=0.2,gap=0.11,W=n*(bw+gap)+gap,Hm=1.1,root=new THREE.Group();
  root.add(ctx.mesh(at(G.rbox(W+0.08,0.04,0.48,0.012),[0,0.02,0]),{tone:0.5}));
  root.add(ctx.mesh(at(G.box(W+0.08,Hm+0.1,0.02),[0,0.04+(Hm+0.1)/2,-0.23]),{tone:0.3}));
  const grid:THREE.BufferGeometry[]=[];for(let i=1;i<=4;i++)grid.push(at(G.box(W+0.06,0.006,0.006),[0,0.04+Hm*i/4,-0.218]));
  grid.push(at(G.box(0.012,Hm+0.12,0.012),[-W/2-0.03,0.04+(Hm+0.12)/2,-0.21]));
  root.add(ctx.mesh(G.merge(grid),{tone:0.75}));
  const bars=vals.map((v,i)=>{const h=Math.max(0.01,v/max*Hm);const tone=hi<0?lerp(0.72,1,i/Math.max(1,n-1)):i===hi?1:0.5;
   const g=new THREE.Group();g.position.set(-W/2+gap+bw/2+i*(bw+gap),0.04,0);root.add(g);
   g.add(ctx.mesh(at(G.rbox(bw,1,bw,0.02),[0,0.5,0]),{tone,rough:0.4}));
   const cap=ctx.mesh(at(G.box(bw*0.9,0.006,bw*0.9),[0,0,0]),{tone:Math.max(0.35,tone-0.35)});root.add(cap);
   return {g,h,cap,x:g.position.x};});
  bounds(ctx,root,[-W/2-0.05,0,-0.25],[W/2+0.05,Hm+0.16,0.25]);
  return {root,grounded:true,update(c){const k=clamp(c.grow??1);bars.forEach((b,i)=>{const kk=ease.out(clamp(k*(1+n*0.25)-i*0.25));const h=Math.max(0.002,b.h*kk);b.g.scale.y=h;b.cap.position.set(b.x,0.04+h+0.0035,0);b.cap.visible=kk>0.02;});}};
 },
});

export const lineGraph3d=defineModel({
 id:'line-graph-3d',aliases:['line-graph','line-chart','trend-line','growth-chart','graph'],
 describe:'A 3D line chart: a thick bright line through the data points (params.values) with dot markers and drop lines, over a base plate with a back grid; `draw` draws the line from left to right with a glowing tip.',
 params:{values:'array of numbers (default rising [2,3,2.5,5,4.4,7,9])'},controls:{draw:'0..1 how much of the line is drawn (default 1)'},defaults:{draw:1},size:'1.8 m',
 build(ctx){
  const vals=nums(ctx,'values',[2,3,2.5,5,4.4,7,9]);const n=Math.max(2,vals.length),mx=Math.max(...vals),mn=Math.min(0,...vals),W=1.7,Hm=1.0,root=new THREE.Group();
  if(vals.length<2)vals.push(vals[0]!);
  const pts=vals.map((v,i)=>new THREE.Vector3(-W/2+0.1+i*(W-0.2)/(n-1),0.06+(v-mn)/Math.max(1e-6,mx-mn)*Hm,0));
  root.add(ctx.mesh(at(G.rbox(W+0.1,0.04,0.4,0.012),[0,0.02,0]),{tone:0.5}));
  root.add(ctx.mesh(at(G.box(W+0.1,Hm+0.15,0.02),[0,0.04+(Hm+0.15)/2,-0.19]),{tone:0.3}));
  const grid:THREE.BufferGeometry[]=[];for(let i=1;i<=4;i++)grid.push(at(G.box(W+0.08,0.006,0.006),[0,0.06+Hm*i/4,-0.178]));for(let i=0;i<n;i++)grid.push(at(G.box(0.005,Hm+0.1,0.005),[pts[i]!.x,0.04+(Hm+0.1)/2,-0.178]));
  root.add(ctx.mesh(G.merge(grid),{tone:0.62}));
  const curve=new THREE.CatmullRomCurve3(pts,false,'centripetal');const segs=n*24;
  const tube=new THREE.TubeGeometry(curve,segs,0.022,10,false);const line=ctx.mesh(tube,{tone:1,glow:0.7,glowControl:'lg'});root.add(line);
  const idxCount=tube.index!.count;
  const markers=pts.map(p=>{const g=new THREE.Group();g.position.copy(p);g.add(ctx.mesh(G.sphere(0.04,20,14),{tone:1}));g.add(ctx.mesh(at(G.torus(0.05,0.008,8,32),[0,0,0]),{tone:0.6}));root.add(g);
   const drop=ctx.mesh(at(G.cyl(0.004,0.004,p.y-0.04,6),[p.x,0.04+(p.y-0.04)/2,0]),{tone:0.45});root.add(drop);return {g,drop};});
  const tip=ctx.mesh(G.sphere(0.035,16,12),{tone:1,glow:4,glowControl:'lg'});root.add(tip);
  bounds(ctx,root,[-W/2-0.05,0,-0.2],[W/2+0.05,Hm+0.2,0.2]);
  return {root,grounded:true,update(c){const k=clamp(c.draw??1);c.lg=1;const cnt=Math.floor(segs*k)*10*6;tube.setDrawRange(0,Math.min(idxCount,cnt));line.visible=k>0.005;
   curve.getPointAt(k,tip.position);tip.visible=k>0.005&&k<0.999;markers.forEach((m,i)=>{const on=i/(n-1)<=k+1e-3;m.g.visible=on;m.drop.visible=on;});}};
 },
});

// ---------------------------------------------------------------- infrastructure
export const serverRack=defineModel({
 id:'server-rack',aliases:['server','servers','data-center','datacenter','cloud','rack','supercomputer'],
 describe:'A tall data-centre server rack: dark cabinet frame filled with stacked 1U/2U servers, each with vent slots, drive bays and rows of blinking status lights. `activity` controls how busy the lights blink.',
 controls:{activity:'0 steady lights .. 1 busy blinking (default 1)'},defaults:{activity:1},size:'2 m tall',
 build(ctx){
  const root=new THREE.Group(),W=0.62,H=2.0,D=0.9,r=rng(ctx.seed);
  const fr:THREE.BufferGeometry[]=[];for(const x of [-W/2,W/2])for(const z of [-D/2,D/2])fr.push(at(G.box(0.04,H,0.04),[x,H/2,z]));
  for(const y of [0.03,H-0.03])fr.push(at(G.box(W+0.04,0.06,D+0.04),[0,y,0]));
  root.add(ctx.mesh(G.merge(fr),{tone:0.6}));
  root.add(ctx.mesh(at(G.box(W-0.02,H-0.1,D-0.02),[0,H/2,-0.02]),{tone:0.3}));
  const rails:THREE.BufferGeometry[]=[];for(const x of [-W/2+0.035,W/2-0.035]){rails.push(at(G.box(0.025,H-0.12,0.01),[x,H/2,D/2-0.01]));for(let i=0;i<40;i++)rails.push(at(G.box(0.006,0.006,0.003),[x,0.1+i*0.045,D/2-0.004]));}
  root.add(ctx.mesh(G.merge(rails),{tone:0.95}));
  const leds:{m:THREE.Mesh;i:number;rate:number;steady:boolean}[]=[];let y=0.1,u=0;
  const panels:THREE.BufferGeometry[]=[],bays:THREE.BufferGeometry[]=[],slots:THREE.BufferGeometry[]=[],handles:THREE.BufferGeometry[]=[];
  while(y<H-0.18){const h=(u%3===1?2:1)*0.0445*1.9;const cy=y+h/2;
   panels.push(at(G.rbox(W-0.1,h-0.008,0.03,0.004),[0,cy,D/2-0.02]));
   if(h>0.1){for(let b=0;b<6;b++)bays.push(at(G.rbox(0.06,h*0.7,0.012,0.003),[-0.2+b*0.068,cy,D/2-0.002]));for(let b=0;b<6;b++)slots.push(at(G.box(0.04,0.005,0.004),[-0.2+b*0.068,cy-h*0.22,D/2+0.005]));}
   else{for(let v=0;v<14;v++)slots.push(at(G.box(0.006,h*0.5,0.004),[-0.24+v*0.016,cy,D/2-0.002]));for(let b=0;b<3;b++)bays.push(at(G.rbox(0.05,h*0.6,0.01,0.003),[0.0+b*0.058,cy,D/2-0.002]));}
   handles.push(at(G.box(0.014,h*0.6,0.02),[-W/2+0.07,cy,D/2]),at(G.box(0.014,h*0.6,0.02),[W/2-0.07,cy,D/2]));
   for(let l=0;l<4;l++){const m=ctx.mesh(at(G.box(0.012,0.012,0.006),[W/2-0.1-l*0.02,cy+h*0.18,D/2+0.003]),{tone:0.4,glow:2.6,glowControl:`led${leds.length}`});root.add(m);leds.push({m,i:leds.length,rate:3+r()*7,steady:l===3});}
   y+=h+0.006;u++;}
  root.add(ctx.mesh(G.merge(panels),{tone:0.62,rough:0.4}));root.add(ctx.mesh(G.merge(bays),{tone:0.88}));root.add(ctx.mesh(G.merge(slots),{tone:0.2}));root.add(ctx.mesh(G.merge(handles),{tone:1}));
  // top vents
  root.add(ctx.mesh(G.merge(Array.from({length:8},(_,i)=>at(G.box(W-0.1,0.004,0.02),[0,H+0.002,-0.3+i*0.08]))),{tone:0.35}));
  return {root,grounded:true,update(c,t){const a=clamp(c.activity??1);for(const l of leds){const on=l.steady?1:(hash1(Math.floor(t*l.rate)+l.i*31.7)>0.42?1:0.12);c[`led${l.i}`]=lerp(l.steady?1:0.75,on,a);}}};
 },
});

function signalRings(ctx:ModelCtx,parent:THREE.Object3D,n:number,key:string,arc:number,base:number,flat:boolean){
 return Array.from({length:n},(_,i)=>{const g=new THREE.Group();const m=ctx.mesh(at(G.torus(1,0.022,8,64,arc),[0,0,0],flat?[90,0,0]:[0,0,90-deg(arc)/2*0+(180-arc*180/Math.PI)/2]),{tone:0.5,glow:2.6,glowControl:`${key}${i}`});g.add(m);parent.add(g);void base;return g;});
}
export const radioTower=defineModel({
 id:'radio-tower',aliases:['cell-tower','antenna-tower','transmitter','broadcast-tower','radio-mast','5g','signal-tower','antenna'],
 describe:'A tall steel lattice radio / cell tower: tapered three-legged truss with zig-zag bracing, cellular panel antennas and dishes near the top, a blinking red beacon, and glowing signal rings expanding outward from the top. `signal` turns on the broadcast rings.',
 controls:{signal:'0 off .. 1 broadcasting rings (default 1)'},defaults:{signal:1},size:'4.5 m',
 build(ctx){
  const root=new THREE.Group(),H=4.2,b0=0.55,b1=0.12;
  const leg=(y:number,i:number)=>{const s=lerp(b0,b1,y/H),a=i/3*Math.PI*2+Math.PI/2;return [Math.cos(a)*s,y,Math.sin(a)*s] as V3;};
  const legs:THREE.BufferGeometry[]=[],br:THREE.BufferGeometry[]=[];
  for(let i=0;i<3;i++)legs.push(rod(leg(0,i),leg(H,i),0.02,8,0.015));
  const lv=14;for(let k=0;k<lv;k++){const y0=k*H/lv,y1=(k+1)*H/lv;for(let i=0;i<3;i++){const j=(i+1)%3;br.push(rod(leg(y1,i),leg(y1,j),0.007,5));br.push(rod(leg(y0,i),leg(y1,j),0.0055,5));br.push(rod(leg(y0,j),leg(y1,i),0.0055,5));}}
  root.add(ctx.mesh(G.merge(legs),{tone:1}));root.add(ctx.mesh(G.merge(br),{tone:0.72}));
  root.add(ctx.mesh(at(G.box(1.4,0.06,1.4),[0,0.03,0]),{tone:0.4}));
  root.add(ctx.mesh(at(G.cyl(0.025,0.03,0.9,12),[0,H+0.45,0]),{tone:0.9}));
  const ant:THREE.BufferGeometry[]=[];for(let i=0;i<3;i++){const a=i/3*Math.PI*2+Math.PI/6;for(const yy of [H-0.35,H-0.95])ant.push(at(G.rbox(0.1,0.42,0.045,0.012),[Math.cos(a)*0.3,yy,Math.sin(a)*0.3],[0,-a*180/Math.PI+90,0]));}
  root.add(ctx.mesh(G.merge(ant),{tone:0.9}));
  const mounts:THREE.BufferGeometry[]=[];for(let i=0;i<3;i++){const a=i/3*Math.PI*2+Math.PI/6;for(const yy of [H-0.35,H-0.95])mounts.push(rod([0,yy,0],[Math.cos(a)*0.28,yy,Math.sin(a)*0.28],0.01,6));}root.add(ctx.mesh(G.merge(mounts),{tone:0.6}));
  const dp:[number,number][]=[];for(let i=0;i<=10;i++){const r=0.16*i/10;dp.push([r,r*r*1.6]);}
  for(const [a,yy] of [[0.4,H-1.6],[2.6,H-1.9]] as const){root.add(ctx.mesh(at(G.lathe(dp,32),[Math.cos(a)*0.22,yy,Math.sin(a)*0.22],[0,0,0]).rotateX(0),{tone:0.95,side:THREE.DoubleSide}).rotateX(0));}
  const dishes:THREE.BufferGeometry[]=[];for(const [a,yy] of [[0.4,H-1.6],[2.6,H-1.9]] as const){const g=G.lathe(dp,32);g.rotateX(Math.PI/2);g.rotateY(-a+Math.PI/2);g.translate(Math.cos(a)*0.24,yy,Math.sin(a)*0.24);dishes.push(g);}
  root.children.splice(root.children.length-2,2);root.add(ctx.mesh(G.merge(dishes),{tone:0.95,side:THREE.DoubleSide}));
  const beacon=ctx.mesh(at(G.sphere(0.045,16,12),[0,H+0.92,0]),{color:'#ff2a2a',tone:0.8,glow:3,glowControl:'beacon'});root.add(beacon);
  const top=new THREE.Group();top.position.y=H-0.2;root.add(top);
  const rings=signalRings(ctx,top,4,'ring',Math.PI*2,0,true);
  bounds(ctx,root,[-1.9,0,-1.9],[1.9,H+1,1.9]);
  return {root,grounded:true,update(c,t){const s=clamp(c.signal??1);c.beacon=Math.sin(t*Math.PI*1.3)>0?1:0.15;
   rings.forEach((g,i)=>{const u=(t*0.4+i/4)%1;g.scale.setScalar(0.25+u*1.6);g.position.y=-u*0.25;c[`ring${i}`]=s*(1-u)*smooth(u*6);g.visible=s>0.02&&u<0.97;});}};
 },
});

export const wifiRouter=defineModel({
 id:'wifi-router',aliases:['router','wifi','wi-fi','wireless','wireless-router','internet-signal'],
 describe:'A home Wi-Fi router: flat box with a row of status lights and three antennas, with the classic Wi-Fi symbol (dot and three arcs) floating above lighting up arc by arc. `signal` animates the arcs.',
 controls:{signal:'0 off .. 1 arcs pulsing (default 1)'},defaults:{signal:1},size:'0.4 m',
 build(ctx){
  const root=new THREE.Group();
  root.add(ctx.mesh(at(G.rbox(0.38,0.06,0.25,0.02),[0,0.04,0]),{tone:0.85,rough:0.4}));
  root.add(ctx.mesh(at(G.box(0.36,0.012,0.23),[0,0.006,0]),{tone:0.45}));
  root.add(ctx.mesh(G.merge(Array.from({length:10},(_,i)=>at(G.box(0.012,0.002,0.12),[-0.1+i*0.022,0.071,-0.03]))),{tone:0.4}));
  const leds=Array.from({length:5},(_,i)=>{const m=ctx.mesh(at(G.cyl(0.007,0.007,0.004,12),[-0.09+i*0.045,0.045,0.126],[90,0,0]),{tone:0.5,glow:2.5,glowControl:`l${i}`});root.add(m);return m;});
  for(const [x,a] of [[-0.14,12],[0,0],[0.14,-12]] as const){root.add(ctx.mesh(at(G.cyl(0.018,0.018,0.04,16),[x,0.075,-0.11]),{tone:0.6}));root.add(ctx.mesh(at(G.capsule(0.014,0.2,6,14),[x-Math.sin(deg(a))*0.11,0.2,-0.11],[0,0,a]),{tone:0.9}));}
  const icon=new THREE.Group();icon.position.set(0,0.45,0);root.add(icon);
  icon.add(ctx.mesh(G.sphere(0.03,20,14),{tone:1,glow:2,glowControl:'a0'}));
  const arcs=[0.09,0.16,0.23].map((R,i)=>{const g=G.torus(R,0.018,10,48,deg(90));g.rotateZ(deg(45));const m=ctx.mesh(g,{tone:0.5,glow:2.6,glowControl:`a${i+1}`});icon.add(m);return m;});void arcs;
  return {root,grounded:true,update(c,t){const s=clamp(c.signal??1);const p=(t*1.4)%4;
   for(let i=0;i<4;i++){c[`a${i}`]=lerp(0.25,1,s*smooth(clamp(p-i+0.6))*(p<3.6?1:smooth((4-p)/0.4)));}
   leds.forEach((_,i)=>{c[`l${i}`]=i<2?1:(hash1(Math.floor(t*(5+i))+i*7)>0.4?1:0.2);});}};
 },
});

export const wafer=defineModel({
 id:'semiconductor-wafer',aliases:['wafer','silicon-wafer','chip-wafer','fab'],
 describe:'A polished silicon wafer: thin mirror-like disc with an orientation notch, covered in a grid of rectangular chip dies with scribe lines between them, presented tilted toward the camera. `scan` sweeps a glowing test line across the dies.',
 params:{flat:'true lies flat (default tilted)'},controls:{scan:'0..1 glowing test sweep across the dies'},size:'1 m display',
 build(ctx){
  const R=0.5,wafer=new THREE.Group();
  const o:[number,number][]=[];for(let i=0;i<=120;i++){const a=-Math.PI/2+deg(3)+i/120*(Math.PI*2-deg(6));o.push([Math.cos(a)*R,Math.sin(a)*R]);}o.push([0,-R+0.03]);
  wafer.add(ctx.mesh(at(G.extrude(o,0.014,0.004),[0,0,0],[90,0,0]),{tone:0.55,rough:0.15}));
  const dw=0.064,dh=0.05,g=0.008;const rows:THREE.BufferGeometry[][]=[];const inner:THREE.BufferGeometry[]=[];
  for(let j=-10;j<=10;j++){const row:THREE.BufferGeometry[]=[];for(let i=-8;i<=8;i++){const x=i*(dw+g),z=j*(dh+g);const far=Math.max(Math.hypot(x+Math.sign(x||1)*dw/2,z+Math.sign(z||1)*dh/2));if(far>R-0.025)continue;
   row.push(at(G.box(dw,0.004,dh),[x,0.009,z]));inner.push(at(G.box(dw*0.5,0.002,dh*0.3),[x-dw*0.12,0.0115,z-dh*0.18]),at(G.box(dw*0.25,0.002,dh*0.35),[x+dw*0.24,0.0115,z+dh*0.15]));}
   if(row.length)rows.push(row);}
  rows.forEach((row,i)=>wafer.add(ctx.mesh(G.merge(row),{tone:0.9,rough:0.25,glow:1.8,glowControl:`row${i}`})));
  wafer.add(ctx.mesh(G.merge(inner),{tone:0.62}));
  const root=new THREE.Group();root.add(wafer);if(!ctx.bool('flat',false))wafer.rotation.x=deg(58);
  const n=rows.length;
  return {root,grounded:false,update(c,t){const s=clamp(c.scan??0);const p=((t*0.35)%1.3)-0.15;for(let i=0;i<n;i++){const d=i/(n-1)-p;c[`row${i}`]=s*Math.exp(-d*d*120);}}};
 },
});

// ---------------------------------------------------------------- audio
export const speaker=defineModel({
 id:'speaker',aliases:['loudspeaker','sound','audio','subwoofer','speaker-box','music'],
 describe:'A loudspeaker cabinet: woofer with rubber surround, ribbed cone and dust cap, a tweeter dome above, bass port below; the cone pumps in and out and glowing sound-wave rings pulse forward. `play` controls volume (0 silent).',
 controls:{play:'0 silent .. 1 loud (default 1)'},defaults:{play:1},size:'0.7 m',
 build(ctx){
  const root=new THREE.Group(),W=0.42,H=0.68,D=0.36,front=D/2;
  root.add(ctx.mesh(at(G.rbox(W,H,D,0.03),[0,H/2,0]),{tone:0.55,rough:0.5}));
  root.add(ctx.mesh(at(G.rbox(W-0.03,H-0.03,0.01,0.01),[0,H/2,front-0.001]),{tone:0.38}));
  const screws:THREE.BufferGeometry[]=[];
  const woof=new THREE.Group();woof.position.set(0,0.27,front+0.004);root.add(woof);
  woof.add(ctx.mesh(at(G.torus(0.165,0.014,10,64),[0,0,0.006]),{tone:0.95}));
  for(let i=0;i<8;i++){const a=i/8*Math.PI*2+Math.PI/8;screws.push(at(G.cyl(0.008,0.008,0.008,10),[Math.cos(a)*0.165,0.27+Math.sin(a)*0.165,front+0.02],[90,0,0]));}
  const cone=new THREE.Group();woof.add(cone);
  cone.add(ctx.mesh(at(G.torus(0.138,0.016,10,64),[0,0,0.006]),{tone:0.7}));
  const cp:[number,number][]=[[0.125,0],[0.1,-0.022],[0.07,-0.042],[0.045,-0.055]];
  const cg=G.lathe(cp,64);cg.rotateX(Math.PI/2);cone.add(ctx.mesh(cg,{tone:0.85,side:THREE.DoubleSide,rough:0.7}));
  const rib:THREE.BufferGeometry[]=[];for(const rr of [0.075,0.1])rib.push(at(G.torus(rr,0.0025,6,64),[0,0,-(0.125-rr)*0.85+0.001]));cone.add(ctx.mesh(G.merge(rib),{tone:0.55}));
  const cap=G.sphere(0.05,32,16,);cap.scale(1,1,0.55);cone.add(ctx.mesh(at(cap,[0,0,-0.05]),{tone:1,rough:0.3}));
  const tw=new THREE.Group();tw.position.set(0,0.555,front+0.004);root.add(tw);
  tw.add(ctx.mesh(at(G.cyl(0.06,0.06,0.012,40),[0,0,0.004],[90,0,0]),{tone:0.75}));
  tw.add(ctx.mesh(at(G.torus(0.04,0.008,8,40),[0,0,0.012]),{tone:0.5}));
  const dome=new THREE.SphereGeometry(0.032,24,12,0,Math.PI*2,0,Math.PI/2);dome.rotateX(Math.PI/2);dome.scale(1,1,0.7);tw.add(ctx.mesh(at(dome,[0,0,0.01]),{tone:1,rough:0.2}));
  for(let i=0;i<4;i++){const a=i/4*Math.PI*2+Math.PI/4;screws.push(at(G.cyl(0.006,0.006,0.008,10),[Math.cos(a)*0.05,0.555+Math.sin(a)*0.05,front+0.012],[90,0,0]));}
  root.add(ctx.mesh(G.merge(screws),{tone:1}));
  root.add(ctx.mesh(at(G.cyl(0.032,0.032,0.02,32,true),[0,0.065,front],[90,0,0]),{tone:0.9,side:THREE.DoubleSide}));
  root.add(ctx.mesh(at(G.cyl(0.03,0.03,0.004,32),[0,0.065,front-0.012],[90,0,0]),{tone:0.1}));
  const waves=[0,1,2,3].map(i=>{const g=new THREE.Group();g.position.set(0,0.27,front);const m=ctx.mesh(G.torus(1,0.012,8,64),{tone:0.4,glow:2.4,glowControl:`w${i}`});g.add(m);root.add(g);return g;});
  bounds(ctx,root,[-W/2-0.1,0,-D/2],[W/2+0.1,H,front+0.8]);
  return {root,grounded:true,update(c,t){const p=clamp(c.play??1);
   const beat=Math.pow(Math.max(0,Math.sin(t*Math.PI*2*1.8)),3);cone.position.z=p*(0.012*beat+0.003*Math.sin(t*90));
   waves.forEach((g,i)=>{const u=(t*0.55+i/4)%1;g.position.z=front+0.02+u*0.75;const s=0.16+u*0.3;g.scale.set(s,s,1);c[`w${i}`]=p*(1-u)*smooth(u*5);g.visible=p>0.02&&u<0.97;});}};
 },
});

export const microphone=defineModel({
 id:'microphone',aliases:['mic','handheld-mic','podcast-mic','vocal-mic','recording'],
 describe:'A handheld vocal microphone held upright in a desk stand: round mesh grille ball with a wire-grid pattern, metal band, tapered body with a switch and a cable; `level` makes glowing sound rings flow into the grille.',
 params:{stand:'true (default) | false'},controls:{level:'0..1 incoming sound rings'},size:'0.35 m',
 build(ctx){
  const root=new THREE.Group(),mic=new THREE.Group();mic.position.set(0,0.12,0);mic.rotation.z=deg(-12);root.add(mic);
  const Rg=0.048;
  mic.add(ctx.mesh(at(G.sphere(Rg*0.96,40,28),[0,0.215,0]),{tone:0.38}));
  const grid:THREE.BufferGeometry[]=[];for(let i=1;i<8;i++){const a=-Math.PI/2+i/8*Math.PI;const y=Math.sin(a)*Rg,r=Math.cos(a)*Rg;if(r<0.008)continue;grid.push(at(G.torus(r,0.0018,5,48),[0,0.215+y,0],[90,0,0]));}
  for(let i=0;i<8;i++){const g=G.torus(Rg,0.0018,5,64,Math.PI);g.rotateZ(Math.PI/2);g.rotateY(i/8*Math.PI);g.translate(0,0.215,0);grid.push(g);}
  mic.add(ctx.mesh(G.merge(grid),{tone:1,rough:0.2}));
  mic.add(ctx.mesh(at(G.cyl(0.049,0.049,0.03,40),[0,0.168,0]),{tone:0.95,rough:0.2}));
  mic.add(ctx.mesh(at(G.torus(0.049,0.004,8,40),[0,0.183,0],[90,0,0]),{tone:0.6}));
  mic.add(ctx.mesh(G.lathe([[0.046,0.155],[0.04,0.11],[0.03,0.03],[0.024,0],[0,0]],40),{tone:0.6,rough:0.35}));
  mic.add(ctx.mesh(at(G.rbox(0.014,0.03,0.01,0.003),[0,0.11,0.04],[-8,0,0]),{tone:1}));
  mic.add(ctx.mesh(at(G.cyl(0.018,0.018,0.012,24),[0,-0.004,0]),{tone:0.85}));
  root.add(ctx.mesh(G.tube([[0.0,0.11,0],[0.03,0.06,0],[0.06,0.02,0.03],[0.14,0.006,0.06],[0.26,0.006,0.02]],0.006,32,8),{tone:0.45}));
  if(ctx.bool('stand',true)){
   root.add(ctx.mesh(at(G.cyl(0.08,0.09,0.018,40),[0,0.009,0]),{tone:0.7}));
   root.add(ctx.mesh(at(G.cyl(0.008,0.008,0.12,12),[0,0.07,0]),{tone:0.85}));
   root.add(ctx.mesh(at(G.torus(0.032,0.008,8,32,deg(260)),[0.004,0.15,0],[90,0,deg(-40)*0+(-40)]),{tone:0.5}));
  }
  const rings=[0,1,2].map(i=>{const g=new THREE.Group();const m=ctx.mesh(at(G.torus(1,0.01,8,48),[0,0,0],[0,90,0]),{tone:0.4,glow:2.4,glowControl:`m${i}`});g.add(m);root.add(g);return g;});
  const head=new THREE.Vector3(Math.sin(deg(12))*0.215,0.12+Math.cos(deg(12))*0.215,0);
  bounds(ctx,root,[-0.12,0,-0.1],[0.4,0.38,0.1]);
  return {root,grounded:true,update(c,t){const l=clamp(c.level??0);rings.forEach((g,i)=>{const u=(t*0.6+i/3)%1;g.position.set(head.x+0.35*(1-u),head.y,0);g.scale.setScalar(0.03+0.09*(1-u));c[`m${i}`]=l*smooth(u*4)*smooth((1-u)*4);g.visible=l>0.02;});}};
 },
});
