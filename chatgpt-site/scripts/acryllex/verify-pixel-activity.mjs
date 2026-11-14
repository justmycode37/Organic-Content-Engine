// Native GPU evidence for living pixels without beat-driven object/density motion.
// node scripts/acryllex/verify-pixel-activity.mjs [output directory]
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {openAcryllex,renderVideo} from './render.mjs';
import {assetsForSpec} from './assets.mjs';

const out=resolve(process.argv[2]??'../artifacts/acryllex-realism');await mkdir(out,{recursive:true});
const base={version:1,series:'ACRYLLEX',style:'reference-recording',title:'Living pixel regression',captions:false,format:{width:1164,height:670}};
const results=[];
for(const model of ['hand-mesh','head-mesh','water-glass','wooden_spoon']){
 const spec={...base,scenes:[{say:model,duration:3,hue:'blue',camera:{angle:model==='wooden_spoon'?'top':'front',move:'static',fill:.86},objects:[{id:'subject',model,enter:'cut',idle:'none'}]}]};
 const {page,browser,errors}=await openAcryllex(spec);
 try{
  const metrics=await page.evaluate(()=>{
   const hash=a=>{let h=2166136261;for(const x of a){h^=x;h=Math.imul(h,16777619);}return h>>>0;};
   const samples=[],means=[],counts=[];
   for(let i=0;i<21;i++){
    const t=1+i/60,fine=Uint8Array.from(window.acryllex.probe(t,1164,670)),coarse=window.acryllex.probe(t,146,84);
    let sum=0,n=0;for(const x of fine){sum+=x;if(x>90)n++;}means.push(sum/fine.length);counts.push(n);samples.push({fine,coarse});
   }
   const changes=[];
   for(const delta of [1,2,4,8]){
    let changed=0,selected=0,coarseDrift=0,n=0;
    for(let i=0;i<samples.length-delta;i++){
     const a=samples[i],b=samples[i+delta];
     for(let k=0;k<a.fine.length;k++){if(a.fine[k]>25||b.fine[k]>25){selected++;if((a.fine[k]>90)!==(b.fine[k]>90))changed++;}}
     for(let k=0;k<a.coarse.length;k++){coarseDrift+=Math.abs(a.coarse[k]-b.coarse[k]);n++;}
    }
    changes.push({deltaFrames:delta,pixelTurnover:changed/Math.max(1,selected),coarseMeanAbsoluteDrift:coarseDrift/n});
   }
   const initial=hash(samples[0].fine),reverse=hash(window.acryllex.probe(1,1164,670));
   return {means,counts,changes,firstHash:initial,reverseHash:reverse,hashes:samples.map(s=>hash(s.fine))};
  });
  assert.ok(metrics.counts[0]>500,model+' is effectively invisible');
  assert.ok(new Set(metrics.hashes).size>10,model+' pixel pattern remains frozen');
  assert.equal(metrics.firstHash,metrics.reverseHash,model+' activity does not reproduce on reverse seek');
  const densitySpread=(Math.max(...metrics.means)-Math.min(...metrics.means))/(metrics.means.reduce((a,b)=>a+b)/metrics.means.length);
  assert.ok(densitySpread<.025,`${model} overall density pumps: ${densitySpread}`);
  const assets=await assetsForSpec(spec),beat={...spec,beat:{period:.6,phase:0}};
  await page.evaluate(([s,a])=>window.acryllex.load(s,a),[beat,assets]);
  const onBeat=await page.evaluate(()=>[1,1.1,1.2].map(t=>window.acryllex.shot(t)));
  await page.evaluate(([s,a])=>window.acryllex.load(s,a),[spec,assets]);
  const noBeat=await page.evaluate(()=>[1,1.1,1.2].map(t=>window.acryllex.shot(t)));assert.deepEqual(onBeat,noBeat,model+' music grid changes pixels or framing');
  const still=structuredClone(spec);still.scenes[0].raster={activity:0};await page.evaluate(([s,a])=>window.acryllex.load(s,a),[still,assets]);
  const frozen=await page.evaluate(()=>[.6,1.2,1.5].map(t=>window.acryllex.shot(t)));assert.equal(new Set(frozen).size,1,model+' object moves when pixel activity is disabled');
  assert.deepEqual(errors,[]);results.push({model,densitySpread,...metrics,hashes:undefined,scope:'Pixel activity on a static subject; native image comparison. Different subject geometry and motion prevent treating turnover as a likeness score.'});
 }finally{await browser.close();}
}
await writeFile(join(out,'pixel-activity-verification.json'),JSON.stringify({results,limits:'Dot thresholds move within independent 2×2 tiles, preserving the threshold multiset per tile. Radiance gradients and silhouettes can introduce small finite-patch coverage variation. This does not move geometry, alter ink or follow music beats.'},null,2)+'\n');
if(process.env.ACRYLLEX_ACTIVITY_VIDEO==='1'){
 const scenes=['hand-mesh','head-mesh','water-glass','wooden_spoon'].map(model=>({say:model,duration:3,hue:'blue',camera:{angle:model==='wooden_spoon'?'top':'front',move:'static',fill:.86},objects:[{id:'subject',model,enter:'cut',idle:'none'}]}));
 await renderVideo({...base,scenes},join(out,'pixel-activity-trials.mp4'),{fps:60});
}
console.log(JSON.stringify(results.map(({model,densitySpread,changes})=>({model,densitySpread,changes})),null,2));
