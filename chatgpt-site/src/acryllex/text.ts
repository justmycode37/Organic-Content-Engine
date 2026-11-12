import {HUES,TEXT_GREY,resolveAt,estimateWords,type Scene,type TextItem,type Hue} from './spec.ts';

export const COND='AcxCond',MONO='AcxMono';
export interface TextCtx {ctx:CanvasRenderingContext2D;t:number;dur:number;scene:Scene;hue:string;project:(id:string)=>{x:number;y:number}|null}

const TYPE_CPS=34,DELETE_CPS=70;
const hash=(n:number)=>{const x=Math.sin(n*91.7+12.3)*43758.5453;return x-Math.floor(x);};

const POS:Record<string,[number,number,CanvasTextAlign]>={
 top:[540,300,'center'],upper:[540,520,'center'],center:[540,960,'center'],lower:[540,1330,'center'],bottom:[540,1500,'center'],
 left:[90,960,'left'],right:[990,960,'right'],'top-left':[90,300,'left'],'top-right':[990,300,'right'],'bottom-left':[90,1440,'left'],'bottom-right':[990,1440,'right'],
};
const SIZE:Record<string,number>={headline:116,highlight:116,tag:84,prefix:116,number:300,label:54,mono:40};

interface Tok {text:string;hl:boolean;w:number}

/** Characters visible for a typed item at time t (typing in, holding, deleting out). */
function visibleChars(total:number,t:number,start:number,end:number){
 if(t<start)return 0;
 const typed=Math.min(total,Math.floor((t-start)*TYPE_CPS)+1);
 const delLen=Math.min(0.5,total/DELETE_CPS),delStart=end-delLen;
 if(t>=delStart)return Math.max(0,Math.min(typed,Math.ceil(total*(1-(t-delStart)/delLen))));
 return typed;
}

export function drawText(tc:TextCtx,item:TextItem){
 if(!item||typeof item.text!=='string'||!item.text.trim())return;
 const {ctx,t,dur,scene}=tc;
 const style=item.style??'headline';
 const start=resolveAt(scene,item.at,dur,0.1);
 const end=item.until!==undefined?resolveAt(scene,item.until,dur,dur):dur-0.04;
 if(t<start||t>end)return;
 const hue=item.hue?(HUES[item.hue as Hue]??tc.hue):tc.hue;
 const size=Math.max(24,Math.min(400,Number(item.size)||SIZE[style]||110));
 const mono=style==='mono';
 const raw=(mono?item.text:item.text.toUpperCase()).slice(0,90);
 ctx.save();
 ctx.font=mono?`${size}px ${MONO}`:`600 ${size}px ${COND}`;
 ctx.textBaseline='alphabetic';
 // tokens with highlight flags
 const hlWords=(item.highlight??'').toUpperCase().split(/\s+/).filter(Boolean);
 const words=raw.split(/\s+/).filter(Boolean);
 const toks:Tok[]=words.map(w=>({text:w,hl:style==='highlight'&&!hlWords.length?true:hlWords.includes(w.replace(/[^A-Z0-9'%$€.-]/gi,'').toUpperCase()),w:ctx.measureText(w).width}));
 const space=ctx.measureText(' ').width*(mono?1:1.05);
 const maxW=style==='number'?1000:920;
 // wrap
 const lines:Tok[][]=[[]];let lw=0;
 for(const tk of toks){const add=(lines[lines.length-1]!.length?space:0)+tk.w;if(lw+add>maxW&&lines[lines.length-1]!.length){lines.push([]);lw=0;}lines[lines.length-1]!.push(tk);lw+=(lines[lines.length-1]!.length>1?space:0)+tk.w;}
 let [x,y,align]=Array.isArray(item.pos)?[Number(item.pos[0])||540,Number(item.pos[1])||960,'center' as CanvasTextAlign]:POS[item.pos??(style==='label'?'top':style==='mono'?'lower':'top')]??POS.top!;
 if(item.follow){const p=tc.project(item.follow);if(p){x=Math.max(120,Math.min(960,p.x));y=Math.max(160,p.y-40);align='center';}}
 const lineH=size*(mono?1.35:1.02);
 const total=toks.reduce((a,b)=>a+b.text.length,0)+Math.max(0,toks.length-1);
 const shown=visibleChars(total,t,start,end);
 const padX=size*0.12,padY=size*0.08;
 let count=0;
 const capH=size*(mono?0.72:0.74);
 let cursorX=0,cursorY=0;
 lines.forEach((line,li)=>{
  const width=line.reduce((a,b)=>a+b.w,0)+space*Math.max(0,line.length-1);
  let cx=align==='center'?x-width/2:align==='right'?x-width:x;
  const by=y+li*lineH-(lines.length-1)*lineH*(align==='center'&&(item.pos==='center'||item.pos==='upper')?0.5:0);
  line.forEach((tk,ti)=>{
   if(ti>0){if(count<shown)count++;cx+=space;}
   const n=Math.max(0,Math.min(tk.text.length,shown-count));count+=tk.text.length;
   const fullyTyped=n>=tk.text.length;
   const boxed=style==='tag'||style==='prefix'||tk.hl;
   if(boxed&&n>0){
    // the box snaps in when the word is complete; while typing it grows with the letters
    const partW=ctx.measureText(tk.text.slice(0,n)).width;
    const bw=(fullyTyped?tk.w:partW)+padX*2;
    ctx.fillStyle=style==='tag'?'#dcdcdc':hue;
    const age=t-(start+(count-tk.text.length+n)/TYPE_CPS);
    const glitch=tk.hl&&fullyTyped&&age<0.2;
    if(glitch){for(let s=0;s<6;s++){const sy=by-capH-padY+s*(capH+padY*2)/6;const off=(hash(s+Math.floor(t*30))-0.5)*size*0.35;ctx.fillRect(cx-padX+off,sy,bw,(capH+padY*2)/6+1);}}
    else ctx.fillRect(cx-padX,by-capH-padY,bw,capH+padY*2);
   }
   if(n>0){
    ctx.fillStyle=style==='tag'||style==='prefix'?'#0a0a0a':mono?'#cfcfcf':TEXT_GREY;
    if(style==='number')ctx.fillStyle='#e8e8e8';
    ctx.fillText(tk.text.slice(0,n),cx,by);
   }
   if(n>0||count-tk.text.length<=shown){cursorX=cx+ctx.measureText(tk.text.slice(0,n)).width+(n?size*0.06:0);cursorY=by;}
   cx+=tk.w;
  });
 });
 // typing cursor (hue bar), visible while typing and briefly after
 const typingDone=start+total/TYPE_CPS;
 if(style!=='number'&&t<typingDone+0.45&&Math.floor(t*6)%2===0||t<typingDone){ctx.fillStyle=hue;ctx.fillRect(cursorX,cursorY-capH-size*0.06,Math.max(4,size*0.045),capH+size*0.14);}
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
 ctx.save();ctx.font=`40px ${MONO}`;ctx.textAlign='left';ctx.textBaseline='alphabetic';
 const full=g.map(w=>w.text).join(' ');const fw=ctx.measureText(full).width;const x=540-fw/2,y=1720;
 ctx.fillStyle='#d2d2d2';ctx.fillText(text,x,y);
 const cw=ctx.measureText(text).width;
 if(Math.floor(t*5)%2===0||text.length<full.length){ctx.fillStyle=tc.hue;ctx.fillRect(x+cw+6,y-30,4,38);}
 ctx.restore();
}
