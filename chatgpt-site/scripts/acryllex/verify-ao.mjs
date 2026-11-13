// Real GPU AO correctness checks. Run manually with Chrome installed:
//   node scripts/acryllex/verify-ao.mjs [--out=/path/to/optional/evidence]
// CHROME_PATH overrides the same macOS/Linux executable defaults as render.mjs.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';

const CHROME=process.env.CHROME_PATH?.trim()||(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'/usr/bin/chromium');
const args=process.argv.slice(2),output=args.find(arg=>arg.startsWith('--out='))?.slice(6);
assert.ok(args.every(arg=>arg.startsWith('--out='))&&(!args.length||output),'Usage: verify-ao.mjs [--out=/path/to/evidence]');
const bundle=(await build({entryPoints:[fileURLToPath(new URL('./ao-test-scene.ts',import.meta.url))],bundle:true,write:false,format:'iife',target:'es2022',logLevel:'error'})).outputFiles[0].text;
const browser=await chromium.launch({headless:true,executablePath:CHROME,args:['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
 await page.goto('about:blank');await page.addScriptTag({content:bundle});
 const report=await page.evaluate(images=>window.aoRegression.run({images}),Boolean(output));
 const images=report.images;delete report.images;report.errors=errors;
 if(output){
  const path=resolve(output);await mkdir(path,{recursive:true});
  for(const [name,png] of Object.entries(images))await writeFile(join(path,name+'.png'),Buffer.from(png,'base64'));
  await writeFile(join(path,'ao-results.json'),JSON.stringify(report,null,2)+'\n');
 }
 assert.deepEqual(errors,[],'AO shader/browser errors');
 const valid=(stats,label)=>{assert.ok(stats.count>0&&stats.finite&&Number.isFinite(stats.mean),`${label}: missing or nonfinite GPU output`);assert.ok(stats.min>=0&&stats.max<=1,`${label}: AO outside [0,1]`);};
 for(const plane of report.planes){
  for(const mode of ['plane','legacy'])valid(plane[mode],plane.name+' '+mode);
  assert.ok(plane.plane.min>=.99999,`${plane.name}: false occlusion on a uniform plane (${JSON.stringify(plane.plane)})`);
 }
 assert.ok(report.planes.find(p=>p.name==='tilt-x').legacy.mean<.8,'Tilted-plane probe does not expose the legacy defect');
 for(const mode of ['plane','legacy'])valid(report.rasterPlane[mode].all,'raster plane '+mode);
 assert.ok(report.rasterPlane.plane.all.min>=.99999,'Rasterized tilted plane occludes itself');
 const {all,contact,far}=report.contact.plane;
 valid(all,'box contact');valid(contact,'contact region');valid(far,'distant floor');
 assert.ok(contact.count>1000&&far.count>1000,'Projected geometry does not cover the contact/floor probes');
 assert.ok(contact.mean<.9&&contact.min<.5,'Real box contact shadow was removed');
 assert.ok(far.mean>.98&&far.mean-contact.mean>.25,'Contact shadow is not localized beside the box');
 for(const [name,stats] of Object.entries(report.edgeCases)){
  valid(stats,name);
  if(['clearDepth','nearClip','zeroRadius','zeroStrength'].includes(name))assert.equal(stats.min,1,`${name}: unexpectedly dark output`);
 }
 for(const test of report.order)assert.ok(test.exact,`${test.mode}: moving geometry depends on render order`);
 for(const test of report.engine.order)assert.ok(test.exact,`${test.mode}: engine reverse seeking changes the frame`);
 assert.ok(report.engine.defaultMatchesPlane,'Default AO does not match explicit look.aoMethod="plane"');
 assert.ok(report.engine.sceneOverridesExact,'Scene AO override/cut differences: '+JSON.stringify(report.engine.sceneOverrideDifferences));
 assert.ok(report.engine.legacyMean<report.engine.planeMean*.8,'look.aoMethod="legacy" does not select the legacy shader');
 assert.ok(report.engine.planeDifferenceFromOff<1&&report.engine.legacyDifferenceFromOff>2,'Integrated engine retains broad planar AO artifacts');
 console.log(`AO GPU checks passed: ${report.planes.length} analytic planes, rasterized plane, localized box contact (${contact.mean.toFixed(3)} versus ${far.mean.toFixed(3)}), finite edge cases, fractional dots, reverse seeking, and public AO modes.`);
 if(output)console.log(`Evidence written to ${resolve(output)}`);
}finally{await browser.close();}
