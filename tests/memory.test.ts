import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDatabase, closeDatabase, saveMemory } from '../src/db.js';
import {
  buildMemoryContext,
  saveConversationTurn,
  runDecaySweep,
} from '../src/memory.js';

describe('memory.ts — dual-sector memory', () => {
  beforeEach(() => {
    initDatabase(':memory:');
  });

  afterEach(() => {
    closeDatabase();
  });

  describe('buildMemoryContext', () => {
    it('returns empty string when no memories exist', () => {
      const ctx = buildMemoryContext('123', 'hello');
      expect(ctx).toBe('');
    });

    it('returns formatted context with matching memories', () => {
      saveMemory('123', 'I prefer dark mode in applications', 'semantic');
      saveMemory('123', 'Meeting about project roadmap yesterday', 'episodic');

      const ctx = buildMemoryContext('123', 'dark mode preference');
      expect(ctx).toContain('[Memory context]');
      expect(ctx).toContain('dark mode');
    });

    it('includes recent memories even without FTS match', () => {
      saveMemory('123', 'Totally unrelated memory alpha', 'episodic');

      const ctx = buildMemoryContext('123', 'something completely different');
      // Recent memories should still be included
      expect(ctx).toContain('alpha');
    });

    it('deduplicates results from FTS and recent', () => {
      saveMemory('123', 'Unique memory about testing beta', 'semantic');

      const ctx = buildMemoryContext('123', 'testing beta');
      // Count occurrences — should appear only once
      const matches = ctx.match(/beta/g);
      expect(matches).toHaveLength(1);
    });
  });

  describe('saveConversationTurn', () => {
    it('skips messages shorter than 20 chars', () => {
      saveConversationTurn('123', 'short', 'also short');
      const ctx = buildMemoryContext('123', 'short');
      expect(ctx).toBe('');
    });

    it('skips slash commands', () => {
      saveConversationTurn(
        '123',
        '/newchat start a fresh conversation',
        'Session cleared',
      );
      const ctx = buildMemoryContext('123', 'newchat');
      expect(ctx).toBe('');
    });

    it('detects semantic signals and classifies correctly', () => {
      saveConversationTurn(
        '123',
        'I prefer TypeScript over JavaScript for all my projects',
        'Noted, TypeScript preference saved.',
      );

      const { getRecentMemories } = await import('../src/db.js');
      const memories = getRecentMemories('123', 10);
      const userMemory = memories.find((m) =>
        m.content.includes('TypeScript'),
      );
      expect(userMemory).toBeDefined();
      expect(userMemory!.sector).toBe('semantic');
    });

    it('classifies non-signal messages as episodic', () => {
      saveConversationTurn(
        '123',
        'Can you look up the weather for tomorrow in New York?',
        'The weather in New York tomorrow will be sunny.',
      );

      const { getRecentMemories } = await import('../src/db.js');
      const memories = getRecentMemories('123', 10);
      const userMemory = memories.find((m) => m.content.includes('weather'));
      expect(userMemory).toBeDefined();
      expect(userMemory!.sector).toBe('episodic');
    });
  });

  describe('runDecaySweep', () => {
    it('returns decay and delete counts', () => {
      const result = runDecaySweep();
      expect(result).toHaveProperty('decayed');
      expect(result).toHaveProperty('deleted');
    });

    it('decays old memories', () => {
      saveMemory('123', 'Old memory that should decay', 'episodic');
      // Set created_at to 2 days ago
      const { getDb } = await import('../src/db.js');
      const db = getDb();
      db.prepare(
        'UPDATE memories SET created_at = created_at - 200000',
      ).run();

      const result = runDecaySweep();
      expect(result.decayed).toBeGreaterThanOrEqual(1);
    });
  });
});
