// GPU regression evidence: real sources, stable silhouettes, beat independence and reproducible seeking.
// node scripts/acryllex/verify-realism.mjs [output directory]
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {openAcryllex,stills,renderVideo} from './render.mjs';
import {assetsForSpec} from './assets.mjs';
import {referenceSheets} from './review-evidence.mjs';
import {cameraProblems} from '../../src/acryllex/camera-direction.ts';
import {applyStyleProfile} from '../../src/acryllex/style-profile.ts';

const out=resolve(process.argv[2]??'../artifacts/acryllex-realism');await mkdir(out,{recursive:true});
const fixture=applyStyleProfile(JSON.parse(await readFile(new URL('./fixtures/realism-motion.json',import.meta.url),'utf8')));
assert.deepEqual(cameraProblems(fixture),[]);
const hash=s=>createHash('sha256').update(s).digest('hex'),checks=[];
const subjects=[['photo','reference-image',{asset:'reference-hand-palm'}],['scan','wooden_spoon',{}],['water','water-glass',{}],['hand','hand-mesh',{}],['head','head-mesh',{}]];
for(const [id,model,params]of subjects){
 const spec={...fixture,scenes:[{say:id,duration:3,hue:'blue',objects:[{id,model,params,enter:'cut'}],raster:{activity:0}}],beat:{period:.6,phase:0}};
 const {page,browser,errors}=await openAcryllex(spec);
 try{
  const shots=await page.evaluate(times=>times.map(t=>window.acryllex.shot(t)),[1.2,1.5,1.8,2.1,1.2]);
  const count=await page.evaluate(()=>window.acryllex.probe(1.2,540,960).filter(x=>x>30).length);assert.ok(count>300,`${id} is empty or effectively invisible`);
  assert.equal(new Set(shots.map(hash)).size,1,`${id} moved or changed density on the beat`);
  const assets=await assetsForSpec(spec);delete spec.beat;
  await page.evaluate(([s,a])=>window.acryllex.load(s,a),[spec,assets]);
  const still=await page.evaluate(()=>window.acryllex.shot(1.2));assert.equal(hash(still),hash(shots[0]),`${id} changed when a beat grid was present`);
  assert.deepEqual(errors,[]);checks.push(`${id}: identical GPU frames at beat and offbeat times, reverse seek, and with/without the music grid; default camera and idle hold still with pixel activity explicitly disabled`);
 }finally{await browser.close();}
}
const motion=structuredClone(fixture);motion.scenes=motion.scenes.filter(s=>s.objects.some(o=>o.model==='reference-video'));
const {page,browser,errors}=await openAcryllex(motion);
try{
 let start=0;
 for(const sc of motion.scenes){
  const times=[start+.15,start+.9,start+.15],shots=await page.evaluate(ts=>ts.map(t=>window.acryllex.shot(t)),times);
  assert.notEqual(hash(shots[0]),hash(shots[1]),`${sc.objects[0].id} source action froze`);
  assert.equal(hash(shots[0]),hash(shots[2]),`${sc.objects[0].id} seeking changed the source anatomy`);
  checks.push(`${sc.objects[0].id}: actual recorded action advances and reverse seeking reproduces exactly the same face/hand frame`);start+=sc.duration;
 }
 assert.deepEqual(errors,[]);
}finally{await browser.close();}
const refs=await referenceSheets(fixture,out);checks.push(`${refs.length} photographed/filmed source references materialized for direct anatomy comparison`);
await stills(fixture,join(out,'source-transport-trials.png'),[1,3,5,7.5,10,12.5,15.5,18.5],.32,['Wood overview','Wood detail','Wood top','Water filling','Water refraction','Filmed hand contact','Filmed whole face','Thin optical path'],4);
const result={checks,style:{format:fixture.format,look:fixture.look},visualStyleStatus:'New reference-recording profile under review. Earlier raw photo/video hero trials were rejected by the user; transport assertions do not establish style approval.',scope:'These checks establish source playback fidelity, nonempty rendered subjects, camera variety and absence of default beat motion. Visual anatomy/material quality must also be reviewed against source images. They do not prove universal pose synthesis, object contact, an exact style match or full optical light transport.'};
await writeFile(join(out,'verification.json'),JSON.stringify(result,null,2)+'\n');
if(process.env.ACRYLLEX_REALISM_VIDEO==='1')await renderVideo(fixture,join(out,'source-transport-trials.mp4'));
console.log(JSON.stringify(result,null,2));
