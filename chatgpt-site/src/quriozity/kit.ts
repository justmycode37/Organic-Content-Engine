import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// ---------- maths ----------
export const clamp=(v:number,a=0,b=1)=>Math.max(a,Math.min(b,v));
export const lerp=(a:number,b:number,k:number)=>a+(b-a)*k;
export const smooth=(k:number)=>{k=clamp(k);return k*k*(3-2*k);};
export const ease={
 inOut:(k:number)=>{k=clamp(k);return k<0.5?4*k*k*k:1-Math.pow(-2*k+2,3)/2;},
 out:(k:number)=>1-Math.pow(1-clamp(k),3),
 in:(k:number)=>Math.pow(clamp(k),3),
 outExpo:(k:number)=>{k=clamp(k);return k>=1?1:1-Math.pow(2,-10*k);},
 outBack:(k:number)=>{k=clamp(k);const c1=1.70158,c3=c1+1;return 1+c3*Math.pow(k-1,3)+c1*Math.pow(k-1,2);},
 inOutSine:(k:number)=>-(Math.cos(Math.PI*clamp(k))-1)/2,
};
export const deg=(d:number)=>d*Math.PI/180;
export function hash1(n:number){const x=Math.sin(n*127.1+311.7)*43758.5453123;return x-Math.floor(x);}
export function rng(seed:number){let s=(Math.floor(seed)>>>0)||0x9e3779b9;return()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return s/4294967296;};}
export function seedOf(text:string){let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
/** Smooth 1D value noise in [-1,1]. */
export function noise1(x:number,seed=0){const i=Math.floor(x),f=x-i,u=f*f*(3-2*f);return lerp(hash1(i+seed*57.3),hash1(i+1+seed*57.3),u)*2-1;}

// ---------- materials ----------
export interface MatOpts {
 /** Brightness multiplier of the hue (0.2 dark .. 1 full). */
 tone?:number;
 /** Explicit colour (hex or hue name resolved by caller) instead of the scene hue. */
 color?:string|THREE.Color;
 /** Self-lit: rendered with a dot halo. 0 = off. Use a control to animate. */
 glow?:number;
 /** Control that scales the glow (default "glow"); value 0 = off, 1 = full. */
 glowControl?:string;
 flat?:boolean;
 side?:THREE.Side;
 /** Surface roughness for highlight shape (default 0.62). */
 rough?:number;
}

// ---------- geometry helpers (all return BufferGeometry) ----------
export const G={
 box:(w:number,h:number,d:number)=>new THREE.BoxGeometry(w,h,d),
 /** Box with bevelled edges; edges catch light and read as a real object. */
 rbox:(w:number,h:number,d:number,r=Math.min(w,h,d)*0.12,seg=3)=>{
  // Radius cannot inflate thin panels or change the requested external dimensions.
  return new RoundedBoxGeometry(w,h,d,Math.max(1,seg),Math.max(0,Math.min(r,w/2,h/2,d/2)));
 },
 sphere:(r:number,ws=32,hs=20)=>new THREE.SphereGeometry(r,ws,hs),
 ellipsoid:(rx:number,ry:number,rz:number,ws=32,hs=20)=>{const g=new THREE.SphereGeometry(1,ws,hs);g.scale(rx,ry,rz);return g;},
 cyl:(rt:number,rb:number,h:number,seg=32,open=false)=>new THREE.CylinderGeometry(rt,rb,h,seg,1,open),
 cone:(r:number,h:number,seg=32)=>new THREE.ConeGeometry(r,h,seg),
 capsule:(r:number,len:number,cap=8,seg=20)=>new THREE.CapsuleGeometry(r,len,cap,seg),
 torus:(R:number,r:number,rs=16,ts=48,arc=Math.PI*2)=>new THREE.TorusGeometry(R,r,rs,ts,arc),
 /** Revolve a profile of [radius, y] points around the Y axis. */
 lathe:(profile:[number,number][],seg=40)=>new THREE.LatheGeometry(profile.map(([r,y])=>new THREE.Vector2(Math.max(0,r),y)),seg),
 /** Extrude a 2D outline ([x,y] points, XY plane) by depth along Z, centred on z=0. */
 extrude:(outline:[number,number][],depth:number,bevel=0.0,holes:[number,number][][]=[])=>{
  const s=new THREE.Shape(outline.map(([x,y])=>new THREE.Vector2(x,y)));
  for(const h of holes)s.holes.push(new THREE.Path(h.map(([x,y])=>new THREE.Vector2(x,y))));
  const g=new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:bevel>0,bevelSize:bevel,bevelThickness:bevel,bevelSegments:2,curveSegments:16});g.translate(0,0,-depth/2);return g;
 },
 /** Tube along a smooth path through points. */
 tube:(points:[number,number,number][],r:number,seg=48,radial=10,closed=false)=>new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)),closed),seg,r,radial,closed),
 /** Tapered limb from (0,0,0) down to (0,-len,0). */
 limb:(r0:number,r1:number,len:number,seg=18)=>{
  const pts:[number,number][]=[];const n=10;
  for(let i=0;i<=n;i++){const a=-Math.PI/2+Math.PI/2*i/n;pts.push([r1*Math.cos(a),-len+r1*Math.sin(a)+r1*0]);}
  const body:[number,number][]=[];for(let i=0;i<=8;i++){const k=i/8;body.push([lerp(r1,r0,k)*(1+0.06*Math.sin(Math.PI*k)),-len+k*len]);}
  const top:[number,number][]=[];for(let i=1;i<=n;i++){const a=Math.PI/2*i/n;top.push([r0*Math.cos(a),r0*Math.sin(a)]);}
  return new THREE.LatheGeometry([...pts.slice(0,-1),...body,...top].map(([x,y])=>new THREE.Vector2(Math.max(0,x),y)),seg);
 },
 plane:(w:number,h:number,sx=1,sy=1)=>new THREE.PlaneGeometry(w,h,sx,sy),
 merge:(geos:THREE.BufferGeometry[])=>{const list=geos.map(g=>g.index?g.toNonIndexed():g);for(const g of list){for(const k of Object.keys(g.attributes))if(!['position','normal','uv'].includes(k))g.deleteAttribute(k);if(!g.attributes.uv)g.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(g.attributes.position!.count*2),2));}return mergeGeometries(list,false)!;},
};

/** Place a geometry: translate/rotate(deg)/scale in place and return it (for merging). */
export function at(g:THREE.BufferGeometry,pos:[number,number,number]=[0,0,0],rotDeg:[number,number,number]=[0,0,0],scale:number|[number,number,number]=1){
 const m=new THREE.Matrix4().compose(new THREE.Vector3(...pos),new THREE.Quaternion().setFromEuler(new THREE.Euler(deg(rotDeg[0]),deg(rotDeg[1]),deg(rotDeg[2]))),typeof scale==='number'?new THREE.Vector3(scale,scale,scale):new THREE.Vector3(...scale));
 g.applyMatrix4(m);return g;
}

/** Displace vertices along their normal by a smooth deterministic noise (organic surfaces, rocks, brains). */
export function roughen(g:THREE.BufferGeometry,amount:number,freq=3,seed=1){
 const p=g.attributes.position!,n=g.attributes.normal;if(!n)g.computeVertexNormals();
 const nn=g.attributes.normal!;const v=new THREE.Vector3();
 for(let i=0;i<p.count;i++){
  v.set(p.getX(i),p.getY(i),p.getZ(i));
  const d=(Math.sin(v.x*freq+seed)*Math.sin(v.y*freq*1.3+seed*2.1)*Math.sin(v.z*freq*0.9+seed*0.7)+0.5*Math.sin(v.x*freq*2.7+v.z*freq*2.1+seed))*amount;
  p.setXYZ(i,v.x+nn.getX(i)*d,v.y+nn.getY(i)*d,v.z+nn.getZ(i)*d);
 }
 p.needsUpdate=true;g.computeVertexNormals();return g;
}

/** Continuous camera-depth fading for environments, including self-lit surfaces. */
export function depthFade(material:THREE.MeshStandardMaterial,near=0,far=10,power=1){
 const uniforms={near:{value:near},far:{value:far},power:{value:power}};
 const original=material.onBeforeCompile,key=material.customProgramCacheKey();
 material.onBeforeCompile=(shader,renderer)=>{
  original.call(material,shader,renderer);
  Object.assign(shader.uniforms,{acxFadeNear:uniforms.near,acxFadeFar:uniforms.far,acxFadePower:uniforms.power});
  shader.vertexShader='varying float vAcxFadeDepth;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\n vAcxFadeDepth=-mvPosition.z;');
  shader.fragmentShader='varying float vAcxFadeDepth;uniform float acxFadeNear;uniform float acxFadeFar;uniform float acxFadePower;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','#include <opaque_fragment>\n gl_FragColor.rgb*=pow(1.-smoothstep(acxFadeNear,max(acxFadeNear+0.0001,acxFadeFar),vAcxFadeDepth),acxFadePower);');
 };
 material.customProgramCacheKey=()=>`acx-depth-fade-v1:${key}`;
 return uniforms;
}
