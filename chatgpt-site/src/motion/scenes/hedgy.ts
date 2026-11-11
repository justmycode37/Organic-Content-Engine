import {PHONE_MATERIALS} from '../detailed-phone.ts';
import {clamp,ease,type SceneDef,type HedgyProps,type Frame} from '../core.ts';
import {pixelText,pixelWidth} from '../prim.ts';
import {render3d,voxels,box,merge,place,type Mesh,type Object3D} from '../three.ts';
import {model} from '../models.ts';
import {iconMesh} from '../icon3d.ts';
const RED=['#210908','#601511','#a32922','#db4b40','#ff8276'];
const GREEN=['#071d0d','#154d24','#287e3d','#49b45f','#9be9a8'];
const shield=voxels(['111111111','111111111','112222211','112222211','112222211',' 1111111 ','  11111  ','   111   ','    1    '],3,2.4);
function label(f:Frame,value:string,y:number,max=760,size=9,color='#fff'){let px=size;while(pixelWidth(value,px)>max&&px>3)px-=.5;pixelText(f.ctx,value,(1080-pixelWidth(value,px))/2,y,px,{color});}
function draw(f:Frame,objects:Object3D[],x:number,y:number,w:number,h:number,zoom:number,palette?:string[]){render3d(f.ctx,f.theme,{x,y,w,h,zoom,yaw:.45+Math.sin(f.t*.75)*.15,pitch:.3+Math.sin(f.t*.4)*.05,distance:10,cell:4,outline:true,palette},objects);}
function hedgehog(f:Frame,x:number,y:number,size:number,p:number,action:'shock'|'protect'|'watch'='watch'){
 const sprite=['     a a a         ','   aabaaabaa       ','  aababababaa      ',' aabababababaaa    ','aababababababaa    ',' aaabababccccccc   ','  aaabaccccccdcc   ','   aaaccccccccccce ','    aaccccccccccee ','     ccccccccccc   ','      bbc   bbc    '];
 const colours:Record<string,string>={a:'#65432f',b:'#936744',c:'#c99a6b',d:'#17130f',e:'#3e2b22'};
 const walk=action==='protect'?ease.outCubic(clamp(f.t/1.7)):0;
 const recoil=action==='shock'?Math.sin(clamp((f.t-.4)/.6)*Math.PI)*22:0;
 x+=walk*55-recoil;y+=action==='shock'?Math.min(20,f.t*7):Math.sin(f.t*9)*4*walk;
 const unit=Math.max(6,Math.floor(size/21)),xx=x+(size-18*unit)/2,yy=y+(size-11*unit)/2;
 f.ctx.save();f.ctx.globalAlpha=p;
 f.ctx.translate(xx+size/2,yy+size/3);f.ctx.rotate(action==='shock'?-recoil/160:0);f.ctx.translate(-(xx+size/2),-(yy+size/3));
 // Flat sprite on every frame: a thin knockout silhouette keeps it legible over charts.
 sprite.forEach((row,j)=>[...row].forEach((v,i)=>{if(v!==' '){f.ctx.fillStyle='#000';f.ctx.fillRect(xx+i*unit-4,yy+j*unit-4,unit+8,unit+8)}}));
 sprite.forEach((row,j)=>[...row].forEach((v,i)=>{if(colours[v]){f.ctx.fillStyle=colours[v];f.ctx.fillRect(xx+i*unit,yy+j*unit,unit,unit)}}));
 // Independent eyes, expression, paws and walking feet make Hedgy an actor, not an overlay.
 const eyeX=xx+13*unit,eyeY=yy+6*unit;f.ctx.fillStyle='#c99a6b';f.ctx.fillRect(eyeX,eyeY,unit,unit);
 f.ctx.fillStyle='#17130f';
 if(action==='shock'&&f.t>1){f.ctx.fillRect(eyeX-2,eyeY+3,unit+4,3);f.ctx.fillRect(eyeX+unit/2,eyeY-1,3,unit+4);}
 else f.ctx.fillRect(eyeX,eyeY,unit,(Math.sin(f.t*2.4)>.98)?3:unit);
 f.ctx.fillStyle='#936744';
 const step=action==='protect'&&f.t<1.8?Math.sin(f.t*14)*unit*.5:0;
 f.ctx.fillRect(xx+6*unit+step,yy+10*unit,unit*2,unit);f.ctx.fillRect(xx+11*unit-step,yy+10*unit,unit*2,unit);
 if(action==='protect'){f.ctx.fillStyle='#edc99b';f.ctx.fillRect(xx+16*unit,yy+8*unit-unit*walk,unit*(1+walk),unit);}
 f.ctx.restore();
}
function graphMesh(drop:boolean,p:number):Mesh{
 const ys=drop?[.1,.5,.3,.95,-.5,-.85]:[-.7,-.3,-.45,.25,.1,.9];
 const chunks:Mesh[]=[];for(let i=0;i<ys.length-1;i++){const y1=ys[i]!,y2=ys[i+1]!,steps=10;for(let k=0;k<steps;k++){if((i+k/steps)/5>p)break;chunks.push(place(box(.13,.13,.17),{pos:[-1.25+i*.5+k*.05,y1+(y2-y1)*k/steps,0]}));}}
 return merge(...chunks);
}
/** A connected analogy: familiar protection -> stock worry -> contract -> consequence. */
function storyScene(f:Frame,s:HedgyProps){
 const t=f.t,progress=clamp(t/Math.max(1,f.dur)),enter=ease.outCubic(clamp(t/.55));
 const at=(kind:string,fallback:number)=>s.events?.find(e=>e.kind===kind)?.at??fallback;
 const phase=(kind:string,fallback:number,span=.8)=>ease.outCubic(clamp((t-at(kind,fallback))/span));
 const hero=(objects:Object3D[],palette?:string[])=>draw(f,objects,100,430,880,740,230,palette);
 if(s.story==='phone'){
 // The case slides around a recognisable phone; it is the concrete analogy, not another title card.
 const fit=ease.outCubic(clamp((t-.3)/1.1));
 const casing=merge(place(box(.14,2.7,.22),{pos:[-.77,0,0]}),place(box(.14,2.7,.22),{pos:[.77,0,0]}),place(box(1.55,.14,.22),{pos:[0,-1.3,0]}),place(box(1.55,.14,.22),{pos:[0,1.3,0]}));
 render3d(f.ctx,f.theme,{x:100,y:430,w:880,h:740,zoom:230,yaw:.30+Math.sin(t*.55)*.16,pitch:.16,distance:10,cell:2,outline:true},[{mesh:model('phone'),materials:PHONE_MATERIALS},{mesh:casing,pos:[(1-fit)*2.1,0,.15],materials:[{tone:.9}],scale:1-fit*.05}]);
 }else if(s.story==='worry'){
 const imagined=progress>.6;
 draw(f,[{mesh:graphMesh(imagined,enter),materials:[{tone:1}]}],300,450,680,650,205,imagined?RED:GREEN);
 hedgehog({...f,t:imagined?(progress-.6)*3:t*.8},110,800,370,enter,imagined?'shock':'watch');
 }else if(s.story==='put'){
 const protect=phase('protect',.3,1);
 draw(f,[{mesh:iconMesh('file'),materials:[{tone:1}],pos:[-protect*.9,.2,0],rot:[0,.2,0],scale:.8},{mesh:shield,pos:[1-protect*.7,-.1,-.3],materials:[{tone:.9}],scale:.5+protect*.4,reveal:protect}],100,450,880,680,210);
 label(f,'PUT = PROTECTION',1120,760,7);
 }else if(s.story==='cushion'){
 const crash=phase('crash',.45,.75),pay=phase('payout',1.3,1);
 // The stock visibly falls; support arrives underneath rather than pretending the fall never happened.
 draw(f,[{mesh:graphMesh(true,crash),materials:[{tone:1}],pos:[0,-crash*.3,0]}],300,430,680,650,200,RED);
 draw(f,[{mesh:shield,materials:[{tone:1}],rot:[0,0,Math.PI/2],pos:[0,(1-pay)*-2,0],scale:.85,reveal:pay}],300,650,680,450,175);
 hedgehog({...f,t:Math.max(0,t-at('crash',.45))},90,800-pay*30,350,enter,pay>.7?'watch':'shock');
 }else if(s.story==='gain'){
 const rise=phase('rise',.35,1.2),fee=phase('deduct',1.8,1);
 hero([{mesh:graphMesh(false,rise),materials:[{tone:1}]}],GREEN);
 // A real part of the profit leaves the picture on the spoken word “minus”.
 draw(f,[{mesh:model('coin'),scale:.42,rot:[0,t*1.4,0],pos:[fee*2.6,-.2,0],materials:[{tone:1}],reveal:rise}],300,730,520,350,140);
 }else{
 // Close on the same stock, still owned, behind the same protection.
 draw(f,[{mesh:graphMesh(false,1),materials:[{tone:1}],scale:.8}],270,430,680,650,190,GREEN);
 draw(f,[{mesh:shield,materials:[{tone:1}],reveal:enter,scale:1.05}],170,600,680,500,175);
 label(f,'KEEP THE STOCK. SOFTEN THE HIT.',1150,780,6);
 }
}
/** Narration events are resolved from actual TTS word timestamps by arrange(). */
function actionScene(f:Frame,s:HedgyProps){
 const at=(kind:string,fallback:number)=>s.events?.find(e=>e.kind===kind)?.at??fallback;
 const phase=(kind:string,fallback:number,duration=.65)=>ease.outCubic(clamp((f.t-at(kind,fallback))/duration));
 const t=f.t,enter=ease.outCubic(clamp(t/.35));
 const view=(objects:Object3D[],palette?:string[])=>draw(f,objects,150,490,780,570,155,palette);
 const cubes=(count:number,cols:number,progress=1)=>Array.from({length:count},(_,i)=>({mesh:box(.24,.24,.17),pos:[(i%cols-(cols-1)/2)*.31,(Math.floor((count-1)/cols)/2-Math.floor(i/cols))*.31+(1-clamp(progress*count-i))*1.5,0] as [number,number,number],scale:clamp(progress*count-i),materials:[{tone:i%3===0?1:.8}]}));
 if(s.action==='buy'){
 const p=phase('buy',.2,1.25);view(cubes(100,10,p));
 label(f,String(Math.round(p*100))+' SHARES',1030,600,8);
 }else if(s.action==='contract'){
 const open=phase('open',1.1,.6),build=phase('contract',.15,.45);
 const frame=merge(place(box(.2,2.4,.35),{pos:[-1,0,0]}),place(box(.2,2.4,.35),{pos:[1,0,0]}),place(box(2.2,.2,.35),{pos:[0,1.1,0]}));
 draw(f,[{mesh:frame,reveal:build,materials:[{tone:1}]},{mesh:box(1.8,2.1,.12),rot:[0,-open*1.5,0],pos:[open*.75,0,open*.5],materials:[{tone:.7}]}],450,510,480,550,145);
 if(s.mascot)hedgehog({...f,t:t*1.4},100+open*120,680,330,enter,'protect');
 label(f,'SELL AT $95',1030,700,9);
 }else if(s.action==='premium'){
 const p=phase('deduct',.3,.9);view(Array.from({length:3},(_,i)=>({mesh:model('coin'),scale:.38,rot:[0,t*2+i,0],pos:[(i-1)*.9+p*3,.1+Math.sin(p*Math.PI)*.7,0],materials:[{tone:1}]})));
 label(f,'-$'+Math.round(p*300),1000,700,13,'#ff8276');
 }else if(s.action==='crash'||s.action==='expiry'){
 const p=phase('crash',.6,.7);draw(f,[{mesh:graphMesh(true,p),materials:[{tone:1}]}],s.mascot?330:160,490,650,610,180,RED);
 if(s.mascot){hedgehog({...f,t:Math.max(0,t-at('crash',.6))},100,690,330,enter,'shock');
 const shieldP=phase('shield',1.7,.35);if(shieldP>0)draw(f,[{mesh:shield,reveal:shieldP,materials:[{tone:1}]}],370,540,400,440,120);}
 label(f,s.action==='expiry'?'$'+Math.round(100-30*p):'-$'+Math.round(3000*p-2200*phase('shield',1.7,.5)),1030,700,12,'#ff8276');
 }else if(s.action==='payout'){
 const pay=phase('payout',.4,.8),cancel=phase('cancel',1.3,.65);
 const red=cubes(30,6,1).map((o,i)=>({...o,scale:i<5?1:1-cancel}));
 draw(f,red,130,500,390,530,125,RED);
 const green=cubes(25,5,pay).map(o=>({...o,pos:[o.pos[0]-cancel*2.2,o.pos[1],o.pos[2]] as [number,number,number],scale:1-cancel}));
 draw(f,green,530,500,390,530,125,GREEN);
 label(f,'+$'+Math.round(2500*pay),1030,700,12,'#9be9a8');
 }else if(s.action==='net'){
 const fee=phase('deduct',.25,.6),total=phase('total',1.1,.4);
 view(cubes(5+Math.round(3*fee),4,1),RED);
 label(f,total>.1?'TOTAL LOSS: $800':'$500 + $'+Math.round(300*fee),1030,760,10,'#ff8276');
 }else{
 const rise=phase('rise',.4,.8),deduct=phase('deduct',1.5,.8);
 const objects=cubes(20,5,rise).map((o,i)=>({...o,pos:[o.pos[0]+(i>=17?deduct*3:0),o.pos[1]+(i>=17?Math.sin(deduct*Math.PI):0),o.pos[2]] as [number,number,number],scale:i>=17?1-deduct:o.scale}));
 view(objects,GREEN);label(f,'PROFIT: $'+Math.round(2000*rise-300*deduct),1030,760,11,'#9be9a8');
 }
}
export const hedgyScene:SceneDef<HedgyProps>={type:'hedgy',render(f,s){
 const c=f.ctx,p=ease.outCubic(clamp(f.t/1.05)),bob=Math.sin(f.t*2)*10;
 label(f,s.headline,310,800,12);
 if(s.action==='story'){storyScene(f,s);return;}
 if(s.action){actionScene(f,s);if(s.label)label(f,s.label,1140,780,7);if(s.secondary)label(f,s.secondary,1220,780,5);return;}
 // A single hero assembly, or two clearly separated actors; depth and motion supply complexity.
 if(s.beat==='risk'||s.beat==='drop'){
 draw(f,[{mesh:graphMesh(s.beat==='drop',p),materials:[{tone:1}],rot:[0,0,0]}],s.mascot?340:220,500,650,650,175,s.beat==='drop'?RED:GREEN);
 if(s.mascot)hedgehog(f,160,790+bob,330,p,s.beat==='drop'?'shock':'watch');
 }else if(s.beat==='hedge'){
 draw(f,[{mesh:shield,materials:[{tone:1}],rot:[0,Math.sin(f.t)*.12,0],reveal:p}],500,590,440,500,150);
 if(s.mascot)hedgehog(f,160,730+bob,430,p,'protect');
 }else if(s.beat==='offset'){
 const grow=clamp(f.t/1.2);draw(f,[{mesh:box(.65,2.7*grow+.01,.65),materials:[{tone:1}],pos:[0,-1.35*grow,0]}],200,520,340,520,100,RED);
 draw(f,[{mesh:box(.65,2.25*grow+.01,.65),materials:[{tone:1}],pos:[0,1.125*grow,0]}],540,520,340,520,100,GREEN);
 }else if(s.beat==='cost'){
 // One spinning coin: no UI cards or labels attached to every surface.
 draw(f,[{mesh:model('coin'),materials:[{tone:.9},{tone:1},{tone:.4},{tone:1},{tone:.2}],rot:[0,f.t*.9,0],reveal:p}],250,510+bob,580,620,190);
 }else{
 // Rising stock with a tangible floor beneath it: protection keeps a cost.
 draw(f,[{mesh:graphMesh(false,p),materials:[{tone:1}]}],245,490,590,620,165,GREEN);
 draw(f,[{mesh:box(2.8,.13,.8),materials:[{tone:1}],reveal:p}],245,900,590,200,165);
 }
 if(s.label)label(f,s.label,1120,780,8);if(s.secondary)label(f,s.secondary,1210,780,6);
 },cues:(s,dur)=>{
 if(s.action==='story'){
  const accents:Partial<Record<NonNullable<HedgyProps['story']>,{t:number;kind:'tick'|'pop'|'shimmer'}[]>>={phone:[{t:.32,kind:'tick'},{t:1.4,kind:'pop'}],worry:[{t:.7,kind:'tick'}],put:[],cushion:[],gain:[],backup:[]};
  return [...(accents[s.story??'backup']??[]),...(s.events??[]).map(e=>({t:e.at,kind:(e.kind==='crash'?'impact':e.kind==='payout'?'shimmer':e.kind==='deduct'?'tick':'pop') as 'impact'|'shimmer'|'tick'|'pop'}))].filter(e=>e.t<dur);
 }
 return [{t:.06,kind:'swish'},...Array.from({length:Math.min(6,Math.floor(dur/.45))},(_,i)=>({t:.25+i*.4,kind:'tick' as const})),...(s.events??[]).map(e=>({t:e.at,kind:(e.kind==='crash'?'impact':'pop') as 'impact'|'pop'}))];
}};
