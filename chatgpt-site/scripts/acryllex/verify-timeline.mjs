// Visible GPU regressions for explicit text timelines and model-local wipe entrances.
// node scripts/acryllex/verify-timeline.mjs [--frozen] [--out=/path/to/evidence]
// Default runs need only the checked-in current engine. --frozen explicitly adds
// the local round24-source snapshot as a historical compatibility oracle.
import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join,resolve} from 'node:path';
import {build} from 'esbuild';
import {openAcryllex} from './render.mjs';

const site=fileURLToPath(new URL('../../',import.meta.url));
const artifact=resolve(site,'../artifacts/animation-recreation');
const args=process.argv.slice(2),historical=args.includes('--frozen'),output=args.find(a=>a.startsWith('--out='))?.slice(6);
assert.ok(args.every(a=>a==='--frozen'||a.startsWith('--out=')),'Usage: verify-timeline.mjs [--frozen] [--out=/path/to/evidence]');
assert.ok(output!=='' ,'--out requires a directory');
const out=output?resolve(output):null;
if(out)await mkdir(out,{recursive:true});
const oracleLabel=historical?'historical frozen24':'fresh current-engine';
const base={version:1,series:'ACRYLLEX',title:'Timeline GPU regression',captions:false,
 format:{width:600,height:400,cell:2},look:{inkMode:'fixed',palette:{blue:'#1234c8'},textColor:'#c5c5c5',shadows:0,ao:0,noise:0,fuzz:0,gamma:1,contrast:1,dotRoundness:0,dotSoftness:0},
 scenes:[{say:'timeline verification',duration:3,hue:'blue',ground:false,ao:0,camera:{move:'static',pos:[0,0,4],look:[0,0,0],fov:36},
 light:{key:0,fill:0,rim:0,ambient:1,contrast:1,blackPoint:0,whitePoint:1,gamma:1,exposure:1},
 objects:[{id:'hidden',model:'cube',origin:'center',enter:'cut',enterAt:4,idle:'none'}],text:[]}]};
const textBase={text:'REVISIT',style:'headline',highlight:'RE',font:'roboto-condensed',weight:700,size:120,
 pos:[.15,.6],align:'left',at:0,until:3,cps:120,cursor:false,erase:false,glitchOnLand:false};
const textSpec=item=>{const s=structuredClone(base);s.scenes[0].text=[item];return s;};
const report={checks:[],findings:[],historicalCompatibility:historical,oracle:`${oracleLabel} page for default/empty/world equivalence; established automatic typing; independently authored static text layouts and clipped compose geometry. No sampler or clipping-plane implementation reused.`};
const {browser,page,errors}=await openAcryllex(textSpec(textBase));
const check=async(name,run)=>{try{const detail=await run();report.checks.push({name,passed:true,...detail});console.log('PASS',name);}catch(error){report.checks.push({name,passed:false,error:error.message});report.findings.push({name,error:error.message});console.error('FAIL',name,error.message);}};
try{
 await page.evaluate(()=>{
  window.timelineImages=new Map();
  window.timelineCapture=async(name,t)=>{
   const png=window.acryllex.shot(t),img=new Image();img.src='data:image/png;base64,'+png;await img.decode();
   const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;
   const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);
   window.timelineImages.set(name,{png,bytes:ctx.getImageData(0,0,canvas.width,canvas.height).data,width:canvas.width,height:canvas.height});return png;
  };
  window.timelineCompare=(one,two)=>{
   const a=window.timelineImages.get(one),b=window.timelineImages.get(two);let changed=0,union=0,intersection=0,sum=0;
   for(let i=0;i<a.bytes.length;i+=4){let different=false;for(let c=0;c<3;c++){const d=Math.abs(a.bytes[i+c]-b.bytes[i+c]);different||=d>0;sum+=d;}changed+=different;
    const aa=Math.max(...a.bytes.subarray(i,i+3))>40,bb=Math.max(...b.bytes.subarray(i,i+3))>40;union+=aa||bb;intersection+=aa&&bb;
   }
   return {changed,union,intersection,iou:union?intersection/union:1,meanAbsoluteError:sum/(a.bytes.length/4*3)};
  };
  window.timelineStats=name=>{
   const a=window.timelineImages.get(name);let ink=0,neutral=0,hue=0,x0=a.width,y0=a.height,x1=-1,y1=-1;
   for(let y=0;y<a.height;y++)for(let x=0;x<a.width;x++){const i=(y*a.width+x)*4,r=a.bytes[i],g=a.bytes[i+1],b=a.bytes[i+2];if(Math.max(r,g,b)<=40)continue;
    ink++;neutral+=Math.max(r,g,b)-Math.min(r,g,b)<5;hue+=b>r*1.5&&b>g*1.5;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
   }
   return {ink,neutral,hue,bounds:{x0,y0,x1,y1}};
  };
  // Measure connected black cutouts in the rendered highlight rectangle. Isolated cells
  // supply a direct pixel-size observation independent of the renderer's layout/glitch code.
  window.timelineCells=(cleanName,glitchName)=>{
   const clean=window.timelineImages.get(cleanName),glitch=window.timelineImages.get(glitchName),w=clean.width,h=clean.height;
   const mask=new Uint8Array(w*h),seen=new Uint8Array(w*h),components=[];
   for(let k=0;k<w*h;k++){const i=k*4;mask[k]=Math.max(...clean.bytes.subarray(i,i+3))>50&&Math.max(...glitch.bytes.subarray(i,i+3))<4?1:0;}
   for(let start=0;start<mask.length;start++)if(mask[start]&&!seen[start]){
    const stack=[start];seen[start]=1;let count=0,x0=w,y0=h,x1=-1,y1=-1;
    while(stack.length){const k=stack.pop(),x=k%w,y=Math.floor(k/w);count++;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
     for(const q of [x>0?k-1:-1,x<w-1?k+1:-1,y>0?k-w:-1,y<h-1?k+w:-1])if(q>=0&&mask[q]&&!seen[q]){seen[q]=1;stack.push(q);}
    }
    const width=x1-x0+1,height=y1-y0+1;if(width>=2&&height>=2&&count/(width*height)>.9)components.push({x0,y0,width,height,pixels:count});
   }
   const frequency=new Map();for(const c of components){const key=`${c.width}x${c.height}`;frequency.set(key,(frequency.get(key)??0)+1);}
   const pitch=axis=>{const coordinates=[...new Set(components.map(c=>c[axis]))].sort((a,b)=>a-b),gaps=new Map();
    for(let i=1;i<coordinates.length;i++){const gap=coordinates[i]-coordinates[i-1];gaps.set(gap,(gaps.get(gap)??0)+1);}return [...gaps].sort((a,b)=>b[1]-a[1]).slice(0,6);};
   // Fractional canvas placement can make a seven-pixel cell have a six-pixel
   // fully black core. Measure the spacing between cutouts, not that core size.
   return {rectangles:components.length,modalDimensions:[...frequency].sort((a,b)=>b[1]-a[1]).slice(0,8),horizontalPitch:pitch('x0'),verticalPitch:pitch('y0')};
  };
 });
 const load=s=>page.evaluate(s=>window.acryllex.load(s),s);
 const capture=async(name,t)=>{const png=await page.evaluate(([n,t])=>window.timelineCapture(n,t),[name,t]);if(out)await writeFile(join(out,name+'.png'),Buffer.from(png,'base64'));return png;};
 const compare=(a,b)=>page.evaluate(([a,b])=>window.timelineCompare(a,b),[a,b]);
 const same=async(a,b,message)=>{const result=await compare(a,b);assert.equal(result.changed,0,message);return result;};
 const stats=name=>page.evaluate(n=>window.timelineStats(n),name);
 const oracleEntry=historical?join(artifact,'round24-source/page.ts'):join(site,'src/acryllex/page.ts');
 const oracleBundle=(await build({entryPoints:[oracleEntry],bundle:true,write:false,format:'iife',target:'es2022',nodePaths:[join(site,'node_modules')],loader:{'.ttf':'dataurl'},logLevel:'error'})).outputFiles[0].text;
 const oraclePage=await browser.newPage();oraclePage.on('pageerror',e=>errors.push('oracle: '+e.message));await oraclePage.goto('about:blank');await oraclePage.addScriptTag({content:oracleBundle});
 const oracleShot=async(s,t)=>{await oraclePage.evaluate(s=>window.acryllex.load(s),s);return oraclePage.evaluate(t=>window.acryllex.shot(t),t);};
 report.gpu=await page.evaluate(()=>{const canvas=document.createElement('canvas'),gl=canvas.getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');const renderer=ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);gl.getExtension('WEBGL_lose_context')?.loseContext();return renderer;});

 await check(`default and empty typography tracks match the ${oracleLabel} page exactly`,async()=>{
  const s=structuredClone(base);s.scenes[0].text=[{...textBase,cps:9,erase:true,eraseDur:.4,glitch:[.6]},
   {...textBase,text:'GO DEEPER',highlight:undefined,pos:[.12,.85],size:72,zoom:[[.6,1.2]],zoomAnchor:'center'}];
  const rows=[];
  for(const t of [.15,.65,1.4,2.8]){
   const original=await oracleShot(s,t);await load(s);assert.equal(await capture(`default-${t}`,t),original,`Default text differs from the ${oracleLabel} oracle`);
   const empty=structuredClone(s);empty.scenes[0].text.forEach(item=>{item.reveal=[];item.keyframes=[];});await load(empty);
   assert.equal(await capture(`empty-${t}`,t),original,'Empty reveal/layout tracks change legacy text');rows.push({t,exact:true});
  }
  return {frames:rows};
 });

 const reveal={...textBase,reveal:[[.3,2],[.8,3],['40%',7],[1.8,4],[2.2,2],[2.5,0]]};
 await check('RE appears together, suffix waits, and explicit count steps hold and delete',async()=>{
  const samples=[[.299,0],[.3,2],[.65,2],[.8,3],[1.2,7],[1.6,7],[1.8,4],[2.2,2],[2.5,0]],results=[];
  await load(textSpec(reveal));for(const [t,count] of samples)await capture(`reveal-${t}`,t);
  for(const [t,count] of samples){
   const oracle={...textBase,at:count?t-(count-1+.2)/20:t+.1,cps:20};await load(textSpec(oracle));await capture(`count-oracle-${t}`,t);
   await same(`reveal-${t}`,`count-oracle-${t}`,`Visible count differs from established automatic typing at${t}`);results.push({t,count,...await stats(`reveal-${t}`)});
  }
  assert.equal(results[0].ink,0);assert.ok(results[1].hue>100);assert.equal(results[1].neutral,0,'Premature suffix appears with boxed RE');
  assert.ok(results[3].neutral>20,'Suffix does not appear at its count step');assert.equal(results.at(-1).ink,0);
  return {samples:results};
 });
 await check('spaces count in reveal steps without drawing a premature next letter',async()=>{
  const item={...textBase,text:'GO DEEPER',highlight:undefined,reveal:[[.2,2],[.5,3],[.8,4]]};await load(textSpec(item));
  await capture('spaces-two',.3);await capture('spaces-three',.6);await capture('spaces-four',.9);
  await same('spaces-two','spaces-three','A counted space draws or shifts a letter');const diff=await compare('spaces-three','spaces-four');assert.ok(diff.changed>40);return diff;
 });

 const layout={...textBase,text:'MOVE',highlight:undefined,size:100,pos:[.12,.45],zoomAnchor:'center',
  keyframes:[{at:.4,pos:[.2,.5],zoom:1,easing:'hold'},{at:'40%',pos:[.6,.7],zoom:1.8,easing:'linear'},{at:1.8,pos:[.35,.45],zoom:1.2,easing:'hold'}]};
 await check('position and zoom tracks hold, interpolate and stop at the authored visible layouts',async()=>{
  const samples=[[.2,[.12,.45],1],[.4,[.2,.5],1],[.8,[.4,.6],1.4],[1.2,[.6,.7],1.8],[1.7,[.6,.7],1.8],[1.8,[.35,.45],1.2],[2.5,[.35,.45],1.2]];
  await load(textSpec(layout));for(const [t] of samples)await capture(`layout-${t}`,t);
  for(const [t,pos,zoom] of samples){const oracle={...layout,keyframes:undefined,pos,zoom:[[0,zoom]]};await load(textSpec(oracle));await capture(`layout-oracle-${t}`,t);
   await same(`layout-${t}`,`layout-oracle-${t}`,`Rendered layout differs from static position/legacy zoom oracle at${t}`);}
  return {samples:samples.map(([t,pos,zoom])=>({t,pos,zoom}))};
 });
 await check('sparse position and zoom channels preserve the independent unkeyed channel',async()=>{
  const positionOnly={...textBase,text:'MOVE',highlight:undefined,pos:[.3,.6],zoom:[[0,1.6]],keyframes:[{at:0,pos:[.2,.5]},{at:1,pos:[.6,.7],easing:'linear'}]};
  await load(textSpec(positionOnly));await capture('position-only',.5);
  await load(textSpec({...positionOnly,keyframes:undefined,pos:[.4,.6]}));await capture('position-only-oracle',.5);await same('position-only','position-only-oracle','Position keys reset legacy zoom');
  const zoomOnly={...positionOnly,zoom:undefined,keyframes:[{at:0,zoom:1},{at:1,zoom:2,easing:'linear'}]};
  await load(textSpec(zoomOnly));await capture('zoom-only',.5);
  await load(textSpec({...zoomOnly,keyframes:undefined,zoom:[[0,1.5]]}));await capture('zoom-only-oracle',.5);await same('zoom-only','zoom-only-oracle','Zoom keys move the unkeyed anchor');return {exact:true};
 });

 async function glitchCase(tag,zoom,widthScale=1,glitchCell=7){
  const item={...textBase,text:'MMMM',style:'highlight',highlight:undefined,font:'roboto-condensed',pos:[.15,.7],size:120,boxPadding:[0,0],widthScale,
   keyframes:[{at:0,zoom}],glitch:[1],glitchCell};
  await load(textSpec({...item,glitch:[]}));await capture(tag+'-clean',1.02);
  await load(textSpec(item));await capture(tag+'-glitch',1.02);
  const delta=await compare(tag+'-clean',tag+'-glitch');assert.ok(delta.changed>100,'Glitch fixture has no visible cutouts');
  return {...await page.evaluate(([a,b])=>window.timelineCells(a,b),[tag+'-clean',tag+'-glitch']),delta};
 }
 await check('explicit glitch cell pitch remains seven output pixels across text zoom',async()=>{
  const small=await glitchCase('glitch-small',1),large=await glitchCase('glitch-large',1.8);
  assert.ok(small.rectangles>=3&&large.rectangles>=3,'Too few isolated visible cells to measure pitch');
  for(const observed of [small,large]){assert.equal(observed.horizontalPitch[0][0],7);assert.equal(observed.verticalPitch[0][0],7);}return {small,large};
 });
 await check('glitchCell output-pixel pitch also survives authored widthScale',async()=>{
  const scaled=await glitchCase('glitch-width-scale',1.8,.65);assert.equal(scaled.horizontalPitch[0][0],7,`Output-pixel glitchCell is stretched by widthScale: ${JSON.stringify(scaled)}`);assert.equal(scaled.verticalPitch[0][0],7);return scaled;
 });

 await check('text reveal, layout and glitch tracks are deterministic on reverse seek and reload',async()=>{
  const item={...layout,reveal:reveal.reveal,glitch:[1],glitchCell:7};const s=textSpec(item);await load(s);
  const first=await capture('timeline-combined',1.02);await page.evaluate(()=>{window.acryllex.shot(2.8);window.acryllex.shot(.1);});
  assert.equal(await capture('timeline-combined-reverse',1.02),first);await load(s);assert.equal(await capture('timeline-combined-reload',1.02),first);
  await load(textSpec(textBase));const defaultImage=await capture('timeline-unload',1);assert.equal(defaultImage,await oracleShot(textSpec(textBase),1));return {exact:true};
 });

 await check('carried text retains prior-scene pixels and hue until its explicit end',async()=>{
  const s=structuredClone(base),first=s.scenes[0];first.duration=1;first.hue='red';
  first.text=[{...textBase,text:'RE',highlight:'RE',until:1.2,carry:true}];
  const second=structuredClone(base.scenes[0]);second.duration=2;second.hue='blue';s.scenes.push(second);
  await load(s);const before=await capture('carry-before-cut',.7);
  assert.equal(await capture('carry-after-cut',1.05),before,'Carry changes the held glyphs or adopts the new scene hue');
  assert.equal(await capture('carry-before-end',1.19),before,'Carried text disappears before its explicit numeric end');
  await capture('carry-after-end',1.25);assert.equal((await stats('carry-after-end')).ink,0,'Carried text survives its explicit end');
  await page.evaluate(()=>{window.acryllex.shot(2.8);window.acryllex.shot(.3);});assert.equal(await capture('carry-reverse',1.05),before,'Carried text changes on reverse seek');
  const redPixels=await page.evaluate(()=>{const a=window.timelineImages.get('carry-after-cut').bytes;let n=0;for(let i=0;i<a.length;i+=4)n+=a[i]>a[i+1]*1.5&&a[i]>a[i+2]*1.5&&a[i]>50;return n;});
  assert.ok(redPixels>100,'Carry fixture does not visibly expose the old red hue');
  const scoped=structuredClone(s);delete scoped.scenes[0].text[0].carry;await load(scoped);await capture('carry-default-scoped',1.05);
  assert.equal((await stats('carry-default-scoped')).ink,0,'Text carries across a cut by default');
  const implicitEnd=structuredClone(s);delete implicitEnd.scenes[0].text[0].until;await load(implicitEnd);await capture('carry-no-explicit-end',1.05);
  assert.equal((await stats('carry-no-explicit-end')).ink,0,'Carry without an explicit extended end escapes its scene');
  return {preCutAndCarriedPixelsExact:true,redPixels,absentAfterEnd:true,defaultScoped:true,implicitEndScoped:true,reverseExact:true};
 });

 await check('glitchBox breaks broad offset tag padding while preserving legacy rendering',async()=>{
  const item={...textBase,text:'GO',style:'tag',highlight:undefined,pos:[.35,.6],boxPadding:[.5,.5],boxOffset:[.25,.15],glitch:[1]};
  await load(textSpec({...item,glitch:[]}));await capture('box-clean',1.02);
  await load(textSpec(item));const legacy=await capture('box-legacy',1.02);
  assert.equal(legacy,await oracleShot(textSpec(item),1.02),`Legacy box glitch differs from the ${oracleLabel} oracle`);
  await load(textSpec({...item,glitchBox:false}));assert.equal(await capture('box-explicit-false',1.02),legacy,'glitchBox:false changes legacy rendering');
  await load(textSpec({...item,glitchBox:true}));await capture('box-full-envelope',1.02);
  const bounds=(await stats('box-clean')).bounds;
  const padding=await page.evaluate(bounds=>{
   const clean=window.timelineImages.get('box-clean'),legacy=window.timelineImages.get('box-legacy'),boxed=window.timelineImages.get('box-full-envelope');let examined=0,legacyDark=0,boxedDark=0;
   // This visible left padding strip is outside the glyph-width glitch envelope.
   for(let y=bounds.y0+3;y<bounds.y1-3;y++)for(let x=bounds.x0+2;x<bounds.x0+12;x++){
    const i=(y*clean.width+x)*4;if(Math.min(...clean.bytes.subarray(i,i+3))<150)continue;examined++;
    legacyDark+=Math.max(...legacy.bytes.subarray(i,i+3))<20;boxedDark+=Math.max(...boxed.bytes.subarray(i,i+3))<20;
   }
   return {examined,legacyDark,boxedDark};
  },bounds);
  assert.ok(padding.examined>300,'Tag padding strip is too small to verify');assert.equal(padding.legacyDark,0,'Padding fixture overlaps the legacy glitch envelope');
  assert.ok(padding.boxedDark>100,'glitchBox leaves the broad offset padding intact');return padding;
 });

 await check('cursorWidth doubles visible cursor area without moving any glyph pixels',async()=>{
  const item={...textBase,text:'HOLD',highlight:undefined,pos:[.2,.6],size:216,cursor:true,cursorHold:true,cursorPeriod:2};
  await load(textSpec(item));const defaultCursor=await capture('cursor-default',.5);
  await load(textSpec({...item,cursorWidth:.03}));assert.equal(await capture('cursor-narrow',.5),defaultCursor,'Explicit default cursorWidth changes rendering');
  await load(textSpec({...item,cursorWidth:.06}));await capture('cursor-wide',.5);
  const result=await page.evaluate(()=>{
   const a=window.timelineImages.get('cursor-narrow'),b=window.timelineImages.get('cursor-wide');let narrowArea=0,wideArea=0,changedGlyphPixels=0;
   const neutral=p=>Math.max(...p)-Math.min(...p)<5&&Math.max(...p)>30;
   for(let i=0;i<a.bytes.length;i+=4){const x=a.bytes.subarray(i,i+3),y=b.bytes.subarray(i,i+3);
    if(x[2]>x[0]*1.5&&x[2]>x[1]*1.5)narrowArea+=x[2]/200;
    if(y[2]>y[0]*1.5&&y[2]>y[1]*1.5)wideArea+=y[2]/200;
    if(neutral(x)||neutral(y))changedGlyphPixels+=x.some((v,c)=>v!==y[c]);
   }
   return {narrowArea,wideArea,ratio:wideArea/narrowArea,changedGlyphPixels};
  });
  assert.ok(result.narrowArea>100,'Cursor fixture does not expose enough colored pixels');assert.ok(Math.abs(result.ratio-2)<.08,`Cursor width does not double: ${JSON.stringify(result)}`);
  assert.equal(result.changedGlyphPixels,0,'Changing cursorWidth moves or changes the letters');return result;
 });

 const cardCenter=[.4,.3,.1],cardSize=[1.5,.8,.025],stretch=[1.2,.8,1];
 function wipeSpec(axis,origin,space){
  const s=structuredClone(base);s.scenes[0].objects=[{id:'card',model:'compose',origin,enter:'none',idle:'none',enterSpace:space,stretch,
   keyframes:[{at:0,pos:[.15,-.1,0],rot:[18,-22,33],scale:.9},{at:1,pos:[-.1,.12,.05],rot:[-12,25,65],scale:1.15,easing:'linear'}],
   params:{grounded:false,parts:[{shape:'box',size:cardSize,pos:cardCenter,tone:1}]}}];
  s.scenes[0].events=[{at:0,dur:1,target:'card',show:axis,easing:'linear'}];return s;
 }
 function croppedGeometryOracle(axis,origin,fraction){
  const s=wipeSpec(axis,origin,undefined),o=s.scenes[0].objects[0];delete o.enterSpace;delete o.stretch;s.scenes[0].events=[];o.origin='model';
  const dimension=axis==='wipe-up'?1:0,direction=axis==='wipe-right'?1:-1;
  const size=cardSize.map((v,k)=>v*stretch[k]),center=cardCenter.map((v,k)=>origin==='center'?0:v*stretch[k]);
  center[dimension]+=direction*size[dimension]*(1-fraction)/2;size[dimension]*=fraction;
  o.params.parts=[{shape:'box',size,pos:center,tone:1}];return s;
 }
 await check(`default and explicit world wipes match the ${oracleLabel} page under transforms`,async()=>{
  const cases=[];
  for(const axis of ['wipe-up','wipe-left','wipe-right'])for(const origin of ['model','center']){
   const s=wipeSpec(axis,origin,undefined),expected=await oracleShot(s,.5);await load(s);const name=`world-${axis}-${origin}`;
   assert.equal(await capture(name,.5),expected,`Default world wipe differs from the ${oracleLabel} oracle`);
   await load(wipeSpec(axis,origin,'world'));assert.equal(await capture(name+'-explicit',.5),expected,'Explicit world differs from legacy default');cases.push({axis,origin,exact:true});
  }
  return {cases};
 });
 await check('local up, left and right wipes follow animated object transforms and both origins',async()=>{
  const cases=[];
  for(const axis of ['wipe-up','wipe-left','wipe-right'])for(const origin of ['model','center'])for(const fraction of [.25,.5,.75]){
   const name=`local-${axis}-${origin}-${fraction}`;await load(wipeSpec(axis,origin,'local'));await capture(name,fraction);
   await load(croppedGeometryOracle(axis,origin,fraction));await capture(name+'-oracle',fraction);const match=await compare(name,name+'-oracle');
   assert.ok(match.union>1000,'Wipe geometry fixture is too small to inspect');
   assert.ok(match.iou>.975,`Local wipe differs from independently built clipped geometry: ${axis}/${origin}/${fraction} ${JSON.stringify(match)}`);
   cases.push({axis,origin,fraction,...match});
  }
  return {cases};
 });
 await check('local wipe differs from world coordinates and resets on reverse seek and reload',async()=>{
  const s=wipeSpec('wipe-left','center','local');await load(s);const image=await capture('wipe-seek',.5);
  await page.evaluate(()=>{window.acryllex.shot(1.2);window.acryllex.shot(.1);});assert.equal(await capture('wipe-seek-reverse',.5),image);
  await load(s);assert.equal(await capture('wipe-seek-reload',.5),image);const distinction=await compare('wipe-seek','world-wipe-left-center');
  assert.ok(distinction.changed>100,'Rotated fixture cannot distinguish local and world axes');return distinction;
 });
 await oraclePage.close();
 await check('no browser JavaScript or rendering errors',async()=>{assert.deepEqual(errors,[]);return {errors};});
 report.passed=report.checks.every(c=>c.passed);report.errors=errors;
 if(out)await writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(`${report.checks.filter(c=>c.passed).length}/${report.checks.length} timeline GPU checks passed (${oracleLabel} equivalence${historical?' and historical compatibility':''}).${out?' '+join(out,'report.json'):''}`);
 if(!report.passed)process.exitCode=1;
}finally{await browser.close();}
