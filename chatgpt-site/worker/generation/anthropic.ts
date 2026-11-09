import { FORMAT_RESEARCH, CONTENT_DRAFTING } from './content-policies.ts';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { PLATFORMS } from '../domain/platforms.ts';
import type { Brand, Pillar } from '../domain/types.ts';
import { GenerationError, type ContentGenerator } from './types.ts';

const IdeasSchema = z.object({
  ideas: z.array(z.object({ title: z.string(), angle: z.string() })),
});
const DraftSchema = z.object({ body: z.string() });

/** The one SDK call this generator makes, so tests can substitute it without a network. */
export type ParseFn = (params: {
  system: string;
  prompt: string;
  schema: z.ZodType;
}) => Promise<{ stopReason: string | null; output: unknown }>;

const SYSTEM = `You write organic social media content for the brand brief you are given.
Write like a thoughtful practitioner, not a marketer: specific, plain, and useful.
Never invent statistics, quotes, customers, results, or personal anecdotes. If a point would need a fact you were not given, make a claim you can stand behind in general terms or frame it as a question.
Output only the requested structure.`;

function brief(brand: Brand, pillar: Pillar): string {
  return [
    `Brand: ${brand.name || '(unnamed)'}`,
    `About the brand: ${brand.description || '(none)'}`,
    `Brand audience: ${brand.audience || '(general)'}`,
    `Brand voice: ${brand.voice || '(natural)'}`,
    `Must avoid: ${brand.avoid || '(nothing specific)'}`,
    `Topic pillar: ${pillar.name}`,
    `Description: ${pillar.description || '(none)'}`,
    `Audience: ${pillar.audience || '(general)'}`,
    `Tone: ${pillar.tone || '(natural)'}`,
    `Keywords: ${pillar.keywords.join(', ') || '(none)'}`,
  ].join('\n');
}

export function createAnthropicParse(apiKey: string | null, model: string): ParseFn {
  let client: Anthropic | null = null;
  return async ({ system, prompt, schema }) => {
    // Lazy, so a missing credential fails the job that needs it rather than every request.
    if (!apiKey) throw new GenerationError('ANTHROPIC_API_KEY is not set');
    client ??= new Anthropic({ apiKey });
    const response = await client.beta.messages.parse({
      model,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: betaZodOutputFormat(schema) },
      system,
      messages: [{ role: 'user', content: prompt }],
    });
    return { stopReason: response.stop_reason, output: response.parsed_output };
  };
}

export function createAnthropicGenerator(parse: ParseFn): ContentGenerator {
  const call = async <T>(prompt: string, schema: z.ZodType<T>, policy: string): Promise<T> => {
    let reply: Awaited<ReturnType<ParseFn>>;
    try {
      reply = await parse({ system: `${SYSTEM}\n\n${policy}`, prompt, schema });
    } catch (error) {
      if (error instanceof GenerationError) throw error;
      const status = error instanceof Anthropic.APIError ? ` (HTTP ${error.status})` : '';
      throw new GenerationError(`The content generator request failed${status}`);
    }
    const { stopReason, output } = reply;
    if (stopReason === 'refusal') throw new GenerationError('The model declined this request');
    if (stopReason === 'max_tokens') throw new GenerationError('The model response was cut off');
    const parsed = schema.safeParse(output);
    if (!parsed.success) throw new GenerationError('The model returned an invalid structure');
    return parsed.data;
  };

  return {
    id: 'anthropic',
    reviewRequired: false,
    async generateIdeas({ brand, pillar, count, avoidTitles, prompt: direction }) {
      const avoid = avoidTitles.length > 0
        ? `\n\nDo not repeat or closely paraphrase these existing ideas:\n${avoidTitles.map((t) => `- ${t}`).join('\n')}`
        : '';
      const extra = direction ? `\n\nDirection for this batch: ${direction}` : '';
      const prompt = `${brief(brand, pillar)}\n\nPropose ${count} distinct post ideas. For each, give a short title and an evidence brief in angle following the research policy. Target platforms: ${pillar.platforms.join(', ')}.${extra}${avoid}`;
      const { ideas } = await call(prompt, IdeasSchema, FORMAT_RESEARCH);
      return ideas.slice(0, count);
    },
    async draftPost({ brand, pillar, idea, platform, maxChars, revisionNote }) {
      const note = revisionNote ? `\n\nA previous draft was rejected: ${revisionNote}` : '';
      const prompt = `${brief(brand, pillar)}\n\nWrite one ${PLATFORMS[platform].displayName} post.\nIdea: ${idea.title}\nAngle: ${idea.angle}\n\nHard limit: ${maxChars} characters including spaces and hashtags. Aim well under it. Follow the platform's norms for length and formatting.${note}`;
      const { body } = await call(prompt, DraftSchema, CONTENT_DRAFTING);
      return body.trim();
    },
  };
}
