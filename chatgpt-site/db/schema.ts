import { sql } from 'drizzle-orm';
import { uniqueIndex, check, index, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

/**
 * Schema declaration used only by drizzle-kit to generate migrations under drizzle/.
 * Runtime SQL lives in worker/repositories. Applied migrations are immutable; append new ones.
 */
export const workspaceOwner = sqliteTable('workspace_owner', {
  id: integer('id').primaryKey(),
  userId: text('user_id').notNull(),
  createdAt: text('created_at').notNull(),
}, (t) => [check('workspace_owner_singleton', sql`${t.id} = 1`)]);

export const settings = sqliteTable('settings', {
  id: integer('id').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (t) => [check('settings_singleton', sql`${t.id} = 1`)]);

export const brand = sqliteTable('brand', {
  id: integer('id').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (t) => [check('brand_singleton', sql`${t.id} = 1`)]);

export const jobState = sqliteTable('job_state', {
  name: text('name').primaryKey(),
  lastRunAt: text('last_run_at'),
  lastResult: text('last_result'),
});

export const jobLocks = sqliteTable('job_locks', {
  name: text('name').primaryKey(),
  lockedUntil: text('locked_until').notNull(),
});

export const pillars = sqliteTable('pillars', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  audience: text('audience').notNull(),
  tone: text('tone').notNull(),
  keywords: text('keywords').notNull(),
  platforms: text('platforms').notNull(),
  active: integer('active').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const ideas = sqliteTable('ideas', {
  id: text('id').primaryKey(),
  pillarId: text('pillar_id').notNull().references(() => pillars.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  titleKey: text('title_key').notNull(),
  angle: text('angle').notNull(),
  source: text('source').notNull(),
  status: text('status').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (t) => [
  unique('ideas_pillar_title').on(t.pillarId, t.titleKey),
  index('ideas_by_pillar_status').on(t.pillarId, t.status, t.createdAt),
]);

export const posts = sqliteTable('posts', {
  id: text('id').primaryKey(),
  ideaId: text('idea_id').references(() => ideas.id, { onDelete: 'set null' }),
  pillarId: text('pillar_id').references(() => pillars.id, { onDelete: 'set null' }),
  platform: text('platform').notNull(),
  body: text('body').notNull(),
  mediaUrls: text('media_urls').notNull(),
  publishOptions: text('publish_options').notNull().default('{}'),
  status: text('status').notNull(),
  origin: text('origin').notNull(),
  generator: text('generator'),
  scheduledAt: text('scheduled_at'),
  publishedAt: text('published_at'),
  externalId: text('external_id'),
  externalUrl: text('external_url'),
  attemptCount: integer('attempt_count').notNull().default(0),
  nextAttemptAt: text('next_attempt_at'),
  leaseAt: text('lease_at'),
  lastErrorCode: text('last_error_code'),
  lastErrorMessage: text('last_error_message'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (t) => [
  index('posts_due').on(t.status, t.scheduledAt),
  index('posts_by_platform').on(t.platform, t.scheduledAt),
]);

export const publishAttempts = sqliteTable('publish_attempts', {
  id: text('id').primaryKey(),
  postId: text('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  attemptNumber: integer('attempt_number').notNull(),
  mode: text('mode').notNull(),
  route: text('route'),
  outcome: text('outcome').notNull(),
  code: text('code'),
  message: text('message'),
  externalId: text('external_id'),
  startedAt: text('started_at').notNull(),
  finishedAt: text('finished_at').notNull(),
}, (t) => [index('attempts_by_post').on(t.postId, t.startedAt)]);

export const activity = sqliteTable('activity', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type').notNull(),
  level: text('level').notNull(),
  message: text('message').notNull(),
  postId: text('post_id'),
  createdAt: text('created_at').notNull(),
});

export const materials=sqliteTable('materials',{id:text('id').primaryKey(),name:text('name').notNull(),mime:text('mime').notNull(),size:integer('size').notNull(),notes:text('notes').notNull().default(''),enabled:integer('enabled').notNull().default(1),createdAt:text('created_at').notNull(),pathname:text('pathname').notNull().unique(),uploaded:integer('uploaded').notNull().default(0),kind:text('kind').notNull().default('source')});
export const socialAccounts=sqliteTable('social_accounts',{platform:text('platform').primaryKey(),accountId:text('account_id').notNull(),name:text('name').notNull(),credentials:text('credentials').notNull(),updatedAt:text('updated_at').notNull()});
export const oauthPending=sqliteTable('oauth_pending',{state:text('state').primaryKey(),platform:text('platform').notNull(),verifier:text('verifier').notNull(),expires:integer('expires').notNull(),browserHash:text('browser_hash').notNull()});
export const deliveryJobs=sqliteTable('delivery_jobs',{key:text('key').primaryKey(),platform:text('platform').notNull(),accountId:text('account_id').notNull(),stage:text('stage').notNull(),data:text('data').notNull(),updatedAt:text('updated_at').notNull()});
export const loginLimits=sqliteTable('login_limits',{key:text('key').primaryKey(),attempts:integer('attempts').notNull(),resetAt:integer('reset_at').notNull()});
export const generationJobs=sqliteTable('generation_jobs',{id:text('id').primaryKey(),kind:text('kind').notNull(),input:text('input').notNull(),status:text('status').notNull().default('pending'),result:text('result'),createdAt:text('created_at').notNull()},t=>[uniqueIndex('generation_video_post').on(sql`json_extract(${t.input}, '$.postId')`).where(sql`${t.kind}='video' AND json_extract(${t.input}, '$.postId') IS NOT NULL`)]);

export const postFeedback = sqliteTable('post_feedback', {
  postId: text('post_id').primaryKey().references(() => posts.id, { onDelete: 'cascade' }),
  format: text('format').notNull(),
  style: text('style'),
  hookVariant: text('hook_variant'),
  claimsLedgerFile: text('claims_ledger_file'),
  verdict: text('verdict'),
  notes: text('notes').notNull().default(''),
  impressions: integer('impressions'),
  engagements: integer('engagements'),
  conversions: integer('conversions'),
  updatedAt: text('updated_at').notNull(),
}, (t) => [check('post_feedback_verdict', sql`${t.verdict} IS NULL OR ${t.verdict} IN ('successful','iterate','discard')`), index('feedback_by_format').on(t.format)]);

export const instagramInsightSnapshots = sqliteTable('instagram_insight_snapshots', {
  id: text('id').primaryKey(),
  postId: text('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  ageBucket: text('age_bucket').notNull(),
  scheduledAt: text('scheduled_at').notNull(),
  capturedAt: text('captured_at'),
  status: text('status').notNull().default('pending'),
  attemptCount: integer('attempt_count').notNull().default(0),
  nextAttemptAt: text('next_attempt_at'),
  leaseId: text('lease_id'),
  leaseUntil: text('lease_until'),
  rawJson: text('raw_json'),
  metricsJson: text('metrics_json'),
  errorCode: text('error_code'),
  errorMessage: text('error_message'),
  updatedAt: text('updated_at').notNull(),
}, (t) => [
  uniqueIndex('instagram_snapshot_post_age').on(t.postId, t.ageBucket),
  index('instagram_snapshots_due').on(t.status, t.scheduledAt, t.nextAttemptAt),
]);

export const videoRenders=sqliteTable('video_renders',{jobId:text('job_id').primaryKey().references(()=>generationJobs.id,{onDelete:'cascade'}),status:text('status').notNull().default('queued'),leaseId:text('lease_id'),leaseUntil:text('lease_until'),attempts:integer('attempts').notNull().default(0),repairs:integer('repairs').notNull().default(0),nextAttemptAt:text('next_attempt_at').notNull(),outputMaterialId:text('output_material_id'),errorCode:text('error_code'),errorMessage:text('error_message'),updatedAt:text('updated_at').notNull()},t=>[index('video_renders_due').on(t.status,t.nextAttemptAt)]);
