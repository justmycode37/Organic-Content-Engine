import type { PlatformId } from '../domain/platforms.ts';
import { countChars } from '../domain/platforms.ts';
import type { Idea, Pillar } from '../domain/types.ts';
import { AppError, notFound } from '../errors.ts';
import { GenerationError, type ContentGenerator } from '../generation/types.ts';
import type { PublishingGateway } from '../publishing/gateway.ts';
import type { IdeasRepository } from '../repositories/ideas.ts';
import type { PillarsRepository } from '../repositories/pillars.ts';
import type { SettingsRepository } from '../repositories/settings.ts';

const AVOID_TITLES_LIMIT = 100;

export class IdeationService {
  private readonly ideas: IdeasRepository;
  private readonly pillars: PillarsRepository;
  private readonly settings: SettingsRepository;
  private readonly generator: ContentGenerator;
  private readonly gateway: PublishingGateway;
  private readonly now: () => Date;

  constructor(deps: {
    ideas: IdeasRepository;
    pillars: PillarsRepository;
    settings: SettingsRepository;
    generator: ContentGenerator;
    gateway: PublishingGateway;
    now: () => Date;
  }) {
    this.ideas = deps.ideas;
    this.pillars = deps.pillars;
    this.settings = deps.settings;
    this.generator = deps.generator;
    this.gateway = deps.gateway;
    this.now = deps.now;
  }

  async addManual(input: { pillarId: string; title: string; angle: string }): Promise<Idea> {
    if (!(await this.pillars.get(input.pillarId))) throw notFound('Pillar', input.pillarId);
    const idea = await this.ideas.insert(this.build(input.pillarId, input.title, input.angle, 'manual'));
    if (!idea) throw new AppError(409, 'duplicate_idea', 'An idea with this title already exists for the pillar');
    return idea;
  }

  /** Stores new ideas, skipping duplicates, so the result can be shorter than `count`. */
  async generate(pillar: Pillar, count: number, prompt?: string): Promise<Idea[]> {
    const candidates = await this.generator.generateIdeas({
      brand: await this.settings.getBrand(),
      pillar,
      count,
      prompt,
      avoidTitles: await this.ideas.recentTitles(pillar.id, AVOID_TITLES_LIMIT),
    });
    const created: Idea[] = [];
    for (const candidate of candidates) {
      const title = candidate.title.trim();
      if (!title) continue;
      const idea = await this.ideas.insert(this.build(pillar.id, title, candidate.angle.trim(), this.generator.id));
      if (idea) created.push(idea);
    }
    return created;
  }

  /** Over-long drafts get one revision. Text is never silently truncated. */
  async draft(pillar: Pillar, idea: Idea, platform: PlatformId): Promise<string> {
    const maxChars = this.gateway.maxChars(platform);
    const input = { brand: await this.settings.getBrand(), pillar, idea, platform, maxChars };
    let body = await this.generator.draftPost(input);
    if (countChars(body) > maxChars) {
      body = await this.generator.draftPost({
        ...input,
        revisionNote: `it was ${countChars(body)} characters; the limit is ${maxChars}.`,
      });
    }
    if (countChars(body) > maxChars) {
      throw new GenerationError(`Draft exceeded ${maxChars} characters after revision`);
    }
    return body;
  }

  private build(pillarId: string, title: string, angle: string, source: string): Idea {
    const now = this.now().toISOString();
    return { id: crypto.randomUUID(), pillarId, title, angle, source, status: 'new', createdAt: now, updatedAt: now };
  }
}
