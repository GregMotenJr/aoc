import {
  searchMemories,
  getRecentMemories,
  touchMemory,
  saveMemory,
  decayMemories,
} from './db.js';
import { MEMORY_DECAY_RATE, MEMORY_MIN_SALIENCE } from './config.js';
import { logger } from './logger.js';

const log = logger.child({ component: 'memory' });

const SEMANTIC_SIGNALS =
  /\b(my|i am|i'm|i prefer|remember|always|never)\b/i;

/**
 * Build memory context string from FTS5 search and recent memories.
 * Returns formatted context or empty string if no matches.
 */
export function buildMemoryContext(
  chatId: string,
  userMessage: string,
): string {
  const ftsResults = searchMemories(chatId, userMessage, 3);
  const recentResults = getRecentMemories(chatId, 5);

  // Deduplicate by id
  const seen = new Set<number>();
  const combined: Array<{
    id: number;
    content: string;
    sector: string;
    salience: number;
  }> = [];

  for (const r of ftsResults) {
    if (!seen.has(r.id)) {
      seen.add(r.id);
      combined.push(r);
    }
  }
  for (const r of recentResults) {
    if (!seen.has(r.id)) {
      seen.add(r.id);
      combined.push(r);
    }
  }

  if (combined.length === 0) return '';

  // Touch each retrieved memory
  for (const m of combined) {
    touchMemory(m.id);
  }

  const lines = combined.map((m) => `- ${m.content} (${m.sector})`);
  return `[Memory context]\n${lines.join('\n')}`;
}

/**
 * Save a conversation turn as a memory with sector classification.
 * Skips short messages and slash commands.
 */
export function saveConversationTurn(
  chatId: string,
  userMsg: string,
  assistantMsg: string,
): void {
  // Skip short messages and slash commands
  if (userMsg.length <= 20 || userMsg.startsWith('/')) return;

  const sector: 'semantic' | 'episodic' = SEMANTIC_SIGNALS.test(userMsg)
    ? 'semantic'
    : 'episodic';

  saveMemory(chatId, userMsg, sector);

  if (assistantMsg && assistantMsg.length > 20) {
    saveMemory(chatId, assistantMsg, 'episodic');
  }
}

/**
 * Run decay sweep: reduce salience by decay rate, delete memories below minimum.
 */
export function runDecaySweep(): { decayed: number; deleted: number } {
  const result = decayMemories(MEMORY_DECAY_RATE, MEMORY_MIN_SALIENCE);
  log.info(result, 'Memory decay sweep complete');
  return result;
}
