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
