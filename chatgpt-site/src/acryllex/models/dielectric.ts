import * as THREE from 'three';
import {clamp} from '../kit.ts';
const unit=(v:THREE.Vector3,label:string)=>{if(!v.toArray().every(Number.isFinite)||v.lengthSq()<1e-20)throw new Error(label+' must be a finite nonzero vector');return v.clone().normalize();};
const index=(v:number,label:string)=>{if(!Number.isFinite(v)||v<=0)throw new Error(label+' must be a finite positive refractive index');return v;};

export interface RefractionResult {
 /** Unit normal points into the incident medium. Its sign is corrected without swapping the supplied indices. */
 normal:THREE.Vector3;
 reflected:THREE.Vector3;
 /** Null above the critical angle; there is then no transmitted ray. */
 transmitted:THREE.Vector3|null;
 totalInternalReflection:boolean;
 cosIncident:number;
 cosTransmitted:number;
}

/** Vector Snell law at a smooth dielectric boundary. Directions describe light travelling toward the boundary.
 * Indices always refer to incident/transmitted media, regardless of the normal's supplied sign.
 * https://openstax.org/books/university-physics-volume-3/pages/1-3-refraction
 * https://openstax.org/books/university-physics-volume-3/pages/1-4-total-internal-reflection
 */
export function refractDirection(direction:THREE.Vector3,normal:THREE.Vector3,nIncident:number,nTransmitted:number):RefractionResult{
 const d=unit(direction,'incident direction'),n=unit(normal,'surface normal'),eta=index(nIncident,'incident index')/index(nTransmitted,'transmitted index');
 if(d.dot(n)>0)n.negate();
 const cosIncident=clamp(-d.dot(n)),discriminant=1-eta*eta*(1-cosIncident*cosIncident),reflected=d.clone().addScaledVector(n,2*cosIncident).normalize();
 if(discriminant < -1e-12)return {normal:n,reflected,transmitted:null,totalInternalReflection:true,cosIncident,cosTransmitted:0};
 const cosTransmitted=Math.sqrt(Math.max(0,discriminant));
 const transmitted=d.clone().multiplyScalar(eta).addScaledVector(n,eta*cosIncident-cosTransmitted).normalize();
 return {normal:n,reflected,transmitted,totalInternalReflection:false,cosIncident,cosTransmitted};
}

/** Exact unpolarized Fresnel reflectance, including total internal reflection. */
export function dielectricFresnel(cosIncident:number,nIncident:number,nTransmitted:number){
 index(nIncident,'incident index');index(nTransmitted,'transmitted index');
 if(!Number.isFinite(cosIncident))throw new Error('Fresnel angle must be finite');
 if(nIncident===nTransmitted)return 0;
 const c=clamp(Math.abs(cosIncident)),eta=nIncident/nTransmitted,s2=eta*eta*(1-c*c);if(s2>=1)return 1;
 const ct=Math.sqrt(Math.max(0,1-s2)),rs=(nIncident*c-nTransmitted*ct)/(nIncident*c+nTransmitted*ct),rp=(nTransmitted*c-nIncident*ct)/(nTransmitted*c+nIncident*ct);
 return .5*(rs*rs+rp*rp);
}

export interface Vessel {
 height:number;radius:number;bottomRadius:number;wall:number;base:number;level:number;
 airIOR:number;glassIOR:number;waterIOR:number;
 rimRadius?:number;meniscusRadius?:number;
}
export interface Boundary {distance:number;point:THREE.Vector3;normal:THREE.Vector3;from:number;to:number;surface:'outer-wall'|'inner-wall'|'base'|'floor'|'rim'|'water';}

export function validateVessel(v:Vessel){
 for(const x of Object.values(v))if(x!==undefined&&(!Number.isFinite(x)||x<0))throw new Error('Vessel parameters must be finite and nonnegative');
 if(v.height<=0||v.radius<=0||v.bottomRadius<=0||v.wall<=0||v.wall>=Math.min(v.radius,v.bottomRadius)||v.base<=0||v.base>=v.height||v.level<v.base||v.level>=v.height)throw new Error('Invalid vessel geometry or water level');
 for(const k of ['airIOR','glassIOR','waterIOR'] as const)index(v[k],k);
 if((v.rimRadius??0)>v.wall*.5||(v.meniscusRadius??0)>v.wall)throw new Error('Vessel rounded interfaces exceed wall dimensions');
 return v;
}
const coneHeight=(v:Vessel)=>v.height-(v.rimRadius??0);
export function vesselWaterHeight(v:Vessel,r:number){
 const b=Math.min(v.meniscusRadius??0,Math.max(0,v.level-v.base)*.3),radius=v.bottomRadius+(v.radius-v.bottomRadius)*v.level/coneHeight(v)-v.wall;
 if(b<=0||r<radius-b)return v.level;const x=clamp(r-radius+b,0,b);return v.level+b-Math.sqrt(Math.max(0,b*b-x*x));
}
export function vesselMedium(v:Vessel,p:THREE.Vector3){
 const lip=v.rimRadius??0,r=Math.hypot(p.x,p.z);if(lip>0&&(r-v.radius+lip)**2+(p.y-v.height+lip)**2<=lip*lip)return v.glassIOR;
 if(p.y<0||p.y>coneHeight(v))return v.airIOR;
 const radius=v.bottomRadius+(v.radius-v.bottomRadius)*p.y/coneHeight(v);
 if(r>radius)return v.airIOR;
 if(p.y<v.base||r>radius-v.wall)return v.glassIOR;
 return p.y<vesselWaterHeight(v,r)&&v.level>v.base?v.waterIOR:v.airIOR;
}

/** Sphere tracing on an exact torus distance field, bounded to its box. */
export function torusIntersections(origin:THREE.Vector3,direction:THREE.Vector3,major:number,minor:number,y:number,lowerOuter=false){
 if(minor<=0)return [];
 let entry=0,exit=Infinity;const lo=[-major-minor,y-minor,-major-minor],hi=[major+minor,y+(lowerOuter?0:minor),major+minor],o=origin.toArray(),d=direction.toArray();
 for(let i=0;i<3;i++){
  if(Math.abs(d[i])<1e-14){if(o[i]<lo[i]||o[i]>hi[i])return [];}
  else {const a=(lo[i]-o[i])/d[i],b=(hi[i]-o[i])/d[i];entry=Math.max(entry,Math.min(a,b));exit=Math.min(exit,Math.max(a,b));}
 }
 if(entry>exit||exit<0)return [];
 const tolerance=minor*1e-6,roots:{distance:number;normal:THREE.Vector3}[]=[];let t=Math.max(tolerance*2,entry);
 for(let i=0;i<256&&t<=exit+tolerance;i++){
  t=Math.min(t,exit);
  const p=origin.clone().addScaledVector(direction,t),r=Math.hypot(p.x,p.z),x=r-major,dy=p.y-y,sd=Math.hypot(x,dy)-minor;
  if(Math.abs(sd)<tolerance){
   if((!lowerOuter||(r>=major&&p.y<=y+tolerance))&&(!roots.length||t-roots.at(-1)!.distance>tolerance*32))roots.push({distance:t,normal:new THREE.Vector3(p.x*x/Math.max(r,1e-12),dy,p.z*x/Math.max(r,1e-12)).normalize()});
   t+=tolerance*64;
  }else t+=Math.max(Math.abs(sd),tolerance);
 }
 return roots;
}

/** All forward intersections with a finite cone/frustum's side (constant radius is included). */
export function coneIntersections(origin:THREE.Vector3,direction:THREE.Vector3,radiusAtZero:number,slope:number,minY:number,maxY:number){
 const r=radiusAtZero+slope*origin.y,k=slope*direction.y,a=direction.x**2+direction.z**2-k*k,b=2*(origin.x*direction.x+origin.z*direction.z-r*k),c=origin.x**2+origin.z**2-r*r,roots:number[]=[];
 if(Math.abs(a)<1e-14){if(Math.abs(b)>1e-14)roots.push(-c/b);}
 else {const discriminant=b*b-4*a*c;if(discriminant>=0){const sq=Math.sqrt(discriminant),q=-.5*(b+(b<0?-sq:sq));if(Math.abs(q)>1e-15)roots.push(q/a,c/q);else roots.push(-b/(2*a));}}
 return roots.filter((t,i,a)=>Number.isFinite(t)&&t>0&&origin.y+direction.y*t>=minY-1e-10&&origin.y+direction.y*t<=maxY+1e-10&&a.findIndex(x=>Math.abs(x-t)<1e-10)===i).sort((a,b)=>a-b);
}

/** Closest actual change of medium. Both walls and all horizontal interfaces participate.
 * This traces the geometry, rather than moving an underwater object to a guessed apparent position.
 */
export function vesselBoundary(v:Vessel,origin:THREE.Vector3,direction:THREE.Vector3):Boundary|null{
 if(!origin.toArray().every(Number.isFinite))throw new Error('Ray origin must be finite');
 const d=unit(direction,'ray direction'),epsilon=v.height*1e-6,slope=(v.radius-v.bottomRadius)/coneHeight(v),candidates:{t:number;normal:THREE.Vector3;surface:Boundary['surface']}[]=[];
 for(const [r,y0,surface]of [[v.bottomRadius,0,'outer-wall'],[v.bottomRadius-v.wall,v.base,'inner-wall']] as const)for(const t of coneIntersections(origin,d,r,slope,y0,coneHeight(v))){
  const p=origin.clone().addScaledVector(d,t);candidates.push({t,normal:new THREE.Vector3(p.x,-slope*(r+slope*p.y),p.z).normalize(),surface});
 }
 if(Math.abs(d.y)>1e-12)for(const [y,surface]of [[0,'base'],[v.base,'floor'],[coneHeight(v),'rim'],[v.level,'water']] as const){
  const t=(y-origin.y)/d.y,p=origin.clone().addScaledVector(d,t),r=Math.hypot(p.x,p.z),outer=v.bottomRadius+slope*y;
  if(t>epsilon&&r<=outer&&(surface!=='water'||r<=outer-v.wall)&&(surface!=='rim'||r>=outer-v.wall))candidates.push({t,normal:new THREE.Vector3(0,1,0),surface});
 }
 const lip=v.rimRadius??0;if(lip>0)for(const hit of torusIntersections(origin,d,v.radius-lip,lip,v.height-lip))candidates.push({t:hit.distance,normal:hit.normal,surface:'rim'});
 const meniscus=Math.min(v.meniscusRadius??0,Math.max(0,v.level-v.base)*.3);if(meniscus>0)for(const hit of torusIntersections(origin,d,v.bottomRadius+slope*v.level-v.wall-meniscus,meniscus,v.level+meniscus,true))candidates.push({t:hit.distance,normal:hit.normal,surface:'water'});
 for(const hit of candidates.sort((a,b)=>a.t-b.t)){
  if(hit.t<=epsilon)continue;const point=origin.clone().addScaledVector(d,hit.t),before=vesselMedium(v,point.clone().addScaledVector(d,-epsilon)),after=vesselMedium(v,point.clone().addScaledVector(d,epsilon));
  if(before!==after)return {distance:hit.t,point,normal:hit.normal,from:before,to:after,surface:hit.surface};
 }
 return null;
}

/** Deterministic primary ray with Fresnel energy at every real interface. TIR stays inside the vessel. */
export function traceVessel(v:Vessel,origin:THREE.Vector3,direction:THREE.Vector3,maxInteractions=16){
 validateVessel(v);if(!Number.isInteger(maxInteractions)||maxInteractions<1||maxInteractions>64)throw new Error('Invalid optical interaction budget');
 if(!origin.toArray().every(Number.isFinite))throw new Error('Ray origin must be finite');
 const p=origin.clone(),d=unit(direction,'ray direction'),path:(Boundary&{reflectance:number;totalInternalReflection:boolean;outgoing:THREE.Vector3})[]=[];let transmission=1,radianceTransmission=1;
 for(let i=0;i<maxInteractions;i++){
  const hit=vesselBoundary(v,p,d);if(!hit)return {path,origin:p,direction:d,transmission,radianceTransmission,exhausted:false};
  const bend=refractDirection(d,hit.normal,hit.from,hit.to),reflectance=dielectricFresnel(bend.cosIncident,hit.from,hit.to),outgoing=bend.transmitted??bend.reflected;
  path.push({...hit,reflectance,totalInternalReflection:bend.totalInternalReflection,outgoing:outgoing.clone()});
  if(!bend.totalInternalReflection){transmission*=1-reflectance;radianceTransmission*=(1-reflectance)*(hit.from/hit.to)**2;}
  d.copy(outgoing);p.copy(hit.point).addScaledVector(d,v.height*3e-6);
 }
 return {path,origin:p,direction:d,transmission,radianceTransmission,exhausted:true};
}

