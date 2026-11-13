import {Engine,W,H} from './engine.ts';
import {sceneDuration,type AcryllexSpec} from './spec.ts';
import {COND,MONO,ROBOTO_MONO,OSWALD,ROBOTO_CONDENSED} from './text.ts';
import {preloadAssets} from './assets.ts';
// esbuild dataurl loader (typed via vite/client)
import condUrl from './fonts/BarlowCondensed-SemiBold.ttf';
import boldUrl from './fonts/BarlowCondensed-Bold.ttf';
// esbuild dataurl loader (typed via vite/client)
import monoUrl from './fonts/IBMPlexMono-Regular.ttf';
import robotoMonoUrl from './fonts/RobotoMono-Variable.ttf';
import oswaldUrl from './fonts/Oswald-Variable.ttf';
import robotoCondensedUrl from './fonts/RobotoCondensed-Variable.ttf';

let engine:Engine|null=null;
async function fonts(){
 for(const [name,url] of [[COND,condUrl],[MONO,monoUrl]] as const){const f=new FontFace(name,`url(${url})`,{weight:name===COND?'600':'400'});await f.load();document.fonts.add(f);}
 const bold=new FontFace(COND,`url(${boldUrl})`,{weight:'700'});await bold.load();document.fonts.add(bold);
 const robotoMono=new FontFace(ROBOTO_MONO,`url(${robotoMonoUrl})`,{weight:'100 700'});await robotoMono.load();document.fonts.add(robotoMono);
 const oswald=new FontFace(OSWALD,`url(${oswaldUrl})`,{weight:'200 700'});await oswald.load();document.fonts.add(oswald);
 const robotoCondensed=new FontFace(ROBOTO_CONDENSED,`url(${robotoCondensedUrl})`,{weight:'100 900'});await robotoCondensed.load();document.fonts.add(robotoCondensed);
}
const ready=fonts();

declare global {interface Window {acryllex:{load(spec:AcryllexSpec,assets?:Record<string,string>):Promise<{duration:number;scenes:number[]}>;frame(t:number,type?:string,quality?:number):string;probe(t:number,w:number,h:number,mode?:'brightness'|'neutral'|'ink'):number[];shot(t:number,scale?:number):string;duration():number}}}

window.acryllex={
 async load(spec,assets){await ready;await preloadAssets(assets??{});engine?.dispose();engine=new Engine(spec);return {duration:engine.total,scenes:spec.scenes.map(sceneDuration)};},
 frame(t,type='image/jpeg',quality=0.97){const c=engine!.frame(t);return c.toDataURL(type,quality).split(',')[1]!;},
 shot(t,scale=1){const c=engine!.frame(t);if(scale===1)return c.toDataURL('image/png').split(',')[1]!;const s=document.createElement('canvas');s.width=Math.round(W*scale);s.height=Math.round(H*scale);s.getContext('2d')!.drawImage(c,0,0,s.width,s.height);return s.toDataURL('image/png').split(',')[1]!;},
 duration(){return engine?.total??0;},
 /** Downsampled brightness (max channel 0..255) of frame t, w x h, for matching against a reference. */
 probe(t,w,h,mode='brightness'){const c=engine!.frame(t,{captions:false});const s=document.createElement('canvas');s.width=w;s.height=h;const x=s.getContext('2d',{willReadFrequently:true})!;x.imageSmoothingQuality='high';x.drawImage(c,0,0,w,h);const d=x.getImageData(0,0,w,h).data;const out=new Array(w*h);for(let i=0;i<w*h;i++){const hi=Math.max(d[i*4]!,d[i*4+1]!,d[i*4+2]!),lo=Math.min(d[i*4]!,d[i*4+1]!,d[i*4+2]!);out[i]=(mode==='neutral'&&(hi-lo>hi*.08||hi<20))||(mode==='ink'&&(hi-lo<hi*.2||hi<20))?0:hi;}return out;},
};
