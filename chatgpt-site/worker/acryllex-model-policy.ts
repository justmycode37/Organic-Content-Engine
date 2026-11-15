/** Persistent Acryllex defaults; one-off comparison settings stay in their runner. */
export const ACRYLLEX_MODELS={generation:{model:'claude-opus-5-5',effort:'medium'},review:{model:'gpt-6.1-sol',effort:'xhigh'}} as const;
export function acryllexStepRole(step:string):'generation'|'review'{
 if(step.endsWith('-repair'))return 'generation';
 if(['fact-check','coherence','novelty','storyboard-review','asset-verify','sound-review'].includes(step)||step.startsWith('visual-')||step.startsWith('voice-'))return 'review';
 return 'generation';
}
export const ACRYLLEX_CLIENT_CONTEXT={generationModel:ACRYLLEX_MODELS.generation.model,generationEffort:ACRYLLEX_MODELS.generation.effort,reviewModel:ACRYLLEX_MODELS.review.model,reviewEffort:ACRYLLEX_MODELS.review.effort} as const;
export function hasDefaultAcryllexProfile(provenance:Record<string,any>){
 const p=provenance,r=p.modelRouting??{};
 return (r.generationModel??p.model)===ACRYLLEX_MODELS.generation.model&&(r.generationEffort??p.effort)===ACRYLLEX_MODELS.generation.effort&&
  (r.reviewModel??p.reviewModel)===ACRYLLEX_MODELS.review.model&&(r.reviewEffort??p.reviewEffort)===ACRYLLEX_MODELS.review.effort;
}
