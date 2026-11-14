import * as THREE from 'three';
import {instance} from '../assets.ts';
import {defineModel} from './types.ts';
import {retainSourceTriangles} from './source-region.ts';
import {headSource} from '../head-source.ts';

export const portrait=defineModel({
 id:'head-mesh',aliases:['portrait','face-mesh','human-face','human-head'],
 describe:'A whole head, neck and shoulders from the licensed Infinite Realities / Lee Perry-Smith 3D scan, with closed eyes and captured surface relief. Uses the SAME neutral material and scene lighting as other meshes. Supports real 3D viewpoints and rigid turns; this source has no expressions, blinking or independent neck articulation. Explicit body selects a legacy whole-head extraction instead. Use an imported rig with source-authored blendshapes for expressions.',
 params:{source:'scan (default; closed-eye Lee Perry-Smith bust) | body (legacy head extraction)',body:'explicit megan | kate | louise | brian | james | leonard | remy selects the corresponding legacy body head',height:'total selected head/neck/bust height in metres, default .42',neckCut:'body source only: fraction of original standing height retained from the top, default .20',detail:'0 (default) neutral library albedo with source normal relief; >0 explicitly retains source texture luminance'},
 controls:{yaw:'head turn degrees, default 0',pitch:'head tilt degrees, default 0'},defaults:{yaw:0,pitch:0},size:'.42 m head and neck',
 build(ctx){
  const selected=headSource(ctx.params),detail=ctx.num('detail',0,0,1);
  const source=instance(selected.key,ctx,ctx.num('tone',.72,.2,1),detail===0,detail,{sourceAlpha:true,sourceHairSide:true});
  if(!source)throw new Error(`head-mesh: required source ${selected.key} was not preloaded`);
  const root=new THREE.Group(),fit=new THREE.Group();root.add(fit);fit.add(source.root);fit.updateMatrixWorld(true);
  if(selected.kind==='body'){
   const full=new THREE.Box3().setFromObject(source.root,true),height=full.max.y-full.min.y,cut=full.max.y-height*ctx.num('neckCut',.20,.16,.30),center=full.getCenter(new THREE.Vector3());
   // Source bodies may be in a T pose. A vertical cut alone retains the outstretched arms.
   retainSourceTriangles(source.root,p=>p.y>=cut&&Math.abs(p.x-center.x)<=height*.085);
  }
  fit.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(source.root,true),size=box.getSize(new THREE.Vector3());
  fit.scale.setScalar(ctx.num('height',.42,.15,2)/Math.max(size.y,1e-6));
  source.root.position.sub(box.getCenter(new THREE.Vector3()));
  return {root,grounded:false,update(c){
   for(const key of ['pitch','yaw'])if(c[key]!==undefined&&!Number.isFinite(c[key]))throw new Error('head-mesh: '+key+' must be finite');
   fit.rotation.set(THREE.MathUtils.degToRad(c.pitch??0),THREE.MathUtils.degToRad(c.yaw??0),0);
  }};
 },
});
