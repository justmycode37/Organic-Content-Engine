import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {produce} from './acryllex/produce.mjs';

test('normal production cannot fall back to unreviewed output without model access',async()=>{
 const before={openai:process.env.OPENAI_API_KEY,eleven:process.env.ELEVENLABS_API_KEY,fetch:globalThis.fetch};let requests=0;
 try{
  process.env.OPENAI_API_KEY='';process.env.ELEVENLABS_API_KEY='test';
  globalThis.fetch=async()=>{requests++;throw new Error('Provider must not be called');};
  await assert.rejects(produce(join(tmpdir(),'acryllex-no-review-access'),{specFile:'saved-spec.json'}),/OPENAI_API_KEY.*reviews are required/);
  assert.equal(requests,0,'No paid narration or other provider request may start');
 }finally{
  for(const [key,value]of [['OPENAI_API_KEY',before.openai],['ELEVENLABS_API_KEY',before.eleven]])if(value===undefined)delete process.env[key];else process.env[key]=value;
  globalThis.fetch=before.fetch;
 }
});

test('normal production rejects explicitly unreviewed experiment caches before provider calls',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'acryllex-review-cache-'));
 const before={openai:process.env.OPENAI_API_KEY,eleven:process.env.ELEVENLABS_API_KEY,fetch:globalThis.fetch};let requests=0;
 try{
  process.env.OPENAI_API_KEY='test';process.env.ELEVENLABS_API_KEY='test';
  globalThis.fetch=async()=>{requests++;throw new Error('Provider must not be called');};
  for(const provenance of [{reviewsDisabled:true},{reviewMode:'raw-first-draft'}]){
   await writeFile(join(dir,'provenance.json'),JSON.stringify(provenance));
   await assert.rejects(produce(dir),/Unreviewed experiment cache cannot be used/);
  }
  assert.equal(requests,0,'A raw cache must not trigger paid work or become reviewed output');
 }finally{
  for(const [key,value]of [['OPENAI_API_KEY',before.openai],['ELEVENLABS_API_KEY',before.eleven]])if(value===undefined)delete process.env[key];else process.env[key]=value;
  globalThis.fetch=before.fetch;await rm(dir,{recursive:true,force:true});
 }
});

test('normal production requires the pinned style recording before any paid work',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'acryllex-style-required-'));
 const keys=['OPENAI_API_KEY','ELEVENLABS_API_KEY','ACRYLLEX_STYLE_REFERENCE'];
 const before=keys.map(key=>process.env[key]),originalFetch=globalThis.fetch;let requests=0;
 try{
  process.env.OPENAI_API_KEY='test';process.env.ELEVENLABS_API_KEY='test';
  process.env.ACRYLLEX_STYLE_REFERENCE=join(dir,'missing.mov');
  globalThis.fetch=async()=>{requests++;throw new Error('Provider must not be called');};
  await assert.rejects(produce(dir),/Required owner-approved style reference is unavailable/);
  await writeFile(process.env.ACRYLLEX_STYLE_REFERENCE,'different reference');
  await assert.rejects(produce(dir),/Style reference checksum mismatch/);
  assert.equal(requests,0,'Missing or substituted reference evidence must stop paid production');
 }finally{
  keys.forEach((key,i)=>{if(before[i]===undefined)delete process.env[key];else process.env[key]=before[i];});
  globalThis.fetch=originalFetch;await rm(dir,{recursive:true,force:true});
 }
});
