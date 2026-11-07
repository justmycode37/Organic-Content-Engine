import { transaction, type Db } from '../db/database.ts';
import type { PlatformId } from '../domain/platforms.ts';
import type { Pillar, Post } from '../domain/types.ts';
import { AppError } from '../errors.ts';
import type { ContentGenerator } from '../generation/types.ts';
import type { Logger } from '../logger.ts';
import type { PublishingGateway } from '../publishing/gateway.ts';
import type { ActivityRepository } from '../repositories/activity.ts';
import type { IdeasRepository } from '../repositories/ideas.ts';
import type { PillarsRepository } from '../repositories/pillars.ts';
import type { PostsRepository } from '../repositories/posts.ts';
import type { SettingsRepository } from '../repositories/settings.ts';
import type { IdeationService } from './ideation.ts';
import { SLOT_WINDOW_MS, type PostService } from './posts.ts';
import { enumerateSlots } from './slots.ts';

export const CYCLE_JOB = 'autonomy_cycle';
const MIN_IDEA_BATCH = 3;
const MAX_IDEA_BATCH = 10;

export interface CycleResult {
  startedAt: string;
  createdPostIds: string[];
  ideasGenerated: number;
  skippedPlatforms: PlatformId[];
  stoppedReason: 'no_active_pillars' | 'no_targets' | 'review_backlog_full' | 'generator_error' | 'budget_reached' | 'calendar_full' | 'no_new_ideas';
  error: string | null;
}

export class AutonomyService {
  private readonly db: Db;
  private readonly posts: PostsRepository;
  private readonly ideas: IdeasRepository;
  private readonly pillars: PillarsRepository;
  private readonly settings: SettingsRepository;
  private readonly activity: ActivityRepository;
  private readonly ideation: IdeationService;
  private readonly postService: PostService;
  private readonly generator: ContentGenerator;
  private readonly gateway: PublishingGateway;
  private readonly logger: Logger;
  private readonly now: () => Date;
  private running = false;

  constructor(deps: {
    db: Db;
    posts: PostsRepository;
    ideas: IdeasRepository;
    pillars: PillarsRepository;
    settings: SettingsRepository;
    activity: ActivityRepository;
    ideation: IdeationService;
    postService: PostService;
    generator: ContentGenerator;
    gateway: PublishingGateway;
    logger: Logger;
    now: () => Date;
  }) {
    this.db = deps.db;
    this.posts = deps.posts;
    this.ideas = deps.ideas;
    this.pillars = deps.pillars;
    this.settings = deps.settings;
    this.activity = deps.activity;
    this.ideation = deps.ideation;
    this.postService = deps.postService;
    this.generator = deps.generator;
    this.gateway = deps.gateway;
    this.logger = deps.logger;
    this.now = deps.now;
  }

  get isRunning(): boolean {
    return this.running;
  }

  nextCycleAt(): string | null {
    const settings = this.settings.get();
    if (!settings.autonomyEnabled) return null;
    const { lastRunAt } = this.settings.getJob(CYCLE_JOB);
    if (!lastRunAt) return this.now().toISOString();
    return new Date(Date.parse(lastRunAt) + settings.cycleIntervalMinutes * 60_000).toISOString();
  }

  isDue(): boolean {
    const next = this.nextCycleAt();
    return next !== null && Date.parse(next) <= this.now().getTime();
  }

  /** Fills free calendar slots with drafted posts. Never publishes by itself. */
  async runCycle(): Promise<CycleResult> {
    if (this.running) throw new AppError(409, 'cycle_running', 'An autonomy cycle is already running');
    this.running = true;
    const startedAt = this.now().toISOString();
    try {
      // Recorded up front, so a failing generator is not retried every tick.
      this.settings.setJob(CYCLE_JOB, startedAt, null);
      const result = await this.fill(startedAt);
      this.settings.setJob(CYCLE_JOB, startedAt, result);
      this.activity.add({
        type: 'autonomy.cycle',
        level: result.error ? 'error' : 'info',
        message: `Created ${result.createdPostIds.length} posts (${result.stoppedReason})${result.error ? `: ${result.error}` : ''}`,
      }, this.now().toISOString());
      return result;
    } finally {
      this.running = false;
    }
  }

  private async fill(startedAt: string): Promise<CycleResult> {
    const settings = this.settings.get();
    const result: CycleResult = {
      startedAt,
      createdPostIds: [],
      ideasGenerated: 0,
      skippedPlatforms: [],
      stoppedReason: 'calendar_full',
      error: null,
    };

    const pillars = this.pillars.list(true);
    if (pillars.length === 0) return { ...result, stoppedReason: 'no_active_pillars' };

    const wanted = [...new Set(pillars.flatMap((p) => p.platforms))];
    const platforms = wanted.filter((p) => this.gateway.canTarget(p));
    result.skippedPlatforms = wanted.filter((p) => !platforms.includes(p));
    if (platforms.length === 0) return { ...result, stoppedReason: 'no_targets' };

    const autoApprove = settings.autoApprove && !this.generator.reviewRequired;
    const backlog = this.posts.countByStatus().needs_review ?? 0;
    const room = autoApprove ? settings.maxPostsPerCycle : settings.maxReviewBacklog - backlog;
    if (room <= 0) return { ...result, stoppedReason: 'review_backlog_full' };
    const budget = Math.min(settings.maxPostsPerCycle, room);

    const slots = enumerateSlots(this.now(), settings.planningHorizonDays, settings.postingSlots, settings.timezone);
    const turn = new Map<PlatformId, number>();

    for (const slot of slots) {
      for (const platform of platforms) {
        if (this.posts.slotTaken(platform, slot, SLOT_WINDOW_MS)) continue;
        if (result.createdPostIds.length >= budget) return { ...result, stoppedReason: 'budget_reached' };

        const candidates = pillars.filter((p) => p.platforms.includes(platform));
        const index = turn.get(platform) ?? 0;
        turn.set(platform, index + 1);
        const pillar = candidates[index % candidates.length] as Pillar;

        try {
          const post = await this.createPost(pillar, platform, slot, autoApprove, result);
          // The generator had nothing new. Asking again per slot would only add spend.
          if (!post) return { ...result, stoppedReason: 'no_new_ideas' };
          result.createdPostIds.push(post.id);
        } catch (error) {
          // Stop rather than burn API spend repeating a failing call.
          const message = error instanceof Error ? error.message : String(error);
          this.logger.error('autonomy cycle stopped', { error: message, pillarId: pillar.id, platform });
          return { ...result, stoppedReason: 'generator_error', error: message };
        }
      }
    }
    return result;
  }

  private async createPost(
    pillar: Pillar,
    platform: PlatformId,
    slot: Date,
    autoApprove: boolean,
    result: CycleResult,
  ): Promise<Post | null> {
    let idea = this.ideas.nextUnused(pillar.id);
    if (!idea) {
      const batch = Math.min(MAX_IDEA_BATCH, Math.max(MIN_IDEA_BATCH, this.settings.get().maxPostsPerCycle));
      const created = await this.ideation.generate(pillar, batch);
      result.ideasGenerated += created.length;
      idea = created[0] ?? null;
    }
    if (!idea) return null;

    const body = await this.ideation.draft(pillar, idea, platform);
    const issues = this.gateway.validate(platform, body, []);
    const mustReview = !autoApprove || issues.length > 0;
    const claimed = idea;
    return transaction(this.db, () => {
      this.ideas.update({ ...claimed, status: 'drafted', updatedAt: this.now().toISOString() });
      return this.posts.insert(this.postService.build({
        platform,
        body,
        mediaUrls: [],
        pillarId: pillar.id,
        ideaId: claimed.id,
        origin: 'autonomous',
        generator: this.generator.id,
        status: mustReview ? 'needs_review' : 'scheduled',
        scheduledAt: slot.toISOString(),
      }));
    });
  }
}
