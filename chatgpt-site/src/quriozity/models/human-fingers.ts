/** Parent-relative captured finger rotations, composed after final hand IK. */
import type * as THREE from 'three';
import type {HumanRig} from './human-motion.ts';
import type {RecordedMotionSource} from './recorded-motion.ts';
export const FINGER_SIDES=['Left','Right'] as const;
export const FINGER_DIGITS=['Thumb','Index','Middle','Ring','Pinky'] as const;
type Side=typeof FINGER_SIDES[number];
const bare=(n:string)=>n.replace(/^mixamorig\d*:?/,'');
const finger=/^(Left|Right)Hand(Thumb|Index|Middle|Ring|Pinky)[123]$/;
export type FingerSample=Map<string,THREE.Quaternion>;
export interface FingerFrame {name:string;side:Side;index:number;basis:THREE.Quaternion;restLocal:THREE.Quaternion;longitudinal:THREE.Vector3;curlToward:THREE.Vector3;thumbOpposition:boolean}
/** The frame lives in the REST PARENT coordinates. X follows this phalanx; Y is its flexion hinge.
 * Thumb flexion/opposition uses its own ray toward the middle MCP, rather than a mirrored generic curl factor.
 * All three captured rotation components transfer; no source/target rest spread or length is copied.
 */
export function fingerFrames(rig:HumanRig,sides:readonly Side[]=FINGER_SIDES){
 const frames=new Map<string,FingerFrame>();
 for(const side of sides){
  if(!rig.has(side+'Hand')||!rig.has(side+'HandIndex1')||!rig.has(side+'HandPinky1')||!rig.has(side+'HandMiddle1'))continue;
  const wrist=rig.restPos(side+'Hand'),index=rig.restPos(side+'HandIndex1').clone().sub(wrist),pinky=rig.restPos(side+'HandPinky1').clone().sub(wrist),dorsal=index.cross(pinky).normalize().multiplyScalar(side==='Left'?1:-1);
  if(dorsal.lengthSq()<.99)continue;
  for(const digit of FINGER_DIGITS)for(let k=1;k<=3;k++){
   if(digit==='Thumb'&&!rig.has(side+'HandThumb1'))continue;
   const name=side+'Hand'+digit+k;if(!rig.has(name))continue;const id=rig.need(name),n=rig.nodes[id],child=rig.index.get(side+'Hand'+digit+(k+1));
   const x=(child===undefined?n.restP.clone().sub(rig.nodes[n.parent].restP):rig.nodes[child].restP.clone().sub(n.restP)).normalize();
   if(x.lengthSq()<.99)continue;
   let toward=digit==='Thumb'?rig.restPos(side+'HandMiddle1').clone().sub(rig.restPos(side+'HandThumb1')):dorsal.clone().negate();
   toward.addScaledVector(x,-toward.dot(x));if(toward.lengthSq()<1e-12)toward=dorsal.clone().negate().addScaledVector(x,dorsal.dot(x));if(toward.lengthSq()<1e-12)continue;toward.normalize();
   const y=x.clone().cross(toward).normalize(),z=x.clone().cross(y).normalize(),world=n.restQ.clone().setFromRotationMatrix(n.o.matrixWorld.clone().makeBasis(x,y,z)),parent=rig.nodes[n.parent];
   const basis=parent.restQ.clone().invert().multiply(world).normalize();
   frames.set(name,{name,side,index:id,basis,restLocal:n.restLocalQ.clone(),longitudinal:x,curlToward:toward,thumbOpposition:digit==='Thumb'});
  }
 }
 return frames;
}
export class CapturedFingerSource {
 readonly frames:ReturnType<typeof fingerFrames>;readonly trackedByAction=new Map<string,Set<string>>();
 readonly source:RecordedMotionSource;
 constructor(source:RecordedMotionSource){this.source=source;
  const animated=new Set<string>(),sides=new Set<Side>();
  for(const[name,a]of Object.entries(source.config.actions)){const tracked=new Set<string>();for(const b of source.bindings.get(a.clip)??[]){const n=bare(b.node.name);if(b.property==='quaternion'&&finger.test(n)){tracked.add(n);animated.add(n);sides.add(n.startsWith('Left')?'Left':'Right');}}this.trackedByAction.set(name,tracked);}
  // Unused, missing or degenerate rest frames must not break fingerless body captures.
  this.frames=animated.size?new Map([...fingerFrames(source.rig,[...sides])].filter(([name])=>animated.has(name))):new Map();
  for(const tracked of this.trackedByAction.values())for(const name of tracked)if(!this.frames.has(name))tracked.delete(name);
 }
 sample(name:string,time:number):FingerSample|null{
  const tracked=this.trackedByAction.get(name);if(!tracked?.size)return null;this.source.sample(name,time);const out:FingerSample=new Map();
  for(const name of tracked){const f=this.frames.get(name)!,local=this.source.rig.nodes[f.index].o.quaternion;
   const delta=local.clone().multiply(f.restLocal.clone().invert()),canonical=f.basis.clone().invert().multiply(delta).multiply(f.basis).normalize();out.set(name,canonical);
  }return out;
 }
}
export interface FingerApplyOptions {enabled?:boolean;explicitSceneCurl?:boolean;trackCurlSides?:ReadonlySet<Side>;curlPriority?:'authored'|'capture'}
/** Call after all trunk/arm/wrist/floor IK, before correctives + the SINGLE final rig.write().
 * Authored scene/per-hand curl stays authoritative unless capture priority is explicitly selected.
 * Missing captured endpoints blend with the existing per-joint legacy finger pose, not an invented typing motion.
 */
export function applyCapturedFingers(rig:HumanRig,frames:ReturnType<typeof fingerFrames>,a:FingerSample|null,b:FingerSample|null,k:number,options:FingerApplyOptions){
 if(options.enabled!==true||(options.curlPriority!=='capture'&&options.explicitSceneCurl)||(!a?.size&&!b?.size))return{applied:0,sides:[] as Side[]};
 if(!Number.isFinite(k)||k<0||k>1)throw Error('captured fingers: blend must be0..1');
 const active=FINGER_SIDES.filter(side=>(options.curlPriority==='capture'||!options.trackCurlSides?.has(side))&&[...frames.values()].some(f=>f.side===side&&((k<1&&a?.has(f.name))||(k>0&&b?.has(f.name)))));if(!active.length)return{applied:0,sides:[] as Side[]};
 rig.solve();const desired=new Map<number,THREE.Quaternion>();
 // Curl is side-wide. Preserve evaluated local poses even for joints whose rest
 // frame cannot be retargeted, before disabling that side's generic curl.
 for(let id=0;id<rig.nodes.length;id++){const n=rig.nodes[id];if(finger.test(n.name)&&active.some(side=>n.name.startsWith(side)))desired.set(id,rig.Q[n.parent].clone().invert().multiply(rig.Q[id]));}
 for(const f of frames.values())if(active.includes(f.side)){
  const baseline=desired.get(f.index)!;
  const endpoint=(s:FingerSample|null)=>{const q=s?.get(f.name);return q?f.basis.clone().multiply(q).multiply(f.basis.clone().invert()).multiply(f.restLocal).normalize():baseline.clone();};
  desired.set(f.index,endpoint(a).slerp(endpoint(b),k).normalize());
 }
 // Generic curl has already been evaluated into baseline. Disable its second application for captured sides.
 for(const side of active)rig.fingerCurl[side]=0;
 // HumanRig nodes are parent-first. Re-solve each phalanx so children compose on the FINAL new parent, never world-pinned.
 let applied=0;for(const[id,local]of [...desired].sort(([i],[j])=>i-j)){rig.solve();const n=rig.nodes[id],global=rig.Q[n.parent].clone().multiply(local);rig.set(id,global.multiply(n.restQ.clone().invert()));applied++;}
 rig.solve();return{applied,sides:active};
}
export function trackCurlSides(track:{keys:unknown[]}|undefined){const out=new Set<Side>();for(const k of track?.keys??[]){const v=k as Record<string,{curl?:unknown}>;for(const[side,key]of[['Left','handL'],['Right','handR']]as const)if(typeof v[key]?.curl==='number')out.add(side);}return out;}
