import { changed, type Db, type Row } from '../db/database.ts';
import type { PlatformId } from '../domain/platforms.ts';
import type { AttemptOutcome, Post, PostStatus, PublishAttempt, PublishMode } from '../domain/types.ts';

const toPost = (r: Row): Post => ({
  id: r.id as string,
  ideaId: r.idea_id as string | null,
  pillarId: r.pillar_id as string | null,
  platform: r.platform as PlatformId,
  body: r.body as string,
  mediaUrls: JSON.parse(r.media_urls as string),
  status: r.status as PostStatus,
  origin: r.origin as Post['origin'],
  generator: r.generator as string | null,
  scheduledAt: r.scheduled_at as string | null,
  publishedAt: r.published_at as string | null,
  externalId: r.external_id as string | null,
  externalUrl: r.external_url as string | null,
  attemptCount: r.attempt_count as number,
  nextAttemptAt: r.next_attempt_at as string | null,
  lastErrorCode: r.last_error_code as string | null,
  lastErrorMessage: r.last_error_message as string | null,
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
});

const toAttempt = (r: Row): PublishAttempt => ({
  id: r.id as string,
  postId: r.post_id as string,
  attemptNumber: r.attempt_number as number,
  mode: r.mode as PublishMode,
  route: r.route as PublishAttempt['route'],
  outcome: r.outcome as AttemptOutcome,
  code: r.code as string | null,
  message: r.message as string | null,
  externalId: r.external_id as string | null,
  startedAt: r.started_at as string,
  finishedAt: r.finished_at as string,
});

export interface PostFilter {
  status?: PostStatus;
  platform?: PlatformId;
  pillarId?: string;
  from?: string;
  to?: string;
  limit: number;
  offset: number;
}

export interface FinishFields {
  status: PostStatus;
  publishedAt?: string | null;
  externalId?: string | null;
  externalUrl?: string | null;
  nextAttemptAt?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}

/** Statuses holding a slot on the calendar. */
const SLOT_HOLDERS = `('needs_review','scheduled','publishing')`;

export class PostsRepository {
  private readonly db: Db;
  constructor(db: Db) {
    this.db = db;
  }

  async get(id: string): Promise<Post | null> {
    const row = await this.db.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first<Row>();
    return row ? toPost(row) : null;
  }

  async list(filter: PostFilter): Promise<{ items: Post[]; total: number }> {
    const clauses: string[] = [];
    const params: string[] = [];
    if (filter.status) { clauses.push('status = ?'); params.push(filter.status); }
    if (filter.platform) { clauses.push('platform = ?'); params.push(filter.platform); }
    if (filter.pillarId) { clauses.push('pillar_id = ?'); params.push(filter.pillarId); }
    if (filter.from) { clauses.push('scheduled_at >= ?'); params.push(filter.from); }
    if (filter.to) { clauses.push('scheduled_at < ?'); params.push(filter.to); }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const total = await this.db.prepare(`SELECT COUNT(*) AS n FROM posts ${where}`).bind(...params).first<{ n: number }>();
    const { results } = await this.db
      .prepare(`SELECT * FROM posts ${where} ORDER BY COALESCE(scheduled_at, created_at) DESC, id LIMIT ? OFFSET ?`)
      .bind(...params, filter.limit, filter.offset)
      .all<Row>();
    return { items: results.map(toPost), total: total?.n ?? 0 };
  }

  insertStatement(p: Post): D1PreparedStatement {
    return this.db
      .prepare(
        `INSERT INTO posts (id, idea_id, pillar_id, platform, body, media_urls, status, origin, generator, scheduled_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(p.id, p.ideaId, p.pillarId, p.platform, p.body, JSON.stringify(p.mediaUrls), p.status, p.origin, p.generator, p.scheduledAt, p.createdAt, p.updatedAt);
  }

  async insert(p: Post): Promise<Post> {
    await this.insertStatement(p).run();
    return p;
  }

  /** Conditional on status, so a concurrent claim by the publisher wins cleanly. */
  async updateContent(
    id: string,
    fromStatuses: readonly PostStatus[],
    content: { body: string; mediaUrls: string[]; platform: PlatformId },
    now: string,
  ): Promise<boolean> {
    const placeholders = fromStatuses.map(() => '?').join(',');
    const result = await this.db
      .prepare(`UPDATE posts SET body = ?, media_urls = ?, platform = ?, updated_at = ? WHERE id = ? AND status IN (${placeholders})`)
      .bind(content.body, JSON.stringify(content.mediaUrls), content.platform, now, id, ...fromStatuses)
      .run();
    return changed(result) > 0;
  }

  /** Moves a post to a new status and clears retry bookkeeping. */
  async transition(
    id: string,
    fromStatuses: readonly PostStatus[],
    to: PostStatus,
    scheduledAt: string | null,
    now: string,
  ): Promise<boolean> {
    const placeholders = fromStatuses.map(() => '?').join(',');
    const result = await this.db
      .prepare(
        `UPDATE posts SET status = ?, scheduled_at = ?, attempt_count = 0, next_attempt_at = NULL, lease_at = NULL,
           last_error_code = NULL, last_error_message = NULL, updated_at = ?
         WHERE id = ? AND status IN (${placeholders})`,
      )
      .bind(to, scheduledAt, now, id, ...fromStatuses)
      .run();
    return changed(result) > 0;
  }

  async delete(id: string, fromStatuses: readonly PostStatus[]): Promise<boolean> {
    const placeholders = fromStatuses.map(() => '?').join(',');
    const result = await this.db.prepare(`DELETE FROM posts WHERE id = ? AND status IN (${placeholders})`).bind(id, ...fromStatuses).run();
    return changed(result) > 0;
  }

  async due(now: string, limit: number): Promise<Post[]> {
    const { results } = await this.db
      .prepare(
        `SELECT * FROM posts WHERE status = 'scheduled' AND scheduled_at <= ?
           AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
         ORDER BY scheduled_at, id LIMIT ?`,
      )
      .bind(now, now, limit)
      .all<Row>();
    return results.map(toPost);
  }

  /** Atomic: of any number of concurrent callers, exactly one gets true. */
  async claim(id: string, now: string): Promise<boolean> {
    const result = await this.db
      .prepare(
        `UPDATE posts SET status = 'publishing', lease_at = ?, attempt_count = attempt_count + 1, updated_at = ?
         WHERE id = ? AND status = 'scheduled'`,
      )
      .bind(now, now, id)
      .run();
    return changed(result) > 0;
  }

  async staleLeases(before: string): Promise<Post[]> {
    const { results } = await this.db
      .prepare(`SELECT * FROM posts WHERE status = 'publishing' AND lease_at < ?`)
      .bind(before)
      .all<Row>();
    return results.map(toPost);
  }

  finishStatement(id: string, fields: FinishFields, now: string): D1PreparedStatement {
    return this.db
      .prepare(
        `UPDATE posts SET status = ?, published_at = COALESCE(?, published_at), external_id = COALESCE(?, external_id),
           external_url = COALESCE(?, external_url), next_attempt_at = ?, lease_at = NULL,
           last_error_code = ?, last_error_message = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(
        fields.status,
        fields.publishedAt ?? null,
        fields.externalId ?? null,
        fields.externalUrl ?? null,
        fields.nextAttemptAt ?? null,
        fields.errorCode ?? null,
        fields.errorMessage ?? null,
        now,
        id,
      );
  }

  /** Is this platform's calendar taken within ±windowMs of the instant? */
  async slotTaken(platform: PlatformId, instant: Date, windowMs: number): Promise<boolean> {
    const row = await this.db
      .prepare(
        `SELECT 1 AS taken FROM posts WHERE platform = ? AND status IN ${SLOT_HOLDERS}
           AND scheduled_at > ? AND scheduled_at < ? LIMIT 1`,
      )
      .bind(
        platform,
        new Date(instant.getTime() - windowMs).toISOString(),
        new Date(instant.getTime() + windowMs).toISOString(),
      )
      .first();
    return row !== null;
  }

  async countByStatus(): Promise<Partial<Record<PostStatus, number>>> {
    const { results } = await this.db
      .prepare('SELECT status, COUNT(*) AS n FROM posts GROUP BY status')
      .all<{ status: PostStatus; n: number }>();
    return Object.fromEntries(results.map((r) => [r.status, r.n]));
  }

  insertAttemptStatement(a: PublishAttempt): D1PreparedStatement {
    return this.db
      .prepare(
        `INSERT INTO publish_attempts (id, post_id, attempt_number, mode, route, outcome, code, message, external_id, started_at, finished_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(a.id, a.postId, a.attemptNumber, a.mode, a.route, a.outcome, a.code, a.message, a.externalId, a.startedAt, a.finishedAt);
  }

  async attempts(postId: string): Promise<PublishAttempt[]> {
    const { results } = await this.db
      .prepare('SELECT * FROM publish_attempts WHERE post_id = ? ORDER BY started_at, attempt_number')
      .bind(postId)
      .all<Row>();
    return results.map(toAttempt);
  }
}
