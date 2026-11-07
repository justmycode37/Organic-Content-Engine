import type { ReactNode } from 'react';
import { AtSign, Cloud, Facebook, Instagram, Linkedin, MessageCircle, Music2, Pin, Twitter, Youtube } from 'lucide-react';
import type { PlatformId } from '../api/types';

export const PLATFORM_IDS: PlatformId[] = ['bluesky', 'mastodon', 'linkedin', 'x', 'threads', 'facebook', 'instagram', 'tiktok', 'youtube', 'pinterest'];

const ICONS: Record<PlatformId, ReactNode> = {
  bluesky: <Cloud size={14} aria-hidden />,
  mastodon: <AtSign size={14} aria-hidden />,
  linkedin: <Linkedin size={14} aria-hidden />,
  x: <Twitter size={14} aria-hidden />,
  threads: <MessageCircle size={14} aria-hidden />,
  facebook: <Facebook size={14} aria-hidden />,
  instagram: <Instagram size={14} aria-hidden />,
  tiktok: <Music2 size={14} aria-hidden />,
  youtube: <Youtube size={14} aria-hidden />,
  pinterest: <Pin size={14} aria-hidden />,
};

export const platformIcon = (id: PlatformId) => ICONS[id];

/** What the network itself asks for, from docs/platforms.md. Says nothing about this workspace's state. */
export const PLATFORM_ACCESS: Record<PlatformId, string> = {
  bluesky: 'AT Protocol session. Service rate limits apply.',
  mastodon: 'Per-instance token with write:statuses. Rules vary by instance.',
  linkedin: 'Member OAuth with w_member_social. Organizations also need a Page role.',
  x: 'User OAuth with tweet.write. Developer plan limits apply.',
  threads: 'Threads OAuth with threads_content_publish. Meta app review beyond testers.',
  facebook: 'Page token with pages_manage_posts. Pages only, not personal profiles.',
  instagram: 'Professional account and Meta app review. Media must be at a public URL.',
  tiktok: 'Content Posting API. Unaudited clients can only post privately.',
  youtube: 'Google OAuth with youtube.upload. Unverified projects may be restricted.',
  pinterest: 'OAuth with pins:write. Every Pin needs a destination board.',
};

/** Known limits of this server's direct adapters, from docs/backend.md. */
export const ADAPTER_LIMITS: Partial<Record<PlatformId, string>> = {
  bluesky: 'Text only. New session per post. Only links become facets, not mentions or hashtags.',
  mastodon: 'Text only. The limit comes from MASTODON_MAX_CHARS, not the instance.',
  linkedin: 'Text only. LINKEDIN_API_VERSION needs periodic updates as versions retire.',
  x: 'Text only. Tokens are not refreshed. Length is approximate, so X can still reject a post.',
};
