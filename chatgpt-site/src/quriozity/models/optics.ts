import * as THREE from 'three';
import {clamp,deg,G} from '../kit.ts';
import {defineModel,type ModelCtx} from './types.ts';
import {refractDirection} from './dielectric.ts';
export {refractDirection,type RefractionResult} from './dielectric.ts';

type Vec3=readonly[number,number,number];
const TAU=Math.PI*2,UP=new THREE.Vector3(0,1,0);
const REFRACTION_SOURCE='https://openstax.org/books/university-physics-volume-3/pages/1-3-refraction';
const TIR_SOURCE='https://openstax.org/books/university-physics-volume-3/pages/1-4-total-internal-reflection';

function vector(value:unknown,fallback:Vec3,label:string){
 if(value===undefined)return new THREE.Vector3(...fallback);
 if(!Array.isArray(value)||value.length!==3||value.some(n=>typeof n!=='number'||!Number.isFinite(n)))throw new Error(`${label} must be a finite [x,y,z] vector`);
 return new THREE.Vector3(value[0],value[1],value[2]);
}
function unit(value:THREE.Vector3,label:string){
 if(!value.toArray().every(Number.isFinite)||value.lengthSq()<1e-20)throw new Error(`${label} must be a finite nonzero vector`);
 return value.clone().normalize();
}
function index(value:number,label:string){if(!Number.isFinite(value)||value<=0)throw new Error(`${label} must be a finite positive refractive index`);return value;}

/** The image of one submerged point, back-projected through a flat water/air interface to its vertical plane.
 * The interface hit is solved from Snell's law, rather than using a constant arbitrary bend angle.
 * This is one fixed-view apparent-depth construction; it excludes cylindrical glass-wall refraction.
 */
export function apparentWaterPoint(point:THREE.Vector3,observer:THREE.Vector3,level:number,nWater=1.333,nAir=1.0003,out=new THREE.Vector3()){
 if(!point.toArray().every(Number.isFinite)||!observer.toArray().every(Number.isFinite)||!Number.isFinite(level))throw new Error('Water projection requires finite positions and level');
 index(nWater,'water index');index(nAir,'air index');
 if(observer.y<=level)throw new Error('Water projection observer must be above the water surface');
 if(point.y>=level)return out.copy(point);
 const depth=level-point.y,airHeight=observer.y-level,horizontal=Math.hypot(observer.x-point.x,observer.z-point.z);
 if(horizontal<1e-9)return out.set(point.x,level-depth*nAir/nWater,point.z);
 let lo=0,hi=horizontal;
 for(let i=0;i<64;i++){
  const a=(lo+hi)*.5,b=horizontal-a;
  const error=nWater*a/Math.hypot(a,depth)-nAir*b/Math.hypot(b,airHeight);
  if(error>0)hi=a;else lo=a;
 }
 const under=(lo+hi)*.5,above=horizontal-under;
 const apparentDepth=above>1e-12?under*airHeight/above:depth*nAir/nWater;
 return out.set(point.x,level-apparentDepth,point.z);
}

/** A single profile surface. Stable position buffers allow continuous fill changes and deterministic seeking. */
function revolved(profileCount:number,segments=112){
 const geometry=new THREE.BufferGeometry(),vertices=new Float32Array(profileCount*(segments+1)*3),uv=new Float32Array(profileCount*(segments+1)*2),indices:number[]=[];
 for(let p=0;p<profileCount;p++)for(let s=0;s<=segments;s++){
  const k=p*(segments+1)+s;uv[k*2]=s/segments;uv[k*2+1]=p/(profileCount-1);
  if(p<profileCount-1&&s<segments){const a=k,b=k+segments+1;indices.push(a,a+1,b,a+1,b+1,b);}
 }
 geometry.setAttribute('position',new THREE.BufferAttribute(vertices,3));geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));geometry.setIndex(indices);
 return {geometry,write(profile:readonly(readonly[number,number])[]){
  if(profile.length!==profileCount)throw new Error('Optical lathe profile changed topology');
  for(let p=0;p<profileCount;p++)for(let s=0;s<=segments;s++){
   const k=(p*(segments+1)+s)*3,a=s/segments*TAU;vertices[k]=profile[p][0]*Math.sin(a);vertices[k+1]=profile[p][1];vertices[k+2]=profile[p][0]*Math.cos(a);
  }
  geometry.attributes.position.needsUpdate=true;geometry.computeVertexNormals();
  const normals=geometry.attributes.normal;
  for(let p=0;p<profileCount;p++){
   const a=p*(segments+1),b=a+segments,nx=normals.getX(a)+normals.getX(b),ny=normals.getY(a)+normals.getY(b),nz=normals.getZ(a)+normals.getZ(b),length=Math.hypot(nx,ny,nz)||1;
   normals.setXYZ(a,nx/length,ny/length,nz/length);normals.setXYZ(b,nx/length,ny/length,nz/length);
  }
  normals.needsUpdate=true;geometry.computeBoundingBox();geometry.computeBoundingSphere();
 }};
}
function opacity(mesh:THREE.Mesh,amount:number){
 const material=mesh.material as THREE.MeshStandardMaterial;
 material.opacity=amount;material.alphaHash=false;material.transparent=true;material.depthWrite=false;
 // The ordinary engine reveal multiplies this authored opacity; no shader or look settings are changed.
 material.userData.baseOpacity=amount;mesh.castShadow=false;
 return mesh;
}
function name(mesh:THREE.Mesh,label:string){mesh.name=label;return mesh;}
function rod(ctx:ModelCtx,radius:number,label:string,tone=1){
 const mesh=name(ctx.mesh(new THREE.CylinderGeometry(radius,radius,1,16,1,false),{tone,rough:.45}),label);mesh.geometry.translate(0,.5,0);return mesh;
}
function aim(mesh:THREE.Object3D,a:THREE.Vector3,b:THREE.Vector3,portion=1){
 const delta=new THREE.Vector3().subVectors(b,a),length=delta.length();mesh.position.copy(a);
 if(length>1e-12)mesh.quaternion.setFromUnitVectors(UP,delta.divideScalar(length));
 mesh.scale.set(1,Math.max(1e-10,length*portion),1);mesh.visible=length>1e-10&&portion>1e-6;
}

/** Hollow rigid straw, with actual wall thickness and a dark interior instead of a solid capped rod. */
function strawTube(ctx:ModelCtx,radius:number,length:number,label:string,tone=.94){
 const wall=radius*.16,profile:[number,number][]=[[radius-wall,0],[radius,0],[radius,length],[radius-wall,length],[radius-wall,0]];
 const geometry=G.lathe(profile,40),mesh=name(ctx.mesh(geometry,{tone,rough:.42,side:THREE.DoubleSide}),label);
 return mesh;
}

export const waterGlass=defineModel({
 id:'water-glass',aliases:['straw-in-water','glass-of-water','drinking-glass','water-tumbler','refraction-glass'],
 describe:'A proportioned tapered drinking glass with a closed inner/outer wall, thick rounded base, rolled rim, visible water body and curved meniscus. A single rigid hollow straw is physically straight; its submerged image follows the actual render camera using Snell-law apparent depth when a ray can leave the water surface. Side/below-water views keep the physical straight straw. This is a planar optical approximation, not ray tracing of the cylindrical glass. No automatic ripples, bobbing or pulsing.',
 params:{height:'glass height metres (default .145)',radius:'rim outer radius metres (default .041)',taper:'bottom / top radius (default .88)',wall:'glass wall thickness metres (default .0017)',base:'interior floor height metres (default .0065)',fill:'initial water fill 0..1 (default .64); control fill overrides it',straw:'include one straight hollow straw (default true)',strawRadius:'outer straw radius metres (default .0027)',strawTilt:'rigid straw tilt from vertical degrees (default 18, -28..28)',strawYaw:'straw tilt azimuth degrees (default 0: tilts along x)',strawLength:'rigid straw length metres (default height*1.58)',refraction:'true (default) apparent-depth submerged image; false draws the entire straight straw',observer:'fallback optical observer [x,y,z] in MODEL coordinates for non-rendered previews; normal rendering derives the actual camera viewpoint automatically',waterIOR:'positive refractive index (default 1.333)',airIOR:'positive refractive index (default 1.0003)'},
 controls:{fill:'0 empty ..1 near rim; continuous water level; defaults to params.fill or .64'},size:'.082 m diameter x .145 m height; straw reaches .23 m',
 build(ctx){
  const h=ctx.num('height',.145,.04,2),radius=ctx.num('radius',.041,h*.14,h*.6),taper=ctx.num('taper',.88,.65,1.1),wall=ctx.num('wall',.0017,radius*.015,radius*.12),base=ctx.num('base',h*.045,wall*1.2,h*.14),bottomR=radius*taper,lip=wall*.5;
  const floor=base,topLimit=h-wall*1.5,outerAt=(y:number)=>bottomR+(radius-bottomR)*clamp(y/(h-lip)),innerAt=(y:number)=>outerAt(y)-wall;
  const initialFill=ctx.num('fill',.64,0,1),includeStraw=ctx.bool('straw',true),refracted=ctx.bool('refraction',true),nWater=index(ctx.num('waterIOR',1.333,.1,5),'water index'),nAir=index(ctx.num('airIOR',1.0003,.1,5),'air index');
  const observer=vector(ctx.params.observer,[0,h*2.3,radius*15],'water-glass observer');
  const strawRadius=ctx.num('strawRadius',.0027,radius*.025,radius*.12),angle=deg(ctx.num('strawTilt',18,-28,28)),yaw=deg(ctx.num('strawYaw',0,-360,360)),length=ctx.num('strawLength',h*1.58,h*.9,h*2.5);
  const direction=new THREE.Vector3(Math.sin(angle)*Math.cos(yaw),Math.cos(angle),Math.sin(angle)*Math.sin(yaw)),strawBottom=new THREE.Vector3(-direction.x*h*.62,base+strawRadius*1.5,-direction.z*h*.62),strawTop=strawBottom.clone().addScaledVector(direction,length);
  // Guard absurd combinations rather than passing a visibly intersecting straw through the glass wall.
  const wallCross=strawBottom.clone().addScaledVector(direction,(h-strawBottom.y)/direction.y);
  if(includeStraw&&(Math.hypot(strawBottom.x,strawBottom.z)+strawRadius>=innerAt(strawBottom.y)||Math.hypot(wallCross.x,wallCross.z)+strawRadius>=radius-wall))throw new Error('water-glass straw intersects the vessel wall; reduce strawTilt or strawRadius');
  const root=new THREE.Group(),profile:[number,number][]=[[0,0],[bottomR-wall*.8,0],[bottomR-wall*.2,wall*.18],[bottomR,wall*.7]];
  for(let i=0;i<=24;i++){const y=wall*.7+(h-lip-wall*.7)*i/24;profile.push([outerAt(y),y]);}
  for(let i=1;i<=16;i++){const a=i/16*Math.PI;profile.push([radius-lip+lip*Math.cos(a),h-lip+lip*Math.sin(a)]);}
  for(let i=1;i<=24;i++){const y=(h-lip)+(base+wall-(h-lip))*i/24;profile.push([innerAt(y),y]);}
  profile.push([innerAt(base+wall)-wall*.15,base+wall*.4],[innerAt(base)-wall*.7,base],[0,base],[0,0]);
  const shell=opacity(name(ctx.mesh(G.lathe(profile,128),{tone:.96,rough:.11,side:THREE.DoubleSide}),'glass-inner-outer-wall'),.075);root.add(shell);
  const footProfile:[number,number][]=[[bottomR-wall*1.9,wall*.45],[bottomR-wall*.8,wall*.35],[bottomR-wall*.25,wall*.75],[bottomR-wall*.25,base*.6],[bottomR-wall*.9,base*.75],[bottomR-wall*1.9,base*.6],[bottomR-wall*1.9,wall*.45]];
  root.add(opacity(name(ctx.mesh(G.lathe(footProfile,112),{tone:.93,rough:.14}),'glass-thick-base-highlight'),.62));
  const rim=name(ctx.mesh(new THREE.TorusGeometry(radius-lip,lip*.82,12,128),{tone:1,rough:.1}),'glass-rounded-rim');rim.rotation.x=Math.PI/2;rim.position.y=h-lip;root.add(opacity(rim,.85));
  const volumeProfile: [number,number][]=Array.from({length:20},()=>[0,0]),surfaceProfile:[number,number][]=Array.from({length:18},()=>[0,0]);
  const volumeGeometry=revolved(volumeProfile.length),surfaceGeometry=revolved(surfaceProfile.length);
  const volume=opacity(name(ctx.mesh(volumeGeometry.geometry,{tone:.63,rough:.16,side:THREE.DoubleSide}),'water-volume'),.085);
  const surface=opacity(name(ctx.mesh(surfaceGeometry.geometry,{tone:.86,rough:.12,side:THREE.DoubleSide}),'water-surface-meniscus'),.38);root.add(volume,surface);
  const meniscus=name(ctx.mesh(new THREE.TorusGeometry(1,wall*.13/radius,8,128),{tone:.98,rough:.18}),'water-contact-line');meniscus.rotation.x=Math.PI/2;root.add(opacity(meniscus,.8));
  // A small continuous edge highlight sits inside the physical rim; the water still has a filled surface and volume.
  const airStraw=includeStraw?strawTube(ctx,strawRadius,1,'straw-above-water'):null,underwater=includeStraw?strawTube(ctx,strawRadius,1,'straw-submerged-image',.9):null;if(airStraw&&underwater)root.add(airStraw,underwater);
  const apparentBottom=new THREE.Vector3(),waterlinePoint=new THREE.Vector3(),renderObserver=new THREE.Vector3(),surfaceHit=new THREE.Vector3();let lastFill=NaN,waterLevel=0,waterRadius=0,wetLength=0;
  root.userData.optics={kind:'planar-Snell-apparent-depth',sources:[REFRACTION_SOURCE,TIR_SOURCE],limits:'Water/air plane only; no cylindrical wall lensing, caustics, dispersion or full light transport. Side/below-water views keep the physical straw; the apparent segment is a chord through the exact endpoint projection.',observer:observer.toArray(),observerSource:'fallback',projection:'straight',physicalStraw:{from:strawBottom.toArray(),to:strawTop.toArray(),straight:true},water:{ior:nWater,airIOR:nAir},glass:{height:h,radius,wall,base}};
  const anchors:Record<string,[number,number,number]>={top:[0,h,0],waterline:[0,floor+(topLimit-floor)*initialFill,0],strawTip:strawTop.toArray() as [number,number,number]};
  const updateWetView=(view:THREE.Vector3)=>{
   if(!underwater)return;
   let useProjection=refracted&&wetLength>1e-8&&view.y>waterLevel+1e-7;
   if(useProjection){
    apparentWaterPoint(strawBottom,view,waterLevel,nWater,nAir,apparentBottom);
    const u=(waterLevel-apparentBottom.y)/(view.y-apparentBottom.y);surfaceHit.copy(apparentBottom).lerp(view,u);
    // If the ray exits the side of the vessel, a top-plane construction is not physically applicable.
    useProjection=Math.hypot(surfaceHit.x,surfaceHit.z)<=waterRadius-strawRadius*.25;
   }
   if(!useProjection)apparentBottom.copy(strawBottom);
   aim(underwater,apparentBottom,waterlinePoint);underwater.visible=wetLength>1e-8&&lastFill>1e-6;
   underwater.updateMatrix();underwater.updateMatrixWorld(true);
   root.userData.optics.projection=useProjection?'Snell-top-surface':'straight-outside-planar-view';
  };
  if(underwater){
   underwater.frustumCulled=false;
   // Matrix changes here take effect in the current draw. Rewriting vertex buffers in this callback
   // would lag one frame, because WebGL uploads attributes before invoking onBeforeRender.
   underwater.onBeforeRender=(_renderer,_scene,camera)=>{
    camera.getWorldPosition(renderObserver);root.worldToLocal(renderObserver);updateWetView(renderObserver);
    root.userData.optics.observer=renderObserver.toArray();root.userData.optics.observerSource='render-camera';
   };
  }
  const update=(controls:Record<string,number>)=>{
   // A thin double-walled straw otherwise self-shadows across its entire bore at the shared shadow-map bias.
   if(airStraw){airStraw.castShadow=false;airStraw.receiveShadow=false;}if(underwater){underwater.castShadow=false;underwater.receiveShadow=false;}
   const input=controls.fill??initialFill;if(!Number.isFinite(input))throw new Error('water-glass fill must be finite');const fill=clamp(input);if(fill===lastFill)return;lastFill=fill;
   const level=floor+(topLimit-floor)*fill,meniscusRise=Math.min(wall*.55,(level-floor)*.3);
   waterLevel=level;waterRadius=innerAt(level)-wall*.12;volume.visible=surface.visible=meniscus.visible=fill>1e-6;anchors.waterline[1]=level;
   volumeProfile[0][0]=0;volumeProfile[0][1]=floor+wall*.05;
   for(let i=1;i<volumeProfile.length;i++){const y=floor+wall*.05+Math.max(0,level-floor-wall*.05)*(i-1)/(volumeProfile.length-2);volumeProfile[i][0]=innerAt(y)-wall*.12;volumeProfile[i][1]=y;}
   for(let i=0;i<surfaceProfile.length;i++){const q=1-i/(surfaceProfile.length-1);surfaceProfile[i][0]=waterRadius*q;surfaceProfile[i][1]=level+meniscusRise*Math.exp(-(1-q)/.035);}
   volumeGeometry.write(volumeProfile);surfaceGeometry.write(surfaceProfile);
   meniscus.position.y=level+meniscusRise;meniscus.scale.setScalar(waterRadius);
   if(airStraw&&underwater){
    wetLength=clamp((level-strawBottom.y)/direction.y,0,length);waterlinePoint.copy(strawBottom).addScaledVector(direction,wetLength);
    aim(airStraw,waterlinePoint,strawTop);updateWetView(observer);
   }
  };
  update({fill:initialFill});
  return {root,grounded:true,anchors,update};
 },
});

export const opticalRay=defineModel({
 id:'optical-ray',aliases:['snell-ray','refracted-ray','refraction-ray','scientific-light-ray'],
 describe:'A restrained thin optical path through a planar interface. The intersection and outgoing direction obey vector Snell law for the supplied normal and refractive indices; above the critical angle it reflects. This is a scientific diagram, not a visible beam in clear air. No glowing sheath, moving capsules or beat motion.',
 params:{from:'incident start [x,y,z] metres (default [-.14,.14,0])',direction:'nonzero incident travel direction (default [1,-1,0])',planePoint:'point on the optical interface (default [0,0,0])',normal:'nonzero interface normal; sign is corrected against incidence (default [0,1,0])',n1:'incident medium index (default 1.0003)',n2:'transmitted medium index (default 1.333)',length:'outgoing segment metres (default .20)',width:'thin tube radius metres (default .0012)',showNormal:'optional quiet dashed surface normal (default false)'},
 controls:{on:'0 hidden ..1 full path, one smooth draw when explicitly animated (default1)'},defaults:{on:1},size:'approximately .35 m path',
 build(ctx){
  const root=new THREE.Group(),origin=vector(ctx.params.from,[-.14,.14,0],'optical-ray from'),direction=unit(vector(ctx.params.direction,[1,-1,0],'optical-ray direction'),'optical-ray direction'),planePoint=vector(ctx.params.planePoint,[0,0,0],'optical-ray planePoint'),normal=unit(vector(ctx.params.normal,[0,1,0],'optical-ray normal'),'optical-ray normal');
  const denominator=direction.dot(normal);if(Math.abs(denominator)<1e-10)throw new Error('optical-ray is parallel to its interface');
  const travel=planePoint.clone().sub(origin).dot(normal)/denominator;if(travel<=1e-9)throw new Error('optical-ray interface must lie in front of its start');
  const intersection=origin.clone().addScaledVector(direction,travel),result=refractDirection(direction,normal,ctx.num('n1',1.0003,.1,5),ctx.num('n2',1.333,.1,5)),length=ctx.num('length',.2,.001,20),radius=ctx.num('width',.0012,.0001,.05);
  const outgoingDirection=result.transmitted??result.reflected,end=intersection.clone().addScaledVector(outgoingDirection,length),incoming=rod(ctx,radius,'optical-ray-incident'),outgoing=rod(ctx,radius,'optical-ray-outgoing',.93);root.add(incoming,outgoing);
  if(ctx.bool('showNormal',false))for(let i=-5;i<=5;i++){
   if(i===0)continue;const dash=rod(ctx,radius*.33,`optical-normal-${i}`,.45),a=intersection.clone().addScaledVector(result.normal,i*length*.035),b=a.clone().addScaledVector(result.normal,length*.015);aim(dash,a,b);root.add(dash);
  }
  root.userData.optics={kind:'vector-Snell-plane',sources:[REFRACTION_SOURCE,TIR_SOURCE],intersection:intersection.toArray(),incident:direction.toArray(),normal:result.normal.toArray(),outgoing:outgoingDirection.toArray(),totalInternalReflection:result.totalInternalReflection,n1:ctx.num('n1',1.0003,.1,5),n2:ctx.num('n2',1.333,.1,5)};
  const update=(controls:Record<string,number>)=>{const value=controls.on??1;if(!Number.isFinite(value))throw new Error('optical-ray on must be finite');const distance=clamp(value)*(travel+length);aim(incoming,origin,intersection,clamp(distance/travel));aim(outgoing,intersection,end,clamp((distance-travel)/length));};
  update({on:1});return {root,grounded:false,anchors:{interface:intersection.toArray() as [number,number,number]},update};
 },
});
