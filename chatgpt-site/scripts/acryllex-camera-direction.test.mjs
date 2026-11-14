import test from 'node:test';
import assert from 'node:assert/strict';
import {cameraProblems,planCameras,sceneViews,sameView,storyShot,CAMERA_DIRECTION_RULES,SHOTS} from '../src/acryllex/camera-direction.ts';
import {directCameras,shotList} from '../worker/acryllex-generation.ts';

const reel=(scenes,extra={})=>({version:1,series:'ACRYLLEX',title:'t',look:{inkMode:'fixed',contrast:1.4,gap:0.2},format:{cell:6},...extra,scenes});
const spoonGlass=(say,camera,more={})=>({say,hue:'azure',light:{key:0.8,contrast:1.3},raster:{cell:6},objects:[{id:'glass',model:'glass'},{id:'spoon',model:'spoon',near:'glass',side:'in'}],...(camera?{camera}:{}),...more});
const SPOON_LINES=[
 'Look at a spoon standing in a glass of water on the kitchen table.',
 'The spoon looks broken right at the water level.',
 'But the metal spoon is perfectly straight where it touches the rim.',
 'Light slows down when it goes from air into water.',
 'So the light from the spoon bends at the surface.',
 'Your eyes think the light travelled in a straight line.',
 'That is why the spoon seems to jump sideways.',
 'The spoon was never broken, the light was bent.',
];
const styleOf=s=>JSON.stringify({look:s.look,format:s.format,scenes:s.scenes.map(x=>[x.light,x.raster,x.hue,x.say,x.objects.map(o=>[o.id,o.model,o.params,o.pos,o.scale])])});

test('a one-perspective spoon/glass reel is flagged and re-directed into varied, story-driven shots',()=>{
 const spec=reel(SPOON_LINES.map(l=>spoonGlass(l)));
 const before=cameraProblems(spec);
 assert.ok(before.some(p=>/scene 2: repeats the previous three-quarter medium view/.test(p)),before.join('\n'));
 assert.ok(before.some(p=>/three 3D scenes in a row/.test(p)));
 assert.ok(before.some(p=>/8 of 8 3D scenes use the three-quarter angle/.test(p)));
 const {spec:out,changes}=planCameras(spec);
 assert.deepEqual(cameraProblems(out),[],changes.join('\n'));
 assert.ok(changes.length>=3);
 const views=out.scenes.map(s=>sceneViews(s).first);
 for(let i=1;i<views.length;i++)assert.ok(!sameView(views[i-1],views[i]),`scene ${i+1} repeats`);
 assert.ok(new Set(views.map(v=>v.angle)).size>=3,'at least three perspectives');
 assert.equal(out.scenes[0].camera.angle,'high','"kitchen table" hook opens on an establishing high shot');
 // story: "touches the rim" → macro contact on both touching objects
 assert.equal(out.scenes[2].camera.fill,SHOTS['macro-contact'].fill);
 assert.deepEqual([out.scenes[2].camera.focus].flat().sort(),['glass','spoon']);
 // story: "bends at the surface" → waterline (side, eye level, focus the container)
 assert.equal(out.scenes[4].camera.angle,'side');
 assert.equal(out.scenes[4].camera.focus,'glass');
 // never auto-orbits; style untouched; input not mutated
 assert.ok(out.scenes.every(s=>!['orbit','orbit-left'].includes(s.camera?.move)));
 assert.equal(styleOf(out),styleOf(spec));
 assert.ok(spec.scenes.every(s=>s.camera===undefined));
});

test('an already varied, honest reel is left exactly as authored',()=>{
 const cams=[{angle:'high',fill:0.6},{angle:'side',fill:1,focus:'glass'},{angle:'three-quarter-left',fill:1.05,focus:['spoon','glass'],move:'push',amount:0.5},{angle:'top',fill:0.74},{angle:'three-quarter',fill:0.82},{angle:'low',fill:0.86}];
 const spec=reel(cams.map((c,i)=>spoonGlass(SPOON_LINES[i],c)));
 assert.deepEqual(cameraProblems(spec),[]);
 const {spec:out,changes}=planCameras(spec);
 assert.deepEqual(changes,[]);
 assert.deepEqual(out,spec);
});

test('flat footage keeps its captured view: no invented angles, variety only via genuine source views or framing',()=>{
 const wave=(say,camera,params={asset:'ocean-breaker'})=>({say,hue:'blue',objects:[{id:'wave',model:'wave-footage',params,idle:'none',origin:'model',pos:[0,0,0]}],camera});
 const spec=reel([
  wave('A wave rises out of the dark sea.',{angle:'front',fill:0.8}),
  wave('It curls over at the top.',{angle:'side',fill:0.8,move:'orbit'}),
  wave('Then the wave hits the sand.',{angle:'front',fill:0.8}),
  wave('Inside, the water forms a tunnel.',{angle:'front',fill:0.8},{asset:'ocean-barrel'}),
 ]);
 const problems=cameraProblems(spec);
 assert.ok(problems.some(p=>/scene 2: camera angle side on a flat source/.test(p)),problems.join('\n'));
 assert.ok(problems.some(p=>/scene 2: orbit rotates around a flat source/.test(p)));
 assert.ok(problems.some(p=>/scene 3: repeats the previous shot of the same flat source/.test(p)));
 assert.ok(!problems.some(p=>/scene 4: repeats/.test(p)),'a distinct genuine source view is a new shot');
 const {spec:out,changes}=planCameras(spec);
 assert.deepEqual(cameraProblems(out),[],changes.join('\n'));
 for(const s of out.scenes){assert.ok(!s.camera.angle||s.camera.angle==='front');assert.ok(!['orbit','orbit-left','rise','fall','crane','drift'].includes(s.camera.move));}
 assert.notEqual(out.scenes[1].camera.fill,0.8,'scene 2 framed differently from scene 1 (push/pull/crop instead of an angle)');
 assert.deepEqual(out.scenes[3].camera,spec.scenes[3].camera,'genuine alternate source view kept');
 assert.equal(storyShot(spec.scenes[2],true),'insert');
});

test('orbits, spinning idles and beat-pumped camera events are limited',()=>{
 const scenes=SPOON_LINES.map((l,i)=>spoonGlass(l,{angle:['high','side','top','low','front','three-quarter','three-quarter-left','high'][i],move:'orbit'}));
 for(const s of scenes)s.objects[0].idle='spin-slow';
 scenes[3].events=[
  {at:'slows',camera:{move:'push'}},{at:'air',camera:{move:'pull'}},{at:'into',camera:{move:'push'},fx:'scan',target:'glass'},{at:'water',camera:{fill:1}},
 ];
 const spec=reel(scenes);const problems=cameraProblems(spec);
 assert.ok(problems.some(p=>/reel: 8 scenes orbit; at most 1/.test(p)),problems.join('\n'));
 assert.ok(problems.some(p=>/reel: 8 scenes spin/.test(p)));
 assert.ok(problems.some(p=>/scene 4: 4 camera events/.test(p)));
 assert.ok(problems.some(p=>/scene 4: alternating push\/pull/.test(p)));
 const {spec:out,changes}=planCameras(spec);
 assert.deepEqual(cameraProblems(out),[],changes.join('\n'));
 assert.equal(out.scenes.filter(s=>s.camera?.move==='orbit').length,1);
 const ev=out.scenes[3].events;
 assert.equal(ev.filter(e=>e.camera).length,1);
 assert.ok(ev.some(e=>e.fx==='scan'&&!e.camera),'the non-camera part of a pumping event survives');
});

test('explicit and tracking cameras are intentional and kept; macro fill needs a focus',()=>{
 const tunnel={say:'We fly into the tunnel.',objects:[{id:'tunnel',model:'tunnel'}],camera:{pos:[0,1,4],look:[0,1,0],fov:60}};
 const spec=reel([tunnel,{...tunnel,say:'Still flying through it.'},spoonGlass('The spoon rests on the glass.',{fill:1.05})]);
 const problems=cameraProblems(spec);
 assert.ok(problems.some(p=>/scene 2: repeats/.test(p)));
 assert.ok(problems.some(p=>/scene 3: macro fill 1.05 without focus/.test(p)));
 const {spec:out}=planCameras(spec);
 assert.deepEqual(out.scenes[1].camera,tunnel.camera,'explicit camera never overwritten');
});

test('generation wiring: prompt rules, planner log and review shot list',()=>{
 assert.match(CAMERA_DIRECTION_RULES,/waterline/);
 assert.match(CAMERA_DIRECTION_RULES,/ONE captured viewpoint/);
 assert.match(CAMERA_DIRECTION_RULES,/do not pump the camera/);
 const log={};const out=directCameras(reel(SPOON_LINES.slice(0,4).map(l=>spoonGlass(l))),log,'storyboard');
 assert.ok(Array.isArray(log.storyboardCameraPlan)&&log.storyboardCameraPlan.length>0);
 assert.deepEqual(cameraProblems(out),[]);
 assert.match(shotList(out),/^1:high 0\.58 \| 2:side 1 focus glass \| /);
});
