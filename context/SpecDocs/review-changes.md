# AOS Spec Review — Changes Applied
**Reviewer:** Alfred (Chief of Staff) + Greg Moten (Product Owner)
**Date:** 2026-02-26

## Changes from BMAD Output → Final Spec

### 1. SOUL.md → CLAUDE.md (ALL DOCS)
Claude Code natively loads `CLAUDE.md` from the project root. Using a non-standard name adds confusion for open source users. CLAUDE.md now contains sections for personality, user profile, and agent definitions. One file, standard name, zero learning curve.

### 2. Empire Features → Cut from MVP (PRD, EPICS)
Empire routing (company commands, cross-company intelligence, BI council) is Greg-specific. For open source, AOS is a **personal assistant** first. Empire features become an optional `aos-empire` extension in v2.

**Removed from MVP:**
- Epic 9 (EMPIRE) — all 6 stories deferred to v2
- FR-012: Empire Routing → P2
- FR-013: Multi-User → P1 (kept, simplified to chat ID allowlist)
- WhatsApp bridge (EMPIRE-6) → cut from v1 entirely

### 3. Video Analysis → P2 (PRD, EPICS)
Requiring a Google API key for video adds complexity. Claude Code handles images natively. Video via Gemini is optional and deferred.

**Changed:** MEDIA-5 (Video Analysis) moved from P0 to P2.

### 4. Setup Wizard → Simplified (DEPLOYMENT)
700-line interactive wizard is overengineered for open source. Replaced with:
```
aos init     # creates .env from template, opens CLAUDE.md in $EDITOR
aos start    # runs the bot
aos status   # health check
```

### 5. Notification Queue Timers → Adjusted (EMPIRE-4)
Changed from High=5min/Medium=30min to High=60min/Medium=3hr per Matthew Berman's recommendation. Personal assistants shouldn't ping constantly.

### 6. Added Stories (from OpenClaw learnings)

**SCHEDULER-6: Three-Strike Auto-Disable**
If a cron job fails 3 consecutive times, disable it and notify the user. Prevents runaway error loops.

**DEPLOYMENT-7: Heartbeat Monitor**
Simple cron pings the bot every 10 minutes. If no response, restart the service. The #1 stability feature OpenClaw was missing.

**TELEGRAM-7: /backup Command**
Dump SQLite DB and send to user via Telegram. One-command full state backup.

**BRIDGE-6: Context Window Management**
Track approximate token usage. When >70% capacity, suggest `/newchat` with checkpoint save. Automatic version of the `convolife` command.

### 7. Revised MVP Scope

| Epic | Stories | Status |
|---|---|---|
| CORE | 6 | ✅ Keep |
| BRIDGE | 6 (+1) | ✅ Keep, CLAUDE.md convention |
| TELEGRAM | 7 (+1) | ✅ Keep, add /backup |
| MEMORY | 5 | ✅ Keep |
| MEDIA | 4 (-1) | 🟡 Voice+photo, video deferred |
| SCHEDULER | 6 (+1) | ✅ Keep, add 3-strike |
| SECURITY | 6 | ✅ Keep |
| DEPLOYMENT | 7 (+1) | 🟡 Simplified wizard, add heartbeat |
| EMPIRE | 0 (-6) | 🔴 Deferred to v2 |

**Total: 47 stories (was 52)**
