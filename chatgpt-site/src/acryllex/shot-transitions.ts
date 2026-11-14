/**
 * Shot transitions for ACRYLLEX: every change of camera angle or framing must read as a deliberate edit.
 *
 * Film-editing rules, applied with the engine's own transition semantics:
 * - 30-degree / shot-size rule: a new shot of the SAME subject changes the viewing direction by >= 30 degrees or
 *   the shot size by >= 1.3x. Anything smaller is a jump cut or a hesitant nudge and is either escalated to a
 *   distinct shot (scene boundaries) or removed (in-scene camera events).
 * - A new angle inside a scene is a hard cut: a camera event with `easing:"hold"` and a tiny `dur` steps the camera
 *   in one frame (engine updateCamera + keyframes.interpolate). No long swings that read as orbits or morphs.
 * - A same-angle size change inside a scene stays a short, smooth push-in/pull-out (0.5-1.4 s).
 * - Shots around an in-scene cut last at least MIN_SHOT seconds, so no flicker shots.
 * - Between scenes that keep the subject, the transition stays clean: cut (default), wipe or black survive;
 *   flash, blink, glitch and push-right are replaced by a cut, and over-long durations are shortened.
 *   Boundaries that change subject keep whatever transition was authored.
 * - Flat footage keeps its captured front view: its variety is framing (insert/reveal/screenY) or another source.
 * Only `scene.camera`, camera events and `scene.transition(Dur)` are touched; style, ink, dither, lighting,
 * contrast and pixel pitch are never read or written.
 */
import {FLAT_ROTATION,MESH_ROTATION,cameraProblems,isFlatObject,sceneViews,shotCamera,storyShot,subjects,viewOf,type Angle,type View} from './camera-direction.ts';
import {resolveAt,sceneDuration,type AcryllexSpec,type CameraMove,type Scene,type SceneEvent} from './spec.ts';

/** Same yaw/pitch table as engine.ts fit(); flat sources always use their captured front view. */
const YAW_PITCH:Record<Angle,[number,number]>={front:[0,6],'three-quarter':[34,14],'three-quarter-left':[-34,14],side:[90,4],'side-left':[-90,4],top:[0,72],high:[22,34],low:[18,-6],back:[180,8]};
export const MIN_ANGLE=30,MIN_SIZE=1.3,MIN_SHIFT=0.15,MIN_SHOT=0.7,CUT_DUR=0.04;
const PUSH_MIN=0.5,PUSH_MAX=1.4,DIRECT_MAX=0.6,THROUGH_MAX=1.0;
const CLEAN=new Set(['cut','wipe','black']);
const NOISY=new Set(['flash','blink','glitch','push-right']);

export type Change='same'|'nudge'|'reframe'|'new-angle'|'new-subject';
interface Geo {dir:[number,number,number];size:number;screenY:number;subject:Set<string>;view:View}

const unit=(v:number[]):[number,number,number]=>{const l=Math.hypot(v[0]!,v[1]!,v[2]!)||1;return [v[0]!/l,v[1]!/l,v[2]!/l];};
const dirOf=(a:Angle)=>{const [y,p]=YAW_PITCH[a]??YAW_PITCH['three-quarter'];const r=Math.PI/180;return unit([Math.sin(y*r)*Math.cos(p*r),Math.sin(p*r),Math.cos(y*r)*Math.cos(p*r)]);};
export const angleBetween=(a:[number,number,number],b:[number,number,number])=>Math.acos(Math.max(-1,Math.min(1,a[0]*b[0]+a[1]*b[1]+a[2]*b[2])))*180/Math.PI;

function geo(s:Scene,c:CameraMove|undefined,base?:CameraMove):Geo{
 const m={...(base??{}),...(c??{})} as CameraMove;const view=viewOf(s,c,base);
 const subj=subjects(s,c);
 const subject=new Set(view.kind==='flat'?view.source.split('+'):subj.map(o=>String(o.model)));
 if(view.kind==='explicit'){const p=m.pos!.map(Number),l=m.look!.map(Number);const d=[p[0]!-l[0]!,p[1]!-l[1]!,p[2]!-l[2]!];return {dir:unit(d),size:1/Math.max(0.01,Math.hypot(...d)),screenY:view.screenY,subject,view};}
 return {dir:view.kind==='flat'?dirOf('front'):dirOf(view.angle),size:view.fill,screenY:view.screenY,subject,view};
}

/** How a cut/move from shot a to shot b reads to the viewer. */
export function classify(a:Geo,b:Geo):{change:Change;deg:number;ratio:number}{
 const shared=[...a.subject].some(x=>b.subject.has(x));
 const deg=angleBetween(a.dir,b.dir),ratio=Math.max(a.size,b.size)/Math.max(1e-6,Math.min(a.size,b.size)),dy=Math.abs(a.screenY-b.screenY);
 if(!shared)return {change:'new-subject',deg,ratio};
 if(a.view.kind==='explicit'!==(b.view.kind==='explicit'))return {change:'new-angle',deg,ratio};
 if(deg>=MIN_ANGLE)return {change:'new-angle',deg,ratio};
 if(ratio>=MIN_SIZE||dy>=MIN_SHIFT)return {change:'reframe',deg,ratio};
 if(deg<4&&ratio<1.05&&dy<0.04)return {change:'same',deg,ratio};
 return {change:'nudge',deg,ratio};
}

const camEvents=(s:Scene)=>(s.events??[]).filter(e=>e.camera);
/** Event times as the engine resolves them (word anchors chain from the previous string anchor). */
function eventTimes(s:Scene){
 const dur=sceneDuration(s);let last=-1;const out=new Map<SceneEvent,number>();
 for(const e of s.events??[]){const t=resolveAt(s,e.at,dur,dur*0.5,typeof e.at==='string'&&!/^[\d.]+%?s?$/.test(e.at)?last:-1);if(typeof e.at==='string')last=t;out.set(e,t);}
 return out;
}
/** Shot chain inside a scene: the opening camera, then each camera event (events inherit the scene camera). */
function chain(s:Scene){
 const g=[geo(s,s.camera)];const times=eventTimes(s);
 const evs=camEvents(s).map(e=>({e,t:times.get(e)??0})).sort((a,b)=>a.t-b.t);
 for(const {e} of evs)g.push(geo(s,e.camera,s.camera));
 return {g,evs};
}
const lastGeo=(s:Scene)=>chain(s).g.at(-1)!;
const isHardCut=(e:SceneEvent)=>e.easing==='hold'&&(Number(e.dur)||0.9)<=0.1;
const fmt=(n:number)=>Math.round(n*100)/100;

/** Shot-transition linter. Every string is actionable feedback for the storyboard model. */
export function transitionProblems(spec:AcryllexSpec):string[]{
 const out:string[]=[];let prev:Geo|undefined;
 spec.scenes.forEach((s,i)=>{
  const tag=`scene ${i+1}`;const {g,evs}=chain(s);const dur=sceneDuration(s);
  if(prev){
   const k=classify(prev,g[0]!);
   if(k.change==='nudge'||k.change==='same')out.push(`${tag}: opens only ${Math.round(k.deg)}° and ${fmt(k.ratio)}x away from the previous shot of the same subject (a jump cut); change the angle by at least ${MIN_ANGLE}° or the shot size by at least ${MIN_SIZE}x.`);
   if(k.change!=='new-subject'&&k.change!=='same'){
    const tr=s.transition??'cut';
    if(NOISY.has(tr))out.push(`${tag}: ${tr} transition on a camera change of the same subject is gratuitous; use a clean cut (or wipe/black for a real time jump).`);
    else if(tr!=='cut'&&s.transitionDur!==undefined&&s.transitionDur>(tr==='black'?THROUGH_MAX:DIRECT_MAX))out.push(`${tag}: ${tr} lasts ${s.transitionDur}s; keep a viewpoint change crisp (at most ${tr==='black'?THROUGH_MAX:DIRECT_MAX}s).`);
   }
  }
  evs.forEach(({e,t},k)=>{
   const c=classify(g[k]!,g[k+1]!);const at=`${tag} camera event at "${e.at}"`;
   if(c.change==='same'||c.change==='nudge'){out.push(`${at}: ${Math.round(c.deg)}° / ${fmt(c.ratio)}x is a hesitant nudge; either cut to a clearly different shot (>= ${MIN_ANGLE}° or >= ${MIN_SIZE}x) or hold the shot.`);return;}
   if((c.change==='new-angle'||c.change==='new-subject')&&!isHardCut(e))out.push(`${at}: swings ${Math.round(c.deg)}° over ${Number(e.dur)||0.9}s like a camera morph; make a new angle a hard cut (easing "hold", dur ${CUT_DUR}).`);
   if(c.change==='reframe'&&!isHardCut(e)){const d=Number(e.dur)||0.9;if(d<PUSH_MIN||d>PUSH_MAX)out.push(`${at}: push/pull lasts ${d}s; keep a reframe between ${PUSH_MIN} and ${PUSH_MAX}s.`);}
   const cutAt=t+(isHardCut(e)?Number(e.dur)||0:0),prevT=k?evs[k-1]!.t:0;
   if(cutAt-prevT<MIN_SHOT||dur-cutAt<MIN_SHOT)out.push(`${at}: leaves a shot shorter than ${MIN_SHOT}s (flicker); move the change or drop it.`);
  });
  prev=g.at(-1);
 });
 return [...new Set(out)];
}

export interface TransitionPlan {spec:AcryllexSpec;changes:string[]}

/** A distinct opening shot for scene s after `prev`: never a nudge, never adds camera-direction problems. */
function distinctOpening(spec:AcryllexSpec,i:number,prev:Geo):CameraMove|undefined{
 const s=spec.scenes[i]!;const flat=geo(s,s.camera).view.kind==='flat';
 const pool=[storyShot(s,flat,i===0),...(flat?FLAT_ROTATION:MESH_ROTATION)].filter((k,j,a):k is NonNullable<typeof k>=>!!k&&a.indexOf(k)===j);
 const base=cameraProblems(spec).length;const next=spec.scenes[i+1];
 const fits=(cam:CameraMove,strict:boolean)=>{
  const trial={...s,camera:cam};const c=classify(prev,geo(trial,cam));if(c.change==='nudge'||c.change==='same')return false;
  const n=next?classify(lastGeo(trial),geo(next,next.camera)).change:undefined;if(n==='nudge'||n==='same')return false;
  // keep the scene's own planned in-scene shots meaningful (the opening must not swallow its own cut)
  const own=chain(trial).g;if(own.slice(1).some((g,k)=>{const x=classify(own[k]!,g).change;return x==='nudge'||x==='same';})&&!chain(s).g.slice(1).some((g,k)=>{const x=classify(chain(s).g[k]!,g).change;return x==='nudge'||x==='same';}))return false;
  if(!strict)return true;
  const t=structuredClone(spec);t.scenes[i]=trial;return cameraProblems(t).length<=base;
 };
 const cams=pool.map(k=>{const c=shotCamera(s,k,s.camera);if(s.camera?.move&&!c.move)c.move=s.camera.move;if(s.camera?.amount!==undefined&&c.move===s.camera.move)c.amount=s.camera.amount;return c;});
 // prefer a genuinely new angle over a same-angle punch-in (stable: story cue, then least-used rotation order)
 const ranked=cams.map((c,j)=>({c,j,r:classify(prev,geo({...s,camera:c},c)).change==='new-angle'?0:1})).sort((a,b)=>a.r-b.r||a.j-b.j).map(x=>x.c);
 return ranked.find(c=>fits(c,true))??ranked.find(c=>fits(c,false));
}

/**
 * Deterministic repair after planCameras: escalates jump cuts between scenes into distinct shots, turns in-scene
 * angle swings into hard cuts, drops hesitant nudges and flicker shots, bounds push/pull timing, and keeps
 * same-subject scene transitions clean. Explicit/follow scenes and authored subject changes are kept.
 */
export function planTransitions(input:AcryllexSpec):TransitionPlan{
 const spec=structuredClone(input) as AcryllexSpec;const changes:string[]=[];let prev:Geo|undefined;
 spec.scenes.forEach((s,i)=>{
  const tag=`scene ${i+1}`;const dur=sceneDuration(s);
  // 1. scene boundary
  if(prev){
   let k=classify(prev,geo(s,s.camera));
   const locked=!!(s.camera&&((Array.isArray(s.camera.pos)&&Array.isArray(s.camera.look))||s.camera.follow));
   if((k.change==='nudge'||k.change==='same')&&!locked){
    const cam=distinctOpening(spec,i,prev);
    if(cam){
     const before=s.camera;s.camera=cam;
     // events that only re-framed the old opening keep their own targets; their nudge status is re-checked below
     k=classify(prev,geo(s,cam));
     changes.push(`${tag}: jump cut (${before?.angle??'three-quarter'} ${before?.fill??0.86}) → ${cam.angle} fill ${cam.fill}${cam.focus?` focus ${[cam.focus].flat().join('+')}`:''} (${Math.round(k.deg)}°, ${fmt(k.ratio)}x)`);
    }
   }
   if(k.change!=='new-subject'&&k.change!=='same'){
    const tr=s.transition??'cut';
    if(NOISY.has(tr)){s.transition='cut';delete s.transitionDur;changes.push(`${tag}: ${tr} → cut on a same-subject viewpoint change`);}
    else if(CLEAN.has(tr)&&tr!=='cut'&&s.transitionDur!==undefined){const max=tr==='black'?THROUGH_MAX:DIRECT_MAX;if(s.transitionDur>max){changes.push(`${tag}: ${tr} ${s.transitionDur}s → ${max}s`);s.transitionDur=max;}}
   }
  }
  // 2. in-scene camera events
  if(camEvents(s).length){
   const times=eventTimes(s);let ref=geo(s,s.camera);let lastCut=0;const drop=new Set<SceneEvent>();
   for(const e of [...camEvents(s)].sort((a,b)=>(times.get(a)??0)-(times.get(b)??0))){
    const g=geo(s,e.camera,s.camera);const c=classify(ref,g);const at=`${tag} camera event at "${e.at}"`;
    if(c.change==='same'||c.change==='nudge'){drop.add(e);changes.push(`${at}: dropped hesitant nudge (${Math.round(c.deg)}°, ${fmt(c.ratio)}x)`);continue;}
    let t=times.get(e)??0;
    if(c.change==='new-angle'||c.change==='new-subject'){
     if(!isHardCut(e)){changes.push(`${at}: ${Math.round(c.deg)}° swing over ${Number(e.dur)||0.9}s → hard cut`);e.easing='hold';e.dur=CUT_DUR;}
    }else{
     const d=Number(e.dur)||0.9;if(!isHardCut(e)&&(d<PUSH_MIN||d>PUSH_MAX)){const nd=Math.min(PUSH_MAX,Math.max(PUSH_MIN,d));changes.push(`${at}: reframe ${d}s → ${nd}s`);e.dur=nd;}
    }
    const span=isHardCut(e)?Number(e.dur)||0:0;
    if(t+span-lastCut<MIN_SHOT||dur-(t+span)<MIN_SHOT){
     const lo=lastCut+MIN_SHOT,hi=dur-MIN_SHOT-span;
     if(lo>hi){drop.add(e);changes.push(`${at}: dropped (no room for a ${MIN_SHOT}s shot on both sides)`);continue;}
     const nt=fmt(Math.min(hi,Math.max(lo,t)));changes.push(`${at}: moved to ${nt}s (no flicker shot)`);e.at=nt;t=nt;
    }
    lastCut=t+span;ref=g;
   }
   if(drop.size){s.events=(s.events??[]).flatMap(e=>{if(!drop.has(e))return [e];const {camera:_,...rest}=e;return Object.keys(rest).some(k=>k!=='at'&&k!=='easing'&&k!=='dur')?[rest]:[];});if(!s.events.length)delete s.events;}
  }
  prev=lastGeo(s);
 });
 return {spec,changes};
}

/** Prompt guidance for storyboard, storyboard review and visual review. */
export const SHOT_TRANSITION_RULES=`SHOT TRANSITIONS (every viewpoint change must look deliberate): a new shot of the same subject changes the angle by at least ${MIN_ANGLE}° (e.g. three-quarter → side/top/front/back, NOT three-quarter → high/low/three-quarter-left at the same size) or the shot size by at least ${MIN_SIZE}x (medium → macro, wide → close); smaller changes are jump cuts and will be rejected. Between scenes use a plain cut for a new angle; wipe or black only for a real jump in time/place; never flash, blink, glitch or push-right just to change angle. Inside a scene a new angle is a hard cut: a camera event with easing "hold" and dur ${CUT_DUR} at the spoken word that motivates it; never a slow swing between angles (it reads as an orbit/morph). A same-angle push-in or pull-out may be smooth over ${PUSH_MIN}-${PUSH_MAX}s. Every shot lasts at least ${MIN_SHOT}s. Do not nudge the camera by a few degrees or a few percent. Flat footage keeps its captured front view; change framing (insert/reveal) or source instead.`;

/** Camera + transition summary of the cuts for review prompts. */
export function transitionList(spec:AcryllexSpec){
 let prev:Geo|undefined;
 return spec.scenes.map((s,i)=>{
  const {g,evs}=chain(s);const parts:string[]=[];
  if(prev){const k=classify(prev,g[0]!);parts.push(`${i+1}:${s.transition??'cut'} ${k.change} ${Math.round(k.deg)}° ${fmt(k.ratio)}x`);}
  evs.forEach(({e,t},k)=>{const c=classify(g[k]!,g[k+1]!);parts.push(`${i+1}@${fmt(t)}s ${isHardCut(e)?'cut':`move ${Number(e.dur)||0.9}s`} ${c.change}`);});
  prev=g.at(-1);return parts.join(', ');
 }).filter(Boolean).join('; ');
}
