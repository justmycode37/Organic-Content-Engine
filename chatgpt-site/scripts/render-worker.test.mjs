import assert from 'node:assert/strict';
import {test} from 'node:test';
import {access,mkdtemp,rm,readFile,writeFile,stat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {workerConfig,runOnce,renderBundle,siteRequest} from './render-worker.mjs';

test('renderer credentials stay on the configured secure Site origin',async()=>{
 assert.throws(()=>workerConfig({OCE_SITE_URL:'http://example.com',JOB_TOKEN:'x'.repeat(32)}),/HTTPS/);
 assert.throws(()=>workerConfig({OCE_SITE_URL:'https://site.example'}),/JOB_TOKEN/);
 const config=workerConfig({OCE_SITE_URL:'https://site.example',JOB_TOKEN:'x'.repeat(32),OCE_SITES_ACCESS_TOKEN:'dispatch-only'});
 assert.equal(config.headers['OAI-Sites-Authorization'],'Bearer dispatch-only');
 assert.ok(workerConfig({JOB_TOKEN:'x'.repeat(32),CHROME_PATH:''}).chrome);
 const original=globalThis.fetch;
 globalThis.fetch=async(url,init)=>{assert.equal(url.origin,config.origin);assert.equal(init.redirect,'error');return new Response('ok');};
 try{assert.equal(await (await siteRequest(config,'/api/jobs/render/claim')).text(),'ok');}finally{globalThis.fetch=original;}
 await assert.rejects(siteRequest(config,'https://elsewhere.example/'),/another origin/);
});

const chrome=process.env.CHROME_PATH??(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'/usr/bin/chromium');
let available=true;try{await access(chrome);available=spawnSync('ffmpeg',['-version']).status===0;}catch{available=false;}
test('unattended renderer produces a complete H.264/AAC video and extends trims for narration',{skip:!available,timeout:60000},async()=>{
 const scratch=await mkdtemp(join(tmpdir(),'oce-render-test-'));
 const fixture=(args)=>{const result=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y',...args]);assert.equal(result.status,0,result.stderr.toString());};
 try{
  const clipId='11111111-1111-4111-8111-111111111111',voiceId='22222222-2222-4222-8222-222222222222';
  const footage=join(scratch,'footage.mp4'),voice=join(scratch,'voice.wav');
  fixture(['-f','lavfi','-i','color=c=teal:s=360x640:r=30','-t','5','-c:v','libx264','-pix_fmt','yuv420p',footage]);
  fixture(['-f','lavfi','-i','sine=frequency=880:sample_rate=48000','-t','2.5',voice]);
  const job={id:'test',clips:[{runId:'clip',materialId:clipId}],handle:'museumoffailures',plan:{hook:'A better edit',cta:'Follow along',shots:[{runId:'clip',start:.2,end:1.8}],captions:[{text:'A better edit',start:.15,end:1.4}],musicMaterialId:null,voiceover:'A better edit',voice:{materialId:voiceId,voiceId:'FemaleVoice123',duration:2.5,words:[]}}};
  job.lease='test-lease';job.media=[{id:clipId,mime:'video/mp4',size:(await stat(footage)).size},{id:voiceId,mime:'audio/wav',size:(await stat(voice)).size}];
  const bundle=await renderBundle(),output=join(scratch,'uploaded.mp4');let uploads=0,shots,claimed=false;
  const workerApi=async(config,path,init)=>{
   if(path==='/api/jobs/render/claim'){if(claimed)return Response.json({job:null});claimed=true;return Response.json({job});}
   if(path.endsWith(`/media/${clipId}`))return new Response(await readFile(footage));
   if(path.endsWith(`/media/${voiceId}`))return new Response(await readFile(voice));
   assert.ok(path.endsWith('/output'),`Unexpected worker route ${path}`);uploads++;
   assert.equal(init.headers['content-type'],'video/mp4');assert.equal(Number(init.headers['content-length']),init.body.length);
   if(uploads===1){shots=JSON.parse(init.headers['x-render-shots']);await writeFile(output,init.body);throw new Error('Upload committed; response lost');}
   return Response.json({finishedMaterialId:'saved'});
  };
  const config=workerConfig({OCE_SITE_URL:'https://site.example',JOB_TOKEN:'test'.repeat(8),CHROME_PATH:chrome});
  assert.equal(await runOnce(config,bundle,workerApi),true);assert.equal(uploads,2);assert.ok(shots[0].end>1.8);assert.ok((await stat(output)).size>1000);
  assert.equal(await runOnce(config,bundle,workerApi),false,'an idle queue does not render again');
  const probe=spawnSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',output]);assert.equal(probe.status,0);
  const data=JSON.parse(probe.stdout.toString());
  assert.deepEqual(data.streams.map(track=>track.codec_name),['h264','aac']);assert.equal(data.streams[0].width,1080);assert.equal(data.streams[0].height,1920);assert.equal(data.streams[1].channels,2);
  assert.ok(Number(data.format.duration)>=2.75&&Number(data.format.duration)<3);
 }finally{await rm(scratch,{recursive:true,force:true});}
});
