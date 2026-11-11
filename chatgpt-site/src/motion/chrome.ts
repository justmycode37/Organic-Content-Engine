import {type Frame,type ReelSpec} from './core.ts';
import {pixelText} from './prim.ts';
export function drawChrome(frame:Frame,spec:ReelSpec,_time:number,_duration:number){
 if(spec.series?.startsWith('HEDGY'))return;
 pixelText(frame.ctx,spec.series??'ORGANIC',96,160,4,{color:frame.theme.muted});
}
