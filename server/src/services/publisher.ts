import { createHash, randomUUID } from 'node:crypto';
import { transaction, type Db } from '../db/database.ts';
import type { AttemptOutcome, Post } from '../domain/types.ts';
import { AppError, invalidTransition, notFound } from '../errors.ts';
import type { PublishOutcome, PublishingGateway } from '../publishing/gateway.ts';
import type { ActivityRepository } from '../repositories/activity.ts';
import type { PostsRepository } from '../repositories/posts.ts';
import type { SettingsRepository } from '../repositories/settings.ts';

export const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000];
const DUE_BATCH = 20;
/** Must exceed the longest adapter call (two requests at the max HTTP timeout). */
export const LEASE_MS = 5 * 60_000;

const PUBLISH_NOW_FROM = ['draft', 'needs_review', 'scheduled', 'failed', 'blocked', 'simulated'] as const;

export interface PublishRunResult {
  processed: number;
  skippedPaused: boolean;
  missed: number;
  recovered: number;
}

export class PublisherService {
  private readonly db: Db;
  private readonly posts: PostsRepository;
  private readonly settings: SettingsRepository;
  private readonly activity: ActivityRepository;
  private readonly gateway: PublishingGateway;
  private readonly now: () => Date;

  constructor(deps: {
    db: Db;
    posts: PostsRepository;
    settings: SettingsRepository;
    activity: ActivityRepository;
    gateway: PublishingGateway;
    now: () => Date;
  }) {
    this.db = deps.db;
    this.posts = deps.posts;
    this.settings = deps.settings;
    this.activity = deps.activity;
    this.gateway = deps.gateway;
    this.now = deps.now;
  }

  async publishDue(): Promise<PublishRunResult> {
    const result: PublishRunResult = { processed: 0, skippedPaused: false, missed: 0, recovered: this.recoverStaleLeases() };
    const now = this.now();
    for (const post of this.posts.due(now.toISOString(), DUE_BATCH)) {
      // Re-read each time so pausing takes effect mid-batch.
      const settings = this.settings.get();
      if (settings.publishingPaused) {
        result.skippedPaused = true;
        break;
      }
      // A previous publish in this batch may have taken long enough for this
      // post to miss its window. Measure lateness when we reach the post.
      const lateMs = this.now().getTime() - Date.parse(post.scheduledAt as string);
      if (post.attemptCount === 0 && lateMs > settings.maxLatenessMinutes * 60_000) {
        this.markMissed(post);
        result.missed += 1;
        continue;
      }
      if (this.posts.claim(post.id, this.now().toISOString())) {
        await this.run(post.id);
        result.processed += 1;
      }
    }
    return result;
  }

  /** Explicit human action, so it also counts as approval. Still honours the kill switch. */
  async publishNow(id: string): Promise<Post> {
    const post = this.posts.get(id);
    if (!post) throw notFound('Post', id);
    if (this.settings.get().publishingPaused) {
      throw new AppError(409, 'publishing_paused', 'Publishing is paused in settings');
    }
    const now = this.now().toISOString();
    if (!this.posts.transition(id, PUBLISH_NOW_FROM, 'scheduled', now, now)) {
      throw invalidTransition(post.status, 'publish');
    }
    if (!this.posts.claim(id, now)) throw invalidTransition('publishing', 'publish');
    await this.run(id);
    return this.posts.get(id) as Post;
  }

  private async run(id: string): Promise<void> {
    // Read after the claim, so an edit that won the race is what gets published.
    const post = this.posts.get(id) as Post;
    const startedAt = this.now().toISOString();
    let outcome: PublishOutcome;
    try {
      outcome = await this.gateway.publish({
        platform: post.platform,
        text: post.body,
        mediaUrls: post.mediaUrls,
        idempotencyKey: idempotencyKey(post),
      });
    } catch (error) {
      // The gateway converts adapter errors, so this is a bug. Outcome is unknowable.
      outcome = { kind: 'unknown', route: null, code: 'internal_error', message: error instanceof Error ? error.message : 'unknown error' };
    }
    this.record(post, outcome, startedAt);
  }

  private record(post: Post, outcome: PublishOutcome, startedAt: string): void {
    const now = this.now();
    const iso = now.toISOString();
    let attemptOutcome: AttemptOutcome;
    let activity: string;

    transaction(this.db, () => {
      switch (outcome.kind) {
        case 'published':
          attemptOutcome = 'published';
          activity = `Published to ${post.platform}`;
          this.posts.finish(post.id, { status: 'published', publishedAt: iso, externalId: outcome.externalId, externalUrl: outcome.externalUrl }, iso);
          break;
        case 'simulated':
          attemptOutcome = 'simulated';
          activity = `Dry run for ${post.platform}: nothing was posted`;
          this.posts.finish(post.id, { status: 'simulated' }, iso);
          break;
        case 'blocked':
          attemptOutcome = 'blocked';
          activity = `Blocked: ${outcome.message}`;
          this.posts.finish(post.id, { status: 'blocked', errorCode: outcome.code, errorMessage: outcome.message }, iso);
          break;
        case 'failed':
          attemptOutcome = 'failed';
          activity = `Failed: ${outcome.message}`;
          this.posts.finish(post.id, { status: 'failed', errorCode: outcome.code, errorMessage: outcome.message }, iso);
          break;
        case 'unknown':
          attemptOutcome = 'unknown';
          activity = `Outcome unknown, check ${post.platform} manually: ${outcome.message}`;
          this.posts.finish(post.id, { status: 'needs_attention', errorCode: outcome.code, errorMessage: outcome.message }, iso);
          break;
        case 'retry': {
          if (post.attemptCount >= MAX_ATTEMPTS) {
            attemptOutcome = 'failed';
            activity = `Failed after ${post.attemptCount} attempts: ${outcome.message}`;
            this.posts.finish(post.id, { status: 'failed', errorCode: outcome.code, errorMessage: outcome.message }, iso);
          } else {
            attemptOutcome = 'retry_scheduled';
            const backoff = BACKOFF_MS[post.attemptCount - 1] ?? 15 * 60_000;
            const delay = Math.max(backoff, outcome.retryAfterMs ?? 0);
            activity = `Retry scheduled: ${outcome.message}`;
            this.posts.finish(post.id, {
              status: 'scheduled',
              nextAttemptAt: new Date(now.getTime() + delay).toISOString(),
              errorCode: outcome.code,
              errorMessage: outcome.message,
            }, iso);
          }
          break;
        }
      }

      this.posts.insertAttempt({
        id: randomUUID(),
        postId: post.id,
        attemptNumber: post.attemptCount,
        mode: this.gateway.mode,
        route: outcome.route,
        outcome: attemptOutcome!,
        code: 'code' in outcome ? outcome.code : null,
        message: 'message' in outcome ? outcome.message : null,
        externalId: outcome.kind === 'published' ? outcome.externalId : null,
        startedAt,
        finishedAt: iso,
      });
      this.activity.add({
        type: `publish.${outcome.kind}`,
        level: outcome.kind === 'published' || outcome.kind === 'simulated' ? 'info' : outcome.kind === 'retry' ? 'warn' : 'error',
        message: activity!,
        postId: post.id,
      }, iso);
    });
  }

  private markMissed(post: Post): void {
    const iso = this.now().toISOString();
    const message = `Not published: more than the allowed lateness past ${post.scheduledAt}`;
    this.posts.finish(post.id, { status: 'failed', errorCode: 'missed_window', errorMessage: message }, iso);
    this.activity.add({ type: 'publish.missed', level: 'warn', message, postId: post.id }, iso);
  }

  /** A post stuck in `publishing` means a crash mid-request, so it may already be live. */
  private recoverStaleLeases(): number {
    const now = this.now();
    const stale = this.posts.staleLeases(new Date(now.getTime() - LEASE_MS).toISOString());
    for (const post of stale) {
      const iso = now.toISOString();
      this.record(post, {
        kind: 'unknown',
        route: null,
        code: 'interrupted',
        message: 'The server stopped while this post was being published',
      }, iso);
    }
    return stale.length;
  }
}

/** Stable across retries of the same text, and different once the text changes. */
export function idempotencyKey(post: Pick<Post, 'id' | 'body'>): string {
  return createHash('sha256').update(post.id).update('\0').update(post.body).digest('hex');
}
