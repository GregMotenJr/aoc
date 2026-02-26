# Product Brief — AOS (AlfredOS)

## Vision Statement
AOS is a stable, security-first personal AI assistant runtime that bridges Claude Code to messaging platforms (Telegram, SMS, etc.) via Anthropic's official Agent SDK. It replaces brittle third-party wrappers with a thin, direct connection to the Claude Code CLI — giving users their full desktop AI capabilities from their phone.

## Problem Statement
Current AI assistant platforms (OpenClaw, NanoClaw, etc.) are architecturally fragile:
- They extract OAuth tokens and manage auth separately from the Claude CLI — violating ToS and creating constant token rotation failures
- They build abstraction layers over Claude Code instead of using it directly — each layer is another failure point
- They require dual maintenance: desktop skills AND assistant-side replicas
- Daily restarts, cascading auth failures, and gateway crashes are common
- Non-technical users cannot maintain them

AOS solves this by using Claude Code AS the brain (not wrapping around it) via Anthropic's own Agent SDK.

## Target Users
1. **Primary: Greg Moten** — Power user running a multi-company empire with 4 AI company presidents, 28 scheduled jobs, and cross-company intelligence. Needs stability above all else.
2. **Secondary: Greg's girlfriend (Bridget)** — Non-technical user with her own VPS. Needs a personal assistant that doesn't break daily.
3. **Tertiary: Technical early adopters** — Developers who want a self-hosted AI assistant that leverages their existing Claude Code setup.

## Core Principles
1. **Stability over features** — A working assistant that does 10 things reliably beats one that does 50 things and breaks daily
2. **Security first** — Loopback binding, token auth, outbound redaction, no external attack surface
3. **Claude Code native** — The `claude` CLI IS the brain. AOS is just the bridge. No reimplementing what Claude Code already does.
4. **Portable** — Same codebase deploys to any Linux VPS or Mac with `aos setup`
5. **One system** — Improve Claude Code skills → AOS gets better automatically. No dual maintenance.

## What AOS Is NOT
- NOT a chatbot wrapper around an API
- NOT a reimplementation of Claude Code capabilities
- NOT dependent on third-party auth token extraction
- NOT a framework that requires weekly maintenance to keep running

## Key Features (MVP)

### Must Have (P0)
- **Telegram bridge** — Send/receive messages via Telegram bot
- **Claude Code subprocess** — Agent SDK spawns real `claude` CLI with full tool access
- **Session persistence** — SQLite-backed session resumption per chat
- **Memory system** — Semantic + episodic dual-sector memory with decay
- **Media handling** — Voice notes (STT), photos, documents
- **Scheduler** — Cron-based task scheduling (briefings, work polls, autonomous tasks)
- **Background service** — systemd service with auto-restart
- **Security** — Chat ID allowlist, loopback binding, PID lock, outbound redaction
- **SOUL.md integration** — Loads personality/context from workspace files instead of generic CLAUDE.md

### Should Have (P1)
- **Voice replies** — TTS via ElevenLabs or Groq
- **Video analysis** — Forward video for Claude to interpret (via Gemini API)
- **Empire routing** — Route messages to different company contexts based on commands or keywords
- **Multi-user** — Per-user session and memory isolation (for Bridget's VPS)
- **Notification queue** — Three-tier priority batching (Critical/High/Medium)

### Nice to Have (P2)
- **WhatsApp bridge** — Read/reply to WhatsApp from Telegram
- **Personal CRM** — SQLite contact database with relationship scoring
- **BI Council** — Nightly multi-source synthesis briefing

## Technical Constraints
- **Runtime:** Node.js 20+ (TypeScript compiled to JS)
- **Database:** SQLite with WAL mode (no external database dependencies)
- **AI Backend:** Claude Code CLI via `@anthropic-ai/claude-agent-sdk`
- **Auth:** Claude Code's own auth (OAuth via `claude login`) — AOS never touches tokens directly
- **Hosting:** Linux VPS (Ubuntu 22.04+) or macOS
- **Messaging:** Grammy (Telegram), extensible to Discord/iMessage
- **Process management:** systemd (Linux), launchd (macOS)

## Success Metrics
- **Stability:** < 1 unplanned restart per week (vs OpenClaw's daily restarts)
- **Latency:** < 5 seconds from message sent to "typing..." indicator
- **Setup time:** < 10 minutes from clone to running bot
- **Portability:** Deploy to a second VPS with only config changes
- **Zero token management:** AOS never reads, rotates, or manages API tokens

## Prior Art / Reference
- **ClaudeClaw by Mark Kashef** — The original concept and mega prompt (900-line TypeScript spec). AOS is based on this architecture with empire-specific customizations.
- **OpenClaw** — The incumbent. Good concept, brittle implementation. AOS keeps the good ideas (crons, memory, multi-channel) and discards the fragile ones (token management, gateway complexity, session layer).
- **Matthew Berman's 25 Use Cases** — Notification queue, BI council, CRM patterns that will be integrated into AOS P1/P2.

## Stakeholders
- **Greg Moten** — Product owner, primary user, funds the infrastructure
- **Alfred (AI)** — Chief of Staff, co-designer, builds and maintains the system
- **Bridget** — Secondary user, portability validation

## Timeline
- **Week 1:** MVP (P0) — Telegram bridge, Claude Code subprocess, memory, scheduler, systemd service
- **Week 2:** P1 — Voice replies, empire routing, multi-user, notification queue
- **Week 3:** P2 — WhatsApp, CRM, BI Council
