import {Engine,W,H} from './engine.ts';
import {sceneDuration,type AcryllexSpec} from './spec.ts';
import {COND,MONO} from './text.ts';
import {preloadAssets} from './assets.ts';
// esbuild dataurl loader (typed via vite/client)
import condUrl from './fonts/BarlowCondensed-SemiBold.ttf';
// esbuild dataurl loader (typed via vite/client)
import monoUrl from './fonts/IBMPlexMono-Regular.ttf';

let engine:Engine|null=null;
async function fonts(){
 for(const [name,url] of [[COND,condUrl],[MONO,monoUrl]] as const){const f=new FontFace(name,`url(${url})`,{weight:name===COND?'600':'400'});await f.load();document.fonts.add(f);}
}
const ready=fonts();

declare global {interface Window {acryllex:{load(spec:AcryllexSpec,assets?:Record<string,string>):Promise<{duration:number;scenes:number[]}>;frame(t:number,type?:string,quality?:number):string;shot(t:number,scale?:number):string;duration():number}}}

window.acryllex={
 async load(spec,assets){await ready;await preloadAssets(assets??{});engine=new Engine(spec);return {duration:engine.total,scenes:spec.scenes.map(sceneDuration)};},
 frame(t,type='image/jpeg',quality=0.97){const c=engine!.frame(t);return c.toDataURL(type,quality).split(',')[1]!;},
 shot(t,scale=1){const c=engine!.frame(t);if(scale===1)return c.toDataURL('image/png').split(',')[1]!;const s=document.createElement('canvas');s.width=Math.round(W*scale);s.height=Math.round(H*scale);s.getContext('2d')!.drawImage(c,0,0,s.width,s.height);return s.toDataURL('image/png').split(',')[1]!;},
 duration(){return engine?.total??0;},
};
