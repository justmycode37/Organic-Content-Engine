// ACRYLLEX renderer (headless Chrome + WebGL2 on the GPU).
//   node scripts/acryllex/render.mjs shot   <spec.json> <out.png> <t> [t...]   still, or a labelled contact sheet for several times
//   node scripts/acryllex/render.mjs render <spec.json> <out.mp4>              silent 1080x1920 30 fps H.264
import {build} from 'esbuild';
import {chromium} from 'playwright-core';
import {spawn} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assetsForSpec,ASSET_DIR} from './assets.mjs';

const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const CHROME=process.env.CHROME_PATH?.trim()||(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'/usr/bin/chromium');
export const FPS=30;

export async function openAcryllex(spec){
 const bundle=(await build({entryPoints:[join(ROOT,'src/acryllex/page.ts')],bundle:true,write:false,format:'iife',target:'es2022',define:{'import.meta.url':JSON.stringify('http://acx.local/modules/render.js')},loader:{'.ttf':'dataurl'},logLevel:'error'})).outputFiles[0].text;
 const assets=await assetsForSpec(spec);
 const browser=await chromium.launch({headless:true,executablePath:CHROME,args:['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
 const page=await browser.newPage();
 const errors=[];
 page.on('pageerror',e=>{errors.push(e.message);console.error(`Page error: ${e.message}`);});
 page.on('console',m=>{if(m.type()==='error'||m.type()==='warning'&&/^(asset|model)\b.*failed/.test(m.text()))errors.push(m.text());if(m.type()==='error'||m.type()==='warning')console.error(`[page] ${m.text()}`);});
 const TYPES={gltf:'model/gltf+json',glb:'model/gltf-binary',bin:'application/octet-stream',jpg:'image/jpeg',png:'image/png',html:'text/html',json:'application/json',wasm:'application/wasm',js:'text/javascript'};
 await page.route('http://acx.local/**',async route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/'||url.pathname==='/index.html')return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Acryllex</title>'});
  if(url.pathname.startsWith('/a/')){const rel=decodeURIComponent(url.pathname.slice(3));if(rel.includes('..'))return route.fulfill({status:403});
   try{return route.fulfill({status:200,contentType:TYPES[rel.split('.').pop()]??'application/octet-stream',body:await readFile(join(ASSET_DIR,rel))});}catch{return route.fulfill({status:404});}}
  return route.fulfill({status:404});
 });
 await page.goto('http://acx.local/');
 await page.addScriptTag({content:bundle});
 let info;try{info=await page.evaluate(([s,a])=>window.acryllex.load(s,a),[spec,assets]);}catch(error){await browser.close();throw error;}
 return {browser,page,info,errors};
}

export async function stills(spec,outPath,times,scale=0.32,labels=null,cols=6){
 const {browser,page,errors}=await openAcryllex(spec);
 try{
  if(times.length===1){const data=await page.evaluate(t=>window.acryllex.shot(t),times[0]);checkRenderErrors(errors);await writeFile(outPath,Buffer.from(data,'base64'));return;}
  const data=await page.evaluate(async([ts,scale,labels,maxCols])=>{
   const probe=new Image();await new Promise(r=>{probe.onload=r;probe.src='data:image/png;base64,'+window.acryllex.shot(ts[0],1);});
   const w=Math.round(probe.width*scale),h=Math.round(probe.height*scale),cols=Math.min(ts.length,maxCols),rows=Math.ceil(ts.length/cols);
   const sheet=document.createElement('canvas');sheet.width=cols*(w+8)+8;sheet.height=rows*(h+36)+8;
   const ctx=sheet.getContext('2d');ctx.fillStyle='#333';ctx.fillRect(0,0,sheet.width,sheet.height);
   for(let i=0;i<ts.length;i++){
    const img=new Image();await new Promise(r=>{img.onload=r;img.src='data:image/png;base64,'+window.acryllex.shot(ts[i],scale);});
    const x=8+(i%cols)*(w+8),y=8+Math.floor(i/cols)*(h+36);ctx.drawImage(img,x,y,w,h);ctx.fillStyle='#fff';ctx.font='20px monospace';ctx.fillText(labels?labels[i]:`${ts[i]}s`,x,y+h+24);
   }
   return sheet.toDataURL('image/png').split(',')[1];
  },[times,scale,labels,cols]);
  checkRenderErrors(errors);await writeFile(outPath,Buffer.from(data,'base64'));
 }finally{await browser.close();}
}

export async function renderVideo(spec,outPath,{fps=FPS,start=0,end}={}){
 if(!Number.isFinite(fps)||fps<1||fps>120||!Number.isFinite(start)||start<0)throw new Error('Invalid frame rate or start time');
 const {browser,page,info,errors}=await openAcryllex(spec);
 const duration=Math.min(end??info.duration,info.duration)-start;
 if(!Number.isFinite(duration)||duration<=0){await browser.close();throw new Error('Render range must intersect the video');}
 const frames=Math.ceil(duration*fps);
 const enc=spawn('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','image2pipe','-framerate',String(fps),'-i','pipe:0','-c:v','libx264','-preset','slow','-crf','14','-tune','grain','-pix_fmt','yuv420p','-r',String(fps),'-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-movflags','+faststart',outPath],{stdio:['pipe','inherit','inherit']});
 const done=new Promise((res,rej)=>{enc.once('error',rej);enc.once('close',c=>c===0?res():rej(new Error(`ffmpeg exited ${c}`)));});
 void done.catch(()=>{});
 try{
  const t0=Date.now();
  for(let f=0;f<frames;f+=10){
   const batch=await page.evaluate(([a,b,fps,start])=>{const out=[];for(let i=a;i<b;i++)out.push(window.acryllex.frame(start+i/fps));return out;},[f,Math.min(frames,f+10),fps,start]);
   checkRenderErrors(errors);
   for(const b64 of batch)await new Promise((res,rej)=>enc.stdin.write(Buffer.from(b64,'base64'),e=>e?rej(e):res()));
   if(process.env.ACRYLLEX_PROGRESS&&f%90===0)console.error(`frame ${f}/${frames} (${((Date.now()-t0)/1000).toFixed(1)}s)`);
  }
  enc.stdin.end();await done;
 }catch(error){enc.stdin.destroy();enc.kill('SIGTERM');await done.catch(()=>{});throw error;}finally{await browser.close();}
 return {...info,duration,fps};
}

function checkRenderErrors(errors){if(errors.length)throw new Error(`GPU render failed: ${errors[0]}`);}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const [action,specPath,outPath,...args]=process.argv.slice(2);
 const times=args.filter(a=>!a.startsWith('--'));
 if(!['shot','render'].includes(action)||!specPath||!outPath)throw new Error('Usage: render.mjs shot <spec.json> <out.png> <t...> | render <spec.json> <out.mp4>');
 const spec=JSON.parse(await readFile(specPath,'utf8'));
 if(action==='shot')await stills(spec,outPath,(times.length?times:['1']).map(Number));
 else{const fps=Number(args.find(a=>a.startsWith('--fps='))?.slice(6)??FPS),range=args.find(a=>a.startsWith('--range='))?.slice(8).split(':').map(Number);const info=await renderVideo(spec,outPath,{fps,...(range?{start:range[0],end:range[1]}:{})});console.log(`Wrote ${outPath} (${info.duration.toFixed(1)} s at ${info.fps} fps)`);}
}
