import Database from 'better-sqlite3';
import { DB_PATH, STORE_DIR } from './config.js';
import { logger } from './logger.js';
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';

const log = logger.child({ component: 'db' });

let db: Database.Database;

export function getDb(): Database.Database {
  return db;
}

export function initDatabase(dbPath?: string): Database.Database {
  const path = dbPath ?? DB_PATH;

  // Ensure store directory exists
  if (!dbPath) {
    mkdirSync(STORE_DIR, { recursive: true });
  }

  // Backup existing DB on startup
  if (!dbPath && existsSync(path)) {
    try {
      copyFileSync(path, path + '.bak');
      log.info('Database backed up to %s.bak', path);
    } catch (err) {
      log.warn({ err }, 'Failed to backup database');
    }
  }

  db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // --- sessions ---
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      chat_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // --- memories ---
  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      topic_key TEXT,
      content TEXT NOT NULL,
      sector TEXT NOT NULL CHECK(sector IN ('semantic', 'episodic')),
      salience REAL NOT NULL DEFAULT 1.0,
      created_at INTEGER NOT NULL,
      accessed_at INTEGER NOT NULL
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_memories_chat ON memories(chat_id)`);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_memories_sector ON memories(chat_id, sector)`,
  );
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_memories_salience ON memories(salience)`,
  );
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_memories_accessed ON memories(chat_id, accessed_at)`,
  );

  // --- FTS5 virtual table ---
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      content,
      content='memories',
      content_rowid='id'
    )
  `);

  // FTS5 sync triggers
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
      INSERT INTO memories_fts(rowid, content) VALUES (new.id, new.content);
    END
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, content) VALUES ('delete', old.id, old.content);
    END
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE OF content ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, content) VALUES ('delete', old.id, old.content);
      INSERT INTO memories_fts(rowid, content) VALUES (new.id, new.content);
    END
  `);

  // --- scheduled_tasks ---
  db.exec(`
    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      prompt TEXT NOT NULL,
      schedule TEXT NOT NULL,
      next_run INTEGER NOT NULL,
      last_run INTEGER,
      last_result TEXT,
      fail_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'paused', 'disabled')),
      created_at INTEGER NOT NULL
    )
  `);

  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_tasks_due ON scheduled_tasks(status, next_run)`,
  );
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_tasks_chat ON scheduled_tasks(chat_id)`,
  );

  log.info('Database initialized at %s', path);
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    log.info('Database closed');
  }
}

// --- Session CRUD ---

export function getSession(chatId: string): string | null {
  const row = db
    .prepare('SELECT session_id FROM sessions WHERE chat_id = ?')
    .get(chatId) as { session_id: string } | undefined;
  return row?.session_id ?? null;
}

export function setSession(chatId: string, sessionId: string): void {
  db.prepare(
    `INSERT INTO sessions (chat_id, session_id, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(chat_id) DO UPDATE SET session_id = excluded.session_id, updated_at = excluded.updated_at`,
  ).run(chatId, sessionId, Math.floor(Date.now() / 1000));
}

export function clearSession(chatId: string): void {
  db.prepare('DELETE FROM sessions WHERE chat_id = ?').run(chatId);
}

// --- Memory CRUD ---

export function saveMemory(
  chatId: string,
  content: string,
  sector: 'semantic' | 'episodic',
  topicKey?: string,
): number {
  const now = Math.floor(Date.now() / 1000);
  const info = db
    .prepare(
      `INSERT INTO memories (chat_id, topic_key, content, sector, salience, created_at, accessed_at)
     VALUES (?, ?, ?, ?, 1.0, ?, ?)`,
    )
    .run(chatId, topicKey ?? null, content, sector, now, now);
  return Number(info.lastInsertRowid);
}

export function searchMemories(
  chatId: string,
  query: string,
  limit = 3,
): Array<{
  id: number;
  content: string;
  sector: string;
  salience: number;
}> {
  // Sanitize query for FTS5: strip non-alphanumeric except spaces
  const sanitized = query.replace(/[^a-zA-Z0-9\s]/g, '').trim();
  if (!sanitized) return [];

  // Add prefix matching
  const ftsQuery = sanitized
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w + '*')
    .join(' ');
  if (!ftsQuery) return [];

  try {
    return db
      .prepare(
        `SELECT m.id, m.content, m.sector, m.salience
       FROM memories m
       JOIN memories_fts f ON m.id = f.rowid
       WHERE memories_fts MATCH ? AND m.chat_id = ?
       ORDER BY rank
       LIMIT ?`,
      )
      .all(ftsQuery, chatId, limit) as Array<{
      id: number;
      content: string;
      sector: string;
      salience: number;
    }>;
  } catch {
    return [];
  }
}

export function getRecentMemories(
  chatId: string,
  limit = 5,
): Array<{
  id: number;
  content: string;
  sector: string;
  salience: number;
}> {
  return db
    .prepare(
      `SELECT id, content, sector, salience
     FROM memories
     WHERE chat_id = ?
     ORDER BY accessed_at DESC
     LIMIT ?`,
    )
    .all(chatId, limit) as Array<{
    id: number;
    content: string;
    sector: string;
    salience: number;
  }>;
}

export function touchMemory(id: number): void {
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    `UPDATE memories SET accessed_at = ?, salience = MIN(salience + 0.1, 5.0) WHERE id = ?`,
  ).run(now, id);
}

export function decayMemories(
  decayRate = 0.98,
  minSalience = 0.1,
): { decayed: number; deleted: number } {
  const oneDayAgo = Math.floor(Date.now() / 1000) - 86400;

  const decayResult = db
    .prepare(
      `UPDATE memories SET salience = salience * ? WHERE created_at < ?`,
    )
    .run(decayRate, oneDayAgo);

  const deleteResult = db
    .prepare(`DELETE FROM memories WHERE salience < ?`)
    .run(minSalience);

  return {
    decayed: decayResult.changes,
    deleted: deleteResult.changes,
  };
}

export function getMemoriesForDisplay(
  chatId: string,
  limit = 10,
): Array<{
  id: number;
  content: string;
  sector: string;
  salience: number;
  created_at: number;
}> {
  return db
    .prepare(
      `SELECT id, content, sector, salience, created_at
     FROM memories
     WHERE chat_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    )
    .all(chatId, limit) as Array<{
    id: number;
    content: string;
    sector: string;
    salience: number;
    created_at: number;
  }>;
}

export function deleteAllMemories(chatId: string): void {
  db.prepare('DELETE FROM memories WHERE chat_id = ?').run(chatId);
}

// --- Scheduled Tasks CRUD ---

export function createTask(
  id: string,
  chatId: string,
  prompt: string,
  schedule: string,
  nextRun: number,
): void {
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    `INSERT INTO scheduled_tasks (id, chat_id, prompt, schedule, next_run, status, fail_count, created_at)
     VALUES (?, ?, ?, ?, ?, 'active', 0, ?)`,
  ).run(id, chatId, prompt, schedule, nextRun, now);
}

export function getDueTasks(): Array<{
  id: string;
  chat_id: string;
  prompt: string;
  schedule: string;
  fail_count: number;
}> {
  const now = Math.floor(Date.now() / 1000);
  return db
    .prepare(
      `SELECT id, chat_id, prompt, schedule, fail_count
     FROM scheduled_tasks
     WHERE status = 'active' AND next_run <= ?`,
    )
    .all(now) as Array<{
    id: string;
    chat_id: string;
    prompt: string;
    schedule: string;
    fail_count: number;
  }>;
}

export function updateTaskAfterRun(
  id: string,
  lastResult: string,
  nextRun: number,
  failed = false,
): void {
  const now = Math.floor(Date.now() / 1000);
  if (failed) {
    db.prepare(
      `UPDATE scheduled_tasks
       SET last_run = ?, last_result = ?, next_run = ?, fail_count = fail_count + 1
       WHERE id = ?`,
    ).run(now, lastResult, nextRun, id);
  } else {
    db.prepare(
      `UPDATE scheduled_tasks
       SET last_run = ?, last_result = ?, next_run = ?, fail_count = 0
       WHERE id = ?`,
    ).run(now, lastResult, nextRun, id);
  }
}

export function disableTask(id: string): void {
  db.prepare(
    `UPDATE scheduled_tasks SET status = 'disabled' WHERE id = ?`,
  ).run(id);
}

export function pauseTask(id: string): void {
  db.prepare(
    `UPDATE scheduled_tasks SET status = 'paused' WHERE id = ?`,
  ).run(id);
}

export function resumeTask(id: string, nextRun: number): void {
  db.prepare(
    `UPDATE scheduled_tasks SET status = 'active', next_run = ? WHERE id = ?`,
  ).run(nextRun, id);
}

export function deleteTask(id: string): void {
  db.prepare('DELETE FROM scheduled_tasks WHERE id = ?').run(id);
}

export function listTasks(chatId?: string): Array<{
  id: string;
  chat_id: string;
  prompt: string;
  schedule: string;
  next_run: number;
  last_run: number | null;
  last_result: string | null;
  fail_count: number;
  status: string;
  created_at: number;
}> {
  if (chatId) {
    return db
      .prepare('SELECT * FROM scheduled_tasks WHERE chat_id = ?')
      .all(chatId) as Array<{
      id: string;
      chat_id: string;
      prompt: string;
      schedule: string;
      next_run: number;
      last_run: number | null;
      last_result: string | null;
      fail_count: number;
      status: string;
      created_at: number;
    }>;
  }
  return db.prepare('SELECT * FROM scheduled_tasks').all() as Array<{
    id: string;
    chat_id: string;
    prompt: string;
    schedule: string;
    next_run: number;
    last_run: number | null;
    last_result: string | null;
    fail_count: number;
    status: string;
    created_at: number;
  }>;
}

export function getTask(id: string): {
  id: string;
  chat_id: string;
  prompt: string;
  schedule: string;
  next_run: number;
  last_run: number | null;
  fail_count: number;
  status: string;
} | undefined {
  return db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get(id) as
    | {
        id: string;
        chat_id: string;
        prompt: string;
        schedule: string;
        next_run: number;
        last_run: number | null;
        fail_count: number;
        status: string;
      }
    | undefined;
}

// --- Stats ---

export function getStats(): {
  sessions: number;
  memories: number;
  tasks: number;
} {
  const sessions = (
    db.prepare('SELECT COUNT(*) as c FROM sessions').get() as { c: number }
  ).c;
  const memories = (
    db.prepare('SELECT COUNT(*) as c FROM memories').get() as { c: number }
  ).c;
  const tasks = (
    db.prepare('SELECT COUNT(*) as c FROM scheduled_tasks').get() as {
      c: number;
    }
  ).c;
  return { sessions, memories, tasks };
}
