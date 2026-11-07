import { missingId, readJson, type HttpClient } from '../http.ts';
import { PublishError, type PublishingAdapter } from '../types.ts';

export interface BlueskyConfig {
  handle: string | null;
  appPassword: string | null;
  serviceUrl: string;
}

const URL_PATTERN = /https?:\/\/[^\s<>"']+/g;
const TRAILING_PUNCTUATION = /[.,;:!?)\]}'"]+$/;

/** Bluesky renders plain text unless links are declared as facets with UTF-8 byte offsets. */
export function linkFacets(text: string) {
  const encoder = new TextEncoder();
  return [...text.matchAll(URL_PATTERN)].map((match) => {
    const uri = match[0].replace(TRAILING_PUNCTUATION, '');
    const byteStart = encoder.encode(text.slice(0, match.index)).length;
    return {
      index: { byteStart, byteEnd: byteStart + encoder.encode(uri).length },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri }],
    };
  });
}

export function createBlueskyAdapter(config: BlueskyConfig, http: HttpClient, now: () => Date): PublishingAdapter {
  const base = config.serviceUrl.replace(/\/$/, '');
  return {
    idempotent: false,
    supportsMedia: false,
    missingCredentials() {
      return [
        !config.handle && 'BLUESKY_HANDLE',
        !config.appPassword && 'BLUESKY_APP_PASSWORD',
      ].filter((v): v is string => Boolean(v));
    },
    async publish(request) {
      const session = await login(base, config, http);
      const facets = linkFacets(request.text);
      const response = await http.post(`${base}/xrpc/com.atproto.repo.createRecord`, {
        headers: { authorization: `Bearer ${session.accessJwt}` },
        body: {
          repo: session.did,
          collection: 'app.bsky.feed.post',
          record: {
            $type: 'app.bsky.feed.post',
            text: request.text,
            createdAt: now().toISOString(),
            ...(facets.length > 0 ? { facets } : {}),
          },
        },
      });
      const { uri } = await readJson<{ uri?: string }>(response);
      if (!uri) throw missingId();
      const rkey = uri.split('/').pop();
      return { externalId: uri, externalUrl: `https://bsky.app/profile/${session.did}/post/${rkey}` };
    },
  };
}

/** Login cannot create a post, so any uncertainty here is safe to retry. */
async function login(base: string, config: BlueskyConfig, http: HttpClient) {
  try {
    const response = await http.post(`${base}/xrpc/com.atproto.server.createSession`, {
      headers: {},
      body: { identifier: config.handle, password: config.appPassword },
    });
    const session = await readJson<{ accessJwt?: string; did?: string }>(response);
    if (!session.accessJwt || !session.did) {
      throw new PublishError('retryable', 'bad_response', 'Bluesky login response was incomplete');
    }
    return { accessJwt: session.accessJwt, did: session.did };
  } catch (error) {
    if (error instanceof PublishError && error.kind === 'ambiguous') {
      throw new PublishError('retryable', error.code, error.message);
    }
    // Bluesky answers bad passwords with 401; a 400 here is an invalid login too.
    if (error instanceof PublishError && error.code === 'http_400') {
      throw new PublishError('auth', 'credentials_rejected', error.message);
    }
    throw error;
  }
}
