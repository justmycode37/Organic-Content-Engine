// everyday model pack (see docs/acryllex.md). Export ModelDefs from this file.
import * as THREE from 'three';
import {G,at,deg,lerp,clamp,smooth,rng} from '../kit.ts';
import {defineModel,type ModelCtx} from './types.ts';

// ---------------------------------------------------------------- helpers
type V3=[number,number,number];
const grp=(...c:THREE.Object3D[])=>{const g=new THREE.Group();if(c.length)g.add(...c);return g;};
/** Faceted copy of a geometry (crisp edges between facets). */
const flat=(g:THREE.BufferGeometry)=>{const n=g.index?g.toNonIndexed():g;n.computeVertexNormals();return n;};
/** See-through material (alpha-hash dither), still fades with the engine's reveal. */
function glassy(m:THREE.Mesh,alpha:number){const mat=m.material as THREE.MeshStandardMaterial;m.onBeforeRender=()=>{mat.opacity=Math.min(mat.opacity,alpha);};return m;}
/** Disc facing +z. */
const disc=(r:number,h:number,seg=48)=>at(G.cyl(r,r,h,seg),[0,0,0],[90,0,0]);
/** Ring of points around a circle (xy plane). */
const ringPts=(n:number,r:number,a0=0)=>Array.from({length:n},(_,i)=>{const a=a0+i/n*Math.PI*2;return [Math.cos(a)*r,Math.sin(a)*r] as [number,number];});
// ================================================================= time
export const hourglass=defineModel({
 id:'hourglass',aliases:['sand-timer','sandglass','egg-timer','timer','time-running-out'],
 describe:'An hourglass in a wooden frame with turned pillars; bright sand trickles from the top bulb into a growing pile below. `flow` 0 all sand on top .. 1 all sand fallen (tween it to show time running out).',
 controls:{flow:'0 full top .. 1 empty top (default 0.35)'},defaults:{flow:0.35},size:'0.3 m tall',
 build(ctx){
  const root=new THREE.Group();
  const H=0.3,plate=0.022,gh=H-plate*2,mid=H/2;
  for(const y of [plate/2,H-plate/2]){
   root.add(ctx.mesh(at(G.lathe([[0,-plate/2],[0.098,-plate/2],[0.104,-plate/2+0.005],[0.104,plate/2-0.005],[0.098,plate/2],[0,plate/2]],56),[0,y,0]),{tone:0.9}));
   root.add(ctx.mesh(at(G.cyl(0.075,0.075,0.008,40),[0,y+(y<mid?plate/2+0.004:-plate/2-0.004),0]),{tone:0.65}));
  }
  const post:[number,number][]=[[0.011,0],[0.013,0.02],[0.008,0.035],[0.012,0.06],[0.009,0.1],[0.012,0.128],[0.009,0.156],[0.012,0.196],[0.008,0.221],[0.013,0.236],[0.011,0.256]];
  for(let i=0;i<3;i++){const a=deg(30+i*120);root.add(ctx.mesh(at(G.lathe(post,14),[Math.cos(a)*0.078,plate,Math.sin(a)*0.078]),{tone:0.8}));}
  // glass: two bulbs joined at a narrow neck
  const half=gh/2;const bulb:[number,number][]=[[0.032,0],[0.058,0.008],[0.066,0.03],[0.062,0.06],[0.045,0.09],[0.02,0.112],[0.0075,half]];
  const glassProfile:[number,number][]=[...bulb.map(([r,y])=>[r,y] as [number,number]),...bulb.slice(0,-1).reverse().map(([r,y])=>[r,gh-y] as [number,number])];
  root.add(glassy(ctx.mesh(at(G.lathe(glassProfile,48),[0,plate+0.004,0]),{tone:0.55,rough:0.3}),0.16));
  // sand: top funnel (shrinks toward the neck), bottom mound (grows), falling stream
  const neckY=plate+0.004+half;
  const topSandP:[number,number][]=[[0,0],[0.007,0],[0.02,0.022],[0.045,0.052],[0.059,0.075],[0.0,0.075]];
  const topSand=ctx.mesh(G.lathe(topSandP,40),{tone:1});const topG=grp(topSand);topG.position.y=neckY;root.add(topG);
  const mound=ctx.mesh(G.lathe([[0.0,0],[0.062,0],[0.064,0.012],[0.045,0.04],[0.02,0.06],[0,0.068]],40),{tone:1});const botG=grp(mound);botG.position.y=plate+0.006;root.add(botG);
  const stream=ctx.mesh(at(G.cyl(0.0022,0.0022,1,8),[0,-0.5,0]),{tone:1,glow:0.4,glowControl:'_sand'});const sG=grp(stream);sG.position.y=neckY;root.add(sG);
  return {root,grounded:true,update(c,t){
   const f=clamp(c.flow??0.35);const top=1-f;
   topG.scale.set(lerp(0.35,1,Math.sqrt(top)),Math.max(0.001,top),lerp(0.35,1,Math.sqrt(top)));topG.visible=top>0.01;
   botG.scale.set(lerp(0.45,1,Math.sqrt(f)),Math.max(0.001,f),lerp(0.45,1,Math.sqrt(f)));botG.visible=f>0.01;
   const pileTop=plate+0.006+0.068*f;const len=Math.max(0.001,neckY-pileTop);
   sG.visible=f>0.005&&f<0.995;sG.scale.set(1+0.25*Math.sin(t*40),len,1+0.25*Math.sin(t*40));
  }};
 },
});

// ================================================================= vehicles
export const car=defineModel({
 id:'car',aliases:['sedan','automobile','vehicle','auto','taxi','commute'],
 describe:'A four-door sedan (faces +z; rot [0,90,0] to drive right): bevelled body with wheel arches, dark glass cabin with pillars, chunky tyres with spoked rims, glowing headlights and tail lights. Wheels spin when it moves or with `drive`; `lights` controls the lamps.',
 controls:{drive:'0..1 wheels spin in place (driving)',lights:'0..1 lamp glow (default 0.7)'},defaults:{drive:0,lights:0.7},size:'4.6 m long',
 build(ctx){
  const root=new THREE.Group(),body=new THREE.Group();root.add(body);
  const side=(g:THREE.BufferGeometry)=>at(g,[0,0,0],[0,-90,0]); // outline x(along) -> z
  const wr=0.34,wb=1.38,wy=wr;
  const out:[number,number][]=[[-2.28,0.3]];
  const arch=(cx:number)=>{for(let i=0;i<=12;i++){const a=Math.PI-i/12*Math.PI;out.push([cx+Math.cos(a)*0.44,wy+0.02+Math.sin(a)*0.44]);}};
  out.push([-wb-0.46,0.3]);arch(-wb);out.push([-wb+0.46,0.3],[wb-0.46,0.3]);arch(wb);out.push([wb+0.46,0.3],[2.25,0.3],[2.34,0.4],[2.36,0.62],[2.3,0.76],[2.1,0.85],[1.2,0.94],[0.95,0.96],[-1.55,0.99],[-2.05,0.98],[-2.27,0.92],[-2.34,0.75],[-2.33,0.45]);
  body.add(ctx.mesh(side(G.extrude(out,1.66,0.07)),{tone:0.82,rough:0.35}));
  // cabin glass + roof + pillars
  body.add(ctx.mesh(side(at(G.extrude([[-1.62,0.94],[1.0,0.92],[0.18,1.4],[-0.95,1.43]],1.46,0.03),[0,0,0])),{tone:0.12,rough:0.55}));
  body.add(ctx.mesh(at(G.rbox(1.5,0.06,1.2,0.025),[0,1.445,-0.38]),{tone:0.9,rough:0.35}));
  const pil=(a:[number,number],b:[number,number])=>{for(const s of [-1,1])body.add(ctx.mesh(G.tube([[s*0.75,a[1],a[0]],[s*0.75,b[1],b[0]]],0.045,4,8),{tone:0.88}));};
  pil([0.98,0.94],[0.2,1.42]);pil([-0.38,0.97],[-0.38,1.44]);pil([-1.6,0.97],[-0.95,1.44]);
  for(const s of [-1,1])body.add(ctx.mesh(G.tube([[s*0.75,1.42,0.2],[s*0.75,1.44,-0.95]],0.045,4,8),{tone:0.88}));
  // lamps, grille, bumpers, mirrors, handles
  for(const s of [-1,1]){
   body.add(ctx.mesh(at(G.rbox(0.42,0.13,0.08,0.03),[s*0.56,0.7,2.4],[0,s*-8,0]),{tone:1,glow:3.2,glowControl:'lights'}));
   body.add(ctx.mesh(at(G.rbox(0.38,0.12,0.06,0.025),[s*0.6,0.78,-2.42]),{tone:0.6,glow:2,glowControl:'lights'}));
   body.add(ctx.mesh(at(G.rbox(0.07,0.12,0.2,0.02),[s*0.92,1.0,0.75]),{tone:0.75}));
   for(const z of [0.25,-0.85])body.add(ctx.mesh(at(G.rbox(0.03,0.035,0.16,0.01),[s*0.85,0.83,z]),{tone:1}));
   body.add(ctx.mesh(at(G.box(0.012,0.5,0.02),[s*0.845,0.62,-0.38]),{tone:0.3}));
  }
  body.add(ctx.mesh(at(G.rbox(0.62,0.16,0.06,0.02),[0,0.56,2.43]),{tone:0.15}));
  for(let i=0;i<3;i++)body.add(ctx.mesh(at(G.box(0.56,0.015,0.02),[0,0.51+i*0.05,2.465]),{tone:0.7}));
  body.add(ctx.mesh(at(G.rbox(1.6,0.12,0.12,0.04),[0,0.36,2.38]),{tone:0.6}),ctx.mesh(at(G.rbox(1.6,0.12,0.12,0.04),[0,0.38,-2.4]),{tone:0.6}));
  body.add(ctx.mesh(at(G.box(0.36,0.1,0.02),[0,0.6,-2.43]),{tone:0.95}));
  // wheels
  const wheels:THREE.Group[]=[];
  for(const z of [-wb,wb])for(const s of [-1,1]){
   const w=new THREE.Group();w.position.set(s*0.8,wy,z);root.add(w);wheels.push(w);
   w.add(ctx.mesh(at(G.lathe([[0.2,-0.13],[0.3,-0.13],[0.335,-0.11],[wr,-0.06],[wr,0.06],[0.335,0.11],[0.3,0.13],[0.2,0.13]],40),[0,0,0],[0,0,90]),{tone:0.38,rough:0.9}));
   const rim=new THREE.Group();rim.position.x=s*0.12;rim.rotation.z=deg(90*s);w.add(rim);
   rim.add(ctx.mesh(G.cyl(0.215,0.215,0.03,32),{tone:0.65}));
   for(let i=0;i<5;i++)rim.add(ctx.mesh(at(G.box(0.05,0.035,0.19),[0,0.02,0.09],[0,i*72,0]).rotateY(0),{tone:1}));
   for(let i=0;i<5;i++){const sp=rim.children[rim.children.length-5+i]!;sp.rotation.y=deg(i*72);}
   rim.add(ctx.mesh(at(G.cyl(0.05,0.06,0.05,16),[0,0.03,0]),{tone:0.9}));
  }
  return {root,grounded:true,update(c,t,pose){const a=(pose.travel+(c.drive??0)*t*9)/wr;for(const w of wheels)w.rotation.x=a;body.position.y=(c.drive??0)*0.008*Math.sin(t*23);}};
 },
});

export const airplane=defineModel({
 id:'airplane',aliases:['plane','airliner','jet','aeroplane','aircraft','flight','passenger-jet'],
 describe:'A twin-engine passenger airliner (nose +z) floating in the air: long fuselage with a row of windows and dark cockpit glass, swept wings with winglets, two big turbofan engines with dark intakes, tall tail fin and stabilisers. Gently banks; `fly` adds a stronger bob/bank and spins the fans.',
 controls:{fly:'0..1 stronger flying motion'},defaults:{fly:0},size:'38 m long',
 build(ctx){
  const root=new THREE.Group(),plane=new THREE.Group();root.add(plane);
  const L=37,R=2.0;
  // fuselage: lathe along y, then laid along z (nose +z)
  const prof:[number,number][]=[[0,0],[0.35,0.25],[0.7,1.2],[1.15,3.5],[1.6,6.5],[1.95,10],[R,12],[R,29],[1.97,31],[1.85,33],[1.6,34.6],[1.2,35.8],[0.7,36.6],[0.25,37],[0,L]];
  const fus=G.lathe(prof,48);fus.translate(0,-L/2,0);fus.rotateX(Math.PI/2);
  // lift the tail cone upward (real airliners sweep the tail up)
  const p=fus.attributes.position!;for(let i=0;i<p.count;i++){const z=p.getZ(i);if(z< -L/2+12){const k=(-L/2+12-z)/12;p.setY(i,p.getY(i)+k*k*1.3);}}
  fus.computeVertexNormals();
  plane.add(ctx.mesh(fus,{tone:0.95,rough:0.4}));
  // cockpit windows + cabin windows (dark)
  const cw:THREE.BufferGeometry[]=[];
  for(const s of [-1,1]){
   for(let i=0;i<30;i++){const z=-11+i*0.92;cw.push(at(G.rbox(0.06,0.38,0.27,0.03),[s*1.985,0.45,z]));}
   cw.push(at(G.box(0.08,1.2,0.07),[s*1.99,-0.15,12.4]),at(G.box(0.08,1.2,0.07),[s*1.99,-0.15,-12.5]));
  }
  plane.add(ctx.mesh(G.merge(cw),{tone:0.12}));
  const cock=G.merge([at(G.box(2.2,0.42,0.6),[0,0.62,16.3],[22,0,0])]);plane.add(ctx.mesh(cock,{tone:0.1}));
  for(const s of [-1,1])plane.add(ctx.mesh(at(G.box(0.6,0.38,0.5),[s*0.95,0.58,16.0],[22,s*-38,0]),{tone:0.1}));
  // cheat line along the side for scale
  for(const s of [-1,1])plane.add(ctx.mesh(at(G.box(0.03,0.12,26),[s*2.0,-0.05,0]),{tone:0.5}));
  // wings (planform in x,z), slight dihedral
  const wing=(s:number)=>{
   const o:[number,number][]=[[1.4,4.2],[6,1.6],[16.6,-5.6],[17.2,-6.4],[17.1,-7.6],[7,-4.8],[1.4,-3.6]].map(([x=0,z=0])=>[x*s,z]) as [number,number][];
   const g=G.extrude(o,0.42,0.12);g.rotateX(Math.PI/2);
   const w=grp(ctx.mesh(g,{tone:0.78,rough:0.4}));w.position.set(0,-1.15,0.5);w.rotation.z=deg(6*s);plane.add(w);
   // flap track fairings
   for(const x of [4.5,8,11.5])w.add(ctx.mesh(at(G.capsule(0.16,1.6,4,8),[s*x,-0.25,-4.3-(x-4.5)*0.35],[90,0,0]),{tone:0.6}));
   // winglet
   w.add(ctx.mesh(at(G.extrude([[0,0],[1.0,2.3],[1.6,2.3],[1.4,0]],0.12,0.04),[s*17.05,0.05,-6.0],[0,-90,0]),{tone:0.9}));
   // engine on a pylon
   const e=new THREE.Group();e.position.set(s*5.8,-1.85,2.6);w.add(e);
   e.add(ctx.mesh(G.lathe([[0.95,-2.2],[1.05,-1.5],[1.1,0],[1.08,1.4],[1.0,2.0],[0.88,2.1]],40).rotateX(Math.PI/2),{tone:0.92,rough:0.35}));
   e.add(ctx.mesh(at(G.cyl(0.86,0.86,0.1,40),[0,0,1.9],[90,0,0]),{tone:0.12}));
   const fan=new THREE.Group();fan.position.z=1.75;e.add(fan);fan.add(ctx.mesh(at(G.cone(0.3,0.5,20),[0,0,0.25],[90,0,0]),{tone:0.75}));
   for(let i=0;i<10;i++)fan.add(ctx.mesh(at(G.box(0.1,0.78,0.05),[0,0.42,0],[0,20,0]).rotateZ(i/10*Math.PI*2),{tone:0.45}));
   e.add(ctx.mesh(at(G.cone(0.55,1.3,24),[0,0,-2.6],[-90,0,0]),{tone:0.55}));
   e.add(ctx.mesh(at(G.box(0.25,1.0,3.4),[0,0.95,-0.2]),{tone:0.75}));
   return fan;
  };
  const fans=[wing(1),wing(-1)];
  // belly fairing
  plane.add(ctx.mesh(at(G.ellipsoid(1.9,0.9,6.5,32,14),[0,-1.4,-0.5]),{tone:0.8}));
  // tail fin + stabilisers
  const fin=G.extrude([[-11.5,1.2],[-15.8,8.7],[-17.7,8.7],[-18.6,1.4]],0.38,0.1);fin.rotateY(-Math.PI/2);
  plane.add(ctx.mesh(fin,{tone:0.85,rough:0.4}));
  plane.add(ctx.mesh(at(G.box(0.4,0.22,2.2),[0,8.75,-16.8]),{tone:0.95}));
  for(const s of [-1,1]){
   const o:[number,number][]=[[0.5,-13.4],[6.3,-16.6],[6.4,-17.5],[3.5,-17.3],[0.5,-17.0]].map(([x=0,z=0])=>[x*s,z]) as [number,number][];
   const g=G.extrude(o,0.25,0.07);g.rotateX(Math.PI/2);const m=ctx.mesh(g,{tone:0.8});m.position.y=1.05;m.rotation.z=deg(5*s);plane.add(m);
  }
  plane.add(ctx.mesh(at(G.cone(0.35,0.9,16),[0,1.35,-18.8],[-90,0,0]),{tone:0.6}));
  return {root,grounded:false,update(c,t){
   const f=c.fly??0;plane.rotation.z=Math.sin(t*0.7)*lerp(0.035,0.12,f);plane.rotation.x=Math.sin(t*0.5+1)*lerp(0.01,0.04,f);plane.position.y=Math.sin(t*0.9)*lerp(0.15,0.6,f);
   for(const fn of fans)fn.rotation.z=t*lerp(2,25,f);
  }};
 },
});

export const rocket=defineModel({
 id:'rocket',aliases:['spaceship','rocket-ship','space-rocket','launch','startup-rocket','missile'],
 describe:'A classic rocket standing on four swept fins: bright nose cone, banded body with a round porthole, rivet rings and a bell nozzle. `launch` ignites a big flickering exhaust flame with a glow and makes it rumble.',
 controls:{launch:'0 idle .. 1 full thrust flame',glow:'flame brightness (default 1)'},defaults:{launch:0,glow:1},size:'2 m display (real rockets 50+ m)',
 build(ctx){
  const root=new THREE.Group(),body=new THREE.Group();root.add(body);
  const R=0.26;
  body.add(ctx.mesh(G.lathe([[0.17,0.28],[0.22,0.3],[R,0.36],[R+0.012,0.55],[R+0.012,1.05],[R,1.12]],48),{tone:0.78,rough:0.4}));
  body.add(ctx.mesh(G.lathe([[R,1.11],[R-0.004,1.25],[0.235,1.4],[0.2,1.55],[0.15,1.68],[0.09,1.78],[0.04,1.84],[0,1.86]],48),{tone:1,rough:0.35}));
  for(const y of [0.55,1.05,1.12])body.add(ctx.mesh(at(G.torus(R+0.012,0.012,8,48),[0,y,0],[90,0,0]),{tone:0.55}));
  const riv:THREE.BufferGeometry[]=[];for(let i=0;i<24;i++){const a=i/24*Math.PI*2;riv.push(at(G.sphere(0.008,6,4),[Math.cos(a)*(R+0.016),0.6,Math.sin(a)*(R+0.016)]),at(G.sphere(0.008,6,4),[Math.cos(a)*(R+0.016),1.0,Math.sin(a)*(R+0.016)]));}
  body.add(ctx.mesh(G.merge(riv),{tone:0.95}));
  // porthole
  body.add(ctx.mesh(at(G.torus(0.085,0.022,12,36),[0,0.83,R+0.01]),{tone:0.95,rough:0.3}));
  body.add(ctx.mesh(at(disc(0.075,0.02),[0,0.83,R-0.005]),{tone:0.2,rough:0.15}));
  body.add(ctx.mesh(at(G.sphere(0.02,10,8),[-0.03,0.86,R+0.01]),{tone:0.9}));
  // fins
  const finG=G.extrude([[0,0.62],[0,0.3],[0.02,0.2],[0.26,-0.02],[0.3,-0.04],[0.3,0.06],[0.2,0.3]],0.045,0.015);
  for(let i=0;i<4;i++){const a=deg(45+i*90);const m=ctx.mesh(finG.clone(),{tone:0.95});m.position.set(Math.cos(a)*(R-0.01),0.04,Math.sin(a)*(R-0.01));m.rotation.y=-a;body.add(m);}
  // nozzle
  body.add(ctx.mesh(G.lathe([[0.1,0.3],[0.11,0.26],[0.14,0.18],[0.17,0.11],[0.15,0.11],[0.12,0.17],[0.09,0.25],[0.0,0.27]],40),{tone:0.5,side:THREE.DoubleSide}));
  // flame
  const flame=new THREE.Group();flame.position.y=0.12;body.add(flame);
  flame.add(ctx.mesh(G.lathe([[0,0],[0.11,-0.04],[0.16,-0.2],[0.15,-0.45],[0.1,-0.75],[0.04,-1.0],[0,-1.1]],32),{tone:1,glow:2.4,glowControl:'_flame'}));
  flame.add(ctx.mesh(G.lathe([[0,0.01],[0.07,-0.02],[0.09,-0.15],[0.06,-0.4],[0,-0.55]],24),{tone:1,glow:4,glowControl:'_flame'}));
  const fmats=[] as THREE.MeshStandardMaterial[];flame.traverse(o=>{if((o as THREE.Mesh).isMesh)fmats.push((o as THREE.Mesh).material as THREE.MeshStandardMaterial);});
  return {root,grounded:true,update(c,t){
   const l=clamp(c.launch??0);const fl=1+0.12*Math.sin(t*37)+0.08*Math.sin(t*61+1);
   flame.visible=l>0.01;flame.scale.set(lerp(0.6,1.1,l)*(1+0.05*Math.sin(t*53)),Math.max(0.001,l*fl*1.3),lerp(0.6,1.1,l)*(1+0.05*Math.sin(t*47)));
   const g=c.glow??1;for(const m of fmats)m.emissiveIntensity=(m.userData.glow as number)*l*g;
   body.position.x=Math.sin(t*71)*0.004*l;body.position.z=Math.cos(t*67)*0.004*l;
  }};
 },
});

export const house=defineModel({
 id:'house',aliases:['home','cottage','family-home','real-estate','property','housing'],
 describe:'A detached house with a steep gable roof (overhanging eaves, shingle rows), brick chimney, front door with a knob and porch step, framed cross-paned windows on every side. `lights` makes the windows glow warmly (night, someone home).',
 controls:{lights:'0 dark windows .. 1 lit (default 0)'},defaults:{lights:0},size:'7 m wide, 7 m tall',
 build(ctx){
  const root=new THREE.Group();
  const W=6,D=7,Hw=3.2,pitch=deg(42),ridge=Hw+Math.tan(pitch)*W/2;
  // walls + gable fronts
  root.add(ctx.mesh(at(G.box(W,Hw,D),[0,Hw/2,0]),{tone:0.62}));
  const gable=G.extrude([[-W/2,Hw],[W/2,Hw],[0,ridge]],D,0);root.add(ctx.mesh(gable,{tone:0.62}));
  // siding lines
  const sid:THREE.BufferGeometry[]=[];for(let y=0.35;y<Hw;y+=0.35)for(const z of [D/2,-D/2])sid.push(at(G.box(W+0.02,0.03,0.04),[0,y,z]));
  for(let y=0.35;y<Hw;y+=0.35)for(const x of [W/2,-W/2])sid.push(at(G.box(0.04,0.03,D+0.02),[x,y,0]));
  root.add(ctx.mesh(G.merge(sid),{tone:0.48}));
  root.add(ctx.mesh(at(G.box(W+0.2,0.35,D+0.2),[0,0.175,0]),{tone:0.45}));
  for(const x of [-W/2,W/2])for(const z of [-D/2,D/2])root.add(ctx.mesh(at(G.box(0.18,Hw,0.18),[x,Hw/2,z]),{tone:0.85}));
  // roof slabs with eaves + shingle rows
  const over=0.45,slope=(W/2)/Math.cos(pitch)+over,th=0.18;
  for(const s of [-1,1]){
   const slab=new THREE.Group();slab.position.set(0,ridge,0);slab.rotation.z=s*-pitch;root.add(slab);
   const m=ctx.mesh(at(G.box(slope,th,D+2*over),[s*slope/2,th/2,0]),{tone:0.92});slab.add(m);
   const sh:THREE.BufferGeometry[]=[];for(let k=0.35;k<slope-0.1;k+=0.42)sh.push(at(G.box(0.06,0.06,D+2*over),[s*k,th+0.02,0]));
   slab.add(ctx.mesh(G.merge(sh),{tone:0.65}));
   slab.add(ctx.mesh(at(G.box(0.12,0.12,D+2*over+0.02),[s*slope,th/2,0]),{tone:1}));
  }
  root.add(ctx.mesh(at(G.cyl(0.13,0.13,D+2*over+0.1,12),[0,ridge+th+0.05,0],[90,0,0]),{tone:1}));
  // fascia boards on the gables
  for(const z of [D/2+over,-D/2-over])for(const s of [-1,1])root.add(ctx.mesh(at(G.box(slope,0.22,0.08),[s*slope/2*Math.cos(pitch),ridge-slope/2*Math.sin(pitch)+0.1,z],[0,0,s*-42]),{tone:1}));
  // chimney
  root.add(ctx.mesh(at(G.box(0.7,2.2,0.7),[1.5,ridge-0.2,-1.4]),{tone:0.78}));
  root.add(ctx.mesh(at(G.box(0.85,0.18,0.85),[1.5,ridge+0.95,-1.4]),{tone:0.95}));
  const br:THREE.BufferGeometry[]=[];for(let y=ridge-0.9;y<ridge+0.85;y+=0.22)br.push(at(G.box(0.72,0.03,0.72),[1.5,y,-1.4]));root.add(ctx.mesh(G.merge(br),{tone:0.55}));
  // door
  const dz=D/2;
  root.add(ctx.mesh(at(G.box(1.25,2.3,0.12),[0,1.15+0.3,dz+0.02]),{tone:1}));
  root.add(ctx.mesh(at(G.box(1.0,2.1,0.1),[0,1.05+0.3,dz+0.05]),{tone:0.38}));
  for(const y of [0.85,1.7])for(const x of [-0.22,0.22])root.add(ctx.mesh(at(G.box(0.36,0.6,0.04),[x,y+0.3,dz+0.1]),{tone:0.5}));
  root.add(ctx.mesh(at(G.sphere(0.06,12,8),[0.36,1.35,dz+0.16]),{tone:1}));
  root.add(ctx.mesh(at(G.box(1.8,0.15,0.6),[0,0.075,dz+0.35]),{tone:0.8}));
  root.add(ctx.mesh(at(G.box(1.6,0.1,0.35),[0,2.85,dz+0.22],[10,0,0]),{tone:0.95}));
  // windows
  const win=(pos:V3,ry:number,w=1.1,h=1.2)=>{
   const g=new THREE.Group();g.position.set(...pos);g.rotation.y=deg(ry);root.add(g);
   g.add(ctx.mesh(at(G.box(w+0.24,h+0.24,0.1),[0,0,0.02]),{tone:1}));
   g.add(ctx.mesh(at(G.box(w,h,0.06),[0,0,0.06]),{tone:0.18,glow:1.4,glowControl:'lights',color:ctx.params.color?undefined:undefined}));
   g.add(ctx.mesh(at(G.box(0.07,h,0.06),[0,0,0.1]),{tone:1}),ctx.mesh(at(G.box(w,0.07,0.06),[0,0,0.1]),{tone:1}));
   g.add(ctx.mesh(at(G.box(w+0.4,0.1,0.22),[0,-h/2-0.15,0.1]),{tone:0.95}));
  };
  for(const x of [-1.95,1.95])win([x,1.75,dz],0);
  win([0,ridge-1.55,dz],0,0.7,0.7);
  for(const z of [-1.8,1.8])for(const s of [-1,1])win([s*W/2,1.75,z],s*90);
  win([-1.6,1.75,-dz],180);win([1.6,1.75,-dz],180);
  return {root,grounded:true};
 },
});

export const battery=defineModel({
 id:'battery',aliases:['aa-battery','cell','battery-cell','charge','energy-storage','power'],
 describe:'An AA battery standing upright: metal body with a bright top band, raised + terminal nub and a big embossed "+", plus a glowing charge-level window on the front. `charge` 0 empty .. 1 full fills the level (glows). kind:"icon" shows a phone-style battery icon with four bars instead.',
 params:{kind:'cell (default) | icon'},controls:{charge:'0 empty .. 1 full (default 0.75)',glow:'0..1 level glow (default 1)'},defaults:{charge:0.75,glow:1},size:'5 cm (cell) / 0.12 m (icon)',
 build(ctx){
  const root=new THREE.Group();const kind=ctx.str('kind','cell',['cell','icon'] as const);
  if(kind==='icon'){
   const W=0.12,H=0.06,D=0.025,wall=0.006;
   root.add(ctx.mesh(at(G.extrude([[-W/2,0],[W/2,0],[W/2,H],[-W/2,H]],D,0.004,[[[-W/2+wall,wall],[-W/2+wall,H-wall],[W/2-wall,H-wall],[W/2-wall,wall]]]),[0,0,0]),{tone:0.95,rough:0.35}));
   root.add(ctx.mesh(at(G.rbox(0.008,0.024,D*0.8,0.003),[W/2+0.006,H/2,0]),{tone:0.95}));
   root.add(ctx.mesh(at(G.box(W-2*wall,H-2*wall,0.004),[0,H/2,-D/2+0.004]),{tone:0.18}));
   const bars:THREE.Mesh[]=[];const bw=(W-2*wall-0.01)/4;
   for(let i=0;i<4;i++){const m=ctx.mesh(at(G.rbox(bw-0.004,H-2*wall-0.008,D*0.6,0.002),[-W/2+wall+0.005+bw*(i+0.5),H/2,0]),{tone:0.95,glow:1.6});bars.push(m);root.add(m);}
   return {root,grounded:true,update(c){const ch=clamp(c.charge??0.75);bars.forEach((b,i)=>{const k=clamp(ch*4-i);b.visible=k>0.02;b.scale.x=Math.max(0.02,k);b.position.x=(1-k)*-(bw-0.004)/2*0;});}};
  }
  const R=0.0072,H=0.0505;
  root.add(ctx.mesh(G.lathe([[0,0],[R-0.0008,0],[R,0.0008],[R,H*0.72]],48),{tone:0.62,rough:0.45}));
  root.add(ctx.mesh(G.lathe([[R,H*0.72],[R,H-0.0012],[R-0.0008,H-0.0002],[0.0028,H-0.0002],[0,H-0.0002]],48),{tone:0.98,rough:0.3}));
  root.add(ctx.mesh(at(G.torus(R,0.00025,6,48),[0,H*0.72,0],[90,0,0]),{tone:0.3}));
  root.add(ctx.mesh(G.lathe([[0,H-0.0004],[0.0026,H-0.0004],[0.0027,H+0.0012],[0.0022,H+0.0017],[0,H+0.0017]],32),{tone:1,rough:0.25}));
  root.add(ctx.mesh(at(G.cyl(0.0048,0.0048,0.0004,32),[0,0.0002,0]),{tone:0.45}));
  // embossed plus on the band
  const plus=G.merge([G.box(0.0042,0.0012,0.0008),G.box(0.0012,0.0042,0.0008)]);
  root.add(ctx.mesh(at(plus,[0,H*0.86,R+0.0002]),{tone:0.4}));
  // charge window
  const ww=0.0034,wh=H*0.58,wy=0.004;
  root.add(ctx.mesh(at(G.rbox(ww+0.0014,wh+0.0014,0.0012,0.0005),[0,wy+wh/2,R-0.0002]),{tone:0.15}));
  for(let i=1;i<4;i++)root.add(ctx.mesh(at(G.box(ww+0.0016,0.0003,0.0004),[0,wy+wh*i/4,R+0.0006]),{tone:0.5}));
  const lvl=ctx.mesh(at(G.box(ww,1,0.0008),[0,0.5,0]),{tone:1,glow:1.8});const lg=grp(lvl);lg.position.set(0,wy,R+0.0002);root.add(lg);
  return {root,grounded:true,update(c){const ch=clamp(c.charge??0.75);lg.visible=ch>0.01;lg.scale.y=Math.max(0.0001,wh*ch);}};
 },
});

export const padlock=defineModel({
 id:'padlock',aliases:['lock','security','locked','unlock','privacy','encryption'],
 describe:'A chunky padlock: brass-style body with bevelled edges and a dark keyhole, thick steel U-shackle. `open` 0 locked .. 1 shackle pops up and swings aside (unlocked).',
 controls:{open:'0 locked .. 1 open'},defaults:{open:0},size:'9 cm tall',
 build(ctx){
  const root=new THREE.Group();
  const W=0.06,H=0.05,D=0.024;
  root.add(ctx.mesh(at(G.rbox(W,H,D,0.007,4),[0,H/2,0]),{tone:0.9,rough:0.3}));
  for(const y of [0.006,H-0.006])root.add(ctx.mesh(at(G.box(W+0.0012,0.0018,D+0.0012),[0,y,0]),{tone:0.6}));
  // keyhole
  const kh=G.merge([at(G.cyl(0.0055,0.0055,0.003,24),[0,0,0],[90,0,0]),at(G.extrude([[-0.0028,0],[0.0028,0],[0.0045,-0.013],[-0.0045,-0.013]],0.003),[0,0,0])]);
  root.add(ctx.mesh(at(kh,[0,H*0.58,D/2+0.0003]),{tone:0.06}));
  root.add(ctx.mesh(at(G.torus(0.0085,0.0013,8,28),[0,H*0.58,D/2+0.0008]),{tone:0.55}));
  // shackle: pivot on the left leg
  const Rs=0.019,rs=0.0048,leg=0.012;
  const sh=new THREE.Group();sh.position.set(-Rs,H,0);root.add(sh);
  const s2=new THREE.Group();s2.position.set(Rs,0,0);sh.add(s2);
  s2.add(ctx.mesh(at(G.torus(Rs,rs,14,36,Math.PI),[0,leg,0]),{tone:0.75,rough:0.25}));
  s2.add(ctx.mesh(at(G.cyl(rs,rs,leg+0.012,16),[-Rs,(leg-0.012)/2,0]),{tone:0.75,rough:0.25}));
  s2.add(ctx.mesh(at(G.cyl(rs,rs,leg,16),[Rs,leg/2,0]),{tone:0.75,rough:0.25}));
  for(const x of [-Rs,Rs])root.add(ctx.mesh(at(G.cyl(rs+0.0022,rs+0.0022,0.0025,20),[x,H+0.001,0]),{tone:0.5}));
  return {root,grounded:true,update(c){const o=clamp(c.open??0);const up=ease4(clamp(o*1.8));const sw=ease4(clamp(o*1.8-0.8));sh.position.y=H+up*0.011;sh.rotation.y=-sw*deg(150);}};
 },
});
const ease4=(k:number)=>k<0.5?8*k*k*k*k:1-Math.pow(-2*k+2,4)/2;

export const candle=defineModel({
 id:'candle',aliases:['candlelight','flame','wax-candle','vigil'],
 describe:'A pillar candle with wax drips, a slightly melted crater top, dark wick and a glowing teardrop flame that flickers, on a small dish. `glow` 0 snuffed .. 1 lit.',
 controls:{glow:'0 out .. 1 lit (default 1)'},defaults:{glow:1},size:'0.2 m tall',
 build(ctx){
  const root=new THREE.Group();const r=rng(ctx.seed);
  const R=0.035,H=0.13;
  root.add(ctx.mesh(G.lathe([[0,0],[0.06,0],[0.066,0.004],[0.068,0.012],[0.062,0.012],[0.058,0.006],[0,0.006]],48),{tone:0.7,rough:0.3}));
  root.add(ctx.mesh(G.lathe([[0,0.006],[R,0.006],[R,H-0.004],[R-0.002,H],[R-0.008,H-0.004],[0.01,H-0.009],[0,H-0.01]],48),{tone:0.95,rough:0.75}));
  const drips:THREE.BufferGeometry[]=[];
  for(let i=0;i<7;i++){const a=r()*Math.PI*2,len=0.015+r()*0.04;drips.push(at(G.capsule(0.0045,len,4,10),[Math.cos(a)*(R+0.0012),H-0.004-len/2,Math.sin(a)*(R+0.0012)]));}
  drips.push(at(G.torus(R-0.001,0.0035,8,48),[0,H-0.002,0],[90,0,0]));
  root.add(ctx.mesh(G.merge(drips),{tone:1,rough:0.6}));
  root.add(ctx.mesh(G.tube([[0,H-0.01,0],[0,H+0.006,0],[0.002,H+0.012,0]],0.0014,8,6),{tone:0.12}));
  const flame=new THREE.Group();flame.position.y=H+0.004;root.add(flame);
  flame.add(ctx.mesh(G.lathe([[0,0],[0.006,0.003],[0.009,0.011],[0.008,0.02],[0.005,0.03],[0.002,0.038],[0,0.043]],28),{tone:1,glow:3.2}));
  flame.add(ctx.mesh(G.lathe([[0,0.001],[0.0035,0.003],[0.004,0.008],[0,0.013]],16),{tone:0.4,glow:0.6}));
  return {root,grounded:true,update(c,t){const g=c.glow??1;flame.visible=g>0.02;const f=1+0.08*Math.sin(t*13)+0.05*Math.sin(t*23+1);flame.scale.set(g*(1-0.03*Math.sin(t*17)),Math.max(0.001,g*f),g);flame.rotation.z=Math.sin(t*5)*0.08+Math.sin(t*11)*0.04;}};
 },
});


// ================================================================= small objects
export const key=defineModel({
 id:'key',aliases:['house-key','door-key','keys','access','password','solution'],
 describe:'A metal house key (Yale style) lying flat to camera: rounded bow with a hole and a split ring, shouldered blade with a milled groove and cut teeth along the bottom.',
 params:{ring:'true (default) | false: split key ring through the hole'},size:'6 cm long',
 build(ctx){
  const root=new THREE.Group();const T=0.0024;
  const bow:[number,number][]=[];for(let i=0;i<40;i++){const a=i/40*Math.PI*2;const r=0.0125*(1+0.06*Math.cos(a*2));bow.push([-0.019+Math.cos(a)*r*1.05,Math.sin(a)*r]);}
  const hole:[number,number][]=ringPts(20,0.0034).map(([x,y])=>[x-0.026,y]);
  root.add(ctx.mesh(G.extrude(bow,T,0.0006,[hole]),{tone:0.92,rough:0.3}));
  // blade with teeth
  const teeth=[0,-0.0036,-0.0012,-0.0042,-0.0018,-0.0034,-0.0008,-0.004,-0.002];
  const bl:[number,number][]=[[-0.008,0.0058],[-0.004,0.0058],[-0.003,0.0046],[0.034,0.0046],[0.038,0.0012]];
  const x0=0.034,dx=0.0034;for(let i=0;i<teeth.length;i++){const x=x0-i*dx;bl.push([x-dx*0.15,-0.0005+teeth[i]!*0.0]);bl.push([x-dx*0.5,-0.0045-teeth[i]!*0.55]);}
  bl.push([-0.003,-0.0048],[-0.004,-0.0062],[-0.008,-0.0062]);
  root.add(ctx.mesh(G.extrude(bl,T*0.9,0.0003),{tone:0.85,rough:0.3}));
  for(const z of [1,-1])root.add(ctx.mesh(at(G.box(0.036,0.0011,0.0006),[0.016,0.0016,z*T*0.47]),{tone:0.35}));
  root.add(ctx.mesh(at(G.box(0.012,0.0042,0.0008),[-0.019,0,T*0.62]),{tone:0.6}));
  if(ctx.bool('ring',true))root.add(ctx.mesh(at(G.torus(0.011,0.0009,8,48),[-0.036,0,0],[0,62,0]),{tone:0.75,rough:0.25}));
  return {root,grounded:false};
 },
});

export const coin=defineModel({
 id:'coin',aliases:['coins','money','cent','euro-coin','dollar-coin','gold-coin','change','price'],
 describe:'A metal coin with a raised rim, reeded edge and an embossed profile relief; count 1 stands it on edge facing the camera, count>1 makes a neat stack of coins lying flat.',
 params:{count:'1..30 (default 1)'},controls:{spin:'0..1 spins a single coin on its edge'},defaults:{spin:0},size:'2.6 cm',
 build(ctx){
  const n=Math.round(ctx.num('count',1,1,30)),R=0.013,H=0.0022,r=rng(ctx.seed);
  const edge=G.cyl(R,R,H*0.86,120,true);{const p=edge.attributes.position!;for(let i=0;i<p.count;i++){const a=Math.atan2(p.getZ(i),p.getX(i));const k=1+0.012*Math.sign(Math.cos(a*60));p.setX(i,p.getX(i)*k);p.setZ(i,p.getZ(i)*k);}edge.computeVertexNormals();}
  const face=G.lathe([[0,H*0.3],[R*0.82,H*0.3],[R*0.86,H*0.5],[R*0.97,H*0.5],[R,H*0.43]],64);
  const reliefG=G.merge([at(G.ellipsoid(R*0.32,R*0.4,H*0.22,24,12),[R*0.04,R*0.06,0]),at(G.ellipsoid(R*0.18,R*0.12,H*0.18,16,8),[R*0.0,-R*0.38,0]),at(G.ellipsoid(R*0.12,R*0.08,H*0.15,12,8),[-R*0.22,R*0.12,0])]);
  const dots:THREE.BufferGeometry[]=[];for(let i=0;i<34;i++){const a=i/34*Math.PI*2;dots.push(at(G.sphere(R*0.025,6,4),[Math.cos(a)*R*0.74,Math.sin(a)*R*0.74,0]));}
  const dotG=G.merge(dots);
  const one=()=>{const g=new THREE.Group();
   g.add(ctx.mesh(edge.clone(),{tone:0.7,rough:0.35}));
   for(const s of [1,-1]){const f=face.clone();if(s<0)f.rotateX(Math.PI);g.add(ctx.mesh(f,{tone:0.95,rough:0.25}));}
   const rel=reliefG.clone();rel.rotateX(-Math.PI/2);rel.translate(0,H*0.3,0);g.add(ctx.mesh(rel,{tone:1,rough:0.3}));
   const d=dotG.clone();d.rotateX(-Math.PI/2);d.translate(0,H*0.32,0);g.add(ctx.mesh(d,{tone:0.6}));
   return g;};
  const root=new THREE.Group();
  if(n===1){const c=one();const spin=new THREE.Group();spin.add(c);c.rotation.x=Math.PI/2;spin.position.y=R;root.add(spin);
   return {root,grounded:true,update(cn,t){spin.rotation.y=(cn.spin??0)*t*9;}};}
  for(let i=0;i<n;i++){const c=one();c.position.set((r()-0.5)*0.0012,H/2+i*H*1.02,(r()-0.5)*0.0012);c.rotation.y=r()*6;root.add(c);}
  return {root,grounded:true};
 },
});

export const banknotes=defineModel({
 id:'banknotes',aliases:['banknote','cash','money-stack','bills','dollars','notes','salary','wad-of-cash'],
 describe:'A thick bundle of paper banknotes lying flat, held by a paper band: visible note edges, top note with printed border, portrait oval, corner numerals and a seal. count stacks several bundles; `fan` spreads the top notes.',
 params:{count:'1..6 bundles (default 1)'},controls:{fan:'0..1 top notes fan out'},defaults:{fan:0},size:'16 cm',
 build(ctx){
  const L=0.156,W=0.066,n=Math.round(ctx.num('count',1,1,6)),r=rng(ctx.seed);const root=new THREE.Group();const fans:THREE.Group[]=[];
  const printTop=(g:THREE.Group,y:number)=>{
   const pr:THREE.BufferGeometry[]=[];
   const fr=(w:number,h:number,t:number)=>{pr.push(at(G.box(w,0.0003,t),[0,y,h/2]),at(G.box(w,0.0003,t),[0,y,-h/2]),at(G.box(t,0.0003,h),[w/2,y,0]),at(G.box(t,0.0003,h),[-w/2,y,0]));};
   fr(L*0.92,W*0.84,0.0016);fr(L*0.88,W*0.76,0.0006);
   const ov=G.torus(0.017,0.0012,6,36);ov.rotateX(Math.PI/2);ov.scale(0.85,1,1);pr.push(at(ov,[0,y,0]));
   pr.push(at(G.ellipsoid(0.008,0.0003,0.011,16,6),[0,y,-0.002]),at(G.ellipsoid(0.011,0.0003,0.006,16,6),[0,y,0.011]));
   for(const [x,z] of [[-1,-1],[1,1],[1,-1],[-1,1]] as const)pr.push(at(G.box(0.012,0.0003,0.007),[x*L*0.37,y,z*W*0.3]));
   const seal=G.torus(0.0065,0.0012,6,24);seal.rotateX(Math.PI/2);pr.push(at(seal,[L*0.27,y,0.004]),at(seal.clone(),[-L*0.27,y,-0.004]));
   g.add(ctx.mesh(G.merge(pr),{tone:0.4}));
  };
  for(let b=0;b<n;b++){
   const g=new THREE.Group();g.position.set((r()-0.5)*0.01,b*0.0135,(r()-0.5)*0.008);g.rotation.y=(r()-0.5)*0.25;root.add(g);
   const hgt=0.012;
   g.add(ctx.mesh(at(G.rbox(L,hgt,W,0.0012),[0,hgt/2,0]),{tone:0.88,rough:0.9}));
   const lines:THREE.BufferGeometry[]=[];for(let i=1;i<10;i++){const y=i*hgt/10;lines.push(at(G.box(L+0.0004,0.00025,W+0.0004),[(hash(i+b)-0.5)*0.0015,y,(hash(i*3+b)-0.5)*0.0012]));}
   g.add(ctx.mesh(G.merge(lines),{tone:0.5}));
   printTop(g,hgt+0.0002);
   g.add(ctx.mesh(at(G.box(0.028,hgt+0.0016,W+0.0016),[0,hgt/2,0]),{tone:1,rough:0.8}));
   g.add(ctx.mesh(at(G.box(0.012,0.0003,0.008),[0,hgt+0.0008,0.012]),{tone:0.45}));
   if(b===n-1){for(let k=0;k<3;k++){const f=new THREE.Group();f.position.set(-L/2,hgt+0.0004*(k+1),0);g.add(f);const m=ctx.mesh(at(G.box(L,0.0003,W),[L/2,0,0]),{tone:0.95,rough:0.9});f.add(m);const pg=new THREE.Group();pg.position.x=L/2;f.add(pg);printTop(pg,0.0003);pg.children[0]!.position.x=0;f.visible=false;fans.push(f);}}
  }
  return {root,grounded:true,update(c){const k=clamp(c.fan??0);fans.forEach((f,i)=>{f.visible=k>0.01;f.rotation.y=deg(k*(12+i*14));f.rotation.z=deg(k*(3+i*2));});}};
 },
});
function hash(n:number){const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);}

export const door=defineModel({
 id:'door',aliases:['doorway','front-door','entrance','opportunity','exit','room-door'],
 describe:'A six-panel interior door in its frame with casing trim, three hinges and a lever handle; `open` swings it inward to reveal a lit room beyond (`glow` light spill).',
 controls:{open:'0 closed .. 1 open (~100°)',glow:'0..1 light from the room beyond (default 0.6)'},defaults:{open:0,glow:0.6},size:'2.2 m tall',
 build(ctx){
  const root=new THREE.Group();const W=0.86,H=2.04,T=0.04;
  // casing + wall stub
  root.add(ctx.mesh(at(G.box(W+0.6,H+0.4,0.06),[0,(H+0.4)/2,-0.06]),{tone:0.4}));
  for(const s of [-1,1])root.add(ctx.mesh(at(G.rbox(0.09,H+0.09,0.03,0.008),[s*(W/2+0.045),(H+0.09)/2,0.0]),{tone:1}));
  root.add(ctx.mesh(at(G.rbox(W+0.2,0.1,0.035,0.008),[0,H+0.05,0.0]),{tone:1}));
  // opening: lit room behind
  root.add(ctx.mesh(at(G.box(W,H,0.02),[0,H/2,-0.4]),{tone:0.3,glow:1.5}));
  for(const s of [-1,1])root.add(ctx.mesh(at(G.box(0.02,H,0.36),[s*W/2,H/2,-0.21]),{tone:0.55}));
  root.add(ctx.mesh(at(G.box(W,0.02,0.36),[0,H,-0.21]),{tone:0.5}),ctx.mesh(at(G.box(W,0.02,0.4),[0,0.01,-0.2]),{tone:0.6}));
  // the door leaf (hinged on the left)
  const hinge=new THREE.Group();hinge.position.set(-W/2+0.004,0,-0.025);root.add(hinge);
  const leaf=new THREE.Group();leaf.position.x=W/2-0.004;hinge.add(leaf);
  leaf.add(ctx.mesh(at(G.box(W-0.008,H-0.01,T),[0,H/2,0]),{tone:0.88}));
  const pan=(x:number,y:number,w:number,h:number)=>{for(const z of [T/2,-T/2]){const s=z>0?1:-1;
   leaf.add(ctx.mesh(at(G.box(w,h,0.004),[x,y,z-s*0.003]),{tone:0.62}));
   leaf.add(ctx.mesh(at(G.rbox(w-0.05,h-0.05,0.012,0.005),[x,y,z+s*0.001]),{tone:0.98}));}};
  const pw=0.3;for(const x of [-0.17,0.17]){pan(x,1.62,pw,0.58);pan(x,1.0,pw,0.32);pan(x,0.42,pw,0.62);}
  for(const y of [0.2,1.02,1.86])root.add(ctx.mesh(at(G.rbox(0.025,0.1,0.03,0.004),[-W/2+0.004,y,-0.01]),{tone:0.5}));
  for(const s of [1,-1]){
   leaf.add(ctx.mesh(at(G.rbox(0.05,0.17,0.008,0.003),[W/2-0.08,1.0,s*(T/2+0.004)]),{tone:0.75,rough:0.25}));
   leaf.add(ctx.mesh(at(G.cyl(0.011,0.011,0.03,16),[W/2-0.08,1.03,s*(T/2+0.018)],[90,0,0]),{tone:0.8}));
   leaf.add(ctx.mesh(at(G.capsule(0.011,0.1,6,12),[W/2-0.13,1.03,s*(T/2+0.034)],[0,0,90]),{tone:1,rough:0.2}));
   leaf.add(ctx.mesh(at(G.cyl(0.008,0.008,0.004,16),[W/2-0.08,0.96,s*(T/2+0.008)],[90,0,0]),{tone:0.15}));
  }
  return {root,grounded:true,update(c){hinge.rotation.y=-ease4(clamp(c.open??0))*deg(100);}};
 },
});

export const umbrella=defineModel({
 id:'umbrella',aliases:['parasol','brolly','rain','protection','insurance'],
 describe:'An open umbrella: eight scalloped fabric panels between visible ribs, a tip finial, long shaft and a curved J handle. `open` 0 folded .. 1 open.',
 controls:{open:'0 folded .. 1 open (default 1)'},defaults:{open:1},size:'1 m wide, 0.9 m tall',
 build(ctx){
  const root=new THREE.Group();const N=8,R=0.52,Hc=0.24,top=0.88;
  const canopy=new THREE.Group();canopy.position.y=top;root.add(canopy);
  const rib=(u:number,a:number):THREE.Vector3=>{const r=R*Math.sin(u*Math.PI/2*1.05);const y=-Hc*(1-Math.cos(u*Math.PI/2))*1.1;return new THREE.Vector3(Math.cos(a)*r,y,Math.sin(a)*r);};
  const pos:number[]=[];const SU=14,SV=10;
  for(let i=0;i<N;i++){const a0=i/N*Math.PI*2,a1=(i+1)/N*Math.PI*2;
   const P=(u:number,v:number)=>{const p=rib(u,lerp(a0,a1,v));const a=lerp(a0,a1,v);const chord=Math.cos(Math.PI/N)/Math.cos(a-(a0+a1)/2);const sag=1-0.06*Math.sin(Math.PI*v)*u;p.x*=chord*sag;p.z*=chord*sag;p.y+=0.035*Math.sin(Math.PI*v)*u*u;return p;};
   for(let s=0;s<SU;s++)for(let t=0;t<SV;t++){const a=P(s/SU,t/SV),b=P((s+1)/SU,t/SV),c=P((s+1)/SU,(t+1)/SV),d=P(s/SU,(t+1)/SV);pos.push(a.x,a.y,a.z,c.x,c.y,c.z,b.x,b.y,b.z,a.x,a.y,a.z,d.x,d.y,d.z,c.x,c.y,c.z);}}
  const cg=new THREE.BufferGeometry();cg.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));cg.computeVertexNormals();
  canopy.add(ctx.mesh(cg,{tone:0.9,rough:0.7,side:THREE.DoubleSide}));
  for(let i=0;i<N;i++){const a=i/N*Math.PI*2;const pts:V3[]=[];for(let k=0;k<=8;k++){const p=rib(k/8,a);p.multiplyScalar(1.004);pts.push([p.x,p.y+0.004,p.z]);}
   canopy.add(ctx.mesh(G.tube(pts,0.005,24,6),{tone:0.55}));
   const e=rib(1,a);canopy.add(ctx.mesh(at(G.sphere(0.011,8,6),[e.x,e.y,e.z]),{tone:1}));
   const s0=rib(0.45,a);canopy.add(ctx.mesh(G.tube([[0,-0.3,0],[s0.x*0.98,s0.y-0.01,s0.z*0.98]],0.003,4,5),{tone:0.5}));}
  canopy.add(ctx.mesh(at(G.cone(0.012,0.09,12),[0,0.05,0]),{tone:0.9}),ctx.mesh(at(G.cyl(0.02,0.026,0.03,16),[0,0.01,0]),{tone:0.7}));
  root.add(ctx.mesh(at(G.cyl(0.008,0.008,top-0.12,12),[0,0.12+(top-0.12)/2,0]),{tone:0.75,rough:0.25}));
  root.add(ctx.mesh(at(G.cyl(0.018,0.016,0.04,16),[0,top-0.32,0]),{tone:0.6}));
  root.add(ctx.mesh(G.tube([[0,0.16,0],[0,0.06,0],[0.01,0.0,0],[0.05,-0.035,0],[0.095,-0.01,0],[0.105,0.03,0]],0.016,32,12),{tone:0.5,rough:0.5}));
  return {root,grounded:true,update(c){const o=ease4(clamp(c.open??1));canopy.scale.set(lerp(0.09,1,o),lerp(2.4,1,o),lerp(0.09,1,o));canopy.position.y=top+lerp(-0.0,0,o);}};
 },
});

export const headphones=defineModel({
 id:'headphones',aliases:['headset','earphones','music','listening','audio','podcast'],
 describe:'Over-ear headphones seen from the front: padded headband with metal sliders, swivel yokes and big round ear cups with thick cushions and an outer cap ring. `bob` bounces them to a beat.',
 controls:{bob:'0..1 bounce to music'},defaults:{bob:0},size:'0.2 m',
 build(ctx){
  const root=new THREE.Group(),inner=new THREE.Group();root.add(inner);
  const arc=(r:number,thick:number,tone:number,z=0)=>{const pts:V3[]=[];for(let i=0;i<=24;i++){const a=deg(15+i/24*150);pts.push([Math.cos(a)*r,Math.sin(a)*r,z]);}return ctx.mesh(G.tube(pts,thick,64,12),{tone});};
  inner.add(arc(0.088,0.007,0.7));
  const pad=arc(0.08,0.011,0.45);pad.scale.set(1,1,1.4);inner.add(pad);
  // stitching ridge on the pad
  inner.add(arc(0.0905,0.0025,1,0));
  for(const s of [-1,1]){
   const side=new THREE.Group();side.position.x=s*0.085;inner.add(side);
   side.add(ctx.mesh(at(G.box(0.004,0.04,0.012),[s*0.002,0.0,0]),{tone:1,rough:0.2}));
   // yoke: fork around the cup
   side.add(ctx.mesh(G.tube([[0,-0.015,0],[s*0.006,-0.03,0.035],[s*0.008,-0.07,0.044],[s*0.008,-0.1,0.03]],0.0035,24,8),{tone:0.8}));
   side.add(ctx.mesh(G.tube([[0,-0.015,0],[s*0.006,-0.03,-0.035],[s*0.008,-0.07,-0.044],[s*0.008,-0.1,-0.03]],0.0035,24,8),{tone:0.8}));
   const cup=new THREE.Group();cup.position.set(s*0.008,-0.075,0);side.add(cup);
   cup.add(ctx.mesh(at(G.lathe([[0,0],[0.038,0],[0.042,0.006],[0.043,0.02],[0.04,0.028],[0.03,0.032],[0,0.033]],40),[0,0,0],[0,0,s*90]),{tone:0.85,rough:0.35}));
   cup.add(ctx.mesh(at(G.torus(0.032,0.003,8,40),[s*0.031,0,0],[0,90,0]),{tone:0.5}));
   cup.add(ctx.mesh(at(G.cyl(0.024,0.024,0.004,32),[s*0.0335,0,0],[0,0,90]),{tone:0.65}));
   cup.add(ctx.mesh(at(G.torus(0.031,0.012,14,40),[-s*0.005,0,0],[0,90,0],[1,1,1.0]),{tone:0.5,rough:0.9}));
   cup.add(ctx.mesh(at(G.cyl(0.022,0.022,0.004,28),[-s*0.012,0,0],[0,0,90]),{tone:0.25}));
  }
  return {root,grounded:false,update(c,t){const b=c.bob??0;inner.position.y=Math.abs(Math.sin(t*Math.PI*2*1.0))*0.008*b;inner.rotation.z=Math.sin(t*Math.PI*2*0.5)*0.05*b;}};
 },
});

export const giftBox=defineModel({
 id:'gift-box',aliases:['gift','present','giftbox','reward','surprise','bonus'],
 describe:'A wrapped gift box with a crossing ribbon and a big looped bow on the lid. `open` lifts the lid off and tilts it; a glow pours out (`glow`).',
 controls:{open:'0 closed .. 1 lid off',glow:'0..1 light from inside when open (default 1)'},defaults:{open:0,glow:1},size:'0.3 m',
 build(ctx){
  const root=new THREE.Group();const S=0.28,Hb=0.24,lidH=0.06,rw=0.04;
  root.add(ctx.mesh(at(G.rbox(S,Hb,S,0.006),[0,Hb/2,0]),{tone:0.62,rough:0.8}));
  root.add(ctx.mesh(at(G.box(S-0.03,0.002,S-0.03),[0,Hb+0.001,0]),{tone:0.9,glow:2.6,glowControl:'_inside'}));
  for(const r of [0,90])root.add(ctx.mesh(at(G.box(rw,Hb-0.003,S+0.004),[0,Hb/2,0],[0,r,0]),{tone:1,rough:0.4}));
  const lid=new THREE.Group();lid.position.set(0,Hb-lidH*0.6,0);root.add(lid);
  lid.add(ctx.mesh(at(G.rbox(S+0.016,lidH,S+0.016,0.006),[0,lidH/2,0]),{tone:0.72,rough:0.8}));
  for(const r of [0,90]){lid.add(ctx.mesh(at(G.box(rw,lidH+0.002,S+0.02),[0,lidH/2,0],[0,r,0]),{tone:1,rough:0.4}));lid.add(ctx.mesh(at(G.box(rw,0.003,S+0.02),[0,lidH+0.001,0],[0,r,0]),{tone:1,rough:0.4}));}
  // bow
  const bow=new THREE.Group();bow.position.y=lidH;lid.add(bow);
  for(const [ry,tilt] of [[0,1],[180,1],[90,0.8],[270,0.8]] as const){const loop=G.torus(0.045,0.011,10,32);loop.scale(1,1,0.35);const m=ctx.mesh(loop,{tone:1,rough:0.4});m.position.set(Math.cos(deg(ry))*0.04*tilt,0.04*tilt,-Math.sin(deg(ry))*0.04*tilt);m.rotation.set(0,deg(ry)+Math.PI/2,deg(-35)*(ry%180===0?1:1));bow.add(m);}
  bow.add(ctx.mesh(at(G.sphere(0.022,16,10),[0,0.018,0]),{tone:0.95}));
  for(const s of [-1,1])bow.add(ctx.mesh(G.tube([[0,0.01,0],[s*0.04,0.004,0.05],[s*0.07,0.003,0.1]],0.0035,12,6).scale(1,1,1),{tone:0.95}));
  const glowM=root.children[1] as THREE.Mesh;
  return {root,grounded:true,update(c){const o=clamp(c.open??0);const up=ease4(clamp(o*1.4));const tilt=ease4(clamp(o*1.6-0.5));
   lid.position.set(-tilt*0.12,Hb-lidH*0.6+up*0.2,0);lid.rotation.z=tilt*deg(28);
   const m=glowM.material as THREE.MeshStandardMaterial;m.emissiveIntensity=(m.userData.glow as number)*o*(c.glow??1);}};
 },
});

export const pill=defineModel({
 id:'pill',aliases:['capsule','tablet','medicine','medication','drug','pills','supplement','vitamin'],
 describe:'A two-tone medicine capsule floating at a tilt (bright cap over a darker body, visible seam). kind:"tablet" shows a round scored tablet; count scatters a few.',
 params:{kind:'capsule (default) | tablet',count:'1..8'},size:'2 cm',
 build(ctx){
  const kind=ctx.str('kind','capsule',['capsule','tablet'] as const),n=Math.round(ctx.num('count',1,1,8)),r=rng(ctx.seed);
  const root=new THREE.Group();
  const one=()=>{const g=new THREE.Group();
   if(kind==='tablet'){g.add(ctx.mesh(G.lathe([[0,-0.0022],[0.0045,-0.0024],[0.0068,-0.0019],[0.0078,-0.001],[0.0079,0.001],[0.0068,0.0019],[0.0045,0.0024],[0,0.0022]],48),{tone:0.95,rough:0.8}));
    g.add(ctx.mesh(at(G.box(0.0145,0.0012,0.0009),[0,0.0023,0]),{tone:0.35}));g.rotation.x=deg(65);return g;}
   const rr=0.0034;
   g.add(ctx.mesh(at(G.capsule(rr,0.0095,10,28),[0,-0.0032,0]),{tone:0.5,rough:0.25}));
   g.add(ctx.mesh(at(G.capsule(rr*1.06,0.0085,10,28),[0,0.0042,0]),{tone:1,rough:0.25}));
   g.add(ctx.mesh(at(G.torus(rr*1.06,0.00025,6,32),[0,-0.0001,0],[90,0,0]),{tone:0.3}));
   g.rotation.z=deg(-50);return g;};
  if(n===1){const g=one();root.add(g);return {root,grounded:false,update(_c,t){g.rotation.y=Math.sin(t*0.6)*0.3;}};}
  for(let i=0;i<n;i++){const g=one();const a=i/n*Math.PI*2+r();g.position.set(Math.cos(a)*0.014*(0.5+r()),(r()-0.5)*0.008,Math.sin(a)*0.012*(0.5+r()));g.rotation.y=r()*6;root.add(g);}
  return {root,grounded:false};
 },
});

export const syringe=defineModel({
 id:'syringe',aliases:['injection','vaccine','needle','shot','jab','vaccination','hypodermic'],
 describe:'A medical syringe lying horizontally (needle to the right): clear barrel with printed graduation marks and liquid inside, finger flange, ribbed plunger rod with thumb press and dark rubber stopper, needle hub and long thin needle. `push` drives the plunger in and empties the liquid.',
 controls:{push:'0 full .. 1 plunger fully in (empty)'},defaults:{push:0},size:'0.14 m',
 build(ctx){
  const root=new THREE.Group();const BR=0.0065,BL=0.065,x0=-BL/2;
  const ax=(g:THREE.BufferGeometry)=>g.rotateZ(-Math.PI/2); // y axis -> +x
  root.add(glassy(ctx.mesh(ax(G.lathe([[BR,0],[BR,BL],[BR*0.55,BL+0.004],[0.0022,BL+0.006],[0.0022,BL+0.0075],[BR*0.98,BL+0.0002],[BR*0.94,BL],[BR*0.94,0]],40)).translate(x0,0,0),{tone:0.85,rough:0.15,side:THREE.DoubleSide}),0.38));
  root.add(ctx.mesh(at(G.rbox(0.0028,0.03,0.016,0.0012),[x0-0.0004,0,0]),{tone:0.8}));
  const ticks:THREE.BufferGeometry[]=[];for(let i=0;i<=20;i++){const L=i%5===0?0.0055:0.003;ticks.push(at(G.box(0.0005,L,0.0004),[x0+0.006+i*0.0027,BR-L/2+0.001,0],[0,0,0]));}
  const tk=G.merge(ticks);tk.rotateX(deg(-55));root.add(ctx.mesh(tk,{tone:0.15}));
  // liquid
  const liq=ctx.mesh(ax(G.cyl(BR*0.9,BR*0.9,1,32)).translate(0.5,0,0),{tone:1,glow:0.5,glowControl:'_l'});const liqG=grp(liq);root.add(liqG);
  // hub + needle
  root.add(ctx.mesh(ax(G.lathe([[0.0028,0],[0.0028,0.002],[0.0034,0.0025],[0.003,0.008],[0.0012,0.0095],[0,0.0096]],24)).translate(x0+BL+0.006,0,0),{tone:0.75}));
  for(let i=0;i<4;i++)root.add(ctx.mesh(at(G.box(0.006,0.0009,0.0072),[x0+BL+0.011,0,0],[i*45,0,0]),{tone:0.6}));
  root.add(ctx.mesh(ax(G.cyl(0.00045,0.00045,0.038,8)).translate(x0+BL+0.015+0.019,0,0),{tone:1,rough:0.2}));
  root.add(ctx.mesh(at(G.cone(0.00045,0.003,8),[x0+BL+0.0545,0,0],[0,0,-90]),{tone:1}));
  // plunger
  const pl=new THREE.Group();root.add(pl);
  pl.add(ctx.mesh(ax(G.lathe([[0,0],[BR*0.92,0],[BR*0.94,0.0015],[BR*0.9,0.002],[BR*0.94,0.0035],[BR*0.92,0.0055],[0,0.0055]],32)).translate(0,0,0),{tone:0.15}));
  const rod=G.merge([at(G.box(0.07,0.0012,0.0085),[-0.035,0,0]),at(G.box(0.07,0.0085,0.0012),[-0.035,0,0])]);pl.add(ctx.mesh(rod,{tone:0.85}));
  pl.add(ctx.mesh(at(G.cyl(0.0095,0.0095,0.0018,32),[-0.0705,0,0],[0,0,90]),{tone:0.9}));
  const set=(p:number)=>{const head=lerp(x0+0.003,x0+BL-0.0055,p);pl.position.x=head;liqG.position.x=head+0.0055;liqG.scale.x=Math.max(0.0001,x0+BL-(head+0.0055));liqG.visible=p<0.995;};
  set(0);
  return {root,grounded:false,update(c){set(clamp(c.push??0));}};
 },
});

export const thermometer=defineModel({
 id:'thermometer',aliases:['temperature','fever','heat','climate','thermostat','global-warming'],
 describe:'A classic liquid thermometer on a backing board: bright scale with major/minor ticks, glass tube with a bulb and a glowing liquid column. `level` 0 cold .. 1 hot moves the column.',
 controls:{level:'0 empty .. 1 top (default 0.45)',glow:'0..1 liquid glow (default 1)'},defaults:{level:0.45,glow:1},size:'0.3 m tall',
 build(ctx){
  const root=new THREE.Group();const H=0.3,W=0.07;
  root.add(ctx.mesh(at(G.extrude([[-W/2,0.02],[-W/2,H-0.025],[-W/2+0.004,H-0.008],[0,H],[W/2-0.004,H-0.008],[W/2,H-0.025],[W/2,0.02],[W/2-0.012,0],[-W/2+0.012,0]],0.012,0.003),[0,0,-0.006]),{tone:0.62}));
  root.add(ctx.mesh(at(G.cyl(0.0045,0.0045,0.004,16),[0,H-0.018,0.003],[90,0,0]),{tone:0.2}));
  const y0=0.075,y1=H-0.04;
  const ticks:THREE.BufferGeometry[]=[];for(let i=0;i<=40;i++){const y=y0+0.01+(y1-y0-0.015)*i/40;const big=i%10===0,mid=i%5===0;const L=big?0.016:mid?0.011:0.006;
   for(const s of [-1,1])ticks.push(at(G.box(L,big?0.0016:0.001,0.002),[s*(0.008+L/2),y,0.0015]));
   if(big)for(const s of [-1,1])ticks.push(at(G.box(0.006,0.007,0.002),[s*0.03,y,0.0015]));}
  root.add(ctx.mesh(G.merge(ticks),{tone:1}));
  // glass tube + bulb
  root.add(glassy(ctx.mesh(at(G.capsule(0.0042,y1-y0+0.004,8,20),[0,(y0+y1)/2+0.002,0.009]),{tone:0.9,rough:0.15}),0.4));
  root.add(ctx.mesh(at(G.sphere(0.0095,24,16),[0,y0-0.006,0.009]),{tone:1,glow:1.6,rough:0.2}));
  root.add(ctx.mesh(at(G.cyl(0.0035,0.0035,0.012,12),[0,y0,0.009]),{tone:1,glow:1.6}));
  const col=ctx.mesh(at(G.cyl(0.0021,0.0021,1,12),[0,0.5,0]),{tone:1,glow:1.6});const cg=grp(col);cg.position.set(0,y0,0.009);root.add(cg);
  return {root,grounded:true,update(c){cg.scale.y=Math.max(0.0005,(y1-y0-0.004)*clamp(c.level??0.45));}};
 },
});
