// Compare actual GPU primary-ray straw masks with double-precision interface paths
// and an independently intersected triangle-mesh straw. Diagnostic raster only;
// production previews use the unchanged reference-recording profile.
import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import * as THREE from 'three';
import {openAcryllex} from './render.mjs';
import {traceVessel} from '../../src/acryllex/models/dielectric.ts';
const out=resolve(process.argv[2]??'../artifacts/acryllex-realism');await mkdir(out,{recursive:true});
const width=800,height=600,v={height:.145,radius:.041,bottomRadius:.041*.88,wall:.0017,base:.145*.045,level:0,airIOR:1.0003,glassIOR:1.52,waterIOR:1.333,rimRadius:.0017*.5,meniscusRadius:.0017*.5};
const radius=.0027,angle=18*Math.PI/180,direction=new THREE.Vector3(Math.sin(angle),Math.cos(angle),0),a=new THREE.Vector3(-direction.x*v.height*.62,v.base+radius*1.5,0),b=a.clone().addScaledVector(direction,v.height*1.58),length=a.distanceTo(b);
const geometry=new THREE.LatheGeometry([[radius*.84,0],[radius,0],[radius,length],[radius*.84,length],[radius*.84,0]].map(([x,y])=>new THREE.Vector2(x,y)),96),straw=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));straw.position.copy(a);straw.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction);straw.updateMatrixWorld(true);
const raycaster=new THREE.Raycaster(),reports=[];
function expected(origin,ray){
 const result=traceVessel(v,origin,ray),o=origin.clone(),d=ray.clone();
 for(const hit of [...result.path,null]){
  raycaster.set(o,d);raycaster.near=1e-7;raycaster.far=hit?hit.point.distanceTo(o):10;
  if(raycaster.intersectObject(straw,false).length)return true;
  if(!hit)break;o.copy(hit.point).addScaledVector(hit.outgoing,v.height*3e-6);d.copy(hit.outgoing);
 }
 return false;
}
for(const [name,position,look,fill]of [['side',[0,.11,.4],[0,.09,0],.64],['high',[.08,.3,.25],[0,.08,0],.64],['low-water',[0,.12,.4],[0,.09,0],.3]]){
 v.level=v.base+(v.height-v.wall*1.5-v.base)*fill;
 const camera=new THREE.PerspectiveCamera(36,width/height,.01,10);camera.position.fromArray(position);camera.lookAt(new THREE.Vector3(...look));camera.updateMatrixWorld(true);
 const spec={version:1,series:'ACRYLLEX',title:'Optical mask diagnostic',captions:false,format:{width,height,cell:1},look:{inkMode:'fixed',palette:{white:'#ffffff'},contrast:1,gamma:1,blackPoint:0,whitePoint:1,inkLo:1,noise:0,fuzz:0,ao:0,shadows:0},scenes:[{say:name,duration:2,hue:'white',ao:0,camera:{pos:position,look,fov:36,move:'static'},objects:[{id:'glass',model:'glass-optics',origin:'model',pos:[0,0,0],params:{fill,_debug:5},enter:'cut',idle:'none'}]}]};
 const {page,browser,errors}=await openAcryllex(spec);
 try{
  const pixels=await page.evaluate(([w,h])=>window.acryllex.probe(.5,w,h),[width,height]);let positive=0,negative=0,mismatch=0,falsePositive=0,falseNegative=0;const examples=[];
  for(let y=100;y<550;y+=5)for(let x=290;x<510;x+=3){
   const values=[];for(const [dx,dy]of [[0,0],[-.4,-.4],[.4,.4]]){
    const p=new THREE.Vector3(2*(x+.5+dx)/width-1,1-2*(y+.5+dy)/height,.5).unproject(camera),d=p.sub(camera.position).normalize();values.push(expected(camera.position,d));
   }
   if(!values.every(v=>v===values[0]))continue;
   const truth=values[0],rendered=pixels[y*width+x]>127;if(truth)positive++;else negative++;
   if(truth!==rendered){mismatch++;if(truth)falseNegative++;else falsePositive++;if(examples.length<12)examples.push({x,y,truth,value:pixels[y*width+x]});}
  }
  const report={name,positive,negative,mismatch,falsePositive,falseNegative,recall:1-falseNegative/positive,mismatchRate:mismatch/(positive+negative),examples};reports.push(report);
  assert.ok(positive>30,name+' has too few straw samples');assert.ok(report.recall>.95,name+' loses refracted straw samples');assert.ok(falsePositive/negative<.01,name+' invents straw outside the reference paths');assert.ok(report.mismatchRate<.015,name+' GPU/CPU ray disagreement');assert.deepEqual(errors,[]);
 }finally{await browser.close();}
}
await writeFile(join(out,'glass-optics-gpu-verification.json'),JSON.stringify(reports,null,2)+'\n');console.log(JSON.stringify(reports,null,2));
