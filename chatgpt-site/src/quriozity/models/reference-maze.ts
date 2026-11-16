import * as THREE from 'three';
import {G,clamp,rng,ease} from '../kit.ts';
import {defineModel} from './types.ts';

// ================================================================= maze
export const maze=defineModel({
 id:'maze',aliases:['labyrinth','puzzle-maze','workflow-maze','complex-system'],
 describe:'A 3D hedge-style block maze seen from above at an angle: thick walls with winding corridors, plus loose blocks jutting out around its edges. `build` 0..1 raises the walls in a wave; `scatter` 0..1 breaks it into floating blocks.',
 controls:{build:'0..1 walls rise (default 1)',scatter:'0..1 blocks drift apart',height:'wall extrusion multiplier .1..8 (default 1)',compact:'0..1 draws the loose perimeter columns into the walls'},defaults:{build:1,height:1,compact:0},params:{size:'cells per side 4..15 (default 6)',layout:'optional odd square array of strings: # wall, . passage',wallHeight:'wall height divided by cell width (default 1.4)',wallHeightMeters:'optional absolute wall extrusion in model metres, independent of layout resolution',loose:'loose perimeter block count (default 16)',looseBlocks:'optional blocks {pos:[x,y,z],size:[width,height,depth]} in model coordinates; replaces random loose blocks',faceShading:'true gives clean authored top and side shading (default false)',topTone:'top face brightness 0..1 (default 1)',sideTone:'vertical face brightness 0..1 (default .45)',heightSpread:'0..1 variation in connected chunk extrusion during the height reveal (default 0)',chunkSize:'connected wall blocks per moving chunk 1..64 (default 1)',scatterRotation:'rotation during scatter 0..2 (default 1)'},size:'2 m',
 build(ctx){
  const root=new THREE.Group();const r=rng(ctx.seed+11);
  const input=ctx.params.layout;const layout=Array.isArray(input)&&input.length>=5&&input.length<=31&&input.length%2===1&&input.every(row=>typeof row==='string'&&row.length===input.length)?input as string[]:null;
  const N=layout?(layout.length-1)/2:Math.round(ctx.num('size',6,4,15));
  // depth-first maze on N x N cells -> grid of (2N+1)^2 wall blocks
  const G2=2*N+1;const wall=Array.from({length:G2},()=>Array(G2).fill(true) as boolean[]);
  const seen=Array.from({length:N},()=>Array(N).fill(false) as boolean[]);const st:[number,number][]=[[0,0]];seen[0]![0]=true;wall[1]![1]=false;
  while(st.length){const [cx,cy]=st[st.length-1]!;const nb=([[1,0],[-1,0],[0,1],[0,-1]] as [number,number][]).map(([dx,dy])=>[cx+dx,cy+dy] as [number,number]).filter(([x,y])=>x>=0&&y>=0&&x<N&&y<N&&!seen[x]![y]);
   if(!nb.length){st.pop();continue;}const [nx,ny]=nb[Math.floor(r()*nb.length)]!;seen[nx]![ny]=true;wall[2*nx+1]![2*ny+1]=false;wall[cx+nx+1]![cy+ny+1]=false;st.push([nx,ny]);}
  if(layout)for(let x=0;x<G2;x++)for(let y=0;y<G2;y++)wall[x]![y]=layout[y]![x]==='#';
  type Block={m:THREE.Mesh;base:THREE.Vector3;dir:THREE.Vector3;k:number;origin?:THREE.Vector3;scatterOrder?:number;loose?:boolean};
  const cell=2/G2,hgt=ctx.num('wallHeightMeters',cell*ctx.num('wallHeight',1.4,0.3,4),0.005,4);const blocks:Block[]=[];const grid=new Map<string,Block>();
  const shadedBox=(w:number,h:number,d:number,tone=0.9)=>{
   const geo=G.box(w,h,d),m=ctx.mesh(geo,{tone});
   if(ctx.bool('faceShading',false)){const normals=geo.getAttribute('normal'),colors:number[]=[];const top=ctx.num('topTone',1,0,1),side=ctx.num('sideTone',0.45,0,1);
    for(let i=0;i<normals.count;i++){const k=normals.getY(i)>0.5?top:normals.getY(i)<-0.5?side*0.35:side;colors.push(k,k,k);}geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));(m.material as THREE.MeshStandardMaterial).vertexColors=true;}
   return m;
  };
  for(let x=0;x<G2;x++)for(let y=0;y<G2;y++){if(!wall[x]![y])continue;const m=shadedBox(cell,hgt,cell);const b=new THREE.Vector3(-1+cell*(x+0.5),hgt/2,-1+cell*(y+0.5));m.position.copy(b);root.add(m);
   const block={m,base:b,dir:new THREE.Vector3(r()-0.5,r()*0.8-0.2,r()-0.5),k:(x+y)/(G2*2)};blocks.push(block);grid.set(`${x},${y}`,block);}
  // Connected chunks rotate about a shared centre, keeping their wall sections intact.
  // Grouping does not consume the layout RNG or change the assembled geometry.
  const chunkSize=Math.round(ctx.num('chunkSize',1,1,64));
  if(chunkSize>1){const pending=new Set(grid.keys());
   while(pending.size){const first=pending.values().next().value!;const queue=[first],members:Block[]=[];
    while(queue.length&&members.length<chunkSize){const key=queue.shift()!;if(!pending.delete(key))continue;members.push(grid.get(key)!);const [x,y]=key.split(',').map(Number) as [number,number];
     for(const [dx,dy] of [[1,0],[0,1],[-1,0],[0,-1]]){const next=`${x+dx!},${y+dy!}`;if(pending.has(next))queue.push(next);}}
    const origin=new THREE.Vector3();for(const b of members)origin.add(b.base);origin.divideScalar(members.length);const leader=members[0]!;
    for(const b of members){b.origin=origin;b.dir=leader.dir;b.scatterOrder=leader.k;}
   }
  }
  // loose blocks around the perimeter, hanging lower (the reference's jagged edge)
  const explicitLoose=Array.isArray(ctx.params.looseBlocks)?ctx.params.looseBlocks:null;
  if(explicitLoose){for(const input of explicitLoose.slice(0,64)){if(!input||typeof input!=='object')continue;const o=input as Record<string,unknown>,p=o.pos,s=o.size;if(!Array.isArray(p)||!Array.isArray(s)||p.length!==3||s.length!==3||![...p,...s].every(n=>typeof n==='number'&&Number.isFinite(n))||s.some(n=>Number(n)<=0))continue;
    const m=shadedBox(Number(s[0]),Number(s[1]),Number(s[2]),0.9),b=new THREE.Vector3(Number(p[0]),Number(p[1]),Number(p[2]));m.position.copy(b);root.add(m);blocks.push({m,base:b,dir:new THREE.Vector3(b.x,0.2,b.z).normalize(),k:clamp((b.x+b.z+2)/4),loose:true});}}
  else for(let i=0;i<Math.round(ctx.num('loose',16,0,64));i++){const side=Math.floor(r()*4),u=r()*2-1;const s=cell*(1+Math.floor(r()*2));const m=shadedBox(s*1.2,hgt*(0.8+r()*0.6),s*1.2,0.75);
   const out=1+cell*(0.6+r()*1.4);const b=new THREE.Vector3(side<2?(side?out:-out):u,-hgt*(0.2+r()*0.9),side>=2?(side===2?out:-out):u);m.position.copy(b);root.add(m);blocks.push({m,base:b,dir:new THREE.Vector3(b.x,r()-0.3,b.z).normalize(),k:r(),loose:true});}
  return {root,grounded:false,update(c,t){const bd=clamp(c.build??1),sc=clamp(c.scatter??0),height=clamp(c.height??1,.1,8),compact=clamp(c.compact??0),spread=ctx.num('heightSpread',0,0,1);
   // Members share their chunk leader's direction, so extrusion variation keeps
   // connected wall sections level and seeking never consumes random numbers.
   for(const b of blocks){const kb=ease.out(clamp((bd-b.k*0.6)/0.4)),heightKey=.5+.5*Math.sin((b.dir.x+.3)*37.1+(b.dir.z+.5)*17.9),stretch=b.loose?1:1+(height-1)*(1-spread*heightKey);b.m.scale.set(1,Math.max(0.001,kb*stretch),1);b.m.visible=kb>0.002;
    const turn=sc*ctx.num('scatterRotation',1,0,2);b.m.rotation.set(turn*b.dir.x*3,turn*b.dir.y*2,turn*b.dir.z*3);
    b.m.position.copy(b.base);if(b.origin&&sc>0)b.m.position.sub(b.origin).applyQuaternion(b.m.quaternion).add(b.origin);
    b.m.position.addScaledVector(b.dir,sc*1.2*(0.5+(b.scatterOrder??b.k)));b.m.position.y+=(stretch-1)*b.base.y-(1-kb)*hgt*stretch/2;
    if(b.loose&&compact>0){b.m.position.x*=1-compact*.4;b.m.position.z*=1-compact*.4;}}}};
 },
});
