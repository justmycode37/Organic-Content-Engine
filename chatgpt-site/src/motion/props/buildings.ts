import { Grid, PAL, type Pt } from '../kit/pixel';
import { drawSprite, type Sprite } from '../kit/sprite';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Base = { x:number; y:number; t?:number; rot?:number; scale?:number; alpha?:number };
export type BuildingKind = 'bank' | 'exchange' | 'house' | 'factory' | 'company' | 'shop' | 'tax' | 'tax-office' | 'government';
export type BuildingOptions = Base & { kind:BuildingKind; label?:string; sign?:string; sold?:boolean; doorOpen?:number };

export const BUILDING_SIZE={w:528,h:564} as const;
export const BUILDING_ANCHOR:[number,number]=[0.5,1]; // x is the ground-centre; y is the bottom step.
export const BANK_SIZE=BUILDING_SIZE, EXCHANGE_SIZE=BUILDING_SIZE, HOUSE_SIZE=BUILDING_SIZE, FACTORY_SIZE=BUILDING_SIZE, SHOP_SIZE=BUILDING_SIZE, TAX_OFFICE_SIZE=BUILDING_SIZE;

const FONT:Record<string,readonly string[]>={
  A:['010','101','111','101','101'],B:['110','101','110','101','110'],C:['011','100','100','100','011'],D:['110','101','101','101','110'],E:['111','100','110','100','111'],F:['111','100','110','100','100'],G:['011','100','101','101','011'],H:['101','101','111','101','101'],I:['111','010','010','010','111'],J:['001','001','001','101','010'],K:['101','101','110','101','101'],L:['100','100','100','100','111'],M:['10001','11011','10101','10101','10101'],N:['1001','1101','1011','1001','1001'],O:['111','101','101','101','111'],P:['110','101','110','100','100'],Q:['111','101','101','111','001'],R:['110','101','110','101','101'],S:['011','100','010','001','110'],T:['111','010','010','010','010'],U:['101','101','101','101','111'],V:['101','101','101','101','010'],W:['10001','10001','10101','10101','01010'],X:['101','101','010','101','101'],Y:['101','101','010','010','010'],Z:['111','001','010','100','111'],
  0:['111','101','101','101','111'],1:['010','110','010','010','111'],2:['110','001','010','100','111'],3:['110','001','010','001','110'],4:['101','101','111','001','001'],5:['111','100','110','001','110'],6:['011','100','110','101','010'],7:['111','001','010','010','010'],8:['010','101','010','101','010'],9:['010','101','011','001','110'],'$':['010','111','100','111','010'],'-':['000','000','111','000','000'],'.':['000','000','000','000','010'],':':['000','010','000','010','000'],
};
const cleanText=(value:string,max=12)=>value.toUpperCase().replace(/[^A-Z0-9 $:.-]/g,' ').trim().slice(0,max);
function textWidth(value:string,cell=2,gap=1){
  const chars=[...value];
  return chars.reduce((width,ch)=>width+(ch===' '?3*cell:(Math.max(...(FONT[ch]??FONT['?']??['111']).map(row=>row.length))+gap)*cell),-gap*cell);
}
function pixelText(g:Grid,value:string,cx:number,y:number,color:string,cell=2,gap=1){
  const text=cleanText(value), width=textWidth(text,cell,gap); let x=Math.floor(cx-width/2);
  for(const ch of text){
    if(ch===' '){x+=3*cell;continue;}
    const glyph=FONT[ch]??FONT['?']!;
    for(let gy=0;gy<glyph.length;gy++)for(let gx=0;gx<glyph[gy]!.length;gx++)if(glyph[gy]![gx]==='1')g.rect(x+gx*cell,y+gy*cell,cell,cell,color);
    x+=(Math.max(...glyph.map(row=>row.length))+gap)*cell;
  }
}
function poly(g:Grid,points:number[][],color:string){g.poly(points.map(([x,y])=>({x:x!,y:y!} as Pt)),color);}
function sprite(key:string,paint:(g:Grid)=>void):Sprite{
  const g=new Grid(88,94); paint(g); g.outline(PAL.ink); return g.sprite(`building:${key}:round2`);
}
const cache=new Map<string,Sprite>();
function cached(key:string,build:()=>Sprite){let value=cache.get(key);if(!value){value=build();cache.set(key,value);}return value;}

function facade(g:Grid){
  // A single broad stone mass, a bright upper-left face, and a darker right edge.
  g.rect(8,28,72,60,PAL.ink);
  g.rect(10,29,68,57,PAL.grey3);
  g.rect(12,30,63,53,PAL.paperShade);
  g.rect(13,30,57,52,PAL.paper);
  g.rect(13,30,56,4,PAL.white);
  g.rect(69,34,7,48,PAL.paperDark);
  g.rect(9,84,70,5,PAL.grey4);
  g.rect(6,88,76,4,PAL.grey3);
  g.rect(9,88,67,2,PAL.grey2);
}
function entry(g:Grid){
  // Door is a separate sprite so its hinge can swing without deforming the wall.
  g.rect(36,58,16,27,PAL.ink);
  g.rect(38,60,12,24,PAL.black);
  g.rect(38,60,2,24,PAL.grey4);
  g.rect(35,84,18,3,PAL.grey4);
}
function bankSprite(){return sprite('bank',g=>{
  facade(g);
  poly(g,[[5,29],[44,4],[83,29]],PAL.ink); poly(g,[[10,27],[44,7],[78,27]],PAL.paperDark); poly(g,[[13,26],[44,10],[75,26]],PAL.paper);
  g.rect(17,21,54,11,PAL.wood3); g.rect(18,21,52,2,PAL.gold3); pixelText(g,'BANK',44,22,PAL.gold1,2,1);
  g.rect(11,32,66,7,PAL.gold3); g.rect(13,33,62,3,PAL.gold1);
  for(const x of [19,31,57,69]){
    g.rect(x-4,38,8,4,PAL.wood3);g.rect(x-3,39,6,2,PAL.gold2);
    g.rect(x-3,42,6,35,PAL.paperShade);g.rect(x-2,43,3,33,PAL.white);g.rect(x+2,43,2,33,PAL.paperDark);
    g.rect(x-4,77,8,4,PAL.wood3);g.rect(x-3,78,6,2,PAL.gold2);
  }
  g.rect(12,80,64,5,PAL.gold3); g.rect(14,80,60,2,PAL.gold1);
  entry(g);
});}
function exchangeSprite(){return sprite('exchange',g=>{
  facade(g);
  // Wider, taller pediment and a full-width market ticker make this a grander institution.
  poly(g,[[3,29],[44,3],[85,29]],PAL.ink);poly(g,[[8,27],[44,7],[80,27]],PAL.grey2);poly(g,[[12,26],[44,10],[76,26]],PAL.grey1);
  g.rect(10,20,68,12,PAL.blue4);g.rect(12,21,64,2,PAL.blue2);pixelText(g,'EXCHANGE',44,21,PAL.gold1,2,1);
  g.rect(9,32,70,7,PAL.gold3);g.rect(11,33,66,3,PAL.gold1);
  g.rect(12,40,64,9,PAL.ink);g.rect(14,41,60,6,PAL.grey5);
  g.rect(17,42,12,3,PAL.UP);g.rect(31,42,7,3,PAL.gold2);g.rect(40,42,13,3,PAL.DOWN);g.rect(55,42,16,3,PAL.gold2);
  for(const x of [18,29,59,70]){
    g.rect(x-4,49,8,4,PAL.grey5);g.rect(x-3,50,6,2,PAL.grey2);
    g.rect(x-3,53,6,25,PAL.grey2);g.rect(x-2,54,3,23,PAL.grey1);g.rect(x+2,54,2,23,PAL.grey3);
    g.rect(x-4,78,8,3,PAL.grey5);
  }
  g.rect(12,80,64,5,PAL.grey4);g.rect(14,80,60,2,PAL.grey2);
  entry(g);
});}
function houseSprite(sold:boolean){return sprite(`house-${sold?'sold':'plain'}`,g=>{
  // Gable roof and cream walls are the two largest, simplest house cues.
  poly(g,[[5,39],[44,7],[83,39]],PAL.ink);poly(g,[[10,37],[44,11],[78,37]],PAL.red3);poly(g,[[13,35],[44,13],[74,35]],PAL.red2);
  poly(g,[[14,35],[44,15],[44,35]],PAL.red1);g.rect(11,36,66,5,PAL.red3);g.rect(14,37,60,2,PAL.red1);
  g.rect(13,40,62,44,PAL.ink);g.rect(15,41,58,42,PAL.paperShade);g.rect(15,41,52,41,PAL.paper);g.rect(15,41,51,4,PAL.white);g.rect(67,45,6,37,PAL.paperDark);
  // One large blue window with a thick cross is more legible than many small panes.
  g.rect(20,48,18,19,PAL.ink);g.rect(22,50,14,15,PAL.blue3);g.rect(23,51,11,12,PAL.blue1);g.rect(27,51,2,12,PAL.blue4);g.rect(23,56,11,2,PAL.blue4);g.rect(24,52,3,3,PAL.white);
  entry(g);
  g.rect(12,84,64,4,PAL.wood3);g.rect(15,84,57,2,PAL.wood1);
  if(sold){
    g.rect(51,26,35,17,PAL.ink);g.rect(53,27,31,13,PAL.red2);g.rect(54,28,28,1,PAL.red1);
    pixelText(g,'SOLD',68,29,PAL.white,2,1);
  }
});}
function factorySprite(label:string){
  const name=cleanText(label||'COMPANY',8);
  return sprite(`factory-${name}`,g=>{
    facade(g);
    // Chunky chimney and sawtooth roof, with red brick factory walls.
    poly(g,[[8,35],[8,27],[25,33],[25,25],[42,33],[42,25],[59,33],[59,27],[80,35],[80,42],[8,42]],PAL.ink);
    poly(g,[[12,35],[12,30],[29,36],[29,29],[46,36],[46,29],[62,36],[62,31],[76,36],[76,40],[12,40]],PAL.red3);
    g.rect(13,38,62,45,PAL.red3);g.rect(15,39,56,43,PAL.red2);g.rect(15,39,53,4,PAL.red1);g.rect(68,43,3,38,PAL.red3);
    g.rect(13,7,13,31,PAL.ink);g.rect(15,9,9,28,PAL.red3);g.rect(15,9,4,26,PAL.red1);g.rect(11,5,17,5,PAL.ink);g.rect(13,6,13,2,PAL.red2);
    // Three broad brick courses, deliberately sparse.
    for(const y of [49,61,73]){g.rect(17,y,49,2,PAL.red3);g.rect(35,y,2,5,PAL.red3);g.rect(52,y,2,5,PAL.red3);}
    g.rect(10,43,68,16,PAL.wood3);g.rect(12,44,64,13,PAL.red3);pixelText(g,name,44,46,PAL.paper,2,1);
    g.rect(17,64,12,12,PAL.blue4);g.rect(19,66,8,8,PAL.blue1);g.rect(20,67,2,6,PAL.blue3);
    g.rect(51,64,12,12,PAL.blue4);g.rect(53,66,8,8,PAL.blue1);g.rect(54,67,2,6,PAL.blue3);
  entry(g);
  });
}
function shopSprite(sign:string){
  const name=cleanText(sign||'MARKET',8);
  return sprite(`shop-${name}`,g=>{
    facade(g);
    g.rect(12,36,64,48,PAL.wood3);g.rect(14,38,60,43,PAL.paperShade);g.rect(14,38,56,40,PAL.paper);
    // Large sign sits above a striped canopy; the letters remain at least ten art pixels tall.
    g.rect(10,29,68,13,PAL.ink);g.rect(12,30,64,10,PAL.blue4);g.rect(13,31,62,2,PAL.blue2);pixelText(g,name,44,31,PAL.gold1,2,1);
    g.rect(9,42,70,5,PAL.ink);g.rect(11,43,66,3,PAL.red3);
    for(let i=0;i<8;i++){
      const x=12+i*8, col=i%2===0?PAL.red1:PAL.paper;
      poly(g,[[x,44],[x+7,44],[x+9,55],[x+1,55]],col);
      g.rect(x+1,54,7,2,PAL.red3);
    }
    // One broad display window, with a door at its right edge.
    g.rect(18,57,37,24,PAL.ink);g.rect(20,59,33,20,PAL.blue3);g.rect(21,60,29,16,PAL.blue1);g.rect(21,60,27,3,PAL.white);
    g.rect(25,68,7,8,PAL.gold2);g.rect(34,65,7,11,PAL.red2);g.rect(43,67,6,9,PAL.green2);
    g.rect(60,57,12,27,PAL.ink);g.rect(62,59,8,23,PAL.blue2);g.rect(63,60,3,20,PAL.blue1);g.rect(67,72,2,3,PAL.gold2);
    g.rect(8,83,72,5,PAL.wood3);g.rect(12,83,64,2,PAL.wood1);
  });
}
function taxSprite(label:string){const name=cleanText(label||'TAX OFFICE',12);return sprite(`tax-${name}`,g=>{
  facade(g);
  poly(g,[[5,29],[18,7],[70,7],[83,29]],PAL.ink);poly(g,[[10,27],[21,11],[67,11],[78,27]],PAL.grey3);poly(g,[[14,26],[23,13],[65,13],[74,26]],PAL.grey1);
  g.rect(12,27,64,8,PAL.grey5);g.rect(14,28,60,2,PAL.grey3);
  // Flag is a separate, unmistakable silhouette at the roof peak.
  g.rect(69,4,2,22,PAL.ink);g.rect(70,5,2,18,PAL.grey2);poly(g,[[72,6],[84,9],[72,15]],PAL.ink);poly(g,[[73,7],[81,9],[73,13]],PAL.blue2);g.rect(76,9,2,2,PAL.gold1);
  const words=name.split(/\s+/),lines=words.length>1?[words.slice(0,Math.ceil(words.length/2)).join(' '),words.slice(Math.ceil(words.length/2)).join(' ')]:name.length>6?[name.slice(0,5),name.slice(5)]:[name];
  if(lines.length===1)pixelText(g,lines[0]!,44,20,PAL.paper,2,1);else{pixelText(g,lines[0]!,44,14,PAL.paper,2,1);pixelText(g,lines[1]!,44,24,PAL.paper,2,1);}
  g.rect(12,36,64,8,PAL.grey4);g.rect(14,37,60,5,PAL.grey3);
  for(const x of [20,33,55,68]){
    g.rect(x-4,44,8,4,PAL.grey5);g.rect(x-3,45,6,2,PAL.grey2);
    g.rect(x-3,48,6,30,PAL.grey2);g.rect(x-2,49,3,28,PAL.grey1);g.rect(x+2,49,2,28,PAL.grey3);
    g.rect(x-4,78,8,4,PAL.grey5);
  }
  g.rect(12,80,64,5,PAL.grey5);g.rect(14,80,60,2,PAL.grey2);entry(g);
});}

const DOOR=cached('door',()=>{const g=new Grid(12,24);g.rect(0,0,12,24,PAL.ink);g.rect(2,2,9,21,PAL.blue3);g.rect(3,3,6,19,PAL.blue2);g.rect(3,3,2,17,PAL.blue1);g.rect(8,12,2,3,PAL.gold2);g.outline(PAL.ink);return g.sprite('building:hinged-door:round2');});
const SMOKE=cached('smoke',()=>{const g=new Grid(14,10);g.ellipse(7,6,6,4,PAL.grey3);g.ellipse(5,5,4,3,PAL.grey1);g.ellipse(9,4,4,3,PAL.grey2);g.ellipse(5,4,2,1,PAL.white);g.outline(PAL.ink);return g.sprite('building:smoke:round2');});
function drawBuildingSprite(ctx:Ctx,kind:Exclude<BuildingKind,'company'|'tax'|'tax-office'|'government'>,o:Base&{doorOpen?:number},label='',sold=false){
  const key=kind==='bank'?'bank':kind==='exchange'?'exchange':kind==='house'?`house-${sold?'sold':'plain'}`:kind==='factory'?`factory-${cleanText(label||'COMPANY',8)}`:`shop-${cleanText(label||'MARKET',8)}`;
  const image=cached(key,()=>kind==='bank'?bankSprite():kind==='exchange'?exchangeSprite():kind==='house'?houseSprite(sold):kind==='factory'?factorySprite(label):shopSprite(label));
  const scale=o.scale??1;drawSprite(ctx,image,o.x,o.y,{anchor:BUILDING_ANCHOR,scale,rot:o.rot,alpha:o.alpha});
  const openness=Math.max(0,Math.min(1,o.doorOpen??0));
  // Hinge at the lower-right corner of the doorway; the angle remains continuous.
  drawSprite(ctx,DOOR,o.x+36*scale,o.y-60*scale,{anchor:[1,1],scale,rot:openness*1.05,alpha:o.alpha});
}
function drawFactorySmoke(ctx:Ctx,o:Base){
  const scale=o.scale??1, t=o.t??0;
  for(let i=0;i<3;i++){
    const sway=Math.sin(t*1.25+i*1.7)*5*scale;
    drawSprite(ctx,SMOKE,o.x+(-150+i*38)*scale+sway,o.y+(-535-i*36)*scale,{scale:scale*(1+i*.04),alpha:(o.alpha??1)*(.84-i*.1)});
  }
}
function drawSimple(ctx:Ctx,kind:'bank'|'exchange'|'house'|'shop',o:Base&{sold?:boolean;doorOpen?:number;sign?:string;label?:string}){
  drawBuildingSprite(ctx,kind,o,kind==='shop'?(o.sign??o.label??'MARKET'):'',o.sold??false);
}
export function drawBank(ctx:Ctx,o:Base&{doorOpen?:number}){drawSimple(ctx,'bank',o);}
export function drawExchange(ctx:Ctx,o:Base&{doorOpen?:number}){drawSimple(ctx,'exchange',o);}
export function drawHouse(ctx:Ctx,o:Base&{sold?:boolean;doorOpen?:number}){drawSimple(ctx,'house',o);}
export function drawFactory(ctx:Ctx,o:Base&{label?:string;doorOpen?:number}){drawBuildingSprite(ctx,'factory',o,o.label??'COMPANY');drawFactorySmoke(ctx,o);}
export function drawShop(ctx:Ctx,o:Base&{sign?:string;doorOpen?:number}){drawSimple(ctx,'shop',o);}
export function drawTaxOffice(ctx:Ctx,o:Base&{label?:string;doorOpen?:number}){
  const image=cached(`tax-${cleanText(o.label??'TAX OFFICE',12)}`,()=>taxSprite(o.label??'TAX OFFICE'));
  const scale=o.scale??1;drawSprite(ctx,image,o.x,o.y,{anchor:BUILDING_ANCHOR,scale,rot:o.rot,alpha:o.alpha});
  drawSprite(ctx,DOOR,o.x+36*scale,o.y-60*scale,{anchor:[1,1],scale,rot:Math.max(0,Math.min(1,o.doorOpen??0))*1.05,alpha:o.alpha});
}
export function drawBuilding(ctx:Ctx,o:BuildingOptions){
  if(o.kind==='bank')drawBank(ctx,o);
  else if(o.kind==='exchange')drawExchange(ctx,o);
  else if(o.kind==='house')drawHouse(ctx,o);
  else if(o.kind==='factory'||o.kind==='company')drawFactory(ctx,o);
  else if(o.kind==='shop')drawShop(ctx,{...o,sign:o.label??o.sign});
  else drawTaxOffice(ctx,o);
}

const g=(name:string,fn:(ctx:Ctx,x:number,y:number,t:number)=>void)=>({name,draw:fn,w:BUILDING_SIZE.w,h:BUILDING_SIZE.h});
const ease=(v:number)=>{const p=Math.max(0,Math.min(1,v));return p*p*(3-2*p);};
export const GALLERY=[
  g('Bank · cream stone columns',(c,x,y)=>drawBank(c,{x,y:y+282})),
  g('Bank · door open',(c,x,y)=>drawBank(c,{x,y:y+282,doorOpen:.82})),
  g('Bank · door opening',(c,x,y,t)=>drawBank(c,{x,y:y+282,doorOpen:ease((t+.12)/.45)})),
  g('Stock exchange · ticker',(c,x,y)=>drawExchange(c,{x,y:y+282})),
  g('House',(c,x,y)=>drawHouse(c,{x,y:y+282})),
  g('House · SOLD',(c,x,y)=>drawHouse(c,{x,y:y+282,sold:true})),
  g('Factory · company smoke',(c,x,y,t)=>drawFactory(c,{x,y:y+282,t,label:'COMPANY'})),
  g('Shop · striped awning',(c,x,y)=>drawShop(c,{x,y:y+282,sign:'MARKET'})),
  g('Tax office · flag',(c,x,y)=>drawTaxOffice(c,{x,y:y+282})),
];
