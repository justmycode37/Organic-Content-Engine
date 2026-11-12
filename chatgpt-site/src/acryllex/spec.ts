/**
 * ACRYLLEX reel spec: a curious explainer told as a sequence of 3D scenes.
 * Every object is a real 3D model rendered as ordered-dither dots in one hue per scene.
 * `at` values may be a narration word (the produce script resolves words to seconds),
 * a number of seconds from scene start, or a percentage string like "60%".
 */
export type Hue='blue'|'azure'|'red'|'white'|'amber'|'green'|'cyan'|'violet'|'orange'|'pink';
export type At=string|number;
export type Vec3=[number,number,number];

export type Enter='materialize'|'assemble'|'pop'|'drop'|'slide-left'|'slide-right'|'rise'|'grow'|'walk-in-left'|'walk-in-right'|'none';
export type Exit='dissolve'|'shatter'|'shrink'|'slide-left'|'slide-right'|'fall'|'walk-out-left'|'walk-out-right'|'none';
export type Idle='none'|'spin'|'spin-slow'|'float'|'pulse'|'sway'|'wobble'|'orbit';

export interface SceneObject {
 id:string;
 model:string;
 params?:Record<string,unknown>;
 /** Placement: absolute world position (metres), or relative to another object. */
 pos?:Vec3;
 near?:string;
 side?:'left'|'right'|'on'|'behind'|'front'|'above'|'below'|'in';
 gap?:number;
 /** Rotation in degrees (x,y,z); y turns the object to face left/right. */
 rot?:Vec3;
 scale?:number;
 hue?:Hue;
 enter?:Enter;
 enterAt?:At;
 exit?:Exit;
 exitAt?:At;
 idle?:Idle;
 /** Initial control values (model specific, 0..1 unless documented). */
 controls?:Record<string,number>;
 /** Initial pose for posable models (human). */
 pose?:string;
 /** Exclude from automatic camera framing (e.g. a large floor or backdrop). */
 frame?:boolean;
}

export interface SceneEvent {
 at:At;
 dur?:number;
 target?:string;
 /** set: tween model controls; pose: change pose; move: travel; turn: rotate; scale; glow; hue; show/hide effects. */
 set?:Record<string,number>;
 pose?:string;
 move?:{to?:Vec3;near?:string;side?:SceneObject['side'];by?:Vec3;gap?:number};
 turn?:Vec3;
 scaleTo?:number;
 hue?:Hue;
 show?:Enter;
 hide?:Exit;
 camera?:CameraMove;
 sfx?:string;
}

export interface CameraMove {
 angle?:'front'|'three-quarter'|'three-quarter-left'|'side'|'side-left'|'top'|'high'|'low'|'back';
 /** Fraction of the frame width the framed objects fill (0.3 wide .. 0.95 close). */
 fill?:number;
 focus?:string|string[];
 move?:'static'|'push'|'pull'|'orbit'|'orbit-left'|'drift'|'rise'|'fall'|'crane';
 /** Strength of the move, default 1. */
 amount?:number;
 /** Where the subject's centre sits vertically on screen (0 top .. 1 bottom), default 0.5. */
 screenY?:number;
}

export type TextStyle='headline'|'highlight'|'tag'|'prefix'|'mono'|'number'|'label';
export interface TextItem {
 text:string;
 style?:TextStyle;
 /** Word(s) inside the text drawn in a hue box. */
 highlight?:string;
 at?:At;
 until?:At;
 pos?:'top'|'upper'|'center'|'lower'|'bottom'|'left'|'right'|'top-left'|'top-right'|'bottom-left'|'bottom-right'|[number,number];
 size?:number;
 hue?:Hue;
 /** Attach the label to an object (follows it on screen). */
 follow?:string;
}

export interface Scene {
 say:string;
 hue?:Hue;
 duration?:number;
 camera?:CameraMove;
 objects:SceneObject[];
 events?:SceneEvent[];
 text?:TextItem[];
 transition?:'cut'|'dissolve'|'wipe'|'flash';
 /** Optional ground plane drawn as sparse dots. */
 ground?:boolean;
 /** Filled in by the producer: spoken word timings relative to scene start. */
 words?:{text:string;start:number;end:number}[];
}

export interface AcryllexSpec {
 version:1;
 series:'ACRYLLEX';
 title:string;
 musicBrief?:string;
 captions?:boolean;
 scenes:Scene[];
}

export const HUES:Record<Hue,string>={
 blue:'#4a3cff',azure:'#2a72ff',red:'#ec1c4f',white:'#e6e6e6',amber:'#ffb21f',green:'#22e07a',cyan:'#25d4ff',violet:'#9d4bff',orange:'#ff6a1f',pink:'#ff4fb8',
};
export const TEXT_GREY='#d9d9d9';

/** Resolve an `at` value to seconds within a scene. Word matching starts after `after` seconds. */
export function resolveAt(scene:Scene,at:At|undefined,dur:number,fallback=0,after=-1):number{
 if(at===undefined||at===null)return fallback;
 if(typeof at==='number')return Math.max(0,Math.min(dur,at));
 const s=String(at).trim();
 const pct=/^(-?\d+(?:\.\d+)?)%$/.exec(s);if(pct)return Math.max(0,Math.min(dur,dur*Number(pct[1])/100));
 const num=/^-?\d+(?:\.\d+)?s?$/.test(s)?parseFloat(s):NaN;if(Number.isFinite(num))return Math.max(0,Math.min(dur,num));
 const words=scene.words??estimateWords(scene.say,dur);
 const norm=(w:string)=>w.toLowerCase().replace(/[^a-z0-9']/g,'');
 const target=s.split(/\s+/).map(norm).filter(Boolean);
 if(!target.length)return fallback;
 for(let i=0;i<words.length;i++){
  if(words[i]!.start<after-1e-3)continue;
  let ok=true;for(let k=0;k<target.length;k++){const w=words[i+k];if(!w||!norm(w.text).startsWith(target[k]!)){ok=false;break;}}
  if(ok)return words[i]!.start;
 }
 for(let i=0;i<words.length;i++)if(norm(words[i]!.text).startsWith(target[0]!))return words[i]!.start;
 return fallback;
}

/** Without real speech timing, assume ~2.7 words per second from a short lead-in. */
export function estimateWords(say:string,dur:number){
 const parts=say.split(/\s+/).filter(Boolean);const per=Math.min(0.37,(dur-0.3)/Math.max(1,parts.length));
 return parts.map((text,i)=>({text,start:0.15+i*per,end:0.15+(i+0.9)*per}));
}

export function sceneDuration(scene:Scene){
 if(scene.duration)return scene.duration;
 const n=scene.say.split(/\s+/).filter(Boolean).length;return Math.max(1.8,n/2.7+0.5);
}
