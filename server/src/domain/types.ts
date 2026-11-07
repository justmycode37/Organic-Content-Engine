import type { PlatformId } from './platforms.ts';

export const POST_STATUSES = [
  'draft',
  'needs_review',
  'scheduled',
  'publishing',
  'published',
  'simulated',
  'failed',
  'blocked',
  'needs_attention',
  'cancelled',
] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export const IDEA_STATUSES = ['new', 'drafted', 'rejected'] as const;
export type IdeaStatus = (typeof IDEA_STATUSES)[number];

export interface Pillar {
  id: string;
  name: string;
  description: string;
  audience: string;
  tone: string;
  keywords: string[];
  platforms: PlatformId[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Idea {
  id: string;
  pillarId: string;
  title: string;
  angle: string;
  source: string;
  status: IdeaStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Post {
  id: string;
  ideaId: string | null;
  pillarId: string | null;
  platform: PlatformId;
  body: string;
  mediaUrls: string[];
  status: PostStatus;
  origin: 'manual' | 'autonomous';
  generator: string | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  externalId: string | null;
  externalUrl: string | null;
  attemptCount: number;
  nextAttemptAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AttemptOutcome =
  | 'published'
  | 'simulated'
  | 'retry_scheduled'
  | 'failed'
  | 'blocked'
  | 'unknown';

export interface PublishAttempt {
  id: string;
  postId: string;
  attemptNumber: number;
  mode: PublishMode;
  route: 'direct' | 'gateway' | null;
  outcome: AttemptOutcome;
  code: string | null;
  message: string | null;
  externalId: string | null;
  startedAt: string;
  finishedAt: string;
}

export type PublishMode = 'dry_run' | 'live';

export interface PostingSlot {
  /** 0 = Sunday … 6 = Saturday, in the configured timezone. */
  days: number[];
  /** HH:MM, 24h, in the configured timezone. */
  time: string;
}

export interface Settings {
  autonomyEnabled: boolean;
  autoApprove: boolean;
  publishingPaused: boolean;
  timezone: string;
  postingSlots: PostingSlot[];
  planningHorizonDays: number;
  cycleIntervalMinutes: number;
  maxPostsPerCycle: number;
  maxReviewBacklog: number;
  maxLatenessMinutes: number;
}

export const DEFAULT_SETTINGS: Settings = {
  autonomyEnabled: false,
  autoApprove: false,
  publishingPaused: false,
  timezone: 'UTC',
  postingSlots: [{ days: [1, 2, 3, 4, 5], time: '09:00' }],
  planningHorizonDays: 7,
  cycleIntervalMinutes: 360,
  maxPostsPerCycle: 5,
  maxReviewBacklog: 20,
  maxLatenessMinutes: 180,
};

export interface Brand {
  name: string;
  handle: string;
  description: string;
  audience: string;
  voice: string;
  /** Topics or phrasing generated content must stay away from. */
  avoid: string;
}

export const EMPTY_BRAND: Brand = { name: '', handle: '', description: '', audience: '', voice: '', avoid: '' };

export interface ActivityEvent {
  id: number;
  type: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  postId: string | null;
  createdAt: string;
}
