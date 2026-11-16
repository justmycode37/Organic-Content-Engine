import * as THREE from 'three';
import {lerp,clamp,rng} from '../kit.ts';
import {defineModel} from './types.ts';
import {createFluidSurface,createFluidFoam,controlGridFluidSampler} from './fluid-surface.ts';

// ================================================================= ocean wave (barrel)
const volumetricCurlWave=defineModel({
 id:'curl-wave',aliases:['breaking-wave','barrel-wave','big-wave','surf-wave','tube-wave','making-waves','ocean-wave','wave'],
 describe:'A huge breaking ocean wave seen from the front-side like a surf photo: hundreds of water streaks rise up the face, a thick bright lip throws over the top and pours down the right into boiling whitewater, inner streaks ring a dark hollow eye (the tube). Front view: camera pos [0,3,10] look [0,3,0] fov 34 frames it like the classic barrel shot. Water flows continuously; `size` grows the wave.',
 controls:{size:'0 small .. 1 full (default 1)',flow:'water speed (default 1)'},defaults:{size:1,flow:1},params:{mirror:'true: wave breaks to the left',eye:'eye radius m (default 0.95)',eyeX:'tube centre x m (default 1.55)',eyeY:'tube centre y m (default 1.9)',foldX:'front fold centre x m (default 1.1)',foldY:'front fold centre y m (default 1.95)',volume:'continuous barrel wall 0..1 (default 1)',depth:'tube recession m (default 3.2)',crest:'crest brightness (default 2.05)',shadow:'barrel wall brightness (default 1.15)',spray:'spray density 0..2 (default 1)',tone:'water luminance gain (default 0.6)',wall:'tube wall brightness (default 1.2)',overhang:'crest throw m (default 0.55)',fall:'foam fall m (default 0.3)',eccentricity:'barrel lean toward its shoulder 0..1 (default 0.35)'},size:'10 m wide, 6 m tall',
 build(ctx){
  // Streamline construction: the wave is a family of thin water ribbons laid out around the tube's eye.
  // Authored in the picture plane of a camera at z=+D (x right, y up) and pushed into depth with projection compensation,
  // so the front view reproduces the classic barrel photo while the geometry stays genuinely 3D (inner rings recede).
  const outer=new THREE.Group();const root=new THREE.Group();outer.add(root);if(ctx.bool('mirror',false))root.scale.x=-1;
  const r=rng(ctx.seed+17);const D=10,EX=ctx.num('eyeX',1.55,-2,4),EY=ctx.num('eyeY',1.9,0,5),E0=ctx.num('eye',0.95,0.2,2);
  const volume=ctx.num('volume',1,0,1),tubeDepth=ctx.num('depth',3.2,0,8),crest=ctx.num('crest',2.05,0.1,3),shadow=ctx.num('shadow',1.15,0.05,2);
  const offsetX=EX-0.95,gain=ctx.num('tone',0.6,0.1,2),eccentricity=ctx.num('eccentricity',0.35,0,1),wallTone=ctx.num('wall',1.2,0.1,3),overhang=ctx.num('overhang',0.55,-1,2),fall=ctx.num('fall',0.3,0,2);
  interface Rib {pts:number[];w:number[];tone:number;phase:number;spin:number;len:number;bright:number;body?:boolean;lip?:boolean}
  const ribs:Rib[]=[];
  // depth of a point at distance rr from the eye: the tube recedes toward the eye, the lip comes forward
  const depth=(rr:number)=>-tubeDepth*Math.exp(-(rr-E0)/0.9)+0.4*clamp((rr-1.9)/0.8);
  const deg2=(d:number)=>d*Math.PI/180;
  const addArc=(r0:number,a0:number,a1:number,grow:number,width:number,tone:number,spin:number,squash=1.0,body=false)=>{
   const N=Math.max(24,Math.round(Math.abs(a1-a0)*r0*16));const pts:number[]=[],w:number[]=[];
   for(let i=0;i<=N;i++){const k=i/N;const a=lerp(a0,a1,k);const rr=r0*(1+grow*k);const shoulder=Math.max(0,rr-E0);pts.push(EX+Math.cos(a)*rr-shoulder*eccentricity,EY+Math.sin(a)*rr*squash+shoulder*eccentricity*0.6,depth(rr)-(body?0.6:0));w.push(width*(0.55+0.45*Math.sin(Math.PI*clamp(k*1.15))));}
   ribs.push({pts,w,tone,phase:r()*20,spin,len:Math.abs(a1-a0)*r0,bright:0,body});};
  /** Smooth curve through control points (relative to the eye), offset sideways by `off`, cut to [k0,k1]. */
  const addPath=(ctrl:[number,number][],off:number,k0:number,k1:number,width:number,tone:number,z:number,spin=0,lip=false,body=false)=>{
   const curve=new THREE.CatmullRomCurve3(ctrl.map(([x,y])=>new THREE.Vector3(x,y,0)));const L=curve.getLength();const N=Math.max(8,Math.round(L*(k1-k0)*18));const pts:number[]=[],w:number[]=[];
   const pt=new THREE.Vector3(),tg=new THREE.Vector3();
   for(let i=0;i<=N;i++){const k=lerp(k0,k1,i/N);curve.getPointAt(k,pt);curve.getTangentAt(k,tg);const off2=lip?off*(0.3+0.95*k):off;const ripple=0.045*Math.sin(k*L*4.7+off*6.1)+0.025*Math.sin(k*L*11.3+off*4.7);const x=pt.x-offsetX-(lip?overhang*(1-clamp((k-0.12)/0.4)):0)-tg.y*(off2+ripple),y=pt.y+tg.x*(off2+ripple);pts.push(EX+x,2.22+y,z+depth(Math.hypot(x,y))*0.25);w.push(width*(0.6+0.4*Math.sin(Math.PI*clamp((i/N)*1.1))));}
   ribs.push({pts,w,tone,phase:r()*20,spin,len:L*(k1-k0),bright:0,lip,body});};
  // 1) the LIP: a thick bright band (many overlapping ribbons) - flat across the top, rounding down the right side, then running out right as whitewater
  const LIP:[number,number][]=[[-3.4,2.2],[-2.1,2.6],[-0.9,2.62],[0.15,2.3],[1.05,1.6],[1.6,0.65],[1.95,-0.25],[2.55,-0.95],[3.4,-1.2],[5.0,-1.2]];
  const lipCurve=new THREE.CatmullRomCurve3(LIP.map(([x,y])=>new THREE.Vector3(x,y,0)));
  for(let off=-0.75;off<=0.5;off+=0.024){const edge=Math.abs(off)/0.75;const k0=0.02+edge*0.12*r(),k1=1-edge*0.1*r();addPath(LIP,off,k0,k1,0.05+0.03*r(),crest*(0.8+0.2*r()-0.35*edge),0.35,0,true);}
  // The water is a continuous, receding barrel, with surface streaks layered above it.
  // Unlike a set of isolated ribbons this wall carries both shaded volume and an open tube.
  if(volume>0)for(let rr=E0+0.1;rr<2.55;rr+=0.065){
   const st=deg2(12),end=deg2(365);
   addArc(rr,st,end,0.015,0.085,volume*wallTone*shadow*(0.95+0.3*r()),0.025,1.0,true);
  }
  // 2) inner swirl around the dark eye: a few broad arcs curling inward
  for(let rr=E0+0.12;rr<2.0;rr+=0.06+r()*0.08){const st=deg2(150+r()*80);const len=deg2(120+r()*160);addArc(rr,st,st-len,-0.12,0.07+r()*0.1,shadow*(0.7+0.65*r()),0.18/rr,1.08);}
  // A folded inner sheet leads the eye around the barrel. Its asymmetric lip is a
  // continuous curl, rather than concentric rings that suggest a rigid tunnel.
  const cx=ctx.num('foldX',1.1,-2,4)-0.95,cy=ctx.num('foldY',1.95,0,5)-2.22;
  const CURL:[number,number][]=[[-0.9+cx,2.05+cy],[-1.65+cx,2.1+cy],[-2.45+cx,1.65+cy],[-2.7+cx,1.05+cy],[-2.35+cx,0.3+cy],[-1.7+cx,-0.35+cy],[-0.9+cx,-0.75+cy]];
  for(let i=0;i<5;i++)addPath(CURL,(i-2)*0.03,0.015+r()*0.08,0.86+r()*0.14,0.035+r()*0.025,crest*(0.65+0.2*r()),0.3);
  // 2b) outer barrel: wide elliptical arcs sweeping from the upper left round under the eye
  for(let rr=2.0;rr<3.4;rr+=0.08+r()*0.1){let a=deg2(165+r()*20);const end=deg2(300+r()*25);while(a<end){const seg=deg2(20+r()*60);addArc(rr,a,Math.min(end,a+seg),0.0,0.03+r()*0.05,shadow*(0.5+0.6*r()),0.04,0.72);a+=seg+deg2(3+r()*10);}}
  // 3) FACE streaks: long dashed lines from the upper-left shoulder sweeping down-right under the eye
  const FACE:[number,number][]=[[-6.6,0.7],[-4.6,-0.35],[-2.7,-1.25],[-1.2,-1.75],[0.2,-1.9],[1.4,-1.65],[2.3,-1.2],[3.4,-1.0]];
  if(volume>0)for(let off=-0.85;off<=2.1;off+=0.09)addPath(FACE,off,0,0.98,0.12,volume*shadow*(0.32+0.1*r()),-4.2,0,false,true);
  for(let off=-0.7;off<=2.2;off+=0.045+r()*0.06){let k=r()*0.15;const kEnd=0.75+0.25*r()-Math.max(0,off)*0.12;
   while(k<kEnd){const seg=0.06+r()*0.22,gap=0.01+r()*0.05;addPath(FACE,off*(1-0.35*k),k,Math.min(kEnd,k+seg),0.03+r()*0.065,shadow*(0.13+0.3*r()*(r()<0.25?1.8:1)),-0.3);k+=seg+gap;}}
  for(let i=0;i<3;i++)addPath(FACE,-0.35+i*0.045,0.13+r()*0.1,0.7+r()*0.27,0.055+0.035*r(),crest*(0.17+0.05*r()),-0.22);
  // 4) shoulder crest: thin bright lines at the top-left that lead into the lip
  const SH:[number,number][]=[[-6.3,1.5],[-5,1.95],[-3.6,2.25],[-2.4,2.45]];
  for(let i=0;i<9;i++)addPath(SH,-0.1+i*0.05,r()*0.3,0.7+0.3*r(),0.025+0.02*r(),0.55+0.35*r(),0.2);
  // 5) sea below the whitewater: horizontal streaks across the lower right
  const SEA:[number,number][]=[[0.8,-1.9],[2.5,-1.85],[4.2,-1.75],[5.6,-1.7]];
  for(let off=-0.9;off<=0.35;off+=0.08+r()*0.06){let k=r()*0.2;while(k<1){const seg=0.08+r()*0.3;addPath(SEA,off,k,Math.min(1,k+seg),0.025+0.03*r(),0.35+0.4*r(),0.1);k+=seg+0.02+r()*0.08;}}
  // The receding lower face continues into rippled water on the left, so the
  // barrel rises from a broad body of water rather than a detached ribbon edge.
  const LOWER:[number,number][]=[[-7.2,-0.95],[-5.7,-1.25],[-4.1,-1.75],[-2.5,-2.3],[-0.6,-2.65],[1.2,-2.65]];
  for(let off=-0.85;off<=0.8;off+=0.045+r()*0.06){let k=r()*0.12;while(k<1){const end=Math.min(1,k+0.035+r()*0.16);addPath(LOWER,off,k,end,0.02+r()*0.06,shadow*(0.25+0.38*r()),-0.1);k=end+0.008+r()*0.025;}}
  // build one merged ribbon mesh (camera-facing strips) with per-vertex colour
  let vcount=0;for(const rb of ribs)vcount+=(rb.pts.length/3)*2;
  const pos=new Float32Array(vcount*3),col=new Float32Array(vcount*3),idx:number[]=[];let v0=0;
  const base:{start:number;rb:Rib}[]=[];
  for(const rb of ribs){const n=rb.pts.length/3;base.push({start:v0,rb});for(let i=0;i<n-1;i++){const a2=v0+i*2;idx.push(a2,a2+1,a2+2,a2+1,a2+3,a2+2);}v0+=n*2;}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));geo.setAttribute('color',new THREE.BufferAttribute(col,3));geo.setIndex(idx);
  const mesh=ctx.mesh(geo,{tone:1,side:THREE.DoubleSide,rough:0.5});{const m=mesh.material as THREE.MeshStandardMaterial;m.vertexColors=true;
   m.onBeforeCompile=sh=>{sh.fragmentShader=sh.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\n totalEmissiveRadiance+=diffuseColor.rgb*0.42;');};}
  root.add(mesh);
  // 5) whitewater: boiling foam where the lip lands (lower right), and spray dots above the lip / around the shoulder
  const NF=6000,NSP=Math.round(1800*ctx.num('spray',1,0,2));const foam=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),ctx.mat({tone:0.85}),NF+NSP);foam.frustumCulled=false;
  {const fm=foam.material as THREE.MeshStandardMaterial;fm.onBeforeCompile=sh=>{sh.fragmentShader=sh.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\n totalEmissiveRadiance+=diffuseColor.rgb*0.72;');};}
  root.add(foam);const fs=Array.from({length:NF+NSP},()=>[r(),r(),r(),r(),r()]);
  const m4=new THREE.Matrix4(),q=new THREE.Quaternion(),sc=new THREE.Vector3(),p=new THREE.Vector3(),e=new THREE.Euler(),tg2=new THREE.Vector3();
  return {root:outer,grounded:false,update(c,t){
   const fl=(c.flow??1)*t;const sz=lerp(0.4,1,clamp(c.size??1));
   for(const {start,rb} of base){const n=rb.pts.length/3;const rot=-rb.spin*fl*0.6;const cr=Math.cos(rot),sr=Math.sin(rot);
    for(let i=0;i<n;i++){let x=rb.pts[i*3]!-EX,y=rb.pts[i*3+1]!-EY;const z=rb.pts[i*3+2]!;[x,y]=[x*cr-y*sr,x*sr+y*cr];
     // tangent in the picture plane for the strip width
     const j=Math.min(n-1,i+1),h=Math.max(0,i-1);const tx=rb.pts[j*3]!-rb.pts[h*3]!,ty=rb.pts[j*3+1]!-rb.pts[h*3+1]!;const tl=Math.hypot(tx,ty)||1;
     const nx=(-ty*cr-tx*sr)/tl,ny=(-ty*sr+tx*cr)/tl;const hw=rb.w[i]!*0.5;
     // keep the authored picture: scale around the design camera axis (0,3) so deeper points project where they were drawn
     const proj=(D-z)/D;const X=(EX+x)*proj*sz,Y=(3+(EY+y-3)*proj)*sz;
     const o=(start+i*2)*3;pos[o]=X+nx*hw;pos[o+1]=Y+ny*hw;pos[o+2]=z;pos[o+3]=X-nx*hw;pos[o+4]=Y-ny*hw;pos[o+5]=z;
     // brightness travelling along the streak (water flowing over the lip)
     const k=i/(n-1);const flow=0.6+0.22*Math.sin(k*rb.len*3.2-fl*4+rb.phase)+0.18*Math.sin(k*rb.len*13.9-fl*9.2+rb.phase*7);const a=Math.atan2(y,x);const wall=rb.body?(0.42+0.58*Math.pow(0.5+0.5*Math.sin(a-0.55),2))*(0.8+0.2*Math.sin(k*rb.len*5.7-fl*2.8)):1;const lipLight=rb.lip?0.48+0.95*Math.pow(k,0.7):1;const v=gain*rb.tone*flow*wall*lipLight;col[o]=col[o+1]=col[o+2]=v;col[o+3]=col[o+4]=col[o+5]=v;}}
   geo.attributes.position!.needsUpdate=true;geo.attributes.color!.needsUpdate=true;geo.computeVertexNormals();
   for(let k=0;k<NF+NSP;k++){const s2=fs[k]!;
    if(k<NF){ // whitewater: fine dense droplets boiling along the lower part of the lip, thickest where it lands
     const kk=0.67+0.33*s2[0]!;lipCurve.getPointAt(kk,p);const life=(s2[2]!+fl*0.35)%1;
     const spread=0.3+2.2*s2[1]!*Math.pow((kk-0.5)*2,1.2);p.set((EX+p.x-offsetX+(s2[3]!-0.5)*spread*1.6)*sz,(2.22+p.y-fall*(0.7+0.4*life)+(s2[4]!-0.5)*spread+Math.sin(life*6.28+k)*0.05)*sz,0.45);sc.setScalar(0.04+0.04*s2[3]!);}
    else{ // spray: sparse droplets drifting off the lip's outer edge and the shoulder
     const kk=s2[0]!*0.9;lipCurve.getPointAt(kk,p);const life=(s2[2]!+fl*0.3)%1;const d2=0.3+s2[1]!*1.1+life*0.3;
     lipCurve.getTangentAt(kk,tg2);p.set((EX+p.x-offsetX+tg2.y*d2+(s2[3]!-0.5)*0.4)*sz,(2.22+p.y-tg2.x*d2)*sz,0.3);sc.setScalar((0.025+0.02*s2[3]!)*(1-life*0.6));}
    e.set(k,fl+k,0);q.setFromEuler(e);m4.compose(p,q,sc);foam.setMatrixAt(k,m4);}
   foam.instanceMatrix.needsUpdate=true;
  }};
 },
});


// ================================================================= ocean wave (barrel)
const layeredCurlWave=defineModel({
 id:'curl-wave',aliases:['breaking-wave','barrel-wave','big-wave','surf-wave','tube-wave','making-waves','ocean-wave','wave'],
 describe:'A huge breaking ocean wave seen from the front-side like a surf photo: hundreds of water streaks rise up the face, a thick bright lip throws over the top and pours down the right into boiling whitewater, inner streaks ring a dark hollow eye (the tube). Front view: camera pos [0,3,10] look [0,3,0] fov 34 frames it like the classic barrel shot. Water flows continuously; `size` grows the wave.',
 controls:{size:'0 small .. 1 full (default 1)',flow:'water speed (default 1)'},defaults:{size:1,flow:1},params:{mirror:'true: wave breaks to the left',eye:'eye radius m (default 0.62)'},size:'10 m wide, 6 m tall',
 build(ctx){
  // Streamline construction: the wave is a family of thin water ribbons laid out around the tube's eye.
  // Authored in the picture plane of a camera at z=+D (x right, y up) and pushed into depth with projection compensation,
  // so the front view reproduces the classic barrel photo while the geometry stays genuinely 3D (inner rings recede).
  const outer=new THREE.Group();const root=new THREE.Group();outer.add(root);if(ctx.bool('mirror',false))root.scale.x=-1;
  const r=rng(ctx.seed+17);const D=10,EX=ctx.num('eyeX',0.95,-2,4),EY=ctx.num('eyeY',2.57,0,5),E0=ctx.num('eye',0.62,0.2,2);
  const waterGain=ctx.num('waterGain',1,0.1,3),lipGain=ctx.num('lipGain',1,0.1,3),faceGain=ctx.num('faceGain',1,0.1,3),tubeGain=ctx.num('tubeGain',1,0.1,3),emission=ctx.num('emission',0.6,0,2),foamEmission=ctx.num('foamEmission',0.55,0,2),foamGain=ctx.num('foamGain',1,0.1,2),foamSize=ctx.num('foamSize',1,0.3,2),streakWidth=ctx.num('streakWidth',1,0.5,3),lipShading=ctx.num('lipShading',ctx.str<'layered'|'hybrid'|'barrel'>('form','layered')==='hybrid'?1:0,0,1);
  interface Rib {pts:number[];w:number[];tone:number;phase:number;spin:number;len:number;bright:number;region:'lip'|'tube'|'face'}
  const ribs:Rib[]=[];
  // depth of a point at distance rr from the eye: the tube recedes toward the eye, the lip comes forward
  const depth=(rr:number)=>-3.2*Math.exp(-(rr-E0)/0.9)+0.4*clamp((rr-1.9)/0.8);
  const deg2=(d:number)=>d*Math.PI/180;
  const addArc=(r0:number,a0:number,a1:number,grow:number,width:number,tone:number,spin:number,squash=1.0)=>{
   const N=Math.max(24,Math.round(Math.abs(a1-a0)*r0*16));const pts:number[]=[],w:number[]=[];
   for(let i=0;i<=N;i++){const k=i/N;const a=lerp(a0,a1,k);const rr=r0*(1+grow*k);pts.push(EX+Math.cos(a)*rr,EY+Math.sin(a)*rr*squash,depth(rr));w.push(width*(0.55+0.45*Math.sin(Math.PI*clamp(k*1.15))));}
   ribs.push({pts,w,tone,phase:r()*20,spin,len:Math.abs(a1-a0)*r0,bright:0,region:'tube'});};
  /** Smooth curve through control points (relative to the eye), offset sideways by `off`, cut to [k0,k1]. */
  const addPath=(ctrl:[number,number][],off:number,k0:number,k1:number,width:number,tone:number,z:number,spin=0,region:'lip'|'tube'|'face'='face')=>{
   const curve=new THREE.CatmullRomCurve3(ctrl.map(([x,y])=>new THREE.Vector3(x,y,0)));const L=curve.getLength();const N=Math.max(8,Math.round(L*(k1-k0)*18));const pts:number[]=[],w:number[]=[];
   const pt=new THREE.Vector3(),tg=new THREE.Vector3();
   for(let i=0;i<=N;i++){const k=lerp(k0,k1,i/N);curve.getPointAt(k,pt);curve.getTangentAt(k,tg);const x=pt.x-tg.y*off,y=pt.y+tg.x*off;pts.push(EX+x,EY+y,z+depth(Math.hypot(x,y))*0.25);w.push(width*(0.6+0.4*Math.sin(Math.PI*clamp((i/N)*1.1))));}
   ribs.push({pts,w,tone,phase:r()*20,spin,len:L*(k1-k0),bright:0,region});};
  // 1) the LIP: a thick bright band (many overlapping ribbons) - flat across the top, rounding down the right side, then running out right as whitewater
  const LIP:[number,number][]=[[-3.4,2.2],[-2.1,2.6],[-0.9,2.62],[0.15,2.3],[1.05,1.6],[1.6,0.65],[1.95,-0.25],[2.55,-0.95],[3.4,-1.2],[5.0,-1.2]];
  const lipCurve=new THREE.CatmullRomCurve3(LIP.map(([x,y])=>new THREE.Vector3(x,y,0)));
  for(let off=-0.75;off<=0.5;off+=0.024){const edge=Math.abs(off)/0.75;const k0=0.02+edge*0.12*r(),k1=1-edge*0.1*r();addPath(LIP,off,k0,k1,0.05+0.03*r(),(0.8+0.2*r()-0.25*edge)*lerp(1,0.2+0.8*Math.pow(clamp((off+0.65)/1.15),3),lipShading),0.35,0,'lip');}
  // 2) inner swirl around the dark eye: a few broad arcs curling inward
  for(let rr=E0+0.12;rr<2.0;rr+=0.06+r()*0.08){const st=deg2(150+r()*80);const len=deg2(120+r()*160);addArc(rr,st,st-len,-0.12,0.07+r()*0.1,0.5+0.5*r(),0.3/rr,1.08);}
  // 2b) outer barrel: wide elliptical arcs sweeping from the upper left round under the eye
  for(let rr=2.0;rr<3.4;rr+=0.08+r()*0.1){let a=deg2(165+r()*20);const end=deg2(300+r()*25);while(a<end){const seg=deg2(20+r()*60);addArc(rr,a,Math.min(end,a+seg),0.0,0.03+r()*0.05,0.35+0.45*r(),0.06,0.72);a+=seg+deg2(3+r()*10);}}
  // 3) FACE streaks: long dashed lines from the upper-left shoulder sweeping down-right under the eye
  const FACE:[number,number][]=[[-6.6,0.7],[-4.6,-0.35],[-2.7,-1.25],[-1.2,-1.75],[0.2,-1.9],[1.4,-1.65],[2.3,-1.2],[3.4,-1.0]];
  for(let off=-0.7;off<=2.2;off+=0.06+r()*0.08){let k=r()*0.15;const kEnd=0.75+0.25*r()-Math.max(0,off)*0.12;
   while(k<kEnd){const seg=0.06+r()*0.22,gap=0.01+r()*0.05;addPath(FACE,off*(1-0.35*k),k,Math.min(kEnd,k+seg),0.02+r()*0.05,0.25+0.5*r()*(r()<0.25?1.6:1),-0.3);k+=seg+gap;}}
  // 4) shoulder crest: thin bright lines at the top-left that lead into the lip
  const SH:[number,number][]=[[-6.3,1.5],[-5,1.95],[-3.6,2.25],[-2.4,2.45]];
  for(let i=0;i<9;i++)addPath(SH,-0.1+i*0.05,r()*0.3,0.7+0.3*r(),0.025+0.02*r(),0.55+0.35*r(),0.2,0,'lip');
  // 5) sea below the whitewater: horizontal streaks across the lower right
  const SEA:[number,number][]=[[0.8,-1.9],[2.5,-1.85],[4.2,-1.75],[5.6,-1.7]];
  for(let off=-0.9;off<=0.35;off+=0.08+r()*0.06){let k=r()*0.2;while(k<1){const seg=0.08+r()*0.3;addPath(SEA,off,k,Math.min(1,k+seg),0.025+0.03*r(),0.35+0.4*r(),0.1);k+=seg+0.02+r()*0.08;}}
  // build one merged ribbon mesh (camera-facing strips) with per-vertex colour
  let vcount=0;for(const rb of ribs)vcount+=(rb.pts.length/3)*2;
  const pos=new Float32Array(vcount*3),col=new Float32Array(vcount*3),idx:number[]=[];let v0=0;
  const base:{start:number;rb:Rib}[]=[];
  for(const rb of ribs){const n=rb.pts.length/3;base.push({start:v0,rb});for(let i=0;i<n-1;i++){const a2=v0+i*2;idx.push(a2,a2+1,a2+2,a2+1,a2+3,a2+2);}v0+=n*2;}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));geo.setAttribute('color',new THREE.BufferAttribute(col,3));geo.setIndex(idx);
  const mesh=ctx.mesh(geo,{tone:1,side:THREE.DoubleSide,rough:0.5});{const m=mesh.material as THREE.MeshStandardMaterial;m.vertexColors=true;
   m.onBeforeCompile=sh=>{sh.fragmentShader=sh.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>\n totalEmissiveRadiance+=diffuseColor.rgb*${emission.toFixed(5)};`);};m.customProgramCacheKey=()=>`layered-wave-water:${emission.toFixed(5)}`;}
  root.add(mesh);
  // 5) whitewater: boiling foam where the lip lands (lower right), and spray dots above the lip / around the shoulder
  const NF=5000,NSP=1400;const foam=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),ctx.mat({tone:0.8*foamGain}),NF+NSP);foam.frustumCulled=false;
  {const fm=foam.material as THREE.MeshStandardMaterial;fm.onBeforeCompile=sh=>{sh.fragmentShader=sh.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>\n totalEmissiveRadiance+=diffuseColor.rgb*${foamEmission.toFixed(5)};`);};fm.customProgramCacheKey=()=>`layered-wave-foam:${foamEmission.toFixed(5)}`;}
  root.add(foam);const fs=Array.from({length:NF+NSP},()=>[r(),r(),r(),r(),r()]);
  const m4=new THREE.Matrix4(),q=new THREE.Quaternion(),sc=new THREE.Vector3(),p=new THREE.Vector3(),e=new THREE.Euler(),tg2=new THREE.Vector3();
  return {root:outer,grounded:false,update(c,t){
   const fl=(c.flow??1)*t;const sz=lerp(0.4,1,clamp(c.size??1));
   for(const {start,rb} of base){const n=rb.pts.length/3;const rot=-rb.spin*fl*0.6;const cr=Math.cos(rot),sr=Math.sin(rot);
    for(let i=0;i<n;i++){let x=rb.pts[i*3]!-EX,y=rb.pts[i*3+1]!-EY;const z=rb.pts[i*3+2]!;[x,y]=[x*cr-y*sr,x*sr+y*cr];
     // tangent in the picture plane for the strip width
     const j=Math.min(n-1,i+1),h=Math.max(0,i-1);const tx=rb.pts[j*3]!-rb.pts[h*3]!,ty=rb.pts[j*3+1]!-rb.pts[h*3+1]!;const tl=Math.hypot(tx,ty)||1;
     const nx=-ty/tl,ny=tx/tl;const hw=rb.w[i]!*0.5*(rb.region==='lip'?1:streakWidth);
     // keep the authored picture: scale around the design camera axis (0,3) so deeper points project where they were drawn
     const proj=(D-z)/D;const X=(EX+x)*proj*sz,Y=(3+(EY+y-3)*proj)*sz;
     const o=(start+i*2)*3;pos[o]=X+nx*hw;pos[o+1]=Y+ny*hw;pos[o+2]=z;pos[o+3]=X-nx*hw;pos[o+4]=Y-ny*hw;pos[o+5]=z;
     // brightness travelling along the streak (water flowing over the lip)
     const k=i/(n-1);const flow=0.6+0.22*Math.sin(k*rb.len*3.2-fl*4+rb.phase)+0.18*Math.sin(k*rb.len*13.9-fl*9.2+rb.phase*7);const v=rb.tone*flow*waterGain*(rb.region==='lip'?lipGain:rb.region==='tube'?tubeGain:faceGain);col[o]=col[o+1]=col[o+2]=v;col[o+3]=col[o+4]=col[o+5]=v;}}
   geo.attributes.position!.needsUpdate=true;geo.attributes.color!.needsUpdate=true;geo.computeVertexNormals();
   for(let k=0;k<NF+NSP;k++){const s2=fs[k]!;
    if(k<NF){ // whitewater: fine dense droplets boiling along the lower part of the lip, thickest where it lands
     const kk=0.55+0.45*s2[0]!;lipCurve.getPointAt(kk,p);const life=(s2[2]!+fl*0.35)%1;
     const spread=0.3+2.2*s2[1]!*Math.pow((kk-0.5)*2,1.2);p.set((EX+p.x+(s2[3]!-0.5)*spread*1.6)*sz,(EY+p.y+(s2[4]!-0.5)*spread+Math.sin(life*6.28+k)*0.05)*sz,0.45);sc.setScalar((0.04+0.04*s2[3]!)*foamSize);}
    else{ // spray: sparse droplets drifting off the lip's outer edge and the shoulder
     const kk=s2[0]!*0.9;lipCurve.getPointAt(kk,p);const life=(s2[2]!+fl*0.3)%1;const d2=0.3+s2[1]!*1.1+life*0.3;
     lipCurve.getTangentAt(kk,tg2);p.set((EX+p.x+tg2.y*d2+(s2[3]!-0.5)*0.4)*sz,(EY+p.y-tg2.x*d2)*sz,0.3);sc.setScalar((0.025+0.02*s2[3]!)*(1-life*0.6));}
    e.set(k,fl+k,0);q.setFromEuler(e);m4.compose(p,q,sc);foam.setMatrixAt(k,m4);}
   foam.instanceMatrix.needsUpdate=true;
  }};
 },
});



// A source wave is one editable preset of the reusable surface/foam system.
// All dimensions, section curves, timing and materials stay here or in params;
// fluid-surface.ts contains no reference-camera, palette, shot or wave assumptions.
const sculptedCurlWave=defineModel({
 id:'curl-wave',describe:'Editable continuous curling water sheet with a real sheared opening, rolled crest, swept relief and surface-bound foam.',
 controls:{size:'overall growth',flow:'procedural water flow rate',break:'0..1 manual breaking phase; omit for timed break'},defaults:{size:1,flow:1},
 params:{outerProfile:'2D front-section crest control points, metres',crestDelta:'per-point crest displacement as it breaks, metres',foldProfile:'fold ridge spline control points, metres',openingX:'opening centre across the front section',openingY:'opening centre height in the front section',openingWidth:'opening horizontal radius',openingHeight:'opening vertical radius',openingShear:'upper/lower opening shear',closingTravel:'opening travel as it closes',closingAmount:'closure strength',breakStart:'break start seconds',breakEnd:'break end seconds',breakPower:'break acceleration',barrelDepth:'continuous sheet recession',crestWidth:'rolled lip width',crestDepth:'rolled lip depth',surfaceRipple:'fine moving swept relief depth',foldHeight:'integrated fold ridge depth',waterTone:'neutral sparse-water albedo',innerTone:'neutral inner-wall albedo',crestTone:'neutral crest foam albedo',foldTone:'neutral thin-fold foam albedo',foamSpread:'landing field spread',foamCount:'surface-bound foam population',sprayCount:'curvature-bound spray population',foamAdvance:'landing foam travel toward the barrel',foamTone:'neutral foam albedo'},
 build(ctx){
  const root=new THREE.Group();if(ctx.bool('mirror',false))root.scale.x=-1;
  const profile=(key:string,fallback:number[][])=>{const p=ctx.params[key];return Array.isArray(p)&&p.length>2&&p.every(v=>Array.isArray(v)&&v.length>=2&&Number.isFinite(v[0])&&Number.isFinite(v[1]))?p.map(v=>[Number(v[0]),Number(v[1])]):fallback;};
  const crestBase=profile('outerProfile',[[-6,1.05],[-3.45,1.58],[-1.65,2.15],[.15,2.13],[1.75,1.57],[2.6,.58],[3.15,-.8],[4.25,-1.16],[5.65,-1.30]]);
  const crestDelta=profile('crestDelta',[[0,0],[0,0],[0,0],[0,0],[-.24,-.45],[-.77,-.73],[-1.45,.12],[0,0],[0,0]]);
  const foldBase=profile('foldProfile',[[.15,1],[-.38,.99],[-1.15,.68],[-1.51,.23],[-1.28,-.32],[-.65,-.95],[.16,-1.4]]);
  const center=new THREE.Vector3(-.05,3.27,0),R=new THREE.Vector3(.99715,0,.07545),U=new THREE.Vector3(-.00175,.99973,.0231),N=new THREE.Vector3(-.07543,.02317,.99688),D=9.93;
  const project=(u:number,v:number,z:number,out:THREE.Vector3)=>out.copy(center).addScaledVector(R,u*(D-z)/D).addScaledVector(U,v*(D-z)/D).addScaledVector(N,z);
  const eyeX=ctx.num('openingX',1.15,-1,3),eyeY=ctx.num('openingY',-.76,-2,1),rx0=ctx.num('openingWidth',.8,.3,1.5),ry0=ctx.num('openingHeight',.69,.2,1.3),shear=ctx.num('openingShear',.46,-1,1),travel=ctx.num('closingTravel',.68,0,1.5),closing=ctx.num('closingAmount',1,0,1.5);
  const begin=ctx.num('breakStart',.55,0,5),end=Math.max(begin+.1,ctx.num('breakEnd',2.53,.1,10)),power=ctx.num('breakPower',2.25,.5,5),depth=ctx.num('barrelDepth',3.2,.5,6),width=ctx.num('crestWidth',.46,.12,1.2),crestDepth=ctx.num('crestDepth',.72,.05,1.8),ripple=ctx.num('surfaceRipple',.025,0,.12),foldHeight=ctx.num('foldHeight',.28,0,.7);
  const waterTone=ctx.num('waterTone',.14,.02,1),innerTone=ctx.num('innerTone',.46,.05,1),crestTone=ctx.num('crestTone',1.2,.2,2),foldTone=ctx.num('foldTone',.85,.1,2),foamSpread=ctx.num('foamSpread',1,.4,1.8),foamAdvance=ctx.num('foamAdvance',1.4,0,2.2);
  let manual=-1,size=1;type State={p:number;q:number;cx:number;cy:number;rx:number;ry:number;polygon:number[][];fold:number[][];outer:Map<number,{x:number;y:number;crest:boolean}>};const states=new Map<number,State>();
  const state=(t:number)=>{let s=states.get(t);if(s)return s;const p=clamp((t-begin)/(end-begin)),q=(manual>=0?clamp(manual):Math.pow(p,power))*closing,crest=crestBase.map(([x,y],i)=>[x!+(crestDelta[i]?.[0]??0)*q,y!+(crestDelta[i]?.[1]??0)*q]);const curve=new THREE.CatmullRomCurve3(crest.map(([x,y])=>new THREE.Vector3(x,y,0))),polygon=Array.from({length:65},(_,i)=>{const p=curve.getPointAt(i/64);return[p.x,p.y];});polygon.push([6,-3.4],[-6,-3.4]);s={p,q,cx:eyeX-travel*q,cy:eyeY-.025*p,rx:rx0*(1-.35*q),ry:ry0*(1-.58*q),polygon,fold:foldBase.map(([x,y],i)=>[x!-(i>3?(i-3)/3*.3*q:0),y!]),outer:new Map()};states.set(t,s);return s;};
  const boundary=(u:number,s:State)=>{u=((u%1)+1)%1;let p=s.outer.get(u);if(p)return p;const a=u*Math.PI*2,dx=s.rx*Math.cos(a)-shear*s.ry*Math.sin(a),dy=s.ry*Math.sin(a);let reach=100,edge=0;for(let k=0;k<s.polygon.length;k++){const A=s.polygon[k]!,B=s.polygon[(k+1)%s.polygon.length]!,ex=B[0]!-A[0]!,ey=B[1]!-A[1]!,cross=dx*ey-dy*ex;if(Math.abs(cross)<1e-8)continue;const ax=A[0]!-s.cx,ay=A[1]!-s.cy,tt=(ax*ey-ay*ex)/cross,ss=(ax*dy-ay*dx)/cross;if(tt>0&&ss>=0&&ss<=1&&tt<reach){reach=tt;edge=k;}}p={x:s.cx+dx*reach,y:s.cy+dy*reach,crest:edge<64};s.outer.set(u,p);return p;};
  const segmentDistance=(x:number,y:number,a:number[],b:number[])=>{const dx=b[0]!-a[0]!,dy=b[1]!-a[1]!,k=clamp(((x-a[0]!)*dx+(y-a[1]!)*dy)/(dx*dx+dy*dy));return Math.hypot(x-a[0]!-k*dx,y-a[1]!-k*dy);};
  let last={u:NaN,v:NaN,t:NaN,x:0,y:0,z:0,tone:0};
  const field=(u:number,v:number,t:number)=>{if(last.u===u&&last.v===v&&last.t===t)return last;const s=state(t),a=u*Math.PI*2,sa=Math.sin(a),ca=Math.cos(a),lower=(1-sa)*.5,neck=1-.65*s.q*lower*lower,ix=s.cx+s.rx*neck*ca-shear*s.ry*sa-.30*s.q*lower*lower,iy=s.cy+s.ry*sa,outer=boundary(u,s),x=lerp(ix,outer.x,v),y=lerp(iy,outer.y,v),edgeDistance=Math.hypot(outer.x-x,outer.y-y),lipWidth=width*(1+.8*s.q)*(outer.x>1?1.7:1),roll=outer.crest?Math.exp(-Math.pow((edgeDistance-lipWidth*.45)/(lipWidth*.35),2)):0;
   let fd=100;for(let k=0;k<s.fold.length-1;k++)fd=Math.min(fd,segmentDistance(x,y,s.fold[k]!,s.fold[k+1]!));const ridge=Math.exp(-Math.pow(fd/.14,2)),distanceFromEye=Math.hypot(x-ix,y-iy),wave=ripple*(.65*Math.sin(distanceFromEye*24-a*4-t*6.5)+.3*Math.sin(distanceFromEye*43+a*7.3-t*9.7)+.25*Math.sin(x*11+y*4+t*3));
   const z=-depth*Math.exp(-v*4.7)+crestDepth*roll+foldHeight*ridge+wave*Math.sin(Math.PI*v),inner=Math.exp(-Math.pow(distanceFromEye/1.6,2)),base=lerp(waterTone,innerTone,inner),tone=lerp(lerp(base,crestTone,roll),foldTone,ridge*.9);last={u,v,t,x,y,z,tone};return last;};
  const water=createFluidSurface({uSegments:256,vSegments:112,periodicU:true,flipNormals:true,thickness:ctx.num('sheetThickness',.035,0,.2),sample(u,v,t,out){const f=field(u,v,t);project(f.x*size,f.y*size,f.z,out);},color(u,v,t,_p,out){out.setScalar(field(u,v,t).tone);}});
  const material=ctx.mat({tone:1,rough:.62,side:THREE.DoubleSide});material.vertexColors=true;const mesh=new THREE.Mesh(water.geometry,material);mesh.frustumCulled=false;root.add(mesh);
  // A second parametric sheet is an emitter guide for the landing fan. Its
  // attached droplets move with sampled surface flow; no screen-space sprites.
  const apron=createFluidSurface({uSegments:48,vSegments:20,flipNormals:true,sample(u,v,t,out){const s=state(t),start=2.85-foamAdvance*s.q-1.05*s.q*v*v,x=lerp(start,6.1,u),top=lerp(-1.04+.35*s.q,-1.38,u),spread=(.55+.7*Math.sqrt(u))*foamSpread,y=top-v*spread*1.65+.035*Math.sin(u*36+v*12-t*5),z=.45+.12*Math.sin(u*12+v*8-t*3);project(x*size,y*size,z,out);}});
  const foamMaterial=ctx.mat({tone:ctx.num('foamTone',1,.2,1),rough:.82});foamMaterial.onBeforeCompile=sh=>{sh.fragmentShader=sh.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\n totalEmissiveRadiance+=diffuseColor.rgb*0.22;');};
  const foam=createFluidFoam({surface:apron,count:ctx.num('foamCount',5200,500,15000),seed:ctx.seed+261,material:foamMaterial,seedUV:(s,out)=>out.set(s.random[2]!,Math.pow(s.random[3]!,1.5)),flow:(_u,_v,_t,out)=>out.set(.16,0),size:[.024,.055],lifetime:[.8,1.7],normalOffset:.05,spread:.07});root.add(foam.mesh);
  const spray=createFluidFoam({surface:water,count:ctx.num('sprayCount',650,0,4000),seed:ctx.seed+431,material:foamMaterial,seedUV:(s,out)=>out.set(.025+s.random[2]!*.42,.98),flow:(_u,_v,_t,out)=>out.set(-.035,.02),size:[.012,.028],lifetime:[.2,.48],spray:.75,gravity:4.5,normalOffset:.035,bendThreshold:ctx.num('sprayBend',.4,0,4)});root.add(spray.mesh);
  return{root,grounded:false,update(c,t){manual=c.break??-1;size=lerp(.4,1,clamp(c.size??1));const time=t*(c.flow??1);states.clear();last.t=NaN;water.update(time);apron.update(time);foam.update(time);spray.update(time);}};
 },
});

// Rolled open water sheet swept through depth. The visible tube is created by
// folding/overhang and foreground water, rather than a hole cut in a front sheet.
const rolledCurlWave=defineModel({
 id:'curl-wave',describe:'An editable C-section breaker swept through depth, with a real overhanging lip, sea swell and surface-emitted landing foam.',
 controls:{size:'growth',flow:'water flow',break:'optional0..1 manual break phase'},defaults:{size:1,flow:1},
 params:{sections:'optional authored grid points[v*uCount+u], xyz metres',uCount:'authored grid width',vCount:'authored grid depth',frontProfile:'editable front C-section xy control points',barrelLength:'sheet depth length',backCenterX:'deep barrel axis x',backCenterY:'deep barrel axis y',backWidth:'deep C-section radius x',backHeight:'deep C-section radius y',backShear:'deep C-section shear',closingTravel:'late deep-axis travel',closingAmount:'breaker closure amount',breakStart:'break start',breakEnd:'break end',surfaceRipple:'swept normal relief depth',waterTone:'neutral water albedo',crestTone:'neutral foamy lip albedo',innerTone:'neutral inner-water albedo',foamCount:'surface-bound foam population',sprayCount:'lip-emitted spray population'},
 build(ctx){
  const root=new THREE.Group();if(ctx.bool('mirror',false))root.scale.x=-1;
  const pairs=(key:string,fallback:number[][])=>{const a=ctx.params[key];return Array.isArray(a)&&a.length>3&&a.every(p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(p[0])&&Number.isFinite(p[1]))?a.map(p=>[Number(p[0]),Number(p[1])]):fallback;};
  const front=pairs('frontProfile',[[-8,.05],[-4.5,.15],[-3,.3],[-3,1.1],[-2.6,2.5],[-2,3.7],[-1.7,4.7],[-1.3,5.2],[-.6,5.3],[.3,5.2],[1.2,4.9],[2,4.4],[2.7,3.6],[3.1,2.6],[3.3,1.6],[3.4,.4]]);
  const length=ctx.num('barrelLength',6,2,12),frontZ=ctx.num('frontDepth',1,-2,3),backX=ctx.num('backCenterX',1.9,-1,4),backY=ctx.num('backCenterY',1.9,.5,4),rx=ctx.num('backWidth',1.15,.4,2),ry=ctx.num('backHeight',.9,.2,2),shear=ctx.num('backShear',.5,-1,1),travel=ctx.num('closingTravel',1.05,0,2),strength=ctx.num('closingAmount',1,0,1.4),begin=ctx.num('breakStart',.55,0,4),end=Math.max(begin+.1,ctx.num('breakEnd',2.53,.2,8));
  const ripple=ctx.num('surfaceRipple',.018,0,.1),waterTone=ctx.num('waterTone',.19,.02,1),innerTone=ctx.num('innerTone',.42,.05,1),crestTone=ctx.num('crestTone',1,.1,2),nu=40,nv=7;let manual=-1,size=1;type State={q:number;points:THREE.Vector3[];sample:ReturnType<typeof controlGridFluidSampler>};const cache=new Map<number,State>();
  const authored=ctx.params.sections;const authoredU=Math.round(ctx.num('uCount',nu,2,80)),authoredV=Math.round(ctx.num('vCount',nv,2,30));
  const state=(t:number)=>{let s=cache.get(t);if(s)return s;const p=clamp((t-begin)/(end-begin)),q=(manual>=0?clamp(manual):Math.pow(p,2.25))*strength,points:THREE.Vector3[]=[];
   if(Array.isArray(authored)&&authored.length===authoredU*authoredV&&authored.every(p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite))){for(const p of authored)points.push(new THREE.Vector3(Number(p[0]),Number(p[1]),Number(p[2])));s={q,points,sample:controlGridFluidSampler({points,uCount:authoredU,vCount:authoredV})};cache.set(t,s);return s;}
   for(let j=0;j<nv;j++){
    const d=j/(nv-1),f=Math.pow(d,.78),z=frontZ-length*d,cx=backX-travel*q,cy=backY-.08*q,rrx=rx*(1-.3*q),rry=ry*(1-.58*q),sh=shear-.6*q,tailY=lerp(.05,4.8,d),section:THREE.Vector3[]=[];
    for(let k=0;k<front.length;k++){
     let bx:number,by:number;if(k===0){bx=-8;by=tailY;}else if(k===1){bx=-3.5;by=lerp(.15,2.5,d);}else{const theta=(225-(k-2)/(front.length-3)*(270+65*q))*Math.PI/180;bx=cx+rrx*Math.cos(theta)-sh*rry*Math.sin(theta);by=cy+rry*Math.sin(theta);}
     const edge=clamp((k-9)/(front.length-10)),fx=front[k]![0]!-1.9*q*edge*edge,fy=front[k]![1]!+1.85*q*Math.pow(edge,3)-.75*q*Math.sin(Math.PI*edge);
     section.push(new THREE.Vector3(lerp(fx,bx,f),lerp(fy,by,f),z));
    }
    const curve=new THREE.CatmullRomCurve3(section);for(let i=0;i<nu;i++)points.push(curve.getPointAt(i/(nu-1)));
   }
   s={q,points,sample:controlGridFluidSampler({points,uCount:nu,vCount:nv})};cache.set(t,s);return s;
  };
  const radius=new THREE.Vector3();
  const shape=(u:number,v:number,t:number,out:THREE.Vector3)=>{state(t).sample(u,v,t,out);radius.set(out.x-lerp(.3,backX,v),out.y-lerp(2.6,backY,v),0);if(u<.2)radius.set(-.15,.8,.6);radius.normalize();
   const phase=u*140+v*18+.5*Math.sin(v*8)-t*4.2,relief=ripple*(Math.sin(phase)+.28*Math.sin(u*337-v*35+t*7.1));
   const foldU=ctx.num('foldU',.49,.2,.8)+ctx.num('foldSweep',.2,-.3,.4)*v+.018*Math.sin(v*5+t*.4),fold=ctx.num('foldDepth',.18,0,.5)*Math.exp(-Math.pow((u-foldU)/.012,2))*Math.sin(Math.PI*clamp((v+.12)/1.2));
   out.addScaledVector(radius,relief+fold).multiplyScalar(size);
  };
  const surface=createFluidSurface({uSegments:320,vSegments:96,thickness:ctx.num('sheetThickness',.06,0,.2),sample:shape,color(u,v,t,_p,out){const frontLip=Math.exp(-Math.pow((v-.08)/.28,2))*Math.exp(-Math.pow((u-.65)/.22,4)),inside=Math.pow(v,1.5),tone=lerp(lerp(waterTone,innerTone,inside),crestTone,frontLip);out.setScalar(tone);}});
  const mat=ctx.mat({tone:1,rough:.58,side:THREE.DoubleSide});mat.vertexColors=true;const mesh=new THREE.Mesh(surface.geometry,mat);mesh.name='rolled-water-sheet';mesh.frustumCulled=false;root.add(mesh);
  const sea=createFluidSurface({uSegments:72,vSegments:36,flipNormals:true,sample(u,v,t,out){const x=lerp(-8,7,u),z=lerp(frontZ-length,3,v),swell=1.15*Math.exp(-Math.pow((x-1.2)/3,2))*clamp((-z+1)/6),y=.06+swell+.028*Math.sin(x*13+z*9-t*4);out.set(x*size,y*size,z*size);}});const seaMesh=ctx.mesh(sea.geometry,{tone:waterTone,rough:.7,side:THREE.DoubleSide});seaMesh.name='breaker-ground-swell';seaMesh.frustumCulled=false;root.add(seaMesh);
  const sourcePoint=new THREE.Vector3();const apron=createFluidSurface({uSegments:40,vSegments:24,flipNormals:true,sample(u,v,t,out){const q=state(t).q;shape(ctx.num('foamSourceU',.86,.65,1),0,t,sourcePoint);const x=lerp(sourcePoint.x-.35,6.3,u)-1.2*q*v*v*(1-u),y=sourcePoint.y-.45-v*(1.3+.45*u)+.03*Math.sin(u*25+v*9-t*4),z=lerp(sourcePoint.z+.25,1.6,u)+.08*Math.sin(u*13+v*11-t*3);out.set(x,y,z);}});
  const foamMat=ctx.mat({tone:ctx.num('foamTone',1,.2,2),rough:.8});const foamEmission=ctx.num('foamEmission',.55,0,1);foamMat.onBeforeCompile=s=>{s.fragmentShader=s.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>\n totalEmissiveRadiance+=diffuseColor.rgb*${foamEmission};`);};
  const foam=createFluidFoam({surface:apron,count:ctx.num('foamCount',6000,500,15000),seed:ctx.seed+725,material:foamMat,seedUV:(s,out)=>out.set(s.random[2]!,Math.pow(s.random[3]!,1.4)),flow:(_u,_v,_t,out)=>out.set(.16,0),size:[.025,.055],lifetime:[.8,1.7],spread:.065,normalOffset:.06});root.add(foam.mesh);
  const crestFoam=createFluidFoam({surface,count:ctx.num('crestFoamCount',6500,0,18000),seed:ctx.seed+817,material:foamMat,seedUV:(s,out)=>out.set(.56+s.random[2]!*.39,Math.pow(s.random[3]!,1.6)*ctx.num('crestFoamWidth',.22,.03,.5)),flow:(_u,_v,_t,out)=>out.set(.025,.015),size:[.045*ctx.num('crestFoamSize',1,.3,2),.085*ctx.num('crestFoamSize',1,.3,2)],lifetime:[.65,1.4],spread:.035,normalOffset:ctx.num('crestFoamOffset',-.11,-.3,.3)});root.add(crestFoam.mesh);
  const spray=createFluidFoam({surface,count:ctx.num('sprayCount',650,0,3000),seed:ctx.seed+919,material:foamMat,seedUV:(s,out)=>out.set(.45+s.random[2]!*.42,s.random[3]!*.12),flow:(_u,_v,_t,out)=>out.set(.055,.025),size:[.012,.028],lifetime:[.2,.5],spray:.8,gravity:5,normalOffset:.02,bendThreshold:.3});root.add(spray.mesh);
  return{root,grounded:false,update(c,t){manual=c.break??-1;size=lerp(.4,1,clamp(c.size??1));const time=t*(c.flow??1);cache.clear();surface.update(time);sea.update(time);apron.update(time);foam.update(time);crestFoam.update(time);spray.update(time);}};
 },
});

// Closed breaker mass: independently authored cavity and exterior sections,
// joined across the lip and both ends. The lower cavity interface is the floor.
const breakerVolumeWave=defineModel({
 id:'curl-wave',describe:'A closed breaker water volume with independently editable cavity/exterior cross-sections and geometry-bound lip, floor and landing foam.',
 controls:{size:'growth',flow:'flow speed',break:'optional manual break phase0..1'},defaults:{size:1,flow:1},
 params:{innerFront:'closed cavity section xy points',outerFront:'closed exterior section xy points',outerBack:'deep exterior section xy points',barrelLength:'barrel depth',frontDepth:'front section z',backCenterX:'deep cavity x',backCenterY:'deep cavity y',backWidth:'deep cavity radius x',backHeight:'deep cavity radius y',backShear:'cavity shear',closingTravel:'cavity closing travel',surfaceRipple:'water surface relief',floorRipple:'floor fold relief',crestFoamCount:'lip-bound foam population',foamCount:'landing foam population',floorFoamCount:'floor-curvature foam population',sprayCount:'lip spray population'},
 build(ctx){
  const root=new THREE.Group();if(ctx.bool('mirror',false))root.scale.x=-1;
  const profile=(key:string,fallback:number[][])=>{const a=ctx.params[key];return Array.isArray(a)&&a.length>=6&&a.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite))?a.map(p=>[Number(p[0]),Number(p[1])]):fallback;};
  const innerFront=profile('innerFront',[[-8,.8],[-4,.8],[-2.4,1.2],[-2.2,2.2],[-1.9,3.5],[-1.5,4.4],[-.8,4.55],[.1,4.45],[.9,4.15],[1.6,3.65],[2.2,2.9],[2.6,2],[2.75,1.1],[2.4,.85],[1.5,.9],[.5,.95],[-.7,.9],[-2,.85],[-4,.8]]);
  const outerFront=profile('outerFront',[[-10,-3],[-5,-3],[-4.5,.3],[-3.3,2.4],[-2.6,4.2],[-1.9,5.15],[-1.2,5.25],[-.3,5.1],[.6,4.8],[1.4,4.3],[2.1,3.5],[2.6,2.6],[2.9,1.6],[4,.8],[5,-2],[3,-3],[0,-3],[-3,-3],[-7,-3]]);
  const outerBack=profile('outerBack',[[-10,-3],[-8,1],[-6,4.7],[-3.5,5],[-2,5.3],[-1,5.5],[0,5.5],[1,5.4],[2.2,5],[3.5,4.5],[4.5,3.7],[5.5,2.7],[6,1.5],[7,.6],[7,-2],[3,-3],[0,-3],[-3,-3],[-7,-3]]);
  const angles=[225,210,195,165,135,105,90,75,50,25,5,-15,-45,-60,-80,-95,-110,-125,-132],frontZ=ctx.num('frontDepth',1,-2,3),length=ctx.num('barrelLength',6,2,12),backX=ctx.num('backCenterX',1.9,-1,4),backY=ctx.num('backCenterY',1.9,.5,4),rx=ctx.num('backWidth',1.3,.4,2),ry=ctx.num('backHeight',.85,.2,2),shear=ctx.num('backShear',.65,-1,1),travel=ctx.num('closingTravel',1.05,0,2),strength=ctx.num('closingAmount',1,0,1.4),begin=ctx.num('breakStart',.55,0,4),end=Math.max(begin+.1,ctx.num('breakEnd',2.53,.2,8)),nu=96,nv=7;
  let manual=-1,size=1;type State={q:number;inner:ReturnType<typeof controlGridFluidSampler>;outer:ReturnType<typeof controlGridFluidSampler>};const cache=new Map<number,State>();
  const state=(t:number)=>{let s=cache.get(t);if(s)return s;const p=clamp((t-begin)/(end-begin)),q=(manual>=0?clamp(manual):Math.pow(p,2.25))*strength,inside:THREE.Vector3[]=[],outside:THREE.Vector3[]=[];
   for(let j=0;j<nv;j++){const d=j/(nv-1),f=Math.pow(d,.72),z=frontZ-length*d,cx=backX-travel*q,cy=backY+ctx.num('axisEntryLift',.45,0,1)*Math.exp(-p/.18)+ctx.num('axisClosingLift',.2,-.3,.6)*q-.04*q,rrx=rx*(1-.3*q),rry=ry*(1-.58*q),sh=shear-.6*q;
    const section=(inner:boolean)=>{const front=inner?innerFront:outerFront,back=outerBack,points:THREE.Vector3[]=[];for(let k=0;k<front.length;k++){const a=k/front.length,edge=clamp((a-.4)/.3),crease=Math.sin(Math.PI*edge),floor=a>.67?Math.sin(Math.PI*clamp((a-.67)/.33)):0;let fx=front[k]![0]!,fy=front[k]![1]!;
      if(inner){fx-=1.6*q*edge*edge*(1-floor);fy-=1.05*q*crease;fy+=.65*q*floor;}else{fx-=.8*q*edge*edge*(1-floor);fy-=.35*q*crease;}
      let bx:number,by:number;if(inner){const angle=(angles[k%angles.length]!-25*q*crease)*Math.PI/180;bx=cx+rrx*Math.cos(angle)-sh*rry*Math.sin(angle);by=cy+rry*Math.sin(angle);}else{const b=back[Math.min(k,back.length-1)]!;bx=b[0]!;by=b[1]!;}
      points.push(new THREE.Vector3(lerp(fx,bx,f),lerp(fy,by,f),z));}
     return new THREE.CatmullRomCurve3(points,true,'catmullrom',.45);};
    const ic=section(true),oc=section(false);for(let i=0;i<nu;i++){inside.push(ic.getPoint(i/nu));outside.push(oc.getPoint(i/nu));}
   }
   s={q,inner:controlGridFluidSampler({points:inside,uCount:nu,vCount:nv,periodicU:true}),outer:controlGridFluidSampler({points:outside,uCount:nu,vCount:nv,periodicU:true})};cache.set(t,s);return s;
  };
  const radial=new THREE.Vector3(),ripple=ctx.num('surfaceRipple',.035,0,.15),floorRipple=ctx.num('floorRipple',.09,0,.3);
  const sampleBoundary=(outer:boolean,u:number,v:number,t:number,out:THREE.Vector3)=>{const s=state(t);(outer?s.outer:s.inner)(u,v,t,out);radial.set(out.x-lerp(.7,backX,v),out.y-lerp(2.1,backY,v),0).normalize();const floor=clamp((u-.67)/.08)*clamp((1.04-u)/.08),h=ripple*(Math.sin(u*177+v*14-t*4.5)+.3*Math.sin(u*389-v*25+t*7.3));const foldU=ctx.num('foldU',.21,.1,.4)+ctx.num('foldSweep',.08,-.2,.3)*v,fold=outer?0:ctx.num('foldDepth',.28,0,.6)*Math.exp(-Math.pow((u-foldU)/.009,2));out.addScaledVector(radial,h*(1-floor)+fold);if(!outer)out.y+=floor*floorRipple*(Math.sin(out.x*8+out.z*9-t*4)+.35*Math.sin(out.x*17+out.z*14-t*7));out.multiplyScalar(size);};
  const waterTone=ctx.num('waterTone',.12,.02,1),floorTone=ctx.num('floorTone',.3,.02,1),crestTone=ctx.num('crestTone',.8,.1,2);
  const body=createFluidSurface({uSegments:320,vSegments:80,periodicU:true,flipNormals:true,sample:(u,v,t,p)=>sampleBoundary(false,u,v,t,p),backSample:(u,v,t,p)=>sampleBoundary(true,u,v,t,p),color(u,v,_t,_p,out){const top=Math.exp(-Math.pow((u-.43)/.16,4)),floor=clamp((u-.67)/.07);out.setScalar(lerp(lerp(waterTone,crestTone,top),floorTone,floor)*lerp(1,ctx.num('deepTone',1.8,1,3),Math.pow(v,4)));}});
  const waterMat=ctx.mat({tone:1,rough:.55,side:THREE.DoubleSide});waterMat.vertexColors=true;const mesh=new THREE.Mesh(body.geometry,waterMat);mesh.name='closed-breaker-water-volume';mesh.frustumCulled=false;root.add(mesh);
  const a=new THREE.Vector3(),b=new THREE.Vector3(),lip=createFluidSurface({uSegments:100,vSegments:12,sample(u,v,t,p){const q=ctx.num('crestStartU',.27,.15,.4)+u*ctx.num('crestSpanU',.39,.2,.6);sampleBoundary(false,q,0,t,a);sampleBoundary(true,q,0,t,b);p.copy(a).lerp(b,v);}});
  const foamMat=ctx.mat({tone:ctx.num('foamTone',1,.2,2),rough:.8});const emission=ctx.num('foamEmission',.55,0,1);foamMat.onBeforeCompile=s=>{s.fragmentShader=s.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>\n totalEmissiveRadiance+=diffuseColor.rgb*${emission};`);};
  const crestFoam=createFluidFoam({surface:lip,count:ctx.num('crestFoamCount',14000,0,24000),seed:ctx.seed+817,material:foamMat,seedUV:(s,p)=>p.set(s.random[2]!,s.random[3]!),flow:(_u,_v,_t,p)=>p.set(.025,.015),size:[.03,.065],lifetime:[.65,1.4],spread:.025,normalOffset:.04,emission:(_f,_s,t)=>.7+.3*clamp(state(t).q)});root.add(crestFoam.mesh);
  const apron=createFluidSurface({uSegments:60,vSegments:30,flipNormals:true,sample(u,v,t,p){sampleBoundary(true,ctx.num('foamSourceU',.58,.45,.7),0,t,a);const x=lerp(a.x-.1,6.5,u),y=a.y-.4+ctx.num('landingRise',.6,0,1)*state(t).q-v*(1.2+.25*u)+.12*Math.sin(u*13+v*5-t*3)*Math.sin(Math.PI*v),z=lerp(frontZ+.1,2,u)+v*.3;p.set(x,y,z);}});
  const foam=createFluidFoam({surface:apron,count:ctx.num('foamCount',8500,0,18000),seed:ctx.seed+725,material:foamMat,seedUV:(s,p)=>p.set(s.random[2]!,Math.pow(s.random[3]!,1.3)),flow:(_u,_v,_t,p)=>p.set(.12,0),size:[.025,.055],lifetime:[.8,1.7],spread:.08,normalOffset:.06});root.add(foam.mesh);
  const faceFoam=createFluidFoam({surface:body,count:ctx.num('faceFoamCount',2400,0,8000),seed:ctx.seed+443,material:foamMat,seedUV:(s,p)=>{const v=s.random[3]!*.85;p.set(ctx.num('foldU',.21,.1,.4)+ctx.num('foldSweep',.08,-.2,.3)*v+(s.random[2]!-.5)*.014,v);},flow:(_u,_v,_t,p)=>p.set(ctx.num('foldSweep',.08,-.2,.3)*-.015,-.015),size:[.024,.044],lifetime:[.7,1.4],normalOffset:.03});root.add(faceFoam.mesh);
  const floorFoam=createFluidFoam({surface:body,count:ctx.num('floorFoamCount',4000,0,12000),seed:ctx.seed+371,material:foamMat,seedUV:(s,p)=>p.set(.69+s.random[2]!*.3,.05+s.random[3]!*.9),flow:(_u,_v,_t,p)=>p.set(-.02,-.02),size:[.015,.035],lifetime:[.6,1.3],normalOffset:.025,bendThreshold:ctx.num('floorFoamBend',2,0,8)});root.add(floorFoam.mesh);
  const spray=createFluidFoam({surface:lip,count:ctx.num('sprayCount',1000,0,3000),seed:ctx.seed+919,material:foamMat,flow:(_u,_v,_t,p)=>p.set(.08,.03),size:[.012,.03],lifetime:[.2,.55],spray:1,gravity:5,normalOffset:.02});root.add(spray.mesh);
  return{root,grounded:false,update(c,t){manual=c.break??-1;size=lerp(.4,1,clamp(c.size??1));const time=t*(c.flow??1);cache.clear();body.update(time);lip.update(time);apron.update(time);crestFoam.update(time);foam.update(time);faceFoam.update(time);floorFoam.update(time);spray.update(time);}};
 },
});

/** Preserve the original layered silhouette by default. The deeper barrel form is opt-in. */
export const curlWave=defineModel({
 ...layeredCurlWave,
 describe:'Legacy editable procedural wave; use wave-footage for recognizable natural water in a fixed view. Geometry forms preserve existing recipes and support custom 3D editing; their availability does not establish realistic fluid motion or a reference match.',
 params:{...volumetricCurlWave.params,...sculptedCurlWave.params,...rolledCurlWave.params,...breakerVolumeWave.params,
  form:'layered (default), hybrid, barrel, sculpted, rolled, or breaker closed water volume',
  eye:'eye radius m (layered default0.62, barrel default0.95)',
  eyeX:'tube centre x m (layered default0.95, barrel default1.55)',
  eyeY:'tube centre y m (layered default2.57, barrel default1.9)',
  lipShading:'blend0..1 between uniform and outer-edge lip lighting (hybrid default1, layered default0)',
  streakWidth:'layered face/tube ribbon thickness multiplier (default1)',
  foamSize:'layered foam droplet scale (default1)',
  waterGain:'layered water luminance multiplier (default1)',
  lipGain:'layered bright lip multiplier (default1)',
  faceGain:'layered face/sea streak multiplier (default1)',
  tubeGain:'layered inner/outer barrel streak multiplier (default1)',
  emission:'layered water self-light strength (default0.6)',
  foamGain:'layered foam luminance multiplier (default1)',
  foamEmission:'layered foam self-light strength (default0.55)',
 },
 build(ctx){const fallback=ctx.params.volume!==undefined||ctx.params.overhang!==undefined?'barrel':'layered';const form=ctx.str('form',fallback,['layered','hybrid','barrel','sculpted','rolled','breaker']);return form==='breaker'?breakerVolumeWave.build(ctx):form==='rolled'?rolledCurlWave.build(ctx):form==='sculpted'?sculptedCurlWave.build(ctx):form==='barrel'?volumetricCurlWave.build(ctx):layeredCurlWave.build(ctx);},
});
