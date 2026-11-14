import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {findRepeat,freshSeeds,mergeHistory,historyLines,topicKey} from '../worker/acryllex-history.ts';
import {generateAcryllexReel,ACRYLLEX_TOPIC_SEEDS} from '../worker/acryllex-generation.ts';
import {reelHistory} from '../worker/services/account-automation.ts';
import {readLedger,recordReel} from './acryllex/produce.mjs';

const blue={title:'Why Bright Blue Took Decades',topic:'Why the blue LED was so hard to invent',topicKey:'blue-led-invention'};

test('topic keys drop filler words',()=>{
 assert.equal(topicKey('Why the blue LED was so hard to invent'),'blue-led-hard-invent');
 assert.equal(topicKey('Why do we yawn?'),'yawn');
});

test('repeats are caught by key, topic or title wording',()=>{
 assert.equal(findRepeat({topic:'Anything',topicKey:'blue-led-invention'},[blue]),blue);
 assert.equal(findRepeat({topic:'Why blue LEDs were so hard to invent'},[blue]),blue);
 assert.equal(findRepeat({topic:'Bright blue took decades',title:'Why Bright Blue Took Decades'},[blue]),blue);
 assert.equal(findRepeat({topic:'Why cats purr'},[blue]),null);
 assert.equal(findRepeat({topic:'Why red LEDs came first'},[blue]),null);
});

test('used seed topics are not offered again',()=>{
 const seeds=freshSeeds(ACRYLLEX_TOPIC_SEEDS,[blue,{topic:'Why we yawn'}]);
 assert.ok(!seeds.some(s=>/blue LED|yawn/i.test(s)));
 assert.ok(seeds.includes('Why cats purr'));
});

test('ledgers merge without duplicates and every reel reaches the prompt',()=>{
 const many=Array.from({length:45},(_,i)=>({topic:`Topic number ${i} about thing${i}`}));
 const merged=mergeHistory([blue],[{...blue,title:'other title'}],many);
 assert.equal(merged.length,46);
 const lines=historyLines(merged).split('\n');
 assert.equal(lines.length,46);
 assert.match(lines[0],/\[blue-led-invention\]/);
});

test('server history carries the topic key from provenance',()=>{
 const h=reelHistory({spec:JSON.stringify({title:blue.title,scenes:[{say:'Hi.'}]}),provenance:JSON.stringify({idea:{topic:blue.topic,topicKey:blue.topicKey}})});
 assert.equal(h.topicKey,'blue-led-invention');
 assert.equal(h.topic,blue.topic);
});

test('local ledger records each finished reel once',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'acryllex-ledger-'));const file=join(dir,'h.json');
 try{
  assert.deepEqual(await readLedger(file),[]);
  await recordReel({...blue,workdir:'/a'},file);await recordReel({...blue,workdir:'/a'},file);await recordReel({topic:'Why cats purr',workdir:'/b'},file);
  const l=await readLedger(file);assert.equal(l.length,2);assert.equal(l[0].topic,'Why cats purr');
 }finally{await rm(dir,{recursive:true,force:true});}
});

function fakeSol(answers){
 const steps=[];const real=globalThis.fetch;
 globalThis.fetch=async(_url,init)=>{const body=JSON.parse(init.body);const text=body.input[0].content[0].text;const step=body.text?.format?.name;steps.push({step,text});
  const out=answers(step,steps);return new Response(JSON.stringify({status:'completed',usage:{},output:[{content:[{type:'output_text',text:JSON.stringify(out)}]}]}),{status:200});};
 return {steps,restore:()=>{globalThis.fetch=real;}};
}
const idea=(topic,topicKey)=>({topic,topicKey,question:'q',hook:'h',angle:'a',facts:['1','2','3','4'],heroObjects:['x'],twist:'t',answer:'a'});
const cat={text:'',assets:'',has:()=>true};

test('ideation rejects a repeated subject and retries before any paid step',async()=>{
 let ideations=0;
 const sol=fakeSol(step=>{
  if(step==='acryllex_idea')return ++ideations===1?idea('How blue LEDs were finally invented','blue-led-story'):idea('Why cats purr','cat-purr');
  if(step==='acryllex_novelty')return {repeat:false,of:''};
  return {bad:true};// script stage: stop the test here
 });
 try{
  await assert.rejects(generateAcryllexReel({OPENAI_API_KEY:'k'},'',cat,undefined,[blue]),/Script failed/);
  const names=sol.steps.map(s=>s.step);
  assert.equal(ideations,2);
  assert.match(sol.steps[1].text,/Already rejected as repeats this run \(pick something else\): How blue LEDs/);
  assert.match(sol.steps[0].text,/\[blue-led-invention\]/);
  assert.ok(!/Unused seed ideas:[^\n]*blue LED/.test(sol.steps[0].text));
  assert.deepEqual(names.slice(0,3),['acryllex_idea','acryllex_idea','acryllex_novelty']);
 }finally{sol.restore();}
});

test('Sol novelty check can veto an idea that the word check misses',async()=>{
 let ideations=0;
 const sol=fakeSol(step=>{
  if(step==='acryllex_idea')return ++ideations===1?idea('The crystal that made white lightbulbs possible','gallium-nitride-crystal'):idea('Why cats purr','cat-purr');
  if(step==='acryllex_novelty')return ideations===1?{repeat:true,of:blue.topic}:{repeat:false,of:''};
  return {bad:true};
 });
 try{await assert.rejects(generateAcryllexReel({OPENAI_API_KEY:'k'},'',cat,undefined,[blue]),/Script failed/);assert.equal(ideations,2);}
 finally{sol.restore();}
});

test('a requested topic that repeats an earlier reel stops immediately',async()=>{
 const sol=fakeSol(step=>step==='acryllex_idea'?idea('Why the blue LED was so hard to invent','blue-led-invention'):{bad:true});
 try{
  await assert.rejects(generateAcryllexReel({OPENAI_API_KEY:'k'},'blue LED',cat,undefined,[blue]),/repeats an earlier ACRYLLEX reel/);
  assert.equal(sol.steps.length,1);
 }finally{sol.restore();}
});
