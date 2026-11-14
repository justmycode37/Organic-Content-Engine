import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {sceneSchema} from '../src/acryllex/schema.ts';

const sourceRoot=fileURLToPath(new URL('../src/acryllex/',import.meta.url));
const source=await readFile(join(sourceRoot,'engine.ts'),'utf8'),result=await build({stdin:{contents:source+"\nexport {CELL,COLS,ROWS,SS,setFormat} from './format.ts';",resolveDir:sourceRoot,sourcefile:'engine.ts',loader:'ts'},bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent'});
const engineModule=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
const {Engine,LOOK}=engineModule;
const scene=raster=>({say:'A raster fixture.',duration:2,objects:[{id:'a',model:'led'}],...(raster===undefined?{}:{raster})});
const keys=['cell','dotRoundness','dotSoftness'];
const invalid=[null,false,0,'6.35',[],{unknown:1},{cell:null},{cell:'6.35'},{cell:NaN},{cell:Infinity},{cell:-Infinity},{cell:0},{cell:.99},{cell:24.01},{dotRoundness:-.01},{dotRoundness:1.01},{dotSoftness:-.01},{dotSoftness:2.01},{dotRoundness:NaN},{dotSoftness:Infinity}];
const runtimeInvalid=[...invalid,new Date(),Object.create({cell:Infinity}),Object.defineProperty({},'cell',{value:Infinity}),Object.defineProperty({},'unknown',{value:1}),{[Symbol('unknown')]:1}];

test('strict scene raster schema accepts omission, partial fields, fractional cells and exact bounds',()=>{
 for(const raster of[undefined,{}, {cell:6.35},{cell:1,dotRoundness:0,dotSoftness:0},{cell:24,dotRoundness:1,dotSoftness:2}])assert.equal(sceneSchema.safeParse(scene(raster)).success,true);
 for(const raster of invalid)assert.equal(sceneSchema.safeParse(scene(raster)).success,false,`Accepted ${String(raster)}`);
 const rejected=sceneSchema.safeParse(scene({cell:Infinity}));assert.deepEqual(rejected.error.issues[0].path,['raster','cell']);
});

test('direct Engine callers reject malformed raster before requiring DOM or WebGL',()=>{
 for(const raster of runtimeInvalid)assert.throws(()=>new Engine({version:1,series:'ACRYLLEX',title:'Raster',scenes:[scene(),scene(raster)]}),/scene 2 raster/);
});

function harness(scenes,defaults={cell:7.44,dotRoundness:.35,dotSoftness:.2}){
 const uniforms=Object.fromEntries(['cell','dotRoundness','dotSoftness','cNear','cFar','tanHalf','aoR','aoStr','contrast','inkLo','gam','blackPoint','whitePoint','expo','noiseAmt','noiseReference','maskMode','maskK','boost','ink','mode','mixP','time'].map(k=>[k,{value:NaN}]));
 uniforms.inkColor={value:{set(){return this;},divideScalar(){return this;}}};
 const draws=[],runtime={camera:{near:.1,far:100,fov:36},radius:1,dur:2,project(){return null;}};
 const engine=Object.assign(Object.create(Engine.prototype),{spec:{version:1,series:'ACRYLLEX',title:'Raster',captions:false,scenes},starts:scenes.map((_,i)=>i*2),rasterDefaults:{...defaults},aoMethod:'plane',post:{uniforms},rtA:{},rtB:{},postScene:{},postCam:{},out:{},gl:{},ctx2d:{fillRect(){},drawImage(){}},renderer:{setRenderTarget(){},setClearColor(){},clear(){},render(){}},runtime(){return runtime;},renderInto(rt,i,local){draws.push({rt,i,local});}});
 return{engine,uniforms,draws,raster:()=>Object.fromEntries(keys.map(k=>[k,uniforms[k].value]))};
}

test('every frame restores raster fields through cuts and reverse seeks without changing source format',()=>{
 const defaults={cell:7.44,dotRoundness:.35,dotSoftness:.2},override={cell:6.35,dotRoundness:1,dotSoftness:2};
 const h=harness([scene(override),scene(),scene({dotRoundness:0,dotSoftness:0}),scene({})],defaults),expected=[override,defaults,{...defaults,dotRoundness:0,dotSoftness:0},defaults];
 engineModule.setFormat({width:1164,height:670,cell:7.44});
 const format=()=>Object.fromEntries(['W','H','CELL','COLS','ROWS','SS'].map(k=>[k,engineModule[k]])),before=format();
 try{for(const i of[0,1,2,3,0,3,2,1,0]){h.engine.frame(i*2+.5);assert.deepEqual(h.raster(),expected[i]);assert.deepEqual(format(),before);}}finally{engineModule.setFormat();}
});

test('raster reset uses captured engine defaults after global LOOK changes',()=>{
 const h=harness([scene({cell:1,dotRoundness:0,dotSoftness:0}),scene()]),before={dotRoundness:LOOK.dotRoundness,dotSoftness:LOOK.dotSoftness};
 try{h.engine.frame(.5);Object.assign(LOOK,{dotRoundness:1,dotSoftness:2});h.engine.frame(2.5);assert.deepEqual(h.raster(),{cell:7.44,dotRoundness:.35,dotSoftness:.2});}finally{Object.assign(LOOK,before);}
});

test('direct transitions apply the incoming raster to both sampled scenes',()=>{
 const raster={cell:6.3,dotRoundness:.7,dotSoftness:.4},incoming={...scene(raster),transition:'wipe',transitionDur:.4},h=harness([scene({cell:24}),incoming]);
 h.engine.frame(2.1);assert.deepEqual(h.draws.map(d=>d.i),[1,0]);assert.equal(h.uniforms.mode.value,2);assert.deepEqual(h.raster(),raster);
 h.engine.frame(.5);assert.deepEqual(h.raster(),{cell:24,dotRoundness:.35,dotSoftness:.2});
});

test('runtime spec edits fail before any render or invalid uniform assignment',()=>{
 const h=harness([scene()]);h.engine.frame(.5);const before=h.raster(),count=h.draws.length;
 for(const raster of runtimeInvalid){h.engine.spec.scenes[0].raster=raster;assert.throws(()=>h.engine.frame(.5),/scene 1 raster/);assert.equal(h.draws.length,count);assert.deepEqual(h.raster(),before);}
});

test('runtime raster values are read once into a validated snapshot, including hidden fields',()=>{
 const h=harness([scene(Object.defineProperty({},'cell',{value:1}))]);h.engine.frame(.5);assert.equal(h.uniforms.cell.value,1);
 let reads=0;h.engine.spec.scenes[0].raster={get cell(){return ++reads===1?2:Infinity;}};h.engine.frame(.5);assert.equal(reads,1);assert.equal(h.uniforms.cell.value,2);
 assert.throws(()=>h.engine.frame(.5),/scene 1 raster.cell/);assert.equal(h.uniforms.cell.value,2);
});
