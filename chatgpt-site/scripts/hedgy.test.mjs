import test from 'node:test';
import assert from 'node:assert/strict';
import {generateHedgyReel} from '../worker/hedgy-generation.ts';
import {hedgyPostCaptionSchema} from '../worker/hedgy-caption.ts';
const postCaption='The cheapest choice can still cost you more.\n\nHedgy buys just enough lemons for his stand, but a busy afternoon leaves him with customers he cannot serve. Keeping extra stock ties up money and risks waste. Keeping too little means missing sales when demand surprises him. The tradeoff is between the cost of holding a buffer and the cost of running out.\n\nA buffer does not have to cover every possible rush. It needs to reflect how unpredictable demand is and how quickly you can restock. That is the useful question behind the story: what would running out actually cost?\n\n#InventoryRisk #RiskManagement #FinanceExplained';
test('missing API key blocks without subscription fallback',async()=>{await assert.rejects(generateHedgyReel({},'diversification'),e=>e.code==='api_key_missing')});
const idea=input=>({concept:/Choose concept from exactly these ids: ([a-z-]+)/.exec(input)[1],angle:'Hedgy runs a lemonade stand.',setting:'a lemonade stand',heroItem:'lemonade',supportingItems:[],cast:['hedgy'],hook:'Ever run out of lemons?',music:'drive',musicBrief:'Darksynth chase at 136 BPM: distorted bass, hard drums, guitar stabs, building to a hit on the reveal.'});
test('Sol xhigh coordinates twelve Sol xhigh specialists and validates reel',async()=>{
 const original=globalThis.fetch;const calls=[];let active=0,peak=0;
 const spec={version:1,title:'Risk',postCaption,series:'HEDGY / FINANCE',mode:'dark',accent:'mono',music:'drive',scenes:Array.from({length:6},()=>({type:'hedgy',duration:4,beat:'lesson',action:'upside',headline:'Risk remains',say:'Diversification does not remove all risk.'}))};
 globalThis.fetch=async(_url,init)=>{const body=JSON.parse(init.body);calls.push(body);active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,1));active--;const format=body.text?.format?.name;return Response.json({status:'completed',output:[{content:[{type:'output_text',text:format==='hedgy_reel'?JSON.stringify(spec):format==='hedgy_idea'?JSON.stringify(idea(body.input)):'production brief'}]}]})};
 try{const r=await generateHedgyReel({OPENAI_API_KEY:'test'},'diversification');assert.equal(r.provenance.specialists,12);assert.equal(calls.length,15);assert.equal(r.spec.musicBrief,r.provenance.idea.musicBrief);assert.equal(r.spec.postCaption,postCaption);assert.equal(parseReelSpec(r.spec).ok,true,'post copy survives the strict render schema');assert.equal(calls.filter(x=>x.model==='gpt-6.1-sol').length,15);assert.ok(peak<=4);assert.ok(calls.every(x=>x.store===false&&x.reasoning.effort==='xhigh'));}finally{globalThis.fetch=original}
});
test('post captions require useful paragraphs and a small set of distinct hashtags',()=>{
 assert.equal(hedgyPostCaptionSchema.safeParse(postCaption).success,true);
 for(const invalid of [undefined,'Risk remains. #Finance #Money #Learning',postCaption.replace(/\n\n/g,' '),postCaption.replace(/#[A-Za-z]+/g,''),postCaption.replace('#InventoryRisk','#FinanceExplained'),postCaption+' #Money #Learning #Investing','x'.repeat(2201)]){
  assert.equal(hedgyPostCaptionSchema.safeParse(invalid).success,false);
 }
});
test('assembly repairs a one-line post caption without changing narration',async()=>{
 const original=globalThis.fetch;let assemblies=0;
 const spec={version:1,title:'Lemons',postCaption,series:'HEDGY / FINANCE',mode:'dark',accent:'mono',music:'drive',scenes:Array.from({length:6},()=>({type:'hedgy',duration:4,beat:'lesson',action:'upside',headline:'Keep a buffer',say:'A buffer costs money but running out can cost sales.'}))};
 globalThis.fetch=async(_url,init)=>{const body=JSON.parse(init.body),format=body.text?.format?.name;let text='production brief';if(format==='hedgy_idea')text=JSON.stringify(idea(body.input));if(format==='hedgy_reel'){assemblies++;assert.match(body.input,/postCaption/);text=JSON.stringify({...spec,postCaption:assemblies===1?'A buffer has a cost.':postCaption});}return Response.json({status:'completed',output:[{content:[{type:'output_text',text}]}]});};
 try{const result=await generateHedgyReel({OPENAI_API_KEY:'test'},'inventory risk');assert.equal(assemblies,2);assert.equal(result.spec.postCaption,postCaption);assert.deepEqual(result.spec.scenes,spec.scenes);}finally{globalThis.fetch=original;}
});
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {listAccounts,addAccount,updateAccount,accountPatch,accountCreate} from '../worker/services/accounts.ts';
test('account migration seeds Hedgy and settings are isolated',async()=>{
 const sql=new DatabaseSync(':memory:');for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sql.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
 const db={async batch(statements){return Promise.all(statements.map(s=>s.run()));},prepare(q){let args=[];return {bind(...v){args=v;return this},async all(){return {results:sql.prepare(q).all(...args)}},async first(){return sql.prepare(q).get(...args)},async run(){return sql.prepare(q).run(...args)}}}};
 try{let rows=await listAccounts(db);assert.equal(rows[0].id,'hedgy');assert.equal(rows[0].postsPerDay,1);assert.equal(rows[0].health.state,'blocked');const b=await addAccount(db,accountCreate.parse({name:'Second'}));await updateAccount(db,b.id,accountPatch.parse({postsPerDay:3}));rows=await listAccounts(db);assert.equal(rows.find(x=>x.id==='hedgy').postsPerDay,1);assert.equal(rows.find(x=>x.id===b.id).postsPerDay,3);assert.ok(rows.every(a=>a.schedule.every(s=>Date.parse(s.scheduledAt)>Date.now())));assert.equal(accountPatch.safeParse({timezone:'unknown'}).success,false);}finally{sql.close()}
});
import {parseReelSpec} from '../src/motion/spec.ts';
import {drawChrome} from '../src/motion/chrome.ts';
test('Hedgy account rules reject colour, crowded layouts, disclaimer and permanent mascot',()=>{
 const base={version:1,series:'HEDGY / FINANCE',accent:'mono',scenes:[{type:'hedgy',duration:4,beat:'risk',headline:'A hedge has a price'},{type:'hedgy',duration:4,beat:'lesson',headline:'Less downside'}]};
 assert.equal(parseReelSpec(base).ok,true);
 assert.equal(parseReelSpec({...base,accent:'red'}).ok,false);
 assert.equal(parseReelSpec({...base,scenes:[{type:'compare',duration:6,left:{label:'A',points:['UP']},right:{label:'B',points:['DOWN']}}]}).ok,false);
 assert.equal(parseReelSpec({...base,scenes:base.scenes.map(s=>({...s,say:'Not investment advice'}))}).ok,false);
 assert.equal(parseReelSpec({...base,scenes:[...base.scenes,base.scenes[0]].map(s=>({...s,mascot:true}))}).ok,false);
 drawChrome({ctx:new Proxy({},{get(){throw Error('Hedgy chrome must not draw')}})},base,0,8);
});
import {drawCaption} from '../src/motion/captions.ts';
import {makeTheme} from '../src/motion/core.ts';
test('Hedgy captions fit every word in their own region without a clipping operation',()=>{
 const draws=[];let font='';const ctx=new Proxy({},{get(_o,k){if(k==='font')return font;if(k==='measureText')return text=>({width:text.length*(parseFloat(font.match(/([\d.]+)px/)?.[1]??'52'))*.55});if(k==='fillText')return (text,x,y)=>draws.push({text,x,y,size:parseFloat(font.match(/([\d.]+)px/)?.[1]??'52')});if(k==='clip')return()=>{throw Error('Captions must fit, never clip')};return()=>{}},set(_o,k,v){if(k==='font')font=v;return true}});
 const text='A protective put limits the loss but the premium still reduces the final profit.';
 drawCaption({ctx,theme:makeTheme('dark','mono')},{text,start:0,end:4},3,{top:1320,bottom:1650});
 assert.equal(draws.map(x=>x.text).join(' '),text);assert.ok(draws.every(x=>x.y-x.size*.8>1320&&x.y+x.size*.8<1650));
});
import {arrange} from './motion-audio.mjs';
test('financial animation actions follow actual narrated word timestamps',()=>{
 const spec={version:1,series:'HEDGY / FINANCE',accent:'mono',scenes:[{type:'hedgy',duration:4,beat:'drop',action:'expiry',headline:'Price drops',say:'Stock crashes now',sync:[{word:'crashes',kind:'crash'}]}]};
 const r=arrange(spec,[{audio:'test.mp3',words:[{text:'Stock',start:0,end:.3},{text:'crashes',start:.7,end:1},{text:'now',start:1.1,end:1.3}]}]);
 assert.equal(r.spec.scenes[0].events[0].kind,'crash');assert.ok(Math.abs(r.spec.scenes[0].events[0].at-.82)<.001);
});
test('transition audio respects explicit silence and different authored cues',()=>{
 const scenes=[{type:'hedgy',beat:'risk',headline:'First',duration:2,transition:'cut',transitionSound:'none'},{type:'hedgy',beat:'hedge',headline:'Second',duration:2,transition:'wipe',transitionSound:'shimmer'},{type:'hedgy',beat:'lesson',headline:'Third',duration:2,transition:'zoom',transitionSound:'none'}];
 const r=arrange({version:1,scenes},[null,null,null],{});
 const sfx=r.cues.filter(c=>c.sfx);
 assert.deepEqual(sfx.filter(c=>!c.ending).map(c=>c.sfx),['shimmer']);
 assert.deepEqual(sfx.filter(c=>c.ending).map(c=>c.sfx),['ding']);
});

test('ideation avoids concepts, items and moods used by earlier reels',async()=>{
 const {conceptCandidates,recentlyUsed,ideaProblems,HEDGY_CONCEPTS}=await import('../worker/hedgy-ideas.ts');
 const history=[{concept:'short-selling',item:'ticket',music:'tense'},{concept:'recall-risk',item:'ticket',music:'tense'}];
 const picks=conceptCandidates(history,5,()=>0.5);assert.equal(picks.length,5);assert.ok(picks.every(c=>!['short-selling','recall-risk'].includes(c.id)));
 const all=HEDGY_CONCEPTS.map(c=>({concept:c.id}));assert.equal(conceptCandidates(all,1)[0].id,HEDGY_CONCEPTS.at(-1).id);
 assert.deepEqual(recentlyUsed(history),{items:['ticket'],moods:['drive']});
 const base={concept:picks[0].id,angle:'a',setting:'s',heroItem:'ticket',supportingItems:[],cast:['hedgy'],hook:'h',music:'tense',musicBrief:'x'.repeat(40)};
 assert.equal(ideaProblems(base,picks,history).length,2);assert.equal(ideaProblems({...base,heroItem:'pizza',music:'drive'},picks,history).length,0);
});
test('Hedgy cinematic sound design uses recorded Foley, never tuned synth tones',async()=>{
 const {designFor,SFX}=await import('./audio/sfx-design.mjs');
 for(const kind of Object.keys(SFX)){const d=designFor(kind,'cinematic');assert.equal(d.source,'eleven',kind);assert.ok(d.prompts.every(p=>/no musical note/.test(p)),kind);assert.equal(d.trim,true,kind);}
});
