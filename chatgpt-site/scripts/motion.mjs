// Developer tool for code-animated Reels.
//   node scripts/motion.mjs shot <spec.json> <out.png> <time> [more times...]   stills (several times make a contact sheet)
//   node scripts/motion.mjs render <spec.json> <out.mp4>                        finished 1080x1920 H.264 video
// Set MOTION_DIR=<folder> to render a private copy of src/motion instead of the checkout.
//   node scripts/motion.mjs icons <out.png>                                     sheet of every pixel icon at module sizes 6 and 3
import {build} from 'esbuild';
import {chromium} from 'playwright-core';
import {spawn} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {dirname,extname,isAbsolute,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const CHROME=process.env.CHROME_PATH?.trim()||(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'/usr/bin/chromium');

export async function openMotionPage(entry='src/motion/page.ts'){
 const bundle=(await build({entryPoints:[process.env.MOTION_DIR?join(process.env.MOTION_DIR,entry.split('/').at(-1)):join(ROOT,entry)],bundle:true,write:false,format:'iife',target:'es2022'})).outputFiles[0].text;
 const browser=await chromium.launch({headless:true,executablePath:CHROME});
 const page=await browser.newPage();
 page.on('pageerror',error=>{console.error(`Page error: ${error.message}`);process.exitCode=1;});
 await page.setContent('<!doctype html><title>Motion</title>');
 await page.addScriptTag({content:bundle});
 return {browser,page};
}

const MIME={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ttf':'font/ttf','.otf':'font/otf','.woff':'font/woff','.woff2':'font/woff2'};
const dataUrl=async path=>{const type=MIME[extname(path).toLowerCase()];if(!type)throw new Error(`Unsupported file type: ${path}`);return `data:${type};base64,${(await readFile(path)).toString('base64')}`;};

/** Loads the style's fonts and the spec's images into the page. Asset paths resolve against the spec file. */
export async function loadRequirements(page,spec,specPath){
 const need=await page.evaluate(s=>window.motion.requirements(s),spec);
 const styleDir=join(process.env.MOTION_DIR??join(ROOT,'src/motion'),'styles',need.style);
 const fonts=await Promise.all(need.fonts.map(async item=>({...item,data:await dataUrl(join(styleDir,item.file))})));
 const base=specPath?dirname(resolve(specPath)):process.cwd();
 const assets=Object.fromEntries(await Promise.all(Object.entries(need.assets).map(async([id,path])=>[id,await dataUrl(isAbsolute(path)?path:join(base,path))])));
 await page.evaluate(p=>window.motion.load(p),{fonts,assets});
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
  await loadRequirements(page,spec,specPath);
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
   const encoder=spawn('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','image2pipe','-framerate','30','-i','pipe:0','-f','lavfi','-i','anullsrc=channel_layout=stereo:sample_rate=48000','-shortest','-c:v','libx264','-preset','medium','-crf','17','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-movflags','+faststart',outPath],{stdio:['pipe','inherit','inherit']});
   const done=new Promise((resolve,reject)=>{encoder.once('error',reject);encoder.once('close',code=>code===0?resolve():reject(new Error(`ffmpeg exited with ${code}`)));});
   await page.exposeFunction('emitFrame',encoded=>new Promise((resolve,reject)=>encoder.stdin.write(Buffer.from(encoded,'base64'),error=>error?reject(error):resolve())));
   const frames=await page.evaluate(s=>window.motion.render(s),spec);
   encoder.stdin.end();await done;
   console.log(`Wrote ${outPath} (${frames} frames, ${(frames/30).toFixed(1)} s)`);
  }
 }finally{await browser.close();}
}
