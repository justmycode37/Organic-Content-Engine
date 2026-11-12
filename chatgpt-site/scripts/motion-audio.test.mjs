import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {SFX,SFX_ALIASES,arrange,capSalientCues,captionsFromSpeech,parseArguments,resolveSfxName,sfxProblems} from './motion-audio.mjs';
import {STYLE_DEFS} from '../src/motion/styles/index.ts';
import {markupWords} from '../src/motion/core.ts';
import {buildMixGraph} from './audio/mix.mjs';
import {mapSpeechTimings,pronounce} from './audio/pronunciation.mjs';

const root=dirname(fileURLToPath(import.meta.url));
const lexicon=JSON.parse(await readFile(join(root,'../audio/pronunciations.json'),'utf8'));

test('arguments take a spec, an output and an optional post id',()=>{
 assert.deepEqual(parseArguments(['spec.json','out.mp4']),{specPath:'spec.json',outPath:'out.mp4'});
 assert.equal(parseArguments(['spec.json','out.mp4','--post','post-42']).postId,'post-42');
 assert.equal(parseArguments(['spec.json','out.mp4','--post=post-7']).postId,'post-7');
 assert.throws(()=>parseArguments(['spec.json','out.mp4','--post']),/requires a post id/);
 assert.throws(()=>parseArguments(['spec.json','out.mp4','--loop','auto']),/Unknown option: --loop/);
 assert.throws(()=>parseArguments(['spec.json']),/Usage/);
});

test('lexicon expansion preserves source caption text and maps expanded timing',()=>{
 const say='Use *GPT-6* with LLM, API, $1.2M at 5.7x on Linux.';
 const pronunciation=pronounce(say,lexicon);
 assert.equal(pronunciation.text,'Use G P T six with L L M, A P I, 1.2 million dollars at 5.7 times on Linn-ucks.');
 const timings=pronunciation.words.map((word,index)=>({text:word.text,start:index*.1,end:(index+1)*.1}));
 const projected=mapSpeechTimings(pronunciation,timings);
 const gpt=projected.find(word=>word.text==='GPT-6');
 assert.equal(gpt.accent,true);
 assert.equal(gpt.start,0.1);
 assert.equal(gpt.end,0.5);
 const captions=captionsFromSpeech(say,projected,0.12,4);
 assert.ok(captions.some(caption=>caption.text.includes('*GPT-6*')));
 assert.ok(captions.some(caption=>caption.text.includes('$1.2M')));
});

test('first scene hit lands on the accented spoken word and later hits remain relative',()=>{
 const spec={version:1,scenes:[
  {type:'title',duration:2,text:'A result',say:'A *clear* result.',hits:[1]},
  {type:'outro',duration:2,cta:'Share this',say:'Share this.',hits:[0.4,1.2]},
 ]};
 const spoken=[
  {audio:'voice-1.mp3',words:[{text:'A',accent:false,start:0,end:.1},{text:'clear',accent:true,start:.5,end:.7},{text:'result.',accent:false,start:.8,end:1}]},
  {audio:'voice-2.mp3',words:[{text:'Share',accent:false,start:0,end:.2},{text:'this.',accent:false,start:.25,end:.5}]},
 ];
 const arranged=arrange(spec,spoken),first=arranged.spec.scenes[0],second=arranged.spec.scenes[1];
 assert.equal(first.hits[0],0.62);
 assert.equal(arranged.hitAlignments[0].word,'clear');
 assert.equal(second.hits[0],Math.round(.4*second.duration/2*100)/100);
 assert.equal(second.hits[1],Math.round(1.2*second.duration/2*100)/100);
});

test('speech captions use 3–7 word chunks and break on clause punctuation without short fragments',()=>{
 const say='OpenAI says its new model changes the route, then the packet arrives.';
 const source=markupWords(say).map((word,index)=>({text:word.text,accent:word.accent,start:index*0.25,end:index*0.25+0.2}));
 const captions=captionsFromSpeech(say,source,0,5);
 const lengths=captions.map(caption=>caption.text.replaceAll('*','').match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)?.length??0);
 assert.ok(lengths.every(length=>length>=3&&length<=7),JSON.stringify({captions,lengths}));
 assert.ok(captions.every(caption=>caption.text!=='OpenAI says its'));
 assert.ok(captions.some(caption=>caption.text.endsWith(',')));
});

test('semantic word events use voice timestamps and produce aligned default SFX',()=>{
 const spec={version:1,scenes:[
  {type:'title',duration:2,text:'Packets move',say:'The packet hits *three* nodes.',caption:'The packet hits three nodes',reward:'mechanism',events:[{word:'three',kind:'contact'},{word:'nodes',kind:'resolve'}]},
  {type:'outro',duration:2,cta:'Follow along',caption:'Follow along to learn',reward:'consequence'},
 ]};
 const spoken=[
  {audio:'voice.mp3',words:[{text:'The',start:0,end:.1},{text:'packet',start:.2,end:.3},{text:'hits',start:.4,end:.5},{text:'three',accent:true,start:.6,end:.7},{text:'nodes.',start:.8,end:1}]},
  {audio:'outro.mp3',words:[{text:'Follow',start:0,end:.2},{text:'along',start:.25,end:.4},{text:'to',start:.45,end:.5},{text:'learn',start:.55,end:.7}]},
 ];
 const arranged=arrange(spec,spoken),events=arranged.spec.scenes[0].events;
 assert.deepEqual(events.map(event=>event.at),[0.72,0.92]);
 assert.ok(events.every(event=>event.word===undefined));
 assert.deepEqual(arranged.eventAlignments.map(event=>[event.kind,event.sfx,event.source,event.kept]),[
  ['contact','hit','voice',true],['resolve','pop','voice',true],
 ]);
 assert.ok(arranged.cues.some(cue=>cue.sfx==='hit'&&cue.source==='event'&&cue.at===0.72));
});

test('salient SFX are capped at six per rolling ten seconds with priority replacement',()=>{
 const cues=Array.from({length:8},(_,index)=>({id:index,sfx:'pop',at:index*0.1,salient:true,priority:index===7?100:10+index}));
 const result=capSalientCues(cues);
 assert.equal(result.cues.length,6);assert.equal(result.dropped.length,2);
 assert.ok(result.cues.some(cue=>cue.id===7));
 for(const cue of result.cues){assert.ok(result.cues.filter(other=>other.at>=cue.at-10&&other.at<=cue.at).length<=6);}
});

test('bigidea does not inject automatic typing or tick beds',()=>{
 const spec={version:1,style:'bigidea',scenes:[
  {type:'terminal',duration:2,title:'A quiet idea',lines:[],say:'The system changes state.'},
  {type:'stat',duration:2,value:1,label:'ONE RESULT',say:'One result follows.'},
 ]};
 const spoken=[
  {audio:'voice-1.mp3',words:[{text:'The',start:0,end:.1},{text:'system',start:.12,end:.35},{text:'changes',start:.4,end:.65},{text:'state.',start:.7,end:.95}]},
  {audio:'voice-2.mp3',words:[{text:'One',start:0,end:.12},{text:'result',start:.16,end:.42},{text:'follows.',start:.5,end:.85}]},
 ];
 const arranged=arrange(spec,spoken);
 assert.deepEqual(arranged.cues.filter(cue=>cue.sfx),[]);
});

test('mix graph ducks effects under the voice and targets Instagram loudness',()=>{
 const graph=buildMixGraph([{file:'voice.mp3',kind:'voice',at:.12,gain:1},{file:'sfx-hit.mp3',sfx:'hit',at:.5,gain:.75,length:.4}],12);
 assert.match(graph.filter,/\[effectsbus\]\[voicebus\]sidechaincompress/);
 assert.match(graph.filter,/volume=0\.75,adelay=500/);
 assert.match(graph.filter,/afade=t=out/);
 assert.match(graph.masterFilter,/loudnorm=I=-14:TP=-2\.5/);
});

test('every shared sound effect is a cleared paid ElevenLabs prompt within the duration range',()=>{
 assert.deepEqual(Object.keys(SFX).sort(),['blocks','flash','glitch','hit','pop','sting','tick','type','whoosh']);
 assert.deepEqual(sfxProblems(SFX),[]);
 for(const item of Object.values(SFX)){
  assert.equal(item.planTier,'creator');assert.equal(item.nonBeta,true);
  assert.equal(item.termsSnapshotRef,'elevenlabs-eu-terms-2026-11-11');
 }
 assert.equal(sfxProblems({short:{...SFX.pop,seconds:0.4}}).length,1);
 assert.equal(sfxProblems({unlicensed:{...SFX.pop,licenceEvidence:''}}).length,1);
});

test('older sound names and style beds resolve to the shared table',()=>{
 for(const target of Object.values(SFX_ALIASES))assert.ok(SFX[target],target);
 assert.equal(resolveSfxName('stamp'),'hit');assert.equal(resolveSfxName('pop'),'pop');assert.equal(resolveSfxName('missing'),undefined);
 for(const [name,style] of Object.entries(STYLE_DEFS))for(const [kind,special] of Object.entries(style.specials??{}))if(special.bed)assert.ok(SFX[special.bed],`${name}.${kind} bed ${special.bed}`);
 const spec={version:1,scenes:[{type:'title',duration:2,text:'Stamped',events:[{at:0.5,kind:'contact',sfx:'stamp'}]},{type:'title',duration:2,text:'Next'}]};
 const arranged=arrange(spec,[null,null]);
 assert.equal(arranged.eventAlignments[0].sfx,'hit');
 assert.ok(arranged.cues.filter(cue=>cue.sfx).every(cue=>cue.gain===SFX[cue.sfx].gain));
});
