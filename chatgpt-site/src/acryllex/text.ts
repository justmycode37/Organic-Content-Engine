import {HUES,TEXT_GREY,resolveAt,estimateWords,type Scene,type TextItem,type Hue} from './spec.ts';
import {W,H,TS} from './format.ts';
import {ease,clamp,lerp} from './kit.ts';
import {sampleTextReveal,sampleTextLayout} from './keyframes.ts';
/** Authoring space is 1080x1920; map to the real frame. */
const X=(x:number)=>x/1080*W,Y=(y:number)=>y/1920*H;

export const COND='AcxCond',MONO='AcxMono',ROBOTO_MONO='AcxRobotoMono',OSWALD='AcxOswald',ROBOTO_CONDENSED='AcxRobotoCondensed';
export interface TextCtx {ctx:CanvasRenderingContext2D;t:number;dur:number;scene:Scene;hue:string;textColor?:string;palette?:Partial<Record<Hue,string>>;project:(id:string)=>{x:number;y:number}|null}

const hash=(n:number)=>{const x=Math.sin(n*91.7+12.3)*43758.5453;return x-Math.floor(x);};

const POS:Record<string,[number,number,CanvasTextAlign]>={
 top:[540,300,'center'],upper:[540,520,'center'],center:[540,960,'center'],lower:[540,1330,'center'],bottom:[540,1500,'center'],
 left:[90,960,'left'],right:[990,960,'right'],'top-left':[90,300,'left'],'top-right':[990,300,'right'],'bottom-left':[90,1440,'left'],'bottom-right':[990,1440,'right'],
};
const SIZE:Record<string,number>={headline:116,highlight:116,tag:84,prefix:116,number:300,label:54,mono:40};

interface Tok {text:string;hl:boolean;pre:number;w:number}

/** Typing speed (chars/s) per style; the reference types deliberately, ~12-16 chars per second. */
const CPS:Record<string,number>={headline:13,highlight:13,tag:14,prefix:14,number:18,label:18,mono:16,plate:13};
const DELETE_CPS=32;

/** A deletion may finish after a cut while its visible suffix disappears before it. */
export function textEnd(scene:Scene,value:TextItem['until'],dur:number){
 if(value===undefined)return dur-.04;
 const numeric=typeof value==='number'?value:typeof value==='string'&&/^-?\d+(?:\.\d+)?s?$/.test(value.trim())?parseFloat(value):NaN;
 return Number.isFinite(numeric)?Math.max(0,numeric):resolveAt(scene,value,dur,dur);
}

/** Characters visible for a typed item at time t (typing in, holding, deleting out). */
function deleteLength(total:number,override?:number){return override===undefined?Math.min(0.6,total/DELETE_CPS):clamp(override,.01,6);}
function visibleChars(total:number,t:number,start:number,end:number,cps:number,del:boolean,eraseDur?:number){
 if(t<start)return 0;
 const typed=Math.min(total,Math.floor((t-start)*cps)+1);
 if(!del)return typed;
 const delLen=deleteLength(total,eraseDur),delStart=end-delLen;
 if(t>=delStart)return Math.max(0,Math.min(typed,Math.ceil(total*(1-(t-delStart)/delLen))));
 return typed;
}

/** Dither glitch over a rectangle: letters break into scattered dots for a few frames (reference: EVOLVED / CHANGED / GO DEEPER). */
function glitchRect(ctx:CanvasRenderingContext2D,x0:number,y0:number,w:number,h:number,t:number,hue:string,size:number,grey='#cfcfcf',cellPixels?:number){
 const cell=cellPixels===undefined?Math.max(3,Math.round(size/16)):Math.max(1,Math.round(cellPixels));const frame=Math.floor(t*30);
 const transform=cellPixels===undefined?null:ctx.getTransform();
 const cellX=transform?cell/Math.max(1e-8,Math.hypot(transform.a,transform.b)):cell;
 const cellY=transform?cell/Math.max(1e-8,Math.hypot(transform.c,transform.d)):cell;
 for(let gy=-cellY*2;gy<h+cellY*2;gy+=cellY)for(let gx=-cellX*3;gx<w+cellX*3;gx+=cellX){
  const inside=gx>=0&&gx<w&&gy>=0&&gy<h;const r=hash(gx*0.37+gy*1.91+frame*7.7);
  if(inside&&r<0.42){ctx.fillStyle='#000';ctx.fillRect(x0+gx,y0+gy,cellX,cellY);}
  else if(!inside&&r>0.93){ctx.fillStyle=r>0.975?hue:grey;ctx.fillRect(x0+gx,y0+gy,cellX*0.6,cellY*0.6);}
 }
}

export function drawText(tc:TextCtx,item:TextItem){
 if(!item||typeof item.text!=='string'||!item.text.trim())return;
 const {ctx,t,dur,scene}=tc;
 const style=item.style??'headline';
 const textAt=(value:TextItem['at'],fallback:number)=>item.carry&&value!==undefined?textEnd(scene,value,dur):resolveAt(scene,value,dur,fallback);
 const start=textAt(item.at,0.1);
 const end=textEnd(scene,item.until,dur);
 if(t<start-(item.cursorLead??0)||t>end)return;
 const hue=item.hue?(tc.palette?.[item.hue]??HUES[item.hue as Hue]??tc.hue):tc.hue;
 const MIN:Record<string,number>={headline:40,highlight:40,tag:36,prefix:40,number:120,label:30,mono:20,plate:40};
 // step zoom keyframes (GO DEEPER grows on the beat)
 let zoom=1;for(const [za,zv] of item.zoom??[]){const zt=textAt(za,0);if(t>=zt){const k=ease.outBack(clamp((t-zt)/0.14));zoom=lerp(zoom,Number(zv)||1,k);}}
 const layoutKeys=item.keyframes?.map(k=>({...k,at:textAt(k.at,0)}));
 if(layoutKeys?.some(k=>k.zoom!==undefined))zoom=sampleTextLayout(layoutKeys,t,{pos:[0,0],zoom:1}).zoom;
 const size=Math.max(MIN[style]??30,Math.min(400,Number(item.size)||SIZE[style]||110))*TS*zoom;
 const mono=style==='mono';
 const raw=(mono?item.text:item.text.toUpperCase()).slice(0,90);
 ctx.save();
 ctx.filter=item.softness?`blur(${clamp(item.softness,0,3)}px)`:'none';
 const weight=Math.round(clamp(item.weight??(mono?400:600),100,900));
 const family=item.font==='oswald'?OSWALD:item.font==='roboto-condensed'?ROBOTO_CONDENSED:item.font==='roboto-mono'?ROBOTO_MONO:item.font==='plex-mono'?MONO:mono?MONO:COND;
 ctx.font=`${weight} ${size}px ${family}`;
 ctx.textBaseline='alphabetic';
 const hlWords=(item.highlight??'').toUpperCase().split(/\s+/).filter(Boolean);
 const words=raw.split(/\s+/).filter(Boolean);
 const toks:Tok[]=words.map(w=>{const clean=w.replace(/[^A-Z0-9'%$€.-]/gi,'').toUpperCase();
  const pre=hlWords.find(h=>h!==clean&&clean.startsWith(h)&&h.length<clean.length);
  return {text:w,hl:style==='highlight'&&!hlWords.length?true:hlWords.includes(clean),pre:pre?pre.length:0,w:ctx.measureText(w).width};});
 const space=ctx.measureText(' ').width*(mono?1:1.05);
 const prefixGap=size*0.12;
 for(const tk of toks)if(tk.pre)tk.w+=prefixGap;
 const horizontal=clamp(item.widthScale??1,.3,3);
 const maxW=(style==='number'?0.93:0.85)*W*zoom/horizontal;
 const lines:Tok[][]=[[]];let lw=0;
 for(const tk of toks){const add=(lines[lines.length-1]!.length?space:0)+tk.w;if(lw+add>maxW&&lines[lines.length-1]!.length){lines.push([]);lw=0;}lines[lines.length-1]!.push(tk);lw+=(lines[lines.length-1]!.length>1?space:0)+tk.w;}
 let [x,y,align]=Array.isArray(item.pos)?[Number(item.pos[0])||540,Number(item.pos[1])||960,'center' as CanvasTextAlign]:POS[item.pos??(style==='label'?'top':style==='mono'?'lower':'top')]??POS.top!;
 if(Array.isArray(item.pos)&&Math.abs(Number(item.pos[0]))<=1.5&&Math.abs(Number(item.pos[1]))<=1.5){x=Number(item.pos[0])*W;y=Number(item.pos[1])*H;align=item.align??'left';}else{x=X(x);y=Y(y);if(Array.isArray(item.pos)&&item.align)align=item.align;}
 if(layoutKeys?.some(k=>k.pos!==undefined)){const pos=sampleTextLayout(layoutKeys,t,{pos:[x/W,y/H],zoom:1}).pos;x=pos[0]*W;y=pos[1]*H;}
 if(item.zoomAnchor==='center'){const metrics=ctx.measureText(raw);y+=(metrics.actualBoundingBoxAscent-metrics.actualBoundingBoxDescent)*(1-1/zoom)*.5;}
 if(item.follow){const p=tc.project(item.follow);if(p){x=Math.max(W*0.11,Math.min(W*0.89,p.x));y=Math.max(H*0.08,p.y-40*TS);align='center';}}
 ctx.translate(x,0);ctx.scale(horizontal,1);x=0;
 const lineH=size*(mono?1.35:1.02);
 const total=toks.reduce((a,b)=>a+b.text.length,0)+Math.max(0,toks.length-1);
 const cps=Number(item.cps)||CPS[style]||13;
 const reveal=item.reveal?.length?sampleTextReveal(item.reveal.map(([at,count])=>[textAt(at,0),count]),t,total):null;
 const shown=reveal?.shown??visibleChars(total,t,start,end,cps,item.erase!==false,item.eraseDur);
 const padX=size*(item.boxPadding?.[0]??.1),padY=size*(item.boxPadding?.[1]??.07);
 const boxX=size*(item.boxOffset?.[0]??0),boxY=size*(item.boxOffset?.[1]??0);
 let count=0;
 const capH=item.font==='oswald'||item.font==='roboto-condensed'?ctx.measureText('H').actualBoundingBoxAscent:size*(mono?0.72:0.74);
 let cursorX=0,cursorY=0;
 const textCol=style==='tag'||style==='prefix'?'#0a0a0a':item.tint?hue:mono?'#cfcfcf':tc.textColor??TEXT_GREY;
 const fullW=Math.max(...lines.map(l=>l.reduce((a,b)=>a+b.w,0)+space*Math.max(0,l.length-1)));
 const lx=(width:number)=>align==='center'?x-width/2:align==='right'?x-width:x;
 const centreLines=align==='center'&&(item.pos==='center'||item.pos==='upper');
 const baseY=(li:number)=>y+li*lineH-(lines.length-1)*lineH*(centreLines?0.5:0);
 // black plate behind the whole line (reference: GO DEEPER over the tunnel)
 if(item.plate&&shown>0){ctx.fillStyle='rgba(0,0,0,0.92)';const px=size*.18,py=size*.06,metrics=ctx.measureText(raw);ctx.fillRect(lx(fullW)-px,baseY(0)-metrics.actualBoundingBoxAscent-py,fullW+px*2,(lines.length-1)*lineH+metrics.actualBoundingBoxAscent+metrics.actualBoundingBoxDescent+py*2);}
 lines.forEach((line,li)=>{
  const width=line.reduce((a,b)=>a+b.w,0)+space*Math.max(0,line.length-1);
  let cx=lx(width);const by=baseY(li);
  line.forEach((tk,ti)=>{
   if(ti>0){if(count<shown)count++;cx+=space;}
   const n=Math.max(0,Math.min(tk.text.length,shown-count));count+=tk.text.length;
   const fullyTyped=n>=tk.text.length;
   const boxed=style==='tag'||style==='prefix'||tk.hl;
   if(tk.pre&&n>0){
    // prefix box: the first letters sit in a hue box in dark ink, the rest follows in grey
    const pn=Math.min(n,tk.pre);const pw=ctx.measureText(tk.text.slice(0,pn)).width;
    if(item.prefixUntil===undefined||t<textAt(item.prefixUntil,dur)){
     ctx.fillStyle=hue;ctx.fillRect(cx-padX*0.5+boxX,by-capH-padY+boxY,pw+padX,capH+padY*2);
     ctx.fillStyle='#0a0a0a';ctx.fillText(tk.text.slice(0,pn),cx,by);
    }
    const pfull=ctx.measureText(tk.text.slice(0,tk.pre)).width;
    if(n>tk.pre){ctx.fillStyle=textCol;ctx.fillText(tk.text.slice(tk.pre,n),cx+pfull+prefixGap,by);}
    cursorX=cx+(n>tk.pre?pfull+prefixGap+ctx.measureText(tk.text.slice(tk.pre,n)).width:pw)+size*0.06;cursorY=by;cx+=tk.w;return;
   }
   if(boxed&&n>0){
    const partW=ctx.measureText(tk.text.slice(0,n)).width;
    const bw=(fullyTyped?tk.w:partW)+padX*2;
    ctx.fillStyle=style==='tag'?(tc.textColor??'#d0d0d0'):hue;
    ctx.fillRect(cx-padX+boxX,by-capH-padY+boxY,bw,capH+padY*2);
   }
   if(n>0){ctx.fillStyle=style==='number'?'#e8e8e8':textCol;if(tk.hl&&style!=='tag')ctx.fillStyle=tc.textColor??TEXT_GREY;ctx.fillText(tk.text.slice(0,n),cx,by);}
   if(n>0||count-tk.text.length<=shown){cursorX=cx+ctx.measureText(tk.text.slice(0,n)).width+(n?size*0.06:0);cursorY=by;}
   cx+=tk.w;
  });
 });
 // dither glitch: as the line lands, at listed moments and just before deletion
 {const landed=reveal?.typingDone??start+total/cps;const delStart=reveal?.deleteStart??end-deleteLength(total,item.eraseDur);
  const extra=(item.glitch??[]).map(g=>textAt(g,-9));
  const landGlitch=item.glitchOnLand??(style==='highlight'||style==='tag'||style==='plate'||!!item.highlight);
  const g=(landGlitch&&t>landed&&t<landed+0.1)||(!mono&&item.erase!==false&&item.until!==undefined&&t>delStart-0.1&&t<delStart)||extra.some(g0=>t>=g0&&t<g0+0.1);
  if(g&&style!=='number'&&total>1){const gw=item.glitchWord?(()=>{const tk=toks.find(k=>k.text.toUpperCase()===item.glitchWord!.toUpperCase());return tk?tk:null;})():null;
   if(gw){let cx2=lx(fullW);for(const tk of toks){if(tk===gw)break;cx2+=tk.w+space;}glitchRect(ctx,cx2-padX+(item.glitchBox?boxX:0),baseY(0)-capH-padY+(item.glitchBox?boxY:0),gw.w+padX*2,capH+padY*2,t,hue,size,tc.textColor,item.glitchCell);}
   else if(item.glitchBox)glitchRect(ctx,lx(fullW)-padX+boxX,baseY(0)-capH-padY+boxY,fullW+padX*2,(lines.length-1)*lineH+capH+padY*2,t,hue,size,tc.textColor,item.glitchCell);
   else glitchRect(ctx,lx(fullW),baseY(0)-capH-padY,fullW,lines.length*lineH,t,hue,size,tc.textColor,item.glitchCell);}}
 // typing cursor (hue bar): visible while typing/deleting and blinking briefly after
 const typingDone=reveal?.typingDone??start+total/cps;const deleting=reveal?.deleting??(item.until!==undefined&&t>end-deleteLength(total,item.eraseDur));
 const blink=Math.floor((t-(item.cursorPhase??0))/(Math.max(.1,item.cursorPeriod??1/3)*.5))%2===0;
 if(style!=='number'&&item.cursor!==false&&(t<typingDone||deleting||((item.cursorHold||t<typingDone+0.6)&&blink))){ctx.fillStyle=item.tint?(tc.textColor??'#d9d9d9'):hue;ctx.fillRect(cursorX,cursorY-capH-size*0.06,Math.max(2,size*(item.cursorWidth??.03)),capH+size*0.14);}
 ctx.restore();
}

/** Narration typed in small mono, synced to the spoken words (the reference's running line). */
export function drawCaptions(tc:TextCtx){
 const {ctx,t,dur,scene}=tc;
 const words=scene.words??estimateWords(scene.say,dur);if(!words.length)return;
 const groups:{text:string;start:number;end:number}[][]=[];let cur:{text:string;start:number;end:number}[]=[];let chars=0;
 for(const w of words){const add=w.text.length+(cur.length?1:0);if(cur.length&&(chars+add>30||cur.length>=6)){groups.push(cur);cur=[];chars=0;}cur.push(w);chars+=w.text.length+(cur.length>1?1:0);if(/[.!?;:,]$/.test(w.text)&&chars>12){groups.push(cur);cur=[];chars=0;}}
 if(cur.length)groups.push(cur);
 let gi=-1;for(let i=0;i<groups.length;i++)if(t>=groups[i]![0]!.start-0.05)gi=i;
 if(gi<0)return;
 const g=groups[gi]!;const nextStart=groups[gi+1]?.[0]?.start??dur;
 if(t>nextStart)return;
 let text='';
 for(const w of g){if(t<w.start-0.03)break;const k=Math.min(1,(t-w.start+0.03)/Math.max(0.08,(w.end-w.start)*0.8));text+=(text?' ':'')+w.text.slice(0,Math.max(1,Math.ceil(w.text.length*k)));}
 ctx.save();ctx.font=`${40*TS}px ${MONO}`;ctx.textAlign='left';ctx.textBaseline='alphabetic';
 const full=g.map(w=>w.text).join(' ');const fw=ctx.measureText(full).width;const x=W/2-fw/2,y=H*0.896;
 ctx.fillStyle='#d2d2d2';ctx.fillText(text,x,y);
 const cw=ctx.measureText(text).width;
 if(Math.floor(t*5)%2===0||text.length<full.length){ctx.fillStyle=tc.hue;ctx.fillRect(x+cw+6*TS,y-30*TS,4*TS,38*TS);}
 ctx.restore();
}
