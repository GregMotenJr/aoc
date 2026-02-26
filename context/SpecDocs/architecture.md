# Architecture Document — AOS (AlfredOS)

**Version:** 1.0
**Author:** Architect Agent (BMAD Method)
**Date:** 2026-02-25
**Status:** Draft

---

## 1. System Architecture Overview

### 1.1 High-Level Architecture

AOS is a message-bridge architecture: Telegram messages flow in, get enriched with memory context, are processed by Claude Code via the Agent SDK, and responses flow back through formatting and optional TTS before delivery.

```
┌──────────────────────────────────────────────────────────┐
│                      AOS Runtime                          │
│                                                          │
│  ┌─────────────┐    ┌──────────────┐    ┌─────────────┐ │
│  │  Telegram    │───▶│  Message     │───▶│  Memory     │ │
│  │  Bot         │    │  Router      │    │  Context    │ │
│  │  (Grammy)    │    │              │    │  Builder    │ │
│  └─────────────┘    └──────────────┘    └──────┬──────┘ │
│        ▲                                        │        │
│        │                                        ▼        │
│  ┌─────┴─────────┐                     ┌──────────────┐ │
│  │  Response      │◀────────────────────│  Claude Code │ │
│  │  Pipeline      │                     │  Agent SDK   │ │
│  │  (format/TTS)  │                     │  (subprocess)│ │
│  └───────────────┘                     └──────────────┘ │
│        │                                        │        │
│        │         ┌──────────────┐               │        │
│        │         │   SQLite     │◀──────────────┘        │
│        │         │   (WAL)      │                        │
│        │         │              │                        │
│        │         │  - sessions  │    ┌──────────────┐    │
│        │         │  - memories  │    │  Scheduler   │    │
│        │         │  - tasks     │◀───│  (cron poll) │    │
│        │         └──────────────┘    └──────────────┘    │
│        │                                                  │
│        │         ┌──────────────┐                        │
│        └────────▶│  Media       │                        │
│                  │  Handler     │                        │
│                  │  (voice/img) │                        │
│                  └──────────────┘                        │
└──────────────────────────────────────────────────────────┘
         │                    ▲
         ▼                    │
┌──────────────┐    ┌──────────────┐
│  Telegram    │    │  Claude CLI  │
│  Bot API     │    │  (claude)    │
│  (outbound)  │    │              │
└──────────────┘    └──────────────┘
```

### 1.2 Design Principles

1. **Claude Code IS the brain** — AOS never reimplements AI capabilities. It is a bridge, not a wrapper.
2. **Thin layers** — Each component does one thing. No god objects, no multi-responsibility modules.
3. **SQLite everything** — All persistent state in one database. No external dependencies.
4. **Fail gracefully** — Every external call has a fallback. Degraded service beats crashed service.
5. **Security by default** — Allowlist auth, secret redaction, loopback binding, PID lock.
6. **No process.env pollution** — Secrets stay in local variables, never leak to subprocesses.

### 1.3 Key Architectural Decisions

| Decision | Rationale | Alternatives Considered |
|----------|-----------|------------------------|
| Agent SDK over API calls | Full tool access, session resumption, skill loading | Direct API (no tools), prompt caching (limited) |
| SQLite over Postgres | Zero-dependency, portable, WAL mode for concurrency | Postgres (too heavy), Redis (no persistence story) |
| Grammy over Telegraf | Better TypeScript support, active maintenance, smaller | Telegraf (stale), raw HTTP (too low-level) |
| Pino over Winston | Faster, structured JSON, lower memory footprint | Winston (slower), console.log (no structure) |
| FTS5 over vector DB | Built into SQLite, no external service, good enough for personal use | pgvector (external dep), Pinecone (cloud) |
| systemd over PM2 | Native Linux process management, no extra dependency | PM2 (extra dep), Docker (overkill) |
| .env over config file | Standard pattern, simple, well-understood | YAML config (unnecessary complexity) |

---

## 2. Component Breakdown

### 2.1 File Structure

```
aos/
├── src/
│   ├── index.ts          # Entry point, lifecycle, startup orchestration
│   ├── agent.ts          # Claude Code Agent SDK wrapper
│   ├── bot.ts            # Telegram bot (Grammy), message routing, formatting
│   ├── config.ts         # Environment variable loader, constants
│   ├── db.ts             # SQLite schema, all query functions
│   ├── env.ts            # Safe .env parser (no process.env pollution)
│   ├── logger.ts         # Pino structured logging setup
│   ├── media.ts          # File download, photo/doc message builders
│   ├── memory.ts         # Dual-sector memory with FTS5, decay, context injection
│   ├── scheduler.ts      # Cron task polling loop, execution
│   ├── schedule-cli.ts   # CLI tool for managing scheduled tasks
│   ├── security.ts       # Auth checking, secret redaction, PID lock
│   └── voice.ts          # STT (Groq Whisper), TTS (ElevenLabs)
├── scripts/
│   ├── setup.ts          # Interactive setup wizard
│   ├── status.ts         # System health check
│   └── notify.sh         # Shell script for sending Telegram messages
├── store/                # Runtime data (gitignored)
│   ├── aos.db            # SQLite database
│   └── aos.pid           # PID lock file
├── workspace/
│   └── uploads/          # Temporary media downloads (gitignored)
├── CLAUDE.md               # Assistant personality and rules
├── USER.md               # User profile and context
├── AGENTS.md             # AI agent definitions for empire routing
├── .env                  # Runtime configuration (gitignored)
├── .env.example          # Configuration template with documentation
├── .gitignore
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

### 2.2 Component Responsibilities

#### `src/env.ts` — Safe Environment Parser

**Responsibility**: Parse `.env` files without polluting `process.env`.

**Interface**:
```typescript
export function readEnvFile(keys?: string[]): Record<string, string>
```

**Behavior**:
- Opens `.env` relative to project root (derived via `fileURLToPath(import.meta.url)`)
- Skips comment lines (starting with `#`) and blank lines
- Handles quoted values: `KEY="value with spaces"` and `KEY='value'`
- If `keys` array provided, returns only those keys
- Returns `{}` if `.env` doesn't exist
- Never throws, never sets `process.env`

**Critical implementation note**: Must use `fileURLToPath(import.meta.url)` — NOT `new URL(import.meta.url).pathname` — to resolve paths. The `.pathname` property preserves `%20` URL encoding and breaks on paths with spaces.

#### `src/config.ts` — Configuration Constants

**Responsibility**: Export named constants for all configuration values.

**Interface**:
```typescript
export const TELEGRAM_BOT_TOKEN: string
export const ALLOWED_CHAT_ID: string
export const ALLOWED_CHAT_IDS: string[]
export const GROQ_API_KEY: string
export const ELEVENLABS_API_KEY: string
export const ELEVENLABS_VOICE_ID: string
export const GOOGLE_API_KEY: string
export const PROJECT_ROOT: string
export const STORE_DIR: string
export const DB_PATH: string
export const UPLOADS_DIR: string
export const MAX_MESSAGE_LENGTH: number  // 4096
export const TYPING_REFRESH_MS: number   // 4000
export const SCHEDULER_POLL_MS: number   // 60000
export const MEMORY_DECAY_RATE: number   // 0.98
export const MEMORY_MIN_SALIENCE: number // 0.1
export const MAX_MEMORY_RESULTS: number  // 8
```

**Behavior**:
- Reads all values via `readEnvFile()` at module load time
- Derives `PROJECT_ROOT` via `fileURLToPath(import.meta.url)`
- Derives `STORE_DIR`, `DB_PATH`, `UPLOADS_DIR` from `PROJECT_ROOT`
- Parses `ALLOWED_CHAT_IDS` from comma-separated string
- All secrets are local constants — never in `process.env`

#### `src/logger.ts` — Structured Logging

**Responsibility**: Centralized pino logger with environment-aware formatting.

**Interface**:
```typescript
export const logger: pino.Logger
```

**Behavior**:
- Log level from `LOG_LEVEL` env var, default `info`
- Pretty-printing in development (`pino-pretty` with colorize)
- Raw JSON in production (for `journalctl` parsing)
- Child loggers created with `logger.child({ component: 'bot' })` for module-scoped context

#### `src/db.ts` — Database Layer

**Responsibility**: SQLite schema initialization, all query functions, WAL mode management.

**Interface**:
```typescript
// Initialization
export function initDatabase(): void

// Sessions
export function getSession(chatId: string): string | null
export function setSession(chatId: string, sessionId: string): void
export function clearSession(chatId: string): void

// Memories
export function searchMemories(chatId: string, query: string, limit?: number): Memory[]
export function getRecentMemories(chatId: string, limit?: number): Memory[]
export function saveMemory(chatId: string, content: string, sector: 'semantic' | 'episodic', topicKey?: string): void
export function touchMemory(id: number): void
export function decayMemories(): { decayed: number; deleted: number }
export function getMemoriesForDisplay(chatId: string, limit?: number): Memory[]

// Scheduled Tasks
export function createTask(task: NewTask): void
export function getDueTasks(): ScheduledTask[]
export function updateTaskAfterRun(id: string, lastResult: string, nextRun: number): void
export function pauseTask(id: string): void
export function resumeTask(id: string): void
export function deleteTask(id: string): void
export function listTasks(chatId?: string): ScheduledTask[]

// Types
export interface Memory {
  id: number
  chatId: string
  topicKey: string | null
  content: string
  sector: 'semantic' | 'episodic'
  salience: number
  createdAt: number
  accessedAt: number
}

export interface ScheduledTask {
  id: string
  chatId: string
  prompt: string
  schedule: string
  nextRun: number
  lastRun: number | null
  lastResult: string | null
  status: 'active' | 'paused'
  createdAt: number
}
```

**Behavior**:
- Uses `better-sqlite3` (synchronous driver) in WAL mode
- Database file at `store/aos.db`
- `initDatabase()` creates all tables + indexes + FTS5 + triggers
- All queries use prepared statements (prevents SQL injection)
- Timestamps are Unix epoch seconds (INTEGER)
- FTS5 search sanitizes input: strips non-alphanumeric, appends `*` suffix for prefix matching

#### `src/agent.ts` — Claude Code Agent SDK Wrapper

**Responsibility**: Spawn Claude Code subprocess, manage session lifecycle, extract responses.

**Interface**:
```typescript
export async function runAgent(
  message: string,
  sessionId?: string,
  onTyping?: () => void
): Promise<{ text: string | null; newSessionId?: string }>
```

**Behavior**:
1. Import `query` from `@anthropic-ai/claude-agent-sdk`
2. Read secrets from `.env` via `readEnvFile()` — NOT `process.env`
3. Call `query()` with:
   - `prompt: message`
   - `cwd: PROJECT_ROOT` — loads CLAUDE.md from workspace
   - `resume: sessionId` — for session continuity (undefined for new sessions)
   - `settingSources: ['project', 'user']` — loads workspace CLAUDE.md + global skills
   - `permissionMode: 'bypassPermissions'` — no terminal approval prompts
4. Set up `onTyping` callback interval (4000ms) while processing
5. Iterate async event generator:
   - `type === 'system' && subtype === 'init'` → capture `sessionId`
   - `type === 'result'` → extract `result.result` as response text
6. Clear typing interval on completion
7. Return `{ text, newSessionId }`

**Error handling**:
- Wrap entire function in try/catch
- Log full error with stack trace
- Return `{ text: 'I ran into an error processing that. Try again or /newchat to start fresh.', newSessionId: undefined }`
- Never throw — the bot must not crash from a Claude subprocess error

#### `src/memory.ts` — Dual-Sector Memory System

**Responsibility**: Semantic + episodic memory with FTS5 search, salience-weighted decay, and context injection.

**Interface**:
```typescript
export function buildMemoryContext(chatId: string, userMessage: string): string
export function saveConversationTurn(chatId: string, userMsg: string, assistantMsg: string): void
export function runDecaySweep(): { decayed: number; deleted: number }
```

**Behavior — `buildMemoryContext()`**:
1. Sanitize user message: strip non-alphanumeric, add `*` suffix for prefix matching
2. FTS5 search: `SELECT ... FROM memories JOIN memories_fts ON ... WHERE memories_fts MATCH ? AND chat_id = ? LIMIT 3`
3. Recent fetch: `SELECT ... FROM memories WHERE chat_id = ? ORDER BY accessed_at DESC LIMIT 5`
4. Deduplicate results by `id`
5. Touch each result: `UPDATE memories SET accessed_at = ?, salience = MIN(salience + 0.1, 5.0) WHERE id = ?`
6. Format: `[Memory context]\n- {content} ({sector})\n- ...`
7. Return empty string if no matches

**Behavior — `saveConversationTurn()`**:
- Skip if user message ≤ 20 chars or starts with `/`
- Detect semantic signals: `/\b(my|i am|i'm|i prefer|remember|always|never)\b/i`
- Save as `semantic` if signal detected, `episodic` otherwise
- Initial salience: 1.0
- Save both user message and assistant response as separate memories

**Behavior — `runDecaySweep()`**:
- `UPDATE memories SET salience = salience * 0.98 WHERE created_at < ? - 86400`
- `DELETE FROM memories WHERE salience < 0.1`
- Return count of decayed and deleted rows
- Log results at info level

#### `src/bot.ts` — Telegram Bot

**Responsibility**: Grammy bot setup, message routing, Markdown→HTML conversion, response splitting, typing indicators.

**Interface**:
```typescript
export function createBot(): Bot
export function formatForTelegram(text: string): string
export function splitMessage(text: string, limit?: number): string[]
```

**Key functions**:

**`formatForTelegram(text: string): string`**:
1. Extract and protect code blocks (replace with placeholders)
2. Convert within code blocks: escape HTML entities only
3. Convert outside code blocks:
   - `**text**` → `<b>text</b>`
   - `*text*` → `<i>text</i>`
   - `` `code` `` → `<code>code</code>`
   - `~~text~~` → `<s>text</s>`
   - `[text](url)` → `<a href="url">text</a>`
   - `# Heading` → `<b>Heading</b>\n`
   - `- [ ]` → `☐`, `- [x]` → `☑`
   - Strip: `---`, `***`, raw HTML tags
   - Escape: `&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;` in text nodes
4. Restore code blocks from placeholders

**`splitMessage(text: string, limit = 4096): string[]`**:
- Split on newline boundaries at or before the limit
- Never split mid-word or mid-HTML-tag
- Return array of message chunks

**`handleMessage(ctx, rawText, forceVoiceReply = false)`** — Full pipeline:
1. Extract chat ID, check authorization via `isAuthorised()`
2. Build memory context: `buildMemoryContext(chatId, rawText)`
3. Prepend memory context to user message
4. Retrieve session: `getSession(chatId)`
5. Start typing refresh: `setInterval(() => ctx.api.sendChatAction(chatId, 'typing'), 4000)`
6. Call `runAgent(enrichedMessage, sessionId, onTyping)`
7. Clear typing interval
8. Update session if new: `setSession(chatId, newSessionId)`
9. Save conversation: `saveConversationTurn(chatId, rawText, response)`
10. If TTS enabled AND (forceVoiceReply OR voiceMode): synthesize → send voice
11. Else: format → split → send each chunk as HTML

**Command handlers**:
- `/start` — greeting with available commands
- `/chatid` — echo `ctx.chat.id`
- `/newchat` — `clearSession(chatId)`, confirm
- `/forget` — alias for `/newchat`
- `/memory` — display recent memories
- `/voice` — toggle voice mode
- `/schedule` — inline task management
- `bot.on('message:text')` — main handler
- `bot.on('message:voice')` — download → transcribe → handleMessage
- `bot.on('message:photo')` — download → buildPhotoMessage → handleMessage
- `bot.on('message:document')` — download → buildDocumentMessage → handleMessage
- `bot.on('message:video')` — download → buildVideoMessage → handleMessage

#### `src/voice.ts` — Voice Processing

**Responsibility**: Speech-to-text transcription (Groq Whisper) and text-to-speech synthesis (ElevenLabs).

**Interface**:
```typescript
export async function transcribeAudio(filePath: string): Promise<string>
export async function synthesizeSpeech(text: string): Promise<Buffer>
export function voiceCapabilities(): { stt: boolean; tts: boolean }
```

**STT — Groq Whisper**:
1. Read file as Buffer
2. Rename `.oga` → `.ogg` (Groq requirement — same format, different extension)
3. Build multipart/form-data manually (no extra dependencies)
4. POST to `https://api.groq.com/openai/v1/audio/transcriptions`
5. Model: `whisper-large-v3`
6. Header: `Authorization: Bearer {GROQ_API_KEY}`
7. Return `response.text`

**TTS — ElevenLabs**:
1. POST to `https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}`
2. Header: `xi-api-key: {ELEVENLABS_API_KEY}`
3. Body: `{ text, model_id: "eleven_turbo_v2_5", voice_settings: { stability: 0.5, similarity_boost: 0.75 } }`
4. Return MP3 Buffer

**`voiceCapabilities()`**: Returns booleans based on whether API keys are configured.

#### `src/media.ts` — Media Handling

**Responsibility**: Download Telegram media files, build context messages for Claude, cleanup old files.

**Interface**:
```typescript
export async function downloadMedia(botToken: string, fileId: string, originalFilename?: string): Promise<string>
export function buildPhotoMessage(localPath: string, caption?: string): string
export function buildDocumentMessage(localPath: string, filename: string, caption?: string): string
export function buildVideoMessage(localPath: string, caption?: string): string
export function cleanupOldUploads(maxAgeMs?: number): void
```

**`downloadMedia()`**:
1. Call Telegram `getFile` endpoint → get `file_path`
2. Download from `https://api.telegram.org/file/bot${token}/${file_path}`
3. Sanitize filename: `replace(/[^a-zA-Z0-9._-]/g, '-')`
4. Save to `workspace/uploads/${Date.now()}_${sanitized}`
5. Return local path

**Message builders**: Create prompt text that tells Claude about the attached file:
- Photo: `"The user sent a photo. It's saved at {path}. {caption}"`
- Document: `"The user sent a document '{filename}'. It's saved at {path}. {caption}"`
- Video: `"The user sent a video. It's saved at {path}. Use the Gemini API to analyze it. {caption}"`

**`cleanupOldUploads()`**: Delete files in `workspace/uploads/` older than 24 hours. Called on startup.

#### `src/security.ts` — Security Module

**Responsibility**: Authorization, PID lock management, outbound secret redaction.

**Interface**:
```typescript
export function isAuthorised(chatId: string | number): boolean
export function acquireLock(): void
export function releaseLock(): void
export function redactSecrets(text: string): string
```

**`isAuthorised()`**:
- Check `chatId` against `ALLOWED_CHAT_ID` or `ALLOWED_CHAT_IDS` list
- If no chat IDs configured (first-run mode), return true and log the incoming ID
- String comparison (Telegram chat IDs are numeric but compared as strings)

**`acquireLock()`**:
1. Read `store/aos.pid` if exists
2. Try `process.kill(pid, 0)` to check if process is alive
3. If alive, kill it: `process.kill(pid, 'SIGTERM')`
4. Write `process.pid` to `store/aos.pid`
5. If store dir doesn't exist, create it

**`releaseLock()`**: Delete `store/aos.pid` if it contains current PID.

**`redactSecrets()`**:
- Pattern match against known secret formats:
  - `sk-[a-zA-Z0-9]{20,}` (API keys)
  - `ghp_[a-zA-Z0-9]{36}` (GitHub PATs)
  - `xoxb-[0-9-]+` (Slack tokens)
  - `Bearer\s+[a-zA-Z0-9._-]{20,}`
  - Generic: `(?:password|token|secret|key)\s*[:=]\s*\S+`
- Replace matches with `[REDACTED]`

#### `src/scheduler.ts` — Cron Scheduler

**Responsibility**: Poll for due tasks, execute them via Claude Code, send results.

**Interface**:
```typescript
export function initScheduler(send: (chatId: string, text: string) => Promise<void>): void
export async function runDueTasks(): Promise<void>
export function computeNextRun(cronExpression: string): number
```

**`initScheduler()`**:
1. Accept a `send` function (abstracted from Telegram for testability)
2. Start polling interval: `setInterval(runDueTasks, SCHEDULER_POLL_MS)`
3. Log scheduler start

**`runDueTasks()`**:
1. `getDueTasks()` — tasks where `status='active'` AND `next_run <= now`
2. For each task:
   a. Send notification: `"⏰ Running: {prompt.slice(0, 50)}..."`
   b. `runAgent(task.prompt)` — no session, no user message
   c. Compute next run: `computeNextRun(task.schedule)`
   d. `updateTaskAfterRun(task.id, result, nextRun)`
   e. Send result to `task.chatId`
   f. On error: send failure notification, still advance `nextRun`

**`computeNextRun()`**:
- Parse cron expression with `cron-parser`
- `CronExpression.parse(expr).next().getTime() / 1000`
- Returns Unix epoch seconds

#### `src/schedule-cli.ts` — Scheduler CLI

**Responsibility**: Command-line tool for managing scheduled tasks.

**CLI commands**:
```
aos schedule create "<prompt>" "<cron>" <chat_id>
aos schedule list [--chat-id <id>]
aos schedule delete <task_id>
aos schedule pause <task_id>
aos schedule resume <task_id>
```

**Behavior**:
- Parses `process.argv` directly (no CLI framework dependency)
- Validates cron expressions before creating tasks
- Generates UUID for task IDs
- Outputs task tables in formatted ASCII

#### `src/index.ts` — Entry Point

**Responsibility**: Startup orchestration, lifecycle management, signal handling.

**Startup sequence**:
```
1. Show banner
2. Validate required config (TELEGRAM_BOT_TOKEN)
3. acquireLock() — write PID, kill stale
4. Ensure store/ and workspace/uploads/ dirs exist
5. initDatabase() — create tables
6. runDecaySweep() — initial memory cleanup
7. setInterval(runDecaySweep, 86400000) — daily decay
8. cleanupOldUploads() — clear stale media
9. createBot() — setup Grammy bot + handlers
10. initScheduler(sendFn) — start cron polling
11. Register SIGINT/SIGTERM handlers → graceful shutdown
12. bot.start() — connect to Telegram
13. Log "AOS running"
```

**Graceful shutdown**:
```
1. Log "shutting down..."
2. Stop scheduler polling (clearInterval)
3. bot.stop() — disconnect from Telegram
4. Close SQLite connection
5. releaseLock() — delete PID file
6. process.exit(0)
```

---

## 3. Data Flow

### 3.1 Message Processing Pipeline (8 Stages)

```
Stage 1: RECEIVE
  Telegram Bot API → Grammy event handler
  Extract: chat_id, message_type, content/file_id

Stage 2: AUTHENTICATE
  isAuthorised(chat_id) → allow/reject
  Unauthorized: silent drop, log warning

Stage 3: MEDIA PROCESS
  If voice: download .oga → rename .ogg → Groq STT → transcript
  If photo: download → save to uploads/ → build photo prompt
  If document: download → save to uploads/ → build document prompt
  If video: download → save to uploads/ → build video prompt
  If text: pass through

Stage 4: MEMORY ENRICH
  buildMemoryContext(chat_id, user_message)
  FTS5 search (top 3) + recent (top 5) → deduplicate → touch
  Prepend: "[Memory context]\n- memory1\n- memory2\n{user_message}"

Stage 5: SESSION RESOLVE
  getSession(chat_id) → session_id or null
  Null = new session (fresh context)

Stage 6: AGENT EXECUTE
  runAgent(enriched_message, session_id, onTyping)
  Spawns claude CLI subprocess via Agent SDK
  Iterates events: system.init → capture session_id, result → extract text
  Typing callback fires every 4s

Stage 7: PERSIST
  setSession(chat_id, new_session_id) — store for next message
  saveConversationTurn(chat_id, user_msg, response) — add to memory

Stage 8: RESPOND
  If TTS + (forceVoiceReply | voiceMode):
    synthesizeSpeech(text) → send as voice message
  Else:
    redactSecrets(text)
    formatForTelegram(text)
    splitMessage(formatted, 4096)
    Send each chunk as HTML
```

### 3.2 Scheduled Task Execution Flow

```
Scheduler Poll (every 60s)
  │
  ▼
getDueTasks() — SELECT where status='active' AND next_run <= now()
  │
  ▼
For each due task:
  │
  ├─▶ Send "⏰ Running: {prompt}" to chat_id
  │
  ├─▶ runAgent(task.prompt) — no session, autonomous
  │
  ├─▶ computeNextRun(task.schedule) — cron-parser
  │
  ├─▶ updateTaskAfterRun(id, result, nextRun)
  │
  └─▶ Send result to chat_id
       (or error notification on failure)
```

### 3.3 Memory Lifecycle

```
Message arrives
  │
  ├─▶ buildMemoryContext() — SEARCH phase
  │     FTS5 search → top 3 relevant
  │     Recent fetch → top 5 by accessed_at
  │     Deduplicate → touch (salience += 0.1)
  │     Return formatted context string
  │
  ▼
Response generated
  │
  ├─▶ saveConversationTurn() — STORE phase
  │     Skip if msg ≤ 20 chars or starts with /
  │     Detect semantic signals → classify sector
  │     INSERT into memories (salience = 1.0)
  │     FTS5 trigger auto-indexes content
  │
  ▼
Daily (24h interval)
  │
  └─▶ runDecaySweep() — DECAY phase
        UPDATE salience = salience * 0.98 (for memories > 1 day old)
        DELETE where salience < 0.1
        Log: "{N} decayed, {M} deleted"
```

### 3.4 Session Lifecycle

```
First message from chat_id
  │
  ├─▶ getSession(chat_id) → null (no session)
  │
  ├─▶ runAgent(msg, undefined) — creates new session
  │
  ├─▶ Capture session_id from system.init event
  │
  └─▶ setSession(chat_id, session_id) — store in DB

Subsequent messages
  │
  ├─▶ getSession(chat_id) → session_id
  │
  ├─▶ runAgent(msg, session_id) — resumes session
  │
  └─▶ Update session_id if changed

/newchat command
  │
  └─▶ clearSession(chat_id) — DELETE row
       Next message creates fresh session
```

---

## 4. Database Schema (Complete SQL)

```sql
-- Enable WAL mode for concurrency and crash resilience
PRAGMA journal_mode = WAL;

-- ============================================================
-- SESSIONS: Maps Telegram chats to Claude Code session IDs
-- ============================================================
CREATE TABLE IF NOT EXISTS sessions (
  chat_id     TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- ============================================================
-- MEMORIES: Dual-sector (semantic + episodic) with salience decay
-- ============================================================
CREATE TABLE IF NOT EXISTS memories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id     TEXT NOT NULL,
  topic_key   TEXT,
  content     TEXT NOT NULL,
  sector      TEXT NOT NULL CHECK(sector IN ('semantic', 'episodic')),
  salience    REAL NOT NULL DEFAULT 1.0,
  created_at  INTEGER NOT NULL,
  accessed_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memories_chat
  ON memories(chat_id);

CREATE INDEX IF NOT EXISTS idx_memories_sector
  ON memories(chat_id, sector);

CREATE INDEX IF NOT EXISTS idx_memories_salience
  ON memories(salience);

CREATE INDEX IF NOT EXISTS idx_memories_accessed
  ON memories(chat_id, accessed_at DESC);

-- ============================================================
-- MEMORIES_FTS: Full-text search index on memory content
-- ============================================================
CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
  content,
  content_rowid=id
);

-- Keep FTS5 in sync with memories table
CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts(rowid, content) VALUES (new.id, new.content);
END;

CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, content)
    VALUES ('delete', old.id, old.content);
END;

CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE OF content ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, content)
    VALUES ('delete', old.id, old.content);
  INSERT INTO memories_fts(rowid, content) VALUES (new.id, new.content);
END;

-- ============================================================
-- SCHEDULED_TASKS: Cron-based task execution
-- ============================================================
CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id          TEXT PRIMARY KEY,
  chat_id     TEXT NOT NULL,
  prompt      TEXT NOT NULL,
  schedule    TEXT NOT NULL,
  next_run    INTEGER NOT NULL,
  last_run    INTEGER,
  last_result TEXT,
  status      TEXT NOT NULL DEFAULT 'active'
                CHECK(status IN ('active', 'paused')),
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_due
  ON scheduled_tasks(status, next_run);

CREATE INDEX IF NOT EXISTS idx_tasks_chat
  ON scheduled_tasks(chat_id);

-- ============================================================
-- NOTIFICATION_QUEUE: Priority-batched outbound notifications (P1)
-- ============================================================
CREATE TABLE IF NOT EXISTS notification_queue (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id     TEXT NOT NULL,
  content     TEXT NOT NULL,
  priority    TEXT NOT NULL DEFAULT 'medium'
                CHECK(priority IN ('critical', 'high', 'medium')),
  source      TEXT,
  created_at  INTEGER NOT NULL,
  sent_at     INTEGER
);

CREATE INDEX IF NOT EXISTS idx_notifications_pending
  ON notification_queue(priority, created_at)
  WHERE sent_at IS NULL;

-- ============================================================
-- WA_OUTBOX: WhatsApp outbound message queue (P2)
-- ============================================================
CREATE TABLE IF NOT EXISTS wa_outbox (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  recipient   TEXT NOT NULL,
  content     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending'
                CHECK(status IN ('pending', 'sent', 'failed')),
  created_at  INTEGER NOT NULL,
  sent_at     INTEGER
);

-- ============================================================
-- WA_MESSAGES: WhatsApp message history (P2)
-- ============================================================
CREATE TABLE IF NOT EXISTS wa_messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_jid    TEXT NOT NULL,
  sender      TEXT NOT NULL,
  content     TEXT NOT NULL,
  timestamp   INTEGER NOT NULL,
  is_from_me  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_wa_messages_chat
  ON wa_messages(chat_jid, timestamp);

-- ============================================================
-- WA_MESSAGE_MAP: Links Telegram messages to WhatsApp (P2)
-- ============================================================
CREATE TABLE IF NOT EXISTS wa_message_map (
  telegram_msg_id TEXT PRIMARY KEY,
  wa_chat_jid     TEXT NOT NULL,
  wa_msg_id       TEXT
);
```

---

## 5. Memory System Design

### 5.1 Architecture

The memory system uses a dual-sector model inspired by human memory:

```
┌────────────────────────────────────┐
│         Memory System              │
│                                    │
│  ┌─────────────┐  ┌────────────┐  │
│  │  Semantic    │  │  Episodic  │  │
│  │  Sector     │  │  Sector    │  │
│  │             │  │            │  │
│  │  "my name   │  │  "asked    │  │
│  │   is Greg"  │  │   about    │  │
│  │             │  │   weather" │  │
│  │  salience:  │  │            │  │
│  │  high,      │  │  salience: │  │
│  │  stable     │  │  low,      │  │
│  └──────┬──────┘  │  decaying" │  │
│         │         └──────┬─────┘  │
│         │                │        │
│         ▼                ▼        │
│  ┌────────────────────────────┐   │
│  │      FTS5 Search Index     │   │
│  │   (full-text, prefix match)│   │
│  └────────────────────────────┘   │
│                                    │
│  ┌────────────────────────────┐   │
│  │    Salience Decay Engine   │   │
│  │  - Daily: salience *= 0.98 │   │
│  │  - Access: salience += 0.1 │   │
│  │  - Delete: salience < 0.1  │   │
│  │  - Cap: salience <= 5.0    │   │
│  └────────────────────────────┘   │
└────────────────────────────────────┘
```

### 5.2 Sector Classification

**Semantic memories** are facts about the user that should persist:
- Triggered by: `my`, `I am`, `I'm`, `I prefer`, `remember`, `always`, `never`
- Examples: "my daughter's name is Luna", "I prefer dark mode", "never use em dashes"
- Higher baseline salience, slower effective decay (frequently reinforced)

**Episodic memories** are conversational context:
- Default sector for all non-semantic messages
- Examples: "discussed quarterly report", "debugged auth bug"
- Lower baseline salience, faster effective decay

### 5.3 Salience Dynamics

```
Initial salience:  1.0 (all new memories)
Access boost:      +0.1 per retrieval (capped at 5.0)
Daily decay:       ×0.98 for memories older than 24 hours
Death threshold:   < 0.1 → auto-delete

Half-life calculation:
  0.98^n = 0.5 → n ≈ 34 days (untouched memory fades to 50% in ~34 days)
  0.98^n = 0.1 → n ≈ 114 days (untouched memory auto-deletes in ~114 days)

With access reinforcement:
  A memory accessed daily: salience oscillates between 1.0-1.1 (never decays)
  A memory accessed weekly: salience drops slowly but stabilizes around 0.7-0.8
```

### 5.4 Context Injection

Memory context is prepended to user messages in this format:

```
[Memory context]
- Greg is the CEO of Meridian Digital and three other companies (semantic)
- Greg prefers concise responses without markdown walls (semantic)
- Yesterday discussed the Series A pitch deck for Nova Labs (episodic)
- Bridget's birthday is March 15 (semantic)

{actual user message here}
```

Maximum injection: 8 memories, ~2000 characters. Prevents memory context from consuming too much of Claude's context window.

---

## 6. Scheduler Design

### 6.1 Architecture

```
┌─────────────────────────────────────┐
│          Scheduler System           │
│                                     │
│  ┌──────────┐    ┌──────────────┐  │
│  │  Poll     │───▶│  Task Queue  │  │
│  │  Timer    │    │  (SQLite)    │  │
│  │  (60s)    │    └──────┬───────┘  │
│  └──────────┘           │          │
│                          ▼          │
│                ┌──────────────┐     │
│                │  Executor    │     │
│                │  (runAgent)  │     │
│                └──────┬───────┘     │
│                       │             │
│                       ▼             │
│                ┌──────────────┐     │
│                │  Result      │     │
│                │  Sender      │     │
│                └──────────────┘     │
└─────────────────────────────────────┘
```

### 6.2 Supported Job Types

Based on current production usage (28 scheduled jobs):

| Job Type | Cron Pattern | Example Prompt |
|----------|-------------|----------------|
| Morning briefing | `0 9 * * *` | "Check email, calendar, and pending tasks. Send me a morning briefing." |
| Work poll | `0 */4 * * 1-5` | "Check all company Slack channels for anything needing my attention." |
| Deal scan | `0 8 * * 1-5` | "Scan deal pipeline in the CRM and flag anything stale or urgent." |
| Nightly reflection | `0 22 * * *` | "Review today's accomplishments and outstanding items. Send a summary." |
| Autonomous agent | `0 */6 * * *` | "Run the market research agent for Nova Labs competitor tracking." |
| Relationship check | `0 10 * * 1` | "Check who I haven't contacted in the last 2 weeks. Suggest outreach." |
| System health | `0 */12 * * *` | "Run system health checks on all VPS instances." |

### 6.3 Task State Machine

```
          create
            │
            ▼
    ┌──────────────┐
    │    active     │◀──── resume
    │              │
    └──────┬───────┘
           │
     ┌─────┼──────┐
     │     │      │
     ▼     ▼      ▼
  execute  pause  delete
     │     │
     │     ▼
     │  ┌──────────────┐
     │  │   paused      │
     │  └──────────────┘
     │
     ▼
  update next_run
  (loop back to active)
```

---

## 7. Security Architecture

### 7.1 Defense-in-Depth Layers

```
Layer 1: NETWORK
  └─ No open ports. All communication is outbound.
     └─ Telegram: outbound HTTPS to api.telegram.org
     └─ Groq/ElevenLabs: outbound HTTPS API calls
     └─ Claude: local subprocess (no network)

Layer 2: AUTHENTICATION
  └─ Chat ID allowlist checked on every message
     └─ Silent drop for unauthorized messages
     └─ First-run mode: accept first message, log ID

Layer 3: SECRET MANAGEMENT
  └─ .env read via readEnvFile() → local constants
     └─ process.env never polluted
     └─ Outbound messages scanned for secret patterns
     └─ [REDACTED] replacement before sending

Layer 4: PROCESS ISOLATION
  └─ PID lock prevents duplicate instances
     └─ systemd hardening: NoNewPrivileges, ProtectSystem
     └─ Graceful shutdown on SIGTERM/SIGINT

Layer 5: DATA PROTECTION
  └─ SQLite WAL mode prevents corruption
     └─ .env permissions: 600
     └─ store/ permissions: 700
     └─ Upload cleanup after 24h
     └─ No cloud storage — all data local
```

### 7.2 Threat Model

| Threat | Vector | Mitigation |
|--------|--------|------------|
| Unauthorized bot access | Guessing Telegram bot token | Chat ID allowlist, silent rejection |
| Secret leakage in responses | Claude outputs API key in response | Outbound redaction scan |
| Process env inheritance | Subprocess inherits secrets | Never pollute process.env |
| Duplicate instance conflict | Two processes compete for Telegram updates | PID lock with stale detection |
| SQLite corruption | Crash during write | WAL mode, startup backup |
| Path traversal via media | Malicious filename in upload | Filename sanitization regex |
| Shell injection via user message | User message in shell command | Never interpolate user input into shell |
| Denial of service | Flooding bot with messages | Single-user design, Telegram rate limits |

### 7.3 systemd Service Hardening

```ini
[Service]
Type=simple
ExecStart=/usr/bin/node /path/to/aos/dist/index.js
WorkingDirectory=/path/to/aos
Restart=always
RestartSec=5

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
PrivateTmp=true
ReadWritePaths=/path/to/aos/store /path/to/aos/workspace

[Install]
WantedBy=default.target
```

---

## 8. Error Handling and Recovery Patterns

### 8.1 Error Hierarchy

```
AosError (base)
├── ConfigError         — missing or invalid configuration
│   ├── MissingTokenError
│   └── InvalidCronError
├── AuthError           — authentication failures
│   └── UnauthorizedChatError
├── AgentError          — Claude Code subprocess failures
│   ├── AgentTimeoutError
│   └── SessionResumeError
├── MediaError          — media processing failures
│   ├── DownloadError
│   ├── TranscriptionError
│   └── SynthesisError
├── DatabaseError       — SQLite operation failures
│   ├── SchemaError
│   └── QueryError
└── SchedulerError      — scheduled task failures
    ├── CronParseError
    └── TaskExecutionError
```

### 8.2 Recovery Strategies

| Error Type | Strategy | User Impact |
|------------|----------|-------------|
| `AgentError` | Log, return friendly error message, session preserved | One failed response |
| `MediaError.Download` | Retry once, then error message | Media not processed |
| `MediaError.Transcription` | Fallback to text: "Could not transcribe voice" | Manual re-send |
| `MediaError.Synthesis` | Fallback to text response | Text instead of voice |
| `DatabaseError` | Log critical, attempt reconnect, graceful degrade | Possible memory loss |
| `SchedulerError.TaskExecution` | Log, notify user, advance next_run | One missed task run |
| `ConfigError.MissingToken` | Print setup instructions, exit | Bot won't start |
| Grammy connection drop | Auto-reconnect (built-in) | Brief message delay |

### 8.3 Retry Policy

```typescript
const RETRY_CONFIG = {
  maxAttempts: 3,
  baseDelay: 1000,      // 1 second
  maxDelay: 10000,       // 10 seconds
  backoffMultiplier: 2,  // exponential
  retryableErrors: [
    'ETIMEDOUT',
    'ECONNRESET',
    'ECONNREFUSED',
    'RATE_LIMITED',
  ],
}
```

Applied to: Telegram API calls, Groq API, ElevenLabs API.
NOT applied to: Claude Agent SDK (single attempt, no retry), SQLite (synchronous, no retry).

---

## 9. Deployment Architecture

### 9.1 System Requirements

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| OS | Ubuntu 22.04 | Ubuntu 24.04 LTS |
| CPU | 1 vCPU | 2 vCPU |
| RAM | 1 GB | 2 GB |
| Disk | 5 GB | 10 GB |
| Node.js | 20.0 | 22 LTS |
| Claude Code | Installed + authenticated | Latest |
| Network | Outbound HTTPS | Outbound HTTPS |

### 9.2 Deployment Diagram

```
┌──────────────────────────────────────────┐
│              Linux VPS                    │
│                                          │
│  ┌──────────────────────────────────┐    │
│  │          systemd                  │    │
│  │                                   │    │
│  │  ┌─────────────────────────┐     │    │
│  │  │  aos.service             │     │    │
│  │  │  - Restart=always        │     │    │
│  │  │  - RestartSec=5          │     │    │
│  │  │  - User=greg             │     │    │
│  │  └────────────┬────────────┘     │    │
│  │               │                   │    │
│  └───────────────┼───────────────────┘    │
│                  │                        │
│                  ▼                        │
│  ┌─────────────────────────────────┐     │
│  │        AOS Process              │     │
│  │  node dist/index.js             │     │
│  │                                  │     │
│  │  ┌──────┐  ┌────────┐          │     │
│  │  │ Bot  │  │Scheduler│          │     │
│  │  └──┬───┘  └───┬────┘          │     │
│  │     │          │                │     │
│  │     ▼          ▼                │     │
│  │  ┌────────────────────┐        │     │
│  │  │  SQLite (WAL)      │        │     │
│  │  │  store/aos.db      │        │     │
│  │  └────────────────────┘        │     │
│  │                                  │     │
│  │  ┌────────────────────┐        │     │
│  │  │  Claude CLI        │        │     │
│  │  │  (subprocess)      │        │     │
│  │  └────────────────────┘        │     │
│  └─────────────────────────────────┘     │
│                                          │
│  ┌──────────────────────┐               │
│  │  ~/projects/aos/     │               │
│  │  ├── CLAUDE.md         │               │
│  │  ├── USER.md         │               │
│  │  ├── AGENTS.md       │               │
│  │  ├── .env            │               │
│  │  ├── store/          │               │
│  │  │   ├── aos.db      │               │
│  │  │   └── aos.pid     │               │
│  │  └── workspace/      │               │
│  │      └── uploads/    │               │
│  └──────────────────────┘               │
└──────────────────────────────────────────┘
         │
         │ HTTPS (outbound only)
         ▼
┌──────────────────┐
│  External APIs   │
│  - Telegram API  │
│  - Groq API      │
│  - ElevenLabs    │
│  - Gemini API    │
└──────────────────┘
```

### 9.3 Setup Flow

```
git clone <repo> ~/projects/aos
cd ~/projects/aos
npm install
npm run setup        ← interactive wizard
                       1. Check requirements (Node, Claude CLI)
                       2. Collect bot token
                       3. Collect optional API keys
                       4. Open CLAUDE.md for personalization
                       5. Write .env
                       6. Build (tsc)
                       7. Install systemd service
                       8. Get chat ID (first message)
                       9. Print next steps
```

### 9.4 Second VPS Deployment

For deploying to Bridget's VPS (or any additional instance):

```
1. Clone repo
2. npm install
3. npm run setup (different bot token, different chat ID)
4. Edit CLAUDE.md for the new user's personality
5. Edit USER.md for the new user's context
6. systemctl --user start aos
```

Only `.env`, `CLAUDE.md`, and `USER.md` differ between instances. Everything else is identical.

---

## 10. Dependency List

### 10.1 Production Dependencies

| Package | Version | Purpose | Size |
|---------|---------|---------|------|
| `@anthropic-ai/claude-agent-sdk` | latest | Claude Code subprocess management | ~50KB |
| `better-sqlite3` | ^11.0.0 | Synchronous SQLite3 driver with WAL support | ~8MB (native) |
| `grammy` | ^1.25.0 | Telegram bot framework | ~200KB |
| `pino` | ^9.0.0 | Structured logging (JSON) | ~100KB |
| `cron-parser` | ^4.9.0 | Cron expression parsing and next-run computation | ~30KB |

### 10.2 Development Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `typescript` | ^5.5.0 | TypeScript compiler |
| `tsx` | ^4.15.0 | Direct TypeScript execution (dev mode) |
| `@types/node` | ^20.0.0 | Node.js type definitions |
| `@types/better-sqlite3` | ^7.6.0 | SQLite type definitions |
| `pino-pretty` | ^11.0.0 | Human-readable log formatting |
| `vitest` | ^2.0.0 | Test framework |

### 10.3 Optional Dependencies

| Package | Version | Feature | When Required |
|---------|---------|---------|---------------|
| `openai` | ^4.50.0 | STT via OpenAI Whisper | STT provider = OpenAI |
| `whatsapp-web.js` | ^1.25.0 | WhatsApp bridge | WhatsApp feature |
| `qrcode-terminal` | ^0.12.0 | QR code for WhatsApp auth | WhatsApp feature |

---

## 11. Configuration Management

### 11.1 .env Structure

```bash
# ============================================================
# AOS Configuration
# ============================================================

# --- Required ---
TELEGRAM_BOT_TOKEN=          # From @BotFather
ALLOWED_CHAT_ID=             # Your Telegram chat ID (get via /chatid)

# --- Multi-user (optional) ---
# ALLOWED_CHAT_IDS=123456,789012    # Comma-separated for multi-user

# --- Voice: Speech-to-Text ---
GROQ_API_KEY=                # From console.groq.com (free tier)

# --- Voice: Text-to-Speech (optional) ---
# ELEVENLABS_API_KEY=        # From elevenlabs.io
# ELEVENLABS_VOICE_ID=       # Voice ID from ElevenLabs

# --- Video Analysis (optional) ---
# GOOGLE_API_KEY=            # From aistudio.google.com

# --- Advanced ---
# LOG_LEVEL=info             # debug, info, warn, error
# NODE_ENV=production        # production disables pretty logging
# WORKSPACE_DIR=.            # Path to CLAUDE.md workspace
# AOS_DB_PATH=store/aos.db  # Custom database path
# SCHEDULER_POLL_INTERVAL=60000  # Scheduler poll interval (ms)
# MEMORY_DECAY_RATE=0.98    # Daily salience decay multiplier
# MEMORY_MIN_SALIENCE=0.1   # Auto-delete threshold
# MAX_MEMORY_RESULTS=8      # Max memories per context injection
```

### 11.2 Path Resolution Strategy

All path resolution uses `fileURLToPath(import.meta.url)`:

```typescript
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
export const PROJECT_ROOT = path.resolve(__dirname, '..')
```

**Never use**: `new URL(import.meta.url).pathname` — preserves `%20` encoding, breaks on spaces.

---

## 12. Testing Strategy

### 12.1 Test Structure

```
src/
  __tests__/
    env.test.ts           # .env parser tests
    db.test.ts            # SQLite schema + query tests
    memory.test.ts        # Memory build/save/decay tests
    bot.test.ts           # formatForTelegram + splitMessage tests
    security.test.ts      # Auth, redaction, PID lock tests
    scheduler.test.ts     # Cron parsing, due task detection
    agent.test.ts         # Agent SDK mock tests
    integration.test.ts   # Full message pipeline (mocked externals)
```

### 12.2 Test Categories

**Unit tests** (fast, no I/O):
- `env.ts`: Parse various `.env` formats, handle missing file, quoted values
- `config.ts`: Derived paths, defaults, type coercion
- `bot.ts formatForTelegram()`: Every Markdown → HTML conversion rule
- `bot.ts splitMessage()`: Boundary conditions, code blocks, edge cases
- `security.ts redactSecrets()`: All secret patterns, false positives
- `memory.ts`: Sector classification, FTS query sanitization

**Integration tests** (SQLite in-memory):
- `db.ts`: Full schema creation, CRUD operations, FTS5 sync
- `memory.ts`: buildMemoryContext with real SQLite, decay sweep
- `scheduler.ts`: Task creation, due detection, state transitions

**Mock tests** (external services mocked):
- `agent.ts`: Mock Agent SDK, verify event handling
- `voice.ts`: Mock Groq/ElevenLabs HTTP calls
- `media.ts`: Mock Telegram file download

### 12.3 Test Configuration

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
    },
  },
})
```

### 12.4 Coverage Targets

| Module | Target | Rationale |
|--------|--------|-----------|
| `env.ts` | 100% | Critical path, many edge cases |
| `db.ts` | 95% | Core data layer, all queries tested |
| `memory.ts` | 90% | Complex logic, decay math |
| `bot.ts` (formatter) | 95% | User-facing output quality |
| `security.ts` | 95% | Security-critical |
| `scheduler.ts` | 85% | Cron logic + execution |
| `agent.ts` | 80% | External dependency, mock-heavy |
| `voice.ts` | 75% | External API, mock-heavy |
| `media.ts` | 80% | File I/O, download logic |

---

## 13. Logging Strategy

### 13.1 Log Levels

| Level | Usage | Example |
|-------|-------|---------|
| `fatal` | Unrecoverable errors, process exiting | DB corruption, missing required config |
| `error` | Operation failed, service continues | Agent timeout, media download failure |
| `warn` | Unexpected but handled | Unauthorized chat ID, stale PID |
| `info` | Normal operations | Message received, task executed, startup/shutdown |
| `debug` | Development details | Memory search results, session IDs, SQL queries |
| `trace` | Verbose debugging | Raw API responses, event iterations |

### 13.2 Structured Log Fields

Every log entry includes:

```json
{
  "level": 30,
  "time": 1708900000000,
  "component": "bot",
  "msg": "Message processed",
  "chatId": "123456",
  "sessionId": "ses_abc123",
  "duration": 3200,
  "memoryCount": 5
}
```

Standard fields:
- `component`: Module name (bot, agent, memory, scheduler, security)
- `chatId`: Telegram chat ID (when applicable)
- `sessionId`: Claude session ID (when applicable)
- `duration`: Operation time in milliseconds
- `err`: Error object with stack trace (on errors)

---

## 14. Empire Integration Design (P1)

### 14.1 Company Context Structure

```
~/empire/
├── meridian/
│   ├── CLAUDE.md          # Meridian-specific personality overlay
│   ├── context.md       # Company knowledge base
│   └── agents.md        # Company-specific AI agents
├── nova-labs/
│   ├── CLAUDE.md
│   ├── context.md
│   └── agents.md
├── blackthorn/
│   ├── CLAUDE.md
│   ├── context.md
│   └── agents.md
└── apex/
    ├── CLAUDE.md
    ├── context.md
    └── agents.md
```

### 14.2 Context Routing

When the user sends `/company meridian`:
1. Look up `meridian` in the company registry (from `AGENTS.md`)
2. Set `activeCompany = 'meridian'` in memory
3. On next `runAgent()`, set `cwd` to `~/empire/meridian/`
4. Claude loads Meridian's CLAUDE.md as project context
5. Responses prefixed with `[Meridian]` for clarity

When `/company clear`:
1. Reset `activeCompany` to null
2. Restore default `cwd` to AOS project root
3. Claude loads personal CLAUDE.md again

### 14.3 INBOX.md Pattern

Each company directory can contain an `INBOX.md` for asynchronous inter-company intelligence:

```markdown
# Meridian Inbox

## 2026-02-25
- [Nova Labs] Partnership opportunity discussed in board meeting
- [Apex] Q1 revenue exceeded projections by 15%
```

Scheduled tasks can write to INBOX.md, and briefing tasks can read from it.

---

## 15. Performance Considerations

### 15.1 SQLite Optimization

- **WAL mode**: Enables concurrent reads during writes
- **Prepared statements**: All queries use prepared statements for speed + security
- **Indexes**: Strategic indexes on hot paths (sessions.chat_id, memories.chat_id, tasks.(status,next_run))
- **FTS5**: Efficient text search without loading all memories into application memory
- **No ORM**: Direct `better-sqlite3` calls — zero abstraction overhead

### 15.2 Memory Footprint

| Component | Estimated RSS | Notes |
|-----------|--------------|-------|
| Node.js runtime | ~30 MB | Baseline |
| Grammy (idle) | ~10 MB | WebSocket + polling |
| SQLite (active) | ~5 MB | Depends on DB size |
| Claude subprocess | ~50 MB | Temporary, per-message |
| **Total (idle)** | **~50 MB** | |
| **Total (processing)** | **~100 MB** | |

### 15.3 Latency Budget

```
Message received:          0 ms
Auth check:                1 ms
Memory context build:     50 ms (FTS5 search + recent fetch)
Session lookup:            2 ms
Agent SDK spawn:         200 ms (subprocess fork)
Claude processing:    3-30 seconds (depends on task complexity)
Response formatting:      10 ms
Message send:            100 ms (Telegram API)
Total overhead:         ~360 ms (excluding Claude processing)
```

---

*End of Architecture Document — AOS v1.0*
