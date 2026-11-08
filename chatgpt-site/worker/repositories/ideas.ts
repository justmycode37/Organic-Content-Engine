import { changed, type Db, type Row } from '../db/database.ts';
import type { Idea, IdeaStatus } from '../domain/types.ts';

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

  async get(id: string): Promise<Idea | null> {
    const row = await this.db.prepare('SELECT * FROM ideas WHERE id = ?').bind(id).first<Row>();
    return row ? toIdea(row) : null;
  }

  async list(filter: { pillarId?: string; status?: IdeaStatus; limit: number; offset: number }): Promise<{ items: Idea[]; total: number }> {
    const clauses: string[] = [];
    const params: string[] = [];
    if (filter.pillarId) { clauses.push('pillar_id = ?'); params.push(filter.pillarId); }
    if (filter.status) { clauses.push('status = ?'); params.push(filter.status); }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const total = await this.db.prepare(`SELECT COUNT(*) AS n FROM ideas ${where}`).bind(...params).first<{ n: number }>();
    const { results } = await this.db
      .prepare(`SELECT * FROM ideas ${where} ORDER BY created_at DESC, id LIMIT ? OFFSET ?`)
      .bind(...params, filter.limit, filter.offset)
      .all<Row>();
    return { items: results.map(toIdea), total: total?.n ?? 0 };
  }

  /** Returns null when an idea with the same normalized title already exists for the pillar. */
  async insert(idea: Idea): Promise<Idea | null> {
    const result = await this.db
      .prepare(
        `INSERT OR IGNORE INTO ideas (id, pillar_id, title, title_key, angle, source, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(idea.id, idea.pillarId, idea.title, titleKey(idea.title), idea.angle, idea.source, idea.status, idea.createdAt, idea.updatedAt)
      .run();
    return changed(result) > 0 ? idea : null;
  }

  updateStatement(idea: Idea): D1PreparedStatement {
    return this.db
      .prepare('UPDATE ideas SET title = ?, title_key = ?, angle = ?, status = ?, updated_at = ? WHERE id = ?')
      .bind(idea.title, titleKey(idea.title), idea.angle, idea.status, idea.updatedAt, idea.id);
  }

  async update(idea: Idea): Promise<void> {
    await this.updateStatement(idea).run();
  }

  async delete(id: string): Promise<boolean> {
    return changed(await this.db.prepare('DELETE FROM ideas WHERE id = ?').bind(id).run()) > 0;
  }

  async nextUnused(pillarId: string): Promise<Idea | null> {
    const row = await this.db
      .prepare(`SELECT * FROM ideas WHERE pillar_id = ? AND status = 'new' ORDER BY created_at, id LIMIT 1`)
      .bind(pillarId)
      .first<Row>();
    return row ? toIdea(row) : null;
  }

  async recentTitles(pillarId: string, limit: number): Promise<string[]> {
    const { results } = await this.db
      .prepare('SELECT title FROM ideas WHERE pillar_id = ? ORDER BY created_at DESC LIMIT ?')
      .bind(pillarId, limit)
      .all<{ title: string }>();
    return results.map((r) => r.title);
  }
}
