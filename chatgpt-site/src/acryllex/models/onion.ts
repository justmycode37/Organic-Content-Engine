import * as THREE from 'three';
import {instance} from '../assets.ts';
import {G,at,clamp,deg,lerp,rng,smooth} from '../kit.ts';
import {defineModel,type ModelCtx,type ModelDef} from './types.ts';
import {retainSourceTriangles,clipStaticSourcePlane} from './source-region.ts';

/** Authored educational assets, not captured onion footage or microscopy.
 * Component source/attribution and limitations: assets/onion/README.md. */
type V3=[number,number,number];
/** Local reflectance response: sparse recesses and dense lit flesh, before the shared dot pass. */
export const onionDensityResponse=(linear:number)=>Math.min(1.6,Math.pow(Math.max(0,(linear-.25)/.6),1.4)*1.5);
function onionDensityMaterial(material:THREE.Material){
 const previous=material.onBeforeCompile,key=material.customProgramCacheKey.bind(material);
 material.onBeforeCompile=function(shader,renderer){
  previous.call(this,shader,renderer);
  shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`{
   float onionIntensity=max(outgoingLight.r,max(outgoingLight.g,outgoingLight.b));
   float onionDensity=min(1.6,pow(max(0.,(onionIntensity-.25)/.6),1.4)*1.5);
   outgoingLight*=onionDensity/max(onionIntensity,.000001);
  }
  #include <opaque_fragment>`);
 };
 material.customProgramCacheKey=()=>key()+'|onion-local-density-v1';
}
function source(ctx:ModelCtx,id:string,height:number){
 const loaded=instance(id,ctx,.83,true,0,{sourceAlpha:true});
 if(!loaded)throw new Error(`onion assets: required licensed source ${id} was not preloaded`);
 const fit=new THREE.Group();fit.add(loaded.root);fit.updateMatrixWorld(true);
 const bounds=new THREE.Box3().setFromObject(fit,true),size=bounds.getSize(new THREE.Vector3());
 loaded.root.position.sub(bounds.getCenter(new THREE.Vector3()));fit.scale.setScalar(height/Math.max(size.y,1e-6));
 return fit;
}
function part(ctx:ModelCtx,root:THREE.Object3D,g:THREE.BufferGeometry,pos:V3,tone=.8,rough=.6){
 const m=ctx.mesh(g,{tone,rough});m.position.set(...pos);root.add(m);return m;
}
function onionCap(ctx:ModelCtx,side:number){
 const root=new THREE.Group();root.rotation.y=side<0?Math.PI/2:-Math.PI/2;
 part(ctx,root,new THREE.CircleGeometry(.178,80),[0,0,0],.77,.46);
 for(let i=1;i<=12;i++)part(ctx,root,G.torus(.013+i*.012,.0016,6,80),[0,0,.001],i%2?.53:.92,.48);
 root.scale.set(.88,1,1);root.position.x=side*.003;return root;
}

export const onionCuttingTake=defineModel({
 id:'onion-cutting-take',
 describe:'LEGACY UNREVIEWED EXPERIMENT: do not select for normal production; it failed contact and tear reviews. Kept only for reproducing the raw experiment. Original 42-second 3D explanatory take assembled from licensed yellow-onion, chef-knife and whole-head scans: knife cuts the onion, its halves separate, then tear droplets travel down the scanned face. NOT filmed footage. The face is a rigid scan with no facial expressions, blinking, articulated hands or recorded performance. Fixed frontal composition; start/timeOrigin select the authored take clock.',
 params:{start:'seconds into the 42-second authored take, default 0',timeOrigin:'scene-local playback origin seconds, default 0',height:'uniform display height in metres, default 2',loop:'false by default; true wraps the authored take'},
 controls:{speed:'take playback rate, default 1'},defaults:{speed:1},size:'2 m display composition',
 build(ctx){
  const root=new THREE.Group(),food=new THREE.Group();root.add(food);food.position.set(-.4,-.49,.12);
  const whole=source(ctx,'yellow_onion',.4);food.add(whole);
  const left=source(ctx,'yellow_onion',.4),right=source(ctx,'yellow_onion',.4);
  retainSourceTriangles(left,p=>p.x<=0);retainSourceTriangles(right,p=>p.x>=0);
  left.add(onionCap(ctx,-1));right.add(onionCap(ctx,1));food.add(left,right);
  const board=part(ctx,root,G.rbox(1.12,.045,.48,.018),[-.24,-.735,.07],.5,.86);
  void board;
  const knife=new THREE.Group(),knifeMesh=source(ctx,'chef-knife',.68);knife.add(knifeMesh);root.add(knife);
  knifeMesh.rotation.z=deg(-42);knifeMesh.rotation.y=deg(-8);
  const face=new THREE.Group();face.add(source(ctx,'man-head-scan',.93));face.position.set(.06,.43,-.17);root.add(face);
  const tears=new THREE.Group();root.add(tears);
  const drops:THREE.Mesh[]=[];
  for(const x of [-.085,.145]){
   const trail=ctx.mesh(G.tube([[x,.49,.125],[x-.012,.4,.15],[x-.018,.3,.155],[x-.011,.18,.135]],.003,32,7),{tone:.96,rough:.12});
   tears.add(trail);
   for(let i=0;i<3;i++){const m=part(ctx,tears,G.ellipsoid(.011,.019,.008,18,14),[x,.48,.15],1,.08);m.userData.tearX=x;m.userData.phase=i/3;drops.push(m);}
  }
  const height=ctx.num('height',2,.25,6);root.scale.setScalar(height/2);
  const initial=ctx.num('start',0,0,42),origin=ctx.num('timeOrigin',0),loop=ctx.bool('loop',false);
  const framingPoints=[new THREE.Vector3(-.86,-.81,-.48),new THREE.Vector3(.8,1,.48)];
  return {root,grounded:false,framingPoints,update(c,t){
   let time=initial+(t-origin)*(c.speed??1);time=loop?((time%42)+42)%42:clamp(time,0,42);
   const cutting=smooth(clamp((time-8.85)/1.55)),opened=smooth(clamp((time-10.5)/1.7));
   whole.visible=cutting<.57;left.visible=right.visible=!whole.visible;
   left.position.x=-.095*opened;right.position.x=.095*opened;
   left.rotation.z=-.09*opened;right.rotation.z=.09*opened;
   const retreat=smooth(clamp((time-11.5)/1.4));
   knife.position.set(lerp(-.38,.55,retreat),lerp(-.04,-.43,cutting)+.43*retreat,.19);
   knife.rotation.z=deg(lerp(-5,13,retreat));
   face.rotation.x=deg(-3*smooth(clamp((time-22.8)/2)));face.rotation.y=deg(-5);
   const tearAmount=smooth(clamp((time-27.6)/2));tears.visible=tearAmount>0;
   for(const drop of drops){const phase=((time-27.6)*.45+Number(drop.userData.phase))%1;drop.position.set(Number(drop.userData.tearX)-.012*Math.sin(Math.max(0,phase)*Math.PI),.49-Math.max(0,phase)*.32,.151);drop.scale.setScalar(tearAmount);}
  }};
 },
});

/** A compartment diagram shares a coordinate system across all three states.
 * The particles are symbolic ingredients, not molecular-shape claims. */
function cell(id:string,state:'separated'|'ruptured'|'mixed'):ModelDef{
 return defineModel({
  id,describe:`Authored 3D onion plant-cell compartment cutaway (${state} state): elongated cell wall, membrane, large central vacuole and two symbolic ingredient populations. Educational schematic, not microscopy, a chemical structure, or a scale-accurate organelle model. Compatible geometry across separated/ruptured/mixed states for the existing morph event.`,
  controls:{mix:'0 separated populations ..1 mixed; state supplies its default'},defaults:{mix:state==='mixed'?1:0},size:'1.2 m educational display',
  build(ctx){
   const root=new THREE.Group(),random=rng(4419),wall=new THREE.Group();root.add(wall);
   const outline:V3[]=[[-.53,0,-.31],[-.32,0,-.37],[.34,0,-.35],[.56,0,-.2],[.54,0,.23],[.32,0,.35],[-.35,0,.34],[-.56,0,.2],[-.53,0,-.31]];
   const intact=state==='separated';
   for(const y of [-.24,.25]){
    for(let i=0;i<outline.length-1;i++){
     if(!intact&&(i===2||i===3))continue;
     const a=outline[i],b=outline[i+1];wall.add(ctx.mesh(G.tube([[a[0],y,a[2]],[lerp(a[0],b[0],.5),y,lerp(a[2],b[2],.5)],[b[0],y,b[2]]],.027,12,9),{tone:.82,rough:.7}));
    }
   }
   for(let i=0;i<outline.length-1;i++){
    if(!intact&&(i===2||i===3))continue;
    const a=outline[i];wall.add(ctx.mesh(G.tube([[a[0],-.24,a[2]],[a[0],0,a[2]],[a[0],.25,a[2]]],.026,12,9),{tone:.78}));
   }
   part(ctx,root,G.rbox(1.03,.035,.61,.03),[0,-.235,0],.37,.8);
   // The cutaway's open front/top exposes the compartments from the authored cameras.
   const vacuole=ctx.mesh(new THREE.SphereGeometry(1,56,32,0,Math.PI*1.47,.12,Math.PI*.86),{tone:.61,rough:.36,side:THREE.DoubleSide});
   vacuole.scale.set(.365,.21,.245);vacuole.position.set(-.09,-.015,0);root.add(vacuole);
   const membrane=part(ctx,root,G.torus(.255,.009,8,72),[-.09,.09,0],.94,.4);membrane.rotation.x=Math.PI/2;membrane.scale.x=1.42;
   const nucleus=part(ctx,root,G.ellipsoid(.082,.07,.067,30,22),[.39,-.075,-.07],.88,.45);
   void nucleus;
   if(!intact){
    for(let i=0;i<8;i++)part(ctx,root,G.ellipsoid(.018,.035,.011,12,10),[.46+random()*.14,-.1+random()*.3,-.19+random()*.3],.75);
   }
   const particles:{mesh:THREE.Mesh;from:V3;to:V3;family:number}[]=[];
   for(let i=0;i<46;i++){
    const family=i%2,angle=random()*Math.PI*2,radius=Math.sqrt(random());
    const from:V3=family===0?[-.16+Math.cos(angle)*radius*.18,-.12+random()*.19,Math.sin(angle)*radius*.14]:[.37+Math.cos(angle)*radius*.065,-.13+random()*.2,.12+Math.sin(angle)*radius*.07];
    const to:V3=[-.38+random()*.82,-.13+random()*.24,-.22+random()*.44];
    const shape=family?G.ellipsoid(.019,.029,.016,12,8):G.ellipsoid(.014,.013,.014,12,8);
    const mesh=part(ctx,root,shape,from,family?.98:.5,family?.55:.72);particles.push({mesh,from,to,family});
   }
   return {root,grounded:false,update(c){
    const mix=clamp(c.mix??(state==='mixed'?1:0));vacuole.scale.set(.365,.21*(1-.32*mix),.245);membrane.visible=mix<.6;
    for(const p of particles)p.mesh.position.set(lerp(p.from[0],p.to[0],mix),lerp(p.from[1],p.to[1],mix),lerp(p.from[2],p.to[2],mix));
   }};
  },
 });
}
export const onionCellSeparated=cell('onion-cell-separated-cutaway','separated');
export const onionCellRuptured=cell('onion-cell-ruptured-cutaway','ruptured');
export const onionCellMixed=cell('onion-cell-mixed-cutaway','mixed');

/** A supported source exterior and an authored continuous cut face, in the SAME fitted coordinates. */
export const onionCutHalf=defineModel({
 id:'onion-cut-half',
 describe:'Plain recognisable onion half: licensed yellow-onion scan exterior, cut along its centre, with a continuous solid layered flesh face fitted to the actual source intersection. The interior is an authored explanatory cross-section, not photographed interior evidence. No floating torus rings or giant plates. Flat cut faces forward (+Z); held supported on its base when grounded.',
 params:{height:'metres, default .5'},size:'.5 m explanatory onion half',
 build(ctx){
  const root=new THREE.Group(),body=source(ctx,'yellow_onion',.5);root.add(body);root.updateMatrixWorld(true);
  // A prepared bulb has its dry neck trimmed; slice intersecting triangles rather
  // than dropping whole faces and leaving a scalloped/jagged boundary.
  clipStaticSourcePlane(root,new THREE.Plane(new THREE.Vector3(0,-1,0),.12));
  const points:THREE.Vector2[]=[],inverse=root.matrixWorld.clone().invert();
  root.traverse(o=>{
   const m=o as THREE.Mesh;if(!m.isMesh)return;const g=m.geometry,p=g.getAttribute('position'),index=g.index;
   const vertex=(i:number)=>new THREE.Vector3().fromBufferAttribute(p,index?index.getX(i):i).applyMatrix4(m.matrixWorld).applyMatrix4(inverse);
   for(let i=0;i<(index?.count??p.count);i+=3){const tri=[vertex(i),vertex(i+1),vertex(i+2)];
    for(let j=0;j<3;j++){const a=tri[j]!,b=tri[(j+1)%3]!;if((a.z<0)===(b.z<0)||Math.abs(a.z-b.z)<1e-10)continue;const u=-a.z/(b.z-a.z);points.push(new THREE.Vector2(lerp(a.x,b.x,u),lerp(a.y,b.y,u)));}
   }
  });
  points.sort((a,b)=>a.x-b.x||a.y-b.y);
  const cross=(a:THREE.Vector2,b:THREE.Vector2,c:THREE.Vector2)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  const lower:THREE.Vector2[]=[],upper:THREE.Vector2[]=[];
  for(const p of points){while(lower.length>=2&&cross(lower.at(-2)!,lower.at(-1)!,p)<=0)lower.pop();lower.push(p);}
  for(const p of [...points].reverse()){while(upper.length>=2&&cross(upper.at(-2)!,upper.at(-1)!,p)<=0)upper.pop();upper.push(p);}
  const contour=[...lower.slice(0,-1),...upper.slice(0,-1)];if(contour.length<3)throw new Error('Onion cut plane did not intersect source geometry');
  // Clip in fitted root coordinates, not the source mesh's original scale.
  clipStaticSourcePlane(root,new THREE.Plane(new THREE.Vector3(0,0,-1),0));
  const centre=contour.reduce((sum,p)=>sum.add(p),new THREE.Vector2()).multiplyScalar(1/contour.length);
  const minY=Math.min(...contour.map(p=>p.y)),maxY=Math.max(...contour.map(p=>p.y));centre.y=minY+(maxY-minY)*.15;
  const ring=(scale:number)=>contour.map(p=>new THREE.Vector2(centre.x+(p.x-centre.x)*scale,centre.y+(p.y-centre.y)*scale));
  const radii=[1,.985,.86,.85,.71,.70,.55,.54,.39,.38,.24,.23,.10,.09,0];
  for(let i=0;i<radii.length-1;i++){
   const shape=new THREE.Shape(ring(radii[i]!));if(radii[i+1]!>0)shape.holes.push(new THREE.Path(ring(radii[i+1]!).reverse()));
   const flesh=ctx.mesh(new THREE.ShapeGeometry(shape),{tone:i%2?.96:.28,rough:.62});flesh.position.z=.0015;root.add(flesh);
  }
  root.traverse(o=>{const m=o as THREE.Mesh;if(m.isMesh)for(const material of Array.isArray(m.material)?m.material:[m.material])onionDensityMaterial(material);});
  const size=ctx.num('height',.5,.1,2),bounds=new THREE.Box3().setFromObject(root,true);root.scale.setScalar(size/Math.max(.01,bounds.max.y-bounds.min.y));
  return {root,grounded:false};
 },
});
