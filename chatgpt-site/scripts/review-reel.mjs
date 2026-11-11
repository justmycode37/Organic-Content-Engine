// Turns a finished reel into material a reviewer (human or model) can inspect without playing it:
//   node scripts/review-reel.mjs <reel.mp4> <outDir> [fps=4]
// Writes: sheet-NN.png (labelled frame grids, 6 x 3 per sheet), motion.txt (per-second visual change),
// audio.txt (loudness, true peak, per-second RMS), spectrogram.png, waveform.png.
import {spawn} from 'node:child_process';
import {mkdir,readdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';

const [input,out,fpsArg]=process.argv.slice(2);
if(!input||!out)throw new Error('Usage: review-reel.mjs <reel.mp4> <outDir> [fps]');
const fps=Number(fpsArg)||4;
const run=(cmd,args)=>new Promise((resolve,reject)=>{const p=spawn(cmd,args);let o='',e='';p.stdout.on('data',d=>o+=d);p.stderr.on('data',d=>e+=d);p.on('close',c=>c===0?resolve(o+e):reject(new Error(`${cmd} ${c}: ${e.slice(-800)}`)));});
await mkdir(out,{recursive:true});
for(const f of await readdir(out))if(/^sheet-\d+\.png$/.test(f))await rm(join(out,f));

const probe=JSON.parse(await run('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type,width,height,r_frame_rate','-of','json',input]));
const duration=Number(probe.format.duration);
// Labelled grids: every frame stamped with its time, 18 per sheet.
await run('ffmpeg',['-v','error','-y','-i',input,'-vf',`fps=${fps},scale=270:480,tile=6x3:padding=4:color=gray`,join(out,'sheet-%02d.png')]);
await writeFile(join(out,'sheets.txt'),`Each sheet is 6 columns x 3 rows read left-to-right, top-to-bottom; frames are ${1/fps}s apart. Sheet N (from 01) cell k (from 0) shows time ((N-1)*18+k)/${fps} s.\n`);
// Visual change per second (mean absolute frame difference), to spot dead holds.
const diff=await run('ffmpeg',['-v','info','-i',input,'-vf','scale=216:384,tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG','-an','-f','null','-']);
const yavg=[...diff.matchAll(/YAVG=([\d.]+)/g)].map(m=>Number(m[1]));
const perSec=[];for(let s=0;s*30<yavg.length;s++){const w=yavg.slice(s*30,s*30+30);perSec.push({s,mean:w.reduce((a,b)=>a+b,0)/w.length,still:w.filter(v=>v<0.15).length});}
await writeFile(join(out,'motion.txt'),`Visual change per second (mean abs frame diff, 0-255; "still" = frames with ~no change)\n`+perSec.map(r=>`${String(r.s).padStart(3)}s  change ${r.mean.toFixed(2).padStart(6)}  still frames ${r.still}/30${r.still>12?'  <-- DEAD HOLD':''}`).join('\n')+'\n');
// Audio.
const hasAudio=probe.streams.some(s=>s.codec_type==='audio');
if(hasAudio){
 const loud=await run('ffmpeg',['-v','info','-i',input,'-af','ebur128=peak=true','-f','null','-']);
 const summary=loud.slice(loud.lastIndexOf('Summary:'));
 const rms=await run('ffmpeg',['-v','info','-i',input,'-af','asetnsamples=48000,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level','-f','null','-']);
 const levels=[...rms.matchAll(/RMS_level=(-?[\d.inf]+)/g)].map(m=>m[1]);
 await writeFile(join(out,'audio.txt'),`${summary}\nPer-second RMS dBFS:\n${levels.map((l,i)=>`${i}s ${l}`).join('\n')}\n`);
 await run('ffmpeg',['-v','error','-y','-i',input,'-lavfi',`showspectrumpic=s=1600x600:legend=1:scale=log`,join(out,'spectrogram.png')]);
 await run('ffmpeg',['-v','error','-y','-i',input,'-lavfi','showwavespic=s=1600x300:split_channels=1',join(out,'waveform.png')]);
}
console.log(`Review kit in ${out}: ${duration.toFixed(1)} s, ${(await readdir(out)).filter(f=>f.startsWith('sheet')).length} sheets${hasAudio?', audio report':''}`);
