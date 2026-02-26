#!/usr/bin/env bash
# heartbeat.sh — Monitor AOS and restart if unresponsive
# Add to crontab: */10 * * * * /path/to/aos/scripts/heartbeat.sh
#
# Checks if the AOS process is running. If not, restarts via systemd.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PID_FILE="$PROJECT_ROOT/store/aos.pid"
LOG_FILE="$PROJECT_ROOT/store/heartbeat.log"

log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') $1" >> "$LOG_FILE"
}

# Check if PID file exists and process is alive
if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    # Process is alive
    exit 0
  else
    log "WARN: Stale PID $PID — process not running"
  fi
else
  log "WARN: No PID file found"
fi

# Try to restart via systemd
log "ACTION: Restarting AOS via systemd"
if systemctl --user restart aos 2>/dev/null; then
  log "OK: AOS restarted successfully"

  # Send notification
  if [ -x "$SCRIPT_DIR/notify.sh" ]; then
    "$SCRIPT_DIR/notify.sh" "AOS was down and has been automatically restarted by heartbeat monitor." 2>/dev/null || true
  fi
else
  log "ERROR: Failed to restart AOS via systemd"

  # Fallback: start directly
  log "ACTION: Attempting direct start"
  cd "$PROJECT_ROOT"
  nohup node dist/index.js >> "$PROJECT_ROOT/store/aos.log" 2>&1 &
  log "OK: AOS started directly (PID $!)"
fi
