import test from 'node:test';
import assert from 'node:assert/strict';
import {cameraProblems} from '../src/acryllex/camera-direction.ts';
import {planTransitions,transitionProblems,transitionList,SHOT_TRANSITION_RULES,MIN_ANGLE,MIN_SIZE,MIN_SHOT,CUT_DUR} from '../src/acryllex/shot-transitions.ts';
import {autoCues} from '../src/acryllex/cues.ts';
import {sceneDuration} from '../src/acryllex/spec.ts';
import {directCameras,shotList} from '../worker/acryllex-generation.ts';
import {readFileSync} from 'node:fs';

const reel=(scenes,extra={})=>({version:1,series:'ACRYLLEX',title:'t',look:{inkMode:'fixed',contrast:1.4},format:{cell:6},...extra,scenes});
const sg=(say,camera,more={})=>({say,hue:'azure',light:{key:0.8,contrast:1.3},raster:{cell:6},objects:[{id:'glass',model:'glass'},{id:'spoon',model:'spoon',near:'glass',side:'in'}],...(camera?{camera}:{}),...more});
const style=s=>JSON.stringify({look:s.look,format:s.format,scenes:s.scenes.map(x=>[x.light,x.raster,x.hue,x.say,x.objects])});
const LONG='The spoon looks broken right at the water level of the glass today.';

test('a tiny angle change between scenes is a jump cut: flagged, then escalated to a distinct shot',()=>{
 // three-quarter → high at nearly the same size is ~22°: a hesitant viewpoint switch
 const spec=reel([sg('Look at the glass.',{angle:'three-quarter',fill:0.82}),sg('It holds a spoon.',{angle:'high',fill:0.86}),sg('Water fills it.',{angle:'side',fill:0.8})]);
 const before=transitionProblems(spec);
 assert.ok(before.some(p=>/^scene 2: opens only 2\d° and 1\.05x away/.test(p)),before.join('\n'));
 const {spec:out,changes}=planTransitions(spec);
 assert.ok(changes.some(c=>/^scene 2: jump cut \(high 0\.86\) → /.test(c)),changes.join('\n'));
 assert.deepEqual(transitionProblems(out),[]);
 assert.deepEqual(cameraProblems(out),[],'the repair must not create repeated/overused views');
 assert.match(transitionList(out),/^2:cut (new-angle|reframe) /);
 assert.equal(style(out),style(spec),'style, light, raster, hue and objects are untouched');
 assert.equal(spec.scenes[1].camera.angle,'high','input not mutated');
});

test('a slow in-scene swing between angles becomes a hard cut on the same word; nudges and flicker shots are removed',()=>{
 const s=sg(LONG,{angle:'three-quarter',fill:0.82},{events:[
  {at:0.2,camera:{angle:'front',fill:0.85}},                      // 0.2 s in: flicker + nudge? no: 35° → new angle but too early
  {at:'level',dur:2.4,camera:{angle:'side',fill:0.8}},            // 2.4 s orbit-like swing → hard cut
 ]});
 const spec=reel([s]);
 const probs=transitionProblems(spec);
 assert.ok(probs.some(p=>/swings \d+° over 2\.4s like a camera morph/.test(p)),probs.join('\n'));
 assert.ok(probs.some(p=>/shorter than 0\.7s \(flicker\)/.test(p)));
 const {spec:out,changes}=planTransitions(spec);
 const cams=out.scenes[0].events.filter(e=>e.camera);
 assert.ok(cams.every(e=>e.easing==='hold'&&e.dur===CUT_DUR),JSON.stringify(cams));
 assert.equal(cams.find(e=>e.camera.angle==='side').at,'level','the motivating word is kept');
 assert.ok(changes.some(c=>/2\.4s → hard cut/.test(c)));
 assert.ok(changes.some(c=>/moved to 0\.7s/.test(c)),changes.join('\n'));
 assert.deepEqual(transitionProblems(out),[]);
 // a 5% / 0° re-framing inside a scene is a hesitant nudge and is dropped, but an object action on that event stays
 const nudge=reel([sg(LONG,{angle:'side',fill:0.8},{events:[{at:1.5,target:'spoon',turn:[0,20,0],camera:{angle:'side',fill:0.84}}]})]);
 const n=planTransitions(nudge);
 assert.deepEqual(n.spec.scenes[0].events,[{at:1.5,target:'spoon',turn:[0,20,0]}]);
 assert.ok(n.changes.some(c=>/dropped hesitant nudge/.test(c)));
});

test('a same-angle push-in stays a smooth, bounded move; a big one is accepted',()=>{
 const spec=reel([sg(LONG,{angle:'side',fill:0.6},{events:[{at:1.2,dur:3,camera:{angle:'side',fill:1.0,focus:['glass','spoon']}}]})]);
 assert.ok(transitionProblems(spec).some(p=>/push\/pull lasts 3s/.test(p)));
 const {spec:out}=planTransitions(spec);const e=out.scenes[0].events[0];
 assert.equal(e.dur,1.4);assert.notEqual(e.easing,'hold');
 assert.deepEqual(transitionProblems(out),[]);
});

test('same-subject cuts stay clean; explicit transitions on subject changes and explicit cameras are preserved',()=>{
 const other=(say,camera,more={})=>({say,objects:[{id:'bottle',model:'bottle'}],camera,...more});
 const spec=reel([
  sg('Look at the glass.',{angle:'three-quarter',fill:0.82}),
  sg('Now from the side.',{angle:'side',fill:0.8},{transition:'flash'}),          // gratuitous on a viewpoint change
  sg('Then from above.',{angle:'top',fill:0.74},{transition:'wipe',transitionDur:1.5}),// wipe kept, shortened
  other('A bottle stands alone.',{angle:'low',fill:0.86},{transition:'glitch'}),    // subject change: authored glitch kept
  {say:'Inside the tunnel.',objects:[{id:'t',model:'bottle'}],camera:{pos:[0,1,4],look:[0,1,0]},transition:'black'}, // explicit camera kept
 ]);
 const probs=transitionProblems(spec);
 assert.ok(probs.some(p=>/^scene 2: flash transition on a camera change of the same subject is gratuitous/.test(p)),probs.join('\n'));
 assert.ok(probs.some(p=>/^scene 3: wipe lasts 1\.5s/.test(p)));
 const {spec:out}=planTransitions(spec);
 assert.equal(out.scenes[1].transition,'cut');
 assert.deepEqual([out.scenes[2].transition,out.scenes[2].transitionDur],['wipe',0.6]);
 assert.equal(out.scenes[3].transition,'glitch');
 assert.deepEqual(out.scenes[4].camera,{pos:[0,1,4],look:[0,1,0]});
 assert.equal(out.scenes[4].transition,'black');
 assert.deepEqual(transitionProblems(out),[]);
});

test('flat footage keeps its captured front view; same-source cuts change framing by a real step',()=>{
 const wave=(say,camera,params={asset:'ocean-breaker'})=>({say,objects:[{id:'wave',model:'wave-footage',params,idle:'none',origin:'model',pos:[0,0,0]}],camera});
 const spec=reel([wave('A wave rises.',{angle:'front',fill:0.8}),wave('It curls over.',{angle:'front',fill:0.9}),wave('Inside it is a tunnel.',{angle:'front',fill:0.8},{asset:'ocean-barrel'})]);
 assert.ok(transitionProblems(spec).some(p=>/^scene 2: opens only 0° and 1\.13x/.test(p)));
 const {spec:out}=planTransitions(spec);
 assert.ok(out.scenes.every(s=>s.camera.angle==='front'),'no invented angle on a flat source');
 assert.ok(Math.max(out.scenes[1].camera.fill,0.8)/Math.min(out.scenes[1].camera.fill,0.8)>=MIN_SIZE);
 assert.deepEqual(out.scenes[2].camera,{angle:'front',fill:0.8},'another genuine source view is a new subject: kept');
 assert.deepEqual(transitionProblems(out),[]);
});

test('hard in-scene cuts get a cut sound exactly on the frame the view changes',()=>{
 const spec=reel([sg(LONG,{angle:'side',fill:0.8},{events:[{at:1.5,easing:'hold',dur:CUT_DUR,camera:{angle:'top',fill:0.74}}]})]);
 const cue=autoCues(spec).find(c=>c.why==='in-scene camera cut');
 assert.equal(cue?.at,1.54);assert.equal(cue.kind,'cut');
 assert.ok(sceneDuration(spec.scenes[0])-1.54>=MIN_SHOT);
});

test('generation wiring: planner runs transitions, both review gates reject jump cuts, prompts carry the rule',()=>{
 const log={};
 const out=directCameras(reel([sg('Look at the glass.',{angle:'three-quarter',fill:0.82}),sg('It holds a spoon.',{angle:'high',fill:0.86},{transition:'blink'}),sg('Water fills it.',{angle:'side',fill:0.8})]),log,'storyboard');
 assert.deepEqual(transitionProblems(out),[]);
 assert.ok(log.storyboardCameraPlan.some(c=>/jump cut/.test(c)),JSON.stringify(log));
 assert.match(shotList(out),/\|\| cuts: 2:cut /);
 assert.match(SHOT_TRANSITION_RULES,new RegExp(`${MIN_ANGLE}°`));
 const src=readFileSync(new URL('../worker/acryllex-generation.ts',import.meta.url),'utf8');
 assert.equal(src.match(/\.\.\.transitionProblems\(/g)?.length,3,'storyboard, storyboard-review and visual-review gates');
 assert.match(src,/\$\{SHOT_TRANSITION_RULES\}/);
});
