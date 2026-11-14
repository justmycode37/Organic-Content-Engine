// Portable media preparation checks. Requires ffmpeg/ffprobe; creates only temporary synthetic sources.
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {prepareFootage} from './media-assets.mjs';
import {footageVariantKey} from '../../src/acryllex/media-key.ts';
import {isFootageModel,resolveFootageParams} from '../../src/acryllex/media-library.ts';

const dir=await mkdtemp(join(tmpdir(),'acryllex-media-prepare-')),assets=join(dir,'assets'),checks=[];
function run(args){const r=spawnSync('ffmpeg',['-v','error','-y',...args],{maxBuffer:8*1024*1024});if(r.status!==0)throw new Error(String(r.stderr));return r.stdout;}
const format={width:48,height:40,cell:4},file=join(dir,'seven.mkv');
const colors=[[255,0,0],[0,255,0],[0,0,255],[255,255,255],[0,0,0],[255,255,0],[0,255,255]];
const pixels=Buffer.concat(colors.map(rgb=>Buffer.from(Array.from({length:12*8},()=>rgb).flat())));
const source=join(dir,'source.rgb');await writeFile(source,pixels);
const spec=params=>({format,scenes:[{objects:[{model:'footage',params:{file,blur:0,...params}}]}]});
async function prepared(params){const result=await prepareFootage(spec(params),assets),path=result[footageVariantKey(file,{blur:0,...params})];assert.ok(path);return {result,path,manifest:JSON.parse(await readFile(join(assets,path),'utf8'))};}
function rgba(manifest){return run(['-i',join(assets,manifest.atlases[0]),'-frames:v','1','-f','rawvideo','-pix_fmt','rgba','pipe:1']);}
function sample(data,manifest,frame,x=2,y=2){const stride=manifest.cols*manifest.w,px=(frame%manifest.cols)*manifest.w+x,py=Math.floor(frame/manifest.cols)*manifest.h+y,k=(py*stride+px)*4;return [...data.subarray(k,k+4)];}
try{
 run(['-f','rawvideo','-pixel_format','rgb24','-video_size','12x8','-framerate','5','-i',source,'-c:v','ffv1','-pix_fmt','bgr0',file]);
 const raw=await prepared({fps:5,cols:12,rows:8});assert.equal(raw.manifest.frames,7);assert.equal(raw.manifest.atlases.length,1);
 const rawPixels=rgba(raw.manifest);for(let i=0;i<7;i++)assert.deepEqual(sample(rawPixels,raw.manifest,i),[...colors[i],255]);checks.push('Exact decoded frame count and final partial atlas preserve all seven known RGB frames');
 const trim={fps:5,cols:12,rows:8,sourceStart:.4,sourceDuration:.6},clipped=await prepared(trim);assert.equal(clipped.manifest.frames,3);
 const clippedPixels=rgba(clipped.manifest);for(let i=0;i<3;i++)assert.deepEqual(sample(clippedPixels,clipped.manifest,i),[...colors[i+2],255]);checks.push('Source trimming begins on the correct frame and emits exactly three frames');
 const mono=await prepared({...trim,monochrome:true}),monoPixels=rgba(mono.manifest);for(const [i,expected]of [[0,18],[1,255],[2,0]]){const pixel=sample(monoPixels,mono.manifest,i);assert.equal(pixel[0],pixel[1]);assert.equal(pixel[1],pixel[2]);assert.ok(Math.abs(pixel[0]-expected)<=1);assert.equal(pixel[3],255);}checks.push('BT709 luminance preserves bright foam and sparse blue-water tones without source hue');
 const all=await prepareFootage({format,scenes:[{objects:[{model:'video',params:{file,blur:0,...trim}},{model:'clip',params:{file,blur:0,...trim,monochrome:true}}]}]},assets);
 assert.equal(all['footage:'+file],undefined);assert.equal(Object.keys(all).length,2);assert.notEqual(Object.values(all)[0],Object.values(all)[1]);checks.push('Two preparation variants of one file have separate keys and no ambiguous legacy alias');
 assert.equal(footageVariantKey(file,{...trim,start:1,timeOrigin:2,loop:true}),footageVariantKey(file,trim));checks.push('Playback offsets do not duplicate prepared media');
 const aspect=await prepared({fps:5,preserveAspect:true});assert.equal(aspect.manifest.w,12);assert.equal(aspect.manifest.h,8);const legacy=await prepared({fps:5});assert.equal(legacy.manifest.h,10);checks.push('Source aspect is preserved when requested; legacy format sizing remains available');
 const detailed=await prepared({fps:5,preserveAspect:true,sampleScale:3});assert.equal(detailed.manifest.w,36);assert.equal(detailed.manifest.h,24);assert.notEqual(detailed.path,aspect.path);assert.notEqual(footageVariantKey(file,{sampleScale:3}),footageVariantKey(file,{}));checks.push('Source supersampling retains a finer luminance field without changing the output dot grid');
 const still=join(dir,'still.png');run(['-i',file,'-frames:v','1',still]);const stillMap=await prepareFootage({format,scenes:[{objects:[{model:'footage',params:{file:still,blur:0,preserveAspect:true}}]}]},assets),stillManifest=JSON.parse(await readFile(join(assets,Object.values(stillMap)[0]),'utf8'));assert.equal(stillManifest.frames,1);assert.equal(stillManifest.h,8);checks.push('A normal photograph is a one-frame library asset with its original aspect');
 const mask=join(dir,'mask.pgm');await writeFile(mask,Buffer.concat([Buffer.from('P5\n12 8\n255\n'),Buffer.from(Array.from({length:96},(_,i)=>i%12<6?255:0))]));
 const alpha=await prepared({...trim,alphaFile:mask}),alphaPixels=rgba(alpha.manifest);assert.equal(sample(alphaPixels,alpha.manifest,0,2)[3],255);assert.equal(sample(alphaPixels,alpha.manifest,0,9)[3],0);checks.push('An explicit matte preserves source pixels and removes the background through alpha');
 const inverted=await prepared({...trim,alphaFile:mask,invertAlpha:true}),invertedPixels=rgba(inverted.manifest);assert.equal(sample(invertedPixels,inverted.manifest,0,2)[3],0);assert.equal(sample(invertedPixels,inverted.manifest,0,9)[3],255);checks.push('Matte polarity is explicit and independently cached');
 const mirrored=await prepared({...trim,alphaFile:mask,mirrorX:true}),mirroredPixels=rgba(mirrored.manifest);assert.equal(sample(mirroredPixels,mirrored.manifest,0,2)[3],0);assert.equal(sample(mirroredPixels,mirrored.manifest,0,9)[3],255);checks.push('Mirroring transforms the real image and its matte together');
 const shortMask=join(dir,'short-mask.mkv');run(['-f','lavfi','-i','color=white:s=12x8:r=5:d=0.4','-c:v','ffv1',shortMask]);await assert.rejects(()=>prepared({...trim,alphaFile:shortMask}),/alpha video does not cover/);checks.push('A short alpha video cannot silently truncate the selected source interval');
 const preset=resolveFootageParams('wave-footage',{height:6}),explicitPreset=resolveFootageParams('footage',{asset:'ocean-breaker',height:6});assert.deepEqual(preset,explicitPreset);assert.ok(isFootageModel('ocean_wave_media'));assert.equal(preset.monochrome,true);assert.match(preset.alphaFile,/^library:/);assert.equal(preset.height,6);assert.equal(preset.sourceStart,4);assert.throws(()=>resolveFootageParams('footage',{asset:'unknown'}),/unknown library asset/);assert.throws(()=>resolveFootageParams('wave-footage',{file}),/choose a library asset or/);await assert.rejects(()=>prepared({...trim,expectedSHA256:'wrong'}),/source hash differs/);checks.push('Named subjects resolve identically in preparation and playback, pin the source, and reject mismatched custom files');
 const prior=raw.path;run(['-f','rawvideo','-pixel_format','rgb24','-video_size','12x8','-framerate','5','-i',source,'-vf','negate','-c:v','ffv1','-pix_fmt','bgr0',file]);assert.notEqual((await prepared({fps:5,cols:12,rows:8})).path,prior);checks.push('Replacing a source at the same path invalidates the content cache');
 for(const params of [{fps:0},{sampleScale:0},{sampleScale:5},{crop:'20:8:0:0'},{crop:'12:8:0:0,negate'},{sourceStart:20},{sourceDuration:1000}])await assert.rejects(()=>prepareFootage(spec(params),assets));checks.push('Invalid frame rates, sampling scales, crop filters, out-of-range starts and frame budgets fail before rendering');
 console.log(JSON.stringify({passed:checks.length,checks},null,2));
}finally{await rm(dir,{recursive:true,force:true});}
