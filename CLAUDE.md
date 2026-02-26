# AOS — Project Intelligence

You are building AOS (Alfred Operating System), a personal AI assistant runtime.

## What This Project Is
AOS bridges Claude Code to Telegram via the Anthropic Agent SDK. It spawns the real `claude` CLI as a subprocess — not an API wrapper. Users get their full desktop Claude Code capabilities from their phone.

## Architecture
- TypeScript (ES2022, NodeNext modules)
- SQLite with WAL mode (better-sqlite3)
- Grammy for Telegram
- @anthropic-ai/claude-agent-sdk for Claude subprocess
- Pino for structured logging
- systemd for Linux service management

## Build Rules
1. Read `context/SpecDocs/` before writing code — specs are authoritative
2. Follow the dependency graph in `context/SpecDocs/epics-and-stories.md`
3. Every file has ONE responsibility — keep modules thin
4. Never pollute `process.env` — use `readEnvFile()` for secrets
5. Use `fileURLToPath(import.meta.url)` for path resolution — never `.pathname`
6. All SQLite queries use prepared statements
7. Every external call has error handling with graceful fallback
8. No dependencies beyond what's in package.json — no sneaking in extras

## File Structure
```
src/
  index.ts       — entry point, lifecycle
  agent.ts       — Claude Code SDK wrapper
  bot.ts         — Telegram bot (Grammy)
  config.ts      — env constants
  db.ts          — SQLite schema + queries
  env.ts         — safe .env parser
  logger.ts      — pino setup
  media.ts       — file download, photo/doc builders
  memory.ts      — dual-sector memory with FTS5
  scheduler.ts   — cron task polling
  schedule-cli.ts — CLI task management
  security.ts    — auth, redaction, PID lock
  voice.ts       — STT (Groq) + TTS (ElevenLabs)
```

## Testing
- Vitest for unit and integration tests
- Test `env.ts`, `db.ts`, `memory.ts`, `security.ts`, formatter in `bot.ts`
- In-memory SQLite for DB tests
- Do NOT test Claude Code subprocess directly — mock `runAgent()`
