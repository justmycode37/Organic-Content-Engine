import { z } from 'zod';
import { ACCENTS, ICONS, SCENE_TYPES, STYLES, TRANSITIONS, stripMarkup, type ReelSpec, type SceneSpec } from './core.ts';
import { STYLE_DEFS, styleOf } from './styles/index.ts';

const icon = z.enum(ICONS);
const short = (max: number) => z.string().min(1).max(max);
const EVENT_KINDS = ['reveal','contact','transform','connect','compare','resolve','highlight'] as const;
const REWARD_KINDS = ['mechanism','comparison','prediction','evidence','consequence','joke'] as const;
const cameraClip = z.union([
  z.literal('safe'),
  z.object({ x: z.number(), y: z.number(), w: z.number().positive(), h: z.number().positive() }).strict(),
]);
const eventSchema = z.object({
 at:z.number().min(0).max(8).optional(), word:short(48).optional(), kind:z.enum(EVENT_KINDS),
 target:short(80).optional(), sfx:z.string().regex(/^[a-z][a-z0-9-]{0,39}$/).optional(),
}).strict().refine(event => (event.at === undefined) !== (event.word === undefined), 'provide exactly one of at or word');
const eventWords = (value: string): string[] => Array.from(stripMarkup(value).toLocaleLowerCase().matchAll(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu), match => match[0]);
const base = {
  duration: z.number().min(0.8).max(8), claims: z.array(z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/)).max(40).optional(), transition: z.enum(TRANSITIONS).optional(),
  camera: z.object({ move: z.enum(['push-in','pull-out','pan-left','pan-right','track','fly']).optional(), target: short(48).optional(), ramp: z.boolean().optional(), clip: cameraClip.nullable().optional() }).strict().optional(),
  hits: z.array(z.number().min(0).max(8)).max(6).optional(), events:z.array(eventSchema).max(16).optional(), reward:z.enum(REWARD_KINDS).optional(), caption: z.union([short(90), z.array(short(90)).max(6)]).optional(), say: short(220).optional(),
};
const sceneSchemas = {
 title: z.object({ type:z.literal('title'),...base,text:short(90),kicker:short(60).optional(),sub:short(90).optional(),icon:icon.optional() }).strict(),
 code: z.object({ type:z.literal('code'),...base,code:z.string().max(1200).refine(s=>s.split('\n').length<=14,'at most 14 lines'),filename:short(80).optional(),typing:z.boolean().optional(),highlight:z.array(z.number().int().min(1).max(14)).max(14).optional(),note:short(90).optional() }).strict(),
 diff: z.object({ type:z.literal('diff'),...base,filename:short(80).optional(),removed:z.array(short(120)).max(14),added:z.array(short(120)).max(14),context:z.array(short(120)).max(14).optional() }).strict(),
 terminal:z.object({type:z.literal('terminal'),...base,title:short(60).optional(),lines:z.array(z.object({cmd:short(120).optional(),out:short(120).optional(),status:z.enum(['ok','fail','info']).optional()}).strict()).min(1).max(6)}).strict(),
 flow:z.object({type:z.literal('flow'),...base,nodes:z.array(z.object({label:short(60),icon:icon.optional(),accent:z.boolean().optional(),note:short(60).optional()}).strict()).min(2).max(5),direction:z.enum(['down','right']).optional(),packet:short(30).optional(),loop:z.boolean().optional()}).strict(),
 stat:z.object({type:z.literal('stat'),...base,value:z.number(),label:short(60),from:z.number().optional(),prefix:short(8).optional(),suffix:short(12).optional(),decimals:z.number().int().min(0).max(4).optional(),versus:z.object({value:z.number(),label:short(60)}).strict().optional(),slam:z.boolean().optional()}).strict(),
 bars:z.object({type:z.literal('bars'),...base,title:short(60).optional(),unit:short(12).optional(),items:z.array(z.object({label:short(60),value:z.number(),accent:z.boolean().optional()}).strict()).min(2).max(6)}).strict(),
 compare:z.object({type:z.literal('compare'),...base,left:z.object({label:short(60),points:z.array(short(60)).max(5)}).strict(),right:z.object({label:short(60),points:z.array(short(60)).max(5)}).strict(),winner:z.enum(['left','right']).optional(),title:short(60).optional()}).strict(),
 list:z.object({type:z.literal('list'),...base,title:short(60).optional(),items:z.array(short(60)).min(1).max(5),style:z.enum(['check','cross','number','arrow']).optional()}).strict(),
 tokens:z.object({type:z.literal('tokens'),...base,text:short(180),predict:z.array(z.object({token:short(24),p:z.number().min(0).max(1)}).strict()).max(4).optional(),title:short(60).optional()}).strict(),
 chat:z.object({type:z.literal('chat'),...base,messages:z.array(z.object({role:z.enum(['user','ai']),text:short(180)}).strict()).min(1).max(6),model:short(40).optional()}).strict(),
 layers:z.object({type:z.literal('layers'),...base,title:short(60).optional(),layers:z.array(z.object({label:short(60),note:short(60).optional(),accent:z.boolean().optional()}).strict()).min(2).max(6),focus:z.number().int().min(0).max(5).optional()}).strict(),
 grid:z.object({type:z.literal('grid'),...base,title:short(60).optional(),rows:z.number().int().min(2).max(16),cols:z.number().int().min(2).max(16),pattern:z.enum(['scan','attention','noise','fill']).optional(),highlight:z.array(z.tuple([z.number().int().min(0),z.number().int().min(0)])).max(32).optional(),rowLabels:z.array(short(24)).max(16).optional(),colLabels:z.array(short(24)).max(16).optional()}).strict(),
 kinetic:z.object({type:z.literal('kinetic'),...base,words:z.array(short(24)).min(1).max(8)}).strict(),
 changelog:z.object({type:z.literal('changelog'),...base,version:short(24),product:short(40).optional(),items:z.array(z.object({tag:z.enum(['NEW','FIX','CHG','DEL']),text:short(60),accent:z.boolean().optional()}).strict()).min(1).max(6)}).strict(),
 outro:z.object({type:z.literal('outro'),...base,cta:short(90),handle:short(40).optional(),sub:short(90).optional()}).strict(),
 special:z.object({type:z.literal('special'),...base,kind:z.string().regex(/^[a-z][a-z0-9-]{0,39}$/),data:z.record(z.string(),z.unknown()).optional()}).strict(),
 demo:z.object({type:z.literal('demo'),...base,actor:short(42),action:short(42),target:short(42),before:short(42),after:short(42),contrast:short(54).optional()}).strict(),
 predict:z.object({type:z.literal('predict'),...base,question:short(72),guesses:z.array(short(36)).min(2).max(4),answer:short(36),comparison:z.object({label:short(32),value:short(36)}).strict(),correction:short(48).optional()}).strict().refine(s=>s.guesses.includes(s.answer),'answer must be one of the locked guesses'),
 quantity:z.object({type:z.literal('quantity'),...base,quantity:z.number().int().nonnegative(),subset:z.number().int().nonnegative(),unit:short(32),scale:z.number().int().positive().optional(),comparator:z.object({label:short(32),value:z.number().int().nonnegative()}).strict()}).strict().refine(s=>s.subset<=s.quantity,'subset cannot exceed quantity'),
 evidence:z.object({type:z.literal('evidence'),...base,asset:z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/).optional(),quote:short(180).optional(),rect:z.object({x:z.number().nonnegative(),y:z.number().nonnegative(),w:z.number().positive(),h:z.number().positive()}).strict().optional(),claim:short(48),source:short(48),date:short(24)}).strict().refine(s=>Boolean(s.asset)!==Boolean(s.quote),'provide exactly one image asset or quoted text card').refine(s=>!s.asset||Boolean(s.rect),'an image asset needs an exact crop rectangle').refine(s=>!s.rect||Boolean(s.asset),'a crop rectangle requires an image asset'),
 scale:z.object({type:z.literal('scale'),...base,reference:short(24),unit:short(24),levels:z.array(z.object({label:short(28),value:z.number().nonnegative()}).strict()).min(2).max(4)}).strict().refine(s=>(s.levels[0]?.value ?? 1)>0,'the first level must be greater than zero'),
 split:z.object({type:z.literal('split'),...base,baseline:short(36),axis:short(32),left:z.object({label:short(28),value:short(32)}).strict(),right:z.object({label:short(28),value:short(32)}).strict(),answer:short(48)}).strict(),
};
const sceneSchema=z.discriminatedUnion('type',SCENE_TYPES.map(t=>sceneSchemas[t]) as [typeof sceneSchemas[keyof typeof sceneSchemas], ...typeof sceneSchemas[keyof typeof sceneSchemas][]]);
export const reelSpecSchema=z.object({version:z.literal(1),title:short(90).optional(),style:z.enum(STYLES).optional(),mode:z.enum(['dark','light']).optional(),accent:z.enum(Object.keys(ACCENTS) as [keyof typeof ACCENTS,...(keyof typeof ACCENTS)[]]).optional(),series:short(60).optional(),assets:z.record(z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/),short(400)).refine(a=>Object.keys(a).length<=40,'at most 40 assets').optional(),scenes:z.array(sceneSchema).min(1).max(40),captions:z.array(z.object({text:short(90),start:z.number().min(0),end:z.number().positive()}).strict()).max(100).optional()}).strict().superRefine((spec,ctx)=>{
 let total=0; spec.scenes.forEach((s,i)=>{
  total+=s.duration;
  (s.hits??[]).forEach((h,j)=>{if(h>s.duration)ctx.addIssue({code:'custom',path:['scenes',i,'hits',j],message:'hit must be within scene duration'});});
  (s.events??[]).forEach((event,j)=>{
   if(event.at!==undefined&&event.at>s.duration)ctx.addIssue({code:'custom',path:['scenes',i,'events',j,'at'],message:'event must be within scene duration'});
   if(event.word!==undefined){
    const anchorWords=eventWords(event.word),spokenWords=eventWords(s.say??'');
    if(anchorWords.length!==1)ctx.addIssue({code:'custom',path:['scenes',i,'events',j,'word'],message:'word anchor must name one word'});
    else if(!s.say||!spokenWords.includes(anchorWords[0]!))ctx.addIssue({code:'custom',path:['scenes',i,'events',j,'word'],message:'word anchor must occur in say'});
   }
  });
 });
 if(total<5||total>90)ctx.addIssue({code:'custom',path:['scenes'],message:'total duration must be 5 to 90 seconds'});
 // Special scenes are validated by the style that provides them.
 const style=styleOf(spec.style);
 spec.scenes.forEach((scene,i)=>{
  if(scene.type!=='special')return;
  const def=style.specials?.[scene.kind];
  if(!def){ctx.addIssue({code:'custom',path:['scenes',i,'kind'],message:`style '${style.name}' has no special scene '${scene.kind}' (available: ${Object.keys(style.specials??{}).join(', ')||'none'})`});return;}
  const result=def.schema.safeParse(scene.data??{});
  if(!result.success)result.error.issues.forEach(issue=>ctx.addIssue({code:'custom',path:['scenes',i,'data',...issue.path.map(k=>typeof k==='symbol'?String(k):k)],message:issue.message}));
 });
});
type Inferred=z.infer<typeof reelSpecSchema>; type Assert<T extends true>=T; type _ToSpec=Assert<Inferred extends ReelSpec?true:false>; type _FromSpec=Assert<ReelSpec extends Inferred?true:false>;
export function parseReelSpec(input:unknown):{ok:true;spec:ReelSpec}|{ok:false;errors:string[]}{const r=reelSpecSchema.safeParse(input);if(r.success)return{ok:true,spec:r.data};return{ok:false,errors:r.error.issues.map(i=>`${i.path.map((k,n)=>typeof k==='number'?`[${String(k)}]`:`${n?'.':''}${String(k)}`).join('')}: ${i.message}`)}}

const wordCount = (value: string) => eventWords(value).length;
const NON_TEXT_FIELDS = new Set(['icon','direction','winner','pattern','highlight','accent','typing','loop','p','status','role','fullBleed','asset','image','photo','cutout']);
function collectWords(value: unknown, key = ''): number {
 if (NON_TEXT_FIELDS.has(key)) return 0;
 if (typeof value === 'string') return wordCount(value);
 if (Array.isArray(value)) return value.reduce((sum, item) => sum + collectWords(item, key), 0);
 if (value && typeof value === 'object') return Object.entries(value).reduce((sum, [childKey, item]) => sum + collectWords(item, childKey), 0);
 return 0;
}
function visibleSceneWords(scene: SceneSpec, caption: string | string[] | undefined = scene.caption): number {
 const invisible = new Set(['type','duration','claims','transition','hits','events','reward','say','caption']);
 const visible = Object.fromEntries(Object.entries(scene).filter(([key]) => !invisible.has(key)));
 const captionChunks = Array.isArray(caption) ? caption : caption ? [caption] : [];
 return collectWords(visible) + Math.max(0, ...captionChunks.map(wordCount));
}
function visibleSceneWordCounts(spec: ReelSpec): number[] {
 let start = 0;
 return spec.scenes.map(scene => {
  const end = start + scene.duration;
  const captions = spec.captions?.length
   ? spec.captions.filter(caption => caption.start < end && caption.end > start).map(caption => caption.text)
   : scene.caption;
  const words = visibleSceneWords(scene, captions);
  start = end;
  return words;
 });
}
function eventTime(scene: SceneSpec, event: NonNullable<SceneSpec['events']>[number]): number {
 if (event.at !== undefined) return event.at;
 const words = eventWords(scene.say ?? ''), anchor = eventWords(event.word ?? '')[0];
 const index = words.findIndex(word => word === anchor);
 return words.length ? scene.duration * Math.max(0, index) / words.length : 0;
}
function semanticEventPoints(spec: ReelSpec): number[] {
 const points: number[] = [];
 let cursor = 0;
 for (const scene of spec.scenes) {
  points.push(cursor); // One implicit entrance event per scene.
  for (const event of scene.events ?? []) points.push(cursor + eventTime(scene, event));
  cursor += scene.duration;
 }
 return points.sort((a, b) => a - b);
}
function eventRateRange(spec: ReelSpec): { min: number; max: number } {
 const duration = spec.scenes.reduce((sum, scene) => sum + scene.duration, 0);
 if (!duration) return { min: 0, max: 0 };
 const span = Math.min(10, duration), points = semanticEventPoints(spec);
 const starts = duration <= 10 ? [0] : Array.from({ length: Math.ceil((duration - 10) * 4) + 1 }, (_, index) => Math.min(duration - 10, index * 0.25));
 const rates = starts.map(start => points.filter(point => point >= start && point < start + span).length * 10 / span);
 return { min: Math.min(...rates), max: Math.max(...rates) };
}
function maximumEventGap(spec: ReelSpec): number {
 const duration = spec.scenes.reduce((sum, scene) => sum + scene.duration, 0), points = semanticEventPoints(spec);
 return Math.max(0, ...points.slice(1).map((point, index) => point - points[index]!), duration - (points.at(-1) ?? 0));
}
function activeCaptionLines(spec: ReelSpec, scene: SceneSpec): string[] {
 return Array.isArray(scene.caption) ? scene.caption : scene.caption ? [scene.caption] : [];
}

// Each rule is kept as a named entry so agent feedback stays easy to scan.
const lintRules = [
 ['error','weak hook',(s:ReelSpec)=>{const first=s.scenes[0];return first?.type==='title'||first?.type==='kinetic'||first?.type==='special'&&styleOf(s.style).specials?.[first.kind]?.hook?[]:[{message:'first scene should be title, kinetic or a hook special scene'}];}],
 ['error','caption pace',(s:ReelSpec)=>s.scenes.flatMap((x,i)=>{const lines=activeCaptionLines(s,x);return lines.flatMap(line=>{const words=wordCount(line);return words>12||words&&x.duration/lines.length/words<.18?[{scene:i,message:'caption exceeds 12 words per line or has under 0.18 s per word'}]:[]})})],
 ['error','accent discipline',(s:ReelSpec)=>s.scenes.flatMap((x,i)=>[...(x.type==='title'?[x.text]:[]),...(Array.isArray(x.caption)?x.caption:x.caption?[x.caption]:[])].flatMap(line=>{const spans=line.match(/\*[^*]+\*/g)?.length??0;const words=(line.match(/\*([^*]+)\*/g)??[]).flatMap(a=>a.slice(1,-1).split(/\s+/)).length;return spans>1||x.type!=='title'&&words>3?[{scene:i,message:'use at most one accented span per line and 3 accent words per caption'}]:[]}))],
 ['error','captions present',(s:ReelSpec)=>s.scenes.some(x=>x.caption)||s.captions?.length?[]:[{message:'add captions for sound-off viewers'}]],
 ['error','outro ending',(s:ReelSpec)=>s.scenes.at(-1)?.type==='outro'?[]:[{message:'last scene should be outro'}]],
 ['error','visible word hard cap',(s:ReelSpec)=>visibleSceneWordCounts(s).flatMap((words,index)=>words>18?[{scene:index,message:`estimated ${words} visible words exceeds the hard 18-word cap`}]:[])],
 ['warn','missing asset',(s:ReelSpec)=>{const ids=new Set(Object.keys(s.assets??{}));return s.scenes.flatMap((x,i)=>x.type==='special'?JSON.stringify(x.data??{}).match(/"(?:asset|image|photo|cutout)":"([^"]+)"/g)?.map(m=>m.split(':')[1]!.slice(1,-1)).filter(id=>!ids.has(id)).map(id=>({scene:i,message:`asset '${id}' is not declared in spec.assets`}))??[]:[]);}],
 ['warn','scene duration band',(s:ReelSpec)=>s.scenes.flatMap((scene,index)=>scene.duration<1.5||scene.duration>3&&(scene.duration>6||(scene.events?.length??0)<3)?[{scene:index,message:`scene duration ${scene.duration.toFixed(2)}s is outside 1.5–3.0s; 3–6s is allowed with at least 3 events`}]:[])],
 ['warn','mean scene duration',(s:ReelSpec)=>{const mean=s.scenes.reduce((sum,scene)=>sum+scene.duration,0)/s.scenes.length;return mean<2||mean>2.5?[{message:`mean scene duration ${mean.toFixed(2)}s is outside 2.0–2.5s`}]:[]}],
 ['warn','visible word budget',(s:ReelSpec)=>visibleSceneWordCounts(s).flatMap((words,index)=>words>14?[{scene:index,message:`estimated ${words} visible words exceeds the 14-word target`}]:[])],
 ['warn','caption chunk size',(s:ReelSpec)=>{const entries=s.captions?.length?s.captions.map((caption,index)=>({scene:undefined as number|undefined,label:`captions[${index}]`,text:caption.text})):s.scenes.flatMap((scene,index)=>activeCaptionLines(s,scene).map((text,chunk)=>({scene:index,label:`caption ${chunk+1}`,text})));return entries.flatMap(entry=>{const words=wordCount(entry.text);return words<3||words>7?[{scene:entry.scene,message:`${entry.label} has ${words} words; target chunks are 3–7 words`}]:[]})}],
 ['warn','event rate',(s:ReelSpec)=>{const rate=eventRateRange(s);return rate.min<8||rate.max>14?[{message:`rolling semantic event rate is ${rate.min.toFixed(1)}–${rate.max.toFixed(1)} per 10s; target is 8–14 including scene entrances`}]:[]}],
 ['warn','event gap',(s:ReelSpec)=>{const gap=maximumEventGap(s);return gap>1.2+1e-6?[{message:`maximum gap without a declared or implicit event is ${gap.toFixed(2)}s; target is 1.2s`}]:[]}],
 ['warn','opening state',(s:ReelSpec)=>{const first=s.scenes[0],openingCaption=s.captions?.length?s.captions.filter(caption=>caption.start<=0&&caption.end>0).map(caption=>caption.text):Array.isArray(first?.caption)?first.caption.slice(0,1):first?.caption;return first&&visibleSceneWords(first,openingCaption)===0?[{scene:0,message:'first scene has no readable text in its opening state'}]:[]}],
 ['warn','missing reward',(s:ReelSpec)=>s.scenes.flatMap((scene,index)=>scene.reward?[]:[{scene:index,message:'declare the scene reward: mechanism, comparison, prediction, evidence, consequence or joke'}])],
 ['warn','long scene',(s:ReelSpec)=>s.scenes.flatMap((x,i)=>x.duration>6||x.duration>4.5&&(x.events?.length??0)<3?[{scene:i,message:'scene longer than 4.5 seconds without 3 declared events, or longer than the 6-second maximum'}]:[])],
 ['warn','repeated type',(s:ReelSpec)=>s.scenes.some((x,i,a)=>i>1&&x.type===a[i-1].type&&x.type===a[i-2].type)?[{message:'same scene type three times in a row'}]:[]],
 ['warn','transition repetition',(s:ReelSpec)=>{const ts=s.scenes.map(x=>x.transition).filter(Boolean);return ts.length===0||ts.some((x,i)=>i>=4&&ts.slice(i-4,i+1).every(y=>y===x))?[{message:'no transitions or same transition for more than 4 consecutive scenes'}]:[]}],
 ['warn','impact hits',(s:ReelSpec)=>s.scenes.some(x=>x.hits?.length)?[]:[{message:'add at least one hit'}]],
 ['warn','dense code',(s:ReelSpec)=>s.scenes.flatMap((x,i)=>x.type==='code'&&x.code.split('\n').length>9&&x.duration<3?[{scene:i,message:'code over 9 lines needs at least 3 seconds'}]:[])],
 ['warn','short kinetic beat',(s:ReelSpec)=>s.scenes.flatMap((x,i)=>x.type==='kinetic'&&x.duration/x.words.length<.25?[{scene:i,message:'kinetic beat shorter than 0.25 seconds'}]:[])],
 ['warn','reel length',(s:ReelSpec)=>{const d=s.scenes.reduce((a,x)=>a+x.duration,0);return d<12||d>60?[{message:'total duration under 12 or over 60 seconds'}]:[]}],
 ['warn','title length',(s:ReelSpec)=>s.scenes.flatMap((x,i)=>x.type==='title'&&x.text.split(/\s+/).length>9?[{scene:i,message:'title text longer than 9 words'}]:[])],
] as const;
export function lintReel(spec:ReelSpec){return lintRules.flatMap(([level,_name,run])=>run(spec).map((item:{scene?:number;message:string})=>({level,scene:item.scene,message:item.message})));}
const purposes:Record<string,string>={title:'Hook the viewer with a pixel title.',code:'Show code typing and highlight a change.',diff:'Reveal a before and after code change.',terminal:'Show a command and its output.',flow:'Explain a pipeline or process.',stat:'Land one important number; slam settles with its unit and comparator.',bars:'Compare values in a bar race.',compare:'Contrast two options.',list:'Present a rapid stack of points.',tokens:'Explain tokenization and prediction.',chat:'Show a user prompt and AI reply.',layers:'Explode anchored components, highlight the narrated layer, then reassemble.',grid:'Visualize a matrix or attention map.',kinetic:'Hit one short phrase per beat.',changelog:'Show tagged release changes.',outro:'Close with a call to action.',demo:'Show an actor change a target and reveal the consequence.',predict:'Lock 2–4 guesses, reveal the answer beside a comparison, and correct a wrong assumption.',quantity:'Group real values into scaled tokens, extract a subset, and recompute the remainder.',evidence:'Spotlight one exact source clause or image region with its claim, source, and date.',scale:'Carry a reference object across measured levels with computed ratios.',split:'Reveal one difference across matched baselines, then collapse to the answer.'};
export function reelJsonSchema(){return z.toJSONSchema(reelSpecSchema);}
purposes.special='A scene only the chosen style provides: kind plus style-validated data.';
/** Scene catalogue for agents; with a style, its special scenes are listed too. */
export function describeScenes(style?:ReelSpec['style']){
 const shared=SCENE_TYPES.map(type=>`${type}: ${Object.keys((sceneSchemas[type] as any).shape).filter(k=>k!=='type').join(', ')} — ${purposes[type]}`);
 const specials=Object.entries(styleOf(style).specials??{}).map(([kind,def])=>`special/${kind}: ${def.purpose}`);
 return [...shared,...specials].join('\n');
}
/** Style catalogue for agents. */
export function describeStyles(){return STYLES.map(name=>`${name}: ${STYLE_DEFS[name].description}`).join('\n');}
