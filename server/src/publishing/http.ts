import { PublishError, type FetchLike } from './types.ts';

const NOT_SENT_CODES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
]);

export interface HttpClient {
  post(url: string, options: { headers: Record<string, string>; body: unknown }): Promise<Response>;
}

export function createHttpClient(fetchImpl: FetchLike, timeoutMs: number): HttpClient {
  return {
    async post(url, { headers, body }) {
      let response: Response;
      try {
        response = await fetchImpl(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json', ...headers },
          body: JSON.stringify(body),
          // A redirect could forward credentials to another host.
          redirect: 'error',
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        throw classifyTransportError(error);
      }
      if (!response.ok) throw await classifyStatus(response);
      return response;
    },
  };
}

function classifyTransportError(error: unknown): PublishError {
  const cause = (error as { cause?: { code?: string } }).cause;
  if (cause?.code && NOT_SENT_CODES.has(cause.code)) {
    return new PublishError('retryable', 'network_unreachable', `Could not reach provider (${cause.code})`);
  }
  // Timeouts and resets can happen after the provider acted on the request.
  const message = error instanceof Error ? error.message : 'request failed';
  return new PublishError('ambiguous', 'network_uncertain', `Connection lost mid-request: ${message}`);
}

async function classifyStatus(response: Response): Promise<PublishError> {
  const { status } = response;
  const detail = `Provider returned HTTP ${status}: ${(await response.text().catch(() => '')).slice(0, 500)}`;
  if (status === 401 || status === 403) return new PublishError('auth', 'credentials_rejected', detail);
  if ([409, 425, 429, 503].includes(status)) {
    return new PublishError('retryable', `http_${status}`, detail, parseRetryAfter(response));
  }
  if (status >= 500) return new PublishError('ambiguous', `http_${status}`, detail);
  return new PublishError('permanent', `http_${status}`, detail);
}

function parseRetryAfter(response: Response): number | null {
  const header = response.headers.get('retry-after');
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds) * 1000;
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

/** A 2xx we cannot understand: the post probably exists but we cannot prove it. */
export async function readJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new PublishError('ambiguous', 'bad_response', 'Provider returned 2xx with an unreadable body');
  }
}

export const missingId = () =>
  new PublishError('ambiguous', 'bad_response', 'Provider returned 2xx without a post id');
