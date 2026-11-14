import * as THREE from 'three';

export interface SceneTransmissionInput {
 color:THREE.Texture;depth:THREE.DepthTexture;size:THREE.Vector2;
 projection:THREE.Matrix4;inverseProjection:THREE.Matrix4;near:number;
}
export interface SceneTransmissionReceiver {
 /** Omit all participating optical surfaces from their shared source pass. */
 objects:readonly THREE.Object3D[];
 setInput(input:SceneTransmissionInput|null):void;
}

/** Same-frame linear colour/depth for visible surrounding surfaces. Optics sample
 * this separate target, never the target into which they are currently drawing.
 * This is a screen-space representation: hidden/offscreen surfaces are absent.
 */
export class SceneTransmissionCapture {
 private target:THREE.WebGLRenderTarget|null=null;
 private disposed=false;
 capture(renderer:THREE.WebGLRenderer,scene:THREE.Scene,camera:THREE.PerspectiveCamera,width:number,height:number,receivers:readonly SceneTransmissionReceiver[]){
  if(this.disposed)throw new Error('Scene transmission capture is disposed');
  if(!receivers.length)return;
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>8192||height>8192)throw new Error('Invalid scene transmission capture size');
  if(!this.target){
   this.target=new THREE.WebGLRenderTarget(width,height,{type:THREE.HalfFloatType,depthBuffer:true,depthTexture:new THREE.DepthTexture(width,height,THREE.FloatType),minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter});
   this.target.texture.name='scene-transmission-linear-colour';this.target.texture.colorSpace=THREE.LinearSRGBColorSpace;
   this.target.depthTexture!.name='scene-transmission-depth';
  }else if(this.target.width!==width||this.target.height!==height)this.target.setSize(width,height);
  const previous=renderer.getRenderTarget(),face=renderer.getActiveCubeFace(),mipmap=renderer.getActiveMipmapLevel(),colour=renderer.getClearColor(new THREE.Color()),alpha=renderer.getClearAlpha();
  const hidden=new Map<THREE.Object3D,boolean>();
  try{
   for(const receiver of receivers){receiver.setInput(null);for(const object of receiver.objects)if(!hidden.has(object)){hidden.set(object,object.visible);object.visible=false;}}
   // setRenderTarget selects this owned target's complete viewport/scissor. Do
   // not overwrite the renderer's separate default-framebuffer viewport state.
   renderer.setRenderTarget(this.target);renderer.setClearColor(0x000000,0);renderer.clear();renderer.render(scene,camera);
   const input:SceneTransmissionInput={color:this.target.texture,depth:this.target.depthTexture!,size:new THREE.Vector2(width,height),projection:camera.projectionMatrix,inverseProjection:camera.projectionMatrixInverse,near:camera.near};
   for(const receiver of receivers)receiver.setInput(input);
  }finally{
   for(const [object,visible]of hidden)object.visible=visible;
   renderer.setClearColor(colour,alpha);renderer.setRenderTarget(previous,face,mipmap);
  }
 }
 dispose(){if(this.disposed)return;this.disposed=true;this.target?.dispose();this.target=null;}
}

/** Perspective-correct screen-line traversal of a view-space ray segment. The
 * interval at each sample is tested against real captured depth, not guessed UV
 * offsets. Coordinates use the supplied direction's parameterization (it need
 * not be unit length). The bounded step count can miss thin/distant surfaces.
 * Background: McGuire & Mara, JCGT 2014, https://jcgt.org/published/0003/04/04/
 */
export const SCENE_TRANSMISSION_GLSL=`
uniform sampler2D stColor;uniform sampler2D stDepth;
uniform mat4 stProjection;uniform mat4 stInverseProjection;
uniform vec2 stSize;uniform float stNear;uniform float stEnabled;uniform float stThickness;
vec3 stViewPoint(vec3 q0,vec3 q1,float k0,float k1,float u){return mix(q0,q1,u)/mix(k0,k1,u);}
float stTrace(vec3 start,vec3 direction,float range,out vec3 colour){
 colour=vec3(0);if(stEnabled<.5||range<=.000001||dot(direction,direction)<1e-12)return 1e10;
 if(start.z>=-stNear)return 1e10;
 if(direction.z>0.)range=min(range,(-stNear*1.001-start.z)/direction.z);
 if(range<=.000001)return 1e10;
 vec3 end=start+direction*range;vec4 h0=stProjection*vec4(start,1),h1=stProjection*vec4(end,1);
 float k0=1./h0.w,k1=1./h1.w;vec2 a=h0.xy*k0*.5+.5,b=h1.xy*k1*.5+.5,delta=b-a;
 float lo=0.,hi=1.;vec2 edge=.5/stSize;
 for(int j=0;j<2;j++){
  if(abs(delta[j])<1e-9){if(a[j]<edge[j]||a[j]>1.-edge[j])return 1e10;}
  else {float u0=(edge[j]-a[j])/delta[j],u1=(1.-edge[j]-a[j])/delta[j];lo=max(lo,min(u0,u1));hi=min(hi,max(u0,u1));}
 }
 if(lo>hi)return 1e10;
 vec3 q0=start*k0,q1=end*k1;float pixels=max(abs(delta.x)*stSize.x,abs(delta.y)*stSize.y)*(hi-lo);
 float steps=clamp(ceil(pixels),1.,512.),stride=(hi-lo)/steps;
 for(int j=0;j<512;j++){
  if(float(j)>=steps)break;float ua=lo+float(j)*stride,ub=ua+stride,u=(ua+ub)*.5;vec2 uv=a+delta*u;
  float depth=texture2D(stDepth,uv).r;if(depth>=.9999999)continue;
  vec4 hp=stInverseProjection*vec4(uv*2.-1.,depth*2.-1.,1.);vec3 surface=hp.xyz/hp.w;
  vec3 pa=stViewPoint(q0,q1,k0,k1,ua),pb=stViewPoint(q0,q1,k0,k1,ub);float z=-surface.z;
  if(z<min(-pa.z,-pb.z)-stThickness||z>max(-pa.z,-pb.z)+stThickness)continue;
  float t=dot(surface-start,direction)/dot(direction,direction);if(t<=.000001||t>range)continue;
  // A sample represents a finite pixel footprint, not an infinite slab at that depth.
  float footprint=2.*z/(max(abs(stProjection[1][1]),1e-6)*stSize.y)*max(1.,pixels/steps);
  if(distance(surface,start+direction*t)>max(stThickness,footprint*1.5))continue;
  colour=texture2D(stColor,uv).rgb;return t;
 }
 return 1e10;
}
`;
