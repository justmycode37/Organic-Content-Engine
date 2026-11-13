import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCatalog} from './acryllex/catalog.mjs';
import * as THREE from 'three';
import {readFile} from 'node:fs/promises';
function modelContext(params,seed=37){
 const mat=(o={})=>{const m=new THREE.MeshStandardMaterial({color:new THREE.Color().setScalar(o.tone??1)});m.userData.tone=o.tone??1;return m;};
 return {params,seed,mat,mesh:(g,o)=>new THREE.Mesh(g,mat(o)),color:()=>new THREE.Color(1,1,1),num:(key,f,min=-Infinity,max=Infinity)=>Math.max(min,Math.min(max,Number.isFinite(Number(params[key]))?Number(params[key]):f)),bool:(key,f)=>typeof params[key]==='boolean'?params[key]:f,str:(key,f,allowed)=>typeof params[key]==='string'&&(!allowed||allowed.includes(params[key]))?params[key]:f};
}
const spec={version:1,series:'ACRYLLEX',title:'t',scenes:Array.from({length:8},(_,i)=>({say:'One two three four five six seven eight nine ten eleven twelve thirteen.',hue:'blue',objects:[{id:'a',model:i%2?'led':'human',enter:'assemble'}],events:[{at:'seven',target:'a',set:{glow:1}}],text:[{text:'1993',style:'number',at:'ten'}]}))};
test('catalogue has people, media subjects, fluids, core objects and real scans',async()=>{const c=await loadCatalog();for(const id of ['human','human-male','human-female','footage','wave-footage','ocean-wave-media','fluid-sheet','fluid-jet','led','brain','earth','heart','alarm_clock_01'])assert.ok(c.has(id),id);assert.ok(!c.has('definitely-not-a-model'));assert.ok(c.ids.length>100);});
test('anatomical bodies contain separate skinned meshes with valid normalized weights',async()=>{
 const bodies=[];
 for(const id of ['human-male','human-female']){
  const data=await readFile(new URL(`../src/acryllex/assets/humans/${id}.glb`,import.meta.url));
  assert.equal(data.readUInt32LE(0),0x46546c67);assert.equal(data.readUInt32LE(4),2);assert.equal(data.readUInt32LE(8),data.length);
  const length=data.readUInt32LE(12),gltf=JSON.parse(data.subarray(20,20+length).toString());
  assert.equal(gltf.asset.extras.id,id);assert.equal(gltf.asset.extras.commit,'a8bc2d54ff0ac92e78ff71431b1023eda42bf482');
  assert.equal(gltf.asset.extras.license,'CC0-1.0');
  const bin=data.subarray(28+length),skin=gltf.skins[0],body=gltf.meshes.find(m=>m.name==='Body').primitives[0];
  assert.ok(skin.joints.length>=60);assert.ok(gltf.accessors[body.attributes.POSITION].count>10000);
  const indices=gltf.accessors[body.attributes.JOINTS_0],weights=gltf.accessors[body.attributes.WEIGHTS_0];assert.equal(indices.count,weights.count);
  const offset=a=>(gltf.bufferViews[a.bufferView].byteOffset??0)+(a.byteOffset??0);
  for(let i=0;i<weights.count;i++){
   let sum=0;for(let k=0;k<4;k++){const w=bin.readFloatLE(offset(weights)+(i*4+k)*4);assert.ok(Number.isFinite(w)&&w>=0&&w<=1);sum+=w;assert.ok(bin[offset(indices)+i*4+k]<skin.joints.length);}
   assert.ok(Math.abs(sum-1)<1e-5,'Every skin vertex must have normalized bone weights');
  }
  bodies.push(data);
 }
 assert.notDeepEqual(bodies[0],bodies[1],'Female anatomy must use its own mesh');
});
test('spec schema and content checks',async()=>{const {specSchema,specProblems}=await import('../src/acryllex/schema.ts');const c=await loadCatalog();assert.ok(specSchema.safeParse(spec).success);assert.deepEqual(specProblems(spec,c.has),[]);
 assert.ok(specSchema.safeParse({...spec,look:{palette:{blue:'#1234c8'}}}).success);
 assert.ok(specSchema.safeParse({...spec,look:{textColor:'#c5c5c5'}}).success);
 assert.ok(!specSchema.safeParse({...spec,look:{textColor:'grey'}}).success);
 assert.ok(!specSchema.safeParse({...spec,look:{palette:{blue:'not-a-colour'}}}).success);
 assert.ok(!specSchema.safeParse({...spec,look:{palette:{unknown:'#1234c8'}}}).success);
 assert.ok(specSchema.safeParse({...spec,look:{noise:.06,noiseReference:.015}}).success);
 assert.ok(!specSchema.safeParse({...spec,look:{noiseReference:.02}}).success);
 const grain=structuredClone(spec);grain.scenes[0].light={noise:.06,noiseReference:.015};assert.ok(specSchema.safeParse(grain).success);
 grain.scenes[0].light.noiseReference=.02;assert.ok(!specSchema.safeParse(grain).success);
 const clocked=structuredClone(spec);clocked.scenes[0].motionFPS=25;clocked.scenes[0].motionPhase=1/60;
 assert.ok(specSchema.safeParse(clocked).success);
 for(const fps of [0,-1,Infinity,121]){clocked.scenes[0].motionFPS=fps;assert.ok(!specSchema.safeParse(clocked).success);}
 clocked.scenes[0].motionFPS=25;clocked.scenes[0].motionPhase=Infinity;assert.ok(!specSchema.safeParse(clocked).success);
 const bad=structuredClone(spec);bad.scenes[0].objects[0].model='nope';bad.scenes[1].events[0].at='zebra';const p=specProblems(bad,c.has);assert.ok(p.some(x=>x.includes('unknown model')));assert.ok(p.some(x=>x.includes('zebra')));});
test('automatic sound cues follow the picture',async()=>{const {autoCues}=await import('../src/acryllex/cues.ts');const cues=autoCues(spec);assert.ok(cues.some(c=>c.kind==='assemble'));assert.ok(cues.some(c=>c.kind==='power-on'));assert.ok(cues.every((c,i)=>i===0||c.at>=cues[i-1].at));});
test('acryllex is a separate seeded account on Sol medium',async()=>{const {ACRYLLEX_POLICY}=await import('../worker/acryllex-policy.ts');assert.equal(ACRYLLEX_POLICY.models.all,'gpt-6.1-sol');assert.equal(ACRYLLEX_POLICY.models.effort,'medium');});
test('fractional dots preserve video dimensions and aspect ratio',async()=>{
 const f=await import('../src/acryllex/format.ts');f.setFormat({width:1164,height:670,cell:3.72});
 assert.equal(f.W,1164);assert.equal(f.H,670);assert.equal(f.CELL,3.72);
 assert.ok(f.COLS*f.CELL>=f.W);assert.ok(f.ROWS*f.CELL>=f.H);f.setFormat();
});
test('fluid sheets preserve an authored control grid and reuse their geometry buffers',async()=>{
 const {fluidSheet}=await import('../src/acryllex/models/fluids.ts');
 const grid=[[[0,0,0],[1,.3,0],[2,.2,0]],[[0,.6,1],[1,1.2,1],[2,.8,1]],[[0,1.4,2],[1,1.1,2],[2,.4,2]]];
 const water=fluidSheet.build(modelContext({controlGrid:grid,amplitude:0,thickness:.02,uSegments:12,vSegments:10,foamCount:8}));
 const mesh=water.root.getObjectByName('fluid-sheet-surface'),position=mesh.geometry.getAttribute('position'),normal=mesh.geometry.getAttribute('normal');
 const point=i=>[position.getX(i),position.getY(i),position.getZ(i)];
 for(const [index,expected] of [[0,grid[0][0]],[12,grid[0][2]],[130,grid[2][0]],[142,grid[2][2]]])point(index).forEach((v,k)=>assert.ok(Math.abs(v-expected[k])<1e-6));
 const original=position.array.slice();
 for(const t of [.4,2,.4]){
  water.update({flow:2,amplitude:1,foam:1},t);
  assert.equal(mesh.geometry.getAttribute('position'),position);assert.equal(mesh.geometry.getAttribute('normal'),normal);
  assert.deepEqual(position.array,original,'Flow changes an undeformed authored sheet');
 }
 assert.equal(water.root.userData.fluidCore,'parametric-fluid-surface');
 assert.equal(water.root.userData.fluidMode,'control-grid');
});
test('closed liquid jets keep both seams and normals continuous on reverse seeking',async()=>{
 const {fluidJet}=await import('../src/acryllex/models/fluids.ts');
 const water=fluidJet.build(modelContext({path:[[1,0,0],[0,.4,1],[-1,.8,0],[0,-.2,-1]],closedPath:true,radius:.08,amplitude:.004,uSegments:24,vSegments:12,foamCount:12}));
 const mesh=water.root.getObjectByName('fluid-jet-surface'),position=mesh.geometry.getAttribute('position'),normal=mesh.geometry.getAttribute('normal');
 const state={flow:-.7,radius:1.2,spread:.9,foam:1};water.update(state,.37);
 const expected=position.array.slice(),expectedNormals=normal.array.slice(),foam=water.root.getObjectByName('fluid-jet-foam'),foamExpected=foam.instanceMatrix.array.slice();
 water.update(state,1.29);water.update(state,.37);assert.deepEqual(position.array,expected);assert.deepEqual(normal.array,expectedNormals);assert.deepEqual(foam.instanceMatrix.array,foamExpected);
 const match=(a,b)=>{for(let k=0;k<3;k++){assert.ok(Math.abs(position.getComponent(a,k)-position.getComponent(b,k))<1e-6);assert.ok(Math.abs(normal.getComponent(a,k)-normal.getComponent(b,k))<1e-6);}};
 for(let v=0;v<=12;v++)match(v*25,v*25+24);
 for(let u=0;u<=24;u++)match(u,12*25+u);
 for(let i=0;i<normal.count;i++){const n=Math.hypot(normal.getX(i),normal.getY(i),normal.getZ(i));assert.ok(Number.isFinite(n)&&Math.abs(n-1)<2e-5);}
 for(const v of [0,3,6,9]){
  const i=v*25,radial=new THREE.Vector3(position.getX(i)-1,position.getY(i),position.getZ(i));
  assert.ok(radial.dot(new THREE.Vector3(normal.getX(i),normal.getY(i),normal.getZ(i)))>0,'Liquid tube normals face inside the jet');
 }
});
test('foam advection uses physical elapsed time at stopped and accelerated lifecycle rates',async()=>{
 const {createFluidSurface,createFluidFoam}=await import('../src/acryllex/models/fluid-surface.ts');
 const surface=createFluidSurface({uSegments:8,vSegments:8,flipNormals:true,sample:(u,v,t,out)=>out.set(u,0,v)}),material=new THREE.MeshStandardMaterial();
 for(const speed of [0,.5,4]){
  const clocks=[],foam=createFluidFoam({surface,count:1,seed:32,material,speed,lifetime:2,normalOffset:0,size:.03,seedUV:(_seed,out)=>out.set(.2,.3),flow:(_u,_v,t,out)=>{clocks.push(t);out.set(.1,-.05);}});
  foam.update(.7);const matrix=new THREE.Matrix4();foam.mesh.getMatrixAt(0,matrix);const p=new THREE.Vector3(),q=new THREE.Quaternion(),scale=new THREE.Vector3();matrix.decompose(p,q,scale);assert.ok(scale.length()>0,'A stopped lifecycle should retain visible seeded foam');
  const elapsed=clocks.length ? .7-Math.min(...clocks) : 0;
  assert.ok(Math.abs(p.x-(.2+.1*elapsed))<1e-6);assert.ok(Math.abs(p.z-(.3-.05*elapsed))<1e-6);
  assert.ok(clocks.every(t=>t<=.7));if(speed===0)assert.ok(clocks.every(t=>t===.7));
  foam.dispose();
 }
 surface.dispose();material.dispose();
});
test('water optics preserves authored fluid geometry and releases owned environment textures',async()=>{
 const {fluidSheet,fluidJet}=await import('../src/acryllex/models/fluids.ts');
 for(const model of [fluidSheet,fluidJet]){
  const params={uSegments:16,vSegments:8,foamCount:0,amplitude:.04},opaque=model.build(modelContext(params)),water=model.build(modelContext({...params,material:'water',opticalThickness:1.2,rippleAmplitude:.006}));
  opaque.update({flow:1},.7);water.update({flow:1},.7);
  const name=model===fluidSheet?'fluid-sheet-surface':'fluid-jet-surface',a=opaque.root.getObjectByName(name),b=water.root.getObjectByName(name);
  assert.deepEqual(b.geometry.attributes.position.array,a.geometry.attributes.position.array);
  assert.deepEqual(b.geometry.attributes.normal.array,a.geometry.attributes.normal.array);
  assert.ok(b.material.isMeshPhysicalMaterial);assert.equal(b.material.metalness,0);assert.equal(b.material.ior,1.333);assert.equal(b.material.thickness,1.2);
  assert.equal(b.castShadow,false);assert.equal(b.receiveShadow,true);
  const shader={uniforms:{},vertexShader:'#include <worldpos_vertex>',fragmentShader:'#include <normal_fragment_maps>'};b.material.onBeforeCompile(shader,null);
  assert.equal(shader.uniforms.waterOpticsTime.value,.7);water.update({flow:1},1.3);water.update({flow:1},.7);assert.equal(shader.uniforms.waterOpticsTime.value,.7);
  let released=0;b.material.envMap.addEventListener('dispose',()=>released++);b.material.dispose();b.material.dispose();assert.equal(released,1);
  for(const instance of [opaque,water])instance.root.traverse(o=>{if(o.isInstancedMesh)o.dispose();o.geometry?.dispose();if(o.material)for(const material of Array.isArray(o.material)?o.material:[o.material])material.dispose();});
 }
});
test('rounded geometry keeps the specified bounds even for thin lids',async()=>{
 const {G}=await import('../src/acryllex/kit.ts');const g=G.rbox(.32,.21,.006,.004);g.computeBoundingBox();
 const size=g.boundingBox.getSize(new THREE.Vector3());for(const [actual,expected] of [[size.x,.32],[size.y,.21],[size.z,.006]])assert.ok(Math.abs(actual-expected)<1e-6);
 g.dispose();
});
test('connected maze chunks preserve the assembled geometry',async()=>{
 const {maze}=await import('../src/acryllex/models/reference.ts');
 const build=chunkSize=>maze.build(modelContext({chunkSize}));
 const single=build(1),chunks=build(4);
 single.update({build:1,scatter:0},0);chunks.update({build:1,scatter:.6},.5);chunks.update({build:1,scatter:0},1);
 single.root.updateMatrixWorld(true);chunks.root.updateMatrixWorld(true);
 const a=single.root.children,b=chunks.root.children;assert.equal(a.length,b.length);
 for(let i=0;i<a.length;i++){
  assert.deepEqual(a[i].geometry.attributes.position.array,b[i].geometry.attributes.position.array);
  a[i].matrixWorld.elements.forEach((v,j)=>assert.ok(Math.abs(v-b[i].matrixWorld.elements[j])<1e-12));
 }
});
test('skyline reflections follow their building opacity and visibility',async()=>{
 const {skyline}=await import('../src/acryllex/models/reference.ts');
 const params={buildings:[{x:0,width:1,height:2,depth:.5,fillDelay:0,fillSpeed:1}]};
 const city=skyline.build(modelContext(params));
 const source=city.root.getObjectByName('building-0'),mirror=city.root.getObjectByName('reflection').getObjectByName('building-0');
 const materials=g=>{const out=[];g.traverse(o=>{if(o.isMesh)out.push(o.material.opacity);});return out;};
 for(const solid of [0,.3,.8,0]){
  city.update({build:1,solid},0);
  assert.deepEqual(materials(mirror),materials(source));
  assert.deepEqual(mirror.children.map(g=>g.visible),source.children.map(g=>g.visible));
 }
});
test('abacus supports both bead banks and counts digits without intersecting beads',async()=>{
 const {abacus}=await import('../src/acryllex/models/reference.ts');
 const built=abacus.build(modelContext({rods:3,upperBeads:2,lowerBeads:5,beadHeight:.019,beadGap:.003,digits:[0,5,9]}));
 const beads=built.root.children.filter(m=>/^rod-\d+-(upper|lower)-/.test(m.name));assert.equal(beads.length,21);
 const resting=()=>beads.map(m=>m.position.y);
 built.update({count:0},0);const initial=resting();built.update({count:1},1);
 const changed=beads.filter((m,i)=>Math.abs(m.position.y-initial[i])>1e-9);
 assert.equal(changed.length,6);assert.ok(changed.every(m=>!m.name.startsWith('rod-0-')));
 for(let rod=0;rod<3;rod++)for(const bank of ['upper','lower']){
  const y=beads.filter(m=>m.name.startsWith(`rod-${rod}-${bank}-`)).map(m=>m.position.y).sort((a,b)=>a-b);
  y.slice(1).forEach((v,i)=>assert.ok(v-y[i]>=.019-1e-6,'Beads overlap after counting'));
 }
 built.update({count:0},0);assert.deepEqual(resting(),initial,'Counting retains old bead positions on reverse seek');
});
test('calculator top rim and display inset preserve the remaining housing and digits',async()=>{
 const {calculator}=await import('../src/acryllex/models/reference.ts');
 const params={height:.2,rimTone:.55},base=calculator.build(modelContext(params));
 const explicit=calculator.build(modelContext({...params,topRimTone:.55,displayTopInset:0}));
 const fitted=calculator.build(modelContext({...params,topRimTone:1,displayTopInset:.008}));
 assert.equal(base.root.children.length,fitted.root.children.length);
 for(let i=0;i<base.root.children.length;i++){
  const a=base.root.children[i],b=explicit.root.children[i],c=fitted.root.children[i];
  assert.deepEqual(a.geometry.attributes.position.array,b.geometry.attributes.position.array,'Explicit defaults move geometry');
  assert.equal(b.material.vertexColors,false,'Default top rim enables vertex colors');
  if(i!==4)assert.deepEqual(a.geometry.attributes.position.array,c.geometry.attributes.position.array,'Local display edit moves other geometry');
  if(i!==1)assert.equal(c.geometry.getAttribute('color'),undefined,'Top rim tint leaks to another part');
 }
 const rim=fitted.root.children[1].geometry,positions=rim.getAttribute('position'),colors=rim.getAttribute('color');let bright=0,plain=0;
 for(let i=0;i<positions.count;i++){
  const gain=colors.getX(i);assert.ok(Math.abs(gain-1)<1e-6||Math.abs(gain-1/.55)<1e-6);
  assert.equal(colors.getY(i),gain);assert.equal(colors.getZ(i),gain);
  if(gain>1){bright++;assert.ok(positions.getY(i)>=.088-1e-6,'Top rim tint reaches the side or bottom');}else plain++;
 }
 assert.ok(bright>0&&plain>0,'Local rim tint fails to distinguish the top bar');
 const displayBounds=b=>{const g=b.root.children[4].geometry;g.computeBoundingBox();return g.boundingBox;};
 const before=displayBounds(base),after=displayBounds(fitted);
 assert.ok(Math.abs(before.min.y-after.min.y)<1e-7,'Inset moves the LCD bottom edge');
 assert.ok(Math.abs(before.max.y-after.max.y-.008)<1e-7,'Inset does not lower the LCD top edge');
});
test('absolute animation tracks allow independent channels, full turns, and reverse seeking',async()=>{
 const {sampleObjectTrack}=await import('../src/acryllex/keyframes.ts');
 const initial={pos:[0,0,0],rot:[0,0,0],scale:1};
 const keys=[{at:1,pos:[2,0,0],easing:'linear'},{at:2,rot:[0,360,0],easing:'linear'},{at:3,pos:[5,0,0],scale:2,easing:'hold'}];
 const before=sampleObjectTrack(keys,.5,initial);sampleObjectTrack(keys,2.9,initial);
 assert.deepEqual(sampleObjectTrack(keys,.5,initial),before);
 assert.deepEqual(before.pos,[1,0,0]);assert.deepEqual(sampleObjectTrack(keys,1,initial).rot,[0,180,0]);
 assert.deepEqual(sampleObjectTrack(keys,2.9,initial).pos,[2,0,0]);assert.equal(sampleObjectTrack(keys,3,initial).scale,2);
 assert.deepEqual(initial,{pos:[0,0,0],rot:[0,0,0],scale:1});
});
test('text count tracks reveal complete prefixes, irregular suffixes and explicit deletion',async()=>{
 const {sampleTextReveal,sampleTextLayout}=await import('../src/acryllex/keyframes.ts');
 const reveal=[[.4,2],[.67,3],[.8,4],[1,6],[2.2,5],[2.4,0]],copy=structuredClone(reveal);
 assert.equal(sampleTextReveal(reveal,.399,6).shown,0);
 assert.equal(sampleTextReveal(reveal,.4,6).shown,2);
 assert.equal(sampleTextReveal(reveal,.79,6).shown,3);
 assert.deepEqual(sampleTextReveal(reveal,1.5,6),{shown:6,typingDone:1,deleteStart:2.2,deleting:false});
 assert.equal(sampleTextReveal(reveal,2.3,6).shown,5);assert.equal(sampleTextReveal(reveal,2.3,6).deleting,true);
 sampleTextReveal(reveal,3,6);assert.equal(sampleTextReveal(reveal,.4,6).shown,2);assert.deepEqual(reveal,copy);
 const keys=[{at:.8,zoom:3.5,easing:'hold'},{at:1,pos:[1.49,.48],easing:'hold'},{at:1.2,pos:[.94,.27],zoom:1,easing:'hold'}];
 const initial={pos:[.94,.27],zoom:1};assert.deepEqual(sampleTextLayout(keys,.79,initial),initial);
 assert.deepEqual(sampleTextLayout(keys,.9,initial),{pos:[.94,.27],zoom:3.5});
 assert.deepEqual(sampleTextLayout(keys,1,initial),{pos:[1.49,.48],zoom:3.5});
 assert.deepEqual(sampleTextLayout(keys,1.2,initial),initial);
 assert.deepEqual(sampleTextLayout([{at:1,pos:[1,1],zoom:3,easing:'linear'}],.5,{pos:[0,0],zoom:1}),{pos:[.5,.5],zoom:2});
});
test('thin desk controls retain the top surface and connect its apron and column',async()=>{
 const {officeDesk}=await import('../src/acryllex/models/reference.ts');
 const base=officeDesk.build(modelContext({})),defaults=officeDesk.build(modelContext({topThickness:.045,apronHeight:.03}));
 base.root.children.forEach((mesh,i)=>assert.deepEqual(mesh.geometry.attributes.position.array,defaults.root.children[i].geometry.attributes.position.array));
 const thin=officeDesk.build(modelContext({topThickness:.016,apronHeight:.012}));
 const bounds=i=>{const g=thin.root.children[i].geometry;g.computeBoundingBox();return g.boundingBox;};
 assert.ok(Math.abs(bounds(0).max.y-.74)<1e-6);
 assert.ok(Math.abs(bounds(0).min.y-bounds(1).max.y)<1e-6);
 assert.ok(Math.abs(bounds(1).min.y-bounds(2).max.y)<1e-6);
 assert.ok(Math.abs(bounds(0).max.y-bounds(0).min.y-.016)<1e-6);
});
test('the reference recreation uses the same strict schema as produced reels',async()=>{
 const {specSchema}=await import('../src/acryllex/schema.ts');
 const reference=JSON.parse(await readFile(new URL('./acryllex/fixtures/reference-recreation.json',import.meta.url),'utf8'));
 const result=specSchema.safeParse(reference);assert.ok(result.success,JSON.stringify(result.error?.issues));
 assert.ok(reference.scenes.every(s=>s.objects.every(o=>o.model!=='footage')),'Reference pixels must not be the recreation source');
});

test('head albedo correction preserves skin geometry and instance isolation',async()=>{
 const {tintHeadAlbedo}=await import('../src/acryllex/models/person.ts');
const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0,0,0,1],3));geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute([0,2,2,2,1,2,2,2,2,2,2,2,1,2,2,2],4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute([1,0,0,0,.5,.5,0,0,1,0,0,0,.25,.75,0,0],4));
const bones=['mixamorig:Head','mixamorig:Neck','mixamorig:Spine2'].map(name=>{const b=new THREE.Bone();b.name=name;return b});
const a=new THREE.SkinnedMesh(geometry,new THREE.MeshStandardMaterial()),b=new THREE.SkinnedMesh(geometry,new THREE.MeshStandardMaterial());a.bind(new THREE.Skeleton(bones));b.bind(new THREE.Skeleton(bones.map(x=>x.clone())));
const positions=geometry.getAttribute('position').array.slice(),weights=geometry.getAttribute('skinWeight').array.slice(),oldVersion=b.material.version;
tintHeadAlbedo(b,1);assert.equal(b.geometry,geometry,'Default tone clones geometry');assert.equal(b.material.version,oldVersion,'Default tone changes the material');assert.equal(b.material.vertexColors,false,'Default tone enables vertex colors');
tintHeadAlbedo(a,.55);assert.notEqual(a.geometry,geometry,'Tint mutates a cached geometry');assert.equal(b.geometry,geometry,'Tint replaces another instance geometry');assert.equal(geometry.getAttribute('color'),undefined,'Tint adds colors to the source geometry');assert.equal(b.material.vertexColors,false,'Tint changes another instance material');assert.equal(a.material.vertexColors,true,'Tint does not enable per-vertex albedo');assert.deepEqual(a.geometry.getAttribute('position').array,positions,'Tint changes vertex positions');assert.deepEqual(a.geometry.getAttribute('skinWeight').array,weights,'Tint changes skin weights');
const colors=a.geometry.getAttribute('color');for(const [i,expected] of [ .55,.775,1,.8875].entries())for(let j=0;j<3;j++)assert.ok(Math.abs(colors.getComponent(i,j)-expected)<1e-6,'Head/neck bone weights do not blend gray albedo correctly');

});
test('object effects validate, play and add sound cues',async()=>{
 const {specSchema,specProblems}=await import('../src/acryllex/schema.ts');const {autoCues}=await import('../src/acryllex/cues.ts');const {fxPose,FX_KINDS}=await import('../src/acryllex/effects.ts');
 const s=structuredClone(spec);s.scenes[0].events=[{at:'seven',target:'a',fx:'heartbeat',fxCount:2},{at:'ten',target:'a',fx:'shockwave',fxFrom:'top',fxAmount:1.5}];
 assert.ok(specSchema.safeParse(s).success);assert.deepEqual(specProblems(s),[]);
 const bad=structuredClone(s);bad.scenes[0].events[0].fx='explode';assert.ok(!specSchema.safeParse(bad).success);
 const cues=autoCues(s);assert.equal(cues.filter(c=>c.kind==='heartbeat').length,2);assert.ok(cues.some(c=>c.kind==='shockwave'));
 for(const kind of FX_KINDS){const track=[{kind,t0:0,t1:1,from:'front',amount:1,count:1}];const after=fxPose(track,1.2,1);assert.deepEqual(after.scale.toArray(),[1,1,1]);assert.deepEqual(after.pos.toArray(),[0,0,0]);}
 const beat=fxPose([{kind:'heartbeat',t0:0,t1:.9,from:'front',amount:1,count:1}],.08,1);assert.ok(beat.scale.x>1.1);
});
test('darkness entrances, exits and scene transitions validate and cue sound',async()=>{
 const {specSchema}=await import('../src/acryllex/schema.ts');const {autoCues}=await import('../src/acryllex/cues.ts');const {fxReveal,fxUniforms,REVEAL_KINDS}=await import('../src/acryllex/effects.ts');
 const s=structuredClone(spec);s.scenes[0].objects[0].enter='from-black';s.scenes[0].objects[0].exit='to-black';s.scenes[1].transition='black';s.scenes[1].transitionDur=1;s.scenes[2].transition='push-right';s.scenes[3].transition='glitch';
 assert.ok(specSchema.safeParse(s).success);
 const bad=structuredClone(s);bad.scenes[1].transition='fade-to-pink';assert.ok(!specSchema.safeParse(bad).success);
 const cues=autoCues(s);assert.ok(cues.some(c=>c.kind==='glitch'&&c.why.includes('transition')));assert.ok(cues.some(c=>c.kind==='dissolve'));
 const box=new THREE.Box3(new THREE.Vector3(-1,0,-1),new THREE.Vector3(1,2,1));
 for(const kind of REVEAL_KINDS){const u=fxUniforms();assert.ok(fxReveal(kind,.5,u,box),kind);}
 const u=fxUniforms();fxReveal('from-black',0,u,box);assert.equal(u.uFxDim.value,0);fxReveal('to-black',0,fxUniforms(),box);
});
test('morph styles validate, hand over cleanly and cue sound',async()=>{
 const {specSchema}=await import('../src/acryllex/schema.ts');const {autoCues}=await import('../src/acryllex/cues.ts');const {morphPose,MORPH_STYLES,densify}=await import('../src/acryllex/effects.ts');
 const s=structuredClone(spec);s.scenes[0].objects.push({id:'b',model:'led',enter:'none'});s.scenes[0].events=[{at:'seven',target:'a',morph:'b',morphStyle:'blob'}];
 assert.ok(specSchema.safeParse(s).success);const bad=structuredClone(s);bad.scenes[0].events[0].morphStyle='melt';assert.ok(!specSchema.safeParse(bad).success);
 const cues=autoCues(s);assert.ok(cues.some(c=>c.kind==='ripple'&&c.why.includes('blob')));
 for(const style of MORPH_STYLES.filter(x=>x!=='particles')){assert.ok(morphPose(style,0.02,false).visible,style);assert.ok(morphPose(style,0.98,true).visible,style);assert.ok(!(morphPose(style,0.5,false).visible&&morphPose(style,0.5,true).visible)||style==='fade',style);}
 const m=new THREE.Mesh(new THREE.BoxGeometry(1,1,1));densify([m]);assert.ok(m.geometry.attributes.position.count>200);
});
test('removed effects, entrances, transitions and morph styles are rejected',async()=>{
 const {specSchema}=await import('../src/acryllex/schema.ts');
 const tryScene=f=>{const s=structuredClone(spec);f(s.scenes[1]);return specSchema.safeParse(s).success;};
 for(const fx of ['squash','hop','flicker'])assert.ok(!tryScene(sc=>{sc.events=[{at:'seven',target:'a',fx}];}),fx);
 for(const enter of ['scan-in','ping'])assert.ok(!tryScene(sc=>{sc.objects[0].enter=enter;}),enter);
 for(const exit of ['scan-out','ping-out'])assert.ok(!tryScene(sc=>{sc.objects[0].exit=exit;}),exit);
 for(const tr of ['iris','blinds','push-left','push-up','dissolve'])assert.ok(!tryScene(sc=>{sc.transition=tr;}),tr);
 for(const morphStyle of ['implode','scan'])assert.ok(!tryScene(sc=>{sc.objects.push({id:'b',model:'led',enter:'none'});sc.events=[{at:'seven',target:'a',morph:'b',morphStyle}];}),morphStyle);
});

test('male and female rigs preserve proportions, posed skin and independent material controls',async()=>{const {verifyHumanRigs}=await import('./acryllex/verify-human-rig.mjs');const result=await verifyHumanRigs();assert.equal(result.passed,16);});
