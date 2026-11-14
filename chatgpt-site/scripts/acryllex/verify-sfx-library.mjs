// Generates (or reuses) every ACRYLLEX library effect and proves none contains a musical note.
//   node --env-file=.env.motion scripts/acryllex/verify-sfx-library.mjs  (simple library only)
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sfxLibrary,ACRYLLEX_SFX} from './sfx.mjs';
import {tonality} from './tonality.mjs';
const key=process.env.ELEVENLABS_API_KEY?.trim();if(!key)throw new Error('Set ELEVENLABS_API_KEY');
const lib=sfxLibrary(join(fileURLToPath(new URL('../../.acryllex-cache/sfx',import.meta.url))),key);
let bad=0;
await Promise.all(Object.entries(ACRYLLEX_SFX).map(async([kind,d])=>{
 const f=await lib.raw(d.prompt,d.seconds);const t=f?tonality(f):null;
 if(!f)bad++;console.log(kind.padEnd(12),f?`ok   ${JSON.stringify(t)}`:'NO NOTE-FREE TAKE');
}));
console.log(`generated ${lib.generated}, rejected ${lib.rejected.length}`,lib.rejected.map(r=>r.prompt));
if(bad)process.exit(1);
