import type { PlatformId } from '../domain/platforms.ts';
import type { Brand, Idea, Pillar } from '../domain/types.ts';
import type { FormatInsight } from '../repositories/feedback.ts';
import type { InstagramLearningSummary } from '../repositories/instagram-analytics.ts';

export interface IdeaCandidate {
  title: string;
  angle: string;
}

export interface ContentGenerator {
  readonly id: 'template' | 'anthropic' | 'chatgpt-plan';
  /** When true, generated posts always wait for human approval, even with autoApprove on. */
  readonly reviewRequired: boolean;
  generateIdeas(input: {
    brand: Brand;
    pillar: Pillar;
    count: number;
    avoidTitles: string[];
    /** Optional one-off direction from the operator. */
    prompt?: string;
    feedback?: FormatInsight[];
    feedbackNotes?: Array<{format:string;verdict:string|null;notes:string}>;
    feedbackExamples?: Array<{format:string;verdict:string|null;body:string}>;
    feedbackAnalytics?: InstagramLearningSummary[];
  }): Promise<IdeaCandidate[]>;
  draftPost(input: {
    brand: Brand;
    pillar: Pillar;
    idea: Pick<Idea, 'title' | 'angle'>;
    platform: PlatformId;
    maxChars: number;
    revisionNote?: string;
    feedback?: FormatInsight[];
    feedbackNotes?: Array<{format:string;verdict:string|null;notes:string}>;
    feedbackExamples?: Array<{format:string;verdict:string|null;body:string}>;
    feedbackAnalytics?: InstagramLearningSummary[];
  }): Promise<string>;
}

export class GenerationError extends Error {}
