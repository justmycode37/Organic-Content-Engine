import { randomUUID } from 'node:crypto';
import type { Db } from '../db/database.ts';
import { AppError, notFound } from '../errors.ts';

export const MAX_UPLOAD = 100 * 1024 * 1024;
export interface Material {
  id: string; name: string; mime: string; size: number; notes: string; enabled: boolean; createdAt: string;
}
export class Materials {
  private db: Db;
  constructor(db: Db) { this.db = db; }
  list(): Material[] {
    return (this.db.prepare('SELECT id, name, mime, size, notes, enabled, created_at AS createdAt FROM materials ORDER BY created_at DESC, id').all() as unknown as Material[])
      .map(m => ({ ...m, enabled: Boolean(m.enabled) }));
  }
  add(name: string, mime: string, bytes: Uint8Array): Material {
    if (!bytes.length || bytes.length > MAX_UPLOAD) throw new AppError(413, 'invalid_file_size', 'Files must be between 1 byte and 100 MB');
    const m = { id: randomUUID(), name: name.slice(0, 255), mime: mime || 'application/octet-stream', size: bytes.length, notes: '', enabled: true, createdAt: new Date().toISOString() };
    this.db.prepare('INSERT INTO materials (id,name,mime,size,notes,enabled,created_at,data) VALUES (?,?,?,?,?,?,?,?)')
      .run(m.id, m.name, m.mime, m.size, m.notes, 1, m.createdAt, bytes);
    return m;
  }
  get(id: string) {
    const row = this.db.prepare('SELECT data FROM materials WHERE id=?').get(id) as { data: Uint8Array } | undefined;
    const material = this.list().find(m => m.id === id);
    if (!row || !material) throw notFound('Material', id);
    return { ...material, data: row.data };
  }
  update(id: string, patch: { notes?: string; enabled?: boolean }) {
    const m = this.get(id);
    this.db.prepare('UPDATE materials SET notes=?, enabled=? WHERE id=?').run(patch.notes ?? m.notes, Number(patch.enabled ?? m.enabled), id);
    return this.list().find(m => m.id === id)!;
  }
  remove(id: string) {
    if (!this.db.prepare('DELETE FROM materials WHERE id=?').run(id).changes) throw notFound('Material', id);
  }
  context(): string {
    let remaining = 24000;
    return this.list().filter(m => m.enabled).slice(0, 30).map(m => {
      let text = '';
      if (/^(text\/|application\/json)/.test(m.mime) || /\.(txt|md|csv|json|srt|vtt)$/i.test(m.name)) {
        text = Buffer.from(this.get(m.id).data).toString('utf8').slice(0, 8000);
      }
      const context = JSON.stringify({ id: m.id, name: m.name, type: m.mime, notes: m.notes, text }).slice(0, remaining);
      remaining -= context.length;
      return context;
    }).join('\n');
  }
  images(): { type: 'input_image'; image_url: string }[] {
    return this.list().filter(m => m.enabled && ['image/jpeg','image/png','image/webp'].includes(m.mime) && m.size <= 5 * 1024 * 1024).slice(0, 4)
      .map(m => ({ type: 'input_image', image_url: `data:${m.mime};base64,${Buffer.from(this.get(m.id).data).toString('base64')}` }));
  }
}
