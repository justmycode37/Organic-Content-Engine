import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {appendLedgerRecord,assessRecord,hashFile,legacyArthurRecord,readLedger,RIGHTS_ROOT,sha256} from './ledger.mjs';
import {auditCache,auditFiles,auditRender} from './check.mjs';
import {createClaimsPacket} from './packet.mjs';
import {takeTermsSnapshot} from './snapshot.mjs';

async function fixture(){
 const directory=await mkdtemp(join(tmpdir(),'audio-rights-'));
 const rightsRoot=join(directory,'rights'),termsDir=join(rightsRoot,'terms'),cacheDir=join(directory,'cache'),ledgerPath=join(rightsRoot,'ledger.jsonl'),killSwitchPath=join(rightsRoot,'kill-switch.json');
 await Promise.all([mkdir(termsDir,{recursive:true}),mkdir(cacheDir,{recursive:true})]);
 await writeFile(killSwitchPath,JSON.stringify({pauseAll:false,voiceIds:[],assetIds:[],outputHashes:[],providers:[]}));
 const content=Buffer.from('Terms snapshot fixture');
 await writeFile(join(termsDir,'terms.snapshot'),content);
 await writeFile(join(termsDir,'terms.json'),JSON.stringify({id:'terms',sourceUrl:'https://example.com/terms',capturedAt:'2026-11-11T00:00:00.000Z',contentFile:'terms.snapshot',sha256:sha256(content)}));
 const audio=join(directory,'narration-test.mp3');await writeFile(audio,Buffer.from('audio fixture'));
 const outputHash=await hashFile(audio);
 const record={schemaVersion:1,assetId:'voice:test:1',assetKind:'voice',file:audio,provider:'elevenlabs',model:'eleven_multilingual_v2',modelVersion:'eleven_multilingual_v2',voiceId:'voice12345678',voiceSource:'designed',owner:'PATCH NOTES',planTier:'Creator',generatedAt:'2026-11-11T00:00:00.000Z',requestHash:createHash('sha256').update('request').digest('hex'),outputHash,termsSnapshotRef:'terms',permittedUses:['commercial','instagram','tiktok','youtube'],nonBeta:true};
 return {directory,rightsRoot,termsDir,cacheDir,ledgerPath,killSwitchPath,audio,outputHash,record,cleanup:()=>rm(directory,{recursive:true,force:true})};
}

test('rights gate clears a file only when its hash and terms snapshot verify',async()=>{
 const f=await fixture();try{
  await appendLedgerRecord(f.record,f.ledgerPath);
  const result=await auditFiles([{file:f.audio,resolvedPath:f.audio,assetId:f.record.assetId}],{ledgerPath:f.ledgerPath,rightsRoot:f.rightsRoot,killSwitchPath:f.killSwitchPath});
  assert.equal(result.cleared,true);
  assert.equal((await readLedger(f.ledgerPath)).length,1);
 }finally{await f.cleanup();}
});

test('rights gate fails closed for unknown audio and tampered terms snapshots',async()=>{
 const f=await fixture();try{
  const unknown=await auditFiles([{file:f.audio,resolvedPath:f.audio}],{ledgerPath:f.ledgerPath,rightsRoot:f.rightsRoot,killSwitchPath:f.killSwitchPath});
  assert.equal(unknown.errors[0].code,'unregistered_audio');
  await appendLedgerRecord(f.record,f.ledgerPath);
  await writeFile(join(f.termsDir,'terms.snapshot'),'changed');
  const result=await auditFiles([{file:f.audio,resolvedPath:f.audio}],{ledgerPath:f.ledgerPath,rightsRoot:f.rightsRoot,killSwitchPath:f.killSwitchPath});
  assert.equal(result.cleared,false);
  assert.match(result.errors[0].message,/valid terms snapshot/);
 }finally{await f.cleanup();}
});

test('kill switch blocks a previously cleared voice',async()=>{
 const f=await fixture();try{
  await appendLedgerRecord(f.record,f.ledgerPath);
  await writeFile(f.killSwitchPath,JSON.stringify({pauseAll:false,voiceIds:[f.record.voiceId],assetIds:[],outputHashes:[],providers:[]}));
  const result=await auditFiles([{file:f.audio,resolvedPath:f.audio}],{ledgerPath:f.ledgerPath,rightsRoot:f.rightsRoot,killSwitchPath:f.killSwitchPath});
  assert.equal(result.cleared,false);assert.match(result.errors[0].message,/paused by the rights kill switch/);
 }finally{await f.cleanup();}
});

test('owner attestation clears exact legacy Arthur hashes with per-file terms and persists ledger evidence',async()=>{
 const f=await fixture();try{
  const legacyA=join(f.cacheDir,'voice-legacy-a.mp3'),legacyB=join(f.cacheDir,'voice-legacy-b.mp3');
  await writeFile(legacyA,Buffer.from('old Arthur audio A'));await writeFile(legacyB,Buffer.from('old Arthur audio B'));
  const hashA=await hashFile(legacyA),hashB=await hashFile(legacyB),attestationPath=join(f.rightsRoot,'attestations','arthur.json');await mkdir(join(f.rightsRoot,'attestations'),{recursive:true});
  const reconstructedRequestHash='b'.repeat(64);
  await appendLedgerRecord({schemaVersion:1,assetId:`legacy-arthur:${hashA}`,assetKind:'voice',file:legacyA,provider:'elevenlabs',model:'eleven_multilingual_v2',modelVersion:'eleven_multilingual_v2',voiceId:'TtRFBnwQdH1k01vR0hMz',voiceSource:'library',owner:'unknown',planTier:null,generatedAt:null,requestHash:reconstructedRequestHash,outputHash:hashA,termsSnapshotRef:null,permittedUses:[],nonBeta:null,status:'unverified'},f.ledgerPath);
  const common={model:'eleven_multilingual_v2',modelVersion:'eleven_multilingual_v2',nonBeta:true,voiceOwner:'Arthur Library owner',termsSnapshotRef:'terms',permittedUses:['commercial','instagram','tiktok','youtube']};
  await writeFile(attestationPath,JSON.stringify({provider:'elevenlabs',voiceId:'TtRFBnwQdH1k01vR0hMz',who:'Owner',when:'2026-11-11T12:00:00.000Z',outputs:[
   {...common,outputHash:hashA,generatedAt:'2026-02-01T12:00:00.000Z',plan:'Creator',evidence:['invoice-feb.pdf','voice-library-record.json']},
   {...common,outputHash:hashB,generatedAt:'2026-10-01T12:00:00.000Z',plan:'Pro',evidence:['invoice-oct.pdf','voice-library-record.json']},
  ]}));
  const result=await auditFiles([{file:legacyA,resolvedPath:legacyA,kind:'voice',provider:'elevenlabs'},{file:legacyB,resolvedPath:legacyB,kind:'voice',provider:'elevenlabs'}],{ledgerPath:f.ledgerPath,rightsRoot:f.rightsRoot,attestationPath,killSwitchPath:f.killSwitchPath});
  assert.equal(result.cleared,true);assert.equal(result.items.length,2);
  const cleared=await readLedger(f.ledgerPath);
  assert.equal(cleared.find(record=>record.outputHash===hashA).planTier,'Creator');
  assert.equal(cleared.find(record=>record.outputHash===hashA).generatedAt,'2026-02-01T12:00:00.000Z');
  assert.equal(cleared.find(record=>record.outputHash===hashB).planTier,'Pro');
  assert.equal(cleared.find(record=>record.outputHash===hashB).generatedAt,'2026-10-01T12:00:00.000Z');
  assert.equal(cleared.find(record=>record.outputHash===hashA).clearanceAttestation.evidence[0],'invoice-feb.pdf');
  assert.equal(cleared.find(record=>record.outputHash===hashA).requestHash,reconstructedRequestHash);
  const noMatch=await legacyArthurRecord(legacyA,'a'.repeat(64),{attestationPath,rightsRoot:f.rightsRoot});
  assert.equal(noMatch.record,null);
 }finally{await f.cleanup();}
});

test('cache audit excludes rendered mixes and audits only source cache assets',async()=>{
 const f=await fixture();try{
  await writeFile(join(f.cacheDir,'voice-source.mp3'),'legacy voice');
  const renderDir=join(f.cacheDir,'render-audition');await mkdir(renderDir,{recursive:true});await writeFile(join(renderDir,'mix.m4a'),'rendered mix');
  const result=await auditCache({cacheDir:f.cacheDir,ledgerPath:f.ledgerPath,rightsRoot:f.rightsRoot,killSwitchPath:f.killSwitchPath});
  assert.deepEqual(result.cachedFiles.map(path=>path.split('/').at(-1)),['voice-source.mp3']);
  assert.equal(result.errors.length,1);
 }finally{await f.cleanup();}
});

test('timed-spec resolves its render manifest sidecar and audits every cue',async()=>{
 const f=await fixture();try{
  const renderDir=join(f.cacheDir,'render-test');await mkdir(renderDir,{recursive:true});
  const copiedAudio=join(renderDir,'narration-test.mp3');await writeFile(copiedAudio,await readFile(f.audio));
  const timedSpec=join(renderDir,'spec.json');await writeFile(timedSpec,JSON.stringify({version:1,scenes:[]}));
  await appendLedgerRecord({...f.record,file:copiedAudio,outputHash:await hashFile(copiedAudio)},f.ledgerPath);
  await writeFile(join(renderDir,'render-manifest.json'),JSON.stringify({schemaVersion:1,audio:[{assetId:f.record.assetId,kind:'voice',file:'narration-test.mp3',sha256:await hashFile(copiedAudio)}]}));
  const result=await auditRender(timedSpec,{ledgerPath:f.ledgerPath,rightsRoot:f.rightsRoot,killSwitchPath:f.killSwitchPath});
  assert.equal(result.cleared,true);
 }finally{await f.cleanup();}
});

test('cache audit finds old Arthur cache and packet exports evidence and hashes',async()=>{
 const f=await fixture();try{
  const oldCache=join(f.cacheDir,'voice-legacy.mp3');await writeFile(oldCache,'legacy audio');
  const cache=await auditCache({cacheDir:f.cacheDir,ledgerPath:f.ledgerPath,rightsRoot:f.rightsRoot,killSwitchPath:f.killSwitchPath});
  assert.equal(cache.errors[0].code,'legacy_unverified');assert.equal(cache.items.length,1);assert.equal(cache.items[0].cleared,false);
  const renderDir=join(f.cacheDir,'render-packet');await mkdir(renderDir,{recursive:true});
  const audioPath=join(renderDir,'licensed.mp3');await writeFile(audioPath,'audio fixture');const outputHash=await hashFile(audioPath);
  await appendLedgerRecord({...f.record,assetId:'voice:packet',file:audioPath,outputHash},f.ledgerPath);
  const manifestPath=join(renderDir,'render-manifest.json');await writeFile(manifestPath,JSON.stringify({schemaVersion:1,postId:'post-123',renderId:'render-packet',audio:[{assetId:'voice:packet',kind:'voice',file:'licensed.mp3',sha256:outputHash}]}));
  const result=await createClaimsPacket('post-123',{cacheDir:f.cacheDir,ledgerPath:f.ledgerPath,rightsRoot:f.rightsRoot,killSwitchPath:f.killSwitchPath,outDir:join(f.directory,'packet')});
  const packet=JSON.parse(await readFile(join(result.output,'packet.json'),'utf8'));
  assert.equal(packet.postId,'post-123');assert.equal(packet.audio[0].sha256,outputHash);assert.equal(packet.termsSnapshots[0].available,true);
 }finally{await f.cleanup();}
});

test('cache audit restores a missing ledger line from its matching provenance sidecar',async()=>{
 const f=await fixture();try{
  const voicePath=join(f.cacheDir,'voice-generated.mp3');await writeFile(voicePath,await readFile(f.audio));
  const outputHash=await hashFile(voicePath),provenance={...f.record,assetId:'voice:recovered',file:voicePath,outputHash};
  await writeFile(join(f.cacheDir,'voice-generated.json'),JSON.stringify({words:[{text:'hello',start:0,end:.3}],provenance}));
  const result=await auditCache({cacheDir:f.cacheDir,ledgerPath:f.ledgerPath,rightsRoot:f.rightsRoot,killSwitchPath:f.killSwitchPath});
  assert.equal(result.cleared,true);assert.equal((await readLedger(f.ledgerPath))[0].assetId,'voice:recovered');
 }finally{await f.cleanup();}
});

test('terms snapshot captures source, timestamp and a verifiable body hash',async()=>{
 const f=await fixture();try{
  const snapshot=await takeTermsSnapshot('captured-terms','https://example.com/terms',{rightsRoot:f.rightsRoot,now:new Date('2026-11-11T12:00:00.000Z'),fetchImpl:async()=>new Response('<h1>Terms</h1>',{headers:{'content-type':'text/html'}})});
  const assessed=await assessRecord({...f.record,termsSnapshotRef:snapshot.id},{rightsRoot:f.rightsRoot,killSwitchPath:f.killSwitchPath});
  assert.equal(snapshot.capturedAt,'2026-11-11T12:00:00.000Z');assert.equal(assessed.cleared,true);
 }finally{await f.cleanup();}
});

test('generated ElevenLabs SFX clear like voice records and fail closed without plan or terms',async()=>{
 const f=await fixture();try{
  const file=join(f.cacheDir,'sfx-whoosh-0123456789abcdef0123.mp3');await writeFile(file,Buffer.from('sfx fixture'));
  const outputHash=await hashFile(file);
  const ledger={schemaVersion:1,assetId:'sfx:whoosh:'+'a'.repeat(64),assetKind:'sfx',file,provider:'elevenlabs',model:'eleven_text_to_sound_v2',modelVersion:'eleven_text_to_sound_v2',voiceId:null,voiceSource:null,owner:null,planTier:'creator',generatedAt:'2026-11-12T00:00:00.000Z',requestHash:'a'.repeat(64),outputHash,termsSnapshotRef:'terms',relatedTermsSnapshotRefs:[],permittedUses:['commercial','instagram','tiktok','youtube'],nonBeta:true,licenceEvidence:'Paid plan fixture'};
  // The render writes the ledger record into the SFX sidecar; the cache audit restores it from there.
  await writeFile(file.replace(/\.mp3$/,'.json'),JSON.stringify({name:'whoosh',generatedAt:ledger.generatedAt,ledger}));
  const cached=await auditCache({cacheDir:f.cacheDir,ledgerPath:f.ledgerPath,rightsRoot:f.rightsRoot,killSwitchPath:f.killSwitchPath});
  assert.equal(cached.cleared,true);assert.equal((await readLedger(f.ledgerPath))[0].assetId,ledger.assetId);
  const opts={rightsRoot:f.rightsRoot,killSwitchPath:f.killSwitchPath};
  assert.match((await assessRecord({...ledger,planTier:null},opts)).missing.join(';'),/paid plan tier/);
  assert.match((await assessRecord({...ledger,termsSnapshotRef:null},opts)).missing.join(';'),/termsSnapshotRef/);
  assert.match((await assessRecord({...ledger,nonBeta:null},opts)).missing.join(';'),/nonBeta/);
  // A self-declared rights basis is no substitute for provider facts.
  assert.equal((await assessRecord({...ledger,rightsBasis:'owned-procedural',planTier:null,termsSnapshotRef:null},opts)).cleared,false);
  await writeFile(f.killSwitchPath,JSON.stringify({pauseAll:false,voiceIds:[],assetIds:[],outputHashes:[outputHash],providers:[]}));
  const killed=await auditFiles([{file,resolvedPath:file,assetId:ledger.assetId,kind:'sfx'}],{ledgerPath:f.ledgerPath,rightsRoot:f.rightsRoot,killSwitchPath:f.killSwitchPath});
  assert.equal(killed.cleared,false);assert.match(killed.errors[0].message,/kill switch/);
 }finally{await f.cleanup();}
});
