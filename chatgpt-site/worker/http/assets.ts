import type { Context } from 'hono';
import { ASSETS } from 'virtual:assets';

// Dispatch owns these paths in production. Only a local run ever reaches them.
const RESERVED = new Set(['/signin-with-chatgpt', '/signout-with-chatgpt', '/callback']);

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "img-src 'self' data: https:",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

function decode(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

/** The compiled frontend ships inside the Worker, so no asset binding is needed. */
export function serveAsset(c: Context): Response {
  const path = c.req.path === '/' ? '/index.html' : c.req.path;
  if (RESERVED.has(path)) return c.text('ChatGPT sign-in is handled by Sites and is unavailable in a local run.', 404);
  const asset = ASSETS[path];
  if (!asset) return c.text('Not found', 404);
  const html = path === '/index.html';
  const headers: Record<string, string> = {
    'Content-Type': asset.type,
    'Cache-Control': path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
  };
  if (html) headers['Content-Security-Policy'] = CSP;
  const body = asset.encoding === 'base64' ? decode(asset.body) : asset.body;
  return c.body(body as string, 200, headers);
}
