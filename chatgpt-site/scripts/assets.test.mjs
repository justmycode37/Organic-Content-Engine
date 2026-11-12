import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,relative,resolve} from 'node:path';
import {test} from 'node:test';
import {assertPngAlpha,linkSpec,registerFile,resolveAsset,verifyRegistry} from './assets.mjs';
import {parseClip} from './capture.mjs';
import {parseRobotsTxt,robotsAllows} from './capture/robots.mjs';

async function fixture(){
 const directory=await mkdtemp(join(tmpdir(),'motion-assets-'));
 const root=join(directory,'assets'),source=join(directory,'capture.png');
 await mkdir(join(root,'files'),{recursive:true});
 await writeFile(source,Buffer.from('small test capture'));
 await writeFile(join(root,'registry.json'),' {"version":1,"assets":[]}\n');
 return {directory,root,source};
}

const metadata=(rightsStatus='licensed')=>({
 id:`test-${rightsStatus}`,kind:'screenshot',sourceUrl:'https://example.test/story',creator:'Example Publisher',
 licence:'Copyright remains with the publisher; use licensed for this test.',attribution:'Screenshot: Example Publisher, https://example.test/story.',
 rightsStatus,restrictions:'Use with the listed attribution.',createdAt:'2026-11-11T12:00:00.000Z'
});

test('registers, resolves, and verifies a file by its SHA-256 digest',async()=>{
 const context=await fixture();
 try{
  const entry=await registerFile({...metadata(),root:context.root,sourcePath:context.source});
  assert.equal(entry.file,`files/${entry.id}.png`);
  assert.equal(await resolveAsset(entry.id,{root:context.root}),resolve(context.root,entry.file));
  assert.deepEqual(await verifyRegistry({root:context.root}),{ok:true,checked:1,errors:[]});
  await writeFile(resolve(context.root,entry.file),'modified capture');
  const result=await verifyRegistry({root:context.root});
  assert.equal(result.ok,false);
  assert.match(result.errors.join('\n'),/sha256 mismatch/);
 }finally{await rm(context.directory,{recursive:true,force:true});}
});

test('publish verification rejects unknown rights and ordinary verification records them',async()=>{
 const context=await fixture();
 try{
  const entry=await registerFile({...metadata('unknown'),root:context.root,sourcePath:context.source});
  assert.equal(entry.rightsStatus,'unknown');
  assert.equal((await verifyRegistry({root:context.root})).ok,true);
  const publish=await verifyRegistry({root:context.root,publish:true});
  assert.equal(publish.ok,false);
  assert.match(publish.errors.join('\n'),/rightsStatus is unknown/);
 }finally{await rm(context.directory,{recursive:true,force:true});}
});

test('verifies required rights fields for licensed material',async()=>{
 const context=await fixture();
 try{
  await assert.rejects(registerFile({...metadata(),attribution:'',root:context.root,sourcePath:context.source}),/missing required field 'attribution'/);
  assert.equal((await readFile(join(context.root,'registry.json'),'utf8')).includes('test-licensed'),false);
 }finally{await rm(context.directory,{recursive:true,force:true});}
});

test('link reads registryAssets sidecars and writes spec-relative paths',async()=>{
 const context=await fixture();
 try{
  const entry=await registerFile({...metadata(),root:context.root,sourcePath:context.source});
  const video=join(context.directory,'output','video');await mkdir(video,{recursive:true});
  const specPath=join(video,'fixture.json');
  await writeFile(specPath,JSON.stringify({version:1,scenes:[{type:'title'}]}));
  await writeFile(join(video,'fixture.registryAssets.json'),JSON.stringify({registryAssets:[entry.id]}));
  const result=await linkSpec(specPath,[],{root:context.root});
  const spec=JSON.parse(await readFile(specPath,'utf8'));
  assert.equal(result.assetIds[0],entry.id);
  assert.equal(spec.assets[entry.id],relative(video,resolve(context.root,entry.file)).replaceAll('\\','/'));
  assert.equal(spec.scenes[0].type,'title');
 }finally{await rm(context.directory,{recursive:true,force:true});}
});

test('link accepts ids directly and updates an existing assets map',async()=>{
 const context=await fixture();
 try{
  const entry=await registerFile({...metadata(),root:context.root,sourcePath:context.source});
  const specPath=join(context.directory,'fixture.json');
  await writeFile(specPath,JSON.stringify({version:1,assets:{existing:'./keep.png'},scenes:[]}));
  await linkSpec(specPath,[entry.id],{root:context.root});
  const spec=JSON.parse(await readFile(specPath,'utf8'));
  assert.equal(spec.assets.existing,'./keep.png');
  assert.equal(spec.assets[entry.id],relative(context.directory,resolve(context.root,entry.file)).replaceAll('\\','/'));
 }finally{await rm(context.directory,{recursive:true,force:true});}
});

test('robots rules honor path specificity and allow overrides',()=>{
 const policy=parseRobotsTxt('User-agent: *\nDisallow: /private\nAllow: /private/public\n');
 assert.equal(robotsAllows(policy,'https://example.test/private/page'),false);
 assert.equal(robotsAllows(policy,'https://example.test/private/public/article'),true);
 assert.equal(robotsAllows(policy,'https://example.test/news'),true);
});

test('clip parser requires a positive rectangle',()=>{
 assert.deepEqual(parseClip('8,12,640,480'),{x:8,y:12,width:640,height:480});
 assert.throws(()=>parseClip('8,12,0,480'),/positive width\/height/);
});

test('cut-out output must be a PNG with an alpha color channel',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'motion-alpha-'));
 try{
  const alpha=join(directory,'alpha.png'),opaque=join(directory,'opaque.png'),header=Buffer.alloc(26);
  Buffer.from([137,80,78,71,13,10,26,10]).copy(header);header[25]=6;await writeFile(alpha,header);
  header[25]=2;await writeFile(opaque,header);
  await assert.doesNotReject(assertPngAlpha(alpha));
  await assert.rejects(assertPngAlpha(opaque),/alpha PNG/);
 }finally{await rm(directory,{recursive:true,force:true});}
});
