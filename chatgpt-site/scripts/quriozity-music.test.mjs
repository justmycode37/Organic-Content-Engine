import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {execFileSync,spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {prepareMusicBed,MUSIC_LEVEL} from './quriozity/music-level.mjs';
import {calibrateMix} from './quriozity/produce.mjs';

const available=spawnSync('ffmpeg',['-version'],{stdio:'ignore'}).status===0;
const ffmpeg=args=>execFileSync('ffmpeg',['-hide_banner','-nostats','-loglevel','error','-y',...args],{maxBuffer:16<<20});
const tone=(file,expression)=>ffmpeg(['-f','lavfi','-i',`aevalsrc=${expression}:s=48000:d=6`,'-ac','2','-c:a','pcm_f32le',file]);
const pcm=file=>{const b=ffmpeg(['-i',file,'-ac','1','-ar','48000','-f','f32le','-']);return new Float32Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.length));};
const rms=(samples,start,end)=>{let sum=0;for(let i=Math.round(start*48000);i<Math.round(end*48000);i++)sum+=samples[i]**2;return Math.sqrt(sum/((end-start)*48000));};
const amplitude=(samples,start,end,hz)=>{let real=0,imag=0;const from=Math.round(start*48000),to=Math.round(end*48000);for(let i=from;i<to;i++){const phase=2*Math.PI*hz*i/48000;real+=samples[i]*Math.cos(phase);imag+=samples[i]*Math.sin(phase);}return 2*Math.hypot(real,imag)/(to-from);};
async function temporary(fn){const dir=await mkdtemp(join(tmpdir(),'quriozity-music-'));try{await fn(dir);}finally{await rm(dir,{recursive:true,force:true});}}

test('music uses one offline gain and matches recording levels without fading either end',{skip:!available},()=>temporary(async dir=>{
 const quiet=join(dir,'quiet.wav'),loud=join(dir,'loud.wav');
 tone(quiet,'0.06*sin(2*PI*180*t)');tone(loud,'0.3*sin(2*PI*180*t)');
 const a=await prepareMusicBed(quiet,6,join(dir,'a.wav')),b=await prepareMusicBed(loud,6,join(dir,'b.wav'));
 assert.equal(a.integratedLufs,MUSIC_LEVEL.lufs);assert.equal(b.integratedLufs,MUSIC_LEVEL.lufs);
 assert.ok(Math.abs((a.gainDb-b.gainDb)-20*Math.log10(5))<.1);
 const pa=pcm(a.file),pb=pcm(b.file),reference=rms(pa,2,2.5);
 for(const time of [.1,1,3,5.4])assert.ok(Math.abs(rms(pa,time,time+.4)/reference-1)<.01,'No intro fade, outro fade or changing playback gain');
 assert.ok(Math.abs(rms(pb,2,2.5)/reference-1)<.01,'Different source levels produce the same backing level');
 assert.deepEqual(await prepareMusicBed(quiet,6,a.file),a,'A restart reuses the same normalized score');
}));

test('the encoded music stays steady through speech and pauses, with no hidden master pumping',{skip:!available},()=>temporary(async dir=>{
 const bed=join(dir,'music.wav'),v1=join(dir,'voice-a.wav'),v2=join(dir,'voice-b.wav');
 tone(bed,'0.3*sin(2*PI*180*t)');
 tone(v1,'0.4*sin(2*PI*930*t)*lt(mod(t\\,2)\\,1)');
 tone(v2,'0.15*sin(2*PI*930*t)');
 const words=[{text:'one',start:.2,end:.8},{text:'two',start:2.2,end:2.8},{text:'three',start:4.2,end:4.8}];
 const run=(audio,name,music=bed)=>calibrateMix({voice:{audio,words},lead:0,cues:[],sfx:{clip:async()=>null},bed:music,total:6,out:join(dir,name+'.m4a')},()=>{});
 const a=await run(v1,'a'),b=await run(v2,'b');
 assert.equal(a.musicLevel.integratedLufs,-30);assert.equal(b.musicLevel.integratedLufs,-30);
 assert.ok(a.history.every(h=>!Object.hasOwn(h.levels,'musicDb')),'Effects calibration cannot move the music');
 assert.deepEqual(await readFile(join(dir,'a.m4a.stem2.wav')),await readFile(join(dir,'b.m4a.stem2.wav')),'The music stem is independent of the narration');
 for(const name of ['a','b']){
  const audio=pcm(join(dir,name+'.m4a')),measurements=[.3,1.3,2.3,3.3,4.3,5.3].map(t=>amplitude(audio,t,t+.4,180));
  assert.ok(Math.max(...measurements)/Math.min(...measurements)<1.04,`Music in final ${name} mix must stay steady during speech and silence: ${measurements}`);
 }
 const silent=await run(v1,'no-music',null);assert.equal(silent.musicLevel,null,'Music-disabled production still exports normally');
}));
