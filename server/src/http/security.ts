import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { Context, MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import type { Config } from '../config.ts';
import { AppError } from '../errors.ts';

export const SESSION_COOKIE = 'oce_session';
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

function safeEqual(a: string, b: string): boolean {
  const hash = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(hash(a), hash(b));
}

export const tokenMatches = (config: Config, candidate: string) =>
  config.apiToken !== null && safeEqual(candidate, config.apiToken);

const sign = (token: string, expires: string) =>
  createHmac('sha256', token).update(`oce-session-v1:${expires}`).digest('hex');

/** Stateless, so rotating API_TOKEN invalidates every session. */
export function createSessionValue(token: string, nowMs: number): string {
  const expires = String(Math.floor(nowMs / 1000) + SESSION_TTL_SECONDS);
  return `${expires}.${sign(token, expires)}`;
}

function validSession(token: string, value: string | undefined, nowMs: number): boolean {
  if (!value) return false;
  const [expires, signature] = value.split('.');
  if (!expires || !signature || Number(expires) * 1000 <= nowMs) return false;
  return safeEqual(signature, sign(token, expires));
}

export function isAuthenticated(c: Context, config: Config, nowMs: number): boolean {
  if (!config.apiToken) return true;
  const header = c.req.header('authorization');
  if (header?.startsWith('Bearer ') && safeEqual(header.slice(7), config.apiToken)) return true;
  return validSession(config.apiToken, getCookie(c, SESSION_COOKIE), nowMs);
}

const hostnameOf = (host: string) => host.replace(/:\d+$/, '').toLowerCase();

/**
 * Blocks cross-site browser calls. Without a token the API is only safe on loopback,
 * so it also rejects unknown Host headers, which is what stops DNS rebinding.
 */
export function originGuard(config: Config): MiddlewareHandler {
  return async (c, next) => {
    const host = c.req.header('host') ?? '';
    if (!config.apiToken && !LOOPBACK.has(hostnameOf(host))) {
      throw new AppError(403, 'forbidden_host', 'Host not allowed');
    }
    const origin = c.req.header('origin');
    if (origin !== undefined && !config.corsOrigins.includes(origin)) {
      let sameHost = false;
      try {
        sameHost = new URL(origin).host === host;
      } catch {
        sameHost = false;
      }
      if (!sameHost) throw new AppError(403, 'forbidden_origin', 'Origin not allowed');
    }
    await next();
  };
}

export function requireAuth(config: Config, now: () => Date): MiddlewareHandler {
  return async (c, next) => {
    if (!isAuthenticated(c, config, now().getTime())) {
      throw new AppError(401, 'unauthorized', 'Authentication required');
    }
    await next();
  };
}
