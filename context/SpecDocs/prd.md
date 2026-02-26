# Product Requirements Document — AOS (AlfredOS)

**Version:** 1.0
**Author:** PM Agent (BMAD Method)
**Date:** 2026-02-25
**Status:** Draft

---

## 1. Executive Summary

AOS (AlfredOS) is a security-first personal AI assistant runtime that bridges Claude Code to Telegram via Anthropic's official Agent SDK. It replaces brittle third-party wrappers (OpenClaw, NanoClaw) with a thin, direct connection to the `claude` CLI — giving users their full desktop AI capabilities from their phone.

AOS is not a chatbot wrapper or API proxy. It spawns the real `claude` process as a subprocess, with full tool access, skills, MCP servers, and session persistence. The phone is a remote control; Claude Code is the brain.

### 1.1 Problem Statement

Current AI assistant platforms are architecturally fragile:

- **Token management fragility**: Systems like OpenClaw extract OAuth tokens and manage auth separately from the Claude CLI, violating ToS and creating constant token rotation failures.
- **Abstraction layer decay**: Each wrapper layer (gateway, session manager, prompt router) is another failure point. Daily restarts and cascading auth failures are the norm.
- **Dual maintenance burden**: Desktop skills must be replicated on the assistant side. Improving one doesn't improve the other.
- **Operational instability**: Non-technical users cannot maintain these systems. A system that breaks daily is not a system — it's a project.

AOS solves these by using Claude Code AS the brain via Anthropic's own Agent SDK, eliminating token management, removing abstraction layers, and creating a single-improvement path.

### 1.2 Vision

A personal AI assistant that:
- Runs as a background service on a Linux VPS
- Receives messages via Telegram
- Routes them to the real Claude Code CLI with full tool access
- Returns results with memory, scheduling, and media handling
- Requires < 10 minutes to set up and < 1 unplanned restart per week

---

## 2. Target Users

### 2.1 Primary: Greg Moten

- **Profile**: Power user running a multi-company empire with 4 AI company presidents, 28+ scheduled jobs, and cross-company intelligence flows.
- **Needs**: Stability above all else. Reliable scheduled tasks. Empire-aware context routing. Mobile access to full Claude Code capabilities.
- **Pain points**: Daily OpenClaw restarts, token rotation failures, session drops mid-conversation, inability to route to company-specific contexts.
- **Usage pattern**: 50-100 messages/day, 28 scheduled jobs, voice notes while driving, document forwarding, multi-company context switches.

### 2.2 Secondary: Bridget (Greg's girlfriend)

- **Profile**: Non-technical user with her own VPS instance.
- **Needs**: A personal assistant that doesn't break. Simple interaction model. No maintenance burden.
- **Pain points**: Cannot troubleshoot technical failures. Needs complete isolation from Greg's instance.
- **Usage pattern**: 10-20 messages/day, occasional voice notes, basic task requests.

### 2.3 Tertiary: Technical Early Adopters

- **Profile**: Developers who want a self-hosted AI assistant leveraging their existing Claude Code setup.
- **Needs**: Clean codebase, easy deployment, extensible architecture.
- **Usage pattern**: Variable. Will customize CLAUDE.md, add skills, modify scheduling.

---

## 3. Functional Requirements

### 3.1 P0 — Must Have (MVP)

#### FR-001: Telegram Bot Bridge

**Description**: Send and receive messages via a Telegram bot using the Grammy framework.

**User Stories**:
- US-001: As a user, I can send a text message to my Telegram bot and receive a response from Claude Code, so that I can access my AI assistant from my phone.
- US-002: As a user, I can see a typing indicator while Claude is processing my message, so that I know my message was received.
- US-003: As a user, I can receive long responses split across multiple messages, so that Telegram's 4096-character limit doesn't truncate my content.
- US-004: As a user, I can use `/newchat` to start a fresh conversation, so that I can reset context when switching topics.
- US-005: As a user, I can use `/chatid` to discover my Telegram chat ID, so that I can configure the allowlist.
- US-006: As a user, I can use `/start` to receive a greeting and usage instructions, so that I know how to interact with the bot.

**Acceptance Criteria**:
- [ ] Bot connects to Telegram via Grammy and responds to text messages
- [ ] Typing indicator refreshes every 4 seconds while Claude processes
- [ ] Messages exceeding 4096 characters are split on newline boundaries
- [ ] Markdown from Claude is converted to Telegram-compatible HTML
- [ ] `/newchat` clears the session ID for the chat and confirms
- [ ] `/chatid` echoes the numeric chat ID
- [ ] `/start` sends a greeting with available commands
- [ ] Invalid HTML in formatted output does not crash the bot
- [ ] Bot recovers gracefully from Telegram API errors (network timeouts, rate limits)

#### FR-002: Claude Code Subprocess via Agent SDK

**Description**: Spawn the real `claude` CLI as a subprocess using `@anthropic-ai/claude-agent-sdk`, with full tool access and session persistence.

**User Stories**:
- US-007: As a user, I can send a message and have it processed by the real Claude Code CLI, so that all my desktop skills, MCP servers, and tools are available.
- US-008: As a user, my conversation context persists across messages within a session, so that I don't have to repeat myself.
- US-009: As a user, I can start a new session to get a fresh context window when needed.

**Acceptance Criteria**:
- [ ] `runAgent()` spawns Claude Code via `query()` from `@anthropic-ai/claude-agent-sdk`
- [ ] `permissionMode: 'bypassPermissions'` is set (no terminal approval prompts)
- [ ] `settingSources: ['project', 'user']` loads CLAUDE.md and global skills
- [ ] `cwd` is set to project root so workspace files are accessible
- [ ] `resume: sessionId` enables conversation continuation
- [ ] New session IDs are captured from `system.init` events and stored in SQLite
- [ ] Response text is extracted from `result` events
- [ ] `onTyping` callback is invoked every 4 seconds during processing
- [ ] Function returns `{ text: string | null, newSessionId?: string }`
- [ ] Errors in the subprocess are caught, logged, and returned as user-facing error messages

#### FR-003: Session Persistence

**Description**: Every Telegram chat maps to a Claude Code session ID stored in SQLite. Messages continue the same conversation thread.

**User Stories**:
- US-010: As a user, when I send multiple messages, they are part of the same conversation thread, so Claude remembers what we discussed.
- US-011: As a user, when I use `/newchat`, my next message starts a completely fresh session.

**Acceptance Criteria**:
- [ ] `sessions` table stores `chat_id` → `session_id` mapping
- [ ] Session ID is retrieved before each `runAgent()` call
- [ ] New session ID from `runAgent()` response updates the database
- [ ] `/newchat` deletes the session row for the chat
- [ ] Session table uses `chat_id` as primary key with `updated_at` timestamp

#### FR-004: Memory System (Dual-Sector with Decay)

**Description**: Semantic + episodic dual-sector memory stored in SQLite with FTS5 full-text search. Memories are injected as context before each message. Salience-weighted decay ensures relevant memories persist while stale ones fade.

**User Stories**:
- US-012: As a user, when I tell the assistant something personal (preferences, projects, contacts), it remembers across sessions.
- US-013: As a user, relevant past context is automatically surfaced when I discuss related topics.
- US-014: As a user, I can view my stored memories with `/memory` to see what the assistant remembers.
- US-015: As a user, stale memories fade over time while frequently accessed memories stay strong.
- US-016: As a user, I can use `/forget` to clear my session and start fresh.

**Acceptance Criteria**:
- [ ] `memories` table with columns: `id`, `chat_id`, `topic_key`, `content`, `sector` (semantic/episodic), `salience`, `created_at`, `accessed_at`
- [ ] FTS5 virtual table `memories_fts` mirrors `content` with INSERT/UPDATE/DELETE triggers
- [ ] `buildMemoryContext()` performs FTS5 search on user message, retrieves top 3 matches + 5 most recent, deduplicates, touches salience
- [ ] `saveConversationTurn()` detects semantic signals (`my`, `I am`, `I prefer`, `remember`, `always`, `never`) and classifies accordingly
- [ ] Messages ≤ 20 chars or starting with `/` are not saved as memories
- [ ] `runDecaySweep()` applies 2% daily decay and deletes memories with salience < 0.1
- [ ] Decay sweep runs on startup and every 24 hours
- [ ] Memory context is prepended to user messages as `[Memory context]\n- {content} ({sector})\n...`
- [ ] `/memory` command displays the 10 most recent memories with sector and salience
- [ ] Per-user memory isolation when multi-user is enabled

#### FR-005: Media Handling

**Description**: Handle voice notes (STT), photos, documents, and optionally video forwarded via Telegram.

**User Stories**:
- US-017: As a user, I can send a voice note and have it transcribed and processed as a text message.
- US-018: As a user, I can forward a photo with an optional caption and have Claude analyze it.
- US-019: As a user, I can forward a document (PDF, text, code) and have Claude read and respond to it.
- US-020: As a user, voice responses are automatically returned as audio when I send a voice note.

**Acceptance Criteria**:
- [ ] Voice notes (`.oga`) are downloaded, renamed to `.ogg`, and transcribed via Groq Whisper API
- [ ] Transcribed text is prefixed with `[Voice transcribed]:` and sent to Claude
- [ ] `forceVoiceReply` is set when user sends a voice note (reply is audio if TTS enabled)
- [ ] Photos are downloaded to `workspace/uploads/`, path is included in message to Claude
- [ ] Documents are downloaded with original filename preserved, path + filename included in message
- [ ] Filenames are sanitized: only `[a-zA-Z0-9._-]` characters, rest replaced with `-`
- [ ] Uploaded files are cleaned up after 24 hours
- [ ] Media download failures produce user-facing error messages
- [ ] `workspace/uploads/` directory is created on startup if it doesn't exist

#### FR-006: Scheduler

**Description**: Cron-based task scheduling system. A polling loop checks SQLite every 60 seconds for due tasks and executes them autonomously via Claude Code.

**User Stories**:
- US-021: As a user, I can create scheduled tasks that run prompts on a cron schedule (e.g., daily briefings at 9 AM).
- US-022: As a user, I can list all my scheduled tasks and their status.
- US-023: As a user, I can pause and resume individual scheduled tasks.
- US-024: As a user, I can delete scheduled tasks I no longer need.
- US-025: As a user, scheduled task results are sent to my Telegram chat automatically.
- US-026: As a user, I can manage scheduled tasks from within Telegram via the `/schedule` command.

**Acceptance Criteria**:
- [ ] `scheduled_tasks` table with columns: `id`, `chat_id`, `prompt`, `schedule` (cron expression), `next_run`, `last_run`, `last_result`, `status`, `created_at`
- [ ] Scheduler polls every 60 seconds for tasks where `status='active'` AND `next_run <= now`
- [ ] Due tasks execute via `runAgent(task.prompt)` autonomously (no session, no user message)
- [ ] Task results are sent to the configured `chat_id` via Telegram
- [ ] `computeNextRun()` uses `cron-parser` to calculate next execution time
- [ ] CLI tool (`schedule-cli.ts`) supports: `create`, `list`, `delete`, `pause`, `resume`
- [ ] Telegram `/schedule` command supports inline task management
- [ ] Index on `(status, next_run)` for efficient polling queries
- [ ] Must support these job types: work polls, morning briefings, deal scans, nightly reflections, autonomous agent runs

#### FR-007: Background Service

**Description**: AOS runs as a systemd service on Linux with auto-restart on crash.

**User Stories**:
- US-027: As a user, AOS starts automatically when my VPS boots.
- US-028: As a user, if AOS crashes, it restarts automatically within seconds.
- US-029: As a user, I can check the service status with standard system tools.

**Acceptance Criteria**:
- [ ] systemd service file generated during setup
- [ ] Service configured with `Restart=always` and `RestartSec=5`
- [ ] Service runs as the user (not root)
- [ ] Logs are accessible via `journalctl`
- [ ] `aos status` shows service health, uptime, and last restart
- [ ] PID lock file prevents duplicate instances

#### FR-008: Security — Core

**Description**: Defense-in-depth security model with multiple layers of protection.

**User Stories**:
- US-030: As a user, only my authorized Telegram chat IDs can interact with the bot.
- US-031: As a user, the bot only listens on loopback (no external network exposure).
- US-032: As a user, if I accidentally start two instances, the old one is killed cleanly.
- US-033: As a user, sensitive data (API keys, tokens) is never leaked in outbound messages.

**Acceptance Criteria**:
- [ ] Chat ID allowlist enforced on every incoming message
- [ ] Unauthorized messages are silently dropped (no error response to attacker)
- [ ] PID lock file (`store/aos.pid`) prevents duplicate instances
- [ ] Old instance is killed before new one starts
- [ ] Outbound message content is scanned for potential secret patterns and redacted
- [ ] `.env` file is never committed to git (in `.gitignore`)
- [ ] `process.env` is never polluted with secrets from `.env`
- [ ] All secrets read via `readEnvFile()` into local variables only

#### FR-009: CLAUDE.md Integration

**Description**: AOS loads personality, context, and behavioral rules from `CLAUDE.md`, `USER.md`, and `AGENTS.md` files instead of a generic `CLAUDE.md`.

**User Stories**:
- US-034: As a user, my assistant's personality is defined in `CLAUDE.md` which Claude loads on every session start.
- US-035: As a user, my personal context (who I am, my companies, my preferences) is loaded from `USER.md`.
- US-036: As a user, AI agent definitions and routing rules are loaded from `AGENTS.md`.

**Acceptance Criteria**:
- [ ] `CLAUDE.md` contains personality traits, communication rules, and behavioral guidelines
- [ ] `USER.md` contains user profile, company info, project context
- [ ] `AGENTS.md` contains AI agent definitions (company presidents, specialists)
- [ ] Claude Code SDK `cwd` points to the workspace containing these files
- [ ] `settingSources: ['project', 'user']` loads the workspace CLAUDE.md as project settings
- [ ] Changes to CLAUDE.md take effect on the next message (no restart required)

### 3.2 P1 — Should Have

#### FR-010: Voice Replies (TTS)

**Description**: Text-to-speech synthesis via ElevenLabs, allowing the bot to reply with audio messages.

**User Stories**:
- US-037: As a user, I can toggle voice reply mode with `/voice` so the bot responds with audio.
- US-038: As a user, when I send a voice note, the reply is always audio (regardless of voice mode toggle).

**Acceptance Criteria**:
- [ ] `/voice` toggles voice mode per chat (in-memory `Set<string>`)
- [ ] When voice mode is on, Claude's text response is synthesized via ElevenLabs API
- [ ] MP3 audio is sent back as a Telegram voice message
- [ ] Voice notes always get audio replies (`forceVoiceReply`)
- [ ] ElevenLabs model: `eleven_turbo_v2_5`
- [ ] Voice settings: `stability: 0.5, similarity_boost: 0.75`
- [ ] Graceful fallback to text if TTS fails

#### FR-011: Video Analysis

**Description**: Forward video files for Claude to analyze via the Gemini API.

**User Stories**:
- US-039: As a user, I can forward a video to the bot and receive an AI analysis of its contents.

**Acceptance Criteria**:
- [ ] Video files are downloaded to `workspace/uploads/`
- [ ] Message to Claude includes the video path and instructs use of Gemini API
- [ ] `GOOGLE_API_KEY` from `.env` is available for the analysis
- [ ] Supported formats: MP4, MOV, AVI, WebM
- [ ] Videos cleaned up after 24 hours

#### FR-012: Empire Routing

**Description**: Route messages to different company contexts based on commands or keywords. Allows switching between company-specific AI presidents and contexts.

**User Stories**:
- US-040: As a user, I can use `/company <name>` to switch the assistant's context to a specific company.
- US-041: As a user, the assistant can detect company-related keywords and suggest context switches.
- US-042: As a user, each company context has its own CLAUDE.md overlay with company-specific knowledge.

**Acceptance Criteria**:
- [ ] Company registry in `AGENTS.md` maps company names to context directories
- [ ] `/company` command switches the active context
- [ ] Company-specific CLAUDE.md overrides are loaded when context is active
- [ ] Active company context is displayed in responses (e.g., `[Meridian]` prefix)
- [ ] `/company list` shows all available company contexts
- [ ] `/company clear` returns to default personal context

#### FR-013: Multi-User Support

**Description**: Per-user session and memory isolation for shared VPS deployments (e.g., Bridget's instance).

**User Stories**:
- US-043: As a VPS admin, I can configure multiple allowed chat IDs, each with isolated sessions and memories.
- US-044: As a secondary user, my conversations and memories are completely separate from the primary user's.

**Acceptance Criteria**:
- [ ] `ALLOWED_CHAT_IDS` env var accepts comma-separated list
- [ ] Each chat ID has its own session row in SQLite
- [ ] Each chat ID has isolated memory namespace (memories keyed by `chat_id`)
- [ ] Scheduled tasks are scoped to the creating user's chat ID
- [ ] Multi-user mode is opt-in (single `ALLOWED_CHAT_ID` is default)
- [ ] No cross-user data leakage in any query

#### FR-014: Notification Queue

**Description**: Three-tier priority batching for outbound notifications to avoid message spam.

**User Stories**:
- US-045: As a user, critical notifications (errors, urgent tasks) are sent immediately.
- US-046: As a user, high-priority notifications are batched and sent every 5 minutes.
- US-047: As a user, medium-priority notifications are batched and sent every 30 minutes.

**Acceptance Criteria**:
- [ ] Three tiers: Critical (immediate), High (5-min batch), Medium (30-min batch)
- [ ] Notifications queue in SQLite with priority and timestamp
- [ ] Batch sender runs on interval, groups notifications by priority
- [ ] Batched messages include count and summary
- [ ] Critical notifications bypass the queue entirely

### 3.3 P2 — Nice to Have

#### FR-015: WhatsApp Bridge

**Description**: Read and reply to WhatsApp messages from within Telegram via a separate `wa-daemon` process using `whatsapp-web.js`.

**User Stories**:
- US-048: As a user, I can use `/wa` to list recent WhatsApp conversations.
- US-049: As a user, I can read and reply to WhatsApp messages from Telegram.
- US-050: As a user, I receive notifications in Telegram when new WhatsApp messages arrive.

**Acceptance Criteria**:
- [ ] Separate `wa-daemon` process runs `whatsapp-web.js` with Puppeteer
- [ ] QR code authentication on first run
- [ ] `/wa` lists recent chats with unread counts
- [ ] `/wa <contact>` shows recent messages from that contact
- [ ] Replies queue in `wa_outbox` SQLite table, daemon picks up and sends
- [ ] Incoming messages trigger Telegram notification
- [ ] `wa_messages` and `wa_message_map` tables for message history

#### FR-016: Personal CRM

**Description**: SQLite-based contact database with relationship scoring and interaction tracking.

**User Stories**:
- US-051: As a user, the assistant tracks my contacts, their companies, and last interaction dates.
- US-052: As a user, I can ask "who haven't I talked to in a month?" and get a prioritized list.

**Acceptance Criteria**:
- [ ] `contacts` table with name, company, relationship score, last interaction, notes
- [ ] Relationship score decays over time without interaction
- [ ] Natural language queries for contact lookup
- [ ] Integration with scheduled "relationship maintenance" reminders

#### FR-017: BI Council

**Description**: Nightly multi-source synthesis briefing aggregating intelligence from all company contexts.

**User Stories**:
- US-053: As a user, I receive a nightly synthesis briefing combining insights from all my company contexts.

**Acceptance Criteria**:
- [ ] Scheduled task that runs after business hours
- [ ] Aggregates data from all company contexts
- [ ] Produces a structured briefing with key metrics, alerts, and recommendations
- [ ] Sent as a formatted Telegram message

---

## 4. Non-Functional Requirements

### 4.1 Stability

| ID | Requirement | Target | Measurement |
|----|-------------|--------|-------------|
| NFR-001 | Unplanned restarts | < 1 per week | systemd restart count |
| NFR-002 | Message delivery success rate | > 99.5% | Logged send failures |
| NFR-003 | Session persistence | 100% across restarts | SQLite durability |
| NFR-004 | Graceful shutdown | Clean on SIGTERM/SIGINT | PID lock release |
| NFR-005 | Crash recovery | Auto-restart within 5s | systemd RestartSec |
| NFR-006 | Memory leak prevention | Stable RSS over 7 days | Process monitoring |

### 4.2 Security

| ID | Requirement | Target | Measurement |
|----|-------------|--------|-------------|
| NFR-007 | Authentication bypass | Zero unauthorized messages processed | Audit log |
| NFR-008 | Secret exposure | Zero secrets in outbound messages | Redaction tests |
| NFR-009 | Network exposure | Loopback only (127.0.0.1) | Port scan |
| NFR-010 | File permissions | 600 on .env, 700 on store/ | Setup wizard checks |
| NFR-011 | Duplicate instance | PID lock prevents all duplicates | Integration test |
| NFR-012 | Dependency supply chain | Lockfile pinning, audit on install | npm audit |

### 4.3 Performance

| ID | Requirement | Target | Measurement |
|----|-------------|--------|-------------|
| NFR-013 | Time to typing indicator | < 2 seconds | Timestamp diff |
| NFR-014 | Time to first response byte | < 5 seconds | Timestamp diff |
| NFR-015 | Memory context build | < 100ms | Profiling |
| NFR-016 | SQLite query latency | < 10ms for all queries | WAL mode |
| NFR-017 | Voice transcription | < 3 seconds for 30s clip | Groq API |
| NFR-018 | Scheduler poll overhead | < 5ms per cycle | Profiling |

### 4.4 Portability

| ID | Requirement | Target | Measurement |
|----|-------------|--------|-------------|
| NFR-019 | OS support | Ubuntu 22.04+, macOS 13+ | CI matrix |
| NFR-020 | Node.js version | 20+ | Engine check |
| NFR-021 | Setup time | < 10 minutes from clone | User testing |
| NFR-022 | Config-only deployment | New VPS with only .env changes | Deployment test |
| NFR-023 | No external DB | SQLite only, no Postgres/Redis | Architecture |
| NFR-024 | No Docker requirement | Runs directly on host OS | Verified |

### 4.5 Maintainability

| ID | Requirement | Target | Measurement |
|----|-------------|--------|-------------|
| NFR-025 | TypeScript strict mode | Zero `any` types in production | tsc --noEmit |
| NFR-026 | Structured logging | All operations logged via pino | Log review |
| NFR-027 | Error categorization | All errors classified and handled | Code review |
| NFR-028 | Test coverage | > 80% for core modules | Vitest coverage |

---

## 5. API and Integration Specifications

### 5.1 Claude Code Agent SDK

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk'

// Core invocation
const events = query({
  prompt: userMessage,
  cwd: PROJECT_ROOT,
  resume: sessionId,           // undefined for new sessions
  permissionMode: 'bypassPermissions',
  settingSources: ['project', 'user'],
})

// Event types to handle:
// - { type: 'system', subtype: 'init', sessionId: string }
// - { type: 'result', result: { result: string } }
```

**Key behaviors**:
- `cwd` determines which `CLAUDE.md` / `CLAUDE.md` is loaded
- `resume` must be the exact session ID string from a previous run
- `settingSources: ['project']` loads workspace config; `['user']` loads `~/.claude/` skills
- `permissionMode: 'bypassPermissions'` is required — without it Claude hangs waiting for approval

### 5.2 Telegram Bot API (via Grammy)

```typescript
import { Bot, Context } from 'grammy'

const bot = new Bot(TELEGRAM_BOT_TOKEN)

// Outbound message format: HTML parse mode
await ctx.reply(htmlContent, { parse_mode: 'HTML' })

// Typing indicator
await ctx.api.sendChatAction(chatId, 'typing')

// File download
const file = await ctx.getFile()
const url = `https://api.telegram.org/file/bot${token}/${file.file_path}`
```

**HTML subset supported**: `<b>`, `<i>`, `<code>`, `<pre>`, `<s>`, `<a>`, `<u>`

**Limits**:
- Max message length: 4096 characters
- Typing indicator expiry: ~5 seconds
- File download: up to 20 MB

### 5.3 Groq Whisper API (STT)

```
POST https://api.groq.com/openai/v1/audio/transcriptions
Authorization: Bearer {GROQ_API_KEY}
Content-Type: multipart/form-data

Fields:
  file: (binary .ogg file)
  model: whisper-large-v3
  response_format: json
```

**Note**: Telegram sends `.oga` files. Must rename to `.ogg` before upload (same format, different extension).

### 5.4 ElevenLabs TTS API

```
POST https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}
xi-api-key: {ELEVENLABS_API_KEY}
Content-Type: application/json

Body:
{
  "text": "response text",
  "model_id": "eleven_turbo_v2_5",
  "voice_settings": {
    "stability": 0.5,
    "similarity_boost": 0.75
  }
}

Response: audio/mpeg (MP3 binary)
```

### 5.5 Gemini API (Video Analysis)

```
POST https://generativelanguage.googleapis.com/v1beta/models/gemini-pro-vision:generateContent
Authorization: Bearer {GOOGLE_API_KEY}
```

Used indirectly — Claude Code invokes its Gemini skill with the video file path. AOS only needs to download the video and pass the path.

---

## 6. Data Model

### 6.1 Database Overview

SQLite with WAL mode. Single database file at `store/aos.db`. All tables use INTEGER timestamps (Unix epoch seconds).

### 6.2 Core Tables

#### sessions

```sql
CREATE TABLE IF NOT EXISTS sessions (
  chat_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
```

**Purpose**: Maps each Telegram chat to a Claude Code session ID for conversation continuity.

**Operations**:
- `getSession(chatId)` → `session_id | null`
- `setSession(chatId, sessionId)` → upsert
- `clearSession(chatId)` → delete row

#### memories

```sql
CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  topic_key TEXT,
  content TEXT NOT NULL,
  sector TEXT NOT NULL CHECK(sector IN ('semantic', 'episodic')),
  salience REAL NOT NULL DEFAULT 1.0,
  created_at INTEGER NOT NULL,
  accessed_at INTEGER NOT NULL
);

CREATE INDEX idx_memories_chat ON memories(chat_id);
CREATE INDEX idx_memories_sector ON memories(chat_id, sector);
CREATE INDEX idx_memories_salience ON memories(salience);
```

**Purpose**: Dual-sector memory with salience-weighted decay.

**Operations**:
- `searchMemories(chatId, query)` → FTS5 search, top 3 results
- `getRecentMemories(chatId, limit)` → most recently accessed
- `saveMemory(chatId, content, sector, topicKey?)` → insert
- `touchMemory(id)` → update `accessed_at`, increment salience by 0.1 (cap at 5.0)
- `decayMemories()` → multiply salience by 0.98, delete below 0.1
- `getMemoriesForDisplay(chatId, limit)` → for `/memory` command

#### memories_fts (FTS5 Virtual Table)

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
  content,
  content_rowid=id
);

-- Sync triggers
CREATE TRIGGER memories_ai AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts(rowid, content) VALUES (new.id, new.content);
END;

CREATE TRIGGER memories_ad AFTER DELETE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, content) VALUES ('delete', old.id, old.content);
END;

CREATE TRIGGER memories_au AFTER UPDATE OF content ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, content) VALUES ('delete', old.id, old.content);
  INSERT INTO memories_fts(rowid, content) VALUES (new.id, new.content);
END;
```

**Purpose**: Full-text search index on memory content for semantic recall.

#### scheduled_tasks

```sql
CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  prompt TEXT NOT NULL,
  schedule TEXT NOT NULL,
  next_run INTEGER NOT NULL,
  last_run INTEGER,
  last_result TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'paused')),
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_tasks_due ON scheduled_tasks(status, next_run);
```

**Purpose**: Cron-scheduled autonomous task execution.

**Operations**:
- `createTask(id, chatId, prompt, schedule, nextRun)` → insert
- `getDueTasks()` → `SELECT ... WHERE status='active' AND next_run <= ?`
- `updateTaskAfterRun(id, lastResult, nextRun)` → update run times and result
- `pauseTask(id)` / `resumeTask(id)` → toggle status
- `deleteTask(id)` → remove
- `listTasks(chatId?)` → all tasks, optionally filtered by chat

### 6.3 P2 Tables (WhatsApp)

#### wa_outbox

```sql
CREATE TABLE IF NOT EXISTS wa_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipient TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'sent', 'failed')),
  created_at INTEGER NOT NULL,
  sent_at INTEGER
);
```

#### wa_messages

```sql
CREATE TABLE IF NOT EXISTS wa_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_jid TEXT NOT NULL,
  sender TEXT NOT NULL,
  content TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  is_from_me INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_wa_messages_chat ON wa_messages(chat_jid, timestamp);
```

#### wa_message_map

```sql
CREATE TABLE IF NOT EXISTS wa_message_map (
  telegram_msg_id TEXT PRIMARY KEY,
  wa_chat_jid TEXT NOT NULL,
  wa_msg_id TEXT
);
```

---

## 7. Error Handling Requirements

### 7.1 Error Categories

| Category | Examples | Handling Strategy |
|----------|----------|-------------------|
| **Auth errors** | Invalid bot token, expired session | Log, notify user with setup instructions, halt |
| **Network errors** | Telegram API timeout, Groq unreachable | Retry with exponential backoff (3 attempts), then error message |
| **Processing errors** | Claude timeout, memory build failure | Return user-friendly error, log full stack trace |
| **Resource errors** | Disk full, SQLite locked | Log critical, send alert to admin chat, graceful degrade |
| **Input errors** | Invalid cron expression, unknown command | Return helpful error message with correct syntax |
| **Security errors** | Unauthorized chat ID, secret detected in output | Silent drop (auth), redact and warn (secrets) |

### 7.2 Error Response Format

All user-facing errors follow this pattern:

```
⚠ [Brief description]
[One-line suggestion to resolve]
```

Example:
```
⚠ Voice transcription failed
Check that your GROQ_API_KEY is set in .env — get one free at console.groq.com
```

### 7.3 Error Logging

All errors are logged via pino with:
- `level`: error or fatal
- `err`: full error object with stack trace
- `context`: relevant metadata (chatId, command, sessionId)
- `category`: one of the categories above

### 7.4 Recovery Patterns

| Failure | Recovery |
|---------|----------|
| Claude subprocess crash | Return error message, session remains valid for next message |
| SQLite corruption | WAL mode prevents most corruption. Backup db on startup. |
| Telegram connection drop | Grammy auto-reconnects. Log reconnection events. |
| Memory search failure | Degrade gracefully — send message without memory context |
| Scheduler task failure | Log error, send failure notification, advance to next_run |
| PID lock stale | Kill stale process, acquire new lock |

---

## 8. Security Requirements (Detailed)

### 8.1 Authentication and Authorization

| ID | Requirement | Implementation |
|----|-------------|----------------|
| SEC-001 | Chat ID allowlist | Every incoming message checked against `ALLOWED_CHAT_ID` or `ALLOWED_CHAT_IDS` |
| SEC-002 | First-run mode | If no chat ID configured, accept first message and log the ID for configuration |
| SEC-003 | Silent rejection | Unauthorized messages are dropped silently — no response to potential attackers |
| SEC-004 | Per-user isolation | Multi-user mode enforces complete data isolation by chat_id |

### 8.2 Secret Management

| ID | Requirement | Implementation |
|----|-------------|----------------|
| SEC-005 | No process.env pollution | All secrets read via `readEnvFile()` into local constants |
| SEC-006 | Outbound redaction | Scan outbound messages for patterns matching API keys, tokens, passwords |
| SEC-007 | .env protection | File permissions 600, excluded from git, never logged |
| SEC-008 | No token management | AOS never reads, rotates, or manages Claude API tokens — uses `claude login` auth |

### 8.3 Redaction Patterns

Outbound messages are scanned for these patterns before sending:

```
- API key patterns: sk-[a-zA-Z0-9]{20,}, ghp_[a-zA-Z0-9]{36}, xoxb-[0-9-]+
- Generic secrets: password\s*[:=]\s*\S+, token\s*[:=]\s*\S+
- Environment variables: [A-Z_]{3,}=\S{10,}
- Bearer tokens: Bearer\s+[a-zA-Z0-9._-]{20,}
```

Detected patterns are replaced with `[REDACTED]`.

### 8.4 Network Security

| ID | Requirement | Implementation |
|----|-------------|----------------|
| SEC-009 | Loopback binding | Bot process binds only to 127.0.0.1 (no external listeners) |
| SEC-010 | No open ports | AOS opens zero server ports — all communication is outbound to Telegram API |
| SEC-011 | HTTPS only | All external API calls use HTTPS |
| SEC-012 | No untrusted input in shell | User messages are never interpolated into shell commands |

### 8.5 Process Security

| ID | Requirement | Implementation |
|----|-------------|----------------|
| SEC-013 | PID lock | `store/aos.pid` prevents duplicate instances |
| SEC-014 | Stale PID cleanup | On startup, check if PID is alive; kill if stale |
| SEC-015 | Graceful shutdown | SIGTERM/SIGINT handlers release lock, close DB, stop bot |
| SEC-016 | systemd hardening | `NoNewPrivileges=true`, `ProtectSystem=strict`, `PrivateTmp=true` |

### 8.6 Data Security

| ID | Requirement | Implementation |
|----|-------------|----------------|
| SEC-017 | SQLite WAL mode | Prevents corruption from crashes during writes |
| SEC-018 | Upload cleanup | Temporary media files deleted after 24 hours |
| SEC-019 | No cloud storage | All data stays on the local filesystem |
| SEC-020 | Backup strategy | SQLite backup on startup to `store/aos.db.bak` |

---

## 9. Configuration Management

### 9.1 Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes | — | Bot token from @BotFather |
| `ALLOWED_CHAT_ID` | Yes* | — | Primary authorized Telegram chat ID |
| `ALLOWED_CHAT_IDS` | No | — | Comma-separated list for multi-user |
| `GROQ_API_KEY` | Yes (for STT) | — | Groq Whisper API key |
| `ELEVENLABS_API_KEY` | No | — | ElevenLabs TTS API key |
| `ELEVENLABS_VOICE_ID` | No | — | ElevenLabs voice ID |
| `GOOGLE_API_KEY` | No | — | Gemini API key for video analysis |
| `LOG_LEVEL` | No | `info` | Pino log level |
| `NODE_ENV` | No | `development` | Environment (production disables pretty logging) |
| `WORKSPACE_DIR` | No | `.` | Path to workspace containing CLAUDE.md |
| `AOS_DB_PATH` | No | `store/aos.db` | Custom database path |
| `SCHEDULER_POLL_INTERVAL` | No | `60000` | Scheduler poll interval in ms |
| `MEMORY_DECAY_RATE` | No | `0.98` | Daily memory salience decay multiplier |
| `MEMORY_MIN_SALIENCE` | No | `0.1` | Minimum salience before auto-delete |
| `MAX_MEMORY_RESULTS` | No | `8` | Max memory results per context build |

*Required after first-run mode completes.

### 9.2 Configuration Files

| File | Purpose | Loaded By |
|------|---------|-----------|
| `.env` | Runtime secrets and config | `readEnvFile()` in `config.ts` |
| `CLAUDE.md` | Assistant personality and rules | Claude Code SDK (via `cwd`) |
| `USER.md` | User profile and context | Claude Code SDK (via `cwd`) |
| `AGENTS.md` | AI agent definitions | Claude Code SDK (via `cwd`) |
| `package.json` | Project metadata and scripts | Node.js |
| `tsconfig.json` | TypeScript configuration | `tsc` |

---

## 10. Command Reference

### 10.1 Telegram Commands

| Command | Description | Priority |
|---------|-------------|----------|
| `/start` | Show greeting and usage instructions | P0 |
| `/chatid` | Echo the current chat ID | P0 |
| `/newchat` | Clear session, start fresh conversation | P0 |
| `/forget` | Alias for `/newchat` | P0 |
| `/memory` | Display recent stored memories | P0 |
| `/voice` | Toggle voice reply mode | P1 |
| `/schedule` | Manage scheduled tasks inline | P0 |
| `/company <name>` | Switch to company context | P1 |
| `/company list` | List available company contexts | P1 |
| `/company clear` | Return to default context | P1 |
| `/wa` | List recent WhatsApp chats | P2 |
| `/wa <contact>` | Show messages from contact | P2 |
| `convolife` | Check context window usage | P0 |
| `checkpoint` | Save session summary to memory | P0 |

### 10.2 CLI Commands

| Command | Description |
|---------|-------------|
| `aos setup` | Run interactive setup wizard |
| `aos start` | Start the bot (foreground) |
| `aos status` | Show system health and status |
| `aos schedule create "<prompt>" "<cron>" <chat_id>` | Create scheduled task |
| `aos schedule list` | List all scheduled tasks |
| `aos schedule delete <id>` | Delete a scheduled task |
| `aos schedule pause <id>` | Pause a scheduled task |
| `aos schedule resume <id>` | Resume a paused task |

---

## 11. Success Metrics

| Metric | Target | Current (OpenClaw) | Measurement |
|--------|--------|-------------------|-------------|
| Unplanned restarts | < 1/week | ~7/week (daily) | systemd logs |
| Message-to-typing latency | < 2 seconds | 3-5 seconds | Timestamps |
| Message-to-response latency | < 5 seconds (first token) | 8-15 seconds | Timestamps |
| Setup time | < 10 minutes | 45+ minutes | User testing |
| Second VPS deployment | Config changes only | Full rebuild | Deployment test |
| Token management overhead | Zero | 30% of failures | Error logs |
| Scheduled task reliability | > 99% | ~85% | Task completion rate |
| Memory recall accuracy | > 80% relevant | N/A | User feedback |

---

## 12. Out of Scope (Explicit Non-Goals)

1. **Web UI** — AOS is Telegram-first. No web dashboard.
2. **Multi-model support** — Claude Code only. No OpenAI, Gemini, or local models as primary brain.
3. **Plugin marketplace** — Skills are Claude Code skills. No AOS-specific plugin system.
4. **End-to-end encryption** — Telegram's transport encryption is sufficient for personal use.
5. **Horizontal scaling** — Single instance per user. No load balancing or clustering.
6. **Mobile app** — Telegram IS the mobile app.
7. **OAuth/OIDC** — No web authentication. Chat ID allowlist is sufficient.
8. **Rate limiting** — Single user, trusted environment. No rate limiting needed.
9. **Internationalization** — English only for MVP.
10. **Analytics dashboard** — Logs and `/status` command are sufficient.

---

## 13. Dependencies and Constraints

### 13.1 Hard Dependencies

| Dependency | Version | Purpose | Risk |
|------------|---------|---------|------|
| Node.js | >= 20.0 | Runtime | Low — LTS |
| `@anthropic-ai/claude-agent-sdk` | latest | Claude Code subprocess | Medium — new SDK |
| `better-sqlite3` | >= 9.0 | Database | Low — mature |
| `grammy` | >= 1.20 | Telegram bot framework | Low — mature |
| `pino` | >= 8.0 | Structured logging | Low — mature |
| `cron-parser` | >= 4.0 | Cron expression parsing | Low — stable |

### 13.2 Optional Dependencies

| Dependency | Version | Feature | Required When |
|------------|---------|---------|---------------|
| `openai` | >= 4.0 | STT via OpenAI Whisper | STT provider = OpenAI |
| `whatsapp-web.js` | >= 1.23 | WhatsApp bridge | WhatsApp feature enabled |
| `qrcode-terminal` | >= 0.12 | WhatsApp QR display | WhatsApp feature enabled |

### 13.3 External Service Dependencies

| Service | Feature | Fallback |
|---------|---------|----------|
| Telegram Bot API | Core messaging | None — required |
| Claude Code CLI | Core AI processing | None — required |
| Groq API | Voice transcription | OpenAI Whisper |
| ElevenLabs API | Voice replies | Text-only replies |
| Gemini API | Video analysis | Skip video analysis |

---

## 14. Risk Assessment

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Claude Agent SDK breaking changes | High | Medium | Pin version, test on update |
| Telegram API rate limiting | Medium | Low | Exponential backoff, message batching |
| SQLite corruption | High | Very Low | WAL mode, startup backup |
| Groq API outage | Low | Low | Graceful degrade to text-only |
| Claude Code subscription changes | High | Low | Monitor Anthropic announcements |
| Memory consuming too much context | Medium | Medium | Cap memory injection at 2000 chars |
| Session ID format changes | Medium | Low | Treat as opaque string |
| systemd service permissions | Low | Medium | Setup wizard validates |

---

## 15. Glossary

| Term | Definition |
|------|-----------|
| **AOS** | AlfredOS — the project name |
| **Agent SDK** | `@anthropic-ai/claude-agent-sdk` — Anthropic's official SDK for spawning Claude Code subprocesses |
| **CLAUDE.md** | Personality and behavioral rules file loaded by Claude Code |
| **USER.md** | User profile and personal context file |
| **AGENTS.md** | AI agent definitions for empire routing |
| **Grammy** | TypeScript Telegram bot framework |
| **WAL mode** | Write-Ahead Logging — SQLite mode that improves concurrency and crash resilience |
| **FTS5** | SQLite Full-Text Search version 5 — used for semantic memory search |
| **Salience** | Memory importance score (0.0 to 5.0) that decays over time |
| **Empire** | Greg's multi-company structure with AI presidents |
| **Session resumption** | Claude Code feature that continues a conversation from a previous session ID |
| **PID lock** | Process ID file that prevents duplicate instances |
| **Redaction** | Scanning outbound messages for secrets and replacing with `[REDACTED]` |
| **STT** | Speech-to-Text (voice note transcription) |
| **TTS** | Text-to-Speech (voice reply synthesis) |

---

*End of PRD — AOS v1.0*
