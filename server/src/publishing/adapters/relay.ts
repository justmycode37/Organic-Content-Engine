import { missingId, readJson, type HttpClient } from '../http.ts';
import type { PublishingAdapter } from '../types.ts';

export interface RelayConfig {
  url: string | null;
  token: string | null;
}

/** Forwards posts to an operator-run gateway. Protocol: docs/backend.md. */
export function createRelayAdapter(config: RelayConfig, http: HttpClient): PublishingAdapter {
  return {
    // Part of the gateway contract: it must de-duplicate on Idempotency-Key.
    idempotent: true,
    supportsMedia: true,
    missingCredentials() {
      return [
        !config.url && 'PUBLISHING_GATEWAY_URL',
        !config.token && 'PUBLISHING_GATEWAY_TOKEN',
      ].filter((v): v is string => Boolean(v));
    },
    async publish(request) {
      const response = await http.post(config.url as string, {
        headers: {
          authorization: `Bearer ${config.token}`,
          'idempotency-key': request.idempotencyKey,
        },
        body: { platform: request.platform, text: request.text, mediaUrls: request.mediaUrls },
      });
      const result = await readJson<{ id?: string; url?: string | null }>(response);
      if (!result.id) throw missingId();
      return { externalId: result.id, externalUrl: result.url ?? null };
    },
  };
}
