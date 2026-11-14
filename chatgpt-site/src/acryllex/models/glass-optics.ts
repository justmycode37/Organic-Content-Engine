import * as THREE from 'three';
import {clamp,deg} from '../kit.ts';
import {defineModel} from './types.ts';
import {validateVessel,type Vessel} from './dielectric.ts';
import {SCENE_TRANSMISSION_GLSL,type SceneTransmissionInput} from '../scene-transmission.ts';

const emitterIntegrals=new Map<string,number>();
/** Cosine-weighted solid angle of a neutral finite emitter. Shape changes do not
 * invent extra incident energy: the existing scene-light irradiance is retained. */
function emitterIntegral(elevation:number,width:number,height:number){
 const key=[elevation.toFixed(3),width,height].join(':');let integral=emitterIntegrals.get(key);if(integral!==undefined)return integral;
 const ce=Math.cos(elevation),se=Math.sin(elevation),da=Math.PI*2/128,de=Math.PI/128;integral=0;
 for(let y=0;y<128;y++){const e=-Math.PI/2+(y+.5)*de,c=Math.cos(e),s=Math.sin(e),v=Math.exp(-Math.pow(Math.abs(e-elevation)/height,8));
  for(let x=0;x<128;x++){const a=-Math.PI+(x+.5)*da;integral+=Math.exp(-a*a/width)*v*Math.max(0,c*ce*Math.cos(a)+s*se)*c*da*de;}
 }
 if(emitterIntegrals.size>=256)emitterIntegrals.delete(emitterIntegrals.keys().next().value!);emitterIntegrals.set(key,integral);return integral;
}

/** Analytic ray/volume optics. Light directions/intensities come from the existing
 * scene rig. The neutral finite emitters are visible in reflection only; they do
 * not introduce a sky/background or replace the shared post-render ink response.
 */
const TRACE=SCENE_TRANSMISSION_GLSL+`
varying vec3 vgLocal;
uniform vec3 vgCamera;uniform mat4 vgViewToLocal;uniform mat4 vgLocalToView;uniform mat4 vgLocalToClip;
uniform vec3 vgStrawA;uniform vec3 vgStrawB;
uniform vec3 vgEmitterDirections[8];uniform vec3 vgEmitterIrradiance[8];uniform float vgEmitterWidths[8];uniform float vgEmitterHeights[8];uniform float vgEmitterIntegrals[8];uniform int vgEmitterCount;
uniform float vgH,vgR0,vgR1,vgWall,vgBase,vgLevel,vgAir,vgGlass,vgWater,vgStrawRadius,vgStrawOn,vgScale,vgDebug,vgSceneRange;
float vgMax(vec3 c){return max(c.x,max(c.y,c.z));}
float vgLip(){return vgWall*.5;}
float vgRadius(float y){return mix(vgR0,vgR1,y/(vgH-vgLip()));}
float vgMeniscus(){return min(vgWall*.5,max(0.,vgLevel-vgBase)*.3);}
float vgWaterHeight(float r){
 float b=vgMeniscus(),radius=vgRadius(vgLevel)-vgWall;if(b<1e-9||r<radius-b)return vgLevel;
 float x=clamp(r-(radius-b),0.,b);return vgLevel+b-sqrt(max(0.,b*b-x*x));
}
float vgMedium(vec3 p){
 float lip=vgLip(),rr=length(p.xz)-(vgR1-lip),yy=p.y-(vgH-lip);
 if(rr*rr+yy*yy<=lip*lip)return vgGlass;
 if(p.y<0.||p.y>vgH-lip)return vgAir;
 float r=length(p.xz),outer=vgRadius(p.y);if(r>outer)return vgAir;
 if(p.y<vgBase||r>outer-vgWall)return vgGlass;
 return p.y<vgWaterHeight(r)&&vgLevel>vgBase?vgWater:vgAir;
}
// Single-precision GPU roots need a wider separation than the double-precision CPU trace.
// This remains far below a raster cell and the thinnest permitted glass wall.
float vgEps(){return vgH*.00002;}
void vgAccept(vec3 o,vec3 d,float t,vec3 n,inout float best,inout vec3 normal){
 if(t<=vgEps()||t>=best)return;
 vec3 p=o+d*t;float a=vgMedium(p-d*vgEps()),b=vgMedium(p+d*vgEps());
 if(abs(a-b)>.000001){best=t;normal=normalize(n);}
}
void vgConeRoot(vec3 o,vec3 d,float t,float r0,float slope,float y0,inout float best,inout vec3 normal){
 vec3 p=o+d*t;if(p.y<y0||p.y>vgH-vgLip())return;
 vgAccept(o,d,t,vec3(p.x,-slope*(r0+slope*p.y),p.z),best,normal);
}
void vgCone(vec3 o,vec3 d,float r0,float y0,inout float best,inout vec3 normal){
 float slope=(vgR1-vgR0)/(vgH-vgLip()),r=r0+slope*o.y,k=slope*d.y;
 float a=dot(d.xz,d.xz)-k*k,b=2.*(dot(o.xz,d.xz)-r*k),c=dot(o.xz,o.xz)-r*r;
 if(abs(a)<1e-9){if(abs(b)>1e-9)vgConeRoot(o,d,-c/b,r0,slope,y0,best,normal);return;}
 float disc=b*b-4.*a*c;if(disc<0.)return;float sq=sqrt(max(0.,disc));
 float q=-.5*(b+(b<0.?-sq:sq));
 if(abs(q)>1e-12){vgConeRoot(o,d,q/a,r0,slope,y0,best,normal);vgConeRoot(o,d,c/q,r0,slope,y0,best,normal);}
 else vgConeRoot(o,d,-b/(2.*a),r0,slope,y0,best,normal);
}
void vgPlane(vec3 o,vec3 d,float y,int kind,inout float best,inout vec3 normal){
 if(abs(d.y)<1e-9)return;float t=(y-o.y)/d.y;vec3 p=o+d*t;float r=length(p.xz),outer=vgRadius(y);
 if(r>outer||(kind==1&&r>outer-vgWall)||(kind==2&&r<outer-vgWall))return;
 vgAccept(o,d,t,vec3(0,1,0),best,normal);
}
void vgTorus(vec3 o,vec3 d,float major,float minor,float y,int kind,inout float best,inout vec3 normal){
 if(minor<1e-9)return;vec3 lo=vec3(-major-minor,y-minor,-major-minor),hi=vec3(major+minor,y+(kind==1?0.:minor),major+minor);
 float entry=0.,exit=best;
 for(int j=0;j<3;j++){
  if(abs(d[j])<1e-9){if(o[j]<lo[j]||o[j]>hi[j])return;}
  else {float a=(lo[j]-o[j])/d[j],b=(hi[j]-o[j])/d[j];entry=max(entry,min(a,b));exit=min(exit,max(a,b));}
 }
 if(entry>exit||exit<vgEps())return;float t=max(vgEps()*2.,entry);
 for(int j=0;j<32;j++){
  if(t>exit+vgEps()*.2||t>=best)break;t=min(t,exit);vec3 p=o+d*t;float r=length(p.xz),x=r-major,dy=p.y-y,sdf=length(vec2(x,dy))-minor;
  if(abs(sdf)<vgEps()*.2){
   if(kind==0||(r>=major&&p.y<=y+vgEps())){
    vec3 n=vec3(p.x*x/max(r,1e-9),dy,p.z*x/max(r,1e-9));float before=best;vgAccept(o,d,t,n,best,normal);if(best<before)break;
   }
   t+=vgEps()*4.;
  }else t+=max(abs(sdf),vgEps()*.25);
 }
}
float vgBoundary(vec3 o,vec3 d,out vec3 normal){
 float best=1e10;normal=vec3(0,1,0);
 vgCone(o,d,vgR0,0.,best,normal);vgCone(o,d,vgR0-vgWall,vgBase,best,normal);
 vgPlane(o,d,0.,0,best,normal);vgPlane(o,d,vgBase,1,best,normal);vgPlane(o,d,vgH-vgLip(),2,best,normal);vgPlane(o,d,vgLevel,1,best,normal);
 vgTorus(o,d,vgR1-vgLip(),vgLip(),vgH-vgLip(),0,best,normal);
 float b=vgMeniscus();vgTorus(o,d,vgRadius(vgLevel)-vgWall-b,b,vgLevel+b,1,best,normal);
 return best;
}
void vgStrawRoot(vec3 o,vec3 d,vec3 axis,float length,float t,float radius,inout float best,inout vec3 normal){
 if(t<=vgEps()||t>=best)return;vec3 p=o+d*t,relative=p-vgStrawA;float y=dot(relative,axis);
 if(y>=0.&&y<=length){best=t;normal=normalize(relative-axis*y);if(radius<vgStrawRadius*.9)normal=-normal;}
}
float vgStraw(vec3 o,vec3 d,out vec3 normal){
 float best=1e10;normal=vec3(0,1,0);if(vgStrawOn<.5)return best;
 vec3 delta=vgStrawB-vgStrawA;float len=length(delta);vec3 axis=delta/len,relative=o-vgStrawA;
 vec3 a=relative-axis*dot(relative,axis),b=d-axis*dot(d,axis);float aa=dot(b,b),bb=2.*dot(a,b);
 if(aa>1e-9)for(int i=0;i<2;i++){
  float r=vgStrawRadius*(i==0?1.:.84),cc=dot(a,a)-r*r,disc=bb*bb-4.*aa*cc;
  if(disc<0.)continue;float sq=sqrt(max(0.,disc));vgStrawRoot(o,d,axis,len,(-bb-sq)/(2.*aa),r,best,normal);vgStrawRoot(o,d,axis,len,(-bb+sq)/(2.*aa),r,best,normal);
 }
 float den=dot(d,axis);if(abs(den)>1e-9)for(int i=0;i<2;i++){
  float y=i==0?0.:len,t=(y-dot(relative,axis))/den;vec3 q=relative+d*t-axis*y;float r=length(q);
  if(t>vgEps()&&t<best&&r<=vgStrawRadius&&r>=vgStrawRadius*.84){best=t;normal=i==0?-axis:axis;}
 }
 return best;
}
float vgFresnel(float c,float a,float b){
 if(abs(a-b)<.000001)return 0.;float eta=a/b,s2=eta*eta*(1.-c*c);if(s2>=1.)return 1.;
 float ct=sqrt(max(0.,1.-s2)),rs=(a*c-b*ct)/(a*c+b*ct),rp=(b*c-a*ct)/(b*c+a*ct);return .5*(rs*rs+rp*rp);
}
vec3 vgLightDir(vec3 d){return normalize(mat3(vgViewToLocal)*d);}
float vgScene(vec3 o,vec3 d,float range,out vec3 colour){
 return stTrace((vgLocalToView*vec4(o,1.)).xyz,mat3(vgLocalToView)*d,min(range,vgSceneRange),colour);
}
float vgEnvironment(vec3 d){
 d=normalize(mat3(vgLocalToView)*d);
 float value=vgMax(ambientLightColor)*.025/3.14159265;
 for(int i=0;i<8;i++){
  if(i>=vgEmitterCount)break;vec3 light=vgEmitterDirections[i];float width=vgEmitterWidths[i];
  float azimuth=acos(clamp(dot(normalize(d.xz+vec2(.0000001)),normalize(light.xz)),-1.,1.));
  float elevation=asin(clamp(d.y,-1.,1.))-asin(clamp(light.y,-1.,1.));
  // Vertical key/rear strips describe the walls; the broad low fill softbox is
  // visible in the curved lip and wetting meniscus. All retain the rig's energy.
  value+=vgMax(vgEmitterIrradiance[i])/max(vgEmitterIntegrals[i],1e-6)*exp(-azimuth*azimuth/width)*exp(-pow(abs(elevation)/vgEmitterHeights[i],8.));
 }
 return value;
}
float vgShade(vec3 p,vec3 n,vec3 view){
 float value=vgMax(ambientLightColor)/3.14159265;
 #if NUM_DIR_LIGHTS > 0
 for(int i=0;i<NUM_DIR_LIGHTS;i++){
  vec3 l=vgLightDir(directionalLights[i].direction),h=normalize(l+view);
  value+=vgMax(directionalLights[i].color)/3.14159265*(max(0.,dot(n,l))+.1*pow(max(0.,dot(n,h)),32.));
 }
 #endif
 #if NUM_POINT_LIGHTS > 0
 for(int i=0;i<NUM_POINT_LIGHTS;i++){
  vec3 l=(vgViewToLocal*vec4(pointLights[i].position,1.)).xyz-p;float distance=length(l)*vgScale;
  value+=vgMax(pointLights[i].color)/3.14159265*getDistanceAttenuation(distance,pointLights[i].distance,pointLights[i].decay)*max(0.,dot(n,normalize(l)));
 }
 #endif
 return .92*value;
}
float vgTrace(vec3 origin,vec3 direction,out float first){
 vec3 origins[8],directions[8];float weights[8];int depths[8];int count=1,head=0,tail=1;
 origins[0]=origin;directions[0]=direction;weights[0]=1.;depths[0]=0;float result=0.;first=1e10;
 for(int task=0;task<24;task++){
  if(count<=0)break;int slot=head;head=(head+1)%8;count--;vec3 o=origins[slot],d=directions[slot];float weight=weights[slot];int depth=depths[slot];bool reflectedPath=task>0;
  for(int step=0;step<16;step++){
   vec3 n,sn;float boundary=vgBoundary(o,d,n),straw=vgStraw(o,d,sn),distance=min(boundary,straw);
   if(task==0&&step==0)first=distance;
   if((step>0||task>0)&&(vgDebug<.5||vgDebug>5.5)){
    vec3 sceneColour;float sceneDistance=vgScene(o,d,distance,sceneColour);
    if(sceneDistance<distance){if(vgDebug>5.5){if(task==0)result=1.;}else result+=weight*vgMax(sceneColour);break;}
   }
   if(distance>1e9){if(reflectedPath&&vgDebug<4.5)result+=weight*vgEnvironment(d);break;}
   vec3 p=o+d*distance;
   if(straw<boundary){if(vgDebug>4.5){if(task==0)result=1.;}else result+=weight*vgShade(p,sn,-d);break;}
   float a=vgMedium(p-d*vgEps()),b=vgMedium(p+d*vgEps());if(dot(n,d)>0.)n=-n;
   float c=clamp(-dot(n,d),0.,1.),reflectance=vgFresnel(c,a,b);vec3 reflected=reflect(d,n),transmitted=refract(d,n,a/b);
   if(dot(transmitted,transmitted)<.1){reflectedPath=true;d=reflected;o=p+d*vgEps()*3.;continue;}
   // The external convex wall sees the studio directly. Reserve the bounded queue
   // for internal reflection paths, so small internal branches cannot starve that highlight.
   bool externalWall=abs(a-vgAir)<.000001&&p.y<vgH-vgLip()&&length(p.xz)>vgRadius(p.y)-vgWall*.1;
   if(vgDebug<4.5){if(externalWall){vec3 reflectedColour;float reflectedDistance=vgScene(p+reflected*vgEps()*3.,reflected,vgSceneRange,reflectedColour);result+=weight*reflectance*(reflectedDistance<1e9?vgMax(reflectedColour):vgEnvironment(reflected));}
    else if(reflectance*weight>.002&&depth<2&&count<8){origins[tail]=p+reflected*vgEps()*3.;directions[tail]=reflected;weights[tail]=weight*reflectance;depths[tail]=depth+1;tail=(tail+1)%8;count++;}}
   weight*=(1.-reflectance)*(a*a)/(b*b);if(weight<.001&&vgDebug<4.5)break;d=normalize(transmitted);o=p+d*vgEps()*3.;
  }
 }
 return result;
}
`;

export const glassOptics=defineModel({
 id:'glass-optics',aliases:['dielectric-glass','ray-glass'],
 describe:'An optical drinking-glass study: rays cross actual tapered inner/outer walls, floor, water surface and a physically straight hollow straw. Curved-wall refraction, Fresnel reflection and total internal reflection use bounded secondary paths. Same-frame scene colour/depth supplies visible surrounding or submerged surfaces; hidden/offscreen surfaces and other optical volumes are absent from that screen-space representation. Uses the existing scene lights and shared pixel/ink response. No automatic bobbing, ripples, beat pulses or camera moves.',
 params:{height:'metres, default .145',radius:'rim radius, default .041',taper:'bottom/rim ratio, default .88',wall:'wall metres, default .0017',base:'floor height metres, default .0065',fill:'0..1 initial fill, default .64',straw:'include straight hollow straw, default true',strawTilt:'degrees from vertical, default18',strawYaw:'tilt azimuth degrees, default0',glassIOR:'default1.52',waterIOR:'default1.333',airIOR:'default1.0003',sceneTransmission:'false (default) keeps the self-contained study; true refracts surrounding/submerged first-layer in-view surfaces; hidden/offscreen surfaces and other optical volumes remain unsupported'},
 controls:{fill:'0 empty ..1 near rim, continuous water level',strawTilt:'rigid straw degrees from vertical; values must clear the actual vessel walls',strawYaw:'rigid straw tilt azimuth degrees; physically straight at every pose'},size:'.082 m diameter, .145 m vessel height',
 build(ctx){
  const height=ctx.num('height',.145,.04,2),radius=ctx.num('radius',.041,height*.14,height*.6),wall=ctx.num('wall',.0017,radius*.015,radius*.12),base=ctx.num('base',height*.045,wall*1.2,height*.14),initial=ctx.num('fill',.64,0,1);
  const v:Vessel=validateVessel({height,radius,bottomRadius:radius*ctx.num('taper',.88,.65,1.1),wall,base,level:base+(height-wall*1.5-base)*initial,airIOR:ctx.num('airIOR',1.0003,.1,5),glassIOR:ctx.num('glassIOR',1.52,.1,5),waterIOR:ctx.num('waterIOR',1.333,.1,5),rimRadius:wall*.5,meniscusRadius:wall*.5});
  const strawRadius=ctx.num('strawRadius',.0027,radius*.025,radius*.12),initialTilt=ctx.num('strawTilt',18,-28,28),initialYaw=ctx.num('strawYaw',0,-360,360),angle=deg(initialTilt),yaw=deg(initialYaw),length=ctx.num('strawLength',height*1.58,height*.9,height*2.5),direction=new THREE.Vector3(Math.sin(angle)*Math.cos(yaw),Math.cos(angle),Math.sin(angle)*Math.sin(yaw)),a=new THREE.Vector3(-direction.x*height*.62,base+strawRadius*1.5,-direction.z*height*.62),b=a.clone().addScaledVector(direction,length),straw=ctx.bool('straw',true);
  const crossing=a.clone().addScaledVector(direction,(height-a.y)/direction.y);if(straw&&(Math.hypot(a.x,a.z)+strawRadius>=v.bottomRadius-wall||Math.hypot(crossing.x,crossing.z)+strawRadius>=radius-wall))throw new Error('glass-optics straw intersects vessel wall; reduce tilt');
  const span=Math.max(radius,Math.max(height*.62,Math.abs(length-height*.62))*Math.sin(deg(28))+strawRadius),root=new THREE.Group(),lo=new THREE.Vector3(straw?-span:-radius,0,straw?-span:-radius),hi=new THREE.Vector3(straw?span:radius,straw?base+strawRadius*2.5+length:height,straw?span:radius);
  const box=new THREE.Box3(lo,hi),geometry=new THREE.BoxGeometry(...box.getSize(new THREE.Vector3()).toArray() as [number,number,number]);geometry.translate(...box.getCenter(new THREE.Vector3()).toArray() as [number,number,number]);
  const material=ctx.mat({tone:1,rough:.42,side:THREE.BackSide});material.name='curved-dielectric-primary-rays';
  // The first interface's depth belongs to the glass, while its radiance can
  // come from a different refracted surface. Opaque receiver AO is invalid here.
  material.userData.screenAO=false;
  const uniforms={vgCamera:{value:new THREE.Vector3()},vgViewToLocal:{value:new THREE.Matrix4()},vgLocalToView:{value:new THREE.Matrix4()},vgLocalToClip:{value:new THREE.Matrix4()},vgStrawA:{value:a},vgStrawB:{value:b},vgH:{value:height},vgR0:{value:v.bottomRadius},vgR1:{value:radius},vgWall:{value:wall},vgBase:{value:base},vgLevel:{value:v.level},vgAir:{value:v.airIOR},vgGlass:{value:v.glassIOR},vgWater:{value:v.waterIOR},vgStrawRadius:{value:strawRadius},vgStrawOn:{value:straw?1:0},vgScale:{value:1},vgDebug:{value:ctx.num('_debug',0,0,6)},vgSceneRange:{value:height*32},vgEmitterCount:{value:0},vgEmitterDirections:{value:Array.from({length:8},()=>new THREE.Vector3())},vgEmitterIrradiance:{value:Array.from({length:8},()=>new THREE.Vector3())},vgEmitterWidths:{value:new Float32Array(8)},vgEmitterHeights:{value:new Float32Array(8)},vgEmitterIntegrals:{value:new Float32Array(8)},stEnabled:{value:0},stColor:{value:null as THREE.Texture|null},stDepth:{value:null as THREE.Texture|null},stSize:{value:new THREE.Vector2(1,1)},stProjection:{value:new THREE.Matrix4()},stInverseProjection:{value:new THREE.Matrix4()},stNear:{value:.01},stThickness:{value:height*.001}};
  material.onBeforeCompile=shader=>{
   Object.assign(shader.uniforms,uniforms);shader.vertexShader='varying vec3 vgLocal;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvgLocal=position;');
   shader.fragmentShader=shader.fragmentShader.replace('void main() {',TRACE+'\nvoid main() {');
   shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`float vgFirst;vec3 vgD=normalize(vgLocal-vgCamera);float vgRadiance=vgTrace(vgCamera,vgD,vgFirst);if(vgFirst>1e9)discard;
    if(vgDebug>.5&&vgDebug<4.5){vec3 nn;float tt=vgBoundary(vgCamera,vgD,nn);if(vgDebug<1.5)vgRadiance=.5;else if(vgDebug<2.5)vgRadiance=vgEnvironment(reflect(vgD,nn));else {vec3 p=vgCamera+vgD*tt;vgRadiance=vgFresnel(abs(dot(vgD,nn)),vgMedium(p-vgD*vgEps()),vgMedium(p+vgD*vgEps()));}}
    vec4 vgClip=vgLocalToClip*vec4(vgCamera+normalize(vgLocal-vgCamera)*vgFirst,1.);gl_FragDepth=clamp(.5*vgClip.z/vgClip.w+.5,0.,1.);
    outgoingLight=diffuseColor.rgb*vgRadiance;
    #include <opaque_fragment>`);
  };
  material.customProgramCacheKey=()=> 'acryllex-curved-vessel-scene-optics-v2';
  const mesh=new THREE.Mesh(geometry,material);mesh.name='dielectric-vessel-rays';mesh.frustumCulled=false;root.add(mesh);
  const inverse=new THREE.Matrix4(),scale=new THREE.Vector3();
  const emitterPosition=new THREE.Vector3(),targetPosition=new THREE.Vector3();
  mesh.onBeforeRender=(_renderer,scene,camera)=>{
   mesh.matrixWorld.decompose(new THREE.Vector3(),new THREE.Quaternion(),scale);const mean=(Math.abs(scale.x)+Math.abs(scale.y)+Math.abs(scale.z))/3;
   if(Math.max(Math.abs(Math.abs(scale.x)-mean),Math.abs(Math.abs(scale.y)-mean),Math.abs(Math.abs(scale.z)-mean))>mean*1e-5)throw new Error('glass-optics requires uniform object scale; use radius/height for vessel shape');
   inverse.copy(mesh.matrixWorld).invert();camera.getWorldPosition(uniforms.vgCamera.value).applyMatrix4(inverse);uniforms.vgViewToLocal.value.multiplyMatrices(inverse,camera.matrixWorld);uniforms.vgLocalToView.value.multiplyMatrices(camera.matrixWorldInverse,mesh.matrixWorld);uniforms.vgLocalToClip.value.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse).multiply(mesh.matrixWorld);uniforms.vgScale.value=mean;uniforms.stThickness.value=height*.001*mean;
   // Build a reflection stage from visible scene lights by identity, never THREE's
   // shadow-sorted shader index. Toggling shadows must not move a reflected softbox.
   let count=0;scene?.traverseVisible(node=>{
    if(!(node as THREE.DirectionalLight).isDirectionalLight||count===8)return;
    const light=node as THREE.DirectionalLight,rear=light.userData.acryllexReflectionRole==='rear',fill=light.userData.acryllexReflectionRole==='fill',direction=uniforms.vgEmitterDirections.value[count]!;
    if(!light.layers.test(camera.layers))return;
    if(rear)direction.set(0,.35,-1).normalize();
    else direction.copy(light.getWorldPosition(emitterPosition)).sub(light.target.getWorldPosition(targetPosition)).transformDirection(camera.matrixWorldInverse);
    uniforms.vgEmitterIrradiance.value[count]!.set(light.color.r,light.color.g,light.color.b).multiplyScalar(light.intensity);
    const width=rear?.25:fill?.55:.022,height=fill?.12:.95;
    uniforms.vgEmitterWidths.value[count]=width;uniforms.vgEmitterHeights.value[count]=height;uniforms.vgEmitterIntegrals.value[count]=emitterIntegral(Math.asin(Math.max(-1,Math.min(1,direction.y))),width,height);count++;
   });uniforms.vgEmitterCount.value=count;
  };
  const anchors={top:[0,height,0] as [number,number,number],waterline:[0,v.level,0] as [number,number,number],strawTip:b.toArray() as [number,number,number]};
  const setInput=(input:SceneTransmissionInput|null)=>{
   uniforms.stEnabled.value=input?1:0;if(!input)return;
   uniforms.stColor.value=input.color;uniforms.stDepth.value=input.depth;uniforms.stSize.value.copy(input.size);uniforms.stProjection.value.copy(input.projection);uniforms.stInverseProjection.value.copy(input.inverseProjection);uniforms.stNear.value=input.near;
  };
  root.userData.optics={kind:'bounded-curved-dielectric-ray-tracing',vessel:v,physicalStraw:{from:a.toArray(),to:b.toArray(),straight:true},limits:'Analytic tapered walls, rounded lip and curved meniscus; two secondary reflection levels, finite interaction budget. External scene samples are screen-space visible surfaces only, excluding hidden/offscreen surfaces and other optical volumes. No caustics, dispersion or fluid simulation.'};
  return {root,grounded:true,anchors,sceneTransmission:ctx.bool('sceneTransmission',false)?{objects:[root],setInput}:undefined,update(c){
   mesh.castShadow=false;mesh.receiveShadow=false;const fill=c.fill??initial,tilt=c.strawTilt??initialTilt,yaw=c.strawYaw??initialYaw;
   if(![fill,tilt,yaw].every(Number.isFinite))throw new Error('glass-optics controls must be finite');
   const angle=deg(clamp(tilt,-28,28)),azimuth=deg(yaw),dir=new THREE.Vector3(Math.sin(angle)*Math.cos(azimuth),Math.cos(angle),Math.sin(angle)*Math.sin(azimuth)),nextA=new THREE.Vector3(-dir.x*height*.62,base+strawRadius*1.5,-dir.z*height*.62),nextB=nextA.clone().addScaledVector(dir,length),crossing=nextA.clone().addScaledVector(dir,(height-nextA.y)/dir.y);
   if(straw&&(Math.hypot(nextA.x,nextA.z)+strawRadius>=v.bottomRadius-wall||Math.hypot(crossing.x,crossing.z)+strawRadius>=radius-wall))throw new Error('glass-optics straw intersects vessel wall; reduce tilt');
   a.copy(nextA);b.copy(nextB);anchors.strawTip=b.toArray() as [number,number,number];root.userData.optics.physicalStraw.from=a.toArray();root.userData.optics.physicalStraw.to=b.toArray();
   v.level=base+(height-wall*1.5-base)*clamp(fill);uniforms.vgLevel.value=v.level;anchors.waterline[1]=v.level;
  }};
 },
});
