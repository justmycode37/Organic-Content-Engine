import { chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type Db = DatabaseSync;

const MIGRATIONS: string[] = [
  `
  CREATE TABLE settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE brand (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE job_state (
    name TEXT PRIMARY KEY,
    last_run_at TEXT,
    last_result TEXT
  );

  CREATE TABLE pillars (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    audience TEXT NOT NULL,
    tone TEXT NOT NULL,
    keywords TEXT NOT NULL,
    platforms TEXT NOT NULL,
    active INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE ideas (
    id TEXT PRIMARY KEY,
    pillar_id TEXT NOT NULL REFERENCES pillars(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    title_key TEXT NOT NULL,
    angle TEXT NOT NULL,
    source TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (pillar_id, title_key)
  );
  CREATE INDEX ideas_by_pillar_status ON ideas (pillar_id, status, created_at);

  CREATE TABLE posts (
    id TEXT PRIMARY KEY,
    idea_id TEXT REFERENCES ideas(id) ON DELETE SET NULL,
    pillar_id TEXT REFERENCES pillars(id) ON DELETE SET NULL,
    platform TEXT NOT NULL,
    body TEXT NOT NULL,
    media_urls TEXT NOT NULL,
    status TEXT NOT NULL,
    origin TEXT NOT NULL,
    generator TEXT,
    scheduled_at TEXT,
    published_at TEXT,
    external_id TEXT,
    external_url TEXT,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TEXT,
    lease_at TEXT,
    last_error_code TEXT,
    last_error_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX posts_due ON posts (status, scheduled_at);
  CREATE INDEX posts_by_platform ON posts (platform, scheduled_at);

  CREATE TABLE publish_attempts (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    attempt_number INTEGER NOT NULL,
    mode TEXT NOT NULL,
    route TEXT,
    outcome TEXT NOT NULL,
    code TEXT,
    message TEXT,
    external_id TEXT,
    started_at TEXT NOT NULL,
    finished_at TEXT NOT NULL
  );
  CREATE INDEX attempts_by_post ON publish_attempts (post_id, started_at);

  CREATE TABLE activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    level TEXT NOT NULL,
    message TEXT NOT NULL,
    post_id TEXT,
    created_at TEXT NOT NULL
  );
  `,
  `CREATE TABLE materials (id TEXT PRIMARY KEY, name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, notes TEXT NOT NULL, enabled INTEGER NOT NULL, created_at TEXT NOT NULL, data BLOB NOT NULL);`,
  `CREATE TABLE post_feedback (post_id TEXT PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE, format TEXT NOT NULL, verdict TEXT CHECK (verdict IN ('successful','iterate','discard') OR verdict IS NULL), notes TEXT NOT NULL, impressions INTEGER, engagements INTEGER, conversions INTEGER, updated_at TEXT NOT NULL); CREATE INDEX feedback_by_format ON post_feedback(format);`,
];

export function openDatabase(path: string): Db {
  const inMemory = path === ':memory:';
  if (!inMemory) mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  if (!inMemory) chmodSync(path, 0o600);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  migrate(db);
  return db;
}

function migrate(db: Db): void {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
  for (let version = row.user_version; version < MIGRATIONS.length; version += 1) {
    transaction(db, () => {
      db.exec(MIGRATIONS[version] as string);
      db.exec(`PRAGMA user_version = ${version + 1}`);
    });
  }
}

export function transaction<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
