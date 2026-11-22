import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,readdir,rm,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {reviewNarrationDelivery,VISUAL_REVIEW_STAGES,reviewVisuals,repairVisuals,validateDelivery,voicePacingMetrics,reviewVoicePacing} from '../worker/quriozity-quality.ts';
import {runVisualReviewStage,runVoiceReviews} from './quriozity/quality-reviews.mjs';
import * as THREE from 'three';
import {gasPixelMist,filledTeardropGeometry} from '../src/quriozity/models/onion-atmosphere.ts';
import {clipStaticSourcePlane} from '../src/quriozity/models/source-region.ts';
import {sceneSchema} from '../src/quriozity/schema.ts';
import {verifyStyleReference} from './quriozity/style-reference.mjs';
import {createHash} from 'node:crypto';
import {drawText,drawCaptions} from '../src/quriozity/text.ts';
import {onionDensityResponse} from '../src/quriozity/models/onion.ts';
import {applyStyleProfile} from '../src/quriozity/style-profile.ts';
import {planCameras,cameraProblems} from '../src/quriozity/camera-direction.ts';
import {transitionProblems} from '../src/quriozity/shot-transitions.ts';
import {defaultEnterAt} from '../src/quriozity/spec.ts';
import {planTransitions} from '../src/quriozity/shot-transitions.ts';
import {applyVisualPatches} from '../worker/quriozity-visual-patches.ts';

test('onion material opens dark recesses while keeping coherent dense illuminated planes',()=>{
 assert.equal(onionDensityResponse(.20),0);
 assert.ok(onionDensityResponse(.32)<.1,'Shadow-side reflectance must stay sparse');
 assert.ok(onionDensityResponse(.81)>1.2,'Lit flesh must reach dense coverage under the locked profile');
 const response=Array.from({length:101},(_,i)=>onionDensityResponse(i/100));
 assert.ok(response.every((v,i)=>Number.isFinite(v)&&v>=0&&v<=1.6&&(!i||v>=response[i-1])),'The response must be monotonic and bounded');
});

test('running captions remain above the bottom interface region of a portrait reel',()=>{
 const glyphs=[];const ctx={save(){},restore(){},fillRect(){},measureText:text=>({width:text.length*20}),fillText(text,x,y){glyphs.push({text,x,y});}};
 drawCaptions({ctx,t:1,dur:5,scene:{say:'These ingredients mix.',objects:[],words:[{text:'These',start:0,end:.2},{text:'ingredients',start:.3,end:.6},{text:'mix.',start:.7,end:.9}]},hue:'#382ef5',project:()=>null});
 assert.equal(glyphs.length,1);assert.ok(glyphs[0].y<=1920*.82,'Caption baseline must clear the bottom18%');assert.ok(glyphs[0].y>=1920*.72,'The running line remains in its lower caption band');
});

test('future captions show the whole phrase and invert only the spoken word, preserving saved typed captions',()=>{
 const glyphs=[],boxes=[],ctx={fillStyle:'',save(){},restore(){},measureText:text=>({width:text.length*20}),fillText(text,x,y){glyphs.push({text,x,y,color:this.fillStyle});},fillRect(x,y,width,height){boxes.push({x,y,width,height,color:this.fillStyle});}};
 const words=[{text:'These',start:0,end:.2},{text:'ingredients',start:.3,end:.6},{text:'mix.',start:.7,end:.9}];
 const tc={ctx,t:.04,dur:5,scene:{say:'These ingredients mix.',objects:[],words},hue:'#000000',backgroundColor:'#ffffff',captionStyle:'word-highlight',project:()=>null};
 for(const [t,word] of [[.04,'These'],[.3,'ingredients'],[.8,'mix.']]){
  glyphs.length=0;boxes.length=0;drawCaptions({...tc,t});
  assert.deepEqual(glyphs.map(g=>[g.text,g.color]),[['These ingredients mix.','#000000'],[word,'#ffffff']]);
  assert.equal(boxes.length,1);assert.equal(boxes[0].color,'#000000');
  assert.ok(boxes[0].x<glyphs[1].x&&boxes[0].x+boxes[0].width>glyphs[1].x+ctx.measureText(word).width,'The rectangle contains the complete spoken word');
 }
 glyphs.length=0;boxes.length=0;drawCaptions({...tc,t:.25});
 assert.equal(glyphs.length,1);assert.equal(glyphs[0].text,'These ingredients mix.');assert.equal(boxes.length,0,'No word is highlighted during a pause');
 glyphs.length=0;drawCaptions({...tc,captionStyle:undefined});assert.notEqual(glyphs[0].text,'These ingredients mix.','Existing saved reels retain progressive typing');
});

test('highlight boxes use dark knockout glyphs while adjacent headline text stays gray',()=>{
 const glyphs=[];
 const ctx={fillStyle:'',save(){},restore(){},translate(){},scale(){},fillRect(){},measureText:text=>({width:text.length*40,actualBoundingBoxAscent:70,actualBoundingBoxDescent:0}),fillText(text){glyphs.push({text,color:this.fillStyle});}};
 drawText({ctx,t:1,dur:5,scene:{say:'Why tears?',objects:[]},hue:'#382ef5',textColor:'#c5c5c5',project:()=>null},{text:'WHY TEARS?',style:'headline',highlight:'TEARS?',at:0,cps:32,erase:false,cursor:false,glitchOnLand:false});
 assert.deepEqual(glyphs,[{text:'WHY',color:'#c5c5c5'},{text:'TEARS?',color:'#0a0a0a'}]);
});

test('paper text uses black glyphs, white highlight knockouts and black running captions',()=>{
 const glyphs=[],ctx={fillStyle:'',save(){},restore(){},translate(){},scale(){},fillRect(){},measureText:text=>({width:text.length*20,actualBoundingBoxAscent:70,actualBoundingBoxDescent:0}),fillText(text){glyphs.push({text,color:this.fillStyle});}};
 const tc={ctx,t:1,dur:5,scene:{say:'White paper.',objects:[]},hue:'#000000',textColor:'#000000',backgroundColor:'#ffffff',project:()=>null};
 drawText(tc,{text:'BLACK INK',highlight:'INK',at:0,cps:60,erase:false,cursor:false,glitchOnLand:false});
 assert.deepEqual(glyphs,[{text:'BLACK',color:'#000000'},{text:'INK',color:'#ffffff'}]);
 glyphs.length=0;drawCaptions({...tc,scene:{...tc.scene,words:[{text:'White',start:0,end:.3},{text:'paper.',start:.4,end:.8}]}});
 assert.equal(glyphs[0].color,'#000000');
});

test('camera authoring schema enforces the actual engine fill limit for openings and events',()=>{
 const scene={say:'The eye becomes wet.',objects:[{id:'face',model:'neutral-tearing-face'}],camera:{angle:'front',fill:1.1}};
 assert.ok(sceneSchema.safeParse(scene).success);
 assert.ok(!sceneSchema.safeParse({...scene,camera:{...scene.camera,fill:1.12}}).success);
 assert.ok(!sceneSchema.safeParse({...scene,events:[{at:'wet',camera:{fill:1.2}}]}).success);
});

test('text authoring rejects normalized font sizes that silently become unreadable labels',()=>{
 const scene={say:'These ingredients mix.',objects:[{id:'hero',model:'led'}],text:[{text:'SIMPLIFIED',style:'tag',size:54}]};
 assert.ok(sceneSchema.safeParse(scene).success);
 assert.ok(!sceneSchema.safeParse({...scene,text:[{...scene.text[0],size:.04}]}).success);
});

test('source plane cuts crossing triangles cleanly and preserves interpolated UVs',()=>{
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,0,0,1,0,0,0,1,0],3));
 geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,.5,1],2));
 const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial()),root=new THREE.Group();root.add(mesh);
 clipStaticSourcePlane(root,new THREE.Plane(new THREE.Vector3(-1,0,0),0));
 const positions=mesh.geometry.getAttribute('position'),uv=mesh.geometry.getAttribute('uv');
 assert.ok(positions.count>=3,'The crossing triangle must be sliced, not dropped');
 let edge=false;for(let i=0;i<positions.count;i++){assert.ok(positions.getX(i)<=1e-7);if(Math.abs(positions.getX(i))<1e-7&&Math.abs(positions.getY(i))<1e-7){assert.ok(Math.abs(uv.getX(i)-.5)<1e-7);edge=true;}}
 assert.ok(edge,'The exact plane intersection must exist');assert.equal(geometry.getAttribute('position').count,3,'Cached source remains unchanged');
});

const good={passed:true,summary:'No evidenced defects remain.',findings:[]};
const bad={passed:false,summary:'The hero is cropped.',findings:[{scene:1,severity:'must-fix',problem:'Hero cropped',evidence:'S1 middle frame cuts off the anchor',change:'Widen framing'}]};
const catalogue={text:'led',assets:'',has:id=>id==='led'};
const reel=()=>planTransitions(planCameras(applyStyleProfile({version:1,series:'QURIOZITY',style:'reference-recording',title:'Light',beat:{period:0.6,phase:0},scenes:Array.from({length:8},(_,i)=>({say:`One two three four five six seven eight nine ten eleven twelve ${i}.`,duration:5,hue:'blue',objects:[{id:'hero',model:'led',scale:1}],words:[{text:'One',start:0.3,end:0.6}]}))})).spec).spec;
const patch=(path,value,scene=1)=>({patches:[{scene,path,op:'set',valueJson:JSON.stringify(value)}]});
const temporary=async fn=>{const dir=await mkdtemp(join(tmpdir(),'quriozity-quality-'));try{return await fn(dir);}finally{await rm(dir,{recursive:true,force:true});}};

test('pixel teardrops contain a filled interior rather than a hollow outline',()=>{
 const geometry=filledTeardropGeometry(1,1.6),material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),mesh=new THREE.Mesh(geometry,material);mesh.updateMatrixWorld(true);
 const inside=new THREE.Raycaster(new THREE.Vector3(0,-.3,1),new THREE.Vector3(0,0,-1));assert.ok(inside.intersectObject(mesh).length>0,'A ray through the drop interior must hit its filled face');
 const outside=new THREE.Raycaster(new THREE.Vector3(1.3,0,1),new THREE.Vector3(0,0,-1));assert.equal(outside.intersectObject(mesh).length,0);geometry.dispose();material.dispose();
});

test('gas mist uses tiny independent motes, preserves reverse seeking and respects reveal controls',()=>{
 const params={count:360,pixelSize:.005,spread:.06},ctx={params,seed:27,mat:opts=>{const material=new THREE.MeshStandardMaterial();material.userData.glow=opts?.glow??0;return material;},num:(k,f,min=-Infinity,max=Infinity)=>Math.max(min,Math.min(max,Number(params[k]??f)))};
 const built=gasPixelMist.build(ctx);
 assert.equal(built.root.children.length,360);
 assert.ok(built.root.children.every(m=>m.material.depthWrite===false),'Invisible-gas tracers must not cast depth-based occlusion patches');
 assert.ok(built.root.children.every(m=>m.material.userData.glow===0),'Gas glimmer must not enable the scene-wide halo sampler');
 const positions=()=>built.root.children.map(m=>[...m.position.toArray(),...m.scale.toArray(),m.visible]);
 built.update({progress:1,density:1},1);const first=positions();const xs=first.map(p=>p[0]),ys=first.map(p=>p[1]);const mx=xs.reduce((a,b)=>a+b,0)/xs.length,my=ys.reduce((a,b)=>a+b,0)/ys.length;const cov=xs.reduce((sum,x,i)=>sum+(x-mx)*(ys[i]-my),0),xx=xs.reduce((sum,x)=>sum+(x-mx)**2,0),yy=ys.reduce((sum,y)=>sum+(y-my)**2,0);assert.ok(Math.abs(cov/Math.sqrt(xx*yy))<.25,'Gas fills the surrounding air rather than a diagonal line');built.update({progress:1,density:1},4);assert.notDeepEqual(positions(),first);
 built.update({progress:1,density:1},1);assert.deepEqual(positions(),first,'Motion must depend on time rather than accumulated frames');
 for(const mote of built.root.children){mote.geometry.computeBoundingBox();const size=mote.geometry.boundingBox.getSize(new THREE.Vector3());assert.ok(Math.max(...size.toArray())<.01,'Gas must remain tiny motes rather than large balls');}
 built.update({progress:0,density:1},1);assert.ok(built.root.children.every(m=>!m.visible));
 built.update({progress:1,density:0},1);assert.ok(built.root.children.every(m=>!m.visible));
});

test('visual specialist verdict cannot pass while a must-fix finding remains',async()=>{
 let called;
 const result=await reviewVisuals(async(...args)=>{called=args;return JSON.stringify({...bad,passed:true});},reel(),[{mime:'image/png',base64:'frame'},{mime:'image/png',base64:'ref1'},{mime:'image/png',base64:'ref2'}],'real timed frames OWNER-APPROVED PERFECT STYLE REFERENCE',catalogue,'Follow the light',VISUAL_REVIEW_STAGES.at(-1));
 assert.equal(result.passed,false);assert.equal(called[0],'visual-final-review');
 assert.match(called[1],/ACTUAL spoken word timings/);assert.match(called[1],/real timed frames/);
 assert.equal(called[4][0].base64,'frame');
});

test('targeted visual repairs retain untouched scenes, narration and actual runtime timing',async()=>{
 const spec=reel();
 const result=await repairVisuals(async(_step,prompt,_max,format,_images,context)=>{
  assert.ok(!prompt.includes('"words":'));assert.ok(!prompt.includes('"scene":8,"duration":'));
  assert.equal(format.name,'quriozity_visual_patch');assert.match(context.prefix,/never rewrite a whole reel/);
  return JSON.stringify(patch('/objects/0/scale',.8));
 },spec,bad,catalogue,VISUAL_REVIEW_STAGES.at(-1),[]);
 assert.equal(result.valid,true,JSON.stringify(result.problems));
 assert.deepEqual(result.spec.beat,spec.beat);
 assert.deepEqual(result.spec.scenes.map(s=>[s.say,s.duration,s.words]),spec.scenes.map(s=>[s.say,s.duration,s.words]));
 assert.deepEqual(result.spec.scenes.slice(1),spec.scenes.slice(1));assert.equal(spec.scenes[0].objects[0].scale,1);
 assert.equal(result.spec.scenes[0].objects[0].scale,.8);
 const rejected=await repairVisuals(async()=>JSON.stringify(patch('/say','Extra.')),spec,bad,catalogue,VISUAL_REVIEW_STAGES[0],[]);
 assert.equal(rejected.valid,false);assert.ok(rejected.problems.some(p=>p.includes('Protected')));
});

test('planned 40ms camera cuts can pass through an authoring repair without invalid input',async()=>{
 const spec=reel();spec.scenes[0].camera={angle:'front',fill:.8};
 spec.scenes[0].events=[{at:2,camera:{angle:'side',fill:1.05},easing:'hold',dur:.04}];
 const result=await repairVisuals(async(_step,prompt)=>{
  const [{scene,...input}]=JSON.parse(prompt.split('Editable scenes: ')[1]);
  assert.equal(scene,1);assert.equal(input.events[0].dur,.05);
  assert.ok(sceneSchema.safeParse(input).success);
  return JSON.stringify(patch('/objects/0/scale',.9));
 },spec,bad,catalogue,VISUAL_REVIEW_STAGES[0],[]);
 assert.equal(result.valid,true,JSON.stringify(result.problems));
 assert.equal(result.spec.scenes[0].events[0].easing,'hold');
 assert.equal(spec.scenes[0].events[0].dur,.04,'Runtime input remains immutable');
});

test('visual patch boundaries reject protected fields, unsafe paths, missing parents and unrelated scenes',()=>{
 const spec=reel(),before=structuredClone(spec),allowed=new Set([1]);
 for(const path of ['/say','/duration','/words','/look','/raster/cell','/light/exposure','/objects/0/__proto__/polluted','/objects/0/constructor/prototype'])assert.throws(()=>applyVisualPatches(spec,patch(path,1),allowed));
 assert.throws(()=>applyVisualPatches(spec,patch('/objects/99/scale',1),allowed),/parent does not exist/);
 assert.throws(()=>applyVisualPatches(spec,patch('/objects/0/scale',1,2),allowed),/outside/);
 assert.throws(()=>applyVisualPatches(spec,{patches:[{scene:1,path:'/camera',op:'set',valueJson:'invalid JSON'}]},allowed));
 assert.deepEqual(spec,before);assert.equal({}.polluted,undefined);
});

test('patches can append/remove visual items and invalid resulting scenes cannot bypass validation',async()=>{
 const spec=reel(),allowed=new Set([1]);
 const appended=applyVisualPatches(spec,patch('/objects/-',{id:'second',model:'led'}),allowed).spec;
 assert.equal(appended.scenes[0].objects.length,2);
 const removed=applyVisualPatches(appended,{patches:[{scene:1,path:'/objects/1',op:'remove',valueJson:''}]},allowed).spec;
 assert.deepEqual(removed,spec);
 for(const proposal of [patch('/objects/0/model','missing-model'),patch('/text',[{text:'Too small',size:.04}]),patch('/objects',[])]){
  const result=await repairVisuals(async()=>JSON.stringify(proposal),spec,bad,catalogue,VISUAL_REVIEW_STAGES[0],[]);
  assert.equal(result.valid,false,JSON.stringify(proposal));
 }
});

test('a protected light patch is dropped while the rest of the repair survives',async()=>{
 const spec=reel();
 const result=await repairVisuals(async(_step,prompt,_max,_format,_images,context)=>{
  assert.match(context.prefix,/Only these scene fields are editable: camera, objects/);
  const [scene]=JSON.parse(prompt.split('Editable scenes: ')[1]);
  assert.ok(!scene.light?.exposure&&!scene.raster?.cell,'Locked profile fields are not offered as patch targets');
  return JSON.stringify({patches:[{scene:1,path:'/light/exposure',op:'set',valueJson:'1.3'},{scene:1,path:'/objects/0/scale',op:'set',valueJson:'0.8'}]});
 },spec,bad,catalogue,VISUAL_REVIEW_STAGES[3],[]);
 assert.equal(result.valid,true,JSON.stringify(result.problems));
 assert.equal(result.spec.scenes[0].objects[0].scale,.8);
 assert.equal(result.spec.scenes[0].light?.exposure,spec.scenes[0].light?.exposure);
 assert.deepEqual(result.dropped.map(d=>d.path),['/light/exposure']);assert.match(result.dropped[0].reason,/Protected/);
 assert.deepEqual(result.changes,['scene 1: set /objects/0/scale']);
});

test('a repair that introduces a jump cut keeps its other fixes and never ships the new camera conflict',async()=>{
 const spec=reel(),scene2={...bad,findings:[{...bad.findings[0],scene:2}]};
 const result=await repairVisuals(async()=>JSON.stringify({patches:[
  {scene:2,path:'/camera',op:'set',valueJson:JSON.stringify({angle:'three-quarter',fill:0.86})},
  {scene:2,path:'/objects/0/scale',op:'set',valueJson:'0.7'},
 ]}),spec,scene2,catalogue,VISUAL_REVIEW_STAGES[1],[]);
 assert.equal(result.valid,true,JSON.stringify(result.problems));
 assert.equal(result.spec.scenes[1].objects[0].scale,.7);
 assert.deepEqual([...cameraProblems(result.spec),...transitionProblems(result.spec)],[]);
 assert.ok(result.adjustments.length||result.dropped.some(d=>d.path==='/camera'),'The conflict is resolved visibly, not silently');
 assert.deepEqual(result.spec.scenes.filter((_s,i)=>i!==1),spec.scenes.filter((_s,i)=>i!==1),'Untouched scenes keep their reviewed shots');
});

test('problems that existed before a repair do not block an unrelated valid fix',async()=>{
 const spec=reel();spec.scenes[1].camera=structuredClone(spec.scenes[0].camera);
 const before=[...cameraProblems(spec),...transitionProblems(spec)];assert.ok(before.length);
 const result=await repairVisuals(async()=>JSON.stringify(patch('/objects/0/scale',.85,5)),spec,{...bad,findings:[{...bad.findings[0],scene:5}]},catalogue,VISUAL_REVIEW_STAGES[0],[]);
 assert.equal(result.valid,true,JSON.stringify(result.problems));assert.equal(result.spec.scenes[4].objects[0].scale,.85);
});

test('hard-cut entrances are on screen from the first frame of their scene',()=>{
 assert.equal(defaultEnterAt('cut',0,5),0);assert.equal(defaultEnterAt('cut',3,5),0);
 assert.equal(defaultEnterAt('materialize',0,5),.08);assert.ok(Math.abs(defaultEnterAt('materialize',2,5)-.32)<1e-9);
});

test('the single accepted visual repair is rendered and reviewed again',()=>temporary(async workdir=>{
 const seen=[],feedback=[];let repairs=0,checks=0,result;
 const options={spec:{scale:1},stage:VISUAL_REVIEW_STAGES[0],workdir,
  renderEvidence:async spec=>{seen.push(spec.scale);return {files:['sheet.png']};},
  review:async()=>++checks===1?bad:good,
  repair:async(_s,_r,_stage,_e,f)=>{feedback.push(f);repairs++;return {valid:true,spec:{scale:0.8}};},
  onResult:async r=>{result=r;}};
 assert.deepEqual(await runVisualReviewStage(options),{scale:0.8});
 assert.deepEqual(seen,[1,0.8]);assert.equal(checks,2);assert.equal(repairs,1);
 assert.equal(result.attempts.length,2);assert.notEqual(result.attempts[0].beforeHash,result.attempts[0].afterHash);
 assert.equal(JSON.parse(await readFile(join(result.attempts[0].directory,'spec.after.json'),'utf8')).scale,0.8);
 await runVisualReviewStage({...options,review:async()=>{throw new Error('Matching review cache should resume');}});
 assert.equal(checks,2);
 await runVisualReviewStage({...options,spec:{scale:0.7},review:async()=>{checks++;return good;}});
 assert.equal(checks,3,'Changed input must receive a new review');
 await runVisualReviewStage({...options,context:{thread:'A revised explanation'},review:async()=>{checks++;return good;}});
 assert.equal(checks,4,'A changed review brief must not inherit an old verdict');
}));

test('initial version and one repair select the best reviewed version without further calls',()=>temporary(async workdir=>{
 let checks=0,renders=0,repairs=0,result;
 const options={spec:{revision:0},stage:VISUAL_REVIEW_STAGES[1],workdir,
  renderEvidence:async s=>{renders++;return {files:[`frame-${s.revision}.png`]};},review:async s=>{checks++;return {...bad,findings:Array.from({length:s.revision===1?1:3},()=>({...bad.findings[0]}))};},
  repair:async s=>{repairs++;return {valid:true,spec:{revision:s.revision+1}};},onResult:async r=>{result=r;}};
 const selected=await runVisualReviewStage(options);
 assert.equal(checks,2);assert.equal(renders,2);assert.equal(repairs,1);assert.equal(result.attempts.length,2);
 assert.deepEqual(selected,{revision:1});assert.equal(result.selectedAttempt,2);assert.equal(result.passed,false);
 assert.deepEqual(result.attempts[1].evidence,['frame-1.png']);
 const root=join(workdir,'reviews',VISUAL_REVIEW_STAGES[1].id),[hash]=await readdir(root);
 const files=await readdir(join(root,hash));assert.ok(files.includes('failure.json'));assert.ok(files.includes('selected-best.json'));assert.ok(!files.includes('accepted.json'));
 assert.deepEqual(await runVisualReviewStage(options),selected);
 assert.equal(checks,2);assert.equal(renders,2);assert.equal(repairs,1);
}));

test('one invalid repair proposal retains the reviewed candidate without another paid attempt',()=>temporary(async workdir=>{
 let proposals=0,result;
 const selected=await runVisualReviewStage({spec:{revision:0},stage:VISUAL_REVIEW_STAGES[0],workdir,
  renderEvidence:async()=>({files:['frame.png']}),review:async()=>bad,
  repair:async()=>{proposals++;return {valid:false,problems:['Invalid scene authoring']};},onResult:async r=>{result=r;}});
 assert.equal(proposals,1);assert.deepEqual(selected,{revision:0});assert.equal(result.passed,false);assert.equal(result.selectedBest,true);
 assert.equal(result.attempts.length,1);assert.match(result.error,/no valid repair/);
 const files=await readdir(result.attempts[0].directory);
 assert.equal(files.filter(name=>/^repair-\d+\.json$/.test(name)).length,1);
 assert.deepEqual(result.attempts[0].verdict,bad);
}));

test('a diagnostic review records failures without approving or authoring further repairs',()=>temporary(async workdir=>{
 let checks=0;
 await assert.rejects(runVisualReviewStage({spec:{revision:2},stage:VISUAL_REVIEW_STAGES[1],workdir,maxRenderedReviews:1,onExhaustion:'stop',
  renderEvidence:async()=>({files:['actual-frame.png']}),review:async()=>{checks++;return bad;},
  repair:async()=>{throw new Error('Known-unapproved diagnostics must preserve the visual version');}}),error=>{
   assert.equal(error.reviewFailure.passed,false);assert.equal(error.reviewFailure.attempts.length,1);return true;
  });
 assert.equal(checks,1);
}));

test('raising the visual cap resumes the latest reviewed candidate and retains the earlier attempts',()=>temporary(async workdir=>{
 let checks=0;
 const options={spec:{revision:0},stage:VISUAL_REVIEW_STAGES[0],workdir,renderEvidence:async()=>({files:['frame.png']}),
  review:async s=>{checks++;return s.revision>=3?good:bad;},repair:async s=>({valid:true,spec:{revision:s.revision+1}})};
 await assert.rejects(runVisualReviewStage({...options,maxRenderedReviews:3,onExhaustion:'stop'}),/after 3/);
 let result;
 const selected=await runVisualReviewStage({...options,maxRenderedReviews:5,onResult:async r=>{result=r;}});
 assert.deepEqual(selected,{revision:3});assert.equal(checks,4);assert.equal(result.attempts.length,4);assert.equal(result.passed,true);
 assert.equal(JSON.parse(await readFile(join(result.attempts[0].directory,'spec.before.json'),'utf8')).revision,0);
 assert.ok(result.attempts[2].repairDirectory.includes('resume-after-3'));
}));

const text=Array.from({length:24},(_,i)=>`word${i+1}${i===11||i===23?'.':''}`).join(' ');
const delivery=()=>({text,notes:'Calm and conversational.',pauses:[{afterWord:12,minSeconds:0.3,why:'Thought boundary'}]});
function alignment({step=0.4,pause=0.4}={}){let t=0;const words=text.split(' ').map((word,i)=>{if(i===12)t+=pause;const start=t;t+=step;return {text:word,start,end:t-0.04};});return {words,total:t+0.2};}

test('voice delivery may adjust punctuation but cannot rewrite or merge spoken words',()=>{
 assert.equal(validateDelivery({...delivery(),text:text.replace('word1 ','word1, ')},text).text,text.replace('word1 ','word1, '));
 assert.throws(()=>validateDelivery({...delivery(),speed:.72},text),/speed/);
 assert.throws(()=>validateDelivery({...delivery(),text:text.replace('word1 ','different ')},text),/preserve every spoken word/);
 assert.throws(()=>validateDelivery({...delivery(),text:text.replace('word1 word2','word1-word2')},text),/word boundary/);
});

test('word-rate measurements stay descriptive while missing thought boundaries are detected',()=>{
 const calm=alignment(),normal=voicePacingMetrics(calm.words,calm.total,delivery());assert.deepEqual(normal.problems,[]);
 const fast=alignment({step:0.2,pause:0}),rushed=voicePacingMetrics(fast.words,fast.total,delivery());
 assert.ok(rushed.wpm>200);assert.ok(rushed.fastestPhraseWpm>200);assert.ok(!rushed.problems.some(p=>p.includes('WPM')));assert.ok(rushed.problems.some(p=>p.includes('Missing thought boundary')));
 const noBreath=alignment({step:0.4,pause:0}),missing=voicePacingMetrics(noBreath.words,noBreath.total,delivery());
 assert.ok(missing.problems.some(p=>p.includes('Missing thought boundary')));assert.ok(!missing.problems.some(p=>p.includes('Average')));
 assert.throws(()=>voicePacingMetrics(calm.words.slice(1),calm.total,delivery()),/alignment must match/);
});

test('voice reviewer sees actual timings and cannot override a measured failure',async()=>{
 const fast=alignment({step:0.2,pause:0}),metrics=voicePacingMetrics(fast.words,fast.total,delivery());
 const verdict=await reviewVoicePacing(async(step,prompt)=>{
  assert.equal(step,'voice-pacing-review');assert.match(prompt,/no audio is attached/);assert.ok(prompt.includes(String(metrics.wpm)));
  return JSON.stringify({passed:true,summary:'Pass',issues:[],nextDelivery:delivery()});
 },text,delivery(),metrics);
 assert.equal(verdict.passed,false);assert.match(verdict.evidence,/no audio listening/);
});

test('timing retakes preserve provider-default speed and retain the actual takes',()=>temporary(async workdir=>{
 let checks=0;const settings=[];let accepted;
 const audio=join(workdir,'fixture.wav');await writeFile(audio,'fixture audio');
 const options={text,workdir,reviewDelivery:async()=>delivery(),
  narrate:async(d,take)=>{settings.push(d.speed);return {audio,...alignment(take===1?{step:0.2,pause:0}:{})};},
  reviewPacing:async(_text,d)=>{checks++;return {passed:true,summary:'Reviewed timing evidence',issues:[],nextDelivery:{...d}};},
  onResult:async r=>{accepted=r;}};
 const voice=await runVoiceReviews(options);assert.ok(voice.total>9);assert.equal(checks,2);assert.ok(settings.every(s=>s===undefined),'Review/retakes must never introduce a speed override');
 assert.equal(accepted.attempts.length,2);assert.match(accepted.evidence,/no audio listening/);
 assert.equal(await readFile(accepted.attempts[0].audio,'utf8'),'fixture audio');
 await runVoiceReviews({...options,reviewPacing:async()=>{throw new Error('Identical reviewed audio should resume');}});
 assert.equal(checks,2);
 // A changed waveform cannot inherit a previous voice verdict even with identical timing metadata.
 await writeFile(audio,'changed audio');
 await runVoiceReviews(options);assert.equal(checks,4);
 const root=join(workdir,'reviews','voice'),[hash]=await readdir(root);
 assert.equal((await readdir(join(root,hash))).filter(name=>name.startsWith('run-')).length,2,'A rerun preserves the first run and its takes');
}));

test('three imperfect voice takes select the best measured timing while retaining every take and warning',()=>temporary(async workdir=>{
 const audio=join(workdir,'fixture.wav');let takes=0,result;
 const options={text,workdir,reviewDelivery:async()=>delivery(),
  narrate:async()=>{takes++;await writeFile(audio,`take${takes}`);return {audio,...alignment(takes===2?{step:.3,pause:.4}:{step:.2,pause:0})};},
  reviewPacing:async(_t,d)=>({passed:false,summary:'Too fast',issues:['Rushed'],nextDelivery:{...d}}),onResult:async r=>{result=r;}};
 const voice=await runVoiceReviews(options);
 assert.equal(takes,3);assert.equal(result.attempts.length,3);assert.equal(result.passed,false);assert.equal(result.selectedTake,2);assert.equal(await readFile(voice.audio,'utf8'),'take2');
 const root=join(workdir,'reviews','voice'),[hash]=await readdir(root),files=await readdir(join(root,hash));
 assert.ok(files.includes('failure.json'));assert.ok(files.includes('selected-best.json'));assert.ok(!files.includes('accepted.json'));
 await runVoiceReviews({...options,narrate:async()=>{throw new Error('Selected reviewed take must resume without paying again');}});
}));

test('raising the voice cap keeps the earlier takes and generates only the extra reviewed take',()=>temporary(async workdir=>{
 const audio=join(workdir,'fixture.wav');await writeFile(audio,'voice');let calls=0;
 const options={text,workdir,reviewDelivery:async()=>delivery(),narrate:async(_d,take)=>{calls++;return {audio,...alignment(take>=3?{}:{step:.2,pause:0})};},
  reviewPacing:async(_t,d,metrics)=>({passed:!metrics.problems.length,summary:'Timing',issues:metrics.problems,nextDelivery:d})};
 await assert.rejects(runVoiceReviews({...options,maxTakes:2,onExhaustion:'stop'}),/after 2 takes/);
 let selected;await runVoiceReviews({...options,maxTakes:5,onResult:async r=>{selected=r;}});
 assert.equal(calls,3);assert.equal(selected.attempts.length,3);assert.equal(selected.take,3);assert.equal(selected.passed,true);
}));


test('style comparison is required and cannot pass without the actual owner reference evidence',async()=>{
 const style=VISUAL_REVIEW_STAGES.find(s=>s.id==='visual-style-reference-review');assert.ok(style);
 let calls=0;
 await assert.rejects(reviewVisuals(async()=>{calls++;return JSON.stringify(good);},reel(),[],'reel only',catalogue,'',style),/owner style-reference evidence is required/);
 assert.equal(calls,0);
 await reviewVisuals(async(step,prompt,_max,_format,images)=>{calls++;assert.equal(step,style.id);assert.match(prompt,/PERFECT/);assert.match(prompt,/sparse shadow dots/);assert.match(prompt,/motion strips/);assert.equal(images.length,3);return JSON.stringify(good);},reel(),Array.from({length:3},()=>({mime:'image/png',base64:'image'})),'OWNER-APPROVED PERFECT STYLE REFERENCE plus matched reel frames',catalogue,'',style);
 assert.equal(calls,1);
});


test('the perfect style reference is pinned by content and cannot silently change',()=>temporary(async dir=>{
 const file=join(dir,'owner.mov'),bytes='test reference recording';await writeFile(file,bytes);
 const expected=createHash('sha256').update(bytes).digest('hex');assert.equal(await verifyStyleReference(file,expected),expected);
 await writeFile(file,'another recording');await assert.rejects(verifyStyleReference(file,expected),/checksum mismatch/);
 await assert.rejects(verifyStyleReference(join(dir,'missing.mov'),expected),/Required owner-approved style reference is unavailable/);
}));

test('one Opus repair per stage persists across restarts, with no shared total limit',()=>temporary(async workdir=>{
 const {opusRepairBudget}=await import('./quriozity/repair-budget.mjs');
 const reserve=await opusRepairBudget(workdir);
 for(const stage of ['visual-realization',...VISUAL_REVIEW_STAGES.map(s=>s.id)])await reserve(`${stage}-repair`);
 for(const stage of ['visual-realization',...VISUAL_REVIEW_STAGES.map(s=>s.id)])await assert.rejects((await opusRepairBudget(workdir))(`${stage}-repair`),{code:'opus_stage_repair_limit'});
 assert.equal((await readdir(join(workdir,'repair-budget','stages'))).length,6,'All six stages retain their independent allowance');
}));

test('concurrent callers reserve at most one Opus repair for the same stage',()=>temporary(async workdir=>{
 const {opusRepairBudget}=await import('./quriozity/repair-budget.mjs');
 const a=await opusRepairBudget(workdir),b=await opusRepairBudget(workdir);
 const calls=await Promise.allSettled(Array.from({length:8},(_,i)=>(i%2?a:b)('visual-subject-review-repair')));
 assert.equal(calls.filter(c=>c.status==='fulfilled').length,1);
 assert.ok(calls.filter(c=>c.status==='rejected').every(c=>c.reason.code==='opus_stage_repair_limit'));
}));

test('legacy global reservations retain their stage spend without imposing a new total cap',()=>temporary(async workdir=>{
 const {opusRepairBudget}=await import('./quriozity/repair-budget.mjs');
 const dir=join(workdir,'repair-budget');await mkdir(dir,{recursive:true});
 await writeFile(join(dir,'baseline.json'),JSON.stringify({historical:0,limit:5}));
 for(let slot=1;slot<=5;slot++)await writeFile(join(dir,`call-${slot}.json`),JSON.stringify({slot,step:'visual-subject-review-repair'}));
 const reserve=await opusRepairBudget(workdir);
 await assert.rejects(reserve('visual-subject-review-repair'),{code:'opus_stage_repair_limit'});
 await reserve('visual-final-review-repair');
 assert.equal((await readdir(dir)).filter(f=>f.startsWith('call-')).length,5,'Historical evidence remains intact');
}));

test('every visual stage gets one Opus repair and never falls back to Sol',()=>temporary(async workdir=>{
 const {opusRepairBudget,solRepairBudget}=await import('./quriozity/repair-budget.mjs');
 const {routeQuriozityClients}=await import('../worker/quriozity-model-client.ts');
 const opus=await opusRepairBudget(workdir),sol=await solRepairBudget(workdir),requests={opus:0,sol:0},results=[];
 const ask=routeQuriozityClients(async(step,input)=>{await opus(step);requests.opus++;return input;},async(step,input)=>{await sol(step);requests.sol++;return input;});
 const options={spec:{revision:0},workdir,renderEvidence:async s=>({files:[`frame-${s.revision}.png`]}),review:async()=>bad,
  repair:async(s,_verdict,stage)=>({valid:true,spec:JSON.parse(await ask(`${stage.id}-repair`,JSON.stringify({revision:s.revision+1}),0))}),onResult:async r=>results.push(r)};
 for(const stage of VISUAL_REVIEW_STAGES)await runVisualReviewStage({...options,stage});
 assert.deepEqual(requests,{opus:5,sol:0});assert.ok(results.every(r=>r.attempts.length===2&&r.passed===false&&r.selectedBest));
 await runVisualReviewStage({...options,stage:VISUAL_REVIEW_STAGES[0]});assert.deepEqual(requests,{opus:5,sol:0});
 await assert.rejects(sol('visual-subject-review-repair'),{code:'visual_repairs_exhausted'});
}));

 test('Sol usage from before the new policy is retained without counting new reservations twice',()=>temporary(async workdir=>{
 const {solRepairBudget}=await import('./quriozity/repair-budget.mjs');
 await writeFile(join(workdir,'usage.jsonl'),JSON.stringify({model:'gpt-6.1-sol',step:'storyboard-repair'})+'\n');
 await (await solRepairBudget(workdir))('storyboard-repair');
 await writeFile(join(workdir,'usage.jsonl'),JSON.stringify({model:'gpt-6.1-sol',step:'storyboard-repair'})+'\n',{flag:'a'});
 await (await solRepairBudget(workdir))('storyboard-repair');
 await assert.rejects((await solRepairBudget(workdir))('storyboard-repair'),{code:'sol_stage_repair_limit'});
}));

test('upgrading Sol retains repair usage from both model versions in the same stage budget',()=>temporary(async workdir=>{
 const {solRepairBudget}=await import('./quriozity/repair-budget.mjs');
 const rows=['gpt-6.1-sol','gpt-6.2-sol'].map(model=>({model,step:'storyboard-repair'}));
 await writeFile(join(workdir,'usage.jsonl'),rows.map(row=>JSON.stringify(row)+'\n').join(''));
 await (await solRepairBudget(workdir))('storyboard-repair');
 await assert.rejects((await solRepairBudget(workdir))('storyboard-repair'),{code:'sol_stage_repair_limit'});
 await (await solRepairBudget(workdir))('script-repair');
}));

test('disabling Sol visual repair fallback preserves older reservations without new requests',()=>temporary(async workdir=>{
 const {solRepairBudget}=await import('./quriozity/repair-budget.mjs');
 const folder=join(workdir,'repair-budget','stages','visual-subject-review');
 await mkdir(folder,{recursive:true});
 const records=Array.from({length:5},(_,i)=>JSON.stringify({provider:'sol',stage:'visual-subject-review',step:'visual-subject-review-repair',slot:i+1}));
 for(const [i,record] of records.entries())await writeFile(join(folder,`sol-${i+1}.json`),record);
 const reserve=await solRepairBudget(workdir);
 await assert.rejects(reserve('visual-subject-review-repair'),{code:'visual_repairs_exhausted'});
 await assert.rejects((await solRepairBudget(workdir))('visual-subject-review-repair'),{code:'visual_repairs_exhausted'});
 assert.deepEqual((await readdir(folder)).sort(),records.map((_,i)=>`sol-${i+1}.json`));
 for(const [i,record] of records.entries())assert.equal(await readFile(join(folder,`sol-${i+1}.json`),'utf8'),record);
 // A fresh stage gets only its own three calls, even when older stages exceeded the new cap.
 await assert.rejects(reserve('visual-final-review-repair'),{code:'visual_repairs_exhausted'});
 for(let i=0;i<3;i++)await reserve('storyboard-repair');
 await assert.rejects(reserve('storyboard-repair'),{code:'sol_stage_repair_limit'});
}));
