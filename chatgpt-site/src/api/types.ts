/** The API contract from docs/backend.md. */

export type PlatformId =
  | 'bluesky' | 'mastodon' | 'linkedin' | 'x' | 'threads'
  | 'facebook' | 'instagram' | 'tiktok' | 'youtube' | 'pinterest';

export interface Account {id:string;name:string;platform:string;topic:string;postsPerDay:number;postingTime:string;timezone:string;enabled:boolean;health:{state:'blocked'|'running';issues:string[]};schedule:{date:string;scheduledAt:string;status:string}[]}

export interface PlatformStatus {
  id: PlatformId;
  displayName: string;
  support: 'direct' | 'gateway_only';
  route: 'direct' | 'gateway' | null;
  state: 'ready' | 'missing_credentials' | 'unsupported';
  /** True only if a real post would be attempted now. */
  canPublishLive: boolean;
  missingEnv: string[];
  limits: { maxChars: number; requiresMedia: boolean; supportsMedia: boolean };
  verification: 'mock_tested_only' | 'depends_on_gateway' | 'none';
}

export type PublishMode = 'dry_run' | 'live';

export const POST_STATUSES = [
  'draft', 'needs_review', 'scheduled', 'publishing', 'processing', 'published',
  'simulated', 'failed', 'blocked', 'needs_attention', 'cancelled',
] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export interface PostIssue {
  code: 'empty_body' | 'too_long' | 'media_required' | 'media_unsupported';
  message: string;
}

export interface Post {
  id: string;
  ideaId: string | null;
  pillarId: string | null;
  platform: PlatformId;
  body: string;
  mediaUrls: string[];
  publishOptions?: Record<string, unknown>;
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
  issues: PostIssue[];
}

export interface PublishAttempt {
  id: string;
  postId: string;
  attemptNumber: number;
  mode: PublishMode;
  route: 'direct' | 'gateway' | null;
  outcome: 'published' | 'simulated' | 'retry_scheduled' | 'failed' | 'blocked' | 'unknown';
  code: string | null;
  message: string | null;
  externalId: string | null;
  startedAt: string;
  finishedAt: string;
}

export type PostDetail = Post & { attempts: PublishAttempt[] };

export interface PostCreate {
  platform: PlatformId;
  body: string;
  mediaUrls?: string[];
  publishOptions?: Record<string, unknown>;
  pillarId?: string;
  scheduledAt?: string;
}

export interface PostQuery {
  status?: PostStatus;
  platform?: PlatformId;
  pillarId?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

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

export type PillarInput = Pick<Pillar, 'name' | 'description' | 'audience' | 'tone' | 'keywords' | 'platforms' | 'active'>;

export type IdeaStatus = 'new' | 'drafted' | 'rejected';

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

export interface Brand {
  name: string;
  handle: string;
  description: string;
  audience: string;
  voice: string;
  avoid: string;
}

export interface PostingSlot {
  /** 0 = Sunday. */
  days: number[];
  /** HH:MM, in the settings timezone. */
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

export interface Autopilot {
  running: boolean;
  status: 'running' | 'paused';
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastError: string | null;
}

export type CycleStopReason =
  | 'no_active_pillars' | 'no_targets' | 'review_backlog_full' | 'generator_error'
  | 'budget_reached' | 'calendar_full' | 'no_new_ideas';

export interface CycleResult {
  startedAt: string;
  createdPostIds: string[];
  ideasGenerated: number;
  skippedPlatforms: PlatformId[];
  stoppedReason: CycleStopReason;
  error: string | null;
}

export interface PublishRunResult {
  processed: number;
  skippedPaused: boolean;
  missed: number;
  recovered: number;
}

export interface Status {
  rendering?: {lastSeenAt:string|null;online:boolean};
  publishMode: PublishMode;
  publishingPaused: boolean;
  generator: { id: string; reviewRequired: boolean };
  autonomy: {
    enabled: boolean;
    effectiveAutoApprove: boolean;
    running: boolean;
    nextCycleAt: string | null;
    lastCycle: { lastRunAt: string | null; lastResult: CycleResult | null };
  };
  scheduler: {
    enabled: boolean;
    jobPath?:string;
    jobCredentialConfigured?:boolean;
    running: boolean;
    tickSeconds: number;
    lastTickAt: string | null;
    lastError: string | null;
  };
  postCounts: Partial<Record<PostStatus, number>>;
  platformsReady: PlatformId[];
}

export interface Session {
  passwordRequired?: boolean;
  forbidden?: boolean;
  user?: { displayName: string; email: string } | null;
  authRequired: boolean;
  authenticated: boolean;
}

export interface ActivityEvent {
  id: number;
  type: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  postId: string | null;
  createdAt: string;
}

export type FeedbackVerdict = 'successful' | 'iterate' | 'discard' | null;
export interface FeedbackEntry {
  postId: string;
  platform: PlatformId;
  pillarId: string | null;
  format: string;
  verdict: FeedbackVerdict;
  notes: string;
  impressions?: number;
  engagements?: number;
  conversions?: number;
  updatedAt: string;
}
export interface FormatInsight {
  format: string;
  platform: PlatformId;
  samples: number;
  successes: number;
  iterations: number;
  discards: number;
  recommendation: 'explore' | 'reuse' | 'iterate' | 'retire';
}
