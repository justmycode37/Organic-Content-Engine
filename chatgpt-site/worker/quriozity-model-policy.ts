/** Persistent Quriozity defaults; one-off comparison settings stay in their runner. */
// Shared across every Opus repair request in a reel; durable reservations enforce this cap.
export const OPUS_REPAIR_LIMIT=5;
export const OPUS_STAGE_REPAIR_LIMIT=2;
export const SOL_STAGE_REPAIR_LIMIT=5;
export const STAGE_REPAIR_LIMIT=OPUS_STAGE_REPAIR_LIMIT+SOL_STAGE_REPAIR_LIMIT;
export const repairStage=(step:string)=>step.replace(/-repair$/,'');
export const QURIOZITY_MODELS={generation:{model:'claude-opus-5-5',effort:'medium'},review:{model:'gpt-6.1-sol',effort:'xhigh'}} as const;
export function quriozityStepRole(step:string):'generation'|'review'{
 if(step.startsWith('voice-'))return 'review';
 if(step.endsWith('-repair'))return 'generation';
 if(['fact-check','coherence','novelty','storyboard-review','asset-verify','sound-review'].includes(step)||step.startsWith('visual-')||step.startsWith('voice-'))return 'review';
 return 'generation';
}
export const QURIOZITY_CLIENT_CONTEXT={generationModel:QURIOZITY_MODELS.generation.model,generationEffort:QURIOZITY_MODELS.generation.effort,reviewModel:QURIOZITY_MODELS.review.model,reviewEffort:QURIOZITY_MODELS.review.effort} as const;
export function hasDefaultQuriozityProfile(provenance:Record<string,any>){
 const p=provenance,r=p.modelRouting??{};
 return (p.model??r.generationModel)===QURIOZITY_MODELS.generation.model&&(p.effort??r.generationEffort)===QURIOZITY_MODELS.generation.effort&&
  (r.reviewModel??p.reviewModel)===QURIOZITY_MODELS.review.model&&(r.reviewEffort??p.reviewEffort)===QURIOZITY_MODELS.review.effort;
}
