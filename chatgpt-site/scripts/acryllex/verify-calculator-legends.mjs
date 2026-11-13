// Real GPU verification of optional calculator cap legends; historical snapshot comparison is opt-in.
// Run from chatgpt-site: node scripts/acryllex/verify-calculator-legends.mjs [candidate-spec.json] [--frozen] [--out=path]
// The page-only instrumentation exposes the existing engine; it does not change rendering code.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';
import {assetsForSpec,ASSET_DIR} from './assets.mjs';

const SITE=fileURLToPath(new URL('../../',import.meta.url));
const REPO=resolve(SITE,'..');
const ART=join(REPO,'artifacts/animation-recreation');
const args=process.argv.slice(2),useFrozen=args.includes('--frozen');
assert.ok(args.filter(a=>!a.startsWith('--')).length<=1&&args.every(a=>!a.startsWith('--')||a==='--frozen'||a.startsWith('--out=')),'Usage: verify-calculator-legends.mjs [candidate-spec.json] [--frozen] [--out=path]');
const OUT=args.find(a=>a.startsWith('--out='))?.slice(6)?resolve(args.find(a=>a.startsWith('--out=')).slice(6)):join(ART,'calculator-legend-verification');
const T=7.25;
const spec=JSON.parse(await readFile(useFrozen?join(ART,'round23-spec.json'):join(SITE,'scripts/acryllex/fixtures/reference-recreation.json'),'utf8'));
const baselineName=useFrozen?'frozen23':'fresh current unlabelled baseline';
const candidateArg=args.find(a=>!a.startsWith('--'));
const candidatePath=candidateArg?resolve(candidateArg):null;
const candidate=candidatePath?JSON.parse(await readFile(candidatePath,'utf8')):structuredClone(spec);
const labels=['MC','MR','M+','M−','÷',7,8,9,'√','×',4,5,6,'%','−',1,2,3,'±','+',0,'.','=','C','+','AC','CE','00','−',''];
const calculator=s=>s.scenes[1].objects.find(o=>o.id==='calc');
delete calculator(spec).params.keyLabels;delete calculator(spec).params.legendScale;
if(!candidatePath)calculator(candidate).params={...calculator(candidate).params,keyLabels:labels,legendScale:.55};
assert.ok(Array.isArray(calculator(candidate).params.keyLabels),'Candidate must provide calculator keyLabels');
assert.deepEqual(candidate.look.palette,spec.look.palette,'Candidate changes frozen ink RGB');
assert.equal(candidate.look.textColor,spec.look.textColor,'Candidate changes frozen neutral text RGB');
await mkdir(OUT,{recursive:true});

async function bundle(source,name){
 const entry=join(source,'page.ts');
 return (await build({entryPoints:[entry],bundle:true,write:false,format:'iife',target:'es2022',
  nodePaths:[join(SITE,'node_modules')],loader:{'.ttf':'dataurl'},logLevel:'error',plugins:[{
   name:'legend-verification-engine-access',setup(b){b.onLoad({filter:/\/page\.ts$/},async({path})=>{
    if(path!==entry)return;
    const code=await readFile(path,'utf8');
    return {contents:code+`\nwindow.__legend${name}={api:window.acryllex,engine:()=>engine,dispose:()=>{engine?.dispose();engine=null;}};`,loader:'ts'};
   });},
  }]})).outputFiles[0].text;
}
const [currentBundle,frozenBundle,assets]=await Promise.all([
 bundle(join(SITE,'src/acryllex'),'Current'),bundle(useFrozen?join(ART,'round23-source'):join(SITE,'src/acryllex'),'Frozen'),assetsForSpec(spec),
]);
const chrome=process.env.CHROME_PATH?.trim()||(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'/usr/bin/chromium');
const browser=await chromium.launch({headless:true,executablePath:chrome,args:['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
const errors=[];
const report={baseline:baselineName,time:T,format:spec.format,candidate:candidatePath??'explicit verification label example',checks:[]};
const pass=(name,details={})=>{report.checks.push({name,passed:true,...details});console.log(`PASS ${name}`);};
try{
 const page=await browser.newPage();
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const types={gltf:'model/gltf+json',glb:'model/gltf-binary',bin:'application/octet-stream',jpg:'image/jpeg',png:'image/png',json:'application/json'};
 await page.route('http://acx.local/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Calculator legend verification</title>'});
  if(path.startsWith('/a/')){
   const rel=decodeURIComponent(path.slice(3));if(rel.includes('..'))return route.fulfill({status:403});
   try{return route.fulfill({contentType:types[rel.split('.').pop()]??'application/octet-stream',body:await readFile(join(ASSET_DIR,rel))});}catch{return route.fulfill({status:404});}
  }
  return route.fulfill({status:404});
 });
 await page.goto('http://acx.local/');
 await page.addScriptTag({content:currentBundle});
 await page.addScriptTag({content:frozenBundle});
 await page.evaluate(()=>{
  window.__legendShots={};
  window.__legendTake=async(name,t=T,engineName='Current')=>{
   const api=window[`__legend${engineName}`].api;
   const png=api.shot(t),img=new Image();img.src='data:image/png;base64,'+png;await img.decode();
   const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;
   const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);
   window.__legendShots[name]={png,width:img.width,height:img.height,pixels:ctx.getImageData(0,0,img.width,img.height).data};
   return png;
  };
  window.__legendSnapshot=(name='Current',index=1)=>{
   const engine=window[`__legend${name}`].engine(),runtime=engine.scenes[index],obj=runtime.byId.get('calc');
   const hash=a=>{let h=2166136261;const b=new Uint8Array(a.buffer,a.byteOffset,a.byteLength);for(const v of b){h^=v;h=Math.imul(h,16777619);}return (h>>>0).toString(16);};
   const meshes=obj.meshes.map(m=>({position:hash(m.geometry.attributes.position.array),normal:hash(m.geometry.attributes.normal.array),
    count:m.geometry.attributes.position.count,index:m.geometry.index?hash(m.geometry.index.array):null,
    pos:m.position.toArray(),rotation:m.rotation.toArray(),scale:m.scale.toArray(),color:m.material.color.toArray(),roughness:m.material.roughness,tone:m.material.userData.tone}));
   const project=m=>{
    const p=m.geometry.attributes.position,v=m.position.clone();let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
    for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(m.matrixWorld).project(runtime.camera);
     const x=(v.x*.5+.5)*engine.out.width,y=(-v.y*.5+.5)*engine.out.height;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
    return {x0,y0,x1,y1};
   };
   const masks=obj.meshes.filter(m=>m.material.alphaMap).map(m=>({uuid:m.material.alphaMap.uuid,alphaTest:m.material.alphaTest,
    colorSpace:m.material.alphaMap.colorSpace,size:[m.material.alphaMap.image.width,m.material.alphaMap.image.height]}));
   return {meshes,size:obj.size.toArray(),center:obj.center.toArray(),keyRects:obj.meshes.slice(7).map(project),
    protectedRects:{housing:project(obj.meshes[0]),rim:project(obj.meshes[1]),display:project(obj.meshes[4])},masks,textures:engine.renderer.info.memory.textures};
  };
  window.__legendCompare=(before,after,rects=[],protectedRects={},inkRGB=[])=>{
   const a=window.__legendShots[before],b=window.__legendShots[after];
   if(a.width!==b.width||a.height!==b.height)throw new Error('Mismatched image dimensions');
   const inside=(x,y,r,pad=0)=>x>=r.x0-pad&&x<=r.x1+pad&&y>=r.y0-pad&&y<=r.y1+pad;
   const colors=new Set(),oldColors=new Set();let changed=0,outside=0,removed=0,added=0,unchangedInk=0,oldSolidCapInk=0,newSolidCapInk=0;
   const regions=Object.fromEntries(Object.keys(protectedRects).map(k=>[k,{pixels:0,changed:0}]));
   const keyChanges=rects.map(()=>0);let x0=a.width,y0=a.height,x1=-1,y1=-1;
   for(let y=0;y<a.height;y++)for(let x=0;x<a.width;x++){
    const i=(y*a.width+x)*4,aa=a.pixels,bb=b.pixels,isInk=bb[i]+bb[i+1]+bb[i+2]>0;
    if(aa[i]+aa[i+1]+aa[i+2]>0)oldColors.add(`${aa[i]},${aa[i+1]},${aa[i+2]}`);
    if(isInk)colors.add(`${bb[i]},${bb[i+1]},${bb[i+2]}`);
    const different=aa[i]!==bb[i]||aa[i+1]!==bb[i+1]||aa[i+2]!==bb[i+2]||aa[i+3]!==bb[i+3];
    const key=rects.some(r=>inside(x,y,r,4));
    if(key&&inkRGB.every((v,c)=>aa[i+c]===v))oldSolidCapInk++;
    if(key&&inkRGB.every((v,c)=>bb[i+c]===v))newSolidCapInk++;
    for(const [name,r] of Object.entries(protectedRects))if(inside(x,y,r)&&!key){regions[name].pixels++;if(different)regions[name].changed++;}
    if(!different){if(isInk)unchangedInk++;continue;}
    changed++;if(!key)outside++;if(aa[i]+aa[i+1]+aa[i+2]>bb[i]+bb[i+1]+bb[i+2])removed++;else added++;
    rects.forEach((r,k)=>{if(inside(x,y,r,4))keyChanges[k]++;});
    x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);
   }
   return {changed,outside,removed,added,unchangedInk,keyChanges,regions,bounds:{x0,y0,x1,y1},inkRGB,oldSolidCapInk,newSolidCapInk,oldColors:oldColors.size,colors:colors.size};
  };
 });
 const load=(s,name='Current')=>page.evaluate(async([s,a,n])=>window[`__legend${n}`].api.load(s,a),[s,assets,name]);
 const shot=async(name,t=T,engine='Current')=>{
  const png=await page.evaluate(([n,t,e])=>window.__legendTake(n,t,e),[name,t,engine]);
  await writeFile(join(OUT,`${name}.png`),Buffer.from(png,'base64'));return png;
 };
 const snapshot=()=>page.evaluate(()=>window.__legendSnapshot());
 const ink=spec.look.palette.blue.slice(1),inkRGB=[0,2,4].map(i=>parseInt(ink.slice(i,i+2),16));
 const compare=(a,b,s={})=>page.evaluate(([a,b,r,p,ink])=>window.__legendCompare(a,b,r,p,ink),[a,b,s.keyRects??[],s.protectedRects??{},inkRGB]);

 await load(spec,'Frozen');const frozen=await shot('frozen23',T,'Frozen');
 await page.evaluate(()=>window.__legendFrozen.dispose());
 await load(spec);const plain=await shot('no-labels');const plainState=await snapshot();
 report.gpu=await page.evaluate(()=>{const r=window.__legendCurrent.engine().renderer,gl=r.getContext(),e=gl.getExtension('WEBGL_debug_renderer_info');return {vendor:e?gl.getParameter(e.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),renderer:e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),webgl2:r.capabilities.isWebGL2};});
 assert.equal(plain,frozen,`Missing labels change the native calculator frame from ${baselineName}`);
 assert.equal(plainState.masks.length,0);pass(`missing labels exactly reproduce ${baselineName} PNG bytes`,{sha256:createHash('sha256').update(Buffer.from(plain,'base64')).digest('hex')});
 for(const [name,keyLabels] of [['empty-labels',[]],['blank-labels',Array(30).fill(' \t ')]]){
  const s=structuredClone(spec);calculator(s).params={...calculator(s).params,keyLabels,legendScale:.8};await load(s);
  assert.equal(await shot(name),frozen,`${name} changes ${baselineName} PNG bytes`);
  assert.equal((await snapshot()).masks.length,0);pass(`${name} exactly reproduce ${baselineName} PNG bytes`);
 }

 await load(candidate);const labelled=await shot('labelled');const labelledState=await snapshot();
 const labelList=calculator(candidate).params.keyLabels;
 const rows=Number(calculator(candidate).params.rows??5),columns=Number(calculator(candidate).params.columns??4);
 const expectedMasks=labelList.filter((v,i)=>i<rows*columns&&i!==rows*columns-1&&(typeof v==='string'||typeof v==='number')&&String(v).trim().length).length;
 assert.equal(labelledState.masks.length,expectedMasks,'Row-major labels are missing or the skipped lower-right key gains a cap');
 assert.ok(expectedMasks>0);assert.ok(labelledState.masks.every(m=>m.alphaTest===.5));
 assert.equal(new Set(labelledState.masks.map(m=>m.uuid)).size,expectedMasks,'Masks are unexpectedly shared between material owners');
 // Candidate may contain deliberate calculator transforms. Geometry comparison always uses the same candidate without labels.
 const candidatePlain=structuredClone(candidate);delete calculator(candidatePlain).params.keyLabels;delete calculator(candidatePlain).params.legendScale;
 await load(candidatePlain);await shot('candidate-no-labels');const candidatePlainState=await snapshot();
 assert.deepEqual(labelledState.meshes,candidatePlainState.meshes,'Legends change cap positions, normals, topology, material color or roughness');
 assert.deepEqual(labelledState.size,candidatePlainState.size);assert.deepEqual(labelledState.center,candidatePlainState.center);
 pass('legends preserve every mesh geometry, transform, tone and roughness',{caps:labelledState.keyRects.length,masks:expectedMasks});
 const pixels=await compare('candidate-no-labels','labelled',labelledState);
 assert.ok(pixels.changed>50,'Legends do not create visible GPU glyph structure');
 assert.ok(pixels.removed>pixels.added,'Legends do not predominantly remove ink to expose the dark deck');
 assert.equal(pixels.outside,0,'Legends alter pixels outside the projected cap geometry');
 for(const [name,r] of Object.entries(pixels.regions)){assert.ok(r.pixels>25,`No protected ${name} pixels were checked`);assert.equal(r.changed,0,`${name} pixels changed`);}
 // Soft dot coverage and the final canvas resampling create edge shades whose set changes with glyph coverage.
 // The solid cap ink must retain the exact frozen RGB; mesh colors and palette are checked independently above.
 assert.ok(pixels.oldSolidCapInk>100&&pixels.newSolidCapInk>100,'The original solid cap RGB is missing after applying legends');
 assert.ok(pixels.unchangedInk>1000);pass('black cap glyphs preserve ink RGB and every protected housing, rim and display pixel',pixels);

 await load(candidate);assert.equal(await shot('reload-labelled'),labelled,'Reloading changes legends');
 await page.evaluate(()=>{window.__legendCurrent.api.shot(7.6);window.__legendCurrent.api.shot(6.4);});
 assert.equal(await shot('reverse-seek-labelled'),labelled,'Reverse seeking changes legends');
 await load(spec);assert.equal(await shot('load-isolation'),frozen,'A labelled render leaks into an unlabeled spec');
 pass('label rendering is deterministic on reverse seek, reload and load isolation');

 const press=structuredClone(candidate);calculator(press).controls={...calculator(press).controls,press:1};
 await load(press);const pressImages=[],pressStates=[];
 for(const time of [7.25,7.4]){pressImages.push(await shot(`press-${time}`,time));pressStates.push(await snapshot());}
 const noPressLabels=structuredClone(press);delete calculator(noPressLabels).params.keyLabels;
 await load(noPressLabels);const barePressStates=[];
 for(const time of [7.25,7.4]){await page.evaluate(t=>window.__legendCurrent.api.shot(t),time);barePressStates.push(await snapshot());}
 assert.deepEqual(pressStates.map(s=>s.meshes),barePressStates.map(s=>s.meshes),'Legends change press movement');
 const resting=candidatePlainState.meshes.slice(7).map(m=>m.pos[2]);
 const moving=pressStates[0].meshes.slice(7).filter((m,i)=>Math.abs(m.pos[2]-resting[i])>.0001).length;
 assert.ok(moving>0,'The press control did not move any cap');
 assert.notDeepEqual(pressStates[0].meshes.map(m=>m.pos),pressStates[1].meshes.map(m=>m.pos),'Press animation stopped over time');
 await load(press);assert.equal(await shot('press-reload'),pressImages[0]);
 await page.evaluate(()=>{window.__legendCurrent.api.shot(7.6);window.__legendCurrent.api.shot(6.6);});
 assert.equal(await shot('press-reverse-seek'),pressImages[0]);pass('key press animation retains identical geometry and deterministic key travel',{movingCaps:moving});

 const small=structuredClone(candidate),large=structuredClone(candidate);calculator(small).params.legendScale=.2;calculator(large).params.legendScale=.8;
 await load(small);const smallImage=await shot('scale-020');await load(large);const largeImage=await shot('scale-080');
 assert.notEqual(smallImage,largeImage,'legendScale does not change GPU glyph size');pass('legendScale visibly controls cap glyph size');

 await load(candidate);await page.evaluate(t=>window.__legendCurrent.api.shot(t),T);
 const lifecycleStart=await page.evaluate(()=>{
  const engine=window.__legendCurrent.engine(),obj=engine.scenes[1].byId.get('calc');
  const records=obj.meshes.filter(m=>m.material.alphaMap).map(m=>{
   const texture=m.material.alphaMap,material=m.material,record={texture,material,textureEvents:0,materialEvents:0,uploaded:engine.renderer.properties.has(texture)};
   texture.addEventListener('dispose',()=>record.textureEvents++);material.addEventListener('dispose',()=>record.materialEvents++);return record;
  });window.__legendLifecycle={engine,records};
  return {count:records.length,uploaded:records.filter(r=>r.uploaded).length,textures:engine.renderer.info.memory.textures};
 });
 assert.equal(lifecycleStart.uploaded,expectedMasks,'Some masks were never uploaded to the GPU');
 await load(spec);await page.evaluate(t=>window.__legendCurrent.api.shot(t),T);
 const lifecycleEnd=await page.evaluate(()=>{
  const {engine,records}=window.__legendLifecycle;
  const first=records.map(r=>({textureEvents:r.textureEvents,materialEvents:r.materialEvents,retained:engine.renderer.properties.has(r.texture)}));
  records.forEach(r=>r.material.dispose());
  return {first,afterRepeatedMaterialDispose:records.map(r=>r.textureEvents),newTextures:window.__legendCurrent.engine().renderer.info.memory.textures};
 });
 assert.ok(lifecycleEnd.first.every(r=>r.textureEvents===1&&r.materialEvents===1&&!r.retained),'A disposed legend material leaves a texture or misses its owned texture disposal');
 assert.ok(lifecycleEnd.afterRepeatedMaterialDispose.every(n=>n===1),'Repeated material disposal repeats the detached texture listener');
 assert.equal(lifecycleEnd.newTextures,plainState.textures,'Mask textures leak into an unloaded engine');
 pass('material disposal releases every uploaded mask once and restores baseline GPU texture count',{...lifecycleStart,...lifecycleEnd});

 assert.deepEqual(errors,[],'Browser reported rendering errors');
 pass('browser reports no JavaScript or GPU console errors');
 report.passed=true;
 await writeFile(join(OUT,'report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(`Calculator legend GPU checks passed. Report: ${join(OUT,'report.json')}`);
}catch(error){
 report.passed=false;report.failure={message:error.message,stack:error.stack};report.errors=errors;
 await writeFile(join(OUT,'report.json'),JSON.stringify(report,null,2)+'\n');throw error;
}finally{await browser.close();}
