// ACRYLLEX sound library: every effect is an ElevenLabs sound-generation clip, cached by prompt.
// Owner rule (2026-11-14): effects are NON-MUSICAL — clicks, snaps, taps, thuds, whooshes, noise risers,
// cracks, rustles. Never notes, chimes, beeps, hums, tones or synth stabs. Prompts say so, custom prompts with
// musical words are rejected, and every generated clip passes a pitch detector (tonality.mjs) or is regenerated.
import {createHash} from 'node:crypto';
import {access,mkdir,writeFile,readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {join} from 'node:path';
import {tonality} from './tonality.mjs';

const STYLE=', one short non-musical sound effect, unpitched and atonal, dry and clean, no musical notes, no tones, no melody, no chime, no bell, no beep, no hum, no synth, no music, no voice';
const STRICT=', purely mechanical or physical noise with no pitch at all';
// Owner rule (2026-11-14): only SIMPLE, familiar effects. No exotic textures, no custom invented sounds.
export const ACRYLLEX_SFX={
 click:{seconds:0.3,prompt:'A single crisp dry click, like a pen button'},
 snap:{seconds:0.35,prompt:'A single sharp dry finger snap, close'},
 tap:{seconds:0.3,prompt:'A single soft dry knuckle tap on a wooden table'},
 pop:{seconds:0.35,prompt:'A single soft dull pop'},
 thump:{seconds:0.6,prompt:'A single soft deep thud, like a book dropped on a table'},
 whoosh:{seconds:0.7,prompt:'A soft clean whoosh of air passing by'},
 swish:{seconds:0.35,prompt:'A short quick soft air swish'},
 cut:{seconds:0.8,prompt:'A deep soft sub thump, very low, short dry tail'},
 hit:{seconds:1.6,prompt:'A big clean low boom impact with a short rumbling tail'},
 riser:{seconds:1.2,prompt:'A clean rising white-noise whoosh riser building tension'},
 type:{seconds:1.4,prompt:'Fast soft typing on a keyboard, short burst of keystrokes'},
 tick:{seconds:0.3,prompt:'A single dry clock tick'},
 footsteps:{seconds:2.4,prompt:'Calm footsteps on a smooth floor at a steady pace, close and soft'},
};
/** Older or exotic kinds (from automatic cues or earlier specs) fold into the simple set. */
export const SFX_ALIAS={materialize:'pop',assemble:'click',shatter:'snap',dissolve:'swish',drop:'thump',backspace:'type',box:'click',glitch:'click','power-on':'click',chair:'tap',crack:'snap',shimmer:'swish',heartbeat:'thump',shockwave:'hit',ripple:'pop',rattle:'tap',glint:'swish',scan:'whoosh',charge:'riser',rustle:'swish',splash:'pop'};
export const SFX_KINDS=Object.keys(ACRYLLEX_SFX);
export const simpleKind=(kind,length)=>ACRYLLEX_SFX[kind]?kind:SFX_ALIAS[kind]??((length??0.5)>0.8?'whoosh':'click');
/** Words that describe musical or pitched sounds; a custom prompt containing one is not used. */
export const MUSICAL=/\b(notes?|melod\w*|music\w*|tones?|tonal|chimes?|bells?|beeps?|bleeps?|boops?|ding\w*|dings|pings?|ring|rings|ringing|hum|hums|humming|drone|whine|synth\w*|chord\w*|arpeggi\w*|piano|harp|guitar|string|pluck\w*|glissando|sparkl\w*|twinkl\w*|shimmer\w*|jingle|xylophone|marimba|glockenspiel|pad|pads|tune|tuned|sing|sings|singing|whistl\w*|resonan\w*|sine|harmonic\w*|orchestra\w*|fanfare|stinger|celesta)\b/i;
export const isMusicalPrompt=p=>MUSICAL.test(p??'');


const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0,20);
const exists=p=>access(p).then(()=>true,()=>false);
function run(bin,args){return new Promise((res,rej)=>{const c=spawn(bin,args,{stdio:['ignore','ignore','pipe']});let e='';c.stderr.on('data',d=>e=(e+d).slice(-1500));c.once('error',rej);c.once('close',n=>n===0?res():rej(new Error(`${bin} ${n}: ${e}`)));});}

export function sfxLibrary(cacheDir,key,{onUsage,onReject}={}){
 let generated=0;const rejected=[];
 async function fetchClip(prompt,seconds,file,attempt=0){
  generated++;
  const r=await fetch('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128',{method:'POST',headers:{'xi-api-key':key,'content-type':'application/json'},body:JSON.stringify({text:prompt+STYLE,duration_seconds:Math.max(0.5,Math.min(22,seconds)),prompt_influence:0.7})});
  onUsage?.({provider:'elevenlabs',endpoint:'sound-generation',status:r.status,seconds});
  if(r.status===429&&attempt<6){await new Promise(res=>setTimeout(res,12000*(attempt+1)));return fetchClip(prompt,seconds,file,attempt+1);}
  if(!r.ok)throw new Error(`ElevenLabs sound-generation failed (${r.status})`);
  await mkdir(cacheDir,{recursive:true});await writeFile(file,Buffer.from(await r.arrayBuffer()));
 }
 /** Raw clip for a prompt (generated once, cached), or null when every take contains a musical note. */
 async function raw(prompt,seconds){
  for(const variant of [prompt,prompt+STRICT]){
   const file=join(cacheDir,`sfx-${hash({prompt:variant,seconds})}.mp3`),verdict=`${file}.tonality.json`;
   if(!await exists(file))await fetchClip(variant,seconds,file);
   let t;try{t=JSON.parse(await readFile(verdict,'utf8'));}catch{t=tonality(file);await writeFile(verdict,JSON.stringify(t));}
   if(!t.tonal)return file;
   rejected.push({prompt:variant,...t});onReject?.({prompt:variant,...t});
  }
  return null;
 }
 /** A ready-to-mix WAV: leading silence removed, trimmed to length with a fade. Only simple library kinds are
  *  used; custom prompts are ignored. Null if no note-free take exists. */
 async function clip({kind,prompt,length}){
  const k=simpleKind(kind,length);
  if(prompt){rejected.push({prompt,reason:'custom prompt (simple library only)'});}
  const d=ACRYLLEX_SFX[k];let src=await raw(d.prompt,d.seconds);
  if(!src&&k!=='click')src=await raw(ACRYLLEX_SFX.click.prompt,ACRYLLEX_SFX.click.seconds);
  if(!src)return null;
  const len=Math.max(0.15,Math.min(8,length??d.seconds));
  const out=join(cacheDir,`clip-${hash({src,len})}.wav`);if(await exists(out))return out;
  const fade=Math.min(0.35,len*0.4);
  await run('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',src,'-af',`silenceremove=start_periods=1:start_threshold=-50dB,aresample=48000,aformat=channel_layouts=stereo,apad=whole_dur=${len.toFixed(3)},atrim=0:${len.toFixed(3)},afade=t=out:st=${(len-fade).toFixed(3)}:d=${fade.toFixed(3)}`,'-c:a','pcm_s16le',out]);
  return out;
 }
 return {clip,raw,rejected,get generated(){return generated;}};
}
