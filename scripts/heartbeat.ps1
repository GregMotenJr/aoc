# heartbeat.ps1 — Monitor AOS and restart if unresponsive (Windows)
# Registered automatically by install.ps1 as a scheduled task (every 10 min)

$ProjectRoot = Split-Path (Split-Path $PSCommandPath -Parent) -Parent
$PidFile     = Join-Path $ProjectRoot "store\aos.pid"
$LogFile     = Join-Path $ProjectRoot "store\heartbeat.log"
$TaskName    = "AOS-Alfred"

function log { param($msg) Add-Content -Path $LogFile -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg" }

# Check if PID file exists and process is alive
if (Test-Path $PidFile) {
  $pid = Get-Content $PidFile -Raw
  $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
  if ($proc) { exit 0 }  # Still running — all good
  log "WARN: Stale PID $pid — process not running"
} else {
  log "WARN: No PID file found"
}

# Try to restart via Task Scheduler
log "ACTION: Restarting AOS via Task Scheduler"
try {
  Stop-ScheduledTask  -TaskName $TaskName -ErrorAction SilentlyContinue
  Start-ScheduledTask -TaskName $TaskName
  log "OK: AOS restarted successfully"
} catch {
  # Fallback: start directly
  log "WARN: Task Scheduler restart failed — starting directly"
  $node    = (Get-Command node).Source
  $script  = Join-Path $ProjectRoot "dist\index.js"
  $process = Start-Process -FilePath $node -ArgumentList $script -WorkingDirectory $ProjectRoot -PassThru -WindowStyle Hidden
  log "OK: AOS started directly (PID $($process.Id))"
}
