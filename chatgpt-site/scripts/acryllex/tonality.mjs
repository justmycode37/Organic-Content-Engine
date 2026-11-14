// Detects musical notes in a sound effect: a sustained, pitched component (chime, beep, synth tone, hum)
// shows up as strong periodicity in the 120-2500 Hz range across many consecutive frames.
// Clicks, snaps, thuds, whooshes and noise risers are aperiodic there and pass.
import {spawnSync} from 'node:child_process';

const SR=16000,FRAME=1024,HOP=512,MIN_LAG=Math.floor(SR/2500),MAX_LAG=Math.ceil(SR/120);

/** {tonal:boolean, ratio:fraction of active frames that are pitched, longestRun:seconds of continuous pitch} */
export function tonality(file){
 const raw=spawnSync('ffmpeg',['-v','error','-i',file,'-af','highpass=f=150,highpass=f=150','-ac','1','-ar',String(SR),'-f','f32le','-'],{maxBuffer:1<<27}).stdout;
 if(!raw?.length)return {tonal:false,ratio:0,longestRun:0,frames:0};
 const x=new Float32Array(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.length-(raw.length%4)));
 const frames=[];let peak=0;
 for(let s=0;s+FRAME<=x.length;s+=HOP){let e=0;for(let i=0;i<FRAME;i++)e+=x[s+i]*x[s+i];const rms=Math.sqrt(e/FRAME);frames.push({s,rms});peak=Math.max(peak,rms);}
 const active=frames.filter(f=>f.rms>peak*0.1&&f.rms>1e-3);
 let pitched=0,run=0,longest=0,prev=-1;
 for(const f of active){
  // normalised autocorrelation (YIN-style difference would also work; NACF is enough for a gate)
  // only peaks after the correlation has first dipped below zero count, so slow sub-bass rumble
  // (which correlates with itself at every short lag) is not mistaken for a pitched note
  let best=0,dipped=false;
  for(let lag=2;lag<=MAX_LAG;lag++){
   let num=0,a=0,b=0;
   for(let i=0;i+lag<FRAME;i++){const u=x[f.s+i],v=x[f.s+i+lag];num+=u*v;a+=u*u;b+=v*v;}
   const r=num/Math.sqrt(a*b+1e-12);
   if(r<0)dipped=true;else if(dipped&&lag>=MIN_LAG&&r>best)best=r;
  }
  const isPitched=best>0.88;
  if(isPitched){pitched++;run=(prev===f.s-HOP)?run+1:1;longest=Math.max(longest,run);}else run=0;
  prev=f.s;
 }
 const ratio=active.length?pitched/active.length:0,longestRun=longest*HOP/SR;
 return {tonal:active.length>=2&&ratio>0.35&&longestRun>=0.06,ratio:+ratio.toFixed(3),longestRun:+longestRun.toFixed(3),frames:active.length};
}

if(process.argv[1]&&import.meta.url.endsWith(process.argv[1].split('/').pop()))
 for(const f of process.argv.slice(2))console.log(JSON.stringify({file:f.split('/').pop(),...tonality(f)}));
