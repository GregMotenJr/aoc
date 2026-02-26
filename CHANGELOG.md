# Changelog

All notable changes to AOS are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] — 2026-02-26

### Added
- **Cross-platform installer** — single command for Linux, macOS, WSL, and Windows
  - `install.sh` — detects OS and configures launchd (macOS) or systemd (Linux/WSL)
  - `install.ps1` — Windows native installer via PowerShell with Task Scheduler
- **macOS launchd service** — auto-starts at login, restarts on crash
- **Windows Task Scheduler service** — `AOS-Alfred` task (login trigger, `RunLevel Limited`)
- **Windows heartbeat** — `scripts/heartbeat.ps1` + `AOS-Heartbeat` scheduled task (every 10 min)
- **Multi-stage CI/CD pipeline** — Build → Unit Tests → Integration Tests → E2E → Release → npm Publish
- **Conventional Commits enforcement** — PR titles validated in CI
- **Semantic version gate** — release pipeline rejects non-semver tags and tag/package.json mismatches
- **Integration tests** — config validation, PID lock, heartbeat fallback automated in CI

### Fixed
- `cron-parser` CJS/ESM named import crash — bot failed to start entirely
- `heartbeat.sh` fallback start never wrote PID to file — caused infinite restart loop
- `ExecStart` script path unquoted in systemd unit — broke on paths containing spaces
- `curl | bash` piping broken — `BASH_SOURCE[0]` empty caused PROJECT_ROOT to be unset
- `ask()` / `read` consumed the pipe stream instead of the terminal during `curl | bash`
- Cron duplicate detection used loose token — false positives across multiple installs
- Crontab append unquoted — paths with spaces broke the entry
- `heartbeat.ps1` used reserved `$pid` variable; missing `.Trim()` on PID read
- `install.ps1` heartbeat trigger missing `-RepetitionDuration` (older Windows compat)
- `install.ps1` registered task as `RunLevel Highest` — downgraded to `Limited`
- `README.md` used installer-only `$ProjectRoot` variable in Windows log example

### Security
- `install.ps1` Task Scheduler task runs as `RunLevel Limited` (least privilege)
- systemd unit uses `NoNewPrivileges`, `ProtectSystem=strict`, `PrivateTmp`

---

## [Unreleased]

_Changes on `dev` not yet released._

<!-- Template for next release:
## [X.Y.Z] — YYYY-MM-DD

### Added
### Changed
### Deprecated
### Removed
### Fixed
### Security
-->
