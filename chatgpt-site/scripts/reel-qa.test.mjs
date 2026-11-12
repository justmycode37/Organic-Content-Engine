import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
 EVENT_VISUAL_CHANGE_THRESHOLD,MIN_CAPTION_HEIGHT_PX,MIN_ESSENTIAL_TEXT_HEIGHT_PX,MIN_OCR_TOKEN_CONFIDENCE,MIN_SECONDARY_TEXT_HEIGHT_PX,MIN_TEXT_CONTRAST,SAFE_RECT,SAFE_ZONES,canonicalizeText,captionEntries,contactFrames,eventAuditFrames,findEllipses,hookFrameTimes,hookOcrMatch,hookVisibility,openingHookReadable,
 overlapDuration,parseArgs,parseEbur128,parseFrameRate,parseSilenceIntervals,parseTesseractTsv,persistentChrome,sampleFrames,sceneEventTime,contrastRatio,
} from './qa/analysis.mjs';

test('Reels UI masks and text thresholds are explicit',()=>{
 assert.deepEqual(SAFE_RECT,{x:96,y:240,width:888,height:1260});
 assert.deepEqual(SAFE_ZONES.map(zone=>[zone.id,zone.x,zone.y,zone.width,zone.height]),[
  ['top-header',0,0,1080,220],['right-actions',930,1000,150,700],['bottom-caption-cta',0,1540,1080,380],
 ]);
 assert.equal(MIN_CAPTION_HEIGHT_PX,28);assert.equal(MIN_TEXT_CONTRAST,4.5);
});

test('frame sampler covers three points per scene, the frame-zero pair and caption midpoints',()=>{
 const spec={scenes:[{type:'title',duration:2,caption:'Open hook'},{type:'stat',duration:3,caption:['First line','Second line']}]};
 const frames=sampleFrames(spec);
 assert.deepEqual(hookFrameTimes(spec),{zero:0,built:1.2});
 assert.equal(frames.filter(frame=>frame.purpose==='scene-sample').length,6);
 assert.equal(frames.filter(frame=>frame.purpose==='caption-sample').length,3);
 assert.equal(frames.find(frame=>frame.purpose==='frame-zero').time,0);
 assert.equal(frames.find(frame=>frame.purpose==='hook-built').time,1.2);
 assert.deepEqual(captionEntries(spec).map(entry=>entry.text),['Open hook','First line','Second line']);
});

test('transition sampling brackets non-cut moves and includes them in contact sheets',()=>{
 const spec={scenes:[{type:'title',duration:2,text:'A'},{type:'outro',duration:2,cta:'B',transition:'push'}]};
 const frames=sampleFrames(spec),transition=frames.filter(frame=>frame.purpose==='transition-sample');
 assert.deepEqual(transition.map(frame=>Number(frame.time.toFixed(2))),[1.93,1.97,2,2.03,2.07]);
 assert.deepEqual(transition.map(frame=>frame.sceneIndex),[0,0,1,1,1]);
 assert.equal(contactFrames(frames).some(frame=>frame.purpose==='frame-zero'),true);
 assert.equal(contactFrames(frames).filter(frame=>frame.purpose==='transition-sample').length,5);
});

test('event audit samples bracket declared and silent word anchors',()=>{
 const spec={scenes:[{type:'title',duration:2,say:'A *clear* result now.',events:[{word:'clear',kind:'reveal'},{at:1.4,kind:'resolve'}]}]};
 assert.equal(sceneEventTime(spec.scenes[0],spec.scenes[0].events[0]),0.5);
 assert.deepEqual(eventAuditFrames(spec).map(item=>[item.beforeAt,item.declaredAt,item.afterAt].map(value=>Number(value.toFixed(2)))),[[0.38,0.5,0.78],[1.28,1.4,1.68]]);
 assert.equal(EVENT_VISUAL_CHANGE_THRESHOLD,0.001);
});

test('OCR size thresholds and persistent chrome heuristic use the documented 80% share',()=>{
 assert.equal(MIN_ESSENTIAL_TEXT_HEIGHT_PX,64);assert.equal(MIN_SECONDARY_TEXT_HEIGHT_PX,48);
 const textSamples=Array.from({length:5},(_,index)=>({frameKey:`f${index}`,lines:index<4?[{text:'PATCH NOTES',left:100,top:50,width:150,height:48}]:[]}));
 const markSamples=Array.from({length:5},(_,index)=>({frameKey:`f${index}`,cells:index<4?Array.from({length:36*64},(_,cell)=>cell===2*36+2):[]}));
 const chrome=persistentChrome({textSamples,markSamples});
 assert.equal(chrome.sampleCount,5);assert.equal(chrome.persistentText.length,1);assert.equal(chrome.persistentMarks.length,1);assert.equal(chrome.count,2);
 assert.equal(chrome.minimumShare,0.8);
});

test('frame-zero visibility is limited by both ink coverage and pixel match',()=>{
 assert.deepEqual(hookVisibility({builtEdgePixels:100,zeroEdgePixels:90,matchedEdgePixels:82}),{
  builtEdgePixels:100,zeroEdgePixels:90,matchedEdgePixels:82,coverageRatio:0.9,pixelMatchRatio:0.82,visibilityRatio:0.82,
 });
 assert.equal(hookVisibility({builtEdgePixels:0}).visibilityRatio,0);
});

test('frame-zero readability requires opening ink and OCR confirmation when available',()=>{
 assert.equal(openingHookReadable({coverageRatio:0.64}),false);
 assert.equal(openingHookReadable({coverageRatio:0.65}),true);
 assert.equal(openingHookReadable({coverageRatio:0.9,ocrAvailable:true,ocrMatchRatio:0.49}),false);
 assert.equal(openingHookReadable({coverageRatio:0.9,ocrAvailable:true,ocrMatchRatio:0.5}),true);
});

test('hook OCR compares normalized expected words',()=>{
 assert.deepEqual(hookOcrMatch('948 WAYS TO *ROOT* LINUX','948 ways to root Linux'),{
  expectedWords:['948','ways','to','root','linux'],matchedWords:['948','ways','to','root','linux'],matchRatio:1,
 });
 assert.equal(hookOcrMatch('A hook for Linux','Linux kernel').matchRatio,1/3);
});

test('short OCR variants can be grouped against a known series label',()=>{
 assert.equal(canonicalizeText('FATCH WOTES','PATCH NOTES'),'PATCH NOTES');
 assert.equal(canonicalizeText('A DIFFERENT LABEL','PATCH NOTES'),'A DIFFERENT LABEL');
});

test('video metadata parsers handle frame rates, loudness, and silence intervals',()=>{
 assert.equal(parseFrameRate('30/1'),30);assert.equal(parseFrameRate('0/0'),null);
 assert.deepEqual(parseEbur128('I: -18.1 LUFS\nPeak: -1.4 dBFS\nPeak: -0.8 dBFS'),{integratedLufs:-18.1,truePeakDbfs:-0.8});
 assert.deepEqual(parseSilenceIntervals('[silencedetect] silence_start: 1.25\n[silencedetect] silence_end: 2.10 | silence_duration: 0.85\n[silencedetect] silence_start: 8.0',10),[
  {start:1.25,end:2.1,duration:0.8500000000000001},{start:8,end:10,duration:2},
 ]);
});

test('Tesseract TSV groups word boxes into rendered text lines',()=>{
 const rows='level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n5\t1\t2\t3\t4\t1\t100\t200\t60\t30\t95.0\t948\n5\t1\t2\t3\t4\t2\t170\t201\t80\t29\t90.0\tROOT';
 assert.deepEqual(parseTesseractTsv(rows),[{text:'948 ROOT',left:100,top:200,width:150,height:30,confidence:92.5,confidentWordCount:2,unfilteredWordCount:2}]);
});

test('word gate ignores low-confidence OCR tokens while retaining raw line text',()=>{
 assert.equal(MIN_OCR_TOKEN_CONFIDENCE,40);
 const rows='level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n5\t1\t2\t3\t4\t1\t100\t200\t20\t30\t95.0\t948\n5\t1\t2\t3\t4\t2\t125\t200\t20\t30\t39.0\tI\n5\t1\t2\t3\t4\t3\t150\t200\t20\t30\t40.0\t16';
 const [line]=parseTesseractTsv(rows);
 assert.equal(line.text,'948 I 16');
 assert.equal(line.unfilteredWordCount,3);
 assert.equal(line.confidentWordCount,2);
});

test('contrast ratio uses WCAG relative luminance',()=>{
 assert.equal(contrastRatio([255,255,255],[0,0,0]),21);
 assert.ok(Math.abs(contrastRatio([255,255,255],[119,119,119])-4.478)<0.002);
});

test('CLI accepts cover, time and output directory and rejects invalid flags',()=>{
 assert.deepEqual(parseArgs(['reel.json','reel.mp4','--cover-time','1.25','--out-dir','./qa']),{
  cover:true,coverTime:1.25,outDir:'./qa',positionals:['reel.json','reel.mp4'],
 });
 assert.deepEqual(parseArgs(['--help']),{cover:false,coverTime:null,outDir:null,positionals:[],help:true});
 assert.throws(()=>parseArgs(['reel.json','--cover-time','-1']),/non-negative/);
 assert.throws(()=>parseArgs(['reel.json','--not-supported']),/Unknown option/);
});

test('narration silence is measured only inside marked scene ranges',()=>{
 assert.equal(overlapDuration({start:2,end:4},[{start:0,end:3},{start:3.5,end:5}]),1.5);
});

test('ellipsis detection reports source locations without treating ordinary punctuation as truncation',()=>{
 assert.deepEqual(findEllipses({scenes:[{caption:'A claim…',say:'A sentence...'}],title:'Ordinary.'}),[
  {path:'$.scenes[0].caption',text:'A claim…'},{path:'$.scenes[0].say',text:'A sentence...'},
 ]);
});
