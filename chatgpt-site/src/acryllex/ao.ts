/**
 * Depth-only AO shaders for the dither post pass. Both variants use the engine's
 * existing depth/camera/AO/resolution uniforms; legacy also uses linZ and hash.
 *
 * Keep legacy available for specs that were authored around its shading. The
 * plane variant reconstructs the receiver's tangent plane from depth texels;
 * it does not need normals, derivative extensions, or another render target.
 */
export const LEGACY_AMBIENT_OCCLUSION_GLSL=/* glsl */`
float ambientOcclusion(vec2 uv){
 if(aoStr<=0.)return 1.;float d=linZ(uv);if(d>cFar*0.95)return 1.;
 float rUv=aoR/(d*2.*tanHalf);float occ=0.;float asp=res.y/res.x;
 for(int i=0;i<16;i++){float fi=float(i);float a=fi*2.39996+hash(uv*913.)*6.283;float r=rUv*sqrt((fi+0.5)/16.);
  vec2 o=vec2(cos(a)*asp,sin(a))*r;float ds=linZ(uv+o);float diff=d-ds;
  occ+=smoothstep(aoR*0.02,aoR*0.35,diff)*(1.-smoothstep(aoR*1.2,aoR*2.5,diff));}
 return clamp(1.-aoStr*occ/16.,0.,1.);
}`;

export const PLANE_AMBIENT_OCCLUSION_GLSL=/* glsl */`
// Inverse linear view depth is affine across a projected planar surface.
// This form avoids cancellation when reconstructing distant depth values.
float aoInverseDepth(vec2 uv){
 float z=texture2D(tDepth,uv).x;
 return (1.-z)/cNear+z/cFar;
}
vec2 aoDepthUV(vec2 uv,vec2 size){
 return (clamp(floor(uv*size),vec2(0.),size-1.)+0.5)/size;
}
float aoPlaneSlope(float lo,float mid,float hi){
 float a=mid-lo,b=hi-mid;
 // At a silhouette or contact boundary, use the side on the receiver surface.
 return abs(a)<abs(b)?a:b;
}
float ambientOcclusion(vec2 uv){
 if(aoStr<=0.||aoR<=0.)return 1.;
 vec2 size=vec2(textureSize(tDepth,0)),texel=1./size;
 // The post pass calls AO at dot centres, which need not be depth-texel centres.
 // Snap receiver and samples consistently so a steep plane has zero residual.
 vec2 p=aoDepthUV(uv,size);float q=aoInverseDepth(p),d=1./q;
 if(d>cFar*0.95)return 1.;
 float ql=aoInverseDepth(p-vec2(texel.x,0.));
 float qr=aoInverseDepth(p+vec2(texel.x,0.));
 float qb=aoInverseDepth(p-vec2(0.,texel.y));
 float qt=aoInverseDepth(p+vec2(0.,texel.y));
 vec2 slope=vec2(aoPlaneSlope(ql,q,qr),aoPlaneSlope(qb,q,qt));
 // The viewport edge has only one valid one-sided difference.
 if(p.x<texel.x)slope.x=qr-q;
 else if(p.x>1.-texel.x)slope.x=q-ql;
 if(p.y<texel.y)slope.y=qt-q;
 else if(p.y>1.-texel.y)slope.y=q-qb;
 slope/=texel;
 float rUv=aoR/(d*2.*tanHalf),occ=0.,asp=res.y/res.x;
 for(int i=0;i<16;i++){
  float fi=float(i),a=fi*2.39996+0.37;
  float r=rUv*sqrt((fi+0.5)/16.);
  vec2 sampleUv=p+vec2(cos(a)*asp,sin(a))*r;
  if(any(lessThan(sampleUv,vec2(0.)))||any(greaterThan(sampleUv,vec2(1.))))continue;
  sampleUv=aoDepthUV(sampleUv,size);
  float planeQ=q+dot(slope,sampleUv-p);
  // A tangent plane past the far clip/horizon cannot occlude this receiver.
  if(planeQ<=1./cFar)continue;
  float ds=1./aoInverseDepth(sampleUv),diff=1./planeQ-ds;
  // Limit occlusion to nearby geometry, including on steeply tilted receivers.
  float range=abs(d-ds);
  occ+=smoothstep(aoR*0.02,aoR*0.35,diff)*(1.-smoothstep(aoR*1.2,aoR*2.5,range));
 }
 return clamp(1.-aoStr*occ/16.,0.,1.);
}`;

export function ambientOcclusionGLSL(mode:'plane'|'legacy'='plane'){
 return mode==='legacy'?LEGACY_AMBIENT_OCCLUSION_GLSL:PLANE_AMBIENT_OCCLUSION_GLSL;
}
