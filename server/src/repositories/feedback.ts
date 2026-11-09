import type { Db } from '../db/database.ts';
import type { PlatformId } from '../domain/platforms.ts';

export interface FeedbackEntry {
  postId: string; platform: PlatformId; pillarId: string | null; format: string;
  verdict: 'successful' | 'iterate' | 'discard' | null; notes: string;
  impressions?: number; engagements?: number; conversions?: number; updatedAt: string;
}
export interface FormatInsight {
  format: string; platform: PlatformId; samples: number; successes: number;
  iterations: number; discards: number; recommendation: 'explore' | 'reuse' | 'iterate' | 'retire';
}
type Row = Record<string, unknown>;
const entry = (r: Row): FeedbackEntry => ({
  postId: r.post_id as string, platform: r.platform as PlatformId, pillarId: r.pillar_id as string | null,
  format: r.format as string, verdict: r.verdict as FeedbackEntry['verdict'], notes: r.notes as string,
  ...(r.impressions == null ? {} : { impressions: r.impressions as number }),
  ...(r.engagements == null ? {} : { engagements: r.engagements as number }),
  ...(r.conversions == null ? {} : { conversions: r.conversions as number }), updatedAt: r.updated_at as string,
});

export class FeedbackRepository {
  private readonly db: Db;
  constructor(db: Db) { this.db = db; }
  list(): FeedbackEntry[] {
    return (this.db.prepare(`SELECT f.*, p.platform, p.pillar_id FROM post_feedback f JOIN posts p ON p.id=f.post_id ORDER BY f.updated_at DESC`).all() as Row[]).map(entry);
  }
  get(postId: string): FeedbackEntry | null {
    const row = this.db.prepare(`SELECT f.*, p.platform, p.pillar_id FROM post_feedback f JOIN posts p ON p.id=f.post_id WHERE p.id=?`).get(postId) as Row | undefined;
    return row ? entry(row) : null;
  }
  save(postId: string, input: Omit<FeedbackEntry, 'postId'|'platform'|'pillarId'|'updatedAt'>, updatedAt: string): void {
    this.db.prepare(`INSERT INTO post_feedback(post_id,format,verdict,notes,impressions,engagements,conversions,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(post_id) DO UPDATE SET format=excluded.format, verdict=excluded.verdict, notes=excluded.notes, impressions=excluded.impressions, engagements=excluded.engagements, conversions=excluded.conversions, updated_at=excluded.updated_at`)
      .run(postId,input.format,input.verdict,input.notes,input.impressions ?? null,input.engagements ?? null,input.conversions ?? null,updatedAt);
  }
  insights(platform?: PlatformId, pillarId?: string): FormatInsight[] {
    const rows = this.db.prepare(`SELECT f.format,p.platform,COUNT(*) samples,SUM(CASE WHEN f.verdict='successful' THEN 1 ELSE 0 END) successes,SUM(CASE WHEN f.verdict='iterate' THEN 1 ELSE 0 END) iterations,SUM(CASE WHEN f.verdict='discard' THEN 1 ELSE 0 END) discards FROM post_feedback f JOIN posts p ON p.id=f.post_id WHERE (? IS NULL OR p.platform=?) AND (? IS NULL OR p.pillar_id=?) GROUP BY f.format,p.platform ORDER BY f.format,p.platform`).all(platform ?? null, platform ?? null, pillarId ?? null, pillarId ?? null) as Row[];
    // Engagement rate is comparable only among posts with recorded impressions.
    // Require three posts for a format and compare against the platform mean.
    const rates = this.db.prepare(`SELECT f.format,p.platform,AVG(1.0*f.engagements/f.impressions) rate,COUNT(*) samples FROM post_feedback f JOIN posts p ON p.id=f.post_id WHERE p.status='published' AND f.impressions>=100 AND f.engagements IS NOT NULL AND (? IS NULL OR p.platform=?) AND (? IS NULL OR p.pillar_id=?) GROUP BY f.format,p.platform HAVING COUNT(*)>=3`).all(platform ?? null, platform ?? null, pillarId ?? null, pillarId ?? null) as Row[];
    const baselineRows = this.db.prepare(`SELECT p.platform,1.0*f.engagements/f.impressions rate FROM post_feedback f JOIN posts p ON p.id=f.post_id WHERE p.status='published' AND f.impressions>=100 AND f.engagements IS NOT NULL AND (? IS NULL OR p.platform=?) AND (? IS NULL OR p.pillar_id=?)`).all(platform ?? null, platform ?? null, pillarId ?? null, pillarId ?? null) as Row[];
    const baselines = new Map<string, number>();
    for (const p of new Set(baselineRows.map(r => String(r.platform)))) {
      const values = baselineRows.filter(r => r.platform === p).map(r => Number(r.rate));
      if (values.length >= 3) baselines.set(p, values.reduce((sum, value) => sum + value, 0) / values.length);
    }
    const metricWinners = new Set(rates.filter(r => baselines.has(String(r.platform)) && Number(r.rate) > (baselines.get(String(r.platform)) as number)).map(r => `${r.format}\0${r.platform}`));
    const metricLosers = new Set(rates.filter(r => baselines.has(String(r.platform)) && Number(r.rate) < 0.7 * (baselines.get(String(r.platform)) as number)).map(r => `${r.format}\0${r.platform}`));
    return rows.map(r => {
      const samples = Number(r.samples), successes = Number(r.successes), iterations = Number(r.iterations), discards = Number(r.discards);
      // Retirement additionally requires three comparable, sufficiently exposed posts
      // with engagement rate below 70% of the platform mean.
      const key = `${r.format}\0${r.platform}`;
      const recommendation: FormatInsight['recommendation'] = discards >= 5 && successes === 0 && metricLosers.has(`${r.format}\0${r.platform}`) ? 'retire'
        : successes >= 2 && successes > discards ? 'reuse'
        : iterations >= 2 && iterations > successes || metricLosers.has(key) ? 'iterate'
        : metricWinners.has(key) && discards === 0 && iterations === 0 ? 'reuse' : 'explore';
      return { format:r.format as string, platform:r.platform as PlatformId, samples, successes, iterations, discards, recommendation };
    });
  }
  context(platform: PlatformId, pillarId: string): string {
    const insights = this.insights(platform, pillarId);
    if (!insights.length) return '';
    const examples = this.db.prepare(`SELECT f.format,f.verdict,f.notes,substr(p.body,1,500) body FROM post_feedback f JOIN posts p ON p.id=f.post_id WHERE p.platform=? AND p.pillar_id=? ORDER BY f.updated_at DESC LIMIT 6`).all(platform,pillarId) as Row[];
    const summary = insights.map(i => `- ${i.format}: ${i.recommendation} (${i.samples} samples, ${i.successes} successful, ${i.iterations} to iterate, ${i.discards} discarded)`).join('\n');
    const evidence = examples.map(e => `- ${e.format} [${e.verdict ?? 'unrated'}]: ${String(e.notes).slice(0,300)}${e.verdict === 'discard' ? `; avoid this example: ${String(e.body).slice(0,250)}` : e.verdict === 'successful' ? `; successful pattern: ${String(e.body).slice(0,250)}` : ''}`).join('\n');
    return `Prior format feedback for ${platform} in this topic pillar. Treat retired formats as ineligible and avoid discarded examples; reuse formats marked reuse, and improve those marked iterate.\n${summary}${evidence ? `\nRecent editorial evidence:\n${evidence}` : ''}`;
  }
}
