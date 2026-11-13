// Offline checks against the bundled male/female skins. No browser, stock downloads or source footage is needed.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import * as THREE from 'three';
import {preloadAssets} from '../../src/acryllex/assets.ts';
import {buildPerson} from '../../src/acryllex/models/realistic-person.ts';
import {applyOffsets,emptyPose} from '../../src/acryllex/models/human-motion.ts';

export async function verifyHumanRigs(){
const originalFetch=globalThis.fetch,originalProgress=globalThis.ProgressEvent,checks=[];
const male=await readFile(new URL('../../src/acryllex/assets/humans/human-male.glb',import.meta.url));
const female=await readFile(new URL('../../src/acryllex/assets/humans/human-female.glb',import.meta.url));
globalThis.ProgressEvent??=class extends Event{constructor(type,values){super(type);Object.assign(this,values);}};
globalThis.fetch=async input=>{
 const url=typeof input==='string'?input:input.url;
 const bytes=url.endsWith('/male.glb')?male:url.endsWith('/female.glb')?female:null;
 assert.ok(bytes,`Unexpected external request ${url}`);
 return new Response(bytes,{headers:{'Content-Type':'model/gltf-binary','Content-Length':String(bytes.length)}});
};
function ctx(params){
 const mat=(opts={})=>new THREE.MeshStandardMaterial({color:new THREE.Color().setScalar(opts.tone??1)});
 return{params,seed:33,mat,mesh:(g,o)=>new THREE.Mesh(g,mat(o)),color:()=>new THREE.Color(1,1,1),num:(k,f,min=-Infinity,max=Infinity)=>Math.max(min,Math.min(max,params[k]===undefined?f:Number(params[k]))),bool:(k,f)=>typeof params[k]==='boolean'?params[k]:f,str:(k,f,allowed)=>typeof params[k]==='string'&&(!allowed||allowed.includes(params[k]))?params[k]:f};
}
function body(id,params={}){const p=buildPerson(ctx({height:id==='human-male'?1.8:1.65,...params}),{asset:id,sex:id==='human-male'?'male':'female'});assert.ok(p?.rig);return p;}
function skinPoints(p){p.root.updateMatrixWorld(true);const out=[];p.root.traverse(o=>{if(!o.isSkinnedMesh||!o.visible)return;o.skeleton.update();const v=new THREE.Vector3(),a=o.geometry.getAttribute('position');for(let i=0;i<a.count;i+=13){o.getVertexPosition(i,v).applyMatrix4(o.matrixWorld);out.push(v.x,v.y,v.z);}});return out;}
function footMinimum(p){p.root.updateMatrixWorld(true);let low=Infinity;const v=new THREE.Vector3();p.root.traverse(o=>{if(!o.isSkinnedMesh||!o.visible)return;const idx=o.geometry.getAttribute('skinIndex'),w=o.geometry.getAttribute('skinWeight'),foot=new Set(o.skeleton.bones.flatMap((b,i)=>/^(Left|Right)(Foot|ToeBase|Toe_End)$/.test(b.name.replace(/^mixamorig\d*:?/,''))?[i]:[]));for(let i=0;i<idx.count;i++){let f=0;for(let j=0;j<4;j++)if(foot.has(idx.getComponent(i,j)))f+=w.getComponent(i,j);if(f>.7)low=Math.min(low,o.getVertexPosition(i,v).applyMatrix4(o.matrixWorld).y);}});return low;}
function eyeBounds(p){p.root.updateMatrixWorld(true);const box=new THREE.Box3(),v=new THREE.Vector3();p.root.traverse(o=>{if(!o.isSkinnedMesh||o.name!=='Eyes')return;o.skeleton.update();for(let i=0;i<o.geometry.getAttribute('position').count;i++)box.expandByPoint(o.getVertexPosition(i,v).applyMatrix4(o.matrixWorld));});return box.getSize(new THREE.Vector3());}
function visibleHeadTop(p){p.root.updateMatrixWorld(true);let top=-Infinity;const v=new THREE.Vector3();p.root.traverse(o=>{if(!o.isSkinnedMesh)return;for(let a=o;a;a=a.parent)if(!a.visible)return;const idx=o.geometry.getAttribute('skinIndex'),w=o.geometry.getAttribute('skinWeight'),head=new Set(o.skeleton.bones.flatMap((b,i)=>/^(Head|HeadTop_End)$/.test(b.name.replace(/^mixamorig\d*:?/,''))?[i]:[]));o.skeleton.update();for(let i=0;i<idx.count;i++){let f=0;for(let j=0;j<4;j++)if(head.has(idx.getComponent(i,j)))f+=w.getComponent(i,j);if(f>.7)top=Math.max(top,o.getVertexPosition(i,v).applyMatrix4(o.matrixWorld).y);}});return top;}
try{
 await preloadAssets({'human-male':'test/male.glb','human-female':'test/female.glb','human-xbot':'test/male.glb'});
 globalThis.fetch=originalFetch;
 for(const id of ['human-male','human-female']){
  const normal=body(id),scaled=body(id,{headScale:1.12,foot:.9});
  const regions=body(id,{headTone:.55,regionTones:{torso:1.15,pelvis:.85,legs:.8}}),unity=body(id,{regionTones:{torso:1,pelvis:1,legs:1}}),albedo=[];
  assert.deepEqual(skinPoints(regions),skinPoints(normal),'Material regions must not alter the actual skin');
  assert.deepEqual(skinPoints(unity),skinPoints(normal));
  regions.root.traverse(o=>{if(!o.isSkinnedMesh)return;const c=o.geometry.getAttribute('color');assert.ok(c);albedo.push(...c.array);if(o.name==='Eyes')for(const v of c.array)assert.ok(Math.abs(v-.55)<1e-5,'Region controls must preserve the existing head tint');});
  assert.ok(albedo.some(v=>v>1.05)&&albedo.some(v=>v<.85),'Region controls must brighten and darken real vertex albedo');
  assert.ok(albedo.every(Number.isFinite));
  for(const p of [normal,unity])p.root.traverse(o=>{if(o.isSkinnedMesh)assert.equal(o.geometry.getAttribute('color'),undefined,'Unity/default regions must leave shared albedo untouched');});
  checks.push(id+': material regions affect independent albedo, preserve head tint and keep skin/default geometry unchanged');
  assert.ok(Math.abs(scaled.rig.nodes[scaled.rig.need('Head')].o.scale.x/normal.rig.nodes[normal.rig.need('Head')].o.scale.x-1.12)<1e-7);
  for(const side of ['Left','Right'])assert.ok(Math.abs(scaled.rig.nodes[scaled.rig.need(side+'Foot')].o.scale.x-.9)<1e-7);
  const a=eyeBounds(normal),b=eyeBounds(scaled);for(const key of ['x','y','z'])assert.ok(Math.abs(b[key]/a[key]-1.12)<1e-4,'Uniform head control must alter the actual eye skin, not just a stored parameter');
  checks.push(id+': uniform head/foot controls survive bind initialization and affect the actual skin');
  assert.ok(scaled.rig.point('headTop').y>normal.rig.point('headTop').y);
  assert.ok(scaled.rig.ankleHeight('Right')<normal.rig.ankleHeight('Right'));
  assert.ok(Math.abs(normal.root.localToWorld(normal.rig.point('headTop')).y-visibleHeadTop(normal))<.004,'Invisible hair guides must not enlarge the visible head anchor');
  checks.push(id+': skin-derived head and sole anchors follow proportions and exclude invisible hair guides');
  for(const trackFloor of [false,true]){const g=body(id,{ground:!trackFloor}),floor=Math.min(g.rig.point('LeftSole').y,g.rig.point('RightSole').y);g.setTrack({units:'metres',keys:[{t:0,hips:{pos:[0,.5,0]},footL:{pos:[.1,floor-.12,.2],rot:[0,0,0]},footR:{pos:[-.1,floor-.12,.2],rot:[0,0,0]},...(trackFloor?{floor,floorWeight:1}:{})}]});g.update({},.6,{from:'sit',to:'sit',k:1,time:.6,travel:0,speed:0});const low=footMinimum(g);assert.ok(low>=floor-.003&&low<floor+.012,JSON.stringify({id,trackFloor,floor,low}));}checks.push(id+': static and track-plane grounding keep actual skinned soles on their measured floor');
  const untouched=skinPoints(normal);
  function pose(angle,curl){
   scaled.rig.reset();scaled.rig.applyPose(emptyPose());applyOffsets(scaled.rig,{spine:[angle,0,0],elL:[-55,0,0],hipR:[-65,0,0],knR:[70,0,0]},undefined,0);
   scaled.rig.fingerCurl.Left=scaled.rig.fingerCurl.Right=curl*Math.PI/180;scaled.rig.write();scaled.root.updateMatrixWorld(true);
   for(const node of scaled.rig.nodes){if(!node.o.isBone)continue;const actual=node.o.getWorldPosition(new THREE.Vector3()),expected=scaled.root.localToWorld(scaled.rig.P[scaled.rig.nodes.indexOf(node)].clone());assert.ok(actual.distanceTo(expected)<1e-4,`${id} ${node.name}: measured joint differs from the real bone`);
    const m=node.o.matrixWorld.elements,x=new THREE.Vector3(m[0],m[1],m[2]),y=new THREE.Vector3(m[4],m[5],m[6]),z=new THREE.Vector3(m[8],m[9],m[10]),norm=[x.length(),y.length(),z.length()];assert.ok(Math.max(...norm)/Math.min(...norm)<1.0001,'Posing introduced anisotropic scale');assert.ok(Math.abs(x.normalize().dot(y.normalize()))<1e-4&&Math.abs(x.dot(z.normalize()))<1e-4,'Posing introduced shear');
   }
   for(const side of ['Left','Right'])for(const[a,b,expected]of [['Arm','ForeArm',scaled.rig.length.upperArm],['ForeArm','Hand',scaled.rig.length.foreArm],['UpLeg','Leg',scaled.rig.length.thigh],['Leg','Foot',scaled.rig.length.shin]])assert.ok(Math.abs(scaled.rig.pos(side+a).distanceTo(scaled.rig.pos(side+b))-expected)<.005,'A pose stretched an arm or leg');
   return skinPoints(scaled);
  }
  const first=pose(25,18);pose(60,55);assert.deepEqual(pose(25,18),first,'Reverse posing changes the deformed skin');
  checks.push(id+': flexed spine/limbs/fingers have fixed segment lengths, orthogonal scales and real measured joints');
  checks.push(id+': reverse posing reproduces the actual deformed skin');
  assert.deepEqual(skinPoints(normal),untouched,'One posed instance changed another body');
  checks.push(id+': separate instances retain their original skin');
  scaled.rig.reset();scaled.rig.applyPose(emptyPose());scaled.rig.solve();const target=scaled.rig.pos('RightArm').clone().add(new THREE.Vector3(0,-.22,.17));scaled.rig.ik('Right','arm',target,{pole:target.clone().add(new THREE.Vector3(0,-.2,-.15))});scaled.rig.write();assert.ok(scaled.rig.pos('RightHand').distanceTo(target)<.001,JSON.stringify({id,error:scaled.rig.pos('RightHand').distanceTo(target),target:target.toArray(),actual:scaled.rig.pos('RightHand').toArray()}));checks.push(id+': reachable IK target is met within1mm with fixed arm lengths');
 }
 return {passed:checks.length,checks};
}finally{globalThis.fetch=originalFetch;if(originalProgress===undefined)delete globalThis.ProgressEvent;else globalThis.ProgressEvent=originalProgress;}
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await verifyHumanRigs(),null,2));
