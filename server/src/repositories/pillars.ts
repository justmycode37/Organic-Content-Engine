import type { Db } from '../db/database.ts';
import type { Pillar } from '../domain/types.ts';

type Row = Record<string, unknown>;

const toPillar = (row: Row): Pillar => ({
  id: row.id as string,
  name: row.name as string,
  description: row.description as string,
  audience: row.audience as string,
  tone: row.tone as string,
  keywords: JSON.parse(row.keywords as string),
  platforms: JSON.parse(row.platforms as string),
  active: row.active === 1,
  createdAt: row.created_at as string,
  updatedAt: row.updated_at as string,
});

export class PillarsRepository {
  private readonly db: Db;
  constructor(db: Db) {
    this.db = db;
  }

  list(onlyActive = false): Pillar[] {
    const where = onlyActive ? 'WHERE active = 1' : '';
    return (this.db.prepare(`SELECT * FROM pillars ${where} ORDER BY created_at, id`).all() as Row[]).map(toPillar);
  }

  get(id: string): Pillar | null {
    const row = this.db.prepare('SELECT * FROM pillars WHERE id = ?').get(id) as Row | undefined;
    return row ? toPillar(row) : null;
  }

  save(p: Pillar): Pillar {
    this.db
      .prepare(
        `INSERT INTO pillars (id, name, description, audience, tone, keywords, platforms, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET name = excluded.name, description = excluded.description,
           audience = excluded.audience, tone = excluded.tone, keywords = excluded.keywords,
           platforms = excluded.platforms, active = excluded.active, updated_at = excluded.updated_at`,
      )
      .run(p.id, p.name, p.description, p.audience, p.tone, JSON.stringify(p.keywords), JSON.stringify(p.platforms), p.active ? 1 : 0, p.createdAt, p.updatedAt);
    return p;
  }

  delete(id: string): boolean {
    return Number(this.db.prepare('DELETE FROM pillars WHERE id = ?').run(id).changes) > 0;
  }
}
