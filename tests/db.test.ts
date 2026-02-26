import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  initDatabase,
  closeDatabase,
  getSession,
  setSession,
  clearSession,
  saveMemory,
  searchMemories,
  getRecentMemories,
  touchMemory,
  decayMemories,
  getMemoriesForDisplay,
  createTask,
  getDueTasks,
  updateTaskAfterRun,
  pauseTask,
  resumeTask,
  deleteTask,
  listTasks,
  getStats,
} from '../src/db.js';

describe('db.ts — SQLite layer', () => {
  beforeEach(() => {
    // Use in-memory database for tests
    initDatabase(':memory:');
  });

  afterEach(() => {
    closeDatabase();
  });

  // --- Session CRUD ---

  describe('sessions', () => {
    it('returns null for non-existent session', () => {
      expect(getSession('999')).toBeNull();
    });

    it('sets and gets a session', () => {
      setSession('123', 'session-abc');
      expect(getSession('123')).toBe('session-abc');
    });

    it('upserts a session', () => {
      setSession('123', 'session-abc');
      setSession('123', 'session-def');
      expect(getSession('123')).toBe('session-def');
    });

    it('clears a session', () => {
      setSession('123', 'session-abc');
      clearSession('123');
      expect(getSession('123')).toBeNull();
    });

    it('isolates sessions by chat_id', () => {
      setSession('123', 'session-a');
      setSession('456', 'session-b');
      expect(getSession('123')).toBe('session-a');
      expect(getSession('456')).toBe('session-b');
    });
  });

  // --- Memory CRUD ---

  describe('memories', () => {
    it('saves and retrieves memories', () => {
      saveMemory('123', 'I like pizza', 'semantic');
      const recent = getRecentMemories('123', 10);
      expect(recent).toHaveLength(1);
      expect(recent[0].content).toBe('I like pizza');
      expect(recent[0].sector).toBe('semantic');
    });

    it('isolates memories by chat_id', () => {
      saveMemory('123', 'User A memory', 'semantic');
      saveMemory('456', 'User B memory', 'semantic');
      const a = getRecentMemories('123', 10);
      const b = getRecentMemories('456', 10);
      expect(a).toHaveLength(1);
      expect(b).toHaveLength(1);
      expect(a[0].content).toBe('User A memory');
      expect(b[0].content).toBe('User B memory');
    });

    it('searches memories via FTS5', () => {
      saveMemory('123', 'I love Italian food especially pizza', 'semantic');
      saveMemory('123', 'Meeting with John about the project', 'episodic');
      saveMemory('123', 'Prefer dark mode in all apps', 'semantic');

      const results = searchMemories('123', 'pizza food');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].content).toContain('pizza');
    });

    it('returns empty for empty search query', () => {
      saveMemory('123', 'Some memory', 'semantic');
      const results = searchMemories('123', '');
      expect(results).toHaveLength(0);
    });

    it('handles special characters in search gracefully', () => {
      saveMemory('123', 'Test memory', 'semantic');
      const results = searchMemories('123', '!!@@##$$');
      expect(results).toHaveLength(0);
    });

    it('touches memory — updates salience and accessed_at', () => {
      const id = saveMemory('123', 'A memory', 'semantic');
      const before = getRecentMemories('123', 1);
      expect(before[0].salience).toBe(1.0);

      touchMemory(id);
      const after = getRecentMemories('123', 1);
      expect(after[0].salience).toBeCloseTo(1.1);
    });

    it('caps salience at 5.0', () => {
      const id = saveMemory('123', 'A memory', 'semantic');
      // Touch it many times
      for (let i = 0; i < 100; i++) touchMemory(id);
      const memories = getRecentMemories('123', 1);
      expect(memories[0].salience).toBe(5.0);
    });

    it('decays old memories and deletes low-salience ones', () => {
      // Insert a memory with artificially low salience
      const id = saveMemory('123', 'Fading memory', 'episodic');
      // Manually set low salience
      const db = (await import('../src/db.js')).getDb();
      db.prepare('UPDATE memories SET salience = 0.05, created_at = created_at - 200000 WHERE id = ?').run(id);

      const result = decayMemories(0.98, 0.1);
      expect(result.deleted).toBeGreaterThanOrEqual(1);
    });

    it('getMemoriesForDisplay returns formatted data', () => {
      saveMemory('123', 'Memory 1', 'semantic');
      saveMemory('123', 'Memory 2', 'episodic');
      const display = getMemoriesForDisplay('123', 10);
      expect(display).toHaveLength(2);
      expect(display[0]).toHaveProperty('content');
      expect(display[0]).toHaveProperty('sector');
      expect(display[0]).toHaveProperty('salience');
      expect(display[0]).toHaveProperty('created_at');
    });
  });

  // --- FTS5 sync ---

  describe('FTS5 triggers', () => {
    it('insert trigger syncs to FTS', () => {
      saveMemory('123', 'Unique test phrase alpha', 'semantic');
      const results = searchMemories('123', 'alpha');
      expect(results.length).toBeGreaterThan(0);
    });

    it('delete trigger removes from FTS', () => {
      const id = saveMemory('123', 'To be deleted omega', 'semantic');
      // Verify it's searchable
      let results = searchMemories('123', 'omega');
      expect(results.length).toBeGreaterThan(0);

      // Delete via decay (set salience to 0)
      const db = (await import('../src/db.js')).getDb();
      db.prepare('DELETE FROM memories WHERE id = ?').run(id);

      results = searchMemories('123', 'omega');
      expect(results).toHaveLength(0);
    });
  });

  // --- Scheduled Tasks CRUD ---

  describe('scheduled_tasks', () => {
    const now = Math.floor(Date.now() / 1000);

    it('creates and lists tasks', () => {
      createTask('t1', '123', 'Test prompt', '0 9 * * *', now + 3600);
      const tasks = listTasks('123');
      expect(tasks).toHaveLength(1);
      expect(tasks[0].prompt).toBe('Test prompt');
      expect(tasks[0].status).toBe('active');
    });

    it('gets due tasks', () => {
      createTask('t1', '123', 'Due task', '0 9 * * *', now - 60);
      createTask('t2', '123', 'Future task', '0 9 * * *', now + 3600);

      const due = getDueTasks();
      expect(due).toHaveLength(1);
      expect(due[0].id).toBe('t1');
    });

    it('pauses and resumes tasks', () => {
      createTask('t1', '123', 'Task', '0 9 * * *', now - 60);

      pauseTask('t1');
      let due = getDueTasks();
      expect(due).toHaveLength(0); // paused tasks not returned

      resumeTask('t1', now - 30);
      due = getDueTasks();
      expect(due).toHaveLength(1);
    });

    it('deletes tasks', () => {
      createTask('t1', '123', 'Task', '0 9 * * *', now);
      deleteTask('t1');
      const tasks = listTasks('123');
      expect(tasks).toHaveLength(0);
    });

    it('updates task after run', () => {
      createTask('t1', '123', 'Task', '0 9 * * *', now - 60);
      updateTaskAfterRun('t1', 'Success result', now + 3600);

      const tasks = listTasks('123');
      expect(tasks[0].last_result).toBe('Success result');
      expect(tasks[0].next_run).toBe(now + 3600);
    });

    it('increments fail_count on failure', () => {
      createTask('t1', '123', 'Task', '0 9 * * *', now - 60);
      updateTaskAfterRun('t1', 'Error', now + 3600, true);
      updateTaskAfterRun('t1', 'Error', now + 7200, true);

      const tasks = listTasks('123');
      expect(tasks[0].fail_count).toBe(2);
    });

    it('resets fail_count on success', () => {
      createTask('t1', '123', 'Task', '0 9 * * *', now - 60);
      updateTaskAfterRun('t1', 'Error', now + 3600, true);
      updateTaskAfterRun('t1', 'Success', now + 7200, false);

      const tasks = listTasks('123');
      expect(tasks[0].fail_count).toBe(0);
    });
  });

  // --- Stats ---

  describe('getStats', () => {
    it('returns correct counts', () => {
      setSession('123', 'sess1');
      saveMemory('123', 'mem1', 'semantic');
      saveMemory('123', 'mem2', 'episodic');
      createTask('t1', '123', 'Task', '0 9 * * *', 999999);

      const stats = getStats();
      expect(stats.sessions).toBe(1);
      expect(stats.memories).toBe(2);
      expect(stats.tasks).toBe(1);
    });
  });
});
