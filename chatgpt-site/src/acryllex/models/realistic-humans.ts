import * as THREE from 'three';
import {defineModel,type ModelCtx} from './types.ts';
import {buildPerson,PERSON_PARAMS,PERSON_POSES,type PersonPreset} from './realistic-person.ts';

/**
 * The library's anatomical adults: one explicit male and one explicit female body.
 * Each is its own mesh, modelled from MakeHuman's CC0 base mesh with that sex's macro targets (see
 * scripts/acryllex/build-humans.mjs) and skinned to a clean metre-scale rig. Neither is a scaled copy of the other.
 * Motion, named poses and keyed pose/IK tracks come from the shared human rig, so anything one body can do the other can.
 */
const PARAMS:Record<string,string>={...PERSON_PARAMS,hair:'false (default); true shows the auxiliary hair guide mesh',hairTone:'hair albedo relative to skin (default 0.8)',rough:'skin roughness 0.05 .. 1 (default 0.55)',mesh:'anatomical (default) | scanned: the clothed scanned avatar with the same rig and motion',body:'with mesh=scanned, a named avatar: brian | remy | james | leonard | megan | kate | louise'};
function build(ctx:ModelCtx,preset:PersonPreset){
 const p=buildPerson(ctx,preset);if(p)return p;
 const r=new THREE.Group();r.add(ctx.mesh(new THREE.CapsuleGeometry(0.2,1.3),{tone:0.8}));return {root:r,grounded:true};
}

export const humanMale=defineModel({
 id:'human-male',aliases:['anatomical-man','male-body','male-figure','man-anatomical'],
 describe:'Adult MALE anatomical figure-study mesh, unclothed, with an athletic build, face, hands and feet; walks, runs, sits, types and takes human poses, or follows an authored pose/IK track for contacts with furniture.',
 params:PARAMS,poses:PERSON_POSES,size:'1.78 m',
 build:ctx=>build(ctx,{asset:'human-male',sex:'male',height:1.78}),
});

export const humanFemale=defineModel({
 id:'human-female',aliases:['anatomical-woman','female-body','female-figure','woman-anatomical'],
 describe:'Adult FEMALE anatomical figure-study mesh, unclothed, with narrower shoulders, wider pelvis and its own body and limb proportions; supports the same motion, poses and authored pose/IK tracks as human-male.',
 params:PARAMS,poses:PERSON_POSES,size:'1.65 m',
 build:ctx=>build(ctx,{asset:'human-female',sex:'female',height:1.65}),
});
