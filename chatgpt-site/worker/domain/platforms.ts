/**
 * The closed list of platforms this server knows about. Being listed is not a
 * claim that a platform works: `direct` means an adapter ships here; `gateway_only`
 * means posting is possible only through an operator-configured external gateway.
 */
export const ALL_PLATFORM_IDS = [
  'bluesky',
  'mastodon',
  'linkedin',
  'x',
  'threads',
  'facebook',
  'instagram',
  'tiktok',
  'youtube',
  'pinterest',
] as const;

export type PlatformId = (typeof ALL_PLATFORM_IDS)[number];
export const PLATFORM_IDS = ['instagram','tiktok','x','youtube','linkedin'] as const;

export interface PlatformDefinition {
  id: PlatformId;
  displayName: string;
  support: 'direct' | 'gateway_only';
  maxChars: number;
  requiresMedia: boolean;
}

export const PLATFORMS: Record<PlatformId, PlatformDefinition> = {
  bluesky: { id: 'bluesky', displayName: 'Bluesky', support: 'direct', maxChars: 300, requiresMedia: false },
  mastodon: { id: 'mastodon', displayName: 'Mastodon', support: 'direct', maxChars: 500, requiresMedia: false },
  linkedin: { id: 'linkedin', displayName: 'LinkedIn', support: 'direct', maxChars: 3000, requiresMedia: false },
  x: { id: 'x', displayName: 'X', support: 'direct', maxChars: 280, requiresMedia: false },
  threads: { id: 'threads', displayName: 'Threads', support: 'gateway_only', maxChars: 500, requiresMedia: false },
  facebook: { id: 'facebook', displayName: 'Facebook Pages', support: 'gateway_only', maxChars: 63206, requiresMedia: false },
  instagram: { id: 'instagram', displayName: 'Instagram', support: 'direct', maxChars: 2200, requiresMedia: true },
  tiktok: { id: 'tiktok', displayName: 'TikTok', support: 'direct', maxChars: 2200, requiresMedia: true },
  youtube: { id: 'youtube', displayName: 'YouTube', support: 'direct', maxChars: 5000, requiresMedia: true },
  pinterest: { id: 'pinterest', displayName: 'Pinterest', support: 'gateway_only', maxChars: 500, requiresMedia: true },
};

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** User-perceived characters. An approximation for platforms with their own weighting (X). */
export function countChars(text: string): number {
  let count = 0;
  for (const _ of segmenter.segment(text)) count += 1;
  return count;
}
