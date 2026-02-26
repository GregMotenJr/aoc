# ═══════════════════════════════════════════════════
# AOS Installer — One command, fully running bot
# ═══════════════════════════════════════════════════
#
# Run from PowerShell (as Administrator recommended):
#   irm https://raw.githubusercontent.com/GregMotenJr/aoc/master/install.ps1 | iex
#
# Or from a cloned repo:
#   powershell -ExecutionPolicy Bypass -File install.ps1

$ErrorActionPreference = "Stop"

function ok   { param($msg) Write-Host "✓ $msg" -ForegroundColor Green }
function warn { param($msg) Write-Host "⚠ $msg" -ForegroundColor Yellow }
function fail { param($msg) Write-Host "✗ $msg" -ForegroundColor Red; exit 1 }
function ask  { param($prompt) Read-Host $prompt }

Write-Host ""
Write-Host "╔═══════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   AOS — Alfred Operating System       ║" -ForegroundColor Cyan
Write-Host "║   One-command installer                ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Platform: Windows" -ForegroundColor White
Write-Host ""

# ─── Step 1: Check prerequisites ──────────────────

Write-Host "Checking prerequisites..." -ForegroundColor White
Write-Host ""

# Node.js
try {
  $nodeVersion = (node -v 2>&1).ToString().TrimStart('v')
  $nodeMajor   = [int]($nodeVersion.Split('.')[0])
  if ($nodeMajor -lt 20) {
    fail "Node.js v$nodeVersion found — AOS requires v20 or higher. Update at https://nodejs.org"
  }
  ok "Node.js v$nodeVersion"
} catch {
  fail "Node.js not found. Install Node.js 20+ from https://nodejs.org"
}

# npm
try {
  $npmVersion = (npm -v 2>&1).ToString()
  ok "npm $npmVersion"
} catch {
  fail "npm not found. It should come with Node.js — reinstall from https://nodejs.org"
}

# Claude CLI
try {
  $claudeVersion = (claude --version 2>&1).ToString()
  ok "Claude CLI $claudeVersion"
} catch {
  warn "Claude CLI not found."
  Write-Host "  AOS uses Claude Code under the hood. Install it with:" -ForegroundColor Yellow
  Write-Host ""
  Write-Host "    npm install -g @anthropic-ai/claude-code" -ForegroundColor Cyan
  Write-Host ""
  Write-Host "  Then run: claude   (to authenticate)" -ForegroundColor Yellow
  Write-Host ""
  $answer = ask "Continue anyway? You can install Claude CLI later. (y/N)"
  if ($answer -notmatch '^[Yy]') {
    Write-Host "Install Claude CLI first, then re-run install.ps1"
    exit 0
  }
}

# ─── Step 2: Determine install location ───────────

$InstallDir = Join-Path $env:LOCALAPPDATA "Programs\AOS"
$BinDir = Join-Path $InstallDir "bin"

Write-Host ""
Write-Host "Install location: $InstallDir" -ForegroundColor White
Write-Host ""

# ─── Step 3: Clone or copy repo ────────────────────

Write-Host "Setting up project..." -ForegroundColor White
Write-Host ""

if (Test-Path $InstallDir) {
  Write-Host "  Existing AOS installation found." -ForegroundColor Yellow
  $answer = ask "  Reinstall? (y/N)"
  if ($answer -notmatch '^[Yy]') {
    ok "Keeping existing installation"
    $skipClone = $true
  } else {
    Remove-Item -Recurse -Force $InstallDir
    $skipClone = $false
  }
} else {
  $skipClone = $false
}

if (-not $skipClone) {
  # Try to git clone; fall back to downloading zip
  try {
    git clone --branch dev https://github.com/GregMotenJr/aoc.git $InstallDir 2>&1 | Out-Null
    ok "Repository cloned"
  } catch {
    Write-Host "  Git not available or clone failed. Downloading instead..." -ForegroundColor Yellow
    try {
      New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
      $zipUrl = "https://github.com/GregMotenJr/aoc/archive/refs/heads/dev.zip"
      $zipFile = [System.IO.Path]::GetTempFileName() + ".zip"
      
      Invoke-WebRequest -Uri $zipUrl -OutFile $zipFile -UseBasicParsing
      Expand-Archive -Path $zipFile -DestinationPath $env:TEMP -Force
      
      $extracted = Join-Path $env:TEMP "aoc-dev"
      Copy-Item -Path "$extracted\*" -Destination $InstallDir -Recurse -Force
      Remove-Item -Path $zipFile -Force
      Remove-Item -Path $extracted -Recurse -Force
      
      ok "Repository downloaded and extracted"
    } catch {
      fail "Could not clone or download repository: $_"
    }
  }
}

# ─── Step 4: Install dependencies ─────────────────

Write-Host ""
Write-Host "Installing dependencies..." -ForegroundColor White
Write-Host ""
Set-Location $InstallDir
npm install --no-fund --no-audit
if ($LASTEXITCODE -ne 0) {
  fail "npm install failed"
}
ok "Dependencies installed"

# ─── Step 5: Configure .env ───────────────────────

Write-Host ""
Write-Host "Configuration" -ForegroundColor White
Write-Host ""

$skipEnv = $false
if (Test-Path ".env") {
  Write-Host "  Existing .env file found." -ForegroundColor Yellow
  $answer = ask "  Overwrite it? (y/N)"
  if ($answer -notmatch '^[Yy]') {
    ok "Keeping existing .env"
    $skipEnv = $true
  }
}

if (-not $skipEnv) {
  Write-Host ""
  Write-Host "  You'll need a Telegram bot token. If you don't have one:" -ForegroundColor White
  Write-Host "  1. Open Telegram and search for @BotFather"
  Write-Host "  2. Send /newbot and follow the prompts"
  Write-Host "  3. Copy the token it gives you"
  Write-Host ""

  $botToken = ask "  Telegram bot token"
  if ([string]::IsNullOrWhiteSpace($botToken)) {
    fail "Bot token is required. Get one from @BotFather on Telegram."
  }

  Write-Host ""
  Write-Host "  Optional features (press Enter to skip any):" -ForegroundColor White
  Write-Host ""

  $groqKey         = ask "  Groq API key (voice transcription — https://console.groq.com)"
  $elevenLabsKey   = ask "  ElevenLabs API key (voice replies — https://elevenlabs.io)"
  $elevenLabsVoice = ""
  if (-not [string]::IsNullOrWhiteSpace($elevenLabsKey)) {
    $elevenLabsVoice = ask "  ElevenLabs voice ID"
  }
  $googleKey = ask "  Google API key (video analysis — https://aistudio.google.com)"

  $envContent = @"
# AOS Configuration — generated by install.ps1

# Telegram bot token (from @BotFather)
TELEGRAM_BOT_TOKEN=$botToken

# Your Telegram chat ID
# After starting the bot, send /chatid to it and paste the number here
ALLOWED_CHAT_ID=

# Voice transcription (Groq Whisper) — optional
GROQ_API_KEY=$groqKey

# Voice replies (ElevenLabs TTS) — optional
ELEVENLABS_API_KEY=$elevenLabsKey
ELEVENLABS_VOICE_ID=$elevenLabsVoice

# Video analysis (Google Gemini) — optional
GOOGLE_API_KEY=$googleKey

# Logging
LOG_LEVEL=info
NODE_ENV=production
"@

  $envContent | Set-Content -Path ".env" -Encoding UTF8
  ok ".env configured"
}

# ─── Step 6: Build ────────────────────────────────

Write-Host ""
Write-Host "Building..." -ForegroundColor White
Write-Host ""
npm run build
if ($LASTEXITCODE -ne 0) {
  fail "Build failed"
}
ok "TypeScript compiled"

# ─── Step 7: Create global aos command ────────────

Write-Host ""
Write-Host "Creating global aos command..." -ForegroundColor White
Write-Host ""

New-Item -ItemType Directory -Path $BinDir -Force | Out-Null

# Create aos.cmd wrapper
$aosCmdContent = @"
@echo off
REM AOS Global Command Wrapper
node "$InstallDir\dist\cli.js" %*
"@

$aosCmdContent | Set-Content -Path (Join-Path $BinDir "aos.cmd") -Encoding ASCII
ok "aos.cmd created"

# Add bin directory to User PATH
$userPath = [Environment]::GetEnvironmentVariable("Path", [EnvironmentVariableTarget]::User)
if (-not ($userPath -split ';' | Where-Object { $_ -eq $BinDir })) {
  [Environment]::SetEnvironmentVariable(
    "Path",
    "$userPath;$BinDir",
    [EnvironmentVariableTarget]::User
  )
  ok "Added $BinDir to User PATH"
  Write-Host "  (You may need to restart your terminal for the change to take effect)" -ForegroundColor Yellow
} else {
  ok "PATH already configured"
}

# ─── Done ─────────────────────────────────────────

Write-Host ""
Write-Host "═══════════════════════════════════════" -ForegroundColor Green
Write-Host "  Installation complete!" -ForegroundColor Green
Write-Host "═══════════════════════════════════════" -ForegroundColor Green
Write-Host ""
Write-Host "  What to do now:" -ForegroundColor White
Write-Host ""
Write-Host "  1. Start the bot:"
Write-Host "     aos start" -ForegroundColor Cyan
Write-Host ""
Write-Host "  2. Open Telegram and send /chatid to your bot"
Write-Host ""
Write-Host "  3. Copy the chat ID and add it to .env:"
Write-Host "     ALLOWED_CHAT_ID=<your_chat_id>" -ForegroundColor Cyan
Write-Host ""
Write-Host "  4. Restart the bot:"
Write-Host "     aos stop && aos start" -ForegroundColor Cyan
Write-Host ""
Write-Host "  5. Check status:"
Write-Host "     aos status" -ForegroundColor Cyan
Write-Host ""
Write-Host "  6. View live logs:"
Write-Host "     aos logs" -ForegroundColor Cyan
Write-Host ""
Write-Host "  7. Customize CLAUDE.md with your AI's personality"
Write-Host ""
Write-Host "  8. Send a message — you're live!"
Write-Host ""
