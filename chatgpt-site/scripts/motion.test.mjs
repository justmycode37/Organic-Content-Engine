import assert from 'node:assert/strict';
import { test } from 'node:test';
import smoke from '../motion-examples/smoke.json' with { type: 'json' };
import v2Camera from '../motion-examples/v2-camera.json' with { type: 'json' };
import { parseReelSpec, lintReel, reelSpecSchema } from '../src/motion/spec.ts';
import v2Scenes from '../motion-examples/v2-scenes.json' with { type: 'json' };
import { SAFE, SCENE_TYPES, makeTheme, placeScenes, reelDuration, parseMarkup, markupWords } from '../src/motion/core.ts';
import { objectFrame, place, previous, targetObject } from '../src/motion/fx/objects.ts';
import { drawTransition, transitionIn, transitionOut } from '../src/motion/fx/transitions.ts';
import { applyCamera } from '../src/motion/fx/camera.ts';
import { createSceneFrame, eventProgress, isOpeningFrame, openingSceneFrame, renderReel, resolveSceneEvents } from '../src/motion/player.ts';
import { STYLE_DEFS } from '../src/motion/styles/index.ts';
import { drawCaption } from '../src/motion/captions.ts';
import { SCENES } from '../src/motion/scenes/index.ts';
import { evidenceScene } from '../src/motion/scenes/evidence.ts';
import { specialScene } from '../src/motion/scenes/special.ts';
import { HERO } from '../src/motion/styles/bigidea/layout.ts';

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
test('markup parsing exposes accent flags',()=>{
 assert.deepEqual(parseMarkup('hello *world*'),[{text:'hello ',accent:false},{text:'world',accent:true}]);
 assert.deepEqual(markupWords('hello *big world*').map(x=>x.accent),[false,true,true]);
});
test('camera v2 is optional and validates its move, target and ramp',()=>{
 const spec={version:1,scenes:[
  {type:'title',duration:3,text:'FOLLOW THE DEVICE',camera:{move:'fly',target:'device',ramp:true}},
  {type:'outro',duration:3,cta:'FOLLOW THE DEVICE',transition:'morph',camera:{move:'track',target:'device'}},
 ]};
 assert.equal(reelSpecSchema.safeParse(spec).success,true);
 assert.equal(reelSpecSchema.safeParse({...spec,scenes:[{...spec.scenes[0],camera:{move:'fly',target:'device',clip:'safe'}},spec.scenes[1]]}).success,true);
 assert.equal(reelSpecSchema.safeParse({...spec,scenes:[{...spec.scenes[0],camera:{clip:{x:10,y:20,w:0,h:100}}}]}).success,false);
 assert.equal(reelSpecSchema.safeParse({...spec,scenes:[{...spec.scenes[0],camera:{move:'orbit'}}]}).success,false);
});
test('named object placement carries exact final bounds into the next frame',()=>{
 const outgoing=objectFrame();
 const first=place({objects:outgoing},'device',{x:132,y:360,w:720,h:456},'hero');
 assert.deepEqual(first,{id:'device',rect:{x:132,y:360,w:720,h:456},kind:'hero'});
 const incoming=objectFrame(outgoing.current);
 assert.deepEqual(previous({objects:incoming},'device'),first);
 assert.equal(targetObject(incoming.previous,'device')?.kind,'hero');
 assert.equal(place({objects:incoming},'bad',{x:0,y:0,w:0,h:20}),undefined);
});
test('semantic camera moves centre on the named object with a bounded hit punch',()=>{
 const calls=[];
 const ctx=new Proxy({globalAlpha:1}, {
  get(target,key){if(key in target)return target[key];if(['save','restore','beginPath','rect','clip','translate','scale'].includes(String(key)))return(...args)=>calls.push([String(key),...args]);return()=>{};},
  set(target,key,value){target[key]=value;return true;},
 });
 const objects=objectFrame();
 place({objects},'router',{x:240,y:420,w:240,h:160},'target');
 applyCamera({ctx,t:1,dur:2,theme:makeTheme(),seed:4,index:0,style:'patch',assets:{},objects},[.8],{move:'fly',target:'router',ramp:true});
 assert.ok(calls.some(([name,x,y])=>name==='translate'&&x>150&&y>150));
 assert.ok(calls.some(([name,x])=>name==='scale'&&x>1.5&&x<1.7));
 assert.equal(calls.some(([name])=>name==='clip'),false,'camera draws full-frame by default');
 calls.length=0;
 applyCamera({ctx,t:1,dur:2,theme:makeTheme(),seed:4,index:0,style:'patch',assets:{},objects},[],{clip:'safe'});
 assert.ok(calls.some(([name,x,y,w,h])=>name==='rect'&&x===SAFE.x&&y===SAFE.y&&w===SAFE.w&&h===SAFE.bottom-SAFE.y));
 assert.ok(calls.some(([name])=>name==='clip'));
});

test('style clips apply to scene drawing and a scene can explicitly disable them',()=>{
 const calls=[];
 const ctx=new Proxy({globalAlpha:1}, {
  get(target,key){if(key in target)return target[key];if(key==='measureText')return()=>({width:0});return(...args)=>{calls.push([String(key),...args]);};},
  set(target,key,value){target[key]=value;return true;},
 });
 const style=STYLE_DEFS.patch,prior=style.cameraClip;
 style.cameraClip='safe';
 try {
  renderReel(ctx,{version:1,scenes:[{type:'title',duration:2,text:'FULL FRAME'}]},1);
  assert.ok(calls.some(([name])=>name==='clip'));
  calls.length=0;
  renderReel(ctx,{version:1,scenes:[{type:'title',duration:2,text:'FULL FRAME',camera:{clip:null}}]},1);
  assert.equal(calls.some(([name])=>name==='clip'),false);
 } finally {style.cameraClip=prior;}
});
test('new transitions share the short window and draw deterministic phases',()=>{
 assert.equal(transitionOut('whip'),.1); assert.equal(transitionIn('slide'),.1);
 const calls=[];
 const ctx=new Proxy({globalAlpha:1}, {
  get(target,key){if(key==='globalAlpha')return target.globalAlpha;if(key==='save'||key==='restore')return()=>calls.push(String(key));return()=>calls.push(String(key));},
  set(target,key,value){target[key]=value;return true;},
 });
 const theme=makeTheme('dark','blue');
 const context={outgoing:{id:'device',kind:'hero',rect:{x:180,y:440,w:520,h:300}},incoming:{id:'device',kind:'hero',rect:{x:360,y:580,w:360,h:240}}};
 for(const name of ['whip','push','morph','slide']) for(const phase of [-1,-.5,0,.5,1]) drawTransition(ctx,name,phase,theme,17,context);
 assert.equal(calls.filter(call=>call==='save').length,15);
 assert.equal(calls.filter(call=>call==='restore').length,15);
 const beforePush=calls.length;
 drawTransition(ctx,'push',0,theme,17,context);
 assert.equal(calls.length,beforePush,'shared push has no visible frame or overlay');
});
test('default camera impact marks do not frame an active push',()=>{
 const original=STYLE_DEFS.patch;
 const impactFills=[];
 STYLE_DEFS.patch={...original,background(){},chrome(){},caption(){},scenes:{title:{type:'title',render(){}}}};
 const target={globalAlpha:1,save(){},restore(){},fillRect(...args){impactFills.push(args);}};
 const ctx=new Proxy(target,{get(object,key){return key in object?object[key]:(()=>{});},set(object,key,value){object[key]=value;return true;}});
 try {
  renderReel(ctx,{version:1,style:'patch',scenes:[
   {type:'title',duration:2,text:'OUTGOING'},
   {type:'title',duration:2,text:'INCOMING',transition:'push'},
  ]},2.05);
  assert.deepEqual(impactFills,[]);
 } finally {STYLE_DEFS.patch=original;}
});
test('v2 camera example uses all four new transitions and parses without lint errors',()=>{
 assert.equal(parseReelSpec(v2Camera).ok,true);
 assert.deepEqual([...new Set(v2Camera.scenes.map(scene=>scene.transition).filter(Boolean))].sort(),['morph','push','slide','whip']);
 assert.deepEqual(lintReel(v2Camera).filter(item=>item.level==='error'),[]);
});
test('player recomputes the previous scene final layout for an out-of-order frame',()=>{
 const original=STYLE_DEFS.patch.scenes;
 let seen;
 const ctx=new Proxy({globalAlpha:1}, {
  get(target,key){if(key in target)return target[key];if(key==='measureText')return()=>({width:0});return()=>{};},
  set(target,key,value){target[key]=value;return true;},
 });
 STYLE_DEFS.patch.scenes={
  title:{type:'title',layout(frame){place(frame,'device',{x:180,y:420,w:600,h:360},'hero');},render(){}},
  outro:{type:'outro',layout(frame){seen=previous(frame,'device')?.rect;if(seen)place(frame,'device',seen,'hero');},render(){}},
 };
 try {
  renderReel(ctx,{version:1,scenes:[{type:'title',duration:2,text:'DEVICE'},{type:'outro',duration:2,cta:'DONE'}]},3.25);
  assert.deepEqual(seen,{x:180,y:420,w:600,h:360});
 } finally { STYLE_DEFS.patch.scenes=original; }
});

test('special layouts register BIG IDEA cover and MINI WORLD BIT continuity anchors',()=>{
 const makeLayout=(style,index=0,objects=objectFrame())=>({
  t:0.6,dur:2.4,seed:(index+1)*7919,index,opening:index===0,hits:[],events:[],style,theme:makeTheme(),assets:{},objects,
 });
 const cover=makeLayout('bigidea');
 specialScene.layout(cover,{kind:'cover',data:{headline:'948\nLinux bugs'}});
 assert.deepEqual(cover.objects.current.get('idea')?.rect,HERO.number);
 const nextCover=makeLayout('bigidea',1,objectFrame(cover.objects.current));
 specialScene.layout(nextCover,{kind:'numeral',data:{value:'948',meaning:'Linux bugs'}});
 assert.equal(targetObject(cover.objects.current)?.id,'idea');
 assert.equal(targetObject(nextCover.objects.current,'idea')?.id,'idea');

 const placeFrame=makeLayout('miniworld');
 specialScene.layout(placeFrame,{kind:'place',data:{place:'SERVER CITY',title:'Server City'}});
 assert.ok(placeFrame.objects.current.has('BIT'));
 const journey=makeLayout('miniworld',1,objectFrame(placeFrame.objects.current));
 specialScene.layout(journey,{kind:'journey',data:{stations:['SCOUT','PATCH']}});
 assert.deepEqual(previous(journey,'BIT')?.rect,placeFrame.objects.current.get('BIT')?.rect);
 assert.equal(targetObject(journey.objects.current)?.id,'BIT');
});
test('v2 transitions use shared helpers across styles and allow per-transition skins',()=>{
 const styles=['patch','breaking','proof','system','bigidea','miniworld'];
 const ctx=new Proxy({globalAlpha:1}, {
  get(target,key){if(key in target)return target[key];if(key==='measureText')return()=>({width:0});return()=>{};},
  set(target,key,value){target[key]=value;return true;},
 });
 for(const name of styles){
  const style=STYLE_DEFS[name], legacy=style.transition;
  let legacyCalls=0;
  style.transition=()=>{legacyCalls++;};
  try {
   renderReel(ctx,{version:1,style:name,scenes:[{type:'title',duration:2,text:'A'},{type:'outro',duration:2,cta:'B',transition:'whip'}]},1.95);
   assert.equal(legacyCalls,0,`${name} uses the shared whip helper by default`);
  } finally {style.transition=legacy;}
 }
 const style=STYLE_DEFS.patch, prior=style.transitions;
 let skinCalls=0;
 style.transitions={whip(){skinCalls++;}};
 try {
  renderReel(ctx,{version:1,scenes:[{type:'title',duration:2,text:'A'},{type:'outro',duration:2,cta:'B',transition:'whip'}]},1.95);
  assert.equal(skinCalls,1);
 } finally {style.transitions=prior;}
});
test('word anchors validate against say and reject ambiguous or missing anchors',()=>{
 const base={version:1,scenes:[
  {type:'title',duration:2,text:'A clear result',say:'A *clear* result.',caption:'A clear result now',events:[{word:'clear',kind:'reveal'}],reward:'mechanism'},
  {type:'outro',duration:3,cta:'Follow along',caption:'Follow along for more',reward:'joke'},
 ]};
 assert.equal(parseReelSpec(base).ok,true);
 assert.equal(parseReelSpec({...base,scenes:[{...base.scenes[0],events:[{word:'missing',kind:'reveal'}]},base.scenes[1]]}).ok,false);
 assert.equal(parseReelSpec({...base,scenes:[{...base.scenes[0],events:[{word:'clear result',kind:'reveal'}]},base.scenes[1]]}).ok,false);
 assert.equal(parseReelSpec({...base,scenes:[{...base.scenes[0],events:[{at:0.2,word:'clear',kind:'reveal'}]},base.scenes[1]]}).ok,false);
});
test('player supplies opening state, camera hits and resolved events to the scene frame',()=>{
 const spec={version:1,scenes:[
  {type:'title',duration:2,text:'A clear result',say:'A *clear* result.',hits:[0.4],events:[{word:'clear',kind:'reveal',target:'result'},{at:1.2,kind:'resolve'}]},
  {type:'outro',duration:2,cta:'Follow along'},
 ]};
 const placed=placeScenes(spec),first=createSceneFrame({},placed[0],0,makeTheme(),undefined,{}),later=createSceneFrame({},placed[1],2.1,makeTheme(),undefined,{});
 assert.equal(first.opening,true);assert.equal(isOpeningFrame(first),true);assert.deepEqual(first.hits,[0.4]);
 assert.equal(openingSceneFrame(first).t,0.3);assert.equal(first.t,0,'opening snapshot does not mutate the real frame time');
 assert.deepEqual(first.events.map(event=>[event.kind,event.at,event.target]),[['reveal',2/3,'result'],['resolve',1.2,undefined]]);
 assert.equal(eventProgress(first,0),0);
 const after=createSceneFrame({},placed[0],0.79,makeTheme(),undefined,{});
 assert.ok(Math.abs(eventProgress(after,'reveal')-0.5)<0.02);
 assert.equal(later.opening,false);assert.equal(isOpeningFrame(later),false);
 assert.equal(resolveSceneEvents(spec.scenes[0])[0].at,2/3);
});
test('v2 lint checks timing, text, rewards, event rate and caption chunks',()=>{
 const spec={version:1,scenes:[
  {type:'title',duration:1.3,text:'A readable opening',caption:'A readable opening now',say:'A readable opening now',reward:'mechanism',events:[{word:'readable',kind:'reveal'},{at:0.2,kind:'contact'},{at:0.4,kind:'transform'},{at:0.6,kind:'resolve'}]},
  {type:'outro',duration:1.3,cta:'The final answer',caption:'The final answer lands',reward:'consequence'},
 ]};
 const messages=lintReel(spec).map(item=>item.message).join('\n');
 assert.match(messages,/outside 1\.5–3\.0s/);assert.match(messages,/mean scene duration/);assert.match(messages,/event rate/);assert.match(messages,/target is 1\.2s/);
 const tooMany={version:1,scenes:[{type:'title',duration:2,text:'One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen',caption:'A short caption chunk',reward:'evidence'},{type:'outro',duration:2,cta:'The answer',caption:'The answer is clear',reward:'consequence'}]};
 assert.ok(lintReel(tooMany).some(item=>item.level==='error'&&item.message.includes('hard 18-word cap')));
});
test('word-budget lint follows the largest active caption chunk and timed-caption overrides',()=>{
 const spec={version:1,scenes:[
  {type:'title',duration:2,text:'Readable hook',caption:['one two three four five six seven eight','a b c d e f g h'],reward:'evidence'},
  {type:'outro',duration:2,cta:'Done now',caption:'The answer is clear',reward:'consequence'},
 ]};
 assert.equal(lintReel(spec).some(item=>item.level==='error'&&item.message.includes('hard 18-word cap')),false);
 const timed={...spec,scenes:[{...spec.scenes[0],text:'Hook',caption:'This scene caption is overridden'},spec.scenes[1]],captions:[{text:'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen',start:0,end:1}]};
 assert.ok(lintReel(timed).some(item=>item.level==='error'&&item.scene===0&&item.message.includes('19 visible words')));
});
test('speech caption renderer keeps a chunk to at most two rows',()=>{
 const rows=[],stack=[];
 const ctx={globalAlpha:1,font:'',save(){stack.push(this.globalAlpha);},restore(){this.globalAlpha=stack.pop()??1;},measureText(value){const size=Number(this.font.match(/(\d+(?:\.\d+)?)px/)?.[1]??32);return{width:String(value).length*size*0.56};},translate(){},scale(){},strokeText(){},fillText(_value,_x,y){rows.push(y);}};
 const frame={ctx,t:1.5,dur:3,theme:makeTheme(),seed:1,index:0,opening:true,hits:[],events:[],style:'patch',assets:{}};
 drawCaption(frame,{text:'intercontinental supercomputer synchronization transformation mechanisms continue',start:0,end:3},1.5);
 assert.ok(new Set(rows).size<=2,`caption used ${new Set(rows).size} rows`);
});

test('v2 semantic scene example parses and every shared renderer is registered',()=>{
 const parsed=parseReelSpec(v2Scenes);
 assert.equal(parsed.ok,true,parsed.ok?'':parsed.errors.join('\n'));
 const required=['demo','predict','quantity','evidence','scale','split'];
 for(const type of required){assert.ok(SCENE_TYPES.includes(type));assert.equal(SCENES[type].type,type);}
 assert.ok(v2Scenes.scenes.some(scene=>scene.type==='layers'));
 assert.ok(v2Scenes.scenes.some(scene=>scene.type==='stat'&&scene.slam===true));
 const quantity=v2Scenes.scenes.find(scene=>scene.type==='quantity');
 assert.equal(quantity.quantity-quantity.subset,quantity.comparator.value);
 assert.equal(lintReel(parsed.spec).some(issue=>issue.level==='error'),false);
});

test('v2 semantic schemas reject ambiguous predictions, invalid extraction, and malformed evidence sources',()=>{
 const scenes=v2Scenes.scenes;
 const predict=scenes.find(scene=>scene.type==='predict');
 const quantity=scenes.find(scene=>scene.type==='quantity');
 const evidence=scenes.find(scene=>scene.type==='evidence');
 const scale=scenes.find(scene=>scene.type==='scale');
 const replace=(original,replacement)=>v2Scenes.scenes.map(scene=>scene===original?replacement:scene);
 assert.equal(parseReelSpec({...v2Scenes,scenes:replace(predict,{...predict,answer:'NOT A GUESS'})}).ok,false);
 assert.equal(parseReelSpec({...v2Scenes,scenes:replace(quantity,{...quantity,subset:quantity.quantity+1})}).ok,false);
 assert.equal(parseReelSpec({...v2Scenes,scenes:replace(evidence,{...evidence,asset:'source-image',quote:undefined})}).ok,false);
 assert.equal(parseReelSpec({...v2Scenes,scenes:replace(evidence,{...evidence,asset:'source-image',rect:{x:0,y:0,w:10,h:10}})}).ok,false);
 assert.equal(parseReelSpec({...v2Scenes,scenes:replace(evidence,{...evidence,rect:{x:0,y:0,w:10,h:10}})}).ok,false);
 assert.equal(parseReelSpec({...v2Scenes,scenes:replace(scale,{...scale,levels:[{label:'ZERO',value:0},{label:'NEXT',value:1}]})}).ok,false);
});

test('old stat and layers props remain valid without v2 options',()=>{
 const compatible={version:1,scenes:[
  {type:'title',duration:1,text:'LEGACY',caption:'Legacy opening.'},
  {type:'stat',duration:2,value:948,label:'BUGS'},
  {type:'layers',duration:2,title:'STACK',layers:[{label:'USER SPACE'},{label:'KERNEL'}]},
  {type:'outro',duration:1,cta:'DONE',caption:'Legacy ending.'},
 ]};
 assert.equal(parseReelSpec(compatible).ok,true);
});

test('evidence renders a placeholder when a referenced asset is unavailable',()=>{
 const labels=[];
 const target={
  save(){},restore(){},beginPath(){},rect(){},fill(){},stroke(){},fillRect(){},strokeRect(){},
  fillText(value){labels.push(value);},measureText(value){return{width:String(value).length*24};},
 };
 const ctx=new Proxy(target,{get(object,key){return key in object?object[key]:(()=>{});}});
 evidenceScene.render({ctx,t:0,dur:2.4,theme:makeTheme(),seed:1,index:0,style:'patch',assets:{}},{
  asset:'missing-source',rect:{x:10,y:10,w:20,h:20},claim:'CLAIM',source:'SOURCE',date:'DATE',
 });
 assert.ok(labels.includes('SOURCE IMAGE MISSING'));
});
test('scale with empty levels reports a validation error instead of throwing',()=>{
 const result=parseReelSpec({version:1,scenes:[{type:'title',duration:2,text:'A'},{type:'scale',duration:2,reference:'X',unit:'u',levels:[]},{type:'outro',duration:2,cta:'B'}]});
 assert.equal(result.ok,false);
 assert.ok(result.errors.some(error=>error.includes('levels')));
});
