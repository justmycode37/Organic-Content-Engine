import { Grid, PAL, type Pt } from '../kit/pixel';
import { drawSprite, type Sprite } from '../kit/sprite';

type Ctx=CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D;
type Base={x:number;y:number;t?:number;rot?:number;scale?:number;alpha?:number};
export const EVERYDAY_ANCHOR=[0.5,0.5] as const;
export const APPLE_SIZE={w:330,h:330} as const,APPLE_CRATE_SIZE={w:450,h:360} as const,LEMONADE_STAND_SIZE={w:450,h:600} as const,PIZZA_SIZE={w:492,h:420} as const,CAR_SIZE={w:510,h:300} as const,PHONE_SIZE={w:276,h:450} as const,CART_SIZE={w:480,h:360} as const,GIFT_SIZE={w:330,h:330} as const,KEY_SIZE={w:420,h:180} as const,BULB_SIZE={w:330,h:420} as const,WEATHER_SIZE={w:480,h:390} as const,TREE_SIZE={w:390,h:420} as const,SNOWBALL_SIZE={w:300,h:300} as const,LADDER_SIZE={w:270,h:480} as const,BRIDGE_SIZE={w:510,h:300} as const;

const FONT:Record<string,readonly string[]>={
  A:['010','101','111','101','101'],B:['110','101','110','101','110'],C:['011','100','100','100','011'],D:['110','101','101','101','110'],E:['111','100','110','100','111'],F:['111','100','110','100','100'],G:['011','100','101','101','011'],H:['101','101','111','101','101'],I:['111','010','010','010','111'],J:['001','001','001','101','010'],K:['101','101','110','101','101'],L:['100','100','100','100','111'],M:['10001','11011','10101','10101','10101'],N:['1001','1101','1011','1001','1001'],O:['111','101','101','101','111'],P:['110','101','110','100','100'],Q:['111','101','101','111','001'],R:['110','101','110','101','101'],S:['011','100','010','001','110'],T:['111','010','010','010','010'],U:['101','101','101','101','111'],V:['101','101','101','101','010'],W:['10001','10001','10101','10101','01010'],X:['101','101','010','101','101'],Y:['101','101','010','010','010'],Z:['111','001','010','100','111'],
  0:['111','101','101','101','111'],1:['010','110','010','010','111'],2:['110','001','010','100','111'],3:['110','001','010','001','110'],4:['101','101','111','001','001'],5:['111','100','110','001','110'],6:['011','100','110','101','010'],7:['111','001','010','010','010'],8:['010','101','010','101','010'],9:['010','101','011','001','110'],'$':['010','111','100','111','010'],'.':['000','000','000','000','010'],'-':['000','000','111','000','000'],
};
const cleanText=(value:string,max=12)=>value.toUpperCase().replace(/[^A-Z0-9 $.-]/g,' ').trim().slice(0,max);
function textWidth(value:string,cell=2,gap=1){return [...value].reduce((w,ch)=>w+(ch===' '?3*cell:(Math.max(...(FONT[ch]??['111']).map(row=>row.length))+gap)*cell),-gap*cell);}
function pixelText(g:Grid,value:string,cx:number,y:number,color:string,cell=2,gap=1){
  const text=cleanText(value),width=textWidth(text,cell,gap);let x=Math.floor(cx-width/2);
  for(const ch of text){if(ch===' '){x+=3*cell;continue;}const glyph=FONT[ch]??['111'];for(let yy=0;yy<glyph.length;yy++)for(let xx=0;xx<glyph[yy]!.length;xx++)if(glyph[yy]![xx]==='1')g.rect(x+xx*cell,y+yy*cell,cell,cell,color);x+=(Math.max(...glyph.map(row=>row.length))+gap)*cell;}
}
function poly(g:Grid,points:number[][],color:string){g.poly(points.map(([x,y])=>({x:x!,y:y!} as Pt)),color);}
function make(key:string,cols:number,rows:number,paint:(g:Grid)=>void,outline=true):Sprite{const g=new Grid(cols,rows);paint(g);if(outline)g.outline(PAL.ink);return g.sprite(`everyday:${key}:round2`);}
const spriteCache=new Map<string,Sprite>();
function cached(key:string,build:()=>Sprite){let s=spriteCache.get(key);if(!s){s=build();spriteCache.set(key,s);}return s;}
function draw(ctx:Ctx,s:Sprite,o:Base,anchor:readonly [number,number]=EVERYDAY_ANCHOR){drawSprite(ctx,s,o.x,o.y,{anchor:[anchor[0],anchor[1]],scale:o.scale,rot:o.rot,alpha:o.alpha});}
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));

// Apple and crate: saturated red fruit, a green leaf, warm timber.
const apple=make('apple-red',55,55,g=>{
  g.ellipse(27,32,22,19,PAL.red3);g.ellipse(21,31,15,18,PAL.red2);g.ellipse(34,31,15,18,PAL.red2);g.ellipse(21,28,8,10,PAL.red1);g.ellipse(23,25,4,6,PAL.pink1);
  g.rect(26,11,4,7,PAL.wood4);g.rect(27,12,2,6,PAL.wood1);
  poly(g,[[29,14],[35,7],[45,5],[42,12],[35,16]],PAL.green3);poly(g,[[31,13],[37,8],[43,7],[40,11],[34,14]],PAL.green1);
});
export function drawApple(ctx:Ctx,o:Base){draw(ctx,apple,o);}
function crateSprite(items:number){return cached(`apple-crate-${items}`,()=>make(`apple-crate-${items}`,75,60,g=>{
  // Apples peek over the broad front rim.
  for(let i=0;i<items;i++){
    const x=17+(i%5)*11,y=22-(i>4?3:0);
    g.ellipse(x,y,7,8,PAL.ink);g.ellipse(x-1,y-1,5,6,PAL.red2);g.ellipse(x-2,y-3,2,3,PAL.red1);g.rect(x,y-9,2,4,PAL.wood3);g.ellipse(x+3,y-8,3,2,PAL.green2);
  }
  g.poly([{x:5,y:27},{x:70,y:27},{x:66,y:58},{x:9,y:58}],PAL.ink);
  g.poly([{x:8,y:29},{x:67,y:29},{x:63,y:54},{x:12,y:54}],PAL.wood3);
  g.poly([{x:10,y:30},{x:64,y:30},{x:61,y:35},{x:11,y:35}],PAL.wood1);
  for(const y of [38,47]){g.rect(11,y,53,6,PAL.wood2);g.rect(12,y+1,50,2,PAL.wood1);g.rect(12,y+4,49,1,PAL.wood3);}
  g.rect(6,26,64,5,PAL.wood4);g.rect(8,27,60,2,PAL.wood1);
  g.rect(8,52,5,6,PAL.wood4);g.rect(62,52,5,6,PAL.wood4);
}));}
export function drawAppleCrate(ctx:Ctx,o:Base&{items?:number}){draw(ctx,crateSprite(clamp(Math.floor(o.items??4),0,6)),o);}

// Lemonade stand, with the label on the sign and a large glass pitcher at the counter.
function standSprite(label:string){const text=cleanText(label||'LEMONADE',8);return cached(`lemonade-stand-${text}`,()=>make(`lemonade-stand-${text}`,75,100,g=>{
  g.rect(3,2,69,20,PAL.ink);g.rect(5,4,65,16,PAL.wood3);g.rect(7,5,61,2,PAL.gold3);pixelText(g,text,37,7,PAL.gold1,2,1);
  // Alternating white and yellow awning panels, cut into a clean broad silhouette.
  poly(g,[[7,23],[68,23],[73,42],[2,42]],PAL.ink);poly(g,[[10,24],[65,24],[70,39],[5,39]],PAL.gold2);poly(g,[[10,24],[19,24],[17,39],[8,39]],PAL.paper);poly(g,[[28,24],[37,24],[36,39],[27,39]],PAL.paper);poly(g,[[46,24],[55,24],[54,39],[45,39]],PAL.paper);poly(g,[[62,24],[66,24],[69,39],[61,39]],PAL.paper);
  g.rect(7,38,62,4,PAL.gold3);g.rect(11,41,4,42,PAL.wood3);g.rect(60,41,4,42,PAL.wood3);g.rect(12,42,2,39,PAL.wood1);g.rect(61,42,2,39,PAL.wood1);
  g.rect(7,72,62,10,PAL.ink);g.rect(9,73,58,7,PAL.wood2);g.rect(10,74,55,2,PAL.wood1);
  // Clear pitcher, lemonade, handle, and a small matching cup.
  g.round(23,47,23,25,4,PAL.ink);g.round(25,49,19,21,3,PAL.blue2);g.rect(27,57,15,11,PAL.gold2);g.rect(28,55,13,3,PAL.gold1);g.rect(29,51,3,4,PAL.white);g.rect(46,52,5,14,PAL.blue3);g.rect(47,54,3,10,PAL.blue1);
  g.rect(52,59,8,12,PAL.ink);g.rect(54,61,4,8,PAL.paper);g.rect(54,64,4,4,PAL.gold2);
  g.rect(8,82,5,13,PAL.wood4);g.rect(63,82,5,13,PAL.wood4);g.rect(5,94,12,3,PAL.wood3);g.rect(59,94,12,3,PAL.wood3);
}));}
export function drawLemonadeStand(ctx:Ctx,o:Base&{sign?:string}){draw(ctx,standSprite(o.sign??'LEMONADE'),o);}

// Pizza sectors are separately rasterized so taken slices leave a real gap.
function sector(cx:number,cy:number,r:number,a:number,b:number):Pt[]{const points:Pt[]=[{x:cx,y:cy}],steps=8;for(let i=0;i<=steps;i++){const t=a+(b-a)*i/steps;points.push({x:cx+Math.cos(t)*r,y:cy+Math.sin(t)*r});}return points;}
function pizzaWedge(g:Grid,slices:number,index:number){
  const cx=35,cy=35,r=27,gap=.055,a=-Math.PI/slices+index*Math.PI*2/slices+gap,b=-Math.PI/slices+(index+1)*Math.PI*2/slices-gap;
  g.poly(sector(cx,cy,r,a,b),PAL.ink);g.poly(sector(cx,cy,r-2,a,b),PAL.orange3);g.poly(sector(cx,cy,r-4,a,b),PAL.gold2);g.poly(sector(cx,cy,r-9,a,b),PAL.red2);
  const mid=(a+b)/2;for(const d of [12,19]){const px=cx+Math.cos(mid)*d,py=cy+Math.sin(mid)*d;g.ellipse(px,py,2.5,2.5,PAL.red3);g.ellipse(px-.6,py-.7,1,1,PAL.red1);}
}
function pizzaSprite(slices:number,removed:number){return cached(`pizza-${slices}-${removed}`,()=>make(`pizza-${slices}-${removed}`,82,70,g=>{for(let i=removed;i<slices;i++)pizzaWedge(g,slices,i);}));}
function pizzaWedgeSprite(slices:number,index:number){return cached(`pizza-wedge-${slices}-${index}`,()=>make(`pizza-wedge-${slices}-${index}`,82,70,g=>pizzaWedge(g,slices,index)));}
export function drawPizza(ctx:Ctx,o:Base&{slices?:number;taken?:number}){
  const n=clamp(Math.floor(o.slices??6),2,10),taken=clamp(o.taken??0,0,n),whole=Math.floor(taken),progress=taken-whole;
  const moving=whole<n&&progress>0,remove=Math.min(n,whole+(moving?1:0)),s=o.scale??1;
  draw(ctx,pizzaSprite(n,remove),o);
  const detached=Math.min(3,whole);
  for(let i=0;i<detached;i++)drawSprite(ctx,pizzaWedgeSprite(n,i),o.x+(72+i*13)*s,o.y+(-24-i*12)*s,{scale:s,alpha:o.alpha});
  if(moving)drawSprite(ctx,pizzaWedgeSprite(n,whole),o.x+72*progress*s,o.y-24*progress*s,{scale:s,alpha:o.alpha});
}

// Side-view car. `color` chooses the main body; glass and tyres stay consistent.
function carSprite(color:'red'|'blue'){const base=color==='red'?PAL.red2:PAL.blue2,light=color==='red'?PAL.red1:PAL.blue1,shade=color==='red'?PAL.red3:PAL.blue4;return cached(`car-${color}`,()=>make(`car-${color}`,85,50,g=>{
  poly(g,[[4,31],[9,24],[21,21],[31,8],[56,8],[69,21],[79,24],[83,31],[81,41],[5,41]],PAL.ink);
  poly(g,[[8,30],[13,25],[24,23],[33,11],[54,11],[66,23],[76,26],[79,31],[77,37],[9,37]],shade);
  poly(g,[[10,29],[15,25],[26,23],[34,12],[53,12],[64,23],[76,26],[78,30],[75,35],[11,35]],base);
  poly(g,[[34,21],[38,14],[51,14],[61,22]],PAL.blue3);poly(g,[[39,15],[50,15],[57,21],[36,21]],PAL.blue1);g.rect(40,15,4,3,PAL.white);
  g.rect(11,30,64,2,light);g.rect(13,34,8,2,PAL.gold1);g.rect(72,31,5,3,PAL.gold1);
  for(const x of [22,66]){g.ellipse(x,40,9,9,PAL.ink);g.ellipse(x,40,5.5,5.5,PAL.grey2);g.ellipse(x,40,2.5,2.5,PAL.grey5);g.ellipse(x-1,38,1,1,PAL.white);}
  g.rect(36,25,2,8,shade);g.rect(54,25,2,8,shade);
}));}
export function drawCar(ctx:Ctx,o:Base&{color?:'red'|'blue'}){draw(ctx,carSprite(o.color??'red'),o);}

function phoneCandles(g:Grid,direction:'up'|'down'){
  const closes=direction==='up'?[0.28,0.48,0.41,0.78]:[0.72,0.52,0.59,0.22];
  let previous=closes[0]!-(closes[1]!-closes[0]!)*0.55;
  const wickPairs=[[0.06,0.045],[0.045,0.065],[0.055,0.04],[0.07,0.05]] as const;
  const yAt=(value:number)=>Math.round(48-value*22);
  closes.forEach((close,index)=>{
    const open=previous,[upper,lower]=wickPairs[index]!,high=Math.max(open,close)+upper,low=Math.min(open,close)-lower;
    const rising=close>open,inkWick=rising?PAL.green4:PAL.red3,left=12+index*6,center=left+2;
    const openY=yAt(open),closeY=yAt(close),highY=yAt(high),lowY=yAt(low);
    const top=Math.min(openY,closeY),height=Math.max(3,Math.abs(openY-closeY)+1);
    g.rect(center,highY,1,Math.max(1,lowY-highY+1),inkWick);
    g.rect(left,top,4,height,PAL.ink);
    g.rect(left+1,top+1,2,height-2,rising?PAL.DOWN:PAL.UP);
    g.rect(left+1,top+1,1,1,rising?PAL.green1:PAL.red1);
    previous=close;
  });
}
function phoneSprite(direction:'up'|'down'){return cached(`phone-${direction}`,()=>make(`phone-chart-${direction}`,46,75,g=>{
  g.round(4,2,38,71,7,PAL.ink);g.round(7,4,32,67,5,PAL.grey4);g.round(9,7,28,59,3,PAL.blue4);g.round(11,13,24,45,2,PAL.paper);g.rect(19,9,8,2,PAL.grey2);g.ellipse(23,64,2,2,PAL.grey2);
  g.rect(14,22,18,2,PAL.paperShade);g.rect(14,49,18,2,PAL.paperShade);
  phoneCandles(g,direction);
  g.rect(13,17,2,3,PAL.blue2);g.rect(17,17,2,3,PAL.blue2);g.rect(21,17,2,3,PAL.blue2);
}));}
export function drawPhoneChart(ctx:Ctx,o:Base&{direction?:'up'|'down';trend?:'up'|'down'}){draw(ctx,phoneSprite(o.direction??o.trend??'up'),o);}

function cartSprite(items:number){return cached(`shopping-cart-${items}`,()=>make(`shopping-cart-${items}`,80,60,g=>{
  // Thick basket rails and big products make the cart read at thumbnail size.
  g.line({x:7,y:7},{x:16,y:13},5,PAL.ink);g.line({x:15,y:12},{x:23,y:41},5,PAL.ink);g.line({x:22,y:41},{x:63,y:41},5,PAL.ink);g.line({x:63,y:41},{x:72,y:17},5,PAL.ink);g.line({x:18,y:16},{x:73,y:16},4,PAL.ink);g.line({x:71,y:16},{x:77,y:10},4,PAL.ink);
  g.line({x:23,y:20},{x:68,y:20},2,PAL.grey2);g.line({x:24,y:25},{x:66,y:25},2,PAL.grey2);g.line({x:25,y:31},{x:64,y:31},2,PAL.grey2);g.line({x:27,y:20},{x:29,y:37},2,PAL.grey3);g.line({x:38,y:20},{x:39,y:38},2,PAL.grey3);g.line({x:50,y:20},{x:49,y:38},2,PAL.grey3);g.line({x:62,y:20},{x:59,y:37},2,PAL.grey3);
  for(let i=0;i<items;i++){
    const x=28+(i%4)*9,y=17-Math.floor(i/4)*8;
    if(i%3===0){g.ellipse(x,y,5.5,6,PAL.red3);g.ellipse(x-1,y-1,4,4.5,PAL.red1);g.rect(x,y-7,2,3,PAL.wood3);g.ellipse(x+3,y-6,2,1.5,PAL.green2);}
    else if(i%3===1){poly(g,[[x,y-8],[x-6,y+3],[x+6,y+3]],PAL.orange3);poly(g,[[x,y-6],[x-4,y+2],[x+4,y+2]],PAL.gold1);}
    else{g.rect(x-5,y-5,10,10,PAL.wood4);g.rect(x-4,y-4,8,8,PAL.blue2);g.rect(x-3,y-3,5,2,PAL.blue1);}
  }
  g.ellipse(26,51,8,8,PAL.ink);g.ellipse(26,51,4.5,4.5,PAL.grey2);g.ellipse(26,51,2,2,PAL.grey5);g.ellipse(62,51,8,8,PAL.ink);g.ellipse(62,51,4.5,4.5,PAL.grey2);g.ellipse(62,51,2,2,PAL.grey5);
}));}
export function drawShoppingCart(ctx:Ctx,o:Base&{items?:number}){draw(ctx,cartSprite(clamp(Math.floor(o.items??3),0,5)),o);}

const gift=make('gift-box-red',55,55,g=>{
  poly(g,[[4,17],[28,8],[52,17],[52,48],[28,55],[4,48]],PAL.ink);poly(g,[[8,19],[28,12],[48,19],[48,45],[28,51],[8,45]],PAL.red3);poly(g,[[8,19],[28,25],[28,51],[8,45]],PAL.red2);poly(g,[[28,25],[48,19],[48,45],[28,51]],PAL.red1);
  poly(g,[[4,14],[28,6],[53,14],[53,22],[28,30],[4,22]],PAL.ink);poly(g,[[8,15],[28,9],[49,15],[28,23]],PAL.red2);
  poly(g,[[25,10],[18,3],[11,5],[14,11],[28,16]],PAL.ink);poly(g,[[26,10],[19,5],[14,6],[17,10],[28,13]],PAL.gold2);
  poly(g,[[30,10],[37,3],[45,5],[42,12],[28,16]],PAL.ink);poly(g,[[30,10],[37,5],[42,6],[39,11],[28,13]],PAL.gold1);
  g.rect(25,15,6,35,PAL.gold3);g.rect(26,15,3,34,PAL.gold1);g.rect(8,18,40,5,PAL.gold2);g.rect(9,19,38,2,PAL.gold1);
});
export function drawGiftBox(ctx:Ctx,o:Base){draw(ctx,gift,o);}

const key=make('gold-key',70,30,g=>{
  g.ellipse(17,15,15,15,PAL.ink);g.ellipse(17,15,11,11,PAL.gold3);g.ellipse(16,14,8,8,PAL.gold1);g.ellipse(17,15,4,4,PAL.ink);g.ellipse(17,15,2,2,PAL.gold4);
  g.rect(28,10,39,10,PAL.ink);g.rect(30,12,36,6,PAL.gold3);g.rect(31,12,32,3,PAL.gold1);g.rect(46,16,5,10,PAL.ink);g.rect(48,17,3,8,PAL.gold3);g.rect(57,16,5,8,PAL.ink);g.rect(59,17,3,6,PAL.gold2);
});
export function drawKey(ctx:Ctx,o:Base){draw(ctx,key,o);}

const bulb=make('light-bulb',55,70,g=>{
  g.ellipse(27,25,22,23,PAL.ink);g.ellipse(26,24,18,19,PAL.grey4);g.ellipse(25,23,15,16,PAL.paper);g.ellipse(20,18,7,9,PAL.white);
  poly(g,[[10,31],[44,31],[39,47],[34,53],[20,53],[15,47]],PAL.ink);poly(g,[[14,33],[40,33],[36,45],[32,49],[22,49],[18,45]],PAL.grey3);g.rect(21,37,12,3,PAL.grey1);g.rect(22,43,10,3,PAL.grey2);g.rect(23,49,8,3,PAL.grey4);g.rect(22,54,11,4,PAL.ink);g.rect(23,55,9,2,PAL.grey2);g.rect(23,59,9,4,PAL.ink);g.rect(25,64,5,3,PAL.wood3);
});
const litBulb=make('light-bulb-on',55,70,g=>{
  g.ellipse(27,25,22,23,PAL.ink);g.ellipse(26,24,18,19,PAL.gold3);g.ellipse(25,23,15,16,PAL.gold1);g.ellipse(20,18,7,9,PAL.white);
  poly(g,[[10,31],[44,31],[39,47],[34,53],[20,53],[15,47]],PAL.ink);poly(g,[[14,33],[40,33],[36,45],[32,49],[22,49],[18,45]],PAL.gold2);g.rect(21,37,12,3,PAL.gold1);g.rect(22,43,10,3,PAL.gold3);g.rect(23,49,8,3,PAL.gold4);g.rect(22,54,11,4,PAL.ink);g.rect(23,55,9,2,PAL.grey2);g.rect(23,59,9,4,PAL.ink);g.rect(25,64,5,3,PAL.wood3);
});
const bulbGlow=make('light-bulb-glow',76,88,g=>{
  g.ellipse(38,38,24,24,PAL.gold4);g.ellipse(38,38,18,18,PAL.gold3);
  g.rect(36,1,4,13,PAL.gold2);g.rect(36,74,4,13,PAL.gold2);g.rect(1,36,13,4,PAL.gold2);g.rect(62,36,13,4,PAL.gold2);
  g.rect(10,10,7,4,PAL.gold1);g.rect(59,10,7,4,PAL.gold1);g.rect(10,62,7,4,PAL.gold1);g.rect(59,62,7,4,PAL.gold1);
},false);
export function drawLightBulb(ctx:Ctx,o:Base&{on?:boolean}){if(o.on)draw(ctx,bulbGlow,o);draw(ctx,o.on?litBulb:bulb,o);}

const raindrop=make('rain-drop',7,11,g=>{poly(g,[[3,0],[6,5],[6,8],[5,10],[2,10],[1,8],[1,5]],PAL.ink);poly(g,[[3,2],[5,6],[5,8],[4,9],[3,8],[2,7],[2,5]],PAL.blue1);g.rect(3,3,1,3,PAL.white);});
function weatherSprite(sun:boolean){return cached(`storm-cloud-${sun?'sun':'cloud'}`,()=>make(`storm-cloud-${sun?'sun':'cloud'}`,80,65,g=>{
  if(sun){g.ellipse(55,20,17,17,PAL.ink);g.ellipse(54,19,13,13,PAL.gold2);g.ellipse(51,16,5,5,PAL.gold1);for(let i=0;i<8;i++){const a=i*Math.PI/4;g.line({x:54+Math.cos(a)*18,y:19+Math.sin(a)*18},{x:54+Math.cos(a)*23,y:19+Math.sin(a)*23},3,PAL.gold3);}}
  g.ellipse(27,34,18,16,PAL.ink);g.ellipse(48,33,18,17,PAL.ink);g.ellipse(39,24,18,17,PAL.ink);g.ellipse(27,32,14,12,PAL.grey3);g.ellipse(47,31,14,13,PAL.grey3);g.ellipse(38,23,14,12,PAL.grey1);g.rect(19,31,42,15,PAL.grey3);g.rect(20,31,35,3,PAL.grey2);g.rect(26,39,9,3,PAL.grey4);g.rect(43,39,10,3,PAL.grey4);
}));}
export function drawRiskWeather(ctx:Ctx,o:Base&{rain?:number|boolean;sun?:boolean}){
  draw(ctx,weatherSprite(o.sun??true),o);
  const count=typeof o.rain==='boolean'?(o.rain?4:0):clamp(Math.floor(o.rain??4),0,5),t=o.t??0,s=o.scale??1;
  for(let i=0;i<count;i++){
    const phase=(t*1.1+i*.31)%1,y=49+phase*9;
    drawSprite(ctx,raindrop,o.x+(-19+i*10)*6*s,o.y+(y-32.5)*6*s,{scale:s,alpha:o.alpha});
  }
}

// Growth is composed from three independent pixel sprites and a smooth scale/fade.
const treeTrunk=make('tree-trunk',18,39,g=>{
  poly(g,[[5,38],[6,21],[2,13],[5,13],[9,20],[10,5],[14,1],[13,21],[16,38]],PAL.ink);
  poly(g,[[7,36],[8,20],[5,15],[7,16],[11,21],[12,6],[13,5],[12,37]],PAL.wood2);g.rect(8,24,3,12,PAL.wood1);g.rect(12,20,2,10,PAL.wood3);
});
const treeCanopy=make('tree-canopy',58,40,g=>{
  g.ellipse(29,23,26,16,PAL.ink);g.ellipse(15,22,14,13,PAL.ink);g.ellipse(43,21,14,14,PAL.ink);g.ellipse(29,11,16,13,PAL.ink);
  g.ellipse(28,22,22,13,PAL.green3);g.ellipse(15,21,11,10,PAL.green2);g.ellipse(43,20,11,11,PAL.green2);g.ellipse(29,11,12,10,PAL.green1);
  g.ellipse(21,15,5,4,PAL.green1);g.ellipse(40,27,5,4,PAL.green4);g.ellipse(29,30,6,4,PAL.green2);
});
const seedling=make('seedling',36,30,g=>{
  g.rect(3,25,30,4,PAL.wood3);g.rect(5,25,26,2,PAL.wood1);g.rect(17,10,4,15,PAL.green3);g.rect(18,12,2,12,PAL.green1);
  g.ellipse(10,11,9,5,PAL.ink);g.ellipse(10,10,7,3,PAL.green2);g.ellipse(26,8,9,5,PAL.ink);g.ellipse(26,7,7,3,PAL.green1);
});
const treeSoil=make('tree-soil',48,10,g=>{g.ellipse(24,5,23,4,PAL.ink);g.ellipse(23,4,19,2,PAL.wood2);g.rect(15,3,18,2,PAL.wood1);});
export function drawCompoundingTree(ctx:Ctx,o:Base&{grow?:number}){
  const p=clamp(o.grow??0,0,1),s=o.scale??1,groundY=o.y+180*s;
  drawSprite(ctx,treeSoil,o.x,groundY,{anchor:[.5,.5],scale:s,alpha:o.alpha});
  drawSprite(ctx,seedling,o.x,groundY,{anchor:[.5,1],scale:s,alpha:(o.alpha??1)*(1-p)});
  drawSprite(ctx,treeTrunk,o.x,groundY,{anchor:[.5,1],scale:s,sy:.06+.94*p,alpha:(o.alpha??1)*p});
  drawSprite(ctx,treeCanopy,o.x,groundY-24*6*s,{anchor:[.5,1],scale:s*(.12+.88*p),alpha:(o.alpha??1)*p});
}

const snowball=make('snowball',50,50,g=>{g.ellipse(25,26,23,21,PAL.ink);g.ellipse(24,24,19,17,PAL.grey2);g.ellipse(19,17,8,6,PAL.white);g.ellipse(35,33,7,5,PAL.grey1);g.rect(17,13,4,2,PAL.white);});
export function drawSnowball(ctx:Ctx,o:Base&{size?:number}){const p=clamp(o.size??1,0,1);drawSprite(ctx,snowball,o.x,o.y,{scale:(o.scale??1)*(.28+.72*p),rot:o.rot,alpha:o.alpha});}

const ladder=make('wood-ladder',45,80,g=>{
  g.line({x:8,y:4},{x:8,y:76},6,PAL.ink);g.line({x:36,y:4},{x:36,y:76},6,PAL.ink);
  g.line({x:8,y:6},{x:8,y:74},3,PAL.wood2);g.line({x:36,y:6},{x:36,y:74},3,PAL.wood2);g.line({x:7,y:7},{x:7,y:70},1,PAL.wood1);g.line({x:35,y:7},{x:35,y:70},1,PAL.wood1);
  for(const y of [14,25,36,47,58,69]){g.rect(9,y,26,5,PAL.ink);g.rect(11,y+1,22,3,PAL.wood1);g.rect(12,y+1,19,1,PAL.wood2);}
});
export function drawLadder(ctx:Ctx,o:Base){draw(ctx,ladder,o);}

const bridge=make('stone-bridge',85,50,g=>{
  // A single stone arch with a dark open underside and a strong level road deck.
  poly(g,[[3,16],[82,16],[80,34],[73,40],[66,43],[59,43],[55,37],[50,31],[43,28],[36,28],[29,31],[24,37],[20,43],[13,42],[7,38],[4,31]],PAL.ink);
  poly(g,[[7,18],[78,18],[76,33],[70,38],[64,40],[60,40],[56,34],[51,29],[44,25],[35,25],[28,29],[22,35],[18,40],[13,39],[9,36]],PAL.grey3);
  // Clear the arch opening right through to the dark stage.
  poly(g,[[22,43],[25,35],[30,29],[36,26],[44,25],[51,28],[57,34],[61,43]],PAL.black);
  g.rect(5,11,75,9,PAL.ink);g.rect(7,12,71,6,PAL.grey2);g.rect(8,12,68,2,PAL.grey1);
  g.rect(8,6,8,7,PAL.ink);g.rect(10,7,4,5,PAL.grey3);g.rect(69,6,8,7,PAL.ink);g.rect(71,7,4,5,PAL.grey3);
  g.rect(8,23,11,3,PAL.grey1);g.rect(66,23,10,3,PAL.grey1);g.rect(9,31,9,3,PAL.grey2);g.rect(66,31,9,3,PAL.grey2);
});
export function drawBridge(ctx:Ctx,o:Base){draw(ctx,bridge,o);}

const g=(name:string,fn:(ctx:Ctx,x:number,y:number,t:number)=>void,w:number,h:number)=>({name,draw:fn,w,h});
const ease=(v:number)=>{const p=clamp(v,0,1);return p*p*(3-2*p);};
export const GALLERY=[
  g('Apple · red and leaf',(c,x,y)=>drawApple(c,{x,y}),APPLE_SIZE.w,APPLE_SIZE.h),
  g('Apple crate · timber',(c,x,y)=>drawAppleCrate(c,{x,y,items:5}),APPLE_CRATE_SIZE.w,APPLE_CRATE_SIZE.h),
  g('Lemonade stand · pitcher',(c,x,y)=>drawLemonadeStand(c,{x,y,sign:'LEMONADE'}),LEMONADE_STAND_SIZE.w,LEMONADE_STAND_SIZE.h),
  g('Pizza · slices',(c,x,y)=>drawPizza(c,{x,y,slices:6}),PIZZA_SIZE.w,PIZZA_SIZE.h),
  g('Pizza · slice taken',(c,x,y)=>drawPizza(c,{x,y,slices:6,taken:1}),PIZZA_SIZE.w,PIZZA_SIZE.h),
  g('Pizza · taking a slice',(c,x,y,t)=>drawPizza(c,{x,y,slices:6,taken:ease((t+.12)/.5)}),PIZZA_SIZE.w,PIZZA_SIZE.h),
  g('Car · red',(c,x,y)=>drawCar(c,{x,y,color:'red'}),CAR_SIZE.w,CAR_SIZE.h),g('Car · blue',(c,x,y)=>drawCar(c,{x,y,color:'blue'}),CAR_SIZE.w,CAR_SIZE.h),
  g('Phone · rising candlestick chart',(c,x,y)=>drawPhoneChart(c,{x,y,direction:'up'}),PHONE_SIZE.w,PHONE_SIZE.h),g('Phone · falling candlestick chart',(c,x,y)=>drawPhoneChart(c,{x,y,direction:'down'}),PHONE_SIZE.w,PHONE_SIZE.h),
  g('Shopping cart · coloured goods',(c,x,y)=>drawShoppingCart(c,{x,y,items:4}),CART_SIZE.w,CART_SIZE.h),
  g('Gift box · gold ribbon',(c,x,y)=>drawGiftBox(c,{x,y}),GIFT_SIZE.w,GIFT_SIZE.h),
  g('Gold key',(c,x,y)=>drawKey(c,{x,y}),KEY_SIZE.w,KEY_SIZE.h),
  g('Light bulb · off',(c,x,y)=>drawLightBulb(c,{x,y}),BULB_SIZE.w,BULB_SIZE.h),g('Light bulb · on',(c,x,y)=>drawLightBulb(c,{x,y,on:true}),BULB_SIZE.w,BULB_SIZE.h),
  g('Storm cloud · rain and sun',(c,x,y,t)=>drawRiskWeather(c,{x,y,t,rain:4,sun:true}),WEATHER_SIZE.w,WEATHER_SIZE.h),
  g('Seedling',(c,x,y)=>drawCompoundingTree(c,{x,y,grow:0}),TREE_SIZE.w,TREE_SIZE.h),g('Tree growth · animation',(c,x,y,t)=>drawCompoundingTree(c,{x,y,grow:ease((t+.2)/.7)}),TREE_SIZE.w,TREE_SIZE.h),g('Mature tree',(c,x,y)=>drawCompoundingTree(c,{x,y,grow:1}),TREE_SIZE.w,TREE_SIZE.h),
  g('Snowball · small',(c,x,y)=>drawSnowball(c,{x,y,size:.25}),SNOWBALL_SIZE.w,SNOWBALL_SIZE.h),g('Snowball · growing',(c,x,y,t)=>drawSnowball(c,{x,y,size:.5+.5*ease(t/.5)}),SNOWBALL_SIZE.w,SNOWBALL_SIZE.h),g('Snowball · large',(c,x,y)=>drawSnowball(c,{x,y,size:1}),SNOWBALL_SIZE.w,SNOWBALL_SIZE.h),
  g('Wood ladder',(c,x,y)=>drawLadder(c,{x,y}),LADDER_SIZE.w,LADDER_SIZE.h),g('Stone bridge',(c,x,y)=>drawBridge(c,{x,y}),BRIDGE_SIZE.w,BRIDGE_SIZE.h),
];
