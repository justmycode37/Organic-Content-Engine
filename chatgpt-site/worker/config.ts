import { z } from 'zod';
import { PLATFORM_IDS, type PlatformId } from './domain/platforms.ts';
import type { PublishMode } from './domain/types.ts';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', '[::1]', 'localhost']);

const optionalString = z.string().optional();
const list = (value: string | undefined) =>
  (value ?? '').split(',').map((v) => v.trim()).filter(Boolean);

/** Credentials go over this URL, so plain http is only tolerated for loopback. */
const secureUrl = z.string().url().refine((value) => {
  const url = new URL(value);
  return url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname));
}, 'must be https (http is allowed only for localhost)');

const schema = z.object({
  OWNER_USER_ID: optionalString,
  JOB_TOKEN: z.string().min(32, 'must be at least 32 characters').optional(),
  RENDER_WORKER_TOKEN: z.string().min(32, 'must be at least 32 characters').optional(),
  SITES_SERVICE_ACCESS_TRUSTED: z.enum(['true', 'false']).default('false'),
  LOCAL_DEV_USER_ID: optionalString,
  PUBLISH_MODE: z.enum(['dry_run', 'live']).default('dry_run'),
  PUBLISH_HTTP_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(20000),
  CONTENT_GENERATOR: z.enum(['template', 'anthropic', 'chatgpt-plan']).default('chatgpt-plan'),
  ANTHROPIC_API_KEY: optionalString,
  ANTHROPIC_MODEL: z.string().default('claude-opus-5-5'),
  ELEVENLABS_API_KEY: optionalString,
  ELEVENLABS_VOICE_ID: z.string().regex(/^[A-Za-z0-9]{8,64}$/, 'must be an ElevenLabs voice ID').optional(),
  ELEVENLABS_MODEL: z.string().regex(/^[a-z0-9_]{3,64}$/).default('eleven_multilingual_v2'),
  BLUESKY_HANDLE: optionalString,
  BLUESKY_APP_PASSWORD: optionalString,
  BLUESKY_SERVICE_URL: secureUrl.default('https://bsky.social'),
  MASTODON_INSTANCE_URL: secureUrl.optional(),
  MASTODON_ACCESS_TOKEN: optionalString,
  MASTODON_MAX_CHARS: z.coerce.number().int().min(1).default(500),
  LINKEDIN_ACCESS_TOKEN: optionalString,
  LINKEDIN_AUTHOR_URN: z.string().regex(/^urn:li:(person|organization):[\w-]+$/).optional(),
  LINKEDIN_API_VERSION: z.string().regex(/^\d{6}$/, 'must be YYYYMM').optional(),
  X_USER_ACCESS_TOKEN: optionalString,
  PUBLISHING_GATEWAY_URL: secureUrl.optional(),
  PUBLISHING_GATEWAY_TOKEN: optionalString,
  PUBLISHING_GATEWAY_PLATFORMS: optionalString,
});

export interface Config {
  ownerUserId: string | null;
  jobToken: string | null;
  renderWorkerToken: string | null;
  serviceAccessTrusted: boolean;
  localDevUserId: string | null;
  publishMode: PublishMode;
  publishHttpTimeoutMs: number;
  generator: { kind: 'template' | 'anthropic' | 'chatgpt-plan'; anthropicApiKey: string | null; anthropicModel: string };
  /** Studio narration. Without a key the Studio works, minus voiceover. */
  voiceover: { apiKey: string | null; voiceId: string | null; model: string };
  bluesky: { handle: string | null; appPassword: string | null; serviceUrl: string };
  mastodon: { instanceUrl: string | null; accessToken: string | null; maxChars: number };
  linkedin: { accessToken: string | null; authorUrn: string | null; apiVersion: string | null };
  x: { accessToken: string | null };
  gateway: { url: string | null; token: string | null; platforms: PlatformId[] };
  /** Every secret value, used to scrub logs and stored error messages. */
  secrets: string[];
}

export class ConfigError extends Error {}

export const isLoopbackHost = (hostname: string) => LOOPBACK_HOSTS.has(hostname.toLowerCase());

/** Pure: validates the Worker env and fails closed. Error text names variables, never values. */
export function loadConfig(rawEnv: object): Config {
  const env = Object.fromEntries(
    Object.entries(rawEnv)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim() !== '')
      .map(([key, value]) => [key, value.trim()]),
  );
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new ConfigError(`Invalid Site configuration: ${issues}`);
  }
  const e = parsed.data;

  const gatewayPlatforms = list(e.PUBLISHING_GATEWAY_PLATFORMS);
  const unknown = gatewayPlatforms.filter((p) => !(PLATFORM_IDS as readonly string[]).includes(p));
  if (unknown.length > 0) {
    throw new ConfigError(`Invalid Site configuration: PUBLISHING_GATEWAY_PLATFORMS has unknown platforms ${unknown.join(', ')}`);
  }

  const secrets = [
    e.JOB_TOKEN,
    e.RENDER_WORKER_TOKEN,
    e.ANTHROPIC_API_KEY,
    e.ELEVENLABS_API_KEY,
    e.BLUESKY_APP_PASSWORD,
    e.MASTODON_ACCESS_TOKEN,
    e.LINKEDIN_ACCESS_TOKEN,
    e.X_USER_ACCESS_TOKEN,
    e.PUBLISHING_GATEWAY_TOKEN,
  ].filter((s): s is string => Boolean(s));

  return {
    ownerUserId: e.OWNER_USER_ID ?? null,
    jobToken: e.JOB_TOKEN ?? null,
    renderWorkerToken: e.RENDER_WORKER_TOKEN ?? null,
    serviceAccessTrusted: e.SITES_SERVICE_ACCESS_TRUSTED === 'true',
    localDevUserId: e.LOCAL_DEV_USER_ID ?? null,
    publishMode: e.PUBLISH_MODE,
    publishHttpTimeoutMs: e.PUBLISH_HTTP_TIMEOUT_MS,
    generator: {
      kind: e.CONTENT_GENERATOR,
      anthropicApiKey: e.ANTHROPIC_API_KEY ?? null,
      anthropicModel: e.ANTHROPIC_MODEL,
    },
    voiceover: { apiKey: e.ELEVENLABS_API_KEY ?? null, voiceId: e.ELEVENLABS_VOICE_ID ?? null, model: e.ELEVENLABS_MODEL },
    bluesky: {
      handle: e.BLUESKY_HANDLE ?? null,
      appPassword: e.BLUESKY_APP_PASSWORD ?? null,
      serviceUrl: e.BLUESKY_SERVICE_URL,
    },
    mastodon: {
      instanceUrl: e.MASTODON_INSTANCE_URL ?? null,
      accessToken: e.MASTODON_ACCESS_TOKEN ?? null,
      maxChars: e.MASTODON_MAX_CHARS,
    },
    linkedin: {
      accessToken: e.LINKEDIN_ACCESS_TOKEN ?? null,
      authorUrn: e.LINKEDIN_AUTHOR_URN ?? null,
      apiVersion: e.LINKEDIN_API_VERSION ?? null,
    },
    x: { accessToken: e.X_USER_ACCESS_TOKEN ?? null },
    gateway: {
      url: e.PUBLISHING_GATEWAY_URL ?? null,
      token: e.PUBLISHING_GATEWAY_TOKEN ?? null,
      platforms: gatewayPlatforms as PlatformId[],
    },
    secrets,
  };
}
