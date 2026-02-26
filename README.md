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
- **Security** — Chat ID allowlist, outbound secret redaction, PID lock, systemd hardening

## Prerequisites

- Node.js >= 20
- Claude Code CLI installed and authenticated (`claude` command available)
- Telegram bot token (create via [@BotFather](https://t.me/BotFather))

## Quick Start

**Linux / macOS / WSL:**
```bash
curl -fsSL https://raw.githubusercontent.com/GregMotenJr/aoc/master/install.sh | bash
```

**Windows (PowerShell — run as Administrator for background service):**
```powershell
irm https://raw.githubusercontent.com/GregMotenJr/aoc/master/install.ps1 | iex
```

**From a cloned repo:**
```bash
# Linux / macOS / WSL
./install.sh

# Windows
powershell -ExecutionPolicy Bypass -File install.ps1
```

That's it. The installer handles dependencies, `.env` setup, TypeScript build, and background service registration automatically for your platform.

That's it. The installer walks you through everything — dependencies, Telegram bot setup, API keys, building, and background service installation.

### Alternative install methods

```bash
# Install globally for the `aos` command
npm install -g alfred-os
aos init my-assistant
cd my-assistant
aos start

# Or clone the repo directly
git clone https://github.com/GregMotenJr/aoc.git aos
cd aos
./install.sh
```

<details>
<summary>Manual setup (advanced)</summary>

```bash
git clone https://github.com/GregMotenJr/aoc.git aos
cd aos
npm install
cp .env.example .env
# Edit .env with your tokens
npm run build
npm start
```
</details>

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

### Telegram

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

### CLI

| Command | Description |
|---------|-------------|
| `aos init [dir]` | Create a new AOS project (interactive setup) |
| `aos start` | Start the bot (from project directory) |
| `aos status` | Health check (from project directory) |
| `npm start` | Run the bot (production) |
| `npm run dev` | Run in development mode (pretty logs) |
| `npm run status` | System health check |
| `npm run schedule` | Manage scheduled tasks via CLI |
| `npm test` | Run test suite (70 tests) |
| `npm run build` | Compile TypeScript |
| `npm run typecheck` | Type-check without emitting |

## Architecture

```
install.sh             One-command installer (deps, config, build, service)

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
├── setup.ts           Interactive setup wizard (used by install.sh)
├── status.ts          System health check (Node, Claude CLI, .env, DB, process)
├── heartbeat.sh       Cron-based process monitor with auto-restart
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

### systemd (recommended)

The setup wizard installs a systemd user service automatically:

```bash
systemctl --user start aos
systemctl --user stop aos
systemctl --user status aos
journalctl --user -u aos -f
```

### Heartbeat monitoring

Add to crontab for automatic restart on crash:

```bash
*/10 * * * * /path/to/aos/scripts/heartbeat.sh
```

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
- **systemd hardening** — `NoNewPrivileges`, `ProtectSystem=strict`, `PrivateTmp`

## License

MIT
