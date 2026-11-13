// Portable client GPU tests: generated prepared clips, no external media/ignored artifacts/FFmpeg required.
// node scripts/acryllex/verify-media29.mjs [--out=/path/to/optional/evidence]
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';
const args=process.argv.slice(2),output=args[0]?.slice(6);assert.ok(args.length<=1&&args.every(a=>a.startsWith('--out=')&&a.length>6),'Usage: verify-media29.mjs [--out=/path/to/evidence]');
const bundle=(await build({entryPoints:[fileURLToPath(new URL('./media29-test-scene.ts',import.meta.url))],bundle:true,write:false,format:'iife',target:'es2022',logLevel:'error'})).outputFiles[0].text;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH?.trim()||(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'/usr/bin/chromium'),args:['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage(),errors=[],gpuErrors=[],files=new Map(),requests=new Map();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/WebGL|GL_INVALID|shader error/i.test(m.text()))gpuErrors.push(m.text());});
 await page.route('http://acx.local/**',async route=>{const path=new URL(route.request().url()).pathname;if(path==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Media playback regression</title>'});const key=decodeURIComponent(path.replace(/^\/a\//,''));requests.set(key,(requests.get(key)??0)+1);if(key==='media29/retry.json'&&requests.get(key)===1)return route.fulfill({status:503,body:'expected retry fixture'});const f=files.get(key);if(!f)return route.fulfill({status:404,body:'expected missing fixture'});return route.fulfill({contentType:f.type,body:f.base64?Buffer.from(f.body,'base64'):f.body,headers:{'cache-control':'no-store'}});});
 await page.goto('http://acx.local/');await page.addScriptTag({content:bundle});const fixtures=await page.evaluate(()=>window.mediaRegression.fixtureFiles());for(const f of fixtures.files)files.set(f.path,f);
 const report=await page.evaluate(images=>window.mediaRegression.run({images}),Boolean(output));const images=report.images;delete report.images;report.errors=errors;report.gpuErrors=gpuErrors;report.requests=Object.fromEntries(requests);
 assert.deepEqual(errors,[],'Uncaught media/browser errors');assert.deepEqual(gpuErrors,[],'Media GPU errors');assert.equal(requests.get('media29/color/manifest.json'),1,'Decoded manifest should stay cached across aliases/instances/disposal');assert.equal(requests.get('media29/mono/manifest.json'),1);assert.equal(requests.get('media29/retry.json'),2,'Rejected manifest promise must be evicted for retry');
 if(output){const out=resolve(output);await mkdir(out,{recursive:true});for(const[name,png]of Object.entries(images))await writeFile(join(out,name+'.png'),Buffer.from(png,'base64'));await writeFile(join(out,'media29-results.json'),JSON.stringify(report,null,2)+'\n');}
 console.log(JSON.stringify({passed:report.checks.length,checks:report.checks,resources:report.resources,errors,gpuErrors}));
}finally{await browser.close();}
