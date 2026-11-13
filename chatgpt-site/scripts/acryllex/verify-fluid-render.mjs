// Native GPU integration checks. Requires Chrome; no Blender or reference artifacts.
// These checks validate rendering behavior, not visual water realism.
import assert from 'node:assert/strict';
import {openAcryllex,stills,renderVideo} from './render.mjs';
import {assetsForSpec,ASSET_DIR} from './assets.mjs';
import {mkdtemp,writeFile,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const spec={version:1,series:'ACRYLLEX',title:'Fluid render integration',captions:false,
 format:{width:600,height:400,cell:2},look:{inkMode:'fixed',palette:{blue:'#1234c8'},noise:0,fuzz:0,ao:0,shadows:0,dotRoundness:0,dotSoftness:0},
 scenes:[{say:'fluid',duration:2,hue:'blue',ground:false,ao:0,camera:{move:'static',pos:[3,3,5],look:[0,.4,0],fov:40},
  light:{key:.8,fill:.1,rim:.2,ambient:.1,contrast:1,gamma:1,exposure:1},
  objects:[{id:'fluid',model:'fluid-sheet',origin:'model',enter:'none',idle:'none',params:{width:3,length:2,uSegments:24,vSegments:12,foamCount:48,spray:1}}]}]};
const {browser,page,errors}=await openAcryllex(spec),consoleProblems=[],checks=[];
page.on('console',message=>{if(message.type()==='error'||message.type()==='warning')consoleProblems.push(message.text());});
try{
 for(const model of ['fluid-sheet','fluid-jet'])for(const material of ['opaque','water']){
  const candidate=structuredClone(spec),object=candidate.scenes[0].objects[0];object.model=model;
  object.params={...object.params,material,rippleAmplitude:.006,...(model==='fluid-jet'?{path:[[-1.2,0,0],[-.3,1.2,0],[.5,1.4,.1],[1.2,.3,.3]],radius:.1}:{} )};
  await page.evaluate(s=>window.acryllex.load(s),candidate);
  const shot=await page.evaluate(()=>window.acryllex.shot(.45));
  const pixels=await page.evaluate(async png=>{const image=new Image();image.src='data:image/png;base64,'+png;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;let ink=0,peak=0,wrongInk=0;for(let i=0;i<data.length;i+=4){if(data[i+2]>0){ink++;peak=Math.max(peak,data[i+2]);if(data[i]!==18||data[i+1]!==52||data[i+2]!==200)wrongInk++;}}return {ink,peak,wrongInk};},shot);
  assert.ok(pixels.ink>100,'Fluid geometry failed to render');assert.equal(pixels.peak,200);assert.equal(pixels.wrongInk,0,'Water material altered fixed scene ink');
  await page.evaluate(()=>window.acryllex.shot(1.3));assert.equal(await page.evaluate(()=>window.acryllex.shot(.45)),shot,'Reverse seeking changed fluid geometry/foam/optics');
  checks.push({model,material,nativeReverseExact:true,...pixels});
 }
 assert.deepEqual(errors,[]);assert.deepEqual(consoleProblems,[],'Shader compile errors or GPU warnings');
 await page.evaluate(()=>console.error('Fluid verification: deliberate error collection check'));
 assert.ok(errors.at(-1)?.includes('deliberate error collection check'),'Console shader errors would be silently accepted');errors.pop();consoleProblems.pop();
 console.log(JSON.stringify({checks,errors,consoleProblems}));
}finally{await browser.close();}

// A failed asset must not silently export a placeholder, and a failed movie must reap its encoder.
const temp=await mkdtemp(join(tmpdir(),'acryllex-render-errors-')),bad=structuredClone(spec);let paths={};
try{
 const file=join(temp,'invalid.glb');await writeFile(file,'invalid glTF data');bad.scenes[0].objects=[{id:'bad',model:'mesh',origin:'model',enter:'none',idle:'none',params:{file}}];
 paths=await assetsForSpec(bad);
 const png=join(temp,'invalid.png'),movie=join(temp,'invalid.mp4');
 await assert.rejects(()=>stills(bad,png,[.1]),/GPU render failed: asset .*failed/);
 await assert.rejects(()=>renderVideo(bad,movie,{fps:10,end:.2}),/GPU render failed: asset .*failed/);
 await assert.rejects(()=>access(png));await assert.rejects(()=>access(movie));
 console.log('Failed assets reject still/movie export; encoder and browsers close.');
}finally{for(const file of Object.values(paths))await rm(join(ASSET_DIR,file),{force:true});await rm(temp,{recursive:true,force:true});}
