// Compare captured-scene refraction with independent triangle intersections along
// double-precision optical paths. Deliberately use simple exact shapes as probes,
// not as substitutes for realistic hero assets.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import * as THREE from 'three';
import {createHash} from 'node:crypto';
import {traceVessel} from '../../src/acryllex/models/dielectric.ts';
import {openAcryllex} from './render.mjs';

const out=resolve(process.argv[2]??'../artifacts/acryllex-realism');await mkdir(out,{recursive:true});
const width=800,height=600,v={height:.145,radius:.041,bottomRadius:.03608,wall:.0017,base:.145*.045,level:0,airIOR:1.0003,glassIOR:1.52,waterIOR:1.333,rimRadius:.00085,meniscusRadius:.00085};
const card=[...[-.09,-.06,-.03,0,.03,.06,.09].map(x=>({shape:'box',size:[.006,.14,.002],pos:[x,.075,-.11]})),...[.01,.045,.08,.115,.15].map(y=>({shape:'box',size:[.2,.003,.002],pos:[0,y,-.11]}))];
const probes=[
 ['card-front',[0,.11,.4],[0,.09,0],.64,card],
 ['card-high',[.08,.3,.25],[0,.08,0],.64,card],
 ['submerged-marker',[0,.12,.4],[0,.09,0],.7,[{shape:'box',size:[.006,.13,.006],pos:[.008,.075,0]}]],
 ['submerged-sphere',[.05,.22,.3],[0,.07,0],.7,[{shape:'sphere',r:.011,pos:[-.008,.043,0]}]],
 ['moving-card',[0,.11,.4],[0,.09,0],.64,card,true],
];
const reports=[],failures=[],raycaster=new THREE.Raycaster(),visibility=new THREE.Raycaster();
for(const [name,position,look,fill,parts,moving=false]of probes){
 if(process.env.ACRYLLEX_TRANSMISSION_CASE&&name!==process.env.ACRYLLEX_TRANSMISSION_CASE)continue;
 v.level=v.base+(v.height-v.wall*1.5-v.base)*fill;
 // Match the actual probe triangles (compose's sphere is 32x20), rather than
 // comparing its polygonal silhouette against a different, denser sphere.
 const objects=parts.map(p=>{const geometry=p.shape==='sphere'?new THREE.SphereGeometry(p.r,32,20):new THREE.BoxGeometry(...p.size),mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));mesh.position.fromArray(p.pos);mesh.updateMatrixWorld(true);return mesh;});
 const camera=new THREE.PerspectiveCamera(36,width/height,.01,10);camera.position.fromArray(position);camera.lookAt(new THREE.Vector3(...look));camera.updateMatrixWorld(true);
 function expected(x,y){
  const direction=new THREE.Vector3(2*(x+.5)/width-1,1-2*(y+.5)/height,.5).unproject(camera).sub(camera.position).normalize(),path=traceVessel(v,camera.position,direction);
  if(!path.path.length||path.exhausted)return undefined;
  const origin=camera.position.clone(),ray=direction.clone();
  for(const hit of [...path.path,null]){
   raycaster.set(origin,ray);raycaster.near=1e-7;raycaster.far=hit?hit.point.distanceTo(origin):v.height*32;
   const hitObject=raycaster.intersectObjects(objects,false)[0];if(hitObject){
    // This representation cannot supply an offscreen or occluded surface. Count
    // those unsupported samples separately instead of silently calling them hits.
    const projected=hitObject.point.clone().project(camera);if(Math.abs(projected.x)>=1||Math.abs(projected.y)>=1||projected.z<=-1||projected.z>=1)return null;
    const toward=hitObject.point.clone().sub(camera.position);visibility.set(camera.position,toward.clone().normalize());visibility.near=1e-7;visibility.far=toward.length()+.0002;
    const visible=visibility.intersectObjects(objects,false)[0];if(!visible||visible.point.distanceTo(hitObject.point)>.0002)return null;
    return true;
   }
   if(!hit)break;origin.copy(hit.point).addScaledVector(hit.outgoing,v.height*3e-6);ray.copy(hit.outgoing);
  }return false;
 }
 const spec={version:1,series:'ACRYLLEX',title:name,captions:false,format:{width,height,cell:1},look:{inkMode:'fixed',palette:{white:'#ffffff'},contrast:1,gamma:1,blackPoint:0,whitePoint:1,inkLo:1,noise:0,fuzz:0,ao:0,shadows:0},scenes:[{say:name,duration:2,hue:'white',ao:0,camera:{pos:position,look,fov:36,move:'static'},objects:[{id:'glass',model:'glass-optics',origin:'model',pos:[0,0,0],params:{fill,straw:false,sceneTransmission:true,_debug:6},enter:'cut',idle:'none'},{id:'probe',model:'compose',origin:'model',pos:[0,0,0],params:{parts},enter:'cut',idle:'none',castShadow:false}]}]};
 if(moving)spec.scenes[0].objects[1].keyframes=[{at:0,pos:[-.02,0,0],easing:'linear'},{at:1.6,pos:[.02,0,0],easing:'linear'}];
 const {page,browser,errors}=await openAcryllex(spec);
 try{
  let firstPixels=null;
  for(const time of moving?[.2,1.4,.2]:[.5]){
  objects.forEach((object,i)=>{object.position.fromArray(parts[i].pos);if(moving)object.position.x+=-.02+.04*time/1.6;object.updateMatrixWorld(true);});
  const pixels=await page.evaluate(([t,w,h])=>window.acryllex.probe(t,w,h),[time,width,height]);
  if(moving){if(!firstPixels)firstPixels=pixels;else if(time===.2)assert.deepEqual(pixels,firstPixels,'Reverse seeking must reproduce the same scene capture');else assert.notDeepEqual(pixels,firstPixels,'Source motion must change the refraction');}
  let positive=0,negative=0,falsePositive=0,falseNegative=0,unsupported=0;const examples=[];
  for(let y=110;y<540;y+=4)for(let x=240;x<560;x+=3){
   const values=[[0,0],[-.45,-.45],[.45,.45]].map(([dx,dy])=>expected(x+dx,y+dy));if(values[0]===null){unsupported++;continue;}if(values[0]===undefined||!values.every(v=>v===values[0]))continue;
   const truth=values[0],rendered=pixels[y*width+x]>127;if(truth)positive++;else negative++;
   if(truth!==rendered){if(truth)falseNegative++;else falsePositive++;if(examples.length<10)examples.push({x,y,truth,value:pixels[y*width+x]});}
  }
  const report={name,time,positive,negative,unsupported,falsePositive,falseNegative,recall:1-falseNegative/positive,falsePositiveRate:falsePositive/negative,examples};reports.push(report);
  console.log(JSON.stringify(report));
  if(positive<=30)failures.push(name+' has too few positive samples');if(report.recall<=.95)failures.push(name+' loses refracted source surfaces');if(report.falsePositiveRate>=.025)failures.push(name+' invents source surfaces');assert.deepEqual(errors,[]);
  }
 }finally{await browser.close();for(const mesh of objects){mesh.geometry.dispose();mesh.material.dispose();}}
}
// Exercise the real recording profile and normal AO through scene disposal and
// reverse seeking. Numerical white masks alone cannot catch post-shading loss.
const styled={version:1,series:'ACRYLLEX',title:'Optical scene isolation',style:'reference-recording',captions:false,format:{width:1164,height:670},scenes:[
 [[0,.12,.35],[0,.1,0]],[[.08,.23,.29],[0,.085,0]],[[-.08,.17,.34],[0,.09,0]]
].map(([pos,look],i)=>({say:'Optical view '+i,duration:2,hue:'blue',camera:{pos,look,fov:36,move:'static'},objects:[{id:'glass',model:'glass-optics',origin:'model',pos:[0,0,0],params:{sceneTransmission:true},enter:'cut',idle:'none'},{id:'card',model:'compose',origin:'model',pos:[0,0,0],params:{parts:card},enter:'cut',idle:'none',castShadow:false}]}))};
const {page:reviewPage,browser:reviewBrowser,errors:reviewErrors}=await openAcryllex(styled);
try{
 const times=[.5,2.5,4.5,2.5,.5],frames=await reviewPage.evaluate(ts=>ts.map(t=>window.acryllex.shot(t)),times),hash=s=>createHash('sha256').update(s).digest('hex');
 assert.equal(hash(frames[0]),hash(frames[4]),'Recreated optical scene changes after reverse seeking');assert.equal(hash(frames[1]),hash(frames[3]),'Optical scene changes after peer capture disposal');
 for(const t of times){const count=await reviewPage.evaluate(t=>window.acryllex.probe(t,582,335).filter(v=>v>20).length,t);assert.ok(count>1000,'Recording-style optical scene became nearly invisible at '+t);}
 assert.deepEqual(reviewErrors,[]);
}finally{await reviewBrowser.close();}
await writeFile(join(out,'scene-transmission-gpu-verification.json'),JSON.stringify({passed:failures.length===0,reports,failures,styleChecks:['Recording-profile/AO frames remain visible','Reverse seeking is exact after peer capture disposal and scene recreation'],scope:'First-layer, in-view source surfaces. Hidden/offscreen geometry and mutual optical-volume transmission remain unsupported.'},null,2)+'\n');
assert.deepEqual(failures,[]);
