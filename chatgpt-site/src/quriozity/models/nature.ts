import * as THREE from 'three';
import {G,at,deg,rng,lerp,clamp,smooth,roughen} from '../kit.ts';
import {defineModel,type ModelCtx} from './types.ts';
import type {MatOpts} from '../kit.ts';

// ===================================================================== shared helpers
const TAU=Math.PI*2;
function h3(x:number,y:number,z:number){const s=Math.sin(x*127.1+y*311.7+z*74.7)*43758.5453;return s-Math.floor(s);}
/** Smooth 3D value noise in [-1,1]. */
function vnoise(x:number,y:number,z:number){
 const xi=Math.floor(x),yi=Math.floor(y),zi=Math.floor(z),xf=x-xi,yf=y-yi,zf=z-zi;
 const u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf),w=zf*zf*(3-2*zf);
 const c=(a:number,b:number,d:number)=>h3(xi+a,yi+b,zi+d);
 const x00=lerp(c(0,0,0),c(1,0,0),u),x10=lerp(c(0,1,0),c(1,1,0),u),x01=lerp(c(0,0,1),c(1,0,1),u),x11=lerp(c(0,1,1),c(1,1,1),u);
 return lerp(lerp(x00,x10,v),lerp(x01,x11,v),w)*2-1;
}
function fbm(x:number,y:number,z:number,oct=4){let a=0,amp=0.5,f=1;for(let i=0;i<oct;i++){a+=amp*vnoise(x*f,y*f,z*f);f*=2.03;amp*=0.5;}return a;}
const sstep=(a:number,b:number,x:number)=>smooth((x-a)/(b-a));

/** Per-vertex brightness (multiplies the part's tone) so one mesh can carry land/sea, snow/rock, bands… */
function toneAttr(geo:THREE.BufferGeometry,fn:(x:number,y:number,z:number,i:number)=>number){
 const p=geo.attributes.position!;const col=new Float32Array(p.count*3);
 for(let i=0;i<p.count;i++){const k=clamp(fn(p.getX(i),p.getY(i),p.getZ(i),i),0.02,1);col[i*3]=k;col[i*3+1]=k;col[i*3+2]=k;}
 geo.setAttribute('color',new THREE.BufferAttribute(col,3));return geo;
}
function vmesh(ctx:ModelCtx,geo:THREE.BufferGeometry,opts:MatOpts={}){const m=ctx.mesh(geo,opts);(m.material as THREE.MeshStandardMaterial).vertexColors=true;return m;}

/** Make a material partly see-through (stipple via alphaHash) while still honouring the engine's fade in/out. */
function seeThrough(m:THREE.Mesh,k:number){
 const mat=m.material as THREE.Material&{_reveal?:number};mat._reveal=1;
 Object.defineProperty(mat,'opacity',{configurable:true,get(){return (this._reveal??1)*k;},set(v:number){this._reveal=v;}});
}

/** Many small copies of one template moved every frame by rewriting one position buffer (particles, drops, sparks). */
class Swarm {
 mesh:THREE.Mesh;private pos:THREE.BufferAttribute;private tpl:Float32Array;private per:number;
 constructor(ctx:ModelCtx,public n:number,template:THREE.BufferGeometry,opts:MatOpts){
  const t=template.index?template.toNonIndexed():template;if(!t.attributes.normal)t.computeVertexNormals();
  this.tpl=Float32Array.from(t.attributes.position!.array as ArrayLike<number>);this.per=t.attributes.position!.count;
  const nrm=t.attributes.normal!.array as ArrayLike<number>;
  const P=new Float32Array(n*this.per*3),N=new Float32Array(n*this.per*3);
  for(let i=0;i<n;i++)for(let j=0;j<this.per*3;j++)N[i*this.per*3+j]=nrm[j]!;
  const g=new THREE.BufferGeometry();this.pos=new THREE.BufferAttribute(P,3);g.setAttribute('position',this.pos);g.setAttribute('normal',new THREE.BufferAttribute(N,3));
  this.mesh=ctx.mesh(g,opts);this.mesh.frustumCulled=false;
 }
 set(i:number,x:number,y:number,z:number,s:number,sy=s){
  const a=this.pos.array as Float32Array,o=i*this.per*3,T=this.tpl;
  for(let j=0;j<this.per;j++){a[o+j*3]=x+T[j*3]!*s;a[o+j*3+1]=y+T[j*3+1]!*sy;a[o+j*3+2]=z+T[j*3+2]!*s;}
 }
 done(){this.pos.needsUpdate=true;}
}

/** Teardrop lathe profile: round bottom at y=0, pointed tip at y=h. */
function dropProfile(w:number,h:number,n=40,sharp=1.6):[number,number][]{
 const out:[number,number][]=[];
 for(let i=0;i<=n;i++){const t=Math.PI*(1-i/n);// t: π (bottom) -> 0 (tip)
  const x=w*Math.sin(t)*Math.pow(Math.sin(t/2),sharp),y=(1-Math.cos(t))/2;out.push([Math.max(0,x),h*(1-y)]);}
 out[0]=[0,0];out[n]=[0,h];
 return out;
}

// ===================================================================== earth
// Land mask: Natural Earth 110m land (public domain), rasterised to 240x120 equirectangular (1.5°/cell),
// row 0 = 90°N, column 0 = 180°W. Each row is run lengths alternating sea/land (starting with sea),
// one char per run from AL (0..62); runs >62 are split with a zero-length run of the other kind.
const LAND_ROWS=[
"_0_0_0s","_0_0_0s","_0_0_0s","_0_0_0s","_0W9_0_0D","xH2R33_0_05",
"u6382XO6D2S5s","j1431214174YL5s3o","e2J67XM3u2o","g412333241FRq4JEG4O","b3gOp2JFl","b4131112231226HMo2926W72P",
"02D1M138622CDKo3731b2DI1","BF64213B111251479KT9I1431v752","027Z4242142264AFUG323218131_08","03126r685DWI3I1_09","324r11472178C6H6364_0V","Dl22125597D2I72_0g1",
"Am613332B5W82_0X182","AB1ZB6F2W92_0S556","C5AUB622k84_0I212242B","F111DRBAb1B35_0FC3C","D1IU7Ab272133_0GC5B","A1MW2FX11271411_0FE4C",
"V12V2GV2133_0U93D","ZV1FZ42_0U91F","Zf22a23_0V11O","ac1243X11_0WR","be71X_0XR","bhdL21273vS",
"bb21g929753v32O","baf85237943r53O","bZg7822624263oY","bYh6A1223F3i111282P","cWi6A1322F3h4371Q","dUl33113B_013253Q",
"dUl21892411u4226Q","fRlCHu83T","gOmG328w61W","h11LmI1_06d","h11C2151ld2ld","h219A1jV292kd",
"j118A211fX194he","j127tX29227Yf","n6sZ2D7W21d","o5C1fa1E6D2Ej","o55263ca2CA949n","p533A2Za2BB77812k",
"r8mb29C68892c","t126jb27E5911781d","x6id14H3C871d","_2jfK3D791b","_0117111ad32H2G39111a","_0215216WhH2H1n",
"_0312CVgK1B2F2a","_06DVfK1D1F1a","_06HT63TW12282f","_07HeQW21272g","_06IePY21155f","_05KdNb3461321Y",
"_04NbMd2457121V","_04OaLe335128112R","_04SXKf351412147O","_04UWIh2L5N","_04VVIi221E12661F","_05UWHm3F41271D",
"_06SXIt1F2K","_06RYI_0V","_07QYIy441O","_07PYJ51p11532O","_08OYJ43n833N","_0AMYH44nB13N",
"_0BLYG54mHM","_0BKaE72lKA1A","_0BKaF53jNA19","_0BIdE53iPJ","_0BFgD62jQI","_0BFgCsQI",
"_0BFgCsQI","_0AFiAuPI","_0AEk8vPI","_0ADl7w84DI","_0ACm5y67119J","_0AA_0_068F14",
"_09B_0_077G13","_09A_0_09211I31","_098_0_0X22","_096_0_0G2H13","_096_0_0G2F24","_086_0_0W26",
"_085_0_0W36","_086_0_0e","_085_0_0f","_084_0_0g","_08452_0_0Z","_094_0_0f",
"_0A5_0_0d","_0_0_0s","_0_0_0s","_0_0_0s","_0_0_0s","_0_0_0s",
"_0I2_0_0Y","_0F1_0_0c","_0D2_0F4K184253AT","_0D1_0BH7kL","_0A6_01P4uE","_09314a1221j2_037",
"y1E4W_0z6","f48QV_0x9","MrV_0zB","E1122oU_0_05B","B23qJ45_0_0B9","Mm9146B_0_02D",
"Hz923_0_0CC","I_0_0_0S8","0AF_0_0_0T","0_0_0_0s","0_0_0_0s","0_0_0_0s",
];
const AL='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_';
const MW=240,MH=120;
let LAND:Float32Array|null=null;
function landMask(){
 if(LAND)return LAND;
 const raw=new Float32Array(MW*MH);
 LAND_ROWS.forEach((row,y)=>{let x=0,v=0;for(const ch of row){const n=AL.indexOf(ch);for(let k=0;k<n&&x<MW;k++)raw[y*MW+x++]=v;v=1-v;}});
 // light blur so coastlines interpolate smoothly across the sphere's triangles
 const out=new Float32Array(MW*MH);
 for(let y=0;y<MH;y++)for(let x=0;x<MW;x++){let s=0,w=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const yy=clamp(y+dy,0,MH-1),xx=(x+dx+MW)%MW;const k=dx===0&&dy===0?4:(dx===0||dy===0?2:1);s+=raw[yy*MW+xx]!*k;w+=k;}out[y*MW+x]=s/w;}
 LAND=out;return out;
}
/** 0 sea .. 1 land at latitude/longitude in degrees. */
function landAt(lat:number,lon:number){
 const m=landMask();const u=(lon+180)/360*MW-0.5,v=(90-lat)/180*MH-0.5;
 const x0=Math.floor(u),y0=Math.floor(v),fx=u-x0,fy=v-y0;
 const g=(x:number,y:number)=>m[clamp(y,0,MH-1)*MW+((x%MW)+MW)%MW]!;
 return lerp(lerp(g(x0,y0),g(x0+1,y0),fx),lerp(g(x0,y0+1),g(x0+1,y0+1),fx),fy);
}
/** Unit-sphere point for lat/lon (deg): lon 0 faces +z, east is +x (to the viewer's right). */
function llPoint(lat:number,lon:number,r=1):[number,number,number]{const a=deg(lat),b=deg(lon);return [r*Math.cos(a)*Math.sin(b),r*Math.sin(a),r*Math.cos(a)*Math.cos(b)];}
const CITIES:[number,number,number][]=[// lat, lon, size
 [40.7,-74,3],[34,-118.2,3],[41.9,-87.6,2],[29.8,-95.4,2],[19.4,-99.1,3],[43.7,-79.4,2],[25.8,-80.2,2],[37.8,-122.4,2],[47.6,-122.3,1],[33.7,-84.4,1],[32.8,-96.8,2],[38.9,-77,2],[45.5,-73.6,1],[39.7,-105,1],[42.4,-71,2],[33.4,-112,1],[49.3,-123.1,1],
 [4.7,-74.1,2],[-12,-77,2],[-23.5,-46.6,3],[-22.9,-43.2,2],[-34.6,-58.4,2],[-33.4,-70.6,1],[10.5,-66.9,1],
 [51.5,-0.1,3],[48.9,2.35,3],[40.4,-3.7,2],[52.5,13.4,2],[41.9,12.5,2],[55.75,37.6,3],[41,29,3],[52.2,21,1],[50.45,30.5,1],[59.3,18,1],[45.5,9.2,2],[41.4,2.2,1],[52.4,4.9,2],[53.55,10,1],[38.7,-9.1,1],[38,23.7,1],[50.9,4.4,1],[48.2,16.4,1],[53.5,-2.2,1],
 [30,31.2,3],[6.5,3.4,3],[-4.3,15.3,2],[-26.2,28,2],[-1.3,36.8,1],[9,38.7,1],[33.6,-7.6,1],[5.6,-0.2,1],[15.6,32.5,1],[14.7,-17.4,1],
 [24.7,46.7,1],[25.2,55.3,1],[35.7,51.4,2],[33.3,44.4,1],[24.9,67,2],[31.5,74.3,2],[28.6,77.2,3],[19,72.8,3],[22.6,88.4,2],[13,77.6,2],[13.1,80.3,1],[23.8,90.4,3],[17.4,78.5,1],[26.9,80.9,1],
 [13.75,100.5,2],[-6.2,106.8,3],[14.6,121,2],[1.35,103.8,1],[10.8,106.7,2],[21,105.8,1],
 [39.9,116.4,3],[31.2,121.5,3],[23.1,113.3,3],[29.6,106.5,2],[30.6,114.3,2],[34.3,108.9,1],[22.3,114.2,2],[25,121.5,1],[37.6,127,3],[35.7,139.7,3],[34.7,135.5,2],[39.1,117.2,1],[41.8,123.4,1],
 [41.3,69.3,1],[55,82.9,1],[56.8,60.6,1],[43.2,76.9,1],
 [-33.9,151.2,2],[-37.8,145,2],[-32,115.9,1],[-27.5,153,1],[-36.8,174.8,1],
];

function buildEarth(ctx:ModelCtx,face:number){
 const root=new THREE.Group(),tilt=new THREE.Group(),spin=new THREE.Group();root.add(tilt);tilt.add(spin);
 tilt.rotation.z=deg(-18);
 const geo=new THREE.SphereGeometry(1,200,100);const p=geo.attributes.position!;const base:number[]=[];
 for(let i=0;i<p.count;i++){
  const x=p.getX(i),y=p.getY(i),z=p.getZ(i);const lat=Math.asin(clamp(y,-1,1))*180/Math.PI,lon=Math.atan2(x,z)*180/Math.PI;
  const l=sstep(0.3,0.62,landAt(lat,lon));const n=fbm(x*5,y*5,z*5,3);
  const ice=sstep(64,72,Math.abs(lat))*(lat<0?1:0.6);
  const r=1+l*(0.016+0.008*n)+ice*0.004;p.setXYZ(i,x*r,y*r,z*r);
  base.push(Math.max(lerp(0.17+0.03*n,0.92+0.08*n,l),ice));
 }
 geo.computeVertexNormals();toneAttr(geo,(_x,_y,_z,i)=>base[i]!);
 const globe=vmesh(ctx,geo,{tone:1,rough:0.7});spin.add(globe);
 const col=geo.attributes.color as THREE.BufferAttribute;
 // city lights (night side)
 const r=rng(ctx.seed+11),lights:THREE.BufferGeometry[]=[];
 for(const [la,lo,s] of CITIES)for(let k=0;k<1+s*3;k++){const a=la+(k?(r()-0.5)*s*2.4:0),b=lo+(k?(r()-0.5)*s*3:0);if(landAt(a,b)<0.4)continue;lights.push(at(G.sphere(k?0.007:0.011,6,4),llPoint(a,b,1.022)));}
 const city=ctx.mesh(G.merge(lights),{tone:0.25,glow:3.5,glowControl:'night'});city.visible=false;spin.add(city);
 let lastNight=-1;
 return {root,grounded:false as const,update(c:Record<string,number>,t:number){
  spin.rotation.y=deg(-face)+t*0.2*(c.spin??1);
  const night=clamp(c.night??0);
  if(Math.abs(night-lastNight)>0.004){lastNight=night;const k=1-0.6*night;for(let i=0;i<base.length;i++){const v=base[i]!*k;col.setXYZ(i,v,v,v);}col.needsUpdate=true;city.visible=night>0.02;}
 }};
}

const FACES:Record<string,number>={atlantic:-25,africa:20,europe:12,americas:-80,'north-america':-95,'south-america':-60,asia:95,india:78,china:105,pacific:-160,australia:135};
export const earth=defineModel({
 id:'earth',aliases:['globe','world','planet-earth','the-earth','world-map'],
 describe:'Planet Earth: a globe with real raised bright continents and darker oceans, tilted axis, slowly spinning; `night` darkens it and lights glowing city dots.',
 params:{face:'which side faces the viewer first: atlantic (default) | africa | europe | americas | north-america | south-america | asia | india | china | pacific | australia'},
 controls:{night:'0 day .. 1 night side with glowing city lights (default 0)',spin:'spin speed multiplier (default 1, 0 stops)'},
 defaults:{night:0,spin:1},size:'2 m diameter display',
 build(ctx){return buildEarth(ctx,FACES[ctx.str('face','atlantic',Object.keys(FACES))]??-25);},
});

// ===================================================================== planets
type PlanetKind='saturn'|'jupiter'|'mars'|'generic';
function buildPlanet(ctx:ModelCtx,kind:PlanetKind){
 const root=new THREE.Group(),spin=new THREE.Group();root.add(spin);
 const geo=new THREE.SphereGeometry(1,128,80);const p=geo.attributes.position!;const s=ctx.seed%13;
 if(kind==='jupiter'||kind==='saturn'){
  const spot=new THREE.Vector3(...llPoint(-22,25));
  toneAttr(geo,(x,y,z)=>{
   const lat=Math.asin(clamp(y,-1,1));const sw=fbm(x*3+s,y*9,z*3,3)*(kind==='jupiter'?0.16:0.06);
   const b=Math.sin((lat+sw)*(kind==='jupiter'?11:14));let k=kind==='jupiter'?0.66+0.3*Math.sign(b)*Math.pow(Math.abs(b),0.5):0.8+0.16*b;
   if(kind==='jupiter'){const d=Math.hypot((x-spot.x)/0.24,(y-spot.y)/0.12,(z-spot.z)/0.24);if(d<1.4)k=d<0.75?0.42:d<1.05?1:k;}
   return k*(0.94+0.06*vnoise(x*14,y*30,z*14));
  });
  geo.scale(1,kind==='saturn'?0.9:0.93,1);
 }else{
  const rr=rng(ctx.seed+5);const craters=Array.from({length:kind==='mars'?22:14},()=>({c:new THREE.Vector3(rr()-0.5,rr()-0.5,rr()-0.5).normalize(),s:0.05+rr()*0.14}));
  const v=new THREE.Vector3();const tones:number[]=[];
  for(let i=0;i<p.count;i++){v.set(p.getX(i),p.getY(i),p.getZ(i));let d=0;for(const c of craters){const a=v.angleTo(c.c)/c.s;if(a<1.25)d+=a<1?-(1-a*a)*0.035*c.s*3:0.015*c.s*3*(1.25-a)*4;}
   const n=fbm(v.x*2.2+s,v.y*2.2,v.z*2.2,4);const lat=Math.asin(clamp(v.y,-1,1))*180/Math.PI;
   let k:number;
   if(kind==='mars'){const cap=sstep(66,74,Math.abs(lat)+n*8);const canyon=Math.exp(-Math.pow((lat+9)/2.2,2))*sstep(-130,-100,Math.atan2(v.x,v.z)*180/Math.PI)*(1-sstep(-55,-35,Math.atan2(v.x,v.z)*180/Math.PI));
    d+=cap*0.012-canyon*0.03;k=Math.max(n<-0.05?0.5:0.78+0.15*n,cap)-canyon*0.35;}
   else k=0.62+0.6*n;
   tones.push(k);v.multiplyScalar(1+d+n*0.012);p.setXYZ(i,v.x,v.y,v.z);}
  geo.computeVertexNormals();toneAttr(geo,(_x,_y,_z,i)=>tones[i]!);
 }
 spin.add(vmesh(ctx,geo,{tone:1}));
 if(kind==='saturn'){
  const rings=new THREE.Group();
  const bands:[number,number,number][]=[[1.22,1.48,0.42],[1.5,1.62,0.78],[1.62,1.78,0.95],[1.78,1.93,1],[1.98,2.12,0.82],[2.14,2.16,0.55],[2.17,2.27,0.75],[2.3,2.34,0.5]];
  for(const [a,b,k] of bands){const g=new THREE.RingGeometry(a,b,160,1);g.rotateX(-Math.PI/2);rings.add(ctx.mesh(g,{tone:k,side:THREE.DoubleSide,rough:0.9}));}
  root.add(rings);root.rotation.set(deg(22),0,deg(-14));
 }else root.rotation.z=deg(kind==='jupiter'?-3:-20);
 return {root,grounded:false as const,update(c:Record<string,number>,t:number){spin.rotation.y=t*0.22*(c.spin??1);}};
}
const planetCommon={controls:{spin:'spin speed multiplier (default 1)'},defaults:{spin:1}};
export const planet=defineModel({
 id:'planet',aliases:['exoplanet','gas-giant','solar-system-planet'],...planetCommon,
 describe:'A planet floating in space, slowly spinning: kind saturn (banded ball with wide flat rings and gaps), jupiter (strong cloud bands + great red spot), mars (cratered, dark patches, white polar caps, canyon) or generic rocky world.',
 params:{kind:'saturn (default) | jupiter | mars | generic'},size:'2 m diameter display',
 build(ctx){return buildPlanet(ctx,ctx.str('kind','saturn',['saturn','jupiter','mars','generic'] as const));},
});
export const saturn=defineModel({id:'saturn',aliases:['ringed-planet','planet-rings'],...planetCommon,describe:'Saturn: banded planet with wide tilted rings (gaps between ring bands), slowly spinning.',build:ctx=>buildPlanet(ctx,'saturn')});
export const jupiter=defineModel({id:'jupiter',aliases:['great-red-spot'],...planetCommon,describe:'Jupiter: big gas giant with turbulent horizontal cloud bands and the great red spot oval, slowly spinning.',build:ctx=>buildPlanet(ctx,'jupiter')});
export const mars=defineModel({id:'mars',aliases:['red-planet'],...planetCommon,describe:'Mars: cratered rocky planet with darker regions, white polar ice caps and a long canyon scar, slowly spinning.',build:ctx=>buildPlanet(ctx,'mars')});

// ===================================================================== galaxy
export const galaxy=defineModel({
 id:'galaxy',aliases:['milky-way','spiral-galaxy','universe','stars','cosmos','nebula'],
 describe:'A spiral galaxy of thousands of star dots: glowing bright core, two curving arms and faint haze, tilted toward the viewer and slowly rotating.',
 params:{arms:'2..4 (default 2)'},controls:{spin:'rotation speed multiplier (default 1)'},defaults:{spin:1},size:'5 m across display',
 build(ctx){
  const arms=Math.round(ctx.num('arms',2,2,4)),r=rng(ctx.seed),root=new THREE.Group(),disc=new THREE.Group();root.add(disc);root.rotation.set(deg(58),0,deg(-12));
  const tpl=new THREE.OctahedronGeometry(1,0);const T=tpl.attributes.position!.array as ArrayLike<number>,TN=(()=>{tpl.computeVertexNormals();return tpl.attributes.normal!.array as ArrayLike<number>;})();
  const bins:number[][]=[[],[],[]];// [x,y,z,size]
  const gauss=()=>{let a=0;for(let i=0;i<4;i++)a+=r();return (a-2)/1.15;};
  for(let i=0;i<6500;i++){const a=i%arms;const f=Math.pow(r(),0.75);const R=0.22+2.3*f;const th=a*TAU/arms+Math.log(R/0.22)*2.1+gauss()*0.22*(1-f*0.4);const w=gauss()*(0.07+0.2*f);
   const x=Math.cos(th)*R+Math.cos(th+Math.PI/2)*w,z=Math.sin(th)*R+Math.sin(th+Math.PI/2)*w,y=gauss()*0.03*(1.4-f);
   (r()<0.3?bins[0]!:bins[1]!).push(x,y,z,0.008+r()*0.012*(1-f*0.4));}
  for(let i=0;i<3200;i++){const R=0.1+Math.pow(r(),1.4)*2.7,th=r()*TAU;bins[2]!.push(Math.cos(th)*R,gauss()*0.05,Math.sin(th)*R,0.007+r()*0.008);}
  for(let i=0;i<1800;i++){const v=new THREE.Vector3(gauss(),gauss()*0.55,gauss()).multiplyScalar(0.28);bins[0]!.push(v.x,v.y,v.z,0.009+r()*0.01);}
  const mk=(list:number[])=>{const n=list.length/4,per=T.length/3,P=new Float32Array(n*per*3),N=new Float32Array(n*per*3);
   for(let i=0;i<n;i++){const [x,y,z,s]=[list[i*4]!,list[i*4+1]!,list[i*4+2]!,list[i*4+3]!];for(let j=0;j<per;j++){const o=(i*per+j)*3;P[o]=x+T[j*3]!*s;P[o+1]=y+T[j*3+1]!*s;P[o+2]=z+T[j*3+2]!*s;N[o]=TN[j*3]!;N[o+1]=TN[j*3+1]!;N[o+2]=TN[j*3+2]!;}}
   const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(P,3));g.setAttribute('normal',new THREE.BufferAttribute(N,3));return g;};
  disc.add(ctx.mesh(mk(bins[0]!),{tone:1,glow:1.6}),ctx.mesh(mk(bins[1]!),{tone:0.85,glow:0.5}),ctx.mesh(mk(bins[2]!),{tone:0.6,glow:0.3}));
  disc.add(ctx.mesh(G.ellipsoid(0.2,0.1,0.2,24,16),{tone:1,glow:3}));
  return {root,grounded:false,update(c,t){disc.rotation.y=-t*0.12*(c.spin??1);}};
 },
});

// ===================================================================== trees
type Sway={group:THREE.Object3D;amp:number;freq:number;phase:number};
function leafyClump(rx:number,ry:number,rz:number,seed:number){return roughen(G.ellipsoid(rx,ry,rz,28,20),Math.min(rx,ry)*0.09,9/Math.min(rx,1.2),seed);}

function buildOak(ctx:ModelCtx,root:THREE.Group,sways:Sway[]){
 const r=rng(ctx.seed+1);const bark={tone:0.5};
 root.add(ctx.mesh(roughen(G.lathe([[0.42,0],[0.3,0.08],[0.22,0.3],[0.19,0.8],[0.18,1.5],[0.16,2.0],[0.12,2.3],[0,2.35]],28),0.015,24,3),bark));
 const crown=new THREE.Group();crown.position.y=1.9;root.add(crown);sways.push({group:crown,amp:0.012,freq:1.1,phase:0});
 const tips:[number,number,number][]=[];
 const limbs:THREE.BufferGeometry[]=[];
 for(let i=0;i<6;i++){const a=i/6*TAU+r()*0.5,out=0.9+r()*0.5,up=0.9+r()*0.7;const tip:[number,number,number]=[Math.cos(a)*out,up,Math.sin(a)*out*0.8];tips.push(tip);
  limbs.push(G.tube([[0,-0.2,0],[tip[0]*0.35,tip[1]*0.5,tip[2]*0.35],tip],0.07-i*0.004,16,7));
  limbs.push(G.tube([[tip[0]*0.6,tip[1]*0.7,tip[2]*0.6],[tip[0]*0.9+Math.cos(a+1)*0.35,tip[1]*1.05+0.25,tip[2]*0.9+Math.sin(a+1)*0.3]],0.035,8,6));}
 crown.add(ctx.mesh(G.merge(limbs),bark));
 const clumps:THREE.BufferGeometry[]=[];
 // a dome of leaf clumps around the branch tips, leaving gaps low down so branches show
 const spots:[number,number,number,number][]=[[0,1.55,0,0.95],[0,1.05,0,0.9]];
 tips.forEach(([x,y,z],i)=>{spots.push([x*1.05,y+0.15,z*1.05,0.62+r()*0.2]);spots.push([x*0.55,y+0.55,z*0.55,0.6+r()*0.2]);if(i%2===0)spots.push([x*1.25,y-0.25,z*1.25,0.45+r()*0.12]);});
 spots.forEach(([x,y,z,s],i)=>clumps.push(at(leafyClump(s,s*0.82,s,i+ctx.seed%5),[x,y,z])));
 crown.add(ctx.mesh(G.merge(clumps),{tone:0.9}));
}
function buildPine(ctx:ModelCtx,root:THREE.Group,sways:Sway[]){
 root.add(ctx.mesh(at(G.cyl(0.06,0.17,1.2,16),[0,0.6,0]),{tone:0.5}));
 const crown=new THREE.Group();root.add(crown);sways.push({group:crown,amp:0.01,freq:0.9,phase:1});
 const tiers=7;
 for(let i=0;i<tiers;i++){const k=i/(tiers-1);const R=lerp(1.25,0.3,k),h=lerp(1.25,0.75,k),y0=0.75+i*0.58;
  const g=G.lathe([[0,h],[R*0.25,h*0.82],[R*0.62,h*0.4],[R,0.04],[R*0.9,-0.04],[R*0.55,0.12],[0,0.2]],48);
  const p=g.attributes.position!;for(let j=0;j<p.count;j++){const x=p.getX(j),z=p.getZ(j),y=p.getY(j);const a=Math.atan2(z,x);const rr=Math.hypot(x,z);const jag=1+0.13*Math.pow(Math.abs(Math.sin(a*7+i)),3)*sstep(0,R,rr)-0.05*Math.sin(a*13+i*2);p.setXYZ(j,x*jag,y-0.12*Math.pow(rr/R,2)*Math.abs(Math.sin(a*7+i)),z*jag);}
  g.computeVertexNormals();crown.add(ctx.mesh(at(g,[0,y0,0],[0,i*23,0]),{tone:0.88}));}
 crown.add(ctx.mesh(at(G.cone(0.1,0.5,10),[0,0.75+tiers*0.58+0.25,0]),{tone:0.9}));
}
/** Palm: curved ringed trunk, arching feathery fronds, coconuts. Height ~4.6 m. */
function buildPalm(ctx:ModelCtx,root:THREE.Group,sways:Sway[],lean=1){
 const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(0,0,0),new THREE.Vector3(0.12*lean,1.4,0),new THREE.Vector3(0.45*lean,2.9,0),new THREE.Vector3(0.95*lean,4.2,0)]);
 const segs:THREE.BufferGeometry[]=[];const n=16;
 for(let i=0;i<n;i++){const a=curve.getPoint(i/n),b=curve.getPoint((i+1)/n);const len=a.distanceTo(b);const r0=lerp(0.2,0.12,i/n);
  const g=G.lathe([[r0*0.92,0],[r0*1.06,len*0.15],[r0,len*0.8],[r0*0.9,len*1.02]],18);
  const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize());g.applyQuaternion(q);g.translate(a.x,a.y,a.z);segs.push(g);}
 root.add(ctx.mesh(G.merge(segs),{tone:0.6}));
 const top=curve.getPoint(1);const crown=new THREE.Group();crown.position.copy(top);root.add(crown);sways.push({group:crown,amp:0.04,freq:1.3,phase:2});
 crown.add(ctx.mesh(G.sphere(0.2,14,10),{tone:0.6}));
 for(let i=0;i<4;i++){const a=i/4*TAU+0.4;crown.add(ctx.mesh(at(G.sphere(0.12,14,10),[Math.cos(a)*0.17,-0.2,Math.sin(a)*0.17]),{tone:0.45}));}
 const fronds:THREE.BufferGeometry[]=[],ribs:THREE.BufferGeometry[]=[];const r=rng(ctx.seed+7);
 const F=10;for(let f=0;f<F;f++){const az=f/F*TAU+r()*0.3,up=f%2?0.55:0.15;const L=1.9+r()*0.4;
  const pts:THREE.Vector3[]=[];for(let k=0;k<=12;k++){const s=k/12;const h=Math.sin(up+0.9)*s*L*0.9-s*s*L*(0.75+up*0.3);pts.push(new THREE.Vector3(Math.cos(az)*s*L,h+0.05,Math.sin(az)*s*L));}
  const c=new THREE.CatmullRomCurve3(pts);ribs.push(new THREE.TubeGeometry(c,16,0.022,5,false));
  for(let k=1;k<22;k++){const s=k/22;const p0=c.getPoint(s),tan=c.getTangent(s);const side=new THREE.Vector3().crossVectors(tan,new THREE.Vector3(0,1,0)).normalize();const ll=0.55*Math.sin(Math.PI*Math.pow(s,0.7))+0.08;
   for(const sg of [1,-1]){const dir=side.clone().multiplyScalar(sg).addScaledVector(tan,0.55).add(new THREE.Vector3(0,-0.45,0)).normalize();
    const g=G.box(0.05,0.008,ll);g.translate(0,0,ll/2);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),dir));g.translate(p0.x,p0.y,p0.z);fronds.push(g);}}}
 crown.add(ctx.mesh(G.merge(ribs),{tone:0.75}),ctx.mesh(G.merge(fronds),{tone:0.92,side:THREE.DoubleSide}));
}

export const tree=defineModel({
 id:'tree',aliases:['oak','oak-tree','forest','plant-tree','deciduous-tree'],
 describe:'A tree, swaying gently in the breeze: kind oak (thick trunk, spreading branches, round leafy canopy), pine (tall tiered spiky conifer) or palm (curved ringed trunk, arching feathery fronds, coconuts); `wind` makes it sway harder.',
 params:{kind:'oak (default) | pine | palm'},controls:{wind:'0 still breeze .. 1 strong wind'},size:'4-6 m tall',
 build(ctx){
  return treeOf(ctx.str('kind','oak',['oak','pine','palm'] as const))(ctx);
 },
});
function treeOf(kind:'oak'|'pine'|'palm'){return (ctx:ModelCtx)=>{const root=new THREE.Group(),sways:Sway[]=[];
 if(kind==='pine')buildPine(ctx,root,sways);else if(kind==='palm')buildPalm(ctx,root,sways);else buildOak(ctx,root,sways);
 return {root,grounded:true,update(c:Record<string,number>,t:number){const w=c.wind??0;for(const s of sways){const a=Math.sin(t*s.freq*(1+w*0.6)+s.phase)*s.amp*(1+w*3)+Math.sin(t*s.freq*2.3+s.phase*2)*s.amp*0.25;s.group.rotation.z=a-w*s.amp*2.5;s.group.rotation.x=Math.sin(t*s.freq*0.7+s.phase)*s.amp*0.45;}}};};}
export const pine=defineModel({id:'pine-tree',aliases:['pine','fir','fir-tree','spruce','conifer','christmas-tree','evergreen'],describe:'A tall pine/fir tree: short trunk under seven stacked spiky drooping tiers narrowing to a point, swaying; `wind` sways harder.',controls:{wind:'0..1'},size:'5 m',build:treeOf('pine')});
export const palm=defineModel({id:'palm-tree',aliases:['palm','coconut-tree','tropical-tree','coconut-palm'],describe:'A tropical palm tree: curved ringed trunk, arching feathery fronds and coconuts, swaying; `wind` sways harder.',controls:{wind:'0..1'},size:'4.6 m',build:treeOf('palm')});

// ===================================================================== mountain
export const mountain=defineModel({
 id:'mountain',aliases:['mountains','mountain-range','peak','alps','himalayas','everest','hill','hills','summit'],
 describe:'A mountain range: a tall central snow-capped peak with smaller jagged peaks either side, rocky ridges and gullies, white snow above the snow line; `snow` 0 bare rock .. 1 heavy snow.',
 params:{peaks:'3..7 (default 5)'},controls:{snow:'snow cover (default 0.5)'},defaults:{snow:0.5},size:'10 m wide display',
 build(ctx){
  const r=rng(ctx.seed+2);const np=Math.round(ctx.num('peaks',5,3,7));
  const peaks:{x:number;z:number;h:number;r:number}[]=[{x:0,z:-0.4,h:3.4,r:2.7}];
  for(let i=1;i<np;i++){const side=i%2?-1:1,rank=Math.ceil(i/2);peaks.push({x:side*(rank*2.1+r()*0.5),z:-0.6+r()*1.2,h:3.4*(0.75-rank*0.17+r()*0.1),r:2.1-rank*0.25});}
  const W=11,D=6.5;const geo=G.plane(W,D,220,130);geo.rotateX(-Math.PI/2);const p=geo.attributes.position!;
  const hs=new Float32Array(p.count);
  for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i);
   const wx=x+fbm(x*0.4,z*0.4,3.1,2)*0.6,wz=z+fbm(x*0.4,z*0.4,7.7,2)*0.6;let h=0;
   for(const q of peaks){const u=Math.hypot(wx-q.x,(wz-q.z)*1.15)/q.r;if(u<1){const ridge=1-Math.abs(vnoise(Math.atan2(wz-q.z,wx-q.x)*2.2+q.x,u*2,q.h));h=Math.max(h,q.h*Math.pow(1-u,1.35)*(0.82+0.3*ridge*u));}}
   let rid=0,amp=0.4,f=0.9;for(let o=0;o<4;o++){rid+=amp*(1-Math.abs(vnoise(x*f,z*f,o*3.3)));f*=2.1;amp*=0.5;}
   h+=rid*0.55*sstep(0,1.5,h)-0.1;
   const edge=sstep(1,0.72,Math.hypot(x/(W/2),z/(D/2)));h=Math.max(0,h)*edge;hs[i]=h;p.setY(i,h);}
  geo.computeVertexNormals();const nrm=geo.attributes.normal!;
  const col=new Float32Array(p.count*3);geo.setAttribute('color',new THREE.BufferAttribute(col,3));
  const m=vmesh(ctx,geo,{tone:1,rough:0.8});
  const paint=(snow:number)=>{const line=lerp(3.4,0.9,snow);for(let i=0;i<p.count;i++){const h=hs[i]!,ny=nrm.getY(i);const n=fbm(p.getX(i)*1.3,h*2,p.getZ(i)*1.3,3);
   const s=snow<=0.01?0:sstep(line-0.15,line+0.15,h+n*0.45)*sstep(0.35,0.6,ny+n*0.2);const rock=0.48+0.14*n+0.1*ny;const k=lerp(h<0.25?0.4:rock,1,s);col[i*3]=k;col[i*3+1]=k;col[i*3+2]=k;}
   (geo.attributes.color as THREE.BufferAttribute).needsUpdate=true;};
  let last=-1;
  return {root:m,grounded:true,update(c){const s=clamp(c.snow??0.5);if(Math.abs(s-last)>0.01){last=s;paint(s);}}};
 },
});

// ===================================================================== volcano
export const volcano=defineModel({
 id:'volcano',aliases:['eruption','lava','magma','mount-st-helens','vesuvius'],
 describe:'A cone volcano with ridged gullied slopes, a crater glowing with lava and lava streams; `erupt` blasts glowing lava bombs and a rising ash plume from the crater.',
 controls:{erupt:'0 quiet .. 1 full eruption'},size:'6 m wide display',
 build(ctx){
  const root=new THREE.Group();
  const prof:[number,number][]=[];const H=2.1,rim=0.55;
  for(let i=0;i<=60;i++){const k=i/60;const rr=lerp(3.1,rim,Math.pow(k,0.75));prof.push([rr,H*(1-Math.pow(1-k,1.6))]);}
  prof.push([rim*0.85,H-0.1],[rim*0.6,H-0.32],[0,H-0.36]);
  const g=G.lathe(prof,160);const p=g.attributes.position!;
  for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i);const a=Math.atan2(z,x),rr=Math.hypot(x,z);const k=y/H;
   const gul=(Math.pow(Math.abs(Math.sin(a*11+fbm(rr,a,1,2)*2)),0.6)-0.6)*0.12*sstep(0.05,0.4,k)*(1-sstep(0.9,1,k))+fbm(x*1.5,y*1.5,z*1.5,3)*0.12;
   const f=rr>0.01?(rr+gul)/rr:1;p.setXYZ(i,x*f,y+fbm(x,z,3,2)*0.05*(1-k),z*f);}
  g.computeVertexNormals();
  root.add(vmesh(ctx,toneAttr(g,(x,y,z)=>{const k=y/H;return 0.55+0.3*k+0.1*fbm(x*3,y*3,z*3,2)-(Math.hypot(x,z)<rim*0.9&&y>H-0.4?0.3:0);}),{tone:1}));
  const lava=ctx.mesh(at(G.cyl(rim*0.62,rim*0.62,0.06,32),[0,H-0.33,0]),{tone:1,glow:2,glowControl:'_lava'});root.add(lava);
  const flows:THREE.BufferGeometry[]=[];const r=rng(ctx.seed+3);
  for(const a0 of [0.4,1.3,-0.5]){const pts:[number,number,number][]=[];for(let k=0;k<=8;k++){const s=k/8;const a=a0+Math.sin(s*5+a0)*0.12;const rr=lerp(rim,2.2,s);const kk=Math.pow(clamp((3.1-rr)/(3.1-rim)),1/0.75);const y=H*(1-Math.pow(1-kk,1.6));pts.push([Math.cos(a)*(rr+0.03),y+0.03,Math.sin(a)*(rr+0.03)]);}
   flows.push(G.tube(pts,0.045,40,6));}
  const flow=ctx.mesh(G.merge(flows),{tone:1,glow:1.4,glowControl:'_flow'});root.add(flow);
  const bombs=new Swarm(ctx,70,G.sphere(1,6,5),{tone:1,glow:3.5});root.add(bombs.mesh);
  const ash=new Swarm(ctx,48,roughen(G.sphere(1,18,12),0.14,3,2),{tone:0.72,rough:0.95});root.add(ash.mesh);
  const bv=Array.from({length:70},()=>({vx:(r()-0.5)*2.4,vz:(r()-0.5)*2.4,vy:3.2+r()*2.4,o:r(),s:0.06+r()*0.06}));
  const av=Array.from({length:48},()=>({x:(r()-0.5)*0.4,z:(r()-0.5)*0.4,o:r(),s:0.22+r()*0.22,d:r()*TAU,sp:0.4+r()*0.9}));
  const lm=lava.material as THREE.MeshStandardMaterial,fm=flow.material as THREE.MeshStandardMaterial;
  return {root,grounded:true,update(c,t){const e=clamp(c.erupt??0);
   lm.userData.glow=1.6+3*e;fm.userData.glow=1.2+1.2*e;
   bv.forEach((b,i)=>{const ph=(t*0.55+b.o)%1,tt=ph*1.6;const on=e>0.02&&i/bv.length<e*1.05;
    if(!on){bombs.set(i,0,H-0.3,0,0);return;}const y=H-0.2+b.vy*tt-4.9*tt*tt*0.9;bombs.set(i,b.vx*tt,Math.max(0,y),b.vz*tt,y<0.05?0:b.s);});
   av.forEach((a,i)=>{const ph=(t*0.12+a.o)%1;const on=e>0.02&&i/av.length<e*1.1;if(!on){ash.set(i,0,H-0.3,0,0);return;}
    const k=ph,R=a.sp*(0.15+k*1.3*k);ash.set(i,a.x+Math.cos(a.d)*R+k*0.6,H+Math.pow(k,0.8)*3.6*e,a.z+Math.sin(a.d)*R*0.8,(a.s+k*0.75)*smooth(k*6)*e);});
   bombs.done();ash.done();}};
 },
});

// ===================================================================== cloud
function cloudGeometry(seed:number,storm:boolean){
 const r=rng(seed);const puffs:THREE.BufferGeometry[]=[];const L=storm?2.1:1.6;
 // crown of big domes on top, smaller puffs around the base; flat underside
 const tops:[number,number,number,number][]=[[0,0.62,0,0.78],[-0.75,0.48,0.05,0.6],[0.7,0.52,-0.05,0.64],[-0.25,0.85,-0.1,0.55],[0.3,0.9,0.05,0.5],[-1.3,0.3,0,0.42],[1.3,0.34,0.05,0.44]];
 for(const [x,y,z,s] of tops)puffs.push(at(G.sphere(s,40,28),[x*L/1.6,y*(storm?0.75:1),z],[0,0,0],[1,0.92,0.95]));
 for(let i=0;i<18;i++){const a=i/18*TAU+r()*0.2;const x=Math.cos(a)*L*(0.75+r()*0.15),z=Math.sin(a)*0.62;const s=0.28+r()*0.16;puffs.push(at(G.sphere(s,24,16),[x,s*0.5,z]));}
 const g=G.merge(puffs);const p=g.attributes.position!;
 for(let i=0;i<p.count;i++){const y=p.getY(i);if(y<0.08)p.setY(i,0.08-(0.08-y)*0.12);}
 g.computeVertexNormals();roughen(g,0.025,7,seed%9);return g;
}
export const cloud=defineModel({
 id:'cloud',aliases:['cumulus','clouds','rain-cloud','storm-cloud','raincloud','weather','rain'],
 describe:'A puffy cumulus cloud: billowing round domes on top, flat darker base, drifting gently; `rain` drops falling streaks of rain below it. params.storm:true makes a wider, darker storm cloud.',
 params:{storm:'true | false (default)'},controls:{rain:'0 none .. 1 heavy rain'},size:'3.4 m wide display',
 build(ctx){
  const storm=ctx.bool('storm',false);const root=new THREE.Group(),body=new THREE.Group();root.add(body);
  body.add(ctx.mesh(cloudGeometry(ctx.seed,storm),{tone:storm?0.62:1,rough:0.95}));
  const N=160,r=rng(ctx.seed+4);const L=storm?2.1:1.6;
  const drops=new Swarm(ctx,N,G.capsule(0.012,0.14,3,6),{tone:storm?0.85:0.75});root.add(drops.mesh);
  const dv=Array.from({length:N},()=>({x:(r()-0.5)*L*1.7,z:(r()-0.5)*1.1,o:r(),v:0.9+r()*0.3}));
  return {root,grounded:false,update(c,t){
   body.position.y=Math.sin(t*0.8)*0.03;body.position.x=Math.sin(t*0.37)*0.04;
   const rain=clamp(c.rain??0);
   dv.forEach((d,i)=>{const on=rain>0.01&&i/N<rain;if(!on){drops.set(i,d.x,0.5,d.z,0);return;}const ph=(t*1.1*d.v+d.o)%1;const y=0.05-ph*3.2;
    const k=smooth(ph*12)*smooth((1-ph)*6);drops.set(i,d.x-ph*0.15,y,d.z,k,k*1.1);});drops.done();}};
 },
});

// ===================================================================== lightning
export const lightning=defineModel({
 id:'lightning',aliases:['lightning-bolt','bolt','thunder','thunderbolt','electricity','storm','spark'],
 describe:'A jagged glowing lightning bolt with forked branches striking straight down to the ground, flickering; `strike` 0..1 draws it from the sky down (default 1 = full bolt). params.style:"icon" gives the classic chunky zig-zag ⚡ symbol instead.',
 params:{style:'real (default) | icon'},controls:{strike:'0 hidden .. 1 bolt fully drawn (animate 0→1 for the strike)'},defaults:{strike:1},size:'4 m tall',
 build(ctx){
  const root=new THREE.Group();
  if(ctx.str('style','real',['real','icon'] as const)==='icon'){
   const pts:[number,number][]=[[0.15,1],[-0.35,-0.05],[-0.02,-0.05],[-0.2,-1],[0.38,0.18],[0.04,0.18],[0.3,1]];
   const m=ctx.mesh(G.extrude(pts.map(([x,y])=>[x*1.2,y*1.2] as [number,number]),0.22,0.04),{tone:1,glow:1.6,glowControl:'strike'});root.add(m);
   return {root,grounded:false,update(c,t){const s=clamp(c.strike??1);m.scale.setScalar(Math.max(0.001,ease3(s)));m.rotation.y=Math.sin(t*0.9)*0.25;}};
  }
  const r=rng(ctx.seed+9);
  type Seg={m:THREE.Mesh;k:number;base:number};const segs:Seg[]=[];
  const bolt=(from:THREE.Vector3,dir:THREE.Vector3,len:number,steps:number,rad:number,k0:number,depth:number):THREE.Vector3=>{
   let p=from.clone();
   for(let i=0;i<steps;i++){
    const step=len/steps;if(depth&&p.y<0.35)break;const q=p.clone().addScaledVector(dir,step);q.x+=(r()-0.5)*step*0.9;q.z+=(r()-0.5)*step*0.6;
    const d=q.clone().sub(p);const L=d.length();const g=G.cyl(rad,rad,L+rad,6);g.translate(0,L/2,0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.clone().normalize()));g.translate(p.x,p.y,p.z);
    const k=Math.max(k0,(4-p.y)/4);
    const m=ctx.mesh(g,{tone:1,glow:depth?2.5:4.5});root.add(m);segs.push({m,k:clamp(k),base:depth?2.5:4.5});
    if(depth<2&&i>1&&i<steps-2&&r()<(depth?0.25:0.45)){const nd=new THREE.Vector3((r()-0.5)*2,-1,(r()-0.5)*0.8).normalize();bolt(q,nd,len*(0.25+r()*0.25)/(depth+1),Math.max(3,Math.round(steps*0.45)),rad*0.55,k,depth+1);}
    p=q;rad*=0.985;}
   return p;
  };
  const end=bolt(new THREE.Vector3(0,4,0),new THREE.Vector3(0,-1,0),4,22,0.03,0,0);
  // ground flash
  const flash=ctx.mesh(at(G.sphere(0.09,16,8),[end.x,0,end.z],[0,0,0],[1,0.35,1]),{tone:0.5,glow:2});root.add(flash);
  return {root,grounded:true,update(c,t){
   const s=clamp(c.strike??1);const head=s*1.08;
   // flicker: stroke pulses (bright, dim, bright) then a steady glow
   const fl=0.55+0.45*Math.pow(Math.abs(Math.sin(t*23)),3)*Math.abs(Math.sin(t*3.1));
   for(const g of segs){g.m.visible=g.k<=head;(g.m.material as THREE.MeshStandardMaterial).userData.glow=g.base*(g.k>head-0.1&&s<1?1.4:fl);}
   flash.visible=s>=0.98;(flash.material as THREE.MeshStandardMaterial).userData.glow=2*fl;}};
 },
});
const ease3=(k:number)=>1-Math.pow(1-clamp(k),3);

// ===================================================================== water drop, snowflake, ice
export const raindrop=defineModel({
 id:'raindrop',aliases:['water-drop','drop','droplet','water-droplet','teardrop','drip'],
 describe:'A glossy water drop: round bottom tapering to a pointed tip, with a bright highlight; bobs gently.',
 size:'0.3 m display',
 build(ctx){
  const root=new THREE.Group(),drop=new THREE.Group();root.add(drop);
  drop.add(ctx.mesh(G.lathe(dropProfile(0.15,0.42,48,1.7),48),{tone:0.78,rough:0.12}));
  return {root,grounded:false,update(_c,t){drop.position.y=Math.sin(t*1.8)*0.012;drop.rotation.y=Math.sin(t*0.7)*0.25;}};
 },
});

export const snowflake=defineModel({
 id:'snowflake',aliases:['snow','ice-crystal','flake','winter','frost'],
 describe:'A six-fold snowflake crystal: hexagon centre, six arms each with forked side branches and tips, slowly turning.',
 size:'1 m display',
 build(ctx){
  const root=new THREE.Group(),f=new THREE.Group();root.add(f);
  const parts:THREE.BufferGeometry[]=[];const T=0.035;
  const bar=(x0:number,y0:number,ang:number,len:number,w:number)=>{const g=G.rbox(w,len,T,w*0.3,1);g.translate(0,len/2,0);g.rotateZ(ang);g.translate(x0,y0,0);parts.push(g);};
  for(let a=0;a<6;a++){const th=a*Math.PI/3;const ux=-Math.sin(th),uy=Math.cos(th);
   bar(0,0,th,0.5,0.055);
   for(const [s,l] of [[0.17,0.13],[0.28,0.17],[0.39,0.11]] as const)for(const sg of [1,-1])bar(ux*s,uy*s,th+sg*Math.PI/3,l,0.034);
   const tip=G.cyl(0.045,0.045,T*1.2,6);tip.rotateX(Math.PI/2);tip.translate(ux*0.5,uy*0.5,0);parts.push(tip);}
  const hex=G.cyl(0.13,0.13,T*1.3,6);hex.rotateX(Math.PI/2);parts.push(hex);
  const inner=G.cyl(0.07,0.07,T*1.6,6);inner.rotateX(Math.PI/2);inner.rotateZ(Math.PI/6);
  f.add(ctx.mesh(G.merge(parts),{tone:1,rough:0.3}),ctx.mesh(inner,{tone:0.55}));
  return {root,grounded:false,update(_c,t){f.rotation.z=t*0.3;f.rotation.y=Math.sin(t*0.6)*0.3;}};
 },
});

/** Box with rounded edges but dense, even tessellation (good for noise/melting). */
function softBox(s:number,r:number,n=14){
 const g=new THREE.BoxGeometry(1,1,1,n,n,n);const p=g.attributes.position!;const h=s/2-r;const v=new THREE.Vector3(),c=new THREE.Vector3();
 for(let i=0;i<p.count;i++){v.set(p.getX(i),p.getY(i),p.getZ(i)).multiplyScalar(s);c.set(clamp(v.x,-h,h),clamp(v.y,-h,h),clamp(v.z,-h,h));const d=v.clone().sub(c);if(d.lengthSq()>1e-9)d.setLength(r);v.copy(c).add(d);p.setXYZ(i,v.x,v.y,v.z);}
 g.computeVertexNormals();return G.merge([g]);
}
export const iceCube=defineModel({
 id:'ice-cube',aliases:['ice','icecube','ice-block','frozen'],
 describe:'A translucent ice cube with rounded edges, a frosty cloudy core and air bubbles inside; `melt` shrinks it into a spreading puddle.',
 controls:{melt:'0 solid .. 1 mostly melted into a puddle'},size:'0.5 m display',
 build(ctx){
  const root=new THREE.Group(),cube=new THREE.Group();root.add(cube);
  const shell=ctx.mesh(roughen(softBox(0.5,0.07),0.006,9,2),{tone:0.95,rough:0.08});seeThrough(shell,0.78);cube.add(shell);
  cube.add(ctx.mesh(roughen(G.ellipsoid(0.15,0.13,0.15,24,18),0.02,14,4),{tone:0.75}));
  const r=rng(ctx.seed);for(let i=0;i<9;i++)cube.add(ctx.mesh(at(G.sphere(0.012+r()*0.012,10,8),[(r()-0.5)*0.36,(r()-0.5)*0.36,(r()-0.5)*0.36]),{tone:1}));
  cube.rotation.set(deg(16),deg(40),deg(-6));
  const puddle=ctx.mesh(G.cyl(1,1,0.012,48),{tone:0.6,rough:0.1});root.add(puddle);
  return {root,grounded:true,update(c){const m=clamp(c.melt??0);const s=1-0.62*m;cube.scale.set(lerp(1,0.85,m)*(1+m*0.1),s,lerp(1,0.85,m)*(1+m*0.1));cube.position.y=0.33*s;
   const pr=0.02+0.5*Math.sqrt(m);puddle.scale.set(pr,1,pr*0.8);puddle.visible=m>0.01;puddle.position.y=0.006;}};
 },
});

// ===================================================================== flame / campfire
/** Flickering flame: translucent outer tongue + bright inner core + rising sparks. Height ~h, base at y=0. */
function buildFlame(ctx:ModelCtx,h:number,glowControl='glow'){
 const group=new THREE.Group();const w=h*0.36;
 type Tongue={m:THREE.Mesh;g:THREE.BufferGeometry;base:Float32Array;hh:number;ph:number;lean:number;amp:number};
 const tongues:Tongue[]=[];
 const mk=(x:number,z:number,scale:number,tone:number,glow:number,ph:number,lean:number,amp:number,sharp=2.1)=>{
  const g=G.lathe(dropProfile(w*scale*0.9,h*scale,40,sharp),36);// round bottom at y=0, pointed tip up
  const base=Float32Array.from(g.attributes.position!.array as ArrayLike<number>);const m=ctx.mesh(g,{tone,glow,glowControl,rough:0.9});m.position.set(x,0,z);group.add(m);
  tongues.push({m,g,base,hh:h*scale,ph,lean,amp});};
 mk(0,0,1,0.92,0.9,0,0.02,1);                    // main tongue
 mk(-w*0.42,w*0.05,0.66,0.85,0.7,2.1,-0.22,1.3);  // left licks outward
 mk(w*0.44,-w*0.04,0.74,0.85,0.7,4.2,0.2,1.3);    // right
 mk(-w*0.1,-w*0.3,0.55,0.8,0.6,1.3,-0.05,1.5);    // back
 mk(w*0.18,w*0.22,0.42,0.88,0.7,3.3,0.12,1.6);    // front small
 mk(0,w*0.3,0.5,1,2.6,5.1,0,0.5,1.2);           // white-hot core (bulbous, low, in front)
 const sparks=new Swarm(ctx,22,new THREE.OctahedronGeometry(1,0),{tone:1,glow:3,glowControl});group.add(sparks.mesh);
 const r=rng(ctx.seed+21);const sp=Array.from({length:22},()=>({x:(r()-0.5)*w*1.2,z:(r()-0.5)*w,o:r(),v:0.6+r()*0.6,d:(r()-0.5),f:2+r()*3}));
 const update=(t:number,power=1)=>{
  for(const T of tongues){const p=T.g.attributes.position!;const a=p.array as Float32Array,b=T.base,ph=T.ph;
   const stretch=(1+0.09*Math.sin(t*5.7+ph)+0.05*Math.sin(t*12.9+ph*1.3))*power;
   const sx=T.amp*T.hh,lean=T.lean*T.hh;
   for(let i=0;i<p.count;i++){const x=b[i*3]!,y=b[i*3+1]!,z=b[i*3+2]!;const k=clamp(y/T.hh);const k2=k*k;const ang=Math.atan2(z,x);
    const rm=1+0.12*k*Math.sin(ang*2+t*7+ph)-0.08*k*Math.sin(t*9.1+ph);
    const ox=lean*k2+sx*(0.16*k2*Math.sin(t*4.3+ph-k*3.2)+0.045*k*Math.sin(t*11.3+ph*1.7));
    const oz=sx*0.1*k2*Math.sin(t*3.7+ph*0.7-k*2.5);
    a[i*3]=x*rm+ox;a[i*3+1]=y*stretch;a[i*3+2]=z*rm+oz;}
   p.needsUpdate=true;T.g.computeVertexNormals();}
  sp.forEach((s,i)=>{const k=(t*0.45*s.v+s.o)%1;sparks.set(i,s.x+s.d*k*h*0.6+Math.sin(t*s.f+i)*0.04*h*k,h*(0.35+k*1.5)*power,s.z+Math.cos(t*s.f*0.8+i)*0.03*h*k,h*0.016*smooth((1-k)*4)*smooth(k*10)*(power>0.05?1:0));});sparks.done();
 };
 update(0);
 return {group,update};
}
export const flame=defineModel({
 id:'flame',aliases:['fire','flames','burning','candle-flame','blaze','heat'],
 describe:'A flickering glowing flame: teardrop tongues of fire licking upward with a white-hot core and rising sparks.',
 controls:{glow:'0..1 brightness (default 1)',size:'0 out .. 1 full flame (default 1)'},defaults:{glow:1,size:1},size:'0.6 m tall display',
 build(ctx){const f=buildFlame(ctx,0.6);return {root:f.group,grounded:true,update(c,t){const s=clamp(c.size??1);f.group.visible=s>0.01;f.group.scale.set(lerp(0.4,1,s),1,lerp(0.4,1,s));f.update(t,Math.max(0.02,s));}};},
});
export const campfire=defineModel({
 id:'campfire',aliases:['bonfire','camp-fire','firepit','fire-pit','camping'],
 describe:'A campfire: ring of stones, crossed logs with pale cut ends, glowing embers and a flickering flame with sparks; `fire` 0 dead logs .. 1 roaring.',
 controls:{fire:'0 out .. 1 roaring (default 1)'},defaults:{fire:1},size:'1.2 m wide',
 build(ctx){
  const root=new THREE.Group(),r=rng(ctx.seed+8);
  const stones:THREE.BufferGeometry[]=[];for(let i=0;i<11;i++){const a=i/11*TAU;const s=0.1+r()*0.04;stones.push(at(roughen(new THREE.IcosahedronGeometry(s,2),s*0.18,9,i),[Math.cos(a)*0.55,s*0.55,Math.sin(a)*0.55],[r()*40,r()*90,0],[1.25,0.75,1]));}
  root.add(ctx.mesh(G.merge(stones),{tone:0.62,flat:true}));
  const logs:THREE.BufferGeometry[]=[],ends:THREE.BufferGeometry[]=[];
  for(let i=0;i<5;i++){const a=i/5*TAU+0.3;const len=0.62;const g=G.cyl(0.055,0.06,len,14);const e1=at(G.cyl(0.05,0.05,0.012,14),[0,len/2+0.003,0]),e2=at(G.cyl(0.054,0.054,0.012,14),[0,-len/2-0.003,0]);
   for(const x of [g,e1,e2]){x.rotateZ(deg(62));x.rotateY(-a);x.translate(Math.cos(a)*0.2,0.2,Math.sin(a)*0.2);}
   logs.push(roughen(g,0.006,30,i));ends.push(e1,e2);}
  root.add(ctx.mesh(G.merge(logs),{tone:0.45}),ctx.mesh(G.merge(ends),{tone:0.85}));
  const embers=ctx.mesh(at(roughen(G.ellipsoid(0.28,0.05,0.28,24,10),0.02,10,3),[0,0.02,0]),{tone:0.4,glow:1.5,glowControl:'fire'});root.add(embers);
  const f=buildFlame(ctx,0.75,'fire');f.group.position.y=0.06;root.add(f.group);
  return {root,grounded:true,update(c,t){const k=clamp(c.fire??1);f.group.visible=k>0.01;f.group.scale.set(lerp(0.5,1,k),1,lerp(0.5,1,k));f.update(t,Math.max(0.02,k));}};
 },
});

// ===================================================================== leaf, flower
/** Leaf blade in XY (base at origin, tip +y, faces +z) with raised midrib and veins. Returns geometries. */
function leafGeos(L:number,Wd:number,fold=0.08,curl=0.12){
 const wOf=(s:number)=>Wd*Math.sin(Math.PI*Math.pow(s,0.85))*(1-0.25*s);
 const zOf=(s:number,u:number)=>curl*L*s*s+fold*Wd*u*u;
 const ns=40,nu=12;const pos:number[]=[],idx:number[]=[];
 for(let i=0;i<=ns;i++)for(let j=0;j<=nu;j++){const s=i/ns,u=j/nu*2-1;const w=wOf(s);pos.push(u*w,s*L,zOf(s,u));}
 for(let i=0;i<ns;i++)for(let j=0;j<nu;j++){const a=i*(nu+1)+j,b=a+1,c=a+nu+1,d=c+1;idx.push(a,c,b,b,c,d);}
 const blade=new THREE.BufferGeometry();blade.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));blade.setIndex(idx);blade.computeVertexNormals();
 const vp=(s:number,u:number):[number,number,number]=>[u*wOf(s),s*L,zOf(s,u)+0.004*L];
 const veins:THREE.BufferGeometry[]=[G.tube(Array.from({length:9},(_,i)=>vp(i/8*0.98,0)),0.012*L,40,6)];
 for(let k=1;k<=7;k++){const s0=k/8.5;for(const sg of [1,-1])veins.push(G.tube([vp(s0,0),vp(s0+0.06,sg*0.45),vp(s0+0.1,sg*0.85)],0.005*L,10,4));}
 const stem=G.tube([[0,-0.18*L,-0.02*L],[0,-0.08*L,0],[0,0.02*L,0.004*L]],0.014*L,10,6);
 return {blade,veins:G.merge(veins),stem};
}
export const leaf=defineModel({
 id:'leaf',aliases:['leaves','green-leaf','foliage','photosynthesis','autumn-leaf'],
 describe:'A single leaf: pointed oval blade with a raised central midrib and side veins, short stalk, gently curled, swaying.',
 size:'0.3 m display',
 build(ctx){const root=new THREE.Group(),g=new THREE.Group();root.add(g);const L=0.3,{blade,veins,stem}=leafGeos(L,0.1);
  g.add(ctx.mesh(blade,{tone:0.72,side:THREE.DoubleSide}),ctx.mesh(veins,{tone:1}),ctx.mesh(stem,{tone:0.85}));g.rotation.z=deg(-25);
  return {root,grounded:false,update(_c,t){g.rotation.x=Math.sin(t*1.1)*0.12-0.25;g.rotation.y=Math.sin(t*0.7)*0.2;}};},
});
export const flower=defineModel({
 id:'flower',aliases:['daisy','tulip','blossom','bloom','plant','sunflower','petal'],
 describe:'A flower on a curved stem with two leaves: kind daisy (ring of long white petals around a dark seeded centre) or tulip (cup of six petals); `bloom` 0 closed bud .. 1 open, sways gently.',
 params:{kind:'daisy (default) | tulip'},controls:{bloom:'0 bud .. 1 fully open (default 1)'},defaults:{bloom:1},size:'0.6 m tall',
 build(ctx){
  const kind=ctx.str('kind','daisy',['daisy','tulip'] as const);const root=new THREE.Group(),plant=new THREE.Group();root.add(plant);
  const top:[number,number,number]=[0.03,0.55,0.03];
  plant.add(ctx.mesh(G.tube([[0,0,0],[0.02,0.2,0],[0.04,0.4,0.02],top],0.009,40,8),{tone:0.62}));
  for(const [y,sg] of [[0.12,1],[0.24,-1]] as const){const {blade,veins}=leafGeos(0.2,0.05,0.12,0.25);const lg=new THREE.Group();lg.add(ctx.mesh(blade,{tone:0.68,side:THREE.DoubleSide}),ctx.mesh(veins,{tone:0.9}));lg.position.set(0.015,y,0);lg.rotation.set(deg(10),deg(sg>0?0:180),deg(-55));plant.add(lg);}
  const head=new THREE.Group();head.position.set(...top);head.rotation.x=deg(kind==='tulip'?0:65);plant.add(head);
  const petals:{g:THREE.Object3D;open:number;closed:number}[]=[];
  if(kind==='tulip'){
   head.add(ctx.mesh(at(G.sphere(0.02,12,8),[0,0.005,0]),{tone:0.6}));
   for(let i=0;i<6;i++){const g=new THREE.SphereGeometry(0.06,20,16,-0.55,1.1,0.35,Math.PI*0.62);g.scale(1,1.45,1);g.rotateX(Math.PI);g.translate(0,0.0,0);
    const pg=new THREE.Group();pg.rotation.y=i*Math.PI/3+(i%2?0:0.3);const pm=ctx.mesh(at(g,[0,0.075,0.0]),{tone:i%2?0.95:0.82,side:THREE.DoubleSide});const piv=new THREE.Group();piv.add(pm);pg.add(piv);head.add(pg);petals.push({g:piv,open:deg(32),closed:deg(0)});}
  }else{
   head.add(ctx.mesh(at(roughen(G.ellipsoid(0.045,0.022,0.045,32,16),0.004,90,3),[0,0.008,0]),{tone:0.5}));
   const N=16;for(let i=0;i<N;i++){const pg=new THREE.Group();pg.rotation.y=i/N*TAU;const piv=new THREE.Group();piv.position.x=0.035;pg.add(piv);
    const g=G.ellipsoid(0.065,0.004,0.016,16,6);const p=g.attributes.position!;for(let j=0;j<p.count;j++){const x=p.getX(j);p.setY(j,p.getY(j)+0.12*x*x*4-Math.abs(p.getZ(j))*0.25);}g.computeVertexNormals();
    piv.add(ctx.mesh(at(g,[0.062,0,0]),{tone:1}));head.add(pg);petals.push({g:piv,open:deg(4),closed:deg(80)});}
  }
  return {root,grounded:true,update(c,t){const b=smooth(clamp(c.bloom??1));
   for(const p of petals){if(kind==='tulip')p.g.rotation.x=lerp(p.closed,p.open,b)*-1;else p.g.rotation.z=lerp(p.closed,p.open,b);}
   plant.rotation.z=Math.sin(t*1.2)*0.03;plant.rotation.x=Math.sin(t*0.8+1)*0.02;}};
 },
});

// ===================================================================== rock
export const rock=defineModel({
 id:'rock',aliases:['stone','boulder','pebble','rocks','geology'],
 describe:'A rough faceted boulder with chipped flat faces and cracks.',
 params:{size:'metres across (default 1)'},size:'1 m',
 build(ctx){const s=ctx.num('size',1,0.05,20);const g=new THREE.IcosahedronGeometry(0.5,5);const p=g.attributes.position!;const v=new THREE.Vector3();const sd=ctx.seed%17;
  // a few flat cleavage planes + noise
  const r=rng(ctx.seed);const planes=Array.from({length:7},()=>({n:new THREE.Vector3(r()-0.5,r()-0.3,r()-0.5).normalize(),d:0.36+r()*0.08}));
  for(let i=0;i<p.count;i++){v.set(p.getX(i),p.getY(i),p.getZ(i));v.multiplyScalar(1+0.18*fbm(v.x*3+sd,v.y*3,v.z*3,4));for(const pl of planes){const k=v.dot(pl.n);if(k>pl.d)v.addScaledVector(pl.n,pl.d-k);}
   if(v.y<-0.2)v.y=-0.2+(v.y+0.2)*0.15;p.setXYZ(i,v.x*s,v.y*s*0.8,v.z*s);}
  g.computeVertexNormals();const root=new THREE.Group();root.add(ctx.mesh(toneAttr(g,(x,y,z)=>0.72+0.2*fbm(x*9/s,y*9/s,z*9/s,3)),{tone:1,flat:true}));(root.children[0] as THREE.Mesh&{material:THREE.MeshStandardMaterial}).material.vertexColors=true;
  return {root,grounded:true};},
});

// ===================================================================== sunrise, island
export const sunrise=defineModel({
 id:'sunrise',aliases:['sunset','horizon','dawn','dusk','morning','sun-horizon'],
 describe:'A glowing sun half-risen over a flat horizon line, rays fanning out behind it and a shimmering reflection streak on the sea; `rise` 0 below horizon .. 0.5 half up .. 1 fully risen.',
 controls:{rise:'0 hidden .. 0.5 half over horizon (default) .. 1 fully up'},defaults:{rise:0.5},size:'7 m wide display',
 build(ctx){
  const root=new THREE.Group();
  root.add(ctx.mesh(at(G.box(7,1.6,3),[0,-0.8,0.2]),{tone:0.3,rough:0.4}));
  const sun=new THREE.Group();sun.position.z=-1.0;root.add(sun);
  sun.add(ctx.mesh(G.sphere(0.9,48,32),{tone:1,glow:3}));
  const rays=new THREE.Group();rays.position.z=-1.25;root.add(rays);const rg:THREE.BufferGeometry[]=[];
  for(let i=0;i<14;i++){const a=deg(-90+i*360/14);const g=G.extrude([[0,-0.05],[1.2,-0.015],[1.2,0.015],[0,0.05]],0.02);g.translate(1.1,0,0);g.rotateZ(a);rg.push(g);}
  const rayM=ctx.mesh(G.merge(rg),{tone:0.75,glow:1.2});rays.add(rayM);
  const refl:THREE.BufferGeometry[]=[];for(let i=0;i<9;i++){const w=1.5-i*0.13;refl.push(at(G.box(w,0.012,0.07),[0,0.006,-0.6+i*0.24]));}
  const reflM=ctx.mesh(G.merge(refl),{tone:0.8,glow:1.4});root.add(reflM);
  const lines:THREE.BufferGeometry[]=[];const r=rng(ctx.seed);for(let i=0;i<22;i++){lines.push(at(G.box(0.2+r()*0.6,0.008,0.03),[(r()-0.5)*6,0.004,-0.9+r()*2.4]));}
  root.add(ctx.mesh(G.merge(lines),{tone:0.55}));
  return {root,grounded:true,update(c,t){const k=clamp(c.rise??0.5);sun.position.y=lerp(-1,1.05,k);rays.position.y=sun.position.y;rays.rotation.z=t*0.08;rays.visible=k>0.2;rayM.scale.setScalar(0.6+0.4*smooth((k-0.2)/0.5));
   reflM.visible=k>0.25;reflM.scale.x=1+0.05*Math.sin(t*3);}};
 },
});

export const island=defineModel({
 id:'island',aliases:['desert-island','tropical-island','beach','castaway'],
 describe:'A small tropical island: sandy mound with rocks and a leaning palm tree, in a flat sea with lapping ripple rings.',
 size:'6 m wide display',
 build(ctx){
  const root=new THREE.Group();
  root.add(ctx.mesh(at(G.cyl(3,3,0.06,64),[0,0.03,0]),{tone:0.32,rough:0.3}));
  const sand=G.lathe([[1.5,0],[1.35,0.12],[1.0,0.3],[0.5,0.42],[0,0.45]],64);roughen(sand,0.03,4,3);root.add(ctx.mesh(at(sand,[0,0.04,0]),{tone:0.95}));
  const rings:THREE.Mesh[]=[];for(let i=0;i<3;i++){const m=ctx.mesh(G.torus(1,0.012,6,96),{tone:0.75});m.rotation.x=Math.PI/2;m.position.y=0.07;root.add(m);rings.push(m);}
  const r=rng(ctx.seed);for(let i=0;i<4;i++){const a=r()*TAU;const s=0.1+r()*0.08;root.add(ctx.mesh(at(roughen(new THREE.IcosahedronGeometry(s,2),s*0.2,8,i),[Math.cos(a)*1.25,0.1,Math.sin(a)*1.1]),{tone:0.6,flat:true}));}
  const palmG=new THREE.Group(),sways:Sway[]=[];buildPalm(ctx,palmG,sways,1);palmG.scale.setScalar(0.5);palmG.position.set(-0.25,0.38,0);root.add(palmG);
  return {root,grounded:true,update(_c,t){rings.forEach((m,i)=>{const k=((t*0.25+i/3)%1);const s=1.55+k*0.9;m.scale.set(s,s*0.95,1);(m.material as THREE.MeshStandardMaterial).userData.tone=0.75;m.visible=k<0.92;});
   for(const s of sways)s.group.rotation.z=Math.sin(t*s.freq+s.phase)*s.amp;}};
 },
});
