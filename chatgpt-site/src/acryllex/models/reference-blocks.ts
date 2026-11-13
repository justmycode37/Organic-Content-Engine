import * as THREE from 'three';
import {G,deg,clamp,rng,ease} from '../kit.ts';
import {defineModel} from './types.ts';
type V3=[number,number,number];
type LayoutBlock={position:V3;size:V3;rotation?:V3;tone?:number;burst?:V3};
const vector=(value:unknown):value is V3=>Array.isArray(value)&&value.length===3&&value.every(v=>typeof v==='number'&&Number.isFinite(v));
const layoutBlock=(value:unknown):value is LayoutBlock=>{
 if(!value||typeof value!=='object')return false;
 const b=value as LayoutBlock;
 return vector(b.position)&&vector(b.size)&&b.size.every(v=>v>0)&&(!b.rotation||vector(b.rotation))&&(!b.burst||vector(b.burst))&&(b.tone===undefined||Number.isFinite(b.tone));
};

// ================================================================= abstract block cluster
export const blockCluster=defineModel({
 id:'block-cluster',aliases:['cube-cluster','voxel-cluster','abstract-blocks','possibilities','structure'],
 describe:'An abstract sculpture of interlocking rectangular blocks and beams bursting out from a dense core. Optional blockLayout authors the actual three-dimensional scaffold as boxes, each with position, size, optional rotation in degrees, tone and burst offset. `burst` 0..1 expands the sculpture from its compact state.',
 controls:{burst:'0 compact cube .. 1 full cluster (default 1)'},defaults:{burst:1},
 params:{count:'procedural blocks 12..160 (default 34)',blockLayout:'optional array of {position:[x,y,z],size:[w,h,d],rotation?:[x,y,z] degrees,tone?:0..1,burst?:[x,y,z]}; replaces procedural blocks',compact:'position scale at burst 0, 0..1 (default .25)',roughness:'surface roughness .05..1 (default .4)'},size:'1.6 m',
 build(ctx){
  const root=new THREE.Group();const r=rng(ctx.seed+5);const n=Math.round(ctx.num('count',34,12,160));
  const items:{m:THREE.Mesh;to:THREE.Vector3;from:THREE.Vector3}[]=[];
  const compact=ctx.num('compact',0.25,0,1),rough=ctx.num('roughness',0.4,0.05,1);
  const authored=Array.isArray(ctx.params.blockLayout)?ctx.params.blockLayout.filter(layoutBlock).slice(0,300):[];
  const add=(b:LayoutBlock)=>{
   const to=new THREE.Vector3(...b.position),from=b.burst?to.clone().sub(new THREE.Vector3(...b.burst)):to.clone().multiplyScalar(compact);
   const m=ctx.mesh(G.box(...b.size),{tone:clamp(b.tone??1,0,1),rough});
   m.position.copy(to);if(b.rotation)m.rotation.set(...b.rotation.map(deg) as V3);
   root.add(m);items.push({m,to,from});
  };
  if(authored.length)for(const b of authored)add(b);
  else for(let i=0;i<n;i++){
   const axis=Math.floor(r()*3),long=r()<0.5,a=0.08+r()*0.18,b=0.08+r()*0.18,L=long?0.5+r()*0.6:0.14+r()*0.26;
   const size:V3=axis===0?[L,a,b]:axis===1?[a,L,b]:[a,b,L];
   const q=0.07,dir=new THREE.Vector3(r()-0.5,r()-0.5,r()-0.5).normalize(),dist=Math.pow(r(),0.55)*0.72;
   const position:V3=[Math.round(dir.x*dist/q)*q,Math.round(dir.y*dist/q)*q,Math.round(dir.z*dist/q)*q];
   add({size,position,tone:0.7+r()*0.3});
  }
  return {root,grounded:false,update(c){const k=ease.inOut(clamp(c.burst??1));for(const it of items)it.m.position.lerpVectors(it.from,it.to,k);}};
 },
});
