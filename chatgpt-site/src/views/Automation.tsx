import { OctagonPause, Pause, Play, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, errorText } from '../api/client';
import type { ActivityEvent, Autopilot, CycleResult, CycleStopReason, PostingSlot, Settings } from '../api/types';
import { Button, Field, IconButton, LoadError, Notice, PageHead, Spinner, Toggle } from '../components/common';
import { fmtDateTime } from '../lib/dates';
import { useLoad } from '../lib/hooks';
import { useWorkspace } from '../workspace';

const STOP_REASON: Record<CycleStopReason, string> = {
  no_active_pillars: 'No active pillars',
  no_targets: 'No active pillar has a platform it can target',
  review_backlog_full: 'Review backlog is full',
  generator_error: 'The generator failed',
  budget_reached: 'Reached the per-cycle post limit',
  calendar_full: 'No free slots in the planning horizon',
  no_new_ideas: 'No new ideas came back',
};

const DAYS = [{ n: 1, l: 'Mon' }, { n: 2, l: 'Tue' }, { n: 3, l: 'Wed' }, { n: 4, l: 'Thu' }, { n: 5, l: 'Fri' }, { n: 6, l: 'Sat' }, { n: 0, l: 'Sun' }];

export function AutomationView() {
  const ws = useWorkspace();
  const { status } = ws;
  const autopilot = useLoad(api.autopilot.get, [ws.version]);
  const [override, setOverride] = useState<Autopilot | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const current = override ?? autopilot.data;
  useEffect(() => setOverride(null), [autopilot.data]);

  const usablePillars = ws.pillars.filter(p => p.active && p.platforms.length > 0).length;
  const lastCycle = status.autonomy.lastCycle.lastResult;

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    try {
      await action();
    } catch (e) {
      ws.toast(errorText(e), 'error');
    } finally {
      setBusy(null);
      ws.refresh();
    }
  };

  const describeCycle = (result: CycleResult) => {
    const created = `${result.createdPostIds.length} post${result.createdPostIds.length === 1 ? '' : 's'} created`;
    return `${created}. Stopped: ${STOP_REASON[result.stoppedReason] ?? result.stoppedReason}.`;
  };

  return (
    <>
      <PageHead eyebrow="Configure" title="Automation">Two separate controls: autopilot decides whether new posts get generated, the kill switch decides whether anything goes out.</PageHead>

      <div className="split">
        <section className="card">
          <div className="card-head">
            <h3>Autopilot</h3>
            <span className={`badge ${current?.running ? 'state-ready' : ''}`}>{current ? (current.running ? 'Enabled' : 'Paused') : '…'}</span>
          </div>
          <p>Generates ideas and drafts each time the job endpoint runs and a cycle is due. Pausing does not stop posts that are already scheduled.</p>
          {autopilot.error && <LoadError message={autopilot.error} onRetry={autopilot.reload} />}
          <dl className="meta">
            <dt>Last run</dt><dd>{fmtDateTime(current?.lastRunAt)}</dd>
            <dt>Next due</dt><dd>{current?.running ? `${fmtDateTime(current.nextRunAt)}, once the job endpoint is called` : 'Not while paused'}</dd>
            {lastCycle && <><dt>Last result</dt><dd>{describeCycle(lastCycle)}</dd></>}
          </dl>
          {current?.lastError && <Notice tone="alert">Last cycle error: {current.lastError}</Notice>}
          {usablePillars === 0 && <Notice>No active pillar has a platform, so a cycle would create nothing.</Notice>}
          <div className="row">
            {current?.running
              ? <Button variant="primary" busy={busy === 'pause'} disabled={!!busy} onClick={() => void run('pause', async () => { setOverride(await api.autopilot.pause()); ws.toast('Autopilot paused. Scheduled posts still go out.'); })}><Pause size={14} aria-hidden /> Pause autopilot</Button>
              : <Button variant="primary" busy={busy === 'start'} disabled={!!busy || !current} onClick={() => void run('start', async () => { setOverride(await api.autopilot.start()); ws.toast('Autopilot enabled. Cycles run when the job endpoint is called.'); })}><Play size={14} aria-hidden /> Start autopilot</Button>}
            <Button busy={busy === 'cycle'} disabled={!!busy} title="Runs even while autopilot is paused, and follows all review rules." onClick={() => void run('cycle', async () => {
              const { result } = await api.scheduler.runCycle();
              ws.toast(result.error ? `Cycle error: ${result.error}` : describeCycle(result), result.error ? 'error' : 'info');
            })}>Run one cycle now</Button>
          </div>
        </section>

        <section className={`card ${status.publishingPaused ? 'card-strong' : ''}`}>
          <div className="card-head">
            <h3>Kill switch</h3>
            <span className={`badge ${status.publishingPaused ? 'state-unsupported' : 'state-ready'}`}>{status.publishingPaused ? 'Publishing paused' : 'Publishing allowed'}</span>
          </div>
          <p>Stops every outgoing post, scheduled or publish-now. Posts keep their place and wait. Any that fall more than the lateness limit behind fail as missed rather than going out late.</p>
          <dl className="meta">
            <dt>Mode</dt><dd>{status.publishMode === 'dry_run' ? 'Dry run: nothing is posted' : 'Live: real posts'}</dd>
            <dt>Scheduler</dt><dd>No background timer. Runs only when <code>POST {status.scheduler.jobPath}</code> is called.</dd>
            <dt>Job credential</dt><dd>{status.scheduler.jobCredentialConfigured ? 'Configured' : 'None: only you, signed in, can call it'}</dd>
            <dt>Last job call</dt><dd>{fmtDateTime(status.scheduler.lastTickAt)}</dd>
          </dl>
          <div className="row">
            {status.publishingPaused
              ? <Button variant="primary" onClick={() => void ws.setPublishingPaused(false)}><Play size={14} aria-hidden /> Resume publishing</Button>
              : <Button variant="primary" onClick={() => void ws.setPublishingPaused(true)}><OctagonPause size={14} aria-hidden /> Pause publishing</Button>}
            <Button busy={busy === 'publish'} disabled={!!busy} title="Processes posts that are already due." onClick={() => void run('publish', async () => {
              const { result } = await api.scheduler.runPublish();
              ws.toast(result.skippedPaused ? 'Skipped: publishing is paused.' : `Processed ${result.processed}, missed ${result.missed}, recovered ${result.recovered}.`);
            })}>Process due posts</Button>
          </div>
        </section>
      </div>

      <SettingsCard />
      <ActivityFeed />
    </>
  );
}

function SettingsCard() {
  const ws = useWorkspace();
  const settings = useLoad(api.settings.get, [ws.version]);
  const [base, setBase] = useState<Settings | null>(null);
  const [form, setForm] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);

  const dirty = !!form && !!base && JSON.stringify(editable(form)) !== JSON.stringify(editable(base));

  // Polling must not overwrite edits in progress.
  useEffect(() => {
    if (!settings.data || dirty) return;
    setBase(settings.data);
    setForm(settings.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.data]);

  if (settings.error && !form) return <LoadError message={settings.error} onRetry={settings.reload} />;
  if (!form || !base) return <Spinner label="Loading settings" />;

  const numbers = [form.planningHorizonDays, form.cycleIntervalMinutes, form.maxPostsPerCycle, form.maxReviewBacklog, form.maxLatenessMinutes];
  const valid = numbers.every(n => !Number.isNaN(n)) && form.postingSlots.every(s => s.days.length > 0 && s.time);

  const num = (key: 'planningHorizonDays' | 'cycleIntervalMinutes' | 'maxPostsPerCycle' | 'maxReviewBacklog' | 'maxLatenessMinutes', min: number, max: number) => ({
    type: 'number', min, max,
    value: Number.isNaN(form[key]) ? '' : form[key],
    onChange: (e: { target: { valueAsNumber: number } }) => setForm({ ...form, [key]: e.target.valueAsNumber }),
  });

  const setSlot = (index: number, slot: PostingSlot) => setForm({ ...form, postingSlots: form.postingSlots.map((s, i) => i === index ? slot : s) });

  const save = async () => {
    setBusy(true);
    try {
      const saved = await api.settings.update(editable(form));
      setBase(saved);
      setForm(saved);
      ws.toast('Settings saved.');
      ws.refresh();
    } catch (e) {
      ws.toast(errorText(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const setAutoApprove = async (next: boolean) => {
    if (next && !await ws.confirm({
      title: 'Turn on auto-approve?',
      body: ws.status.generator.reviewRequired
        ? `The ${ws.status.generator.id} generator always needs review, so this has no effect until the generator changes.`
        : 'Generated posts will be scheduled without a person reading them first.',
      confirmLabel: 'Turn on',
    })) return;
    try {
      const saved = await api.settings.update({ autoApprove: next });
      setBase(b => b && { ...b, autoApprove: saved.autoApprove });
      setForm(f => f && { ...f, autoApprove: saved.autoApprove });
      ws.refresh();
    } catch (e) {
      ws.toast(errorText(e), 'error');
    }
  };

  return (
    <section className="card section">
      <div className="card-head">
        <h3>Rules</h3>
      </div>

      <div className="switch-row">
        <div>
          <b>Auto-approve generated posts</b>
          <p>
            {ws.status.generator.reviewRequired
              ? `Has no effect: the ${ws.status.generator.id} generator always waits in review.`
              : ws.status.autonomy.effectiveAutoApprove ? 'On: generated posts skip review.' : 'Off: generated posts wait in review.'}
          </p>
        </div>
        <Toggle checked={form.autoApprove} label="Auto-approve generated posts" onChange={next => void setAutoApprove(next)} />
      </div>

      <h4>Posting slots</h4>
      <div className="slots">
        {form.postingSlots.map((slot, index) => (
          <div className="slot" key={index}>
            <div className="days" role="group" aria-label={`Days for slot ${index + 1}`}>
              {DAYS.map(d => (
                <button
                  key={d.n}
                  type="button"
                  aria-pressed={slot.days.includes(d.n)}
                  onClick={() => setSlot(index, { ...slot, days: slot.days.includes(d.n) ? slot.days.filter(x => x !== d.n) : [...slot.days, d.n].sort() })}
                >
                  {d.l}
                </button>
              ))}
            </div>
            <input type="time" aria-label={`Time for slot ${index + 1}`} value={slot.time} onChange={e => setSlot(index, { ...slot, time: e.target.value })} />
            <IconButton label={`Remove slot ${index + 1}`} onClick={() => setForm({ ...form, postingSlots: form.postingSlots.filter((_, i) => i !== index) })}><Trash2 size={14} aria-hidden /></IconButton>
          </div>
        ))}
        {form.postingSlots.length === 0 && <p className="muted">No slots. Approving a post without a time will fail, and autopilot has nowhere to place posts.</p>}
        <Button onClick={() => setForm({ ...form, postingSlots: [...form.postingSlots, { days: [1, 2, 3, 4, 5], time: '09:00' }] })}><Plus size={14} aria-hidden /> Add slot</Button>
      </div>

      <div className="form-grid">
        <Field label="Timezone" hint="Posting slots use this zone. IANA name.">
          <input list="timezones" value={form.timezone} onChange={e => setForm({ ...form, timezone: e.target.value })} />
        </Field>
        <datalist id="timezones">{Intl.supportedValuesOf('timeZone').map(z => <option key={z} value={z} />)}</datalist>
        <Field label="Planning horizon (days)" hint="1 to 60"><input {...num('planningHorizonDays', 1, 60)} /></Field>
        <Field label="Cycle interval (minutes)" hint="5 to 10080"><input {...num('cycleIntervalMinutes', 5, 10080)} /></Field>
        <Field label="Max posts per cycle" hint="1 to 50"><input {...num('maxPostsPerCycle', 1, 50)} /></Field>
        <Field label="Max review backlog" hint="0 to 500. Generation stops at this many."><input {...num('maxReviewBacklog', 0, 500)} /></Field>
        <Field label="Max lateness (minutes)" hint="1 to 10080. Later than this, a post fails as missed."><input {...num('maxLatenessMinutes', 1, 10080)} /></Field>
      </div>

      <div className="row row-end">
        <Button disabled={!dirty || busy} onClick={() => setForm(base)}>Discard</Button>
        <Button variant="primary" busy={busy} disabled={!dirty || !valid} onClick={() => void save()}>Save rules</Button>
      </div>
    </section>
  );
}

/** The fields this form owns. The on/off switches have their own routes and must not be overwritten by a stale form. */
function editable(s: Settings) {
  const { timezone, postingSlots, planningHorizonDays, cycleIntervalMinutes, maxPostsPerCycle, maxReviewBacklog, maxLatenessMinutes } = s;
  return { timezone, postingSlots, planningHorizonDays, cycleIntervalMinutes, maxPostsPerCycle, maxReviewBacklog, maxLatenessMinutes };
}

function ActivityFeed() {
  const ws = useWorkspace();
  const latest = useLoad(() => api.activity({ limit: 30 }), [ws.version]);
  const [older, setOlder] = useState<ActivityEvent[]>([]);
  const [exhausted, setExhausted] = useState(false);
  const [busy, setBusy] = useState(false);

  const head = latest.data?.items ?? [];
  const seen = new Set(head.map(e => e.id));
  const events = [...head, ...older.filter(e => !seen.has(e.id))];

  const loadOlder = async () => {
    const last = events[events.length - 1];
    if (!last) return;
    setBusy(true);
    try {
      const { items } = await api.activity({ limit: 30, beforeId: last.id });
      setOlder(list => [...list, ...items]);
      if (items.length < 30) setExhausted(true);
    } catch (e) {
      ws.toast(errorText(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card section">
      <div className="card-head"><h3>Activity</h3></div>
      {latest.error && <LoadError message={latest.error} onRetry={latest.reload} />}
      {latest.data && events.length === 0 && <p className="muted">Nothing has happened yet.</p>}
      <ol className="activity">
        {events.map(event => (
          <li key={event.id} className={`activity-${event.level}`}>
            <time>{fmtDateTime(event.createdAt)}</time>
            {event.postId
              ? <button className="textbtn" onClick={() => ws.openPost({ kind: 'existing', id: event.postId as string })}>{event.message}</button>
              : <span>{event.message}</span>}
          </li>
        ))}
      </ol>
      {events.length >= 30 && !exhausted && <Button busy={busy} onClick={() => void loadOlder()}>Load older</Button>}
    </section>
  );
}
