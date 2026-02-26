# Epics and Stories — AOS (AlfredOS)

**Version:** 1.0
**Date:** 2026-02-26
**Status:** Draft

---

## Epic 1: CORE — Foundation Infrastructure

Bootstrap the project skeleton, configuration system, database layer, structured logging, and entry-point lifecycle management. Everything else depends on this.

### CORE-1: Project Scaffold and TypeScript Configuration

**Title:** Initialize project with package.json, tsconfig, and directory structure

**Acceptance Criteria:**
- [ ] `package.json` with `"type": "module"`, engine `>=20`, and all production/dev dependencies declared
- [ ] `tsconfig.json` with strict mode, ES2022 target, NodeNext module resolution
- [ ] Directory structure created: `src/`, `scripts/`, `store/`, `workspace/uploads/`
- [ ] `.gitignore` excludes `store/`, `workspace/uploads/`, `.env`, `dist/`, `node_modules/`
- [ ] `.env.example` contains all configuration variables with documentation comments
- [ ] `vitest.config.ts` configured per architecture spec (V8 coverage, 80% thresholds)
- [ ] `npm install` succeeds with no errors

**Complexity:** S
**Dependencies:** None

---

### CORE-2: Safe Environment Parser (`env.ts`)

**Title:** Implement `.env` file parser that never pollutes `process.env`

**Acceptance Criteria:**
- [ ] `readEnvFile(keys?)` reads `.env` relative to project root using `fileURLToPath(import.meta.url)`
- [ ] Skips comment lines (starting with `#`) and blank lines
- [ ] Handles quoted values: double quotes, single quotes, and unquoted
- [ ] If `keys` array provided, returns only those keys
- [ ] Returns `{}` if `.env` file does not exist (never throws)
- [ ] `process.env` is never modified — verified by unit test
- [ ] Unit tests cover: missing file, comments, quoted values, selective key filtering, empty values

**Complexity:** S
**Dependencies:** CORE-1

---

### CORE-3: Configuration Constants (`config.ts`)

**Title:** Export typed configuration constants derived from env values

**Acceptance Criteria:**
- [ ] All constants exported: `TELEGRAM_BOT_TOKEN`, `ALLOWED_CHAT_ID`, `ALLOWED_CHAT_IDS`, `GROQ_API_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `GOOGLE_API_KEY`, `PROJECT_ROOT`, `STORE_DIR`, `DB_PATH`, `UPLOADS_DIR`
- [ ] Numeric constants exported: `MAX_MESSAGE_LENGTH` (4096), `TYPING_REFRESH_MS` (4000), `SCHEDULER_POLL_MS` (60000), `MEMORY_DECAY_RATE` (0.98), `MEMORY_MIN_SALIENCE` (0.1), `MAX_MEMORY_RESULTS` (8)
- [ ] `PROJECT_ROOT` derived via `fileURLToPath(import.meta.url)`
- [ ] `ALLOWED_CHAT_IDS` parsed from comma-separated string into `string[]`
- [ ] All values read via `readEnvFile()` — never from `process.env`

**Complexity:** S
**Dependencies:** CORE-2

---

### CORE-4: Structured Logging (`logger.ts`)

**Title:** Set up pino logger with environment-aware formatting

**Acceptance Criteria:**
- [ ] `logger` exported as pino instance
- [ ] Log level configurable via `LOG_LEVEL` env var, defaults to `info`
- [ ] Pretty-printing enabled when `NODE_ENV !== 'production'` (via `pino-pretty`)
- [ ] Raw JSON output in production (for `journalctl` parsing)
- [ ] Child loggers created via `logger.child({ component })` for module-scoped context
- [ ] Standard fields documented: `component`, `chatId`, `sessionId`, `duration`, `err`

**Complexity:** S
**Dependencies:** CORE-3

---

### CORE-5: Database Layer (`db.ts`)

**Title:** Implement SQLite schema initialization and all query functions

**Acceptance Criteria:**
- [ ] `initDatabase()` creates all tables: `sessions`, `memories`, `memories_fts`, `scheduled_tasks`
- [ ] WAL mode enabled via `PRAGMA journal_mode = WAL`
- [ ] All indexes created: `idx_memories_chat`, `idx_memories_sector`, `idx_memories_salience`, `idx_memories_accessed`, `idx_tasks_due`, `idx_tasks_chat`
- [ ] FTS5 virtual table `memories_fts` with INSERT/UPDATE/DELETE sync triggers
- [ ] Session CRUD: `getSession()`, `setSession()`, `clearSession()`
- [ ] Memory CRUD: `searchMemories()`, `getRecentMemories()`, `saveMemory()`, `touchMemory()`, `decayMemories()`, `getMemoriesForDisplay()`
- [ ] Task CRUD: `createTask()`, `getDueTasks()`, `updateTaskAfterRun()`, `pauseTask()`, `resumeTask()`, `deleteTask()`, `listTasks()`
- [ ] All queries use prepared statements
- [ ] Timestamps are Unix epoch seconds (INTEGER)
- [ ] Integration tests with in-memory SQLite covering all CRUD operations and FTS5 sync

**Complexity:** L
**Dependencies:** CORE-3, CORE-4

---

### CORE-6: Entry Point and Lifecycle Management (`index.ts`)

**Title:** Implement startup orchestration, signal handling, and graceful shutdown

**Acceptance Criteria:**
- [ ] Startup sequence: banner → config validation → acquireLock → ensure directories → initDatabase → runDecaySweep → cleanupOldUploads → createBot → initScheduler → register signal handlers → bot.start → log running
- [ ] `SIGINT` and `SIGTERM` handlers trigger graceful shutdown
- [ ] Graceful shutdown: log → stop scheduler → bot.stop → close SQLite → releaseLock → exit(0)
- [ ] Daily decay sweep via `setInterval(runDecaySweep, 86400000)`
- [ ] Missing `TELEGRAM_BOT_TOKEN` prints setup instructions and exits
- [ ] `store/` and `workspace/uploads/` directories created if missing

**Complexity:** M
**Dependencies:** CORE-5, SECURITY-1, TELEGRAM-1, MEMORY-1, SCHEDULER-1, MEDIA-1

---

## Epic 2: BRIDGE — Claude Code Agent SDK Integration

Connect to the real Claude Code CLI as a subprocess with session persistence, making the full desktop AI available remotely.

### BRIDGE-1: Agent SDK Wrapper (`agent.ts`)

**Title:** Implement `runAgent()` to spawn Claude Code via Agent SDK

**Acceptance Criteria:**
- [ ] `runAgent(message, sessionId?, onTyping?)` exported
- [ ] Calls `query()` from `@anthropic-ai/claude-agent-sdk` with: `prompt`, `cwd: PROJECT_ROOT`, `resume: sessionId`, `permissionMode: 'bypassPermissions'`, `settingSources: ['project', 'user']`
- [ ] `onTyping` callback invoked via `setInterval` every 4000ms during processing
- [ ] Session ID captured from `system.init` event (`subtype === 'init'`)
- [ ] Response text extracted from `result` event (`result.result`)
- [ ] Typing interval cleared on completion
- [ ] Returns `{ text: string | null, newSessionId?: string }`
- [ ] Errors caught, logged with full stack trace, and returned as user-friendly error message
- [ ] Function never throws — always returns a result object

**Complexity:** M
**Dependencies:** CORE-3, CORE-4

---

### BRIDGE-2: Session Persistence

**Title:** Map Telegram chats to Claude Code session IDs in SQLite

**Acceptance Criteria:**
- [ ] `getSession(chatId)` retrieves session ID or returns null
- [ ] `setSession(chatId, sessionId)` upserts with `updated_at` timestamp
- [ ] `clearSession(chatId)` deletes the row
- [ ] Session ID from `runAgent()` response stored after each message
- [ ] New session started when `getSession()` returns null (undefined passed to `runAgent()`)
- [ ] Integration test verifies session continuity across multiple messages

**Complexity:** S
**Dependencies:** CORE-5, BRIDGE-1

---

### BRIDGE-3: CLAUDE.md Integration

**Title:** Load personality, user context, and agent definitions from workspace files

**Acceptance Criteria:**
- [ ] `CLAUDE.md` exists in project root with personality traits, communication rules, and behavioral guidelines
- [ ] `USER.md` exists in project root with user profile template
- [ ] `AGENTS.md` exists in project root with AI agent definition structure
- [ ] Claude Code SDK `cwd` points to workspace containing these files
- [ ] `settingSources: ['project', 'user']` loads CLAUDE.md as project settings
- [ ] Changes to CLAUDE.md take effect on the next message without restart

**Complexity:** S
**Dependencies:** BRIDGE-1

---

### BRIDGE-4: Error Recovery and Session Resilience

**Title:** Ensure Claude subprocess failures don't crash the bot or corrupt sessions

**Acceptance Criteria:**
- [ ] Agent timeout returns user-facing error message, session remains valid for next message
- [ ] Claude subprocess crash returns friendly error: "I ran into an error processing that. Try again or /newchat to start fresh."
- [ ] Session ID is never overwritten with undefined/null on error
- [ ] Typing interval is always cleared, even on error paths
- [ ] All errors logged with category `AgentError`, full stack trace, and relevant metadata (chatId, sessionId)
- [ ] Mock tests verify error handling for: timeout, crash, invalid session, empty response

**Complexity:** M
**Dependencies:** BRIDGE-1, BRIDGE-2

---

### BRIDGE-5: Message Pipeline Integration

**Title:** Wire the full receive-enrich-execute-persist-respond pipeline

**Acceptance Criteria:**
- [ ] Incoming text messages flow through: auth check → memory enrich → session resolve → agent execute → session persist → memory save → format → send
- [ ] Memory context prepended to user message before `runAgent()` call
- [ ] New session IDs from `runAgent()` stored via `setSession()`
- [ ] Conversation turns saved to memory via `saveConversationTurn()`
- [ ] Response passed through `redactSecrets()` before sending
- [ ] Response formatted via `formatForTelegram()` and split if exceeding 4096 chars
- [ ] Each chunk sent as HTML with `parse_mode: 'HTML'`

**Complexity:** M
**Dependencies:** BRIDGE-2, MEMORY-1, SECURITY-2, TELEGRAM-2

---

## Epic 3: TELEGRAM — Telegram Bot Interface

Set up the Grammy bot with command handlers, Markdown-to-HTML conversion, message splitting, typing indicators, and the user-facing command set.

### TELEGRAM-1: Bot Setup and Connection (`bot.ts`)

**Title:** Initialize Grammy bot with error handling and auto-reconnect

**Acceptance Criteria:**
- [ ] `createBot()` returns configured Grammy `Bot` instance
- [ ] Bot connects to Telegram using `TELEGRAM_BOT_TOKEN`
- [ ] Grammy auto-reconnect handles connection drops (built-in)
- [ ] Bot errors are caught and logged (not thrown)
- [ ] `bot.stop()` callable for graceful shutdown

**Complexity:** S
**Dependencies:** CORE-3, CORE-4

---

### TELEGRAM-2: Markdown-to-HTML Formatter

**Title:** Convert Claude's Markdown output to Telegram-compatible HTML

**Acceptance Criteria:**
- [ ] `formatForTelegram(text)` exported
- [ ] Code blocks extracted and protected before conversion, restored after
- [ ] Conversions: `**bold**` → `<b>`, `*italic*` → `<i>`, `` `code` `` → `<code>`, `~~strike~~` → `<s>`, `[text](url)` → `<a href>`, `# Heading` → `<b>`, `- [ ]` → `☐`, `- [x]` → `☑`
- [ ] HTML entities escaped in text nodes: `&`, `<`, `>`
- [ ] `---` and `***` horizontal rules stripped
- [ ] Raw HTML tags stripped from non-code content
- [ ] Invalid HTML in output does not crash the bot (fallback to plain text)
- [ ] Unit tests cover every conversion rule plus edge cases (nested formatting, empty input, code blocks with markdown-like content)

**Complexity:** M
**Dependencies:** CORE-1

---

### TELEGRAM-3: Message Splitting

**Title:** Split long responses respecting Telegram's 4096-character limit

**Acceptance Criteria:**
- [ ] `splitMessage(text, limit?)` returns array of chunks
- [ ] Splits on newline boundaries at or before the limit
- [ ] Never splits mid-word or mid-HTML-tag
- [ ] Single messages under the limit returned as single-element array
- [ ] Empty input returns empty array
- [ ] Unit tests cover: under limit, exact limit, over limit, code blocks, no-newline content

**Complexity:** S
**Dependencies:** CORE-1

---

### TELEGRAM-4: Typing Indicator Management

**Title:** Show typing indicator that refreshes while Claude processes

**Acceptance Criteria:**
- [ ] Typing indicator sent via `ctx.api.sendChatAction(chatId, 'typing')` immediately on message receipt
- [ ] Refresh interval: every 4000ms (Telegram typing expires ~5s)
- [ ] Interval cleared when response is ready or on error
- [ ] Typing indicator errors (network) are silently caught (non-critical)

**Complexity:** S
**Dependencies:** TELEGRAM-1

---

### TELEGRAM-5: Core Telegram Commands

**Title:** Implement `/start`, `/chatid`, `/newchat`, `/forget`, and `/memory` commands

**Acceptance Criteria:**
- [ ] `/start` sends greeting with available commands list
- [ ] `/chatid` echoes the numeric chat ID as plain text
- [ ] `/newchat` clears session via `clearSession(chatId)` and confirms to user
- [ ] `/forget` is an alias for `/newchat` with identical behavior
- [ ] `/memory` displays the 10 most recent memories with sector and salience values
- [ ] All commands check authorization before processing
- [ ] `convolife` (non-slash) triggers context window usage check
- [ ] `checkpoint` (non-slash) saves session summary to memory

**Complexity:** M
**Dependencies:** TELEGRAM-1, CORE-5, BRIDGE-2, MEMORY-1, SECURITY-1

---

### TELEGRAM-6: Multi-Message Response Delivery

**Title:** Send formatted, split, and redacted responses back to the user

**Acceptance Criteria:**
- [ ] Response text passed through `redactSecrets()` → `formatForTelegram()` → `splitMessage()`
- [ ] Each chunk sent via `ctx.reply(chunk, { parse_mode: 'HTML' })`
- [ ] If HTML parsing fails, retry with plain text (strip all tags)
- [ ] Telegram API errors (rate limits, timeouts) retried with exponential backoff (3 attempts)
- [ ] Send failures logged with chatId and message preview

**Complexity:** S
**Dependencies:** TELEGRAM-2, TELEGRAM-3, SECURITY-2

---

## Epic 4: MEMORY — Dual-Sector Memory System

Implement semantic + episodic memory with FTS5 full-text search, salience-weighted decay, and automatic context injection.

### MEMORY-1: Memory Context Builder

**Title:** Build memory context string from FTS5 search and recent memories

**Acceptance Criteria:**
- [ ] `buildMemoryContext(chatId, userMessage)` exported
- [ ] Sanitizes user message: strips non-alphanumeric, appends `*` for prefix matching
- [ ] FTS5 search returns top 3 relevant matches for the chat
- [ ] Recent fetch returns top 5 memories by `accessed_at DESC`
- [ ] Results deduplicated by `id`
- [ ] Each retrieved memory touched: `salience += 0.1` (capped at 5.0), `accessed_at` updated
- [ ] Output format: `[Memory context]\n- {content} ({sector})\n- ...`
- [ ] Returns empty string if no matches found
- [ ] Memory context build completes in < 100ms

**Complexity:** M
**Dependencies:** CORE-5

---

### MEMORY-2: Conversation Turn Persistence

**Title:** Automatically save conversation turns as memories with sector classification

**Acceptance Criteria:**
- [ ] `saveConversationTurn(chatId, userMsg, assistantMsg)` exported
- [ ] Messages ≤ 20 characters skipped
- [ ] Messages starting with `/` skipped
- [ ] Semantic signal detection: regex matches `\b(my|i am|i'm|i prefer|remember|always|never)\b` (case-insensitive)
- [ ] Classified as `semantic` if signal detected, `episodic` otherwise
- [ ] Both user message and assistant response saved as separate memory rows
- [ ] Initial salience set to 1.0
- [ ] Unit tests cover: short messages, slash commands, semantic signals, episodic default

**Complexity:** M
**Dependencies:** CORE-5

---

### MEMORY-3: Salience Decay Sweep

**Title:** Implement daily decay that fades stale memories and auto-deletes irrelevant ones

**Acceptance Criteria:**
- [ ] `runDecaySweep()` exported, returns `{ decayed: number, deleted: number }`
- [ ] Decay: `UPDATE memories SET salience = salience * 0.98 WHERE created_at < now - 86400`
- [ ] Delete: `DELETE FROM memories WHERE salience < 0.1`
- [ ] FTS5 triggers auto-clean the search index on delete
- [ ] Runs on startup and every 24 hours via `setInterval`
- [ ] Results logged at info level: "{N} decayed, {M} deleted"
- [ ] Configurable via `MEMORY_DECAY_RATE` and `MEMORY_MIN_SALIENCE`

**Complexity:** S
**Dependencies:** CORE-5

---

### MEMORY-4: Memory Display Command

**Title:** Show stored memories via the `/memory` Telegram command

**Acceptance Criteria:**
- [ ] `/memory` retrieves 10 most recent memories for the chat via `getMemoriesForDisplay()`
- [ ] Each memory displayed with: content (truncated to 100 chars), sector label, salience value
- [ ] Formatted as a readable list in Telegram
- [ ] If no memories exist, display "No memories stored yet"
- [ ] Per-user memory isolation: only the requesting user's memories shown

**Complexity:** S
**Dependencies:** CORE-5, TELEGRAM-5

---

### MEMORY-5: FTS5 Search Index Integrity

**Title:** Ensure FTS5 index stays in sync with memories table through triggers

**Acceptance Criteria:**
- [ ] `memories_ai` trigger: inserts into FTS5 after memory insert
- [ ] `memories_ad` trigger: deletes from FTS5 after memory delete
- [ ] `memories_au` trigger: re-indexes FTS5 after memory content update
- [ ] Integration test: insert → search finds it, delete → search doesn't find it, update → search finds new content
- [ ] FTS5 search handles special characters gracefully (no SQL errors from user input)
- [ ] Empty or whitespace-only search queries return empty results (no error)

**Complexity:** M
**Dependencies:** CORE-5

---

## Epic 5: MEDIA — Media Handling and Voice Processing

Handle voice notes (STT), photos, documents, video forwarding, and file lifecycle management.

### MEDIA-1: File Download and Management (`media.ts`)

**Title:** Download Telegram media files and manage upload directory lifecycle

**Acceptance Criteria:**
- [ ] `downloadMedia(botToken, fileId, originalFilename?)` downloads file from Telegram API
- [ ] Files saved to `workspace/uploads/{timestamp}_{sanitized_filename}`
- [ ] Filename sanitization: only `[a-zA-Z0-9._-]` allowed, rest replaced with `-`
- [ ] `workspace/uploads/` directory created on startup if missing
- [ ] `cleanupOldUploads(maxAgeMs?)` deletes files older than 24 hours (default)
- [ ] Download failures produce user-facing error messages (not crashes)
- [ ] Unit tests cover: filename sanitization, cleanup logic

**Complexity:** M
**Dependencies:** CORE-3, CORE-4

---

### MEDIA-2: Voice Transcription (STT via Groq Whisper)

**Title:** Transcribe Telegram voice notes using Groq Whisper API

**Acceptance Criteria:**
- [ ] `transcribeAudio(filePath)` exported, returns transcribed text
- [ ] Telegram `.oga` files renamed to `.ogg` before upload (same codec, different extension)
- [ ] Multipart/form-data POST to `https://api.groq.com/openai/v1/audio/transcriptions`
- [ ] Model: `whisper-large-v3`, Authorization: `Bearer {GROQ_API_KEY}`
- [ ] Transcribed text prefixed with `[Voice transcribed]:` before sending to Claude
- [ ] `forceVoiceReply` flag set when user sends voice note
- [ ] Transcription completes in < 3 seconds for 30-second clips
- [ ] Graceful error: "Could not transcribe voice" on failure

**Complexity:** M
**Dependencies:** CORE-3, MEDIA-1

---

### MEDIA-3: Photo and Document Handling

**Title:** Process forwarded photos and documents for Claude analysis

**Acceptance Criteria:**
- [ ] `bot.on('message:photo')` downloads highest-resolution photo, builds prompt message
- [ ] `buildPhotoMessage(localPath, caption?)` returns: "The user sent a photo. It's saved at {path}. {caption}"
- [ ] `bot.on('message:document')` downloads with original filename preserved
- [ ] `buildDocumentMessage(localPath, filename, caption?)` returns: "The user sent a document '{filename}'. It's saved at {path}. {caption}"
- [ ] Captions from Telegram messages included when present
- [ ] Downloaded file paths passed to `handleMessage()` for Claude processing
- [ ] Media download failures produce user-facing error messages

**Complexity:** M
**Dependencies:** MEDIA-1, TELEGRAM-1, BRIDGE-5

---

### MEDIA-4: Voice Reply Synthesis (TTS via ElevenLabs)

**Title:** Synthesize text-to-speech responses using ElevenLabs API

**Acceptance Criteria:**
- [ ] `synthesizeSpeech(text)` exported, returns MP3 Buffer
- [ ] POST to `https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}`
- [ ] Model: `eleven_turbo_v2_5`, voice settings: `stability: 0.5, similarity_boost: 0.75`
- [ ] `/voice` command toggles voice mode per chat (in-memory `Set<string>`)
- [ ] Voice notes always get audio replies regardless of voice toggle (`forceVoiceReply`)
- [ ] MP3 sent back as Telegram voice message
- [ ] Graceful fallback to text if TTS fails or API key not configured
- [ ] `voiceCapabilities()` returns booleans based on API key availability

**Complexity:** M
**Dependencies:** CORE-3, TELEGRAM-1, MEDIA-2

---

### MEDIA-5: Video Analysis Support

**Title:** Forward video files for Claude analysis via Gemini API

**Acceptance Criteria:**
- [ ] `bot.on('message:video')` downloads video to `workspace/uploads/`
- [ ] `buildVideoMessage(localPath, caption?)` returns prompt instructing Claude to use Gemini API
- [ ] `GOOGLE_API_KEY` available in `.env` for Claude's Gemini skill
- [ ] Supported formats: MP4, MOV, AVI, WebM
- [ ] Videos cleaned up after 24 hours via `cleanupOldUploads()`
- [ ] Unsupported format or missing API key returns informative error message

**Complexity:** S
**Dependencies:** MEDIA-1, TELEGRAM-1, BRIDGE-5

---

## Epic 6: SCHEDULER — Cron-Based Task Scheduling

Implement a polling-based scheduler that executes prompts autonomously on cron schedules and delivers results via Telegram.

### SCHEDULER-1: Scheduler Core (`scheduler.ts`)

**Title:** Implement polling loop that detects and executes due tasks

**Acceptance Criteria:**
- [ ] `initScheduler(send)` starts polling interval at `SCHEDULER_POLL_MS` (default 60s)
- [ ] `send` function abstracted from Telegram for testability
- [ ] `runDueTasks()` queries tasks where `status='active'` AND `next_run <= now`
- [ ] Each due task executed via `runAgent(task.prompt)` — no session, autonomous
- [ ] Task results sent to `task.chatId` via the `send` function
- [ ] `computeNextRun(cronExpression)` uses `cron-parser` to calculate next execution
- [ ] `updateTaskAfterRun(id, result, nextRun)` updates last_run, last_result, next_run
- [ ] Scheduler poll overhead < 5ms per cycle
- [ ] Index `(status, next_run)` used for efficient polling queries

**Complexity:** M
**Dependencies:** CORE-5, BRIDGE-1

---

### SCHEDULER-2: Task Lifecycle Management

**Title:** Create, pause, resume, and delete scheduled tasks

**Acceptance Criteria:**
- [ ] `createTask(id, chatId, prompt, schedule, nextRun)` inserts new task with `status='active'`
- [ ] `pauseTask(id)` sets `status='paused'` — task skipped during polling
- [ ] `resumeTask(id)` sets `status='active'` and recalculates `next_run`
- [ ] `deleteTask(id)` removes the task row entirely
- [ ] `listTasks(chatId?)` returns all tasks, optionally filtered by chat
- [ ] Task IDs generated as UUIDs
- [ ] Cron expressions validated before task creation (invalid cron returns helpful error)
- [ ] State transitions tested: active → paused → active, active → deleted

**Complexity:** M
**Dependencies:** CORE-5, SCHEDULER-1

---

### SCHEDULER-3: Scheduler CLI Tool (`schedule-cli.ts`)

**Title:** Command-line interface for managing scheduled tasks

**Acceptance Criteria:**
- [ ] CLI supports: `create "<prompt>" "<cron>" <chat_id>`, `list [--chat-id <id>]`, `delete <task_id>`, `pause <task_id>`, `resume <task_id>`
- [ ] Parses `process.argv` directly (no CLI framework dependency)
- [ ] Cron expressions validated before creation
- [ ] UUID generated for new task IDs
- [ ] Output formatted as ASCII table for `list` command
- [ ] Errors produce helpful messages with correct syntax examples

**Complexity:** S
**Dependencies:** SCHEDULER-2

---

### SCHEDULER-4: Telegram `/schedule` Command

**Title:** Manage scheduled tasks inline from Telegram

**Acceptance Criteria:**
- [ ] `/schedule list` shows all tasks for the chat with ID, prompt preview, cron, status, next run
- [ ] `/schedule create "<prompt>" "<cron>"` creates a new task for the chat
- [ ] `/schedule pause <id>` pauses a task
- [ ] `/schedule resume <id>` resumes a paused task
- [ ] `/schedule delete <id>` deletes a task with confirmation
- [ ] Invalid cron expressions return user-friendly error with syntax help
- [ ] All task operations scoped to the requesting chat ID

**Complexity:** M
**Dependencies:** SCHEDULER-2, TELEGRAM-1, SECURITY-1

---

### SCHEDULER-5: Task Error Handling and Notifications

**Title:** Handle task execution failures and send status notifications

**Acceptance Criteria:**
- [ ] Pre-execution notification: "Running: {prompt preview}..." sent to chat
- [ ] Successful results sent to `task.chatId` via Telegram
- [ ] On execution failure: error logged, failure notification sent to chat, `next_run` still advanced
- [ ] `last_result` stores either success response or error message
- [ ] Failed tasks remain active (not paused) — will retry on next schedule
- [ ] Task execution isolated: one task failure doesn't block other due tasks

**Complexity:** S
**Dependencies:** SCHEDULER-1, TELEGRAM-1

---

## Epic 7: SECURITY — Defense-in-Depth Security

Implement authentication, PID lock management, secret redaction, and process security hardening.

### SECURITY-1: Chat ID Authorization (`security.ts`)

**Title:** Enforce chat ID allowlist on every incoming message

**Acceptance Criteria:**
- [ ] `isAuthorised(chatId)` checks against `ALLOWED_CHAT_ID` and `ALLOWED_CHAT_IDS`
- [ ] String comparison used (Telegram chat IDs are numeric but compared as strings)
- [ ] Unauthorized messages silently dropped — no error response sent to attacker
- [ ] Unauthorized attempts logged at warn level with chat ID
- [ ] First-run mode: if no chat ID configured, accept first message and log the ID for configuration
- [ ] Authorization check runs before any processing (memory, agent, etc.)
- [ ] Unit tests cover: valid ID, invalid ID, first-run mode, multiple allowed IDs

**Complexity:** S
**Dependencies:** CORE-3, CORE-4

---

### SECURITY-2: Outbound Secret Redaction

**Title:** Scan and redact secrets from all outbound messages before sending

**Acceptance Criteria:**
- [ ] `redactSecrets(text)` exported
- [ ] Patterns detected: `sk-[a-zA-Z0-9]{20,}`, `ghp_[a-zA-Z0-9]{36}`, `xoxb-[0-9-]+`, `Bearer [token]`
- [ ] Generic patterns: `password\s*[:=]\s*\S+`, `token\s*[:=]\s*\S+`, `[A-Z_]{3,}=\S{10,}`
- [ ] All matches replaced with `[REDACTED]`
- [ ] Redaction applied to every outbound Telegram message
- [ ] Unit tests cover: all pattern types, no false positives on normal text, mixed content

**Complexity:** S
**Dependencies:** CORE-1

---

### SECURITY-3: PID Lock Management

**Title:** Prevent duplicate instances via PID lock file

**Acceptance Criteria:**
- [ ] `acquireLock()` writes `process.pid` to `store/aos.pid`
- [ ] If PID file exists and process is alive, kills old process via `SIGTERM`
- [ ] If PID file exists but process is dead (stale), overwrites the file
- [ ] `store/` directory created if it doesn't exist
- [ ] `releaseLock()` deletes `store/aos.pid` only if it contains current PID
- [ ] Lock acquired during startup, released during graceful shutdown
- [ ] SIGTERM/SIGINT handlers call `releaseLock()` before exit

**Complexity:** S
**Dependencies:** CORE-3

---

### SECURITY-4: Secure Environment Variable Handling

**Title:** Ensure secrets never leak to subprocesses or logs

**Acceptance Criteria:**
- [ ] All secrets read via `readEnvFile()` into local constants only
- [ ] `process.env` is never set with secret values — verified by test
- [ ] `.env` file permissions set to 600 (read/write owner only)
- [ ] `.env` listed in `.gitignore` — never committed
- [ ] Secret values never appear in log output (even at debug level)
- [ ] Child processes (Claude subprocess) do not inherit secrets via process.env

**Complexity:** S
**Dependencies:** CORE-2, CORE-3

---

### SECURITY-5: Graceful Shutdown and Signal Handling

**Title:** Clean shutdown on SIGTERM/SIGINT with resource cleanup

**Acceptance Criteria:**
- [ ] `SIGTERM` handler: log → stop scheduler → bot.stop → close DB → releaseLock → exit(0)
- [ ] `SIGINT` handler: identical to SIGTERM
- [ ] Double signal (Ctrl+C twice) forces immediate exit
- [ ] All resources released in correct order (no dangling connections)
- [ ] Shutdown logged at info level with uptime duration
- [ ] No orphaned PID file after shutdown

**Complexity:** S
**Dependencies:** SECURITY-3, CORE-5, TELEGRAM-1, SCHEDULER-1

---

### SECURITY-6: Input Sanitization and Shell Safety

**Title:** Prevent injection attacks from user input

**Acceptance Criteria:**
- [ ] User messages never interpolated into shell commands
- [ ] Media filenames sanitized: only `[a-zA-Z0-9._-]` characters
- [ ] FTS5 search input sanitized: stripped of non-alphanumeric except spaces
- [ ] Cron expressions validated before use in `cron-parser`
- [ ] SQL injection prevented by prepared statements (all queries parameterized)
- [ ] No `eval()`, `Function()`, or dynamic code execution on user input

**Complexity:** S
**Dependencies:** CORE-5, MEDIA-1

---

## Epic 8: DEPLOYMENT — Service, Setup, and Testing

Package AOS as a systemd service with an interactive setup wizard, CLI tools, health checks, and comprehensive test coverage.

### DEPLOYMENT-1: systemd Service Configuration

**Title:** Generate and install systemd service for auto-restart on crash

**Acceptance Criteria:**
- [ ] Service file template with: `Restart=always`, `RestartSec=5`, `Type=simple`
- [ ] Runs as the user (not root): `User=%u`
- [ ] Security hardening: `NoNewPrivileges=true`, `ProtectSystem=strict`, `ProtectHome=read-only`, `PrivateTmp=true`
- [ ] `ReadWritePaths` includes `store/` and `workspace/`
- [ ] Logs accessible via `journalctl --user -u aos`
- [ ] Service starts on boot via `WantedBy=default.target`
- [ ] `systemctl --user enable aos` and `systemctl --user start aos` work correctly

**Complexity:** M
**Dependencies:** CORE-6

---

### DEPLOYMENT-2: Interactive Setup Wizard (`scripts/setup.ts`)

**Title:** Guide new users through first-time configuration

**Acceptance Criteria:**
- [ ] Checks requirements: Node.js >= 20, `claude` CLI installed and authenticated
- [ ] Collects Telegram bot token (with validation)
- [ ] Collects optional API keys: Groq, ElevenLabs, Google
- [ ] Opens CLAUDE.md for personalization guidance
- [ ] Writes `.env` file with collected values
- [ ] Runs `tsc` to build TypeScript
- [ ] Installs systemd service file
- [ ] Guides user to get chat ID via first message and `/chatid`
- [ ] Total setup time < 10 minutes
- [ ] Prints next steps on completion

**Complexity:** M
**Dependencies:** CORE-3, DEPLOYMENT-1

---

### DEPLOYMENT-3: System Health Check (`scripts/status.ts`)

**Title:** Display service health, uptime, and key metrics

**Acceptance Criteria:**
- [ ] `aos status` shows: service state (running/stopped), uptime, PID, last restart time
- [ ] Shows database stats: session count, memory count, scheduled task count
- [ ] Shows configuration summary: which optional features are enabled (STT, TTS, video)
- [ ] Shows disk usage: database size, uploads directory size
- [ ] Exits with code 0 if healthy, 1 if issues detected

**Complexity:** S
**Dependencies:** CORE-5, SECURITY-3

---

### DEPLOYMENT-4: Test Suite Implementation

**Title:** Achieve > 80% test coverage across core modules

**Acceptance Criteria:**
- [ ] Unit tests: `env.test.ts`, `bot.test.ts` (formatter + splitter), `security.test.ts` (auth + redaction)
- [ ] Integration tests: `db.test.ts` (full CRUD + FTS5), `memory.test.ts` (build + save + decay), `scheduler.test.ts` (due detection + state transitions)
- [ ] Mock tests: `agent.test.ts` (SDK mocked), `voice.test.ts` (API mocked), `media.test.ts` (download mocked)
- [ ] Coverage thresholds enforced: statements 80%, branches 75%, functions 80%, lines 80%
- [ ] Tests run via `npm test` with no configuration required
- [ ] All tests pass in CI with in-memory SQLite (no file dependencies)

**Complexity:** L
**Dependencies:** All CORE, BRIDGE, TELEGRAM, MEMORY, MEDIA, SCHEDULER, SECURITY stories

---

### DEPLOYMENT-5: Build and Package Scripts

**Title:** Configure build pipeline and npm scripts

**Acceptance Criteria:**
- [ ] `npm run build` compiles TypeScript to `dist/` via `tsc`
- [ ] `npm run dev` runs in development mode via `tsx src/index.ts`
- [ ] `npm test` runs vitest with coverage
- [ ] `npm run setup` launches the setup wizard
- [ ] `npm start` runs the production build: `node dist/index.js`
- [ ] `npm run schedule` provides CLI access to scheduler management
- [ ] Build output is clean: no warnings, no `any` types in strict mode

**Complexity:** S
**Dependencies:** CORE-1

---

### DEPLOYMENT-6: .env.example and Documentation

**Title:** Provide configuration template and deployment documentation

**Acceptance Criteria:**
- [ ] `.env.example` contains every variable with inline documentation
- [ ] Required vs optional variables clearly marked
- [ ] Default values documented for all optional variables
- [ ] Links to API key acquisition pages (BotFather, Groq, ElevenLabs, Google AI Studio)
- [ ] Second-VPS deployment documented: only `.env`, `CLAUDE.md`, and `USER.md` differ between instances
- [ ] README includes: quick start, prerequisites, setup steps, command reference

**Complexity:** S
**Dependencies:** CORE-3

---

## Epic 9: EMPIRE — Multi-User, Company Routing, and Advanced Features

Enable empire-scale operations with company context routing, multi-user isolation, notification batching, and cross-company intelligence.

### EMPIRE-1: Multi-User Support

**Title:** Per-user session and memory isolation for shared VPS deployments

**Acceptance Criteria:**
- [ ] `ALLOWED_CHAT_IDS` env var accepts comma-separated list of chat IDs
- [ ] Each chat ID has its own session row in SQLite (sessions keyed by `chat_id`)
- [ ] Each chat ID has isolated memory namespace (memories keyed by `chat_id`)
- [ ] Scheduled tasks scoped to the creating user's `chat_id`
- [ ] Single `ALLOWED_CHAT_ID` is the default (multi-user is opt-in)
- [ ] No cross-user data leakage verified by integration test
- [ ] All queries include `WHERE chat_id = ?` clause

**Complexity:** M
**Dependencies:** CORE-5, SECURITY-1

---

### EMPIRE-2: Company Context Routing

**Title:** Route messages to company-specific CLAUDE.md overlays via `/company` command

**Acceptance Criteria:**
- [ ] Company registry loaded from `AGENTS.md` — maps company names to context directories
- [ ] `/company <name>` switches active context: `runAgent()` uses company's directory as `cwd`
- [ ] `/company list` shows all available company contexts
- [ ] `/company clear` returns to default personal context (AOS project root)
- [ ] Company-specific CLAUDE.md loaded when context is active
- [ ] Active company displayed in responses (e.g., `[Meridian]` prefix)
- [ ] Active company stored per-chat (in-memory map)

**Complexity:** L
**Dependencies:** BRIDGE-1, BRIDGE-3, TELEGRAM-5

---

### EMPIRE-3: Company Directory Structure

**Title:** Set up the empire directory layout for multi-company contexts

**Acceptance Criteria:**
- [ ] `~/empire/` base directory with subdirectories per company
- [ ] Each company directory contains: `CLAUDE.md` (personality overlay), `context.md` (knowledge base), `agents.md` (company-specific AI agents)
- [ ] Optional `INBOX.md` per company for async inter-company intelligence
- [ ] Template files provided for new company setup
- [ ] Company directories are independent — adding a company requires no code changes
- [ ] Documentation for adding a new company context

**Complexity:** S
**Dependencies:** EMPIRE-2

---

### EMPIRE-4: Notification Queue

**Title:** Three-tier priority batching for outbound notifications

**Acceptance Criteria:**
- [ ] `notification_queue` table with: `id`, `chat_id`, `content`, `priority` (critical/high/medium), `source`, `created_at`, `sent_at`
- [ ] Critical notifications sent immediately (bypass queue)
- [ ] High-priority notifications batched every 5 minutes
- [ ] Medium-priority notifications batched every 30 minutes
- [ ] Batch sender runs on interval, groups by priority, sends digest
- [ ] Batched messages include count and summary
- [ ] Index on `(priority, created_at) WHERE sent_at IS NULL` for efficient queries

**Complexity:** M
**Dependencies:** CORE-5, TELEGRAM-1

---

### EMPIRE-5: BI Council Nightly Briefing

**Title:** Aggregate cross-company intelligence into a nightly synthesis briefing

**Acceptance Criteria:**
- [ ] Scheduled task runs after business hours (configurable cron, default `0 22 * * *`)
- [ ] Reads `INBOX.md` from each company context directory
- [ ] Prompt instructs Claude to synthesize key metrics, alerts, and recommendations
- [ ] Produces a structured briefing sent as formatted Telegram message
- [ ] Briefing includes per-company summaries and cross-company patterns
- [ ] Task created during setup if empire routing is configured

**Complexity:** M
**Dependencies:** EMPIRE-2, EMPIRE-3, SCHEDULER-1

---

### EMPIRE-6: WhatsApp Bridge Foundation

**Title:** Basic WhatsApp message reading and notification via `wa-daemon`

**Acceptance Criteria:**
- [ ] Separate `wa-daemon` process using `whatsapp-web.js` with Puppeteer
- [ ] QR code authentication displayed on first run via `qrcode-terminal`
- [ ] `/wa` Telegram command lists recent WhatsApp chats with unread counts
- [ ] `/wa <contact>` shows recent messages from that contact
- [ ] Incoming WhatsApp messages trigger Telegram notification
- [ ] `wa_messages` and `wa_message_map` tables store history
- [ ] Reply queue via `wa_outbox` table: daemon picks up and sends

**Complexity:** L
**Dependencies:** CORE-5, TELEGRAM-5, SECURITY-1

---

---

## Dependency Graph Summary

```
CORE-1 ──┬── CORE-2 ── CORE-3 ──┬── CORE-4 ── CORE-5 ── CORE-6
          │                       │
          │                       ├── SECURITY-1, SECURITY-3, SECURITY-4
          │                       │
          │                       ├── BRIDGE-1 ──┬── BRIDGE-2 ── BRIDGE-3
          │                       │              │               BRIDGE-4
          │                       │              │               BRIDGE-5
          │                       │              │
          │                       │              ├── SCHEDULER-1 ── SCHEDULER-2 ── SCHEDULER-3
          │                       │              │                                  SCHEDULER-4
          │                       │              │                                  SCHEDULER-5
          │                       │              │
          │                       │              └── EMPIRE-2 ── EMPIRE-3 ── EMPIRE-5
          │                       │
          │                       └── MEDIA-1 ──┬── MEDIA-2 ── MEDIA-4
          │                                     ├── MEDIA-3
          │                                     └── MEDIA-5
          │
          ├── TELEGRAM-2, TELEGRAM-3
          └── SECURITY-2

TELEGRAM-1 ── TELEGRAM-4, TELEGRAM-5, TELEGRAM-6

MEMORY-1 ── MEMORY-2, MEMORY-3, MEMORY-4, MEMORY-5

DEPLOYMENT-1 ── DEPLOYMENT-2
DEPLOYMENT-3, DEPLOYMENT-5, DEPLOYMENT-6 (low dependencies)
DEPLOYMENT-4 (depends on all implementation stories)
```

---

## Complexity Summary

| Complexity | Count | Stories |
|------------|-------|---------|
| **S** | 25 | CORE-1/2/3/4, TELEGRAM-3/4/6, MEMORY-3/4, MEDIA-5, SCHEDULER-3/5, SECURITY-1/2/3/4/5/6, DEPLOYMENT-3/5/6, EMPIRE-3 |
| **M** | 23 | CORE-6, BRIDGE-1/4/5, TELEGRAM-2/5, MEMORY-1/2/5, MEDIA-1/2/3/4, SCHEDULER-1/2/4, DEPLOYMENT-1/2, EMPIRE-1/4/5, BRIDGE-2 |
| **L** | 4 | CORE-5, DEPLOYMENT-4, EMPIRE-2/6 |

**Total: 52 stories across 9 epics**

---

*End of Epics and Stories — AOS v1.0*
