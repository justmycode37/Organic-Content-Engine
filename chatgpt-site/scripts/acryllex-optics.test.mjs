import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {apparentWaterPoint,opticalRay,refractDirection,waterGlass} from '../src/acryllex/models/optics.ts';

function context(params={}){
 const mat=(options={})=>{const m=new THREE.MeshStandardMaterial({color:new THREE.Color().setScalar(options.tone??1),roughness:options.rough??.62,side:options.side??THREE.FrontSide,alphaHash:true});m.userData.tone=options.tone??1;return m;};
 return {params,seed:37,mat,mesh:(g,o)=>new THREE.Mesh(g,mat(o)),color:()=>new THREE.Color(1,1,1),num:(key,f,lo=-Infinity,hi=Infinity)=>Math.max(lo,Math.min(hi,Number.isFinite(Number(params[key]))?Number(params[key]):f)),bool:(key,f)=>typeof params[key]==='boolean'?params[key]:f,str:(key,f,allowed)=>typeof params[key]==='string'&&(!allowed||allowed.includes(params[key]))?params[key]:f};
}
function close(a,b,tolerance=1e-10){assert.ok(Math.abs(a-b)<tolerance,`${a} differs from ${b}`);}
function release(built){built.root.traverse(o=>{o.geometry?.dispose();if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();});}
function snapshot(root){const out=[];root.traverse(o=>{if(o.isMesh)out.push({name:o.name,visible:o.visible,position:o.position.toArray(),quaternion:o.quaternion.toArray(),scale:o.scale.toArray(),vertices:Array.from(o.geometry.attributes.position.array)});});return out;}

test('vector refraction obeys Snell law and reverses the path for many incidence angles',()=>{
 const normal=new THREE.Vector3(0,1,0);
 for(const [n1,n2]of [[1,1.333],[1.333,1],[1.0003,1.52],[1.4,1.4]])for(const theta of [0,10,25,40,60,80]){
  const angle=theta*Math.PI/180,direction=new THREE.Vector3(Math.sin(angle),-Math.cos(angle),0),r=refractDirection(direction,normal,n1,n2),sinTransmitted=n1/n2*Math.sin(angle);
  close(r.reflected.length(),1);close(r.reflected.y,Math.cos(angle));
  if(sinTransmitted>1){assert.equal(r.totalInternalReflection,true);assert.equal(r.transmitted,null);continue;}
  assert.equal(r.totalInternalReflection,false);close(r.transmitted.length(),1);close(n1*Math.sin(angle),n2*Math.hypot(r.transmitted.x,r.transmitted.z));assert.ok(r.transmitted.y<=0);
  const reverse=refractDirection(r.transmitted.clone().negate(),normal,n2,n1);assert.ok(reverse.transmitted.distanceTo(direction.clone().negate())<1e-9);
  assert.ok(refractDirection(direction,normal.clone().negate(),n1,n2).transmitted.distanceTo(r.transmitted)<1e-10);
 }
});

test('total internal reflection starts at the physical critical angle and invalid inputs fail',()=>{
 const critical=Math.asin(1/1.333),direction=a=>new THREE.Vector3(Math.sin(a),Math.cos(a),0),normal=new THREE.Vector3(0,-1,0);
 const atCritical=refractDirection(direction(critical),normal,1.333,1);assert.equal(atCritical.totalInternalReflection,false);close(atCritical.cosTransmitted,0,1e-7);
 assert.equal(refractDirection(direction(critical+1e-5),normal,1.333,1).totalInternalReflection,true);
 assert.equal(refractDirection(direction(critical-1e-5),normal,1.333,1).totalInternalReflection,false);
 for(const value of [0,-1,NaN,Infinity])assert.throws(()=>refractDirection(direction(.2),normal,value,1),/refractive index/);
 assert.throws(()=>refractDirection(new THREE.Vector3(),normal,1,1.333),/nonzero/);
 assert.throws(()=>refractDirection(direction(.2),new THREE.Vector3(),1,1.333),/nonzero/);
});

test('apparent depth is solved from Snell geometry rather than an arbitrary straw bend',()=>{
 const point=new THREE.Vector3(.02,-.08,-.01),observer=new THREE.Vector3(.05,.24,.5),nWater=1.333,nAir=1.0003;
 const image=apparentWaterPoint(point,observer,0,nWater,nAir),depth=-point.y,apparentDepth=-image.y,horizontal=Math.hypot(observer.x-point.x,observer.z-point.z),airHeight=observer.y;
 assert.ok(image.y>point.y&&image.y<0);close(image.x,point.x);close(image.z,point.z);
 const under=apparentDepth*horizontal/(airHeight+apparentDepth),above=horizontal-under;
 close(nWater*under/Math.hypot(under,depth),nAir*above/Math.hypot(above,airHeight));
 const normal=apparentWaterPoint(new THREE.Vector3(0,-.08,0),new THREE.Vector3(0,.3,0),0,nWater,nAir);close(normal.y,-.08*nAir/nWater);
 const unchanged=apparentWaterPoint(point,observer,0,1,1);assert.ok(unchanged.distanceTo(point)<1e-10);
 assert.throws(()=>apparentWaterPoint(point,new THREE.Vector3(0,-1,0),0),/observer must be above/);
});

test('glass is a dimensional vessel with inner and outer walls, a physical floor and actual water surfaces',()=>{
 const b=waterGlass.build(context({straw:false}));
 try{
  const shell=b.root.getObjectByName('glass-inner-outer-wall'),water=b.root.getObjectByName('water-volume'),surface=b.root.getObjectByName('water-surface-meniscus'),p=shell.geometry.attributes.position;
  shell.geometry.computeBoundingBox();const bounds=shell.geometry.boundingBox;close(bounds.min.y,0,1e-7);close(bounds.max.y,.145,1e-6);close(bounds.max.x,.041,1e-5);
  const radii=[];for(let i=0;i<p.count;i++)if(Math.abs(p.getY(i)-.07)<.005)radii.push(Math.hypot(p.getX(i),p.getZ(i)));
  assert.ok(Math.max(...radii)-Math.min(...radii)>.001,'A hollow wall needs separate inner and outer radii');
  for(const mesh of [water,surface]){
   assert.ok(mesh.visible);assert.ok(mesh.geometry.index.count>5000);assert.ok(mesh.geometry.attributes.position.count>1500);
   const pos=mesh.geometry.attributes.position,normal=mesh.geometry.attributes.normal;for(const value of [...pos.array,...normal.array])assert.ok(Number.isFinite(value));
  }
  const s=surface.geometry.attributes.position;let edge=-Infinity,center=Infinity;
  for(let i=0;i<s.count;i++){const radius=Math.hypot(s.getX(i),s.getZ(i));if(radius>.03)edge=Math.max(edge,s.getY(i));if(radius<1e-7)center=Math.min(center,s.getY(i));}
  assert.ok(edge>center+.0005,'The water must rise into a curved meniscus near the glass');
  assert.equal(b.root.getObjectByName('straw-above-water'),undefined);
 }finally{release(b);}
});

test('fill moves continuous water geometry and reverse seeking restores exactly the same state',()=>{
 const b=waterGlass.build(context({fill:.4}));
 try{
  const volume=b.root.getObjectByName('water-volume'),surface=b.root.getObjectByName('water-surface-meniscus'),position=volume.geometry.attributes.position;
  const initial=snapshot(b.root);b.update({fill:.8},11);assert.equal(volume.geometry.attributes.position,position);assert.notDeepEqual(snapshot(b.root),initial);
  b.update({fill:.4},.2);assert.deepEqual(snapshot(b.root),initial);b.update({fill:.4},29);assert.deepEqual(snapshot(b.root),initial,'Optics cannot bob/pulse simply because time advanced');
  b.update({fill:0},1);assert.equal(volume.visible,false);assert.equal(surface.visible,false);assert.equal(b.root.getObjectByName('water-contact-line').visible,false);assert.equal(b.root.getObjectByName('straw-submerged-image').visible,false);
  b.update({fill:1},2);assert.ok(volume.visible&&surface.visible);assert.ok(b.anchors.waterline[1]<.145);
  assert.throws(()=>b.update({fill:NaN},0),/finite/);
 }finally{release(b);}
});

test('one physically straight straw has a hollow bore and a separate view-specific refracted image',()=>{
 const a=waterGlass.build(context({observer:[0,.6,.2]})),b=waterGlass.build(context({observer:[0,.6,.2],refraction:false}));
 try{
  const physical=a.root.userData.optics.physicalStraw;assert.equal(physical.straight,true);
  const air=a.root.getObjectByName('straw-above-water'),wet=a.root.getObjectByName('straw-submerged-image'),straight=b.root.getObjectByName('straw-submerged-image');
  assert.ok(air&&wet);assert.ok(wet.position.y>straight.position.y);assert.notDeepEqual(wet.quaternion.toArray(),straight.quaternion.toArray());
  const p=air.geometry.attributes.position,radii=new Set();for(let i=0;i<p.count;i++)radii.add(Math.hypot(p.getX(i),p.getZ(i)).toFixed(6));assert.ok(radii.size>=2,'The straw must have a bore and wall thickness');
  assert.match(a.root.userData.optics.limits,/no cylindrical wall lensing/);
  assert.throws(()=>waterGlass.build(context({strawTilt:28})),/intersects the vessel wall/);
  assert.throws(()=>waterGlass.build(context({observer:[0,NaN,.3]})),/finite/);
 }finally{release(a);release(b);}
});

test('the actual render camera updates refraction on the current draw and disables an invalid planar view',()=>{
 const b=waterGlass.build(context()),camera=new THREE.PerspectiveCamera();
 try{
  const wet=b.root.getObjectByName('straw-submerged-image'),physical=b.root.userData.optics.physicalStraw,water=b.anchors.waterline[1];
  b.root.position.set(.4,.3,-.2);b.root.scale.setScalar(1.7);b.root.rotation.y=.4;b.root.updateMatrixWorld(true);
  const invoke=view=>{camera.position.copy(b.root.localToWorld(view.clone()));camera.updateMatrixWorld(true);wet.onBeforeRender(null,null,camera);};
  const view=new THREE.Vector3(0,.6,.2);invoke(view);assert.equal(b.root.userData.optics.observerSource,'render-camera');assert.equal(b.root.userData.optics.projection,'Snell-top-surface');
  const expected=apparentWaterPoint(new THREE.Vector3(...physical.from),view,water);assert.ok(wet.position.distanceTo(expected)<1e-10);
  const worldStart=b.root.localToWorld(expected.clone()),drawStart=new THREE.Vector3().setFromMatrixPosition(wet.matrixWorld);assert.ok(worldStart.distanceTo(drawStart)<1e-10,'The current draw matrix must already contain the current camera projection');
  const initial=wet.matrixWorld.clone();invoke(new THREE.Vector3(0,.04,.6));assert.equal(b.root.userData.optics.projection,'straight-outside-planar-view');assert.ok(wet.position.distanceTo(new THREE.Vector3(...physical.from))<1e-10);
  invoke(new THREE.Vector3(0,.11,2));assert.equal(b.root.userData.optics.projection,'straight-outside-planar-view','A ray exiting the cylindrical side cannot be faked with a top-plane bend');
  invoke(view);initial.elements.forEach((value,i)=>close(value,wet.matrixWorld.elements[i]));
 }finally{release(b);}
});

test('optical paths have an exact plane intersection, no pulsating particles, and deterministic draw control',()=>{
 const b=opticalRay.build(context({normal:[0,2,0],n1:1,n2:1.333,showNormal:true}));
 try{
  const info=b.root.userData.optics;close(info.intersection[1],0);close(info.outgoing[0],Math.SQRT1_2/1.333);
  const initial=snapshot(b.root);b.update({on:1},30);assert.deepEqual(snapshot(b.root),initial);
  const incoming=b.root.getObjectByName('optical-ray-incident'),outgoing=b.root.getObjectByName('optical-ray-outgoing');
  b.update({on:0},1);assert.equal(incoming.visible,false);assert.equal(outgoing.visible,false);
  b.update({on:1},.3);assert.deepEqual(snapshot(b.root),initial);
  b.root.traverse(o=>{if(o.isMesh){assert.equal(o.material.emissiveIntensity,1);assert.equal(o.material.emissive.getHex(),0);assert.notEqual(o.geometry.type,'CapsuleGeometry');}});
 }finally{release(b);}
 assert.throws(()=>opticalRay.build(context({direction:[1,0,0]})),/parallel/);
 assert.throws(()=>opticalRay.build(context({direction:[1,1,0]})),/in front/);
});

test('the ray model reflects into the incident medium above the critical angle',()=>{
 const b=opticalRay.build(context({from:[-.2,-.1,0],direction:[1,1,0],n1:1.52,n2:1}));
 try{const info=b.root.userData.optics;assert.equal(info.totalInternalReflection,true);assert.ok(info.outgoing[1]<0);close(info.outgoing[0],Math.SQRT1_2);}finally{release(b);}
});
