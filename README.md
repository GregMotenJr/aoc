# AOS — Alfred Operating System

Personal AI assistant runtime that bridges Claude Code to Telegram via the Anthropic Agent SDK.

AOS spawns the real `claude` CLI as a subprocess — not an API wrapper. You get your full desktop Claude Code capabilities from your phone.

## Features

- **Full Claude Code access** — All skills, MCP servers, and tools available remotely
- **Session persistence** — Conversations continue across messages via SQLite
- **Dual-sector memory** — Semantic + episodic memory with FTS5 search and salience decay
- **Voice notes** — Speech-to-text via Groq Whisper, text-to-speech via ElevenLabs
- **Media handling** — Forward photos, documents, and videos for Claude to analyze
- **Scheduled tasks** — Cron-based autonomous task execution with auto-delivery
- **Security** — Chat ID allowlist, secret redaction, PID lock, systemd hardening

## Prerequisites

- Node.js >= 20
- Claude Code CLI installed and authenticated (`claude` command working)
- Telegram account (create a bot via [@BotFather](https://t.me/BotFather))

## Quick Start

```bash
# Clone and install
git clone <repo-url> aos
cd aos
npm install

# Interactive setup
npm run setup

# Or manual setup:
cp .env.example .env
# Edit .env with your tokens
npm run build
npm start
```

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
| `/schedule` | Manage scheduled tasks |
| `/backup` | Download database backup |
| `convolife` | Check context window usage |
| `checkpoint` | Save session summary to memory |

### CLI

| Command | Description |
|---------|-------------|
| `npm start` | Run the bot (production) |
| `npm run dev` | Run in development mode |
| `npm run setup` | Interactive setup wizard |
| `npm run status` | System health check |
| `npm run schedule` | Manage scheduled tasks via CLI |
| `npm test` | Run test suite |
| `npm run build` | Compile TypeScript |
| `npm run typecheck` | Type-check without emitting |

## Project Structure

```
src/
  index.ts       — Entry point, lifecycle management
  agent.ts       — Claude Code SDK wrapper
  bot.ts         — Telegram bot (Grammy) with all commands
  config.ts      — Typed configuration constants
  db.ts          — SQLite schema and query functions
  env.ts         — Safe .env parser (never pollutes process.env)
  logger.ts      — Pino structured logging
  media.ts       — File download and upload management
  memory.ts      — Dual-sector memory with FTS5 and decay
  scheduler.ts   — Cron-based task polling and execution
  schedule-cli.ts — CLI for scheduled task management
  security.ts    — Auth, secret redaction, PID lock
  voice.ts       — STT (Groq Whisper) and TTS (ElevenLabs)
scripts/
  setup.ts       — Interactive setup wizard
  status.ts      — System health check
  notify.sh      — Send Telegram message from shell
  heartbeat.sh   — Cron-based process monitor
```

## Configuration

Copy `.env.example` to `.env` and configure. Required variables:

- `TELEGRAM_BOT_TOKEN` — From [@BotFather](https://t.me/BotFather)
- `ALLOWED_CHAT_ID` — Your Telegram chat ID (send `/chatid` to get it)

Optional features enabled by additional API keys:

- `GROQ_API_KEY` — Voice transcription ([console.groq.com](https://console.groq.com))
- `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` — Voice replies ([elevenlabs.io](https://elevenlabs.io))
- `GOOGLE_API_KEY` — Video analysis ([aistudio.google.com](https://aistudio.google.com))

## Deployment

AOS runs as a systemd user service on Linux:

```bash
# Setup installs the service automatically
npm run setup

# Manual service management
systemctl --user start aos
systemctl --user stop aos
systemctl --user status aos
journalctl --user -u aos -f
```

Add heartbeat monitoring to crontab:

```bash
*/10 * * * * /path/to/aos/scripts/heartbeat.sh
```

## Second VPS Deployment

Only these files differ between instances:
- `.env` (tokens and API keys)
- `CLAUDE.md` (personality and context)

Everything else is identical.

## License

MIT
