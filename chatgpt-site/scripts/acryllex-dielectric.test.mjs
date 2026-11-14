import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {dielectricFresnel,coneIntersections,torusIntersections,vesselWaterHeight,vesselBoundary,vesselMedium,traceVessel,validateVessel} from '../src/acryllex/models/dielectric.ts';
import {glassOptics} from '../src/acryllex/models/glass-optics.ts';
const vec=a=>new THREE.Vector3(...a),close=(a,b,e=1e-8)=>assert.ok(Math.abs(a-b)<e,`${a} differs from ${b}`);
const vessel={height:.145,radius:.041,bottomRadius:.03608,wall:.0017,base:.0065,level:.09,airIOR:1.0003,glassIOR:1.52,waterIOR:1.333};
const ctx=(params={})=>({params,seed:3,color:()=>new THREE.Color(1,1,1),mat:(o={})=>new THREE.MeshStandardMaterial({color:new THREE.Color().setScalar(o.tone??1),side:o.side??THREE.FrontSide}),num:(k,f,lo=-Infinity,hi=Infinity)=>Math.max(lo,Math.min(hi,Number.isFinite(params[k])?params[k]:f)),str:(k,f)=>params[k]??f,bool:(k,f)=>params[k]??f});

test('Fresnel reflection has physical normal/grazing limits, index matching and TIR',()=>{
 for(const [a,b]of [[1,1.333],[1,1.52],[1.52,1.333]]){close(dielectricFresnel(1,a,b),((a-b)/(a+b))**2);close(dielectricFresnel(0,a,b),1);for(let c=.01;c<=1;c+=.01){const r=dielectricFresnel(c,a,b);assert.ok(r>=0&&r<=1);}}
 for(const c of [0,.1,.8,1])assert.equal(dielectricFresnel(c,1.333,1.333),0);
 assert.equal(dielectricFresnel(Math.cos(Math.PI/3),1.333,1),1);assert.throws(()=>dielectricFresnel(NaN,1,1.333),/finite/);
});

test('finite cone/cylinder intersections satisfy the actual surface and reject out-of-height roots',()=>{
 const t=coneIntersections(vec([.2,.05,0]),vec([-1,0,0]),.04,0,0,.1);close(t[0],.16);close(t[1],.24);
 assert.deepEqual(coneIntersections(vec([.2,.2,0]),vec([-1,0,0]),.04,0,0,.1),[]);
 for(const direction of [[-.9,.2,.1],[-1,-.1,-.1],[0,-1,0]]){
  const o=vec([.03,.2,.02]),d=vec(direction).normalize();for(const root of coneIntersections(o,d,.03,.1,0,.15)){const p=o.clone().addScaledVector(d,root);close(Math.hypot(p.x,p.z),.03+.1*p.y);assert.ok(p.y>=0&&p.y<=.15);}
 }
});

test('medium classification distinguishes wall, base, water, headspace and outside air',()=>{
 assert.equal(vesselMedium(vessel,vec([0,.05,0])),vessel.waterIOR);assert.equal(vesselMedium(vessel,vec([0,.1,0])),vessel.airIOR);assert.equal(vesselMedium(vessel,vec([0,.003,0])),vessel.glassIOR);
 const r=vessel.bottomRadius+(vessel.radius-vessel.bottomRadius)*.05/vessel.height;assert.equal(vesselMedium(vessel,vec([r-.0005,.05,0])),vessel.glassIOR);assert.equal(vesselMedium(vessel,vec([r+.0005,.05,0])),vessel.airIOR);
 for(const invalid of [{wall:.1},{base:.2},{level:.15},{radius:NaN},{glassIOR:0}])assert.throws(()=>validateVessel({...vessel,...invalid}));
});

test('a side ray crosses air/glass/water/glass/air, and the path is reversible',()=>{
 for(const x of [-.02,0,.01,.025]){
  const forward=traceVessel(vessel,vec([x,.06,.5]),vec([0,0,-1]));assert.equal(forward.exhausted,false);assert.deepEqual(forward.path.map(h=>h.surface),['outer-wall','inner-wall','inner-wall','outer-wall']);assert.deepEqual(forward.path.map(h=>[h.from,h.to]),[[vessel.airIOR,vessel.glassIOR],[vessel.glassIOR,vessel.waterIOR],[vessel.waterIOR,vessel.glassIOR],[vessel.glassIOR,vessel.airIOR]]);
  const reverse=traceVessel(vessel,forward.origin,forward.direction.clone().negate());assert.equal(reverse.path.length,forward.path.length);reverse.path.forEach((h,i)=>assert.ok(h.point.distanceTo(forward.path.at(-1-i).point)<1e-6));assert.ok(forward.transmission>0&&forward.transmission<=1);
 }
 const dry=traceVessel({...vessel,level:vessel.base},vec([.015,.06,.5]),vec([0,0,-1]));assert.equal(dry.path[1].to,vessel.airIOR);
 const matched=traceVessel({...vessel,airIOR:1,glassIOR:1,waterIOR:1},vec([.015,.06,.5]),vec([0,0,-1]));assert.deepEqual(matched.path,[]);close(matched.transmission,1);
});

test('top rays hit water/floor/base, and a submerged oblique ray reflects at the water surface',()=>{
 const top=traceVessel(vessel,vec([0,.4,0]),vec([0,-1,0]));assert.deepEqual(top.path.map(h=>h.surface),['water','floor','base']);close(top.path[0].point.y,vessel.level);
 const tir=traceVessel(vessel,vec([0,.08,0]),vec([.8,.6,0]),1);assert.equal(tir.path[0].surface,'water');assert.equal(tir.path[0].totalInternalReflection,true);assert.ok(tir.path[0].outgoing.y<0);assert.equal(tir.exhausted,true);
 assert.equal(vesselBoundary(vessel,vec([.2,.3,.2]),vec([0,1,0])),null);
});

test('rounded lip and wetting meniscus are actual curved interfaces with valid normals',()=>{
 const v={...vessel,rimRadius:vessel.wall*.5,meniscusRadius:vessel.wall*.5},lip=v.rimRadius;
 const roots=torusIntersections(vec([v.radius-lip,v.height+.01,0]),vec([0,-1,0]),v.radius-lip,lip,v.height-lip);assert.ok(roots.length>=2);close(roots[0].distance,.01,1e-7);
 const rim=vesselBoundary(v,vec([v.radius-lip,v.height+.01,0]),vec([0,-1,0]));assert.equal(rim.surface,'rim');close(rim.point.y,v.height,1e-7);assert.ok(rim.normal.y>.999);
 const r=v.bottomRadius+(v.radius-v.bottomRadius)*v.level/(v.height-lip)-v.wall-v.meniscusRadius*.5,h=vesselWaterHeight(v,r);assert.ok(h>v.level&&h<v.level+v.meniscusRadius);
 const meniscus=vesselBoundary(v,vec([r,v.level+.01,0]),vec([0,-1,0]));assert.equal(meniscus.surface,'water');close(meniscus.point.y,h,1e-7);assert.ok(Math.abs(meniscus.normal.x)>.1);close(meniscus.normal.length(),1);
 const ray=traceVessel(v,vec([0,.4,0]),vec([0,-1,0]));close(ray.transmission,ray.radianceTransmission,1e-7,'Air-to-air radiance index factors cancel');assert.throws(()=>traceVessel(v,vec([NaN,0,0]),vec([0,-1,0])),/finite/);
});

test('optical vessel fill, camera transforms and scale validation are deterministic without moving the straw',()=>{
 const b=glassOptics.build(ctx()),mesh=b.root.children[0],physical=structuredClone(b.root.userData.optics.physicalStraw),camera=new THREE.PerspectiveCamera(36,1,.01,10),uniforms={};
 const shader={uniforms,vertexShader:'#include <begin_vertex>',fragmentShader:'void main() {\n#include <opaque_fragment>\n}'};mesh.material.onBeforeCompile(shader,{});assert.match(shader.fragmentShader,/vgTrace/);assert.match(shader.fragmentShader,/gl_FragDepth/);
 b.update({fill:.3},0);const low=uniforms.vgLevel.value;b.update({fill:.8},3);assert.ok(uniforms.vgLevel.value>low);b.update({fill:.3},10);close(uniforms.vgLevel.value,low);assert.deepEqual(b.root.userData.optics.physicalStraw,physical);assert.equal(mesh.castShadow,false);
 b.root.position.set(.2,.1,-.3);b.root.rotation.y=.5;b.root.scale.setScalar(2);b.root.updateMatrixWorld(true);camera.position.set(.4,.7,1);camera.updateMatrixWorld(true);mesh.onBeforeRender(null,null,camera);assert.ok(uniforms.vgCamera.value.distanceTo(mesh.worldToLocal(camera.position.clone()))<1e-10);
 b.root.scale.set(1,2,1);b.root.updateMatrixWorld(true);assert.throws(()=>mesh.onBeforeRender(null,null,camera),/uniform object scale/);assert.throws(()=>b.update({fill:NaN},0),/finite/);
});

test('reflection emitters follow visible light identities independently of shadow sorting',()=>{
 const b=glassOptics.build(ctx()),mesh=b.root.children[0],scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),uniforms={};
 mesh.material.onBeforeCompile({uniforms,vertexShader:'#include <begin_vertex>',fragmentShader:'void main() {\n#include <opaque_fragment>\n}'},{});
 const key=new THREE.DirectionalLight(0xffffff,2),rear=new THREE.DirectionalLight(0xffffff,.3),hidden=new THREE.DirectionalLight(0xffffff,100);
 key.position.set(1,2,3);rear.userData.acryllexReflectionRole='rear';hidden.visible=false;scene.add(b.root,rear,hidden,key,key.target);scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
 const render=()=>mesh.onBeforeRender(null,scene,camera),stage=()=>Array.from({length:uniforms.vgEmitterCount.value},(_,i)=>({direction:uniforms.vgEmitterDirections.value[i].toArray(),colour:uniforms.vgEmitterIrradiance.value[i].toArray(),width:uniforms.vgEmitterWidths.value[i]})).sort((a,b)=>a.width-b.width);
 render();const first=stage();assert.equal(first.length,2);assert.ok(first[1].direction[2]<0);close(first[0].direction[2],3/Math.sqrt(14));
 key.castShadow=true;scene.remove(rear);scene.add(rear);render();assert.deepEqual(stage(),first);
 key.visible=false;render();assert.equal(uniforms.vgEmitterCount.value,1);close(uniforms.vgEmitterIrradiance.value[0].x,.3);
});

test('authored straw movement stays rigid, remains inside the proxy and rejects wall penetration',()=>{
 const b=glassOptics.build(ctx()),mesh=b.root.children[0],box=mesh.geometry.boundingBox??(mesh.geometry.computeBoundingBox(),mesh.geometry.boundingBox),initial=structuredClone(b.root.userData.optics.physicalStraw);
 const length=p=>vec(p.from).distanceTo(vec(p.to));
 for(const tilt of [14,17,20])for(const yaw of [-90,0,120]){b.update({strawTilt:tilt,strawYaw:yaw},2);const p=b.root.userData.optics.physicalStraw;close(length(p),length(initial));assert.ok(box.containsPoint(vec(p.from)));assert.ok(box.containsPoint(vec(p.to)));assert.deepEqual(b.anchors.strawTip,p.to);}
 b.update({},0);assert.deepEqual(b.root.userData.optics.physicalStraw,initial);assert.throws(()=>b.update({strawTilt:28},0),/intersects vessel wall/);assert.deepEqual(b.root.userData.optics.physicalStraw,initial);assert.throws(()=>b.update({strawYaw:NaN},0),/finite/);
});
