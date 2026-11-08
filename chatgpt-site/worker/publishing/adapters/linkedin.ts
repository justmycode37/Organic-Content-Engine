import { missingId, type HttpClient } from '../http.ts';
import type { PublishingAdapter } from '../types.ts';

export interface LinkedInConfig {
  accessToken: string | null;
  authorUrn: string | null;
  apiVersion: string | null;
}

/**
 * Commentary uses LinkedIn's "little" format, where unescaped reserved characters
 * can truncate or reinterpret the post. `#` stays unescaped so hashtags still work.
 */
export function escapeLittleText(text: string): string {
  return text.replace(/[\\|{}@[\]()<>*_~]/g, '\\$&');
}

export function createLinkedInAdapter(config: LinkedInConfig, http: HttpClient): PublishingAdapter {
  return {
    idempotent: false,
    supportsMedia: false,
    missingCredentials() {
      return [
        !config.accessToken && 'LINKEDIN_ACCESS_TOKEN',
        !config.authorUrn && 'LINKEDIN_AUTHOR_URN',
        !config.apiVersion && 'LINKEDIN_API_VERSION',
      ].filter((v): v is string => Boolean(v));
    },
    async publish(request) {
      const response = await http.post('https://api.linkedin.com/rest/posts', {
        headers: {
          authorization: `Bearer ${config.accessToken}`,
          'linkedin-version': config.apiVersion as string,
          'x-restli-protocol-version': '2.0.0',
        },
        body: {
          author: config.authorUrn,
          commentary: escapeLittleText(request.text),
          visibility: 'PUBLIC',
          distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
          lifecycleState: 'PUBLISHED',
          isReshareDisabledByAuthor: false,
        },
      });
      const urn = response.headers.get('x-restli-id');
      if (!urn) throw missingId();
      return { externalId: urn, externalUrl: `https://www.linkedin.com/feed/update/${urn}/` };
    },
  };
}
