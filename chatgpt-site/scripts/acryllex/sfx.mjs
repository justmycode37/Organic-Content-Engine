// ACRYLLEX sound library: every effect is an ElevenLabs sound-generation clip, cached by prompt.
// Calm, premium documentary sound: soft, deep, tactile, airy; digital textures only for build/glitch moments.
import {createHash} from 'node:crypto';
import {access,mkdir,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {join} from 'node:path';

const STYLE=', clean high-quality cinematic sound effect, single event, no music, no voice, no melody';
export const ACRYLLEX_SFX={
 materialize:{seconds:0.9,prompt:'Soft digital particles swirling together into a solid object, fine granular shimmer with a gentle low swell'},
 assemble:{seconds:1.2,prompt:'Dozens of tiny hard plastic cubes rapidly clicking and snapping together into place, swirling then locking with a soft thump'},
 shatter:{seconds:1.2,prompt:'An object bursts into many small hard cubes that scatter and tumble across a floor, crisp crumble with a deep body'},
 dissolve:{seconds:0.8,prompt:'Soft granular sand-like dissolve, fine particles drifting away into air'},
 pop:{seconds:0.35,prompt:'A soft deep rounded pop as a small object appears'},
 drop:{seconds:0.6,prompt:'A solid object lands on a hard floor, deep soft weighty thud'},
 whoosh:{seconds:0.7,prompt:'A soft airy cinematic whoosh passing by, smooth and warm'},
 swish:{seconds:0.35,prompt:'A short quick soft air swish'},
 cut:{seconds:0.8,prompt:'A deep soft cinematic sub boom, very low, short warm tail'},
 hit:{seconds:1.8,prompt:'A big cinematic low impact with a warm long reverb tail, powerful but soft, revelation moment'},
 riser:{seconds:1.2,prompt:'A slow airy rising swell building gentle tension, soft and breathy'},
 type:{seconds:1.4,prompt:'Fast typing on a quiet premium mechanical keyboard, short burst of soft keystrokes'},
 backspace:{seconds:0.6,prompt:'Quick repeated soft backspace key taps'},
 box:{seconds:0.45,prompt:'A soft deep thump with a tiny crisp digital click, like a label snapping onto a screen'},
 glitch:{seconds:0.4,prompt:'A short digital glitch stutter, data corruption blip, subtle'},
 'power-on':{seconds:1.0,prompt:'A small electric switch clicks and a soft electric hum swells up as a light turns on'},
 footsteps:{seconds:2.4,prompt:'Calm footsteps walking on a smooth concrete floor at a steady pace, close and soft'},
 chair:{seconds:0.8,prompt:'An office chair creaks and settles as someone sits down'},
 crack:{seconds:0.8,prompt:'A crystal cracks with a dry crisp snap and a few tiny fragments falling'},
 shimmer:{seconds:0.8,prompt:'A gentle glassy shimmer, soft sparkle, subtle'},
 tick:{seconds:0.3,prompt:'A single mechanical clock tick'},
 heartbeat:{seconds:0.9,prompt:'A single deep human heartbeat, lub-dub, close and warm, felt in the chest'},
 shockwave:{seconds:1.2,prompt:'A heavy blunt impact on a solid object followed by a deep resonant shock wave whoomp that rolls outward'},
 ripple:{seconds:1.2,prompt:'A soft liquid wobble, a drop hitting water with gentle spreading ripples, deep and smooth'},
 rattle:{seconds:0.6,prompt:'A small hard object rattles and shakes rapidly on a table, short'},
 squash:{seconds:0.5,prompt:'A soft rubbery squash and springy bounce back, deep and short'},
 glint:{seconds:0.7,prompt:'A bright clean glassy glint shine sweep, short sparkle'},
 scan:{seconds:1.3,prompt:'A smooth electronic scanner beam sweeping, soft rising digital hum'},
 charge:{seconds:1.4,prompt:'An electric charge building up with a rising whine, then a sharp powerful discharge zap'},
 flicker:{seconds:1.0,prompt:'A failing light bulb flickering with electric buzzing crackles'},
};
export const SFX_KINDS=Object.keys(ACRYLLEX_SFX);

const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0,20);
const exists=p=>access(p).then(()=>true,()=>false);
function run(bin,args){return new Promise((res,rej)=>{const c=spawn(bin,args,{stdio:['ignore','ignore','pipe']});let e='';c.stderr.on('data',d=>e=(e+d).slice(-1500));c.once('error',rej);c.once('close',n=>n===0?res():rej(new Error(`${bin} ${n}: ${e}`)));});}

export function sfxLibrary(cacheDir,key,{cap=60,onUsage}={}){
 let generated=0;
 /** Raw clip for a prompt (generated once, cached forever). */
 async function raw(prompt,seconds,attempt=0){
  const file=join(cacheDir,`sfx-${hash({prompt,seconds})}.mp3`);
  if(await exists(file))return file;
  if(generated>=cap)throw new Error(`SFX generation cap (${cap}) reached`);
  generated++;
  const r=await fetch('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128',{method:'POST',headers:{'xi-api-key':key,'content-type':'application/json'},body:JSON.stringify({text:prompt+STYLE,duration_seconds:Math.max(0.5,Math.min(22,seconds)),prompt_influence:0.6}),signal:AbortSignal.timeout(120000)});
  onUsage?.({provider:'elevenlabs',endpoint:'sound-generation',status:r.status,seconds});
  if(r.status===429&&attempt<4){generated--;await new Promise(res=>setTimeout(res,12000*(attempt+1)));return raw(prompt,seconds,attempt+1);}
  if(!r.ok)throw new Error(`ElevenLabs sound-generation failed (${r.status})`);
  await mkdir(cacheDir,{recursive:true});await writeFile(file,Buffer.from(await r.arrayBuffer()));return file;
 }
 /** A ready-to-mix WAV: leading silence removed, trimmed to length with a fade. */
 async function clip({kind,prompt,length}){
  const d=kind&&ACRYLLEX_SFX[kind];const p=prompt??d?.prompt??ACRYLLEX_SFX.pop.prompt;const base=d?.seconds??Math.max(0.6,Math.min(4,length??1.2));
  const src=await raw(p,base);const len=Math.max(0.15,Math.min(8,length??base));
  const out=join(cacheDir,`clip-${hash({src,len})}.wav`);if(await exists(out))return out;
  const fade=Math.min(0.35,len*0.4);
  await run('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',src,'-af',`silenceremove=start_periods=1:start_threshold=-50dB,aresample=48000,aformat=channel_layouts=stereo,apad=whole_dur=${len.toFixed(3)},atrim=0:${len.toFixed(3)},afade=t=out:st=${(len-fade).toFixed(3)}:d=${fade.toFixed(3)}`,'-c:a','pcm_s16le',out]);
  return out;
 }
 return {clip,raw,get generated(){return generated;}};
}
