import {resolveAt,sceneDuration,type AcryllexSpec} from './spec.ts';

export interface AutoCue {at:number;kind?:string;prompt?:string;gain?:number;length?:number;why?:string}

const FX_LEN:Record<string,number>={materialize:0.75,assemble:1.15,pop:0.45,grow:0.8,drop:0.7,'slide-left':0.6,'slide-right':0.6,rise:0.8,dissolve:0.6,shatter:1.1,shrink:0.45,fall:0.8};
const ENTER_SFX:Record<string,[string,number]>={materialize:['materialize',0.55],assemble:['assemble',0.8],pop:['pop',0.7],grow:['riser',0.5],drop:['drop',0.9],'slide-left':['whoosh',0.6],'slide-right':['whoosh',0.6],rise:['riser',0.5]};
const EXIT_SFX:Record<string,[string,number]>={dissolve:['dissolve',0.5],shatter:['shatter',0.95],shrink:['swish',0.5],fall:['drop',0.8],'slide-left':['whoosh',0.5],'slide-right':['whoosh',0.5]};

/** Sounds implied by what the picture does. Times are global seconds. */
export function autoCues(spec:AcryllexSpec):AutoCue[]{
 const out:AutoCue[]=[];let start=0;
 spec.scenes.forEach((s,i)=>{
  const dur=sceneDuration(s);const at=(a:unknown,f:number)=>start+resolveAt(s,a as string|number|undefined,dur,f);
  if(i>0)out.push(s.transition&&s.transition!=='cut'?{at:start-0.12,kind:'whoosh',gain:0.45,why:'transition'}:{at:start,kind:'cut',gain:0.4,why:'cut'});
  s.objects.forEach((o,k)=>{
   const enter=o.enter??'materialize';
   if(enter.startsWith('walk-in')){const t=at(o.enterAt,0.08+k*0.12);out.push({at:t,kind:'footsteps',gain:0.5,length:1.6,why:`${o.id} walks in`});}
   else if(ENTER_SFX[enter]){const [kind,gain]=ENTER_SFX[enter]!;const t=at(o.enterAt,Math.min(0.08+k*0.12,dur*0.4));out.push({at:enter==='drop'?t+FX_LEN.drop!*0.55:t,kind,gain,why:`${o.id} ${enter}`});}
   if(o.exit&&EXIT_SFX[o.exit]){const [kind,gain]=EXIT_SFX[o.exit]!;out.push({at:at(o.exitAt,Math.max(0,dur-0.75)),kind,gain,why:`${o.id} ${o.exit}`});}
  });
  for(const e of s.events??[]){
   const t=at(e.at,dur*0.5);const target=s.objects.find(o=>o.id===e.target);
   if(e.sfx){out.push({at:t,prompt:e.sfx,gain:0.8,why:'requested'});continue;}
   if(e.set){for(const [k,v] of Object.entries(e.set)){
    if(/glow|screen|lights|active|on/.test(k)&&Number(v)>0.3)out.push({at:t,kind:'power-on',gain:0.75,why:`${e.target} ${k} on`});
    else if(/crack|break/.test(k))out.push({at:t,kind:'crack',gain:0.85,why:`${e.target} cracks`});
    else if(/open/.test(k))out.push({at:t,kind:'swish',gain:0.4,why:`${e.target} opens`});
    else out.push({at:t,kind:'shimmer',gain:0.35,why:`${e.target} ${k}`});}}
   if(e.pose){if(/sit|type/.test(e.pose))out.push({at:t,kind:'chair',gain:0.45,why:'sits'});else if(/cheer/.test(e.pose))out.push({at:t,kind:'hit',gain:0.6,why:'cheer'});else out.push({at:t,kind:'swish',gain:0.25,why:`pose ${e.pose}`});}
   if(e.move)out.push(target?.model==='human'||target?.pose?{at:t,kind:'footsteps',gain:0.45,length:Math.min(3,Number(e.dur)||1.6),why:`${e.target} walks`}:{at:t,kind:'whoosh',gain:0.4,why:`${e.target} moves`});
   if(e.turn)out.push({at:t,kind:'swish',gain:0.35,why:'turn'});
   if(e.scaleTo!==undefined)out.push({at:t,kind:'riser',gain:0.45,length:0.8,why:'scale'});
   if(e.hue)out.push({at:t,kind:'shimmer',gain:0.45,why:'colour change'});
   if(e.show&&ENTER_SFX[e.show]){const [kind,gain]=ENTER_SFX[e.show]!;out.push({at:t,kind,gain,why:`show ${e.target}`});}
   if(e.hide&&EXIT_SFX[e.hide]){const [kind,gain]=EXIT_SFX[e.hide]!;out.push({at:t,kind,gain,why:`hide ${e.target}`});}
   if(e.camera)out.push({at:t,kind:'whoosh',gain:0.3,why:'camera move'});
  }
  for(const tx of s.text??[]){
   const t=at(tx.at,0.1);const chars=tx.text.length;
   if(tx.style==='number')out.push({at:t,kind:'box',gain:0.75,why:`number ${tx.text}`});
   else out.push({at:t,kind:'type',gain:0.35,length:Math.min(1.6,chars/34+0.1),why:`types ${tx.text}`});
   if(tx.highlight||tx.style==='tag'||tx.style==='prefix'||tx.style==='highlight')out.push({at:t+chars/34,kind:'box',gain:0.55,why:'highlight box'});
  }
  start+=dur;
 });
 return out.sort((a,b)=>a.at-b.at).map(c=>({...c,at:Math.max(0,Math.round(c.at*1000)/1000)}));
}
