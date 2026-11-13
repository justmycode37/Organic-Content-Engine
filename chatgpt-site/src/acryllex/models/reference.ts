// Reference-grade models (matched shot by shot against the owner's reference reel).
// Each is built from real geometric detail so the 1-bit dot shading reads like the reference.
import * as THREE from 'three';
import {G,at,deg,lerp,clamp,smooth,rng,roughen,ease,depthFade} from '../kit.ts';
import {defineModel,type ModelCtx} from './types.ts';
import {applyCalculatorKeyLegend} from './calculator-legends.ts';

type V3=[number,number,number];
const grp=(...c:THREE.Object3D[])=>{const g=new THREE.Group();if(c.length)g.add(...c);return g;};
/** Bead / spindle shape (double cone with rounded waist), axis Y. */
const bead=(r:number,h:number,hole=0.18,facets=28)=>G.lathe([[r*hole,-h/2],[r*0.55,-h/2],[r*0.92,-h*0.18],[r,0],[r*0.92,h*0.18],[r*0.55,h/2],[r*hole,h/2]],facets);
/** Hollow rectangle frame (outline minus inner) extruded along z. */
function frameGeo(w:number,h:number,bar:number,depth:number,r=0){
 const o:[number,number][]=[[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]];
 const i:[number,number][]=[[-w/2+bar,-h/2+bar],[-w/2+bar,h/2-bar],[w/2-bar,h/2-bar],[w/2-bar,-h/2+bar]];
 return G.extrude(o,depth,r,[i]);
}
/** Rounded rectangle outline (xy). */
function rrect(w:number,h:number,r:number,n=6):[number,number][]{
 const pts:[number,number][]=[];const cs:[number,number,number][]=[[w/2-r,h/2-r,0],[-w/2+r,h/2-r,90],[-w/2+r,-h/2+r,180],[w/2-r,-h/2+r,270]];
 for(const [cx,cy,a0] of cs)for(let k=0;k<=n;k++){const a=deg(a0+90*k/n);pts.push([cx+Math.cos(a)*r,cy+Math.sin(a)*r]);}
 return pts;
}

// ================================================================= office
export const officeDesk=defineModel({
 id:'office-desk',aliases:['pedestal-desk','computer-desk','workdesk','standing-desk'],
 describe:'A modern office desk: thick rectangular top on a single central column with a wide flat foot (seen side-on it reads instantly as a desk). Anchor `top` for a monitor, `seat` in front for a sitting person.',
 params:{width:'desk width m (default 1.2)',depth:'desk depth m (default .7)',height:'desktop height m (default .74)',columnWidth:'pedestal width m (default .16)',columnDepth:'pedestal depth m (default .12)',topThickness:'desktop slab thickness m (default .045)',apronHeight:'underside apron height m (default .03)'},size:'1.2 x 0.75 x 0.7 m',
 build(ctx){
  const w=ctx.num('width',1.2,0.6,3),d=ctx.num('depth',.7,.3,2),h=ctx.num('height',.74,.4,1.4),cw=ctx.num('columnWidth',.16,.05,.6),cd=ctx.num('columnDepth',.12,.05,.6),root=new THREE.Group();
  const topThickness=ctx.num('topThickness',.045,.008,.12),apronHeight=ctx.num('apronHeight',.03,.005,.08),customTop=topThickness!==.045||apronHeight!==.03;
  const columnHeight=customTop?h-topThickness-apronHeight-.04:h-.12;
  root.add(ctx.mesh(at(G.rbox(w,topThickness,d,Math.min(.008,topThickness*.3)),[0,customTop?h-topThickness/2:h-.0225,0]),{tone:0.95}));
  root.add(ctx.mesh(at(G.box(w*0.96,apronHeight,d*0.92),[0,customTop?h-topThickness-apronHeight/2:h-.06,0]),{tone:0.45}));
  // central column (two telescoping sections) and foot
  root.add(ctx.mesh(at(G.rbox(cw,columnHeight,cd,0.012),[0,columnHeight/2+.04,0]),{tone:0.8}));
  root.add(ctx.mesh(at(G.rbox(cw*.8125,0.28,cd*.8333,0.01),[0,h-0.24,0]),{tone:0.6}));
  root.add(ctx.mesh(at(G.rbox(0.12,0.035,d*0.95,0.01),[0,0.0175,0]),{tone:0.85}));
  for(const z of [-d*0.44,d*0.44])root.add(ctx.mesh(at(G.cyl(0.018,0.018,0.012,16),[0,0.006,z]),{tone:0.5}));
  return {root,grounded:true,anchors:{top:[0,h,0],seat:[0,0,d*0.75]},seatFacing:180};
 },
});

export const officeChair=defineModel({
 id:'office-chair',aliases:['desk-chair','swivel-chair','task-chair','ergonomic-chair'],
 describe:'An ergonomic office swivel chair: curved mesh backrest with lumbar ridge, padded seat, armrests, gas lift column and five-star base with castor wheels. `spin` turns the seat.',
 controls:{spin:'0..1 seat turn (default 0)'},size:'0.65 x 1.05 m',
 params:{backRadius:'backrest corner radius m (default .09)',backTilt:'backrest tilt degrees (default -10)',surfaceGain:'chair albedo multiplier before illumination (default 1); changes fixed-ink coverage while keeping the geometry and ink color'},
 build(ctx){
  const root=new THREE.Group(),top=new THREE.Group();root.add(top);
  // base: five spokes with castors
  for(let i=0;i<5;i++){const a=deg(i*72+18);const s=new THREE.Group();s.rotation.y=a;root.add(s);
   s.add(ctx.mesh(at(G.rbox(0.05,0.035,0.3,0.012),[0,0.085,0.15],[ -6,0,0]),{tone:0.75}));
   s.add(ctx.mesh(at(G.cyl(0.028,0.028,0.026,18),[0,0.035,0.29],[0,0,90]),{tone:0.55}));
   s.add(ctx.mesh(at(G.cyl(0.012,0.012,0.04,10),[0,0.065,0.29]),{tone:0.6}));}
  root.add(ctx.mesh(at(G.cyl(0.05,0.06,0.06,24),[0,0.1,0]),{tone:0.7}));
  root.add(ctx.mesh(at(G.cyl(0.022,0.022,0.25,16),[0,0.24,0]),{tone:0.95}));
  root.add(ctx.mesh(at(G.cyl(0.032,0.032,0.14,16),[0,0.17,0]),{tone:0.6}));
  // seat
  top.add(ctx.mesh(at(G.rbox(0.5,0.075,0.48,0.035),[0,0.43,0.02]),{tone:0.9}));
  top.add(ctx.mesh(at(G.box(0.36,0.04,0.3),[0,0.38,0]),{tone:0.45}));
  // backrest: curved frame with mesh inner and lumbar ridge
  const back=new THREE.Group();back.position.set(0,0.48,-0.24);back.rotation.x=deg(ctx.num('backTilt',-10,-40,20));top.add(back);
  const outline=rrect(0.46,0.56,ctx.num('backRadius',.09,.01,.2));const shape=new THREE.Shape(outline.map(([x,y])=>new THREE.Vector2(x,y)));
  const backGeo=new THREE.ExtrudeGeometry(shape,{depth:0.035,bevelEnabled:true,bevelSize:0.012,bevelThickness:0.012,bevelSegments:2,curveSegments:8});
  backGeo.translate(0,0.34,-0.0175);
  const p=backGeo.attributes.position!;for(let i=0;i<p.count;i++){const x=p.getX(i);p.setZ(i,p.getZ(i)+x*x*0.55);}backGeo.computeVertexNormals();
  back.add(ctx.mesh(backGeo,{tone:0.85}));
  back.add(ctx.mesh(at(G.rbox(0.38,0.06,0.03,0.012),[0,0.2,0.03]),{tone:1}));
  back.add(ctx.mesh(at(G.rbox(0.05,0.2,0.03,0.012),[0,0.02,0.0]),{tone:0.65}));
  // armrests
  for(const sx of [-1,1]){top.add(ctx.mesh(at(G.rbox(0.035,0.2,0.04,0.012),[sx*0.24,0.53,-0.02]),{tone:0.65}));
   top.add(ctx.mesh(at(G.rbox(0.07,0.03,0.26,0.012),[sx*0.24,0.64,0.0]),{tone:0.95}));}
  const surfaceGain=ctx.num('surfaceGain',1,.1,3);
  if(surfaceGain!==1)root.traverse(o=>{const mesh=o as THREE.Mesh;if(!mesh.isMesh)return;
   for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
    const previous=material.onBeforeCompile,key=material.customProgramCacheKey();
    material.onBeforeCompile=(shader,renderer)=>{previous.call(material,shader,renderer);shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>\n diffuseColor.rgb*=${surfaceGain.toFixed(6)};`);};
    material.customProgramCacheKey=()=>`acx-chair-surface-gain-v1:${surfaceGain}:${key}`;material.needsUpdate=true;
   }
  });
  return {root,grounded:true,anchors:{seat:[0,0.47,0.02]},seatFacing:0,
   update(c){top.rotation.y=(c.spin??0)*Math.PI*2;}};
 },
});

export const desktopMonitor=defineModel({
 id:'desktop-monitor',aliases:['imac','computer-monitor','pc-screen','desktop-computer','computer'],
 describe:'An all-in-one desktop computer: thin flat screen with a glowing display gradient, slim chin and an angled aluminium stand on a flat foot. `glow` 0 off .. 1 screen lit.',
 controls:{glow:'0..1 screen brightness (default 1)'},defaults:{glow:1},size:'0.6 x 0.48 m',
 params:{standHeight:'height below the screen in metres (default .12)'},
 build(ctx){
  const root=new THREE.Group();
  const sw=0.6,sh=0.36,y0=ctx.num('standHeight',.12,.03,.3);
  root.add(ctx.mesh(at(G.rbox(sw,sh+0.06,0.025,0.01),[0,y0+sh/2+0.01,0]),{tone:0.75}));
  root.add(ctx.mesh(at(G.box(sw*0.94,sh*0.9,0.004),[0,y0+sh/2+0.035,0.0135]),{tone:0.55,glow:1.3}));
  root.add(ctx.mesh(at(G.rbox(0.17,y0+.08,0.018,0.006),[0,(y0+.08)/2,-0.06],[-14,0,0]),{tone:0.85}));
  root.add(ctx.mesh(at(G.rbox(0.2,0.012,0.17,0.006),[0,0.006,-0.04]),{tone:0.9}));
  return {root,grounded:true,anchors:{screen:[0,y0+sh/2,0.02]}};
 },
});

// ================================================================= calculating tools
export const abacus=defineModel({
 id:'abacus',aliases:['soroban','counting-frame','suanpan'],
 describe:'A wooden abacus with configurable rods, frame and spindle-shaped beads: Japanese soroban (1 upper/4 lower) or Chinese suanpan (2 upper/5 lower). `count` slides selected beads toward the divider; optional digits specifies the displayed decimal digits.',
 controls:{count:'0..1 beads pushed to the beam (animated counting)'},size:'0.4 x 0.22 m',
 params:{width:'outer width m (default .42)',height:'outer height m (default .24)',bar:'frame bar width m (default .026)',depth:'frame depth m (default .035)',rods:'integer rod count 3..20 (default 9)',upperBeads:'upper beads per rod 1..3 (default 1)',lowerBeads:'lower beads per rod 4..10 (default 4)',beadHeight:'bead height m (default .028, capped to chamber space)',beadWidth:'bead width / rod spacing (default .96)',beadGap:'gap between resting beads m (default 0)',divider:'divider height / frame height measured from bottom',frameTone:'frame albedo (default .95)',facets:'bead radial segments 6..48 (default 28)',flatBeads:'flat facet normals (default false)',digits:'optional decimal digits array, one per rod'},
 build(ctx){
  const root=new THREE.Group();const W=ctx.num('width',.42,.2,1.2),H=ctx.num('height',.24,.15,.7),bar=ctx.num('bar',.026,.006,Math.min(W,H)*.2),D=ctx.num('depth',.035,.008,.1),rods=Math.round(ctx.num('rods',9,3,20));
  const upper=Math.round(ctx.num('upperBeads',1,1,3)),lower=Math.round(ctx.num('lowerBeads',4,4,10)),gap=ctx.num('beadGap',0,0,.01);
  const tone=ctx.num('frameTone',.95,.05,1);
  root.add(ctx.mesh(frameGeo(W,H,bar,D,0.004),{tone}));
  const beamY=H*(ctx.num('divider',(H/2-bar-.055)/H+.5,.35,.85)-.5);
  root.add(ctx.mesh(at(G.box(W-bar*2,Math.min(.016,bar),D*.8),[0,beamY,0]),{tone:tone*.85/.95}));
  const beads:{m:THREE.Mesh;rest:number;active:number;rod:number;k:number;upper:boolean}[]=[];
  const inner=W-bar*2;const gapX=inner/(rods);
  const cap=Math.max(.004,Math.min((H/2-bar-beamY-.012-gap*(upper-1))/upper,(beamY+H/2-bar-.012-gap*(lower-1))/lower));
  const bh=Math.min(ctx.num('beadHeight',.028,.004,.06),cap),pitch=bh+gap,facets=Math.round(ctx.num('facets',28,6,48));
  const digits=Array.isArray(ctx.params.digits)?ctx.params.digits:null;
  for(let r=0;r<rods;r++){
   const x=-inner/2+gapX*(r+0.5);
   root.add(ctx.mesh(at(G.cyl(0.0025,0.0025,H-bar*2,8),[x,0,0]),{tone:0.5}));
   const br=gapX*ctx.num('beadWidth',.96,.3,1)*.5;
   // upper bead rests at the top, active against the beam
   for(let i=0;i<upper;i++){const rest=H/2-bar-bh/2-.002-i*pitch,m=ctx.mesh(bead(br,bh,.18,facets),{tone:1,flat:ctx.bool('flatBeads',false)});m.name=`rod-${r}-upper-${i}`;m.position.set(x,rest,0);root.add(m);beads.push({m,rest,active:beamY+.008+bh/2+(upper-1-i)*pitch,rod:r,k:i,upper:true});}
   for(let i=0;i<lower;i++){const restY=-H/2+bar+bh/2+0.002+i*pitch;const m=ctx.mesh(bead(br,bh,.18,facets),{tone:i%2?0.9:1,flat:ctx.bool('flatBeads',false)});m.name=`rod-${r}-lower-${i}`;m.position.set(x,restY,0);root.add(m);
    beads.push({m,rest:restY,active:beamY-0.008-bh/2-(lower-1-i)*pitch,rod:r,k:i,upper:false});}
  }
  return {root,grounded:false,update(c,t){
   const v=clamp(c.count??0);
   for(const b of beads){const pattern=((b.rod*7+3)%5)/5,raw=digits?.[b.rod],digit=typeof raw==='number'&&Number.isFinite(raw)?Math.round(clamp(raw,0,9)):null;
    const active=digit===null?(b.upper?(pattern>.5?upper:0):Math.round(pattern*lower)):(b.upper?Math.floor(digit/5):digit%5);
    const on=b.k>=(b.upper?upper:lower)-active?1:0;
    const kk=smooth(clamp(v*1.6-b.rod*0.07));b.m.position.y=lerp(b.rest,b.active,on*kk);}
   void t;
  }};
 },
});

export const calculator=defineModel({
 id:'calculator',aliases:['pocket-calculator','desk-calculator','electronic-calculator'],
 describe:'A desktop electronic calculator: chunky bevelled body with a raised rim, a recessed display window with a solar strip, and a configurable grid of tall domed keys with deep gaps (larger plus key). `press` 0..1 animates keys being pressed.',
 controls:{press:'0..1 typing animation'},params:{width:'body width m (default .13)',height:'body height m (default .18)',depth:'body depth m (default .024)',columns:'key columns 3..7 (default 4)',rows:'key rows 3..8 (default 5)',displayTone:'LCD albedo (default .12)',keyLabels:'optional row-major key symbols; empty or blank entries leave caps unmarked',legendScale:'symbol size relative to key width (default .55, .2.. .8)',keyScale:'key width / horizontal pitch (default .78)',keyAspect:'key height / width (default .86)',bodyTone:'case albedo (default .9)',rimTone:'outer rim albedo (default 1)',topRimTone:'optional top horizontal rim albedo (default rimTone); other edges unchanged',displayTopInset:'LCD top inset m (default 0, max .014); bottom edge and digit bars stay fixed',deckTone:'recessed key deck albedo (default .25)',bezelTone:'display bezel albedo (default .95)',keyTone:'main key albedo (default .92)',functionTone:'first-row key albedo (default .75)',operatorTone:'operator key albedo (default 1)',keyDepth:'key height m (default .009)',keyBevel:'key bevel m (default .0035)',keyRoughness:'key roughness (default .35)'},size:'0.13 x 0.18 m',
 build(ctx){
  const root=new THREE.Group();const w=ctx.num('width',.13,.06,.5),h=ctx.num('height',.18,.12,.7),d=ctx.num('depth',.024,.006,.1);
  // body: base slab + raised rim frame around a recessed key deck
  root.add(ctx.mesh(at(G.rbox(w,h,d,0.01),[0,0,0]),{tone:ctx.num('bodyTone',.9,.02,1)}));
  const rimTone=ctx.num('rimTone',1,.02,1),topRimTone=ctx.num('topRimTone',rimTone,.02,1);
  const rim=ctx.mesh(at(frameGeo(w-0.004,h-0.004,0.008,0.006,0.002),[0,0,d/2+0.002]),{tone:rimTone});
  if(topRimTone!==rimTone){
   if(rim.geometry.index){const indexed=rim.geometry;rim.geometry=indexed.toNonIndexed();indexed.dispose();}
   const positions=rim.geometry.getAttribute('position'),colors=new Float32Array(positions.count*3).fill(1);
   const threshold=(h-.004)/2-.008-.002-1e-6,gain=topRimTone/rimTone;
   for(let i=0;i<positions.count;i+=3)if(Math.min(positions.getY(i),positions.getY(i+1),positions.getY(i+2))>=threshold)colors.fill(gain,i*3,(i+3)*3);
   rim.geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));(rim.material as THREE.MeshStandardMaterial).vertexColors=true;
  }
  root.add(rim);
  root.add(ctx.mesh(at(G.box(w-0.018,h-0.018,0.002),[0,0,d/2-0.001]),{tone:ctx.num('deckTone',.25,.01,1)}));
  // display: deep dark window with bright bezel, LCD digits as raised bars
  root.add(ctx.mesh(at(frameGeo(w*0.84,0.044,0.005,0.006,0.001),[0,h/2-0.03,d/2+0.003]),{tone:ctx.num('bezelTone',.95,.02,1)}));
  const displayTopInset=ctx.num('displayTopInset',0,0,.014);
  root.add(ctx.mesh(at(G.box(w*0.78,0.034-displayTopInset,0.002),[0,h/2-0.03-displayTopInset/2,d/2]),{tone:ctx.num('displayTone',.12,.02,.9)}));
  const dig:THREE.BufferGeometry[]=[];for(let i=0;i<7;i++){dig.push(at(G.box(0.008,0.0016,0.001),[w*0.3-i*0.0125,h/2-0.03,d/2+0.0015]));}
  root.add(ctx.mesh(G.merge(dig),{tone:0.6}));
  root.add(ctx.mesh(at(G.rbox(0.05,0.011,0.004,0.0015),[-w*0.18,h/2-0.008,d/2+0.002]),{tone:0.35}));
  // keys: tall rounded caps, gaps reveal the dark deck
  const columns=Math.round(ctx.num('columns',4,3,7)),rows=Math.round(ctx.num('rows',5,3,8));
  const keyLabels=Array.isArray(ctx.params.keyLabels)?ctx.params.keyLabels:[],legendScale=ctx.num('legendScale',.55,.2,.8);
  const keys:THREE.Mesh[]=[];const gx=w*.85/columns,gy=(h-.065)/rows,kw=gx*ctx.num('keyScale',.78,.4,.95),aspect=ctx.num('keyAspect',.86,.5,1.3);
  const keyDepth=ctx.num('keyDepth',.009,.002,.025),keyBevel=ctx.num('keyBevel',.0035,.0001,.008);
  const cap=(ww:number,hh:number)=>{const g=G.rbox(ww,hh,keyDepth,keyBevel,3);const p=g.attributes.position!;for(let i=0;i<p.count;i++){const z=p.getZ(i);if(z>0.002){const x=p.getX(i)/ww,y=p.getY(i)/hh;p.setZ(i,z-0.0016*(x*x+y*y)*4);}}g.computeVertexNormals();return g;};
  for(let r=0;r<rows;r++)for(let c=0;c<columns;c++){
   const tall=c===columns-1&&r===rows-2;if(c===columns-1&&r===rows-1)continue;
   const capHeight=tall?kw+gy:Math.min(kw*aspect,gy*.95);
   const m=ctx.mesh(cap(kw,capHeight),{tone:r===0?ctx.num('functionTone',.75,.02,1):c===3?ctx.num('operatorTone',1,.02,1):ctx.num('keyTone',.92,.02,1),rough:ctx.num('keyRoughness',.35,.05,1)});
   const label=keyLabels[r*columns+c];if(typeof label==='string'||typeof label==='number')applyCalculatorKeyLegend(m,String(label),kw,capHeight,legendScale);
   m.position.set(-(columns-1)/2*gx+c*gx,h/2-0.065-r*gy-(tall?gy/2:0),d/2+0.0055);root.add(m);keys.push(m);
  }
  return {root,grounded:false,update(c,t){const p=c.press??0;keys.forEach((k,i)=>{const hit=p>0?Math.max(0,Math.sin(t*9+i*2.3)-0.8)*5*p:0;k.position.z=d/2+0.0055-hit*0.003;});}};
 },
});

export {skyline} from './reference-city.ts';

export {curlWave} from './reference-wave.ts';

export {concreteStairs} from './reference-stairs.ts';

export {tunnel} from './reference-tunnel.ts';

export {maze} from './reference-maze.ts';

export {blockCluster} from './reference-blocks.ts';

// ================================================================= laptop (slim modern notebook)
export const laptop=defineModel({
 id:'laptop',aliases:['notebook','macbook','laptop-computer','notebook-computer'],
 describe:'A slim modern laptop: thin aluminium deck with a full keyboard grid and a trackpad, a thin lid with a narrow bezel around a dark (or glowing) screen. `open` 0 closed .. 1 open at ~110 degrees; `glow` lights the screen; `type` makes keys bob.',
 controls:{open:'0 closed .. 1 open (default 1)',glow:'0 dark screen .. 1 lit (default 0)',type:'0..1 typing'},defaults:{open:1,glow:0},size:'0.32 x 0.22 m',
 params:{width:'deck width m (default .32)',depth:'deck depth m (default .22)',thickness:'deck thickness m (default .014)',lidHeight:'lid height m (default .21)',lidThickness:'lid thickness m (default .006)',openAngle:'fully open hinge angle in degrees (default 108)',bezel:'side bezel / lid width (default .035)',topBezel:'top bezel / lid height (default .04)',bottomBezel:'bottom chin / lid height (default .08)',bodyTone:'deck albedo (default .95)',lidTone:'lid albedo (default .9)',keyTone:'key albedo (default .85)',wellTone:'keyboard well albedo (default .35)',columns:'keyboard columns 8..18 (default 14)',rows:'keyboard rows 4..8 (default 6)'},
 build(ctx){
  const root=new THREE.Group();const w=ctx.num('width',.32,.2,.5),d=ctx.num('depth',.22,.12,.4),t=ctx.num('thickness',.014,.005,.04);
  root.add(ctx.mesh(at(G.rbox(w,t,d,0.005),[0,t/2,0]),{tone:ctx.num('bodyTone',.95,.1,1)}));
  // keyboard well + keys
  root.add(ctx.mesh(at(G.box(w*0.86,0.002,d*0.42),[0,t+0.0005,-d*0.16]),{tone:ctx.num('wellTone',.35,.02,.7)}));
  const keys:THREE.BufferGeometry[]=[];const rows=Math.round(ctx.num('rows',6,4,8)),cols=Math.round(ctx.num('columns',14,8,18)),kw=(w*0.84)/cols,ky=d*.4725/rows,kh=d*.06458;
  const spaceStart=Math.round(cols*2/7),spaceEnd=Math.round(cols*5/7);
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){if(r===rows-1&&c>=spaceStart&&c<spaceEnd){if(c===spaceStart)keys.push(at(G.rbox(kw*(spaceEnd-spaceStart)-.003,.003,Math.min(kh,ky*.9),.001),[-w*.42+kw*(spaceStart+spaceEnd)/2,t+.002,-d*.36+r*ky+kw*.4]));continue;}
   keys.push(at(G.rbox(kw*.82,.003,Math.min(kh,ky*.9),.001),[-w*.42+kw*(c+.5),t+.002,-d*.36+r*ky+kw*.4]));}
  const keyMesh=ctx.mesh(G.merge(keys),{tone:ctx.num('keyTone',.85,.1,1)});root.add(keyMesh);
  root.add(ctx.mesh(at(G.rbox(w*0.36,0.0015,d*0.3,0.004),[0,t+0.0004,d*0.27]),{tone:0.6}));
  // lid
  const lid=new THREE.Group();lid.position.set(0,t,-d/2+0.004);root.add(lid);
  const lh=ctx.num('lidHeight',.21,.12,.35),lt=ctx.num('lidThickness',.006,.003,.02),bezel=ctx.num('bezel',.035,.01,.15),top=ctx.num('topBezel',.04,.01,.2),bottom=ctx.num('bottomBezel',.08,.01,.2);
  lid.add(ctx.mesh(at(G.rbox(w,lh,lt,0.004),[0,lh/2,0]),{tone:ctx.num('lidTone',.9,.1,1)}));
  const screen=ctx.mesh(at(G.box(w*(1-2*bezel),lh*(1-top-bottom),.002),[0,lh*(1-top+bottom)/2,lt/2+.0005]),{tone:0.1,glow:1.2});lid.add(screen);
  lid.add(ctx.mesh(at(G.cyl(0.004,0.004,w*0.7,12),[0,0,0],[0,0,90]),{tone:0.7}));
  return {root,grounded:true,glowMeshes:[screen],anchors:{screen:[0,t+lh*0.5,-d/2]},update(c,tt){
   lid.rotation.x=deg(90-ctx.num('openAngle',108,80,145)*clamp(c.open??1));
   keyMesh.position.y=(c.type??0)>0?Math.max(0,Math.sin(tt*30))*0.0006*(c.type??0):0;
  }};
 },
});

void grp;void deg;
export type {ModelCtx};
