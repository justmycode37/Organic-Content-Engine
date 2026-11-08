import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useMemo } from 'react';
import { api } from '../api/client';
import { POST_STATUSES, type PlatformId, type Post, type PostStatus } from '../api/types';
import { Button, IconButton, LoadError, Spinner } from '../components/common';
import { addDays, addMonths, dayKey, defaultTimeOn, fmtTime, monthGrid, parseDayKey, sameDay, WEEKDAYS, weekDays, weekRangeLabel } from '../lib/dates';
import { useLoad } from '../lib/hooks';
import { platformIcon } from '../lib/platforms';
import { STATUS } from '../lib/postStatus';
import { hrefFor, useParams, useWorkspace } from '../workspace';

const MONTH_CELL_MAX = 3;

const firstLine = (post: Post) => post.body.trim().split('\n')[0] || 'Empty post';

export function CalendarView() {
  const ws = useWorkspace();
  const [params, setParams] = useParams();
  const mode = params.get('mode') === 'week' ? 'week' : 'month';
  const today = new Date();
  const anchor = parseDayKey(params.get('d')) ?? today;
  const platform = (params.get('platform') ?? '') as PlatformId | '';
  const statusFilter = (params.get('status') ?? '') as PostStatus | '';

  const days = mode === 'month' ? monthGrid(anchor) : weekDays(anchor);
  const from = days[0].toISOString();
  const to = addDays(days[days.length - 1], 1).toISOString();

  const posts = useLoad(() => api.posts.listAll({ from, to, platform: platform || undefined }), [from, to, platform, ws.version]);

  const byDay = useMemo(() => {
    const groups = new Map<string, Post[]>();
    for (const post of posts.data ?? []) {
      if (!post.scheduledAt) continue;
      // Cancelled posts keep their time but stay out of the way unless asked for.
      if (statusFilter ? post.status !== statusFilter : post.status === 'cancelled') continue;
      const key = dayKey(new Date(post.scheduledAt));
      groups.set(key, [...(groups.get(key) ?? []), post]);
    }
    for (const list of groups.values()) list.sort((a, b) => (a.scheduledAt ?? '').localeCompare(b.scheduledAt ?? ''));
    return groups;
  }, [posts.data, statusFilter]);

  const go = (date: Date, nextMode = mode) => setParams({ d: dayKey(date), mode: nextMode === 'week' ? 'week' : null });
  const step = (direction: 1 | -1) => go(mode === 'month' ? addMonths(anchor, direction) : addDays(anchor, direction * 7));
  const title = mode === 'month'
    ? anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : weekRangeLabel(anchor);
  const shown = [...byDay.values()].reduce((sum, list) => sum + list.length, 0);
  const drafts = ws.status.postCounts.draft ?? 0;
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  return (
    <>
      <div className="cal-head">
        <div className="cal-nav">
          <IconButton label={mode === 'month' ? 'Previous month' : 'Previous week'} onClick={() => step(-1)}><ChevronLeft size={16} aria-hidden /></IconButton>
          <IconButton label={mode === 'month' ? 'Next month' : 'Next week'} onClick={() => step(1)}><ChevronRight size={16} aria-hidden /></IconButton>
          <h1 aria-live="polite">{title}</h1>
          <Button onClick={() => go(today)}>Today</Button>
        </div>
        <div className="cal-tools">
          <div className="segmented" role="group" aria-label="Calendar range">
            <button aria-pressed={mode === 'month'} onClick={() => go(anchor, 'month')}>Month</button>
            <button aria-pressed={mode === 'week'} onClick={() => go(anchor, 'week')}>Week</button>
          </div>
          <select aria-label="Filter by platform" value={platform} onChange={e => setParams({ platform: e.target.value })}>
            <option value="">All platforms</option>
            {ws.platforms.map(p => <option key={p.id} value={p.id}>{p.displayName}</option>)}
          </select>
          <select aria-label="Filter by status" value={statusFilter} onChange={e => setParams({ status: e.target.value })}>
            <option value="">All except cancelled</option>
            {POST_STATUSES.map(s => <option key={s} value={s}>{STATUS[s].label}</option>)}
          </select>
          <Button variant="primary" onClick={() => ws.openPost({ kind: 'new' })}><Plus size={15} aria-hidden /> Create post</Button>
        </div>
      </div>

      {posts.error && <LoadError message={posts.error} onRetry={posts.reload} />}
      {!posts.data && posts.loading && <Spinner label="Loading calendar" />}

      <div className={`calendar calendar-${mode}`}>
        <div className="cal-weekdays" aria-hidden>{WEEKDAYS.map(d => <div key={d}>{d}</div>)}</div>
        <div className="cal-grid">
          {days.map(day => {
            const list = byDay.get(dayKey(day)) ?? [];
            const outside = mode === 'month' && day.getMonth() !== anchor.getMonth();
            const visible = mode === 'month' ? list.slice(0, MONTH_CELL_MAX) : list;
            const isToday = sameDay(day, today);
            return (
              <div key={dayKey(day)} className={`cal-day ${outside ? 'outside' : ''} ${isToday ? 'today' : ''}`}>
                <div className="cal-date">
                  <span className="cal-num" aria-current={isToday ? 'date' : undefined}>
                    <span className="cal-dow">{day.toLocaleDateString(undefined, { weekday: 'short' })} </span>{day.getDate()}
                  </span>
                  {day >= startOfToday && (
                    <button
                      className="cal-add"
                      aria-label={`New post on ${day.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}`}
                      onClick={() => ws.openPost({ kind: 'new', scheduledAt: defaultTimeOn(day).toISOString() })}
                    >
                      <Plus size={13} aria-hidden />
                    </button>
                  )}
                </div>
                {visible.map(post => (
                  <button key={post.id} className={`chip st-${post.status}`} title={`${STATUS[post.status].label}: ${firstLine(post)}`} onClick={() => ws.openPost({ kind: 'existing', id: post.id })}>
                    <span className="chip-meta">
                      {platformIcon(post.platform)}
                      <time>{fmtTime(new Date(post.scheduledAt as string))}</time>
                      <span className="chip-icon">{STATUS[post.status].icon}</span>
                    </span>
                    <span className="chip-text">{firstLine(post)}</span>
                    {mode === 'week' && <span className="chip-status">{STATUS[post.status].label}</span>}
                  </button>
                ))}
                {list.length > visible.length && (
                  <button className="cal-more" onClick={() => go(day, 'week')}>+{list.length - visible.length} more</button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="cal-foot">
        <span>
          {posts.data && shown === 0 ? 'Nothing on the calendar in this range. ' : ''}
          Times in {Intl.DateTimeFormat().resolvedOptions().timeZone}.
        </span>
        {drafts > 0 && <a className="link" href={hrefFor('library', { status: 'draft' })}>{drafts} unscheduled draft{drafts === 1 ? '' : 's'} in the library</a>}
      </div>
    </>
  );
}
