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
test('catalogue has people, core objects and real scans',async()=>{const c=await loadCatalog();for(const id of ['human','led','brain','earth','heart','alarm_clock_01'])assert.ok(c.has(id),id);assert.ok(!c.has('definitely-not-a-model'));assert.ok(c.ids.length>100);});
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
 const bad=structuredClone(spec);bad.scenes[0].objects[0].model='nope';bad.scenes[1].events[0].at='zebra';const p=specProblems(bad,c.has);assert.ok(p.some(x=>x.includes('unknown model')));assert.ok(p.some(x=>x.includes('zebra')));});
test('automatic sound cues follow the picture',async()=>{const {autoCues}=await import('../src/acryllex/cues.ts');const cues=autoCues(spec);assert.ok(cues.some(c=>c.kind==='assemble'));assert.ok(cues.some(c=>c.kind==='power-on'));assert.ok(cues.every((c,i)=>i===0||c.at>=cues[i-1].at));});
test('acryllex is a separate seeded account on Sol medium',async()=>{const {ACRYLLEX_POLICY}=await import('../worker/acryllex-policy.ts');assert.equal(ACRYLLEX_POLICY.models.all,'gpt-6.1-sol');assert.equal(ACRYLLEX_POLICY.models.effort,'medium');});
test('fractional dots preserve video dimensions and aspect ratio',async()=>{
 const f=await import('../src/acryllex/format.ts');f.setFormat({width:1164,height:670,cell:3.72});
 assert.equal(f.W,1164);assert.equal(f.H,670);assert.equal(f.CELL,3.72);
 assert.ok(f.COLS*f.CELL>=f.W);assert.ok(f.ROWS*f.CELL>=f.H);f.setFormat();
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
