// Labelled showcase reels of the ACRYLLEX effect library.
//   node scripts/acryllex/fx-showcase.mjs effects     <out.mp4|out.json>   every one-shot object effect
//   node scripts/acryllex/fx-showcase.mjs transitions <out.mp4|out.json>   scene transitions, darkness entrances/exits and morphs, all on the earth globe
//   node scripts/acryllex/fx-showcase.mjs all         <out.mp4|out.json>
import {writeFile} from 'node:fs/promises';
import {renderVideo} from './render.mjs';
const [mode,out]=process.argv.slice(2);
if(!['effects','transitions','all'].includes(mode)||!out)throw new Error('Usage: fx-showcase.mjs effects|transitions|all <out.mp4|out.json>');
const S=[];
const scene=(label,sub,hue,objects,events=[],extra={})=>S.push({say:label,hue,duration:extra.duration??2.6,camera:{angle:extra.angle??'three-quarter',fill:0.6,move:'static',screenY:0.56},objects,events,text:[{text:label,style:'headline',pos:'top',at:0.05,erase:false},{text:sub,style:'mono',pos:[0.5,0.19],align:'center',at:0.1,erase:false}],...extra.scene});
const obj=(model,more={})=>({id:'m',model,enter:'none',idle:'none',...more});

if(mode!=='transitions')
 for(const [fx,hue,more] of [['heartbeat','red',{fxCount:2}],['shockwave','blue',{}],['ripple','cyan',{}],['shake','amber',{}],['recoil','violet',{fxFrom:'left'}],['glint','white',{}],['scan','cyan',{}],['charge','amber',{}],['glitch','green',{}]])
  scene(fx.toUpperCase(),'object effect',hue,[obj('earth')],[{at:0.6,target:'m',fx,...more}]);

if(mode!=='effects'){
 const globe=(more={})=>obj('earth',{idle:'turn',...more});
 // scene transitions: every scene is the globe; hue and angle change so the cut itself is visible
 const looks=[['blue','three-quarter'],['cyan','three-quarter-left'],['green','front'],['violet','three-quarter'],['amber','three-quarter-left'],['red','front'],['white','three-quarter']];
 ['cut','black','blink','push-right','glitch','wipe','flash'].forEach((tr,i)=>{const [hue,angle]=looks[i%looks.length];
  scene(tr.toUpperCase(),i===0?'scene transition (hard cut)':'scene transition',hue,[globe()],[],{angle,scene:{transition:tr}});});
 scene('FROM-BLACK','entrance','blue',[globe({enter:'from-black',enterAt:0.4})]);
 scene('LIGHT-UP','entrance','cyan',[globe({enter:'light-up',enterAt:0.4})]);
 scene('TO-BLACK','exit','green',[globe({exit:'to-black',exitAt:0.9})]);
 for(const [style,hue] of [['particles','blue'],['blob','cyan'],['flip','violet'],['fade','amber']])
  scene(`${style.toUpperCase()} MORPH`,'earth → desk globe',hue,[globe({idle:'none'}),{id:'b',model:'desk-globe',enter:'none',idle:'none'}],[{at:0.6,target:'m',morph:'b',morphStyle:style,dur:1.3}],{duration:2.8});
}

const spec={version:1,series:'ACRYLLEX',title:`ACRYLLEX ${mode} showcase`,captions:false,scenes:S};
if(out.endsWith('.json'))await writeFile(out,JSON.stringify(spec,null,1));
else{const info=await renderVideo(spec,out);console.log(`Wrote ${out} (${S.length} scenes, ${info.duration.toFixed(1)} s)`);}
