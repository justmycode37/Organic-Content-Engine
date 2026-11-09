import { countChars } from '../domain/platforms.ts';
import type { ContentGenerator } from './types.ts';

const IDEA_PATTERNS: Array<{ title: string; angle: string }> = [
  { title: 'The most common mistake with {topic}', angle: 'Name one mistake {audience} make with {topic} and how to avoid it.' },
  { title: 'A simple checklist for {topic}', angle: 'Share a short, practical checklist for {topic}.' },
  { title: 'What nobody tells you about {topic}', angle: 'Share one non-obvious lesson about {topic}.' },
  { title: 'How we think about {topic}', angle: 'Explain the principle behind your approach to {topic}.' },
  { title: 'A question about {topic}', angle: 'Ask {audience} how they handle {topic} and invite replies.' },
  { title: 'Getting started with {topic}', angle: 'Give {audience} the single best first step for {topic}.' },
];

const fill = (template: string, topic: string, audience: string) =>
  template.replaceAll('{topic}', topic).replaceAll('{audience}', audience);

/**
 * Offline, deterministic scaffolding with no LLM. Output is a prompt for a human to
 * finish, not publishable copy, so it can never bypass review.
 */
export function createTemplateGenerator(): ContentGenerator {
  return {
    id: 'template',
    reviewRequired: true,
    async generateIdeas({ pillar, count, avoidTitles }) {
      const avoid = new Set(avoidTitles.map((t) => t.toLowerCase()));
      const topics = pillar.keywords.length > 0 ? pillar.keywords : [pillar.name];
      const audience = pillar.audience || 'people';
      const ideas = [];
      for (const pattern of IDEA_PATTERNS) {
        for (const topic of topics) {
          const title = fill(pattern.title, topic, audience);
          if (ideas.length < count && !avoid.has(title.toLowerCase())) {
            ideas.push({ title, angle: fill(pattern.angle, topic, audience) });
          }
        }
      }
      return ideas;
    },
    async draftPost({ idea, maxChars, feedbackContext, revisionNote }) {
      // Deterministic fallback cannot semantically apply editorial notes; appending
      // them would risk exposing internal instructions in user-facing copy.
      void feedbackContext; void revisionNote;
      const full = `${idea.title}\n\n${idea.angle}`;
      if (countChars(full) <= maxChars) return full;
      if (countChars(idea.title) <= maxChars) return idea.title;
      return [...new Intl.Segmenter().segment(idea.title)].slice(0, maxChars).map((s) => s.segment).join('');
    },
  };
}
