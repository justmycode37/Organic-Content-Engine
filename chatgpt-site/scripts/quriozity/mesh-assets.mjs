// Exact authored/scanned meshes, including external glTF buffers and image textures.
import {createHash,randomUUID} from 'node:crypto';
import {readFile,mkdir,writeFile,rename,rm,access} from 'node:fs/promises';
import {extname,dirname,join,resolve} from 'node:path';
import {sourceFile} from './media-assets.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const exists=p=>access(p).then(()=>true,()=>false);
export async function prepareImportedMesh(source,assetDir,expectedSHA256){
 const remote=/^https:\/\//i.test(source),extension=extname(remote?new URL(source).pathname:source).toLowerCase();
 if(!['.glb','.gltf'].includes(extension))throw new Error('mesh import requires a .glb or .gltf source');
 const file=await sourceFile(source,assetDir),bytes=await readFile(file);
 if(expectedSHA256!==undefined&&expectedSHA256!==hash(bytes))throw new Error('mesh source hash differs from the pinned asset');
 if(extension==='.glb'){
  if(bytes.length<12||bytes.toString('ascii',0,4)!=='glTF'||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw new Error('mesh source is not a valid glTF 2 GLB');
  const rel=`import/mesh-${hash(bytes).slice(0,32)}.glb`,dest=join(assetDir,rel);await mkdir(dirname(dest),{recursive:true});if(!await exists(dest))await writeFile(dest,bytes);return rel;
 }
 const document=JSON.parse(bytes.toString('utf8'));
 if(document.asset?.version!=='2.0')throw new Error('mesh import requires glTF 2.0');
 const resources=new Map(),digest=createHash('sha256').update(bytes);
 for(const entry of [...(document.buffers??[]),...(document.images??[])]){
  const uri=entry.uri;if(uri===undefined||typeof uri==='string'&&uri.startsWith('data:'))continue;
  if(typeof uri!=='string'||!uri.trim())throw new Error('glTF dependency URI must be a nonempty string');
  const dependency=remote?new URL(uri,source).href:/^https:\/\//i.test(uri)?uri:resolve(dirname(file),decodeURIComponent(uri));
  const data=await readFile(await sourceFile(dependency,assetDir));digest.update(uri).update(data);
  const path=extname(/^https:\/\//i.test(dependency)?new URL(dependency).pathname:dependency).toLowerCase();
  const ext=/^\.[a-z0-9]{1,8}$/.test(path)?path:'.bin',name=`resource-${hash(data).slice(0,32)}${ext}`;
  resources.set(name,data);entry.uri=name;
 }
 const relative=`import/mesh-${digest.digest('hex').slice(0,32)}`,destination=join(assetDir,relative),main=join(destination,'model.gltf');
 if(await exists(main))return relative+'/model.gltf';
 const pending=destination+'.'+randomUUID()+'.tmp';await mkdir(pending,{recursive:true});
 try{
  for(const [name,data]of resources)await writeFile(join(pending,name),data);
  await writeFile(join(pending,'model.gltf'),JSON.stringify(document));
  try{await rename(pending,destination);}catch(error){if(!await exists(main))throw error;await rm(pending,{recursive:true,force:true});}
 }catch(error){await rm(pending,{recursive:true,force:true});throw error;}
 return relative+'/model.gltf';
}
