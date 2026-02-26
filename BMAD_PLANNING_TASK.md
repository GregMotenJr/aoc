# AOS Planning Task — BMAD Method

You are running the BMAD planning pipeline for the AOS (AlfredOS) project.

## Project Context
AOS is a stable, security-first personal AI assistant that bridges Claude Code to Telegram via Anthropic's Agent SDK. It replaces OpenClaw with a thinner, more stable architecture.

## Reference Materials (READ THESE FIRST)
1. `/root/projects/aos/context/product-brief.md` — Product vision, users, features, constraints
2. `/root/projects/aos/context/reference-mega-prompt.md` — The ClaudeClaw mega prompt (900-line TypeScript architecture spec). This is the technical base we're building from.

## Your Task
Run three BMAD planning phases in sequence. Write each output to the context/ folder.

### Phase 1: PRD (Product Requirements Document)
Act as the BMAD PM agent. Read the product brief and reference mega prompt.
Write a complete PRD to `/root/projects/aos/context/prd.md` covering:
- Functional requirements (grouped by P0/P1/P2)
- Non-functional requirements (stability, security, performance, portability)
- User stories for each feature
- Acceptance criteria
- API/integration specifications
- Data model (SQLite schema)
- Error handling requirements
- Security requirements (detailed)

Key customizations vs ClaudeClaw:
- Project name: AOS (command: `aos`)
- Personality loaded from SOUL.md, USER.md, AGENTS.md (not generic CLAUDE.md)
- Empire-aware: can route to company contexts via commands
- Scheduler must support the full job types we run today (work polls, briefings, deal scans, reflections)
- Security: loopback-only binding, chat ID allowlist, outbound secret redaction, PID lock
- Multi-user support for Bridget's VPS deployment

### Phase 2: Architecture Document
Act as the BMAD Architect agent. Read the PRD and reference mega prompt.
Write a complete architecture doc to `/root/projects/aos/context/architecture.md` covering:
- System architecture diagram (ASCII)
- Component breakdown (each TypeScript file and its responsibility)
- Data flow (message in → response out, all 8 stages)
- Database schema (complete SQL)
- Memory system design (semantic + episodic + decay)
- Scheduler design
- Security architecture
- Error handling and recovery patterns
- Deployment architecture (systemd service)
- Dependency list with versions
- File structure
- Configuration management (.env)
- Testing strategy

### Phase 3: Epics & Stories
Act as the BMAD Scrum Master agent. Read the PRD and architecture doc.
Write sprint-ready epics and stories to `/root/projects/aos/context/epics-and-stories.md` covering:
- Epic 1: Core Infrastructure (project setup, config, logging, DB)
- Epic 2: Agent Bridge (Claude Code SDK integration, session management)
- Epic 3: Telegram Bridge (Grammy bot, message handling, formatting)
- Epic 4: Memory System (semantic + episodic, decay, context injection)
- Epic 5: Media Handling (voice STT, photos, documents, video)
- Epic 6: Scheduler (cron tasks, CLI management)
- Epic 7: Security (auth, redaction, lock file, service hardening)
- Epic 8: Deployment (systemd, setup wizard, status script)
- Epic 9: Empire Integration (SOUL.md loading, company routing, INBOX.md)

Each story should have: description, acceptance criteria, estimated complexity (S/M/L), dependencies.

## Output
Three files:
1. `/root/projects/aos/context/prd.md`
2. `/root/projects/aos/context/architecture.md`
3. `/root/projects/aos/context/epics-and-stories.md`

When done, write "PLANNING COMPLETE" and list all files created.
