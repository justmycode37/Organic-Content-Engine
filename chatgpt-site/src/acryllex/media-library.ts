/** Licensed fixed-view subjects. Originals download into the private render cache, never the source tree. */
export const MEDIA_LIBRARY={
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
export function isFootageModel(id:string){return ['footage','video','clip','wave-footage','ocean-wave-media'].includes(normalized(id));}

/** Shared by preparation and playback so named subjects use exactly the same variant. */
export function resolveFootageParams(model:string,params:Record<string,unknown>={}){
 const asset=params.asset??(['wave-footage','ocean-wave-media'].includes(normalized(model))?'ocean-breaker':undefined);
 if(asset===undefined)return params;
 if(typeof asset!=='string'||!Object.hasOwn(MEDIA_LIBRARY,asset))throw new Error(`footage: unknown library asset ${String(asset)}`);
 if(params.file!==undefined||params.url!==undefined)throw new Error('footage: choose a library asset or a custom file/URL');
 const entry=MEDIA_LIBRARY[asset as keyof typeof MEDIA_LIBRARY];
 return {...entry.defaults,...params,asset,expectedSHA256:entry.defaults.expectedSHA256};
}
