/**
 * Output format (live bindings). Portrait reels are 1080x1920; any size works (e.g. a 16:9 band).
 * CELL is the dot pitch in px. TS scales all type (sizes are authored for a 1080 px wide frame).
 */
export let W=1080,H=1920,CELL=3,COLS=W/CELL,ROWS=H/CELL,TS=1;
export const SS=3;
export interface Format {width?:number;height?:number;cell?:number;textScale?:number}
export function setFormat(f:Format={}){
 W=Math.round(Math.min(3840,Math.max(160,Number(f.width)||1080)));H=Math.round(Math.min(3840,Math.max(160,Number(f.height)||1920)));
 CELL=Math.min(24,Math.max(1,Number(f.cell)||3));
 // A fractional pitch must not change the requested frame or its aspect ratio.
 COLS=Math.ceil(W/CELL);ROWS=Math.ceil(H/CELL);
 TS=(Number(f.textScale)||1)*W/1080;
}
