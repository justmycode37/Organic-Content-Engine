/**
 * ACRYLLEX reel spec: a curious explainer told as a sequence of 3D scenes.
 * Every object is a real 3D model rendered as ordered-dither dots in one hue per scene.
 * `at` values may be a narration word (the produce script resolves words to seconds),
 * a number of seconds from scene start, or a percentage string like "60%".
 */
export type Hue='blue'|'azure'|'red'|'white'|'amber'|'green'|'cyan'|'violet'|'orange'|'pink';
export type At=string|number;
export type Vec3=[number,number,number];

export type Enter='cut'|'materialize'|'wipe-up'|'wipe-left'|'wipe-right'|'assemble'|'pop'|'drop'|'slide-left'|'slide-right'|'rise'|'grow'|'walk-in-left'|'walk-in-right'|'from-black'|'light-up'|'none';
export type Exit='dissolve'|'shatter'|'shrink'|'slide-left'|'slide-right'|'fall'|'walk-out-left'|'walk-out-right'|'to-black'|'none';
/** One-shot object effects (see effects.ts). */
export type FxKind='heartbeat'|'shockwave'|'ripple'|'shake'|'recoil'|'glint'|'scan'|'charge'|'glitch';
/** Where a shock wave / ripple starts or where a hit comes from: a side of the object, or a direction from its centre (-1..1 per axis). */
export type FxFrom='top'|'bottom'|'left'|'right'|'front'|'back'|'center'|Vec3;
export type Idle='none'|'turn'|'spin'|'spin-slow'|'float'|'pulse'|'sway'|'wobble'|'orbit';

export interface ObjectKeyframe {
 at:number;
 pos?:Vec3;
 rot?:Vec3;
 scale?:number;
 /** Interpolation into this key. Rotations use unwrapped degrees for authored turns. */
 easing?:'linear'|'smooth'|'hold';
}

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
 /** Independent axis dimensions, applied in the object's local coordinates. */
 stretch?:Vec3;
 /** Absolute transform keys override events for keyed channels only. */
 keyframes?:ObjectKeyframe[];
 hue?:Hue;
 enter?:Enter;
 /** Wipe axes are world-aligned by default; local follows the object's authored orientation. */
 enterSpace?:'world'|'local';
 enterAt?:At;
 enterDur?:number;
 exit?:Exit;
 exitAt?:At;
 exitDur?:number;
 idle?:Idle;
 /** Initial control values (model specific, 0..1 unless documented). */
 controls?:Record<string,number>;
 /** Initial pose for posable models (human). */
 pose?:string;
 /** 'model' keeps authored geometry coordinates; 'center' positions recentered geometry at pos exactly. */
 origin?:'center'|'model';
 /** Exclude from automatic camera framing (e.g. a large floor or backdrop). */
 frame?:boolean;
 /** Explicit shadow-map participation; disabled maps leave authored shading and ambient occlusion. */
 castShadow?:boolean;
 receiveShadow?:boolean;
}

export interface SceneEvent {
 at:At;
 dur?:number;
 easing?:'linear'|'smooth'|'hold';
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
 /** One-shot effect on the target: heartbeat (pounds like a heart), shockwave (a bright wave runs over the surface as it absorbs a hit), ripple, shake, recoil, glint (light sweep), scan (scan line), charge (powers up and releases), glitch. `dur` is one run; `fxCount` repeats it. */
 fx?:FxKind;
 fxFrom?:FxFrom;
 /** Strength multiplier (default 1). */
 fxAmount?:number;
 fxCount?:number;
 /** Point-cloud morph of the target into another object of the scene (declare that object with enter:"none"). */
 morph?:string;
 /** How the morph looks: particles (swirling point cloud, default), blob (melts into a sphere that reshapes into the result), flip (card flip), fade (dissolves through darkness). */
 morphStyle?:'particles'|'blob'|'flip'|'fade';
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
 /** Explicit camera: position and look-at point in world metres (overrides automatic framing). */
 pos?:Vec3;
 look?:Vec3;
 /** Vertical field of view in degrees (default 36). */
 fov?:number;
 /** Tracking shot: camera travels with this object id. */
 follow?:string;
}

export type TextStyle='headline'|'highlight'|'tag'|'prefix'|'mono'|'number'|'label'|'plate';
export interface TextItem {
 text:string;
 style?:TextStyle;
 /** Word(s) inside the text drawn in a hue box. */
 highlight?:string;
 /** Hide a boxed word prefix after this scene-local time, retaining the suffix position. */
 prefixUntil?:At;
 at?:At;
 /** Numeric end may extend past the scene cut to time deletion; text remains scoped to its scene. */
 until?:At;
 /** Continue this text into following scenes until its explicit numeric end; default stays scene-scoped. */
 carry?:boolean;
 pos?:'top'|'upper'|'center'|'lower'|'bottom'|'left'|'right'|'top-left'|'top-right'|'bottom-left'|'bottom-right'|[number,number];
 size?:number;
 weight?:number;
 font?:'plex-mono'|'roboto-mono'|'oswald'|'roboto-condensed';
 widthScale?:number;
 /** Horizontal and vertical padding in font-size units for highlights and tags. */
 boxPadding?:[number,number];
 /** Offset highlight/tag backgrounds in font-size units without moving glyphs. */
 boxOffset?:[number,number];
 /** Optional text raster softness in output pixels. */
 softness?:number;
 hue?:Hue;
 /** Attach the label to an object (follows it on screen). */
 follow?:string;
 /** Alignment for tuple positions (fractions default to left). */
 align?:'left'|'center'|'right';
 /** Typing speed in characters per second (default ~13). */
 cps?:number;
 /** Step character-count keys in scene-local time, including spaces; overrides automatic typing and deletion. */
 reveal?:[At,number][];
 /** Absolute position (frame fractions) and zoom keys, with independent channels. */
 keyframes?:{at:At;pos?:[number,number];zoom?:number;easing?:'linear'|'smooth'|'hold'}[];
 /** Draw the letters in the scene hue instead of grey. */
 tint?:boolean;
 /** Black plate behind the line (text over busy backgrounds). */
 plate?:boolean;
 /** Step zoom keyframes [[at, scale], ...] (snaps with a small overshoot). */
 zoom?:[At,number][];
 /** Keep the visual centre fixed as the font grows. Default anchors the baseline. */
 zoomAnchor?:'baseline'|'center';
 /** Extra dither-glitch moments; glitchWord limits the glitch to one word. */
 glitch?:At[];
 /** Optional glitch cell pitch in output pixels, independent of text zoom. */
 glitchCell?:number;
 /** Include the highlight/tag padding in the glitch envelope. */
 glitchBox?:boolean;
 glitchWord?:string;
 /** Glitch as the line lands (default: boxed/highlighted text only). */
 glitchOnLand?:boolean;
 /** Hide the typing cursor. */
 cursor?:boolean;
 /** Cursor width relative to font size (default .03). */
 cursorWidth?:number;
 cursorLead?:number;
 cursorHold?:boolean;
 cursorPeriod?:number;
 cursorPhase?:number;
 /** false keeps the text on screen until the cut instead of deleting it. */
 erase?:boolean;
 /** Seconds used to delete the line immediately before until. */
 eraseDur?:number;
}

/** Post-lighting controls; exposure changes dot coverage, ink changes brightness. */
export interface LightKeyframe {
 at:number;
 exposure?:number;contrast?:number;gamma?:number;inkLo?:number;ink?:number;blackPoint?:number;whitePoint?:number;softness?:number;
 easing?:'linear'|'smooth'|'hold';
}

export interface Scene {
 say:string;
 hue?:Hue;
 duration?:number;
 /** Optional global frame clock for geometry, camera and lighting; text keeps its original timing. */
 motionFPS?:number;
 /** Global clock phase in seconds (default 0). */
 motionPhase?:number;
 camera?:CameraMove;
 /** Post ink grid: cell is output px (1..24), roundness 0..1, softness output px (0..2).
  * Defaults to the engine's original format.cell / look; source render resolution is unchanged.
  * activity (0..1, default 0) reshuffles threshold cells locally; activityRate (1..60 Hz, default 18)
  * uses global output time independently of motionFPS. Geometry, ink and uniform-tile density stay fixed.
  * Direct transitions use the selected incoming scene's grid for both images, as with lighting. */
 raster?:{cell?:number;dotRoundness?:number;dotSoftness?:number;activity?:number;activityRate?:number};
 objects:SceneObject[];
 events?:SceneEvent[];
 text?:TextItem[];
 /** Into this scene. wipe, push-right and glitch mix the two scenes; black/blink close the last scene to black and open this one from black. */
 transition?:'cut'|'wipe'|'flash'|'push-right'|'glitch'|'black'|'blink';
 /** Transition length in seconds (default 0.4; through-black 0.8, split across the cut). */
 transitionDur?:number;
 /** Light rig for this scene: key direction (camera space, x right y up z toward viewer) and levels. */
 light?:{dir?:Vec3;key?:number;fill?:number;rim?:number;ambient?:number;contrast?:number;blackPoint?:number;whitePoint?:number;inkLo?:number;gamma?:number;exposure?:number;ink?:number;softness?:number;noise?:number;noiseReference?:number;
  /** Local lights in world coordinates; intensity uses the same PI scaling as the directional rig. */
  points?:{pos:Vec3;intensity:number;distance?:number;decay?:number;active?:[number,number];fade?:number}[];
  keyframes?:LightKeyframe[]};
 /** Ambient-occlusion strength (default 1.4) and radius in metres (default 6% of the scene size). */
 ao?:number;
 aoRadius?:number;
 /** Override the renderer's occlusion kernel for this scene. */
 aoMethod?:'plane'|'legacy';
 /** Optional ground plane drawn as sparse dots. */
 ground?:boolean;
 /** Filled in by the producer: spoken word timings relative to scene start. */
 words?:{text:string;start:number;end:number}[];
}

export interface AcryllexSpec {
 version:1;
 series:'ACRYLLEX';
 /** Shared recording calibration; custom/legacy specs omit it. Geometry and motion remain independent. */
 style?:'reference-recording';
 title:string;
 musicBrief?:string;
 captions?:boolean;
 /** Music beat grid (seconds), for edit/audio timing only. Never pulses geometry, camera or brightness. */
 beat?:{period:number;phase:number;from?:number};
 scenes:Scene[];
 /** Output size and dot pitch; default 1080x1920 portrait, 4 px dots. */
 format?:{width?:number;height?:number;cell?:number;textScale?:number};
 /** Renderer calibration: dither gamma/noise/gap(px)/ink brightness/silhouette fuzz and light levels. */
 look?:{inkMode?:'fixed'|'shaded';textColor?:string;palette?:Partial<Record<Hue,string>>;contrast?:number;blackPoint?:number;whitePoint?:number;inkLo?:number;shadows?:number;ao?:number;aoMethod?:'plane'|'legacy';gamma?:number;noise?:number;noiseReference?:number;gap?:number;ink?:number;fuzz?:number;dotRoundness?:number;dotSoftness?:number;key?:number;fill?:number;rim?:number;ambient?:number;dir?:number[]};
}

export const HUES:Record<Hue,string>={
 blue:'#3f32f5',azure:'#2c6ce8',red:'#d4174a',white:'#cdcdcd',amber:'#ffb21f',green:'#22e07a',cyan:'#25d4ff',violet:'#9d4bff',orange:'#ff6a1f',pink:'#ff4fb8',
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
