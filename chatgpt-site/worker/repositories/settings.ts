import { changed, type Db } from '../db/database.ts';
import { DEFAULT_SETTINGS, EMPTY_BRAND, type Brand, type Settings } from '../domain/types.ts';

export class SettingsRepository {
  private readonly db: Db;
  constructor(db: Db) {
    this.db = db;
  }

  async get(): Promise<Settings> {
    const row = await this.db.prepare('SELECT value FROM settings WHERE id = 1').first<{ value: string }>();
    return { ...DEFAULT_SETTINGS, ...(row ? (JSON.parse(row.value) as Partial<Settings>) : {}) };
  }

  /** Merged inside SQL: a concurrent write, such as the kill switch, cannot be overwritten by a stale read. */
  async update(patch: Partial<Settings>, now: string): Promise<Settings> {
    await this.db
      .prepare(
        `INSERT INTO settings (id, value, updated_at) VALUES (1, ?, ?)
         ON CONFLICT (id) DO UPDATE SET value = json_patch(settings.value, excluded.value), updated_at = excluded.updated_at`,
      )
      .bind(JSON.stringify(patch), now)
      .run();
    return this.get();
  }

  async getBrand(): Promise<Brand> {
    const row = await this.db.prepare('SELECT value FROM brand WHERE id = 1').first<{ value: string }>();
    return { ...EMPTY_BRAND, ...(row ? (JSON.parse(row.value) as Partial<Brand>) : {}) };
  }

  async saveBrand(brand: Brand, now: string): Promise<Brand> {
    await this.db
      .prepare(
        `INSERT INTO brand (id, value, updated_at) VALUES (1, ?, ?)
         ON CONFLICT (id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .bind(JSON.stringify(brand), now)
      .run();
    return brand;
  }

  async getJob(name: string): Promise<{ lastRunAt: string | null; lastResult: unknown }> {
    const row = await this.db
      .prepare('SELECT last_run_at, last_result FROM job_state WHERE name = ?')
      .bind(name)
      .first<{ last_run_at: string | null; last_result: string | null }>();
    return {
      lastRunAt: row?.last_run_at ?? null,
      lastResult: row?.last_result ? JSON.parse(row.last_result) : null,
    };
  }

  async setJob(name: string, lastRunAt: string, lastResult: unknown): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO job_state (name, last_run_at, last_result) VALUES (?, ?, ?)
         ON CONFLICT (name) DO UPDATE SET last_run_at = excluded.last_run_at, last_result = excluded.last_result`,
      )
      .bind(name, lastRunAt, JSON.stringify(lastResult ?? null))
      .run();
  }

  /** Isolates share nothing, so overlap protection has to live in the database. */
  async acquireLock(name: string, now: string, until: string): Promise<boolean> {
    const result = await this.db
      .prepare(
        `INSERT INTO job_locks (name, locked_until) VALUES (?, ?)
         ON CONFLICT (name) DO UPDATE SET locked_until = excluded.locked_until WHERE job_locks.locked_until <= ?`,
      )
      .bind(name, until, now)
      .run();
    return changed(result) > 0;
  }

  async releaseLock(name: string): Promise<void> {
    await this.db.prepare('DELETE FROM job_locks WHERE name = ?').bind(name).run();
  }

  async lockHeld(name: string, now: string): Promise<boolean> {
    const row = await this.db
      .prepare('SELECT 1 AS held FROM job_locks WHERE name = ? AND locked_until > ?')
      .bind(name, now)
      .first();
    return row !== null;
  }

  /** The first signed-in visitor of an owner-private Site is its owner. Later identities never replace it. */
  async claimOwner(userId: string, now: string): Promise<string> {
    await this.db
      .prepare('INSERT OR IGNORE INTO workspace_owner (id, user_id, created_at) VALUES (1, ?, ?)')
      .bind(userId, now)
      .run();
    const row = await this.db.prepare('SELECT user_id FROM workspace_owner WHERE id = 1').first<{ user_id: string }>();
    return row?.user_id ?? userId;
  }
}
