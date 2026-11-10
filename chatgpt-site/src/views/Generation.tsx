import {useEffect,useState} from 'react';
import {api,errorText,type GenerationRequest,type Material,type VideoResult} from '../api/client';
import {useWorkspace} from '../workspace';
import {useLoad} from '../lib/hooks';
import {Button,Field,LoadError,Notice,PageHead} from '../components/common';
import {Studio,type StudioProps} from '../studio/Studio';

/** Reads a video job result, including the single-clip shape saved before the Studio existed. */
function videoResult(job:GenerationRequest):VideoResult{
 const data=(job.result?JSON.parse(job.result):{}) as Partial<VideoResult>&{materialId?:string;runId?:string};
 return {clips:data.clips??(data.materialId&&data.runId?[{materialId:data.materialId,runId:data.runId}]:[]),edit:data.edit??null,finishedMaterialId:data.finishedMaterialId??null};
}
const KIND:Record<string,string>={video:'Video',ideas:'Post ideas',draft:'Post draft',analyze:'Reference notes'};
const STATUS:Record<string,string>={pending:'Waiting for ChatGPT',ready_to_finish:'Footage ready',render_queued:'Editing queued',rendering:'Editing automatically',waiting_for_voice:'Waiting for narration',render_failed:'AI edit needs repair',render_blocked:'Editing stopped',completed:'Done'};
type Session=Pick<StudioProps,'jobId'|'clips'|'plan'|'outputName'>&{key:string};

export function GenerationView(){
 const ws=useWorkspace();const jobs=useLoad(api.generation.list,[ws.version]);const library=useLoad(api.materials.list,[ws.version]);const status=useLoad(api.status,[ws.version]);
 const [prompt,setPrompt]=useState(''),[budget,setBudget]=useState(''),[duration,setDuration]=useState(12),[busy,setBusy]=useState(false);
 const [session,setSession]=useState<Session|null>(null),[pick,setPick]=useState('');
 const active=jobs.data?.items.some(j=>['render_queued','rendering','waiting_for_voice'].includes(j.status));
 useEffect(()=>{if(!active)return;const timer=setInterval(()=>{jobs.reload();library.reload();status.reload();},10000);return()=>clearInterval(timer);},[active,jobs.reload,library.reload,status.reload]);
 const materials=library.data?.items??[];
 const create=async()=>{setBusy(true);try{await api.generation.create({kind:'video',prompt,duration,budget:Number(budget),materialIds:[]});setPrompt('');jobs.reload();}catch(e){ws.toast(errorText(e),'error');}finally{setBusy(false);}};
 const handoff=(id:string)=>`https://chatgpt.com/?q=${encodeURIComponent(`Use my Organic Content Engine plugin to complete generation request ${id}. Read get_generation_context first and follow its contentPolicy. Generate text using this ChatGPT conversation. For video, act as director and editor: plan the hook, shots, narration script, on-screen text beats and end card, then use my connected Monid MCP to inspect the current price and schema and generate clean vertical footage with no baked-in text, keeping every run combined within my approved budget. Save each completed run with save_video_result and include the edit plan on the final call; this starts automatic narration and rendering. For ready_to_finish or render_failed requests, reuse saved footage and repair the plan with save_video_edit. Read the render error in get_generation_context. Do not require the user to edit the video. Save ideas, drafts or notes with save_generation. Never publish a social post. If either plugin is unavailable, help me connect it instead of inventing results.`)}`;
 const openJob=(job:GenerationRequest)=>{
  const result=videoResult(job);
  const clips=result.clips.map((clip,index)=>({...clip,name:materials.find(m=>m.id===clip.materialId)?.name??`Clip ${index+1}`})).filter(clip=>materials.some(m=>m.id===clip.materialId));
  if(!clips.length){ws.toast('The footage for this request is no longer in Storage.','error');return;}
  setSession({key:job.id,jobId:job.id,clips,plan:result.edit,outputName:`video-${job.id.slice(0,8)}.mp4`});
 };
 const openMaterial=(material:Material)=>setSession({key:material.id,jobId:null,clips:[{runId:material.id,materialId:material.id,name:material.name}],plan:null,outputName:`${material.name.replace(/\.[^.]+$/,'')}-finished.mp4`});
 const finishable=materials.filter(m=>['video/mp4','video/quicktime'].includes(m.mime)&&m.kind!=='finished');
 return <><PageHead eyebrow="Create with your plan" title="ChatGPT & Monid">AI plans, narrates and edits videos automatically. Use the Studio whenever you want to make a change.</PageHead>
 <Notice>Connect the Organic Content Engine plugin and Monid in ChatGPT. Site sign-in establishes your identity; it does not pass your other app connections to this website. Open a request below in ChatGPT to use both tools together.</Notice>
 {active&&status.data?.rendering&&!status.data.rendering.online&&<Notice>Automatic editing is waiting for the background worker to connect. Your videos remain queued; you can close this page.</Notice>}
 {session&&<Studio key={session.key} jobId={session.jobId} clips={session.clips} plan={session.plan} outputName={session.outputName} music={materials.filter(m=>m.mime.startsWith('audio/')&&m.kind!=='voiceover')} onClose={()=>setSession(null)} onSaved={()=>{jobs.reload();library.reload();}}/>}
 <section className="card section"><h3>Connect Monid</h3><p>Add <code>https://mcp.monid.ai/v1</code> as a custom connector in ChatGPT, then authorize your Monid account. Your existing connection can be reused when available in the conversation.</p><a href="https://docs.monid.ai/guide/quickstart-mcp.html" target="_blank" rel="noreferrer">Monid connection guide</a><p>ChatGPT reasoning and writing use your ChatGPT plan. Monid video runs are charged to your Monid balance.</p></section>
 <section className="card section"><h3>Generate a video</h3><p>ChatGPT plans the edit, generates clean vertical footage in several short shots, and saves it with a hook, timed captions and an end card. The background editor generates narration, synchronizes captions and saves the finished MP4 automatically. You can close this page while it works.</p><Field label="Video brief"><textarea rows={4} value={prompt} maxLength={2000} onChange={e=>setPrompt(e.target.value)} placeholder="What should the viewer learn or feel? Describe the subject, the point, and the platform."/></Field><div className="form-grid"><Field label="Finished length (seconds)"><input type="number" min={3} max={30} value={duration} onChange={e=>setDuration(e.target.valueAsNumber)}/></Field><Field label="Maximum Monid spend (USD)" hint="Covers every shot of this video combined."><input type="number" min="0.01" max="100" step="0.01" value={budget} onChange={e=>setBudget(e.target.value)} placeholder="Choose your limit"/></Field></div><Button variant="primary" busy={busy} disabled={!prompt.trim()||!(Number(budget)>0)||!(duration>=3&&duration<=30)} onClick={()=>void create()}>Prepare video request</Button></section>
 <section className="card section"><h3>Finish a video from Storage</h3><p>Add a hook, timed captions and an end card to your own footage, and export it as a 1080 × 1920 MP4.</p><div className="row"><select aria-label="Video from Storage" value={pick} onChange={e=>setPick(e.target.value)}><option value="">Select a video</option>{finishable.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select><Button disabled={!pick||Boolean(session)} onClick={()=>{const material=finishable.find(m=>m.id===pick);if(material)openMaterial(material);}}>Open in Studio</Button></div></section>
 <h3 className="section">Generation requests</h3>{jobs.error&&<LoadError message={jobs.error} onRetry={jobs.reload}/>}{jobs.data?.items.length===0&&<p className="muted">Create ideas from a pillar, draft an idea, analyze a source file, or prepare a video above.</p>}
 <div className="material-grid">{jobs.data?.items.map(j=>{
  const video=j.kind==='video'?videoResult(j):null;
  return <article key={j.id} className="card"><div className="card-head"><h3>{KIND[j.kind]??j.kind}</h3><span className="badge">{STATUS[j.status]??j.status}</span></div><p className="muted">{new Date(j.created_at).toLocaleString()}</p>
  {j.status==='pending'&&<a className="btn btn-primary" href={handoff(j.id)} target="_top">Open in ChatGPT</a>}
  {video&&j.status==='ready_to_finish'&&<><p>{video.clips.length} clip{video.clips.length===1?'':'s'} of raw footage{video.edit?' with an edit plan':''}. Waiting for the AI to save its complete edit plan.</p><Button variant="primary" disabled={Boolean(session)||!library.data} onClick={()=>openJob(j)}>Edit in Studio</Button></>}
  {video&&['render_queued','rendering','waiting_for_voice','render_failed','render_blocked'].includes(j.status)&&<><p>{j.renderErrorMessage??(j.status==='rendering'?'The AI edit is rendering in the background. No interaction is needed.':'This video will be finished automatically by the background editor.')}</p>{j.status==='render_failed'&&<a className="btn btn-secondary" href={handoff(j.id)} target="_top">Ask AI to repair edit</a>}<Button disabled={Boolean(session)||!library.data} onClick={()=>openJob(j)}>Edit in Studio</Button></>}
  {video&&j.status==='completed'&&<><p>{video.finishedMaterialId?'Finished video saved to Storage.':'Saved to Storage before automatic editing was available.'}</p><Button disabled={Boolean(session)||!library.data} onClick={()=>openJob(j)}>{video.finishedMaterialId?'Edit again':'Finish in Studio'}</Button></>}
  {!video&&j.status==='completed'&&<p>Saved to {j.kind==='analyze'?'Storage':j.kind==='draft'?'the post library':'Ideas'}.</p>}
  </article>;})}</div>
 </>;
}
