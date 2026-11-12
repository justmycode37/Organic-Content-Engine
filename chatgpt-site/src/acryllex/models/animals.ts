// Animals model pack (see docs/acryllex.md). Articulated, posable animals built for dither-dot silhouettes.
import * as THREE from 'three';
import {G,at,deg,lerp,clamp,noise1} from '../kit.ts';
import {defineModel,type ModelCtx,type PoseState} from './types.ts';

type V3=[number,number,number];
/** Pose: joint name -> [x,y,z] degrees. Scalar channels (eyes, ears...) are 1-element arrays. */
type P=Record<string,number[]>;

const frac=(x:number)=>x-Math.floor(x);
const TAU=Math.PI*2;

function mixP(a:P,b:P,k:number):P{
 const out:P={};
 for(const key of new Set([...Object.keys(a),...Object.keys(b)])){
  const x=a[key],y=b[key];const n=Math.max(x?.length??0,y?.length??0);const v:number[]=[];
  for(let i=0;i<n;i++)v.push(lerp(x?.[i]??(key==='eyes'?1:0),y?.[i]??(key==='eyes'?1:0),k));
  out[key]=v;
 }
 return out;
}
const addP=(p:P,key:string,d:number[])=>{const v=p[key]?[...p[key]!]:[0,0,0];for(let i=0;i<d.length;i++)v[i]=(v[i]??0)+d[i]!;p[key]=v;};

/** Skeleton of named groups + ground-contact markers; grounding keeps the lowest contact on y=0. */
class Rig{
 root=new THREE.Group();mover=new THREE.Group();
 j:Record<string,THREE.Object3D>={};
 markers:{o:THREE.Object3D;r:number}[]=[];
 /** Channels driving several joints at once (tail segments, trunk, spine chains). */
 chains:Record<string,THREE.Object3D[]>={};
 chain(name:string,o:THREE.Object3D){(this.chains[name]??=[]).push(o);return o;}
 private v=new THREE.Vector3();
 constructor(public ctx:ModelCtx){this.root.add(this.mover);}
 bones:THREE.Bone[]=[];
 /** Joint = THREE.Bone (rotation order YXZ: x = pitch/elevation, then y = heading). */
 g(name:string,parent:THREE.Object3D,pos:V3=[0,0,0]){const o=new THREE.Bone();o.rotation.order='YXZ';o.position.set(...pos);parent.add(o);this.bones.push(o);if(name){o.name=name;this.j[name]=o;}return o;}
 m(parent:THREE.Object3D,geo:THREE.BufferGeometry,tone:number,extra:Record<string,unknown>={}){const me=this.ctx.mesh(geo,{tone,...extra});parent.add(me);return me;}
 mark(parent:THREE.Object3D,pos:V3,r=0){const o=new THREE.Object3D();o.position.set(...pos);parent.add(o);this.markers.push({o,r});return o;}
 apply(p:P){for(const k in p){const o=this.j[k],v=p[k]!;if(v.length!==3)continue;if(o)o.rotation.set(deg(v[0]!),deg(v[1]!),deg(v[2]!));const ch=this.chains[k];if(ch)for(const c of ch)c.rotation.set(deg(v[0]!),deg(v[1]!),deg(v[2]!));}}
 ground(){
  if(!this.markers.length)return;
  this.mover.position.y=0;this.root.updateMatrixWorld(true);let lo=Infinity;
  for(const mk of this.markers){this.v.setFromMatrixPosition(mk.o.matrixWorld);this.root.worldToLocal(this.v);lo=Math.min(lo,this.v.y-mk.r);}
  this.mover.position.y=-lo;
 }
}

// ---------- sculpted skinned bodies ----------
// Bodies are signed-distance sculptures (ellipsoids + tapered round cones, smooth-unioned) meshed with surface nets,
// projected onto the exact surface, and skinned to the rig's bones by distance, so joints bend as one organic skin.
interface Prim{bone:THREE.Object3D;kind:0|1;local:THREE.Matrix4;inv:Float64Array;r:V3;a:V3;b:V3;ra:number;rb:number;sq:V3;mid:V3;k:number;tone:number;lo:V3;hi:V3;bi:number;
 ba:V3;l2:number;rr:number;a2:number;il2:number;smin:number}
interface PrimOpts{k?:number;tone?:number;squash?:V3}
const GEO_CACHE=new Map<string,THREE.BufferGeometry>();
class Sculpt{
 prims:Prim[]=[];
 constructor(public def:{k:number;tone:number}){}
 /** Ellipsoid in bone-local coords. */
 ell(bone:THREE.Object3D,c:V3,r:V3,rot:V3=[0,0,0],o:PrimOpts={}){
  const local=new THREE.Matrix4().compose(new THREE.Vector3(...c),new THREE.Quaternion().setFromEuler(new THREE.Euler(deg(rot[0]),deg(rot[1]),deg(rot[2]))),new THREE.Vector3(1,1,1));
  this.prims.push(this.base(bone,0,local,o,{r}));return this;
 }
 /** Tapered round cone from a (radius ra) to b (radius rb), bone-local; squash scales its cross-section (bone axes). */
 cone(bone:THREE.Object3D,a:V3,b:V3,ra:number,rb:number,o:PrimOpts={}){
  this.prims.push(this.base(bone,1,new THREE.Matrix4(),o,{a,b,ra,rb}));return this;
 }
 private base(bone:THREE.Object3D,kind:0|1,local:THREE.Matrix4,o:PrimOpts,x:Partial<Prim>):Prim{
  const a=x.a??[0,0,0],b=x.b??[0,0,0],sq=o.squash??[1,1,1];
  return {bone,kind,local,inv:new Float64Array(16),r:x.r??[1,1,1],a,b,ra:x.ra??0,rb:x.rb??0,sq,mid:[(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2],k:o.k??this.def.k,tone:o.tone??this.def.tone,lo:[0,0,0],hi:[0,0,0],bi:0,ba:[0,0,0],l2:0,rr:0,a2:0,il2:0,smin:Math.min(...sq)};
 }
 private prep(bones:THREE.Bone[]){
  const m=new THREE.Matrix4(),corner=new THREE.Vector3();
  for(const p of this.prims){
   p.bi=Math.max(0,bones.indexOf(p.bone as THREE.Bone));
   m.copy(p.bone.matrixWorld).multiply(p.local);
   const box=new THREE.Box3();
   if(p.kind===0){const R=Math.max(...p.r);box.set(new THREE.Vector3(-R,-R,-R),new THREE.Vector3(R,R,R));}
   else{const R=Math.max(p.ra,p.rb)*Math.max(...p.sq);box.setFromPoints([new THREE.Vector3(...p.a),new THREE.Vector3(...p.b)]).expandByScalar(R);
    // squash in local space: q' = mid + (q-mid)/sq
    const a=p.a.map((v,i)=>p.mid[i]!+(v-p.mid[i]!)/p.sq[i]!) as V3,b=p.b.map((v,i)=>p.mid[i]!+(v-p.mid[i]!)/p.sq[i]!) as V3;
    p.a=a;p.b=b;p.ba=[b[0]-a[0],b[1]-a[1],b[2]-a[2]];p.l2=Math.max(1e-9,p.ba[0]**2+p.ba[1]**2+p.ba[2]**2);p.rr=p.ra-p.rb;p.a2=p.l2-p.rr*p.rr;p.il2=1/p.l2;}
   box.expandByScalar(p.k);const wb=new THREE.Box3();
   for(let i=0;i<8;i++){corner.set(i&1?box.max.x:box.min.x,i&2?box.max.y:box.min.y,i&4?box.max.z:box.min.z).applyMatrix4(m);wb.expandByPoint(corner);}
   p.lo=[wb.min.x,wb.min.y,wb.min.z];p.hi=[wb.max.x,wb.max.y,wb.max.z];
   const inv=m.clone().invert().elements;for(let i=0;i<16;i++)p.inv[i]=inv[i]!;
  }
 }
 private d(p:Prim,x:number,y:number,z:number){
  const e=p.inv;let qx=e[0]!*x+e[4]!*y+e[8]!*z+e[12]!,qy=e[1]!*x+e[5]!*y+e[9]!*z+e[13]!,qz=e[2]!*x+e[6]!*y+e[10]!*z+e[14]!;
  if(p.kind===0){const [rx,ry,rz]=p.r;const k0=Math.hypot(qx/rx,qy/ry,qz/rz),k1=Math.hypot(qx/(rx*rx),qy/(ry*ry),qz/(rz*rz));return k1<1e-9?-Math.min(rx,ry,rz):k0*(k0-1)/k1;}
  const m=p.mid,s=p.sq;qx=m[0]+(qx-m[0])/s[0];qy=m[1]+(qy-m[1])/s[1];qz=m[2]+(qz-m[2])/s[2];
  const pax=qx-p.a[0],pay=qy-p.a[1],paz=qz-p.a[2],[bx,by,bz]=p.ba;
  const yy=pax*bx+pay*by+paz*bz,zz=yy-p.l2;
  const cx=pax*p.l2-bx*yy,cy=pay*p.l2-by*yy,cz=paz*p.l2-bz*yy;const x2=cx*cx+cy*cy+cz*cz,y2=yy*yy*p.l2,z2=zz*zz*p.l2;
  const k=Math.sign(p.rr)*p.rr*p.rr*x2;let d:number;
  if(Math.sign(zz)*p.a2*z2>k)d=Math.sqrt(x2+z2)*p.il2-p.rb;
  else if(Math.sign(yy)*p.a2*y2<k)d=Math.sqrt(x2+y2)*p.il2-p.ra;
  else d=(Math.sqrt(x2*p.a2*p.il2)+yy*p.rr)*p.il2-p.ra;
  return d*p.smin;
 }
 private inside(p:Prim,x:number,y:number,z:number){return x>=p.lo[0]&&x<=p.hi[0]&&y>=p.lo[1]&&y<=p.hi[1]&&z>=p.lo[2]&&z<=p.hi[2];}
 sdf(x:number,y:number,z:number){let f=1e3;for(const p of this.prims){if(!this.inside(p,x,y,z))continue;f=smin(f,this.d(p,x,y,z),p.k);}return f;}
 /** Mesh + skin. `res` = cells across the largest dimension. */
 make(ctx:ModelCtx,bones:THREE.Bone[],res:number,key:string,opts:{rough?:number}={}){
  this.prep(bones);
  let geo=GEO_CACHE.get(key);
  if(!geo){geo=this.mesh(res);GEO_CACHE.set(key,geo);}
  const mat=ctx.mat({tone:1,rough:opts.rough??0.66});mat.vertexColors=true;
  const sm=new THREE.SkinnedMesh(geo,mat);sm.frustumCulled=false;
  sm.bind(new THREE.Skeleton(bones),new THREE.Matrix4());
  return sm;
 }
 private mesh(res:number){
  const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
  for(const p of this.prims)for(let i=0;i<3;i++){lo[i]=Math.min(lo[i]!,p.lo[i]!);hi[i]=Math.max(hi[i]!,p.hi[i]!);}
  const h=Math.max(hi[0]!-lo[0]!,hi[1]!-lo[1]!,hi[2]!-lo[2]!)/res;
  const n=[0,1,2].map(i=>Math.ceil((hi[i]!-lo[i]!)/h)+3);const [nx,ny,nz]=n as V3;
  const o=[lo[0]!-h,lo[1]!-h,lo[2]!-h];
  const F=new Float32Array(nx*ny*nz).fill(1e3);const id=(i:number,j:number,k:number)=>i+nx*(j+ny*k);
  for(const p of this.prims){
   const i0=Math.max(0,Math.floor((p.lo[0]-o[0]!)/h)),i1=Math.min(nx-1,Math.ceil((p.hi[0]-o[0]!)/h));
   const j0=Math.max(0,Math.floor((p.lo[1]-o[1]!)/h)),j1=Math.min(ny-1,Math.ceil((p.hi[1]-o[1]!)/h));
   const k0=Math.max(0,Math.floor((p.lo[2]-o[2]!)/h)),k1=Math.min(nz-1,Math.ceil((p.hi[2]-o[2]!)/h));
   for(let k=k0;k<=k1;k++)for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){const q=id(i,j,k);F[q]=smin(F[q]!,this.d(p,o[0]!+i*h,o[1]!+j*h,o[2]!+k*h),p.k);}
  }
  // surface nets
  const cell=new Int32Array(nx*ny*nz).fill(-1);const pos:number[]=[];
  const corners=[[0,0,0],[1,0,0],[0,1,0],[1,1,0],[0,0,1],[1,0,1],[0,1,1],[1,1,1]];
  const edges=[[0,1],[2,3],[4,5],[6,7],[0,2],[1,3],[4,6],[5,7],[0,4],[1,5],[2,6],[3,7]];
  const v=new Float64Array(8);
  for(let k=0;k<nz-1;k++)for(let j=0;j<ny-1;j++)for(let i=0;i<nx-1;i++){
   let mask=0;for(let c=0;c<8;c++){const cc=corners[c]!;v[c]=F[id(i+cc[0]!,j+cc[1]!,k+cc[2]!)]!;if(v[c]!<0)mask|=1<<c;}
   if(mask===0||mask===255)continue;
   let sx=0,sy=0,sz=0,cnt=0;
   for(const [a,b] of edges){const va=v[a!]!,vb=v[b!]!;if((va<0)===(vb<0))continue;const t=va/(va-vb);const ca=corners[a!]!,cb=corners[b!]!;
    sx+=ca[0]!+(cb[0]!-ca[0]!)*t;sy+=ca[1]!+(cb[1]!-ca[1]!)*t;sz+=ca[2]!+(cb[2]!-ca[2]!)*t;cnt++;}
   cell[id(i,j,k)]=pos.length/3;pos.push(o[0]!+(i+sx/cnt)*h,o[1]!+(j+sy/cnt)*h,o[2]!+(k+sz/cnt)*h);
  }
  const idx:number[]=[];
  const quad=(a:number,b:number,c:number,d:number,flip:boolean)=>{if(a<0||b<0||c<0||d<0)return;if(flip)idx.push(a,b,c,a,c,d);else idx.push(a,c,b,a,d,c);};
  for(let k=1;k<nz-1;k++)for(let j=1;j<ny-1;j++)for(let i=1;i<nx-1;i++){
   const s0=F[id(i,j,k)]!<0;
   if(i<nx-1&&s0!==(F[id(i+1,j,k)]!<0))quad(cell[id(i,j-1,k-1)]!,cell[id(i,j,k-1)]!,cell[id(i,j,k)]!,cell[id(i,j-1,k)]!,s0);
   if(j<ny-1&&s0!==(F[id(i,j+1,k)]!<0))quad(cell[id(i-1,j,k-1)]!,cell[id(i-1,j,k)]!,cell[id(i,j,k)]!,cell[id(i,j,k-1)]!,s0);
   if(k<nz-1&&s0!==(F[id(i,j,k+1)]!<0))quad(cell[id(i-1,j-1,k)]!,cell[id(i,j-1,k)]!,cell[id(i,j,k)]!,cell[id(i-1,j,k)]!,s0);
  }
  // project onto the exact surface, normals from the field gradient, skin weights + tone by prim proximity
  const N=pos.length/3,nor=new Float32Array(N*3),col=new Float32Array(N*3),si=new Uint16Array(N*4),sw=new Float32Array(N*4);
  const e=h*0.35;const bw=new Map<number,number>();
  for(let q=0;q<N;q++){
   let x=pos[q*3]!,y=pos[q*3+1]!,z=pos[q*3+2]!;let gx=0,gy=0,gz=1;
   for(let it=0;it<3;it++){
    const f=this.sdf(x,y,z);gx=this.sdf(x+e,y,z)-this.sdf(x-e,y,z);gy=this.sdf(x,y+e,z)-this.sdf(x,y-e,z);gz=this.sdf(x,y,z+e)-this.sdf(x,y,z-e);
    const gl=Math.hypot(gx,gy,gz)/(2*e);if(gl<1e-6)break;const step=clamp(f/gl,-h,h);const L=Math.hypot(gx,gy,gz);
    if(it<2){x-=gx/L*step;y-=gy/L*step;z-=gz/L*step;}
   }
   const L=Math.hypot(gx,gy,gz)||1;pos[q*3]=x;pos[q*3+1]=y;pos[q*3+2]=z;nor[q*3]=gx/L;nor[q*3+1]=gy/L;nor[q*3+2]=gz/L;
   bw.clear();let dmin=Infinity;const ds:number[]=[];
   for(const p of this.prims){const d=this.inside(p,x,y,z)?this.d(p,x,y,z):1e3;ds.push(d);dmin=Math.min(dmin,d);}
   let tone=0,tw=0;
   this.prims.forEach((p,pi)=>{const d=ds[pi]!;if(d>dmin+p.k*2+h)return;const w=Math.exp(-(d-dmin)/(p.k*0.45+h*0.5));bw.set(p.bi,(bw.get(p.bi)??0)+w);const wt=Math.exp(-(d-dmin)/(h*0.6+p.k*0.12));tone+=p.tone*wt;tw+=wt;});
   const top=[...bw.entries()].sort((a,b)=>b[1]-a[1]).slice(0,4);const tot=top.reduce((s2,t)=>s2+t[1],0)||1;
   top.forEach(([b,w],c)=>{si[q*4+c]=b;sw[q*4+c]=w/tot;});
   const tn=tw?tone/tw:1;col[q*3]=col[q*3+1]=col[q*3+2]=tn;
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('normal',new THREE.BufferAttribute(nor,3));
  g.setAttribute('color',new THREE.BufferAttribute(col,3));g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(si,4));g.setAttribute('skinWeight',new THREE.BufferAttribute(sw,4));
  g.setIndex(idx);g.computeBoundingSphere();g.computeBoundingBox();
  return g;
 }
}
function smin(a:number,b:number,k:number){const h=Math.max(k-Math.abs(a-b),0)/k;return Math.min(a,b)-h*h*k*0.25;}

// ---------- shared geometry helpers ----------
/** Limb extending along -z (tails). */
const limbBack=(r0:number,r1:number,len:number,seg=14)=>at(G.limb(r0,r1,len,seg),[0,0,0],[90,0,0]);
/** Limb extending up (+y). */
const limbUp=(r0:number,r1:number,len:number,seg=16)=>at(G.limb(r0,r1,len,seg),[0,0,0],[180,0,0]);
/** Limb extending forward (+z). */
const limbFwd=(r0:number,r1:number,len:number,seg=14)=>at(G.limb(r0,r1,len,seg),[0,0,0],[-90,0,0]);

/** Leg chain prefix+H/K/A (hip, knee, ankle) going down, returns the ankle group. */
function leg(rig:Rig,parent:THREE.Object3D,prefix:string,pos:V3,segs:{len:number;r0:number;r1:number;tone:number;thigh?:V3}[]){
 let cur=parent;const names=['H','K','A'];
 segs.forEach((s,i)=>{
  cur=rig.g(prefix+names[i],cur,i===0?pos:[0,-segs[i-1]!.len,0]);
  rig.m(cur,G.limb(s.r0,s.r1,s.len),s.tone);
  if(s.thigh)rig.m(cur,at(G.ellipsoid(s.thigh[0],s.thigh[1],s.thigh[2]),[0,-s.len*0.35,0]),s.tone);
 });
 return cur;
}

// ---------- gaits ----------
type GaitKind='walk'|'trot'|'gallop';
const GAIT:Record<GaitKind,{off:Record<string,number>;duty:number}>={
 walk:{off:{bl:0,fl:0.25,br:0.5,fr:0.75},duty:0.64},
 trot:{off:{fl:0,br:0,fr:0.5,bl:0.5},duty:0.5},
 gallop:{off:{bl:0,br:0.12,fl:0.5,fr:0.62},duty:0.38},
};
interface GaitCfg{stride:number;legF:number;legB:number;liftF:number;liftB:number}
/** Adds leg-swing offsets to a pose. Swing amplitude derived from stride so feet do not skate. */
function gaitPose(base:P,kind:GaitKind,phase:number,c:GaitCfg,scale=1):P{
 const p:P={...base};const gk=GAIT[kind];const d=gk.duty;
 for(const leg of ['fl','fr','bl','br']){
  const u=frac(phase+gk.off[leg]!);const front=leg[0]==='f';const L=front?c.legF:c.legB;
  const A=Math.asin(clamp(c.stride*d/(2*L),0,0.95))*180/Math.PI*scale;
  let swing:number,lift=0;
  if(u<d)swing=lerp(-A,A,u/d);else{const s=(u-d)/(1-d);swing=lerp(A,-A,0.5-0.5*Math.cos(Math.PI*s));lift=Math.sin(Math.PI*s);}
  const K=(front?c.liftF:c.liftB)*scale;
  if(front){addP(p,leg+'H',[swing-lift*K*0.15,0,0]);addP(p,leg+'K',[-lift*K*0.25,0,0]);addP(p,leg+'A',[lift*K*1.1,0,0]);}
  else{addP(p,leg+'H',[swing-lift*K*0.35,0,0]);addP(p,leg+'K',[lift*K*0.8,0,0]);addP(p,leg+'A',[-lift*K*0.7,0,0]);}
 }
 const s=Math.sin(phase*TAU*(kind==='walk'?2:kind==='trot'?2:1));
 if(kind==='gallop'){addP(p,'body',[Math.sin(phase*TAU)*7*scale,0,0]);addP(p,'spine1',[Math.sin(phase*TAU+1)*6*scale,0,0]);addP(p,'neck',[Math.sin(phase*TAU+2)*10*scale,0,0]);}
 else{addP(p,'neck',[s*3*scale,0,0]);addP(p,'spine1',[0,Math.sin(phase*TAU)*3*scale,0]);addP(p,'body',[0,0,Math.sin(phase*TAU)*1.5*scale]);}
 return p;
}

// ---------- quadruped framework ----------
interface QuadSpec{
 poses:Record<string,P>;
 gait:GaitCfg;
 /** stride multipliers for trot / gallop */
 run?:{kind:GaitKind;stride:number};
 build(rig:Rig):Sculpt|void;
 /** cache key + mesh resolution for the sculpted skin */
 key?:string;res?:number;
 /** Idle additions (tail wag, breathing, ear flicks) and scalar channels. */
 idle?(rig:Rig,p:P,c:Record<string,number>,t:number,moving:boolean):void;
 after?(rig:Rig,p:P,c:Record<string,number>,t:number):void;
}
const GAIT_POSES=new Set(['walk','run','trot','gallop']);
function quadruped(ctx:ModelCtx,spec:QuadSpec){
 const rig=new Rig(ctx);const S=spec.build(rig);
 const stand=spec.poses.stand!;
 if(S){rig.apply(stand);rig.root.updateMatrixWorld(true);rig.mover.add(S.make(ctx,rig.bones,spec.res??110,spec.key??'q'));}
 const poseOf=(name:string,t:number,travel:number,moving:boolean):P=>{
  if(GAIT_POSES.has(name)||moving){
   const running=name==='run'||name==='gallop'||name==='trot';
   const kind:GaitKind=running?(name==='trot'?'trot':spec.run?.kind??'gallop'):'walk';
   const stride=spec.gait.stride*(running?(name==='trot'?1.4:spec.run?.stride??2.2):1);
   const dist=moving?travel:t*stride*(running?1.6:1.1);
   return gaitPose(spec.poses[running?'run':'walk']??stand,kind,dist/stride,{...spec.gait,stride},1);
  }
  return spec.poses[name]??stand;
 };
 const update=(c:Record<string,number>,t:number,pose:PoseState)=>{
  const moving=pose.speed>0.05;
  const p=mixP(poseOf(pose.from,t,pose.travel,moving),poseOf(pose.to,t,pose.travel,moving),clamp(pose.k));
  spec.idle?.(rig,p,c,t,moving);
  rig.apply(p);spec.after?.(rig,p,c,t);rig.ground();
 };
 return {root:rig.root,grounded:true,update};
}

/** Eye: dark ball with a bright catch-light; `lid` group scales to close. */
function eye(rig:Rig,parent:THREE.Object3D,pos:V3,r:number,name:string,tone=0.14,rot:V3=[0,0,0]){
 const g=rig.g(name,parent,pos);g.rotation.set(deg(rot[0]),deg(rot[1]),deg(rot[2]));
 rig.m(g,G.sphere(r,16,12),tone,{rough:0.3});
 rig.m(g,at(G.sphere(r*0.28,8,6),[r*0.25,r*0.35,r*0.8]),1);
 return g;
}
const closeEyes=(rig:Rig,names:string[],open:number)=>{for(const n of names){const e=rig.j[n];if(e)e.scale.y=clamp(0.12+0.88*open,0.12,1);}};
const blink=(t:number,seed=0)=>{const x=frac(t*0.27+seed*0.37);return x<0.035?0.1:1;};

// =====================================================================================================
// DOG
// =====================================================================================================
const DOG_STAND:P={
 body:[0,0,0],spine1:[0,0,0],spine2:[0,0,0],neck:[24,0,0],head:[-26,0,0],
 flH:[16,0,0],flK:[-18,0,0],flA:[-8,0,0],frH:[16,0,0],frK:[-18,0,0],frA:[-8,0,0],
 blH:[-28,0,0],blK:[52,0,0],blA:[-26,0,0],brH:[-28,0,0],brK:[52,0,0],brA:[-26,0,0],
 tail0:[34,0,0],tail:[6,0,0],earL:[0,0,0],earR:[0,0,0],jaw:[0,0,0],eyes:[1],
};
const DOG_SIT:P={...DOG_STAND,
 body:[-38,0,0],neck:[52,0,0],head:[-16,0,0],
 flH:[52,0,0],flK:[-10,0,0],flA:[-6,0,0],frH:[52,0,0],frK:[-10,0,0],frA:[-6,0,0],
 blH:[-52,0,6],blK:[140,0,0],blA:[-80,0,0],brH:[-52,0,-6],brK:[140,0,0],brA:[-80,0,0],
 tail0:[40,30,0],tail:[-2,8,0],
};
const DOG_LIE:P={...DOG_STAND,
 body:[0,0,0],neck:[22,0,0],head:[-30,0,0],
 flH:[-82,0,0],flK:[-8,0,0],flA:[8,0,0],frH:[-82,0,0],frK:[-8,0,0],frA:[8,0,0],
 blH:[-74,0,24],blK:[150,0,0],blA:[-70,0,0],brH:[-74,0,-24],brK:[150,0,0],brA:[-70,0,0],
 tail0:[-6,22,0],tail:[0,10,0],
};
const DOG_SLEEP:P={...DOG_LIE,
 neck:[92,0,0],head:[-80,0,0],spine1:[4,0,0],spine2:[4,0,0],
 flH:[-86,4,0],frH:[-86,-4,0],
 tail0:[-4,40,0],tail:[0,18,0],earL:[20,0,0],earR:[20,0,0],eyes:[0],
};
const DOG_SIDE:P={...DOG_STAND,body:[0,0,90],neck:[70,0,0],head:[-60,0,0],
 flH:[-30,0,0],flK:[-20,0,0],flA:[10,0,0],frH:[-20,0,0],frK:[-20,0,0],frA:[10,0,0],
 blH:[-10,0,0],blK:[30,0,0],blA:[-10,0,0],brH:[0,0,0],brK:[30,0,0],brA:[-10,0,0],tail0:[0,0,0],tail:[2,0,0],eyes:[0]};
const DOG_POSES:Record<string,P>={
 stand:DOG_STAND,walk:DOG_STAND,
 run:{...DOG_STAND,neck:[52,0,0],head:[-46,0,0],tail0:[12,0,0],tail:[2,0,0],earL:[-30,0,0],earR:[-30,0,0]},
 trot:DOG_STAND,
 sit:DOG_SIT,lie:DOG_LIE,sleep:DOG_SLEEP,'sleep-side':DOG_SIDE,
 beg:{...DOG_SIT,body:[-62,0,0],neck:[60,0,0],head:[-10,0,0],flH:[-20,0,0],flK:[-70,0,0],flA:[70,0,0],frH:[-20,0,0],frK:[-70,0,0],frA:[70,0,0]},
 sniff:{...DOG_STAND,neck:[96,0,0],head:[-10,0,0],flH:[10,0,0],frH:[10,0,0]},
 bark:{...DOG_STAND,neck:[30,0,0],head:[-46,0,0],jaw:[28,0,0]},
 'look-up':{...DOG_STAND,neck:[10,0,0],head:[-40,0,0]},
};

function buildDog(ctx:ModelCtx){
 const ears=ctx.str('ears','floppy',['floppy','pointy'] as const);
 const collar=ctx.bool('collar',true);
 const dark=0.12;
 return quadruped(ctx,{
  poses:DOG_POSES,key:'dog-'+ears,res:120,
  gait:{stride:0.62,legF:0.44,legB:0.46,liftF:55,liftB:40},
  run:{kind:'gallop',stride:2.2},
  build(rig){
   const S=new Sculpt({k:0.05,tone:0.92});
   const body=rig.g('body',rig.mover,[0,0.47,0]);
   const pelvis=rig.g('pelvis',body);
   const mid=rig.g('spine1',pelvis,[0,0,0.18]);
   const chest=rig.g('spine2',mid,[0,0,0.2]);
   // torso: rump, loin, ribcage, deep brisket, withers
   S.ell(pelvis,[0,0.035,-0.04],[0.1,0.11,0.13],[0,0,0],{k:0.07});
   S.ell(pelvis,[0,0.01,0.06],[0.098,0.105,0.12],[-6,0,0],{k:0.07});
   S.ell(mid,[0,0.02,0.02],[0.11,0.115,0.14],[0,0,0],{k:0.08});
   S.ell(chest,[0,-0.01,0.03],[0.118,0.15,0.16],[8,0,0],{k:0.08});
   S.ell(chest,[0,-0.06,0.13],[0.085,0.11,0.07],[20,0,0],{k:0.06});
   S.ell(chest,[0,0.07,0.06],[0.07,0.06,0.1],[0,0,0],{k:0.06});
   for(const s2 of [1,-1])S.ell(chest,[s2*0.07,0.03,0.08],[0.035,0.09,0.06],[-25,0,0],{k:0.05}); // shoulder blades
   for(const [o,p] of [[pelvis,[0,-0.07,0]],[mid,[0,-0.08,0.02]],[chest,[0,-0.15,0.06]],[pelvis,[0,0.03,-0.17]]] as [THREE.Object3D,V3][])rig.mark(o,p,0.01);
   for(const s2 of [1,-1]){rig.mark(pelvis,[s2*0.1,0.03,-0.03],0.01);rig.mark(chest,[s2*0.12,0,0.04],0.01);rig.mark(mid,[s2*0.11,0.02,0.02],0.01);}
   for(const sd of [1,-1]){
    const fp=sd>0?'fl':'fr',bp=sd>0?'bl':'br';
    const fH=rig.g(fp+'H',chest,[sd*0.08,-0.02,0.08]),fK=rig.g(fp+'K',fH,[0,-0.17,0]),fA=rig.g(fp+'A',fK,[0,-0.19,0]);
    S.ell(fH,[0,-0.06,0.0],[0.045,0.095,0.06],[0,0,0],{k:0.05,tone:0.9});
    S.cone(fH,[0,0,0],[0,-0.17,0],0.045,0.034,{k:0.04,tone:0.9});
    S.cone(fK,[0,0,0],[0,-0.19,0.0],0.032,0.022,{k:0.025,tone:0.88});
    S.ell(fK,[0,-0.04,-0.005],[0.03,0.06,0.03],[0,0,0],{k:0.02,tone:0.88});
    S.cone(fA,[0,0,0],[0,-0.065,0.01],0.022,0.021,{k:0.02,tone:0.86});
    S.ell(fA,[0,-0.08,0.022],[0.03,0.02,0.04],[0,0,0],{k:0.015,tone:0.86});
    for(const tx of [-1,-0.35,0.35,1])S.ell(fA,[tx*0.015,-0.083,0.05],[0.011,0.012,0.014],[0,0,0],{k:0.006,tone:0.82}); // toes
    rig.mark(fA,[0,-0.1,0.02],0);rig.mark(fK,[0,0,0],0.032);
    const bH=rig.g(bp+'H',pelvis,[sd*0.075,-0.01,-0.04]),bK=rig.g(bp+'K',bH,[0,-0.2,0]),bA=rig.g(bp+'A',bK,[0,-0.19,0]);
    S.ell(bH,[0,-0.06,0.0],[0.06,0.12,0.085],[0,0,0],{k:0.07,tone:0.9}); // haunch
    S.cone(bH,[0,0,0],[0,-0.2,0],0.05,0.036,{k:0.04,tone:0.9});
    S.cone(bK,[0,0,0],[0,-0.19,0],0.034,0.02,{k:0.03,tone:0.88});
    S.ell(bK,[0,-0.05,-0.02],[0.03,0.07,0.035],[0,0,0],{k:0.03,tone:0.88}); // calf
    S.cone(bA,[0,0,0],[0,-0.105,0.005],0.02,0.02,{k:0.015,tone:0.86});
    S.ell(bA,[0,-0.118,0.025],[0.029,0.02,0.04],[0,0,0],{k:0.015,tone:0.86});
    for(const tx of [-1,-0.35,0.35,1])S.ell(bA,[tx*0.014,-0.12,0.052],[0.01,0.011,0.013],[0,0,0],{k:0.006,tone:0.82});
    rig.mark(bA,[0,-0.138,0.02],0);rig.mark(bK,[0,0,0],0.035);
   }
   // tail
   let tp:THREE.Bone=rig.g('tail0',pelvis,[0,0.07,-0.15]);
   for(let i=0;i<6;i++){const r0=0.028-i*0.0035,r1=r0-0.0035;S.cone(tp,[0,0,0],[0,0,-0.064],r0,Math.max(0.006,r1),{k:0.02,tone:0.9});rig.mark(tp,[0,0,-0.064],r1);if(i<5)tp=rig.chain('tail',rig.g('',tp,[0,0,-0.064])) as THREE.Bone;}
   // neck + head
   const neck=rig.g('neck',chest,[0,0.07,0.14]);
   S.cone(neck,[0,-0.05,-0.02],[0,0.2,0],0.085,0.06,{k:0.06});
   if(collar){neck.add(ctx.mesh(at(G.torus(0.071,0.012,10,40),[0,0.075,0.004],[96,0,0]),{tone:0.5}));neck.add(ctx.mesh(at(G.cyl(0.02,0.02,0.005,20),[0,0.035,0.083],[80,0,0]),{tone:1}));}
   const head=rig.g('head',neck,[0,0.2,0]);
   S.ell(head,[0,0.045,-0.01],[0.075,0.072,0.085],[0,0,0],{k:0.03}); // skull
   S.ell(head,[0,0.1,-0.02],[0.04,0.03,0.07],[0,0,0],{k:0.03}); // crown
   S.ell(head,[0,0.0,0.03],[0.07,0.05,0.06],[0,0,0],{k:0.03}); // cheeks
   for(const s2 of [1,-1])S.ell(head,[s2*0.035,0.075,0.06],[0.025,0.016,0.025],[0,0,0],{k:0.015}); // brows
   S.cone(head,[0,0.035,0.06],[0,0.02,0.19],0.044,0.034,{k:0.03,squash:[1,0.9,1],tone:0.96}); // muzzle
   S.ell(head,[0,-0.005,0.15],[0.04,0.03,0.05],[0,0,0],{k:0.02,tone:0.96}); // upper lips
   const jaw=rig.g('jaw',head,[0,-0.025,0.05]);
   S.cone(jaw,[0,0,0],[0,-0.005,0.13],0.03,0.022,{k:0.008,squash:[1,0.6,1],tone:0.8});
   rig.mark(jaw,[0,-0.025,0.1],0);rig.mark(head,[0,-0.035,0],0.02);
   // nose with nostrils, eyes
   head.add(ctx.mesh(at(G.ellipsoid(0.028,0.02,0.02),[0,0.04,0.218]),{tone:dark,rough:0.3}));
   for(const s2 of [1,-1]){head.add(ctx.mesh(at(G.sphere(0.006,8,6),[s2*0.011,0.036,0.236]),{tone:0.02}));}
   for(const s2 of [1,-1]){
    eye(rig,head,[s2*0.04,0.064,0.083],0.015,s2>0?'eyeL':'eyeR',dark,[0,s2*22,0]);
    const ear=rig.g(s2>0?'earL':'earR',head,[s2*0.058,0.098,-0.02]);
    if(ears==='floppy'){ear.rotation.z=deg(s2*10);S.ell(ear,[s2*0.022,-0.055,0.0],[0.02,0.08,0.048],[0,0,s2*18],{k:0.012,tone:0.55});}
    else S.cone(ear,[0,0,0],[s2*0.01,0.1,0.0],0.04,0.008,{k:0.015,squash:[1,1,0.45],tone:0.6});
   }
   return S;
  },
  idle(rig,p,c,t,moving){
   const wag=clamp(c.wag??0.35);
   const w=Math.sin(t*(9+wag*7))*(10+wag*34)*(0.3+0.7*wag);
   addP(p,'tail0',[0,w*0.7,0]);addP(p,'tail',[0,w*0.25,0]);
   addP(p,'spine2',[Math.sin(t*(moving?6:2.2))*1.2,0,0]);
   if(!moving){addP(p,'head',[noise1(t*0.5,3)*4,noise1(t*0.4,7)*10,0]);addP(p,'earL',[Math.max(0,noise1(t*1.3,2))*12,0,0]);}
   if(c.bark){addP(p,'jaw',[Math.max(0,Math.sin(t*12))*30*c.bark,0,0]);}
  },
  after(rig,p,_c,t){closeEyes(rig,['eyeL','eyeR'],(p.eyes?.[0]??1)*blink(t,1));},
 });
}
export const dog=defineModel({
 id:'dog',aliases:['puppy','hound','pet-dog','labrador','doggo','canine'],
 describe:'A medium dog (labrador-like: floppy ears, long muzzle, black nose, collar with tag, wagging tail) that can stand, walk, run/gallop, sit, beg, sniff, bark, lie and sleep (curled with eyes closed); 0.6 m tall. `wag` 0..1 tail wag speed, `bark` 0..1 snapping jaw.',
 params:{ears:'floppy (default) | pointy',collar:'true (default) | false'},
 controls:{wag:'0 slow .. 1 excited tail wag (default 0.35)',bark:'0..1 barking jaw'},defaults:{wag:0.35,bark:0},
 poses:Object.keys(DOG_POSES),size:'0.6 m tall, 0.95 m long',
 build:buildDog,
});

// =====================================================================================================
// CAT
// =====================================================================================================
const CAT_STAND:P={
 body:[0,0,0],spine1:[0,0,0],spine2:[0,0,0],neck:[30,0,0],head:[-30,0,0],
 flH:[10,0,0],flK:[-8,0,0],flA:[-12,0,0],frH:[10,0,0],frK:[-8,0,0],frA:[-12,0,0],
 blH:[-30,0,0],blK:[58,0,0],blA:[-30,0,0],brH:[-30,0,0],brK:[58,0,0],brA:[-30,0,0],
 tail0:[62,0,0],tail:[9,0,0],earL:[0,0,0],earR:[0,0,0],eyes:[1],
};
const CAT_SIT:P={...CAT_STAND,
 body:[-52,0,0],neck:[44,0,0],head:[8,0,0],spine2:[-6,0,0],
 flH:[58,0,0],flK:[-4,0,0],flA:[-8,0,0],frH:[58,0,0],frK:[-4,0,0],frA:[-8,0,0],
 blH:[-40,0,10],blK:[150,0,0],blA:[-110,0,0],brH:[-40,0,-10],brK:[150,0,0],brA:[-110,0,0],
 tail0:[56,62,0],tail:[0,20,-4],
};
const CAT_LOAF:P={...CAT_STAND,
 neck:[22,0,0],head:[-22,0,0],
 flH:[-60,0,0],flK:[-60,0,0],flA:[120,0,0],frH:[-60,0,0],frK:[-60,0,0],frA:[120,0,0],
 blH:[-72,0,14],blK:[152,0,0],blA:[-80,0,0],brH:[-72,0,-14],brK:[152,0,0],brA:[-80,0,0],
 tail0:[-6,48,0],tail:[0,14,0],
};
const CAT_CURL:P={...CAT_LOAF,
 spine1:[0,40,0],spine2:[0,40,0],neck:[82,40,0],head:[-40,40,-40],
 flH:[40,0,0],flK:[-150,0,0],flA:[0,0,0],frH:[40,0,0],frK:[-150,0,0],frA:[0,0,0],
 blH:[-60,0,10],blK:[150,0,0],blA:[-90,0,0],brH:[-60,0,-10],brK:[150,0,0],brA:[-90,0,0],
 tail0:[-34,-40,10],tail:[4,-21,0],eyes:[0],earL:[0,0,0],earR:[0,0,0],
};
const CAT_POSES:Record<string,P>={
 stand:CAT_STAND,walk:CAT_STAND,trot:CAT_STAND,
 run:{...CAT_STAND,neck:[44,0,0],head:[-44,0,0],tail0:[14,0,0],tail:[3,0,0]},
 sit:CAT_SIT,lie:CAT_LOAF,loaf:CAT_LOAF,sleep:CAT_CURL,curl:CAT_CURL,
 stretch:{...CAT_STAND,body:[14,0,0],neck:[10,0,0],head:[-26,0,0],flH:[-50,0,0],flK:[-30,0,0],flA:[20,0,0],frH:[-50,0,0],frK:[-30,0,0],frA:[20,0,0],blH:[-40,0,0],blK:[40,0,0],blA:[-10,0,0],brH:[-40,0,0],brK:[40,0,0],brA:[-10,0,0],tail0:[70,0,0],tail:[3,0,0]},
 arch:{...CAT_STAND,body:[-24,0,0],spine1:[24,0,0],spine2:[24,0,0],neck:[40,0,0],head:[-60,0,0],tail0:[110,0,0],tail:[3,0,0],flH:[-38,0,0],frH:[-38,0,0],flK:[0,0,0],frK:[0,0,0],blH:[0,0,0],brH:[0,0,0],blK:[40,0,0],brK:[40,0,0],earL:[0,0,-50],earR:[0,0,50]},
 groom:{...CAT_SIT,neck:[80,-10,0],head:[-10,-30,0],frH:[-30,0,0],frK:[-110,0,0],frA:[60,0,0]},
};

function buildCat(ctx:ModelCtx){
 const fur=0.9,leg2=0.86,dark=0.12;
 return quadruped(ctx,{
  poses:CAT_POSES,
  gait:{stride:0.36,legF:0.22,legB:0.25,liftF:60,liftB:44},
  run:{kind:'gallop',stride:2.4},
  build(rig){
   const body=rig.g('body',rig.mover,[0,0.22,0]);
   const pelvis=rig.g('pelvis',body);
   rig.m(pelvis,at(G.ellipsoid(0.058,0.068,0.11),[0,0.02,0.0]),fur);
   const mid=rig.g('spine1',pelvis,[0,0,0.1]);
   rig.m(mid,at(G.ellipsoid(0.06,0.068,0.11),[0,0.012,0.0]),fur);
   const chest=rig.g('spine2',mid,[0,0,0.1]);
   rig.m(chest,at(G.ellipsoid(0.06,0.075,0.1),[0,0.0,0.03]),fur);
   for(const [o,p] of [[pelvis,[0,-0.045,0]],[mid,[0,-0.05,0]],[chest,[0,-0.07,0.03]],[pelvis,[0,0.02,-0.1]]] as [THREE.Object3D,V3][])rig.mark(o,p,0.01);
   for(const s of [1,-1]){rig.mark(pelvis,[s*0.058,0.02,0],0.005);rig.mark(chest,[s*0.06,0,0.03],0.005);}
   for(const s of [1,-1]){
    const fp=s>0?'fl':'fr',bp=s>0?'bl':'br';
    const fa=leg(rig,chest,fp,[s*0.04,-0.01,0.05],[{len:0.09,r0:0.026,r1:0.02,tone:leg2,thigh:[0.026,0.05,0.032]},{len:0.1,r0:0.017,r1:0.014,tone:leg2},{len:0.035,r0:0.014,r1:0.013,tone:leg2}]);
    rig.m(fa,at(G.ellipsoid(0.017,0.012,0.022),[0,-0.04,0.008]),fur);rig.mark(fa,[0,-0.05,0.008],0);
    const ba=leg(rig,pelvis,bp,[s*0.04,-0.005,-0.03],[{len:0.11,r0:0.032,r1:0.022,tone:leg2,thigh:[0.034,0.065,0.045]},{len:0.11,r0:0.02,r1:0.013,tone:leg2},{len:0.07,r0:0.013,r1:0.012,tone:leg2}]);
    rig.m(ba,at(G.ellipsoid(0.017,0.012,0.024),[0,-0.074,0.01]),fur);rig.mark(ba,[0,-0.085,0.01],0);
    rig.mark(rig.j[bp+'K']!,[0,0,0],0.02);rig.mark(rig.j[fp+'K']!,[0,0,0],0.016);rig.mark(rig.j[fp+'A']!,[0,0,0],0.014);
   }
   let tp:THREE.Object3D=rig.g('tail0',pelvis,[0,0.05,-0.095]);
   for(let i=0;i<9;i++){const r0=0.014-i*0.0006,r1=r0-0.0006;rig.m(tp,limbBack(r0,r1,0.032),i>6?0.7:fur);rig.mark(tp,[0,0,-0.03],r1);if(i<8)tp=rig.chain('tail',rig.g('',tp,[0,0,-0.032]));}
   const neck=rig.g('neck',chest,[0,0.035,0.08]);
   rig.m(neck,limbUp(0.04,0.034,0.07),fur);
   const head=rig.g('head',neck,[0,0.075,0]);head.scale.setScalar(1.15);
   rig.m(head,at(G.ellipsoid(0.05,0.044,0.046),[0,0.02,0]),fur);
   rig.m(head,at(G.ellipsoid(0.056,0.03,0.036),[0,0.0,0.01]),fur); // cheeks
   rig.m(head,at(G.ellipsoid(0.026,0.018,0.022),[0,-0.002,0.04]),fur); // muzzle
   rig.m(head,at(G.ellipsoid(0.008,0.006,0.005),[0,0.008,0.062]),dark); // nose
   rig.m(head,at(G.ellipsoid(0.016,0.007,0.016),[0,-0.018,0.035]),0.7); // chin
   rig.mark(head,[0,-0.03,0.02],0);
   for(const s of [1,-1]){
    const e=eye(rig,head,[s*0.022,0.025,0.04],0.011,s>0?'eyeL':'eyeR',0.55,[0,s*24,0]);
    rig.m(e,at(G.ellipsoid(0.0025,0.0095,0.004),[0,0,0.0095]),0.08); // slit pupil
    const ear=rig.g(s>0?'earL':'earR',head,[s*0.032,0.05,-0.008]);
    rig.m(ear,at(G.cone(0.024,0.055,4),[0,0.024,0],[0,45,s*-14],[1,1,0.42]),fur);
    rig.m(ear,at(G.cone(0.016,0.04,4),[s*-0.002,0.02,0.007],[0,45,s*-14],[1,1,0.3]),0.38);
    for(const k of [-1,0,1])rig.m(head,G.tube([[s*0.018,-0.004+k*0.004,0.052],[s*0.05,-0.002+k*0.008,0.05],[s*0.085,-0.008+k*0.016,0.04]],0.0016,10,4),1);
   }
  },
  idle(rig,p,c,t,moving){
   const sw=Math.sin(t*1.6)*(14+20*clamp(c.swish??0));
   addP(p,'tail0',[0,sw*0.6,0]);addP(p,'tail',[Math.sin(t*1.6-1)*2,sw*0.12,0]);
   addP(p,'spine2',[Math.sin(t*(moving?6:2.4))*1.2,0,0]);
   if(!moving){addP(p,'head',[noise1(t*0.5,4)*4,noise1(t*0.35,9)*12,0]);const f=Math.max(0,noise1(t*1.1,5)-0.4)*40;addP(p,'earL',[0,0,f]);}
  },
  after(rig,p,_c,t){closeEyes(rig,['eyeL','eyeR'],(p.eyes?.[0]??1)*blink(t,2));},
 });
}
export const cat=defineModel({
 id:'cat',aliases:['kitten','kitty','house-cat','tabby','feline'],
 describe:'A house cat (pointed triangular ears, round face, whiskers, slit-pupil eyes, long curving tail) that can stand, walk, run, sit (tail wrapped round its paws), loaf, stretch, arch its back, groom and sleep curled into a ball; 0.3 m tall. `swish` 0..1 tail swish.',
 controls:{swish:'0 calm .. 1 agitated tail swish (default 0.2)'},defaults:{swish:0.2},
 poses:Object.keys(CAT_POSES),size:'0.3 m tall, 0.5 m long + tail',
 build:buildCat,
});
