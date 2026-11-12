import {z} from 'zod';
import {HUES,resolveAt,type AcryllexSpec} from './spec.ts';
import {findModel} from './models/index.ts';

const hue=z.enum(Object.keys(HUES) as [string,...string[]]);
const at=z.union([z.string().max(40),z.number()]);
const vec3=z.tuple([z.number(),z.number(),z.number()]);
const side=z.enum(['left','right','on','behind','front','above','below','in']);
const camera=z.object({angle:z.enum(['front','three-quarter','three-quarter-left','side','side-left','top','high','low','back']).optional(),fill:z.number().min(0.2).max(1.2).optional(),focus:z.union([z.string(),z.array(z.string())]).optional(),move:z.enum(['static','push','pull','orbit','orbit-left','drift','rise','fall','crane']).optional(),amount:z.number().min(0).max(3).optional(),screenY:z.number().min(0.25).max(0.75).optional()}).strict();
const object=z.object({id:z.string().min(1).max(24),model:z.string().min(1).max(40),params:z.record(z.string(),z.unknown()).optional(),pos:vec3.optional(),near:z.string().optional(),side:side.optional(),gap:z.number().optional(),rot:vec3.optional(),scale:z.number().positive().max(500).optional(),hue:hue.optional(),
 enter:z.enum(['materialize','assemble','pop','drop','slide-left','slide-right','rise','grow','walk-in-left','walk-in-right','none']).optional(),enterAt:at.optional(),
 exit:z.enum(['dissolve','shatter','shrink','slide-left','slide-right','fall','walk-out-left','walk-out-right','none']).optional(),exitAt:at.optional(),
 idle:z.enum(['none','spin','spin-slow','float','pulse','sway','wobble','orbit']).optional(),controls:z.record(z.string(),z.number()).optional(),pose:z.string().optional(),frame:z.boolean().optional()}).strict();
const event=z.object({at,dur:z.number().min(0.05).max(6).optional(),target:z.string().optional(),set:z.record(z.string(),z.number()).optional(),pose:z.string().optional(),
 move:z.object({to:vec3.optional(),near:z.string().optional(),side:side.optional(),by:vec3.optional(),gap:z.number().optional()}).strict().optional(),
 turn:vec3.optional(),scaleTo:z.number().positive().optional(),hue:hue.optional(),show:object.shape.enter.optional(),hide:object.shape.exit.optional(),camera:camera.optional(),sfx:z.string().max(160).optional()}).strict();
const text=z.object({text:z.string().min(1).max(60),style:z.enum(['headline','highlight','tag','prefix','mono','number','label']).optional(),highlight:z.string().max(40).optional(),at:at.optional(),until:at.optional(),
 pos:z.union([z.enum(['top','upper','center','lower','bottom','left','right','top-left','top-right','bottom-left','bottom-right']),z.tuple([z.number(),z.number()])]).optional(),size:z.number().optional(),hue:hue.optional(),follow:z.string().optional()}).strict();
export const sceneSchema=z.object({say:z.string().min(1).max(260),hue:hue.optional(),duration:z.number().optional(),camera:camera.optional(),objects:z.array(object).min(1).max(6),events:z.array(event).max(12).optional(),text:z.array(text).max(3).optional(),transition:z.enum(['cut','dissolve','wipe','flash']).optional(),ground:z.boolean().optional()}).strict();
export const specSchema=z.object({version:z.literal(1),series:z.literal('ACRYLLEX'),title:z.string().min(1).max(90),musicBrief:z.string().max(500).optional(),captions:z.boolean().optional(),scenes:z.array(sceneSchema).min(6).max(18)}).strict();

/** Content checks beyond the schema: unknown models, dangling targets, sync words missing from the line. */
export function specProblems(spec:AcryllexSpec){
 const out:string[]=[];
 const words=spec.scenes.reduce((n,s)=>n+s.say.split(/\s+/).filter(Boolean).length,0);
 if(words<85||words>170)out.push(`Narration has ${words} words; aim for 100-150.`);
 spec.scenes.forEach((s,i)=>{
  const ids=new Set(s.objects.map(o=>o.id));
  for(const o of s.objects){
   if(!findModel(o.model))out.push(`scene ${i+1}: unknown model "${o.model}" — use a catalogue id or "compose".`);
   if(o.near&&!ids.has(o.near))out.push(`scene ${i+1}: object ${o.id} near unknown id "${o.near}".`);
   if(o.model==='compose'&&!(Array.isArray((o.params as {parts?:unknown})?.parts)))out.push(`scene ${i+1}: compose object ${o.id} needs params.parts.`);
  }
  if(s.objects.length>4)out.push(`scene ${i+1}: ${s.objects.length} objects; max 4 (prefer 1-3).`);
  const n=s.say.split(/\s+/).filter(Boolean).length;if(n>30)out.push(`scene ${i+1}: say has ${n} words; split it (max 30).`);
  const sayNorm=s.say.toLowerCase();
  for(const e of s.events??[]){
   if(e.target&&!ids.has(e.target))out.push(`scene ${i+1}: event targets unknown id "${e.target}".`);
   if(typeof e.at==='string'&&!/^[\d.]+%?s?$/.test(e.at)){const w=e.at.toLowerCase().replace(/[^a-z0-9' ]/g,'').trim();if(w&&!sayNorm.replace(/[^a-z0-9' ]/g,' ').includes(w))out.push(`scene ${i+1}: event word "${e.at}" is not in the say line.`);}
  }
  for(const t of s.text??[])if(typeof t.at==='string'&&!/^[\d.]+%?s?$/.test(t.at)&&!sayNorm.includes(t.at.toLowerCase()))out.push(`scene ${i+1}: text word "${t.at}" is not in the say line.`);
 });
 void resolveAt;
 return out;
}
