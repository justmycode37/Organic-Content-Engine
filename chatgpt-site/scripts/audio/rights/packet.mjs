import {copyFile,mkdir,readdir,readFile,writeFile} from 'node:fs/promises';
import {basename,dirname,extname,isAbsolute,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {DEFAULT_CACHE,DEFAULT_LEDGER,PROJECT_ROOT,RIGHTS_ROOT,hashFile,projectPath,readLedger,readTermsSnapshot} from './ledger.mjs';
import {auditRender} from './check.mjs';

async function findManifest(post,cacheDir=DEFAULT_CACHE){
 try{await readFile(post);return resolve(post);}catch{/* Treat this as a post id. */}
 const manifests=[];
 async function walk(directory){let entries;try{entries=await readdir(directory,{withFileTypes:true});}catch{return;}for(const entry of entries){const path=join(directory,entry.name);if(entry.isDirectory())await walk(path);else if(entry.isFile()&&entry.name==='render-manifest.json')manifests.push(path);}}
 await walk(cacheDir);
 for(const path of manifests){try{const manifest=JSON.parse(await readFile(path,'utf8'));if(manifest.postId===post||manifest.renderId===post)return path;}catch{/* Ignore malformed cache manifests. */}}
 throw new Error(`No render manifest found for post '${post}'. Pass a render-manifest.json path or set MOTION_POST_ID when rendering.`);
}

const safeName=value=>String(value).replace(/[^a-z0-9._-]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,100)||'post';

export async function createClaimsPacket(post,{outDir,cacheDir=DEFAULT_CACHE,ledgerPath=DEFAULT_LEDGER,rightsRoot=RIGHTS_ROOT,killSwitchPath}={}){
 const manifestPath=await findManifest(post,cacheDir),manifest=JSON.parse(await readFile(manifestPath,'utf8'));
 const audit=await auditRender(manifestPath,{ledgerPath,cacheDir,rightsRoot,killSwitchPath});
 const output=outDir?resolve(outDir):join(cacheDir,'rights-packets',safeName(manifest.postId??post));
 await mkdir(join(output,'assets'),{recursive:true});await mkdir(join(output,'terms'),{recursive:true});
 const ledger=await readLedger(ledgerPath),records=[],assets=[],snapshotIds=new Set();
 const auditedByHash=new Map(audit.items.map(item=>[item.outputHash,item]));
 for(const item of manifest.audio??[]){
  const file=item.file;
  const absolute=isAbsolute(file)?file:manifest.pathBase==='project'?resolve(PROJECT_ROOT,file):resolve(dirname(manifestPath),file);
  let outputHash=null;try{outputHash=await hashFile(absolute);}catch{/* Missing source is retained as a packet issue. */}
  const record=ledger.find(entry=>entry.outputHash===outputHash&&(!item.assetId||entry.assetId===item.assetId))??ledger.find(entry=>entry.outputHash===outputHash)??auditedByHash.get(outputHash)?.record??null;
  let copiedAs=null;if(outputHash){copiedAs=`assets/${outputHash.slice(0,12)}${extname(absolute)||'.audio'}`;await copyFile(absolute,join(output,copiedAs)).catch(()=>{copiedAs=null;});}
  assets.push({assetId:item.assetId??record?.assetId??null,kind:item.kind??record?.assetKind??null,file:projectPath(absolute),copy:copiedAs,sha256:outputHash,ledgerEntry:record?.assetId??null});
  if(record){records.push(record);if(record.termsSnapshotRef)snapshotIds.add(record.termsSnapshotRef);for(const reference of record.relatedTermsSnapshotRefs??[])snapshotIds.add(reference);}
 }
 const snapshots=[];
 for(const id of snapshotIds){
  const snapshot=await readTermsSnapshot(id,rightsRoot);
  if(!snapshot){snapshots.push({id,available:false});continue;}
  const metadataName=`terms/${id}.json`,contentName=`terms/${id}.snapshot`;
  await copyFile(snapshot.path,join(output,contentName));
  await writeFile(join(output,metadataName),`${JSON.stringify(snapshot.metadata,null,2)}\n`);
  snapshots.push({id,available:true,metadata:metadataName,content:contentName,sha256:snapshot.metadata.sha256});
 }
 const video=manifest.outputFile?resolve(PROJECT_ROOT,manifest.outputFile):null;
 let renderedVideo=null;if(video){try{renderedVideo={file:projectPath(video),sha256:await hashFile(video)};}catch{renderedVideo={file:projectPath(video),sha256:null};}}
 const packet={schemaVersion:1,createdAt:new Date().toISOString(),postId:manifest.postId??post,renderId:manifest.renderId??null,manifest:{file:projectPath(manifestPath),sha256:await hashFile(manifestPath)},renderedVideo,audio:assets,ledgerEntries:records,termsSnapshots:snapshots,audit:{cleared:audit.cleared,errors:audit.errors}};
 await writeFile(join(output,'packet.json'),`${JSON.stringify(packet,null,2)}\n`);
 return {output,packet};
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const [post,...args]=process.argv.slice(2);if(!post)throw new Error('Usage: node scripts/audio/rights/packet.mjs <post-id-or-render-manifest> [--out <directory>]');
 const outIndex=args.indexOf('--out'),outDir=outIndex>=0?args[outIndex+1]:undefined;
 if(outIndex>=0&&!outDir)throw new Error('--out requires a directory');
 const result=await createClaimsPacket(post,{outDir});console.log(`Wrote rights packet: ${result.output}`);
}
