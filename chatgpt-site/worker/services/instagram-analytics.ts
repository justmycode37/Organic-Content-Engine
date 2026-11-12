import type { Db } from '../db/database.ts';
import { AppError } from '../errors.ts';
import type { SocialAccounts } from './social.ts';
import { InstagramAnalyticsRepository, type InstagramMetrics } from '../repositories/instagram-analytics.ts';

const REEL_METRICS = [
  'views', 'reach', 'likes', 'comments', 'saved', 'shares', 'total_interactions',
  'ig_reels_avg_watch_time', 'ig_reels_video_view_total_time',
] as const;

interface MetaMetric {
  name?: string;
  values?: Array<{ value?: unknown }>;
  value?: unknown;
}

interface MetaErrorPayload {
  error?: { message?: string; type?: string; code?: number | string; error_subcode?: number | string; is_transient?: boolean };
  [key: string]: unknown;
}

interface InsightsRow {
  id: string;
  post_id: string;
  age_bucket: string;
  scheduled_at: string;
  external_id: string | null;
  publish_options: string;
  attempt_count: number;
}

class InstagramInsightsError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly raw: unknown,
    readonly retryAfterMs: number | null = null,
    readonly retryable = false,
    readonly blocked = false,
  ) { super(message); }
}

const safeJson = (value: unknown) => {
  try { return JSON.stringify(value); } catch { return JSON.stringify({ error: 'unserializable_response' }); }
};

const finiteNumber = (value: unknown): number | null => {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

function retryAfterMs(value: string | null, nowMs: number): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - nowMs) : null;
}

function apiError(response: Response, payload: MetaErrorPayload, nowMs: number): InstagramInsightsError {
  const meta = payload.error;
  const code = String(meta?.code ?? response.status);
  const message = String(meta?.message ?? `Instagram Graph API returned HTTP ${response.status}`);
  const raw = payload;
  if (response.status === 429 || [ '4', '17', '32', '613' ].includes(code) || meta?.is_transient) {
    return new InstagramInsightsError('rate_limited', message, raw, retryAfterMs(response.headers.get('retry-after'), nowMs), true);
  }
  if (response.status === 401 || code === '190') {
    return new InstagramInsightsError('token_expired', 'Instagram authorization expired. Reconnect Instagram and retry this snapshot.', raw, null, false, true);
  }
  if (response.status === 403 || code === '10' || code === '200') {
    return new InstagramInsightsError('permission_required', 'Instagram Insights permission is missing. Approve instagram_business_manage_insights in the Meta app and reconnect Instagram.', raw, null, false, true);
  }
  if (response.status >= 500) return new InstagramInsightsError('provider_unavailable', 'Instagram Graph API is temporarily unavailable.', raw, null, true);
  return new InstagramInsightsError(`instagram_api_${code}`, message, raw);
}

function missingMetricError(error: unknown): error is InstagramInsightsError {
  return error instanceof InstagramInsightsError
    && error.code.startsWith('instagram_api_100')
    && /metric|insight field|parameter/i.test(error.message);
}

function metricValue(metrics: MetaMetric[], name: string): number | null {
  const row = metrics.find((candidate) => candidate.name === name);
  if (!row) return null;
  const value = row.values?.[0]?.value ?? row.value;
  return finiteNumber(value);
}

function normalize(metrics: MetaMetric[], metricErrors: Record<string, string>) {
  const unknownMetrics: Record<string, string> = {
    follows: 'not_applicable_to_reels_in_meta_media_reference',
    profile_visits: 'not_applicable_to_reels_in_meta_media_reference',
  };
  for (const metric of REEL_METRICS) {
    if (metricErrors[metric]) unknownMetrics[metric] = metricErrors[metric]!;
    else if (!metrics.some((candidate) => candidate.name === metric) || metricValue(metrics, metric) === null) unknownMetrics[metric] = 'not_returned';
  }

  const views = metricValue(metrics, 'views');
  const reach = metricValue(metrics, 'reach');
  const likes = metricValue(metrics, 'likes');
  const comments = metricValue(metrics, 'comments');
  const saves = metricValue(metrics, 'saved');
  const shares = metricValue(metrics, 'shares');
  const totalInteractions = metricValue(metrics, 'total_interactions');
  const averageWatchTimeMs = metricValue(metrics, 'ig_reels_avg_watch_time');
  const totalWatchTimeMs = metricValue(metrics, 'ig_reels_video_view_total_time');
  const perReach = (value: number | null) => value === null || reach === null || reach <= 0 ? null : value / reach;
  for (const [name, value] of [['likesPerReach', likes], ['sharesPerReach', shares], ['savesPerReach', saves]] as const) {
    if (value === null) unknownMetrics[name] = 'source_metric_unavailable';
    else if (reach === null || reach <= 0) unknownMetrics[name] = 'reach_unavailable_or_zero';
  }

  const result: InstagramMetrics = {
    views, reach, likes, comments, saves, shares, totalInteractions,
    averageWatchTimeMs, totalWatchTimeMs,
    likesPerReach: perReach(likes), sharesPerReach: perReach(shares), savesPerReach: perReach(saves),
    follows: null, profileVisits: null,
  };
  const missing = REEL_METRICS.filter((name) => unknownMetrics[name]);
  const warning = missing.length ? `Meta did not return: ${missing.join(', ')}` : null;
  return { metrics: result, unknownMetrics, warning };
}

export class InstagramAnalyticsService {
  private readonly repo: InstagramAnalyticsRepository;
  private readonly network: typeof fetch;

  constructor(
    db: Db,
    private readonly social: SocialAccounts,
    private readonly env: Record<string, string | undefined>,
    network: typeof fetch = fetch,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.repo = new InstagramAnalyticsRepository(db);
    this.network = (input, init) => network(input, init);
  }

  async page() { return this.repo.page(); }

  async learning(platform: import('../domain/platforms.ts').PlatformId, pillarId: string | null) {
    return this.repo.learning(platform, pillarId);
  }

  async retryFailed() { return this.repo.retryFailed(this.now().toISOString()); }

  async runDue() {
    const now = this.now();
    const nowIso = now.toISOString();
    const scheduled = await this.repo.ensureSchedules(nowIso);
    const rows = await this.repo.due(nowIso);
    const result = { scheduled, processed: 0, complete: 0, partial: 0, retryScheduled: 0, failed: 0, errors: [] as string[] };

    for (const row of rows) {
      const leaseId = crypto.randomUUID();
      const capturedAt = this.now().toISOString();
      const leaseUntil = new Date(Date.parse(capturedAt) + 120_000).toISOString();
      if (!await this.repo.claim(row.id, capturedAt, leaseId, leaseUntil)) continue;
      result.processed += 1;
      try {
        const fetched = await this.fetchMetrics(row);
        await this.repo.complete({
          id: row.id,
          leaseId,
          status: fetched.warning || Object.keys(fetched.metricErrors).length ? 'partial' : 'complete',
          capturedAt: this.now().toISOString(),
          rawJson: safeJson(fetched.raw),
          metricsJson: safeJson({ metrics: fetched.metrics, unknownMetrics: fetched.unknownMetrics }),
          errorCode: fetched.warning ? 'metrics_unavailable' : null,
          errorMessage: fetched.warning,
        });
        if (fetched.warning) {
          result.partial += 1;
          result.errors.push(`${row.age_bucket} snapshot for post ${row.post_id}: ${fetched.warning}`);
        } else result.complete += 1;
      } catch (error) {
        const normalized = this.classify(error);
        const retryAt = normalized.retryable
          ? new Date(this.now().getTime() + Math.max(normalized.retryAfterMs ?? 0, this.backoff(row.attempt_count + 1))).toISOString()
          : null;
        await this.repo.fail({
          id: row.id,
          leaseId,
          now: this.now().toISOString(),
          nextAttemptAt: retryAt,
          code: normalized.code,
          message: normalized.message,
          rawJson: normalized.raw ? safeJson(normalized.raw) : null,
        });
        if (retryAt) result.retryScheduled += 1; else result.failed += 1;
        result.errors.push(`${row.age_bucket} snapshot for post ${row.post_id}: ${normalized.message}`);
      }
    }
    return result;
  }

  private async fetchMetrics(row: InsightsRow) {
    if (!row.external_id) throw new InstagramInsightsError('external_media_id_missing', 'Instagram did not return a media ID for this published post.', null, null, false, true);
    const { account, access } = await this.social.token('instagram').catch((error: unknown) => { throw this.fromSocialError(error); });
    let options: Record<string, unknown>;
    try { options = JSON.parse(row.publish_options || '{}') as Record<string, unknown>; }
    catch { options = {}; }
    if (options.accountId && options.accountId !== account.account_id) {
      throw new InstagramInsightsError('account_changed', 'The connected Instagram account differs from the account that published this Reel. Reconnect the original account to collect its insights.', null, null, false, true);
    }

    const version = this.env.INSTAGRAM_API_VERSION ?? 'v25.0';
    if (!/^v\d+\.\d+$/.test(version)) throw new InstagramInsightsError('invalid_api_version', 'INSTAGRAM_API_VERSION must look like v25.0.', null, null, false, true);
    const url = `https://graph.instagram.com/${version}/${encodeURIComponent(row.external_id)}/insights`;
    const requestMetrics = async (names: readonly string[]) => {
      const requestUrl = new URL(url);
      requestUrl.searchParams.set('metric', names.join(','));
      const response = await this.network(requestUrl.toString(), {
        headers: { Authorization: `Bearer ${access}` },
        redirect: 'manual',
        signal: AbortSignal.timeout(30_000),
      }).catch((error: unknown) => { throw new InstagramInsightsError('network_error', error instanceof Error ? error.message : 'Instagram request failed.', null, null, true); });
      let payload: MetaErrorPayload;
      try { payload = await response.json() as MetaErrorPayload; }
      catch { throw new InstagramInsightsError('invalid_response', 'Instagram returned unreadable insights data.', null, null, response.status >= 500); }
      if (!response.ok || payload.error) throw apiError(response, payload, this.now().getTime());
      return { payload, metrics: Array.isArray(payload.data) ? payload.data as MetaMetric[] : [] };
    };

    try {
      const response = await requestMetrics(REEL_METRICS);
      const normalized = normalize(response.metrics, {});
      return { ...normalized, metricErrors: {} as Record<string, string>, raw: response.payload };
    } catch (error) {
      if (!missingMetricError(error)) throw error;
      const allMetrics: MetaMetric[] = [];
      const raw: Array<{ metric: string; response?: unknown; error?: unknown }> = [];
      const errors: Record<string, string> = {};
      for (const name of REEL_METRICS) {
        try {
          const response = await requestMetrics([name]);
          allMetrics.push(...response.metrics);
          raw.push({ metric: name, response: response.payload });
        } catch (metricError) {
          if (metricError instanceof InstagramInsightsError && metricError.retryable) throw metricError;
          if (metricError instanceof InstagramInsightsError && metricError.blocked) throw metricError;
          const message = metricError instanceof Error ? metricError.message : 'Metric unavailable';
          errors[name] = message;
          raw.push({ metric: name, error: metricError instanceof InstagramInsightsError ? metricError.raw ?? { message } : { message } });
        }
      }
      const normalized = normalize(allMetrics, errors);
      const unknown = { ...normalized.unknownMetrics, ...errors };
      const failed = Object.keys(errors);
      const warning = [normalized.warning, failed.length ? `Metric requests failed: ${failed.join(', ')}` : null].filter(Boolean).join('. ') || null;
      return { ...normalized, unknownMetrics: unknown, metricErrors: errors, warning, raw };
    }
  }

  private classify(error: unknown): { code: string; message: string; raw: unknown; retryable: boolean; retryAfterMs: number | null } {
    if (error instanceof InstagramInsightsError) return {
      code: error.code,
      message: error.message,
      raw: error.raw,
      retryable: error.retryable,
      retryAfterMs: error.retryAfterMs,
    };
    const social = this.fromSocialError(error);
    return { code: social.code, message: social.message, raw: social.raw, retryable: social.retryable, retryAfterMs: social.retryAfterMs };
  }

  private fromSocialError(error: unknown): InstagramInsightsError {
    if (error instanceof AppError) {
      if (error.code === 'account_missing') return new InstagramInsightsError('account_missing', 'Connect an Instagram account before collecting Reel insights.', null, null, false, true);
      if (error.code === 'reconnect_required' || error.code === 'provider_request_failed') return new InstagramInsightsError('token_expired', 'Instagram authorization could not be refreshed. Reconnect Instagram and retry this snapshot.', null, null, false, true);
      if (error.code === 'account_refreshing') return new InstagramInsightsError('account_refreshing', error.message, null, 60_000, true);
      return new InstagramInsightsError(error.code, error.message, null, null, error.status >= 500, error.status < 500);
    }
    return new InstagramInsightsError('authorization_error', error instanceof Error ? error.message : 'Instagram authorization failed.', null, null, false, true);
  }

  private backoff(attempt: number) {
    return Math.min(6 * 60 * 60_000, 15 * 60_000 * (2 ** Math.max(0, Math.min(4, attempt - 1))));
  }
}
