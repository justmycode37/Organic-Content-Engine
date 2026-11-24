import assert from 'node:assert/strict';
import { test } from 'node:test';
import smoke from '../motion-examples/smoke.json' with { type: 'json' };
import { parseReelSpec, lintReel, reelSpecSchema } from '../src/motion/spec.ts';
import { placeScenes, reelDuration, parseMarkup, markupWords } from '../src/motion/core.ts';
import { reelCaptions } from '../src/motion/captions.ts';
import { drawHookAndHeader } from '../src/motion/viral.ts';

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
