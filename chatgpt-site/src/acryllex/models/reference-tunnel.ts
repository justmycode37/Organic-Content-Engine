import * as THREE from 'three';
import {G,at,deg,lerp,clamp,depthFade} from '../kit.ts';
import {defineModel} from './types.ts';

// ================================================================= tunnel (camera flies inside)
/** Superellipse (rounded-square) outline, half-width a, half-height b. */
function squircle(a:number,b:number,n:number,e=4):[number,number][]{const pts:[number,number][]=[];for(let i=0;i<n;i++){const t=i/n*Math.PI*2;const c=Math.cos(t),s2=Math.sin(t);pts.push([a*Math.sign(c)*Math.pow(Math.abs(c),2/e),b*Math.sign(s2)*Math.pow(Math.abs(s2),2/e)]);}return pts;}
/** Open tube along -z with a squircle cross-section (normals point inward). */
function squircleTube(a:number,b:number,len:number,n:number,m:number,exponent=4){const ring=squircle(a,b,n,exponent);const pos:number[]=[],idx:number[]=[];
 for(let j=0;j<=m;j++)for(const [x,y] of ring)pos.push(x,y,-len*j/m+len/2);
 for(let j=0;j<m;j++)for(let i=0;i<n;i++){const a0=j*n+i,a1=j*n+(i+1)%n,b0=a0+n,b1=a1+n;idx.push(a0,b0,a1,a1,b0,b1);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();return g;}

export const tunnel=defineModel({
 id:'tunnel',aliases:['corridor','wormhole','tube-tunnel','go-deeper','rabbit-hole','hyperloop'],
 describe:'Inside a long round sci-fi tunnel: smooth curved wall panels with faint ribs, a light bar on the ceiling, a light on the floor and two diagonal light strips on the upper walls, repeating into a black depth void. Put the camera inside (camera.pos [0,0,1], look [0,0,-10]). `fly` 0..1 speed of travel.',
 controls:{fly:'0 slow .. 1 fast travel (default 0.5)',glow:'lights 0..1 (default 1)',depth:'0 near walls only .. 1 full depth',ceiling:'ceiling light intensity 0..1 (default 1)',travel:'optional absolute travel distance in metres'},defaults:{fly:0.5,glow:1,depth:1},params:{radius:'m (default 1.6)',fog:'depth fade distance m (default 9)',spacing:'m between light sets (default 2.6)',direction:'forward | backward',phase:'initial longitudinal offset in metres',exponent:'cross-section exponent: 2 round .. 8 rounded square',ratio:'cross-section width / height (default 1.2)',revealStart:'visible-depth fraction when depth=0 (default .35)',fadePower:'depth fade power (default 1)',wallTone:'wall albedo (default .55)',sideWidth:'side strip width m (default .22)',sideLength:'side strip length m (default 1.2)',sideGlow:'side strip emission (default .8)',sideAngle:'side strip angle from vertical, degrees (default 45)',lampPower:'local lamp intensity (default .35)',ceilingWidth:'ceiling fixture width m (default .62)',ceilingLength:'ceiling fixture length m (default .32)',floorWidth:'floor fixture width m (default .22)',floorLength:'floor fixture length m (default .5)',ribInset:'rib width into the tunnel m (default .09)',ribTone:'rib albedo (default .85)',lights:'false hides fixtures',ribs:'false hides ribs',timeOrigin:'travel starts at this scene time',acceleration:'travel acceleration m/s² (default 0)'},size:'3.2 m wide, endless',
 build(ctx){
  const root=new THREE.Group();const R=ctx.num('radius',1.6,0.5,10),fog=ctx.num('fog',9,2,40),sp=ctx.num('spacing',2.6,0.8,10),exponent=ctx.num('exponent',4,2,8);const N=Math.ceil(48/sp);
  const segs=new THREE.Group();root.add(segs);
  const fades:{uniforms:ReturnType<typeof depthFade>;light:boolean}[]=[];const lamps:THREE.PointLight[]=[];
  const ratio=ctx.num('ratio',1.2,.7,2),sideAngle=ctx.num('sideAngle',45,15,75);
  // Walls extend behind the camera. Moving decorative segments cannot open a gap or change their tone.
  const wall=ctx.mesh(at(squircleTube(R*ratio,R,64,128,32,exponent),[0,0,-24]),{tone:ctx.num('wallTone',.55,.05,1),side:THREE.DoubleSide,rough:1});
  root.add(wall);fades.push({uniforms:depthFade(wall.material as THREE.MeshStandardMaterial),light:false});
  for(let i=-2;i<N;i++){const g=new THREE.Group();g.position.z=-i*sp;
   // A shallow joint at every panel interval.
   if(ctx.bool('ribs',true))g.add(ctx.mesh(at(G.extrude(squircle(R*ratio+0.02,R+0.02,96,exponent),0.12,0,[squircle(R*ratio-ctx.num('ribInset',.09,.01,R*.5),R-ctx.num('ribInset',.09,.01,R*.5),96,exponent).reverse()]),[0,0,0]),{tone:ctx.num('ribTone',.85,.05,1)}));
   // lights: ceiling bar, floor light, diagonal strips at 10 and 2 o'clock
   if(ctx.bool('lights',true)){
   g.add(ctx.mesh(at(G.rbox(ctx.num('ceilingWidth',.62,.1,2),0.07,ctx.num('ceilingLength',.32,.1,3),0.03),[0,R*0.97,0]),{tone:0.9,glow:1.6,glowControl:'ceiling'}));
   g.add(ctx.mesh(at(G.rbox(ctx.num('floorWidth',.22,.04,1),0.06,ctx.num('floorLength',.5,.1,3),0.02),[0,-R*0.97,-0.3]),{tone:0.9,glow:1.4}));
   for(const sgn of [-1,1]){const a=deg(90+sgn*sideAngle),x=Math.sign(Math.cos(a))*Math.pow(Math.abs(Math.cos(a)),2/exponent)*(R*ratio-.04),y=Math.pow(Math.abs(Math.sin(a)),2/exponent)*(R-.04);
    g.add(ctx.mesh(at(G.rbox(ctx.num('sideWidth',.22,.02,.6),0.035,ctx.num('sideLength',1.2,.2,4),0.015),[x,y,-sp*0.5],[0,0,sgn*sideAngle]),{tone:0.6,glow:ctx.num('sideGlow',.8,0,3)}));
    if(i>=-1&&i<=4){const lamp=new THREE.PointLight(0xffffff,ctx.num('lampPower',.35,0,4),R*5,2);lamp.position.set(x*.94,y*.94,-sp*.5);g.add(lamp);lamps.push(lamp);}
   }
   }
   g.traverse(o=>{const m=(o as THREE.Mesh).material as THREE.MeshStandardMaterial|undefined;if(m)fades.push({uniforms:depthFade(m),light:!!m.userData.glow});});
   segs.add(g);}
  const direction=ctx.str('direction','forward',['forward','backward'] as const)==='backward'?-1:1;
  return {root,grounded:false,anchors:{inside:[0,0,1]},update(c,t){
   const time=Math.max(0,t-ctx.num('timeOrigin',0,0,20));
   const travel=c.travel??(time*(0.6+(c.fly??0.5)*5)+.5*ctx.num('acceleration',0,0,20)*time*time);
   const off=direction*(travel%sp)+ctx.num('phase',0,-sp,sp);segs.position.z=off;
   const depth=fog*lerp(ctx.num('revealStart',.35,.05,1),1,clamp(c.depth??1));
   for(const f of fades){f.uniforms.near.value=depth*.12;f.uniforms.far.value=depth*(f.light?1.15:1);f.uniforms.power.value=f.light ? .75 : ctx.num('fadePower',1,.2,4);}
   for(const lamp of lamps)lamp.intensity=ctx.num('lampPower',.35,0,4)*(c.glow??1);
  }};
 },
});
