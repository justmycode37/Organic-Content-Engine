import type { Db, Row } from '../db/database.ts';
import type { PlatformId } from '../domain/platforms.ts';

export const INSTAGRAM_SNAPSHOT_BUCKETS = [
  { name: '1h', offsetMs: 60 * 60_000 },
  { name: '24h', offsetMs: 24 * 60 * 60_000 },
  { name: '72h', offsetMs: 72 * 60 * 60_000 },
  { name: '7d', offsetMs: 7 * 24 * 60 * 60_000 },
  { name: '28d', offsetMs: 28 * 24 * 60 * 60_000 },
] as const;

export type InstagramAgeBucket = (typeof INSTAGRAM_SNAPSHOT_BUCKETS)[number]['name'];
export type InstagramSnapshotStatus = 'pending' | 'collecting' | 'complete' | 'partial' | 'failed';

export interface InstagramMetrics {
  views: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  saves: number | null;
  shares: number | null;
  totalInteractions: number | null;
  averageWatchTimeMs: number | null;
  totalWatchTimeMs: number | null;
  likesPerReach: number | null;
  sharesPerReach: number | null;
  savesPerReach: number | null;
  follows: number | null;
  profileVisits: number | null;
}

export interface InstagramSnapshot {
  ageBucket: InstagramAgeBucket;
  scheduledAt: string;
  capturedAt: string | null;
  status: InstagramSnapshotStatus;
  attemptCount: number;
  nextAttemptAt: string | null;
  metrics: InstagramMetrics | null;
  unknownMetrics: Record<string, string>;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface InstagramPostAnalytics {
  postId: string;
  body: string;
  publishedAt: string;
  externalUrl: string | null;
  format: string | null;
  style: string | null;
  hookVariant: string | null;
  claimsLedgerFile: string | null;
  snapshots: InstagramSnapshot[];
}

export interface InstagramComparison {
  ageBucket: InstagramAgeBucket;
  format: string;
  style: string;
  samples: number;
  likesPerReach: number | null;
  sharesPerReach: number | null;
  savesPerReach: number | null;
  averageWatchTimeMs: number | null;
}

export interface InstagramAnalyticsPage {
  posts: InstagramPostAnalytics[];
  comparisons: InstagramComparison[];
}

export interface InstagramLearningSummary {
  ageBucket: InstagramAgeBucket;
  format: string;
  style: string | null;
  samples: number;
  likesPerReach: number | null;
  sharesPerReach: number | null;
  savesPerReach: number | null;
  averageWatchTimeMs: number | null;
}

interface SnapshotRow extends Row {
  id: string;
  post_id: string;
  age_bucket: string;
  scheduled_at: string;
  captured_at: string | null;
  status: string;
  attempt_count: number;
  next_attempt_at: string | null;
  lease_id: string | null;
  lease_until: string | null;
  raw_json: string | null;
  metrics_json: string | null;
  error_code: string | null;
  error_message: string | null;
  updated_at: string;
}

interface DueSnapshotRow extends SnapshotRow {
  external_id: string | null;
  publish_options: string;
}

const validBucket = (value: string): value is InstagramAgeBucket =>
  INSTAGRAM_SNAPSHOT_BUCKETS.some((bucket) => bucket.name === value);

/** Create the fixed snapshot schedule as part of the publish-state D1 batch. */
export function instagramSnapshotSchedule(db: Db, postId: string, publishedAt: string, now = publishedAt) {
  const base = Date.parse(publishedAt);
  return INSTAGRAM_SNAPSHOT_BUCKETS.map((bucket) => db.prepare(
    `INSERT OR IGNORE INTO instagram_insight_snapshots
       (id,post_id,age_bucket,scheduled_at,status,attempt_count,next_attempt_at,updated_at)
     VALUES (?,?,?,?, 'pending',0,?,?)`,
  ).bind(crypto.randomUUID(), postId, bucket.name, new Date(base + bucket.offsetMs).toISOString(), new Date(base + bucket.offsetMs).toISOString(), now));
}

function readMetrics(value: string | null): { metrics: InstagramMetrics | null; unknownMetrics: Record<string, string> } {
  if (!value) return { metrics: null, unknownMetrics: {} };
  try {
    const parsed = JSON.parse(value) as { metrics?: InstagramMetrics; unknownMetrics?: Record<string, string> };
    return { metrics: parsed.metrics ?? null, unknownMetrics: parsed.unknownMetrics ?? {} };
  } catch {
    return { metrics: null, unknownMetrics: { response: 'stored_metrics_unreadable' } };
  }
}

function average(values: Array<number | null | undefined>): number | null {
  const known = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return known.length ? known.reduce((sum, value) => sum + value, 0) / known.length : null;
}

function makeComparisonGroups(posts: InstagramPostAnalytics[]): InstagramComparison[] {
  const groups = new Map<string, { bucket: InstagramAgeBucket; format: string; style: string; metrics: InstagramMetrics[] }>();
  for (const post of posts) {
    for (const snapshot of post.snapshots) {
      if (!['complete', 'partial'].includes(snapshot.status) || !snapshot.metrics) continue;
      const format = post.format?.trim() || '(unlabeled)';
      const style = post.style?.trim() || '(unlabeled)';
      const key = `${snapshot.ageBucket}\0${format.toLocaleLowerCase()}\0${style.toLocaleLowerCase()}`;
      const group = groups.get(key) ?? { bucket: snapshot.ageBucket, format, style, metrics: [] };
      group.metrics.push(snapshot.metrics);
      groups.set(key, group);
    }
  }
  return [...groups.values()].map((group) => ({
    ageBucket: group.bucket,
    format: group.format,
    style: group.style,
    samples: group.metrics.length,
    likesPerReach: average(group.metrics.map((metrics) => metrics.likesPerReach)),
    sharesPerReach: average(group.metrics.map((metrics) => metrics.sharesPerReach)),
    savesPerReach: average(group.metrics.map((metrics) => metrics.savesPerReach)),
    averageWatchTimeMs: average(group.metrics.map((metrics) => metrics.averageWatchTimeMs)),
  })).sort((a, b) => INSTAGRAM_SNAPSHOT_BUCKETS.findIndex((bucket) => bucket.name === a.ageBucket)
    - INSTAGRAM_SNAPSHOT_BUCKETS.findIndex((bucket) => bucket.name === b.ageBucket)
    || a.format.localeCompare(b.format) || a.style.localeCompare(b.style));
}

function snapshotFrom(row: SnapshotRow): InstagramSnapshot {
  const { metrics, unknownMetrics } = readMetrics(row.metrics_json);
  return {
    ageBucket: validBucket(row.age_bucket) ? row.age_bucket : '1h',
    scheduledAt: row.scheduled_at,
    capturedAt: row.captured_at,
    status: row.status as InstagramSnapshotStatus,
    attemptCount: row.attempt_count,
    nextAttemptAt: row.next_attempt_at,
    metrics,
    unknownMetrics,
    errorCode: row.error_code,
    errorMessage: row.error_message,
  };
}

export class InstagramAnalyticsRepository {
  constructor(private readonly db: Db) {}

  /** Backfills jobs for already-published Reels and is harmless on repeated ticks. */
  async ensureSchedules(now: string): Promise<number> {
    const { results } = await this.db.prepare(
      `SELECT p.id,p.published_at FROM posts p
       WHERE p.platform='instagram' AND p.status='published' AND p.published_at IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM instagram_insight_snapshots s WHERE s.post_id=p.id)
       ORDER BY p.published_at DESC LIMIT 20`,
    ).all<{ id: string; published_at: string }>();
    const statements = results.flatMap((post) => instagramSnapshotSchedule(this.db, post.id, post.published_at, now));
    if (statements.length) await this.db.batch(statements);
    return results.length;
  }

  async due(now: string, limit = 20): Promise<DueSnapshotRow[]> {
    const { results } = await this.db.prepare(
      `SELECT s.*,p.external_id,p.publish_options FROM instagram_insight_snapshots s
       JOIN posts p ON p.id=s.post_id
       WHERE p.platform='instagram' AND p.status='published'
         AND ((s.status='pending' AND COALESCE(s.next_attempt_at,s.scheduled_at)<=?)
           OR (s.status='collecting' AND s.lease_until<=?))
       ORDER BY s.scheduled_at,s.post_id LIMIT ?`,
    ).bind(now, now, limit).all<DueSnapshotRow>();
    return results;
  }

  async claim(id: string, now: string, leaseId: string, leaseUntil: string): Promise<boolean> {
    const claimed = await this.db.prepare(
      `UPDATE instagram_insight_snapshots SET status='collecting',lease_id=?,lease_until=?,attempt_count=attempt_count+1,updated_at=?
       WHERE id=? AND ((status='pending' AND COALESCE(next_attempt_at,scheduled_at)<=?) OR (status='collecting' AND lease_until<=?))
       RETURNING id`,
    ).bind(leaseId, leaseUntil, now, id, now, now).first<{ id: string }>();
    return Boolean(claimed);
  }

  async complete(input: {
    id: string; leaseId: string; status: 'complete' | 'partial'; capturedAt: string; rawJson: string;
    metricsJson: string; errorCode?: string | null; errorMessage?: string | null;
  }): Promise<void> {
    await this.db.prepare(
      `UPDATE instagram_insight_snapshots SET status=?,captured_at=?,raw_json=?,metrics_json=?,error_code=?,error_message=?,
         lease_id=NULL,lease_until=NULL,next_attempt_at=NULL,updated_at=? WHERE id=? AND lease_id=?`,
    ).bind(input.status, input.capturedAt, input.rawJson, input.metricsJson, input.errorCode ?? null, input.errorMessage ?? null, input.capturedAt, input.id, input.leaseId).run();
  }

  async fail(input: {
    id: string; leaseId: string; now: string; nextAttemptAt: string | null; code: string; message: string; rawJson: string | null;
  }): Promise<void> {
    await this.db.prepare(
      `UPDATE instagram_insight_snapshots SET status=?,captured_at=?,raw_json=?,metrics_json=?,error_code=?,error_message=?,
         lease_id=NULL,lease_until=NULL,next_attempt_at=?,updated_at=? WHERE id=? AND lease_id=?`,
    ).bind(input.nextAttemptAt ? 'pending' : 'failed', input.now, input.rawJson, JSON.stringify({
      metrics: { views: null, reach: null, likes: null, comments: null, saves: null, shares: null, totalInteractions: null,
        averageWatchTimeMs: null, totalWatchTimeMs: null, likesPerReach: null, sharesPerReach: null, savesPerReach: null,
        follows: null, profileVisits: null },
      unknownMetrics: { all: input.code },
    }), input.code, input.message, input.nextAttemptAt, input.now, input.id, input.leaseId).run();
  }

  async retryFailed(now: string): Promise<number> {
    const result = await this.db.prepare(
      `UPDATE instagram_insight_snapshots SET status='pending',next_attempt_at=?,lease_id=NULL,lease_until=NULL,updated_at=?
       WHERE status='failed'`,
    ).bind(now, now).run();
    return Number(result.meta.changes ?? 0);
  }

  async page(): Promise<InstagramAnalyticsPage> {
    const { results } = await this.db.prepare(
      `SELECT p.id AS post_id,p.body,p.published_at,p.external_url,f.format,f.style,f.hook_variant,f.claims_ledger_file,
              s.id,s.age_bucket,s.scheduled_at,s.captured_at,s.status,s.attempt_count,s.next_attempt_at,s.lease_id,s.lease_until,
              s.raw_json,s.metrics_json,s.error_code,s.error_message,s.updated_at
       FROM posts p LEFT JOIN post_feedback f ON f.post_id=p.id
       LEFT JOIN instagram_insight_snapshots s ON s.post_id=p.id
       WHERE p.platform='instagram' AND p.status='published'
       ORDER BY p.published_at DESC,s.scheduled_at ASC LIMIT 1500`,
    ).all<Row>();
    const byPost = new Map<string, InstagramPostAnalytics>();
    for (const row of results) {
      const postId = row.post_id as string;
      const post = byPost.get(postId) ?? {
        postId,
        body: String(row.body ?? ''),
        publishedAt: String(row.published_at ?? ''),
        externalUrl: row.external_url as string | null,
        format: row.format as string | null,
        style: row.style as string | null,
        hookVariant: row.hook_variant as string | null,
        claimsLedgerFile: row.claims_ledger_file as string | null,
        snapshots: [],
      };
      if (row.age_bucket != null) post.snapshots.push(snapshotFrom(row as SnapshotRow));
      byPost.set(postId, post);
    }
    const posts = [...byPost.values()];
    return { posts, comparisons: makeComparisonGroups(posts) };
  }

  async learning(platform: PlatformId, pillarId: string | null): Promise<InstagramLearningSummary[]> {
    if (platform !== 'instagram') return [];
    const params: unknown[] = [platform];
    const pillarFilter = pillarId ? ' AND p.pillar_id=?' : '';
    if (pillarId) params.push(pillarId);
    const { results } = await this.db.prepare(
      `SELECT p.id AS post_id,f.format,f.style,s.age_bucket,s.metrics_json
       FROM instagram_insight_snapshots s JOIN posts p ON p.id=s.post_id
       JOIN post_feedback f ON f.post_id=p.id
       WHERE p.platform=? AND p.status='published' AND s.status IN ('complete','partial')${pillarFilter}
       ORDER BY s.captured_at DESC LIMIT 2000`,
    ).bind(...params).all<Row>();
    const posts = new Map<string, InstagramPostAnalytics>();
    for (const row of results) {
      const postId = row.post_id as string;
      const post = posts.get(postId) ?? {
        postId, body: '', publishedAt: '', externalUrl: null, format: row.format as string | null,
        style: row.style as string | null, hookVariant: null, claimsLedgerFile: null, snapshots: [],
      };
      const { metrics, unknownMetrics } = readMetrics(row.metrics_json as string | null);
      if (validBucket(String(row.age_bucket)) && metrics) post.snapshots.push({
        ageBucket: row.age_bucket as InstagramAgeBucket, scheduledAt: '', capturedAt: null, status: 'complete', attemptCount: 1,
        nextAttemptAt: null, metrics, unknownMetrics, errorCode: null, errorMessage: null,
      });
      posts.set(postId, post);
    }
    return makeComparisonGroups([...posts.values()]).map((group) => ({ ...group, style: group.style === '(unlabeled)' ? null : group.style }));
  }
}
