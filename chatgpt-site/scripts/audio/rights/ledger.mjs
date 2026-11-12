import {createHash} from 'node:crypto';
import {appendFile,mkdir,readFile,readdir,stat} from 'node:fs/promises';
import {basename,dirname,isAbsolute,join,relative,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

export const PROJECT_ROOT=fileURLToPath(new URL('../../../',import.meta.url));
export const RIGHTS_ROOT=join(PROJECT_ROOT,'audio','rights');
export const DEFAULT_LEDGER=join(RIGHTS_ROOT,'ledger.jsonl');
export const DEFAULT_CACHE=join(PROJECT_ROOT,'.motion-cache');
export const DEFAULT_KILL_SWITCH=join(RIGHTS_ROOT,'kill-switch.json');
export const DEFAULT_ATTESTATION=join(RIGHTS_ROOT,'attestations','arthur.json');
export const LEGACY_ARTHUR_ID='TtRFBnwQdH1k01vR0hMz';
export const REQUIRED_USES=['commercial','instagram','tiktok','youtube'];

export const sha256=value=>createHash('sha256').update(value).digest('hex');
export const requestHash=value=>sha256(Buffer.from(JSON.stringify(value)));
export const projectPath=path=>relative(PROJECT_ROOT,path).split(sep).join('/');

export async function hashFile(path){return sha256(await readFile(path));}

export function normalizeLedgerRecord(record){
 if(!record||typeof record!=='object'||Array.isArray(record))throw new Error('A rights ledger record must be an object');
 const normalized={schemaVersion:1,...record};
 for(const key of ['assetId','assetKind','file','provider','model','outputHash'])if(typeof normalized[key]!=='string'||!normalized[key].trim())throw new Error(`Rights ledger record is missing ${key}`);
 if(!/^[a-f0-9]{64}$/.test(normalized.outputHash))throw new Error('Rights ledger outputHash must be a full SHA-256 hash');
 if(!['voice','sfx','music','unknown'].includes(normalized.assetKind))throw new Error(`Unsupported audio asset kind: ${normalized.assetKind}`);
 return normalized;
}

export function makeUnverifiedRecord(file,outputHash,{assetId,assetKind,voiceId,provider,voiceSource,owner}={}){
 const name=basename(file),isVoice=assetKind==='voice'||/^voice-/i.test(name),isSfx=assetKind==='sfx'||/^sfx-/i.test(name),legacyArthur=isVoice&&(voiceId===LEGACY_ARTHUR_ID||(!voiceId&&/^voice-/i.test(name)&&(!provider||provider==='elevenlabs'))),kind=assetKind??(isVoice?'voice':isSfx?'sfx':'unknown');
 const legacyVoiceId=voiceId??(legacyArthur?LEGACY_ARTHUR_ID:null);
 return {schemaVersion:1,assetId:assetId??`${legacyArthur?'legacy-arthur':'unverified'}:${outputHash}`,assetKind:kind,file:projectPath(file),provider:provider??(legacyArthur?'elevenlabs':'unknown'),model:'unknown (pre-ledger audio)',modelVersion:null,voiceId:legacyVoiceId,voiceSource:voiceSource??(legacyArthur?'library':null),owner:owner??'unknown',planTier:null,generatedAt:null,requestHash:null,outputHash,termsSnapshotRef:null,relatedTermsSnapshotRefs:[],permittedUses:[],nonBeta:null,status:'unverified'};
}

export async function readLedger(ledgerPath=DEFAULT_LEDGER){
 let body='';try{body=await readFile(ledgerPath,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
 const latest=new Map();
 for(const [index,line] of body.split(/\r?\n/).entries()){
  if(!line.trim())continue;
  let record;try{record=JSON.parse(line);}catch{throw new Error(`Invalid JSON in rights ledger at line ${index+1}`);}
  normalizeLedgerRecord(record);
  const key=`${record.outputHash}:${record.assetId}`;
  latest.set(key,record);
 }
 return [...latest.values()];
}

/** Append-only ledger so concurrent render workers cannot overwrite one another's entries. */
export async function appendLedgerRecord(record,ledgerPath=DEFAULT_LEDGER){
 const normalized=normalizeLedgerRecord(record);
 const current=await readLedger(ledgerPath);
 const previous=current.find(item=>item.outputHash===normalized.outputHash&&item.assetId===normalized.assetId);
 if(previous&&JSON.stringify(previous)===JSON.stringify(normalized))return previous;
 await mkdir(dirname(ledgerPath),{recursive:true});
 await appendFile(ledgerPath,`${JSON.stringify(normalized)}\n`,{encoding:'utf8',flag:'a'});
 return normalized;
}

function safeTermsId(value){
 if(typeof value!=='string'||!value.trim()||value.includes('..')||isAbsolute(value)||/[\\/]/.test(value))return null;
 return value.replace(/\.json$/,'');
}

export async function readTermsSnapshot(reference,rightsRoot=RIGHTS_ROOT){
 const id=safeTermsId(reference);if(!id)return null;
 const termsDir=join(rightsRoot,'terms'),metadataPath=join(termsDir,`${id}.json`);
 let metadata;
 try{metadata=JSON.parse(await readFile(metadataPath,'utf8'));}catch{return null;}
 if(metadata?.id!==id||typeof metadata.sourceUrl!=='string'||!metadata.sourceUrl.startsWith('https://')||!Number.isFinite(Date.parse(metadata.capturedAt))||typeof metadata.sha256!=='string'||typeof metadata.contentFile!=='string')return null;
 const fileName=basename(metadata.contentFile);
 if(fileName!==metadata.contentFile||fileName.includes('..'))return null;
 let content;try{content=await readFile(join(termsDir,fileName));}catch{return null;}
 if(sha256(content)!==metadata.sha256)return null;
 return {metadata,content,path:join(termsDir,fileName)};
}

export async function readKillSwitch(path=DEFAULT_KILL_SWITCH){
 try{
  const data=JSON.parse(await readFile(path,'utf8'));
  return {pauseAll:Boolean(data.pauseAll),voiceIds:Array.isArray(data.voiceIds)?data.voiceIds:[],assetIds:Array.isArray(data.assetIds)?data.assetIds:[],outputHashes:Array.isArray(data.outputHashes)?data.outputHashes:[],providers:Array.isArray(data.providers)?data.providers:[]};
 }catch(error){if(error.code==='ENOENT')return {pauseAll:false,voiceIds:[],assetIds:[],outputHashes:[],providers:[]};throw new Error(`Cannot read audio kill switch: ${error.message}`);}
}

export function killSwitchReasons(record,killSwitch){
 const reasons=[];
 if(killSwitch.pauseAll)reasons.push('all audio is paused by the rights kill switch');
 if(record?.voiceId&&killSwitch.voiceIds.includes(record.voiceId))reasons.push(`voice ${record.voiceId} is paused by the rights kill switch`);
 if(record?.assetId&&killSwitch.assetIds.includes(record.assetId))reasons.push(`asset ${record.assetId} is paused by the rights kill switch`);
 if(record?.outputHash&&killSwitch.outputHashes.includes(record.outputHash))reasons.push(`audio hash ${record.outputHash} is paused by the rights kill switch`);
 if(record?.provider&&killSwitch.providers.includes(record.provider))reasons.push(`provider ${record.provider} is paused by the rights kill switch`);
 return reasons;
}

export function missingClearanceFields(record){
 const missing=[];
 if(record?.assetKind==='unknown')missing.push('classified asset kind (voice, sfx, or music)');
 if(record?.status==='unverified')missing.push('explicit owner verification (legacy cache is unverified)');
 for(const key of ['provider','model','modelVersion','termsSnapshotRef'])if(typeof record?.[key]!=='string'||!record[key].trim()||record[key].toLowerCase().includes('unknown'))missing.push(key);
 if(record?.modelVersion==='not-generated')missing.push('modelVersion or renderer version');
 if(!Number.isFinite(Date.parse(record?.generatedAt??'')))missing.push('valid generatedAt');
 if(!/^[a-f0-9]{64}$/.test(record?.requestHash??'')&&!record?.clearanceAttestation)missing.push('full requestHash');
 if(!Array.isArray(record?.permittedUses)||REQUIRED_USES.some(use=>!record.permittedUses.includes(use)))missing.push('permittedUses (commercial, instagram, tiktok, youtube)');
 if(record?.nonBeta!==true)missing.push('confirmed nonBeta=true');
 if(record?.planTier==null||String(record.planTier).trim()===''||String(record.planTier).toLowerCase()==='unknown')missing.push('confirmed paid plan tier');
 if(record?.assetKind==='voice'){
  if(typeof record.voiceId!=='string'||!record.voiceId.trim())missing.push('voiceId');
  if(!['library','designed','clone'].includes(record.voiceSource))missing.push('voiceSource (library, designed, or clone)');
  if(typeof record.owner!=='string'||!record.owner.trim()||record.owner.toLowerCase()==='unknown')missing.push('voice owner');
 }
 return [...new Set(missing)];
}

export async function assessRecord(record,{rightsRoot=RIGHTS_ROOT,killSwitchPath=DEFAULT_KILL_SWITCH}={}){
 const missing=missingClearanceFields(record);
 const snapshot=record?.termsSnapshotRef?await readTermsSnapshot(record.termsSnapshotRef,rightsRoot):null;
 if(record?.termsSnapshotRef&&!snapshot)missing.push(`valid terms snapshot '${record.termsSnapshotRef}'`);
 const related=Array.isArray(record?.relatedTermsSnapshotRefs)?record.relatedTermsSnapshotRefs:[];
 if(record?.relatedTermsSnapshotRefs!==undefined&&!Array.isArray(record.relatedTermsSnapshotRefs))missing.push('relatedTermsSnapshotRefs must be an array');
 for(const reference of related)if(!await readTermsSnapshot(reference,rightsRoot))missing.push(`valid related terms snapshot '${reference}'`);
 const kill=killSwitchReasons(record,await readKillSwitch(killSwitchPath));
 return {cleared:missing.length===0&&kill.length===0,missing,kill,snapshot,related};
}

async function readLegacyAttestation(attestationPath=DEFAULT_ATTESTATION){
 let data;try{data=JSON.parse(await readFile(attestationPath,'utf8'));}catch{return null;}
 return data;
}

export async function legacyArthurRecord(file,outputHash,{attestationPath=DEFAULT_ATTESTATION,rightsRoot=RIGHTS_ROOT,assetId,requestHash:priorRequestHash}={}){
 const attestation=await readLegacyAttestation(attestationPath);
 const proof=Array.isArray(attestation?.outputs)?attestation.outputs.find(item=>item?.outputHash===outputHash):null;
 const matches=attestation?.provider==='elevenlabs'&&attestation.voiceId===LEGACY_ARTHUR_ID&&Boolean(proof);
 if(!matches)return {record:null,reason:'Legacy Arthur cache entry was generated before the rights ledger. HOLD until the owner confirms this exact output hash, its paid plan and the applicable Arthur Voice Library terms.'};
 const concrete=value=>typeof value==='string'&&value.trim()&&!/\b(?:confirm|replace|owner name|evidence path|path\/url)\b/i.test(value);
 const complete=concrete(attestation.who)&&Number.isFinite(Date.parse(attestation.when))&&Number.isFinite(Date.parse(proof.generatedAt))&&concrete(proof.plan)&&concrete(proof.model)&&concrete(proof.modelVersion)&&proof.nonBeta===true&&Array.isArray(proof.evidence)&&proof.evidence.some(concrete)&&concrete(proof.voiceOwner)&&concrete(proof.termsSnapshotRef)&&Array.isArray(proof.permittedUses)&&(!proof.requestHash||/^[a-f0-9]{64}$/.test(proof.requestHash));
 if(!complete)return {record:null,reason:'Arthur owner attestation is incomplete for this output hash. Set its generatedAt, paid plan, model/version, nonBeta, voice owner, evidence, termsSnapshotRef and permittedUses.'};
 const record={schemaVersion:1,assetId:assetId??`legacy-arthur:${outputHash}`,assetKind:'voice',file:projectPath(file),provider:'elevenlabs',model:proof.model,modelVersion:proof.modelVersion,voiceId:LEGACY_ARTHUR_ID,voiceSource:'library',owner:proof.voiceOwner,planTier:proof.plan,generatedAt:proof.generatedAt,requestHash:proof.requestHash??priorRequestHash??null,outputHash,termsSnapshotRef:proof.termsSnapshotRef,relatedTermsSnapshotRefs:proof.relatedTermsSnapshotRefs??[],permittedUses:proof.permittedUses,nonBeta:true,clearanceAttestation:{who:attestation.who,when:attestation.when,evidence:proof.evidence}};
  const assessed=await assessRecord(record,{rightsRoot});
  if(!assessed.cleared)return {record:null,reason:`Arthur owner attestation does not clear this file: ${[...assessed.missing,...assessed.kill].join('; ')}`};
  return {record,reason:`Cleared by Arthur owner attestation from ${attestation.who} on ${attestation.when}.`};
}

export async function resolveAudioPath(file,baseDir=PROJECT_ROOT){
 if(typeof file!=='string'||!file.trim())throw new Error('Audio cue is missing its file path');
 const path=isAbsolute(file)?file:resolve(baseDir,file);
 const info=await stat(path).catch(()=>null);
 if(!info?.isFile())throw new Error(`Audio cue file is missing: ${file}`);
 return path;
}

export async function listCachedAudio(cacheDir=DEFAULT_CACHE){
 const results=[];
 async function walk(directory){
  let entries;try{entries=await readdir(directory,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return;throw error;}
  for(const entry of entries){const path=join(directory,entry.name);if(entry.isDirectory()&&entry.name!=='rights-packets'&&!entry.name.startsWith('render-'))await walk(path);else if(entry.isFile()&&/\.(?:wav|mp3|m4a|aac|ogg|flac)$/i.test(entry.name))results.push(path);}
 }
 await walk(cacheDir);return results.sort();
}
