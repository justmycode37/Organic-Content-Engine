// Exercise the actual GPU silhouette across opening/closing and distinct views.
// A passing framing check is evidence against clipping, not proof of realistic anatomy.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {openAcryllex} from './render.mjs';

const out=resolve(process.argv[2]??'../artifacts/acryllex-realism'),spec=JSON.parse(await readFile(join(out,'hand-shape-motion.json'),'utf8'));
const {page,browser,errors}=await openAcryllex(spec);
try{
 const results=await page.evaluate(()=>{
  const result=[];for(let t=.1;t<16;t+=.25){
   const width=1164,height=670,pixels=window.acryllex.probe(t,width,height);let x0=width,y0=height,x1=0,y1=0,count=0;
   for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(pixels[y*width+x]>20){count++;x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
   result.push({t:Number(t.toFixed(2)),count,bounds:[x0,y0,x1,y1]});
  }return result;
 });
 for(const r of results){assert.ok(r.count>500,'Hand disappeared at '+r.t);const [x0,y0,x1,y1]=r.bounds;assert.ok(x0>12&&y0>12&&x1<1152&&y1<658,'Hand is clipped during motion at '+r.t);}
 const frames=await page.evaluate(()=>[9.8,10.5,9.8].map(t=>window.acryllex.shot(t))),hash=s=>createHash('sha256').update(s).digest('hex');
 assert.equal(hash(frames[0]),hash(frames[2]),'Reverse pose sampling must reproduce the exact frame');assert.notEqual(hash(frames[0]),hash(frames[1]),'Finger motion must advance');assert.deepEqual(errors,[]);
 await writeFile(join(out,'hand-shape-gpu-verification.json'),JSON.stringify({checks:['Whole hand remains inside the frame across 64 samples and four views','Finger motion advances and reverse seeking reproduces exactly the same frame'],results,limits:'Silhouette/framing checks do not establish arbitrary object contact or universal anatomical realism.'},null,2)+'\n');
 console.log('Hand framing and reverse-motion checks passed across '+results.length+' GPU frames.');
}finally{await browser.close();}
