import {useCallback,useEffect,useState} from 'react';
import {Youtube,RefreshCw,ArrowUpRight} from 'lucide-react';
import type {Account,PostizIntegration} from '../api/types';
type Thumbnail={id:'subject'|'evidence';line:string;credit?:{label:string;url:string}};
type Episode={id:string;topic:string;status:string;title?:string;seconds?:number;error?:string;sources?:{title:string;url:string}[];thumbnails?:Thumbnail[]};
export function SiliconFootnote({account,targets,ready,busy,save,refresh}:{account:Account;targets:PostizIntegration[];ready:boolean;busy:boolean;save:(patch:Partial<Account>)=>Promise<boolean>;refresh:()=>void}){
 const [topic,setTopic]=useState(''),[episodes,setEpisodes]=useState<Episode[]>([]),[error,setError]=useState(''),[sending,setSending]=useState(false);
 const reload=useCallback(async()=>{
  const response=await fetch('/api/silicon/episodes');
  if(!response.ok)throw Error('Could not load episodes.');
  setEpisodes((await response.json()).episodes);
 },[]);
 useEffect(()=>{const load=()=>reload().catch(e=>setError(e.message));void load();const timer=setInterval(load,12000);return()=>clearInterval(timer)},[reload]);
 const active=episodes.some(e=>e.status==='queued'||e.status==='producing');
 return <>
  <header className="account-title"><Youtube size={38}/><div><h1>{account.name}</h1><p>YouTube · AI news</p></div></header>
  <section className="connection-panel"><div><h2>YouTube via Postiz</h2><p>{account.postizIntegrationId?'Channel connected':'Choose the Silicon Footnote channel.'}</p></div>
   <div className="destination-controls"><select aria-label="Postiz YouTube channel" value={account.postizIntegrationId??''} disabled={!ready||busy} onChange={e=>void save({postizIntegrationId:e.target.value||null})}>
    <option value="">{ready?'Select a YouTube channel':'Postiz needs setup'}</option>{targets.filter(t=>t.identifier==='youtube').map(t=><option key={t.id} value={t.id} disabled={t.disabled}>{t.name}</option>)}
   </select><button title="Refresh Postiz channels" className="icon-action" onClick={refresh}><RefreshCw size={16}/></button></div></section>
  <section className="schedule-panel"><h2>Produce an episode</h2><p>10–15 minutes · Titan narration · Source footage and original motion graphics</p>
   <form onSubmit={async e=>{e.preventDefault();setSending(true);try{
    const res=await fetch('/api/silicon/episodes',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({topic})});
    if(!res.ok)throw Error(res.status===409?'An episode is already in production.':'Could not queue this episode.');
    setTopic('');setError('');await reload();
   }catch(e){setError(e instanceof Error?e.message:'Request failed')}finally{setSending(false)}}}>
    <label>Story focus (optional)<input value={topic} maxLength={300} onChange={e=>setTopic(e.target.value)} placeholder="Find a current AI story"/></label>
    <button className="primary-action" disabled={sending||active}>{active?'Production in progress':'Research and produce'}</button>
   </form>{error&&<p role="alert">{error}</p>}</section>
  <section className="activity-panel"><h2>Episodes</h2>{!episodes.length&&<p>Finished episodes and their sources appear here.</p>}
   {episodes.map(e=><article key={e.id}><h3>{e.title||e.topic||'AI news briefing'}</h3><p>{e.status}{e.seconds?` · ${Math.floor(e.seconds/60)}m ${Math.floor(e.seconds%60)}s`:''}{e.error&&' · '+e.error}</p>
    {e.status==='ready'&&<><video controls preload="none" style={{width:'100%',aspectRatio:'16/9'}} src={`/api/silicon/episodes/${e.id}/video`}/>
     {e.thumbnails?.length?<details><summary>YouTube thumbnails ({e.thumbnails.length})</summary>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,240px),1fr))',gap:16}}>
       {e.thumbnails.map(cover=>{
        const url=`/api/silicon/episodes/${e.id}/thumbnail/${cover.id}`;
        return <div key={cover.id}>
         <img src={url} loading="lazy" alt={cover.line} width={3840} height={2160} style={{width:'100%',height:'auto',display:'block'}}/>
         <a href={url} download={`silicon-footnote-${cover.id}.jpg`}>Download {cover.id} thumbnail</a>
         {cover.credit&&<p><a href={cover.credit.url} target="_blank" rel="noreferrer">{cover.credit.label} <ArrowUpRight size={12}/></a></p>}
        </div>;
       })}
      </div>
     </details>:null}
     <details><summary>Sources and footage</summary><ul>{e.sources?.map((s,i)=><li key={i}><a href={s.url} target="_blank" rel="noreferrer">{s.title} <ArrowUpRight size={12}/></a></li>)}</ul></details></>}
   </article>)}</section>
 </>;
}
