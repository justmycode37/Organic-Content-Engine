#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import {mkdtemp,readFile,rm,stat,writeFile,mkdir,open} from 'node:fs/promises';
import {basename,dirname,extname,join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {openMotionPage,loadRequirements} from './motion.mjs';
import {
 EVENT_VISUAL_CHANGE_THRESHOLD,FRAME_HEIGHT,FRAME_WIDTH,MIN_CAPTION_HEIGHT_PX,MIN_ESSENTIAL_TEXT_HEIGHT_PX,MIN_OCR_TOKEN_CONFIDENCE,MIN_OPENING_HOOK_COVERAGE,MIN_OPENING_HOOK_OCR_MATCH,MIN_RENDERED_TEXT_HEIGHT_PX,MIN_SECONDARY_TEXT_HEIGHT_PX,MIN_TEXT_CONTRAST,SAFE_RECT,SAFE_ZONES,
 canonicalizeText,captionEntries,expectedHookText,findEllipses,hookFrameTimes,hookOcrMatch,hookVisibility,normalizeWords,openingHookReadable,
 eventAuditFrames,overlapDuration,parseArgs,parseEbur128,parseFrameRate,parseSilenceIntervals,parseTesseractTsv,persistentChrome,reelDuration,sampleFrames,
} from './qa/analysis.mjs';

const SCRIPT=fileURLToPath(import.meta.url);

function command(commandName,args){
 const result=spawnSync(commandName,args,{encoding:'utf8',maxBuffer:16*1024*1024});
 return {status:result.status,stdout:result.stdout??'',stderr:result.stderr??'',error:result.error};
}

function frameLabel(frame){
 if(frame.purpose==='frame-zero')return 'Frame 0';
 if(frame.purpose==='hook-built')return 'Hook at 60%';
 return `S${(frame.sceneIndex??0)+1} · ${frame.time.toFixed(2)}s`;
}

async function renderFrames(page,spec,frames,eventSamples){
 return page.evaluate(async({spec,frames,eventSamples,eventChangeThreshold,zones,safeRect,frameWidth,frameHeight})=>{
  const drawImage=async(base64)=>{
   const image=new Image();image.src=`data:image/png;base64,${base64}`;await image.decode();
   const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
   const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0);
   return {image,pixels:context.getImageData(0,0,canvas.width,canvas.height)};
  };
  const brightness=(data,index)=>data[index]*0.2126+data[index+1]*0.7152+data[index+2]*0.0722;
  const edgeMap=(pixels)=>{
   const {width,height}=pixels,luminance=new Float32Array(width*height),data=pixels.data;
   for(let i=0,j=0;i<luminance.length;i++,j+=4)luminance[i]=brightness(data,j);
   const mask=new Uint8Array(width*height);
   for(let y=1;y<height-1;y++){
    let index=y*width+1;
    for(let x=1;x<width-1;x++,index++){
     const center=luminance[index];
     if(Math.max(Math.abs(center-luminance[index-1]),Math.abs(center-luminance[index+1]),Math.abs(center-luminance[index-width]),Math.abs(center-luminance[index+width]))>=27)mask[index]=1;
    }
   }
   return {luminance,mask};
  };
  const sampled=[];
  for(const frame of frames){
   const png=window.motion.shot(spec,frame.time);
   const decoded=await drawImage(png);const {luminance,mask}=edgeMap(decoded.pixels);
   const zoneStats=zones.map(zone=>{
    let edgePixels=0;
    const x0=Math.max(0,zone.x),y0=Math.max(0,zone.y),x1=Math.min(decoded.pixels.width,zone.x+zone.width),y1=Math.min(decoded.pixels.height,zone.y+zone.height);
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)edgePixels+=mask[y*decoded.pixels.width+x];
    const area=Math.max(1,(x1-x0)*(y1-y0));
    return {id:zone.id,edgePixels,area,coverage:edgePixels/area,threshold:Math.max(100,Math.round(area*0.0012))};
   });
   const gridWidth=36,gridHeight=64,cellWidth=30,cellHeight=30,markCells=new Array(gridWidth*gridHeight).fill(false);
   if(frame.purpose==='scene-sample'||frame.purpose==='frame-zero'||frame.purpose==='hook-built'){
    for(let gy=0;gy<gridHeight;gy++){
     if(gy>=8&&gy<51)continue;
     for(let gx=0;gx<gridWidth;gx++){
      let edges=0;
      for(let y=gy*cellHeight;y<Math.min((gy+1)*cellHeight,decoded.pixels.height);y++)for(let x=gx*cellWidth;x<Math.min((gx+1)*cellWidth,decoded.pixels.width);x++)edges+=mask[y*decoded.pixels.width+x];
      if(edges>=4&&edges<cellWidth*cellHeight*0.18)markCells[gy*gridWidth+gx]=true;
     }
    }
   }
   const captionRows=[];
   for(let y=1260;y<Math.min(1900,decoded.pixels.height);y++){
    let count=0;for(let x=80;x<1000;x++)count+=mask[y*decoded.pixels.width+x];captionRows.push(count);
   }
   const bands=[];let start=-1,last=-1,maxInk=0;
   for(let i=0;i<captionRows.length;i++){
    if(captionRows[i]>=4){if(start<0)start=i;last=i;maxInk=Math.max(maxInk,captionRows[i]);}
    else if(start>=0&&i-last>2){if(last-start+1>=3)bands.push({top:1260+start,bottom:1260+last+1,height:last-start+1,maxEdgePixels:maxInk});start=-1;maxInk=0;}
   }
   if(start>=0&&last-start+1>=3)bands.push({top:1260+start,bottom:1260+last+1,height:last-start+1,maxEdgePixels:maxInk});
   sampled.push({...frame,png,pixels:decoded.pixels,zoneStats,captionBands:bands,markCells});
  }
  const eventAudit=[];
  for(const item of eventSamples){
   const before=await drawImage(window.motion.shot(spec,item.beforeAt));
   const after=await drawImage(window.motion.shot(spec,item.afterAt));
   const first=before.pixels.data,second=after.pixels.data;let changed=0;
   for(let index=0;index<first.length;index+=4){
    if(Math.max(Math.abs(first[index]-second[index]),Math.abs(first[index+1]-second[index+1]),Math.abs(first[index+2]-second[index+2]))>=32)changed++;
   }
   const changedPixelRatio=changed/Math.max(1,before.pixels.width*before.pixels.height);
   eventAudit.push({...item,changedPixelRatio,detected:changedPixelRatio>=eventChangeThreshold});
  }
  const hook=frames.find(frame=>frame.purpose==='frame-zero');
  const built=frames.find(frame=>frame.purpose==='hook-built');
  let hookStats={builtEdgePixels:0,zeroEdgePixels:0,matchedEdgePixels:0};
  if(hook&&built){
   const zeroPixels=await drawImage(sampled.find(frame=>frame.purpose==='frame-zero').png);
   const builtPixels=await drawImage(sampled.find(frame=>frame.purpose==='hook-built').png);
   const zeroMap=edgeMap(zeroPixels.pixels),builtMap=edgeMap(builtPixels.pixels);
   const x0=safeRect.x,y0=safeRect.y,x1=safeRect.x+safeRect.width,y1=Math.min(safeRect.y+safeRect.height,1240);
   let builtEdgePixels=0,zeroEdgePixels=0,matchedEdgePixels=0;
   for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
     const index=y*zeroPixels.pixels.width+x;
    if(zeroMap.mask[index])zeroEdgePixels++;
    if(builtMap.mask[index]){
     builtEdgePixels++;
     if(zeroMap.mask[index]&&Math.abs(zeroMap.luminance[index]-builtMap.luminance[index])<38)matchedEdgePixels++;
    }
   }
   hookStats={builtEdgePixels,zeroEdgePixels,matchedEdgePixels};
  }
  const contact=sampled.filter(frame=>frame.purpose==='scene-sample'||frame.purpose==='transition-sample'||frame.purpose==='frame-zero'||frame.purpose==='hook-built');
  const scale=0.18,tileWidth=Math.round(frameWidth*scale),tileHeight=Math.round(frameHeight*scale),columns=5,gap=10,labelHeight=30,rows=Math.ceil(contact.length/columns);
  const sheet=document.createElement('canvas');sheet.width=gap+columns*(tileWidth+gap);sheet.height=gap+rows*(tileHeight+labelHeight+gap);
  const sheetContext=sheet.getContext('2d');sheetContext.fillStyle='#202124';sheetContext.fillRect(0,0,sheet.width,sheet.height);
  for(let i=0;i<contact.length;i++){
   const item=contact[i],image=await drawImage(item.png),x=gap+(i%columns)*(tileWidth+gap),y=gap+Math.floor(i/columns)*(tileHeight+labelHeight+gap);
   sheetContext.drawImage(image.image,x,y,tileWidth,tileHeight);
   sheetContext.save();sheetContext.scale(scale,scale);
   for(const zone of zones){
    sheetContext.fillStyle=zone.color+'45';sheetContext.fillRect(x/scale+zone.x,y/scale+zone.y,zone.width,zone.height);
    sheetContext.strokeStyle=zone.color;sheetContext.lineWidth=5;sheetContext.strokeRect(x/scale+zone.x,y/scale+zone.y,zone.width,zone.height);
   }
   sheetContext.strokeStyle='#30d158';sheetContext.lineWidth=5;sheetContext.setLineDash([20,12]);sheetContext.strokeRect(x/scale+safeRect.x,y/scale+safeRect.y,safeRect.width,safeRect.height);
   sheetContext.restore();
   const label=item.purpose==='scene-sample'?`Scene ${(item.sceneIndex??0)+1} · ${item.time.toFixed(2)}s`:item.purpose==='transition-sample'?`${item.transitionName} ${Math.round(item.fraction*100)}% · ${item.time.toFixed(2)}s`:item.purpose==='frame-zero'?'Frame 0':'Hook at 60%';
   sheetContext.fillStyle='#ffffff';sheetContext.font='bold 15px sans-serif';sheetContext.fillText(label,x,y+tileHeight+20);
  }
  return {frames:sampled.map(({png,pixels,...frame})=>({...frame,png})),hookStats,eventAudit,chromeMarkGrid:{gridWidth:36,gridHeight:64,cellWidth:30,cellHeight:30},contactSheet:sheet.toDataURL('image/png').split(',')[1]};
 },{spec,frames,eventSamples,eventChangeThreshold:EVENT_VISUAL_CHANGE_THRESHOLD,zones:SAFE_ZONES,safeRect:SAFE_RECT,frameWidth:FRAME_WIDTH,frameHeight:FRAME_HEIGHT});
}

function detectTesseract(){return command('tesseract',['--version']).status===0;}

async function runOcr(frames){
 if(!detectTesseract())return {available:false,frames:{},message:'tesseract was not found on PATH; OCR confirmation was skipped.'};
 const directory=await mkdtemp(join(tmpdir(),'reel-qa-ocr-'));
 try{
  const results={};
  for(let index=0;index<frames.length;index++){
   const frame=frames[index],path=join(directory,`frame-${String(index).padStart(3,'0')}.png`);
   await writeFile(path,Buffer.from(frame.png,'base64'));
   const output=command('tesseract',[path,'stdout','--psm','6','tsv']);
   if(output.status!==0){results[frameKey(frame)]={error:output.stderr.trim()||'tesseract failed'};continue;}
   const lines=parseTesseractTsv(output.stdout);
   const text=lines.map(line=>line.text).join(' ');
   const wordCount=lines.reduce((sum,line)=>sum+line.confidentWordCount,0);
   const unfilteredWordCount=lines.reduce((sum,line)=>sum+line.unfilteredWordCount,0);
   results[frameKey(frame)]={text,lines,wordCount,unfilteredWordCount,excludedLowConfidenceWords:unfilteredWordCount-wordCount};
  }
  return {available:true,frames:results,message:null};
 }finally{await rm(directory,{recursive:true,force:true});}
}

function frameKey(frame){return `${frame.time.toFixed(3)}:${frame.purpose}`;}

async function contrastMeasurements(page,items){
 if(!items.length)return [];
 return page.evaluate(async(items)=>{
  const output=[];
  const luminance=(r,g,b)=>{
   const channel=value=>{value/=255;return value<=0.04045?value/12.92:((value+0.055)/1.055)**2.4;};
   return 0.2126*channel(r)+0.7152*channel(g)+0.0722*channel(b);
  };
  for(const item of items){
   const image=new Image();image.src=`data:image/png;base64,${item.png}`;await image.decode();
   const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
   const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0);
   const data=context.getImageData(0,0,canvas.width,canvas.height).data;
   const box=item.box,x0=Math.max(0,Math.floor(box.left)),y0=Math.max(0,Math.floor(box.top)),x1=Math.min(canvas.width,Math.ceil(box.left+box.width)),y1=Math.min(canvas.height,Math.ceil(box.top+box.height));
   const border=[];
   for(let y=Math.max(0,y0-7);y<Math.min(canvas.height,y1+7);y++)for(let x=Math.max(0,x0-7);x<Math.min(canvas.width,x1+7);x++){
    if(x>=x0&&x<x1&&y>=y0&&y<y1)continue;
    const i=(y*canvas.width+x)*4;border.push(luminance(data[i],data[i+1],data[i+2]));
   }
   border.sort((a,b)=>a-b);const background=border[Math.floor(border.length/2)]??0;
   const interior=[];
   for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const i=(y*canvas.width+x)*4;interior.push(luminance(data[i],data[i+1],data[i+2]));}
   const direction=interior.reduce((sum,value)=>sum+value,0)/Math.max(1,interior.length)>=background?1:-1;
   const contrasting=interior.filter(value=>direction*(value-background)>0.04).sort((a,b)=>a-b);
   const foreground=contrasting.length?contrasting[Math.floor(contrasting.length*0.5)]:background;
   const ratio=(Math.max(foreground,background)+0.05)/(Math.min(foreground,background)+0.05);
   output.push({...item,backgroundLuminance:background,foregroundLuminance:foreground,contrastRatio:ratio});
  }
  return output;
 },items);
}

function overlappingZone(textBox,zone){
 const left=Math.max(textBox.left,zone.x),top=Math.max(textBox.top,zone.y),right=Math.min(textBox.left+textBox.width,zone.x+zone.width),bottom=Math.min(textBox.top+textBox.height,zone.y+zone.height);
 const area=Math.max(0,right-left)*Math.max(0,bottom-top),textArea=Math.max(1,textBox.width*textBox.height);
 return area/textArea;
}

function captionAtTime(spec,time){
 const entry=captionEntries(spec).find(item=>time>=item.start&&time<item.end);
 return entry?.text??null;
}

function wordMatchRatio(expected,actual){
 const expectedWords=[...new Set(normalizeWords(expected).filter(word=>word.length>2))];
 if(!expectedWords.length)return 0;
 const actualWords=new Set(normalizeWords(actual));
 return expectedWords.filter(word=>actualWords.has(word)).length/expectedWords.length;
}

async function isFaststart(path){
 const file=await open(path,'r');
 try{
  const size=(await file.stat()).size;let position=0,moov=null,mdat=null;
  while(position+8<=size){
   const header=Buffer.alloc(16);const {bytesRead}=await file.read(header,0,16,position);if(bytesRead<8)break;
   let boxSize=header.readUInt32BE(0),headerSize=8;const type=header.toString('ascii',4,8);
   if(boxSize===1){if(bytesRead<16)break;const bigSize=header.readBigUInt64BE(8);if(bigSize>BigInt(Number.MAX_SAFE_INTEGER))break;boxSize=Number(bigSize);headerSize=16;}
   else if(boxSize===0)boxSize=size-position;
   if(boxSize<headerSize)break;
   if(type==='moov')moov=position;
   if(type==='mdat')mdat=position;
   if(moov!==null&&mdat!==null)break;
   position+=boxSize;
  }
  return {faststart:moov!==null&&mdat!==null&&moov<mdat,moovPosition:moov,mdatPosition:mdat};
 }finally{await file.close();}
}

function addCheck(checks,id,status,severity,message,details={}){checks.push({id,status,severity,message,...details});}

async function inspectVideo(videoPath,spec,checks){
 if(!videoPath){addCheck(checks,'video-analysis','skipped','advisory','No MP4 was supplied; video and audio checks were skipped.');return null;}
 const probe=command('ffprobe',['-v','error','-show_streams','-show_format','-of','json',videoPath]);
 if(probe.status!==0){addCheck(checks,'ffprobe','fail','hard','ffprobe could not read the supplied video.',{error:probe.stderr.trim()});return {available:false};}
 let metadata;
 try{metadata=JSON.parse(probe.stdout);}catch(error){addCheck(checks,'ffprobe','fail','hard','ffprobe returned invalid JSON.',{error:String(error)});return {available:false};}
 const video=metadata.streams?.find(stream=>stream.codec_type==='video');
 const audio=metadata.streams?.find(stream=>stream.codec_type==='audio');
 const duration=Number(metadata.format?.duration??video?.duration??0);
 const expectedDuration=reelDuration(spec);
 const fps=parseFrameRate(video?.avg_frame_rate)||parseFrameRate(video?.r_frame_rate);
 const actual={path:resolve(videoPath),width:video?.width??null,height:video?.height??null,fps,videoCodec:video?.codec_name??null,audioCodec:audio?.codec_name??null,durationSeconds:duration,audioDurationSeconds:Number(audio?.duration??duration)};
 if(actual.width!==FRAME_WIDTH||actual.height!==FRAME_HEIGHT)addCheck(checks,'video-geometry','fail','hard',`Video geometry is ${actual.width}×${actual.height}; expected 1080×1920.`,{actual:`${actual.width}x${actual.height}`,expected:'1080x1920'});
 else addCheck(checks,'video-geometry','pass','hard','Video geometry is 1080×1920.');
 if(fps===null||Math.abs(fps-30)>0.05)addCheck(checks,'video-fps','fail','hard',`Video frame rate is ${fps??'unknown'} fps; expected 30 fps.`,{actualFps:fps,expectedFps:30});
 else addCheck(checks,'video-fps','pass','hard','Video frame rate is 30 fps.',{actualFps:fps});
 if(actual.videoCodec!=='h264')addCheck(checks,'video-codec','fail','hard',`Video codec is ${actual.videoCodec??'missing'}; expected H.264.`,{actual:actual.videoCodec,expected:'h264'});
 else addCheck(checks,'video-codec','pass','hard','Video codec is H.264.');
 if(!audio||actual.audioCodec!=='aac')addCheck(checks,'audio-codec','fail','hard',`Audio codec is ${actual.audioCodec??'missing'}; expected AAC.`,{actual:actual.audioCodec,expected:'aac'});
 else addCheck(checks,'audio-codec','pass','hard','Audio codec is AAC.');
 const durationDifference=duration-expectedDuration;
 if(Math.abs(durationDifference)>0.5)addCheck(checks,'video-duration','fail','hard',`Video duration differs from the ReelSpec by ${durationDifference.toFixed(2)} seconds.`,{actualSeconds:duration,expectedSeconds:expectedDuration,differenceSeconds:durationDifference,toleranceSeconds:0.5});
 else addCheck(checks,'video-duration','pass','hard','Video duration is within 0.5 seconds of the ReelSpec.',{actualSeconds:duration,expectedSeconds:expectedDuration,differenceSeconds:durationDifference});
 if(audio&&Math.abs(actual.audioDurationSeconds-duration)>0.25)addCheck(checks,'audio-tail','fail','hard','Audio does not cover the full video duration; narration may be cut off.',{audioSeconds:actual.audioDurationSeconds,videoSeconds:duration});
 else if(audio)addCheck(checks,'audio-tail','pass','hard','Audio stream covers the video duration.');
 const faststart=await isFaststart(videoPath);actual.faststart=faststart.faststart;actual.mp4Atoms=faststart;
 if(!faststart.faststart)addCheck(checks,'faststart','fail','hard','MP4 does not place the moov atom before mdat (faststart).',faststart);
 else addCheck(checks,'faststart','pass','hard','MP4 is faststart optimized.',faststart);
 if(!audio){addCheck(checks,'audio-analysis','skipped','advisory','Audio analysis requires an audio stream.');return actual;}
 const loudness=command('ffmpeg',['-hide_banner','-nostats','-i',videoPath,'-filter_complex','ebur128=peak=true','-f','null','-']);
 if(loudness.status!==0)addCheck(checks,'audio-loudness','fail','hard','FFmpeg ebur128 analysis failed.',{error:loudness.stderr.trim().slice(-1500)});
 else{
  const levels=parseEbur128(loudness.stderr);actual.integratedLufs=levels.integratedLufs;actual.truePeakDbfs=levels.truePeakDbfs;
  if(levels.integratedLufs===null)addCheck(checks,'audio-loudness','warn','advisory','Integrated loudness could not be read from ebur128 output.',{raw:loudness.stderr.slice(-1500)});
  else if(levels.integratedLufs<-16||levels.integratedLufs>-14)addCheck(checks,'audio-loudness','warn','advisory',`Integrated loudness is ${levels.integratedLufs.toFixed(1)} LUFS; the target range is about −16 to −14 LUFS.`,{integratedLufs:levels.integratedLufs,targetRangeLufs:[-16,-14]});
  else addCheck(checks,'audio-loudness','pass','advisory',`Integrated loudness is ${levels.integratedLufs.toFixed(1)} LUFS.`,{integratedLufs:levels.integratedLufs});
  if(levels.truePeakDbfs===null)addCheck(checks,'audio-true-peak','warn','advisory','True peak could not be read from ebur128 output.');
  else if(levels.truePeakDbfs>0)addCheck(checks,'audio-true-peak','fail','hard',`True peak reaches ${levels.truePeakDbfs.toFixed(1)} dBFS and clips.`,{truePeakDbfs:levels.truePeakDbfs});
  else if(levels.truePeakDbfs>-1)addCheck(checks,'audio-true-peak','warn','advisory',`True peak is ${levels.truePeakDbfs.toFixed(1)} dBFS; keep at or below −1 dBTP where practical.`,{truePeakDbfs:levels.truePeakDbfs,targetMaximumDbfs:-1});
  else addCheck(checks,'audio-true-peak','pass','advisory',`True peak is ${levels.truePeakDbfs.toFixed(1)} dBFS.`,{truePeakDbfs:levels.truePeakDbfs});
 }
 const silence=command('ffmpeg',['-hide_banner','-nostats','-i',videoPath,'-af','silencedetect=noise=-45dB:d=0.7','-f','null','-']);
 if(silence.status!==0)addCheck(checks,'narration-silence','fail','hard','FFmpeg silence detection failed.',{error:silence.stderr.trim().slice(-1500)});
 else{
  const intervals=parseSilenceIntervals(silence.stderr,duration).filter(interval=>interval.duration>=0.7);
  let cursor=0;const narratedScenes=[];
  for(const scene of spec.scenes){if(scene.say?.trim())narratedScenes.push({start:cursor,end:cursor+scene.duration});cursor+=scene.duration;}
  const narrationRanges=narratedScenes.length===spec.scenes.length?[{start:0,end:duration}]:narratedScenes.map(range=>({start:range.start*duration/expectedDuration,end:range.end*duration/expectedDuration}));
  const overlapping=intervals.map(interval=>({...interval,narrationOverlapSeconds:overlapDuration(interval,narrationRanges)})).filter(interval=>interval.narrationOverlapSeconds>0);
  actual.silenceIntervals=intervals;actual.narrationSilenceIntervals=overlapping;
  if(overlapping.length)addCheck(checks,'narration-silence','fail','hard',`${overlapping.length} silence gap(s) of at least 0.7 seconds overlap narrated scenes.`,{intervals:overlapping,thresholdSeconds:0.7,noiseFloorDb:-45,narrationAlignment:narratedScenes.length===spec.scenes.length?'all scenes narrated; full output checked':'scene ranges scaled to match encoded duration'});
  else if(narrationRanges.length)addCheck(checks,'narration-silence','pass','hard','No silence gap of at least 0.7 seconds overlaps a scene with narration.',{thresholdSeconds:0.7,noiseFloorDb:-45,narrationAlignment:narratedScenes.length===spec.scenes.length?'all scenes narrated; full output checked':'scene ranges scaled to match encoded duration'});
  else addCheck(checks,'narration-silence','skipped','advisory','The ReelSpec has no narration text to define expected speech intervals.');
 }
 return actual;
}

function markdownReport(report){
 const failures=report.checks.filter(check=>check.status==='fail');
 const warnings=report.checks.filter(check=>check.status==='warn');
 const lines=[`# Reel QA: ${report.input.specTitle||basename(report.input.spec)}`,'',`**Decision:** ${report.summary.decision.toUpperCase()} · ${failures.length} hard failure(s) · ${warnings.length} advisory warning(s)`,``,`**Style:** ${report.input.style} · **Spec duration:** ${report.input.specDurationSeconds.toFixed(2)} s`,''];
 if(report.input.video)lines.push(`**Video:** ${report.input.video}`,'');
 lines.push('## Hard failures','','No hard failures were recorded.');
 if(failures.length){lines.splice(lines.indexOf('No hard failures were recorded.'),1,...failures.map(check=>`- **${check.id}:** ${check.message}`));}
 lines.push('','## Advisory warnings','');
 if(warnings.length)lines.push(...warnings.map(check=>`- **${check.id}:** ${check.message}`));else lines.push('No advisory warnings were recorded.');
 lines.push('','## Frame zero','',`Built hook: “${report.frameZero.expectedHook||'(no conventional hook field found)'}”`,`Visible content at frame zero: ${(report.frameZero.visibilityRatio*100).toFixed(1)}% (ink coverage ${(report.frameZero.coverageRatio*100).toFixed(1)}%, pixel match ${(report.frameZero.pixelMatchRatio*100).toFixed(1)}%).`,report.frameZero.ocr.status==='checked'?`OCR: ${report.frameZero.ocr.matchedWordsAtFrameZero.length}/${report.frameZero.ocr.expectedWords.length} expected words found at frame zero; ${report.frameZero.ocr.builtFrameMatchRatio*100}% match at 60%.`:`OCR: ${report.frameZero.ocr.message}`,'','## Rendered text load and chrome','',`OCR word counts: ${report.renderedWords.available?`${report.renderedWords.perFrame.length} sampled frames, maximum ${report.renderedWords.maximumWordCount} words`:'unavailable'}; target ≤14 words, hard cap 18. Persistent chrome estimate: ${report.chrome.count} item(s) across ≥${Math.round(report.chrome.minimumShare*100)}% of scene samples.`,'','## Event audit','',`${report.eventAudit.declaredCount} declared event(s), ${report.eventAudit.detectedCount} with a sampled visual change. Event samples compare frames 120 ms before and 280 ms after the anchor; the pixel-difference detector is heuristic.`,'','## Safe zones','',`${report.safeZones.violations.length} sampled safe-zone intrusion(s) reported. See the JSON for per-scene pixel coverage and OCR-confirmed text.`,'','## Legibility','',`${report.legibility.textRegions.length} OCR text line(s) measured; ${report.legibility.captionLines.length} caption line detections across sampled frames. Caption minimum: ${MIN_CAPTION_HEIGHT_PX}px; essential/secondary OCR box checks: ${MIN_ESSENTIAL_TEXT_HEIGHT_PX}px / ${MIN_SECONDARY_TEXT_HEIGHT_PX}px; existing small-text floor: ${MIN_RENDERED_TEXT_HEIGHT_PX}px; contrast reference: ${MIN_TEXT_CONTRAST}:1. Pixel and OCR measurements are heuristic.`);
 const transitionSamples=report.renderedWords.perFrame.filter(frame=>frame.purpose==='transition-sample').length;
 const pushTransitionSamples=report.renderedWords.perFrame.filter(frame=>frame.purpose==='transition-sample'&&frame.transitionName==='push').length;
 lines.push('',`The 14-word target and 18-word hard cap count Tesseract word tokens with confidence ≥${report.renderedWords.confidenceThreshold}/100. Lower-confidence text remains available to OCR text and safe-zone checks. ${transitionSamples} transition frames appear in the contact sheet; ${pushTransitionSamples} tracked push frames are included in word-count and safe-zone text checks. Contrast measurements use steady scene and caption samples, since transition frames capture partial entrance or exit opacity. Other transition overlays are contact-sheet evidence only.`);
 if(report.video){
  lines.push('','## Video and audio','',report.video.integratedLufs===undefined?'Audio loudness was not available.':`Integrated loudness: ${report.video.integratedLufs===null?'unknown':`${report.video.integratedLufs.toFixed(1)} LUFS`}; true peak: ${report.video.truePeakDbfs===null?'unknown':`${report.video.truePeakDbfs.toFixed(1)} dBFS`}.`,`Geometry: ${report.video.width??'unknown'}×${report.video.height??'unknown'} at ${report.video.fps??'unknown'} fps; codecs ${report.video.videoCodec??'unknown'}/${report.video.audioCodec??'unknown'}; faststart ${report.video.faststart?'yes':'no'}.`);
 }
 lines.push('','## Files','','- `'+basename(report.outputs.json)+'`','- `'+basename(report.outputs.markdown)+'`','- `'+basename(report.outputs.contactSheet)+'`');
 if(report.outputs.cover)lines.push('- `'+basename(report.outputs.cover)+'`','- `'+basename(report.outputs.gridPreview)+'`');
 lines.push('');return lines.join('\n');
}

async function writeCover(page,spec,time,outDir){
 const images=await page.evaluate(async({spec,time,zones})=>{
  const data=window.motion.shot(spec,time),image=new Image();image.src=`data:image/png;base64,${data}`;await image.decode();
  const cover=document.createElement('canvas');cover.width=1080;cover.height=1920;cover.getContext('2d').drawImage(image,0,0);
  const grid=document.createElement('canvas');grid.width=1080;grid.height=1350;const context=grid.getContext('2d');
  context.drawImage(image,0,285,1080,1350,0,0,1080,1350);
  for(const zone of zones){
   const top=Math.max(0,zone.y-285),bottom=Math.min(1350,zone.y+zone.height-285);if(bottom<=top)continue;
   context.fillStyle=zone.color+'38';context.fillRect(zone.x,top,zone.width,bottom-top);
   context.strokeStyle=zone.color;context.lineWidth=5;context.strokeRect(zone.x+2,top+2,zone.width-4,bottom-top-4);
  }
  const top=Math.max(0,240-285),bottom=Math.min(1350,1500-285);context.strokeStyle='#30d158';context.lineWidth=5;context.setLineDash([20,12]);context.strokeRect(96,top,888,bottom-top);
  return {cover:cover.toDataURL('image/png').split(',')[1],grid:grid.toDataURL('image/png').split(',')[1]};
 },{spec,time,zones:SAFE_ZONES});
 const cover=join(outDir,'cover.png'),gridPreview=join(outDir,'grid-preview.png');
 await writeFile(cover,Buffer.from(images.cover,'base64'));await writeFile(gridPreview,Buffer.from(images.grid,'base64'));
 return {cover,gridPreview,timeSeconds:time,geometry:{width:FRAME_WIDTH,height:FRAME_HEIGHT},gridGeometry:{width:1080,height:1350},gridCrop:{top:285,bottom:285,mode:'center crop'}};
}

async function main(){
 let options;
 try{options=parseArgs(process.argv.slice(2));}catch(error){console.error(error.message);process.exitCode=2;return;}
 if(options.help){console.log('Usage: node scripts/reel-qa.mjs <spec.json> [video.mp4] [--cover] [--cover-time SECONDS] [--out-dir DIR]');return;}
 const [specArg,videoArg]=options.positionals,specPath=resolve(specArg),videoPath=videoArg?resolve(videoArg):null;
 let spec;
 try{spec=JSON.parse(await readFile(specPath,'utf8'));}catch(error){console.error(`Could not read ReelSpec ${specPath}: ${error.message}`);process.exitCode=2;return;}
 if(!Array.isArray(spec.scenes)||spec.scenes.length===0){console.error('ReelSpec must contain at least one scene.');process.exitCode=2;return;}
 const duration=reelDuration(spec),hookTimes=hookFrameTimes(spec),coverTime=options.coverTime??hookTimes.built;
 if(coverTime>duration){console.error(`Cover time ${coverTime}s is beyond the ReelSpec duration ${duration}s.`);process.exitCode=2;return;}
 const outputDir=resolve(options.outDir??dirname(videoPath??specPath));await mkdir(outputDir,{recursive:true});
 const base=basename(videoPath??specPath,extname(videoPath??specPath));
 const outputs={json:join(outputDir,`${base}.qa.json`),markdown:join(outputDir,`${base}.qa.md`),contactSheet:join(outputDir,`${base}.contact.png`)};
 const checks=[],firstScene=spec.scenes[0],expectedHook=expectedHookText(firstScene);
 let browser=null,rendered=null,ocr={available:false,frames:{},message:'OCR was not run.'},video=null,cover=null;
 try{
  const opened=await openMotionPage();browser=opened.browser;
  await loadRequirements(opened.page,spec,specPath);
  const frames=sampleFrames(spec);rendered=await renderFrames(opened.page,spec,frames,eventAuditFrames(spec));
  await writeFile(outputs.contactSheet,Buffer.from(rendered.contactSheet,'base64'));
  const ocrTargets=rendered.frames;
  ocr=await runOcr(ocrTargets);
  const countsForWordGate=frame=>frame.purpose!=='transition-sample'||frame.transitionName==='push';
  const perFrameWordCounts=ocrTargets.map(frame=>({frameKey:frameKey(frame),timeSeconds:frame.time,purpose:frame.purpose,sceneIndex:frame.sceneIndex,countedForWordGate:countsForWordGate(frame),wordCount:ocr.frames[frameKey(frame)]?.wordCount??null,unfilteredWordCount:ocr.frames[frameKey(frame)]?.unfilteredWordCount??null,excludedLowConfidenceWords:ocr.frames[frameKey(frame)]?.excludedLowConfidenceWords??null}));
  const wordGateFrames=perFrameWordCounts.filter(item=>item.countedForWordGate);
  const availableWordCounts=wordGateFrames.map(item=>item.wordCount).filter(value=>value!==null);
  const unfilteredWordCounts=wordGateFrames.map(item=>item.unfilteredWordCount).filter(value=>value!==null);
  const renderedWords={available:ocr.available,method:ocr.available?`Tesseract word-level tokens with confidence >= ${MIN_OCR_TOKEN_CONFIDENCE}/100`:'unavailable',confidenceThreshold:MIN_OCR_TOKEN_CONFIDENCE,perFrame:perFrameWordCounts,maximumWordCount:availableWordCounts.length?Math.max(...availableWordCounts):null,unfilteredMaximumWordCount:unfilteredWordCounts.length?Math.max(...unfilteredWordCounts):null,softTargetWords:14,hardMaximumWords:18,wordGateSampleCount:wordGateFrames.length};
  if(!ocr.available)addCheck(checks,'rendered-word-count','skipped','advisory','Rendered word counts require Tesseract OCR.',{message:ocr.message});
  else{
   const overHard=wordGateFrames.filter(item=>item.wordCount>18),overTarget=wordGateFrames.filter(item=>item.wordCount>14);
   if(overHard.length)addCheck(checks,'rendered-word-count','fail','hard',`${overHard.length} sampled frame(s) exceed the rendered 18-word hard cap.`,{maximumWords:18,frames:overHard});
   else if(overTarget.length)addCheck(checks,'rendered-word-count','warn','advisory',`${overTarget.length} sampled frame(s) exceed the 14-word target.`,{targetWords:14,frames:overTarget});
   else addCheck(checks,'rendered-word-count','pass','hard','All word-gate frames are at or below 14 confident OCR words.',{targetWords:14,hardMaximumWords:18,sampledFrames:wordGateFrames.length});
  }
  const chromeSamples=rendered.frames.filter(frame=>frame.purpose==='scene-sample');
  const chrome=persistentChrome({
   textSamples:chromeSamples.map(frame=>({frameKey:frameKey(frame),lines:ocr.frames[frameKey(frame)]?.lines??[]})),
   markSamples:chromeSamples.map(frame=>({frameKey:frameKey(frame),cells:frame.markCells??[]})),
   ...rendered.chromeMarkGrid,
  });
  if(chrome.count>1)addCheck(checks,'persistent-chrome','warn','advisory',`${chrome.count} text/mark item(s) appear in at least ${Math.round(chrome.minimumShare*100)}% of sampled scenes; target 0–1.`,chrome);
  else addCheck(checks,'persistent-chrome','pass','advisory',`${chrome.count} persistent chrome item(s) detected (target 0–1).`,chrome);
  const eventAudit={declaredCount:rendered.eventAudit.length,detectedCount:rendered.eventAudit.filter(item=>item.detected).length,threshold:EVENT_VISUAL_CHANGE_THRESHOLD,method:'pixel RGB change ratio between samples at -120ms and +280ms around each event',events:rendered.eventAudit};
  if(!eventAudit.declaredCount)addCheck(checks,'event-audit','skipped','advisory','No declared events were available for the sampled visual-change audit.',eventAudit);
  else if(eventAudit.detectedCount<eventAudit.declaredCount)addCheck(checks,'event-audit','warn','advisory',`${eventAudit.declaredCount-eventAudit.detectedCount} declared event(s) had no detected visual change in the sample window.`,eventAudit);
  else addCheck(checks,'event-audit','pass','advisory','Every declared event had a detected visual change in the sample window.',eventAudit);
  const zero=rendered.frames.find(frame=>frame.purpose==='frame-zero'),built=rendered.frames.find(frame=>frame.purpose==='hook-built');
  const pixelMetrics=hookVisibility(rendered.hookStats);
  const zeroOcr=ocr.frames[frameKey(zero)],builtOcr=ocr.frames[frameKey(built)];
  let zeroOcrMatch={expectedWords:[],matchedWords:[],matchRatio:0},builtOcrMatch={expectedWords:[],matchedWords:[],matchRatio:0};
  if(ocr.available&&expectedHook&&builtOcr?.text)builtOcrMatch=hookOcrMatch(expectedHook,builtOcr.text);
  if(ocr.available&&expectedHook&&zeroOcr?.text)zeroOcrMatch=hookOcrMatch(expectedHook,zeroOcr.text);
  const ocrStatus=!ocr.available?'skipped':!expectedHook?'unavailable':!builtOcr?.text?'unavailable':'checked';
  const hookReadable=openingHookReadable({coverageRatio:pixelMetrics.coverageRatio,ocrAvailable:ocrStatus==='checked',ocrMatchRatio:zeroOcrMatch.matchRatio});
  const frameZero={expectedHook,atSeconds:0,builtAtSeconds:hookTimes.built,...pixelMetrics,visibilityRatio:pixelMetrics.coverageRatio,ocr:{status:ocrStatus,message:ocrStatus==='skipped'?ocr.message:ocrStatus==='unavailable'?'The hook text could not be reliably read in the fully built frame.':null,frameZeroText:zeroOcr?.text??null,builtText:builtOcr?.text??null,expectedWords:zeroOcrMatch.expectedWords.length?zeroOcrMatch.expectedWords:builtOcrMatch.expectedWords,matchedWordsAtFrameZero:zeroOcrMatch.matchedWords,frameZeroMatchRatio:zeroOcrMatch.matchRatio,builtFrameMatchedWords:builtOcrMatch.matchedWords,builtFrameMatchRatio:builtOcrMatch.matchRatio},readable:hookReadable,thresholds:{minimumCoverageRatio:MIN_OPENING_HOOK_COVERAGE,minimumOcrMatchRatio:MIN_OPENING_HOOK_OCR_MATCH,pixelMatchIsDiagnostic:true}};
  if(!hookReadable)addCheck(checks,'frame-zero-hook','fail','hard',`The opening hook is not readable at frame 0 (${(pixelMetrics.visibilityRatio*100).toFixed(1)}% pixel visibility${ocrStatus==='checked'?`, ${(zeroOcrMatch.matchRatio*100).toFixed(1)}% first-frame OCR match`:''}).`,frameZero);
  else addCheck(checks,'frame-zero-hook','pass','hard','The opening hook is readable at frame 0.',frameZero);
  if(ocrStatus==='skipped')addCheck(checks,'ocr','skipped','advisory',ocr.message);
  else if(ocrStatus==='unavailable')addCheck(checks,'ocr','warn','advisory','Tesseract ran but could not confirm enough text in the fully built hook frame.');
  else if(zeroOcrMatch.matchRatio<0.5)addCheck(checks,'hook-ocr','fail','hard',`OCR matched only ${zeroOcrMatch.matchedWords.length}/${zeroOcrMatch.expectedWords.length} expected hook words at frame 0.`,frameZero.ocr);
  else if(!hookReadable)addCheck(checks,'hook-ocr','fail','hard','OCR did not confirm that the hook is readable at frame 0.',frameZero.ocr);
  else addCheck(checks,'hook-ocr','pass','hard','OCR confirms the hook text in the first frame.',frameZero.ocr);

  const captionLines=[],safeZoneViolations=[];
  const measurementByKey=new Map(rendered.frames.map(frame=>[frameKey(frame),frame]));
  for(const frame of rendered.frames){
   if(frame.purpose!=='scene-sample'&&frame.purpose!=='frame-zero'&&frame.purpose!=='hook-built')continue;
   for(const zone of frame.zoneStats){
    if(zone.edgePixels>=zone.threshold)safeZoneViolations.push({sceneIndex:frame.sceneIndex,timeSeconds:frame.time,zoneId:zone.id,edgePixels:zone.edgePixels,coverage:zone.coverage,source:'pixel-edge-heuristic',severity:'warning'});
   }
  }
  const textRegions=[];
  const ellipsesInSource=findEllipses(spec),ellipsesInRender=[],edgeClippingCandidates=[];
  if(ocr.available){
   const contrastItems=[];
  for(const frame of ocrTargets){
    if(frame.purpose==='transition-sample'&&frame.transitionName!=='push')continue;
    const result=ocr.frames[frameKey(frame)];if(!result?.lines)continue;
    const activeCaption=captionAtTime(spec,frame.time);
    const lowerLines=result.lines.filter(line=>line.top>=1260&&line.top<1800);
    const captionIsReadable=Boolean(activeCaption&&wordMatchRatio(activeCaption,lowerLines.map(line=>line.text).join(' '))>=0.45);
    const mainTextHeight=Math.max(0,...result.lines.filter(line=>!(captionIsReadable&&lowerLines.includes(line))).map(line=>line.height));
    for(const line of result.lines){
     const isCaption=captionIsReadable&&lowerLines.includes(line);
     const textRole=isCaption?'secondary':line.height>=Math.max(1,mainTextHeight*0.8)?'essential':'secondary';
     const minimumHeightPx=textRole==='essential'?MIN_ESSENTIAL_TEXT_HEIGHT_PX:MIN_SECONDARY_TEXT_HEIGHT_PX;
     const entry={frameKey:frameKey(frame),timeSeconds:frame.time,sceneIndex:frame.sceneIndex,text:line.text,captionText:isCaption?activeCaption:null,left:line.left,top:line.top,width:line.width,heightPx:line.height,confidence:line.confidence,kind:isCaption?'caption':'rendered-text',textRole,minimumHeightPx};
     textRegions.push(entry);
     // Transition samples intentionally capture partially entering or fading content; their local contrast is not a stable legibility measurement.
     if(frame.purpose!=='transition-sample')contrastItems.push({png:frame.png,box:line,entryIndex:textRegions.length-1});
     if(/…|\.{3,}/u.test(line.text))ellipsesInRender.push({frameKey:frameKey(frame),timeSeconds:frame.time,sceneIndex:frame.sceneIndex,text:line.text});
     if(line.left<=2||line.top<=2||line.left+line.width>=FRAME_WIDTH-2||line.top+line.heightPx>=FRAME_HEIGHT-2)edgeClippingCandidates.push({frameKey:frameKey(frame),timeSeconds:frame.time,sceneIndex:frame.sceneIndex,text:line.text,left:line.left,top:line.top,width:line.width,heightPx:line.heightPx});
     for(const zone of SAFE_ZONES)if(overlappingZone(line,zone)>=0.15){
      const lineArea=Math.max(1,line.width*line.height);
      const knownTopChrome=zone.id==='top-header'&&chrome.persistentMarks.some(mark=>{
       const width=Math.max(0,Math.min(line.left+line.width,mark.left+mark.width)-Math.max(line.left,mark.left));
       const height=Math.max(0,Math.min(line.top+line.height,mark.top+mark.height)-Math.max(line.top,mark.top));
       return width*height/lineArea>=0.5;
      });
      if(knownTopChrome)continue;
      const text=zone.id==='top-header'&&spec.series?canonicalizeText(line.text,spec.series):line.text;
      safeZoneViolations.push({sceneIndex:frame.sceneIndex,timeSeconds:frame.time,zoneId:zone.id,text,recognizedText:line.text,source:'tesseract-ocr',severity:'hard'});
     }
     if(isCaption)captionLines.push(entry);
    }
   }
   const contrasts=await contrastMeasurements(opened.page,contrastItems);
   for(const item of contrasts){const region=textRegions[item.entryIndex];region.contrastRatio=item.contrastRatio;}
  }else{
   for(const frame of rendered.frames.filter(item=>item.purpose==='caption-sample')){
    const bands=frame.captionBands.filter(band=>band.height>0);
    if(bands.length){const shortest=Math.min(...bands.map(band=>band.height));captionLines.push({timeSeconds:frame.time,sceneIndex:frame.sceneIndex,text:frame.caption,heightPx:shortest,confidence:null,kind:'pixel-row-estimate'});}
   }
  }
  const shortCaptions=captionLines.filter(line=>line.heightPx<MIN_CAPTION_HEIGHT_PX);
  for(const caption of shortCaptions)addCheck(checks,'caption-text-height','fail','hard',`Caption line is only ${caption.heightPx}px tall: “${caption.captionText??caption.text??'(text not recognized)'}”.`,caption);
  if(!shortCaptions.length)addCheck(checks,'caption-text-height','pass','hard','No sampled caption line was below the 28px minimum.',{minimumHeightPx:MIN_CAPTION_HEIGHT_PX,sampledCaptionLines:captionLines.length,method:ocr.available?'Tesseract word-line boxes':'pixel-row estimate'});
  const shortTextRegions=textRegions.filter(region=>region.heightPx<MIN_RENDERED_TEXT_HEIGHT_PX);
  if(shortTextRegions.length)addCheck(checks,'rendered-text-height','warn','advisory',`${shortTextRegions.length} sampled OCR text region(s) are below ${MIN_RENDERED_TEXT_HEIGHT_PX}px.`,{minimumHeightPx:MIN_RENDERED_TEXT_HEIGHT_PX,regions:shortTextRegions});
  else addCheck(checks,'rendered-text-height','pass','advisory',`No sampled OCR text region was below ${MIN_RENDERED_TEXT_HEIGHT_PX}px.`,{minimumHeightPx:MIN_RENDERED_TEXT_HEIGHT_PX});
  const belowRoleMinimum=textRegions.filter(region=>region.heightPx<region.minimumHeightPx);
  if(!ocr.available)addCheck(checks,'text-size-contract','skipped','advisory','Essential and secondary text size estimates require Tesseract OCR.');
  else if(belowRoleMinimum.length)addCheck(checks,'text-size-contract','warn','advisory',`${belowRoleMinimum.length} sampled text region(s) fall below their heuristic 64px essential or 48px secondary minimum.`,{essentialMinimumPx:MIN_ESSENTIAL_TEXT_HEIGHT_PX,secondaryMinimumPx:MIN_SECONDARY_TEXT_HEIGHT_PX,regions:belowRoleMinimum});
  else addCheck(checks,'text-size-contract','pass','advisory','All sampled OCR text regions meet their heuristic essential/secondary minimum.',{essentialMinimumPx:MIN_ESSENTIAL_TEXT_HEIGHT_PX,secondaryMinimumPx:MIN_SECONDARY_TEXT_HEIGHT_PX});
  const lowContrast=textRegions.filter(region=>typeof region.contrastRatio==='number'&&region.contrastRatio<MIN_TEXT_CONTRAST);
  const lowContrastGroups=new Map();
  for(const region of lowContrast){
   const text=region.top<220&&spec.series?canonicalizeText(region.text,spec.series):region.text;
   const key=`${region.kind}|${text}|${region.contrastRatio.toFixed(2)}`;
   const group=lowContrastGroups.get(key)??{...region,text,samples:[],recognizedVariants:[]};
   group.samples.push({timeSeconds:region.timeSeconds,sceneIndex:region.sceneIndex});if(!group.recognizedVariants.includes(region.text))group.recognizedVariants.push(region.text);lowContrastGroups.set(key,group);
  }
  for(const region of lowContrastGroups.values()){
   const status=region.contrastRatio<3?'fail':'warn';
   addCheck(checks,'text-contrast',status,status==='fail'?'hard':'advisory',`Rendered text contrast is ${region.contrastRatio.toFixed(2)}:1 for “${region.text}” in ${region.samples.length} sample(s).`,region);
  }
  if(!lowContrast.length)addCheck(checks,'text-contrast','pass','advisory','No OCR-measured text line fell below 4.5:1 contrast.',{minimumContrast:MIN_TEXT_CONTRAST,method:ocr.available?'Tesseract boxes with local pixel contrast':'skipped'});
  const truncation={specEllipses:ellipsesInSource,renderedEllipses:ellipsesInRender,edgeClippingCandidates};
  if(ellipsesInSource.length||ellipsesInRender.length)addCheck(checks,'text-ellipsis','warn','advisory',`${ellipsesInSource.length+ellipsesInRender.length} source/rendered ellipsis occurrence(s) were found; check whether each is intentional.`,truncation);
  if(edgeClippingCandidates.length)addCheck(checks,'text-clipping','warn','advisory',`${edgeClippingCandidates.length} OCR text region(s) touch the frame edge and may be clipped.`,{candidates:edgeClippingCandidates});
  if(!ellipsesInSource.length&&!ellipsesInRender.length&&!edgeClippingCandidates.length)addCheck(checks,'text-truncation','pass','advisory','No ellipsis markers or OCR text boxes touching the frame edge were detected.',truncation);
  const seenZones=new Set();
  const uniqueViolations=safeZoneViolations.filter(item=>{const key=[item.sceneIndex,item.timeSeconds.toFixed(2),item.zoneId,item.text??''].join('|');if(seenZones.has(key))return false;seenZones.add(key);return true;});
  const hardZoneViolations=uniqueViolations.filter(item=>item.severity==='hard');
  const pixelZoneViolations=uniqueViolations.filter(item=>item.severity==='warning');
  const groupedTextIntrusions=new Map();
  for(const item of hardZoneViolations){
   const key=`${item.zoneId}|${item.text}`;const group=groupedTextIntrusions.get(key)??{zoneId:item.zoneId,text:item.text,samples:[],recognizedVariants:[]};
   group.samples.push({sceneIndex:item.sceneIndex,timeSeconds:item.timeSeconds});if(item.recognizedText&&!group.recognizedVariants.includes(item.recognizedText))group.recognizedVariants.push(item.recognizedText);groupedTextIntrusions.set(key,group);
  }
  for(const item of groupedTextIntrusions.values())addCheck(checks,'safe-zone-text','fail','hard',`OCR-confirmed text intrudes into ${item.zoneId}: “${item.text}” in ${item.samples.length} sample(s).`,item);
  if(pixelZoneViolations.length)addCheck(checks,'safe-zone-content','warn','advisory',`${pixelZoneViolations.length} sampled frame/zone combination(s) contain visual content in a UI mask.`,{violations:pixelZoneViolations});
  else addCheck(checks,'safe-zone-content','pass','advisory','No sampled frame exceeded the pixel-content threshold inside the Instagram UI masks.');
  const safeZones={source:'Approximate full-screen Reels UI masks; verify on the target device and account.',zones:SAFE_ZONES.map(({color,...zone})=>zone),safeRect:SAFE_RECT,sampleCount:rendered.frames.filter(frame=>frame.purpose==='scene-sample').length,violations:uniqueViolations};
  const legibility={minimumCaptionHeightPx:MIN_CAPTION_HEIGHT_PX,minimumRenderedTextHeightPx:MIN_RENDERED_TEXT_HEIGHT_PX,minimumEssentialTextHeightPx:MIN_ESSENTIAL_TEXT_HEIGHT_PX,minimumSecondaryTextHeightPx:MIN_SECONDARY_TEXT_HEIGHT_PX,minimumContrastRatio:MIN_TEXT_CONTRAST,textRegions,captionLines,shortCaptionLines:shortCaptions,shortTextRegions,belowRoleMinimum,method:ocr.available?'Tesseract OCR boxes and rendered pixel sampling':'pixel-row estimates for caption height; OCR unavailable'};
  video=await inspectVideo(videoPath,spec,checks);
  if(options.cover){cover=await writeCover(opened.page,spec,coverTime,outputDir);outputs.cover=cover.cover;outputs.gridPreview=cover.gridPreview;}
  const hardFailures=checks.filter(check=>check.status==='fail'&&check.severity==='hard').length;
  const warnings=checks.filter(check=>check.status==='warn').length;
  const report={schemaVersion:1,createdAt:new Date().toISOString(),input:{spec:specPath,video:videoPath,specTitle:spec.title??null,style:spec.style??'patch',specDurationSeconds:duration},summary:{decision:hardFailures?'fail':'pass',hardFailureCount:hardFailures,warningCount:warnings,checkCount:checks.length},checks,frameZero,renderedWords,chrome,eventAudit,safeZones,legibility,truncation,video,cover,outputs};
  await writeFile(outputs.json,JSON.stringify(report,null,2)+'\n');
  await writeFile(outputs.markdown,markdownReport(report));
  console.log(`Reel QA ${report.summary.decision.toUpperCase()}: ${hardFailures} hard failure(s), ${warnings} warning(s)`);
  console.log(`JSON: ${outputs.json}`);console.log(`Summary: ${outputs.markdown}`);console.log(`Contact sheet: ${outputs.contactSheet}`);
  if(cover)console.log(`Cover: ${cover.cover}\nGrid preview: ${cover.gridPreview}`);
  if(hardFailures)process.exitCode=1;
 }catch(error){
  console.error(`Reel QA failed: ${error.stack??error}`);process.exitCode=1;
 }finally{if(browser)await browser.close();}
}

if(process.argv[1]&&resolve(process.argv[1])===SCRIPT)await main();
