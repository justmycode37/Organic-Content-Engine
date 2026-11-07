import type { Db } from '../db/database.ts';
import type { ActivityEvent } from '../domain/types.ts';

type Row = Record<string, unknown>;

export class ActivityRepository {
  private readonly db: Db;
  constructor(db: Db) {
    this.db = db;
  }

  add(event: { type: string; level?: ActivityEvent['level']; message: string; postId?: string | null }, now: string): void {
    this.db
      .prepare('INSERT INTO activity (type, level, message, post_id, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(event.type, event.level ?? 'info', event.message, event.postId ?? null, now);
  }

  list(limit: number, beforeId?: number): ActivityEvent[] {
    const rows = beforeId
      ? this.db.prepare('SELECT * FROM activity WHERE id < ? ORDER BY id DESC LIMIT ?').all(beforeId, limit)
      : this.db.prepare('SELECT * FROM activity ORDER BY id DESC LIMIT ?').all(limit);
    return (rows as Row[]).map((r) => ({
      id: r.id as number,
      type: r.type as string,
      level: r.level as ActivityEvent['level'],
      message: r.message as string,
      postId: r.post_id as string | null,
      createdAt: r.created_at as string,
    }));
  }
}
