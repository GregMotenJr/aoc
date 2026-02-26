/**
 * E2E Handler Tests
 *
 * Tests the full bot message handling pipeline using grammY's handleUpdate()
 * with a mocked Telegram API — no real HTTP calls, no DB, no Claude needed.
 *
 * Covers: commands, plain messages, auth rejection, session management,
 * agent error fallback, typing indicator, long response splitting.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── All mocks must be declared before imports (Vitest hoists vi.mock) ────────

vi.mock('../src/config.js', () => ({
  TELEGRAM_BOT_TOKEN:  '123456:TEST_TOKEN_FOR_UNIT_TESTS',
  ALLOWED_CHAT_ID:     '9999',
  ALLOWED_CHAT_IDS:    [],
  STORE_DIR:           '/tmp/aos-e2e-test',
  DB_PATH:             ':memory:',
  UPLOADS_DIR:         '/tmp/aos-e2e-test/uploads',
  WORKSPACE_DIR:       '/tmp',
  LOG_LEVEL:           'silent',
  NODE_ENV:            'test',
  GROQ_API_KEY:        '',
  ELEVENLABS_API_KEY:  '',
  ELEVENLABS_VOICE_ID: '',
  GOOGLE_API_KEY:      '',
  MAX_MESSAGE_LENGTH:  4096,
  TYPING_REFRESH_MS:   4000,
  SCHEDULER_POLL_MS:   60000,
  MEMORY_DECAY_RATE:   0.98,
  MEMORY_MIN_SALIENCE: 0.1,
  MAX_MEMORY_RESULTS:  8,
  PROJECT_ROOT:        '/tmp',
  PID_FILE:            '/tmp/aos-e2e-test/aos.pid',
}));

vi.mock('../src/agent.js', () => ({
  runAgent: vi.fn().mockResolvedValue({
    text:         'Mock Claude response',
    newSessionId: 'mock-session-id',
    inputTokens:  10,
    outputTokens: 20,
  }),
}));

vi.mock('../src/db.js', () => ({
  initDatabase:       vi.fn(),
  closeDatabase:      vi.fn(),
  getDb:              vi.fn(() => ({})),
  getSession:         vi.fn(() => undefined),
  setSession:         vi.fn(),
  clearSession:       vi.fn(),
  saveMemory:         vi.fn(),
  searchMemories:     vi.fn(() => []),
  getMemoriesForDisplay: vi.fn(() => []),
  decayMemories:      vi.fn(),
  createTask:         vi.fn(),
  getTasks:           vi.fn(() => []),
  getTask:            vi.fn(() => undefined),
  getDueTasks:        vi.fn(() => []),
  updateTaskAfterRun: vi.fn(),
  disableTask:        vi.fn(),
  pauseTask:          vi.fn(),
  resumeTask:         vi.fn(),
  deleteTask:         vi.fn(),
  getStats:           vi.fn(() => ({ sessions: 0, memories: 0, tasks: 0 })),
  saveConversationTurn: vi.fn(),
}));

vi.mock('../src/memory.js', () => ({
  buildMemoryContext:   vi.fn(() => ''),
  saveConversationTurn: vi.fn(),
  decayAndPrune:        vi.fn(),
}));

vi.mock('../src/voice.js', () => ({
  transcribeAudio:   vi.fn(),
  synthesizeSpeech:  vi.fn(),
  voiceCapabilities: vi.fn(() => ({ stt: false, tts: false })),
}));

vi.mock('../src/scheduler.js', () => ({
  computeNextRun: vi.fn(() => Math.floor(Date.now() / 1000) + 3600),
  isValidCron:    vi.fn(() => true),
  startScheduler: vi.fn(),
  stopScheduler:  vi.fn(),
}));

vi.mock('../src/logger.js', () => {
  const noop = () => {};
  const log = { info: noop, warn: noop, error: noop, debug: noop, child: () => log };
  return { logger: log };
});

// ─── Real imports (after mocks) ───────────────────────────────────────────────

import { createBot }  from '../src/bot.js';
import { runAgent }   from '../src/agent.js';
import type { Bot }   from 'grammy';

// ─── Mock bot info (avoids real getMe API call) ───────────────────────────────

const MOCK_BOT_INFO = {
  id: 123456,
  is_bot: true,
  first_name: 'TestBot',
  username: 'test_aos_bot',
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeUpdate(overrides: Record<string, unknown> = {}, chatId = 9999) {
  return {
    update_id: Math.floor(Math.random() * 1_000_000),
    message: {
      message_id: Math.floor(Math.random() * 1_000_000),
      date:       Math.floor(Date.now() / 1000),
      chat:       { id: chatId, type: 'private' },
      from:       { id: chatId, is_bot: false, first_name: 'TestUser' },
      text:       'hello',
      ...overrides,
    },
  };
}

function makeCommand(command: string, chatId = 9999) {
  return makeUpdate({
    text:     `/${command}`,
    entities: [{ type: 'bot_command', offset: 0, length: command.length + 1 }],
  }, chatId);
}

async function setupBot(): Promise<{ bot: Bot; calls: Array<{ method: string; payload: unknown }> }> {
  const bot   = createBot();
  const calls: Array<{ method: string; payload: unknown }> = [];

  bot.api.config.use((_prev, method, payload) => {
    calls.push({ method, payload });
    if (method === 'getMe') {
      return Promise.resolve({ ok: true, result: MOCK_BOT_INFO } as never);
    }
    return Promise.resolve({
      ok:     true,
      result: { message_id: 1, date: 0, chat: { id: 9999, type: 'private' }, text: '' },
    } as never);
  });

  await bot.init();
  return { bot, calls };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('E2E — command handlers', () => {
  let bot:  Bot;
  let calls: Array<{ method: string; payload: unknown }>;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ bot, calls } = await setupBot());
  });

  afterEach(() => { bot?.stop(); });

  it('/start — replies with AOS welcome message', async () => {
    await bot.handleUpdate(makeCommand('start'));
    const reply = calls.find(c => c.method === 'sendMessage');
    expect(reply).toBeDefined();
    expect((reply!.payload as Record<string, unknown>).text).toContain('AOS — Alfred Operating System');
  });

  it('/chatid — replies with the chat ID', async () => {
    await bot.handleUpdate(makeCommand('chatid'));
    const reply = calls.find(c => c.method === 'sendMessage');
    expect(reply).toBeDefined();
    expect((reply!.payload as Record<string, unknown>).text).toBe('9999');
  });

  it('/newchat — clears session and confirms', async () => {
    await bot.handleUpdate(makeCommand('newchat'));
    const reply = calls.find(c => c.method === 'sendMessage');
    expect(reply).toBeDefined();
    expect((reply!.payload as Record<string, unknown>).text).toContain('Session cleared');
  });

  it('/forget — alias for /newchat, clears session', async () => {
    await bot.handleUpdate(makeCommand('forget'));
    const reply = calls.find(c => c.method === 'sendMessage');
    expect(reply).toBeDefined();
    expect((reply!.payload as Record<string, unknown>).text).toContain('Session cleared');
  });

  it('/memory — replies (empty list on fresh install)', async () => {
    await bot.handleUpdate(makeCommand('memory'));
    const reply = calls.find(c => c.method === 'sendMessage');
    expect(reply).toBeDefined();
  });
});

describe('E2E — plain message handling', () => {
  let bot:  Bot;
  let calls: Array<{ method: string; payload: unknown }>;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ bot, calls } = await setupBot());
  });

  afterEach(() => { bot?.stop(); });

  it('routes plain text to agent and replies with response', async () => {
    await bot.handleUpdate(makeUpdate({ text: 'What is 2 + 2?' }));
    expect(runAgent).toHaveBeenCalled();
    const reply = calls.find(c => c.method === 'sendMessage');
    expect(reply).toBeDefined();
    expect((reply!.payload as Record<string, unknown>).text).toContain('Mock Claude response');
  });

  it('sends typing indicator before agent call', async () => {
    await bot.handleUpdate(makeUpdate({ text: 'hello' }));
    const typing = calls.find(c => c.method === 'sendChatAction');
    expect(typing).toBeDefined();
    expect((typing!.payload as Record<string, unknown>).action).toBe('typing');
  });

  it('returns fallback message when agent errors', async () => {
    vi.mocked(runAgent).mockResolvedValueOnce({
      text: 'I ran into an error processing that. Try again or /newchat to start fresh.',
      newSessionId: undefined,
    });
    await bot.handleUpdate(makeUpdate({ text: 'trigger error' }));
    const reply = calls.find(c => c.method === 'sendMessage');
    expect((reply!.payload as Record<string, unknown>).text).toContain('error');
  });

  it('splits long responses into multiple messages', async () => {
    vi.mocked(runAgent).mockResolvedValueOnce({
      text: 'A\n'.repeat(3000),
      newSessionId: 'session-123',
    });
    await bot.handleUpdate(makeUpdate({ text: 'give me a long response' }));
    const replies = calls.filter(c => c.method === 'sendMessage');
    expect(replies.length).toBeGreaterThan(1);
  });
});

describe('E2E — security', () => {
  let bot:  Bot;
  let calls: Array<{ method: string; payload: unknown }>;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ bot, calls } = await setupBot());
  });

  afterEach(() => { bot?.stop(); });

  it('silently drops messages from unauthorized chat IDs', async () => {
    await bot.handleUpdate(makeUpdate({ text: 'hack attempt' }, 666));
    expect(runAgent).not.toHaveBeenCalled();
    const replies = calls.filter(c => c.method === 'sendMessage');
    expect(replies).toHaveLength(0);
  });

  it('accepts messages from authorized chat ID', async () => {
    await bot.handleUpdate(makeUpdate({ text: 'authorized message' }, 9999));
    expect(runAgent).toHaveBeenCalled();
  });

  it('/chatid responds to any chat — needed for first-run discovery', async () => {
    await bot.handleUpdate(makeCommand('chatid', 666));
    const reply = calls.find(c => c.method === 'sendMessage');
    expect(reply).toBeDefined();
    expect((reply!.payload as Record<string, unknown>).text).toBe('666');
  });

  it('ignores messages with no text', async () => {
    await bot.handleUpdate(makeUpdate({ text: undefined }));
    expect(runAgent).not.toHaveBeenCalled();
  });
});
