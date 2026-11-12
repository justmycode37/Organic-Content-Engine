import {access,readFile} from 'node:fs/promises';
import {dirname,isAbsolute,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {DEFAULT_CACHE,DEFAULT_LEDGER,LEGACY_ARTHUR_ID,PROJECT_ROOT,appendLedgerRecord,assessRecord,hashFile,legacyArthurRecord,listCachedAudio,makeUnverifiedRecord,projectPath,readKillSwitch,readLedger} from './ledger.mjs';

const ownPath=fileURLToPath(import.meta.url);

async function exists(path){try{await access(path);return true;}catch{return false;}}

function manifestAudio(data){
 if(Array.isArray(data?.audio))return data.audio;
 if(Array.isArray(data?.audioCues))return data.audioCues;
 if(Array.isArray(data?.cues))return data.cues;
 return null;
}

export async function loadRenderManifest(inputPath){
 const absolute=resolve(inputPath),data=JSON.parse(await readFile(absolute,'utf8'));
 if(manifestAudio(data))return {path:absolute,data};
 for(const name of ['render-manifest.json','audio-manifest.json','manifest.json']){
  const sidecar=join(dirname(absolute),name);
  if(await exists(sidecar)){
   const manifest=JSON.parse(await readFile(sidecar,'utf8'));
   if(manifestAudio(manifest))return {path:sidecar,data:manifest,timedSpecPath:absolute};
  }
 }
 throw new Error(`No audio cue list found in '${inputPath}'. Pass a render manifest or a timed spec with a sibling render-manifest.json.`);
}

function resolveManifestAudioPath(item,manifest){
 const path=item.file??item.path;
 if(!path)throw new Error(`Audio cue '${item.assetId??item.sfx??'unknown'}' has no resolved file path`);
 if(isAbsolute(path))return path;
 if(manifest.pathBase==='project')return resolve(PROJECT_ROOT,path);
 return resolve(dirname(manifest.__manifestPath),path);
}

export async function auditFiles(files,{ledgerPath=DEFAULT_LEDGER,cacheDir=DEFAULT_CACHE,attestationPath,rightsRoot,killSwitchPath}={}){
 const ledger=await readLedger(ledgerPath),items=[],errors=[];
 const kill=await readKillSwitch(killSwitchPath);
 for(const item of files){
  const path=item.resolvedPath??item.file;
  let outputHash;try{outputHash=await hashFile(path);}catch(error){errors.push({file:path,code:'audio_missing',message:error.message});continue;}
  if(item.sha256&&item.sha256!==outputHash){errors.push({file:path,code:'hash_mismatch',message:`Render manifest expected ${item.sha256}, file is ${outputHash}`});continue;}
  const matching=ledger.filter(entry=>entry.outputHash===outputHash);
  let record=matching.find(entry=>item.assetId&&entry.assetId===item.assetId)??matching.find(entry=>entry.status!=='unverified'&&entry.assetKind!=='unknown')??matching[0];
  if(!record&&item.provenance?.outputHash===outputHash&&item.provenance.requestHash)record=await appendLedgerRecord({...item.provenance,file:projectPath(path),outputHash},ledgerPath);
  let legacyMessage=null;
  const legacyVoice=record?.voiceId===LEGACY_ARTHUR_ID||item.voiceId===LEGACY_ARTHUR_ID||(!item.voiceId&&item.provider==='elevenlabs'&&/^(?:voice-|legacy-arthur)/i.test(path.split(/[\\/]/).at(-1)));
  if(legacyVoice){
   const legacy=await legacyArthurRecord(path,outputHash,{...(attestationPath?{attestationPath}:{}),...(rightsRoot?{rightsRoot}:{}),assetId:record?.assetId,requestHash:record?.requestHash});
   if(legacy.record)record=await appendLedgerRecord(legacy.record,ledgerPath);else legacyMessage=legacy.reason;
  }
  if(!record){
   const unverified=makeUnverifiedRecord(path,outputHash,{assetId:item.assetId,assetKind:item.kind==='voice'||item.kind==='sfx'||item.kind==='music'?item.kind:undefined,voiceId:item.voiceId,provider:item.provider,voiceSource:item.voiceSource,owner:item.owner});
   record=await appendLedgerRecord(unverified,ledgerPath);
  }
  if(legacyVoice&&record.status==='unverified'){
   const killReasons=[];
   if(kill.pauseAll)killReasons.push('all audio is paused by the rights kill switch');
   if(item.assetId&&kill.assetIds.includes(item.assetId))killReasons.push(`asset ${item.assetId} is paused by the rights kill switch`);
   if(kill.outputHashes.includes(outputHash))killReasons.push(`audio hash ${outputHash} is paused by the rights kill switch`);
   if(legacyVoice&&kill.voiceIds.includes(LEGACY_ARTHUR_ID))killReasons.push(`voice ${LEGACY_ARTHUR_ID} is paused by the rights kill switch`);
   const message=legacyMessage??(legacyVoice?'Legacy Arthur cache entry is marked unverified. HOLD until the owner confirms the paid plan and applicable Arthur Voice Library terms.':`Audio is registered as unverified; complete provenance and clearance for hash ${outputHash}`);
   errors.push({file:path,code:'legacy_unverified',assetId:record.assetId,outputHash,message,...(killReasons.length?{killReasons}:{})});
   const assessment=await assessRecord(record,{...(rightsRoot?{rightsRoot}:{}),...(killSwitchPath?{killSwitchPath}:{})});
   items.push({file:path,assetId:record.assetId,assetKind:record.assetKind,outputHash,record,cleared:false,missing:assessment.missing,kill:[...new Set([...assessment.kill,...killReasons])],terms:assessment.snapshot?.metadata??null});
   continue;
  }
  const assessment=await assessRecord(record,{...(rightsRoot?{rightsRoot}:{}),...(killSwitchPath?{killSwitchPath}:{})});
  if(!assessment.cleared)errors.push({file:path,code:record.assetKind==='unknown'?'unregistered_audio':'rights_hold',assetId:record.assetId,outputHash,message:`Audio rights are not cleared: ${[...assessment.missing,...assessment.kill].join('; ')}`});
  items.push({file:path,assetId:record.assetId,assetKind:record.assetKind,outputHash,record,cleared:assessment.cleared,missing:assessment.missing,kill:assessment.kill,terms:assessment.snapshot?.metadata??null});
 }
 return {cleared:errors.length===0,items,errors,cacheDir};
}

export async function auditRender(inputPath,options={}){
 const loaded=await loadRenderManifest(inputPath),manifest={...loaded.data,__manifestPath:loaded.path};
 const audio=manifestAudio(manifest);
 const files=audio.map(item=>({ ...item,resolvedPath:resolveManifestAudioPath(item,manifest) }));
 return {manifest:loaded.data,manifestPath:loaded.path,timedSpecPath:loaded.timedSpecPath??null,...await auditFiles(files,options)};
}

export async function auditCache({cacheDir=DEFAULT_CACHE,...options}={}){
 const paths=await listCachedAudio(cacheDir);
 const files=[];for(const path of paths){
  const filename=path.split(/[\\/]/).at(-1),voice=/^voice-/i.test(filename),sfx=/^sfx-/i.test(filename);
  let metadata=null;if(voice||sfx)try{metadata=JSON.parse(await readFile(path.replace(/\.[^.]+$/,'' )+'.json','utf8'));}catch{/* Legacy audio had word timings only; new entries carry provenance here. */}
  // Voice sidecars keep the ledger record as `provenance`, generated SFX sidecars as `ledger`.
  const provenance=metadata?.provenance??metadata?.ledger??null;
  files.push({file:path,resolvedPath:path,kind:provenance?.assetKind??(voice?'voice':sfx?'sfx':undefined),assetId:provenance?.assetId,provider:provenance?.provider??(voice||sfx?'elevenlabs':undefined),voiceId:provenance?.voiceId,voiceSource:provenance?.voiceSource,owner:provenance?.owner,provenance});
 }
 return {...await auditFiles(files,{...options,cacheDir}),cachedFiles:paths};
}

function print(result,label='Audio rights audit'){
 console.log(`${label}: ${result.items?.length??0} audio file(s); ${result.errors.length?`${result.errors.length} HOLD(s)`:'cleared'}.`);
 for(const item of result.items??[])console.log(`${item.cleared?'OK':'HOLD'} ${item.assetKind??'audio'} ${item.assetId??''} ${item.outputHash}`.trim());
 for(const error of result.errors)console.error(`HOLD ${error.code}: ${error.file}: ${error.message}`);
 if(result.errors.some(error=>error.code==='legacy_unverified'))console.error(`To clear legacy Arthur audio, complete ${projectPath(join(PROJECT_ROOT,'audio/rights/attestations/arthur.example.json'))} as audio/rights/attestations/arthur.json with one outputs entry per exact hash. The owner must confirm each file's generation time, paid plan, model/version and Arthur Voice Library terms, attach evidence, and rerun this audit.`);
 return result.errors.length?1:0;
}

if(process.argv[1]&&resolve(process.argv[1])===ownPath){
 const args=process.argv.slice(2);let code=0;
 if(args[0]==='--cache')code=print(await auditCache({cacheDir:args[1]?resolve(args[1]):DEFAULT_CACHE}),'Audio cache audit');
 else if(args.length===1)code=print(await auditRender(args[0]));
 else throw new Error('Usage: node scripts/audio/rights/check.mjs <timed-spec-or-render-manifest> | --cache [cache-dir]');
 process.exitCode=code;
}
