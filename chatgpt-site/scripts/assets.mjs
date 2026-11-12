// Rights-aware asset registry used by the motion capture and ReelSpec tools.
// Usage: node scripts/assets.mjs <add|verify|list|resolve|link|cutout> ...
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {constants,createReadStream} from 'node:fs';
import {access,copyFile,mkdir,open,readFile,rename,rm,stat,writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {dirname,extname,isAbsolute,join,relative,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

export const ASSET_ROOT=fileURLToPath(new URL('../assets/',import.meta.url));
export const REGISTRY_PATH=join(ASSET_ROOT,'registry.json');
const RIGHTS=new Set(['owned','licensed','cc','public-domain','fair-use-news','unknown']);
const KINDS=new Set(['image','cutout','screenshot','video','audio','font','logo']);
const REQUIRED=['id','file','kind','sourceUrl','creator','licence','attribution','rightsStatus','restrictions','createdAt','sha256'];

const nonEmpty=value=>typeof value==='string'&&value.trim().length>0;
const assetFilesRoot=root=>resolve(root,'files');
const inside=(parent,child)=>child===parent||child.startsWith(parent+sep);

async function sha256File(file){
 const hash=createHash('sha256');
 for await(const chunk of createReadStream(file))hash.update(chunk);
 return hash.digest('hex');
}

export async function assertPngAlpha(file){
 const handle=await open(file,'r'),header=Buffer.alloc(26);
 try{await handle.read(header,0,header.length,0);}
 finally{await handle.close();}
 const signature=Buffer.from([137,80,78,71,13,10,26,10]);
 if(!header.subarray(0,8).equals(signature)||![4,6].includes(header[25]))throw new Error(`Background removal did not produce an alpha PNG: ${file}`);
}

function assertId(id){
 if(!/^[a-z0-9][a-z0-9-]{0,59}$/.test(id??''))throw new Error(`Invalid asset id '${id}'; use 1-60 lowercase letters, numbers, and hyphens.`);
}

function assertSafeFile(root,file){
 if(!nonEmpty(file)||isAbsolute(file))throw new Error(`Asset file must be a relative path inside files/: ${file}`);
 const base=assetFilesRoot(root),absolute=resolve(root,file);
 if(!inside(base,absolute))throw new Error(`Asset file escapes the files/ directory: ${file}`);
 return absolute;
}

async function readRegistry(root=ASSET_ROOT,{missingOk=false}={}){
 const file=join(root,'registry.json');
 let data;
 try{data=JSON.parse(await readFile(file,'utf8'));}
 catch(error){
  if(missingOk&&error.code==='ENOENT')return {version:1,assets:[]};
  throw new Error(`Cannot read ${file}: ${error.message}`);
 }
 if(data?.version!==1||!Array.isArray(data.assets))throw new Error(`Invalid registry shape in ${file}; expected {"version":1,"assets":[]}.`);
 return data;
}

async function writeRegistry(root,registry){
 await mkdir(root,{recursive:true});
 const target=join(root,'registry.json'),temporary=`${target}.${process.pid}.tmp`;
 await writeFile(temporary,`${JSON.stringify(registry,null,2)}\n`,'utf8');
 await rename(temporary,target);
}

function validateFields(entry){
 const errors=[];
 for(const field of REQUIRED)if(!nonEmpty(entry?.[field]))errors.push(`missing required field '${field}'`);
 if(nonEmpty(entry?.id)&&!/^[a-z0-9][a-z0-9-]{0,59}$/.test(entry.id))errors.push(`invalid id '${entry.id}'`);
 if(nonEmpty(entry?.kind)&&!KINDS.has(entry.kind))errors.push(`invalid kind '${entry.kind}'`);
 if(nonEmpty(entry?.rightsStatus)&&!RIGHTS.has(entry.rightsStatus))errors.push(`invalid rightsStatus '${entry.rightsStatus}'`);
 if(nonEmpty(entry?.createdAt)&&!Number.isFinite(Date.parse(entry.createdAt)))errors.push(`invalid createdAt '${entry.createdAt}'`);
 if(nonEmpty(entry?.sourceUrl)){
  try{const url=new URL(entry.sourceUrl);if(!['http:','https:','file:'].includes(url.protocol))errors.push(`unsupported sourceUrl protocol '${url.protocol}'`);}
  catch{errors.push(`invalid sourceUrl '${entry.sourceUrl}'`);}
 }
 if(nonEmpty(entry?.sha256)&&!/^[a-f0-9]{64}$/i.test(entry.sha256))errors.push('sha256 must be 64 hexadecimal characters');
 if(entry?.rightsStatus==='licensed'&&(!nonEmpty(entry.licence)||!nonEmpty(entry.attribution)||!nonEmpty(entry.restrictions)))errors.push('licensed assets require licence, attribution, and restrictions');
 if(entry?.rightsStatus==='cc'&&(!nonEmpty(entry.licence)||!nonEmpty(entry.attribution)||!nonEmpty(entry.restrictions)))errors.push('cc assets require licence, attribution, and restrictions');
 if(entry?.rightsStatus==='public-domain'&&(!nonEmpty(entry.sourceUrl)||!nonEmpty(entry.licence)))errors.push('public-domain assets require a source URL and public-domain basis in licence');
 if(entry?.rightsStatus==='fair-use-news'&&(!nonEmpty(entry.sourceUrl)||!nonEmpty(entry.attribution)||!nonEmpty(entry.restrictions)))errors.push('fair-use-news assets require sourceUrl, attribution, and restrictions');
 if(entry?.rightsStatus==='owned'&&(!nonEmpty(entry.creator)||!nonEmpty(entry.attribution)))errors.push('owned assets require creator and attribution');
 return errors;
}

export async function verifyRegistry({root=ASSET_ROOT,publish=false}={}){
 let registry;
 try{registry=await readRegistry(root);}
 catch(error){return {ok:false,checked:0,errors:[error.message]};}
 const errors=[],ids=new Set();
 for(const [index,entry] of registry.assets.entries()){
  const label=entry?.id||`entry ${index+1}`;
  for(const error of validateFields(entry))errors.push(`${label}: ${error}`);
  if(nonEmpty(entry?.id)){
   if(ids.has(entry.id))errors.push(`${label}: duplicate id`);
   ids.add(entry.id);
  }
  if(publish&&entry?.rightsStatus==='unknown')errors.push(`${label}: rightsStatus is unknown; cannot publish`);
  if(nonEmpty(entry?.file)){
   try{
    const path=assertSafeFile(root,entry.file),info=await stat(path);
    if(!info.isFile())errors.push(`${label}: file is not a regular file (${entry.file})`);
    else if(/^[a-f0-9]{64}$/i.test(entry.sha256??'')){
     const digest=await sha256File(path);
     if(digest!==entry.sha256.toLowerCase())errors.push(`${label}: sha256 mismatch (expected ${entry.sha256}, got ${digest})`);
    }
   }catch(error){errors.push(`${label}: ${error.message}`);}
  }
 }
 return {ok:errors.length===0,checked:registry.assets.length,errors};
}

export async function resolveAsset(id,{root=ASSET_ROOT}={}){
 assertId(id);
 const registry=await readRegistry(root),entry=registry.assets.find(asset=>asset.id===id);
 if(!entry)throw new Error(`Asset '${id}' is not in ${join(root,'registry.json')}.`);
 const path=assertSafeFile(root,entry.file);
 await access(path);
 return path;
}

export async function listAssets({root=ASSET_ROOT}={}){
 return (await readRegistry(root)).assets;
}

export async function registerFile({root=ASSET_ROOT,sourcePath,fileRelative,id,kind,sourceUrl,creator,licence,attribution,rightsStatus,restrictions,createdAt=new Date().toISOString()}){
 assertId(id);
 if(!KINDS.has(kind))throw new Error(`Invalid kind '${kind}'; expected ${[...KINDS].join('|')}.`);
 if(!RIGHTS.has(rightsStatus))throw new Error(`Invalid rights status '${rightsStatus}'; expected ${[...RIGHTS].join('|')}.`);
 const registry=await readRegistry(root,{missingOk:true});
 if(registry.assets.some(asset=>asset.id===id))throw new Error(`Asset id '${id}' already exists.`);
 const source=resolve(sourcePath),info=await stat(source);
 if(!info.isFile())throw new Error(`Asset source is not a regular file: ${source}`);
 const file=fileRelative??`files/${id}${extname(source).toLowerCase()}`;
 const destination=assertSafeFile(root,file);
 await mkdir(dirname(destination),{recursive:true});
 if(source!==destination)await copyFile(source,destination,constants.COPYFILE_EXCL);
 const entry={id,file:relative(root,destination).split(sep).join('/'),kind,sourceUrl,creator,licence,attribution,rightsStatus,restrictions,createdAt,sha256:await sha256File(destination)};
 const errors=validateFields(entry);
 if(errors.length){if(source!==destination)await rm(destination,{force:true});throw new Error(errors.join('; '));}
 registry.assets.push(entry);
 try{await writeRegistry(root,registry);}
 catch(error){if(source!==destination)await rm(destination,{force:true});throw error;}
 return entry;
}

function registryAssetsSidecar(specPath){
 const absolute=resolve(specPath);
 return absolute.endsWith('.json')?`${absolute.slice(0,-5)}.registryAssets.json`:`${absolute}.registryAssets.json`;
}

async function readAssetIds(sidecar){
 let data;
 try{data=JSON.parse(await readFile(sidecar,'utf8'));}
 catch(error){throw new Error(`Cannot read registryAssets sidecar ${sidecar}: ${error.message}`);}
 const ids=Array.isArray(data)?data:data?.registryAssets;
 if(!Array.isArray(ids)||ids.length===0||ids.some(id=>typeof id!=='string'))throw new Error(`Sidecar must contain a non-empty registryAssets string array: ${sidecar}`);
 return ids;
}

export async function linkSpec(specPath,ids=[],{root=ASSET_ROOT}={}){
 const absolute=resolve(specPath),registry=await readRegistry(root);
 const assetIds=ids.length?ids:await readAssetIds(registryAssetsSidecar(absolute));
 const spec=JSON.parse(await readFile(absolute,'utf8'));
 if(!spec||typeof spec!=='object'||Array.isArray(spec))throw new Error(`ReelSpec must be a JSON object: ${absolute}`);
 if(spec.assets!==undefined&&(!spec.assets||typeof spec.assets!=='object'||Array.isArray(spec.assets)))throw new Error(`ReelSpec assets must be an object map: ${absolute}`);
 const assets={...(spec.assets??{})};
 for(const id of assetIds){
  const entry=registry.assets.find(asset=>asset.id===id);
  if(!entry)throw new Error(`Asset '${id}' is not in the registry.`);
  const file=assertSafeFile(root,entry.file);
  await access(file);
  assets[id]=relative(dirname(absolute),file).split(sep).join('/');
 }
 spec.assets=assets;
 const temporary=`${absolute}.${process.pid}.tmp`;
 await writeFile(temporary,`${JSON.stringify(spec,null,2)}\n`,'utf8');
 await rename(temporary,absolute);
 return {specPath:absolute,assetIds,assets};
}

async function cutout(sourcePath){
 const source=resolve(sourcePath),registry=await readRegistry(ASSET_ROOT),sourceEntry=registry.assets.find(entry=>assertSafeFile(ASSET_ROOT,entry.file)===source);
 if(!sourceEntry)throw new Error('Register the source image first so the cut-out can inherit its rights and attribution.');
 if(!['image','cutout','screenshot','logo'].includes(sourceEntry.kind)||!/^\.(png|jpe?g|webp|bmp|tiff?)$/i.test(extname(source)))throw new Error('cutout requires a registered raster image (PNG, JPEG, WebP, BMP, or TIFF).');
 const id=`${sourceEntry.id.slice(0,53)}-cutout`,output=join(assetFilesRoot(ASSET_ROOT),`${id}.png`);
 try{await access(output);throw new Error(`Cut-out output already exists: ${output}`);}catch(error){if(error.code!=='ENOENT')throw error;}
 let binary=process.env.REMBG_PATH?.trim()||'rembg';
 if(!process.env.REMBG_PATH?.trim()){
  const userBinary=join(homedir(),'.local','bin','rembg');
  try{await access(userBinary);binary=userBinary;}catch{}
 }
 try{
  await new Promise((resolveDone,reject)=>{
   const child=spawn(binary,['i',source,output],{stdio:['ignore','inherit','inherit']});
   child.once('error',error=>reject(new Error(`Cannot run rembg. Install rembg[cli] without sudo or keep the original image: ${error.message}`)));
   child.once('close',code=>code===0?resolveDone():reject(new Error(`rembg exited with ${code}. The cut-out was not registered.`)));
  });
  await assertPngAlpha(output);
 }catch(error){await rm(output,{force:true});throw error;}
 try{
  const entry=await registerFile({root:ASSET_ROOT,sourcePath:output,fileRelative:`files/${id}.png`,id,kind:'cutout',sourceUrl:sourceEntry.sourceUrl,creator:sourceEntry.creator,licence:sourceEntry.licence,attribution:sourceEntry.attribution,rightsStatus:sourceEntry.rightsStatus,restrictions:`${sourceEntry.restrictions} Background removed locally; all source restrictions continue to apply.`,createdAt:new Date().toISOString()});
  console.log(`${entry.id}\n${resolve(ASSET_ROOT,entry.file)}`);
 }catch(error){await rm(output,{force:true});throw error;}
}

function parseFlags(args){
 const values={};
 for(let i=0;i<args.length;i++){
  const token=args[i];
  if(!token.startsWith('--'))throw new Error(`Unexpected argument: ${token}`);
  const name=token.slice(2);
  if(name==='publish'||name==='json'){values[name]=true;continue;}
  const value=args[++i];
  if(!value||value.startsWith('--'))throw new Error(`Option --${name} requires a value.`);
  values[name]=value;
 }
 return values;
}

function usage(){
 return `Usage:\n  node scripts/assets.mjs add <file> --id ID --kind KIND --source-url URL --creator NAME --licence TEXT --attribution TEXT --rights-status STATUS --restrictions TEXT [--date ISO]\n  node scripts/assets.mjs verify [--publish]\n  node scripts/assets.mjs list [--json]\n  node scripts/assets.mjs resolve <id>\n  node scripts/assets.mjs link <spec.json> [registry-id ...]\n  node scripts/assets.mjs cutout <registered-image>`;
}

async function main(args){
 const [command,...rest]=args;
 if(command==='add'){
  const sourcePath=rest.shift();if(!sourcePath)throw new Error(usage());
  const flags=parseFlags(rest),allowed=new Set(['id','kind','source-url','creator','licence','attribution','rights-status','restrictions','date']);
  for(const key of Object.keys(flags))if(!allowed.has(key))throw new Error(`Unknown add option --${key}.`);
  const id=flags.id;if(!id)throw new Error('add requires --id.');
  const entry=await registerFile({sourcePath,id,kind:flags.kind,sourceUrl:flags['source-url'],creator:flags.creator,licence:flags.licence,attribution:flags.attribution,rightsStatus:flags['rights-status'],restrictions:flags.restrictions,createdAt:flags.date??new Date().toISOString()});
  console.log(`Added ${entry.id}: ${resolve(ASSET_ROOT,entry.file)}`);
 }else if(command==='verify'){
  const flags=parseFlags(rest);if(Object.keys(flags).some(key=>key!=='publish'))throw new Error(usage());
  const result=await verifyRegistry({publish:flags.publish});
  if(result.ok)console.log(`Verified ${result.checked} asset${result.checked===1?'':'s'}${flags.publish?' for publish':''}.`);
  else{for(const error of result.errors)console.error(`ERROR ${error}`);process.exitCode=1;}
 }else if(command==='list'){
  const flags=parseFlags(rest);if(Object.keys(flags).some(key=>key!=='json'))throw new Error(usage());
  const assets=await listAssets();
  if(flags.json)console.log(JSON.stringify(assets,null,2));
  else if(!assets.length)console.log('Registry is empty.');
  else for(const entry of assets)console.log(`${entry.id}\t${entry.kind}\t${entry.rightsStatus}\t${resolve(ASSET_ROOT,entry.file)}`);
 }else if(command==='resolve'){
  const [id,...extra]=rest;if(!id||extra.length)throw new Error(usage());
  console.log(await resolveAsset(id));
 }else if(command==='link'){
  const [specPath,...restIds]=rest;let ids=[];
  for(let index=0;index<restIds.length;index++){
   const token=restIds[index];
   if(token==='--ids'){const value=restIds[++index];if(!value)throw new Error('--ids requires a comma-separated list.');ids.push(...value.split(',').filter(Boolean));}
   else if(token.startsWith('--'))throw new Error(`Unknown link option ${token}.`);
   else ids.push(token);
  }
  if(!specPath)throw new Error(usage());
  const result=await linkSpec(specPath,ids);console.log(`Linked ${result.assetIds.join(', ')} into ${result.specPath}`);
 }else if(command==='cutout'){
  const [sourcePath,...extra]=rest;if(!sourcePath||extra.length)throw new Error(usage());await cutout(sourcePath);
 }else throw new Error(usage());
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 main(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1;});
}
