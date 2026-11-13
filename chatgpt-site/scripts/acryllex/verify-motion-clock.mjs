// Portable native GPU checks for optional scene motion sampling. No local reference artifacts required.
// node scripts/acryllex/verify-motion-clock.mjs [--out=/path/to/evidence]
import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {openAcryllex} from './render.mjs';

const args=process.argv.slice(2);
assert.ok(args.every(a=>a.startsWith('--out='))&&args.length<=1,'Usage: verify-motion-clock.mjs [--out=/path/to/evidence]');
const output=args[0]?.slice(6);assert.notEqual(output,'','--out requires a directory');
const out=output?resolve(output):null,checks=[];if(out)await mkdir(out,{recursive:true});
const bundled=(await build({entryPoints:[fileURLToPath(new URL('../../src/acryllex/motion-clock.ts',import.meta.url))],bundle:true,write:false,format:'esm'})).outputFiles[0].text;
const {sampleMotionTime}=await import('data:text/javascript;base64,'+Buffer.from(bundled).toString('base64'));
for(const t of [0,.123,1/60,15.883333333333333,1000.1]){
 for(const fps of [undefined,0,-1,NaN,Infinity])assert.ok(Object.is(sampleMotionTime(t,14.42,fps),t));
}
checks.push({name:'Absent or invalid motion clock leaves exact original time unchanged',passed:true});
const ticks=[[0,0],[1,1/60],[2,1/60],[3,1/60],[4,1/60+.04],[5,1/60+.04],[6,1/60+.08],[8,1/60+.08],[9,1/60+.12],[10,1/60+.12],[11,1/60+.16],[12,1/60+.16],[13,1/60+.2]];
for(const [frame,expected] of ticks)assert.ok(Math.abs(sampleMotionTime(frame/60,0,25,1/60)-expected)<1e-12);
checks.push({name:'Global25fps clock has the independently observed2/3 capture-frame hold sequence',passed:true});
for(const start of [.13,14.42,19.78])assert.ok(sampleMotionTime(0,start,5,.05)>=0);
checks.push({name:'A scene cut clamps the pre-cut sample without a negative local animation time',passed:true});

const base={version:1,series:'ACRYLLEX',title:'Clock control',captions:false,format:{width:600,height:400,cell:2},
 look:{inkMode:'fixed',palette:{blue:'#1234c8'},textColor:'#c5c5c5',shadows:0,ao:0,noise:0,fuzz:0,gamma:1,contrast:1,dotRoundness:0,dotSoftness:0},
 scenes:[{say:'lead',duration:.13,hue:'blue',ground:false,ao:0,objects:[{id:'off',model:'cube',origin:'center',enter:'cut',enterAt:4,idle:'none'}]},
 {say:'moving scene',duration:1.5,hue:'blue',ground:false,ao:0,motionFPS:5,motionPhase:.05,
 camera:{move:'static',pos:[0,0,4],look:[0,0,0],fov:36},
 objects:[{id:'box',model:'cube',origin:'center',enter:'none',idle:'none',scale:.8,keyframes:[{at:0,pos:[-.6,0,0],rot:[0,0,0]},{at:1,pos:[.6,.3,0],rot:[10,70,0],scale:1.1}]}],
 events:[{at:0,dur:1,camera:{pos:[1.1,.6,4],look:[.2,0,0],fov:38}}],
 light:{key:.4,fill:0,rim:0,ambient:.2,contrast:1,blackPoint:0,whitePoint:1,gamma:1,exposure:1,points:[{pos:[1,1,2],intensity:.7,active:[.15,.6],fade:.1}],keyframes:[{at:.8,exposure:1.6}]},text:[]}]};
const {browser,page,errors}=await openAcryllex(base);
const digest=b64=>createHash('sha256').update(Buffer.from(b64,'base64')).digest('hex');
const shot=t=>page.evaluate(t=>window.acryllex.shot(t),t);
async function pixels(t){return page.evaluate(async t=>{const im=new Image();im.src='data:image/png;base64,'+window.acryllex.shot(t);await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(im,0,0);return Array.from(x.getImageData(0,0,c.width,c.height).data);},t);}
try{
 const a=await shot(.26),b=await shot(.43);assert.equal(digest(a),digest(b));
 checks.push({name:'Object pose, camera, light events and exposure hold together on one clock',passed:true});
 const smooth=structuredClone(base);delete smooth.scenes[1].motionFPS;delete smooth.scenes[1].motionPhase;
 await page.evaluate(s=>window.acryllex.load(s),smooth);
 assert.equal(digest(await shot(.25)),digest(a));
 assert.notEqual(digest(await shot(.26)),digest(await shot(.43)));
 checks.push({name:'Held geometry equals an independently rendered continuous-clock frame; control really moves',passed:true});
 await page.evaluate(s=>window.acryllex.load(s),base);await shot(.77);assert.equal(digest(await shot(.26)),digest(a));
 checks.push({name:'Reverse seeking reproduces the same native held frame',passed:true});
 const text=structuredClone(base);text.scenes[1].text=[{text:'AB',font:'roboto-mono',weight:400,style:'mono',at:0,until:1.5,pos:[.1,.9],size:32,reveal:[[.12,1],[.22,2]],cursor:false,erase:false,glitchOnLand:false}];
 await page.evaluate(s=>window.acryllex.load(s),text);
 const pa=await pixels(.26),pb=await pixels(.43);let top=0,bottom=0;
 for(let y=0;y<400;y++)for(let x=0;x<600;x++){const k=(y*600+x)*4;if(pa[k]!==pb[k]||pa[k+1]!==pb[k+1]||pa[k+2]!==pb[k+2]){if(y<315)top++;else bottom++;}}
 assert.equal(top,0);assert.ok(bottom>50);
 checks.push({name:'Explicit text reveal advances at its original timing while geometry remains held',passed:true,topChanged:top,textChanged:bottom});
 assert.deepEqual(errors,[]);
 if(out)await writeFile(join(out,'verification-summary.json'),JSON.stringify({checks,errors},null,2)+'\n');
 console.log(JSON.stringify({passed:checks.length,checks,errors}));
}finally{await browser.close();}
