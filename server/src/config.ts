import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { PLATFORM_IDS, type PlatformId } from './domain/platforms.ts';
import type { PublishMode } from './domain/types.ts';

const SERVER_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

const optionalString = z.string().optional();
const bool = z.enum(['true', 'false']).transform((v) => v === 'true');
const list = (value: string | undefined) =>
  (value ?? '').split(',').map((v) => v.trim()).filter(Boolean);

/** Credentials go over this URL, so plain http is only tolerated for loopback. */
const secureUrl = z.string().url().refine((value) => {
  const url = new URL(value);
  return url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname));
}, 'must be https (http is allowed only for localhost)');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(0).max(65535).default(3001),
  API_TOKEN: z.string().min(32, 'must be at least 32 characters').optional(),
  CORS_ORIGINS: optionalString,
  COOKIE_SECURE: bool.optional(),
  DATABASE_PATH: optionalString,
  PUBLISH_MODE: z.enum(['dry_run', 'live']).default('dry_run'),
  SCHEDULER_ENABLED: bool.default(true),
  SCHEDULER_TICK_SECONDS: z.coerce.number().int().min(1).max(3600).default(30),
  PUBLISH_HTTP_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(20000),
  CONTENT_GENERATOR: z.enum(['template', 'anthropic']).default('template'),
  ANTHROPIC_API_KEY: optionalString,
  ANTHROPIC_MODEL: z.string().default('claude-opus-5-5'),
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
  env: 'development' | 'test' | 'production';
  host: string;
  port: number;
  apiToken: string | null;
  corsOrigins: string[];
  cookieSecure: boolean;
  databasePath: string;
  publishMode: PublishMode;
  scheduler: { enabled: boolean; tickSeconds: number };
  publishHttpTimeoutMs: number;
  generator: { kind: 'template' | 'anthropic'; anthropicApiKey: string | null; anthropicModel: string };
  bluesky: { handle: string | null; appPassword: string | null; serviceUrl: string };
  mastodon: { instanceUrl: string | null; accessToken: string | null; maxChars: number };
  linkedin: { accessToken: string | null; authorUrn: string | null; apiVersion: string | null };
  x: { accessToken: string | null };
  gateway: { url: string | null; token: string | null; platforms: PlatformId[] };
  /** Every secret value, used to scrub logs and stored error messages. */
  secrets: string[];
}

export class ConfigError extends Error {}

/** Pure: validates an env map and fails closed. Error text names variables, never values. */
export function loadConfig(rawEnv: Record<string, string | undefined> = process.env): Config {
  const env = Object.fromEntries(
    Object.entries(rawEnv).map(([key, value]) => [key, value?.trim() === '' ? undefined : value?.trim()]),
  );
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new ConfigError(`Invalid environment: ${issues}`);
  }
  const e = parsed.data;

  const isLoopback = LOOPBACK_HOSTS.has(e.HOST);
  if (!e.API_TOKEN && (e.NODE_ENV === 'production' || !isLoopback)) {
    throw new ConfigError('API_TOKEN is required when NODE_ENV=production or HOST is not loopback');
  }

  const gatewayPlatforms = list(e.PUBLISHING_GATEWAY_PLATFORMS);
  const unknown = gatewayPlatforms.filter((p) => !(PLATFORM_IDS as readonly string[]).includes(p));
  if (unknown.length > 0) {
    throw new ConfigError(`PUBLISHING_GATEWAY_PLATFORMS: unknown platforms ${unknown.join(', ')}`);
  }

  const secrets = [
    e.API_TOKEN,
    e.ANTHROPIC_API_KEY,
    e.BLUESKY_APP_PASSWORD,
    e.MASTODON_ACCESS_TOKEN,
    e.LINKEDIN_ACCESS_TOKEN,
    e.X_USER_ACCESS_TOKEN,
    e.PUBLISHING_GATEWAY_TOKEN,
  ].filter((s): s is string => Boolean(s));

  const corsOrigins = e.CORS_ORIGINS !== undefined
    ? list(e.CORS_ORIGINS)
    : e.NODE_ENV === 'production'
      ? []
      : ['http://localhost:5173', 'http://127.0.0.1:5173'];

  return {
    env: e.NODE_ENV,
    host: e.HOST,
    port: e.PORT,
    apiToken: e.API_TOKEN ?? null,
    corsOrigins,
    cookieSecure: e.COOKIE_SECURE ?? e.NODE_ENV === 'production',
    databasePath: e.DATABASE_PATH ?? resolve(SERVER_ROOT, 'data', 'engine.db'),
    publishMode: e.PUBLISH_MODE,
    scheduler: { enabled: e.SCHEDULER_ENABLED, tickSeconds: e.SCHEDULER_TICK_SECONDS },
    publishHttpTimeoutMs: e.PUBLISH_HTTP_TIMEOUT_MS,
    generator: {
      kind: e.CONTENT_GENERATOR,
      anthropicApiKey: e.ANTHROPIC_API_KEY ?? null,
      anthropicModel: e.ANTHROPIC_MODEL,
    },
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
