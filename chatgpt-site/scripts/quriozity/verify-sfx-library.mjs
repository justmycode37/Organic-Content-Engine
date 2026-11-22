// Audits cached/provider clips and deterministic procedural effects for sustained pitch.
//   node --env-file=.env.motion scripts/quriozity/verify-sfx-library.mjs  (simple library only)
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sfxLibrary,QURIOZITY_SFX} from './sfx.mjs';
import {tonality} from './tonality.mjs';
import {PROCEDURAL_SFX} from './procedural-sfx.mjs';
const proceduralOnly=process.argv.includes('--procedural-only');
const key=process.env.ELEVENLABS_API_KEY?.trim();if(!key&&!proceduralOnly)throw new Error('Set ELEVENLABS_API_KEY');
const lib=sfxLibrary(join(fileURLToPath(new URL('../../.quriozity-cache/sfx',import.meta.url))),key);
let bad=0;
if(!proceduralOnly)await Promise.all(Object.entries(QURIOZITY_SFX).map(async([kind,d])=>{
 const f=await lib.raw(d.prompt,d.seconds);const t=f?tonality(f):null;
 if(!f)bad++;console.log(kind.padEnd(12),f?`ok   ${JSON.stringify(t)}`:'NO NOTE-FREE TAKE');
}));
for(const [kind,{seconds}] of Object.entries(PROCEDURAL_SFX)){
 const variants=await Promise.all(Array.from({length:8},(_,variant)=>lib.clip({kind,variant})));
 assert.equal(await lib.clip({kind}),variants[0]);
 assert.equal(await lib.clip({prompt:kind}),variants[0]);
 const unique=new Set(variants);
 assert.equal(unique.size,variants.length);
 for(const f of variants){
  const audio=await readFile(f),t=tonality(f);
  assert.equal(audio.readUInt16LE(22),2);
  assert.equal(audio.readUInt32LE(24),48000);
  assert.equal(audio.readUInt32LE(40),Math.round(48000*seconds)*4);
  assert.equal(audio.readUInt32LE(44),0);
  assert.equal(audio.readUInt32LE(audio.length-4),0);
  if(t.tonal||t.frames===0){bad++;console.log(kind,t);}
 }
 console.log(kind.padEnd(12),`${variants.length} unpitched variants`);
}
console.log(`generated ${lib.generated}, rejected ${lib.rejected.length}`,lib.rejected.map(r=>r.prompt));
if(bad)process.exit(1);
