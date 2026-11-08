import type { PlatformId } from '../domain/platforms.ts';
import type { Brand, Idea, Pillar } from '../domain/types.ts';

export interface IdeaCandidate {
  title: string;
  angle: string;
}

export interface ContentGenerator {
  readonly id: 'template' | 'anthropic' | 'chatgpt';
  /** When true, generated posts always wait for human approval, even with autoApprove on. */
  readonly reviewRequired: boolean;
  generateIdeas(input: {
    brand: Brand;
    pillar: Pillar;
    count: number;
    avoidTitles: string[];
    /** Optional one-off direction from the operator. */
    prompt?: string;
  }): Promise<IdeaCandidate[]>;
  draftPost(input: {
    brand: Brand;
    pillar: Pillar;
    idea: Pick<Idea, 'title' | 'angle'>;
    platform: PlatformId;
    maxChars: number;
    revisionNote?: string;
  }): Promise<string>;
}

export class GenerationError extends Error {}
