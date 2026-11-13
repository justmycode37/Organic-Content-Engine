import * as THREE from 'three';
import {lerp,clamp,rng} from '../kit.ts';
import {defineModel} from './types.ts';

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



/** Preserve the original layered silhouette by default. The deeper barrel form is opt-in. */
export const curlWave=defineModel({
 ...layeredCurlWave,
 describe:layeredCurlWave.describe+' Use form=barrel for an asymmetric continuous barrel wall, independent front fold and falling foam.',
 params:{...volumetricCurlWave.params,
  form:'layered (default): original layout; hybrid: shaded crest on original layout; barrel: continuous wall and fold',
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
 build(ctx){const fallback=ctx.params.volume!==undefined||ctx.params.overhang!==undefined?'barrel':'layered';return ctx.str('form',fallback,['layered','hybrid','barrel'])==='barrel'?volumetricCurlWave.build(ctx):layeredCurlWave.build(ctx);},
});
