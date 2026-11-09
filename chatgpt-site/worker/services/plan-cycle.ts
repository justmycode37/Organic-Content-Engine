import type {Container} from '../container.ts';
import {requestGeneration} from './generation-jobs.ts';
import {enumerateSlots} from './slots.ts';
import {SLOT_WINDOW_MS} from './posts.ts';
export async function preparePlanCycle(c:Container){
 const settings=await c.settings.get(),startedAt=new Date().toISOString();
 const result={startedAt,createdPostIds:[] as string[],ideasGenerated:0,skippedPlatforms:[] as string[],stoppedReason:'calendar_full',error:null};
 if(!await c.settings.acquireLock('plan_cycle',startedAt,new Date(Date.now()+60000).toISOString()))return result;
 try{
  await c.settings.setJob('autonomy_cycle',startedAt,null);
  const pillars=(await c.pillars.list(true)).filter(p=>p.platforms.length);
  if(!pillars.length)return {...result,stoppedReason:'no_active_pillars'};
  const {results:pending}=await c.db.prepare("SELECT input FROM generation_jobs WHERE status='pending'").all<{input:string}>();
  const inputs=pending.map(j=>JSON.parse(j.input));
  const backlog=(await c.posts.countByStatus()).needs_review??0;
  const budget=Math.min(settings.maxPostsPerCycle,Math.max(0,settings.maxReviewBacklog-backlog-inputs.filter(i=>i.kind==='draft').length));
  if(!budget)return {...result,stoppedReason:'review_backlog_full'};
  let created=0;
  for(const slot of enumerateSlots(new Date(),settings.planningHorizonDays,settings.postingSlots,settings.timezone)){
   for(const pillar of pillars)for(const platform of pillar.platforms){
    if(created>=budget)return {...result,stoppedReason:'budget_reached'};
    if(!c.gateway.canTarget(platform)){if(!result.skippedPlatforms.includes(platform))result.skippedPlatforms.push(platform);continue;}
    if(await c.posts.slotTaken(platform,slot,SLOT_WINDOW_MS)||inputs.some(i=>i.kind==='draft'&&i.platform===platform&&i.scheduledAt===slot.toISOString()))continue;
    const idea=await c.ideas.nextUnused(pillar.id);
    if(idea&&!inputs.some(i=>i.kind==='draft'&&i.ideaId===idea.id)){
      const request={kind:'draft',ideaId:idea.id,platform,scheduledAt:slot.toISOString()};await requestGeneration(c,request);inputs.push(request);created++;
    }else if(!idea&&!inputs.some(i=>i.kind==='ideas'&&i.pillarId===pillar.id)){
      const request={kind:'ideas',pillarId:pillar.id,count:Math.min(5,budget)};await requestGeneration(c,request);inputs.push(request);created++;
    }
   }
  }
  await c.settings.setJob('autonomy_cycle',startedAt,result);return result;
 }finally{await c.settings.releaseLock('plan_cycle');}
}
