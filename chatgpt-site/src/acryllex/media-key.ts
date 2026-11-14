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
  number('sampleScale',1),params.backgroundKey===undefined?null:backgroundKey(params.backgroundKey),
 ]);
}

/** Explicit source preparation for uniformly lit product/photo backdrops; never guessed segmentation. */
export function backgroundKey(value:unknown){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('footage backgroundKey must be {color,similarity?,blend?}');
 const v=value as Record<string,unknown>;
 if(Object.keys(v).some(k=>!['color','similarity','blend'].includes(k))||typeof v.color!=='string'||!/^#[\da-f]{6}$/i.test(v.color))throw new Error('footage backgroundKey color must be #RRGGBB');
 const similarity=v.similarity??.03,blend=v.blend??.01;
 if(typeof similarity!=='number'||!Number.isFinite(similarity)||similarity<.01||similarity>.2||typeof blend!=='number'||!Number.isFinite(blend)||blend<0||blend>.2)throw new Error('footage backgroundKey similarity must be .01...2 and blend 0...2');
 return {color:v.color.toLowerCase(),similarity,blend};
}
