import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {basename,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {RIGHTS_ROOT} from './ledger.mjs';

export async function takeTermsSnapshot(id,url,{rightsRoot=RIGHTS_ROOT,fetchImpl=fetch,now=new Date()}={}){
 if(!/^[a-z0-9][a-z0-9._-]{2,100}$/i.test(id)||id.includes('..'))throw new Error('Snapshot id must be a simple filename-safe identifier');
 const requested=new URL(url);if(requested.protocol!=='https:')throw new Error('Terms snapshot URL must use HTTPS');
 const response=await fetchImpl(requested,{redirect:'follow',signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw new Error(`Terms source returned HTTP ${response.status}`);
 const finalUrl=new URL(response.url||requested.href);if(finalUrl.protocol!=='https:')throw new Error('Terms source redirected away from HTTPS');
 const content=Buffer.from(await response.arrayBuffer());if(!content.length||content.length>10*1024*1024)throw new Error('Terms response is empty or larger than 10 MB');
 const sha256=createHash('sha256').update(content).digest('hex'),contentFile=`${basename(id)}.snapshot`,termsDir=join(rightsRoot,'terms');
 await mkdir(termsDir,{recursive:true});
 await writeFile(join(termsDir,contentFile),content,{flag:'wx'}).catch(async error=>{if(error.code!=='EEXIST')throw error;throw new Error(`Snapshot '${id}' already exists; choose a new id instead of replacing archived terms`);});
 const metadata={id,sourceUrl:finalUrl.href,requestedUrl:requested.href,capturedAt:now.toISOString(),status:response.status,contentType:response.headers.get('content-type')??'application/octet-stream',contentFile,sha256};
 await writeFile(join(termsDir,`${id}.json`),`${JSON.stringify(metadata,null,2)}\n`,{flag:'wx'});
 return metadata;
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const [id,url]=process.argv.slice(2);if(!id||!url)throw new Error('Usage: node scripts/audio/rights/snapshot.mjs <snapshot-id> <https-url>');
 const snapshot=await takeTermsSnapshot(id,url);console.log(`Saved terms snapshot ${snapshot.id} (${snapshot.sha256}) from ${snapshot.sourceUrl}`);
}
