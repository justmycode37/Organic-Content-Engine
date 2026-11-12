import * as THREE from 'three';
import {G,at,deg,lerp} from '../kit.ts';
import {defineModel} from './types.ts';

const LED_COLORS=['red','green','blue','white','amber','yellow','violet','cyan','orange','pink'] as const;
const ledHex=(c:string)=>({yellow:'#ffe22a',amber:'#ffb21f',white:'#f2f2f2'} as Record<string,string>)[c]??c;

export const led=defineModel({
 id:'led',aliases:['light-emitting-diode','diode'],
 describe:'A classic 5 mm LED: rounded epoxy dome on a flange with two metal legs (one longer, bent). `glow` lights it up with a dot halo in its colour.',
 params:{color:LED_COLORS.join(' | ')+' (default scene hue)'},
 controls:{glow:'0 off .. 1 fully lit (default 0)'},defaults:{glow:0},size:'0.12 m display scale',
 build(ctx){
  const c=ctx.params.color?ledHex(ctx.str('color','red',LED_COLORS)):undefined;
  const root=new THREE.Group();
  const dome=G.lathe([[0,0],[0.25,0],[0.25,0.42],[0.245,0.47],[0.23,0.53],[0.2,0.6],[0.15,0.66],[0.08,0.7],[0,0.71]],48);
  const lens=ctx.mesh(at(dome,[0,0.6,0]),{color:c,tone:0.95,glow:5,rough:0.35},'lens');root.add(lens);
  root.add(ctx.mesh(at(G.cyl(0.29,0.29,0.06,48),[0,0.6,0]),{color:c,tone:0.8,glow:2.5}));
  // the die and anvil inside, visible as a darker core near the top
  const metal={tone:0.75,color:'#cfcfcf'};
  const legA=G.tube([[0.09,0.6,0],[0.09,0.2,0],[0.09,-0.25,0]],0.022,12,8);
  const legK=G.tube([[-0.09,0.6,0],[-0.09,0.25,0],[-0.16,0.12,0],[-0.16,-0.1,0]],0.022,16,8);
  root.add(ctx.mesh(legA,metal),ctx.mesh(legK,metal));
  root.position.y=0.25;
  const wrap=new THREE.Group();wrap.add(root);
  return {root:wrap,grounded:true};
 },
});

export const phone=defineModel({
 id:'phone',aliases:['smartphone','mobile-phone','iphone','cellphone'],
 describe:'A modern smartphone standing upright, thin rounded slab with a screen showing app tiles and a camera bump; `screen` lights the display.',
 controls:{screen:'0 dark .. 1 lit display (default 1)'},defaults:{screen:1},size:'0.15 m',
 build(ctx){
  const root=new THREE.Group();
  root.add(ctx.mesh(G.rbox(0.075,0.155,0.009,0.009),{tone:0.55}));
  const screen=ctx.mesh(at(G.rbox(0.068,0.146,0.001,0.0005),[0,0,0.0047]),{tone:0.25,glow:1.2,glowControl:'screen'});root.add(screen);
  // app tiles
  for(let r=0;r<5;r++)for(let c=0;c<4;c++)root.add(ctx.mesh(at(G.rbox(0.011,0.011,0.0016,0.002),[-0.0225+c*0.015,0.045-r*0.019,0.0056]),{tone:0.9,glow:1.6,glowControl:'screen'}));
  root.add(ctx.mesh(at(G.rbox(0.05,0.0045,0.0016,0.002),[0,-0.064,0.0056]),{tone:0.9,glow:1.4,glowControl:'screen'}));
  root.add(ctx.mesh(at(G.rbox(0.022,0.006,0.0016,0.003),[0,0.068,0.0056]),{tone:0.1}));
  root.add(ctx.mesh(at(G.rbox(0.03,0.03,0.003,0.006),[0.016,0.054,-0.006]),{tone:0.7}));
  root.add(ctx.mesh(at(G.cyl(0.006,0.006,0.004,16),[0.01,0.06,-0.008],[90,0,0]),{tone:0.3}));
  root.position.y=0.0775;const wrap=new THREE.Group();wrap.add(root);
  return {root:wrap,grounded:true};
 },
});

export const laptop=defineModel({
 id:'laptop',aliases:['notebook-computer','macbook','computer'],
 describe:'An open laptop with keyboard keys, trackpad and a lit screen; `open` 0 closed .. 1 open lid, `screen` lights it.',
 controls:{open:'0 closed .. 1 open (default 1)',screen:'0..1 display light (default 0.6)'},defaults:{open:1,screen:0.6},size:'0.32 m wide',
 build(ctx){
  const root=new THREE.Group();
  root.add(ctx.mesh(at(G.rbox(0.32,0.016,0.22,0.006),[0,0.008,0]),{tone:0.75}));
  for(let r=0;r<5;r++)for(let c=0;c<12;c++)root.add(ctx.mesh(at(G.box(0.019,0.004,0.017),[-0.12+c*0.0218,0.017,-0.075+r*0.022]),{tone:0.95}));
  root.add(ctx.mesh(at(G.box(0.09,0.002,0.055),[0,0.0165,0.068]),{tone:0.5}));
  const hinge=new THREE.Group();hinge.position.set(0,0.016,-0.108);root.add(hinge);
  hinge.add(ctx.mesh(at(G.rbox(0.32,0.21,0.008,0.005),[0,0.105,-0.004]),{tone:0.8}));
  hinge.add(ctx.mesh(at(G.box(0.29,0.18,0.001),[0,0.11,0.0005]),{tone:0.15,glow:1,glowControl:'screen'}));
  return {root,grounded:true,update(c){hinge.rotation.x=deg(lerp(-90,-0,c.open??1))+deg(-12)*(c.open??1);}};
 },
});

export const monitor=defineModel({
 id:'monitor',aliases:['computer-screen','display','screen'],
 describe:'A desktop computer monitor on a stand; `screen` lights the display.',
 controls:{screen:'0..1 (default 0.7)'},defaults:{screen:0.7},size:'0.55 m wide',
 build(ctx){
  const root=new THREE.Group();
  root.add(ctx.mesh(at(G.rbox(0.22,0.015,0.16,0.006),[0,0.0075,0]),{tone:0.7}));
  root.add(ctx.mesh(at(G.rbox(0.05,0.3,0.025,0.008),[0,0.15,-0.03],[-8,0,0]),{tone:0.7}));
  root.add(ctx.mesh(at(G.rbox(0.56,0.33,0.025,0.008),[0,0.38,-0.01]),{tone:0.85}));
  root.add(ctx.mesh(at(G.box(0.53,0.3,0.002),[0,0.385,0.0035]),{tone:0.12,glow:1,glowControl:'screen'}));
  return {root,grounded:true};
 },
});

export const tv=defineModel({
 id:'tv',aliases:['television','flatscreen'],
 describe:'A large flat-screen TV on two feet; `screen` lights it.',
 controls:{screen:'0..1 (default 0.8)'},defaults:{screen:0.8},size:'1.2 m wide',
 build(ctx){
  const root=new THREE.Group();
  root.add(ctx.mesh(at(G.rbox(1.22,0.7,0.04,0.01),[0,0.45,0]),{tone:0.8}));
  root.add(ctx.mesh(at(G.box(1.17,0.65,0.002),[0,0.455,0.021]),{tone:0.12,glow:1,glowControl:'screen'}));
  for(const x of [-0.45,0.45]){root.add(ctx.mesh(at(G.box(0.03,0.1,0.03),[x,0.07,0],[0,0,x>0?-20:20]),{tone:0.6}));root.add(ctx.mesh(at(G.rbox(0.16,0.015,0.14,0.005),[x*1.08,0.008,0]),{tone:0.6}));}
  return {root,grounded:true};
 },
});

export const desk=defineModel({
 id:'desk',aliases:['table','office-desk','workbench'],
 describe:'A simple office desk: a thin tabletop on two T-shaped legs. Put things `on` it.',
 size:'1.4 x 0.75 m',
 build(ctx){
  const root=new THREE.Group();
  root.add(ctx.mesh(at(G.box(1.4,0.035,0.7),[0,0.74,0]),{tone:0.95}));
  for(const x of [-0.6,0.6]){
   root.add(ctx.mesh(at(G.box(0.06,0.72,0.06),[x,0.37,0]),{tone:0.7}));
   root.add(ctx.mesh(at(G.box(0.07,0.035,0.62),[x,0.02,0]),{tone:0.7}));
  }
  return {root,grounded:true,anchors:{top:[0,0.76,0]}};
 },
});

export const chair=defineModel({
 id:'chair',aliases:['office-chair','seat'],
 describe:'An office swivel chair: five-star base with castors, gas lift, padded seat and backrest. A person can sit `on` it.',
 size:'1 m tall',
 build(ctx){
  const root=new THREE.Group();
  for(let i=0;i<5;i++){const a=i/5*Math.PI*2;root.add(ctx.mesh(at(G.box(0.3,0.03,0.04),[Math.cos(a)*0.15,0.06,Math.sin(a)*0.15],[0,-i*72,0]),{tone:0.6}));root.add(ctx.mesh(at(G.sphere(0.03,12,8),[Math.cos(a)*0.29,0.03,Math.sin(a)*0.29]),{tone:0.5}));}
  root.add(ctx.mesh(at(G.cyl(0.025,0.03,0.36,16),[0,0.25,0]),{tone:0.7}));
  root.add(ctx.mesh(at(G.rbox(0.48,0.07,0.46,0.03),[0,0.46,0]),{tone:0.9}));
  root.add(ctx.mesh(at(G.rbox(0.44,0.5,0.06,0.03),[0,0.8,-0.22],[-8,0,0]),{tone:0.9}));
  root.add(ctx.mesh(at(G.box(0.04,0.3,0.03),[0,0.55,-0.22]),{tone:0.6}));
  return {root,grounded:true,anchors:{seat:[0,0.47,0.02]},seatFacing:0};
 },
});

export const workstation=defineModel({
 id:'workstation',aliases:['computer-desk','office-setup','desk-setup'],
 describe:'A desk with a desktop monitor, keyboard and an office chair in front of it (chair faces the screen). A person put `on` it sits at the screen; use pose "type".',
 controls:{screen:'0..1 (default 0.7)'},defaults:{screen:0.7},size:'1.4 m wide',
 build(ctx){
  const d=desk.build(ctx).root,m=monitor.build(ctx).root,c=chair.build(ctx).root;
  m.position.set(0,0.755,-0.15);c.position.set(0,0,0.62);c.rotation.y=Math.PI;
  const root=new THREE.Group();root.add(d,m,c);
  root.add(ctx.mesh(at(G.rbox(0.44,0.02,0.14,0.006),[0,0.765,0.12]),{tone:0.8}));
  return {root,grounded:true,anchors:{seat:[0,0.47,0.6],top:[0,0.76,0]},seatFacing:180};
 },
});

export const lightbulb=defineModel({
 id:'lightbulb',aliases:['bulb','light-bulb','idea','lamp-bulb'],
 describe:'A classic pear-shaped light bulb with a screw base; `glow` switches it on with a halo. kind:"led" shows a modern LED bulb with a frosted dome and ribbed heat sink.',
 params:{kind:'classic | led'},controls:{glow:'0 off .. 1 on (default 0)'},defaults:{glow:0},size:'0.12 m',
 build(ctx){
  const kind=ctx.str('kind','classic',['classic','led'] as const);
  const root=new THREE.Group();
  const glass:[number,number][]=kind==='led'
   ?[[0.13,0.0],[0.2,0.07],[0.27,0.16],[0.3,0.26],[0.29,0.36],[0.24,0.44],[0.14,0.49],[0,0.505]]
   :[[0.12,0.0],[0.13,0.06],[0.2,0.16],[0.28,0.27],[0.31,0.37],[0.29,0.47],[0.22,0.55],[0.12,0.6],[0,0.62]];
  root.add(ctx.mesh(at(G.lathe(glass,48),[0,0.25,0]),{tone:0.85,glow:3.5,rough:0.3}));
  if(kind==='led'){for(let i=0;i<6;i++)root.add(ctx.mesh(at(G.cyl(0.14-i*0.006,0.135-i*0.006,0.035,32),[0,0.23-i*0.036,0]),{tone:i%2?0.55:0.85}));}
  else{for(let i=0;i<5;i++)root.add(ctx.mesh(at(G.torus(0.115,0.018,10,32),[0,0.22-i*0.04,0],[90,0,0]),{tone:0.75}));root.add(ctx.mesh(at(G.cyl(0.115,0.1,0.2,32),[0,0.13,0]),{tone:0.6}));}
  root.add(ctx.mesh(at(G.cyl(0.06,0.04,0.05,24),[0,0.015,0]),{tone:0.4}));
  return {root,grounded:true};
 },
});

export const reactor=defineModel({
 id:'reactor',aliases:['furnace','lab-machine','crystal-growth-machine','chamber','vacuum-chamber','mocvd'],
 describe:'A lab machine: a steel vacuum chamber with a domed lid, bolted flanges, a round glowing viewport, gas pipes and gauges on a frame. `glow` lights the viewport (heat inside), `shake` rattles it.',
 controls:{glow:'0..1 viewport glow (default 0.4)',shake:'0..1 rattling'},defaults:{glow:0.4,shake:0},size:'1.6 m tall',
 build(ctx){
  const root=new THREE.Group(),body=new THREE.Group();root.add(body);
  for(const x of [-0.42,0.42])for(const z of [-0.3,0.3])root.add(ctx.mesh(at(G.box(0.05,0.55,0.05),[x,0.275,z]),{tone:0.55}));
  root.add(ctx.mesh(at(G.box(1,0.05,0.75),[0,0.56,0]),{tone:0.7}));
  body.add(ctx.mesh(at(G.cyl(0.36,0.36,0.62,48),[0,0.9,0]),{tone:0.9,rough:0.4}));
  body.add(ctx.mesh(at(G.lathe([[0.4,0],[0.4,0.05],[0.36,0.08],[0.3,0.17],[0.18,0.25],[0,0.28]],48),[0,1.21,0]),{tone:0.95,rough:0.4}));
  for(const y of [0.6,1.21]){body.add(ctx.mesh(at(G.cyl(0.42,0.42,0.05,48),[0,y,0]),{tone:0.75}));for(let i=0;i<16;i++){const a=i/16*Math.PI*2;body.add(ctx.mesh(at(G.cyl(0.018,0.018,0.07,8),[Math.cos(a)*0.395,y,Math.sin(a)*0.395]),{tone:1}));}}
  body.add(ctx.mesh(at(G.cyl(0.13,0.13,0.06,32),[0,0.92,0.36],[90,0,0]),{tone:0.7}));
  body.add(ctx.mesh(at(G.cyl(0.095,0.095,0.02,32),[0,0.92,0.395],[90,0,0]),{tone:0.4,glow:3,color:'#ff8a2a'}));
  body.add(ctx.mesh(G.tube([[0.1,1.48,0],[0.1,1.7,0],[0.5,1.75,0],[0.75,1.6,0]],0.035,24,10),{tone:0.8}));
  body.add(ctx.mesh(G.tube([[-0.36,1.0,0],[-0.6,1.0,0],[-0.65,0.7,0],[-0.65,0.58,0]],0.04,24,10),{tone:0.8}));
  body.add(ctx.mesh(at(G.cyl(0.07,0.07,0.04,24),[0.24,1.05,0.29],[90,-35,0]),{tone:0.95}));
  body.add(ctx.mesh(at(G.cyl(0.065,0.065,0.01,24),[0.255,1.05,0.31],[90,-35,0]),{tone:0.3}));
  return {root,grounded:true,update(c,t){const s=(c.shake??0)*0.012;body.position.set(Math.sin(t*61)*s,Math.abs(Math.sin(t*47))*s,Math.cos(t*53)*s);}};
 },
});

export const medal=defineModel({
 id:'medal',aliases:['award','prize','nobel-prize','trophy-medal'],
 describe:'A gold-style award medal with a raised profile relief, hanging from a V-shaped ribbon. Spins nicely.',
 size:'0.3 m',
 build(ctx){
  const root=new THREE.Group();
  const disc=G.lathe([[0,0.012],[0.1,0.012],[0.12,0.01],[0.13,0.004],[0.13,-0.004],[0.12,-0.01],[0.1,-0.012],[0,-0.012]],64);disc.rotateX(Math.PI/2);
  root.add(ctx.mesh(at(disc,[0,0.14,0]),{tone:1,rough:0.3}));
  root.add(ctx.mesh(at(G.torus(0.112,0.008,8,64),[0,0.14,0.012]),{tone:1}));
  root.add(ctx.mesh(at(G.ellipsoid(0.045,0.06,0.012),[0,0.15,0.012]),{tone:0.85}));
  root.add(ctx.mesh(at(G.ellipsoid(0.03,0.025,0.01),[0,0.09,0.012]),{tone:0.85}));
  root.add(ctx.mesh(at(G.torus(0.02,0.006,8,24),[0,0.28,0]),{tone:0.9}));
  for(const s of [1,-1])root.add(ctx.mesh(at(G.box(0.07,0.28,0.006),[s*0.06,0.42,-0.01],[0,0,s*-18]),{tone:0.6}));
  return {root,grounded:false};
 },
});

export const book=defineModel({
 id:'book',aliases:['books','notebook','textbook'],
 describe:'A hardcover book lying flat (or `open` 1 for an open book with pages); `count` stacks several.',
 params:{count:'1..8 books stacked'},controls:{open:'0 closed .. 1 open'},size:'0.24 m',
 build(ctx){
  const n=Math.round(ctx.num('count',1,1,8)),root=new THREE.Group();
  for(let i=0;i<n;i++){const b=new THREE.Group();b.position.y=i*0.042;b.rotation.y=deg((i*37%20)-10);
   b.add(ctx.mesh(at(G.rbox(0.17,0.04,0.24,0.004),[0,0.02,0]),{tone:0.75}));b.add(ctx.mesh(at(G.box(0.16,0.032,0.23),[0.006,0.02,0]),{tone:1}));root.add(b);}
  return {root,grounded:true};
 },
});
