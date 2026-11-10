import type {Container} from '../container.ts';
import {AppError} from '../errors.ts';
import {z} from 'zod';

const API='https://api.elevenlabs.io';
export interface Voice{id:string;name:string;gender:string;useCase:string;age:string;accent:string;description:string;previewUrl:string|null}
export interface Word{text:string;start:number;end:number}
interface Alignment{characters:string[];character_start_times_seconds:number[];character_end_times_seconds:number[]}
const alignmentSchema=z.object({characters:z.array(z.string()).max(10000),character_start_times_seconds:z.array(z.number().min(0).max(600)).max(10000),character_end_times_seconds:z.array(z.number().min(0).max(600)).max(10000)}).refine(a=>a.characters.length===a.character_start_times_seconds.length&&a.characters.length===a.character_end_times_seconds.length&&a.character_end_times_seconds.every((end,index)=>end>=a.character_start_times_seconds[index]!&&(index===0||a.character_start_times_seconds[index]!>=a.character_start_times_seconds[index-1]!)));
const audioSchema=z.object({audio_base64:z.string().min(1).max(20*1024*1024),alignment:alignmentSchema.nullish(),normalized_alignment:alignmentSchema.nullish()});
const voicesSchema=z.object({voices:z.array(z.object({voice_id:z.string().regex(/^[A-Za-z0-9]{8,64}$/),name:z.string(),labels:z.record(z.string(),z.string()).nullish(),description:z.string().nullish(),preview_url:z.string().nullish()})).max(100),has_more:z.boolean().optional(),next_page_token:z.string().nullish()});

const notConfigured=()=>new AppError(409,'voiceover_not_configured','Voiceover needs an ElevenLabs API key. Add ELEVENLABS_API_KEY to the Site runtime secrets.');

async function call(c:Container,path:string,init?:{body:unknown}){
 const key=c.config.voiceover.apiKey;if(!key)throw notConfigured();
 let response:Response;
 try{response=await fetch(`${API}${path}`,{method:init?'POST':'GET',headers:{'xi-api-key':key,...(init?{'content-type':'application/json'}:{})},body:init?JSON.stringify(init.body):undefined,signal:AbortSignal.timeout(60000)});}
 catch{throw new AppError(502,'voiceover_unreachable','ElevenLabs did not respond. Try again.');}
 if(response.ok){try{return await response.json() as unknown;}catch{throw new AppError(502,'voiceover_failed','ElevenLabs returned an unreadable response. Try again.');}}
 // Provider error bodies can echo request details; only the status decides the message.
 if(response.status===401||response.status===403)throw new AppError(502,'voiceover_auth','ElevenLabs rejected the API key or the key lacks text-to-speech and voice access.');
 if(response.status===402||response.status===429)throw new AppError(502,'voiceover_quota','ElevenLabs refused the request: the account is out of credits or rate limited.');
 if(response.status===404)throw new AppError(422,'voice_missing','That voice is no longer available on the ElevenLabs account. Choose another voice.');
 throw new AppError(502,'voiceover_failed',`ElevenLabs could not create the voiceover (status ${response.status}).`);
}

/**
 * Default voice: the configured ID when the account still has it, otherwise a
 * female voice labelled for social media, then any young or conversational
 * female voice. Only an explicit override can choose another gender.
 */
export function pickVoice(voices:Voice[],preferredId:string|null):string|null{
 if(preferredId&&voices.some(voice=>voice.id===preferredId))return preferredId;
 const female=voices.filter(voice=>voice.gender.toLowerCase()==='female');
 const score=(voice:Voice)=>(/social/i.test(voice.useCase)?8:0)+(/conversation|entertainment|advertis/i.test(voice.useCase)?3:0)+(/young/i.test(voice.age)?2:0)+(/playful|upbeat|bright|energetic|trendy|warm/i.test(voice.description)?2:0)+(/american/i.test(voice.accent)?1:0);
 return [...female].sort((a,b)=>score(b)-score(a)||a.id.localeCompare(b.id))[0]?.id??null;
}

export async function listVoices(c:Container){
 if(!c.config.voiceover.apiKey)return {configured:false,voices:[] as Voice[],defaultVoiceId:null};
 const voices:Voice[]=[];const tokens=new Set<string>();let token:string|null=null;
 // Follow the account's pages so a saved preference or suitable female voice is not missed.
 for(let page=0;page<20;page++){
  const query=new URLSearchParams({page_size:'100',include_total_count:'false',...(token?{next_page_token:token}:{})});
  const parsed=voicesSchema.safeParse(await call(c,`/v2/voices?${query}`));
  if(!parsed.success)throw new AppError(502,'voiceover_failed','ElevenLabs returned an unreadable voice list. Try again.');
  const data=parsed.data;
  for(const voice of data.voices)if(!voices.some(item=>item.id===voice.voice_id))voices.push({id:voice.voice_id,name:voice.name,gender:voice.labels?.gender??'',useCase:voice.labels?.use_case??'',age:voice.labels?.age??'',accent:voice.labels?.accent??'',description:[voice.labels?.descriptive,voice.labels?.description,voice.description].filter(Boolean).join(' '),previewUrl:voice.preview_url??null});
  if(!data.has_more)break;
  if(!data.next_page_token||tokens.has(data.next_page_token)||page===19)throw new AppError(502,'voiceover_failed','ElevenLabs could not finish loading the voice list. Try again.');
  token=data.next_page_token;tokens.add(token);
 }
 return {configured:true,voices,defaultVoiceId:pickVoice(voices,c.config.voiceover.voiceId)};
}

/** Collapses character timings into spoken words. */
export function wordsFromAlignment(alignment:Alignment|null|undefined):Word[]{
 const words:Word[]=[];if(!alignment)return words;
 let text='',start=0,end=0;
 const flush=()=>{if(text)words.push({text,start:Math.round(start*1000)/1000,end:Math.round(end*1000)/1000});text='';};
 alignment.characters.forEach((character,index)=>{
  if(/\s/.test(character)){flush();return;}
  if(!text)start=alignment.character_start_times_seconds[index]??end;
  text+=character;end=alignment.character_end_times_seconds[index]??end;
 });
 flush();return words;
}

/** Generates narration with word timings and stores the audio privately. Spends ElevenLabs credits. */
export async function createVoiceover(c:Container,input:{text:string;voiceId:string}){
 if(!c.config.voiceover.apiKey)throw notConfigured();
 if(!c.materials.bucket)throw new AppError(503,'storage_unavailable','File storage is not provisioned yet');
 const now=c.now();
 if(!await c.settings.acquireLock('studio:voiceover',now.toISOString(),new Date(now.getTime()+90000).toISOString()))throw new AppError(409,'voiceover_busy','A voiceover is already being generated. Wait for it to finish.');
 try{
 const parsed=audioSchema.safeParse(await call(c,`/v1/text-to-speech/${encodeURIComponent(input.voiceId)}/with-timestamps?output_format=mp3_44100_128`,{body:{text:input.text,model_id:c.config.voiceover.model,voice_settings:{stability:0.4,similarity_boost:0.75,style:0.3,use_speaker_boost:true,speed:1.08}}}));
 if(!parsed.success)throw new AppError(502,'voiceover_failed','ElevenLabs returned unreadable audio or word timings. Try again.');
 const data=parsed.data;
 let bytes:Uint8Array;
 try{bytes=Uint8Array.from(atob(data.audio_base64),character=>character.charCodeAt(0));}catch{throw new AppError(502,'voiceover_failed','ElevenLabs returned unreadable audio. Try again.');}
 // Normalized text follows what was spoken (for example, numbers written out).
 const alignment=data.normalized_alignment?.characters.length?data.normalized_alignment:data.alignment;
 const words=wordsFromAlignment(alignment);
 const material=await c.materials.init({name:`voiceover-${new Date().toISOString().replace(/[-:]/g,'').slice(0,15)}.mp3`,mime:'audio/mpeg',size:bytes.length,kind:'voiceover'});
 await c.materials.upload(material.id,new Blob([bytes]).stream(),bytes.length);
 // Narration is an output, not source material for future generation.
 await c.materials.update(material.id,{enabled:false,notes:`Synthetic voiceover from ElevenLabs. Script: ${input.text}`.slice(0,12000)});
 return {materialId:material.id,voiceId:input.voiceId,duration:Math.max(0,...(alignment?.character_end_times_seconds??[])),words};
 }finally{await c.settings.releaseLock('studio:voiceover');}
}
