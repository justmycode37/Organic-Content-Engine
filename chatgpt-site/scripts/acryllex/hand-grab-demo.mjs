// Source hand + one authored, measured sphere grip. This is an action demo, not
// an arbitrary-object contact solver. Export the clip, then play it through mesh.
import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openAcryllex,stills,renderVideo} from './render.mjs';
import {assetsForSpec} from './assets.mjs';

const site=fileURLToPath(new URL('../../',import.meta.url)),out=resolve(process.argv[2]??'../artifacts/acryllex-realism/hand-grab-demo.mp4'),folder=dirname(out);
await mkdir(folder,{recursive:true});
const asset=out.replace(/\.mp4$/,'.glb'),restAsset=out.replace(/\.mp4$/,'.rest.glb'),fit={center:[.0675,.132375,.0748125],radius:.0206,index:.65,middle:.8,ring:.85,pinky:.9,thumb:0};
const preloadSpec={version:1,series:'ACRYLLEX',title:'Hand source',scenes:[{say:'Hand',duration:2,objects:[{id:'hand',model:'hand-mesh'}]}]},assets=await assetsForSpec(preloadSpec);
const code=`import * as T from 'three';import {GLTFExporter} from 'three/examples/jsm/exporters/GLTFExporter.js';import {preloadAssets} from './src/acryllex/assets.ts';import {riggedHand} from './src/acryllex/models/rigged-hand.ts';
window.exportGrab=async function(assets,fit){
 await preloadAssets(assets);
 const ctx={params:{},seed:1,mat:(o={})=>new T.MeshStandardMaterial({color:new T.Color().setScalar(o.tone??.72),roughness:.62}),num:(k,f)=>f,str:(k,f)=>f,bool:(k,f)=>f,color:()=>new T.Color(1,1,1)};ctx.mesh=(g,o)=>new T.Mesh(g,ctx.mat(o));
 const hand=riggedHand.build(ctx),root=new T.Group(),carrier=new T.Group(),sphere=new T.Mesh(new T.SphereGeometry(fit.radius,64,40),ctx.mat({tone:.85}));
 root.name='HandGrabStudy';carrier.name='WristMotion';hand.root.name='SourceHand';sphere.name='HeldBall';sphere.position.fromArray(fit.center);carrier.add(hand.root,sphere);root.add(carrier);
 const pedestal=new T.Mesh(new T.CylinderGeometry(.012,.02,fit.center[1]-fit.radius,64),ctx.mat({tone:.35}));pedestal.name='BallRest';pedestal.position.set(fit.center[0],(fit.center[1]-fit.radius)/2,fit.center[2]);
 const smooth=x=>{x=T.MathUtils.clamp(x,0,1);return x*x*(3-2*x);};
 const keys=[
  [0,[0,0,0],[0,0,0]],[2.3,[0,0,0],[0,0,0]],
  [3.25,[-.012,.075,0],[-8,-8,-8]],
  [4.5,[-.065,.103,.012],[-12,25,16]],
  [5.9,[.025,.13,.018],[8,-24,-18]],
  [7.1,[-.018,.085,.01],[-4,5,-4]],[8,[-.018,.085,.01],[-4,5,-4]]
 ];
 function pose(t){
  const g=smooth((t-.85)/1.25),controls={spread:0,thumb:.035*(1-g)};
  for(const f of ['index','middle','ring','pinky']){const delay={index:0,middle:.05,ring:.1,pinky:.15}[f],v=smooth((t-.85-delay)/(1.25-delay));controls[f]=.02+(fit[f]-.02)*v;}
  hand.update(controls,t);hand.root.position.set(-.003*Math.sin(Math.PI*g),-.008*(1-g),-.038*(1-g));
  let i=0;while(i<keys.length-2&&t>keys[i+1][0])i++;const a=keys[i],b=keys[i+1],k=smooth((t-a[0])/(b[0]-a[0]));carrier.position.fromArray(a[1]).lerp(new T.Vector3(...b[1]),k);
  const qa=new T.Quaternion().setFromEuler(new T.Euler(...a[2].map(T.MathUtils.degToRad))),qb=new T.Quaternion().setFromEuler(new T.Euler(...b[2].map(T.MathUtils.degToRad)));carrier.quaternion.copy(qa).slerp(qb,k);root.updateMatrixWorld(true);
 }
 const bones=[];hand.root.traverse(o=>{if(o.isBone)bones.push(o);});
 const times=[],handPositions=[],carrierPositions=[],carrierRotations=[],boneRotations=bones.map(()=>[]),contacts=[];
 const triangle=new T.Triangle(),p=new T.Vector3(),center=new T.Vector3(),closest=new T.Vector3();
 function contact(t){
  pose(t);sphere.getWorldPosition(center);let min=Infinity,index=Infinity,thumb=Infinity,standPenetration=0;
  hand.root.traverse(m=>{if(!m.isSkinnedMesh)return;const geometry=m.geometry,idx=geometry.index;
   const get=(i,out)=>m.getVertexPosition(i,out).applyMatrix4(m.matrixWorld);
   for(let k=0;k<(idx?.count??geometry.attributes.position.count);k+=3){
    const ia=idx?idx.getX(k):k,ib=idx?idx.getX(k+1):k+1,ic=idx?idx.getX(k+2):k+2;
    get(ia,triangle.a);get(ib,triangle.b);get(ic,triangle.c);triangle.closestPointToPoint(center,closest);const distance=closest.distanceTo(center);min=Math.min(min,distance);
    for(const v of [triangle.a,triangle.b,triangle.c]){const h=fit.center[1]-fit.radius;if(v.y<=0||v.y>=h)continue;const r=.02-.008*v.y/h,depth=Math.min(r-Math.hypot(v.x-fit.center[0],v.z-fit.center[2]),v.y,h-v.y);standPenetration=Math.max(standPenetration,depth);}
    let wi=0,wt=0;for(const vertex of [ia,ib,ic])for(let j=0;j<4;j++){const name=m.skeleton.bones[geometry.attributes.skinIndex.getComponent(vertex,j)].name,w=geometry.attributes.skinWeight.getComponent(vertex,j);if(name==='index_03_r')wi+=w;if(name==='thumb_03_r')wt+=w;}
    if(wi>1.5)index=Math.min(index,distance);if(wt>1.5)thumb=Math.min(thumb,distance);
   }
  });return {t,surfaceClearance:min-fit.radius,indexGap:index-fit.radius,thumbGap:thumb-fit.radius,standPenetration};
 }
 for(let i=0;i<=480;i++){const t=i/60;pose(t);times.push(t);handPositions.push(...hand.root.position.toArray());carrierPositions.push(...carrier.position.toArray());carrierRotations.push(...carrier.quaternion.toArray());bones.forEach((bone,j)=>boneRotations[j].push(...bone.quaternion.toArray()));}
 for(let i=0;i<=32;i++)contacts.push(contact(i/4));
 const tracks=[new T.VectorKeyframeTrack(hand.root.uuid+'.position',times,handPositions),new T.VectorKeyframeTrack(carrier.uuid+'.position',times,carrierPositions),new T.QuaternionKeyframeTrack(carrier.uuid+'.quaternion',times,carrierRotations),...bones.map((bone,j)=>new T.QuaternionKeyframeTrack(bone.uuid+'.quaternion',times,boneRotations[j]))];
 const clip=new T.AnimationClip('Pick up and move',8,tracks);pose(0);const buffer=await new GLTFExporter().parseAsync(root,{binary:true,animations:[clip],onlyVisible:true}),rest=await new GLTFExporter().parseAsync(pedestal,{binary:true,onlyVisible:true});
 const encode=buffer=>{let binary='';for(const byte of new Uint8Array(buffer))binary+=String.fromCharCode(byte);return btoa(binary);};return {glb:encode(buffer),rest:encode(rest),contacts};
};`;
const bundle=(await build({stdin:{contents:code,loader:'ts',resolveDir:site},bundle:true,write:false,format:'iife',platform:'browser',logLevel:'silent'})).outputFiles[0].text;
const {page,browser}=await openAcryllex(preloadSpec);
let study;
try{await page.addScriptTag({content:bundle});study=await page.evaluate(([a,f])=>window.exportGrab(a,f),[assets,fit]);}finally{await browser.close();}
const worst=Math.min(...study.contacts.map(c=>c.surfaceClearance));if(worst<-.0015)throw new Error('Hand penetrates sphere beyond contact tolerance: '+worst);
if(study.contacts.some(c=>c.standPenetration>.0001))throw new Error('Hand intersects the ball stand: '+JSON.stringify(study.contacts.filter(c=>c.standPenetration>.0001)));
for(const contact of study.contacts.filter(c=>c.t>=2.25))if(Math.abs(contact.indexGap)>.0015||Math.abs(contact.thumbGap)>.0015)throw new Error('Grip loses contact: '+JSON.stringify(contact));
await writeFile(asset,Buffer.from(study.glb,'base64'));
await writeFile(restAsset,Buffer.from(study.rest,'base64'));
await writeFile(out.replace(/\.mp4$/,'.contacts.json'),JSON.stringify({fit,contacts:study.contacts,worstClearance:worst,limits:'One authored sphere grip, measured against the full skinned triangle surface. No general object-contact solver or soft-tissue simulation.'},null,2)+'\n');
const spec={version:1,series:'ACRYLLEX',title:'Grab and move',style:'reference-recording',captions:false,format:{width:1164,height:670},scenes:[{say:'The hand picks up a ball and moves it around.',duration:8,hue:'blue',camera:{pos:[-.25,.21,.55],look:[.015,.16,.03],fov:36,move:'static'},objects:[{id:'grasp',model:'mesh',origin:'model',pos:[0,0,0],params:{file:asset,clip:'Pick up and move'},enter:'cut',idle:'none'},{id:'rest',model:'mesh',origin:'model',pos:[0,0,0],params:{file:restAsset,tone:.35},enter:'cut',idle:'none'}]}]};
await writeFile(out.replace(/\.mp4$/,'.json'),JSON.stringify(spec,null,2)+'\n');
await stills(spec,out.replace(/\.mp4$/,'.png'),[.2,1.5,2.4,3.5,4.7,6.2],.55,['Reach','Close','Grip','Lift','Turn','Move'],3);
if(!process.env.ACRYLLEX_STILLS_ONLY){const info=await renderVideo(spec,out,{fps:60});console.log(JSON.stringify({output:out,duration:info.duration,fps:info.fps,worstContactPenetrationMetres:Math.max(0,-worst)}));}
