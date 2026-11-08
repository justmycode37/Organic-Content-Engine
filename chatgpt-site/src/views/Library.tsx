import { Plus, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { POST_STATUSES, type PlatformId, type PostStatus } from '../api/types';
import { Button, Empty, LoadError, PageHead, Pager, Spinner } from '../components/common';
import { fmtDateTime } from '../lib/dates';
import { useLoad } from '../lib/hooks';
import { platformIcon } from '../lib/platforms';
import { STATUS, StatusBadge } from '../lib/postStatus';
import { useParams, useWorkspace } from '../workspace';

const LIMIT = 50;

export function LibraryView() {
  const ws = useWorkspace();
  const [params, setParams] = useParams();
  const status = (POST_STATUSES as readonly string[]).includes(params.get('status') ?? '') ? params.get('status') as PostStatus : undefined;
  const platform = (params.get('platform') ?? '') as PlatformId | '';
  const pillarId = params.get('pillar') ?? '';
  const [offset, setOffset] = useState(0);

  useEffect(() => setOffset(0), [status, platform, pillarId]);

  const page = useLoad(
    () => api.posts.list({ status, platform: platform || undefined, pillarId: pillarId || undefined, limit: LIMIT, offset }),
    [status, platform, pillarId, offset, ws.version],
  );

  const counts = ws.status.postCounts;
  const total = POST_STATUSES.reduce((sum, s) => sum + (counts[s] ?? 0), 0);
  const pillarName = (id: string | null) => ws.pillars.find(p => p.id === id)?.name ?? '—';
  const filtered = !!(status || platform || pillarId);

  return (
    <>
      <PageHead
        eyebrow="Plan"
        title="Library"
        actions={<Button variant="primary" onClick={() => ws.openPost({ kind: 'new' })}><Plus size={15} aria-hidden /> Create post</Button>}
      >
        Every post, whatever its state. Only Published means a post went out.
      </PageHead>

      <div className="chips" role="group" aria-label="Filter by status">
        <button className="filter" aria-pressed={!status} onClick={() => setParams({ status: null })}>All <span>{total}</span></button>
        {POST_STATUSES.map(s => (
          <button key={s} className="filter" aria-pressed={status === s} onClick={() => setParams({ status: s })}>{STATUS[s].label} <span>{counts[s] ?? 0}</span></button>
        ))}
      </div>

      <div className="filters">
        <select aria-label="Filter by platform" value={platform} onChange={e => setParams({ platform: e.target.value })}>
          <option value="">All platforms</option>
          {ws.platforms.map(p => <option key={p.id} value={p.id}>{p.displayName}</option>)}
        </select>
        <select aria-label="Filter by pillar" value={pillarId} onChange={e => setParams({ pillar: e.target.value })}>
          <option value="">All pillars</option>
          {ws.pillars.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {page.error && <LoadError message={page.error} onRetry={page.reload} />}
      {!page.data && page.loading && <Spinner label="Loading posts" />}
      {page.data?.items.length === 0 && (
        filtered
          ? <Empty title="No posts match these filters" />
          : <Empty title="No posts yet" action={<Button variant="primary" onClick={() => ws.openPost({ kind: 'new' })}>Create post</Button>}>Write one here, or draft from an idea.</Empty>
      )}

      {!!page.data?.items.length && (
        <table className="table">
          <thead>
            <tr><th>Post</th><th>Status</th><th>Platform</th><th>Pillar</th><th>When</th></tr>
          </thead>
          <tbody>
            {page.data.items.map(post => (
              <tr key={post.id} onClick={() => ws.openPost({ kind: 'existing', id: post.id })}>
                <td className="table-main">
                  <button onClick={e => { e.stopPropagation(); ws.openPost({ kind: 'existing', id: post.id }); }}>
                    {post.body.trim().split('\n')[0] || 'Empty post'}
                  </button>
                  {post.issues.length > 0 && <span className="issue-flag" title={post.issues.map(i => i.message).join(' ')}><TriangleAlert size={12} aria-hidden /> {post.issues.length} issue{post.issues.length === 1 ? '' : 's'}</span>}
                </td>
                <td><StatusBadge status={post.status} /></td>
                <td><span className="with-icon">{platformIcon(post.platform)}{ws.platform(post.platform)?.displayName ?? post.platform}</span></td>
                <td>{pillarName(post.pillarId)}</td>
                <td className="nowrap">{post.publishedAt ? fmtDateTime(post.publishedAt) : post.scheduledAt ? fmtDateTime(post.scheduledAt) : 'No time set'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {page.data && <Pager total={page.data.total} limit={LIMIT} offset={offset} onChange={setOffset} />}
    </>
  );
}
