export const FRAME_WIDTH = 1080;
export const FRAME_HEIGHT = 1920;
export const SAFE_RECT = {x:96,y:240,width:888,height:1260};

// Source: P1 in output/ecosystem/02-tooling-plan.md plus the standard full-screen
// Instagram Reels UI. These are approximate editorial masks, not fixed Meta specs.
export const SAFE_ZONES = [
  {id:'top-header',label:'Top header',x:0,y:0,width:1080,height:220,color:'#ff3b30'},
  {id:'right-actions',label:'Right action rail',x:930,y:1000,width:150,height:700,color:'#ff9f0a'},
  {id:'bottom-caption-cta',label:'Bottom caption / CTA',x:0,y:1540,width:1080,height:380,color:'#bf5af2'},
];

export const SCENE_SAMPLE_FRACTIONS = [0.2,0.6,0.9];
export const MIN_CAPTION_HEIGHT_PX = 28;
export const MIN_RENDERED_TEXT_HEIGHT_PX = 18;
export const MIN_ESSENTIAL_TEXT_HEIGHT_PX = 64;
export const MIN_SECONDARY_TEXT_HEIGHT_PX = 48;
export const MIN_TEXT_CONTRAST = 4.5;
/** Tesseract token confidence is 0–100; lower-confidence tokens do not count toward the word cap. */
export const MIN_OCR_TOKEN_CONFIDENCE = 40;
export const MIN_CHROME_SAMPLE_SHARE = 0.8;
export const EVENT_VISUAL_CHANGE_THRESHOLD = 0.001;
export const MIN_OPENING_HOOK_COVERAGE = 0.65;
export const MIN_OPENING_HOOK_OCR_MATCH = 0.5;

export function parseArgs(args){
 const options={cover:false,coverTime:null,outDir:null,positionals:[]};
 for(let i=0;i<args.length;i++){
  const arg=args[i];
  if(arg==='--help'||arg==='-h') options.help=true;
  else if(arg==='--cover') options.cover=true;
  else if(arg==='--cover-time'){
   const value=Number(args[++i]);
   if(!Number.isFinite(value)||value<0) throw new Error('--cover-time must be a non-negative number of seconds');
   options.cover=true;options.coverTime=value;
  }else if(arg==='--out-dir'){
   const value=args[++i];if(!value)throw new Error('--out-dir needs a directory');options.outDir=value;
  }else if(arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
  else options.positionals.push(arg);
 }
 if(!options.help&&(options.positionals.length<1||options.positionals.length>2)) throw new Error('Usage: reel-qa.mjs <spec.json> [video.mp4] [--cover] [--cover-time SECONDS] [--out-dir DIR]');
 return options;
}

export function reelDuration(spec){return spec.scenes.reduce((sum,scene)=>sum+scene.duration,0);}

export function hookFrameTimes(spec){
 const duration=spec.scenes?.[0]?.duration??0;
 return {zero:0,built:duration*0.6};
}

export function sampleFrames(spec){
 const frames=[];let start=0;
 spec.scenes.forEach((scene,sceneIndex)=>{
  for(const fraction of SCENE_SAMPLE_FRACTIONS) frames.push({time:start+scene.duration*fraction,sceneIndex,sceneType:scene.type,fraction,purpose:'scene-sample'});
  if(sceneIndex>0&&scene.transition&&scene.transition!=='cut'){
   const half= new Set(['whip','push','morph','slide']).has(scene.transition)?0.1:0.15;
   for(const fraction of [0.15,0.35,0.5,0.65,0.85]){
    const time=start-half+fraction*half*2;
    frames.push({time,sceneIndex:time<start?sceneIndex-1:sceneIndex,sceneType:time<start?spec.scenes[sceneIndex-1].type:scene.type,fraction,purpose:'transition-sample',transitionName:scene.transition});
   }
  }
  start+=scene.duration;
 });
 for(const caption of captionEntries(spec)) frames.push({time:(caption.start+caption.end)/2,sceneIndex:caption.sceneIndex,sceneType:caption.sceneType,fraction:null,purpose:'caption-sample',caption:caption.text});
 const hook=hookFrameTimes(spec);
 frames.push({time:hook.zero,sceneIndex:0,sceneType:spec.scenes[0]?.type??'unknown',fraction:0,purpose:'frame-zero'});
 frames.push({time:hook.built,sceneIndex:0,sceneType:spec.scenes[0]?.type??'unknown',fraction:0.6,purpose:'hook-built'});
 return frames.sort((a,b)=>a.time-b.time);
}

export function contactFrames(frames){return frames.filter(frame=>frame.purpose==='scene-sample'||frame.purpose==='transition-sample'||frame.purpose==='frame-zero'||frame.purpose==='hook-built');}

export function sceneEventTime(scene,event){
 if(Number.isFinite(event?.at))return Math.max(0,Math.min(scene.duration,event.at));
 const words=normalizeWords(scene?.say??''),anchor=normalizeWords(event?.word??'')[0];
 const index=words.findIndex(word=>word===anchor);
 return words.length?scene.duration*Math.max(0,index)/words.length:0;
}

export function eventAuditFrames(spec){
 const frames=[];let start=0,eventId=0;
 spec.scenes.forEach((scene,sceneIndex)=>{
  (scene.events??[]).forEach((event,eventIndex)=>{
   const local=sceneEventTime(scene,event),before=Math.max(0,local-0.12),after=Math.min(Math.max(0,scene.duration-1/30),local+0.28);
   frames.push({eventId:eventId++,eventIndex,sceneIndex,sceneType:scene.type,kind:event.kind,declaredAt:start+local,beforeAt:start+before,afterAt:start+after});
  });
  start+=scene.duration;
 });
 return frames;
}

export function captionEntries(spec){
 if(spec.captions?.length) return spec.captions.map(caption=>({...caption,sceneIndex:null,sceneType:null}));
 const entries=[];let start=0;
 for(let sceneIndex=0;sceneIndex<spec.scenes.length;sceneIndex++){
  const scene=spec.scenes[sceneIndex];
  const lines=(Array.isArray(scene.caption)?scene.caption:scene.caption?[scene.caption]:[]).filter(line=>line.trim());
  const span=scene.duration/Math.max(1,lines.length);
  lines.forEach((text,index)=>entries.push({text,start:start+index*span,end:start+(index+1)*span,sceneIndex,sceneType:scene.type}));
  start+=scene.duration;
 }
 return entries;
}

export function findEllipses(value,path='$',found=[]){
 if(typeof value==='string'){
  if(/…|\.{3,}/u.test(value))found.push({path,text:value});
 }else if(Array.isArray(value))value.forEach((item,index)=>findEllipses(item,`${path}[${index}]`,found));
 else if(value&&typeof value==='object')for(const [key,item] of Object.entries(value))findEllipses(item,`${path}.${key}`,found);
 return found;
}

export function expectedHookText(scene={}){
 const preferred=['text','headline','hook','title','words','cta','label'];
 for(const key of preferred){
  const value=scene[key];
  if(typeof value==='string'&&value.trim())return value;
  if(Array.isArray(value)&&value.length&&value.every(item=>typeof item==='string'))return value.join(' ');
 }
 if(scene.data&&typeof scene.data==='object'){
  for(const key of preferred){const value=scene.data[key];if(typeof value==='string'&&value.trim())return value;if(Array.isArray(value)&&value.length&&value.every(item=>typeof item==='string'))return value.join(' ');}
 }
 return '';
}

export function normalizeWords(text){
 return String(text??'').replace(/\*+/g,'').toLowerCase().match(/[\p{L}\p{N}]+/gu)??[];
}

/** Detects OCR text or small edge marks that recur in at least 80% of the sampled scenes. */
export function persistentChrome({textSamples=[],markSamples=[],gridWidth=36,gridHeight=64,cellWidth=30,cellHeight=30,minimumShare=MIN_CHROME_SAMPLE_SHARE}={}){
 const textFrames=new Set(textSamples.map(sample=>sample.frameKey)),markFrames=new Set(markSamples.map(sample=>sample.frameKey));
 const totalSamples=textFrames.size||markFrames.size;
 const threshold=Math.max(1,Math.ceil(totalSamples*minimumShare));
 const textGroups=new Map();
 for(const sample of textSamples){
  const frameKey=sample.frameKey;
  for(const line of sample.lines??[]){
   const words=normalizeWords(line.text).join(' ');if(!words)continue;
   const position=`${Math.round(line.left/120)}:${Math.round(line.top/120)}`,key=`${words}|${position}`;
   const group=textGroups.get(key)??{text:line.text,normalized:words,position,samples:new Set(),box:{left:line.left,top:line.top,width:line.width,height:line.height}};
   group.samples.add(frameKey);textGroups.set(key,group);
  }
 }
 const persistentText=[...textGroups.values()].filter(group=>group.samples.size>=threshold).map(group=>({text:group.text,normalized:group.normalized,position:group.position,sampleCount:group.samples.size,sampleShare:group.samples.size/Math.max(1,totalSamples),...group.box}));
 const cellCount=gridWidth*gridHeight,counts=new Uint16Array(cellCount);
 for(const sample of markSamples){
  const cells=sample.cells??[];
  for(let index=0;index<Math.min(cellCount,cells.length);index++)if(cells[index])counts[index]++;
 }
 const occupied=new Uint8Array(cellCount);for(let index=0;index<cellCount;index++)if(counts[index]>=threshold)occupied[index]=1;
 const seen=new Uint8Array(cellCount),components=[];
 for(let index=0;index<cellCount;index++){
  if(!occupied[index]||seen[index])continue;
  const stack=[index],cells=[];seen[index]=1;
  while(stack.length){
   const current=stack.pop(),x=current%gridWidth,y=Math.floor(current/gridWidth);cells.push(current);
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    if(!dx&&!dy)continue;const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=gridWidth||ny>=gridHeight)continue;
    const next=ny*gridWidth+nx;if(occupied[next]&&!seen[next]){seen[next]=1;stack.push(next);}
   }
  }
  const xs=cells.map(cell=>cell%gridWidth),ys=cells.map(cell=>Math.floor(cell/gridWidth));
  const box={left:Math.min(...xs)*cellWidth,top:Math.min(...ys)*cellHeight,width:(Math.max(...xs)-Math.min(...xs)+1)*cellWidth,height:(Math.max(...ys)-Math.min(...ys)+1)*cellHeight};
  components.push({cells:cells.length,sampleShare:Math.max(...cells.map(cell=>counts[cell]/Math.max(1,totalSamples))),...box});
 }
 const marks=components.filter(mark=>!persistentText.some(text=>{
  const intersection=Math.max(0,Math.min(mark.left+mark.width,text.left+text.width)-Math.max(mark.left,text.left))*Math.max(0,Math.min(mark.top+mark.height,text.top+text.height)-Math.max(mark.top,text.top));
  return intersection/Math.max(1,mark.width*mark.height)>0.2;
 }));
 return {sampleCount:totalSamples,minimumShare,threshold,persistentText,persistentMarks:marks,count:persistentText.length+marks.length,method:'OCR text plus recurring edge-occupancy cells in the top and bottom chrome bands'};
}

export function canonicalizeText(text,expected,minimumSimilarity=0.72){
 const actualWords=normalizeWords(text),expectedWords=normalizeWords(expected);
 const actual=actualWords.join(''),target=expectedWords.join('');
 if(!actual||!target)return text;
 let previous=Array.from({length:target.length+1},(_,index)=>index);
 for(let i=1;i<=actual.length;i++){
  const current=[i];
  for(let j=1;j<=target.length;j++)current[j]=Math.min(current[j-1]+1,previous[j]+1,previous[j-1]+(actual[i-1]===target[j-1]?0:1));
  previous=current;
 }
 const similarity=1-previous[target.length]/Math.max(actual.length,target.length);
 return similarity>=minimumSimilarity?expected:text;
}

export function hookVisibility({builtEdgePixels=0,zeroEdgePixels=0,matchedEdgePixels=0}={}){
 const coverageRatio=builtEdgePixels?Math.min(1,zeroEdgePixels/builtEdgePixels):0;
 const pixelMatchRatio=builtEdgePixels?matchedEdgePixels/builtEdgePixels:0;
 return {builtEdgePixels,zeroEdgePixels,matchedEdgePixels,coverageRatio,pixelMatchRatio,visibilityRatio:Math.min(coverageRatio,pixelMatchRatio)};
}

/** OCR validates the actual frame-zero hook; changed animation pixels remain a diagnostic. */
export function openingHookReadable({coverageRatio=0,ocrAvailable=false,ocrMatchRatio=0}={}){
 return coverageRatio>=MIN_OPENING_HOOK_COVERAGE&&(!ocrAvailable||ocrMatchRatio>=MIN_OPENING_HOOK_OCR_MATCH);
}

export function hookOcrMatch(expected,recognized){
 const expectedWords=[...new Set(normalizeWords(expected).filter(word=>word.length>1))];
 const recognizedWords=new Set(normalizeWords(recognized));
 const matchedWords=expectedWords.filter(word=>recognizedWords.has(word));
 return {expectedWords,matchedWords,matchRatio:expectedWords.length?matchedWords.length/expectedWords.length:0};
}

export function parseFrameRate(value){
 if(typeof value!=='string'||!value.includes('/'))return Number(value)||null;
 const [numerator,denominator]=value.split('/').map(Number);
 return denominator?numerator/denominator:null;
}

export function parseEbur128(text){
 const integrated=[...String(text).matchAll(/\bI:\s*(-?\d+(?:\.\d+)?)\s*LUFS\b/g)].at(-1)?.[1];
 const peaks=[...String(text).matchAll(/\bPeak:\s*(-?\d+(?:\.\d+)?)\s*dBFS\b/g)].map(match=>Number(match[1]));
 const explicitTp=[...String(text).matchAll(/\bTP:\s*(-?\d+(?:\.\d+)?)\s*dBTP\b/g)].at(-1)?.[1];
 return {integratedLufs:integrated===undefined?null:Number(integrated),truePeakDbfs:explicitTp===undefined?(peaks.length?Math.max(...peaks):null):Number(explicitTp)};
}

export function parseSilenceIntervals(text,duration=0){
 const intervals=[];let pendingStart=null;
 for(const line of String(text).split(/\r?\n/)){
  const start=line.match(/silence_start:\s*(-?\d+(?:\.\d+)?)/);
  if(start){pendingStart=Number(start[1]);continue;}
  const end=line.match(/silence_end:\s*(-?\d+(?:\.\d+)?)/);
  if(end&&pendingStart!==null){const to=Number(end[1]);intervals.push({start:pendingStart,end:to,duration:to-pendingStart});pendingStart=null;}
 }
 if(pendingStart!==null&&duration>pendingStart)intervals.push({start:pendingStart,end:duration,duration:duration-pendingStart});
 return intervals;
}

export function parseTesseractTsv(tsv){
 const lines=new Map();
 for(const row of String(tsv).split(/\r?\n/).slice(1)){
  if(!row.trim())continue;
  const columns=row.split('\t');if(columns.length<12||columns[0]!=='5')continue;
  const [,page,block,paragraph,line,_word,left,top,width,height,confidence,...wordParts]=columns;
  const word=wordParts.join('\t').trim();if(!word)continue;
  const key=[page,block,paragraph,line].join(':');
  const item=lines.get(key)??{text:'',left:Number(left),top:Number(top),right:Number(left)+Number(width),bottom:Number(top)+Number(height),confidence:[],confidentWordCount:0,unfilteredWordCount:0};
  const score=Number(confidence),words=normalizeWords(word).length;
  item.text=`${item.text} ${word}`.trim();item.left=Math.min(item.left,Number(left));item.top=Math.min(item.top,Number(top));item.right=Math.max(item.right,Number(left)+Number(width));item.bottom=Math.max(item.bottom,Number(top)+Number(height));item.confidence.push(score);item.unfilteredWordCount+=words;
  if(Number.isFinite(score)&&score>=MIN_OCR_TOKEN_CONFIDENCE)item.confidentWordCount+=words;
  lines.set(key,item);
 }
 return [...lines.values()].map(item=>({text:item.text,left:item.left,top:item.top,width:item.right-item.left,height:item.bottom-item.top,confidence:item.confidence.reduce((a,b)=>a+b,0)/item.confidence.length,confidentWordCount:item.confidentWordCount,unfilteredWordCount:item.unfilteredWordCount}));
}

export function contrastRatio(first,second){
 const luminance=color=>{
  const channels=color.map(value=>{const normalized=value/255;return normalized<=0.04045?normalized/12.92:((normalized+0.055)/1.055)**2.4;});
  return channels[0]*0.2126+channels[1]*0.7152+channels[2]*0.0722;
 };
 const a=luminance(first),b=luminance(second);
 return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
}

export function overlapDuration(interval,ranges){
 return ranges.reduce((sum,range)=>sum+Math.max(0,Math.min(interval.end,range.end)-Math.max(interval.start,range.start)),0);
}
