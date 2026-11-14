import {referenceKind,referenceDefaults} from './reference-media.ts';
import {REFERENCE_CATALOG} from './reference-catalog.ts';
/** Fixed-view subjects. Stock originals use the private download cache; generated human sources include bundled provenance. */
export const MEDIA_LIBRARY={
 ...REFERENCE_CATALOG,
"human-male-clay-motion": {
  "name": "Adult male in neutral clay material, walking, sitting and typing",
  "creator": "Organic Content Engine; image_gen and Kling AI",
  "acquired": "2026-11-14",
  "page": "https://kling.ai/feature/ai-motion-control",
  "license": "https://kling.ai/docs/user-policy",
  "terms": "https://kling.ai/docs/payment-policy",
  "capture": "Synthetic character generated with Kling AI. Neutral clay image_gen appearance and own fitted-rig motion guide; no filmed person or copied reference pixels.",
  "limitations": "Fixed profile and baked action. Natural proportions and crown/cheek lighting reviewed; fine hands, lean pose and contacts remain approximate. Not a99%reference match.",
  "recommendedLight": {
    "contrast": 0.8,
    "gamma": 0.8,
    "blackPoint": 0.025,
    "whitePoint": 0.9,
    "exposure": 0.68,
    "softness": 0.6
  },
  "defaults": {
    "file": "library:human-male-clay-motion.mkv",
    "expectedSHA256": "6aa6f3bf758597e6e52dc74601bc76ef7cc9a6c8410c78c857f89a0d54cba217",
    "alphaFile": "library:human-male-clay-motion-alpha.mkv",
    "sourceStart": 0,
    "sourceDuration": 4.9,
    "fps": 30,
    "crop": "243:417:452:112",
    "cols": 243,
    "rows": 417,
    "monochrome": false,
    "preserveAspect": true,
    "blur": 0,
    "loop": false,
    "sourceLevels": {
      "blackPoint": 0,
      "whitePoint": 0.75
    }
  }
},
"human-male-motion": {
  "name": "Adult male walking, sitting and typing",
  "creator": "Organic Content Engine; image_gen and Kling AI",
  "acquired": "2026-11-14",
  "page": "https://kling.ai/feature/ai-motion-control",
  "license": "https://kling.ai/docs/user-policy",
  "terms": "https://kling.ai/docs/payment-policy",
  "capture": "Synthetic character generated with Kling AI, not filmed footage. Appearance from image_gen; motion from an own fitted rig render.",
  "limitations": "Fixed profile and baked action sequence; cannot rotate or accept new poses. Head-cap density, floor offset and some finger/swing-foot detail remain approximate; not a99%reference match.",
  "recommendedLight": {
   "contrast": 0.8,
   "gamma": 0.8,
   "blackPoint": 0.025,
   "whitePoint": 0.9,
   "exposure": 0.68,
   "softness": 0.25
  },
  "defaults": {
   "file": "library:human-male-motion.mkv",
   "expectedSHA256": "2f4c9c3d2472c50b0e4f88952d1584b55edb944687fd7dec46410188ce7e3421",
   "alphaFile": "library:human-male-motion-alpha.mkv",
   "sourceStart": 0,
   "sourceDuration": 4.9,
   "fps": 30.0,
   "crop": "235:422:446:108",
   "cols": 235,
   "rows": 422,
   "monochrome": false,
   "preserveAspect": true,
   "blur": 0,
   "loop": false,
   "sourceLevels": {
    "blackPoint": 0,
    "whitePoint": 0.75
   }
  }
 },
 "human-female-motion": {
  "name": "Adult female walking, sitting and typing",
  "creator": "Organic Content Engine; image_gen and Kling AI",
  "acquired": "2026-11-14",
  "page": "https://kling.ai/feature/ai-motion-control",
  "license": "https://kling.ai/docs/user-policy",
  "terms": "https://kling.ai/docs/payment-policy",
  "capture": "Synthetic character generated with Kling AI, not filmed footage. Appearance from image_gen; motion from an own fitted rig render.",
  "limitations": "Fixed profile and baked action sequence; cannot rotate or accept new poses. Head-cap density, floor offset and some finger/swing-foot detail remain approximate; not a99%reference match.",
  "recommendedLight": {
   "contrast": 0.8,
   "gamma": 0.8,
   "blackPoint": 0.025,
   "whitePoint": 0.9,
   "exposure": 0.68,
   "softness": 0.25
  },
  "defaults": {
   "file": "library:human-female-motion.mkv",
   "expectedSHA256": "1583e8e694e03aae61a349efb3d96cab6d139fcaa824001a7774625baa6ece8c",
   "alphaFile": "library:human-female-motion-alpha.mkv",
   "sourceStart": 0,
   "sourceDuration": 4.9,
   "fps": 30.0,
   "crop": "238:422:448:109",
   "cols": 238,
   "rows": 422,
   "monochrome": false,
   "preserveAspect": true,
   "blur": 0,
   "loop": false,
   "sourceLevels": {
    "blackPoint": 0,
    "whitePoint": 0.75
   }
  }
 },
 'ocean-breaker':{
  name:'Breaking ocean wave',creator:'doktorkleinmusic',acquired:'2026-11-13',
  page:'https://pixabay.com/videos/wave-barrel-night-moonlight-268746/',
  license:'https://pixabay.com/service/license-summary/',
  terms:'https://pixabay.com/service/terms/',
  capture:'AI-generated video, explicitly labeled by the source. Do not describe as filmed footage.',
  limitations:'Fixed outside view. Sourceframes120–195; background removed by a tracked matte. The mouth is a rolled/filled curl rather than a dark through-hole; not an exact reference match.',
  recommendedLight:{contrast:1.5,gamma:1.05,blackPoint:.02,whitePoint:.95,exposure:1.05,softness:0},
  defaults:{
   file:'https://cdn.pixabay.com/video/2025/03/30/268746_large.mp4',
   expectedSHA256:'22a24d2d534a318b7d1daf7bda58d8e5aaaff367df299259afd14afe09a3836c',
   alphaFile:'library:ocean-breaker-alpha.mkv',
   sourceStart:4,sourceDuration:76/30,fps:30,monochrome:true,preserveAspect:true,blur:0,mirrorX:true,sampleScale:3,
  },
 },
 'ocean-barrel':{
  name:'Inside an ocean barrel',creator:'Solarselle77',acquired:'2026-11-13',
  page:'https://pixabay.com/videos/ocean-wave-sea-surf-sunrise-310248/',
  license:'https://pixabay.com/service/license-summary/',
  terms:'https://pixabay.com/service/terms/',
  capture:'Unverified origin; do not describe this asset as filmed footage.',
  limitations:'Fixed inside-barrel viewpoint. Background is removed by a tracked matte; this is not a freely rotatable 3D wave or an exact reference match.',
  defaults:{
   file:'https://cdn.pixabay.com/video/2025/10/16/310248_large.mp4',
   expectedSHA256:'13a1b007f92e4d1c971ea8b72516f5bb39947d2b407024746877b37b736f19b1',
   alphaFile:'library:ocean-barrel-alpha.mkv',
   sourceStart:0,sourceDuration:76/30,fps:30,monochrome:true,preserveAspect:true,blur:0,sampleScale:3,
  },
 },
} as const;

const normalized=(id:string)=>id.toLowerCase().trim().replace(/[\s_]+/g,'-');
const FOOTAGE_PRESETS:Record<string,keyof typeof MEDIA_LIBRARY>={
 'wave-footage':'ocean-breaker','ocean-wave-media':'ocean-breaker',
 'human-male-footage':'human-male-motion','human-footage':'human-male-motion','man-footage':'human-male-motion',
 'human-female-footage':'human-female-motion','woman-footage':'human-female-motion',
};
export function isFootageModel(id:string){const key=normalized(id);return !!referenceKind(key)||['footage','video','clip'].includes(key)||Object.hasOwn(FOOTAGE_PRESETS,key);}

/** Shared by preparation and playback so named subjects use exactly the same variant. */
export function resolveFootageParams(model:string,params:Record<string,unknown>={}):Record<string,unknown>{
 const key=normalized(model),asset=params.asset??(Object.hasOwn(FOOTAGE_PRESETS,key)?FOOTAGE_PRESETS[key]:undefined);
 if(asset===undefined)return referenceKind(key)?referenceDefaults(params):params;
 if(typeof asset!=='string'||!Object.hasOwn(MEDIA_LIBRARY,asset))throw new Error(`footage: unknown library asset ${String(asset)}`);
 if(params.file!==undefined||params.url!==undefined)throw new Error('footage: choose a library asset or a custom file/URL');
 const entry=MEDIA_LIBRARY[asset as keyof typeof MEDIA_LIBRARY];
 const resolved={...entry.defaults,...params,asset,expectedSHA256:entry.defaults.expectedSHA256};
 return referenceKind(key)?referenceDefaults(resolved):resolved;
}
