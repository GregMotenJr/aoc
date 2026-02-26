# AOS — Alfred Operating System

Personal AI assistant runtime that bridges Claude Code to Telegram via the Anthropic Agent SDK.

AOS spawns the real `claude` CLI as a subprocess — not an API wrapper. You get your full desktop Claude Code capabilities from your phone.

## Features

- **Full Claude Code access** — All skills, MCP servers, and tools available remotely
- **Session persistence** — Conversations continue across messages via SQLite
- **Dual-sector memory** — Semantic + episodic memory with FTS5 search and salience decay
- **Voice notes** — Speech-to-text via Groq Whisper, text-to-speech via ElevenLabs
- **Media handling** — Photos, documents, and videos forwarded to Claude for analysis
- **Scheduled tasks** — Cron-based autonomous task execution with delivery and auto-disable on repeated failure
- **Security** — Chat ID allowlist, outbound secret redaction, PID lock, OS-level service hardening

## Prerequisites

- Node.js >= 20
- Claude Code CLI installed and authenticated (`claude` command available)
- Telegram bot token (create via [@BotFather](https://t.me/BotFather))

## Quick Start

**One-command install — works on Windows, macOS, and Linux:**

```bash
# Linux / macOS / WSL
curl -fsSL https://raw.githubusercontent.com/GregMotenJr/aoc/dev/install.sh | bash

# Windows (PowerShell)
irm https://raw.githubusercontent.com/GregMotenJr/aoc/dev/install.ps1 | iex
```

Then from **any terminal** (after restart):

```bash
# Start the bot
aos start

# Send /chatid to your bot on Telegram
# Copy the ID and set it in ~/.env (or %LOCALAPPDATA%\Programs\AOS\.env on Windows)
# ALLOWED_CHAT_ID=<your_chat_id>

# Restart
aos stop && aos start

# Check status
aos status

# View live logs
aos logs

# Update to latest
aos update
```

That's it. The installer handles everything:
- ✓ Dependencies check (Node.js, npm, Claude CLI)
- ✓ Fixed install location (`~/.local/share/aos` on Linux/macOS, `%LOCALAPPDATA%\Programs\AOS` on Windows)
- ✓ Global `aos` command in PATH
- ✓ `.env` setup with Telegram token
- ✓ TypeScript build
- ✓ Ready to run

### Alternative: npm install

```bash
npm install -g alfred-os
aos init my-assistant
cd my-assistant
aos start
```

### Alternative: Manual setup

```bash
git clone --branch dev https://github.com/GregMotenJr/aoc.git aos
cd aos
./install.sh              # Linux/macOS
# OR
powershell -File install.ps1  # Windows
```

## Configuration

Copy `.env.example` to `.env` and fill in your values. Required:

| Variable | Description |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Bot token from [@BotFather](https://t.me/BotFather) |
| `ALLOWED_CHAT_ID` | Your Telegram chat ID (send `/chatid` to the bot to get it) |

Optional features enabled by additional API keys:

| Variable | Feature |
|----------|---------|
| `GROQ_API_KEY` | Voice transcription via Whisper ([console.groq.com](https://console.groq.com)) |
| `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` | Voice replies ([elevenlabs.io](https://elevenlabs.io)) |
| `GOOGLE_API_KEY` | Video analysis via Gemini ([aistudio.google.com](https://aistudio.google.com)) |

Advanced tuning (all optional with sensible defaults):

| Variable | Default | Description |
|----------|---------|-------------|
| `ALLOWED_CHAT_IDS` | — | Comma-separated additional chat IDs for multi-user |
| `WORKSPACE_DIR` | project root | Directory where `CLAUDE.md` lives |
| `LOG_LEVEL` | `info` | `trace`, `debug`, `info`, `warn`, `error`, `fatal` |
| `SCHEDULER_POLL_INTERVAL` | `60000` | Task poll interval in ms |
| `MEMORY_DECAY_RATE` | `0.98` | Daily salience multiplier (0–1) |
| `MEMORY_MIN_SALIENCE` | `0.1` | Threshold below which memories are auto-deleted |
| `MAX_MEMORY_RESULTS` | `8` | Max memories injected per message context |

## Commands

### Global CLI (`aos` command)

Available from any terminal once installed:

| Command | Description |
|---------|-------------|
| `aos start` | Start the bot (background process) |
| `aos stop` | Stop the running bot |
| `aos status` | Show PID + last 10 log lines |
| `aos logs` | Tail live logs (follow mode) |
| `aos update` | Git pull + rebuild + restart |
| `aos init [dir]` | Create a new AOS project (interactive setup) |
| `aos help` | Show command help |

### Telegram Commands

Inside Telegram, send these to your bot:

| Command | Description |
|---------|-------------|
| `/start` | Show greeting and available commands |
| `/chatid` | Echo your Telegram chat ID |
| `/newchat` | Clear session, start fresh conversation |
| `/forget` | Alias for `/newchat` |
| `/memory` | View stored memories with salience scores |
| `/voice` | Toggle voice reply mode |
| `/schedule` | Manage scheduled tasks (create, list, pause, resume, delete) |
| `/backup` | Download SQLite database backup |

### npm Scripts (for development)

When inside the project directory:

| Command | Description |
|---------|-------------|
| `npm start` | Run the bot (production mode) |
| `npm run dev` | Run in development mode (pretty logs) |
| `npm run build` | Compile TypeScript |
| `npm run typecheck` | Type-check without emitting |
| `npm run status` | System health check |
| `npm run schedule` | Manage scheduled tasks via CLI |
| `npm test` | Run test suite (70 tests) |

## Architecture

```
install.sh             One-command installer — Linux, macOS, WSL (deps, config, build, service)
install.ps1            One-command installer — Windows native (deps, config, build, Task Scheduler)

src/
├── cli.ts             CLI entry point (aos init / aos start / aos status)
├── index.ts           Entry point + lifecycle (signal handling, graceful shutdown)
├── agent.ts           Claude Code SDK wrapper (query, session resume, usage tracking)
├── bot.ts             Telegram bot (grammY) — commands, media handlers, Markdown→HTML formatter
├── config.ts          Typed configuration from .env (paths, keys, tuning constants)
├── db.ts              SQLite schema + CRUD (sessions, memories w/ FTS5, scheduled tasks)
├── env.ts             Safe .env parser (never pollutes process.env)
├── logger.ts          Pino structured logging (pretty in dev, JSON in prod)
├── media.ts           Telegram file download, upload cleanup, message builders
├── memory.ts          Dual-sector memory engine (semantic/episodic, FTS5 search, salience decay)
├── scheduler.ts       Cron-based task polling with 3-strike auto-disable
├── schedule-cli.ts    CLI interface for scheduled task management
├── security.ts        Chat ID auth, outbound secret redaction, PID lock
└── voice.ts           STT (Groq Whisper) + TTS (ElevenLabs)

scripts/
├── setup.ts           Interactive setup wizard (used by installers)
├── status.ts          System health check (Node, Claude CLI, .env, DB, process)
├── heartbeat.sh       Process monitor with auto-restart (Linux/macOS — cron)
├── heartbeat.ps1      Process monitor with auto-restart (Windows — Task Scheduler)
└── notify.sh          Send Telegram messages from shell scripts
```

## Memory System

AOS uses a dual-sector memory model inspired by cognitive architecture:

- **Semantic memories** — Long-term facts and preferences (triggered by signals like "I prefer", "always", "never")
- **Episodic memories** — Conversation context and events

Memories are automatically:
- **Saved** from each conversation turn
- **Retrieved** via FTS5 full-text search + recency ranking
- **Boosted** when accessed (salience increases by 0.1, capped at 5.0)
- **Decayed** daily (configurable rate, default 2%/day)
- **Pruned** when salience drops below minimum threshold

## Deployment

The installer sets up the right background service for your platform automatically.

### Linux — systemd

```bash
systemctl --user start aos
systemctl --user stop aos
systemctl --user status aos
journalctl --user -u aos -f
```

Heartbeat (add to crontab for auto-restart on crash):
```bash
*/10 * * * * /path/to/aos/scripts/heartbeat.sh
```

### macOS — launchd

```bash
launchctl start com.aos.bot
launchctl stop com.aos.bot
# Logs
tail -f /path/to/aos/store/aos.log
```

Heartbeat runs via crontab (added automatically by the installer).

### Windows — Task Scheduler

```powershell
Start-ScheduledTask  -TaskName "AOS-Alfred"
Stop-ScheduledTask   -TaskName "AOS-Alfred"
# Logs (replace C:\path\to\aos with your actual install directory)
Get-Content "C:\path\to\aos\store\aos.log" -Wait
```

Heartbeat runs as a separate scheduled task (`AOS-Heartbeat`, every 10 min).

### Multi-instance

Deploy to multiple machines with different personalities. Only these files differ:
- `.env` — Tokens and API keys
- `CLAUDE.md` — Personality and context

Everything else is identical.

## Security

- **Chat ID allowlist** — Only configured users can interact with the bot
- **First-run mode** — Accepts all chats when no `ALLOWED_CHAT_ID` is set (for initial `/chatid` discovery)
- **Secret redaction** — API keys, tokens, and passwords are automatically stripped from outbound messages
- **PID lock** — Prevents duplicate instances; auto-kills stale processes
- **Service hardening** — Linux: `NoNewPrivileges`, `ProtectSystem=strict`, `PrivateTmp` via systemd; macOS: sandboxed launchd agent; Windows: elevated Task Scheduler with restricted scope

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide — branching, Conventional Commits, PR process, and how to cut a release.

**Quick rules:**
- All work goes through a PR (`dev → main`)
- PR titles must follow [Conventional Commits](https://www.conventionalcommits.org/) (CI enforces this)
- `feat` → minor bump · `fix` / `perf` → patch bump · `feat!` / `BREAKING CHANGE` → major bump

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for the full version history.

## License

MIT
