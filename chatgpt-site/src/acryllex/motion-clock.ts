/**
 * Sample a scene's motion on a global frame clock. Text and scene cuts keep their
 * original timing. Omitting fps returns the input bit-for-bit unchanged.
 */
export function sampleMotionTime(local:number,sceneStart:number,fps?:number,phase=0):number{
 if(!(fps&&Number.isFinite(fps)&&fps>0))return local;
 const offset=Number.isFinite(phase)?phase:0;
 const frame=(sceneStart+local-offset)*fps;
 // Correct only rounding at a clock boundary; this does not change text/event samplers.
 const ulp=Number.EPSILON*Math.max(1,Math.abs(frame))*4;
 return Math.max(0,(Math.floor(frame+ulp)/fps+offset)-sceneStart);
}
