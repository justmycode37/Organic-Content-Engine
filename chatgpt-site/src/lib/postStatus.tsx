import { Ban, CircleCheck, CircleDashed, CircleSlash, CircleX, Clock, Eye, FlaskConical, LoaderCircle, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import type { PostStatus } from '../api/types';

export interface StatusMeta {
  label: string;
  /** What this state means. Only `published` says a post went out. */
  help: string;
  icon: ReactNode;
}

export const STATUS: Record<PostStatus, StatusMeta> = {
  draft: { label: 'Draft', help: 'Editable. Not on the calendar until it has a time.', icon: <CircleDashed size={13} aria-hidden /> },
  needs_review: { label: 'Needs review', help: 'Generated and holding its proposed slot. Nothing goes out until you approve it.', icon: <Eye size={13} aria-hidden /> },
  scheduled: { label: 'Scheduled', help: 'Will publish at its scheduled time, unless publishing is paused.', icon: <Clock size={13} aria-hidden /> },
  publishing: { label: 'Publishing', help: 'A request is in flight.', icon: <LoaderCircle size={13} className="spin" aria-hidden /> },
  published: { label: 'Published', help: 'The provider confirmed this post.', icon: <CircleCheck size={13} aria-hidden /> },
  simulated: { label: 'Simulated', help: 'Dry run. Nothing was posted.', icon: <FlaskConical size={13} aria-hidden /> },
  failed: { label: 'Failed', help: 'Did not post. Fix the cause, then schedule it again.', icon: <CircleX size={13} aria-hidden /> },
  blocked: { label: 'Blocked', help: 'Missing or rejected credentials, or an unsupported platform. Nothing was posted.', icon: <Ban size={13} aria-hidden /> },
  needs_attention: { label: 'Needs attention', help: 'This may or may not be live. Check the platform, then record what you found.', icon: <TriangleAlert size={13} aria-hidden /> },
  cancelled: { label: 'Cancelled', help: 'Will not publish.', icon: <CircleSlash size={13} aria-hidden /> },
};

export function StatusBadge({ status }: { status: PostStatus }) {
  const meta = STATUS[status];
  return <span className={`badge st-${status}`} title={meta.help}>{meta.icon}{meta.label}</span>;
}

/** Allowed-from lists enforced by worker/services/posts.ts. */
export const CAN_EDIT: readonly PostStatus[] = ['draft', 'needs_review', 'scheduled', 'failed', 'blocked', 'simulated'];
export const CAN_DELETE: readonly PostStatus[] = ['draft', 'needs_review', 'failed', 'blocked', 'simulated', 'cancelled'];
export const CAN_SCHEDULE: readonly PostStatus[] = ['draft', 'needs_review', 'scheduled', 'failed', 'blocked', 'simulated', 'cancelled'];
export const CAN_UNSCHEDULE: readonly PostStatus[] = ['scheduled', 'needs_review'];
export const CAN_CANCEL: readonly PostStatus[] = ['draft', 'needs_review', 'scheduled', 'failed', 'blocked', 'simulated'];
export const CAN_PUBLISH_NOW: readonly PostStatus[] = ['draft', 'needs_review', 'scheduled', 'failed', 'blocked', 'simulated'];
