// One labelled reel showing every object effect, darkness entrance/exit, scene transition and morph style.
//   node scripts/acryllex/fx-showcase.mjs <out.mp4|out.json>
import {writeFile} from 'node:fs/promises';
import {renderVideo} from './render.mjs';
const out=process.argv[2];if(!out)throw new Error('Usage: fx-showcase.mjs <out.mp4|out.json>');
const S=[];
const scene=(label,sub,hue,objects,events=[],extra={})=>S.push({say:label,hue,duration:extra.duration??2.6,camera:{angle:'three-quarter',fill:0.6,move:'static',screenY:0.56},objects,events,text:[{text:label,style:'headline',pos:'top',at:0.05,erase:false},{text:sub,style:'mono',pos:[0.5,0.19],align:'center',at:0.1,erase:false}],...extra});
const obj=(model,more={})=>({id:'m',model,enter:'none',idle:'none',...more});
// object effects
for(const [fx,model,hue,more] of [['heartbeat','heart','red',{fxCount:2}],['shockwave','cube','blue',{}],['ripple','raindrop','cyan',{}],['shake','alarm_clock_01','amber',{}],['recoil','cube','violet',{fxFrom:'left'}],['glint','smartphone','white',{}],['scan','brain','cyan',{}],['charge','led','amber',{}],['glitch','laptop','green',{}]])
 scene(fx.toUpperCase(),'object effect',hue,[obj(model)],[{at:0.6,target:'m',fx,...more}]);
// darkness entrances / exits
for(const [kind,model,hue] of [['from-black','heart','red'],['light-up','brain','cyan']])
 scene(kind.toUpperCase(),'entrance',hue,[obj(model,{enter:kind,enterAt:0.4})]);
for(const [kind,model,hue] of [['to-black','alarm_clock_01','amber']])
 scene(kind.toUpperCase(),'exit',hue,[obj(model,{exit:kind,exitAt:0.9})]);
// scene transitions (each scene is entered with its transition)
for(const [tr,model,hue] of [['black','earth','blue'],['blink','light_bulb','amber'],['push-right','smartphone','white'],['glitch','laptop','green']])
 scene(tr.toUpperCase(),'scene transition',hue,[obj(model,{idle:'turn'})],[],{transition:tr});
// morphs
for(const [style,a,b,hue] of [['particles','abacus','calculator','cyan'],['blob','cube','earth','blue'],['blob','heart','brain','red'],['flip','smartphone','calculator','white'],['fade','alarm_clock_01','light_bulb','amber']])
 scene(`${style.toUpperCase()} MORPH`,`${a.replace(/_01$/,'').replace('_',' ')} → ${b.replace('_',' ')}`,hue,[obj(a),{id:'b',model:b,enter:'none',idle:'none'}],[{at:0.6,target:'m',morph:'b',morphStyle:style,dur:1.3}],{duration:2.8});
const spec={version:1,series:'ACRYLLEX',title:'ACRYLLEX effects showcase',captions:false,scenes:S};
if(out.endsWith('.json'))await writeFile(out,JSON.stringify(spec,null,1));
else{const info=await renderVideo(spec,out);console.log(`Wrote ${out} (${S.length} scenes, ${info.duration.toFixed(1)} s)`);}
