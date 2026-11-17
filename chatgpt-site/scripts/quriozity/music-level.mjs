import {createHash} from 'node:crypto';
import {readFile,writeFile,access} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';

// One offline gain for the whole track. Playback never follows the narration.
export const MUSIC_LEVEL=Object.freeze({version:1,lufs:-30,truePeakDb:-16});
const eq='aresample=48000,aformat=channel_layouts=stereo,equalizer=f=1200:t=q:w=1:g=-3,equalizer=f=2800:t=q:w=0.9:g=-6';
const command=args=>{
 const r=spawnSync('ffmpeg',['-hide_banner','-nostats','-y',...args],{encoding:'utf8',maxBuffer:4<<20});
 if(r.error||r.status!==0)throw new Error(`Music preparation failed: ${r.error??r.stderr.slice(-1200)}`);
 return r.stderr;
};

export async function prepareMusicBed(source,total,out){
 const input=await readFile(source),key=createHash('sha256').update(input).update(JSON.stringify({total,eq,...MUSIC_LEVEL})).digest('hex');
 const previous=await readFile(`${out}.json`,'utf8').then(JSON.parse).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
 if(previous?.key===key&&await access(out).then(()=>true,()=>false))return previous;
 const trim=`${eq},atrim=0:${total.toFixed(3)}`;
 // loudnorm only meters this discarded pass; its own TP option accepts -9..0.
 // The much lower music peak ceiling is applied by the fixed gain below.
 const measured=command(['-i',source,'-af',`${trim},loudnorm=I=${MUSIC_LEVEL.lufs}:TP=-2:LRA=50:print_format=json`,'-f','null','-']);
 const stats=JSON.parse(measured.match(/\{[^{}]*"input_i"[^{}]*\}/)?.[0]??'null');
 const integrated=Number(stats?.input_i),peak=Number(stats?.input_tp);
 if(!stats||!Number.isFinite(integrated)||!Number.isFinite(peak))throw new Error('Music has no measurable signal');
 // A peak-heavy source may land below the loudness target; never introduce a
 // time-varying music limiter or overload the reserved music headroom.
 const gainDb=Math.min(MUSIC_LEVEL.lufs-integrated,MUSIC_LEVEL.truePeakDb-peak);
 command(['-v','error','-i',source,'-af',`${trim},volume=${gainDb.toFixed(6)}dB,apad=whole_dur=${total.toFixed(3)},atrim=0:${total.toFixed(3)}`,'-c:a','pcm_f32le','-ar','48000',out]);
 const result={key,file:out,...MUSIC_LEVEL,gainDb,integratedLufs:integrated+gainDb,truePeakOutputDb:peak+gainDb,peakLimited:gainDb<MUSIC_LEVEL.lufs-integrated-.01};
 await writeFile(`${out}.json`,JSON.stringify(result,null,2));return result;
}
