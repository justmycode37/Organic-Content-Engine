import type { Db, Row } from '../db/database.ts';
import type { ActivityEvent } from '../domain/types.ts';

type NewEvent = { type: string; level?: ActivityEvent['level']; message: string; postId?: string | null };

export class ActivityRepository {
  private readonly db: Db;
  constructor(db: Db) {
    this.db = db;
  }

  addStatement(event: NewEvent, now: string): D1PreparedStatement {
    return this.db
      .prepare('INSERT INTO activity (type, level, message, post_id, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(event.type, event.level ?? 'info', event.message, event.postId ?? null, now);
  }

  async add(event: NewEvent, now: string): Promise<void> {
    await this.addStatement(event, now).run();
  }

  async list(limit: number, beforeId?: number): Promise<ActivityEvent[]> {
    const statement = beforeId
      ? this.db.prepare('SELECT * FROM activity WHERE id < ? ORDER BY id DESC LIMIT ?').bind(beforeId, limit)
      : this.db.prepare('SELECT * FROM activity ORDER BY id DESC LIMIT ?').bind(limit);
    const { results } = await statement.all<Row>();
    return results.map((r) => ({
      id: r.id as number,
      type: r.type as string,
      level: r.level as ActivityEvent['level'],
      message: r.message as string,
      postId: r.post_id as string | null,
      createdAt: r.created_at as string,
    }));
  }
}
