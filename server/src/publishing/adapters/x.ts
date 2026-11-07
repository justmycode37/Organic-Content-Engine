import { missingId, readJson, type HttpClient } from '../http.ts';
import type { PublishingAdapter } from '../types.ts';

export function createXAdapter(config: { accessToken: string | null }, http: HttpClient): PublishingAdapter {
  return {
    idempotent: false,
    supportsMedia: false,
    missingCredentials() {
      return config.accessToken ? [] : ['X_USER_ACCESS_TOKEN'];
    },
    async publish(request) {
      const response = await http.post('https://api.x.com/2/tweets', {
        headers: { authorization: `Bearer ${config.accessToken}` },
        body: { text: request.text },
      });
      const { data } = await readJson<{ data?: { id?: string } }>(response);
      if (!data?.id) throw missingId();
      return { externalId: data.id, externalUrl: `https://x.com/i/status/${data.id}` };
    },
  };
}
