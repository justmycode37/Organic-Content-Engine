import test from 'node:test';
import assert from 'node:assert/strict';
import {generateHedgyReel} from '../worker/hedgy-generation.ts';
import {hedgyPostCaptionSchema} from '../worker/hedgy-caption.ts';
const postCaption='The cheapest choice can still cost you more.\n\nHedgy buys just enough lemons for his stand, but a busy afternoon leaves him with customers he cannot serve. Keeping extra stock ties up money and risks waste. Keeping too little means missing sales when demand surprises him. The tradeoff is between the cost of holding a buffer and the cost of running out.\n\nA buffer does not have to cover every possible rush. It needs to reflect how unpredictable demand is and how quickly you can restock. That is the useful question behind the story: what would running out actually cost?\n\n#InventoryRisk #RiskManagement #FinanceExplained';
test('missing API key blocks without subscription fallback',async()=>{await assert.rejects(generateHedgyReel({},'diversification'),e=>e.code==='api_key_missing')});
const idea=input=>({concept:/Choose concept from exactly these ids: ([a-z-]+)/.exec(input)[1],angle:'Hedgy runs a lemonade stand.',setting:'a lemonade stand',heroItem:'lemonade',supportingItems:[],cast:['hedgy'],hook:'Ever run out of lemons?',music:'drive',musicBrief:'Darksynth chase at 136 BPM: distorted bass, hard drums, guitar stabs, building to a hit on the reveal.'});
const lines = [
 'Ever run out of lemons?', 'Hedgy buys just enough for his usual customers.',
 'Then a crowd shows up, and his stand runs dry.', 'Extra lemons would let him keep selling.',
 'But on quiet days, those lemons could go to waste.', 'That is the cost of keeping a buffer.',
];
const story = {
 question:'Why keep extra lemons?', answer:'A buffer prevents missed sales but may go to waste.',
 anchor:'The lemons at the same stand.',
 beats:[0,2,4].map(i=>({say:lines.slice(i,i+2).join(' '),link:'Continues the lemonade stand example.'})),
};
const approved = {approved:true,findings:[]};
const continuity = {...approved,handoffs:lines.slice(1).map((_,index)=>({
 intoScene:index+2,connects:true,evidence:'The next shot picks up the lemons at the same stand.',
}))};
const listener = {...approved,heardQuestion:story.question,heardAnswer:story.answer,retell:story.answer};
const spec = {
 version:1,title:'Lemons',postCaption,series:'HEDGY / FINANCE',mode:'dark',accent:'mono',music:'drive',
 scenes:lines.map(say=>({type:'shot',shot:'trade',duration:4,params:{item:'lemonade'},say})),
};

function mockHedgy(t, respond = () => undefined) {
 const calls = [];
 let active = 0, peak = 0;
 t.mock.method(globalThis,'fetch',async (_url, init) => {
  const body = JSON.parse(init.body);
  const format = body.text?.format?.name;
  calls.push(body);
  active++;
  peak = Math.max(peak,active);
  await new Promise(resolve=>setTimeout(resolve,1));
  active--;
  const outputs = {
   hedgy_idea:() => idea(body.input),hedgy_story:() => story,hedgy_fact_review:() => approved,
   hedgy_listener_review:() => listener,hedgy_reel:() => spec,hedgy_scene_review:() => continuity,hedgy_copy_review:() => approved,
  };
  const text = respond(format,body) ?? outputs[format]?.();
  return Response.json({status:'completed',output:[{content:[{type:'output_text',text:text===undefined?'production brief':JSON.stringify(text)}]}]});
 });
 return {calls,peak:()=>peak};
}

test('Sol xhigh reviews content and coordinates twelve Sol xhigh specialists',async t=>{
 const {calls,peak}=mockHedgy(t);
 const result=await generateHedgyReel({OPENAI_API_KEY:'test'},'inventory risk');
 assert.equal(result.provenance.specialists,12);
 assert.equal(result.provenance.effort,'xhigh');
 assert.equal(result.provenance.editorial.storyRounds.length,1);
 assert.equal(result.provenance.editorial.copyRounds.length,1);
 assert.equal(result.provenance.editorial.sceneRounds.length,1);
 assert.equal(calls.length,20);
 assert.ok(calls.every(call=>call.model==='gpt-6.2-sol'&&call.store===false&&call.reasoning.effort==='xhigh'));
 assert.ok(peak()<=4);
 assert.equal(result.spec.musicBrief,result.provenance.idea.musicBrief);
 assert.equal(result.spec.postCaption,postCaption);
 assert.equal(parseReelSpec(result.spec).ok,true);
});
test('post captions require useful paragraphs and a small set of distinct hashtags',()=>{
 assert.equal(hedgyPostCaptionSchema.safeParse(postCaption).success,true);
 for(const invalid of [undefined,'Risk remains. #Finance #Money #Learning',postCaption.replace(/\n\n/g,' '),postCaption.replace(/#[A-Za-z]+/g,''),postCaption.replace('#InventoryRisk','#FinanceExplained'),postCaption+' #Money #Learning #Investing','x'.repeat(2201)]){
  assert.equal(hedgyPostCaptionSchema.safeParse(invalid).success,false);
 }
});
test('editorial and continuity repairs are reviewed again and assembly preserves the approved narration',async t=>{
 let drafts=0, finance=0, listens=0, assemblies=0, sceneReviews=0, copyReviews=0;
 const weakOpening='A buffer is a great deal.';
 const brokenCut={...spec.scenes[1],transition:'flash'};
 const finalCopy={title:'When the lemons run out',postCaption};
 mockHedgy(t,(format,body)=>{
  switch(format){
   case 'hedgy_story':
    if (++drafts===1) return {...story,beats:[{...story.beats[0],say:weakOpening},...story.beats.slice(1)]};
    assert.match(body.input,/Explain what runs out/);
    return story;
   case 'hedgy_fact_review':
    finance++;
    break;
   case 'hedgy_listener_review':
    assert.doesNotMatch(body.input,/lemonade stand example/);
    if (++listens===1) return {...listener,approved:false,findings:['Explain what runs out.']};
    assert.match(body.input,/Ever run out of lemons/);
    break;
   case 'hedgy_reel':
    assemblies++;
    assert.match(body.input,/Ever run out of lemons/);
    if (assemblies===1) return {...spec,postCaption:'A buffer has a cost.'};
    if (assemblies===2) return {...spec,scenes:[{...spec.scenes[0],say:weakOpening},...spec.scenes.slice(1)]};
    if (assemblies===3) {
     assert.match(body.input,/exact approved narration/);
     return {...spec,scenes:[spec.scenes[0],brokenCut,...spec.scenes.slice(2)]};
    }
    assert.match(body.input,/Cut into scene 2.*flash breaks the handoff/);
    break;
   case 'hedgy_scene_review':
    if (++sceneReviews===1) {
     return {...continuity,handoffs:[{intoScene:2,connects:false,evidence:'The flash breaks the handoff.'},...continuity.handoffs.slice(1)]};
    }
    assert.doesNotMatch(body.input,/"transition":"flash"/);
    break;
   case 'hedgy_copy_review':
    if (++copyReviews===1) return {approved:false,findings:['The title should describe the scenario.']};
    assert.match(body.input,/When the lemons run out/);
    break;
   case 'hedgy_post_copy':
    assert.match(body.input,/title should describe the scenario/);
    return finalCopy;
  }
 });
 const result=await generateHedgyReel({OPENAI_API_KEY:'test'},'inventory risk');
 assert.deepEqual({drafts,finance,listens,assemblies,sceneReviews,copyReviews},{drafts:2,finance:2,listens:2,assemblies:4,sceneReviews:2,copyReviews:2});
 assert.equal(result.spec.title,finalCopy.title);
 assert.equal(result.spec.postCaption,postCaption);
 assert.deepEqual(result.spec.scenes,spec.scenes);
 assert.equal(result.provenance.editorial.storyRounds.length,2);
 assert.equal(result.provenance.editorial.sceneRounds.length,4);
 assert.equal(result.provenance.editorial.copyRounds.length,2);
});

test('a continuity verdict that skips a cut cannot approve the reel',async t=>{
 const {calls}=mockHedgy(t,format=>format==='hedgy_scene_review'
  ? {...continuity,handoffs:continuity.handoffs.slice(1)}
  : undefined);
 await assert.rejects(generateHedgyReel({OPENAI_API_KEY:'test'},'inventory risk'),error=>
  error.code==='hedgy_scenes_unapproved'&&error.details.sceneRounds.length===4);
 assert.ok(calls.every(call=>call.text?.format?.name!=='hedgy_copy_review'));
});

test('unapproved scripts stop before animation planning after three repairs',async t=>{
 const {calls}=mockHedgy(t,format=>format==='hedgy_fact_review'
  ? {approved:false,findings:['The stated outcome needs a condition.']}
  : undefined);
 await assert.rejects(generateHedgyReel({OPENAI_API_KEY:'test'},'inventory risk'),error=>
  error.code==='hedgy_story_unapproved'&&error.details.rounds.length===4);
 assert.equal(calls.length,13);
 assert.ok(calls.every(call=>call.text?.format?.name!=='hedgy_reel'));
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
