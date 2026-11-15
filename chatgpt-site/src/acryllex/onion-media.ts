import records from './assets/onion/footage-provenance.json' with {type:'json'};

/** Recorded interactions acquired to resolve the onion reel's rendered subject-review failures. */
function clip(id:keyof typeof records,name:string,limitations:string,defaults:Record<string,unknown>){
 const r=records[id];
 return {name,creator:r.creator,acquired:r.acquired,page:r.page,license:r.licenseURL,terms:r.terms,
  capture:r.capture,limitations:r.limitations+' '+limitations,
  defaults:{file:r.directURL,expectedSHA256:r.sha256,alphaFile:r.alphaFile,referenceFile:r.directURL,
   sourceStart:0,fps:24,cols:720,preserveAspect:true,blur:0,monochrome:true,loop:false,...defaults}};
}
const bulbCutting=clip('3797834','Plain hands cutting an ordinary bulb onion, with its layered cut face visible',
 'Recorded hand, blade, layered bulb and wooden support contact. Neutral everyday subjects with an ordinary knife. Framewise foreground segmentation removes unrelated surroundings with no added board/background patch. Source and matte share1920x1080 coordinates and25fps. Fixed captured view only. Source clocks0–14s progressively slice the same bulb. Both cutting preset names select this same verified source.',
 {sourceDuration:14,fps:25,crop:'1500:900:100:0',sourceTransfer:'srgb',sourceLevels:{blackPoint:0,whitePoint:0.35}});
export const ONION_MEDIA={'onion-cutting-bulb-media':bulbCutting,'onion-cutting-media':bulbCutting} as const;
