import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

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

export const materials=sqliteTable('materials',{id:text('id').primaryKey(),name:text('name').notNull(),mime:text('mime').notNull(),size:integer('size').notNull(),notes:text('notes').notNull().default(''),enabled:integer('enabled').notNull().default(1),createdAt:text('created_at').notNull(),pathname:text('pathname').notNull().unique(),uploaded:integer('uploaded').notNull().default(0)});
export const socialAccounts=sqliteTable('social_accounts',{platform:text('platform').primaryKey(),accountId:text('account_id').notNull(),name:text('name').notNull(),credentials:text('credentials').notNull(),updatedAt:text('updated_at').notNull()});
export const oauthPending=sqliteTable('oauth_pending',{state:text('state').primaryKey(),platform:text('platform').notNull(),verifier:text('verifier').notNull(),expires:integer('expires').notNull(),browserHash:text('browser_hash').notNull()});
export const deliveryJobs=sqliteTable('delivery_jobs',{key:text('key').primaryKey(),platform:text('platform').notNull(),accountId:text('account_id').notNull(),stage:text('stage').notNull(),data:text('data').notNull(),updatedAt:text('updated_at').notNull()});
export const loginLimits=sqliteTable('login_limits',{key:text('key').primaryKey(),attempts:integer('attempts').notNull(),resetAt:integer('reset_at').notNull()});
export const generationJobs=sqliteTable('generation_jobs',{id:text('id').primaryKey(),kind:text('kind').notNull(),input:text('input').notNull(),status:text('status').notNull().default('pending'),result:text('result'),createdAt:text('created_at').notNull()});

export const postFeedback = sqliteTable('post_feedback', {
  postId: text('post_id').primaryKey().references(() => posts.id, { onDelete: 'cascade' }),
  format: text('format').notNull(),
  verdict: text('verdict'),
  notes: text('notes').notNull().default(''),
  impressions: integer('impressions'),
  engagements: integer('engagements'),
  conversions: integer('conversions'),
  updatedAt: text('updated_at').notNull(),
}, (t) => [check('post_feedback_verdict', sql`${t.verdict} IS NULL OR ${t.verdict} IN ('successful','iterate','discard')`), index('feedback_by_format').on(t.format)]);
