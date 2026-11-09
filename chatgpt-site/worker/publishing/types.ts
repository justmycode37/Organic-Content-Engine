import type { PlatformId } from '../domain/platforms.ts';

export interface PublishRequest {
  platform: PlatformId;
  text: string;
  mediaUrls: string[];
  options?: Record<string, unknown>;
  /** Stable across retries of the same content. */
  idempotencyKey: string;
}

export type PublishResult = { pending: true } | {
  externalId: string;
  externalUrl: string | null;
}

/**
 * - `retryable`: the provider definitely did not create the post.
 * - `ambiguous`: the post may exist; retrying could duplicate it.
 * - `auth`: credentials were rejected; a human must fix them.
 * - `permanent`: the provider refused this request; retrying will not help.
 */
export type PublishErrorKind = 'retryable' | 'ambiguous' | 'auth' | 'permanent';

export class PublishError extends Error {
  readonly kind: PublishErrorKind;
  readonly code: string;
  readonly retryAfterMs: number | null;

  constructor(kind: PublishErrorKind, code: string, message: string, retryAfterMs: number | null = null) {
    super(message);
    this.name = 'PublishError';
    this.kind = kind;
    this.code = code;
    this.retryAfterMs = retryAfterMs;
  }
}

export interface PublishingAdapter {
  /** Env var names still needed. Empty means credentials are complete. */
  missingCredentials(): string[];
  /** True when the provider de-duplicates retries, making ambiguous failures safe to retry. */
  readonly idempotent: boolean;
  readonly supportsMedia: boolean;
  publish(request: PublishRequest): Promise<PublishResult>;
}

export type FetchLike = typeof fetch;
