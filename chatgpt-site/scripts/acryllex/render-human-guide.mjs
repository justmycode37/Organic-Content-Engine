// Export an own human rig as neutral, undithered conditioning footage.
// node scripts/acryllex/render-human-guide.mjs spec.json guide.mp4 [--object=man] [--fps=30]
import {readFile,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';
import {assetsForSpec,ASSET_DIR} from './assets.mjs';

const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const CHROME=process.env.CHROME_PATH?.trim()||(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'/usr/bin/chromium');

export async function renderHumanGuide(input,out,{object='man',fps=30}={}){
 const spec=structuredClone(input),scene=spec.scenes?.[0],subject=scene?.objects?.find(o=>o.id===object);
 if(!subject||!Number.isFinite(scene.duration)||scene.duration<=0||!Number.isFinite(fps)||fps<1||fps>120||Math.ceil(scene.duration*fps)>1200)throw new Error('Guide needs a first-scene subject, a positive duration, fps1..120 and at most1200 frames');
 if(!/^human(?:-(?:male|female))?$/.test(subject.model))throw new Error('Guide subject must use human, human-male or human-female');
 // Remove only transitions/hue flashes from the conditioning take, retaining pose,
 // body dimensions, camera, root travel and all physical scene lighting.
 spec.scenes=[scene];subject.enter='none';subject.exit='none';delete subject.exitAt;
 scene.events=(scene.events??[]).filter(event=>!event.hue);
 const assets=await assetsForSpec(spec);
 const source=`
 import {Engine} from './src/acryllex/engine.ts';
 import {preloadAssets} from './src/acryllex/assets.ts';
 import * as THREE from 'three';
 let engine,runtime,subject;
 window.humanGuide={
  async load(spec,assets,id){await preloadAssets(assets);engine=new Engine(spec);runtime=engine.runtime(0);subject=runtime.byId.get(id);
   for(const material of subject.mats){if(material.color)material.color.setRGB(.7,.7,.7);if('metalness'in material)material.metalness=0;if('roughness'in material)material.roughness=.85;material.alphaHash=false;material.needsUpdate=true;}
   engine.renderer.outputColorSpace=THREE.SRGBColorSpace;return{width:engine.gl.width,height:engine.gl.height};},
  frame(t){runtime.update(t);for(const obj of runtime.objs)if(obj!==subject)obj.outer.visible=false;
   engine.renderer.setRenderTarget(null);engine.renderer.setClearColor(0,1);engine.renderer.clear();engine.renderer.render(runtime.scene,runtime.camera);
   return engine.gl.toDataURL('image/png').split(',')[1];}
 };`;
 const bundle=(await build({stdin:{contents:source,loader:'ts',resolveDir:ROOT},bundle:true,write:false,format:'iife',target:'es2022',logLevel:'error'})).outputFiles[0].text;
 const browser=await chromium.launch({headless:true,executablePath:CHROME,args:['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
 let encoder,done;
 try{
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'||message.type()==='warning'&&/^(asset|model)\b.*failed/.test(message.text()))errors.push(message.text());});
  const types={gltf:'model/gltf+json',glb:'model/gltf-binary',bin:'application/octet-stream',jpg:'image/jpeg',png:'image/png',json:'application/json'};
  await page.route('http://acx.local/**',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Own human guide</title>'});
   if(!url.pathname.startsWith('/a/'))return route.fulfill({status:404});
   const name=decodeURIComponent(url.pathname.slice(3)),file=resolve(ASSET_DIR,name);
   if(!file.startsWith(resolve(ASSET_DIR)+'/'))return route.fulfill({status:403});
   try{return route.fulfill({contentType:types[name.split('.').pop()]??'application/octet-stream',body:await readFile(file)});}catch{return route.fulfill({status:404});}
  });
  await page.goto('http://acx.local/');await page.addScriptTag({content:bundle});
  const size=await page.evaluate(([s,a,id])=>window.humanGuide.load(s,a,id),[spec,assets,object]);
  encoder=spawn('ffmpeg',['-v','error','-y','-f','image2pipe','-framerate',String(fps),'-i','pipe:0','-vf','hue=s=0','-an','-c:v','libx264','-preset','slow','-crf','15','-pix_fmt','yuv420p','-r',String(fps),'-movflags','+faststart',out],{stdio:['pipe','inherit','inherit']});
  done=new Promise((res,rej)=>{encoder.once('error',rej);encoder.once('close',code=>code===0?res():rej(new Error(`Guide encoder exited${code}`)));});void done.catch(()=>{});
  const count=Math.ceil(scene.duration*fps);
  for(let frame=0;frame<count;frame++){
   const data=await page.evaluate(t=>window.humanGuide.frame(t),frame/fps);
   if(errors.length)throw new Error(errors.join('\n'));
   await new Promise((res,rej)=>encoder.stdin.write(Buffer.from(data,'base64'),error=>error?rej(error):res()));
  }
  encoder.stdin.end();await done;
  const metadata={kind:'Own neutral rig guide, not reference footage or a final recreation',object,frames:count,fps,duration:count/fps,...size,sha256:createHash('sha256').update(await readFile(out)).digest('hex'),sourceSpecSHA256:createHash('sha256').update(JSON.stringify(input)).digest('hex'),sourceSpecHashEncoding:'JSON.stringify(input), UTF8',preparation:'Furniture hidden; original rig/camera/lighting; neutral gray materials; SRGB raw rendering; grayscale encoding; no captions, dot filtering or appearance transfer.'};
  await writeFile(out+'.json',JSON.stringify(metadata,null,2)+'\n');return metadata;
 }catch(error){encoder?.stdin.destroy();encoder?.kill('SIGTERM');if(done)await done.catch(()=>{});throw error;}
 finally{await browser.close();}
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const [specPath,out,...options]=process.argv.slice(2);
 if(!specPath||!out)throw new Error('Usage: render-human-guide.mjs spec.json out.mp4 [--object=man] [--fps=30]');
 const object=options.find(value=>value.startsWith('--object='))?.slice(9)??'man',fps=Number(options.find(value=>value.startsWith('--fps='))?.slice(6)??30);
 console.log(JSON.stringify(await renderHumanGuide(JSON.parse(await readFile(specPath,'utf8')),out,{object,fps})));
}
