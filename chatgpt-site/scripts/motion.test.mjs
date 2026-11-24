import assert from 'node:assert/strict';
import { test } from 'node:test';
import smoke from '../motion-examples/smoke.json' with { type: 'json' };
import { parseReelSpec, lintReel, reelSpecSchema } from '../src/motion/spec.ts';
import { placeScenes, reelDuration, parseMarkup, markupWords } from '../src/motion/core.ts';
import { reelCaptions } from '../src/motion/captions.ts';
import { cardZone, drawHookAndHeader, drawNumberPops, drawViralCaption } from '../src/motion/viral.ts';

test('smoke spec parses; strict schema rejects unknown keys and bad type',()=>{
 assert.equal(parseReelSpec(smoke).ok,true);
 assert.equal(parseReelSpec({...smoke,extra:1}).ok,false);
 assert.equal(parseReelSpec({...smoke,scenes:[{type:'bogus'}]}).ok,false);
 assert.equal(reelSpecSchema.safeParse({...smoke,scenes:[{type:'flow',duration:2,nodes:[]}]}).success,false);
});
test('duration and collection bounds parse',()=>{
 assert.match(parseReelSpec({...smoke,scenes:[{type:'outro',duration:.2,cta:'x'}]}).errors[0],/duration/);
 assert.equal(parseReelSpec({...smoke,scenes:Array(41).fill(smoke.scenes[0])}).ok,false);
});
test('lint catches weak hook, missing outro and captions',()=>{
 const r=lintReel({version:1,scenes:[{type:'code',duration:2,code:'x'}]});
 assert.ok(r.some(x=>x.message.includes('first scene'))); assert.ok(r.some(x=>x.message.includes('captions'))); assert.ok(r.some(x=>x.message.includes('outro')));
});
test('scene placement snaps to frames',()=>{
 const s={version:1,scenes:[{type:'title',duration:1.01,text:'X'},{type:'outro',duration:1.01,cta:'X'}]};
 assert.deepEqual(placeScenes(s).map(x=>[x.start,x.end]),[[0,1],[1,2]]);assert.equal(reelDuration(s),2);
});
test('viral captions never extend a small pause into the next shot',()=>{
 const scenes=[{type:'shot',duration:2,shot:'statement'},{type:'shot',duration:2,shot:'statement'}];
 const captions=[{text:'old balance',start:1.55,end:1.94},{text:'new balance',start:2.12,end:2.6}];
 const spec={version:1,scenes,captions};
 assert.equal(reelCaptions({...spec,look:'viral'})[0].end,2);
 assert.equal(reelCaptions(spec)[0].end,2.12);
});
test('viral titles render bold white text without strokes or decorative shapes',()=>{
 const calls=[];
 const ctx={
  save(){},restore(){},translate(){},scale(){},rotate(){},
  measureText(text){return {width:text.length*40}},
  fillText(text){calls.push({text,fill:this.fillStyle,font:this.font})},
  strokeText(){assert.fail('title outlines are disabled')},
  fillRect(){assert.fail('title plates and rules are disabled')},
 };
 const spec={version:1,look:'viral',hook:'A *surprising* result',payoff:'A *better* choice.',scenes:[{type:'shot',shot:'act',duration:2},{type:'shot',shot:'act',duration:3}]};
 const scenes=placeScenes(spec);
 drawHookAndHeader(ctx,spec,0.3,scenes);
 drawHookAndHeader(ctx,spec,4,scenes);
 assert.match(calls.map(call=>call.text).join(' '),/A SURPRISING RESULT A BETTER CHOICE\./);
 assert.ok(calls.every(call=>call.fill==='#FFFFFF'&&call.font.startsWith('900 ')));
});
test('spoken words and amount overlays use white text',()=>{
 const fills=[];
 const ctx={
  save(){},restore(){},translate(){},scale(){},rotate(){},strokeText(){},
  measureText(text){return {width:text.length*40}},
  fillText(word){fills.push({word,color:this.fillStyle})},
 };
 const spec={version:1,look:'viral',scenes:[{type:'shot',shot:'act',duration:2}]};
 const caption={text:'Save $20',start:0,end:1,wordTimings:[{start:0,end:.25},{start:.25,end:1}]};
 drawViralCaption(ctx,caption,.4);
 drawNumberPops(ctx,spec,.4,placeScenes(spec),[caption],false);
 assert.deepEqual(fills.map(f=>f.word),['Save','$20','$20']);
 assert.ok(fills.every(f=>f.color==='#FFFFFF'));
});
test('a printed comparison term does not get a second title over its cards',()=>{
 const spec={version:1,look:'viral',term:'deductible',scenes:[
  {type:'shot',shot:'versus',duration:3,params:{rightLabel:'Deductible'}},
  {type:'shot',shot:'act',duration:3},
 ]};
 const captions=[{text:'the deductible',start:2.3,end:2.9,wordTimings:[{start:2.3,end:2.5},{start:2.5,end:2.9}]}];
 const ctx={measureText(text){return {width:text.length*40}}};
 const scenes=placeScenes(spec);
 assert.equal(cardZone(ctx,spec,2.7,scenes,captions),undefined);
 assert.equal(cardZone(ctx,spec,3.1,scenes,captions),undefined);
 assert.ok(cardZone(ctx,spec,2.7,placeScenes({...spec,scenes:[{type:'shot',shot:'act',duration:6}]}),captions));
});
test('an amount printed on a flip tag does not also float as a number pop',()=>{
 const spec={version:1,look:'viral',scenes:[{type:'shot',shot:'present',duration:2,params:{backTag:'FIRST $200'}}]};
 const caption={text:'$200',start:.3,end:1,wordTimings:[{start:.3,end:1}]};
 drawNumberPops({fillText(){assert.fail('duplicate amount')}},spec,.4,placeScenes(spec),[caption],false);
});
test('markup parsing exposes accent flags',()=>{
 assert.deepEqual(parseMarkup('hello *world*'),[{text:'hello ',accent:false},{text:'world',accent:true}]);
 assert.deepEqual(markupWords('hello *big world*').map(x=>x.accent),[false,true,true]);
});
test('shot catalog matches the registered shot library',async()=>{
 const {SHOT_CATALOG}=await import('../src/motion/shots/catalog.ts');
 const src=(await import('node:fs')).readFileSync(new URL('../src/motion/shots/index.ts',import.meta.url),'utf8');
 for(const entry of SHOT_CATALOG){assert.match(src,new RegExp(`\\b${entry.name}Shot\\b`,'i'),`${entry.name} registered`);assert.ok(entry.describe.length>20);}
});
test('worker transition mirror equals core transitions',async()=>{
 const {SHOT_TRANSITIONS}=await import('../src/motion/shots/catalog.ts');const {TRANSITIONS}=await import('../src/motion/core.ts');
 assert.deepEqual([...SHOT_TRANSITIONS],[...TRANSITIONS]);
});
