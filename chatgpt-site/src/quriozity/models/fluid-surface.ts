import * as THREE from 'three';

/** Editable procedural water, not a fluid solver. Parameters u/v are normalized. */
export type FluidSampler=(u:number,v:number,t:number,out:THREE.Vector3)=>void;
export type FluidColorSampler=(u:number,v:number,t:number,position:THREE.Vector3,out:THREE.Color)=>void;
export interface FluidSurfaceOptions {
 uSegments?:number;vSegments?:number;periodicU?:boolean;periodicV?:boolean;
 flipNormals?:boolean;thickness?:number;sample:FluidSampler;color?:FluidColorSampler;
 /** Optional independently shaped second boundary, joined to sample at every non-periodic rim. */
 backSample?:FluidSampler;
}
export interface FluidFrame {
 position:THREE.Vector3;normal:THREE.Vector3;
 /** Parameter derivatives, not unit vectors: world velocity = tangentU*du/dt + tangentV*dv/dt. */
 tangentU:THREE.Vector3;tangentV:THREE.Vector3;velocity:THREE.Vector3;bend:number;
}
export const createFluidFrame=():FluidFrame=>({position:new THREE.Vector3(),normal:new THREE.Vector3(),tangentU:new THREE.Vector3(),tangentV:new THREE.Vector3(),velocity:new THREE.Vector3(),bend:0});
const clamp01=(x:number)=>Math.max(0,Math.min(1,x));
const wrap01=(x:number)=>((x%1)+1)%1;
const finiteTime=(t:number)=>{if(!Number.isFinite(t))throw new Error('Fluid time must be finite');return t;};

/** Stable buffers, explicit seam handling, optional closed shell and absolute-time sampling. */
export class FluidSurface {
 readonly geometry:THREE.BufferGeometry;readonly uSegments:number;readonly vSegments:number;
 readonly periodicU:boolean;readonly periodicV:boolean;readonly thickness:number;readonly hasBackBoundary:boolean;
 readonly options:FluidSurfaceOptions;time=NaN;
 private front:THREE.BufferGeometry;private positions:Float32Array;private colors?:Float32Array;private bends:Float32Array;
 private rims:[number,number][]=[];private scratch=Array.from({length:9},()=>new THREE.Vector3());private color=new THREE.Color();
 constructor(options:FluidSurfaceOptions){
  this.options=options;this.uSegments=Math.max(2,Math.min(512,Math.round(options.uSegments??64)));this.vSegments=Math.max(2,Math.min(512,Math.round(options.vSegments??32)));
  this.periodicU=!!options.periodicU;this.periodicV=!!options.periodicV;this.thickness=Math.max(0,options.thickness??0);this.hasBackBoundary=!!options.backSample||this.thickness>0;
  const nu=this.uSegments+1,nv=this.vSegments+1,count=nu*nv,idx:number[]=[],uv=new Float32Array(count*2);this.positions=new Float32Array(count*3);this.bends=new Float32Array(count);
  for(let v=0;v<nv;v++)for(let u=0;u<nu;u++){const i=v*nu+u;uv[i*2]=u/this.uSegments;uv[i*2+1]=v/this.vSegments;}
  for(let v=0;v<this.vSegments;v++)for(let u=0;u<this.uSegments;u++){const a=v*nu+u,b=a+1,c=a+nu,d=c+1;idx.push(...(options.flipNormals?[a,c,b,b,c,d]:[a,b,c,b,d,c]));}
  this.front=new THREE.BufferGeometry();this.front.setAttribute('position',new THREE.BufferAttribute(this.positions,3));this.front.setAttribute('normal',new THREE.BufferAttribute(new Float32Array(count*3),3));this.front.setAttribute('uv',new THREE.BufferAttribute(uv,2));this.front.setAttribute('fluidBend',new THREE.BufferAttribute(this.bends,1));this.front.setIndex(idx);
  if(options.color){this.colors=new Float32Array(count*3);this.front.setAttribute('color',new THREE.BufferAttribute(this.colors,3));}
  if(!this.periodicV)for(let u=0;u<this.uSegments;u++){this.rims.push([u,u+1],[this.vSegments*nu+u+1,this.vSegments*nu+u]);}
  if(!this.periodicU)for(let v=0;v<this.vSegments;v++){this.rims.push([v*nu+this.uSegments,(v+1)*nu+this.uSegments],[(v+1)*nu,v*nu]);}
  if(options.flipNormals)this.rims=this.rims.map(([a,b])=>[b,a]);
  if(this.hasBackBoundary){
   const shellCount=count*2+this.rims.length*4,shellIdx=[...idx];for(let i=0;i<idx.length;i+=3)shellIdx.push(idx[i]!+count,idx[i+2]!+count,idx[i+1]!+count);
   this.rims.forEach((_,i)=>{const a=count*2+i*4;shellIdx.push(a,a+2,a+1,a+1,a+2,a+3);});
   this.geometry=new THREE.BufferGeometry();this.geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(shellCount*3),3));this.geometry.setAttribute('normal',new THREE.BufferAttribute(new Float32Array(shellCount*3),3));this.geometry.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(shellCount*2),2));this.geometry.setAttribute('fluidBend',new THREE.BufferAttribute(new Float32Array(shellCount),1));if(this.colors)this.geometry.setAttribute('color',new THREE.BufferAttribute(new Float32Array(shellCount*3),3));this.geometry.setIndex(shellIdx);
  }else this.geometry=this.front;
  this.update(0);
 }
 sample(u:number,v:number,t:number,out:THREE.Vector3){this.options.sample(this.periodicU?wrap01(u):clamp01(u),this.periodicV?wrap01(v):clamp01(v),finiteTime(t),out);return out;}
 private index(u:number,v:number){const us=this.uSegments,vs=this.vSegments;if(this.periodicU)u=((u%us)+us)%us;else u=Math.max(0,Math.min(us,u));if(this.periodicV)v=((v%vs)+vs)%vs;else v=Math.max(0,Math.min(vs,v));return v*(us+1)+u;}
 private mergeSeams(normals:Float32Array,offset=0){
  const nu=this.uSegments+1,nv=this.vSegments+1,merge=(a:number,b:number)=>{a+=offset;b+=offset;const x=normals[a*3]!+normals[b*3]!,y=normals[a*3+1]!+normals[b*3+1]!,z=normals[a*3+2]!+normals[b*3+2]!,l=Math.hypot(x,y,z)||1;normals[a*3]=normals[b*3]=x/l;normals[a*3+1]=normals[b*3+1]=y/l;normals[a*3+2]=normals[b*3+2]=z/l;};
  if(this.periodicU)for(let v=0;v<nv;v++)merge(v*nu,v*nu+this.uSegments);
  if(this.periodicV)for(let u=0;u<nu;u++)merge(u,this.vSegments*nu+u);
 }
 update(t:number){
  finiteTime(t);const nu=this.uSegments+1,nv=this.vSegments+1,p=this.scratch[0]!;
  for(let v=0;v<nv;v++)for(let u=0;u<nu;u++){const i=v*nu+u;this.sample(u/this.uSegments,v/this.vSegments,t,p);if(!Number.isFinite(p.x+p.y+p.z))throw new Error(`Non-finite fluid sample at ${u},${v}`);p.toArray(this.positions,i*3);if(this.colors&&this.options.color){this.options.color(u/this.uSegments,v/this.vSegments,t,p,this.color);this.color.toArray(this.colors,i*3);}}
  this.front.attributes.position!.needsUpdate=true;this.front.computeVertexNormals();const normal=this.front.attributes.normal!.array as Float32Array;this.mergeSeams(normal);this.front.attributes.normal!.needsUpdate=true;
  for(let v=0;v<nv;v++)for(let u=0;u<nu;u++){const i=v*nu+u,um=this.index(u-1,v),up=this.index(u+1,v),vm=this.index(u,v-1),vp=this.index(u,v+1);let bend=0;for(const[a,b]of[[um,up],[vm,vp]]){let dn=0,dp=0;for(let k=0;k<3;k++){dn+=(normal[a!*3+k]!-normal[b!*3+k]!)**2;dp+=(this.positions[a!*3+k]!-this.positions[b!*3+k]!)**2;}bend+=Math.sqrt(dn/Math.max(dp,1e-12));}this.bends[i]=bend*.5;}
  this.front.attributes.fluidBend!.needsUpdate=true;if(this.colors)this.front.attributes.color!.needsUpdate=true;
  if(this.hasBackBoundary){const count=nu*nv,pos=this.geometry.attributes.position!.array as Float32Array,uv=this.geometry.attributes.uv!.array as Float32Array,shellBend=this.geometry.attributes.fluidBend!.array as Float32Array,col=this.geometry.attributes.color?.array as Float32Array|undefined;
   for(let i=0;i<count;i++){const u=(i%nu)/this.uSegments,v=Math.floor(i/nu)/this.vSegments;if(this.options.backSample){this.options.backSample(this.periodicU?wrap01(u):u,this.periodicV?wrap01(v):v,t,p);if(!Number.isFinite(p.x+p.y+p.z))throw new Error(`Non-finite fluid back boundary at ${u},${v}`);}shellBend[i]=shellBend[i+count]=this.bends[i]!;for(let k=0;k<3;k++){pos[i*3+k]=this.positions[i*3+k]!;pos[(i+count)*3+k]=this.options.backSample?p.getComponent(k):this.positions[i*3+k]!-normal[i*3+k]!*this.thickness;if(col&&this.colors)col[i*3+k]=col[(i+count)*3+k]=this.colors[i*3+k]!;}uv[i*2]=uv[(i+count)*2]=u;uv[i*2+1]=uv[(i+count)*2+1]=v;}
   this.rims.forEach(([a,b],j)=>{const o=count*2+j*4;for(const[slot,source]of[[0,a],[1,b],[2,a+count],[3,b+count]]){shellBend[o+slot!]=shellBend[source!]!;for(let k=0;k<3;k++){pos[(o+slot!)*3+k]=pos[source!*3+k]!;if(col)col[(o+slot!)*3+k]=col[source!*3+k]!;}uv[(o+slot!)*2]=slot!%2;uv[(o+slot!)*2+1]=slot!<2?0:1;}});
   this.geometry.attributes.position!.needsUpdate=true;this.geometry.attributes.uv!.needsUpdate=true;if(col)this.geometry.attributes.color!.needsUpdate=true;this.geometry.attributes.fluidBend!.needsUpdate=true;this.geometry.computeVertexNormals();const shellNormal=this.geometry.attributes.normal!.array as Float32Array;this.mergeSeams(shellNormal);this.mergeSeams(shellNormal,count);this.geometry.attributes.normal!.needsUpdate=true;
  }
  this.geometry.computeBoundingBox();this.geometry.computeBoundingSphere();this.time=t;return this;
 }
 private cached(u:number,v:number,attribute:Float32Array,out:THREE.Vector3){
  u=this.periodicU?wrap01(u):clamp01(u);v=this.periodicV?wrap01(v):clamp01(v);const fu=u*this.uSegments,fv=v*this.vSegments,i=Math.min(this.uSegments-1,Math.floor(fu)),j=Math.min(this.vSegments-1,Math.floor(fv)),a=j*(this.uSegments+1)+i,b=a+1,c=a+this.uSegments+1,d=c+1,s=fu-i,r=fv-j;
  out.set(0,0,0);for(let k=0;k<3;k++)out.setComponent(k,(attribute[a*3+k]!*(1-s)+attribute[b*3+k]!*s)*(1-r)+(attribute[c*3+k]!*(1-s)+attribute[d*3+k]!*s)*r);return out;
 }
 frame(u:number,v:number,t:number,out=createFluidFrame()):FluidFrame {
  u=this.periodicU?wrap01(u):clamp01(u);v=this.periodicV?wrap01(v):clamp01(v);finiteTime(t);const eu=1/this.uSegments,ev=1/this.vSegments,um=this.periodicU?u-eu:Math.max(0,u-eu),up=this.periodicU?u+eu:Math.min(1,u+eu),vm=this.periodicV?v-ev:Math.max(0,v-ev),vp=this.periodicV?v+ev:Math.min(1,v+ev),p=this.scratch;
  const read=(a:number,b:number,d:THREE.Vector3)=>t===this.time?this.cached(a,b,this.positions,d):this.sample(a,b,t,d);
  read(u,v,out.position);read(um,v,p[1]!);read(up,v,p[2]!);read(u,vm,p[3]!);read(u,vp,p[4]!);out.tangentU.subVectors(p[2]!,p[1]!).divideScalar(up-um||1);out.tangentV.subVectors(p[4]!,p[3]!).divideScalar(vp-vm||1);out.normal.crossVectors(out.tangentU,out.tangentV).normalize();if(this.options.flipNormals)out.normal.negate();
  if(t===this.time){this.cached(u,v,this.front.attributes.normal!.array as Float32Array,out.normal).normalize();const fu=Math.round(u*this.uSegments),fv=Math.round(v*this.vSegments);out.bend=this.bends[this.index(fu,fv)]!;}
  else{let ku=0,kv=0;if(!this.periodicU&&(u<eu||u>1-eu)){const sign=u<eu?1:-1;this.sample(u+sign*eu,v,t,p[5]!);this.sample(u+sign*eu*2,v,t,p[6]!);p[7]!.copy(p[6]!).add(out.position).addScaledVector(p[5]!,-2);ku=Math.abs(p[7]!.dot(out.normal))/(eu*eu*Math.max(out.tangentU.lengthSq(),1e-12));}else{p[7]!.copy(p[1]!).add(p[2]!).addScaledVector(out.position,-2);ku=Math.abs(p[7]!.dot(out.normal))/(eu*eu*Math.max(out.tangentU.lengthSq(),1e-12));}if(!this.periodicV&&(v<ev||v>1-ev)){const sign=v<ev?1:-1;this.sample(u,v+sign*ev,t,p[5]!);this.sample(u,v+sign*ev*2,t,p[6]!);p[7]!.copy(p[6]!).add(out.position).addScaledVector(p[5]!,-2);kv=Math.abs(p[7]!.dot(out.normal))/(ev*ev*Math.max(out.tangentV.lengthSq(),1e-12));}else{p[7]!.copy(p[3]!).add(p[4]!).addScaledVector(out.position,-2);kv=Math.abs(p[7]!.dot(out.normal))/(ev*ev*Math.max(out.tangentV.lengthSq(),1e-12));}out.bend=(ku+kv)*.5;}
  const dt=1/120;this.sample(u,v,t-dt,p[5]!);this.sample(u,v,t+dt,p[6]!);out.velocity.subVectors(p[6]!,p[5]!).divideScalar(dt*2);return out;
 }
 dispose(){this.geometry.dispose();if(this.geometry!==this.front)this.front.dispose();}
}
export const createFluidSurface=(options:FluidSurfaceOptions)=>new FluidSurface(options);

export interface FluidControlGrid {points:readonly THREE.Vector3[];uCount:number;vCount:number;periodicU?:boolean;periodicV?:boolean}
/** points[v*uCount+u], uniform tensor Catmull-Rom. Periodic grids omit a duplicate seam row/column. */
export function controlGridFluidSampler(grid:FluidControlGrid):FluidSampler {
 if(grid.uCount<2||grid.vCount<2||grid.points.length!==grid.uCount*grid.vCount)throw new Error('Fluid control-grid dimensions do not match points');
 const cubic=(a:number,b:number,c:number,d:number,t:number)=>.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t);
 const at=(u:number,v:number)=>{const x=grid.periodicU?((u%grid.uCount)+grid.uCount)%grid.uCount:Math.max(0,Math.min(grid.uCount-1,u)),y=grid.periodicV?((v%grid.vCount)+grid.vCount)%grid.vCount:Math.max(0,Math.min(grid.vCount-1,v));return grid.points[y*grid.uCount+x]!;};
 return(u,v,_t,out)=>{const x=(grid.periodicU?wrap01(u):clamp01(u))*(grid.periodicU?grid.uCount:grid.uCount-1),y=(grid.periodicV?wrap01(v):clamp01(v))*(grid.periodicV?grid.vCount:grid.vCount-1),i=Math.floor(x),j=Math.floor(y),s=x-i,r=y-j;for(let k=0;k<3;k++){const a=[];for(let q=-1;q<=2;q++)a.push(cubic(at(i-1,j+q).getComponent(k),at(i,j+q).getComponent(k),at(i+1,j+q).getComponent(k),at(i+2,j+q).getComponent(k),s));out.setComponent(k,cubic(a[0]!,a[1]!,a[2]!,a[3]!,r));}};
}
export interface FluidSplineOptions {path:THREE.Curve<THREE.Vector3>;section:(u:number,v:number,t:number,out:THREE.Vector2)=>void;segments?:number;closed?:boolean}
/** Section x/y are offsets along the transported normal/binormal of the spline. */
export function splineFluidSampler(options:FluidSplineOptions):FluidSampler {
 const n=Math.max(8,Math.round(options.segments??128)),frames=options.path.computeFrenetFrames(n,!!options.closed),p=new THREE.Vector3(),a=new THREE.Vector3(),b=new THREE.Vector3(),cross=new THREE.Vector2();
 return(u,v,t,out)=>{u=options.closed?wrap01(u):clamp01(u);const f=u*n,i=Math.min(n-1,Math.floor(f)),k=f-i;options.path.getPointAt(u,p);a.copy(frames.normals[i]!).lerp(frames.normals[i+1]!,k).normalize();b.copy(frames.binormals[i]!).lerp(frames.binormals[i+1]!,k).normalize();options.section(u,v,t,cross);out.copy(p).addScaledVector(a,cross.x).addScaledVector(b,cross.y);};
}

export interface FluidFoamSeed {index:number;random:readonly number[]}
export interface FluidFoamOptions {
 surface:FluidSurface;count:number;seed:number;geometry?:THREE.BufferGeometry;material:THREE.Material|THREE.Material[];
 seedUV?:(seed:FluidFoamSeed,out:THREE.Vector2)=>void;flow?:(u:number,v:number,t:number,out:THREE.Vector2)=>void;
 /** speed is lifecycle rate; negative clamps to0. Flow/ballistics use physical birth-to-t age. */
 size?:number|[number,number];lifetime?:number|[number,number];speed?:number;spread?:number;normalOffset?:number;spray?:number;gravity?:number;
 wrapU?:boolean;wrapV?:boolean;bendThreshold?:number;integrationSteps?:number;emission?:(frame:FluidFrame,seed:FluidFoamSeed,t:number)=>number;
}
/** Deterministic UV-advection/ballistic droplets, evaluated from birth time rather than integrated across frames. */
export class FluidFoam {
 readonly mesh:THREE.InstancedMesh;readonly options:FluidFoamOptions;readonly seeds:FluidFoamSeed[];
 private ownsGeometry:boolean;private frame=createFluidFrame();private uv=new THREE.Vector2();private flow0=new THREE.Vector2();private flow1=new THREE.Vector2();private matrix=new THREE.Matrix4();private rotation=new THREE.Quaternion();private twist=new THREE.Quaternion();private scale=new THREE.Vector3();private position=new THREE.Vector3();private velocity=new THREE.Vector3();private up=new THREE.Vector3(0,1,0);
 constructor(options:FluidFoamOptions){if(!Number.isFinite(options.count)||!Number.isFinite(options.seed))throw new Error('Fluid foam count/seed must be finite');this.options=options;const count=Math.max(0,Math.round(options.count));this.ownsGeometry=!options.geometry;this.mesh=new THREE.InstancedMesh(options.geometry??new THREE.IcosahedronGeometry(1,0),options.material,Math.max(1,count));this.mesh.count=count;this.mesh.frustumCulled=false;let state=options.seed>>>0;const random=()=>{let x=state+=0x6d2b79f5;x=Math.imul(x^(x>>>15),x|1);x^=x+Math.imul(x^(x>>>7),x|61);return((x^(x>>>14))>>>0)/4294967296;};this.seeds=Array.from({length:count},(_,index)=>({index,random:Array.from({length:9},random)}));}
 update(t:number){finiteTime(t);const o=this.options,surface=o.surface;if(surface.time!==t)surface.update(t);const range=(v:number|[number,number]|undefined,f:number,r:number)=>Array.isArray(v)?v[0]+(v[1]-v[0])*r:v??f,wrapU=o.wrapU??surface.periodicU,wrapV=o.wrapV??surface.periodicV,rate=Math.max(0,o.speed??1);if(!Number.isFinite(rate))throw new Error('Fluid foam lifecycle rate must be finite');const flowAt=(u:number,v:number,clock:number,out:THREE.Vector2)=>{o.flow!(wrapU?wrap01(u):clamp01(u),wrapV?wrap01(v):clamp01(v),clock,out);if(!Number.isFinite(out.x+out.y))throw new Error('Non-finite fluid UV flow');};
  for(const seed of this.seeds){const r=seed.random,life=Math.max(.02,range(o.lifetime,1.5,r[0]!)),clockAge=wrap01((t*rate)/life+r[1]!)*life,age=rate>0?clockAge/rate:0,birth=t-age;if(o.seedUV)o.seedUV(seed,this.uv);else this.uv.set(r[2]!,r[3]!);let u=this.uv.x,v=this.uv.y;if(!Number.isFinite(u+v))throw new Error('Non-finite fluid foam seed UV');
   const spray=o.spray??0,steps=Math.max(1,Math.round(o.integrationSteps??6));if(o.flow&&spray<=0&&age>0){const dt=age/steps;for(let j=0;j<steps;j++){flowAt(u,v,birth+j*dt,this.flow0);flowAt(u+this.flow0.x*dt*.5,v+this.flow0.y*dt*.5,birth+(j+.5)*dt,this.flow1);u+=this.flow1.x*dt;v+=this.flow1.y*dt;}}
   const outside=(!wrapU&&(u<0||u>1))||(!wrapV&&(v<0||v>1));u=wrapU?wrap01(u):clamp01(u);v=wrapV?wrap01(v):clamp01(v);surface.frame(u,v,spray>0?birth:t,this.frame);
   const bendGate=o.bendThreshold?clamp01((this.frame.bend-o.bendThreshold)/Math.max(.01,o.bendThreshold)):1,emission=clamp01(o.emission?.(this.frame,seed,birth)??1),visible=!outside&&r[8]!<bendGate*emission;
   this.position.copy(this.frame.position);if(spray>0){if(o.flow)flowAt(u,v,birth,this.flow0);else this.flow0.set(0,0);this.velocity.copy(this.frame.velocity).addScaledVector(this.frame.tangentU,this.flow0.x).addScaledVector(this.frame.tangentV,this.flow0.y).addScaledVector(this.frame.normal,spray*(.65+.7*r[4]!));this.position.addScaledVector(this.velocity,age);this.position.y-=(o.gravity??9.81)*age*age*.5;}
   const spread=o.spread??0;if(spread){this.velocity.copy(this.frame.tangentU).normalize();this.position.addScaledVector(this.velocity,(r[5]!-.5)*spread);this.velocity.copy(this.frame.tangentV).normalize();this.position.addScaledVector(this.velocity,(r[6]!-.5)*spread);}
   this.position.addScaledVector(this.frame.normal,(o.normalOffset??.02)*(.5+r[7]!));const fade=Math.min(1,clockAge/(life*.1))*Math.min(1,(life-clockAge)/(life*.15)),size=visible?Math.max(0,range(o.size,.035,r[4]!))*fade:0;this.scale.set(size,size*(spray>0?1:.7),size);this.rotation.setFromUnitVectors(this.up,this.frame.normal);this.twist.setFromAxisAngle(this.up,r[5]!*Math.PI*2+age);this.rotation.multiply(this.twist);this.matrix.compose(this.position,this.rotation,this.scale);this.mesh.setMatrixAt(seed.index,this.matrix);
  }
  this.mesh.instanceMatrix.needsUpdate=true;return this;
 }
 dispose(){this.mesh.dispose();if(this.ownsGeometry)this.mesh.geometry.dispose();}
}
export const createFluidFoam=(options:FluidFoamOptions)=>new FluidFoam(options);
