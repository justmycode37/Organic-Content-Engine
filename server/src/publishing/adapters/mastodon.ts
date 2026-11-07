import { missingId, readJson, type HttpClient } from '../http.ts';
import type { PublishingAdapter } from '../types.ts';

export interface MastodonConfig {
  instanceUrl: string | null;
  accessToken: string | null;
}

export function createMastodonAdapter(config: MastodonConfig, http: HttpClient): PublishingAdapter {
  return {
    idempotent: true,
    supportsMedia: false,
    missingCredentials() {
      return [
        !config.instanceUrl && 'MASTODON_INSTANCE_URL',
        !config.accessToken && 'MASTODON_ACCESS_TOKEN',
      ].filter((v): v is string => Boolean(v));
    },
    async publish(request) {
      const base = (config.instanceUrl as string).replace(/\/$/, '');
      const response = await http.post(`${base}/api/v1/statuses`, {
        headers: {
          authorization: `Bearer ${config.accessToken}`,
          'idempotency-key': request.idempotencyKey,
        },
        body: { status: request.text, visibility: 'public' },
      });
      const status = await readJson<{ id?: string; url?: string | null }>(response);
      if (!status.id) throw missingId();
      return { externalId: status.id, externalUrl: status.url ?? null };
    },
  };
}
