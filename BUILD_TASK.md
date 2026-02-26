# AOS Build Task

Build the AOS project from the spec docs. This is a TypeScript project using the Anthropic Agent SDK.

## Instructions

1. Read ALL files in `context/SpecDocs/` — especially:
   - `prd.md` (requirements)
   - `architecture.md` (component design, schemas, data flow)
   - `epics-and-stories.md` (stories with acceptance criteria)
   - `review-changes.md` (final adjustments — these override the other docs)
   - `reference-mega-prompt.md` (original ClaudeClaw spec — use as implementation reference)

2. Build in dependency order per the epics:
   - CORE (scaffold, env, config, logger, db, index)
   - BRIDGE (agent.ts, session persistence)
   - TELEGRAM (bot.ts, formatter, splitting, typing, commands)
   - MEMORY (memory.ts — semantic/episodic, FTS5, decay, context injection)
   - MEDIA (media.ts, voice.ts — download, STT, TTS)
   - SCHEDULER (scheduler.ts, schedule-cli.ts)
   - SECURITY (security.ts — auth, redaction, PID lock)
   - DEPLOYMENT (setup wizard, status script, notify.sh, systemd unit)

3. Key requirements:
   - Use `CLAUDE.md` (not SOUL.md) — standard Claude Code convention
   - Use `fileURLToPath(import.meta.url)` everywhere for paths
   - Never pollute `process.env` — secrets via `readEnvFile()` only
   - All SQLite in WAL mode with prepared statements
   - FTS5 virtual table with sync triggers for memory search
   - `bypassPermissions` mode for Agent SDK (required for unattended use)
   - Grammy for Telegram, pino for logging, better-sqlite3 for DB
   - `aos` CLI command via package.json bin entry
   - systemd service file generated during `aos init`

4. Create these additional files from review-changes.md:
   - Heartbeat monitor script
   - /backup command in bot
   - 3-strike auto-disable in scheduler
   - Context window tracking in agent.ts

5. Write tests for: env.ts, db.ts, memory.ts, security.ts, bot formatter

6. Final checklist:
   - `npm install` succeeds
   - `npm run build` compiles cleanly
   - `npm run typecheck` passes
   - All test files created
   - `.env.example` fully documented
   - README.md exists
   - CLAUDE.md template exists

When completely finished, run: openclaw system event --text "AOS build complete — all files written, compiled, tests created" --mode now
