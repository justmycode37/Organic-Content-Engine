import type { Config } from '../config.ts';
import { countChars, PLATFORM_IDS, PLATFORMS, type PlatformId } from '../domain/platforms.ts';
import type { PublishMode } from '../domain/types.ts';
import type { Redactor } from '../logger.ts';
import { createBlueskyAdapter } from './adapters/bluesky.ts';
import { createLinkedInAdapter } from './adapters/linkedin.ts';
import { createMastodonAdapter } from './adapters/mastodon.ts';
import { createRelayAdapter } from './adapters/relay.ts';
import { createXAdapter } from './adapters/x.ts';
import { createHttpClient } from './http.ts';
import { PublishError, type FetchLike, type PublishingAdapter, type PublishRequest } from './types.ts';

export type Route = 'direct' | 'gateway';
export type PlatformState = 'ready' | 'missing_credentials' | 'unsupported';

export interface PlatformStatus {
  id: PlatformId;
  displayName: string;
  support: 'direct' | 'gateway_only';
  route: Route | null;
  state: PlatformState;
  /** True only when a real external post would be attempted right now. */
  canPublishLive: boolean;
  missingEnv: string[];
  limits: { maxChars: number; requiresMedia: boolean; supportsMedia: boolean };
  verification: 'mock_tested_only' | 'depends_on_gateway' | 'none';
}

export interface ContentIssue {
  code: 'empty_body' | 'too_long' | 'media_required' | 'media_unsupported';
  message: string;
}

export type PublishOutcome =
  | { kind: 'published'; route: Route; externalId: string; externalUrl: string | null }
  | { kind: 'simulated'; route: Route }
  | { kind: 'blocked'; route: Route | null; code: string; message: string }
  | { kind: 'failed'; route: Route | null; code: string; message: string }
  | { kind: 'retry'; route: Route; code: string; message: string; retryAfterMs: number | null }
  | { kind: 'unknown'; route: Route | null; code: string; message: string };

export interface GatewayOptions {
  mode: PublishMode;
  direct: Partial<Record<PlatformId, PublishingAdapter>>;
  relay: PublishingAdapter;
  relayPlatforms: readonly PlatformId[];
  maxCharsOverride?: Partial<Record<PlatformId, number>>;
  redact: Redactor;
}

/** The single path to external networks. Every safety gate lives in `publish`. */
export class PublishingGateway {
  readonly mode: PublishMode;
  private readonly options: GatewayOptions;

  constructor(options: GatewayOptions) {
    this.options = options;
    this.mode = options.mode;
  }

  private resolve(platform: PlatformId): { route: Route; adapter: PublishingAdapter } | null {
    if (this.options.relayPlatforms.includes(platform)) {
      return { route: 'gateway', adapter: this.options.relay };
    }
    const adapter = this.options.direct[platform];
    return adapter ? { route: 'direct', adapter } : null;
  }

  maxChars(platform: PlatformId): number {
    return this.options.maxCharsOverride?.[platform] ?? PLATFORMS[platform].maxChars;
  }

  status(platform: PlatformId): PlatformStatus {
    const definition = PLATFORMS[platform];
    const resolved = this.resolve(platform);
    const missingEnv = resolved?.adapter.missingCredentials() ?? [];
    const state: PlatformState = !resolved ? 'unsupported' : missingEnv.length > 0 ? 'missing_credentials' : 'ready';
    return {
      id: platform,
      displayName: definition.displayName,
      support: definition.support,
      route: resolved?.route ?? null,
      state,
      canPublishLive: state === 'ready' && this.mode === 'live',
      missingEnv,
      limits: {
        maxChars: this.maxChars(platform),
        requiresMedia: definition.requiresMedia,
        supportsMedia: resolved?.adapter.supportsMedia ?? false,
      },
      verification: !resolved ? 'none' : resolved.route === 'gateway' ? 'depends_on_gateway' : 'mock_tested_only',
    };
  }

  statuses(): PlatformStatus[] {
    return PLATFORM_IDS.map((id) => this.status(id));
  }

  /** Whether a post for this platform could reach a terminal result in the current mode. */
  canTarget(platform: PlatformId): boolean {
    const { state } = this.status(platform);
    return this.mode === 'live' ? state === 'ready' : state !== 'unsupported';
  }

  validate(platform: PlatformId, text: string, mediaUrls: readonly string[]): ContentIssue[] {
    const issues: ContentIssue[] = [];
    const definition = PLATFORMS[platform];
    const length = countChars(text);
    const max = this.maxChars(platform);
    if (text.trim().length === 0) issues.push({ code: 'empty_body', message: 'Post body is empty' });
    if (length > max) {
      issues.push({ code: 'too_long', message: `${definition.displayName} allows ${max} characters; post has ${length}` });
    }
    if (definition.requiresMedia && mediaUrls.length === 0) {
      issues.push({ code: 'media_required', message: `${definition.displayName} posts require media` });
    }
    const resolved = this.resolve(platform);
    if (mediaUrls.length > 0 && resolved && !resolved.adapter.supportsMedia) {
      issues.push({ code: 'media_unsupported', message: `The ${definition.displayName} adapter only publishes text` });
    }
    return issues;
  }

  async publish(request: PublishRequest): Promise<PublishOutcome> {
    const resolved = this.resolve(request.platform);
    const name = PLATFORMS[request.platform].displayName;
    if (!resolved) {
      return {
        kind: 'blocked',
        route: null,
        code: 'platform_unsupported',
        message: `${name} is not supported without a configured publishing gateway`,
      };
    }
    const { route, adapter } = resolved;

    const issues = this.validate(request.platform, request.text, request.mediaUrls);
    if (issues.length > 0) {
      return { kind: 'failed', route, code: 'content_invalid', message: issues.map((i) => i.message).join('; ') };
    }

    if (this.mode === 'dry_run') return { kind: 'simulated', route };

    const missing = adapter.missingCredentials();
    if (missing.length > 0) {
      return {
        kind: 'blocked',
        route,
        code: 'credentials_missing',
        message: `${name} is not configured. Missing: ${missing.join(', ')}`,
      };
    }

    try {
      const result = await adapter.publish(request);
      return { kind: 'published', route, externalId: result.externalId, externalUrl: result.externalUrl };
    } catch (error) {
      return this.toOutcome(error, route, adapter);
    }
  }

  private toOutcome(error: unknown, route: Route, adapter: PublishingAdapter): PublishOutcome {
    const { redact } = this.options;
    if (!(error instanceof PublishError)) {
      const message = error instanceof Error ? error.message : String(error);
      return { kind: 'unknown', route, code: 'adapter_error', message: redact(message) };
    }
    const message = redact(error.message);
    switch (error.kind) {
      case 'retryable':
        return { kind: 'retry', route, code: error.code, message, retryAfterMs: error.retryAfterMs };
      case 'ambiguous':
        return adapter.idempotent
          ? { kind: 'retry', route, code: error.code, message, retryAfterMs: null }
          : { kind: 'unknown', route, code: error.code, message };
      case 'auth':
        return { kind: 'blocked', route, code: error.code, message };
      case 'permanent':
        return { kind: 'failed', route, code: error.code, message };
    }
  }
}

export function createGateway(config: Config, redact: Redactor, fetchImpl: FetchLike, now: () => Date): PublishingGateway {
  const http = createHttpClient(fetchImpl, config.publishHttpTimeoutMs);
  return new PublishingGateway({
    mode: config.publishMode,
    redact,
    direct: {
      bluesky: createBlueskyAdapter(config.bluesky, http, now),
      mastodon: createMastodonAdapter(config.mastodon, http),
      linkedin: createLinkedInAdapter(config.linkedin, http),
      x: createXAdapter(config.x, http),
    },
    relay: createRelayAdapter(config.gateway, http),
    relayPlatforms: config.gateway.platforms,
    maxCharsOverride: { mastodon: config.mastodon.maxChars },
  });
}
