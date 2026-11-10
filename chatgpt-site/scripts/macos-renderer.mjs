// Install a self-contained login service outside Documents, so launchd needs no repository access.
import {build} from 'esbuild';
import {access,chmod,cp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {dirname,join} from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {renderBundle,workerConfig} from './render-worker.mjs';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
export const LABEL='ai.organic-content-engine.renderer';
export function locations(home=homedir()){
 const install=join(home,'Library','Application Support','Organic Content Engine','renderer');
 return {install,config:join(install,'runtime.env'),plist:join(home,'Library','LaunchAgents',`${LABEL}.plist`),logs:join(home,'Library','Logs','Organic Content Engine')};
}
const xml=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export function launchAgent(paths,node=process.execPath){
 return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${LABEL}</string>
<key>ProgramArguments</key><array><string>${xml(node)}</string><string>--env-file=${xml(paths.config)}</string><string>${xml(join(paths.install,'worker.mjs'))}</string></array>
<key>WorkingDirectory</key><string>${xml(paths.install)}</string>
<key>EnvironmentVariables</key><dict><key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string></dict>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>30</integer>
<key>ProcessType</key><string>Background</string>
<key>StandardOutPath</key><string>${xml(join(paths.logs,'renderer.log'))}</string>
<key>StandardErrorPath</key><string>${xml(join(paths.logs,'renderer.error.log'))}</string>
</dict></plist>\n`;
}
export function serviceStatus(){
 const target=`gui/${process.getuid()}/${LABEL}`;
 const result=spawnSync('/bin/launchctl',['print',target],{encoding:'utf8'});
 if(result.status!==0)return {installed:false,running:false,label:LABEL};
 return {installed:true,running:/state = running/.test(result.stdout),pid:Number(/\bpid = (\d+)/.exec(result.stdout)?.[1])||null,label:LABEL};
}
function command(args){const result=spawnSync('/bin/launchctl',args,{encoding:'utf8'});if(result.status!==0)throw new Error(`launchctl ${args[0]} failed: ${result.stderr.trim()}`);}
async function hiddenInput(){
 process.stdout.write('Ready for renderer configuration JSON on stdin (input is hidden).\n');
 const raw=Boolean(process.stdin.isTTY&&process.stdin.setRawMode);if(raw)process.stdin.setRawMode(true);
 process.stdin.setEncoding('utf8');process.stdin.resume();
 let text='';
 try{return await new Promise((resolve,reject)=>{
  const onData=chunk=>{text+=chunk;if(text.length>16000){cleanup();reject(new Error('Configuration is too large'));return;}if(text.includes('\n')){cleanup();try{resolve(JSON.parse(text.slice(0,text.indexOf('\n'))));}catch{reject(new Error('Configuration must be JSON'));}}};
  const cleanup=()=>process.stdin.off('data',onData);
  process.stdin.on('data',onData);
 });}finally{if(raw)process.stdin.setRawMode(false);process.stdin.pause();}
}
export async function install(config){
 if(process.platform!=='darwin')throw new Error('This installer is for macOS');
 const checked=workerConfig(config),paths=locations();await access(checked.chrome);
 for(const binary of ['ffmpeg','ffprobe'])if(spawnSync(binary,['-version'],{stdio:'ignore'}).status!==0)throw new Error(`${binary} must be installed before starting the worker`);
 const [browserCode,nodeCode]=await Promise.all([
  renderBundle(),
  build({entryPoints:[join(ROOT,'scripts/render-worker.mjs')],bundle:true,write:false,platform:'node',format:'esm',target:'node22',external:['playwright-core','esbuild']}),
 ]);
 if(serviceStatus().installed)command(['bootout',`gui/${process.getuid()}/${LABEL}`]);
 await mkdir(paths.install,{recursive:true,mode:0o700});await chmod(paths.install,0o700);
 await mkdir(paths.logs,{recursive:true,mode:0o700});await mkdir(dirname(paths.plist),{recursive:true});
 await writeFile(join(paths.install,'worker.mjs'),nodeCode.outputFiles[0].contents);
 await writeFile(join(paths.install,'render-page.js'),browserCode);
 const require=createRequire(import.meta.url),playwright=dirname(require.resolve('playwright-core/package.json'));
 await mkdir(join(paths.install,'node_modules'),{recursive:true});
 await cp(playwright,join(paths.install,'node_modules','playwright-core'),{recursive:true,force:true});
 const values={OCE_SITE_URL:checked.origin,OCE_RENDER_TOKEN:config.OCE_RENDER_TOKEN??config.JOB_TOKEN,OCE_SITES_ACCESS_TOKEN:config.OCE_SITES_ACCESS_TOKEN??'',CHROME_PATH:checked.chrome,OCE_RENDER_BUNDLE:join(paths.install,'render-page.js')};
 for(const value of Object.values(values))if(typeof value!=='string'||/[\r\n]/.test(value))throw new Error('Configuration values must be single-line strings');
 await writeFile(paths.config,Object.entries(values).map(([key,value])=>`${key}=${JSON.stringify(value)}`).join('\n')+'\n',{mode:0o600});await chmod(paths.config,0o600);
 await writeFile(paths.plist,launchAgent(paths));
 const verified=spawnSync('/usr/bin/plutil',['-lint',paths.plist],{encoding:'utf8'});if(verified.status!==0)throw new Error('The generated LaunchAgent could not be validated');
 command(['bootstrap',`gui/${process.getuid()}`,paths.plist]);
 command(['kickstart',`gui/${process.getuid()}/${LABEL}`]);
 return {...serviceStatus(),...paths};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const action=process.argv[2]??'status';
 if(action==='install')console.log(JSON.stringify(await install(await hiddenInput())));
 else if(action==='status')console.log(JSON.stringify({...serviceStatus(),...locations()}));
 else if(action==='stop'){command(['bootout',`gui/${process.getuid()}/${LABEL}`]);console.log('Mac render worker stopped.');}
 else if(action==='start'){command(['bootstrap',`gui/${process.getuid()}`,locations().plist]);console.log('Mac render worker started.');}
 else throw new Error('Use install, status, stop, or start');
}
