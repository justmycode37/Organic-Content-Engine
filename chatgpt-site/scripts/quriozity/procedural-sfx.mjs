// Original unpitched effects. Layer times and decay constants are in seconds.
// Cutoff pairs sweep from the first frequency to the second during the layer.
const layer=(start,attack,decay,low,high,gain)=>({start,attack,decay,low,high,gain});
const patches={
 'soft-tap':{
  seconds:0.42, description:'Rounded close tap with a focused mid body, falling pressure and a short room tail',
  layers:[
   layer(0,.018,.067,[410,290],[1130,760],.81),
   layer(.004,.022,.119,[73,30],[278,95],1.15),
   layer(.030,.026,.126,[265,195],[960,625],.26),
  ],
 },
 'air-pass':{
  seconds:0.52, description:'Warm pass of air with a rounded upper sweep and a lower pressure wake',
  layers:[
   layer(0,.052,.078,[155,61],[1850,490],.57),
   layer(.017,.047,.131,[46,26],[210,85],1.14),
   layer(.057,.042,.101,[510,235],[2060,915],.21),
  ],
 },
 'low-roll':{
  seconds:0.89, description:'Four soft low pulses gathering into a wider rolling tail',
  layers:[
   ...[0,.137,.248,.339].map((at,i)=>layer(at,.025,.105,[47,28],[206,85],.44+i*.16)),
   layer(.127,.182,.153,[37,25],[118,67],.51),
  ],
 },
 'cut-breath':{
  seconds:0.47, description:'Low rising pressure with a brief wide breath at the cut',
  layers:[
   layer(0,.389,.042,[66,28],[156,82],1.19),
   layer(.021,.359,.029,[150,415],[680,2560],.47),
   layer(.288,.114,.027,[660,960],[2730,5500],.22),
  ],
 },
 'soft-arrival':{
  seconds:1.14, description:'Sub-heavy soft arrival with distinct attack and overlapping bass tail',
  layers:[
   layer(0,.022,.105,[27,19],[103,52],1.16),
   layer(.008,.018,.078,[82,45],[277,108],.34),
   layer(.046,.068,.234,[24,17],[90,57],.81),
  ],
 },
};

export const PROCEDURAL_SFX=Object.freeze(Object.fromEntries(Object.entries(patches).map(
 ([kind,{seconds,description}])=>[kind,Object.freeze({seconds,description})],
)));
export const PROCEDURAL_SFX_VERSION=3;
const RATE=48000;
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const smooth=n=>n*n*(3-2*n);
const mix=(a,b,n)=>a+(b-a)*n;

function noise(seed){
 let state=seed>>>0;
 return ()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/2147483648-1;};
}

// Two one-pole lowpasses in series, followed by a highpass. The coefficients
// are refreshed in short blocks to move the spectral balance without a tone.
function band(){
 let a=0,b=0,c=0,lp=0,hp=0;
 return {
  tune(low,high){lp=1-Math.exp(-2*Math.PI*high/RATE);hp=1-Math.exp(-2*Math.PI*low/RATE);},
  sample(x){a+=lp*(x-a);b+=lp*(a-b);c+=hp*(b-c);return b-c;},
 };
}

function writeHeader(file,count){
 file.write('RIFF',0);file.writeUInt32LE(file.length-8,4);file.write('WAVEfmt ',8);
 file.writeUInt32LE(16,16);file.writeUInt16LE(1,20);file.writeUInt16LE(2,22);
 file.writeUInt32LE(RATE,24);file.writeUInt32LE(RATE*4,28);
 file.writeUInt16LE(4,32);file.writeUInt16LE(16,34);file.write('data',36);file.writeUInt32LE(count*4,40);
}

/** Seeded stereo 48 kHz PCM. Requested duration trims or pads the natural envelope. */
export function renderProceduralSfx(kind,seconds,variant=0){
 if(!Object.hasOwn(patches,kind))throw new Error(`Unknown procedural effect: ${kind}`);
 const patch=patches[kind],count=Math.round(clamp(seconds??patch.seconds,.15,8)*RATE);
 const frames=Math.min(count,Math.round(patch.seconds*RATE));
 const mid=new Float32Array(frames),side=new Float32Array(frames);
 const width=kind==='low-roll'?.51:kind==='cut-breath'?.43:.36;
 const key=[...kind].reduce((hash,char)=>Math.imul(hash^char.charCodeAt(0),16777619),2166136261);
 for(const [i,l] of patch.layers.entries()){
  const seed=(key^Math.imul(i+1,0x9e3779b9)^Math.imul(variant+1,0x4e67c6a7))>>>0;
  const n=noise(seed||1),wide=noise((seed^0xe45d3cc2)||1),m=band(),s=band();
  const start=Math.round(l.start*RATE);
  for(let frame=start;frame<frames;frame++){
   const t=(frame-start)/RATE;
   if((frame-start)%48===0){
    const sweep=1-Math.exp(-t/(l.attack+l.decay*.62));
    const low=mix(...l.low,sweep),high=mix(...l.high,sweep);
    m.tune(low,high);s.tune(low*1.22,high*1.06);
   }
   const gain=l.gain*smooth(clamp(t/l.attack,0,1))*Math.exp(-Math.max(0,t-l.attack)/l.decay);
   mid[frame]+=m.sample(n())*gain;
   side[frame]+=s.sample(wide())*gain*width;
  }
 }
 const pcm=new Float32Array(frames*2);
 let peak=0;
 const leftDelay=Math.round(.029*RATE),rightDelay=Math.round(.046*RATE);
 const roomDelay=Math.round(.083*RATE);
 const fade=Math.round(.022*RATE);
 for(let frame=0;frame<frames;frame++){
  const end=smooth(clamp((frames-1-frame)/fade,0,1));
  const l=(mid[frame]+side[frame]+.14*(mid[frame-leftDelay]??0)+.06*(mid[frame-roomDelay]??0))*end;
  const r=(mid[frame]-side[frame]+.14*(mid[frame-rightDelay]??0)-.06*(mid[frame-roomDelay]??0))*end;
  pcm[frame*2]=l;pcm[frame*2+1]=r;peak=Math.max(peak,Math.abs(l),Math.abs(r));
 }
 const file=Buffer.alloc(44+count*4);
 writeHeader(file,count);
 // Headroom for cue-level treatment and overlapping layers in the reel mix.
 const scale=peak>0?.42*32767/peak:0;
 for(let i=0;i<pcm.length;i++)file.writeInt16LE(Math.round(pcm[i]*scale),44+i*2);
 return file;
}
