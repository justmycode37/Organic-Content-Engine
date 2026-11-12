// Developer tool for code-animated Reels.
//   node scripts/motion.mjs shot <spec.json> <out.png> <time> [more times...]   stills (several times make a contact sheet)
//   node scripts/motion.mjs render <spec.json> <out.mp4>                        finished 1080x1920 H.264 video
// Optional temporal supersampling: MOTION_SUBFRAMES=3 MOTION_SHUTTER=0.4
// Set MOTION_DIR=<folder> to render a private copy of src/motion instead of the checkout.
//   node scripts/motion.mjs icons <out.png>                                     sheet of every pixel icon at module sizes 6 and 3
import {build} from 'esbuild';
import {chromium} from 'playwright-core';
import {spawn} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const CHROME=process.env.CHROME_PATH?.trim()||(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'/usr/bin/chromium');
const FPS=30;

function boundedEnvInt(value,fallback,min,max){const parsed=Number.parseInt(value??'',10);return Number.isFinite(parsed)?Math.max(min,Math.min(max,parsed)):fallback;}
function boundedEnvNumber(value,fallback,min,max){const parsed=Number(value);return Number.isFinite(parsed)?Math.max(min,Math.min(max,parsed)):fallback;}

export async function openMotionPage(entry='src/motion/page.ts'){
 const bundle=(await build({entryPoints:[process.env.MOTION_DIR?join(process.env.MOTION_DIR,entry.split('/').at(-1)):join(ROOT,entry)],bundle:true,write:false,format:'iife',target:'es2022'})).outputFiles[0].text;
 const browser=await chromium.launch({headless:true,executablePath:CHROME});
 const page=await browser.newPage();
 page.on('pageerror',error=>{console.error(`Page error: ${error.message}`);process.exitCode=1;});
 await page.setContent('<!doctype html><title>Motion</title>');
 await page.addScriptTag({content:bundle});
 return {browser,page};
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 if(process.argv[2]==='icons'){
  const {browser,page}=await openMotionPage('src/motion/icon-sheet.ts');
  try{await writeFile(process.argv[3],Buffer.from(await page.evaluate(()=>window.iconSheet()),'base64'));console.log(`Wrote ${process.argv[3]}`);}finally{await browser.close();}
  process.exit(process.exitCode??0);
 }
 const [action,specPath,outPath,...times]=process.argv.slice(2);
 if(!['shot','render'].includes(action)||!specPath||!outPath)throw new Error('Usage: motion.mjs shot <spec.json> <out.png> <time...> | motion.mjs render <spec.json> <out.mp4>');
 const spec=JSON.parse(await readFile(specPath,'utf8'));
 const {browser,page}=await openMotionPage();
 try{
  if(action==='shot'){
   const list=(times.length?times:['0']).map(Number);
   if(list.length===1)await writeFile(outPath,Buffer.from(await page.evaluate(([s,t])=>window.motion.shot(s,t),[spec,list[0]]),'base64'));
   else{
    // Contact sheet: every requested time side by side at reduced size, labelled.
    const data=await page.evaluate(([s,ts])=>{
     const scale=0.3,w=1080*scale,h=1920*scale,cols=Math.min(ts.length,6),rows=Math.ceil(ts.length/cols);
     const sheet=document.createElement('canvas');sheet.width=cols*(w+8)+8;sheet.height=rows*(h+36)+8;
     const ctx=sheet.getContext('2d');ctx.fillStyle='#444';ctx.fillRect(0,0,sheet.width,sheet.height);
     return Promise.all(ts.map((t,i)=>new Promise(resolve=>{const image=new Image();image.onload=()=>{const x=8+(i%cols)*(w+8),y=8+Math.floor(i/cols)*(h+36);ctx.drawImage(image,x,y,w,h);ctx.fillStyle='#fff';ctx.font='20px monospace';ctx.fillText(`${t}s`,x,y+h+24);resolve();};image.src='data:image/png;base64,'+window.motion.shot(s,t,scale);}))).then(()=>sheet.toDataURL('image/png').split(',')[1]);
    },[spec,list]);
    await writeFile(outPath,Buffer.from(data,'base64'));
   }
   console.log(`Wrote ${outPath}`);
  }else{
   const encoder=spawn('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','image2pipe','-framerate',String(FPS),'-i','pipe:0','-f','lavfi','-i','anullsrc=channel_layout=stereo:sample_rate=48000','-shortest','-c:v','libx264','-preset','slow','-crf','15','-pix_fmt','yuv420p','-r',String(FPS),'-fps_mode','cfr','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-color_range','tv','-x264-params','colorprim=bt709:transfer=bt709:colormatrix=bt709','-c:a','aac','-b:a','128k','-movflags','+faststart',outPath],{stdio:['pipe','inherit','inherit']});
   const done=new Promise((resolve,reject)=>{encoder.once('error',reject);encoder.once('close',code=>code===0?resolve():reject(new Error(`ffmpeg exited with ${code}`)));});
   await page.exposeFunction('emitFrame',encoded=>new Promise((resolve,reject)=>encoder.stdin.write(Buffer.from(encoded,'base64'),error=>error?reject(error):resolve())));
   // Keep the browser's intermediate JPEG from becoming the limiting encode.
   await page.evaluate(()=>{const original=HTMLCanvasElement.prototype.toDataURL;HTMLCanvasElement.prototype.toDataURL=function(type,quality){return original.call(this,type,type==='image/jpeg'?0.99:quality);};});
   const subframes=boundedEnvInt(process.env.MOTION_SUBFRAMES,1,1,9);
   const shutter=boundedEnvNumber(process.env.MOTION_SHUTTER,0.4,0,1);
   const frames=subframes>1
    ? await page.evaluate(async({s,n,shutter,fps})=>{
       const frameCount=window.motion.frames(s),width=1080,height=1920,stageBottom=1290;
       const output=document.createElement('canvas');output.width=width;output.height=height;
       const ctx=output.getContext('2d',{alpha:false});if(!ctx)throw new Error('Could not create supersample target');
       for(let index=0;index<frameCount;index++){
        ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;ctx.fillStyle='#000000';ctx.fillRect(0,0,width,height);
        ctx.globalCompositeOperation='lighter';let centerImage;
        for(let sample=0;sample<n;sample++){
         const offset=((sample+0.5)/n-0.5)*shutter;
         const time=Math.max(0,Math.min((frameCount-1)/fps,index/fps+offset/fps));
         const encoded=window.motion.shot(s,time),image=new Image();image.src=`data:image/png;base64,${encoded}`;await image.decode();
         ctx.globalAlpha=1/n;ctx.drawImage(image,0,0);
         if(sample===Math.floor(n/2)&&n%2===1)centerImage=image;
        }
        if(n%2===0){const encoded=window.motion.shot(s,index/fps),image=new Image();image.src=`data:image/png;base64,${encoded}`;await image.decode();centerImage=image;}
        // Keep caption text crisp at the center output time while the stage gets shutter averaging.
        if(centerImage){ctx.save();ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;ctx.beginPath();ctx.rect(0,stageBottom,width,height-stageBottom);ctx.clip();ctx.drawImage(centerImage,0,0);ctx.restore();}
        ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
        await window.emitFrame(output.toDataURL('image/jpeg',0.99).split(',')[1]);
       }
       return frameCount;
      },{s:spec,n:subframes,shutter,fps:FPS})
    : await page.evaluate(s=>window.motion.render(s),spec);
   encoder.stdin.end();await done;
   console.log(`Wrote ${outPath} (${frames} frames, ${(frames/FPS).toFixed(1)} s${subframes>1?`, ${subframes} subframes / ${shutter} frame shutter`:''})`);
  }
 }finally{await browser.close();}
}
