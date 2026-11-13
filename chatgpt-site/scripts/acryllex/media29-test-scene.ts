import * as THREE from 'three';
import {preloadAssets,footage,footageFrameIndex} from '../../src/acryllex/assets.ts';
import {footageVariantKey} from '../../src/acryllex/media-key.ts';
import {Engine} from '../../src/acryllex/engine.ts';
import type {AcryllexSpec} from '../../src/acryllex/spec.ts';
import type {ModelCtx,Built} from '../../src/acryllex/models/types.ts';

type Params=Record<string,unknown>;
const W=320,H=160,fw=12,fh=8,cols=2,rows=2,fps=2,count=6;
const colors=[[200,20,30],[20,200,40],[30,40,210],[220,190,20],[180,20,160],[20,170,190]];
const prepared={fps,cols:fw,rows:fh,blur:0,preserveAspect:true};
const colorKey=footageVariantKey('synthetic.mov',prepared),monoKey=footageVariantKey('synthetic.mov',{...prepared,monochrome:true});
const files={color:'media29/color/manifest.json',mono:'media29/mono/manifest.json'};
function fixtureFiles(){
 const out:{path:string;type:string;body:string;base64?:boolean}[]=[];
 for(const mono of [false,true]){
  const prefix=mono?'media29/mono':'media29/color';
  for(let atlas=0;atlas<2;atlas++){
   const c=document.createElement('canvas');c.width=fw*cols;c.height=fh*rows;const x=c.getContext('2d')!;
   for(let k=0;k<4;k++){
    const i=atlas*4+k,color=colors[i]??[255,255,255],rgb=mono?Array(3).fill(Math.round(.2126*color[0]!+.7152*color[1]!+.0722*color[2]!)):color;
    const px=k%cols*fw,py=Math.floor(k/cols)*fh;x.fillStyle=`rgb(${rgb.join(',')})`;x.fillRect(px,py,fw,fh);
    x.fillStyle=mono?'rgb(40,40,40)':'rgb(5,10,250)';x.fillRect(px,py,3,2);
    x.fillStyle=mono?'rgb(220,220,220)':'rgb(250,10,5)';x.fillRect(px+9,py+6,3,2);
   }
   out.push({path:prefix+`/a${atlas}.png`,type:'image/png',body:c.toDataURL('image/png').split(',')[1]!,base64:true});
  }
  const man={w:fw,h:fh,cols,rows,fps,frames:count,atlases:[prefix+'/a0.png',prefix+'/a1.png'],preparedVersion:2,monochrome:mono,optionalFutureField:'accepted'};
  out.push({path:prefix+'/manifest.json',type:'application/json',body:JSON.stringify(man)});
 }
 const color=JSON.parse(out.find(x=>x.path===files.color)!.body);
 out.push({path:'media29/bad-fps.json',type:'application/json',body:JSON.stringify({...color,fps:0})});
 out.push({path:'media29/bad-capacity.json',type:'application/json',body:JSON.stringify({...color,frames:9})});
 out.push({path:'media29/bad-size.json',type:'application/json',body:JSON.stringify({...color,w:13})});
 out.push({path:'media29/partial.json',type:'application/json',body:JSON.stringify({...color,atlases:[color.atlases[0],'media29/not-found.png']})});
 out.push({path:'media29/retry.json',type:'application/json',body:JSON.stringify(color)});
 return {files:out,colorKey,monoKey};
}
function context(params:Params):ModelCtx{return {params,seed:1,num:(k,f,min=-Infinity,max=Infinity)=>{const n=Number(params[k]);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):f;},bool:(k,f)=>typeof params[k]==='boolean'?params[k] as boolean:f,str:(k,f,allowed)=>{const v=String(params[k]??'').toLowerCase();return (allowed?(allowed as readonly string[]).includes(v):v.length>0)?v as typeof f:f;},color:()=>new THREE.Color('#fff'),mat:()=>{throw new Error('footage used a placeholder material');},mesh:()=>{throw new Error('footage used a placeholder mesh');}};}
async function run({images=false}={}){
 const checks:{name:string;passed:boolean;details?:unknown}[]=[];
 const check=(name:string,ok:boolean,details?:unknown)=>{checks.push({name,passed:ok,details});if(!ok)throw new Error(name+': '+JSON.stringify(details));};
 const expectThrow=(fn:()=>unknown,pattern:RegExp)=>{try{fn();return false;}catch(e){return pattern.test(String(e));}};
 const expectReject=async(fn:()=>Promise<unknown>,pattern:RegExp)=>{try{await fn();return false;}catch(e){return pattern.test(String(e));}};
 const cases:[[number,number,number,boolean],number][]=[[[0,2,6,false],0],[[.5,2,6,false],1],[[2.5,2,6,false],5],[[100,2,6,false],5],[[-1,2,6,false],0],[[3,2,6,true],0],[[-.25,2,6,true],5],[[-3,2,6,true],0],[[1e200,2,6,false],5],[[9,29.97,1,true],0]];
 check('Absolute frame sampler clamps, wraps negatives, accepts fractional fps and includes the last frame',cases.every(([args,n])=>footageFrameIndex(...args)===n));
 check('Frame boundaries remain distinct outside arithmetic tolerance',footageFrameIndex(.5-1e-5,2,6)===0&&footageFrameIndex(.5,2,6)===1&&footageFrameIndex(.5+1e-5,2,6)===1);
 check('Invalid finite-time/fps/count inputs fail clearly',[()=>footageFrameIndex(NaN,2,6),()=>footageFrameIndex(0,Infinity,6),()=>footageFrameIndex(0,0,6),()=>footageFrameIndex(0,2,0)].every(fn=>expectThrow(fn,/footage:/)));
 await Promise.all([preloadAssets({[colorKey]:files.color,['footage:synthetic.mov']:files.color,[monoKey]:files.mono}),preloadAssets({['footage:other-alias']:files.color})]);
 await preloadAssets({['footage:legacy.mov']:files.color});
 const renderer=new THREE.WebGLRenderer({antialias:false,alpha:false,preserveDrawingBuffer:true});renderer.setSize(W,H,false);renderer.outputColorSpace=THREE.LinearSRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;
 const gl=renderer.getContext(),scene=new THREE.Scene();scene.background=new THREE.Color('#000');const camera=new THREE.OrthographicCamera(-2,2,1,-1,.1,10);camera.position.z=5;camera.lookAt(0,0,0);const live=new Set<Built>();
 function make(params:Params,x=0){const b=footage.build(context({height:1.2,...params}));b.root.position.x=x;scene.add(b.root);live.add(b);return b;}
 const mesh=(b:Built)=>b.root.children[0] as THREE.Mesh<THREE.PlaneGeometry,THREE.MeshBasicMaterial>;
 const tick=(b:Built,t:number,speed=1)=>b.update!({speed},t,null as never);
 function drop(b:Built){scene.remove(b.root);b.root.traverse(o=>{const m=o as THREE.Mesh;if(m.geometry)m.geometry.dispose();const materials=m.material?(Array.isArray(m.material)?m.material:[m.material]):[];for(const mat of materials)mat.dispose();});live.delete(b);}
 function render(){renderer.render(scene,camera);}
 function pixel(x:number,y:number){const v=new Uint8Array(4);gl.readPixels(x,H-1-y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,v);return Array.from(v.subarray(0,3));}
 function matches(actual:number[],expected:number[],tol=0){return actual.every((v,i)=>Math.abs(v-expected[i]!)<=tol);}
 function framePixels(){const v=new Uint8Array(W*H*4);gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,v);return v;}
 function exact(a:Uint8Array,b:Uint8Array){return a.length===b.length&&a.every((v,i)=>v===b[i]);}
 const resultImages:Record<string,string>={};
 try{
  check('Missing file/variant fails instead of rendering a placeholder',expectThrow(()=>footage.build(context({})),/params.file/)&&expectThrow(()=>footage.build(context({file:'missing.mov'})),/not preloaded/)&&expectThrow(()=>footage.build(context({file:'synthetic.mov',...prepared,crop:'1:1:0:0'})),/variant was not preloaded/));
  const A=make({file:'synthetic.mov',...prepared,timeOrigin:1},-.95),B=make({file:'synthetic.mov',...prepared,timeOrigin:1,start:.5},.95);tick(A,1);tick(B,1);render();
  check('Two instances select different tiles in one atlas with unchanged native RGB',matches(pixel(84,80),colors[0]!)&&matches(pixel(236,80),colors[1]!),{left:pixel(84,80),right:pixel(236,80)});
  check('Top-left and bottom-right frame markers retain orientation',matches(pixel(30,44),[5,10,250])&&matches(pixel(138,116),[250,10,5]),{topLeft:pixel(30,44),bottomRight:pixel(138,116)});
  const ma=mesh(A),mb=mesh(B),a0=ma.material.map!,b0=mb.material.map!;
  check('Instance textures/matrices are independent while decoded source is shared',a0!==b0&&a0.matrix!==b0.matrix&&a0.offset!==b0.offset&&a0.source===b0.source);
  const geo=ma.geometry,position=geo.attributes.position!.array,uv=geo.attributes.uv!.array,index=geo.index!.array,matrix=a0.matrix,elements=a0.matrix.elements,material=ma.material,materialVersion=material.version,sourceVersion=a0.source.version;
  tick(A,2);render();check('Updating/seeking one instance cannot move the other tile',matches(pixel(84,80),colors[2]!)&&matches(pixel(236,80),colors[1]!));
  tick(A,3);tick(B,3);render();const a1=ma.material.map!,b1=mb.material.map!;check('Partial final atlas reaches exact last frame without sampling padding',matches(pixel(84,80),colors[4]!)&&matches(pixel(236,80),colors[5]!),{left:pixel(84,80),right:pixel(236,80)});
  const forward=framePixels();tick(A,1);tick(B,1);render();tick(B,3);tick(A,3);render();check('Cross-atlas reverse seek and update order reproduce exact native pixels',exact(framePixels(),forward));
  const atlasMatrices=[a0.matrix,a1.matrix],atlasSources=[a0.source,a1.source],programCount=renderer.info.programs!.length,warmMemory={...renderer.info.memory};
  for(let i=0;i<1000;i++){tick(A,1+(i%12)/4);tick(B,1+(11-i%12)/4);if(i%100===0)render();}
  tick(A,1);tick(B,1);render();
  check('Playback retains materials, geometry buffers, matrix objects and source versions',ma.geometry===geo&&geo.attributes.position!.array===position&&geo.attributes.uv!.array===uv&&geo.index!.array===index&&ma.material===material&&material.version===materialVersion&&a0.matrix===matrix&&a0.matrix.elements===elements&&a0.source.version===sourceVersion&&a0.matrix===atlasMatrices[0]&&a1.matrix===atlasMatrices[1]&&a0.source===atlasSources[0]&&a1.source===atlasSources[1]);
  check('Warmed playback does not allocate GPU textures/geometries/programs per frame',renderer.info.memory.textures===warmMemory.textures&&renderer.info.memory.geometries===warmMemory.geometries&&renderer.info.programs!.length===programCount,{warm:warmMemory,now:{...renderer.info.memory},programCount});
  tick(A,.5);tick(B,100);render();check('timeOrigin clamps before reveal and non-looping playback holds its last frame',matches(pixel(84,80),colors[0]!)&&matches(pixel(236,80),colors[5]!));
  const reverse=make({file:'synthetic.mov',...prepared,timeOrigin:1,start:2.5,loop:true});tick(reverse,1,-1);render();const atOrigin=pixel(160,80);tick(reverse,1.5,-1);render();const backwards=pixel(160,80);tick(reverse,5,-1);render();const negativeWrap=pixel(160,80);tick(reverse,1,0);render();check('Reverse, stopped and negative looping playback sample absolute clip time',matches(atOrigin,colors[5]!)&&matches(backwards,colors[4]!)&&matches(negativeWrap,colors[3]!)&&matches(pixel(160,80),colors[5]!),{atOrigin,backwards,negativeWrap,stopped:pixel(160,80)});check('Nonfinite dynamic time/speed fails clearly',expectThrow(()=>tick(reverse,NaN),/must be finite/)&&expectThrow(()=>tick(reverse,1,Infinity),/must be finite/));drop(reverse);
  const mono=make({file:'synthetic.mov',...prepared,monochrome:true});tick(mono,0);render();const luma=Math.round(.2126*200+.7152*20+.0722*30);check('Same-file RGB and precomputed monochrome variants remain separate',matches(pixel(160,80),[luma,luma,luma])&&mesh(mono).material.map!.source!==a0.source,{mono:pixel(160,80),luma});drop(mono);
  const legacy=make({file:'legacy.mov'});tick(legacy,.5);render();check('Legacy file-only maps retain RGB and manifest frame rate',matches(pixel(160,80),colors[1]!));drop(legacy);
  const url='https://example.invalid/synthetic.mov',urlParams={...prepared};await preloadAssets({[footageVariantKey(url,urlParams)]:files.color});const remote=make({url,...urlParams});tick(remote,0);render();check('params.url uses the same preparation identity as params.file',matches(pixel(160,80),colors[0]!));drop(remote);
  const swapParams={...prepared},swapKey=footageVariantKey('swap.mov',swapParams);await preloadAssets({[swapKey]:files.color});const oldClip=make({file:'swap.mov',...swapParams});await preloadAssets({[swapKey]:files.mono});const newClip=make({file:'swap.mov',...swapParams});check('Manifest-path changes replace cache lookup without mutating existing instances',mesh(oldClip).material.map!.source===a0.source&&mesh(newClip).material.map!.source!==a0.source);drop(oldClip);drop(newClip);
  const nonSquare=ma.geometry.parameters;check('Plane aspect follows manifest w/h independently of output aspect',Math.abs(nonSquare.width/nonSquare.height-fw/fh)<1e-12&&Math.abs(W/H-fw/fh)>.1,nonSquare);
  check('Invalid metadata/atlas failures reject preparation clearly',await expectReject(()=>preloadAssets({'footage:invalid-fps':'media29/bad-fps.json'}),/invalid fps/)&&await expectReject(()=>preloadAssets({'footage:invalid-count':'media29/bad-capacity.json'}),/capacity/)&&await expectReject(()=>preloadAssets({'footage:invalid-size':'media29/bad-size.json'}),/dimensions do not match/)&&await expectReject(()=>preloadAssets({'footage:missing-manifest':'media29/absent.json'}),/manifest HTTP 404/));
  const disposedPartial:THREE.Texture[]=[];const originalDispose=THREE.Texture.prototype.dispose;THREE.Texture.prototype.dispose=function(){disposedPartial.push(this);originalDispose.call(this);};let partialFailure=false;
  try{partialFailure=await expectReject(()=>preloadAssets({'footage:partial':'media29/partial.json'}),/footage/);}finally{THREE.Texture.prototype.dispose=originalDispose;}
  check('Partial atlas-load failure disposes already decoded temporary textures',partialFailure&&disposedPartial.length===1,{disposed:disposedPartial.length});
  const retryKey=footageVariantKey('retry.mov',prepared);const retryFirst=await expectReject(()=>preloadAssets({[retryKey]:'media29/retry.json'}),/HTTP 503/);await preloadAssets({[retryKey]:'media29/retry.json'});const retry=make({file:'retry.mov',...prepared});tick(retry,0);render();check('A failed load is retryable and does not poison the clip cache',retryFirst&&matches(pixel(160,80),colors[0]!));drop(retry);
  tick(A,1);tick(B,1);render();if(images)resultImages['independent-instances']=renderer.domElement.toDataURL('image/png').split(',')[1]!;
  const disposedA:THREE.Texture[]=[];for(const t of [a0,a1])t.addEventListener('dispose',()=>disposedA.push(t));const disposedB:THREE.Texture[]=[];for(const t of [b0,b1])t.addEventListener('dispose',()=>disposedB.push(t));drop(A);material.dispose();check('Material disposal releases only its owned clones and is idempotent',disposedA.length===2&&disposedB.length===0&&material.map===null);
  tick(B,1);render();check('Disposing one instance leaves another instance playable',matches(pixel(236,80),colors[1]!));drop(B);render();const afterDispose={...renderer.info.memory};check('All per-instance GPU resources return to baseline after disposal',afterDispose.textures===0&&afterDispose.geometries===0,{afterDispose});
  const reload=make({file:'synthetic.mov',...prepared});tick(reload,0);render();check('Shared decoded media survives instance disposal and reload',matches(pixel(160,80),colors[0]!)&&mesh(reload).material.map!.source===a0.source);drop(reload);render();
  const spec:AcryllexSpec={version:1,series:'ACRYLLEX',title:'Synthetic footage integration',captions:false,format:{width:W,height:H,cell:2},look:{inkMode:'shaded',shadows:0,ao:0,noise:0,fuzz:0,gamma:1,contrast:1,inkLo:1,ink:1},scenes:[{say:'',duration:6,hue:'blue',ground:false,ao:0,camera:{move:'static',pos:[0,0,5],look:[0,0,0],fov:2*Math.atan(1/5)*180/Math.PI},light:{key:0,fill:0,rim:0,ambient:0,contrast:1,gamma:1,exposure:1,blackPoint:0,whitePoint:1,ink:1},text:[],objects:[{id:'a',model:'footage',origin:'model',pos:[-.95,0,0],enter:'none',idle:'none',params:{file:'synthetic.mov',...prepared,height:1.2,timeOrigin:1}},{id:'b',model:'clip',origin:'model',pos:[.95,0,0],enter:'none',idle:'none',params:{file:'synthetic.mov',...prepared,height:1.2,timeOrigin:1,start:.5}}]}]};
  const engine=new Engine(spec);
  try{
   const canvas=engine.frame(1),first=canvas.toDataURL('image/png'),data=canvas.getContext('2d')!.getImageData(0,0,W,H).data;
   const energy=(cx:number)=>{const sum=[0,0,0];for(let y=65;y<95;y++)for(let x=cx-15;x<cx+15;x++){const k=(y*W+x)*4;for(let c=0;c<3;c++)sum[c]!+=data[k+c]!;}return sum;};
   const left=energy(84),right=energy(236);check('Current engine renders independent RGB footage through the pixel shader',left[0]!>5*left[1]!&&right[1]!>5*right[0]!,{left,right});
   engine.frame(3);engine.frame(.5);check('Full current engine reverse seek reproduces the native footage frame',engine.frame(1).toDataURL('image/png')===first);
   const material=engine.runtime(0).objs[0]!.meshes[0]!.material as THREE.MeshBasicMaterial;engine.dispose();check('Engine scene disposal reaches the owned atlas cleanup hook',material.map===null);
  }finally{engine.dispose();}
  const monoSpec=structuredClone(spec);monoSpec.look!.inkMode='fixed';monoSpec.look!.palette={blue:'#1234c8'};monoSpec.scenes[0]!.objects=[{id:'mono',model:'video',origin:'model',pos:[0,0,0],enter:'none',idle:'none',params:{file:'synthetic.mov',...prepared,height:1.2,monochrome:true}}];
  const monoEngine=new Engine(monoSpec);
  try{const canvas=monoEngine.frame(0),data=canvas.getContext('2d')!.getImageData(0,0,W,H).data;const ink=new Set<string>();for(let k=0;k<data.length;k+=4)if(data[k+2]!>20)ink.add([data[k],data[k+1],data[k+2]].join(','));check('Prepared monochrome footage uses one fixed scene ink without recoloring the client texture',ink.size===1&&[...ink].every(v=>{const[r,g,b]=v.split(',').map(Number);return b!>g!&&b!>r!*3;}),{ink:[...ink]});}finally{monoEngine.dispose();}
  const missing=structuredClone(spec);missing.scenes[0]!.objects=[{id:'missing',model:'footage',origin:'model',pos:[0,0,0],params:{file:'never-preloaded.mov'}}];const missingEngine=new Engine(missing);
  try{check('Current engine propagates a missing footage error instead of its generic cube fallback',expectThrow(()=>missingEngine.frame(0),/footage.*not preloaded/));}finally{missingEngine.dispose();}
  return {checks,resources:{warm:warmMemory,afterDispose,final:{...renderer.info.memory}},images:resultImages};
 }finally{for(const b of [...live])drop(b);renderer.dispose();renderer.forceContextLoss();}
}
(window as any).mediaRegression={fixtureFiles,run};
