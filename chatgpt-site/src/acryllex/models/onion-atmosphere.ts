import * as THREE from 'three';
import {defineModel} from './types.ts';
import {portrait} from './portrait.ts';
import {clamp,lerp,rng,smooth} from '../kit.ts';

type V3=[number,number,number];
const vector=(value:unknown,fallback:V3):V3=>Array.isArray(value)&&value.length===3&&value.every(Number.isFinite)?value as V3:fallback;

/** Filled silhouette, deliberately without an inner contour or stroke geometry. */
export function filledTeardropGeometry(rx:number,ry:number){
 const shape=new THREE.Shape();shape.moveTo(0,ry);shape.bezierCurveTo(-rx*.22,ry*.55,-rx,-ry*.02,-rx,-ry*.30);shape.bezierCurveTo(-rx,-ry*.76,-rx*.52,-ry,0,-ry);shape.bezierCurveTo(rx*.52,-ry,rx,-ry*.76,rx,-ry*.30);shape.bezierCurveTo(rx,-ry*.02,rx*.22,ry*.55,0,ry);
 return new THREE.ShapeGeometry(shape,24);
}

/** Diffuse airborne tracers: numerous tiny independent pixels, never an eye-targeted line. */
export const gasPixelMist=defineModel({
 id:'gas-pixel-mist',
 describe:'Numerous tiny glimmering pixels spread throughout a broad air volume around the onion and face, like a faint diffuse mist. Never a straight line or a stream aimed at the eye. The real gas is invisible; these are explanatory tracers. Set object pos:[0,0,0], origin:model for absolute scene coordinates.',
 params:{from:'emission point [x,y,z]',to:'eye contact point only for local clearing, not a travel line',center:'centre of the diffuse airborne volume',radius:'[x,y,z] ellipsoid radii, default [.8,.7,.3]',count:'120..800 tiny motes, default420',pixelSize:'tiny mote edge .003..008m, default.0055',speed:'slow air drift, default.12',clearRadius:'local wet-eye clearing radius, default.11'},
 controls:{progress:'0 hidden ..1 diffuse air occupancy; never collapses positions into a wedge',density:'0 hidden ..1 default occupancy',clearance:'clears only motes immediately beside the wet eye; gas elsewhere remains'},defaults:{progress:1,density:1,clearance:0},size:'diffuse surrounding air',
 build(ctx){
  const root=new THREE.Group(),random=rng(ctx.seed+971),from=vector(ctx.params.from,[-.46,-.38,.04]),eye=vector(ctx.params.to,[.17,.34,.26]);
  const centre=vector(ctx.params.center,[-.04,.10,.30]),radius=vector(ctx.params.radius,[.8,.7,.3]);
  const count=Math.round(ctx.num('count',420,120,800)),size=ctx.num('pixelSize',.0055,.003,.008),speed=ctx.num('speed',.12,.03,.35),clearRadius=ctx.num('clearRadius',.11,.04,.2);
  // Independent visibility/size phases supply the glimmer; emissive glow would
  // enable the scene-wide halo sampler and change the onion's surface grain.
  const geometry=new THREE.BoxGeometry(size,size,size*.35),material=ctx.mat({tone:.95,rough:1});
  // Illustrative airborne tracers must not turn into solid depth occluders:
  // their depth otherwise produces large AO blotches on the onion and face.
  material.depthWrite=false;
  const motes=Array.from({length:count},()=>{
   const z=random()*2-1,a=random()*Math.PI*2,r=Math.cbrt(random()),xy=Math.sqrt(1-z*z);
   const mesh=new THREE.Mesh(geometry,material);root.add(mesh);
   return {mesh,target:[centre[0]+r*xy*Math.cos(a)*radius[0],centre[1]+r*z*radius[1],centre[2]+r*xy*Math.sin(a)*radius[2]] as V3,phase:random(),a:random()*Math.PI*2,b:random()*Math.PI*2,threshold:random()};
  });
  return {root,grounded:false,framingPoints:[],update(c,t){
   const progress=clamp(c.progress??1),density=clamp(c.density??1),clearance=clamp(c.clearance??0),expand=1;
   for(const mote of motes){
    const phase=((t*speed+mote.phase)%1+1)%1;
    const dx=.025*Math.sin(t*.41+mote.a),dy=.03*Math.sin(t*.31+mote.b),dz=.018*Math.sin(t*.29+mote.a);
    const x=lerp(from[0],mote.target[0],expand)+dx*expand,y=lerp(from[1],mote.target[1],expand)+dy*expand,z=lerp(from[2],mote.target[2],expand)+dz*expand;
    const distance=Math.hypot(x-eye[0],y-eye[1],z-eye[2]),local=1-smooth(clamp((distance-clearRadius*.55)/(clearRadius*.45)));
    mote.mesh.visible=progress>.01&&mote.threshold<density*Math.sqrt(progress)*(1-clearance*local)&&phase>.10&&phase<.94;
    mote.mesh.position.set(x,y,z);mote.mesh.scale.setScalar(.65+.35*Math.sin(Math.PI*clamp((phase-.1)/.84)));
   }
  }};
 },
});

/** Authored tear geometry on a plain source-backed bust; no expressions or invented scan rig. */
export const neutralTearingFace=defineModel({
 id:'neutral-tearing-face',
 describe:'Ordinary neutral front-facing modelled head and neck from the bundled CC0 MakeHuman anatomical source, with unchanged static eye geometry and no jewellery or emotional acting. The lower bust fades smoothly into black. Owner-selected tear treatment: two clearly visible, fully filled pixel teardrop silhouettes on the cheeks, slightly asymmetric and source-seated, with a small downward reveal. No water inside the eyes, wet film, menisci, bright eyelid margins, hollow outlines or long tear tracks. The drops are an intentional illustrative abstraction, not a physiological liquid simulation. Keep the face frontal. Source-derived eye anchor is approximately [-.0851,.1863,.3249] times height, plus object placement.',
 params:{height:'total bust height metres, default1',tone:'source-face density .2..1, default.72',tearSize:'filled teardrop size .6..1.6, default1; make drops clearly readable',tearWidth:'legacy alias for tearSize'},
 controls:{tears:'0 no drops ..1 two fully revealed, filled pixel teardrops; does not change eyes or add a water film'},defaults:{tears:0},size:'1 m explanatory bust',
 build(ctx){
  const height=ctx.num('height',1,.3,2),dropSize=ctx.num('tearSize',ctx.num('tearWidth',1,.6,1.5),.6,1.6);
  const bust=portrait.build({...ctx,params:{source:'anatomical',height:1,detail:0,neckCut:.2},num:(key,f,min=-Infinity,max=Infinity)=>key==='height'?1:key==='detail'?0:key==='neckCut'?.2:Math.max(min,Math.min(max,Number(ctx.params[key]??f)))});
  const root=new THREE.Group();root.add(bust.root);bust.root.updateMatrixWorld(true);
  const ray=new THREE.Raycaster(),surfaces:THREE.Object3D[]=[],eyePoints=[new THREE.Box3(),new THREE.Box3()];
  bust.root.traverse(o=>{
   const m=o as THREE.Mesh;if(!m.isMesh)return;
   if(!/hair|eyelash/i.test(m.name))surfaces.push(m);
   if(/eyelash|^eyes$/i.test(m.name)){
    const p=m.geometry.getAttribute('position');
    for(let i=0;i<p.count;i++){const v=new THREE.Vector3();if((m as THREE.SkinnedMesh).isSkinnedMesh)(m as THREE.SkinnedMesh).getVertexPosition(i,v);else v.fromBufferAttribute(p,i);v.applyMatrix4(m.matrixWorld);eyePoints[v.x<0?0:1]!.expandByPoint(v);}
   }
  });
  const contact=(x:number,y:number)=>{root.updateWorldMatrix(true,false);const inverse=root.matrixWorld.clone().invert(),origin=root.localToWorld(new THREE.Vector3(x,y,3)),direction=new THREE.Vector3(0,0,-1).transformDirection(root.matrixWorld);ray.set(origin,direction);const hit=ray.intersectObjects(surfaces,false)[0];if(!hit)throw new Error(`Neutral tear face: no source-surface contact at ${x},${y}`);return hit.point.clone().applyMatrix4(inverse).add(new THREE.Vector3(0,0,.006));};
  const landmarks=eyePoints.map((box,i)=>{
   if(box.isEmpty()){const side=i?1:-1;return {inner:side*.055,outer:side*.15,centre:side*.105,y:.16,lower:.145};}
   const size=box.getSize(new THREE.Vector3());return {inner:i?box.min.x:box.max.x,outer:i?box.max.x:box.min.x,centre:(box.min.x+box.max.x)/2,y:(box.min.y+box.max.y)/2,lower:(box.min.y+box.max.y)/2-.012};
  });
  if(ctx.params.debugSource===true)console.warn('neutral-face-source-landmarks '+JSON.stringify(landmarks));
  // Screen-space density fade follows projected bust landmarks, independent of
  // a skinned source's bind matrices. It hides the actual truncated base.
  const fadeBottom={value:0},fadeTop={value:1};
  bust.root.traverse(o=>{
   const mesh=o as THREE.Mesh;if(!mesh.isMesh)return;
   const previousRender=mesh.onBeforeRender;
   mesh.onBeforeRender=function(renderer,scene,camera,...rest){
    previousRender.call(this,renderer,scene,camera,...rest);
    const pixels=renderer.getRenderTarget()?.height??renderer.getSize(new THREE.Vector2()).y;
    const project=(y:number)=>root.localToWorld(new THREE.Vector3(0,y,0)).project(camera).y;
    fadeBottom.value=(project(-.40)+1)*.5*pixels;fadeTop.value=(project(-.08)+1)*.5*pixels;
   };
   for(const mat of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
    const previous=mat.onBeforeCompile,key=mat.customProgramCacheKey.bind(mat);
    mat.onBeforeCompile=(shader,renderer)=>{
     previous.call(mat,shader,renderer);shader.uniforms.neutralFadeBottom=fadeBottom;shader.uniforms.neutralFadeTop=fadeTop;
     shader.fragmentShader='uniform float neutralFadeBottom,neutralFadeTop;\n'+shader.fragmentShader;
     shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`float bustFade=smoothstep(neutralFadeBottom,neutralFadeTop,gl_FragCoord.y);
      float bustNoise=fract(sin(dot(floor(gl_FragCoord.xy/2.),vec2(12.9898,78.233)))*43758.5453);
      if(bustFade<.005||bustNoise>bustFade)discard;
      outgoingLight*=bustFade;
      #include <opaque_fragment>`);
    };
    mat.customProgramCacheKey=()=>key()+'|neutral-bust-projected-fade-v2';
   }
  });
  // Owner direction: filled pixel teardrops only. The eyes never gain water,
  // menisci, wet-film layers, bright outlines or tear-track geometry.
  const dropsRoot=new THREE.Group(),gaze=new THREE.Group();root.add(dropsRoot,gaze);
  const irises:THREE.Mesh[]=[];
  for(let i=0;i<2;i++){const iris=ctx.mesh(new THREE.CircleGeometry(.017,32),{tone:.28,rough:.6}),pupil=ctx.mesh(new THREE.CircleGeometry(.008,24),{tone:.025,rough:.6});gaze.add(iris,pupil);irises.push(iris,pupil);}
  // High uniform radiance saturates dot coverage inside the silhouette. The
  // shared post pass still supplies the exact scene ink, pitch and edge optics.
  const dropMaterial=new THREE.MeshBasicMaterial({color:new THREE.Color(2,2,2),side:THREE.DoubleSide,toneMapped:false});dropMaterial.userData={tone:1,explicit:true};
  const drops=landmarks.map((_,index)=>{const mesh=new THREE.Mesh(new THREE.BufferGeometry(),dropMaterial);dropsRoot.add(mesh);return {mesh,index,bx:0,by:0,tip:new THREE.Vector3(),ready:false};});
  const seatDrops=()=>{
   root.updateWorldMatrix(true,true);const inverse=root.matrixWorld.clone().invert(),boxes=[new THREE.Box3(),new THREE.Box3()];
   bust.root.traverse(o=>{const m=o as THREE.Mesh;if(!m.isMesh||!/eyelash|^eyes$/i.test(m.name))return;const positions=m.geometry.getAttribute('position');for(let i=0;i<positions.count;i++){const v=new THREE.Vector3();if((m as THREE.SkinnedMesh).isSkinnedMesh)(m as THREE.SkinnedMesh).getVertexPosition(i,v);else v.fromBufferAttribute(positions,i);v.applyMatrix4(m.matrixWorld).applyMatrix4(inverse);boxes[v.x<0?0:1]!.expandByPoint(v);}});
   for(const drop of drops){
    const index=drop.index,side=index?1:-1,box=boxes[index]!;
    if(!box.isEmpty())Object.assign(landmarks[index]!,{inner:index?box.min.x:box.max.x,outer:index?box.max.x:box.min.x,centre:(box.min.x+box.max.x)/2,y:(box.min.y+box.max.y)/2,lower:(box.min.y+box.max.y)/2-.012});
    const eye=landmarks[index]!,centre=contact(eye.centre,eye.y);irises[index*2]!.position.copy(centre).add(new THREE.Vector3(0,0,.001));irises[index*2+1]!.position.copy(centre).add(new THREE.Vector3(0,0,.002));
    const rx=.010*dropSize*(index?.82:1),ry=.016*dropSize*(index?.88:1);
    drop.bx=lerp(eye.inner,eye.centre,index?.38:.24)+side*.002;drop.by=eye.lower-(index?.034:.030);drop.tip=contact(drop.bx,eye.lower-.009);
    const geometry=filledTeardropGeometry(rx,ry),positions=geometry.getAttribute('position'),base=contact(drop.bx,drop.by);
    for(let i=0;i<positions.count;i++){const x=positions.getX(i),y=positions.getY(i),surface=contact(drop.bx+x,drop.by+y);positions.setXYZ(i,x,y,surface.z-base.z+.006);}
    geometry.computeVertexNormals();drop.mesh.geometry.dispose();drop.mesh.geometry=geometry;drop.mesh.position.copy(base);drop.ready=true;
   }
  };
  root.scale.setScalar(height);
  const leftEye=contact(landmarks[0]!.centre,landmarks[0]!.y).multiplyScalar(height),rightEye=contact(landmarks[1]!.centre,landmarks[1]!.y).multiplyScalar(height);
  // Surface queries populate skinned bounds before the engine places the bust.
  // Keep those temporary bounds from culling the face after its scene transform.
  bust.root.traverse(o=>{const m=o as THREE.SkinnedMesh;if(m.isSkinnedMesh){m.frustumCulled=false;const queried=m as unknown as {boundingBox:THREE.Box3|null;boundingSphere:THREE.Sphere|null};queried.boundingBox=null;queried.boundingSphere=null;}});
  if(ctx.params.debugSource===true)console.warn('neutral-face-eye-anchors '+JSON.stringify({left:leftEye.toArray(),right:rightEye.toArray()}));
  return {root,grounded:false,onPlaced:seatDrops,framingPoints:[new THREE.Vector3(-.45,-.5,-.4),new THREE.Vector3(.45,.5,.45)].map(p=>p.multiplyScalar(height)),anchors:{leftEye:leftEye.toArray() as V3,rightEye:rightEye.toArray() as V3},update(c){
   const tears=clamp(c.tears??0);dropsRoot.visible=tears>.01;
   for(const drop of drops){const level=clamp((tears-(drop.index?.10:0))/(drop.index?.90:1)),growth=Math.sqrt(smooth(level));drop.mesh.visible=growth>.08;drop.mesh.scale.setScalar(growth);if(drop.ready){const fall=.025*smooth(clamp((level-.35)/.65)),base=contact(drop.bx,drop.by-fall);drop.mesh.position.copy(drop.tip).lerp(base,growth);}}
  }};
 },
});
