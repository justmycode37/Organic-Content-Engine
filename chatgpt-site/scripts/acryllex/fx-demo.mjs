// Contact sheet / clip of object effects, entrances/exits, scene transitions and morphs.
//   node scripts/acryllex/fx-demo.mjs sheet <out.png> [item ...]
//   node scripts/acryllex/fx-demo.mjs video <out.mp4> [item ...]
// item: <effect>[:model[:hue]]          one-shot effect, e.g. heartbeat:heart:red
//       in/<enter>[:model[:hue]]        entrance, e.g. in/from-black:cube
//       out/<exit>[:model[:hue]]        exit, e.g. out/to-black:brain
//       tr/<transition>[:model[:hue]]   scene transition into this item (previous item's scene goes out)
//       morph/<style>[:modelA[:hue[:modelB]]]  object-to-object morph
import {stills,renderVideo} from './render.mjs';
const [action,out,...items]=process.argv.slice(2);
if(!['sheet','video'].includes(action)||!out)throw new Error('Usage: fx-demo.mjs sheet|video <out> [item ...]');
export const EFFECTS=['heartbeat:heart:red','shockwave:cube:blue','ripple:raindrop:cyan','shake:alarm_clock_01:amber','recoil:cube:violet','glint:smartphone:white','scan:brain:cyan','charge:led:amber','glitch:laptop:green'];
const LEN=Number(process.env.ACX_LEN||2.6),AT=0.5,FRAMES=Number(process.env.ACX_FRAMES||6);
const list=(items.length?items:EFFECTS).map(s=>{const [head,model='cube',hue='blue',modelB='egg']=s.split(':');const [type,name]=head.includes('/')?head.split('/'):['fx',head];return {type,name,model,hue,modelB,label:head};});
const scenes=list.map(({type,name,model,hue,modelB,label})=>{
 const sc={say:label,hue,duration:LEN,camera:{angle:'three-quarter',fill:0.62,move:'static'},objects:[{id:'m',model,enter:'none',idle:'none'}],events:[]};
 if(type==='fx')sc.events.push({at:AT,target:'m',fx:name});
 if(type==='in')Object.assign(sc.objects[0],{enter:name,enterAt:AT});
 if(type==='out')Object.assign(sc.objects[0],{exit:name,exitAt:AT});
 if(type==='tr')sc.transition=name;
 if(type==='morph'){sc.objects.push({id:'b',model:modelB,enter:'none',idle:'none'});sc.events.push({at:AT,target:'m',morph:'b',morphStyle:name,dur:1.2});}
 return sc;
});
const spec={version:1,series:'ACRYLLEX',title:'fx demo',captions:false,scenes};
if(action==='video'){await renderVideo(spec,out);console.log(`Wrote ${out}`);}
else{
 const times=[],labels=[],span=Number(process.env.ACX_SPAN||1.1);
 list.forEach((x,i)=>{for(let k=0;k<FRAMES;k++){const lt=x.type==='tr'?-0.45+k*(0.9/(FRAMES-1)):AT+0.02+k*(span/(FRAMES-1));times.push(Math.max(0,i*LEN+lt));labels.push(`${x.label} ${lt.toFixed(2)}`);}});
 await stills(spec,out,times,Number(process.env.ACX_SCALE||0.22),labels,FRAMES);console.log(`Wrote ${out}`);
}
