import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import assert from 'node:assert/strict';
import {openAcryllex,renderVideo} from './render.mjs';
import {assetsForSpec} from './assets.mjs';

const output=resolve(process.argv[2]??'../artifacts/acryllex-realism/objaverse-source-trials.mp4');await mkdir(dirname(output),{recursive:true});
const sources={
 human:{uid:'c5322a46a62644cebd41527859260b65',height:1.65,clips:'all'},
 hand:{uid:'97208693ce4b43729cdcc35621c51bc0',height:.21,clips:[],sourceRotation:[90,0,0]},
 head:{uid:'27f75fa94c384000bb6a79a3000f8e80',height:.42,clips:[]},
};
const records=JSON.parse(await readFile(new URL('./objaverse-reviewed.json',import.meta.url),'utf8')).sources;
for(const source of Object.values(sources))source.expectedSHA256=records.find(r=>r.uid===source.uid).sha256;
const shot=(kind,angle)=>({say:kind+' source geometry / '+angle,duration:3,hue:'blue',transition:'cut',camera:{angle,fill:kind==='human'?.78:.85,move:'static'},objects:[{id:kind,model:'mesh',params:{...sources[kind],objaverse:sources[kind].uid,uid:undefined},enter:'cut',enterAt:0,idle:'none'}]});
const spec={version:1,series:'ACRYLLEX',title:'Objaverse source geometry and supplied rig trial',style:'reference-recording',captions:false,format:{width:1164,height:670},scenes:[shot('human','front'),shot('human','three-quarter-left'),shot('hand','front'),shot('hand','three-quarter-left'),shot('head','three-quarter-left')]};
// uid belongs to this script's source record, not to the scene schema.
for(const s of spec.scenes)delete s.objects[0].params.uid;
await writeFile(output.replace(/\.mp4$/,'.json'),JSON.stringify(spec,null,2)+'\n');
const {page,browser,errors}=await openAcryllex(spec);
const review={};
try{
 for(const [kind,t]of [['human',1.4],['hand',7.4],['head',13.4]]){
  const frame=await page.evaluate(t=>window.acryllex.shot(t),t);await writeFile(output.replace(/\.mp4$/,'-'+kind+'.png'),Buffer.from(frame,'base64'));
 }
 const staticSpec=structuredClone(spec);for(const s of staticSpec.scenes)s.raster={activity:0};const assets=await assetsForSpec(staticSpec);await page.evaluate(([s,a])=>window.acryllex.load(s,a),[staticSpec,assets]);
 const motion=await page.evaluate(()=>{
  const times=[.2,.6,1,1.4,1.8,2.2,2.6],frames=times.map(t=>window.acryllex.shot(t)),boxes=times.map(t=>{const w=1164,h=670,a=window.acryllex.probe(t,w,h);let minX=w,minY=h,maxX=-1,maxY=-1,count=0;for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(a[y*w+x]>40){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);count++;}return {t,minX,minY,maxX,maxY,count};});
  return {uniquePoses:new Set(frames).size,reverseExact:frames[0]===window.acryllex.shot(times[0]),boxes};
 });
 assert.ok(motion.uniquePoses>4,'Source animation is not visibly playing with pixel activity disabled');assert.equal(motion.reverseExact,true);for(const box of motion.boxes){assert.ok(box.count>500);assert.ok(box.minX>12&&box.minY>12&&box.maxX<1152&&box.maxY<658,'Source human motion leaves the view: '+JSON.stringify(box));}
 // Hold a static head and verify that authored source alpha changes real coverage on the GPU.
 const alphaSpec=structuredClone(staticSpec);alphaSpec.scenes=[alphaSpec.scenes.at(-1)];await page.evaluate(([s,a])=>window.acryllex.load(s,a),[alphaSpec,assets]);
 const withAlpha=await page.evaluate(()=>window.acryllex.probe(1,1164,670));alphaSpec.scenes[0].objects[0].params.sourceAlpha=false;await page.evaluate(([s,a])=>window.acryllex.load(s,a),[alphaSpec,assets]);const withoutAlpha=await page.evaluate(()=>window.acryllex.probe(1,1164,670));
 const changed=withAlpha.reduce((n,x,i)=>n+(x!==withoutAlpha[i]?1:0),0);assert.ok(changed>100,'Source coverage has no visible effect');
 assert.deepEqual(errors,[]);Object.assign(review,{passed:true,motion,alphaChangedPixels:changed,scope:'Actual source animation with pixel activity disabled; exact reverse seek; sampled frame margins; real cutout coverage. Static head/hand sources have no invented animation.',limits:'These checks establish source loading, coverage, motion and sampled framing. They do not establish photographic likeness, arbitrary grasping, expression realism, source motion quality or a universal framing guarantee.'});
}finally{await browser.close();}
await writeFile(output.replace(/\.mp4$/,'.verification.json'),JSON.stringify(review,null,2)+'\n');
const info=await renderVideo(spec,output,{fps:60});
const video=(await readFile(output)).toString('base64'),html=`<!doctype html><meta charset="utf-8"><style>video{display:block;width:100%;border-radius:var(--radius)}p{font:12px/1.5 var(--font-sans);color:var(--muted-foreground);margin:8px 0 0}a{color:var(--primary)}</style><video controls muted autoplay loop playsinline src="data:video/mp4;base64,${video}"></video><p>Objaverse trials · same shared pixel style · supplied human animation; static hand and head.</p><p>Sources (CC BY 4.0): <a href="https://sketchfab.com/3d-models/c5322a46a62644cebd41527859260b65">Free 018 Kana Music — ddd</a>; <a href="https://sketchfab.com/3d-models/97208693ce4b43729cdcc35621c51bc0">Realistic Left Hand — Ian Christopher</a>; <a href="https://sketchfab.com/3d-models/27f75fa94c384000bb6a79a3000f8e80">Angelica — NikZava284 / DarkNik</a>. Adapted materials, orientation and rendering.</p>`;
await writeFile(output.replace(/\.mp4$/,'.html'),html);console.log(JSON.stringify({output,duration:info.duration,fps:info.fps,review}));
