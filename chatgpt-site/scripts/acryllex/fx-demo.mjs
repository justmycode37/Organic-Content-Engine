// Contact sheet / clip of object effects, transitions and morphs, one scene per item.
//   node scripts/acryllex/fx-demo.mjs sheet <out.png> [effect[:model[:hue]] ...]    frames across each effect
//   node scripts/acryllex/fx-demo.mjs video <out.mp4> [effect[:model[:hue]] ...]
import {stills,renderVideo} from './render.mjs';
const [action,out,...items]=process.argv.slice(2);
if(!['sheet','video'].includes(action)||!out)throw new Error('Usage: fx-demo.mjs sheet|video <out> [effect[:model[:hue]] ...]');
const ALL=['heartbeat:heart:red','shockwave:cube:blue','ripple:raindrop:cyan','shake:alarm_clock_01:amber','squash:cube:green','recoil:cube:violet','hop:cube:orange','glint:smartphone:white','scan:brain:cyan','charge:led:amber','flicker:light_bulb:amber','glitch:laptop:green'];
const list=(items.length?items:ALL).map(s=>{const [fx,model='cube',hue='blue']=s.split(':');return {fx,model,hue};});
const LEN=2.6,AT=0.5,FRAMES=Number(process.env.ACX_FRAMES||6);
const scenes=list.map(({fx,model,hue})=>({say:fx,hue,duration:LEN,camera:{angle:'three-quarter',fill:0.62,move:'static'},objects:[{id:'m',model,enter:'none',idle:'none'}],events:[{at:AT,target:'m',fx}]}));
const spec={version:1,series:'ACRYLLEX',title:'fx demo',captions:false,scenes};
if(action==='video'){await renderVideo(spec,out);console.log(`Wrote ${out}`);}
else{
 const times=[],labels=[];
 list.forEach((x,i)=>{for(let k=0;k<FRAMES;k++){const lt=AT+0.02+k*(Number(process.env.ACX_SPAN||1.1)/(FRAMES-1));times.push(i*LEN+lt);labels.push(`${x.fx} ${lt.toFixed(2)}`);}});
 await stills(spec,out,times,Number(process.env.ACX_SCALE||0.22),labels,FRAMES);console.log(`Wrote ${out}`);
}
