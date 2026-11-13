// Auto-match a scene of a spec against a reference video: hill-climbs numeric spec parameters
// (camera, placement, scale, model params) to maximise a dot-density similarity score.
//   node scripts/acryllex/match.mjs <spec.json> <ref.mp4> <plan.json> [--crop=W:H:X:Y] [--write]
// plan.json: {"scene":3,"times":[0.6,1.5],"rounds":4,"params":[{"path":"camera.pos.0","step":0.3,"min":-9,"max":9},...]}
// Paths are relative to the scene. The best values are printed (and written back with --write).
// Optional channel:"neutral" isolates grey/white lettering from coloured models.
// Reference samples use the same fps filter as compare.py (60 fps unless referenceFps is set).
// A parameter can use paths:[...] to fit linked values together (e.g. both shoulders).
import {readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {openAcryllex} from './render.mjs';

const [specPath,refPath,planPath,...flags]=process.argv.slice(2);
if(!specPath||!refPath||!planPath)throw new Error('Usage: match.mjs <spec.json> <ref> <plan.json> [--crop=W:H:X:Y] [--write]');
const crop=(flags.find(f=>f.startsWith('--crop='))??'').slice(7);
const spec=JSON.parse(await readFile(specPath,'utf8'));const plan=JSON.parse(await readFile(planPath,'utf8'));
const DW=291,DH=168;
const sceneStart=spec.scenes.slice(0,plan.scene).reduce((a,s)=>a+(s.duration??3),0);

function refFrames(times){
 const fps=plan.referenceFps??60;if(!Number.isFinite(fps)||fps<1||fps>120)throw new Error('referenceFps must be between 1 and 120');
 const requested=times.map(t=>Math.round(t*fps)),indices=[...new Set(requested)].sort((a,b)=>a-b);
 const select=indices.map(n=>`eq(n\\,${n})`).join('+');
 const vf=`${crop?`crop=${crop},`:''}fps=${fps}:start_time=0,select=${select},scale=${DW}:${DH}:flags=area`;
 const bytes=DW*DH*3,expected=indices.length*bytes;
 const r=spawnSync('ffmpeg',['-v','error','-i',refPath,'-vf',vf,'-fps_mode','passthrough','-f','rawvideo','-pix_fmt','rgb24','-'],{maxBuffer:Math.max(1<<26,expected+1024)});
 if(r.status!==0||r.stdout?.length!==expected)throw new Error(`Reference samples: ${r.stderr?.toString()||'incomplete decode'}`);
 const frames=new Map();
 indices.forEach((n,k)=>{const b=r.stdout.subarray(k*bytes,(k+1)*bytes),out=new Float32Array(DW*DH);
  for(let i=0;i<DW*DH;i++){const hi=Math.max(b[i*3],b[i*3+1],b[i*3+2]),lo=Math.min(b[i*3],b[i*3+1],b[i*3+2]);out[i]=plan.channel==='neutral'&&(hi-lo>hi*.08||hi<20)?0:hi/255;}
  frames.set(n,out);
 });
 return requested.map(n=>frames.get(n));
}
function blur(a,s){ // separable gaussian
 const r=Math.ceil(s*3),k=[];let sum=0;for(let i=-r;i<=r;i++){const v=Math.exp(-i*i/(2*s*s));k.push(v);sum+=v;}for(let i=0;i<k.length;i++)k[i]/=sum;
 const t=new Float32Array(a.length),o=new Float32Array(a.length);
 for(let y=0;y<DH;y++)for(let x=0;x<DW;x++){let v=0;for(let i=-r;i<=r;i++){const xx=Math.min(DW-1,Math.max(0,x+i));v+=a[y*DW+xx]*k[i+r];}t[y*DW+x]=v;}
 for(let y=0;y<DH;y++)for(let x=0;x<DW;x++){let v=0;for(let i=-r;i<=r;i++){const yy=Math.min(DH-1,Math.max(0,y+i));v+=t[yy*DW+x]*k[i+r];}o[y*DW+x]=v;}
 return o;
}
/** Same idea as the reference compare tool, at dot resolution: silhouette IoU + SSIM of tone inside the union. */
function score(A,B){
 const a=blur(A,1.75),b=blur(B,1.75);const ma=blur(a,2.5),mb=blur(b,2.5);
 let inter=0,uni=0;const mask=new Uint8Array(a.length);for(let i=0;i<a.length;i++){const ca=ma[i]>0.04,cb=mb[i]>0.04;if(ca||cb){uni++;mask[i]=1;}if(ca&&cb)inter++;}
 if(uni<20){let error=0,energy=0;for(let i=0;i<A.length;i++){error+=Math.abs(A[i]-B[i]);energy+=Math.max(A[i],B[i]);}return energy<1e-8?1:Math.max(0,1-error/energy);}
 const aa=blur(a.map(v=>v*v),2.5),bb=blur(b.map(v=>v*v),2.5),ab=blur(a.map((v,i)=>v*b[i]),2.5);
 const C1=1e-4,C2=9e-4;let s=0;for(let i=0;i<a.length;i++)if(mask[i]){const va=aa[i]-ma[i]*ma[i],vb=bb[i]-mb[i]*mb[i],cv=ab[i]-ma[i]*mb[i];s+=((2*ma[i]*mb[i]+C1)*(2*cv+C2))/((ma[i]*ma[i]+mb[i]*mb[i]+C1)*(va+vb+C2));}
 return 0.55*Math.max(0,s/uni)+0.45*inter/uni;
}
const getP=(o,path)=>path.split('.').reduce((x,k)=>x?.[k],o);
const setP=(o,path,v)=>{const ks=path.split('.');let x=o;for(const k of ks.slice(0,-1))x=x[k];x[ks[ks.length-1]]=v;};
const paramPaths=plan.params.map(p=>p.paths??[p.path]);
for(const paths of paramPaths)if(!Array.isArray(paths)||!paths.length||paths.some(p=>typeof p!=='string'||!Number.isFinite(getP(spec.scenes[plan.scene],p))))throw new Error('Every fit parameter must reference existing finite numeric values');

const refs=refFrames(plan.times.map(t=>sceneStart+t));
const one={...spec,scenes:[spec.scenes[plan.scene]]};
const {browser,page}=await openAcryllex(one);
async function evaluate(scene){
 await page.evaluate(s=>window.acryllex.load(s),{...one,scenes:[scene]});
 let tot=0;for(let i=0;i<plan.times.length;i++){const fps=plan.referenceFps??60,t=Math.round((sceneStart+plan.times[i])*fps)/fps-sceneStart;const p=await page.evaluate(([t,w,h,mode])=>window.acryllex.probe(t,w,h,mode),[t,DW,DH,plan.channel??'brightness']);tot+=score(refs[i],Float32Array.from(p,v=>v/255));}
 return tot/plan.times.length;
}
try{
 const scene=structuredClone(spec.scenes[plan.scene]);
 let best=await evaluate(scene);console.log(`start ${best.toFixed(4)}`);
 const steps=plan.params.map(p=>p.step);
 for(let round=0;round<(plan.rounds??4);round++){
  let improved=false;
  for(let k=0;k<plan.params.length;k++){const p=plan.params[k],paths=paramPaths[k];
   for(const dir of [1,-1]){const old=paths.map(path=>getP(scene,path)),cur=old[0];const nv=Math.min(p.max??Infinity,Math.max(p.min??-Infinity,+(cur+dir*steps[k]).toFixed(4)));if(nv===cur)continue;
    paths.forEach(path=>setP(scene,path,nv));const sc=await evaluate(scene);
    if(sc>best+1e-4){best=sc;improved=true;console.log(`  ${paths.join(',')}=${nv} -> ${best.toFixed(4)}`);break;}paths.forEach((path,i)=>setP(scene,path,old[i]));}
  }
  if(!improved)for(let k=0;k<steps.length;k++)steps[k]/=2;
  console.log(`round ${round+1}: ${best.toFixed(4)}`);
 }
 console.log(JSON.stringify(Object.fromEntries(paramPaths.flat().map(path=>[path,getP(scene,path)]))));
 if(flags.includes('--write')){spec.scenes[plan.scene]=scene;await writeFile(specPath,JSON.stringify(spec,null,1));console.log(`wrote ${specPath}`);}
}finally{await browser.close();}
