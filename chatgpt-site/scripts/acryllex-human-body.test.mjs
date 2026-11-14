import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {mkdtemp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {BODY_BONES,parseBodySource,bodySourceKey,inspectHumanBodyGLB} from '../src/acryllex/human-body-source.ts';
import {prepareHumanBodies} from './acryllex/human-body-assets.mjs';
import {preloadAssets,gltf} from '../src/acryllex/assets.ts';
import {validateHumanBody} from '../src/acryllex/models/human-body.ts';
import {buildPerson} from '../src/acryllex/models/realistic-person.ts';
const sha=b=>createHash('sha256').update(b).digest('hex');
const sourceRoot=fileURLToPath(new URL('../src/acryllex/',import.meta.url));

// Small synthetic canonical skin, with independent triangles and no textures/downloads. This is a rig fixture, not anatomy.
function fixture(){
 const nodes=[{name:'Armature',children:[]}],positions=[],parents=[];
 const add=(name,p,parent)=>{const i=nodes.length;nodes.push({name,translation:p,children:[]});nodes[parent].children.push(i);parents[i]=parent;positions[i]=p.map((v,k)=>v+(positions[parent]?.[k]??0));return i;};
 const h=add('Hips',[0,1,0],0),sp=add('Spine',[0,.15,0],h),s1=add('Spine1',[0,.2,0],sp),s2=add('Spine2',[0,.2,0],s1),neck=add('Neck',[0,.1,0],s2);add('Head',[0,.15,0],neck);
 for(const[s,k]of[['Left',1],['Right',-1]]){const sh=add(s+'Shoulder',[k*.1,0,0],s2),arm=add(s+'Arm',[k*.1,0,0],sh),el=add(s+'ForeArm',[k*.28,-.01,0],arm);add(s+'Hand',[k*.25,0,0],el);const hip=add(s+'UpLeg',[k*.1,-.1,0],h),knee=add(s+'Leg',[0,-.43,0],hip),ankle=add(s+'Foot',[0,-.42,0],knee);add(s+'ToeBase',[0,-.02,.15],ankle);}
 const joints=nodes.slice(1).map((_,i)=>i+1),binary=[],views=[],accessors=[];let offset=0;
 const accessor=(array,type,componentType,extra={})=>{const bytes=Buffer.from(array.buffer,array.byteOffset,array.byteLength),pad=(4-offset%4)%4;if(pad){binary.push(Buffer.alloc(pad));offset+=pad;}const view=views.length;views.push({buffer:0,byteOffset:offset,byteLength:bytes.length});binary.push(bytes);offset+=bytes.length;accessors.push({bufferView:view,componentType,count:array.length/({SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}[type]),type,...extra});return accessors.length-1;};
 const xyz=[],normal=[],uv=[],ids=[],weights=[],inverse=[];
 for(const[i,j]of joints.entries()){const p=positions[j];inverse.push(...new THREE.Matrix4().makeTranslation(...p.map(v=>-v)).elements);for(const delta of[[-.02,-.05,0],[.02,-.05,0],[0,.06,.02]]){xyz.push(...p.map((v,k)=>v+delta[k]));normal.push(0,0,1);uv.push(0,0);ids.push(i,0,0,0);weights.push(1,0,0,0);}}
 const min=[0,1,2].map(k=>Math.min(...xyz.filter((_,i)=>i%3===k))),max=[0,1,2].map(k=>Math.max(...xyz.filter((_,i)=>i%3===k)));
 const attributes={POSITION:accessor(new Float32Array(xyz),'VEC3',5126,{min,max}),NORMAL:accessor(new Float32Array(normal),'VEC3',5126),TEXCOORD_0:accessor(new Float32Array(uv),'VEC2',5126),JOINTS_0:accessor(new Uint16Array(ids),'VEC4',5123),WEIGHTS_0:accessor(new Float32Array(weights),'VEC4',5126)};
 const ibm=accessor(new Float32Array(inverse),'MAT4',5126),times=accessor(new Float32Array([0,1]),'SCALAR',5126,{min:[0],max:[1]}),moves=accessor(new Float32Array([0,1,0,100,1,0]),'VEC3',5126),scale=accessor(new Float32Array([1,1,1,2,2,2]),'VEC3',5126),meshNode=nodes.length;nodes.push({name:'Body',mesh:0,skin:0});
 const doc={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0,meshNode]}],nodes,skins:[{joints,inverseBindMatrices:ibm,skeleton:h}],meshes:[{name:'Body',primitives:[{attributes,material:0}]}],materials:[{name:'Bodymat'}],buffers:[{byteLength:offset}],bufferViews:views,accessors,animations:[{name:'source-clip-must-be-ignored',samplers:[{input:times,output:moves},{input:times,output:scale}],channels:[{sampler:0,target:{node:h,path:'translation'}},{sampler:1,target:{node:h,path:'scale'}}]}]};
 return encode(doc,Buffer.concat(binary));
}
function encode(doc,bin){const raw=Buffer.from(JSON.stringify(doc)),json=Buffer.alloc(Math.ceil(raw.length/4)*4,32);raw.copy(json);const body=Buffer.alloc(Math.ceil(bin.length/4)*4);bin.copy(body);const bytes=Buffer.alloc(28+json.length+body.length);bytes.writeUInt32LE(0x46546c67);bytes.writeUInt32LE(2,4);bytes.writeUInt32LE(bytes.length,8);bytes.writeUInt32LE(json.length,12);bytes.writeUInt32LE(0x4e4f534a,16);json.copy(bytes,20);bytes.writeUInt32LE(body.length,20+json.length);bytes.writeUInt32LE(0x004e4942,24+json.length);body.copy(bytes,28+json.length);return bytes;}
function rewrite(bytes,edit){const n=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+n));edit(doc);return encode(doc,bytes.subarray(28+n));}
const parse=bytes=>new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const spec=v=>({scenes:[{objects:[{model:'human-female',params:{bodySource:v}}]}]});
function ctx(params){const mat=(v={})=>new THREE.MeshStandardMaterial({color:new THREE.Color().setScalar(v.tone??1)});return{params,seed:41,mat,mesh:(g,v)=>new THREE.Mesh(g,mat(v)),color:()=>new THREE.Color(1,1,1),num:(n,f,min=-Infinity,max=Infinity)=>Math.max(min,Math.min(max,typeof params[n]==='number'?params[n]:f)),str:(n,f,allowed)=>typeof params[n]==='string'&&(!allowed||allowed.includes(params[n]))?params[n]:f,bool:(n,f)=>typeof params[n]==='boolean'?params[n]:f};}
function pack(person,t=.4){person.update({},t,{from:'type',to:'type',k:1,time:t,travel:0,speed:0});person.root.updateMatrixWorld(true);const out=[];person.root.traverse(m=>{if(!m.isSkinnedMesh)return;m.skeleton.update();for(let i=0;i<m.geometry.attributes.position.count;i++){const v=m.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(m.matrixWorld);out.push(...v.toArray());}});return out;}
function disposeMaterials(person){const mats=new Set();person.root.traverse(m=>{if(m.isMesh)for(const a of Array.isArray(m.material)?m.material:[m.material])mats.add(a);});for(const m of mats)m.dispose();person.dispose?.();}
async function loadedFixture(source={file:'synthetic-human.glb'}){const config=parseBodySource(source),key=bodySourceKey(config),bytes=fixture(),old=globalThis.fetch;globalThis.fetch=async request=>{const url=typeof request==='string'?request:request.url;assert.match(url,/\/a\//);return{ok:true,status:200,headers:new Headers(),body:undefined,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};};try{await preloadAssets({[key]:'synthetic-body.glb','human-xbot':'synthetic-motion.glb','human-brian':'synthetic-body-legacy.glb'});}finally{globalThis.fetch=old;}return{key,config,template:gltf(key),bytes};}

test('one shared parser/key rejects explicit malformed/conflicting input without interpreting filename as anatomy',()=>{
 assert.equal(parseBodySource(undefined),null);
 for(const value of[null,false,0,'a.glb',{},[],{file:undefined},{file:'a.glb',url:'https://x.test/a.glb'},{file:'a.fbx'},{url:'http://x.test/a.glb'},{url:'https://user:secret@x.test/a.glb'},{url:'https://x.test/a.glb#x'},{file:'a.glb',sha256:'bad'},{file:'a.glb',unexpected:true}])assert.throws(()=>parseBodySource(value),/bodySource:/);
 assert.throws(()=>parseBodySource({file:'a.glb'},'remy'),/cannot combine/);
 const p=parseBodySource({url:'https://x.test/a.glb?q=1',sha256:'AB'.repeat(32)});assert.equal(p.sha256,'ab'.repeat(32));assert.equal(bodySourceKey(p),bodySourceKey(parseBodySource({sha256:'ab'.repeat(32),url:p.src})));assert.notEqual(bodySourceKey(p),bodySourceKey({...p,sha256:undefined}));
});
test('self-contained canonical GLB accepts embedded data textures; external assets/missing skin/hierarchy fail clearly',()=>{
 const bytes=fixture();assert.ok(inspectHumanBodyGLB(bytes).meshes.length);assert.ok(inspectHumanBodyGLB(rewrite(bytes,g=>g.images=[{uri:'data:image/png;base64,AA=='}])));
 for(const edit of[g=>g.buffers[0].uri='external.bin',g=>g.images=[{uri:'external.png'}],g=>g.images=[{uri:'data:image/svg+xml;base64,PHN2Zy8+'}],g=>g.images=[{bufferView:0,mimeType:'image/svg+xml'}],g=>g.skins=[],g=>g.nodes.find(n=>n.name==='Head').name='Unknown',g=>g.nodes[0].children.push(0),g=>delete g.meshes[0].primitives[0].attributes.WEIGHTS_0,g=>delete g.nodes.find(n=>n.mesh===0).skin])assert.throws(()=>inspectHumanBodyGLB(rewrite(bytes,edit)),/bodySource:/);
 assert.throws(()=>inspectHumanBodyGLB(bytes.subarray(0,-1)),/bodySource:/);
});
test('content-addressed preparation verifies local/pinned/cached bytes and optional unpinned URL cache stays offline',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'acx-body-')),bytes=fixture(),file=join(dir,'body.glb'),pin=sha(bytes);try{
  await writeFile(file,bytes);const local={file,sha256:pin},map=await prepareHumanBodies(spec(local),dir);assert.equal(map[bodySourceKey(parseBodySource(local))],`human-bodies/${pin}.glb`);assert.deepEqual(await readFile(join(dir,Object.values(map)[0])),bytes);
  await assert.rejects(prepareHumanBodies(spec({...local,sha256:'0'.repeat(64)}),dir),/SHA256 mismatch/);
  const remote={url:'https://example.test/body.glb',sha256:pin};let calls=0;await rm(join(dir,'human-bodies',pin+'.glb'));await prepareHumanBodies(spec(remote),dir,{fetcher:async()=>{calls++;return new Response(bytes);}});await prepareHumanBodies(spec(remote),dir,{fetcher:()=>{throw Error('must stay offline');}});assert.equal(calls,1);
  await writeFile(join(dir,'human-bodies',pin+'.glb'),Buffer.from('corrupt'));await assert.rejects(prepareHumanBodies(spec(remote),dir,{fetcher:()=>{throw Error('must not refetch corruption');}}),/SHA256 mismatch/);await rm(join(dir,'human-bodies',pin+'.glb'));
  const unpin={url:'https://example.test/unpinned.glb'};const a=await prepareHumanBodies(spec(unpin),dir,{fetcher:async()=>new Response(bytes)}),b=await prepareHumanBodies(spec(unpin),dir,{fetcher:()=>{throw Error('must stay offline');}});assert.deepEqual(a,b);assert.equal(Object.values(a)[0],`human-bodies/${pin}.glb`);
  const bad=join(dir,'invalid.glb');await writeFile(bad,Buffer.from('invalid'));await assert.rejects(prepareHumanBodies(spec({file:bad}),dir),/bodySource:/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('authored skin weights are validated before GLTFLoader can normalize invalid data',()=>{
 const variant=(values,componentType=5126)=>{
  const bytes=fixture(),n=bytes.readUInt32LE(12),g=JSON.parse(bytes.subarray(20,20+n)),bin=Buffer.from(bytes.subarray(28+n)),a=g.accessors[g.meshes[0].primitives[0].attributes.WEIGHTS_0],v=g.bufferViews[a.bufferView];
  a.componentType=componentType;if(componentType!==5126)a.normalized=true;v.byteStride=16;
  for(let i=0;i<a.count;i++)for(let k=0;k<4;k++){const at=v.byteOffset+i*16+k*(componentType===5126?4:componentType===5123?2:1);if(componentType===5126)bin.writeFloatLE(values[k],at);else if(componentType===5123)bin.writeUInt16LE(values[k],at);else bin.writeUInt8(values[k],at);}
  return encode(g,bin);
 };
 for(const w of[[0,0,0,0],[.2,.2,.2,.2],[-.1,1.1,0,0],[NaN,1,0,0]])assert.throws(()=>inspectHumanBodyGLB(variant(w)),/authored skin weight/);
 assert.ok(inspectHumanBodyGLB(variant([.25,.25,.25,.25])));
 assert.ok(inspectHumanBodyGLB(variant([128,127,0,0],5121)));
 assert.ok(inspectHumanBodyGLB(variant([32768,32767,0,0],5123)));
 assert.throws(()=>inspectHumanBodyGLB(rewrite(fixture(),g=>g.accessors[g.meshes[0].primitives[0].attributes.WEIGHTS_0].sparse={count:0})),/dense VEC4/);
 assert.throws(()=>inspectHumanBodyGLB(rewrite(fixture(),g=>g.bufferViews[g.accessors[g.meshes[0].primitives[0].attributes.WEIGHTS_0].bufferView].byteStride=252)),/bounds/);
});
test('mesh-parented joints reject at preload and constructor before the rig skips that subtree',async()=>{
 const nested=rewrite(fixture(),g=>{const i=g.nodes.findIndex(n=>n.mesh===0);g.nodes[i].children=[0];g.scenes[0].nodes=[i];});
 assert.throws(()=>inspectHumanBodyGLB(nested),/outside mesh subtrees/);
 const loaded=await parse(nested);assert.throws(()=>validateHumanBody(loaded),/outside mesh subtrees/);
});
test('actual GLTFLoader import validates rig/skin, requires no fingers and leaves cached source clips/attributes unchanged',async()=>{
 const {template}=await loadedFixture({file:'no-fingers.glb'}),before=JSON.stringify(template.scene.toJSON());assert.ok(BODY_BONES.every(n=>template.scene.getObjectByName(n)?.isBone));assert.equal(template.scene.getObjectByName('LeftHandMiddle1'),undefined);validateHumanBody(template);assert.equal(JSON.stringify(template.scene.toJSON()),before);assert.equal(template.animations[0].name,'source-clip-must-be-ignored');
 for(const edit of[g=>g.nodes[0].scale=[1,2,1],g=>g.nodes[0].scale=[-1,1,1],g=>g.nodes[0].rotation=[0,1,0,0]]){const bad=await parse(rewrite(fixture(),edit));assert.throws(()=>validateHumanBody(bad),/bodySource:/);}
 const bad=await parse(fixture());bad.scene.getObjectByName('Body').geometry.attributes.skinWeight.array[0]=.1;assert.throws(()=>validateHumanBody(bad),/weights must sum/);
});
test('import overrides anatomical identity predictably, preserves feet and uses explicit figure/height rather than source path',async()=>{
 const source={file:'some-megan.glb'},loaded=await loadedFixture(source),a=buildPerson(ctx({bodySource:source}),{asset:'missing-anatomical-body',sex:'female',height:1.68}),b=buildPerson(ctx({bodySource:source,height:1.6}),{sex:'male'}),female=buildPerson(ctx({bodySource:source,figure:'woman'}));
 assert.ok(a.rig.has('Head'));assert.ok(!a.rig.has('LeftHandMiddle1'));const body=a.root.children[0];const templateBox=new THREE.Box3().setFromObject(loaded.template.scene,true);assert.ok(Math.abs(body.scale.y*(templateBox.max.y-templateBox.min.y)-1.8)<1e-6);assert.ok(Math.abs(b.root.children[0].scale.y/body.scale.y-1.6/1.8)<1e-12);assert.ok(Math.abs(female.root.children[0].scale.y/body.scale.y-1.68/1.8)<1e-12);
 assert.deepEqual(a.rig.nodes[a.rig.need('LeftFoot')].o.scale.toArray(),[1,1,1]);const before=pack(a,.4);pack(a,10);assert.deepEqual(pack(a,.4),before,'body source scale/translation clip must not play');for(const person of[a,b,female])disposeMaterials(person);
});
test('import instances/absolute reverse seeks, existing head/alpha hooks and cached source survive peer material disposal',async()=>{
 const source={file:'peers.glb'},loaded=await loadedFixture(source),snapshot=JSON.stringify(loaded.template.scene.toJSON()),params={bodySource:source,headTone:.7,sourceAlpha:true,sourceHairSide:true,headAccentLight:{position:[0,2,1],target:[0,1.6,0],intensity:1,innerAngleDeg:12,outerAngleDeg:20,distance:3},track:{keys:[{t:0,head:[0,0,0]},{t:1,head:[10,4,0]}]}},a=buildPerson(ctx(params)),b=buildPerson(ctx(params)),expected=pack(b,.4);
 assert.notEqual(a.rig.nodes[a.rig.need('Head')].o,b.rig.nodes[b.rig.need('Head')].o);assert.deepEqual(pack(a,.4),expected);pack(a,.9);pack(a,.1);assert.deepEqual(pack(a,.4),expected);disposeMaterials(a);assert.deepEqual(pack(b,.4),expected);assert.equal(JSON.stringify(loaded.template.scene.toJSON()),snapshot);disposeMaterials(b);
});
test('omitted bodySource keeps the legacy body/foot defaults; malformed explicit imports do not silently fall back',async()=>{
 await loadedFixture();const a=buildPerson(ctx({body:'brian'})),b=buildPerson(ctx({body:'brian',bodySource:undefined}));assert.deepEqual(pack(a),pack(b));assert.deepEqual(a.rig.nodes[a.rig.need('LeftFoot')].o.scale.toArray(),[.82,.82,.82]);
 for(const bodySource of[null,false,{}, {file:'not-preloaded.glb'}])assert.throws(()=>buildPerson(ctx({bodySource})),/bodySource:/);assert.throws(()=>buildPerson(ctx({body:'brian',bodySource:{file:'x.glb'}})),/cannot combine/);disposeMaterials(a);disposeMaterials(b);
});

// Normal production runs resolve these imports directly. The optional base is only for artifact overlay review.
function overlayPlugin(){const base=process.env.ACX_TEST_BASE,overlay=fileURLToPath(new URL('../',import.meta.url));return{name:'artifact-overlay-fallback',setup(b){if(base)b.onResolve({filter:/^\./},async a=>{const file=join(a.resolveDir,a.path);if(file.startsWith(base+'/')){const candidate=join(overlay,file.slice(base.length+1));try{await readFile(candidate);return{path:candidate};}catch{}}try{await readFile(file);return{path:file};}catch{if(file.startsWith(overlay))return{path:join(base,file.slice(overlay.length))};}});}};}
test('actual scene constructor propagates enabled source and preload errors for all public human profiles',async()=>{
 // A data: module has no relative URL base. Real loader modules resolve their
 // decoder URLs against a file; preserve a file base in this bundled fixture.
 const source=await readFile(join(sourceRoot,'engine.ts'),'utf8'),result=await build({stdin:{contents:source+"\nexport {SceneRuntime};export {gltf,preloadAssets} from './assets.ts';",resolveDir:sourceRoot,sourcefile:'engine.ts',loader:'ts'},plugins:[overlayPlugin()],bundle:true,write:false,format:'esm',platform:'node',define:{'import.meta.url':JSON.stringify(new URL('../src/acryllex/engine.ts',import.meta.url).href)},logLevel:'silent'}),sceneModule=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64')), {SceneRuntime}=sceneModule;
 for(const model of['human','human-male','human-female'])for(const bodySource of[null,false,{}, {file:'missing.glb'}])assert.throws(()=>new SceneRuntime({duration:2,objects:[{id:'a',model,params:{bodySource}}]},0),/bodySource:/);
 const valid={file:'valid-scene.glb'},key=bodySourceKey(parseBodySource(valid)),bytes=fixture(),old=globalThis.fetch;
 globalThis.fetch=async()=>({ok:true,status:200,headers:new Headers(),body:undefined,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});
 try{await sceneModule.preloadAssets({[key]:'valid-body.glb','human-xbot':'valid-motion.glb'});for(const model of['human','human-male','human-female']){const rt=new SceneRuntime({duration:2,objects:[{id:'a',model,params:{bodySource:valid}}]},0);assert.ok(rt.byId.get('a').built.rig.has('Head'));rt.dispose();rt.dispose();}const head=sceneModule.gltf(key).scene.getObjectByName('Head');head.name='InvalidHead';try{assert.throws(()=>new SceneRuntime({duration:2,objects:[{id:'a',model:'human-female',params:{bodySource:valid}}]},0),/bodySource: missing canonical bone Head/);}finally{head.name='Head';}
 globalThis.fetch=async()=>({ok:false,status:404});await assert.rejects(preloadAssets({[bodySourceKey(parseBodySource({file:'missing-network.glb'}))]:'missing.glb'}),/bodySource:.*HTTP 404/);
 }finally{globalThis.fetch=old;}
});
test('assetsForSpec prepares custom female profile + legacy clip without forcing bundled anatomical asset',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'acx-body-preload-'));try{await mkdir(join(dir,'src/acryllex/assets'),{recursive:true});await mkdir(join(dir,'.acryllex-assets/three'),{recursive:true});await writeFile(join(dir,'src/acryllex/assets/catalog.json'),JSON.stringify({assets:[{id:'human-xbot',src:'three',file:'three/Xbot.glb'}]}));await writeFile(join(dir,'.acryllex-assets/three/Xbot.glb'),fixture());const file=join(dir,'body.glb');await writeFile(file,fixture());
  const assetsFile=fileURLToPath(new URL('./acryllex/assets.mjs',import.meta.url)),original=await readFile(assetsFile,'utf8'),source=original.replace("const ROOT=fileURLToPath(new URL('../../',import.meta.url));",`const ROOT=${JSON.stringify(dir)};`),result=await build({stdin:{contents:source,resolveDir:dirname(assetsFile),sourcefile:'assets.mjs',loader:'js'},plugins:[overlayPlugin()],bundle:true,write:false,platform:'node',format:'esm',logLevel:'silent'}),{assetsForSpec}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64')),map=await assetsForSpec(spec({file}));assert.deepEqual(Object.keys(map).sort(),['human-xbot',bodySourceKey(parseBodySource({file}))].sort());
 }finally{await rm(dir,{recursive:true,force:true});}
});
