import {clamp,lerp,ease} from './kit.ts';
import type {ObjectKeyframe,LightKeyframe,Vec3} from './spec.ts';

export function interpolate(k:number,kind:'linear'|'smooth'|'hold'='smooth'){
 return kind==='hold'?(k>=1?1:0):kind==='linear'?clamp(k):ease.inOut(k);
}

/** Explicit count steps let a boxed prefix arrive together before an irregularly typed suffix. */
export function sampleTextReveal(keys:[number,number][],t:number,total:number){
 const sorted=[...keys].sort((a,b)=>a[0]-b[0]);
 let shown=0,previous=0,typingDone=Infinity,deleteStart=Infinity;
 for(const [at,value] of sorted){
  const count=Math.floor(clamp(value,0,total));
  if(typingDone===Infinity&&count===total)typingDone=at;
  if(at>typingDone&&count<previous&&deleteStart===Infinity)deleteStart=at;
  if(t>=at)shown=count;
  previous=count;
 }
 return {shown,typingDone,deleteStart,deleting:t>=deleteStart};
}

export function sampleTextLayout(keys:{at:number;pos?:[number,number];zoom?:number;easing?:'linear'|'smooth'|'hold'}[],t:number,initial:{pos:[number,number];zoom:number}){
 const sorted=[...keys].sort((a,b)=>a.at-b.at);
 let pos:[number,number]=[...initial.pos],posAt=0,zoom=initial.zoom,zoomAt=0;
 for(const key of sorted){if(!key.pos)continue;
  if(t>=key.at){pos=[...key.pos];posAt=key.at;continue;}
  const k=interpolate((t-posAt)/Math.max(1e-8,key.at-posAt),key.easing);pos=[lerp(pos[0],key.pos[0],k),lerp(pos[1],key.pos[1],k)];break;
 }
 for(const key of sorted){if(key.zoom===undefined)continue;
  if(t>=key.at){zoom=key.zoom;zoomAt=key.at;continue;}
  zoom=lerp(zoom,key.zoom,interpolate((t-zoomAt)/Math.max(1e-8,key.at-zoomAt),key.easing));break;
 }
 return {pos,zoom};
}

/** Absolute tracks, sampled from time alone: seeking backwards gives the same pose. */
export function sampleObjectTrack(keys:ObjectKeyframe[],t:number,initial:{pos:Vec3;rot:Vec3;scale:number}){
 const sorted=[...keys].sort((a,b)=>a.at-b.at);
 function channel<T>(initial:T,value:(key:ObjectKeyframe)=>T|undefined,blend:(a:T,b:T,k:number)=>T):T{
  let from=initial,at=0;
  for(const key of sorted){
   const to=value(key);if(to===undefined)continue;
   if(t>=key.at){from=to;at=key.at;continue;}
   return blend(from,to,interpolate((t-at)/Math.max(1e-8,key.at-at),key.easing));
  }
  return from;
 }
 const vector=(a:Vec3,b:Vec3,k:number)=>a.map((v,i)=>lerp(v,b[i]!,k)) as Vec3;
 return {pos:[...channel(initial.pos,k=>k.pos,vector)] as Vec3,
  rot:[...channel(initial.rot,k=>k.rot,vector)] as Vec3,scale:channel(initial.scale,k=>k.scale,lerp)};
}

/** Independent tone channels keep density changes separate from ink brightness. */
export function sampleLightTrack(keys:LightKeyframe[],t:number,initial:Required<Omit<LightKeyframe,'at'|'easing'>>){
 const sorted=[...keys].sort((a,b)=>a.at-b.at),out={...initial};
 for(const channel of Object.keys(initial) as (keyof typeof initial)[]){
  let from=initial[channel],at=0;
  for(const key of sorted){const to=key[channel];if(to===undefined)continue;
   if(t>=key.at){from=to;at=key.at;continue;}
   from=lerp(from,to,interpolate((t-at)/Math.max(1e-8,key.at-at),key.easing));break;
  }
  out[channel]=from;
 }
 return out;
}
