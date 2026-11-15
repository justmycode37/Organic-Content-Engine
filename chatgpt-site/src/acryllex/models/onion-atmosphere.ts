import * as THREE from 'three';
import {defineModel} from './types.ts';
import {portrait} from './portrait.ts';
import {clamp,lerp,rng,smooth} from '../kit.ts';

type V3=[number,number,number];
const vector=(value:unknown,fallback:V3):V3=>Array.isArray(value)&&value.length===3&&value.every(Number.isFinite)?value as V3:fallback;

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
  const geometry=new THREE.BoxGeometry(size,size,size*.35),material=ctx.mat({tone:.95,rough:1,glow:.08});
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
 describe:'Ordinary neutral front-facing modelled head and neck from the bundled CC0 MakeHuman anatomical source, with its original neutral eye geometry and no jewellery or dramatic emotional performance. The lower bust fades smoothly to black. Restrained lower-lid menisci and small source-conforming tear beads with narrow fixed-ink optical edges follow raycast source surfaces, controlled by tears; no long cheek tracks. This is a 3D explanation, not filmed physiology or a blink/expression rig. Keep the face front-facing. Source-derived left eye anchor is approximately [-.0851,.1863,.3249] times height, right [.0851,.1863,.3249] times height, plus object placement. Landmarks come from the original eyeball geometry and projected surfaces. Iris/pupil discs and wetness are authored explanatory surface details; no eyelid animation is invented.',
 params:{height:'total bust height in metres, default 1; keep proportions',tone:'source-face surface density multiplier .2..1, default .72; tune material density rather than global style calibration',tearWidth:'restrained tear-film width multiplier .6..1.5, clamped to that range; default 1'},
 controls:{tears:'0 dry neutral face ..1 seated lower-lid wetness and small attached canthus beads'},defaults:{tears:0},size:'1 m explanatory bust',
 build(ctx){
  const height=ctx.num('height',1,.3,2),width=ctx.num('tearWidth',1,.6,1.5);
  const bust=portrait.build({...ctx,params:{source:'anatomical',height:1,detail:0,neckCut:.2},num:(key,f,min=-Infinity,max=Infinity)=>key==='height'?1:key==='detail'?0:key==='neckCut'?.2:Math.max(min,Math.min(max,Number(ctx.params[key]??f)))});
  const root=new THREE.Group();root.add(bust.root);bust.root.updateMatrixWorld(true);
  const ray=new THREE.Raycaster(),surfaces:THREE.Object3D[]=[],eyePoints=[new THREE.Box3(),new THREE.Box3()];
  bust.root.traverse(o=>{
   const m=o as THREE.Mesh;if(!m.isMesh)return;
   if(/^eyes$/i.test(m.name)){const sclera=new THREE.MeshBasicMaterial({color:0x909090,alphaHash:true});sclera.userData={tone:.56,explicit:true};m.material=sclera;}
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
  const wet=new THREE.Group(),gaze=new THREE.Group();root.add(wet,gaze);const irises:THREE.Mesh[]=[],rims:THREE.Mesh[]=[];
  const highlight=new THREE.MeshBasicMaterial({color:0xd0d0d0,alphaHash:true});highlight.userData={tone:.82,explicit:true};
  for(let i=0;i<2;i++){const iris=ctx.mesh(new THREE.CircleGeometry(.017,32),{tone:.28,rough:.6}),pupil=ctx.mesh(new THREE.CircleGeometry(.008,24),{tone:.025,rough:.6});gaze.add(iris,pupil);irises.push(iris,pupil);}const films:{mesh:THREE.Mesh;geometry:THREE.BufferGeometry;kind:'lid'|'bead'}[]=[];
  const baseLiquid=ctx.mat({tone:.99,rough:.075});
  const liquid=new THREE.MeshPhysicalMaterial({color:baseLiquid.color.clone().multiplyScalar(.32),roughness:.035,metalness:0,clearcoat:1,clearcoatRoughness:.02,ior:1.333,specularIntensity:2});
  liquid.userData={...baseLiquid.userData,tone:.32};baseLiquid.dispose();
  for(const [eyeIndex,side] of [-1,1].entries()){
   const eye=landmarks[eyeIndex]!;
   // A seated lower-lid meniscus, followed by a small attached canthus bead.
   // No long glowing ropes down the cheeks or disconnected drops.
   const lid=Array.from({length:29},(_,i)=>{const u=i/28,x=lerp(eye.inner,eye.outer,u),y=eye.lower+.011*Math.pow(2*u-1,2);return contact(x,y);});
   const geometry=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(lid),84,.0048*width,8,false);
   const meniscus=new THREE.Mesh(geometry,highlight);wet.add(meniscus);films.push({mesh:meniscus,geometry,kind:'lid'});
   const beadGeometry=new THREE.SphereGeometry(1,20,16),bead=new THREE.Mesh(beadGeometry,liquid),rim=new THREE.Mesh(new THREE.BufferGeometry(),highlight);bead.add(rim);rims.push(rim);
   const at=contact(lerp(eye.inner,eye.centre,.10)+side*.004,eye.lower-.018);bead.position.copy(at);bead.scale.setScalar(1);wet.add(bead);films.push({mesh:bead,geometry:beadGeometry,kind:'bead'});
  }
  // Resolve the wet surfaces after the engine has placed the skinned source.
  // Source bind matrices are updated by that placement; pre-placement ray hits
  // are insufficient to guarantee contact on the actually rendered face.
  const seatWetness=()=>{
   root.updateWorldMatrix(true,true);const inverse=root.matrixWorld.clone().invert(),boxes=[new THREE.Box3(),new THREE.Box3()];
   bust.root.traverse(o=>{const m=o as THREE.Mesh;if(!m.isMesh||!/eyelash|^eyes$/i.test(m.name))return;const positions=m.geometry.getAttribute('position');for(let i=0;i<positions.count;i++){const v=new THREE.Vector3();if((m as THREE.SkinnedMesh).isSkinnedMesh)(m as THREE.SkinnedMesh).getVertexPosition(i,v);else v.fromBufferAttribute(positions,i);v.applyMatrix4(m.matrixWorld).applyMatrix4(inverse);boxes[v.x<0?0:1]!.expandByPoint(v);}});
   for(const [index,side] of [-1,1].entries()){
    const box=boxes[index]!;if(!box.isEmpty()){const size=box.getSize(new THREE.Vector3());Object.assign(landmarks[index]!,{inner:index?box.min.x:box.max.x,outer:index?box.max.x:box.min.x,centre:(box.min.x+box.max.x)/2,y:(box.min.y+box.max.y)/2,lower:(box.min.y+box.max.y)/2-.012});}
    const eye=landmarks[index]!,film=films[index*2]!,bead=films[index*2+1]!;const centre=contact(eye.centre,eye.y);irises[index*2]!.position.copy(centre).add(new THREE.Vector3(0,0,.001));irises[index*2+1]!.position.copy(centre).add(new THREE.Vector3(0,0,.002));
    const points=Array.from({length:29},(_,i)=>{const u=i/28;return contact(lerp(eye.inner,eye.outer,u),eye.lower+.011*Math.pow(2*u-1,2));});
    const geometry=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),84,.0048*width,8,false);geometry.setDrawRange(film.geometry.drawRange.start,film.geometry.drawRange.count);film.geometry.dispose();film.geometry=geometry;film.mesh.geometry=geometry;
    const bx=lerp(eye.inner,eye.centre,.10)+side*.004,by=eye.lower-.0195*width,base=contact(bx,by),top=contact(bx,eye.lower);
    const rx=.010*width,ry=.019*width,rz=.008;
    const drop=new THREE.SphereGeometry(1,20,16),positions=drop.getAttribute('position');
    for(let k=0;k<positions.count;k++){
     const nx=positions.getX(k),ny=positions.getY(k),nz=positions.getZ(k),taper=1-.62*Math.pow(Math.max(0,ny),1.4),x=bx+nx*rx*taper,y=by+ny*ry,surface=contact(x,y);
     positions.setXYZ(k,x-base.x,y-base.y,surface.z-base.z+Math.max(0,nz)*rz);
    }
    drop.computeVertexNormals();bead.geometry.dispose();bead.geometry=drop;bead.mesh.geometry=drop;bead.mesh.position.copy(base);bead.mesh.userData.tearBase=base;bead.mesh.userData.tearTop=top;
    // A tiny optical edge is expressed as denser fixed ink, with no emissive halo.
    const ridge=Array.from({length:19},(_,k)=>{const v=.75-k/18*1.5,x=bx+rx*.62*Math.sqrt(1-v*v)*(1-.62*Math.pow(Math.max(0,v),1.4)),y=by+ry*v,surface=contact(x,y);return new THREE.Vector3(x-base.x,y-base.y,surface.z-base.z+rz*.72*Math.sqrt(1-v*v));});
    const edge=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ridge),40,.0018*width,6,false);rims[index]!.geometry.dispose();rims[index]!.geometry=edge;
   }
   if(ctx.params.debugSource===true)console.warn('neutral-face-seated-landmarks '+JSON.stringify(landmarks));
  };
  root.scale.setScalar(height);
  const leftEye=contact(landmarks[0]!.centre,landmarks[0]!.y).multiplyScalar(height),rightEye=contact(landmarks[1]!.centre,landmarks[1]!.y).multiplyScalar(height);
  // Surface queries populate skinned bounds before the engine places the bust.
  // Keep those temporary bounds from culling the face after its scene transform.
  bust.root.traverse(o=>{const m=o as THREE.SkinnedMesh;if(m.isSkinnedMesh){m.frustumCulled=false;const queried=m as unknown as {boundingBox:THREE.Box3|null;boundingSphere:THREE.Sphere|null};queried.boundingBox=null;queried.boundingSphere=null;}});
  if(ctx.params.debugSource===true)console.warn('neutral-face-eye-anchors '+JSON.stringify({left:leftEye.toArray(),right:rightEye.toArray()}));
  return {root,grounded:false,onPlaced:seatWetness,framingPoints:[new THREE.Vector3(-.45,-.5,-.4),new THREE.Vector3(.45,.5,.45)].map(p=>p.multiplyScalar(height)),anchors:{leftEye:leftEye.toArray() as V3,rightEye:rightEye.toArray() as V3},update(c){
   const tears=clamp(c.tears??0);wet.visible=tears>.01;
   for(const film of films){const amount=film.kind==='lid'?smooth(clamp(tears/.55)):smooth(clamp((tears-.45)/.55));film.mesh.visible=amount>.015;if(film.kind==='lid')film.geometry.setDrawRange(0,Math.floor((film.geometry.index?.count??0)*amount/6)*6);else{const growth=Math.sqrt(amount);film.mesh.scale.setScalar(growth);const base=film.mesh.userData.tearBase as THREE.Vector3|undefined,top=film.mesh.userData.tearTop as THREE.Vector3|undefined;if(base&&top)film.mesh.position.copy(top).lerp(base,growth);}}
  }};
 },
});
