/** Persistent Quriozity defaults; one-off comparison settings stay in their runner. */
// One repair request per visual stage; no reel-wide cap and no Sol visual fallback.
export const OPUS_STAGE_REPAIR_LIMIT=1;
export const SOL_STAGE_REPAIR_LIMIT=3;
export const STAGE_REPAIR_LIMIT=OPUS_STAGE_REPAIR_LIMIT;
export const repairStage=(step:string)=>step.replace(/-repair$/,'');
export const QURIOZITY_MODELS={generation:{model:'gpt-6.2-sol',effort:'medium'},visual:{model:'claude-opus-5-5',effort:'medium'},review:{model:'gpt-6.2-sol',effort:'medium'}} as const;
export function quriozityStepRole(step:string):'generation'|'review'{
 if(step.startsWith('voice-'))return 'review';
 if(step==='visual-realization')return 'generation';
 if(step.endsWith('-repair'))return 'generation';
 if(['fact-check','coherence','novelty','storyboard-review','asset-verify','sound-review'].includes(step)||step.startsWith('visual-')||step.startsWith('voice-'))return 'review';
 return 'generation';
}
/** Sol plans/selects/layouts/writes; Opus realizes and repairs actual visuals. */
export const usesOpusVisuals=(step:string)=>step==='visual-realization'||step==='visual-realization-repair'||step.startsWith('visual-')&&step.endsWith('-repair');
export const QURIOZITY_CLIENT_CONTEXT={generationModel:QURIOZITY_MODELS.generation.model,generationEffort:QURIOZITY_MODELS.generation.effort,visualModel:QURIOZITY_MODELS.visual.model,visualEffort:QURIOZITY_MODELS.visual.effort,reviewModel:QURIOZITY_MODELS.review.model,reviewEffort:QURIOZITY_MODELS.review.effort,visualRepairsPerStage:OPUS_STAGE_REPAIR_LIMIT,visualFallback:false} as const;
export function hasDefaultQuriozityProfile(provenance:Record<string,any>){
 const p=provenance,r=p.modelRouting??{};
 return (p.model??r.generationModel)===QURIOZITY_MODELS.generation.model&&(p.effort??r.generationEffort)===QURIOZITY_MODELS.generation.effort&&(r.visualModel??p.visualModel)===QURIOZITY_MODELS.visual.model&&
  (r.reviewModel??p.reviewModel)===QURIOZITY_MODELS.review.model&&(r.reviewEffort??p.reviewEffort)===QURIOZITY_MODELS.review.effort;
}
