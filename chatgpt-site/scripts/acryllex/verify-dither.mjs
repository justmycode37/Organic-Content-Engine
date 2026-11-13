// Real GPU checks for the optional reference tone curve. Chrome must be installed.
// node scripts/acryllex/verify-dither.mjs [--out=/path/to/evidence] [--frozen]
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {openAcryllex} from './render.mjs';

const args=process.argv.slice(2),out=args.find(a=>a.startsWith('--out='))?.slice(6),frozen=args.includes('--frozen');
assert.ok(args.every(a=>a==='--frozen'||a.startsWith('--out=')),'Usage: verify-dither.mjs [--out=/path/to/evidence] [--frozen]');
const site=fileURLToPath(new URL('../../',import.meta.url));
const evidence=out?resolve(out):null;
if(evidence)await mkdir(evidence,{recursive:true});
const save=async(name,png)=>{if(evidence)await writeFile(join(evidence,name+'.png'),Buffer.from(png,'base64'));};
const dither=await readFile(join(site,'src/acryllex/dither.ts'),'utf8');
const glsl=dither.match(/export const ditherThresholdGLSL\s*=\s*`([\s\S]*?)`/)?.[1];
assert.ok(glsl,'Missing public dither shader');
const base={version:1,series:'ACRYLLEX',title:'Dither regression',captions:false,format:{width:512,height:320,cell:4},
 look:{inkMode:'fixed',palette:{blue:'#1234c8'},shadows:0,ao:0,noise:.015,fuzz:0,gamma:1,contrast:1,dotRoundness:0,dotSoftness:0},
 scenes:[{say:'flat cards',duration:2,hue:'blue',ground:false,ao:0,camera:{move:'static',pos:[0,.6,3],look:[0,.6,0],fov:36},
 light:{key:0,fill:0,rim:0,ambient:1,contrast:1},objects:[{id:'cards',model:'compose',origin:'model',enter:'none',idle:'none',params:{grounded:false,
 // Both tones stay below the shader's .35 glow threshold: glow is animated
 // independently of dither and would invalidate comparisons across scene cuts.
 parts:[{shape:'box',size:[1.1,1.1,.02],pos:[-.6,.6,0],tone:.12},{shape:'box',size:[1.1,1.1,.02],pos:[.6,.6,0],tone:.3}]}}]}]};
const {browser,page,errors}=await openAcryllex(base);
const report={math:null,engine:null,frozen:null,errors};
try{
 // This oracle deliberately sums all 64 uniform components and numerically inverts
 // the reference CDF. It does not reuse the shader's closed-form sum or inverse.
 report.math=await page.evaluate(shader=>{
  const canvas=document.createElement('canvas'),gl=canvas.getContext('webgl2');
  if(!gl||!gl.getExtension('EXT_color_buffer_float'))throw new Error('Float WebGL2 targets unavailable');
  const compile=(kind,src)=>{const s=gl.createShader(kind);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;};
  const program=gl.createProgram();
  gl.attachShader(program,compile(gl.VERTEX_SHADER,'#version 300 es\nvoid main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.-1.,0.,1.);}'));
  gl.attachShader(program,compile(gl.FRAGMENT_SHADER,'#version 300 es\nprecision highp float;uniform sampler2D data;out vec4 value;\n'+shader+'\nvoid main(){vec4 a=texelFetch(data,ivec2(gl_FragCoord.xy),0);float t=a.z<0.?a.x:referenceThreshold(a.x,a.y,a.z);value=vec4(t,a.x,0.,1.);}'));
  gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
  const inputs=[],cases=[],edgeCases=[];let seed=918273;
  const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return (seed+.5)/4294967296;};
  for(const w of [.0001,.005,.015,.06,.25,.5,.99,1])for(const ref of [0,.015,1/65]){
   const start=inputs.length/4;
   for(let j=0;j<1024;j++){const rank=j%64,r=rand(),t=(1-w)*(rank+.5)/64+w*r;inputs.push(t,w,ref,1);}
   cases.push({w,ref,start,end:inputs.length/4});
  }
  for(const w of [0,1])for(const ref of [0,.015,1/65]){
   const start=inputs.length/4;
   for(let rank=0;rank<64;rank++)for(const r of [0,.5,1])inputs.push((1-w)*(rank+.5)/64+w*r,w,ref,1);
   edgeCases.push({w,ref,start,end:inputs.length/4});
  }
  const coverage=[];
  for(const [tag,w,ref] of [['baseline',.015,-1],['corrected',.06,.015],['raw',.06,-1]]){
   const start=inputs.length/4;
   for(let rank=0;rank<64;rank++)for(let j=0;j<512;j++)inputs.push((1-w)*(rank+.5)/64+w*(j+.5)/512,w,ref,1);
   coverage.push({tag,start,end:inputs.length/4});
  }
  const width=1024,height=Math.ceil(inputs.length/4/width),data=new Float32Array(width*height*4);data.set(inputs);
  canvas.width=width;canvas.height=height;
  const texture=(pixels)=>{const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,width,height,0,gl.RGBA,gl.FLOAT,pixels);return t;};
  const source=texture(data),target=texture(null),frame=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,frame);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,target,0);
  if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('Incomplete float target');
  gl.useProgram(program);gl.bindTexture(gl.TEXTURE_2D,source);gl.uniform1i(gl.getUniformLocation(program,'data'),0);gl.viewport(0,0,width,height);gl.drawArrays(gl.TRIANGLES,0,3);
  const result=new Float32Array(data.length);gl.readPixels(0,0,width,height,gl.RGBA,gl.FLOAT,result);const error=gl.getError();
  const cdf=(t,w)=>{let sum=0;for(let rank=0;rank<64;rank++)sum+=Math.max(0,Math.min(1,(t-(1-w)*(rank+.5)/64)/w));return sum/64;};
  const quantile=(p,w)=>{if(w===0)return (Math.min(63,Math.floor(p*64))+.5)/64;if(p<=0)return (1-w)*.5/64;if(p>=1)return (1-w)*63.5/64+w;let lo=0,hi=1;for(let n=0;n<60;n++){const m=(lo+hi)/2;if(cdf(m,w)<p)lo=m;else hi=m;}return (lo+hi)/2;};
  for(const test of cases){let maxError=0,meanError=0,noOpExact=true,finite=true;
   for(let i=test.start;i<test.end;i++){const [t,w,ref]=data.subarray(i*4,i*4+3),actual=result[i*4];finite&&=Number.isFinite(actual)&&actual>=0&&actual<=1;const expected=Math.abs(w-ref)<1e-6?t:quantile(cdf(t,w),ref),delta=Math.abs(actual-expected);maxError=Math.max(maxError,delta);meanError+=delta;if(Math.abs(w-ref)<1e-6)noOpExact&&=actual===t;}
   Object.assign(test,{maxError,meanError:meanError/(test.end-test.start),finite,noOpExact});delete test.start;delete test.end;
  }
  for(const test of edgeCases){let min=1,max=0,finite=true,noOpExact=true;for(let i=test.start;i<test.end;i++){const actual=result[i*4];finite&&=Number.isFinite(actual)&&actual>=0&&actual<=1;min=Math.min(min,actual);max=Math.max(max,actual);if(test.w===test.ref)noOpExact&&=actual===data[i*4];}Object.assign(test,{min,max,finite,noOpExact});delete test.start;delete test.end;}
  const densities=[.004,.008,.012,.02,.031,.06,.1,.2,.35,.5,.65,.8,.9,.94,.969,.98,.988,.992,.996];
  for(const test of coverage){test.tones=densities.map(d=>{let occupied=0;for(let i=test.start;i<test.end;i++)occupied+=result[i*4]<d;return {density:d,coverage:occupied/(test.end-test.start)};});delete test.start;delete test.end;}
  gl.deleteFramebuffer(frame);gl.deleteTexture(source);gl.deleteTexture(target);gl.deleteProgram(program);gl.getExtension('WEBGL_lose_context')?.loseContext();
  return {renderer:gl.getParameter(gl.RENDERER),error,samples:inputs.length/4,cases,edgeCases,coverage};
 },glsl);

 // Store decoded images in the page so comparisons inspect pixels, not PNG encoders.
 await page.evaluate(()=>{
  window.ditherChecks={images:new Map(),async capture(name,t=1){const png=window.acryllex.shot(t),img=new Image();img.src='data:image/png;base64,'+png;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(img,0,0);const bytes=x.getImageData(0,0,c.width,c.height).data;this.images.set(name,{png,bytes,width:c.width,height:c.height});const colors=new Map();let lit=0;for(let i=0;i<bytes.length;i+=4)if(bytes[i]+bytes[i+1]+bytes[i+2]>0){const key=Array.from(bytes.subarray(i,i+3)).join(',');colors.set(key,(colors.get(key)??0)+1);lit++;}return {png,lit,colors:[...colors.keys()],pixels:bytes.length/4};},compare(a,b){const x=this.images.get(a),y=this.images.get(b);if(x.bytes.length!==y.bytes.length)throw new Error('Image size mismatch');let pixels=0,sum=0,max=0;for(let i=0;i<x.bytes.length;i+=4){let any=false;for(let c=0;c<3;c++){const d=Math.abs(x.bytes[i+c]-y.bytes[i+c]);any||=d>0;sum+=d;max=Math.max(max,d);}pixels+=any;}return {pixels,meanAbsoluteError:sum/(x.bytes.length/4*3),max};}};
 });
 const capture=async(name,spec,t=1)=>{await page.evaluate(s=>window.acryllex.load(s),spec);const result=await page.evaluate(([n,t])=>window.ditherChecks.capture(n,t),[name,t]);await save(name,result.png);delete result.png;return result;};
 const compare=(a,b)=>page.evaluate(([a,b])=>window.ditherChecks.compare(a,b),[a,b]);
 const baseline=await capture('baseline',base);
 const correctedSpec=structuredClone(base);Object.assign(correctedSpec.look,{noise:.06,noiseReference:.015});
 const corrected=await capture('corrected',correctedSpec);
 const rawSpec=structuredClone(base);rawSpec.look.noise=.06;
 const raw=await capture('raw',rawSpec);
 const sameSpec=structuredClone(base);sameSpec.look.noiseReference=.015;
 await capture('same-reference',sameSpec);
 const sameReference=await compare('baseline','same-reference');
 await page.evaluate(()=>{window.acryllex.shot(1.9);window.acryllex.shot(0);});
 await page.evaluate(()=>window.ditherChecks.capture('same-reverse',1));
 const reverseNoOp=await compare('same-reference','same-reverse');
 await capture('corrected-seek',correctedSpec);
 await page.evaluate(()=>{window.acryllex.shot(1.9);window.acryllex.shot(0);});
 await page.evaluate(()=>window.ditherChecks.capture('corrected-reverse',1));
 const reverseCorrected=await compare('corrected','corrected-reverse');
 const local=structuredClone(base);local.scenes[0].light.noise=.06;local.scenes[0].light.noiseReference=.015;
 await capture('scene-local',local);
 const sceneOverride=await compare('corrected','scene-local');
 const zeroRef=structuredClone(base);zeroRef.look.noise=.06;zeroRef.look.noiseReference=0;
 await capture('zero-reference',zeroRef);
 const cut=structuredClone(correctedSpec);cut.scenes=[structuredClone(base.scenes[0]),structuredClone(base.scenes[0]),structuredClone(base.scenes[0])];
 Object.assign(cut.scenes[0].light,{noise:.015,noiseReference:.015});
 Object.assign(cut.scenes[1].light,{noise:.06,noiseReference:0});
 await capture('cut-local',cut,1);
 await page.evaluate(()=>window.ditherChecks.capture('cut-zero',3));
 await page.evaluate(()=>window.ditherChecks.capture('cut-global',5));
 await page.evaluate(()=>window.ditherChecks.capture('cut-reverse',1));
 const cutOverrides={local:await compare('baseline','cut-local'),zero:await compare('zero-reference','cut-zero'),globalReset:await compare('corrected','cut-global'),reverse:await compare('baseline','cut-reverse')};
 await capture('reload-default',base);
 const reloadReset=await compare('baseline','reload-default');
 const engineEndpoints=[];
 for(const noise of [0,1])for(const noiseReference of [0,1/65]){
  const endpoint=structuredClone(base);Object.assign(endpoint.look,{noise,noiseReference});
  engineEndpoints.push({noise,noiseReference,...await capture(`endpoint-${noise}-${noiseReference===0?'zero':'max'}`,endpoint)});
 }
 // Remove only the correction call from a fresh current bundle. This catches any
 // image change introduced by the optional shader path when the option is absent.
 const stripped=(await build({entryPoints:[join(site,'src/acryllex/page.ts')],bundle:true,write:false,format:'iife',target:'es2022',loader:{'.ttf':'dataurl'},logLevel:'error',plugins:[{name:'uncorrected-oracle',setup(b){b.onLoad({filter:/engine\.ts$/},async a=>{const source=await readFile(a.path,'utf8'),line='if(noiseReference>=0.)thr=referenceThreshold(thr,noiseAmt,noiseReference);';assert.ok(source.includes(line),'Correction hook changed');return {contents:source.replace(line,''),loader:'ts'};});}}]})).outputFiles[0].text;
 const legacy=await browser.newPage();let oldPng;
 try{await legacy.goto('about:blank');await legacy.addScriptTag({content:stripped});await legacy.evaluate(s=>window.acryllex.load(s),base);oldPng=await legacy.evaluate(()=>window.acryllex.shot(1));}finally{await legacy.close();}
 await page.evaluate(async png=>{const image=new Image();image.src='data:image/png;base64,'+png;await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const x=c.getContext('2d');x.drawImage(image,0,0);window.ditherChecks.images.set('stripped',{bytes:x.getImageData(0,0,c.width,c.height).data});},oldPng);
 const defaultOff=await compare('baseline','stripped');
 report.engine={baseline,corrected,raw,engineEndpoints,grainChange:await compare('baseline','corrected'),rawChange:await compare('baseline','raw'),sameReference,reverseNoOp,reverseCorrected,sceneOverride,cutOverrides,reloadReset,defaultOff};

 if(frozen){
  const dir=fileURLToPath(new URL('../../../artifacts/animation-recreation/',import.meta.url));
  const {pageFor,privateSpec,offset}=await import(new URL('../../../artifacts/animation-recreation/agent-cube24-runtime.mjs',import.meta.url));
  const spec=JSON.parse(await readFile(join(dir,'round22-spec.json'),'utf8')),comparisons=[];
  for(const correctedMode of [false,true]){
   const frozenPage=await pageFor(browser,spec,correctedMode),currentSpec=privateSpec(spec,correctedMode);
   if(correctedMode)currentSpec.look.noiseReference=.015;
   try{for(const nativeTime of [25.1,27.1]){
    const t=nativeTime-offset,tag=`cube-${correctedMode?'prototype':'legacy'}-${nativeTime}`;
    await capture(tag+'-current',currentSpec,t);
    const png=await frozenPage.evaluate(t=>window.acryllex.shot(t),t);await save(tag+'-frozen',png);
    await page.evaluate(async([name,png])=>{const image=new Image();image.src='data:image/png;base64,'+png;await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const x=c.getContext('2d');x.drawImage(image,0,0);window.ditherChecks.images.set(name,{bytes:x.getImageData(0,0,c.width,c.height).data});},[tag+'-frozen',png]);
    comparisons.push({nativeTime,corrected:correctedMode,...await compare(tag+'-current',tag+'-frozen')});
   }}finally{await frozenPage.close();}
  }
  report.frozen=comparisons;
 }
 if(evidence)await writeFile(join(evidence,'results.json'),JSON.stringify(report,null,2)+'\n');
 assert.deepEqual(errors,[],'Browser errors');
 assert.equal(report.math.error,0,'WebGL error');
 for(const c of report.math.cases){assert.ok(c.finite,'Nonfinite thresholds');assert.ok(c.noOpExact,'Same-noise correction changes thresholds');assert.ok(c.maxError<(c.w<.001?.00002:.000001),`64-component numerical oracle mismatch: ${JSON.stringify(c)}`);}
 for(const c of report.math.edgeCases){assert.ok(c.finite,'Noise/reference endpoint produces nonfinite thresholds');assert.ok(c.noOpExact,'Zero-noise same-reference changes thresholds');}
 const distributions=report.math.coverage,old=distributions.find(x=>x.tag==='baseline').tones,now=distributions.find(x=>x.tag==='corrected').tones,unfixed=distributions.find(x=>x.tag==='raw').tones;
 const correctedError=Math.max(...old.map((x,i)=>Math.abs(x.coverage-now[i].coverage))),rawError=Math.max(...old.map((x,i)=>Math.abs(x.coverage-unfixed[i].coverage)));
 assert.ok(correctedError<.0006,`Flat-field coverage does not match reference: ${correctedError}`);
 assert.ok(rawError>.01,'Flat-field check does not expose raw-noise tone starvation');
 for(const image of [baseline,corrected,raw,...engineEndpoints])assert.deepEqual(image.colors,['18,52,200'],'Noise correction changes fixed RGB');
 assert.ok(Math.abs(corrected.lit-baseline.lit)/baseline.lit<.02,'Corrected finite patch does not approximately preserve baseline density');
 assert.ok((baseline.lit-raw.lit)/baseline.lit>.04,'Raster fixture does not expose raw-noise starvation');
 assert.ok(report.engine.grainChange.pixels>100,'Noise correction does not change grain');
 for(const [name,stats] of Object.entries({sameReference,reverseNoOp,reverseCorrected,sceneOverride,reloadReset,defaultOff,...cutOverrides}))assert.equal(stats.pixels,0,`${name}: ${JSON.stringify(stats)}`);
 if(frozen)for(const c of report.frozen)assert.ok(c.pixels===0,`Frozen ${c.corrected?'prototype':'legacy22'} pixel difference: ${JSON.stringify(c)}`);
 console.log(`Dither GPU checks passed: ${report.math.samples} samples, independent 64-component numerical oracle, finite endpoints, coverage error ${correctedError.toFixed(6)} versus raw ${rawError.toFixed(6)}, fixed RGB, grain change, default-off, no-op, scene cuts and reverse seeking${frozen?', frozen22/prototype native frames':''}.`);
 if(evidence)console.log(`Evidence written to ${evidence}`);
}finally{await browser.close();}
