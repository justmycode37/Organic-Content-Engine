import * as THREE from 'three';
import {ambientOcclusionGLSL} from '../../src/acryllex/ao.ts';
import {Engine} from '../../src/acryllex/engine.ts';
import type {AcryllexSpec} from '../../src/acryllex/spec.ts';

type Mode='legacy'|'plane';
const modes:Mode[]=['legacy','plane'];
const width=640,height=400;
type Stats=ReturnType<typeof summarize>;
type Options={images?:boolean};

function summarize(data:Float32Array,select:(i:number)=>boolean=()=>true){
 let count=0,total=0,min=1,max=0,finite=true;
 for(let i=0;i<data.length/4;i++)if(select(i)){
  const a=data[i*4]!;finite&&=Number.isFinite(a);count++;total+=a;min=Math.min(min,a);max=Math.max(max,a);
 }
 return {count,mean:count?total/count:null,min,max,finite};
}
function sameBytes(a:ArrayBufferView,b:ArrayBufferView){
 if(a.byteLength!==b.byteLength)return false;
 const x=new Uint8Array(a.buffer,a.byteOffset,a.byteLength),y=new Uint8Array(b.buffer,b.byteOffset,b.byteLength);
 return x.every((v,i)=>v===y[i]);
}

/** Independent geometric probes; no fixture, reference image, or stored pixel baseline. */
function depthChecks({images=false}:Options){
 THREE.ColorManagement.enabled=false;
 const canvas=document.createElement('canvas');
 const renderer=new THREE.WebGLRenderer({canvas,preserveDrawingBuffer:images,antialias:false});
 renderer.setSize(width,height,false);renderer.setPixelRatio(1);
 renderer.outputColorSpace=THREE.LinearSRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;
 const gl=renderer.getContext(),floatFramebuffer=renderer.extensions.has('EXT_color_buffer_float');
 if(!floatFramebuffer){renderer.dispose();renderer.forceContextLoss();throw new Error('AO checks require EXT_color_buffer_float for unquantized finite-output checks');}
 const debug=gl.getExtension('WEBGL_debug_renderer_info');
 const gpu={version:gl.getParameter(gl.VERSION),renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};
 const postScene=new THREE.Scene(),postCam=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
 const quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2));postScene.add(quad);
 const vertex='varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
 const header=`precision highp float;varying vec2 vUv;
uniform sampler2D tDepth;uniform sampler2D tColor;uniform float cNear;uniform float cFar;
uniform float aoR;uniform float aoStr;uniform float tanHalf;uniform vec2 res;uniform float cell;
uniform int diagnostic;
float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
float linZ(vec2 uv){float z=texture2D(tDepth,uv).x*2.-1.;return 2.*cNear*cFar/(cFar+cNear-z*(cFar-cNear));}
`;
 const body=`void main(){
 vec2 uv=(floor(vUv*res/cell)+.5)*cell/res;
 float a=ambientOcclusion(uv);
 if(diagnostic==1)gl_FragColor=vec4(a,a,a,1.);
 else if(diagnostic==2)gl_FragColor=vec4(texture2D(tDepth,vUv).x,0.,0.,1.);
 else gl_FragColor=vec4(texture2D(tColor,vUv).rgb*a,1.);
}`;
 const uniforms={tDepth:{value:null as THREE.Texture|null},tColor:{value:null as THREE.Texture|null},cNear:{value:.1},cFar:{value:100},aoR:{value:.6},aoStr:{value:1.4},tanHalf:{value:Math.tan(Math.PI/10)},res:{value:new THREE.Vector2(width,height)},cell:{value:1},diagnostic:{value:1}};
 const materials=Object.fromEntries(modes.map(mode=>[mode,new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:header+ambientOcclusionGLSL(mode)+body,uniforms})])) as Record<Mode,THREE.ShaderMaterial>;
 const aoTarget=new THREE.WebGLRenderTarget(width,height,{type:THREE.FloatType,format:THREE.RGBAFormat,depthBuffer:false});
 const sceneTarget=new THREE.WebGLRenderTarget(width,height,{type:THREE.HalfFloatType,samples:4,depthTexture:new THREE.DepthTexture(width,height,THREE.FloatType)});
 const pictures:Record<string,string>={};
 function pixels(mode:Mode){
  quad.material=materials[mode];renderer.setRenderTarget(aoTarget);renderer.render(postScene,postCam);
  const data=new Float32Array(width*height*4);renderer.readRenderTargetPixels(aoTarget,0,0,width,height,data);return data;
 }
 function picture(name:string,mode:Mode){
  if(!images)return;
  quad.material=materials[mode];renderer.setRenderTarget(null);renderer.render(postScene,postCam);
  pictures[name]=canvas.toDataURL('image/png').split(',')[1]!;
 }
 function analytic(name:string,q0:number,sx:number,sy:number,cell:number,depthScale=1){
  uniforms.cell.value=cell;
  const near=uniforms.cNear.value,far=uniforms.cFar.value,dw=width*depthScale,dh=height*depthScale,depth=new Float32Array(dw*dh);
  // Ray/plane intersection has affine inverse view depth. Encode directly into
  // a depth texture, independently of the shader's reconstruction algorithm.
  for(let y=0;y<dh;y++)for(let x=0;x<dw;x++){
   const q=q0+sx*((x+.5)/dw-.5)+sy*((y+.5)/dh-.5);
   depth[y*dw+x]=Math.min(1,Math.max(0,(far-near*far*q)/(far-near)));
  }
  const texture=new THREE.DataTexture(depth,dw,dh,THREE.RedFormat,THREE.FloatType);texture.needsUpdate=true;
  uniforms.tDepth.value=texture;uniforms.diagnostic.value=1;
  const stats={} as Record<Mode,Stats>;
  try{for(const mode of modes){stats[mode]=summarize(pixels(mode));picture(name+'-'+mode,mode);}}
  finally{texture.dispose();}
  return {name,cell,depthScale,...stats};
 }

 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(36,width/height,.1,100);
 camera.position.set(4.2,3.2,5.5);camera.lookAt(0,.35,0);camera.updateMatrixWorld(true);
 scene.add(new THREE.AmbientLight(0xffffff,1.6));
 const light=new THREE.DirectionalLight(0xffffff,1.8);light.position.set(2,5,3);scene.add(light);
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(16,16),new THREE.MeshLambertMaterial({color:0x777777,side:THREE.DoubleSide}));floor.rotation.x=-Math.PI/2;scene.add(floor);
 const box=new THREE.Mesh(new THREE.BoxGeometry(1.25,1.4,1.25),new THREE.MeshLambertMaterial({color:0xaaaaaa}));box.position.y=.7;scene.add(box);
 function raster(x:number,name?:string){
  box.position.x=x;renderer.setRenderTarget(sceneTarget);renderer.setClearColor(0x151515,1);renderer.clear();renderer.render(scene,camera);
  uniforms.tDepth.value=sceneTarget.depthTexture;uniforms.tColor.value=sceneTarget.texture;
  uniforms.cell.value=1.7;uniforms.diagnostic.value=2;
  const depthPixels=pixels('plane'),world=new THREE.Vector3(),contact=new Set<number>(),far=new Set<number>();
  // Select test regions from unprojected geometry rather than guessed screen
  // rectangles: a ring beside the footprint and a separate distant floor ring.
  for(let y=0;y<height;y++)for(let px=0;px<width;px++){
   const i=y*width+px,z=depthPixels[i*4]!;if(z>.99999)continue;
   world.set((px+.5)/width*2-1,(y+.5)/height*2-1,z*2-1).unproject(camera);
   const edge=Math.max(Math.abs(world.x-x),Math.abs(world.z))-.625;
   if(Math.abs(world.y)<.005){if(edge>.025&&edge<.3)contact.add(i);if(edge>.75&&edge<2.)far.add(i);}
  }
  const stats={} as Record<Mode,{all:Stats;contact:Stats;far:Stats}>;
  const raw={} as Record<Mode,Float32Array>;
  for(const mode of modes){
   uniforms.diagnostic.value=1;raw[mode]=pixels(mode);
   stats[mode]={all:summarize(raw[mode]),contact:summarize(raw[mode],i=>contact.has(i)),far:summarize(raw[mode],i=>far.has(i))};
   if(name){picture(name+'-'+mode+'-ao',mode);uniforms.diagnostic.value=0;picture(name+'-'+mode+'-lit',mode);}
  }
  return {stats,raw};
 }
 try{
  const planes=[analytic('front',.25,0,0,1),analytic('tilt-x',.25,.18,0,1),analytic('tilt-xy',.25,.15,.08,1.7),analytic('grazing',.22,.34,.04,2.3),analytic('half-depth-resolution',.25,.15,.08,1.7,.5),analytic('double-depth-resolution',.25,.15,.08,1.7,2),analytic('far-clip-horizon',.2,.45,0,1.7)];
  const clearDepth=analytic('clear-depth',1/100,0,0,1.7).plane;
  const nearClip=analytic('near-clip',1/.1,0,0,1.7).plane;
  box.visible=false;const rasterPlane=raster(0,'raster-plane').stats;box.visible=true;
  const contact=raster(0,'box-contact');
  const states=[-.4,.3,0,.3,-.4],frames=states.map(x=>raster(x));
  const order=modes.map(mode=>({mode,states,exact: sameBytes(frames[0]!.raw[mode],frames[4]!.raw[mode])&&sameBytes(frames[1]!.raw[mode],frames[3]!.raw[mode])&&sameBytes(contact.raw[mode],frames[2]!.raw[mode])}));
  const edgeCases:Record<string,Stats>={clearDepth,nearClip};uniforms.diagnostic.value=1;
  for(const [name,radius,strength] of [['zeroRadius',0,1.4],['zeroStrength',.6,0],['largeRadius',50,5],['strongAO',.6,5]] as const){
   uniforms.aoR.value=radius;uniforms.aoStr.value=strength;edgeCases[name]=summarize(pixels('plane'));
  }
  return {gpu,planes,rasterPlane,contact:contact.stats,order,edgeCases,images:pictures};
 }finally{
  Object.values(materials).forEach(m=>m.dispose());quad.geometry.dispose();aoTarget.dispose();sceneTarget.dispose();
  floor.geometry.dispose();floor.material.dispose();box.geometry.dispose();box.material.dispose();
  renderer.dispose();renderer.forceContextLoss();
 }
}

/** Exercise the public look.aoMethod integration and animated reverse seeking. */
function engineChecks(){
 const spec:AcryllexSpec={version:1,series:'ACRYLLEX',title:'AO regression',captions:false,
  format:{width:320,height:200,cell:1.7},look:{shadows:0,noise:0,fuzz:0,gamma:1,contrast:1},
  scenes:[{say:'AO',duration:3,ground:false,hue:'white',ao:1.4,aoRadius:.6,
   camera:{move:'static',pos:[3,2.5,4],look:[0,0,0]},light:{key:0,fill:0,rim:0,ambient:.7,contrast:1},
   objects:[{id:'box',model:'compose',origin:'center',enter:'none',idle:'none',params:{grounded:false,parts:[{shape:'box',size:[1.6,1.6,1.6],tone:.6}]}}],
   events:[{at:0,dur:2.5,target:'box',turn:[8,40,0]}],
  }]};
 const times=[.25,1,1.5,2.5,1.5,1,.25];
 const frames={} as Record<'off'|'default'|Mode,Uint8ClampedArray[]>;
 const order=[] as {mode:string;exact:boolean}[];
 for(const mode of ['off','default','legacy','plane'] as const){
  const copy=structuredClone(spec);
  if(mode==='off')copy.scenes[0]!.ao=0;
  if(mode==='legacy'||mode==='plane')copy.look!.aoMethod=mode;
  const engine=new Engine(copy);
  try{
   frames[mode]=times.map(t=>{
    const canvas=engine.frame(t,{captions:false});
    return canvas.getContext('2d',{willReadFrequently:true})!.getImageData(0,0,canvas.width,canvas.height).data;
   });
   order.push({mode,exact:sameBytes(frames[mode][0]!,frames[mode][6]!)&&sameBytes(frames[mode][1]!,frames[mode][5]!)&&sameBytes(frames[mode][2]!,frames[mode][4]!)});
  }finally{engine.dispose();}
 }
 const mean=(data:Uint8ClampedArray)=>{let total=0;for(let i=0;i<data.length;i+=4)total+=Math.max(data[i]!,data[i+1]!,data[i+2]!);return total/(data.length/4);};
 const difference=(a:Uint8ClampedArray,b:Uint8ClampedArray)=>{let total=0;for(let i=0;i<a.length;i+=4)total+=Math.abs(Math.max(a[i]!,a[i+1]!,a[i+2]!)-Math.max(b[i]!,b[i+1]!,b[i+2]!));return total/(a.length/4);};
 const mixed=structuredClone(spec);mixed.look!.aoMethod='legacy';mixed.scenes[0]!.aoMethod='plane';mixed.scenes.push({...structuredClone(spec.scenes[0]!),aoMethod:'legacy'});
 const legacySpec=structuredClone(mixed);legacySpec.scenes.forEach(s=>s.aoMethod='legacy');const referenceEngine=new Engine(legacySpec);let referenceLegacy:Uint8ClampedArray;try{const c=referenceEngine.frame(4);referenceLegacy=c.getContext('2d')!.getImageData(0,0,c.width,c.height).data;}finally{referenceEngine.dispose();}
 const mixedEngine=new Engine(mixed);let sceneOverridesExact=false;let sceneOverrideDifferences={plane:0,legacy:0,repeat:0};
 try{const capture=(t:number)=>{const c=mixedEngine.frame(t);return c.getContext('2d')!.getImageData(0,0,c.width,c.height).data;};const a=capture(1),b=capture(4),again=capture(1);sceneOverrideDifferences={plane:difference(a,frames.plane[1]!),legacy:difference(b,referenceLegacy),repeat:difference(a,again)};sceneOverridesExact=sameBytes(a,frames.plane[1]!)&&sameBytes(b,referenceLegacy)&&sameBytes(a,again);}finally{mixedEngine.dispose();}
 return {times,order,sceneOverridesExact,sceneOverrideDifferences,defaultMatchesPlane:frames.default.every((frame,i)=>sameBytes(frame,frames.plane[i]!)),legacyMean:mean(frames.legacy[1]!),planeMean:mean(frames.plane[1]!),planeDifferenceFromOff:difference(frames.plane[1]!,frames.off[1]!),legacyDifferenceFromOff:difference(frames.legacy[1]!,frames.off[1]!)};
}

declare global {interface Window {aoRegression:{run(options?:Options):ReturnType<typeof run>}}}
function run(options:Options={}){return {...depthChecks(options),engine:engineChecks()};}
window.aoRegression={run};
