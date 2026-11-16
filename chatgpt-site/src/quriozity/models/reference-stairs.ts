import * as THREE from 'three';
import {clamp,ease} from '../kit.ts';
import {defineModel} from './types.ts';

// Broad, planar stone surfaces retain their light and shadow shapes at dot resolution.
// Small normal displacements would instead turn each tessellation edge into a highlight.
export const concreteStairs=defineModel({
 id:'concrete-stairs',aliases:['stone-steps','monumental-stairs','levelling-up','steps-up','grand-staircase'],
 describe:'Wide monumental concrete steps rising away: softly weathered planar stone, lit treads and shaded risers. Optional foreground shade and a continuous diagonal light shaft across tread/front surfaces. `rise` 0..1 builds the steps one by one.',
 controls:{rise:'0..1 steps appear in order (default 1)'},defaults:{rise:1},
 params:{steps:'4..16 (default 9)',width:'step length m (default 9)',depth:'tread depth m (default 0.62)',rise:'step height m (default 0.3)',stagger:'sideways offset per step m',riserTone:'shadowed riser brightness (default 0.3)',treadTone:'lit top brightness (default 1)',frontTreads:'nearest tread tops with a separate shaded base, 0 keeps legacy lighting (default 0)',frontTreadTone:'base tone for those nearest tread tops (default treadTone)',patchTreads:'edge light pool spilled onto tread tops, 0 keeps legacy lighting (default 0)',stripeTreads:'diagonal sun shaft on tread tops, 0 keeps legacy lighting (default 0)',texture:'subtle stone mottling amplitude (default 0.035)',patch:'broad light patch strength (default 0.65)',patchWidth:'light patch width in metres (default 1.9)',patchOffset:'light patch centre as fraction of step width from its centre (default 0.43)',patchHeight:'lit depth below each riser top in metres; 0 keeps the legacy full-height pool (default 0)',patchFalloffY:'Gaussian vertical falloff below the lit depth in metres (default 0.08)',contact:'riser foot shadow strength 0..1 (default 0.3)',sunStripe:'strength of a broad diagonal shaft of sunlight (default 0)',stripeHeight:'sunlight shaft centre height m',stripeSlope:'sunlight shaft slope across the stair width',stripeWidth:'sunlight shaft half-width m',stripeDepth:'sunlight shaft centre along the run m',stripeFalloff:'sunlight shaft depth falloff m'},size:'9 m',
 build(ctx){
  const root=new THREE.Group(),steps:THREE.Group[]=[];
  const n=Math.round(ctx.num('steps',9,4,16)),w=ctx.num('width',9,2,30),depth=ctx.num('depth',0.62,0.2,2),rise=ctx.num('rise',0.3,0.1,1),stagger=ctx.num('stagger',0,0,2);
  const riserTone=ctx.num('riserTone',0.3,0.03,1),treadTone=ctx.num('treadTone',1,0.1,2),texture=ctx.num('texture',0.035,0,0.3),patch=ctx.num('patch',0.65,0,2),patchWidth=ctx.num('patchWidth',1.9,0.2,12),patchOffset=ctx.num('patchOffset',0.43,-1,1),contact=ctx.num('contact',0.3,0,1);
  const patchHeight=ctx.num('patchHeight',0,0,16),patchFalloffY=ctx.num('patchFalloffY',0.08,0.005,4);
  const frontTreads=Math.round(ctx.num('frontTreads',0,0,n)),frontTreadTone=ctx.num('frontTreadTone',treadTone,0.03,2),patchTreads=ctx.num('patchTreads',0,0,2),stripeTreads=ctx.num('stripeTreads',0,0,2);
  const sunStripe=ctx.num('sunStripe',0,0,2),stripeHeight=ctx.num('stripeHeight',rise*2,0,16),stripeSlope=ctx.num('stripeSlope',-0.035,-1,1),stripeWidth=ctx.num('stripeWidth',0.08,0.01,2),stripeDepth=ctx.num('stripeDepth',-depth/2,-40,40),stripeFalloff=ctx.num('stripeFalloff',depth*0.5,0.1,20);
  for(let i=0;i<n;i++){
   const g=new THREE.Group(),top=rise*(i+1);
   const geo=new THREE.BoxGeometry(w,top,depth);geo.translate(0,top/2,0);
   const mesh=ctx.mesh(geo,{tone:1,rough:1}),material=mesh.material as THREE.MeshStandardMaterial;
   // Evaluate weathering and projected sunlight per fragment. Interpolating narrow
   // light bands between vertices leaves visible triangular patches at close range.
   material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,{
     stairBase:{value:new THREE.Vector4(riserTone,treadTone,texture,patch)},
     stairPatch:{value:new THREE.Vector4(patchWidth,patchOffset,contact,sunStripe)},
     stairPatchY:{value:new THREE.Vector2(patchHeight,patchFalloffY)},
     stairTread:{value:new THREE.Vector3(i<frontTreads?frontTreadTone:-1,patchTreads,stripeTreads)},
     stairStripe:{value:new THREE.Vector4(stripeHeight,stripeSlope,stripeWidth,stripeDepth)},
     stairStep:{value:new THREE.Vector4(w,top,-i*depth,stripeFalloff)},
     stairRise:{value:rise},
    });
    const varying='varying vec3 vStairPoint;varying float vStairTop;\n';
    shader.vertexShader=varying+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vStairPoint=position;vStairTop=normal.y;');
    shader.fragmentShader=varying+'uniform vec4 stairBase;uniform vec4 stairPatch;uniform vec2 stairPatchY;uniform vec3 stairTread;uniform vec4 stairStripe;uniform vec4 stairStep;uniform float stairRise;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
     float sx=vStairPoint.x,sy=vStairPoint.y,sz=vStairPoint.z+stairStep.z;
     float grain=1.+stairBase.z*(sin(sx*3.1+sz*1.7)*sin(sy*2.3+sz*2.1)+.35*sin(sx*9.1-sz*3.3));
     float stoneTone;
     if(vStairTop>.5){
      float baseTone=stairTread.x>=0.?stairTread.x:stairBase.y;
      stoneTone=baseTone*(.83+.17*cos(sx*.65+sz*.25))*grain;
      if(stairTread.y>0.){
       float edge=(sx+stairStep.x*stairPatch.y)/stairPatch.x;
       stoneTone+=stairTread.y*stairBase.w*exp(-edge*edge)*grain;
      }
      if(stairTread.z>0.){
       float across=(sy-stairStripe.x-stairStripe.y*(sx+stairStep.x*.5))/stairStripe.z;
       float along=(sz-stairStripe.w)/stairStep.w;
       stoneTone+=stairTread.z*stairPatch.w*exp(-across*across-along*along);
      }
     }
     else{
      float edge=(sx+stairStep.x*stairPatch.y)/stairPatch.x;
      float pool=exp(-edge*edge);
      if(stairPatchY.x>0.){
       float below=max(0.,stairStep.y-sy-stairPatchY.x)/stairPatchY.y;
       pool*=exp(-below*below);
      }
      float band=clamp((sy-stairStep.y+stairRise)/stairRise,0.,1.);
      stoneTone=(stairBase.x+(1.-stairBase.x)*stairBase.w*pool)*(1.-stairPatch.z*(1.-smoothstep(0.,1.,band)))*grain;
      float across=(sy-stairStripe.x-stairStripe.y*(sx+stairStep.x*.5))/stairStripe.z;
      float along=(sz-stairStripe.w)/stairStep.w;
      stoneTone+=stairPatch.w*exp(-across*across-along*along);
     }
     diffuseColor.rgb*=max(0.,stoneTone);
    `);
   };
   material.customProgramCacheKey=()=> 'acx-concrete-stairs-v3';
   g.add(mesh);
   g.position.set(i*stagger,0,-i*depth);root.add(g);steps.push(g);
  }
  return {root,grounded:true,update(c){const r=clamp(c.rise??1);steps.forEach((g,i)=>{const k=ease.out(clamp(r*n-i));g.scale.y=Math.max(0.001,k);g.visible=k>0.002;});}};
 },
});
