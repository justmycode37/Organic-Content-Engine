/**
 * Camera direction for ACRYLLEX reels: a shot vocabulary, a repeated-view linter and a deterministic planner.
 * Only `scene.camera`, camera-only events and excess rotating idles are touched; pixel size, ink, dither,
 * lighting and contrast are never read or written here.
 *
 * Geometry honesty: an editable mesh can be filmed from any supported angle. A flat reference image/video
 * (footage, photo, wave/human media) has exactly one captured viewpoint, so its variety comes from a different
 * genuine source view (another asset/file/crop) or from push/pull/crop/insert framing, never from a new angle.
 */
import {isFootageModel,resolveFootageParams} from './media-library.ts';
import type {AcryllexSpec,CameraMove,Scene} from './spec.ts';

export type Angle=NonNullable<CameraMove['angle']>;
export type Band='wide'|'medium'|'close'|'macro';
export type ShotKind='establish'|'hero'|'front'|'profile'|'plan'|'high'|'low'|'macro-contact'|'waterline'|'insert'|'reveal';

export interface Shot {kind:ShotKind;angle:Angle;fill:number;move?:CameraMove['move'];amount?:number;use:string;flat:boolean}

/** Engine defaults (engine.ts frameCamera): angle three-quarter, fill 0.86. */
export const DEFAULT_ANGLE:Angle='three-quarter',DEFAULT_FILL=0.86;

/** The shot vocabulary. `flat` marks shots that are valid for a captured (flat) source view. */
export const SHOTS:Record<ShotKind,Shot>={
 establish:{kind:'establish',angle:'high',fill:0.58,use:'where we are: the whole object on its table/in its place, before details',flat:false},
 hero:{kind:'hero',angle:'three-quarter',fill:0.82,use:'the default read of a 3D silhouette',flat:false},
 front:{kind:'front',angle:'front',fill:0.8,use:'faces, labels, screens, symmetric glassware head-on',flat:true},
 profile:{kind:'profile',angle:'side',fill:0.8,use:'thickness, layers, levels, pouring, a spoon dipping in, lateral walking',flat:false},
 plan:{kind:'plan',angle:'top',fill:0.74,use:'rims, rings, ripples, layouts, anything circular seen from above',flat:false},
 high:{kind:'high',angle:'high',fill:0.7,use:'context: objects on a table, how things sit relative to each other',flat:false},
 low:{kind:'low',angle:'low',fill:0.86,use:'tall, heavy, powerful, towering subjects (a bottle as a monument)',flat:false},
 'macro-contact':{kind:'macro-contact',angle:'three-quarter-left',fill:1.05,move:'push',amount:0.5,use:'the exact point where two things touch: spoon on glass, lip on rim, drop on surface; material and texture',flat:false},
 waterline:{kind:'waterline',angle:'side',fill:1.0,use:'eye level with the liquid surface: the waterline, the bend of a straw/spoon, bubbles, the meniscus',flat:false},
 insert:{kind:'insert',angle:'front',fill:1.05,move:'push',amount:0.5,use:'a flat source cropped tight on the detail that matters',flat:true},
 reveal:{kind:'reveal',angle:'front',fill:0.6,move:'pull',amount:0.6,use:'pull back from a detail to show the whole captured frame',flat:true},
};
/** Mesh rotation when no story cue applies: varied, silhouette-friendly, never orbit. */
export const MESH_ROTATION:ShotKind[]=['hero','profile','high','macro-contact','front','low','plan'];
export const FLAT_ROTATION:ShotKind[]=['front','insert','reveal'];
const ROTATING_MOVES=new Set(['orbit','orbit-left','rise','fall','crane','drift']);
const ORBITS=new Set(['orbit','orbit-left']);
const SPIN_IDLES=new Set(['spin','spin-slow','orbit','turn']);

const LIQUID=/\b(water|liquid|glass|bottle|cup|jar|mug|tea|coffee|milk|juice|ocean|sea|wave|pool|drop(let)?s?|pour\w*|wet|float\w*|sink\w*|bubble\w*|meniscus|waterline|level|surface|refract\w*|bend\w*|straw)\b/i;
const CONTACT=/\b(touch\w*|contact|hit\w*|tap\w*|press\w*|grip\w*|hold\w*|rim|edge|lip|tip|scratch\w*|rub\w*|stir\w*|clink\w*|ring\w*|material|metal|steel|silver|texture|grain|smooth|rough|polish\w*|reflect\w*|shin\w*)\b/i;
const WIDE=/\b(whole|everything|world|all|room|kitchen|table|everyday|every day|imagine|picture this|look at)\b/i;
const ABOVE=/\b(above|top|map|circle|round|ring|ripple\w*|spiral|pattern|layout)\b/i;
const TALL=/\b(tall|huge|giant|tower\w*|heavy|power\w*|strong\w*|massive|stand\w*)\b/i;
const SIDE=/\b(side|profile|thin|layer\w*|flat|through|across|inside|level|half)\b/i;
const LIQUID_THING=/water|liquid|glass|bottle|cup|jar|mug|tea|coffee|milk|juice|ocean|sea|wave|pool|drop/i;

export const isFlatObject=(o:{model:string})=>{try{return isFootageModel(String(o.model));}catch{return false;}};
const framed=(s:Scene)=>s.objects.filter(o=>o.frame!==false);
const focusIds=(s:Scene,c?:CameraMove)=>{const f=c?.focus;const ids=f===undefined?[]:Array.isArray(f)?f:[f];const known=ids.filter(id=>s.objects.some(o=>o.id===id));return known.length?known:framed(s).map(o=>o.id);};
/** Objects the camera actually frames for a camera move. */
export const subjects=(s:Scene,c?:CameraMove)=>{const ids=new Set(focusIds(s,c));return s.objects.filter(o=>ids.has(o.id));};

export const bandOf=(fill:number):Band=>fill<0.62?'wide':fill<0.9?'medium':fill<0.99?'close':'macro';

/** A flat source's genuine view identity: library asset or file/url, plus its crop window. */
export function sourceView(o:{model:string;params?:Record<string,unknown>}){
 let p:Record<string,unknown>=o.params??{};try{p=resolveFootageParams(String(o.model),p) as Record<string,unknown>;}catch{}
 return `${String(p.asset??p.file??p.url??o.model)}${p.crop?`@${String(p.crop)}`:''}`;
}

export interface View {kind:'mesh'|'flat'|'explicit'|'follow';angle:Angle;band:Band;fill:number;focus:string;move:string;source:string;screenY:number}

/** The view a camera move produces in a scene (event cameras inherit angle/fill like the engine does). */
export function viewOf(s:Scene,c:CameraMove|undefined,base?:CameraMove):View{
 const m={...(base??{}),...(c??{})} as CameraMove;
 const subj=subjects(s,c);const flat=subj.some(isFlatObject);
 const fill=Number(m.fill)||DEFAULT_FILL;const move=m.move??'static';const screenY=Number(m.screenY)||0.5;
 if(Array.isArray(m.pos)&&Array.isArray(m.look))return {kind:'explicit',angle:m.angle??DEFAULT_ANGLE,band:bandOf(fill),fill,focus:`${m.pos.join(',')}>${m.look.join(',')}`,move,source:'',screenY};
 if(m.follow)return {kind:'follow',angle:m.angle??DEFAULT_ANGLE,band:bandOf(fill),fill,focus:m.follow,move,source:'',screenY};
 return {kind:flat?'flat':'mesh',angle:flat?'front':m.angle??DEFAULT_ANGLE,band:bandOf(fill),fill,focus:focusIds(s,c).slice().sort().join('+'),move,
  source:flat?subj.filter(isFlatObject).map(sourceView).sort().join('+'):'',screenY};
}
const cameraEvents=(s:Scene)=>(s.events??[]).filter(e=>e.camera);
/** First and last view of a scene: the cut compares the previous scene's last view with the next scene's first. */
export function sceneViews(s:Scene){
 const first=viewOf(s,s.camera);const evs=cameraEvents(s);
 const last=evs.length?viewOf(s,evs[evs.length-1]!.camera,s.camera):first;
 return {first,last};
}
/** True when a cut between the two views shows the viewer the same picture again. */
export function sameView(a:View,b:View){
 if(a.kind!==b.kind)return false;
 if(a.kind==='explicit'||a.kind==='follow')return a.focus===b.focus&&a.band===b.band;
 if(a.kind==='flat')return a.source===b.source&&a.band===b.band&&Math.abs(a.screenY-b.screenY)<0.08;
 return a.angle===b.angle&&a.band===b.band&&a.focus===b.focus;
}

/** Repeated-view and camera-honesty linter. Every string is actionable feedback for the storyboard model. */
export function cameraProblems(spec:AcryllexSpec):string[]{
 const out:string[]=[];const n=spec.scenes.length;
 const views=spec.scenes.map(sceneViews);
 const meshAngles:Angle[]=[];let orbitScenes=0,spinScenes=0,pushRun=0;
 spec.scenes.forEach((s,i)=>{
  const tag=`scene ${i+1}`;const v=views[i]!;
  if(i>0&&sameView(views[i-1]!.last,v.first))out.push(v.first.kind==='flat'
   ?`${tag}: repeats the previous shot of the same flat source (${v.first.source}); use a different genuine source view, or change framing (insert fill ~1.05 / reveal fill ~0.6, push/pull, screenY).`
   :`${tag}: repeats the previous ${v.first.angle} ${v.first.band} view; cut to a different angle or shot size (profile, top, high, low, macro contact, waterline).`);
  // flat sources have one captured viewpoint
  for(const c of [s.camera,...cameraEvents(s).map(e=>e.camera)]){
   if(!c)continue;const subj=subjects(s,c);if(!subj.some(isFlatObject))continue;
   if(c.angle&&c.angle!=='front')out.push(`${tag}: camera angle ${c.angle} on a flat source (${subj.filter(isFlatObject).map(o=>o.id).join(', ')}) cannot show unseen geometry; keep front and vary push/pull/crop, or use another genuine source view.`);
   if(c.move&&ROTATING_MOVES.has(c.move))out.push(`${tag}: ${c.move} rotates around a flat source; use static, push or pull.`);
  }
  // sensible fill/focus
  for(const c of [s.camera,...cameraEvents(s).map(e=>e.camera)]){
   if(!c)continue;
   for(const id of c.focus===undefined?[]:Array.isArray(c.focus)?c.focus:[c.focus])if(!s.objects.some(o=>o.id===id))out.push(`${tag}: camera focus "${id}" is not an object in the scene.`);
   if(c.fill!==undefined&&c.fill>=1&&c.focus===undefined&&framed(s).length>1&&!c.pos)out.push(`${tag}: macro fill ${c.fill} without focus crops arbitrarily; focus the contact/detail object(s).`);
   if(c.fill!==undefined&&c.fill>1.1)out.push(`${tag}: fill ${c.fill} exceeds the engine maximum 1.1.`);
  }
  // no beat pumping
  const evs=cameraEvents(s);
  if(evs.length>2)out.push(`${tag}: ${evs.length} camera events; use at most 2 motivated camera changes per scene (no beat pumping).`);
  const dirs=[s.camera?.move,...evs.map(e=>e.camera!.move)].filter(m=>m==='push'||m==='pull');
  if(dirs.some((m,k)=>k>0&&m!==dirs[k-1]))out.push(`${tag}: alternating push/pull pumps the frame; keep one direction per scene.`);
  pushRun=(s.camera?.move==='push'||s.camera?.move==='pull')?pushRun+1:0;
  if(pushRun===4)out.push(`${tag}: four scenes in a row push/pull; hold some shots static so moves stay motivated.`);
  if([s.camera,...evs.map(e=>e.camera)].some(c=>c?.move&&ORBITS.has(c.move)))orbitScenes++;
  if(s.objects.some(o=>o.idle&&SPIN_IDLES.has(o.idle)))spinScenes++;
  if(v.first.kind==='mesh')meshAngles.push(v.first.angle);
 });
 const orbitMax=n>=12?2:1;
 if(orbitScenes>orbitMax)out.push(`reel: ${orbitScenes} scenes orbit; at most ${orbitMax}. Choose a fixed angle that explains the subject instead of orbiting.`);
 const spinMax=Math.max(2,Math.floor(n/3));
 if(spinScenes>spinMax)out.push(`reel: ${spinScenes} scenes spin/turn their objects; at most ${spinMax}. Do not auto-rotate every object; set idle "none" and choose a camera angle.`);
 for(let i=2;i<meshAngles.length;i++)if(meshAngles[i]===meshAngles[i-1]&&meshAngles[i]===meshAngles[i-2]){out.push(`reel: three 3D scenes in a row use the ${meshAngles[i]} angle; alternate the perspective.`);break;}
 if(meshAngles.length>=5){
  const counts=new Map<Angle,number>();for(const a of meshAngles)counts.set(a,(counts.get(a)??0)+1);
  const [top,count]=[...counts].sort((a,b)=>b[1]-a[1])[0]!;
  if(count/meshAngles.length>0.6)out.push(`reel: ${count} of ${meshAngles.length} 3D scenes use the ${top} angle; use at least three perspectives across the reel.`);
 }
 return [...new Set(out)];
}

/** Story cue from the narration and the scene's objects; undefined when nothing specific is said. */
export function storyShot(s:Scene,flat:boolean,opening=false):ShotKind|undefined{
 const say=s.say;const things=s.objects.map(o=>`${o.id} ${o.model}`).join(' ');
 const contactPair=framed(s).length>=2||s.objects.some(o=>o.near);
 if(flat){if(CONTACT.test(say))return 'insert';if(WIDE.test(say))return 'reveal';return undefined;}
 if(opening&&WIDE.test(say))return 'establish';
 if(CONTACT.test(say)&&contactPair)return 'macro-contact';
 if(LIQUID.test(say)&&LIQUID_THING.test(things)&&/\b(level|surface|waterline|line|bend\w*|refract\w*|float\w*|sink\w*|pour\w*|fill\w*|bubble\w*|half|broken|break\w*)\b/i.test(say))return 'waterline';
 if(ABOVE.test(say))return 'plan';
 if(TALL.test(say))return 'low';
 if(SIDE.test(say))return 'profile';
 if(CONTACT.test(say))return 'macro-contact';
 if(WIDE.test(say))return 'establish';
 return undefined;
}

/** Concrete camera for a shot in a scene, with focus chosen for macro/waterline. */
export function shotCamera(s:Scene,kind:ShotKind,keep?:CameraMove):CameraMove{
 const shot=SHOTS[kind];const cam:CameraMove={angle:shot.angle,fill:shot.fill};
 if(shot.move){cam.move=shot.move;cam.amount=shot.amount;}
 if(kind==='macro-contact'){
  const objs=framed(s);const a=objs.find(o=>o.near)??objs[1];const b=a?.near?objs.find(o=>o.id===a.near):objs[0];
  const ids=[...new Set([a?.id,b?.id].filter((x):x is string=>!!x))];if(ids.length)cam.focus=ids.length===1?ids[0]:ids;
 }
 if(kind==='waterline'){const liquid=framed(s).find(o=>LIQUID_THING.test(`${o.id} ${o.model}`));if(liquid)cam.focus=liquid.id;}
 if(keep?.screenY!==undefined)cam.screenY=keep.screenY;
 if(keep?.fov!==undefined)cam.fov=keep.fov;
 return cam;
}

export interface CameraPlan {spec:AcryllexSpec;changes:string[]}

/**
 * Deterministic repair: keeps every authored camera that is honest and non-repeating, and re-directs only the
 * scenes that repeat the previous view, put a non-front angle on a flat source, or exceed orbit/spin/pumping
 * limits. Scenes with no camera at all and a clear story cue are directed by that cue. Replacement shots follow the narration (contact → macro, liquid level → waterline, round → top, ...)
 * and otherwise rotate through the least-used perspectives. Never chooses an orbit.
 */
export function planCameras(input:AcryllexSpec):CameraPlan{
 const spec=structuredClone(input) as AcryllexSpec;const changes:string[]=[];const n=spec.scenes.length;
 const used=new Map<string,number>();let prevLast:View|undefined;const recentAngles:Angle[]=[];
 let orbitScenes=0,spinScenes=0,pushRun=0;const orbitMax=n>=12?2:1,spinMax=Math.max(2,Math.floor(n/3));
 spec.scenes.forEach((s,i)=>{
  const tag=`scene ${i+1}`;
  // trim camera pumping inside the scene
  let camEvents=0;let dir:string|undefined=s.camera?.move==='push'||s.camera?.move==='pull'?s.camera.move:undefined;
  s.events=(s.events??[]).flatMap(e=>{
   if(!e.camera)return [e];camEvents++;const m=e.camera.move;
   const pump=camEvents>2||((m==='push'||m==='pull')&&dir!==undefined&&m!==dir);
   if(m==='push'||m==='pull')dir??=m;
   if(!pump)return [e];changes.push(`${tag}: dropped pumping camera event at "${e.at}"`);
   const {camera:_,...rest}=e;return Object.keys(rest).some(k=>k!=='at'&&k!=='easing'&&k!=='dur')?[rest]:[];
  });
  if(!s.events.length)delete s.events;
  // rotating idles beyond the quota
  if(s.objects.some(o=>o.idle&&SPIN_IDLES.has(o.idle))){
   if(spinScenes>=spinMax){for(const o of s.objects)if(o.idle&&SPIN_IDLES.has(o.idle)){o.idle='none';changes.push(`${tag}: ${o.id} idle → none (too many rotating scenes)`);}}
   else spinScenes++;
  }
  const explicit=!!(s.camera&&((Array.isArray(s.camera.pos)&&Array.isArray(s.camera.look))||s.camera.follow));
  let first=viewOf(s,s.camera);const flat=first.kind==='flat';
  const flatAngle=[s.camera,...cameraEvents(s).map(e=>e.camera)].some(c=>c&&subjects(s,c).some(isFlatObject)&&((c.angle&&c.angle!=='front')||(c.move&&ROTATING_MOVES.has(c.move))));
  if(flatAngle){
   for(const c of [s.camera,...cameraEvents(s).map(e=>e.camera)]){if(!c||!subjects(s,c).some(isFlatObject))continue;if(c.angle&&c.angle!=='front')c.angle='front';if(c.move&&ROTATING_MOVES.has(c.move))c.move='static';}
   changes.push(`${tag}: flat source kept at its captured front view`);first=viewOf(s,s.camera);
  }
  const orbiting=[s.camera,...cameraEvents(s).map(e=>e.camera)].some(c=>c?.move&&ORBITS.has(c.move));
  if(orbiting){
   if(orbitScenes>=orbitMax){for(const c of [s.camera,...cameraEvents(s).map(e=>e.camera)])if(c?.move&&ORBITS.has(c.move))c.move='static';changes.push(`${tag}: orbit → static (orbit quota used)`);}
   else orbitScenes++;
  }
  const meshCount=recentAngles.length;
  const overused=first.kind==='mesh'&&meshCount>=3&&(used.get(first.angle)??0)+1>Math.max(2,Math.floor(0.5*(meshCount+1)));
  const triple=first.kind==='mesh'&&recentAngles.length>=2&&recentAngles.at(-1)===first.angle&&recentAngles.at(-2)===first.angle;
  const repeat=prevLast!==undefined&&sameView(prevLast,first);
  const unauthored=!s.camera&&!cameraEvents(s).length;const story=storyShot(s,flat,i===0);
  const cue=unauthored&&story!==undefined;
  if(!explicit&&(repeat||triple||overused||cue)){
   const pool=flat?FLAT_ROTATION:MESH_ROTATION;
   const ordered=[...(story?[story]:[]),...pool.slice().sort((a,b)=>(used.get(SHOTS[a].angle)??0)-(used.get(SHOTS[b].angle)??0))];
   const pick=ordered.find(k=>{
    const cam=shotCamera(s,k,s.camera);const v=viewOf(s,cam);
    if(prevLast&&sameView(prevLast,v))return false;
    if(flat)return true;
    if(recentAngles.at(-1)===v.angle&&recentAngles.at(-2)===v.angle)return false;
    return (used.get(v.angle)??0)+1<=Math.max(2,Math.floor(0.5*(meshCount+1)))||k===story;
   })??ordered.find(k=>!prevLast||!sameView(prevLast,viewOf(s,shotCamera(s,k,s.camera))));
   if(pick){
    const cam=shotCamera(s,pick,s.camera);
    if(flat&&cam.move&&s.camera?.move&&s.camera.move!==cam.move)cam.move=s.camera.move==='static'?cam.move:s.camera.move;
    s.camera=cam;first=viewOf(s,cam);
    changes.push(`${tag}: ${repeat?'repeated view':triple?'third same angle in a row':overused?'overused angle':'undirected scene, story cue'} → ${pick} (${cam.angle}, fill ${cam.fill}${cam.focus?`, focus ${[cam.focus].flat().join('+')}`:''})`);
   }
  }
  // keep moves motivated: no long push/pull runs
  pushRun=(s.camera?.move==='push'||s.camera?.move==='pull')?pushRun+1:0;
  if(pushRun>=4&&s.camera){s.camera.move='static';delete s.camera.amount;pushRun=0;changes.push(`${tag}: push/pull run → static`);}
  if(first.kind==='mesh'){recentAngles.push(first.angle);used.set(first.angle,(used.get(first.angle)??0)+1);}
  prevLast=sceneViews(s).last;
 });
 return {spec,changes};
}

/** Prompt guidance shared by storyboard, storyboard review and visual review. */
export const CAMERA_DIRECTION_RULES=`CAMERA DIRECTION (perspective variety; never changes pixel size, ink, dither, contrast or light): a reel about one object (a spoon, a glass, a water bottle) must not hold one perspective throughout. Shot vocabulary (scene.camera angle/fill/focus/move): ${Object.values(SHOTS).map(s=>`${s.kind} = ${s.angle}${s.fill?` fill ${s.fill}`:''}${s.move?` ${s.move}`:''}${s.flat?' [flat ok]':''}: ${s.use}`).join('; ')}. Story drives the cut: establish or high first, then move in as the explanation narrows; contact and material lines get a macro-contact (focus both touching objects, fill 1.0-1.1); liquid level, bending, floating and bubbles get the waterline (side, eye level with the surface, focus the container); round/ring/ripple lines get top; tall/strong lines get low; the payoff may return to the hook framing as a callback. Consecutive scenes must not repeat the same angle + shot size + focus; no angle three 3D scenes in a row; at least three perspectives per reel; at most one orbit per reel (two for 12+ scenes) and never auto-spin every object. Camera events: at most 2 per scene, each motivated by the spoken action; keep one push or pull direction per scene; do not pump the camera on the beat. Editable meshes may take any supported angle. A flat reference image/video/footage has ONE captured viewpoint: keep angle front and no orbit/rise/fall/crane/drift; vary it with a distinct genuine source view when one exists (another library asset, file or crop that really shows that view) and otherwise with push, pull, insert crops (fill ~1.05) and reveals (fill ~0.6). Never ask a flat source for a side, top or back it never recorded.`;
