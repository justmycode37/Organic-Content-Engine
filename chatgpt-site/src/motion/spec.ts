import { z } from 'zod';
import { ACCENTS, ICONS, MODELS, MUSIC_MOODS, SCENE_TYPES, TRANSITIONS, type ReelSpec } from './core.ts';

const icon = z.enum(ICONS);
const short = (max: number) => z.string().min(1).max(max);
const base = {
  duration: z.number().min(0.8).max(8), transition: z.enum(TRANSITIONS).optional(), transitionAt:z.tuple([z.number().min(0).max(1080),z.number().min(0).max(1920)]).optional(), transitionDir:z.enum(['left','right','up','down']).optional(), transitionSound:z.enum(['swish','rise','tick','pop','glitch','shimmer','none']).optional(),
  hits: z.array(z.number().min(0).max(8)).max(6).optional(), caption: z.union([short(90), z.array(short(90)).max(6)]).optional(), say: short(220).optional(),
};
const sceneSchemas = {
 hedgy:z.object({type:z.literal('hedgy'),...base,beat:z.enum(['risk','drop','hedge','offset','cost','lesson']),headline:short(28),label:short(24).optional(),secondary:short(24).optional(),mascot:z.boolean().optional(),action:z.enum(['buy','crash','contract','expiry','payout','net','upside','premium','story']).optional(),story:z.enum(['phone','worry','put','cushion','gain','backup']).optional(),sync:z.array(z.object({word:short(30),kind:short(30)}).strict()).max(8).optional(),events:z.array(z.object({at:z.number().min(0),kind:short(30)}).strict()).max(8).optional()}).strict(),
 shot:z.object({type:z.literal('shot'),...base,shot:short(40),params:z.record(z.string(),z.unknown()).optional(),mascot:z.boolean().optional(),sync:z.array(z.object({word:short(30),kind:short(30)}).strict()).max(12).optional(),events:z.array(z.object({at:z.number().min(0),kind:short(30)}).strict()).max(12).optional()}).strict(),
 title: z.object({ type:z.literal('title'),...base,text:short(90),kicker:short(60).optional(),sub:short(90).optional(),icon:icon.optional() }).strict(),
 code: z.object({ type:z.literal('code'),...base,code:z.string().max(1200).refine(s=>s.split('\n').length<=14,'at most 14 lines'),filename:short(80).optional(),typing:z.boolean().optional(),highlight:z.array(z.number().int().min(1).max(14)).max(14).optional(),note:short(90).optional() }).strict(),
 diff: z.object({ type:z.literal('diff'),...base,filename:short(80).optional(),removed:z.array(short(120)).max(14),added:z.array(short(120)).max(14),context:z.array(short(120)).max(14).optional() }).strict(),
 terminal:z.object({type:z.literal('terminal'),...base,title:short(60).optional(),lines:z.array(z.object({cmd:short(120).optional(),out:short(120).optional(),status:z.enum(['ok','fail','info']).optional()}).strict()).min(1).max(6)}).strict(),
 flow:z.object({type:z.literal('flow'),...base,nodes:z.array(z.object({label:short(60),icon:icon.optional(),accent:z.boolean().optional(),note:short(60).optional()}).strict()).min(2).max(5),direction:z.enum(['down','right']).optional(),packet:short(30).optional(),loop:z.boolean().optional()}).strict(),
 stat:z.object({type:z.literal('stat'),...base,value:z.number(),label:short(60),from:z.number().optional(),prefix:short(8).optional(),suffix:short(12).optional(),decimals:z.number().int().min(0).max(4).optional(),versus:z.object({value:z.number(),label:short(60)}).strict().optional()}).strict(),
 bars:z.object({type:z.literal('bars'),...base,title:short(60).optional(),unit:short(12).optional(),items:z.array(z.object({label:short(60),value:z.number(),accent:z.boolean().optional()}).strict()).min(2).max(6)}).strict(),
 compare:z.object({type:z.literal('compare'),...base,left:z.object({label:short(60),points:z.array(short(60)).max(5)}).strict(),right:z.object({label:short(60),points:z.array(short(60)).max(5)}).strict(),winner:z.enum(['left','right']).optional(),title:short(60).optional()}).strict(),
 list:z.object({type:z.literal('list'),...base,title:short(60).optional(),items:z.array(short(60)).min(1).max(5),style:z.enum(['check','cross','number','arrow']).optional()}).strict(),
 tokens:z.object({type:z.literal('tokens'),...base,text:short(180),predict:z.array(z.object({token:short(24),p:z.number().min(0).max(1)}).strict()).max(4).optional(),title:short(60).optional()}).strict(),
 chat:z.object({type:z.literal('chat'),...base,messages:z.array(z.object({role:z.enum(['user','ai']),text:short(180)}).strict()).min(1).max(6),model:short(40).optional()}).strict(),
 layers:z.object({type:z.literal('layers'),...base,title:short(60).optional(),layers:z.array(z.object({label:short(60),note:short(60).optional(),accent:z.boolean().optional()}).strict()).min(2).max(6)}).strict(),
 grid:z.object({type:z.literal('grid'),...base,title:short(60).optional(),rows:z.number().int().min(2).max(16),cols:z.number().int().min(2).max(16),pattern:z.enum(['scan','attention','noise','fill']).optional(),highlight:z.array(z.tuple([z.number().int().min(0),z.number().int().min(0)])).max(32).optional(),rowLabels:z.array(short(24)).max(16).optional(),colLabels:z.array(short(24)).max(16).optional()}).strict(),
 kinetic:z.object({type:z.literal('kinetic'),...base,words:z.array(short(24)).min(1).max(8)}).strict(),
 changelog:z.object({type:z.literal('changelog'),...base,version:short(24),product:short(40).optional(),items:z.array(z.object({tag:z.enum(['NEW','FIX','CHG','DEL']),text:short(60),accent:z.boolean().optional()}).strict()).min(1).max(6)}).strict(),
 object:z.object({type:z.literal('object'),...base,model:z.enum([...MODELS,...ICONS]),label:short(40).optional(),note:short(90).optional(),callouts:z.array(short(24)).max(3).optional()}).strict(),
 outro:z.object({type:z.literal('outro'),...base,cta:short(90),handle:short(40).optional(),sub:short(90).optional()}).strict(),
};
const sceneSchema=z.discriminatedUnion('type',SCENE_TYPES.map(t=>sceneSchemas[t]) as [typeof sceneSchemas[keyof typeof sceneSchemas], ...typeof sceneSchemas[keyof typeof sceneSchemas][]]);
export const reelSpecSchema=z.object({version:z.literal(1),title:short(90).optional(),mode:z.enum(['dark','light']).optional(),accent:z.enum(Object.keys(ACCENTS) as [keyof typeof ACCENTS,...(keyof typeof ACCENTS)[]]).optional(),series:short(60).optional(),music:z.enum(MUSIC_MOODS).optional(),scenes:z.array(sceneSchema).min(1).max(40),captions:z.array(z.object({text:short(90),start:z.number().min(0),end:z.number().positive(),words:z.array(z.object({start:z.number(),end:z.number()}).strict()).max(40).optional()}).strict()).max(100).optional()}).strict().superRefine((spec,ctx)=>{
 if(spec.series?.startsWith('HEDGY')){
 if(spec.accent!=='mono')ctx.addIssue({code:'custom',message:'Hedgy requires monochrome palette'});
 for(const scene of spec.scenes){
 if(scene.type!=='hedgy'&&scene.type!=='shot')ctx.addIssue({code:'custom',message:'Hedgy requires sparse semantic scenes'});
 const copy=JSON.stringify(scene);
 if(/meet hedgy|not (?:financial|investment) advice|education(?:al)? only|follow for/i.test(copy))ctx.addIssue({code:'custom',message:'Hedgy disallows greetings, disclaimers and generic end cards'});
 }
 if(spec.scenes.filter(s=>s.type==='hedgy'&&s.mascot).length>2)ctx.addIssue({code:'custom',message:'Hedgy mascot may appear in at most two scenes'});
 }
 let total=0; spec.scenes.forEach((s,i)=>{total+=s.duration;(s.hits??[]).forEach((h,j)=>{if(h>s.duration)ctx.addIssue({code:'custom',path:['scenes',i,'hits',j],message:'hit must be within scene duration'});});});
 if(total<5||total>90)ctx.addIssue({code:'custom',path:['scenes'],message:'total duration must be 5 to 90 seconds'});
});
type Inferred=z.infer<typeof reelSpecSchema>; type Assert<T extends true>=T; type _ToSpec=Assert<Inferred extends ReelSpec?true:false>; type _FromSpec=Assert<ReelSpec extends Inferred?true:false>;
export function parseReelSpec(input:unknown):{ok:true;spec:ReelSpec}|{ok:false;errors:string[]}{const r=reelSpecSchema.safeParse(input);if(r.success)return{ok:true,spec:r.data};return{ok:false,errors:r.error.issues.map(i=>`${i.path.map((k,n)=>typeof k==='number'?`[${String(k)}]`:`${n?'.':''}${String(k)}`).join('')}: ${i.message}`)}}

// Each rule is kept as a named entry so agent feedback stays easy to scan.
const lintRules = [
 ['error','weak hook',(s:ReelSpec)=>s.scenes[0]?.type==='title'||s.scenes[0]?.type==='kinetic'?[]:[{message:'first scene should be title or kinetic'}]],
 ['error','caption pace',(s:ReelSpec)=>s.scenes.flatMap((x,i)=>{const lines=Array.isArray(x.caption)?x.caption:x.caption?[x.caption]:[];return lines.flatMap(line=>{const words=line.trim().split(/\s+/).filter(Boolean).length;return words>12||words&&x.duration/lines.length/words<.18?[{scene:i,message:'caption exceeds 12 words per line or has under 0.18 s per word'}]:[]})})],
 ['error','accent discipline',(s:ReelSpec)=>s.scenes.flatMap((x,i)=>[...(x.type==='title'?[x.text]:[]),...(Array.isArray(x.caption)?x.caption:x.caption?[x.caption]:[])].flatMap(line=>{const spans=line.match(/\*[^*]+\*/g)?.length??0;const words=(line.match(/\*([^*]+)\*/g)??[]).flatMap(a=>a.slice(1,-1).split(/\s+/)).length;return spans>1||x.type!=='title'&&words>3?[{scene:i,message:'use at most one accented span per line and 3 accent words per caption'}]:[]}))],
 ['error','captions present',(s:ReelSpec)=>s.scenes.some(x=>x.caption)||s.captions?.length?[]:[{message:'add captions for sound-off viewers'}]],
 ['error','outro ending',(s:ReelSpec)=>s.scenes.at(-1)?.type==='outro'?[]:[{message:'last scene should be outro'}]],
 ['warn','long scene',(s:ReelSpec)=>s.scenes.flatMap((x,i)=>x.duration>4.5?[{scene:i,message:'scene longer than 4.5 seconds'}]:[])],
 ['warn','slow average',(s:ReelSpec)=>s.scenes.reduce((a,x)=>a+x.duration,0)/s.scenes.length>3.2?[{message:'average scene length above 3.2 seconds'}]:[]],
 ['warn','repeated type',(s:ReelSpec)=>s.scenes.some((x,i,a)=>i>1&&x.type===a[i-1].type&&x.type===a[i-2].type)?[{message:'same scene type three times in a row'}]:[]],
 ['warn','transition repetition',(s:ReelSpec)=>{const ts=s.scenes.map(x=>x.transition).filter(Boolean);return ts.length===0||ts.some((x,i)=>i>=4&&ts.slice(i-4,i+1).every(y=>y===x))?[{message:'no transitions or same transition for more than 4 consecutive scenes'}]:[]}],
 ['warn','impact hits',(s:ReelSpec)=>s.scenes.some(x=>x.hits?.length)?[]:[{message:'add at least one hit'}]],
 ['warn','dense code',(s:ReelSpec)=>s.scenes.flatMap((x,i)=>x.type==='code'&&x.code.split('\n').length>9&&x.duration<3?[{scene:i,message:'code over 9 lines needs at least 3 seconds'}]:[])],
 ['warn','short kinetic beat',(s:ReelSpec)=>s.scenes.flatMap((x,i)=>x.type==='kinetic'&&x.duration/x.words.length<.25?[{scene:i,message:'kinetic beat shorter than 0.25 seconds'}]:[])],
 ['warn','reel length',(s:ReelSpec)=>{const d=s.scenes.reduce((a,x)=>a+x.duration,0);return d<12||d>60?[{message:'total duration under 12 or over 60 seconds'}]:[]}],
 ['warn','title length',(s:ReelSpec)=>s.scenes.flatMap((x,i)=>x.type==='title'&&x.text.split(/\s+/).length>9?[{scene:i,message:'title text longer than 9 words'}]:[])],
] as const;
export function lintReel(spec:ReelSpec){return lintRules.flatMap(([level,_name,run])=>run(spec).map((item:{scene?:number;message:string})=>({level,scene:item.scene,message:item.message})));}
const purposes:Record<string,string>={shot:'Choreographed 3D pixel-art shot from the shot library.',hedgy:'Sparse monochrome finance mechanism; optional mascot as actor.',title:'Hook the viewer with a pixel title.',code:'Show code typing and highlight a change.',diff:'Reveal a before and after code change.',terminal:'Show a command and its output.',flow:'Explain a pipeline or process.',stat:'Land one important number.',bars:'Compare values in a bar race.',compare:'Contrast two options.',list:'Present a rapid stack of points.',tokens:'Explain tokenization and prediction.',chat:'Show a user prompt and AI reply.',layers:'Reveal a system through its layers.',grid:'Visualize a matrix or attention map.',kinetic:'Hit one short phrase per beat.',changelog:'Show tagged release changes.',object:'Show one 3D pixel object as the hero of the beat.',outro:'Close with a call to action.'};
export function reelJsonSchema(){return z.toJSONSchema(reelSpecSchema);}
export function describeScenes(){return SCENE_TYPES.map(type=>`${type}: ${Object.keys((sceneSchemas[type] as any).shape).filter(k=>k!=='type').join(', ')} — ${purposes[type]}`).join('\n');}
