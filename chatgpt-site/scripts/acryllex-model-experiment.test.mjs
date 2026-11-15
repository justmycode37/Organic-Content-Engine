import test from 'node:test';
import assert from 'node:assert/strict';
import {VARIANTS,stepRole,languageCost,opusFormat} from './acryllex/model-experiment.mjs';
import {specSchema} from '../src/acryllex/schema.ts';
import {z} from 'zod';

test('Opus transports the renderer schema without silently discarding freeform controls or tuple coordinates',()=>{
 assert.equal(opusFormat({schema:specSchema}),null);
 assert.ok(opusFormat({schema:z.object({passed:z.boolean()}).strict()}));
});

test('mixed experiment keeps all verdicts on Sol and repairs on the generation model',()=>{
 const expected={plan:'generation',script:'generation','asset-needs':'generation','asset-pick':'generation',storyboard:'generation','sound-design':'generation',
  'fact-check':'review',coherence:'review','storyboard-review':'review','asset-verify':'review',
  'visual-subject-review':'review','visual-composition-review':'review','visual-continuity-review':'review','visual-style-reference-review':'review',
  'visual-final-review':'review','voice-delivery-review':'review','voice-pacing-review':'review','sound-review':'review','visual-final-review-repair':'generation'};
 for(const [step,role]of Object.entries(expected)){
  assert.equal(stepRole(step),role,step);
  assert.equal(VARIANTS['opus-sol'][role==='review'?'reviewModel':'generationModel'],role==='review'?'gpt-6.1-sol':'claude-opus-5-5');
 }
 assert.equal(VARIANTS['sol-sol'].generationModel,VARIANTS['sol-sol'].reviewModel);
 assert.equal(VARIANTS['opus-opus'].generationModel,VARIANTS['opus-opus'].reviewModel);
});

test('cost accounting includes reasoning output, cache discounts and long-context rates',()=>{
 assert.equal(languageCost({model:'gpt-6.1-sol',usage:{input_tokens:100000,output_tokens:50000,input_tokens_details:{cached_tokens:20000}}}),.662);
 assert.equal(languageCost({model:'gpt-6.1-sol',usage:{input_tokens:300000,output_tokens:50000,input_tokens_details:{cached_tokens:20000}}}),1.874);
 assert.equal(languageCost({model:'claude-opus-5-5',usage:{input_tokens:100000,output_tokens:50000,cache_read_input_tokens:20000,cache_creation_input_tokens:10000}}),1.454);
 assert.equal(languageCost({model:'gpt-6.1-sol'}),null);
 assert.throws(()=>languageCost({model:'unknown',usage:{}}),/No verified price/);
});
