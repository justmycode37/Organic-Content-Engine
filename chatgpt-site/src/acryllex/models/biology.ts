// biology model pack (see docs/acryllex.md). Export ModelDefs from this file.
import * as THREE from 'three';
import {G,at,deg,rng,lerp,clamp,smooth,roughen} from '../kit.ts';
import {defineModel,type ModelCtx} from './types.ts';

type V3=[number,number,number];

/** Move every vertex through f (in place) and recompute normals. */
function deform(g:THREE.BufferGeometry,f:(v:THREE.Vector3)=>void){
 const p=g.attributes.position!,v=new THREE.Vector3();
 for(let i=0;i<p.count;i++){v.set(p.getX(i),p.getY(i),p.getZ(i));f(v);p.setXYZ(i,v.x,v.y,v.z);}
 p.needsUpdate=true;g.computeVertexNormals();return g;
}
/** Tube with radius interpolated along the path (radii per control point), ends capped with spheres. */
function vtube(points:V3[],radii:number[],seg=64,radial=16,caps=true){
 const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
 const g=new THREE.TubeGeometry(curve,seg,1,radial,false);
 const p=g.attributes.position!,c=new THREE.Vector3(),v=new THREE.Vector3();
 const rad=(u:number)=>{const f=u*(radii.length-1),i=Math.min(radii.length-2,Math.floor(f));return lerp(radii[i]!,radii[i+1]!,smooth(f-i));};
 for(let i=0;i<=seg;i++){curve.getPointAt(i/seg,c);const r=rad(i/seg);for(let j=0;j<=radial;j++){const k=i*(radial+1)+j;v.set(p.getX(k),p.getY(k),p.getZ(k)).sub(c).multiplyScalar(r).add(c);p.setXYZ(k,v.x,v.y,v.z);}}
 g.computeVertexNormals();
 if(!caps)return g;
 const a=points[0]!,b=points[points.length-1]!;
 return G.merge([g,at(G.sphere(radii[0]!,radial,10),a),at(G.sphere(radii[radii.length-1]!,radial,10),b)]);
}
const bump=(x:number,c:number,w:number)=>Math.exp(-(((x-c)/w)**2));
const fract=(x:number)=>x-Math.floor(x);
/** Evenly spread unit directions (Fibonacci sphere). */
function fib(n:number){const out:THREE.Vector3[]=[];const ga=Math.PI*(3-Math.sqrt(5));for(let i=0;i<n;i++){const y=1-2*(i+0.5)/n,r=Math.sqrt(1-y*y);out.push(new THREE.Vector3(Math.cos(i*ga)*r,y,Math.sin(i*ga)*r));}return out;}
/** Orient a unit-height cylinder (y 0..1) from a to b. */
const UP=new THREE.Vector3(0,1,0);
function span(m:THREE.Object3D,a:THREE.Vector3,b:THREE.Vector3,tmp=new THREE.Vector3()){
 tmp.subVectors(b,a);const len=Math.max(1e-4,tmp.length());m.position.copy(a);m.quaternion.setFromUnitVectors(UP,tmp.multiplyScalar(1/len));m.scale.set(1,len,1);
}

// ---------------------------------------------------------------- eye
export const eye=defineModel({
 id:'eye',aliases:['eyeball','human-eye','eyes','vision','sight','retina','pupil','iris'],
 describe:'Isolated anatomy DIAGRAM, not a realistic person or face. For a viewer looking at something show a whole face with reference-image/reference-video, not this detached eyeball. A big human eyeball: bright sclera with faint veins, textured iris ring, dark round pupil, cornea rim and catch-light, optic nerve trailing behind. `dilate` widens the pupil, `look` turns the eye sideways.',
 params:{nerve:'true (default) | false: optic nerve at the back'},
 controls:{dilate:'0 pinpoint pupil .. 1 wide open (default 0.35)',look:'-1 look left .. 0 straight .. 1 look right',lookUp:'-1 down .. 1 up'},
 defaults:{dilate:0.35,look:0,lookUp:0},size:'1 m display (real 2.4 cm)',
 build(ctx){
  const R=0.5,ri=0.2,cap=Math.asin(ri/R);
  const root=new THREE.Group(),ball=new THREE.Group();root.add(ball);
  // sclera: sphere with a front opening, pole turned to +z
  const sc=new THREE.SphereGeometry(R,72,48,0,Math.PI*2,cap,Math.PI-cap);sc.rotateX(Math.PI/2);
  ball.add(ctx.mesh(sc,{tone:0.95,rough:0.55}));
  // iris: shallow cone with radial fibres
  const prof:[number,number][]=[];for(let i=0;i<=14;i++){const r=lerp(0.035,ri+0.004,i/14);prof.push([r,Math.sqrt(R*R-ri*ri)-0.022+0.02*(i/14)]);}
  const ir=G.lathe(prof,160);ir.rotateX(Math.PI/2);
  deform(ir,v=>{const a=Math.atan2(v.y,v.x),r=Math.hypot(v.x,v.y),k=(r-0.035)/(ri-0.035);v.z+=0.007*Math.sin(a*42+Math.sin(a*7)*2)*Math.sin(Math.PI*k)+0.008*bump(k,0.38,0.08);});
  ball.add(ctx.mesh(ir,{tone:0.6,rough:0.5}));
  // collarette ring and dark limbal ring
  ball.add(ctx.mesh(at(G.torus(0.105,0.006,8,96),[0,0,Math.sqrt(R*R-ri*ri)-0.011]),{tone:0.85}));
  ball.add(ctx.mesh(at(G.torus(ri,0.012,10,96),[0,0,Math.sqrt(R*R-ri*ri)-0.002]),{tone:0.32}));
  // pupil
  const pupil=ctx.mesh(at(new THREE.CircleGeometry(1,48),[0,0,Math.sqrt(R*R-ri*ri)-0.014]),{tone:0.04});ball.add(pupil);
  // cornea bulge suggested by a thin clear rim + catch-light
  ball.add(ctx.mesh(at(G.torus(ri+0.018,0.006,8,96),[0,0,Math.sqrt(R*R-(ri+0.018)**2)+0.004]),{tone:1}));
  ball.add(ctx.mesh(at(G.ellipsoid(0.04,0.03,0.01,16,10),[-0.07,0.075,Math.sqrt(R*R-ri*ri)-0.004],[0,0,30]),{tone:1,glow:1.6,glowControl:'shine'}));
  // veins on the sclera
  const r=rng(ctx.seed+11);const veins:THREE.BufferGeometry[]=[];
  for(let i=0;i<9;i++){const a0=r()*Math.PI*2;const pts:V3[]=[];let a=a0;for(let k=0;k<6;k++){const th=cap+0.08+k*0.11;a+=(r()-0.5)*0.35;const s=Math.sin(th),c=Math.cos(th);pts.push([R*1.004*s*Math.cos(a),R*1.004*s*Math.sin(a),R*1.004*c]);}
   veins.push(G.tube(pts,0.0045,24,5));}
  ball.add(ctx.mesh(G.merge(veins),{tone:0.55}));
  if(ctx.bool('nerve',true)){
   ball.add(ctx.mesh(vtube([[0,0,-0.42],[0.02,-0.02,-0.62],[0.08,-0.05,-0.82],[0.16,-0.06,-0.98]],[0.1,0.085,0.08,0.075],40,18),{tone:0.72}));
   // extraocular muscle stubs
   for(const [x,y] of [[0,1],[0,-1],[1,0],[-1,0]] as const)ball.add(ctx.mesh(vtube([[x*0.36,y*0.36,0.12],[x*0.48,y*0.48,-0.12],[x*0.42,y*0.42,-0.38]],[0.03,0.06,0.04],24,10),{tone:0.62}));
  }
  return {root,grounded:false,update(c,t){
   const d=clamp(c.dilate??0.35,0,1);const pr=lerp(0.04,0.15,d);pupil.scale.set(pr,pr,1);
   const sx=0.03*Math.sin(t*0.9)*Math.sin(t*2.3),sy=0.02*Math.sin(t*1.3+1);
   ball.rotation.set(-deg(28)*clamp(c.lookUp??0,-1,1)+sy,deg(32)*clamp(c.look??0,-1,1)+sx,0);
  }};
 },
});

// ---------------------------------------------------------------- heart
export const heart=defineModel({
 id:'heart',aliases:['human-heart','anatomical-heart','heartbeat','cardiac','organ-heart'],
 describe:'An anatomical human heart: muscular ventricles tapering to an apex, atria, arching aorta with three branches, pulmonary trunk, vena cava and coronary vessels on the surface; beats (lub-dub) continuously. `beat` sets the heart rate.',
 controls:{beat:'beat speed: 0 stopped .. 1 resting (default) .. 2 racing'},defaults:{beat:1},size:'1 m display',
 build(ctx){
  const root=new THREE.Group(),pump=new THREE.Group(),vessels=new THREE.Group();root.add(pump,vessels);root.scale.setScalar(0.7);
  const prof:[number,number][]=[[0,-0.64],[0.07,-0.6],[0.16,-0.5],[0.25,-0.35],[0.32,-0.17],[0.355,0.0],[0.35,0.13],[0.3,0.23],[0.2,0.3],[0,0.33]];
  const rAt=(y:number)=>{for(let i=0;i<prof.length-1;i++){const a=prof[i]!,b=prof[i+1]!;if(y>=a[1]&&y<=b[1])return lerp(a[0],b[0],(y-a[1])/(b[1]-a[1]));}return 0;};
  const tilt=new THREE.Matrix4().makeRotationZ(deg(26));
  const surf=(phi:number,y:number,lift=0.012):V3=>{const r=rAt(y)+lift;const v=new THREE.Vector3(r*Math.sin(phi),y,r*Math.cos(phi)*0.84).applyMatrix4(tilt);return [v.x,v.y,v.z];};
  const body=G.lathe(prof,72);body.scale(1,1,0.84);body.applyMatrix4(tilt);
  pump.add(ctx.mesh(roughen(body,0.006,14,ctx.seed%5),{tone:0.92}));
  // right ventricle bulge (front, viewer left)
  pump.add(ctx.mesh(at(G.ellipsoid(0.24,0.33,0.17,48,32),[-0.1,-0.06,0.11],[0,0,22]),{tone:0.88}));
  // atria + auricles
  pump.add(ctx.mesh(roughen(at(G.ellipsoid(0.15,0.15,0.15,32,24),[-0.29,0.2,0.0]),0.01,16,2),{tone:0.75}));
  pump.add(ctx.mesh(roughen(at(G.ellipsoid(0.1,0.06,0.05,24,16),[-0.22,0.31,0.15],[0,0,-25]),0.008,30,3),{tone:0.8}));
  pump.add(ctx.mesh(roughen(at(G.ellipsoid(0.17,0.11,0.13,32,24),[0.1,0.27,-0.16]),0.01,16,4),{tone:0.72}));
  pump.add(ctx.mesh(roughen(at(G.ellipsoid(0.09,0.05,0.06,24,16),[0.24,0.27,0.1],[0,0,20]),0.008,30,5),{tone:0.82}));
  // coronary vessels in the grooves
  const lad:V3[]=[];for(let i=0;i<=10;i++){const k=i/10;lad.push(surf(lerp(-0.05,0.5,k),lerp(0.24,-0.6,k)));}
  const cx:V3[]=[];for(let i=0;i<=10;i++){const k=i/10;cx.push(surf(lerp(0.1,2.0,k),0.2-0.05*k));}
  const rca:V3[]=[];for(let i=0;i<=10;i++){const k=i/10;rca.push(surf(lerp(-0.3,-2.2,k),0.18-0.06*k,0.03));}
  const diag:V3[]=[];for(let i=0;i<=6;i++){const k=i/6;diag.push(surf(lerp(0.15,0.95,k),lerp(0.1,-0.35,k)));}
  const diag2:V3[]=[];for(let i=0;i<=6;i++){const k=i/6;diag2.push(surf(lerp(0.05,-0.6,k),lerp(-0.05,-0.42,k)));}
  const marg:V3[]=[];for(let i=0;i<=6;i++){const k=i/6;marg.push(surf(lerp(1.3,1.5,k),lerp(0.15,-0.4,k)));}
  pump.add(ctx.mesh(G.merge([G.tube(lad,0.016,40,8),G.tube(cx,0.014,40,8),G.tube(rca,0.015,40,8),G.tube(diag,0.011,24,6),G.tube(diag2,0.01,24,6),G.tube(marg,0.011,24,6)]),{tone:0.5}));
  // great vessels
  const end=(p:V3,r:number)=>at(G.cyl(r*0.92,r*0.92,0.012,18),p);
  const aorta=vtube([[-0.02,0.15,0.02],[-0.04,0.48,0.05],[0.02,0.72,0.0],[0.15,0.78,-0.08],[0.25,0.64,-0.17],[0.27,0.3,-0.22],[0.26,-0.25,-0.24]],[0.085,0.085,0.08,0.078,0.075,0.072,0.07],80,20,false);
  vessels.add(ctx.mesh(aorta,{tone:1,rough:0.45}));
  vessels.add(ctx.mesh(G.merge([vtube([[0.0,0.7,0.0],[-0.04,0.85,0.01],[-0.07,1.0,0.0]],[0.04,0.037,0.035],20,12,false),vtube([[0.09,0.76,-0.04],[0.1,0.9,-0.04],[0.11,1.02,-0.04]],[0.03,0.028,0.027],20,12,false),vtube([[0.17,0.74,-0.1],[0.2,0.88,-0.1],[0.25,0.98,-0.1]],[0.033,0.031,0.03],20,12,false)]),{tone:0.95}));
  vessels.add(ctx.mesh(G.merge([end([-0.07,1.0,0],0.035),end([0.11,1.02,-0.04],0.027),end([0.25,0.98,-0.1],0.03)]),{tone:0.3}));
  const pt=vtube([[0.05,0.12,0.2],[0.07,0.38,0.19],[0.1,0.52,0.1]],[0.07,0.068,0.066],30,18,false);
  const lpa=vtube([[0.1,0.52,0.1],[0.24,0.56,0.02],[0.4,0.52,-0.04]],[0.055,0.05,0.045],24,14,false);
  const rpa=vtube([[0.1,0.52,0.1],[-0.06,0.55,-0.1],[-0.3,0.53,-0.14],[-0.42,0.5,-0.16]],[0.055,0.05,0.046,0.044],24,14,false);
  vessels.add(ctx.mesh(G.merge([pt,lpa,rpa]),{tone:0.72}));
  vessels.add(ctx.mesh(G.merge([end([0.4,0.52,-0.04],0.045)]),{tone:0.3}));
  const svc=vtube([[-0.24,0.2,0.0],[-0.24,0.55,-0.01],[-0.23,0.86,-0.02]],[0.062,0.06,0.058],24,16,false);
  const ivc=vtube([[-0.24,0.0,-0.06],[-0.25,-0.32,-0.08]],[0.06,0.058],12,14,false);
  const pv=G.merge([vtube([[0.12,0.27,-0.2],[0.3,0.3,-0.27],[0.42,0.32,-0.3]],[0.035,0.032,0.03],12,10,false),vtube([[0.12,0.22,-0.2],[0.3,0.18,-0.3],[0.42,0.16,-0.32]],[0.035,0.032,0.03],12,10,false)]);
  vessels.add(ctx.mesh(G.merge([svc,ivc,pv]),{tone:0.62}));
  vessels.add(ctx.mesh(G.merge([end([-0.23,0.86,-0.02],0.058),at(end([-0.25,-0.32,-0.08],0.058),[0,0,0])]),{tone:0.3}));
  return {root,grounded:false,update(c,t){
   const rate=clamp(c.beat??1,0,3);const p=fract(t*1.15*rate);
   const k=rate<0.01?0:(0.07*bump(p,0.08,0.05)+0.045*bump(p,0.26,0.05));
   pump.scale.set(1-k*0.6,1-k,1-k*0.6);pump.position.y=k*0.12;vessels.scale.setScalar(1+k*0.12);
  }};
 },
});

// ---------------------------------------------------------------- lungs
export const lungs=defineModel({
 id:'lungs',aliases:['lung','human-lungs','breathing','respiratory-system','trachea','windpipe','bronchi'],
 describe:'A pair of human lungs with lobes separated by fissures (left lung with heart notch), windpipe with cartilage rings splitting into bronchi; breathes in and out. `breathe` sets breathing depth, `inflate` holds a full breath.',
 controls:{breathe:'0 still .. 1 deep breathing cycle (default 0.5)',inflate:'0 exhaled .. 1 fully inflated'},defaults:{breathe:0.5,inflate:0},size:'0.9 m display',
 build(ctx){
  const root=new THREE.Group();
  const lung=(side:1|-1)=>{
   const rx=side>0?0.22:0.245,ry=0.44,rz=0.21;
   const g=G.ellipsoid(rx,ry,rz,80,64);
   deform(g,v=>{
    const nx=v.x/rx,ny=v.y/ry,nz=v.z/rz;let x=v.x,y=v.y,z=v.z;
    if(ny>0){const f=1-0.55*ny*ny;x*=f;z*=f;y*=1+0.08*ny;}
    if(ny<0){y+=0.16*ry*Math.max(0,1-(nx*nx+nz*nz)*1.15);x*=1+0.12*(-ny);z*=1+0.08*(-ny);}
    if(nx*-side>0)x*=0.5; // flat medial face
    if(side>0&&nx<0&&nz>-0.1&&ny<0.15){const k=smooth(clamp((0.15-ny)/0.4))*smooth(clamp((nz+0.1)/0.5));x*=1-0.55*k;}
    // fissures
    const d1=ny+0.9*nz-0.05;let gr=Math.max(0,1-Math.abs(d1)/0.12)**2;
    if(side<0&&d1>0.06){gr=Math.max(gr,Math.max(0,1-Math.abs(ny-0.08)/0.08)**2*smooth(clamp((d1-0.06)/0.2)));}
    const s=1-0.11*gr;v.set(x*s,y*s,z*s);
   });
   const m=ctx.mesh(roughen(g,0.004,18,side>0?3:5),{tone:0.9});
   const grp=new THREE.Group();grp.position.set(side*0.27,0,0);grp.add(m);root.add(grp);return grp;
  };
  const L=lung(1),R=lung(-1);
  // trachea + rings + bronchi
  root.add(ctx.mesh(at(G.cyl(0.055,0.055,0.42,24),[0,0.6,0]),{tone:0.62}));
  const rings:THREE.BufferGeometry[]=[];for(let i=0;i<9;i++)rings.push(at(G.torus(0.058,0.011,8,32),[0,0.42+i*0.042,0],[90,0,0],[1,1,0.8]));
  root.add(ctx.mesh(G.merge(rings),{tone:1}));
  const br=(s:number)=>G.merge([vtube([[0,0.4,0],[s*0.08,0.3,0.0],[s*0.17,0.2,0.0]],[0.05,0.045,0.04],24,14),
   vtube([[s*0.17,0.2,0.0],[s*0.22,0.28,0.03],[s*0.26,0.33,0.04]],[0.03,0.025,0.02],12,10),
   vtube([[s*0.17,0.2,0.0],[s*0.22,0.1,0.05],[s*0.27,0.02,0.06]],[0.032,0.026,0.02],12,10),
   vtube([[s*0.17,0.2,0.0],[s*0.2,0.08,-0.04],[s*0.22,-0.08,-0.05]],[0.03,0.024,0.018],12,10)]);
  root.add(ctx.mesh(G.merge([br(1),br(-1)]),{tone:0.75}));
  const brRings:THREE.BufferGeometry[]=[];for(const s of [1,-1])for(let i=1;i<4;i++){const k=i/4;brRings.push(at(G.torus(lerp(0.05,0.042,k),0.008,6,24),[s*lerp(0,0.17,k),lerp(0.4,0.2,k),0],[90,s*0,s*-50],[1,1,0.85]));}
  root.add(ctx.mesh(G.merge(brRings),{tone:1}));
  return {root,grounded:false,update(c,t){
   const a=clamp((c.inflate??0)+clamp(c.breathe??0.5,0,1)*(0.5-0.5*Math.cos(t*1.7)),0,1.3);
   for(const g of [L,R]){g.scale.set(1+0.08*a,1+0.05*a,1+0.07*a);}
   L.position.x=0.27+0.02*a;R.position.x=-0.27-0.02*a;
  }};
 },
});

// ---------------------------------------------------------------- hand
type Finger={joints:THREE.Group[];kind:'thumb'|'index'|'other'};
function buildHand(ctx:ModelCtx){
 const root=new THREE.Group();const skin={tone:0.95},nail={tone:0.66};
 const palm=G.sphere(1,48,36);
 deform(palm,v=>{const n=v.clone();const se=(a:number,e:number)=>Math.sign(a)*Math.pow(Math.abs(a),e);v.set(se(n.x,0.5)*0.043,se(n.y,0.45)*0.05,se(n.z,0.85)*0.015);v.z+=0.004*(1-v.y/0.05)*0.5;});
 deform(palm,v=>{v.z*=1+0.35*smooth(clamp((v.x+0.01)/0.05))*smooth(clamp((-v.y)/0.05));v.x*=1-0.08*smooth(clamp((-v.y-0.01)/0.05));});
 root.add(ctx.mesh(palm,skin));
 root.add(ctx.mesh(at(G.ellipsoid(0.026,0.034,0.014,24,16),[0.024,-0.022,0.011],[0,0,-20]),skin)); // thenar
 root.add(ctx.mesh(at(G.ellipsoid(0.02,0.04,0.011,24,16),[-0.028,-0.012,0.01]),skin)); // hypothenar
 root.add(ctx.mesh(at(G.ellipsoid(0.042,0.012,0.012,24,12),[0,0.042,0.008]),skin)); // finger pads ridge
 // palm creases
 root.add(ctx.mesh(G.merge([G.tube([[-0.044,0.026,0.0165],[-0.01,0.022,0.018],[0.02,0.03,0.0165]],0.0016,16,5),G.tube([[-0.04,0.012,0.0175],[-0.005,0.008,0.019],[0.03,0.0,0.017]],0.0016,16,5),G.tube([[0.028,0.03,0.016],[0.012,0.0,0.02],[0.006,-0.04,0.019]],0.0016,16,5)]),{tone:0.5}));
 // wrist
 const wr=G.cyl(0.03,0.027,0.07,32,true);wr.scale(1,1,0.62);root.add(ctx.mesh(at(wr,[0,-0.075,-0.002]),{...skin,side:THREE.DoubleSide}));
 const fingers:Finger[]=[];
 const make=(base:V3,lens:number[],r0:number,rotZ:number,kind:Finger['kind'],baseRot:V3=[0,0,0])=>{
  const j0=new THREE.Group();j0.position.set(...base);j0.rotation.set(deg(baseRot[0]),deg(baseRot[1]),deg(rotZ));root.add(j0);
  const joints=[j0];let parent:THREE.Group=j0,r=r0;
  lens.forEach((len,i)=>{
   parent.add(ctx.mesh(at(G.capsule(r,len,8,16),[0,len/2,0],[0,0,0],[1,1,0.9]),skin));
   if(i===lens.length-1)parent.add(ctx.mesh(at(G.ellipsoid(r*0.78,len*0.42,r*0.3,16,10),[0,len*0.58,-r*0.78]),nail));
   if(i<lens.length-1){const j=new THREE.Group();j.position.y=len;parent.add(j);joints.push(j);parent=j;r*=0.9;}
  });
  fingers.push({joints,kind});
 };
 make([0.031,0.047,0],[0.042,0.025,0.021],0.0095,-4,'index');
 make([0.01,0.05,0],[0.047,0.029,0.022],0.0098,0,'other');
 make([-0.012,0.048,0],[0.044,0.027,0.021],0.0093,4,'other');
 make([-0.033,0.04,0],[0.034,0.021,0.019],0.0082,9,'other');
 make([0.03,-0.04,0.008],[0.044,0.033,0.028],0.0128,-34,'thumb',[0,-40,0]);
 const update=(fist:number,point:number,spread:number)=>{
  for(const f of fingers){
   if(f.kind==='thumb'){const k=Math.max(fist,point);f.joints[0]!.rotation.set(deg(25*k),deg(-40+50*k),deg(-34+26*k-8*spread));f.joints[1]!.rotation.x=deg(30*k);f.joints[2]!.rotation.x=deg(50*k);continue;}
   const k=f.kind==='index'?fist*(1-point):Math.max(fist,point);
   f.joints[0]!.rotation.x=deg(88*k);f.joints[1]!.rotation.x=deg(100*k);f.joints[2]!.rotation.x=deg(70*k);
   const base=f.joints[0]!.position.x;f.joints[0]!.rotation.z=deg(-base*120*(1-k)*(0.5+spread));
  }
 };
 return {root,update};
}
export const hand=defineModel({
 id:'hand',aliases:['human-hand','palm','fist','fingers','hand-open','high-five','pointing-hand'],
 describe:'Simplified articulated anatomy DIAGRAM; not suitable for realistic closeups or hero hand contact. Use reference-image asset reference-hand-palm for exact static anatomy, or reference-video for filmed gripping. A human right hand, palm facing the viewer, five jointed fingers with knuckles and nails, thumb out, wrist. `fist` curls it into a fist, `point` curls all but the index finger (pointing up), `spread` fans the fingers.',
 controls:{fist:'0 open .. 1 closed fist',point:'0..1 index finger pointing',spread:'0 together .. 1 fingers spread'},defaults:{fist:0,point:0,spread:0.4},size:'0.2 m',
 build(ctx){
  const h=buildHand(ctx);
  return {root:h.root,grounded:false,update(c,t){h.update(clamp(c.fist??0),clamp(c.point??0),clamp(c.spread??0.4));}};
 },
});

// ---------------------------------------------------------------- muscle arm
export const muscleArm=defineModel({
 id:'muscle-arm',aliases:['bicep','biceps','flexed-arm','strong-arm','strength','muscle','arm'],
 describe:'A flexed human arm seen from the side: upper arm with a bulging bicep, forearm raised, clenched fist on top, shoulder. `flex` raises the forearm and pumps the bicep.',
 controls:{flex:'0 relaxed (forearm forward) .. 1 full flex (default)'},defaults:{flex:1},size:'0.7 m',
 build(ctx){
  const root=new THREE.Group();const skin={tone:0.95};
  root.add(ctx.mesh(at(G.ellipsoid(0.07,0.12,0.09,32,24),[-0.05,-0.03,-0.02],[0,0,-20]),{tone:0.78})); // shoulder/chest edge
  root.add(ctx.mesh(at(G.ellipsoid(0.085,0.075,0.08,32,24),[0.02,0.005,0]),skin)); // deltoid
  const up=G.limb(0.058,0.046,0.31,24);up.rotateZ(Math.PI/2);root.add(ctx.mesh(up,skin));
  const bicep=ctx.mesh(G.ellipsoid(0.1,0.05,0.056,40,28),{tone:1});bicep.position.set(0.16,0.035,0.005);root.add(bicep);
  root.add(ctx.mesh(at(G.ellipsoid(0.11,0.04,0.046,32,20),[0.13,-0.03,-0.004]),{tone:0.88})); // triceps
  // vein over bicep
  root.add(ctx.mesh(G.tube([[0.07,0.05,0.05],[0.15,0.075,0.055],[0.24,0.05,0.05]],0.004,20,6),{tone:0.7}));
  const elbow=new THREE.Group();elbow.position.set(0.3,0,0);root.add(elbow);
  elbow.add(ctx.mesh(G.sphere(0.05,20,16),skin));
  const fore=G.limb(0.05,0.033,0.27,24);fore.rotateZ(Math.PI);elbow.add(ctx.mesh(fore,skin));
  elbow.add(ctx.mesh(at(G.ellipsoid(0.042,0.09,0.045,24,16),[0.005,0.08,0.005]),skin)); // brachioradialis
  const h=buildHand(ctx);h.update(1,0,0);const fist=h.root;fist.scale.setScalar(1.25);fist.position.set(0,0.3,0);fist.rotation.set(0,deg(-20),0);elbow.add(fist);
  return {root,grounded:false,update(c,t){
   const f=clamp(c.flex??1);const pulse=0.03*Math.sin(t*3)*f;
   elbow.rotation.z=deg(lerp(-60,20,f));
   bicep.scale.set(1,lerp(0.75,1.45,f)+pulse,lerp(0.9,1.15,f));bicep.position.y=lerp(0.03,0.05,f);
  }};
 },
});

// ---------------------------------------------------------------- skull
export const skull=defineModel({
 id:'skull',aliases:['human-skull','cranium','death','skeleton-head','bones'],
 describe:'A human skull: smooth rounded cranium, deep hollow eye sockets under a brow ridge, nasal opening, cheekbones and arches, upper and lower rows of teeth and a hinged jaw. `jaw` opens the mouth.',
 controls:{jaw:'0 closed .. 1 open (talking/chattering)'},size:'0.22 m',
 build(ctx){
  const root=new THREE.Group();const bone={tone:0.95,rough:0.7},dark={tone:0.03};
  const C:V3=[0,0.125,0];
  const g=G.sphere(1,128,96);
  deform(g,v=>{const n=v.clone();const p=new THREE.Vector3(n.x*0.071,n.y*0.092,n.z*0.096);
   const fy=smooth((-n.y+0.15)/0.75),fz=smooth((n.z-0.05)/0.6);
   p.y-=0.034*fy*fz;p.z+=0.006*fy*fz;p.x*=1-0.32*fy*fz;
   if(n.y<-0.3&&n.z<0.2)p.y=Math.max(p.y,-0.074+0.01*n.z);
   if(n.z>0.2)p.y=Math.max(p.y,-0.068-0.004*(1-Math.abs(n.x)));
   p.x*=1-0.07*smooth(1-Math.abs(n.y)*1.6)*smooth(n.z+0.2); // temples
   if(p.z>0.02){
    for(const sx of [1,-1]){const d=Math.hypot((p.x-sx*0.029)/0.021,(p.y+0.012)/0.019);p.z-=0.03*Math.max(0,1-d*d)**0.7;
     p.z+=0.006*bump(p.y,0.011,0.006)*smooth(1-Math.abs(p.x-sx*0.028)/0.03); // brow ridge
     p.z+=0.006*bump(Math.hypot(p.x-sx*0.047,p.y+0.04),0,0.012);p.x+=sx*0.005*bump(Math.hypot(p.x-sx*0.047,p.y+0.04),0,0.012);}
    const dn=Math.hypot(p.x/(0.011*(1+(-0.048-p.y)/0.04)),(p.y+0.05)/0.017);p.z-=0.02*Math.max(0,1-dn*dn);
   }
   v.copy(p);});
  root.add(ctx.mesh(at(g,C),bone));
  for(const sx of [1,-1])root.add(ctx.mesh(at(G.ellipsoid(0.019,0.017,0.012,24,16),[sx*0.029,C[1]-0.013,0.058]),dark));
  root.add(ctx.mesh(at(G.ellipsoid(0.01,0.015,0.008,16,12),[0,C[1]-0.051,0.072]),dark));
  // zygomatic arches + cranial suture line
  for(const s of [1,-1])root.add(ctx.mesh(G.tube([[s*0.05,C[1]-0.04,0.06],[s*0.064,C[1]-0.042,0.03],[s*0.068,C[1]-0.04,-0.005]],0.0055,14,8),bone));
  const teeth=(y:number,h:number,rad:number,z0:number)=>{const gs:THREE.BufferGeometry[]=[];for(let i=0;i<12;i++){const a=(i-5.5)/5.5*1.25;const w=Math.abs(i-5.5)<2.5?0.0068:0.008;gs.push(at(G.rbox(w,h,0.0075,0.0022,2),[Math.sin(a)*rad,y,z0+Math.cos(a)*rad],[0,a*57.3,0]));}return G.merge(gs);};
  root.add(ctx.mesh(teeth(0.051,0.013,0.03,0.046),{tone:1}));
  // mandible (hinged at the condyles)
  const piv:V3=[0,0.09,-0.004];const jaw=new THREE.Group();jaw.position.set(...piv);root.add(jaw);
  const P=(x:number,y:number,z:number):V3=>[x-piv[0],y-piv[1],z-piv[2]];
  const hs=G.torus(0.04,0.0055,14,64,deg(230));hs.rotateX(-Math.PI/2);hs.rotateY(deg(-205));hs.scale(1.08,3.2,1.25);
  jaw.add(ctx.mesh(at(hs,P(0,0.02,0.032)),bone));
  for(const s of [1,-1]){jaw.add(ctx.mesh(at(G.rbox(0.009,0.07,0.026,0.004,2),P(s*0.044,0.058,0.004),[-14,0,s*-4]),bone));jaw.add(ctx.mesh(at(G.ellipsoid(0.008,0.006,0.01,12,8),P(s*0.045,0.09,-0.004)),bone));}
  jaw.add(ctx.mesh(at(G.ellipsoid(0.02,0.012,0.01,20,12),P(0,0.008,0.08)),bone)); // chin
  jaw.add(ctx.mesh(at(teeth(0.0,0.012,0.028,0.044),P(0,0.038,0)),{tone:1}));
  return {root,grounded:false,update(c,t){const k=clamp(c.jaw??0);jaw.rotation.x=deg(24)*k*(0.75+0.25*Math.sin(t*7)*Math.sin(t*7));}};
 },
});

// ---------------------------------------------------------------- neuron
export const neuron=defineModel({
 id:'neuron',aliases:['nerve-cell','brain-cell','neurons','nerve','synapse','axon'],
 describe:'A nerve cell: star-shaped cell body with nucleus and branching dendrites, one long axon wrapped in bead-like myelin sheaths ending in branching terminals with bulbs. `fire` sends glowing electrical pulses down the axon (myelin segments light up as they pass); `signal` places a single pulse at a position 0..1.',
 controls:{fire:'0 quiet .. 1 pulses travel down the axon',signal:'0..1 position of one pulse along the axon (0 = off)'},size:'2.6 m display',
 build(ctx){
  const root=new THREE.Group(),r=rng(ctx.seed+5);
  // soma
  const soma=G.sphere(0.2,64,48);
  const arms=fib(7).map(d=>d.applyAxisAngle(new THREE.Vector3(0,0,1),0.3));
  deform(soma,v=>{const n=v.clone().normalize();let s=1;for(const a of arms){s+=0.55*Math.max(0,n.dot(a)-0.75)/0.25;}const ax=Math.max(0,n.x-0.7)/0.3;s+=0.6*ax;v.multiplyScalar(s);});
  root.add(ctx.mesh(roughen(soma,0.008,20,2),{tone:0.9}));
  root.add(ctx.mesh(at(G.sphere(0.09,32,24),[-0.02,0.02,0.13]),{tone:0.55}));
  root.add(ctx.mesh(at(G.sphere(0.035,16,12),[-0.01,0.04,0.21]),{tone:1}));
  // dendrites
  const den:THREE.BufferGeometry[]=[];
  const branch=(p:THREE.Vector3,d:THREE.Vector3,len:number,rad:number,depth:number)=>{
   const pts:V3[]=[[p.x,p.y,p.z]];const q=p.clone(),dir=d.clone();
   for(let i=0;i<4;i++){dir.add(new THREE.Vector3(r()-0.5,r()-0.5,(r()-0.5)*0.6).multiplyScalar(0.5)).normalize();q.addScaledVector(dir,len/4);pts.push([q.x,q.y,q.z]);}
   den.push(vtube(pts,[rad,rad*0.6],20,8));
   if(depth>0){const n=depth>1?2:2+(r()>0.5?1:0);for(let k=0;k<n;k++){const nd=dir.clone().add(new THREE.Vector3(r()-0.5,r()-0.5,(r()-0.5)*0.5).multiplyScalar(1.3)).normalize();branch(q.clone(),nd,len*0.68,rad*0.6,depth-1);}}
  };
  for(const a of arms){if(a.x>0.6)continue;branch(a.clone().multiplyScalar(0.27),a,0.4,0.06,2);}
  root.add(ctx.mesh(G.merge(den),{tone:0.85}));
  // axon
  const L=1.8;const apts:V3[]=[];for(let i=0;i<=8;i++){const k=i/8;apts.push([0.22+k*L,0.07*Math.sin(k*5),0.05*Math.sin(k*3.3+1)]);}
  const curve=new THREE.CatmullRomCurve3(apts.map(p=>new THREE.Vector3(...p)));
  root.add(ctx.mesh(new THREE.TubeGeometry(curve,120,0.034,12,false),{tone:0.6}));
  root.add(ctx.mesh(vtube([[0.12,0,0],[0.3,0.005,0]],[0.08,0.026],12,16),{tone:0.9})); // hillock
  const myelin:{m:THREE.Mesh;u:number}[]=[];const nSeg=8;
  for(let i=0;i<nSeg;i++){const u=0.09+i*(0.84/nSeg)+0.84/nSeg/2;const len=0.84/nSeg*L*0.82;
   const g=G.capsule(0.075,len-0.13,8,24);const p=curve.getPointAt(u),tn=curve.getTangentAt(u);
   const m=ctx.mesh(g,{tone:0.95,glow:0.0001,glowControl:'_pulse'});m.position.copy(p);m.quaternion.setFromUnitVectors(UP,tn);root.add(m);myelin.push({m,u});}
  // terminals
  const tEnd=curve.getPointAt(1);const term:THREE.BufferGeometry[]=[];const bulbs:THREE.BufferGeometry[]=[];
  for(let i=0;i<5;i++){const a=(i-2)*0.55;const d=new THREE.Vector3(Math.cos(a),Math.sin(a),(r()-0.5)*0.6).normalize();
   const mid=tEnd.clone().addScaledVector(d,0.15).add(new THREE.Vector3(0,(r()-0.5)*0.06,0)),e=tEnd.clone().addScaledVector(d,0.3);
   term.push(vtube([[tEnd.x,tEnd.y,tEnd.z],[mid.x,mid.y,mid.z],[e.x,e.y,e.z]],[0.03,0.02],16,8,false));bulbs.push(at(G.sphere(0.06,16,12),[e.x,e.y,e.z],[0,0,0],[1.1,0.9,0.9]));}
  root.add(ctx.mesh(G.merge(term),{tone:0.7}));
  const bulbM=ctx.mesh(G.merge(bulbs),{tone:1,glow:0.0001,glowControl:'_pulse'});root.add(bulbM);
  const pulse=ctx.mesh(G.sphere(0.075,20,14),{tone:1,glow:3,glowControl:'_pulse'});root.add(pulse);
  const trail=ctx.mesh(G.sphere(0.05,16,12),{tone:1,glow:1.5,glowControl:'_pulse'});root.add(trail);
  const tmp=new THREE.Vector3();
  return {root,grounded:false,update(c,t){
   const f=clamp(c.fire??0),s=clamp(c.signal??0);
   let u=-1,amp=0;
   if(s>0.001&&s<0.999){u=s;amp=1;}else if(f>0.001){u=fract(t/1.3);amp=f;}
   pulse.visible=trail.visible=u>=0;
   if(u>=0){curve.getPointAt(u,tmp);pulse.position.copy(tmp);curve.getPointAt(Math.max(0,u-0.035),tmp);trail.position.copy(tmp);
    (pulse.material as THREE.MeshStandardMaterial).userData.glow=3*amp;(trail.material as THREE.MeshStandardMaterial).userData.glow=1.5*amp;}
   for(const my of myelin)(my.m.material as THREE.MeshStandardMaterial).userData.glow=u>=0?1.6*amp*bump(u,my.u,0.06):0.0001;
   (bulbM.material as THREE.MeshStandardMaterial).userData.glow=u>=0?2*amp*smooth(clamp((u-0.93)/0.07)):0.0001;
  }};
 },
});

// ---------------------------------------------------------------- DNA
export const dna=defineModel({
 id:'dna',aliases:['double-helix','helix','gene','genes','genetics','genome','chromosome-strand','dna-strand'],
 describe:'A DNA double helix: two beaded sugar-phosphate backbones twisting around each other, joined by base-pair rungs of two alternating tones; rotates slowly. `unzip` pulls the strands apart from the top down; `spin` speed.',
 params:{pairs:'12..40 base pairs (default 24)'},
 controls:{unzip:'0 zipped .. 1 strands separated',spin:'rotation speed (default 1, 0 stops)'},defaults:{unzip:0,spin:1},size:'2.4 m tall display',
 build(ctx){
  const N=Math.round(ctx.num('pairs',24,12,40)),H=2.4,R=0.36,root=new THREE.Group(),spin=new THREE.Group();root.add(spin);
  const tw=Math.PI*2/10,off=Math.PI*0.78;
  const strandMat=[ctx.mat({tone:0.95,rough:0.4}),ctx.mat({tone:0.95,rough:0.4})];
  const strands=[new THREE.Mesh(new THREE.BufferGeometry(),strandMat[0]),new THREE.Mesh(new THREE.BufferGeometry(),strandMat[1])];spin.add(...strands);
  const beads:THREE.Mesh[][]=[[],[]];const halves:THREE.Mesh[][]=[[],[]];
  const baseTones=[[1,0.5],[0.5,1],[0.75,0.62],[0.62,0.75]];const r=rng(ctx.seed+2);
  const cylG=at(G.cyl(0.036,0.036,1,10),[0,0.5,0]);
  for(let i=0;i<N;i++){const bt=baseTones[Math.floor(r()*4)]!;
   for(const s of [0,1]){const b=ctx.mesh(G.sphere(0.06,14,10),{tone:1});spin.add(b);beads[s]!.push(b);const h=ctx.mesh(cylG,{tone:bt[s]!});spin.add(h);halves[s]!.push(h);}}
  const pos=(s:number,i:number,u:number,out:THREE.Vector3)=>{const a=i*tw+(s?off:0);const y=-H/2+(i+0.5)*H/N;const push=u*0.55*(s?1:-1);
   // separated strands straighten slightly and move apart along local x
   const rr=R*(1-0.25*u);out.set(Math.cos(a)*rr+push,y,Math.sin(a)*rr);return out;};
  let lastU=-1;const P=[new THREE.Vector3(),new THREE.Vector3()],tmp=new THREE.Vector3(),tmp2=new THREE.Vector3();
  const rebuild=(un:number)=>{
   const us=(i:number)=>smooth(clamp((un*1.25-(1-(i+0.5)/N))/0.25));
   for(const s of [0,1]){const pts:THREE.Vector3[]=[];const sub=4;
    for(let i=0;i<N;i++){pos(s,i,us(i),beads[s]![i]!.position);}
    for(let k=0;k<=(N-1)*sub;k++){const i=k/sub;const i0=Math.floor(i),f=i-i0;const a=i*tw+(s?off:0),y=-H/2+(i+0.5)*H/N;const u=lerp(us(i0),us(Math.min(N-1,i0+1)),f);const rr=R*(1-0.25*u);pts.push(new THREE.Vector3(Math.cos(a)*rr+u*0.55*(s?1:-1),y,Math.sin(a)*rr));}
    const g=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),(N-1)*sub*2,0.03,8,false);strands[s]!.geometry.dispose();strands[s]!.geometry=g;}
   for(let i=0;i<N;i++){P[0]!.copy(beads[0]![i]!.position);P[1]!.copy(beads[1]![i]!.position);
    for(const s of [0,1]){const a=P[s]!,b=P[1-s]!;const full=R*2*Math.sin(off/2);tmp.subVectors(b,a).normalize().multiplyScalar(full*0.5-0.01).add(a);span(halves[s]![i]!,a,tmp,tmp2);}}
  };
  rebuild(0);
  return {root,grounded:false,update(c,t){const u=clamp(c.unzip??0);if(Math.abs(u-lastU)>1e-4){rebuild(u);lastU=u;}spin.rotation.y=t*0.6*(c.spin??1);}};
 },
});

// ---------------------------------------------------------------- cell
export const cell=defineModel({
 id:'cell',aliases:['animal-cell','human-cell','cells','cell-cutaway','cytoplasm','organelles','mitochondria','mitochondrion'],
 describe:'An animal cell cut open (a wedge removed): bumpy membrane, cut faces showing cytoplasm with mitochondria, folded ER, Golgi stack, vesicles and a large cut-open nucleus with bright nucleolus. `pulse` gently breathes the organelles.',
 controls:{pulse:'0..1 organelle motion (default 0.5)'},defaults:{pulse:0.5},size:'1.2 m display',
 build(ctx){
  const root=new THREE.Group(),R=0.6,r=rng(ctx.seed+9);
  // membrane: sphere missing the front-right quadrant (x>0,z>0)
  const mem=new THREE.SphereGeometry(R,96,64,Math.PI,Math.PI*1.5);roughen(mem,0.008,14,3);
  root.add(ctx.mesh(mem,{tone:0.85,side:THREE.DoubleSide}));
  const faceA=new THREE.CircleGeometry(R*0.985,64,Math.PI/2,Math.PI);faceA.rotateY(Math.PI/2); // plane x=0, z>0, facing +x
  const faceB=new THREE.CircleGeometry(R*0.985,64,-Math.PI/2,Math.PI); // plane z=0, x>0, facing +z
  root.add(ctx.mesh(G.merge([faceA,faceB]),{tone:0.33}));
  // membrane rim on the cut
  const rimA=G.torus(R*0.99,0.016,8,64,Math.PI);rimA.rotateZ(Math.PI/2);rimA.rotateY(Math.PI/2);
  const rimB=G.torus(R*0.99,0.016,8,64,Math.PI);rimB.rotateZ(-Math.PI/2);
  root.add(ctx.mesh(G.merge([rimA,rimB]),{tone:1}));
  // place on face helpers: face A uses (z,y) coords at x=0, face B (x,y) at z=0
  const onA=(u:number,v:number):V3=>[0,v,u],onB=(u:number,v:number):V3=>[u,v,0];
  // nucleus (cut too)
  const RN=0.22;
  const nuc=new THREE.SphereGeometry(RN,64,48,Math.PI,Math.PI*1.5);deform(nuc,v=>{v.multiplyScalar(1+0.02*Math.sin(v.x*40)*Math.sin(v.y*37));});
  root.add(ctx.mesh(at(nuc,[0,0.02,0]),{tone:0.72}));
  const nfA=new THREE.CircleGeometry(RN,48,Math.PI/2,Math.PI);nfA.rotateY(Math.PI/2);const nfB=new THREE.CircleGeometry(RN,48,-Math.PI/2,Math.PI);
  root.add(ctx.mesh(at(G.merge([at(nfA,[0.002,0,0]),at(nfB,[0,0,0.002])]),[0,0.02,0]),{tone:0.6}));
  const nl=new THREE.SphereGeometry(0.075,32,24,Math.PI,Math.PI*1.5);root.add(ctx.mesh(at(nl,[0,0.04,0]),{tone:1}));
  const nlA=new THREE.CircleGeometry(0.075,32,Math.PI/2,Math.PI);nlA.rotateY(Math.PI/2);const nlB=new THREE.CircleGeometry(0.075,32,-Math.PI/2,Math.PI);
  root.add(ctx.mesh(at(G.merge([at(nlA,[0.004,0,0]),at(nlB,[0,0,0.004])]),[0,0.04,0]),{tone:1}));
  // nuclear envelope rim
  const nrA=G.torus(RN,0.01,8,48,Math.PI);nrA.rotateZ(Math.PI/2);nrA.rotateY(Math.PI/2);const nrB=G.torus(RN,0.01,8,48,Math.PI);nrB.rotateZ(-Math.PI/2);
  root.add(ctx.mesh(at(G.merge([nrA,nrB]),[0,0.02,0]),{tone:0.95}));
  // rough ER: wavy concentric ribbons around the nucleus on both faces
  const er:THREE.BufferGeometry[]=[];
  for(const [face,sgn] of [[onA,1],[onB,1]] as const){for(let k=0;k<3;k++){const rad=0.27+k*0.04;const pts:V3[]=[];for(let i=0;i<=24;i++){const a=lerp(-1.3,1.1,i/24);const rr=rad+0.012*Math.sin(i*1.9+k);pts.push(face(sgn*Math.cos(a)*rr+0.0,Math.sin(a)*rr+0.02));}
   er.push(G.tube(pts,0.009,60,6));}}
  root.add(ctx.mesh(G.merge(er),{tone:0.8}));
  // ribosome dots on ER and cytoplasm
  const dots:THREE.BufferGeometry[]=[];for(let i=0;i<70;i++){const fa=r()<0.5;const a=r()*Math.PI-Math.PI/2,rr=0.25+r()*0.32;const u=Math.cos(a)*rr,v=Math.sin(a)*rr;dots.push(at(G.sphere(0.008,6,5),fa?onA(Math.abs(u),v):onB(Math.abs(u),v)));}
  root.add(ctx.mesh(G.merge(dots),{tone:1}));
  // mitochondria with cristae
  const mitos:THREE.Group[]=[];
  const mito=(face:'A'|'B',u:number,v:number,rot:number,len:number)=>{const g=new THREE.Group();
   g.add(ctx.mesh(at(G.capsule(0.04,len,8,20),[0,0,0],[0,0,90]),{tone:0.9}));
   const cr:V3[]=[];for(let i=0;i<=14;i++){const x=lerp(-len/2-0.02,len/2+0.02,i/14);cr.push([x,(i%2?1:-1)*0.024,0.034]);}
   g.add(ctx.mesh(G.tube(cr,0.006,60,6),{tone:0.45}));
   g.rotation.z=deg(rot);const p=face==='A'?onA(u,v):onB(u,v);g.position.set(...p);if(face==='A')g.rotation.y=Math.PI/2;
   root.add(g);mitos.push(g);};
  mito('A',0.42,0.2,30,0.12);mito('A',0.36,-0.32,-20,0.1);mito('B',0.43,-0.18,60,0.12);mito('B',0.32,0.36,-15,0.1);mito('A',0.5,-0.08,80,0.06);
  // golgi stack on face B
  const golgi:THREE.BufferGeometry[]=[];for(let k=0;k<5;k++){const t=G.torus(0.09-k*0.012,0.009,6,32,Math.PI*0.75);golgi.push(at(t,[0.38+k*0.022,0.03,0],[0,0,90+45]));}
  root.add(ctx.mesh(G.merge(golgi),{tone:1}));
  // vesicles / lysosomes
  const ves:THREE.BufferGeometry[]=[];for(const [f,u,v,s] of [['B',0.5,0.15,0.03],['B',0.2,-0.42,0.035],['A',0.18,0.45,0.03],['A',0.24,-0.45,0.028],['B',0.52,-0.3,0.025],['A',0.53,0.12,0.022]] as const)ves.push(at(G.sphere(s,16,12),f==='A'?onA(u,v):onB(u,v)));
  root.add(ctx.mesh(G.merge(ves),{tone:0.75}));
  root.rotation.y=deg(-8);
  return {root,grounded:false,update(c,t){const p=clamp(c.pulse??0.5);mitos.forEach((m,i)=>{m.scale.setScalar(1+0.06*p*Math.sin(t*2+i*1.7));});}};
 },
});

// ---------------------------------------------------------------- bacterium
export const bacterium=defineModel({
 id:'bacterium',aliases:['bacteria','germ','germs','microbe','e-coli','bacillus','pathogen'],
 describe:'A rod-shaped bacterium (capsule body) covered in short hair-like pili, with long corkscrew flagella whipping behind it; wiggles as it swims. `swim` speed.',
 controls:{swim:'flagella speed (default 1)'},defaults:{swim:1},size:'0.9 m display',
 build(ctx){
  const root=new THREE.Group(),body=new THREE.Group();root.add(body);const L=0.5,Rb=0.13,r=rng(ctx.seed+3);
  const g=G.capsule(Rb,L,16,40);g.rotateZ(Math.PI/2);body.add(ctx.mesh(roughen(g,0.004,22,2),{tone:0.92}));
  // faint inner nucleoid ridge band
  body.add(ctx.mesh(at(G.torus(Rb*1.005,0.006,6,48),[0,0,0],[0,90,0]),{tone:0.6}));
  const pili:THREE.BufferGeometry[]=[];
  for(let i=0;i<46;i++){const x=(r()-0.5)*(L+Rb),a=r()*Math.PI*2;const n=new THREE.Vector3(0,Math.cos(a),Math.sin(a));let base=new THREE.Vector3(x,0,0).addScaledVector(n,Rb);
   if(Math.abs(x)>L/2){const d=new THREE.Vector3(x-Math.sign(x)*L/2,n.y*0.6,n.z*0.6).normalize();base=new THREE.Vector3(Math.sign(x)*L/2,0,0).addScaledVector(d,Rb);n.copy(d);}
   const e=base.clone().addScaledVector(n,0.05+r()*0.03);pili.push(G.tube([[base.x,base.y,base.z],[e.x,e.y,e.z]],0.0055,2,5));}
  body.add(ctx.mesh(G.merge(pili),{tone:0.8}));
  const flags:THREE.Group[]=[];
  for(let i=0;i<4;i++){const outer=new THREE.Group(),inner=new THREE.Group();outer.add(inner);
   const a=i*Math.PI/2+0.4;outer.position.set(-L/2-Rb*0.7,Math.cos(a)*Rb*0.5,Math.sin(a)*Rb*0.5);outer.rotation.set(0,deg(Math.sin(a)*14),deg(Math.cos(a)*-14));
   const pts:V3[]=[];for(let k=0;k<=40;k++){const s=k/40;const amp=0.06*smooth(clamp(s*4));pts.push([-s*0.75,amp*Math.sin(s*Math.PI*2*3.5),amp*Math.cos(s*Math.PI*2*3.5)-amp*0]);}
   inner.add(ctx.mesh(G.tube(pts,0.009,160,6),{tone:0.75}));body.add(outer);flags.push(inner);}
  return {root,grounded:false,update(c,t){const s=c.swim??1;flags.forEach((f,i)=>{f.rotation.x=t*9*s+i;});body.rotation.z=0.05*Math.sin(t*3*s);body.rotation.y=0.08*Math.sin(t*2.1*s);body.position.y=0.01*Math.sin(t*4*s);}};
 },
});

// ---------------------------------------------------------------- virus
export const virus=defineModel({
 id:'virus',aliases:['coronavirus','covid','virion','flu-virus','infection','viruses'],
 describe:'A virus particle: round bumpy shell covered in club-shaped spike proteins (corona-like crown), slowly tumbling. `spikes` param sets how many.',
 params:{spikes:'20..90 (default 48)'},controls:{spin:'tumble speed (default 1)'},defaults:{spin:1},size:'1 m display',
 build(ctx){
  const root=new THREE.Group(),Rv=0.4,n=Math.round(ctx.num('spikes',48,20,90));
  const shell=G.sphere(Rv,72,48);roughen(shell,0.012,14,ctx.seed%9);root.add(ctx.mesh(shell,{tone:0.72}));
  const stalks:THREE.BufferGeometry[]=[],heads:THREE.BufferGeometry[]=[],small:THREE.BufferGeometry[]=[];
  const q=new THREE.Quaternion(),e=new THREE.Euler();
  for(const d of fib(n)){q.setFromUnitVectors(UP,d);e.setFromQuaternion(q);const rd:V3=[e.x*57.2958,e.y*57.2958,e.z*57.2958];
   stalks.push(at(G.cyl(0.012,0.02,0.13,8),[d.x*(Rv+0.06),d.y*(Rv+0.06),d.z*(Rv+0.06)],rd));
   heads.push(at(G.ellipsoid(0.045,0.032,0.045,14,10),[d.x*(Rv+0.14),d.y*(Rv+0.14),d.z*(Rv+0.14)],rd));}
  for(const d of fib(110)){small.push(at(G.sphere(0.018,8,6),[d.x*Rv,d.y*Rv,d.z*Rv]));}
  root.add(ctx.mesh(G.merge(stalks),{tone:0.85}),ctx.mesh(G.merge(heads),{tone:1}),ctx.mesh(G.merge(small),{tone:0.5}));
  return {root,grounded:false,update(c,t){const s=c.spin??1;root.rotation.set(0.3*Math.sin(t*0.4*s),t*0.35*s,0.15*Math.sin(t*0.3*s));}};
 },
});

// ---------------------------------------------------------------- tooth
export const tooth=defineModel({
 id:'tooth',aliases:['molar','teeth','dental','dentist','cavity'],
 describe:'A large molar tooth: glossy crown with four rounded cusps and a centre groove, narrowing neck and two long tapering roots. `decay` adds a dark cavity in the crown.',
 controls:{decay:'0 healthy .. 1 dark cavity'},size:'0.45 m display',
 build(ctx){
  const root=new THREE.Group();
  const crown=G.rbox(0.23,0.12,0.2,0.05,4);deform(crown,v=>{if(v.y<0){const k=-v.y/0.075;v.x*=1-0.1*k;v.z*=1-0.1*k;}});
  root.add(ctx.mesh(at(crown,[0,0.33,0]),{tone:1,rough:0.55}));
  for(const [x,z] of [[1,1],[1,-1],[-1,1],[-1,-1]] as const)root.add(ctx.mesh(at(G.sphere(0.064,28,20),[x*0.055,0.39,z*0.048],[0,0,0],[1,0.85,1]),{tone:1,rough:0.55}));
  root.add(ctx.mesh(G.merge([G.tube([[-0.1,0.425,0],[0,0.415,0.005],[0.1,0.425,0]],0.009,16,6),G.tube([[0,0.425,-0.09],[0,0.415,0],[0,0.425,0.09]],0.009,16,6)]),{tone:0.45}));
  root.add(ctx.mesh(at(G.cyl(0.11,0.1,0.06,32),[0,0.24,0],[0,0,0],[1,1,0.85]),{tone:0.82}));
  root.add(ctx.mesh(G.merge([vtube([[-0.06,0.25,0],[-0.075,0.12,0.0],[-0.07,0.0,0.01]],[0.06,0.04,0.014],30,16),vtube([[0.06,0.25,0],[0.08,0.12,0],[0.085,0.0,-0.01]],[0.06,0.04,0.014],30,16)]),{tone:0.75}));
  const cav=ctx.mesh(at(G.ellipsoid(0.04,0.02,0.035,16,10),[0.03,0.42,0.03]),{tone:0.05});root.add(cav);
  return {root,grounded:true,update(c){const d=clamp(c.decay??0);cav.visible=d>0.02;cav.scale.setScalar(0.4+d*0.9);}};
 },
});

// ---------------------------------------------------------------- ear
export const ear=defineModel({
 id:'ear',aliases:['human-ear','hearing','listen','outer-ear','earlobe'],
 describe:'A human outer ear seen from the side: curled helix rim, Y-shaped antihelix ridge, dark concha bowl leading into the ear canal, tragus flap and soft earlobe, on a patch of skin. `listen` gives a soft glow of sound in the canal.',
 controls:{listen:'0..1 glow in the ear canal'},size:'0.3 m display',
 build(ctx){
  const root=new THREE.Group();const S=0.3;const P=(x:number,y:number,z=0):V3=>[x*S,y*S,z*S];
  const outline:[number,number][]=[];const rimPts:V3[]=[];
  const rim:[number,number][]=[[0.16,0.18],[0.1,0.38],[-0.04,0.48],[-0.2,0.42],[-0.3,0.25],[-0.33,0.02],[-0.28,-0.2],[-0.18,-0.33],[-0.1,-0.4]];
  for(const [x,y] of rim){outline.push([x*S,y*S]);}
  outline.push([-0.08*S,-0.55*S],[0.06*S,-0.6*S],[0.13*S,-0.45*S],[0.2*S,-0.25*S],[0.24*S,-0.05*S],[0.22*S,0.08*S]);
  root.add(ctx.mesh(G.extrude(outline,0.06*S,0.02*S),{tone:0.7}));
  rimPts.push(P(0.08,0.02,0.06),P(0.15,0.12,0.06));for(const [x,y] of rim)rimPts.push(P(x,y,0.06));rimPts.push(P(-0.07,-0.45,0.05));
  root.add(ctx.mesh(vtube(rimPts,[0.035*S,0.045*S,0.055*S,0.06*S,0.06*S,0.06*S,0.06*S,0.06*S,0.055*S,0.05*S,0.045*S,0.04*S],120,14),{tone:1}));
  root.add(ctx.mesh(vtube([P(-0.08,-0.27,0.05),P(-0.13,-0.05,0.06),P(-0.12,0.12,0.06),P(-0.08,0.3,0.05)],[0.04*S,0.045*S,0.045*S,0.03*S],50,12),{tone:0.95}));
  root.add(ctx.mesh(vtube([P(-0.13,0.03,0.06),P(-0.02,0.16,0.06),P(0.08,0.2,0.05)],[0.04*S,0.035*S,0.025*S],40,12),{tone:0.92}));
  root.add(ctx.mesh(at(G.ellipsoid(0.13*S,0.15*S,0.03*S,32,20),[0.03*S,-0.1*S,0.025*S],[0,0,15]),{tone:0.12}));
  const canal=ctx.mesh(at(G.ellipsoid(0.05*S,0.06*S,0.02*S,20,12),[0.12*S,-0.1*S,0.045*S]),{tone:0.02,glow:0.0001,glowControl:'_l'});root.add(canal);
  root.add(ctx.mesh(at(G.ellipsoid(0.06*S,0.09*S,0.05*S,20,14),[0.22*S,-0.12*S,0.05*S]),{tone:0.95})); // tragus
  root.add(ctx.mesh(at(G.ellipsoid(0.07*S,0.05*S,0.045*S,20,14),[-0.02*S,-0.32*S,0.05*S]),{tone:0.92})); // antitragus
  root.add(ctx.mesh(at(G.ellipsoid(0.13*S,0.11*S,0.06*S,24,16),[0.03*S,-0.48*S,0.02*S]),{tone:0.95})); // lobe
  return {root,grounded:false,update(c){(canal.material as THREE.MeshStandardMaterial).userData.glow=2.5*clamp(c.listen??0)+0.0001;}};
 },
});

// ---------------------------------------------------------------- stomach
export const stomach=defineModel({
 id:'stomach',aliases:['human-stomach','digestion','gut','belly','digestive-system','hunger'],
 describe:'A J-shaped human stomach: oesophagus entering at the top, rounded fundus dome, wide curved body narrowing to the pylorus and the start of the small intestine, with fold lines; churns gently. `churn` strength.',
 controls:{churn:'0 still .. 1 churning (default 0.4)'},defaults:{churn:0.4},size:'0.7 m display',
 build(ctx){
  const root=new THREE.Group(),bag=new THREE.Group();root.add(bag);
  const path:V3[]=[[0.0,0.5,-0.02],[0.02,0.36,0],[0.1,0.24,0.0],[0.14,0.08,0.0],[0.12,-0.1,0.0],[0.03,-0.22,0.0],[-0.1,-0.22,0.0],[-0.2,-0.13,0.0],[-0.27,-0.04,0.0],[-0.33,-0.02,0.0]];
  const rad=[0.035,0.04,0.16,0.18,0.17,0.14,0.11,0.075,0.04,0.045];
  const g=vtube(path,rad,120,40);bag.add(ctx.mesh(roughen(g,0.004,20,4),{tone:0.9}));
  bag.add(ctx.mesh(at(G.ellipsoid(0.14,0.12,0.13,40,28),[0.13,0.27,-0.01]),{tone:0.9})); // fundus
  bag.add(ctx.mesh(vtube([[-0.33,-0.02,0],[-0.38,-0.03,0.02],[-0.4,-0.12,0.03],[-0.36,-0.24,0.02],[-0.3,-0.3,0]],[0.045,0.047,0.047,0.045,0.04],60,16),{tone:0.72})); // duodenum
  bag.add(ctx.mesh(at(G.torus(0.045,0.012,8,24),[-0.29,-0.035,0],[0,90,10]),{tone:1})); // pyloric sphincter
  bag.add(ctx.mesh(at(G.cyl(0.04,0.04,0.12,20),[-0.005,0.56,-0.02]),{tone:0.7}));
  // surface folds / vessels along the curvatures
  const folds:THREE.BufferGeometry[]=[];
  folds.push(G.tube([[0.25,0.3,0.06],[0.3,0.1,0.06],[0.27,-0.12,0.06],[0.15,-0.32,0.06],[-0.05,-0.36,0.05],[-0.2,-0.22,0.04]],0.007,60,6));
  folds.push(G.tube([[0.06,0.22,0.1],[0.0,0.05,0.11],[-0.04,-0.06,0.08],[-0.15,-0.06,0.06]],0.006,40,6));
  for(let i=0;i<5;i++){const y=0.15-i*0.08;folds.push(G.tube([[0.04,y,0.15],[0.14,y-0.03,0.16],[0.24,y-0.05,0.1]],0.005,20,5));}
  bag.add(ctx.mesh(G.merge(folds),{tone:0.55}));
  return {root,grounded:false,update(c,t){const k=clamp(c.churn??0.4)*0.04;bag.scale.set(1+k*Math.sin(t*2.2),1+k*Math.sin(t*2.2+1.5),1+k*Math.sin(t*2.2+3));}};
 },
});

// ---------------------------------------------------------------- red blood cells
export const bloodCell=defineModel({
 id:'blood-cell',aliases:['red-blood-cell','red-blood-cells','blood-cells','blood','erythrocyte','rbc','bloodstream'],
 describe:'Red blood cells: smooth biconcave discs (doughnut-like dimple in the middle), drifting and tumbling. `count` cells (1 = a single big cell); `flow` moves them along +x like a bloodstream.',
 params:{count:'1..30 cells (default 7)',color:'optional real colour, e.g. "red"'},controls:{flow:'0 drifting .. 1 streaming along'},size:'0.3 m per cell display',
 build(ctx){
  const n=Math.round(ctx.num('count',7,1,30)),root=new THREE.Group(),r=rng(ctx.seed+4);
  const prof:[number,number][]=[];for(let i=0;i<=40;i++){const a=Math.PI*i/40;const x=Math.sin(a),yy=Math.cos(a);const rr=0.15*(0.02+0.98*Math.pow(x,0.9));const th=0.05*(0.32+1.05*x*x-0.6*x*x*x*x)*1.0;prof.push([rr,0]);void yy;void th;}
  // build from a parametric biconcave profile (Evans-Fung)
  const pts:[number,number][]=[];const R0=0.15;
  for(let i=0;i<=48;i++){const a=-Math.PI/2+Math.PI*i/48;const rho=Math.cos(a);const sgn=Math.sign(Math.sin(a))||1;const h=R0*0.5*Math.sqrt(Math.max(0,1-rho*rho))*(0.21+2.0*rho*rho-1.12*rho*rho*rho*rho);pts.push([R0*rho,sgn*h]);}
  const disc=G.lathe(pts.map(([x,y])=>[x,y] as [number,number]),64);
  void prof;
  const col=typeof ctx.params.color==='string'?ctx.params.color:undefined;
  const cells:{m:THREE.Mesh;base:THREE.Vector3;rot:THREE.Vector3;sp:number}[]=[];
  for(let i=0;i<n;i++){const m=ctx.mesh(disc,{tone:0.95,color:col,rough:0.45});const base=n===1?new THREE.Vector3():new THREE.Vector3((r()-0.5)*1.2,(r()-0.5)*0.8,(r()-0.5)*0.6);
   m.position.copy(base);root.add(m);cells.push({m,base,rot:new THREE.Vector3(r()*6,r()*6,r()*6),sp:0.3+r()*0.5});}
  return {root,grounded:false,update(c,t){const f=clamp(c.flow??0);cells.forEach((cl,i)=>{
   cl.m.rotation.set(n===1?deg(62)+0.1*Math.sin(t*0.5):cl.rot.x+t*cl.sp*0.6,cl.rot.y+t*cl.sp*0.4,cl.rot.z);
   const x=cl.base.x+(n>1?f*(((t*0.35*cl.sp+cl.base.x+0.6)%1.2+1.2)%1.2-0.6-cl.base.x):0);
   cl.m.position.set(x,cl.base.y+0.03*Math.sin(t*0.9+i),cl.base.z);});}};
 },
});

// ---------------------------------------------------------------- molecule
type AtomSpec={e:string;p:V3};
const PRESETS:Record<string,{atoms:AtomSpec[];bonds:[number,number,number?][]}>={
 water:{atoms:[{e:'O',p:[0,0,0]},{e:'H',p:[0.76,0.59,0]},{e:'H',p:[-0.76,0.59,0]}],bonds:[[0,1],[0,2]]},
 co2:{atoms:[{e:'C',p:[0,0,0]},{e:'O',p:[1.16,0,0]},{e:'O',p:[-1.16,0,0]}],bonds:[[0,1,2],[0,2,2]]},
 benzene:{atoms:[...Array.from({length:6},(_,i)=>({e:'C',p:[Math.cos(i*Math.PI/3)*1.4,Math.sin(i*Math.PI/3)*1.4,0] as V3}))],bonds:[[0,1,2],[1,2],[2,3,2],[3,4],[4,5,2],[5,0]]},
 melatonin:{atoms:[
  {e:'C',p:[0.866,0.5,0]},{e:'C',p:[0,1,0]},{e:'C',p:[-0.866,0.5,0]},{e:'C',p:[-0.866,-0.5,0]},{e:'C',p:[0,-1,0]},{e:'C',p:[0.866,-0.5,0]},
  {e:'C',p:[1.817,0.809,0]},{e:'C',p:[2.405,0,0]},{e:'N',p:[1.817,-0.809,0]},
  {e:'C',p:[2.25,1.75,0.1]},{e:'C',p:[3.2,2.05,-0.1]},{e:'N',p:[3.55,3.0,0.05]},{e:'C',p:[4.5,3.3,0]},{e:'O',p:[5.2,2.65,0]},{e:'C',p:[4.75,4.3,0.1]},
  {e:'O',p:[-1.73,1.0,0]},{e:'C',p:[-2.6,0.5,0.05]}],
  bonds:[[0,1],[1,2,2],[2,3],[3,4,2],[4,5],[5,0,2],[0,6],[6,7,2],[7,8],[8,5],[6,9],[9,10],[10,11],[11,12],[12,13,2],[12,14],[2,15],[15,16]]},
};
const VALENCE:Record<string,number>={C:4,N:3,O:2,H:1,S:2,P:3};
export const molecule=defineModel({
 id:'molecule',aliases:['melatonin','melatonin-molecule','ball-and-stick','chemical','compound','caffeine-molecule','water-molecule','co2'],
 describe:'A ball-and-stick molecule: atoms as spheres of different sizes/tones (H small bright, C mid, O large bright, N mid) joined by stick bonds (double bonds as two sticks), hydrogens added automatically; tumbles slowly. params.preset melatonin (default) | water | co2 | benzene, or params.atoms [{e:"C",p:[x,y,z]}...] in ångström + params.bonds [[i,j,order]].',
 params:{preset:'melatonin | water | co2 | benzene',atoms:'[{e,p:[x,y,z]}] (Å)',bonds:'[[i,j,order?]]',hydrogens:'true (default) adds missing H'},
 controls:{spin:'tumble speed (default 1)'},defaults:{spin:1},size:'~1.5 m display',
 build(ctx){
  const root=new THREE.Group(),inner=new THREE.Group();root.add(inner);
  let atoms:AtomSpec[]=[];let bonds:[number,number,number?][]=[];
  const pa=ctx.params.atoms,pb=ctx.params.bonds;
  if(Array.isArray(pa)&&pa.length){atoms=pa.slice(0,80).map((a:unknown)=>{const o=(a&&typeof a==='object'?a:{}) as Record<string,unknown>;const p=Array.isArray(o.p)?o.p:Array.isArray(o.pos)?o.pos:[0,0,0];return {e:String(o.e??o.el??'C').slice(0,2),p:[Number(p[0])||0,Number(p[1])||0,Number(p[2])||0] as V3};});
   bonds=(Array.isArray(pb)?pb:[]).slice(0,120).filter((b:unknown)=>Array.isArray(b)).map((b:unknown[])=>[Number(b[0])|0,Number(b[1])|0,Number(b[2])||1] as [number,number,number]).filter(([a,b])=>a>=0&&b>=0&&a<atoms.length&&b<atoms.length&&a!==b);}
  else{const pr=PRESETS[ctx.str('preset','melatonin',['melatonin','water','co2','benzene'] as const)]!;atoms=pr.atoms.map(a=>({e:a.e,p:[...a.p] as V3}));bonds=pr.bonds.map(b=>[...b] as [number,number,number?]);}
  if(ctx.bool('hydrogens',true)&&atoms.length<80){
   const n0=atoms.length;
   for(let i=0;i<n0;i++){const a=atoms[i]!;const val=VALENCE[a.e]??0;let used=0;const nb:THREE.Vector3[]=[];
    for(const [x,y,o] of bonds){if(x===i||y===i){used+=o??1;const j=x===i?y:x;nb.push(new THREE.Vector3(...atoms[j]!.p).sub(new THREE.Vector3(...a.p)).normalize());}}
    const miss=Math.max(0,val-used);if(!miss||atoms.length+miss>90)continue;
    const away=nb.reduce((s,v)=>s.sub(v),new THREE.Vector3());if(away.lengthSq()<1e-4)away.set(0,1,0);away.normalize();
    const perp=new THREE.Vector3(0,0,1).cross(away);if(perp.lengthSq()<1e-4)perp.set(1,0,0);perp.normalize();const out=new THREE.Vector3(0,0,1);
    for(let k=0;k<miss;k++){const d=away.clone();if(miss===2)d.addScaledVector(perp,k?0.9:-0.9).addScaledVector(out,nb.length>1?(k?0.7:-0.7):0);if(miss===3){const ang=k*Math.PI*2/3;d.multiplyScalar(0.5).addScaledVector(perp,Math.cos(ang)).addScaledVector(out,Math.sin(ang));}
     d.normalize();const p=new THREE.Vector3(...a.p).addScaledVector(d,1.05);atoms.push({e:'H',p:[p.x,p.y,p.z]});bonds.push([i,atoms.length-1,1]);}}
  }
  const S=0.22;const c=new THREE.Vector3();atoms.forEach(a=>c.add(new THREE.Vector3(...a.p)));c.multiplyScalar(1/Math.max(1,atoms.length));
  const style:Record<string,[number,number]>={H:[0.28,1],C:[0.42,0.62],O:[0.48,0.98],N:[0.45,0.8],S:[0.55,0.9],P:[0.52,0.85]};
  const groups=new Map<string,THREE.BufferGeometry[]>();
  atoms.forEach(a=>{const [rr]=style[a.e]??[0.42,0.7];const k=a.e in style?a.e:'X';if(!groups.has(k))groups.set(k,[]);groups.get(k)!.push(at(G.sphere(rr*S,24,18),[(a.p[0]-c.x)*S*1.5,(a.p[1]-c.y)*S*1.5,(a.p[2]-c.z)*S*1.5]));});
  for(const [k,gs] of groups)inner.add(ctx.mesh(G.merge(gs),{tone:(style[k]??[0,0.7])[1],rough:0.35}));
  const sticks:THREE.BufferGeometry[]=[];const tmpA=new THREE.Vector3(),tmpB=new THREE.Vector3(),q=new THREE.Quaternion(),e=new THREE.Euler();
  for(const [x,y,o] of bonds){tmpA.set(...atoms[x]!.p).sub(c).multiplyScalar(S*1.5);tmpB.set(...atoms[y]!.p).sub(c).multiplyScalar(S*1.5);const d=tmpB.clone().sub(tmpA);const len=d.length();if(len<1e-4)continue;d.normalize();
   q.setFromUnitVectors(UP,d);e.setFromQuaternion(q);const side=new THREE.Vector3(0,0,1).cross(d);if(side.lengthSq()<1e-4)side.set(1,0,0);side.normalize();
   const ord=Math.max(1,Math.min(3,o??1));for(let k=0;k<ord;k++){const off=(k-(ord-1)/2)*0.07;const m=tmpA.clone().add(tmpB).multiplyScalar(0.5).addScaledVector(side,off);
    sticks.push(at(G.cyl(0.028,0.028,len,10),[m.x,m.y,m.z],[e.x*57.2958,e.y*57.2958,e.z*57.2958]));}}
  if(sticks.length)inner.add(ctx.mesh(G.merge(sticks),{tone:0.8}));
  return {root,grounded:false,update(cc,t){const s=cc.spin??1;inner.rotation.set(0.25*Math.sin(t*0.5*s),0.5*Math.sin(t*0.35*s),0.08*Math.sin(t*0.3*s));}};
 },
});
