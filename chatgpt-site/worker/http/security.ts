import type { Context } from 'hono';
import { isLoopbackHost, type Config } from '../config.ts';
import { AppError } from '../errors.ts';
import type { SettingsRepository } from '../repositories/settings.ts';

export interface User {
  userId: string;
  email: string;
  displayName: string;
}

export type Access =
  | { kind: 'owner'; user: User }
  | { kind: 'forbidden'; user: User }
  | { kind: 'anonymous' };

function decodeFullName(c: Context): string | null {
  const encoded = c.req.header('oai-authenticated-user-full-name');
  if (!encoded || c.req.header('oai-authenticated-user-full-name-encoding') !== 'percent-encoded-utf-8') return null;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

/** Sites dispatch sets these headers. They are read here only and never reach browser code as trust input. */
export function readUser(c: Context, config: Config | null): User | null {
  const userId = c.req.header('oai-authenticated-user-id');
  const email = c.req.header('oai-authenticated-user-email');
  if (userId && email) return { userId, email, displayName: decodeFullName(c) ?? email };
  // No dispatch runs locally. This branch cannot apply on a hosted hostname.
  if (config?.localDevUserId && isLoopbackHost(new URL(c.req.url).hostname)) {
    return { userId: config.localDevUserId, email: 'local@sites.test', displayName: 'Local development' };
  }
  return null;
}

/** Signing in is not enough: only the workspace owner may read or change data. */
export async function resolveAccess(c: Context, config: Config, settings: SettingsRepository, now: string): Promise<Access> {
  const user = readUser(c, config);
  if (!user) return { kind: 'anonymous' };
  const owner = config.ownerUserId ?? await settings.claimOwner(user.userId, now);
  return user.userId === owner ? { kind: 'owner', user } : { kind: 'forbidden', user };
}

export function assertOwner(access: Access): void {
  if (access.kind === 'anonymous') throw new AppError(401, 'unauthorized', 'Sign in with ChatGPT to use this workspace');
  if (access.kind === 'forbidden') throw new AppError(403, 'forbidden_user', 'This workspace belongs to another account');
}

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

async function safeEqual(a: string, b: string): Promise<boolean> {
  const [left, right] = await Promise.all([digest(a), digest(b)]);
  let difference = 0;
  for (let i = 0; i < left.length; i += 1) difference |= (left[i] as number) ^ (right[i] as number);
  return difference === 0;
}

/**
 * The job route has no visitor when a schedule calls it. It accepts the owner, or JOB_TOKEN,
 * or, only when explicitly enabled for a confirmed owner-private Site, a request with no
 * identity at all, which on such a Site can only have passed Sites service access.
 */
export async function assertJobCaller(c: Context, config: Config, access: Access): Promise<void> {
  if (access.kind === 'owner') return;
  if (access.kind === 'forbidden') throw new AppError(403, 'forbidden_user', 'This workspace belongs to another account');
  const header = c.req.header('authorization');
  if (config.jobToken && header?.startsWith('Bearer ') && await safeEqual(header.slice(7), config.jobToken)) return;
  if (config.serviceAccessTrusted) return;
  throw new AppError(401, 'unauthorized', 'Job calls need the workspace owner or a valid JOB_TOKEN');
}

/**
 * Blocks cross-site browser calls. Fetch metadata comes first because it does not depend on
 * how the platform rewrites Host; sibling Sites on a shared domain count as `same-site`, so
 * only `same-origin` and direct navigation pass.
 */
export function assertSameOrigin(c: Context): void {
  const site = c.req.header('sec-fetch-site');
  if (site !== undefined) {
    if (site !== 'same-origin' && site !== 'none') throw new AppError(403, 'forbidden_origin', 'Origin not allowed');
    return;
  }
  const origin = c.req.header('origin');
  if (origin === undefined) return;
  const hosts = [c.req.header('host'), new URL(c.req.url).host];
  let originHost: string | null = null;
  try {
    originHost = new URL(origin).host;
  } catch {
    originHost = null;
  }
  if (!originHost || !hosts.includes(originHost)) throw new AppError(403, 'forbidden_origin', 'Origin not allowed');
}
