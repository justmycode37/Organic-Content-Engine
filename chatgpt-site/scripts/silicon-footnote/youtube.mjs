// Publish a finished edition after its MP4 and selected cover are ready in the site.
import {readFile,rename,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {siteRequest,workerConfig} from '../render-worker.mjs';

const [action,root]=process.argv.slice(2);
if(!root||!['publish','status'].includes(action))throw Error('Usage: node youtube.mjs publish|status EDITION_DIRECTORY');
const dir=resolve(root),id=(await readFile(join(dir,'site-id'),'utf8')).trim();
if(!/^[a-f\d-]{36}$/.test(id))throw Error('Invalid imported episode ID');
const config=workerConfig(),base='/api/jobs/accounts/silicon/'+id+'/youtube/';
async function call(path,input){
 const init=input===undefined?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)};
 return (await siteRequest(config,base+path,init)).json();
}
let state=await call('status');
if(action==='publish'&&state.state==='ready'){
 const pack=JSON.parse(await readFile(join(dir,'publication.json'),'utf8'));
 for(const kind of ['video',pack.variant]){
  await call('assets/'+kind,{});
  console.log('Postiz received '+kind);
 }
 state=await call('publish',pack);
}
await writeFile(join(dir,'postiz.partial.json'),JSON.stringify(state,null,2));
await rename(join(dir,'postiz.partial.json'),join(dir,'postiz.json'));
console.log(JSON.stringify(state));
