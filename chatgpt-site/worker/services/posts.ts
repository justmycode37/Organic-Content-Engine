import type { Db } from '../db/database.ts';
import type { PlatformId } from '../domain/platforms.ts';
import { PLATFORMS } from '../domain/platforms.ts';
import type { Post, PostStatus } from '../domain/types.ts';
import { AppError, invalidTransition, notFound } from '../errors.ts';
import type { ContentGenerator } from '../generation/types.ts';
import type { PublishingGateway } from '../publishing/gateway.ts';
import type { ActivityRepository } from '../repositories/activity.ts';
import type { IdeasRepository } from '../repositories/ideas.ts';
import type { PillarsRepository } from '../repositories/pillars.ts';
import type { PostsRepository } from '../repositories/posts.ts';
import type { SettingsRepository } from '../repositories/settings.ts';
import { instagramSnapshotSchedule } from '../repositories/instagram-analytics.ts';
import type { IdeationService } from './ideation.ts';
import { enumerateSlots } from './slots.ts';

const EDITABLE: readonly PostStatus[] = ['draft', 'needs_review', 'scheduled', 'failed', 'blocked', 'simulated'];
const SCHEDULABLE: readonly PostStatus[] = ['draft', 'needs_review', 'scheduled', 'failed', 'blocked', 'simulated', 'cancelled'];
const CANCELLABLE: readonly PostStatus[] = ['draft', 'needs_review', 'scheduled', 'failed', 'blocked', 'simulated'];
const DELETABLE: readonly PostStatus[] = ['draft', 'needs_review', 'cancelled', 'failed', 'blocked', 'simulated'];

export const SLOT_WINDOW_MS = 30 * 60_000;
/** How far ahead approve looks for a free slot when the proposed time has passed. */
const NEXT_SLOT_SEARCH_DAYS = 60;

export class PostService {
  private readonly db: Db;
  private readonly posts: PostsRepository;
  private readonly ideas: IdeasRepository;
  private readonly pillars: PillarsRepository;
  private readonly settings: SettingsRepository;
  private readonly activity: ActivityRepository;
  private readonly ideation: IdeationService;
  private readonly generator: ContentGenerator;
  private readonly gateway: PublishingGateway;
  private readonly now: () => Date;

  constructor(deps: {
    db: Db;
    posts: PostsRepository;
    ideas: IdeasRepository;
    pillars: PillarsRepository;
    settings: SettingsRepository;
    activity: ActivityRepository;
    ideation: IdeationService;
    generator: ContentGenerator;
    gateway: PublishingGateway;
    now: () => Date;
  }) {
    this.db = deps.db;
    this.posts = deps.posts;
    this.ideas = deps.ideas;
    this.pillars = deps.pillars;
    this.settings = deps.settings;
    this.activity = deps.activity;
    this.ideation = deps.ideation;
    this.generator = deps.generator;
    this.gateway = deps.gateway;
    this.now = deps.now;
  }

  async require(id: string): Promise<Post> {
    const post = await this.posts.get(id);
    if (!post) throw notFound('Post', id);
    return post;
  }

  /** Scheduling needs a real publishing route and content that would pass the gateway. */
  assertPublishable(platform: PlatformId, body: string, mediaUrls: string[]): void {
    if (this.gateway.status(platform).state === 'unsupported') {
      throw new AppError(409, 'platform_unsupported', `${PLATFORMS[platform].displayName} is not supported without a configured publishing gateway`);
    }
    const issues = this.gateway.validate(platform, body, mediaUrls);
    if (issues.length > 0) throw new AppError(422, 'content_invalid', 'Post cannot be published as written', issues);
  }

  async create(input: {
    platform: PlatformId;
    body: string;
    mediaUrls: string[];
    publishOptions?: Record<string, unknown>;
    pillarId?: string | null;
    scheduledAt?: string | null;
  }): Promise<Post> {
    if (input.pillarId && !(await this.pillars.get(input.pillarId))) throw notFound('Pillar', input.pillarId);
    const scheduledAt = input.scheduledAt ?? null;
    if (scheduledAt) {
      this.assertFuture(scheduledAt);
      this.assertPublishable(input.platform, input.body, input.mediaUrls);
    }
    return this.posts.insert(this.build({
      platform: input.platform,
      body: input.body,
      mediaUrls: input.mediaUrls,
      publishOptions: input.publishOptions ?? {},
      pillarId: input.pillarId ?? null,
      status: scheduledAt ? 'scheduled' : 'draft',
      scheduledAt,
    }));
  }

  /** Manual drafting from an idea, no slot assigned unless the caller gives one. */
  async createFromIdea(ideaId: string, platform: PlatformId, scheduledAt: string | null): Promise<Post> {
    const idea = await this.ideas.get(ideaId);
    if (!idea) throw notFound('Idea', ideaId);
    if (idea.status === 'rejected') throw new AppError(409, 'invalid_state', 'Cannot draft a rejected idea');
    const pillar = await this.pillars.get(idea.pillarId);
    if (!pillar) throw notFound('Pillar', idea.pillarId);
    if (scheduledAt) this.assertFuture(scheduledAt);
    const body = await this.ideation.draft(pillar, idea, platform);
    if (scheduledAt) this.assertPublishable(platform, body, []);
    const post = this.build({
      platform,
      body,
      mediaUrls: [],
      pillarId: idea.pillarId,
      ideaId: idea.id,
      generator: this.generator.id,
      status: scheduledAt ? 'scheduled' : 'draft',
      scheduledAt,
    });
    await this.db.batch([
      this.ideas.updateStatement({ ...idea, status: 'drafted', updatedAt: this.iso() }),
      this.posts.insertStatement(post),
    ]);
    return post;
  }

  async update(id: string, patch: { body?: string; mediaUrls?: string[]; platform?: PlatformId; publishOptions?: Record<string,unknown> }): Promise<Post> {
    const post = await this.require(id);
    const next = {
      body: patch.body ?? post.body,
      mediaUrls: patch.mediaUrls ?? post.mediaUrls,
      publishOptions: patch.publishOptions ?? post.publishOptions ?? {},
      platform: patch.platform ?? post.platform,
    };
    if (post.status === 'scheduled') this.assertPublishable(next.platform, next.body, next.mediaUrls);
    if (!(await this.posts.updateContent(id, EDITABLE, next, this.iso()))) throw invalidTransition(post.status, 'edit');
    return this.require(id);
  }

  async schedule(id: string, scheduledAt: string): Promise<Post> {
    const post = await this.require(id);
    this.assertFuture(scheduledAt);
    this.assertPublishable(post.platform, post.body, post.mediaUrls);
    if (!(await this.posts.transition(id, SCHEDULABLE, 'scheduled', scheduledAt, this.iso()))) {
      throw invalidTransition(post.status, 'schedule');
    }
    return this.require(id);
  }

  /** Human sign-off. Keeps the proposed time if still ahead, otherwise takes the next free slot. */
  async approve(id: string, scheduledAt?: string): Promise<Post> {
    const post = await this.require(id);
    if (post.status !== 'needs_review' && post.status !== 'draft') throw invalidTransition(post.status, 'approve');
    if (scheduledAt) this.assertFuture(scheduledAt);
    const keep = post.scheduledAt && Date.parse(post.scheduledAt) > this.now().getTime();
    const time = scheduledAt ?? (keep ? (post.scheduledAt as string) : await this.nextFreeSlot(post.platform));
    this.assertPublishable(post.platform, post.body, post.mediaUrls);
    if (!(await this.posts.transition(id, ['needs_review', 'draft'], 'scheduled', time, this.iso()))) {
      throw invalidTransition(post.status, 'approve');
    }
    await this.activity.add({ type: 'post.approved', message: `Approved for ${time}`, postId: id }, this.iso());
    return this.require(id);
  }

  async unschedule(id: string): Promise<Post> {
    const post = await this.require(id);
    if (!(await this.posts.transition(id, ['scheduled', 'needs_review'], 'draft', null, this.iso()))) {
      throw invalidTransition(post.status, 'unschedule');
    }
    return this.require(id);
  }

  async cancel(id: string): Promise<Post> {
    const post = await this.require(id);
    if (!(await this.posts.transition(id, CANCELLABLE, 'cancelled', post.scheduledAt, this.iso()))) {
      throw invalidTransition(post.status, 'cancel');
    }
    return this.require(id);
  }

  async delete(id: string): Promise<void> {
    const post = await this.require(id);
    if (!(await this.posts.delete(id, DELETABLE))) throw invalidTransition(post.status, 'delete');
  }

  /**
   * Resolves a post whose outcome could not be determined. A person checks the
   * platform; the server never guesses, because a wrong guess means a duplicate post.
   */
  async resolve(id: string, input: { outcome: 'published' | 'not_published'; externalId?: string; externalUrl?: string }): Promise<Post> {
    const post = await this.require(id);
    if (post.status !== 'needs_attention') throw invalidTransition(post.status, 'resolve');
    const now = this.iso();
    await this.db.batch([
      this.posts.finishStatement(
        id,
        input.outcome === 'published'
          ? { status: 'published', publishedAt: now, externalId: input.externalId ?? null, externalUrl: input.externalUrl ?? null }
          : { status: 'failed', errorCode: 'confirmed_not_published', errorMessage: 'Confirmed not published by operator' },
        now,
      ),
      ...(input.outcome === 'published' && post.platform === 'instagram'
        ? instagramSnapshotSchedule(this.db, post.id, now, now)
        : []),
      this.activity.addStatement({ type: 'post.resolved', message: `Resolved as ${input.outcome}`, postId: id }, now),
    ]);
    return this.require(id);
  }

  async nextFreeSlot(platform: PlatformId): Promise<string> {
    const settings = await this.settings.get();
    const slots = enumerateSlots(this.now(), NEXT_SLOT_SEARCH_DAYS, settings.postingSlots, settings.timezone);
    for (const slot of slots) {
      if (!(await this.posts.slotTaken(platform, slot, SLOT_WINDOW_MS))) return slot.toISOString();
    }
    throw new AppError(409, 'no_free_slot', `No free posting slot in the next ${NEXT_SLOT_SEARCH_DAYS} days`);
  }

  build(input: {
    platform: PlatformId;
    body: string;
    mediaUrls: string[];
    publishOptions?: Record<string, unknown>;
    pillarId: string | null;
    ideaId?: string | null;
    origin?: Post['origin'];
    generator?: string | null;
    status: PostStatus;
    scheduledAt: string | null;
  }): Post {
    const now = this.iso();
    return {
      id: crypto.randomUUID(),
      ideaId: input.ideaId ?? null,
      pillarId: input.pillarId,
      platform: input.platform,
      body: input.body,
      mediaUrls: input.mediaUrls,
      publishOptions: input.publishOptions ?? {},
      status: input.status,
      origin: input.origin ?? 'manual',
      generator: input.generator ?? null,
      scheduledAt: input.scheduledAt,
      publishedAt: null,
      externalId: null,
      externalUrl: null,
      attemptCount: 0,
      nextAttemptAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  private assertFuture(iso: string): void {
    if (Date.parse(iso) <= this.now().getTime()) {
      throw new AppError(422, 'scheduled_in_past', 'scheduledAt must be in the future');
    }
  }

  private iso(): string {
    return this.now().toISOString();
  }
}
