import * as THREE from 'three';
import {G,at,deg,lerp,clamp,smooth,rng,ease} from '../kit.ts';
import {defineModel} from './types.ts';

// ================================================================= city skyline that builds up
export const skyline=defineModel({
 id:'skyline',aliases:['city-build','growing-city','city-construction','downtown'],
 describe:'A dense city skyline seen side-on: houses at the left growing into rows of office towers with window grids, on a thin ground line with a faint reflection. `build` 0..1 makes buildings rise from the ground one by one as wireframe scaffolds; authored rise timing and height clipping can construct their floors independently. `solid` 0..1 fills the wireframes into solid buildings (staggered).',
 controls:{build:'0 nothing .. 1 all risen (default 1)',solid:'0 wireframe .. 1 solid (default 1)'},defaults:{build:1,solid:1},params:{count:'buildings 10..40 (default 26)',spacing:'gap factor between buildings (default 1)',reflection:'true|false',maxHeight:'tallest tower in m (default 3.4)',buildings:'optional explicit [{x,z,width,height,depth,yaw,style,columns,floors,tiers,fillDelay,fillSpeed,buildDelay,buildSpeed,buildPower,windowRows,windowBottom,windowTop,windowWidth,windowHeight,windowOffsetX,windowTone,groundFloor,doorColumns,bodyTone,bottomTone,sideTone,sideOffsetX,sideOffsetY,antenna,antennaX,fillReveal,fillPower,buildReveal}]',yaw:'building yaw degrees (default 0)',groundZ:'ground line depth (default 0)',groundThickness:'ground line thickness m (default .035)',fillMode:'alpha (default) or luminance: fill clean opaque facades by their light level',windowTone:'window brightness (default .08)',sideOffsetX:'optional offset of the back edge, m (default 0)',sideOffsetY:'optional top offset of the back edge, m (default 0)',wireTone:'scaffold brightness (default 1)',fillReveal:'luminance (default) or height: solid floors replace the scaffold from the bottom',fillPower:'height reveal curve exponent (default 1)',buildReveal:'scale (default) or height: expose floors at their original pitch while a building rises',buildingRise:'Each authored building may set buildDelay (control start), buildSpeed (control span), buildPower (curve exponent); omitted values retain sequential construction'},
 size:'16 m wide',
 build(ctx){
  const root=new THREE.Group();const r=rng(ctx.seed+7);
  type Building={x:number;z?:number;width:number;height:number;depth?:number;yaw?:number;style?:number;house?:boolean;tiers?:number;columns?:number;floors?:number;fillDelay?:number;fillSpeed?:number;buildDelay?:number;buildSpeed?:number;buildPower?:number;buildReveal?:string;windowWidth?:number;windowOffsetX?:number;windowHeight?:number;windowBottom?:number;windowTop?:number;windowRows?:number;windowTone?:number;groundFloor?:number;doorColumns?:number;sideOffsetX?:number;sideOffsetY?:number;bodyTone?:number;bottomTone?:number;sideTone?:number;antenna?:number;antennaX?:number;fillReveal?:string;fillPower?:number};
  const authored=Array.isArray(ctx.params.buildings)?(ctx.params.buildings as Building[]).filter(b=>b&&[b.x,b.width,b.height].every(Number.isFinite)&&b.width>0&&b.height>0).slice(0,64):[];
  const n=authored.length||Math.round(ctx.num('count',26,8,48));const span=ctx.num('span',16,2,100);
  const T=ctx.num('wire',0.06,0.01,0.2); // wire thickness (>= one dot at a full-skyline framing)
  const luminanceFill=ctx.str('fillMode','alpha',['alpha','luminance'])==='luminance';
  const groundThickness=ctx.num('groundThickness',.035,.005,.2);
  const ground=ctx.mesh(at(G.box(span*1.6,groundThickness,groundThickness),[0,groundThickness/2,ctx.num('groundZ',0,-5,5)]),{tone:1});root.add(ground);
  interface B {g:THREE.Group;wire:THREE.Group;solid:THREE.Group;h:number;order:number;fillDelay:number;fillSpeed:number;buildDelay?:number;buildSpeed:number;buildPower:number;buildHeightReveal:boolean;buildHeight:number;lastBuildReveal:number;mats:THREE.MeshStandardMaterial[];wmats:THREE.MeshStandardMaterial[];baseColors:THREE.Color[];wireColors:THREE.Color[];heightReveal:boolean;fillPower:number;solidGeos:RevealGeometry[];wireGeos:RevealGeometry[];lastReveal:number}
  type RevealGeometry={geo:THREE.BufferGeometry;positions:Float32Array};
  const capture=(group:THREE.Group)=>{const out:RevealGeometry[]=[];group.traverse(o=>{const m=o as THREE.Mesh;if(m.isMesh)out.push({geo:m.geometry,positions:Float32Array.from(m.geometry.getAttribute('position').array)});});return out;};
  // Retain original vertices so reveals crop floors and windows without scaling them, and seeking is exact.
  const clipHeight=(items:RevealGeometry[],height:number,below:boolean,full:boolean)=>{for(const {geo,positions} of items){const p=geo.getAttribute('position');for(let q=0;q<p.count;q++){const y=positions[q*3+1]!;p.setY(q,full?y:below?Math.min(y,height):Math.max(y,height));}p.needsUpdate=true;geo.computeVertexNormals();}};
  const clipRange=(items:RevealGeometry[],low:number,high:number,full:boolean)=>{for(const {geo,positions} of items){const p=geo.getAttribute('position');for(let q=0;q<p.count;q++){const y=positions[q*3+1]!;p.setY(q,full?y:Math.max(low,Math.min(y,high)));}p.needsUpdate=true;geo.computeVertexNormals();}};
  const list:B[]=[];
  let x=-span/2;
  for(let i=0;i<n;i++){
   const k=n>1?i/(n-1):0;
   const a=authored[i];const house=a?(a.house??false):k<0.12;
   const bw=a?.width??(house?0.7+r()*0.3:0.55+r()*0.7);const bh=a?.height??(house?0.55+r()*0.25:lerp(0.9,ctx.num('maxHeight',3.4,1,12),Math.pow(r(),1.4))*(0.5+0.5*smooth(clamp((k-0.1)/0.6)))*(r()<0.18?1.6:1));const bd=a?.depth??0.6+r()*0.5;
   const z=a?.z??(r()-0.5)*1.6;const g=new THREE.Group();g.name=`building-${i}`;g.position.set(a?.x??x+bw/2,0,z);root.add(g);x+=bw*(ctx.num('spacing',1,0.5,3)*(0.75+r()*0.35));
   g.rotation.y=deg(a?.yaw??ctx.num('yaw',0,-180,180));
   const wire=new THREE.Group(),solid=new THREE.Group();g.add(wire,solid);
   const buildHeightReveal=(a?.buildReveal??ctx.str('buildReveal','scale',['scale','height']))==='height';
   const heightReveal=luminanceFill&&(a?.fillReveal??ctx.str('fillReveal','luminance',['luminance','height']))==='height';
   // solid: tower body (optionally with setbacks), side faces darker, windows as recessed strips or grids
   const style=a?.style??(house?0:Math.floor(r()*3));
   const tiers=a?.tiers??(house?1:(bh>2.2&&r()<0.6?2+Math.floor(r()*2):1));
   for(let k2=0;k2<tiers;k2++){const f0=k2/tiers,f1=(k2+1)/tiers;const sw=bw*(1-k2*0.22),sd=bd*(1-k2*0.18);const y0=bh*f0*(tiers>1?0.8:1),y1=k2===tiers-1?bh:bh*f1*0.8;
    const body=ctx.mesh(at(G.box(sw,y1-y0,sd),[0,(y0+y1)/2,0]),{tone:a?.bodyTone??(0.75+r()*0.25)});solid.add(body);
    // vertex shade: darker toward the bottom (haze) gives the reference's gradient facades
    {const g=body.geometry;const pa=g.attributes.position!;const col=new Float32Array(pa.count*3);for(let q=0;q<pa.count;q++){const yy=pa.getY(q);const bottom=a?.bottomTone??0.55;const v=(g.attributes.normal!.getX(q)<-.5?(a?.sideTone??1):1)*(bottom+(1-bottom)*clamp((a?.bottomTone===undefined?yy+(y1-y0)/2:yy-y0)/(y1-y0+1e-6)));col[q*3]=col[q*3+1]=col[q*3+2]=v;}g.setAttribute('color',new THREE.BufferAttribute(col,3));(body.material as THREE.MeshStandardMaterial).vertexColors=true;}
    const wd=luminanceFill ? .001 : .03,wz=sd/2+(luminanceFill ? .001 : .005);
    const winGeos:THREE.BufferGeometry[]=[];const floors=a?.windowRows??a?.floors??Math.max(2,Math.round((y1-y0)/0.3)),cols=a?.columns??Math.max(2,Math.round(sw/(style===1?0.12:0.2)));
    const wy0=a?.windowBottom===undefined?y0:y0+(y1-y0)*clamp(a.windowBottom),wy1=a?.windowTop===undefined?y1:y0+(y1-y0)*clamp(a.windowTop),wh=Math.max(.01,wy1-wy0);
    if(style===1){for(let c=0;c<cols;c++)winGeos.push(at(G.box(sw/cols*(a?.windowWidth??0.42),wh*(a?.windowBottom===undefined&&a?.windowTop===undefined ? .86 : 1),wd),[-sw/2+(c+0.5)*sw/cols+(a?.windowOffsetX??0),(wy0+wy1)/2,wz]));}
    else if(style===2){for(let f=0;f<floors;f++)winGeos.push(at(G.box(sw*(a?.windowWidth??.86),wh/floors*(a?.windowHeight??.42),wd),[0,wy0+(f+.55)*wh/floors,wz]));}
    else for(let f=0;f<(a?.windowRows===undefined?floors-1:floors);f++)for(let c=0;c<cols;c++){if(house&&f>0)continue;winGeos.push(at(G.box(sw/cols*(a?.windowWidth??.55),wh/floors*(a?.windowHeight??.5),wd),[-sw/2+(c+.5)*sw/cols,wy0+(f+.6)*wh/floors,wz]));}
    if(a?.groundFloor){const dh=(y1-y0)*a.groundFloor,dc=a.doorColumns??2;for(let c=0;c<dc;c++)winGeos.push(at(G.box(sw*.78/dc,dh,wd),[-sw*.39+(c+.5)*sw*.78/dc,y0+dh/2,wz]));}
    if(winGeos.length){const windows=ctx.mesh(G.merge(winGeos),{tone:a?.windowTone??ctx.num('windowTone',.08,0,1)});if((a?.windowTone??ctx.num('windowTone',.08,0,1))===0){(windows.material as THREE.MeshStandardMaterial).color.setRGB(0,0,0);(windows.material as THREE.MeshStandardMaterial).userData.tone=0;}solid.add(windows);}}

   if(house){const roof=G.extrude([[-bw/2-0.04,0],[bw/2+0.04,0],[0,bw*0.45]],bd,0);solid.add(ctx.mesh(at(roof,[0,bh,0]),{tone:0.9}));}
   else if(!a){if(r()<0.4)solid.add(ctx.mesh(at(G.box(0.03,0.5+r()*0.6,0.03),[bw*0.2,bh+0.3,0]),{tone:1}));if(r()<0.5)solid.add(ctx.mesh(at(G.box(bw*0.4,0.18,bd*0.4),[0,bh+0.09,0]),{tone:0.8}));}
   if(a?.antenna)solid.add(ctx.mesh(at(G.box(0.03,a.antenna,0.03),[a.antennaX??bw*.2,bh+a.antenna/2,0]),{tone:1}));
   const floors=Math.max(2,Math.round(bh/0.32)),cols=Math.max(2,Math.round(bw/0.17));
   // wireframe: edges + floor bands + mullions
   const eg:THREE.BufferGeometry[]=[];
   for(const sx of [-1,1])for(const sz of [-1,1])eg.push(at(G.box(T,bh,T),[sx*bw/2,bh/2,sz*bd/2]));
   for(let f=0;f<=floors;f++){const y=f*bh/floors;eg.push(at(G.box(bw,T,T),[0,y,bd/2]));eg.push(at(G.box(T,T,bd),[bw/2,y,0]));if(f===floors){eg.push(at(G.box(bw,T,T),[0,y,-bd/2]));eg.push(at(G.box(T,T,bd),[-bw/2,y,0]));}}
   for(let c=1;c<cols;c++)eg.push(at(G.box(T*0.7,bh,T*0.7),[-bw/2+c*bw/cols,bh/2,bd/2]));
   if(house)eg.push(at(G.extrude([[-bw/2,0],[bw/2,0],[0,bw*0.42]],T,0,[[[-bw/2+T*2,T],[0,bw*0.42-T*2.5],[bw/2-T*2,T]]]),[0,bh,bd/2]));
   if(heightReveal&&a?.antenna)eg.push(at(G.box(Math.min(T,.03),a.antenna,Math.min(T,.03)),[a.antennaX??bw*.2,bh+a.antenna/2,0]));
   wire.add(ctx.mesh(G.merge(eg),{tone:ctx.num('wireTone',1,0,2)}));
   // An optional oblique extrusion keeps the facade upright while exposing the side wall.
   const sideX=a?.sideOffsetX??ctx.num('sideOffsetX',0,-2,2),sideY=a?.sideOffsetY??ctx.num('sideOffsetY',0,-2,2);
   if(sideX||sideY)g.traverse(o=>{const mesh=o as THREE.Mesh;if(!mesh.isMesh)return;const geo=mesh.geometry,pa=geo.getAttribute('position');for(let q=0;q<pa.count;q++){const d=clamp((bd/2-pa.getZ(q))/bd),yy=pa.getY(q);pa.setXYZ(q,pa.getX(q)+sideX*d,yy+sideY*d*clamp(yy/bh),pa.getZ(q));}pa.needsUpdate=true;geo.computeVertexNormals();});
   let buildHeight=bh;if(buildHeightReveal)g.traverse(o=>{const m=o as THREE.Mesh;if(m.isMesh){const p=m.geometry.getAttribute('position');for(let q=0;q<p.count;q++)buildHeight=Math.max(buildHeight,p.getY(q));m.geometry.computeBoundingBox();m.geometry.computeBoundingSphere();}});
   const mats:THREE.MeshStandardMaterial[]=[];solid.traverse(o=>{const m=(o as THREE.Mesh).material as THREE.MeshStandardMaterial;if(m)mats.push(m);});
   const wmats:THREE.MeshStandardMaterial[]=[];wire.traverse(o=>{const m=(o as THREE.Mesh).material as THREE.MeshStandardMaterial;if(m)wmats.push(m);});
   list.push({g,wire,solid,h:bh,buildHeightReveal,buildHeight,lastBuildReveal:-1,buildDelay:Number.isFinite(a?.buildDelay)?clamp(a!.buildDelay!,-1,1):undefined,buildSpeed:Number.isFinite(a?.buildSpeed)?clamp(a!.buildSpeed!,.0001,4):.12,buildPower:Number.isFinite(a?.buildPower)?clamp(a!.buildPower!,.1,12):1,heightReveal,fillPower:Math.max(.05,a?.fillPower??ctx.num('fillPower',1,.05,8)),solidGeos:heightReveal||buildHeightReveal?capture(solid):[],wireGeos:heightReveal||buildHeightReveal?capture(wire):[],lastReveal:-1,order:k+(a?0:r()*0.35),fillDelay:a?.fillDelay??k*0.6,fillSpeed:a?.fillSpeed??0.4,mats,wmats,baseColors:mats.map(m=>{m.userData.cityBaseTone=m.userData.tone??1;return m.color.clone();}),wireColors:wmats.map(m=>{m.userData.cityBaseTone=m.userData.tone??1;return m.color.clone();})});
  }
  // reflection: a squashed, dim mirror image below the ground line
  const reflect=ctx.bool('reflection',true);let mirror:THREE.Group|null=null;
  const reflectedMaterials:{copy:THREE.MeshStandardMaterial;source:THREE.MeshStandardMaterial}[]=[];
  if(reflect){mirror=new THREE.Group();mirror.name='reflection';for(const b of list){const c=b.g.clone(true);c.traverse(o=>{const m=o as THREE.Mesh;if(m.isMesh){const source=m.material as THREE.MeshStandardMaterial,copy=source.clone();m.material=copy;copy.color.multiplyScalar(.28);copy.userData.tone=(source.userData.tone??1)*.28;reflectedMaterials.push({copy,source});}});mirror.add(c);}mirror.scale.y=-0.22;root.add(mirror);}
  const order=list.map((b,i)=>({b,i})).sort((a,b)=>a.b.order-b.b.order);
  return {root,grounded:true,update(c){
   const build=clamp(c.build??1),sol=clamp(c.solid??1);
   order.forEach(({b},j)=>{
    const t0=b.buildDelay??j/order.length*.88;const kb=Math.pow(ease.out(clamp((build-t0)/b.buildSpeed)),b.buildPower);
    b.g.scale.y=b.buildHeightReveal?1:Math.max(0.001,kb);b.g.visible=kb>0.002;
    const ks=smooth(clamp((sol-b.fillDelay)/b.fillSpeed));
    const reveal=b.heightReveal?Math.pow(ks,b.fillPower):ks;
    if(b.buildHeightReveal&&(Math.abs(kb-b.lastBuildReveal)>1e-7||(b.heightReveal&&Math.abs(reveal-b.lastReveal)>1e-7))){const top=b.buildHeight*kb,fill=b.heightReveal&&reveal<.99999?b.h*reveal:Infinity;clipRange(b.solidGeos,-Infinity,Math.min(top,fill),kb>.99999&&fill===Infinity);clipRange(b.wireGeos,b.heightReveal?Math.min(top,fill):-Infinity,top,kb>.99999&&(!b.heightReveal||reveal<.00001));b.lastBuildReveal=kb;b.lastReveal=reveal;}
    else if(!b.buildHeightReveal&&b.heightReveal&&Math.abs(reveal-b.lastReveal)>1e-7){clipHeight(b.solidGeos,b.h*reveal,true,reveal>.99999);clipHeight(b.wireGeos,b.h*reveal,false,reveal<.00001);b.lastReveal=reveal;}
    if(luminanceFill){b.g.traverse(o=>{const m=o as THREE.Mesh;if(m.isMesh){m.castShadow=false;m.receiveShadow=false;}});b.wire.visible=b.heightReveal?(b.buildHeightReveal?reveal<.99999&&b.h*reveal<b.buildHeight*kb-1e-7:reveal<.99999):ks<.8;}
    b.solid.visible=reveal>0.01;
    const lightFill=b.heightReveal?1:ks,wireFade=b.heightReveal?1:(1-ks)*(1-ks);
    if(luminanceFill){for(let i=0;i<b.mats.length;i++){b.mats[i]!.opacity=1;b.mats[i]!.userData.tone=b.mats[i]!.userData.cityBaseTone*lightFill;b.mats[i]!.color.copy(b.baseColors[i]!).multiplyScalar(lightFill);}for(let i=0;i<b.wmats.length;i++){b.wmats[i]!.opacity=1;b.wmats[i]!.userData.tone=b.wmats[i]!.userData.cityBaseTone*wireFade;b.wmats[i]!.color.copy(b.wireColors[i]!).multiplyScalar(wireFade);}}
    else{for(const m of b.mats)m.opacity=ks;for(const m of b.wmats)m.opacity=1-ks*.85;}
   });
   if(mirror){if(luminanceFill)mirror.traverse(o=>{const m=o as THREE.Mesh;if(m.isMesh){m.castShadow=false;m.receiveShadow=false;}});mirror.children.forEach((c2,i)=>{const b=list[i]!;c2.scale.y=b.g.scale.y;c2.visible=b.g.visible;c2.children[0]!.visible=b.wire.visible;c2.children[1]!.visible=b.solid.visible;});
    for(const {copy,source} of reflectedMaterials){copy.opacity=source.opacity;if(luminanceFill){copy.color.copy(source.color).multiplyScalar(.28);copy.userData.tone=(source.userData.tone??1)*.28;}}
   }
  }};
 },
});
