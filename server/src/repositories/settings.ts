import type { Db } from '../db/database.ts';
import { DEFAULT_SETTINGS, EMPTY_BRAND, type Brand, type Settings } from '../domain/types.ts';

export class SettingsRepository {
  private readonly db: Db;
  constructor(db: Db) {
    this.db = db;
  }

  get(): Settings {
    const row = this.db.prepare('SELECT value FROM settings WHERE id = 1').get() as { value: string } | undefined;
    return { ...DEFAULT_SETTINGS, ...(row ? (JSON.parse(row.value) as Partial<Settings>) : {}) };
  }

  update(patch: Partial<Settings>, now: string): Settings {
    const next = { ...this.get(), ...patch };
    this.db
      .prepare(
        `INSERT INTO settings (id, value, updated_at) VALUES (1, ?, ?)
         ON CONFLICT (id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(JSON.stringify(next), now);
    return next;
  }

  getBrand(): Brand {
    const row = this.db.prepare('SELECT value FROM brand WHERE id = 1').get() as { value: string } | undefined;
    return { ...EMPTY_BRAND, ...(row ? (JSON.parse(row.value) as Partial<Brand>) : {}) };
  }

  saveBrand(brand: Brand, now: string): Brand {
    this.db
      .prepare(
        `INSERT INTO brand (id, value, updated_at) VALUES (1, ?, ?)
         ON CONFLICT (id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(JSON.stringify(brand), now);
    return brand;
  }

  getJob(name: string): { lastRunAt: string | null; lastResult: unknown } {
    const row = this.db.prepare('SELECT last_run_at, last_result FROM job_state WHERE name = ?').get(name) as
      | { last_run_at: string | null; last_result: string | null }
      | undefined;
    return {
      lastRunAt: row?.last_run_at ?? null,
      lastResult: row?.last_result ? JSON.parse(row.last_result) : null,
    };
  }

  setJob(name: string, lastRunAt: string, lastResult: unknown): void {
    this.db
      .prepare(
        `INSERT INTO job_state (name, last_run_at, last_result) VALUES (?, ?, ?)
         ON CONFLICT (name) DO UPDATE SET last_run_at = excluded.last_run_at, last_result = excluded.last_result`,
      )
      .run(name, lastRunAt, JSON.stringify(lastResult ?? null));
  }
}
