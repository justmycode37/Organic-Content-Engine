/** Preparation identity shared by Node and browser. Playback start/speed do not change atlas pixels. */
export function footageVariantKey(file:string,params:Record<string,unknown>={}){
 const number=(key:string,fallback:number|null)=>{
  const value=params[key];if(value===undefined)return fallback;
  const n=Number(value);if(!Number.isFinite(n))throw new Error(`footage ${key} must be finite`);return n;
 };
 return 'footage:'+file+':'+JSON.stringify([
  number('cols',null),number('rows',null),number('fps',30),String(params.crop??''),number('blur',1.2),
  params.monochrome===true,number('sourceStart',0),number('sourceDuration',null),params.preserveAspect===true,
  String(params.alphaFile??''),params.invertAlpha===true,
  params.mirrorX===true,params.mirrorY===true,
  number('sampleScale',1),
 ]);
}
