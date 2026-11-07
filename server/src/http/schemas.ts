import { z } from 'zod';
import { PLATFORM_IDS } from '../domain/platforms.ts';
import { IDEA_STATUSES, POST_STATUSES } from '../domain/types.ts';
import { isValidTimeZone } from '../services/slots.ts';

const platform = z.enum(PLATFORM_IDS);
/** Accepts any offset, normalizes to UTC so stored times sort correctly. */
const instant = z.iso.datetime({ offset: true }).transform((value) => new Date(value).toISOString());
const httpsUrl = z.url({ protocol: /^https$/ }).max(2000);
const text = (max: number) => z.string().trim().max(max);

export const brandBody = z.strictObject({
  name: text(120).default(''),
  handle: text(120).default(''),
  description: text(2000).default(''),
  audience: text(1000).default(''),
  voice: text(1000).default(''),
  avoid: text(2000).default(''),
});

export const pageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const sessionBody = z.strictObject({ token: z.string().min(1).max(1000) });

export const pillarCreate = z.strictObject({
  name: text(120).min(1),
  description: text(2000).default(''),
  audience: text(500).default(''),
  tone: text(500).default(''),
  keywords: z.array(text(80).min(1)).max(50).default([]),
  platforms: z.array(platform).max(PLATFORM_IDS.length).default([]),
  active: z.boolean().default(true),
});

export const pillarUpdate = z.strictObject({
  name: text(120).min(1).optional(),
  description: text(2000).optional(),
  audience: text(500).optional(),
  tone: text(500).optional(),
  keywords: z.array(text(80).min(1)).max(50).optional(),
  platforms: z.array(platform).max(PLATFORM_IDS.length).optional(),
  active: z.boolean().optional(),
});

export const ideaQuery = pageQuery.extend({
  pillarId: z.string().optional(),
  status: z.enum(IDEA_STATUSES).optional(),
});

export const ideaCreate = z.strictObject({
  pillarId: z.string().min(1),
  title: text(200).min(1),
  angle: text(2000).default(''),
});

export const ideaUpdate = z.strictObject({
  title: text(200).min(1).optional(),
  angle: text(2000).optional(),
  status: z.enum(['new', 'rejected']).optional(),
});

export const ideaGenerate = z.strictObject({
  pillarId: z.string().min(1),
  count: z.number().int().min(1).max(20).default(5),
  prompt: text(2000).optional(),
});

export const ideaDraft = z.strictObject({
  platform,
  scheduledAt: instant.optional(),
});

export const postQuery = pageQuery.extend({
  status: z.enum(POST_STATUSES).optional(),
  platform: platform.optional(),
  pillarId: z.string().optional(),
  from: instant.optional(),
  to: instant.optional(),
});

export const postCreate = z.strictObject({
  platform,
  body: z.string().max(70000),
  mediaUrls: z.array(httpsUrl).max(10).default([]),
  pillarId: z.string().optional(),
  scheduledAt: instant.optional(),
});

export const postUpdate = z.strictObject({
  platform: platform.optional(),
  body: z.string().max(70000).optional(),
  mediaUrls: z.array(httpsUrl).max(10).optional(),
});

export const postSchedule = z.strictObject({ scheduledAt: instant });
export const postApprove = z.strictObject({ scheduledAt: instant.optional() });
export const postResolve = z.strictObject({
  outcome: z.enum(['published', 'not_published']),
  externalUrl: httpsUrl.optional(),
});

const slot = z.strictObject({
  days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'must be HH:MM'),
});

export const settingsUpdate = z.strictObject({
  autonomyEnabled: z.boolean().optional(),
  autoApprove: z.boolean().optional(),
  publishingPaused: z.boolean().optional(),
  timezone: z.string().refine(isValidTimeZone, 'must be an IANA timezone').optional(),
  postingSlots: z.array(slot).max(50).optional(),
  planningHorizonDays: z.number().int().min(1).max(60).optional(),
  cycleIntervalMinutes: z.number().int().min(5).max(10080).optional(),
  maxPostsPerCycle: z.number().int().min(1).max(50).optional(),
  maxReviewBacklog: z.number().int().min(0).max(500).optional(),
  maxLatenessMinutes: z.number().int().min(1).max(10080).optional(),
});

export const activityQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  beforeId: z.coerce.number().int().min(1).optional(),
});

export const schedulerRun = z.strictObject({ job: z.enum(['publish', 'autonomy']) });
