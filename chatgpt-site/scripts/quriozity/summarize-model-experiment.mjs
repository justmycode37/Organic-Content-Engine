import {readFile,writeFile,access} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {VARIANTS,stepRole,languageCost} from './model-experiment.mjs';
const root=resolve(process.argv[2]);
const json=async path=>JSON.parse(await readFile(path,'utf8'));
const rows=async path=>(await readFile(path,'utf8').catch(()=>'' )).trim().split('\n').filter(Boolean).map(JSON.parse);
const audioRates={ttsPer1000Characters:.08,musicPerMinute:.15,soundEffectsPerMinute:.12};
const sources={
 sol:'https://developers.openai.com/api/docs/pricing',
 opus:'https://platform.claude.com/docs/en/models/opus-5-5/overview',
 audio:'https://elevenlabs.io/pricing/api',
};
const results=[];
for(const [variant,models]of Object.entries(VARIANTS)){
 const dir=join(root,variant),state=await json(join(dir,'experiment.json')).catch(()=>({status:'not-started'}));
 const calls=await rows(join(dir,'model-usage.jsonl')),audio=await rows(join(dir,'audio-usage.jsonl'));
 const routeProblems=calls.filter(c=>c.effort!=='medium'||c.model!==models[stepRole(c.step)==='review'?'reviewModel':'generationModel']);
 const modelCostUsd=calls.reduce((n,c)=>n+(languageCost(c)??0),0),byRole={generation:0,review:0};
 for(const c of calls)byRole[stepRole(c.step)]+=languageCost(c)??0;
 const successfulAudio=audio.filter(c=>c.status>=200&&c.status<300);
 const ttsCharacters=successfulAudio.filter(c=>c.endpoint.includes('/text-to-speech/')).reduce((n,c)=>n+(c.characters??0),0);
 const musicSeconds=successfulAudio.filter(c=>c.endpoint==='/v1/music').reduce((n,c)=>n+(c.generatedSeconds??0),0);
 const effectSeconds=successfulAudio.filter(c=>c.endpoint==='/v1/sound-generation').reduce((n,c)=>n+(c.generatedSeconds??0),0);
 const audioEstimateUsd=ttsCharacters/1000*audioRates.ttsPer1000Characters+musicSeconds/60*audioRates.musicPerMinute+effectSeconds/60*audioRates.soundEffectsPerMinute;
 let analytics=await json(join(dir,'audio-analytics.json')).catch(()=>state.audioAnalytics);
 if(process.argv.includes('--refresh-audio')&&state.endedAt&&audio.length){
  const audioStart=Math.min(...audio.map(c=>Date.parse(c.at)-(c.seconds??0)*1000-1000));
  const audioEnd=Math.max(...audio.map(c=>Date.parse(c.at)+1000));
  const response=await fetch('https://api.elevenlabs.io/v1/workspace/analytics/query/usage-by-product-over-time',{
   method:'POST',headers:{'xi-api-key':process.env.ELEVENLABS_API_KEY,'content-type':'application/json'},
   body:JSON.stringify({start_time:Math.floor(audioStart),end_time:Math.ceil(audioEnd),interval_seconds:60,group_by:['product_type','model','fiat_currency','fiat_charge_type']})});
  analytics={status:response.status,...await response.json()};await writeFile(join(dir,'audio-analytics.json'),JSON.stringify(analytics,null,2));
 }
 const costIndex=analytics?.columns?.indexOf('total_cost')??-1;
 const measuredAudioCostUsd=costIndex>=0&&analytics.rows?.length?analytics.rows.reduce((n,r)=>n+Number(r[costIndex]),0):null;
 const audioCostUsd=measuredAudioCostUsd>0?measuredAudioCostUsd:audioEstimateUsd;
 const provenance=await json(join(dir,'provenance.json')).catch(()=>({}));
 const gates=Object.fromEntries(['visual-subject-review','visual-composition-review','visual-continuity-review','visual-style-reference-review','visual-final-review'].map(k=>[k,provenance[k]?.passed===true]));
 gates.voice=provenance.voiceReview?.passed===true;
 let probe=null;
 if(['completed','completed-unapproved'].includes(state.status)){
  await access(state.finished);
  probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',state.finished],{encoding:'utf8'}));
  if(routeProblems.length||state.status==='completed'&&!Object.values(gates).every(Boolean))throw new Error(`${variant}: completion fails gate/model audit`);
  if(state.status==='completed-unapproved'&&(!state.allowUnapproved||!provenance.unapprovedTest||!state.finished.endsWith('unapproved-test.mp4')))throw new Error(`${variant}: unapproved output lacks explicit authorization/label`);
  if(!probe.streams.some(s=>s.codec_type==='audio')||!probe.streams.some(s=>s.codec_type==='video'))throw new Error(`${variant}: incomplete export`);
 }
 results.push({variant,...models,effort:'medium',status:state.status,error:state.error,finished:state.finished,
  elapsedSeconds:state.elapsedSeconds,videoSeconds:probe?Number(probe.format.duration):null,
  modelCalls:calls.length,modelCostUsd,modelCostByRoleUsd:byRole,
  audioCostUsd,audioCostBasis:measuredAudioCostUsd>0?'ElevenLabs usage analytics':'actual successful requests × published API rates; estimate, excludes tax',
  measuredAudioCostUsd,audioEstimateUsd,audioRequests:successfulAudio.length,ttsCharacters,musicSeconds,effectSeconds,
  audioCredits:state.audioAfter?.character_count-state.audioBefore?.character_count,
  totalCostUsd:modelCostUsd+audioCostUsd,gates,failedReviews:provenance.failedReviews??[],routeProblems,title:probe?provenance.script?.title:null});
}
const summary={generatedAt:new Date().toISOString(),publish:false,effort:'medium',timingBasis:'Sequential production wall time, including reviews, repairs, audio and rendering; excludes experiment implementation and time between attempts.',
 independence:'Fresh plans/scripts/storyboards and work directories; independent audio caches; same catalogue, style reference and existing topic ledger; test results never enter the normal no-repeat ledger.',
 reviewLimit:'Voice and sound reviews use text, generated word timings, cue sheets and measured mix statistics. Neither model was claimed to listen to audio.',
 sources,audioRates,results,totalCostUsd:results.reduce((n,r)=>n+r.totalCostUsd,0)};
await writeFile(join(root,'comparison.json'),JSON.stringify(summary,null,2)+'\n');
const fmt=sec=>sec==null?'—':`${Math.floor(sec/60)}m ${Math.round(sec%60)}s`;
const lines=['# Quriozity private model comparison','',`All calls use medium effort. Nothing was posted.`,``,
 '| Generation / review | Status | Production time | Reel length | Language API | Audio API | Total |',
 '| --- | --- | ---: | ---: | ---: | ---: | ---: |',
 ...results.map(r=>`| ${r.generationModel} / ${r.reviewModel} | ${r.status} | ${fmt(r.elapsedSeconds)} | ${r.videoSeconds?.toFixed(1)??'—'} s | $${r.modelCostUsd.toFixed(4)} | $${r.audioCostUsd.toFixed(4)} | $${r.totalCostUsd.toFixed(4)} |`),
 '',`Total API usage value: $${summary.totalCostUsd.toFixed(4)} USD, excluding tax. Audio figures are labelled by basis in comparison.json.`,
 '',summary.timingBasis,'',summary.independence,'',summary.reviewLimit,
 '',...Object.entries(sources).map(([k,v])=>`${k}: ${v}`),''];
await writeFile(join(root,'comparison.md'),lines.join('\n'));console.log(JSON.stringify(summary,null,2));
const maxTime=Math.max(1,...results.map(r=>r.elapsedSeconds??0)),maxCost=Math.max(.01,...results.map(r=>r.totalCostUsd));
const shortName=r=>`${r.generationModel.startsWith('claude')?'Opus 5.5':'Sol 6.1'} → ${r.reviewModel.startsWith('claude')?'Opus 5.5':'Sol 6.1'}`;
const panel=(title,items)=>`<section><h2>${title}</h2>${items.join('')}</section>`;
const times=results.map((r,i)=>`<div class="row"><div class="label"><span>${shortName(r)}</span><strong>${fmt(r.elapsedSeconds)}</strong></div><div class="track"><div class="bar" style="width:${(r.elapsedSeconds??0)/maxTime*100}%;background:var(--chart-${i+1})"></div></div><small>${r.status}</small></div>`);
const costs=results.map((r,i)=>`<div class="row"><div class="label"><span>${shortName(r)}</span><strong>$${r.totalCostUsd.toFixed(2)}</strong></div><div class="track"><div class="bar" style="width:${r.totalCostUsd/maxCost*100}%;background:var(--chart-${i+1})" title="Language API $${r.modelCostUsd.toFixed(4)}; audio API $${r.audioCostUsd.toFixed(4)}"></div></div><small>${r.audioCostBasis.includes('estimate')?'Audio uses published-rate estimate':'Audio reconciled to usage analytics'}</small></div>`);
const html=`<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;color:var(--foreground);font-family:var(--font-sans)}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,290px),1fr));gap:16px}section{padding:16px;background:var(--card);border-radius:var(--radius)}h2{font-size:16px;margin:0 0 22px}.row{margin-bottom:22px}.label{display:flex;justify-content:space-between;gap:8px;font-size:12px;margin-bottom:7px}.track{height:12px;background:var(--secondary);border-radius:6px;overflow:hidden}.bar{height:12px;border-radius:6px;min-width:0}small,p{color:var(--muted-foreground);font-size:11px}small{display:block;margin-top:6px}p{line-height:1.5;margin:12px 0 0}.total{font-size:14px;color:var(--foreground)}
</style></head><body><div class="grid">${panel('Production time',times)}${panel('API cost · USD',costs)}</div><p class="total">Total: <strong>$${summary.totalCostUsd.toFixed(2)} USD</strong> · All models at medium effort · Private test only</p><p>Generation → review. Times include recorded production attempts, reviews, repairs, audio and rendering. Costs exclude tax; raw usage and cost basis are saved in comparison.json. Voice checks assess delivery and timing.</p></body></html>`;
await writeFile(join(root,'comparison.html'),html);
