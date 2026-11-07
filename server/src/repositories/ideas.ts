import type { Db } from '../db/database.ts';
import type { Idea, IdeaStatus } from '../domain/types.ts';

type Row = Record<string, unknown>;

const toIdea = (row: Row): Idea => ({
  id: row.id as string,
  pillarId: row.pillar_id as string,
  title: row.title as string,
  angle: row.angle as string,
  source: row.source as string,
  status: row.status as IdeaStatus,
  createdAt: row.created_at as string,
  updatedAt: row.updated_at as string,
});

export const titleKey = (title: string) =>
  title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export class IdeasRepository {
  private readonly db: Db;
  constructor(db: Db) {
    this.db = db;
  }

  get(id: string): Idea | null {
    const row = this.db.prepare('SELECT * FROM ideas WHERE id = ?').get(id) as Row | undefined;
    return row ? toIdea(row) : null;
  }

  list(filter: { pillarId?: string; status?: IdeaStatus; limit: number; offset: number }): { items: Idea[]; total: number } {
    const clauses: string[] = [];
    const params: string[] = [];
    if (filter.pillarId) { clauses.push('pillar_id = ?'); params.push(filter.pillarId); }
    if (filter.status) { clauses.push('status = ?'); params.push(filter.status); }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const total = this.db.prepare(`SELECT COUNT(*) AS n FROM ideas ${where}`).get(...params) as { n: number };
    const rows = this.db
      .prepare(`SELECT * FROM ideas ${where} ORDER BY created_at DESC, id LIMIT ? OFFSET ?`)
      .all(...params, filter.limit, filter.offset) as Row[];
    return { items: rows.map(toIdea), total: total.n };
  }

  /** Returns null when an idea with the same normalized title already exists for the pillar. */
  insert(idea: Idea): Idea | null {
    const result = this.db
      .prepare(
        `INSERT OR IGNORE INTO ideas (id, pillar_id, title, title_key, angle, source, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(idea.id, idea.pillarId, idea.title, titleKey(idea.title), idea.angle, idea.source, idea.status, idea.createdAt, idea.updatedAt);
    return Number(result.changes) > 0 ? idea : null;
  }

  update(idea: Idea): void {
    this.db
      .prepare('UPDATE ideas SET title = ?, title_key = ?, angle = ?, status = ?, updated_at = ? WHERE id = ?')
      .run(idea.title, titleKey(idea.title), idea.angle, idea.status, idea.updatedAt, idea.id);
  }

  delete(id: string): boolean {
    return Number(this.db.prepare('DELETE FROM ideas WHERE id = ?').run(id).changes) > 0;
  }

  nextUnused(pillarId: string): Idea | null {
    const row = this.db
      .prepare(`SELECT * FROM ideas WHERE pillar_id = ? AND status = 'new' ORDER BY created_at, id LIMIT 1`)
      .get(pillarId) as Row | undefined;
    return row ? toIdea(row) : null;
  }

  recentTitles(pillarId: string, limit: number): string[] {
    const rows = this.db
      .prepare('SELECT title FROM ideas WHERE pillar_id = ? ORDER BY created_at DESC LIMIT ?')
      .all(pillarId, limit) as Array<{ title: string }>;
    return rows.map((r) => r.title);
  }
}
