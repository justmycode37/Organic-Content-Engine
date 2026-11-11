import {mkdir,writeFile,readFile,cp,chmod} from 'node:fs/promises';
import {join} from 'node:path';import {homedir} from 'node:os';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';
console.log('Ready for account worker JSON on stdin (input is hidden).');
if(process.stdin.isTTY)process.stdin.setRawMode(true);process.stdin.resume();
const setup=JSON.parse(await new Promise((resolve,reject)=>{let s='';process.stdin.setEncoding('utf8').on('data',x=>{s+=x;if(s.includes('\n')){process.stdin.pause();resolve(s.trim())}}).on('error',reject)}));
const source=fileURLToPath(new URL('../',import.meta.url)),target=join(homedir(),'Library/Application Support/Organic Content Engine/account-worker');
await mkdir(target,{recursive:true,mode:0o700});await chmod(target,0o700);
for(const p of ['scripts','src/motion','worker/hedgy-generation.ts','worker/hedgy-policy.ts','worker/errors.ts','package.json','node_modules/zod','node_modules/esbuild','node_modules/@esbuild','node_modules/playwright-core']){await mkdir(join(target,p).slice(0,join(target,p).lastIndexOf('/')),{recursive:true});await cp(join(source,p),join(target,p),{recursive:true,force:true});}
// Reuse licensed cached audio; source credentials are never copied.
await cp(join(source,'.motion-cache'),join(target,'.motion-cache'),{recursive:true,force:false,errorOnExist:false}).catch(()=>{});
for(const [key,value] of Object.entries(setup))if(!/^[A-Z_]+$/.test(key)||typeof value!=='string'||/[\r\n]/.test(value))throw Error('Invalid worker setting');
await writeFile(join(target,'account-worker.env'),Object.entries(setup).map(([k,v])=>`${k}=${JSON.stringify(v)}`).join('\n')+'\n',{mode:0o600});await chmod(join(target,'account-worker.env'),0o600);
const label='com.organiccontentengine.account-worker',plist=join(homedir(),'Library/LaunchAgents',label+'.plist'),node=process.execPath;
await mkdir(join(homedir(),'Library/LaunchAgents'),{recursive:true});const xml=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
await writeFile(plist,`<?xml version="1.0"?><plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array><string>${xml(node)}</string><string>--env-file=${xml(join(target,'account-worker.env'))}</string><string>${xml(join(target,'scripts/account-worker.mjs'))}</string></array><key>WorkingDirectory</key><string>${xml(target)}</string><key>EnvironmentVariables</key><dict><key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string></dict><key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>30</integer><key>StandardOutPath</key><string>${xml(join(target,'worker.log'))}</string><key>StandardErrorPath</key><string>${xml(join(target,'worker.log'))}</string></dict></plist>`);
spawnSync('/bin/launchctl',['bootout',`gui/${process.getuid()}/${label}`]);const result=spawnSync('/bin/launchctl',['bootstrap',`gui/${process.getuid()}`,plist],{encoding:'utf8'});if(result.status!==0)throw Error('Worker launch failed');console.log('Account worker installed and started.');process.exit(0);
