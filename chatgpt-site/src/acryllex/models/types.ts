import * as THREE from 'three';
import type {MatOpts} from '../kit.ts';
import type {SceneTransmissionReceiver} from '../scene-transmission.ts';

export interface ModelCtx {
 /** New material in the scene hue (or opts.color). Every call returns its own material. */
 mat(opts?:MatOpts):THREE.MeshStandardMaterial;
 /** Mesh helper: geometry + material opts (+ optional name for controls). */
 mesh(geo:THREE.BufferGeometry,opts?:MatOpts,name?:string):THREE.Mesh;
 /** Resolve a hue name or hex to a colour (scene hue when omitted). */
 color(c?:string):THREE.Color;
 params:Record<string,unknown>;
 num(key:string,fallback:number,min?:number,max?:number):number;
 str<T extends string>(key:string,fallback:T,allowed?:readonly T[]):T;
 bool(key:string,fallback:boolean):boolean;
 seed:number;
}

export interface PoseState {from:string;to:string;k:number;time:number;/** metres travelled (for walk cycles) */travel:number;speed:number}

export interface Built {
 root:THREE.Object3D;
 /** Release instance-only animation/resource state; never cached asset templates. */
 dispose?():void;
 /** Per-frame update: control values (already eased) and scene-local time. */
 update?(controls:Record<string,number>,t:number,pose:PoseState):void;
 /** Model rests on the ground (y=0 is its bottom). Default true. Floating models are centred. */
 grounded?:boolean;
 /** Optional model-space points covering known pose extents for a steady automatic
  * camera fit. These do not alter the visible mesh or resize the camera per frame. */
 framingPoints?:readonly THREE.Vector3[];
 /** Optional same-frame surrounding scene colour/depth for optical materials. */
 sceneTransmission?:SceneTransmissionReceiver;
 /** Meshes whose material glow is driven by the `glow` control (default: all meshes with glow>0). */
 glowMeshes?:THREE.Mesh[];
 /** Named points in model space: `seat` (where a sitting person goes), `top` (surface to put things on), `screen`, `hand`. */
 anchors?:Record<string,[number,number,number]>;
 /** Facing (deg around Y) a person should take when sitting on/at this model's seat. */
 seatFacing?:number;
}

export interface ModelDef {
 id:string;
 /** One line: what the viewer sees. The generator reads this. */
 describe:string;
 /** Other ids the generator may use for this model. */
 aliases?:string[];
 params?:Record<string,string>;
 controls?:Record<string,string>;
 /** Control values before any event (default 1 for `glow` on glowing parts, else 0). */
 defaults?:Record<string,number>;
 poses?:string[];
 /** Approximate size in metres (display scale), informational. */
 size?:string;
 build(ctx:ModelCtx):Built;
}

export const defineModel=(def:ModelDef)=>def;
