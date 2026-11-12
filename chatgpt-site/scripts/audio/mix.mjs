const seconds=value=>Math.max(0,value).toFixed(3);

/** Build the voice and effects buses before a measured, two-pass loudness master. */
export function buildMixGraph(cues,duration){
 const groups={voice:[],effects:[]},filters=[];
 cues.forEach((cue,index)=>{
  const kind=cue.kind==='voice'?'voice':'effects',gain=cue.gain??1,delay=Math.round(cue.at*1000);
  const trim=cue.length?`atrim=0:${seconds(cue.length)},afade=t=out:st=${seconds(cue.length-.15)}:d=0.15,`:'';
  filters.push(`[${index}:a]${trim}aresample=48000,aformat=channel_layouts=stereo,volume=${gain},adelay=${delay}:all=1[cue${index}]`);
  groups[kind].push(`[cue${index}]`);
 });
 const makeBus=(name,items)=>{
  if(!items.length)return null;
  const output=`${name}bus`;
  filters.push(`${items.join('')}amix=inputs=${items.length}:normalize=0:dropout_transition=0,apad=whole_dur=${seconds(duration)},atrim=0:${seconds(duration)}[${output}]`);
  return output;
 };
 const voice=makeBus('voice',groups.voice),effects=makeBus('effects',groups.effects),mixInputs=[];
 const protectedEffects=voice&&effects?'protectedEffects':effects;
 if(voice&&effects){
  // A gentle voice-keyed 2-4 dB starting reduction protects sustained/noisy effects.
  filters.push('['+effects+']['+voice+']sidechaincompress=threshold=0.08:ratio=1.6:attack=10:release=120:makeup=1['+protectedEffects+']');
 }
 if(voice)mixInputs.push(`[${voice}]`);
 if(protectedEffects)mixInputs.push('['+protectedEffects+']');
 if(!mixInputs.length)throw new Error('Cannot mix audio without narration or effects');
 const output='out';
 filters.push(`${mixInputs.join('')}amix=inputs=${mixInputs.length}:normalize=0:dropout_transition=0,apad=whole_dur=${seconds(duration)},atrim=0:${seconds(duration)},anull[${output}]`);
 return {filter:filters.join(';'),output:`[${output}]`,masterFilter:'loudnorm=I=-14:TP=-2.5:LRA=11'};
}
