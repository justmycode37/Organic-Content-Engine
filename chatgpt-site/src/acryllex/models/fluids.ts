import * as THREE from 'three';
import {clamp,smooth} from '../kit.ts';
import {defineModel,type ModelCtx} from './types.ts';
import {createWaterMaterial,type WaterMaterialResource} from './water-material.ts';
import {
 createFluidSurface,createFluidFoam,controlGridFluidSampler,splineFluidSampler,
 type FluidSampler,type FluidSurface,type FluidFoamSeed,
} from './fluid-surface.ts';

// These are editable, analytically deformed water surfaces, not a fluid solver.
// Topology, normals, thickness, surface frames and foam all come from the same
// core used by the reference curl-wave preset.
const TAU=Math.PI*2;
type V3=[number,number,number];
type SheetMode='ocean'|'ripple'|'cascade'|'fan';
type Motion={flow:number;amplitude:number;curl:number;foam:number;radius:number;spread:number};
const finite=(v:unknown,f:number)=>typeof v==='number'&&Number.isFinite(v)?v:f;
const control=(c:Record<string,number>,key:string,f=1,min=0,max=3)=>clamp(finite(c[key],f),min,max);
const wrap=(x:number)=>((x%1)+1)%1;
const vector=(v:unknown,f:V3)=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite)?new THREE.Vector3(v[0],v[1],v[2]):new THREE.Vector3(...f);
const WATER_PARAMS={material:'opaque (default) | water: dielectric reflection/transmission with a neutral procedural environment',ior:'water refraction index (default1.333)',transmission:'water transmission0..1 (default1)',opticalThickness:'water optical thickness in metres (default.75), separate from geometry thickness',attenuationDistance:'water neutral absorption distance in metres (default6)',environmentIntensity:'neutral water environment strength0..20 (default1)',rippleAmplitude:'world-space water normal relief in metres0...1 (default.002); does not alter geometry',rippleFrequency:'world-space normal frequency (default35)',rippleFlow:'water normal-field advection [x,y,z] metres/second (default[.6,0,.25])'};
function waterOptics(ctx:ModelCtx){
 if(ctx.str('material','opaque',['opaque','water'])!=='water')return null;
 return createWaterMaterial({roughness:ctx.num('roughness',.06,.02,1),ior:ctx.num('ior',1.333,1,2.333),transmission:ctx.num('transmission',1,0,1),thickness:ctx.num('opticalThickness',.75,0,100),attenuationDistance:ctx.num('attenuationDistance',6,.001,1e6),environmentIntensity:ctx.num('environmentIntensity',1,0,20),rippleAmplitude:ctx.num('rippleAmplitude',.002,0,.1),rippleFrequency:ctx.num('rippleFrequency',35,.01,500),flow:vector(ctx.params.rippleFlow,[.6,0,.25]).toArray() as V3});
}
function opticalUpdate(root:THREE.Group,surface:THREE.Mesh,optics:WaterMaterialResource|null){
 if(!optics)return (_t:number)=>{};
 const foam=root.children.filter((o):o is THREE.InstancedMesh=>(o as THREE.InstancedMesh).isInstancedMesh);
 return(t:number)=>{optics.update(t);surface.castShadow=optics.shadowPolicy.castShadow;surface.receiveShadow=optics.shadowPolicy.receiveShadow;for(const mesh of foam){mesh.castShadow=true;mesh.receiveShadow=true;}};
}
function pathPoints(value:unknown){
 const out:THREE.Vector3[]=[];
 if(Array.isArray(value))for(const p of value.slice(0,128))if(Array.isArray(p)&&p.length===3&&p.every(Number.isFinite)){
  const v=new THREE.Vector3(p[0],p[1],p[2]);if(!out.length||v.distanceToSquared(out[out.length-1]!)>1e-10)out.push(v);
 }
 return out;
}
function direction2(value:unknown,f:[number,number]){
 const v=Array.isArray(value)&&value.length===2&&value.every(Number.isFinite)?new THREE.Vector2(value[0],value[1]):new THREE.Vector2(...f);
 return v.lengthSq()>1e-10?v.normalize():new THREE.Vector2(...f).normalize();
}
function gridInput(ctx:ModelCtx){
 const input=ctx.params.controlGrid;if(!Array.isArray(input)||input.length<2)return null;
 const rows=input.slice(0,32).map(row=>Array.isArray(row)?row.slice(0,32).map(p=>{
  if(!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite))throw new Error('fluid-sheet controlGrid points must be finite [x,y,z] triples');
  return new THREE.Vector3(p[0],p[1],p[2]);
 }):[]),columns=rows[0]?.length??0;
 if(columns<2||rows.some(row=>row.length!==columns))throw new Error('fluid-sheet controlGrid must be rectangular rows of finite [x,y,z] points');
 let closedU=ctx.bool('closedU',false),closedV=ctx.bool('closedV',false);
 if(closedU&&columns>3&&rows.every(row=>row[0]!.distanceToSquared(row[row.length-1]!)<1e-10))rows.forEach(row=>row.pop());
 if(closedV&&rows.length>3&&rows[0]!.every((p,i)=>p.distanceToSquared(rows[rows.length-1]![i]!)<1e-10))rows.pop();
 const nu=rows[0]!.length,nv=rows.length;closedU=closedU&&nu>=3;closedV=closedV&&nv>=3;
 let spanU=0,spanV=0;
 for(const row of rows)for(let i=1;i<nu;i++)spanU+=row[i]!.distanceTo(row[i-1]!);
 for(let j=1;j<nv;j++)for(let i=0;i<nu;i++)spanV+=rows[j]![i]!.distanceTo(rows[j-1]![i]!);
 return {points:rows.flat(),uCount:nu,vCount:nv,periodicU:closedU,periodicV:closedV,spanU:Math.max(.01,spanU/nv),spanV:Math.max(.01,spanV/nu)};
}
function sampleSection(points:THREE.Vector2[],v:number,out:THREE.Vector2){
 if(points.length<2)return out.set(v-.5,0);
 const x=clamp(v)*(points.length-1),i=Math.min(points.length-2,Math.floor(x)),t=x-i;
 const at=(q:number)=>points[Math.max(0,Math.min(points.length-1,q))]!;
 const cubic=(a:number,b:number,c:number,d:number)=>.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t);
 return out.set(cubic(at(i-1).x,at(i).x,at(i+1).x,at(i+2).x),cubic(at(i-1).y,at(i).y,at(i+1).y,at(i+2).y));
}

/** Converts an intrinsic u/v direction into a metre-per-second tangent flow. */
function tangentFlow(base:FluidSampler,velocity:()=>number,direction:(u:number,v:number,out:THREE.Vector2)=>THREE.Vector2){
 const a=new THREE.Vector3(),b=new THREE.Vector3(),du=new THREE.Vector3(),dv=new THREE.Vector3(),world=new THREE.Vector3(),dir=new THREE.Vector2();
 return(u:number,v:number,t:number,out:THREE.Vector2)=>{
  const e=.001,um=Math.max(0,u-e),up=Math.min(1,u+e),vm=Math.max(0,v-e),vp=Math.min(1,v+e);
  base(up,v,t,a);base(um,v,t,b);du.subVectors(a,b).divideScalar(up-um||1);
  base(u,vp,t,a);base(u,vm,t,b);dv.subVectors(a,b).divideScalar(vp-vm||1);
  direction(u,v,dir);world.copy(du).normalize().multiplyScalar(dir.x).addScaledVector(b.copy(dv).normalize(),dir.y);
  if(world.lengthSq()<1e-12)return out.set(0,0);world.normalize().multiplyScalar(velocity());
  const uu=du.lengthSq(),vv=dv.lengthSq(),uv=du.dot(dv),det=uu*vv-uv*uv;
  if(det<1e-14)return out.set(0,0);
  const wu=world.dot(du),wv=world.dot(dv);return out.set((wu*vv-wv*uv)/det,(wv*uu-wu*uv)/det);
 };
}

function foamLayers(ctx:ModelCtx,root:THREE.Group,surface:FluidSurface,flow:(u:number,v:number,t:number,out:THREE.Vector2)=>void,jet=false){
 const count=Math.round(ctx.num('foamCount',jet?180:260,0,2400)),amount=ctx.num('foamAmount',.7,0,1),size=ctx.num('foamSize',jet ? .022 : .028,.002,.25),life=ctx.num('foamLifetime',jet ? .8 : 1.5,.1,8),spray=ctx.num('spray',0,0,8);
 const material=ctx.mat({tone:1,rough:.88,glow:.07}),threshold=ctx.num('foamBend',0,0,20);
 const attached=createFluidFoam({surface,count,seed:ctx.seed+257,material,flow,size:[size*.6,size*1.4],lifetime:[life*.7,life*1.3],normalOffset:size*.7,bendThreshold:threshold,integrationSteps:4});
 attached.mesh.name=jet?'fluid-jet-foam':'fluid-sheet-foam';root.add(attached.mesh);
 const seedEdge=(seed:FluidFoamSeed,out:THREE.Vector2)=>jet?out.set(.8+seed.random[2]!*.19,seed.random[3]!):out.set(seed.random[2]!,.8+seed.random[3]!*.19);
 const droplets=spray>0?createFluidFoam({surface,count:Math.round(count*.35),seed:ctx.seed+4099,material,flow,seedUV:seedEdge,size:[size*.5,size],lifetime:[Math.min(life,.45)*.5,Math.min(life,.8)],normalOffset:size,spray,gravity:ctx.num('sprayGravity',9.81,0,30),spread:ctx.num('spraySpread',.08,0,2)}):null;
 if(droplets){droplets.mesh.name=jet?'fluid-jet-spray':'fluid-sheet-spray';root.add(droplets.mesh);}
 return(t:number,multiplier:number)=>{
  const visible=clamp(multiplier)*amount;
  if(visible>0){attached.update(t);droplets?.update(t);}
  attached.mesh.count=Math.round(count*visible);if(droplets)droplets.mesh.count=Math.round(droplets.seeds.length*visible);
 };
}

export const fluidSheet=defineModel({
 id:'fluid-sheet',aliases:['editable-water-sheet','procedural-water-surface'],
 describe:'Editable procedural water using the shared parametric fluid core: ocean swells, expanding ripples, falling/curling cascade, radial splash fan, or an arbitrary tensor control grid / swept spline. Geometry and foam are evaluated from absolute time. This is an analytic water-surface system, not a physical fluid solver. Authored positions are metres; origin:model preserves their coordinates.',
 size:'editable width/length/height in metres',
 params:{...WATER_PARAMS,mode:'ocean | ripple | cascade | fan (default ocean); controlGrid/path override the analytic base',width:'sheet width m (default 6)',length:'ocean/ripple length m (default 4)',height:'cascade/fan height m (default 4 / 1.5)',depth:'cascade bottom kick m (default .6)',radius:'fan radius m (default width/2)',fanAngle:'fan angular span degrees20..360 (default240)',curl:'0 flat/straight ..1 rolled edge or cascade kick; also curls a spline section',curlStart:'ocean rolled-edge start0..1 (default .55)',amplitude:'normal displacement amplitude m (default .16)',wavelength:'principal wave spacing m (default1.8)',flowSpeed:'metres/second along the surface (default1.1)',flowDirection:'[du,dv] direction in the surface tangent axes; cascade defaults [0,1]',rippleCenter:'[x,z] metres in the horizontal sheet',rippleDecay:'radial attenuation per metre (default .12)',controlGrid:'rectangular rows[v][u] of [x,y,z] positions, minimum2x2, maximum32x32; tensor Catmull-Rom',closedU:'close custom-grid / spline u axis (default false); periodic grid omits duplicate seam controls',closedV:'close custom-grid v axis (default false)',path:'optional [x,y,z][] centreline; swept spline overrides analytic mode',section:'optional [normalOffset,binormalOffset][] cross-section controls in metres; default a width-wide ribbon',twist:'spline section twist degrees along the path (default0)',widthTaper:'spline end width / start width (default1; ignored for closed paths)',thickness:'surface shell thickness m (default .035)',flipNormals:'select the shell/foam side; cascade defaults true, authored grids follow control order',uSegments:'mesh samples along u (default80)',vSegments:'mesh samples along v (default40)',foamCount:'bounded particle capacity (default260)',foamAmount:'foam fraction0..1 (default .7)',foamSize:'foam radius m (default .028)',foamLifetime:'foam life seconds (default1.5)',foamBend:'minimum curvature1/m for foam;0 unrestricted',spray:'optional edge droplet normal launch speed m/s (default0)',sprayGravity:'droplet gravity m/s² (default9.81)',roughness:'PBR roughness0..1 (default .38)',metalness:'PBR metalness0..1 (default0)',tone:'material light/density coefficient; ink colour remains scene controlled'},
 controls:{flow:'signed flow/phase speed multiplier (-3..3, default1)',amplitude:'undulation multiplier0..3 (default1)',curl:'analytic curl / section curl multiplier0..2 (default1)',foam:'visible foam fraction0..1 (default1)',phase:'absolute phase time offset in seconds (default0)'},
 defaults:{flow:1,amplitude:1,curl:1,foam:1,phase:0},
 build(ctx){
  const root=new THREE.Group(),mode=ctx.str<SheetMode>('mode','ocean',['ocean','ripple','cascade','fan']),width=ctx.num('width',6,.1,50),length=ctx.num('length',4,.1,50),height=ctx.num('height',mode==='fan'?1.5:4,.1,50),depth=ctx.num('depth',.6,0,30),radius=ctx.num('radius',width*.5,.05,30),angle=ctx.num('fanAngle',240,20,360)*Math.PI/180;
  const amplitude=ctx.num('amplitude',.16,0,5),wavelength=ctx.num('wavelength',1.8,.05,30),speed=ctx.num('flowSpeed',1.1,0,30),curl=ctx.num('curl',0,0,1.5),start=ctx.num('curlStart',.55,.05,.95),twist=ctx.num('twist',0,-1440,1440)*Math.PI/180,taper=ctx.num('widthTaper',1,.05,4),sheetSpread=ctx.num('spread',.12,0,2);
  const state:Motion={flow:1,amplitude:1,curl:1,foam:1,radius:1,spread:1},grid=gridInput(ctx),path=pathPoints(ctx.params.path),section:THREE.Vector2[]=[];
  if(Array.isArray(ctx.params.section))for(const p of ctx.params.section.slice(0,64))if(Array.isArray(p)&&p.length===2&&p.every(Number.isFinite))section.push(new THREE.Vector2(p[0],p[1]));
  let periodicU=false,periodicV=false,spanU=width,spanV=mode==='cascade'?height:length,base:FluidSampler;
  if(grid){periodicU=grid.periodicU;periodicV=grid.periodicV;spanU=grid.spanU;spanV=grid.spanV;base=controlGridFluidSampler(grid);}
  else if(path.length>=2){
   let closed=ctx.bool('closedU',false)&&path.length>=3;if(closed&&path[0]!.distanceToSquared(path[path.length-1]!)<1e-10)path.pop();closed=closed&&path.length>=3;
   const curve=new THREE.CatmullRomCurve3(path,closed,'centripetal'),cross=new THREE.Vector2();periodicU=closed;spanU=Math.max(.01,curve.getLength());spanV=width;
   base=splineFluidSampler({path:curve,closed,section(u,v,_t,out){
    if(section.length>=2)sampleSection(section,v,cross);else cross.set((v-.5)*width,0);
    const w=closed?1:1+(taper-1)*smooth(u),a=(closed?Math.round(twist/TAU)*TAU:twist)*u,roll=curl*state.curl;
    let x=cross.x*w,y=cross.y*w;if(roll>1e-6&&section.length<2){const r=width/(roll*Math.PI);y+=r*(1-Math.cos(x/r));x=r*Math.sin(x/r);}
    out.set(x*Math.cos(a)-y*Math.sin(a),x*Math.sin(a)+y*Math.cos(a));
   }});
  }else{
   periodicU=mode==='fan'&&Math.abs(angle-TAU)<1e-6;spanU=mode==='fan'?radius*angle*.55:width;spanV=mode==='fan'?radius:spanV;
   base=(u,v,_t,out)=>{
    const roll=curl*state.curl;
    if(mode==='fan'){
     const a=(.5-u)*angle,r=radius*(.06+.94*v),lift=height*Math.sin(Math.PI*v)-height*.23*v*v+roll*height*.24*smooth(v);
     out.set(Math.sin(a)*r,lift,Math.cos(a)*r);return;
    }
    if(mode==='cascade'){
     const a=roll*Math.PI*.85,join=.65,s=Math.max(0,(v-join)/(1-join)),run=height*(1-join);let y=height*(1-v),z=depth*v*v;
     if(v>join&&a>1e-6){const r=run/a;y=height*(1-join)-r*Math.sin(a*s);z+=r*(1-Math.cos(a*s));}
     out.set((u-.5)*width*(1+sheetSpread*v),y,z);return;
    }
    let y=0,z=(.5-v)*length;
    if(v>start&&roll>1e-6){const a=roll*Math.PI*1.35,r=length*(1-start)/a,s=(v-start)/(1-start);y=r*(1-Math.cos(a*s));z=(.5-start)*length-r*Math.sin(a*s);}
    out.set((u-.5)*width,y,z);
   };
  }
  const flip=ctx.bool('flipNormals',!grid&&path.length<2&&mode==='cascade'),dir=direction2(ctx.params.flowDirection,mode==='cascade'||mode==='fan'?[0,1]:[1,.2]),ripple=direction2([1,0],[1,0]);
  const center=Array.isArray(ctx.params.rippleCenter)?ctx.params.rippleCenter:[0,0],cx=finite(center[0],0),cz=finite(center[1],0),decay=ctx.num('rippleDecay',.12,0,4);
  const ku=periodicU?Math.round(spanU/wavelength*dir.x):spanU/wavelength*dir.x,kv=periodicV?Math.round(spanV/wavelength*dir.y):spanV/wavelength*dir.y,ku2=periodicU?Math.max(1,Math.round(spanU/wavelength*.61)):spanU/wavelength*.61,kv2=periodicV?Math.round(-spanV/wavelength*.37):-spanV/wavelength*.37;
  const a=new THREE.Vector3(),b=new THREE.Vector3(),du=new THREE.Vector3(),dv=new THREE.Vector3(),normal=new THREE.Vector3();
  const sample:FluidSampler=(u,v,t,out)=>{
   if(periodicU)u=wrap(u);if(periodicV)v=wrap(v);base(u,v,t,out);const amount=amplitude*state.amplitude;if(amount===0)return;
   const e=.001,um=periodicU?u-e:Math.max(0,u-e),up=periodicU?u+e:Math.min(1,u+e),vm=periodicV?v-e:Math.max(0,v-e),vp=periodicV?v+e:Math.min(1,v+e),read=(x:number,y:number,d:THREE.Vector3)=>base(periodicU?wrap(x):x,periodicV?wrap(y):y,t,d);
   read(up,v,a);read(um,v,b);du.subVectors(a,b);read(u,vp,a);read(u,vm,b);dv.subVectors(a,b);normal.crossVectors(du,dv);if(normal.lengthSq()<1e-14)normal.set(0,1,0);else normal.normalize();if(flip)normal.negate();
   const phase=speed*state.flow*t/wavelength;
   const wave=!grid&&path.length<2&&mode==='ripple'?Math.sin(TAU*(Math.hypot(out.x-cx,out.z-cz)/wavelength-phase))*Math.exp(-decay*Math.hypot(out.x-cx,out.z-cz)):Math.sin(TAU*(ku*u+kv*v-phase))+.28*Math.sin(TAU*(ku2*u+kv2*v-phase*.73));
   out.addScaledVector(normal,amount*wave);
  };
  const surface=createFluidSurface({sample,uSegments:Math.round(ctx.num('uSegments',80,8,256)),vSegments:Math.round(ctx.num('vSegments',40,4,128)),periodicU,periodicV,flipNormals:flip,thickness:ctx.num('thickness',.035,0,.5)});
  const optics=waterOptics(ctx),material=optics?.material??ctx.mat({tone:ctx.num('tone',.78,.05,1),rough:ctx.num('roughness',.38,0,1),side:THREE.DoubleSide});if(!optics)material.metalness=ctx.num('metalness',0,0,1);else material.side=THREE.DoubleSide;
  const mesh=new THREE.Mesh(surface.geometry,material);mesh.name='fluid-sheet-surface';root.add(mesh);
  const direction=(u:number,v:number,out:THREE.Vector2)=>{
   if(!grid&&path.length<2&&mode==='ripple'){ripple.set((u-.5)*width-cx,(v-.5)*length+cz);return out.copy(ripple.lengthSq()>1e-10?ripple.normalize():dir);}
   return out.copy(dir);
  };
  const flow=tangentFlow(base,()=>speed*state.flow,direction),foam=foamLayers(ctx,root,surface,flow),updateOptics=opticalUpdate(root,mesh,optics);
  root.userData.fluidCore='parametric-fluid-surface';root.userData.fluidMode=grid?'control-grid':path.length>=2?'spline-sheet':mode;root.userData.fluidTopology={u:surface.uSegments,v:surface.vSegments,periodicU,periodicV,thickness:surface.thickness};
  return {root,grounded:false,update(c,t){state.flow=control(c,'flow',1,-3,3);state.amplitude=control(c,'amplitude');state.curl=control(c,'curl',1,0,2);state.foam=control(c,'foam',1,0,1);const time=t+finite(c.phase,0);surface.update(time);foam(time,state.foam);updateOptics(time);}};
 },
});

export const fluidJet=defineModel({
 id:'fluid-jet',aliases:['water-jet-surface','procedural-liquid-jet'],
 describe:'A flowing liquid tube or flattened splash fan using the same parametric surface/foam core as fluid-sheet and the curl wave. Supply a 3D spline path, or launch direction/speed/gravity for a ballistic centreline. Travelling radius waves, taper and spread deform real 3D geometry. Analytic surface and deterministic droplets, not a fluid/pressure/volume solver.',
 size:'editable path, radius and launch dimensions in metres',
 params:{...WATER_PARAMS,shape:'jet | splash (default jet)',path:'optional [x,y,z][] authored centreline controls, minimum2; overrides ballistic launch',closedPath:'close an authored path; loops share periodic geometry/normals (default false)',origin:'ballistic launch [x,y,z] (default[0,0,0])',direction:'ballistic initial direction [x,y,z] (default[.45,1,.08])',launchSpeed:'ballistic launch speed m/s (default5)',flightTime:'trajectory duration seconds (default1.1); exactly vertical launches end before their singular turnaround',gravity:'ballistic downward acceleration m/s² (default9.81)',wind:'optional acceleration [x,y,z] m/s²',radius:'emitter radius m (default .12)',taper:'end radius reduction0...95 (default .35)',spread:'outlet radius expansion0..5 (splash defaults2)',flatten:'splash outlet compression0...98 (default .88)',twist:'section rotation degrees along path (default0; closed paths use full turns)',amplitude:'travelling radius undulation m (default .025)',wavelength:'radius-wave spacing m (default .45)',flowSpeed:'surface/foam advection m/s (default3.5)',uSegments:'samples along jet (default128)',vSegments:'samples around jet (default28)',foamCount:'bounded particle capacity (default180)',foamAmount:'fraction0..1 (default .7)',foamSize:'foam radius m (default .022)',foamLifetime:'foam life seconds (default .8)',spray:'outlet droplet normal speed m/s (default0)',sprayGravity:'droplet gravity m/s² (default9.81)',roughness:'PBR roughness0..1 (default .32)',metalness:'PBR metalness0..1 (default0)',tone:'material light/density coefficient (default .8)'},
 controls:{flow:'signed speed multiplier; negative reverses path flow (default1)',amplitude:'radius-wave multiplier0..3 (default1)',radius:'radius multiplier .1..3 (default1)',spread:'outlet-spread multiplier0..3 (default1)',foam:'visible foam fraction0..1 (default1)',phase:'absolute phase time offset seconds (default0)'},
 defaults:{flow:1,amplitude:1,radius:1,spread:1,foam:1,phase:0},
 build(ctx){
  const root=new THREE.Group(),shape=ctx.str('shape','jet',['jet','splash']),points=pathPoints(ctx.params.path);let closed=ctx.bool('closedPath',false)&&points.length>=3;
  if(closed&&points[0]!.distanceToSquared(points[points.length-1]!)<1e-10)points.pop();closed=closed&&points.length>=3;
  let curve:THREE.Curve<THREE.Vector3>;
  if(points.length>=2)curve=new THREE.CatmullRomCurve3(points,closed,'centripetal');
  else{
   const origin=vector(ctx.params.origin,[0,0,0]),direction=vector(ctx.params.direction,[.45,1,.08]);if(direction.lengthSq()<1e-12)direction.set(.45,1,.08);direction.normalize();const velocity=direction.multiplyScalar(ctx.num('launchSpeed',5,.1,30)),gravity=ctx.num('gravity',9.81,0,30),acceleration=vector(ctx.params.wind,[0,0,0]);acceleration.y-=gravity;let duration=ctx.num('flightTime',1.1,.05,10);
   if(Math.hypot(velocity.x,velocity.z,acceleration.x,acceleration.z)<1e-8&&velocity.y>0&&acceleration.y<0)duration=Math.min(duration,-velocity.y/acceleration.y*.98);
   class BallisticPath extends THREE.Curve<THREE.Vector3>{constructor(){super();}getPoint(u:number,out=new THREE.Vector3()){const t=u*duration;return out.copy(origin).addScaledVector(velocity,t).addScaledVector(acceleration,t*t*.5);}}
   curve=new BallisticPath();
  }
  const length=Math.max(.01,curve.getLength()),radius=ctx.num('radius',.12,.005,5),taper=ctx.num('taper',.35,0,.95),spread=ctx.num('spread',shape==='splash'?2:0,0,5),flatten=ctx.num('flatten',.88,0,.98),amplitude=ctx.num('amplitude',.025,0,2),wavelength=ctx.num('wavelength',.45,.03,20),speed=ctx.num('flowSpeed',3.5,0,30),twist=ctx.num('twist',0,-1440,1440)*Math.PI/180,cycles=closed?Math.max(1,Math.round(length/wavelength)):length/wavelength,swirl=ctx.num('swirl',0,-3,3);
  const state:Motion={flow:1,amplitude:1,curl:1,foam:1,radius:1,spread:1};
  const sample=splineFluidSampler({path:curve,closed,section(u,v,t,out){
   const s=closed?Math.sin(Math.PI*u)**2:u,angle=TAU*v+(closed?Math.round(twist/TAU)*TAU:twist)*u,phase=TAU*(cycles*u-speed*state.flow*t/wavelength),wave=amplitude*state.amplitude*(Math.sin(phase)+.24*Math.sin(phase*2+angle*3));
   const r=Math.max(.004,radius*state.radius*(1-taper*s)+wave),fan=1+spread*state.spread*s*s,flat=shape==='splash'?1-flatten*s:1;
   out.set(Math.cos(angle)*r*fan,Math.sin(angle)*r*flat);
  }});
  // Frenet binormal = tangent × normal, so a positive section angle gives
  // inward u×v winding. Reverse it for outward light, foam and shadow bias.
  const surface=createFluidSurface({sample,uSegments:Math.round(ctx.num('uSegments',128,16,320)),vSegments:Math.round(ctx.num('vSegments',28,8,96)),periodicU:closed,periodicV:true,flipNormals:true,thickness:0});
  const optics=waterOptics(ctx),material=optics?.material??ctx.mat({tone:ctx.num('tone',.8,.05,1),rough:ctx.num('roughness',.32,0,1),side:THREE.DoubleSide});if(!optics)material.metalness=ctx.num('metalness',0,0,1);else material.side=THREE.DoubleSide;
  const mesh=new THREE.Mesh(surface.geometry,material);mesh.name='fluid-jet-surface';root.add(mesh);
  const flow=(_u:number,_v:number,_t:number,out:THREE.Vector2)=>out.set(speed*state.flow/length,swirl/TAU),foam=foamLayers(ctx,root,surface,flow,true),updateOptics=opticalUpdate(root,mesh,optics);
  root.userData.fluidCore='parametric-fluid-surface';root.userData.fluidMode=shape;root.userData.fluidTopology={u:surface.uSegments,v:surface.vSegments,periodicU:closed,periodicV:true,thickness:0};
  return {root,grounded:false,update(c,t){state.flow=control(c,'flow',1,-3,3);state.amplitude=control(c,'amplitude');state.radius=control(c,'radius',1,.1,3);state.spread=control(c,'spread');state.foam=control(c,'foam',1,0,1);const time=t+finite(c.phase,0);surface.update(time);foam(time,state.foam);updateOptics(time);}};
 },
});
