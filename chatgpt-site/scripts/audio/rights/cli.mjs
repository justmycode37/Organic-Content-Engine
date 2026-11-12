import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createClaimsPacket} from './packet.mjs';
import {auditCache,auditRender} from './check.mjs';

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [command,...args]=process.argv.slice(2);
 if(command==='check'){
  const result=await auditRender(args[0]);console.log(`${result.cleared?'CLEARED':'HOLD'}: ${result.items.length} audio file(s), ${result.errors.length} issue(s).`);
  for(const error of result.errors)console.error(`${error.code}: ${error.file}: ${error.message}`);
  process.exitCode=result.errors.length?1:0;
 }else if(command==='cache'){
  const result=await auditCache();console.log(`${result.cleared?'CLEARED':'HOLD'}: ${result.cachedFiles.length} cached audio file(s), ${result.errors.length} issue(s).`);
  for(const error of result.errors)console.error(`${error.code}: ${error.file}: ${error.message}`);
  process.exitCode=result.errors.length?1:0;
 }else if(command==='packet'){
  const [post,...options]=args;const index=options.indexOf('--out');const outDir=index>=0?options[index+1]:undefined;
  if(index>=0&&!outDir)throw new Error('--out requires a directory');
  const result=await createClaimsPacket(post,{outDir});console.log(`Wrote rights packet: ${result.output}`);
 }else if(command==='snapshot'){
  const [id,url]=args;const {takeTermsSnapshot}=await import('./snapshot.mjs');
  const result=await takeTermsSnapshot(id,url);console.log(`Saved terms snapshot ${result.id} (${result.sha256}).`);
 }else throw new Error('Usage: node scripts/audio/rights/cli.mjs check <timed-spec-or-render-manifest> | cache | packet <post-id-or-render-manifest> [--out <directory>] | snapshot <id> <https-url>');
}
