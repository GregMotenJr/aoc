#!/usr/bin/env bash
# ═══════════════════════════════════════════════════
# AOS Installer — One command, fully running bot
# ═══════════════════════════════════════════════════
#
# Linux / macOS / WSL:
#   curl -fsSL https://raw.githubusercontent.com/GregMotenJr/aoc/master/install.sh | bash
#
# Windows (PowerShell):
#   irm https://raw.githubusercontent.com/GregMotenJr/aoc/master/install.ps1 | iex

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
BOLD='\033[1m'
RESET='\033[0m'

ok()   { echo -e "${GREEN}✓${RESET} $1"; }
warn() { echo -e "${YELLOW}⚠${RESET} $1"; }
fail() { echo -e "${RED}✗${RESET} $1"; exit 1; }
ask()  { read -rp "$1" REPLY </dev/tty; echo "$REPLY"; }

# ─── Detect OS ────────────────────────────────────

detect_os() {
  if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "macos"
  elif grep -qi microsoft /proc/version 2>/dev/null; then
    echo "wsl"
  elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo "linux"
  else
    echo "unknown"
  fi
}

OS=$(detect_os)

echo ""
echo -e "${BOLD}╔═══════════════════════════════════════╗"
echo -e "║   AOS — Alfred Operating System       ║"
echo -e "║   One-command installer                ║"
echo -e "╚═══════════════════════════════════════╝${RESET}"
echo ""

case "$OS" in
  macos)  echo -e "  Platform: ${BOLD}macOS${RESET}" ;;
  linux)  echo -e "  Platform: ${BOLD}Linux${RESET}" ;;
  wsl)    echo -e "  Platform: ${BOLD}Windows (WSL)${RESET}" ;;
  *)      echo -e "  Platform: ${BOLD}Unknown — proceeding as Linux${RESET}" ;;
esac
echo ""

# ─── Step 1: Check prerequisites ──────────────────

echo -e "${BOLD}Checking prerequisites...${RESET}"
echo ""

if ! command -v node &>/dev/null; then
  fail "Node.js not found. Install Node.js 20+ from https://nodejs.org"
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  fail "Node.js v${NODE_VERSION} found — AOS requires v20 or higher. Update at https://nodejs.org"
fi
ok "Node.js $(node -v)"

if ! command -v npm &>/dev/null; then
  fail "npm not found. It should come with Node.js — reinstall from https://nodejs.org"
fi
ok "npm $(npm -v)"

if command -v claude &>/dev/null; then
  ok "Claude CLI $(claude --version 2>/dev/null || echo 'installed')"
else
  echo ""
  warn "Claude CLI not found."
  echo "  AOS uses Claude Code under the hood. Install it with:"
  echo ""
  echo "    npm install -g @anthropic-ai/claude-code"
  echo ""
  echo "  Then run: claude   (to authenticate)"
  echo ""
  ANSWER=$(ask "Continue anyway? You can install Claude CLI later. (y/N): ")
  if [[ ! "$ANSWER" =~ ^[Yy] ]]; then
    echo "Install Claude CLI first, then re-run ./install.sh"
    exit 0
  fi
fi

# ─── Step 2: Determine install location ───────────

INSTALL_DIR="$HOME/.local/share/aos"
BIN_DIR="$HOME/.local/bin"

echo ""
echo "Install location: $INSTALL_DIR"
echo ""

# ─── Step 3: Clone or copy repo ────────────────────

echo -e "${BOLD}Setting up project...${RESET}"
echo ""

if [ -d "$INSTALL_DIR" ]; then
  echo "  Existing AOS installation found."
  ANSWER=$(ask "  Reinstall? (y/N): ")
  if [[ ! "$ANSWER" =~ ^[Yy] ]]; then
    ok "Keeping existing installation"
    SKIP_CLONE=1
  else
    rm -rf "$INSTALL_DIR"
    SKIP_CLONE=0
  fi
else
  SKIP_CLONE=0
fi

if [ "$SKIP_CLONE" = "0" ]; then
  mkdir -p "$INSTALL_DIR"
  
  if command -v git &>/dev/null; then
    git clone --branch dev https://github.com/GregMotenJr/aoc.git "$INSTALL_DIR" 2>/dev/null || {
      echo "  Git clone failed. Downloading instead..." >&2
      SKIP_CLONE=-1
    }
  else
    SKIP_CLONE=-1
  fi

  if [ "$SKIP_CLONE" = "-1" ]; then
    # Download zip and extract
    ZIP_URL="https://github.com/GregMotenJr/aoc/archive/refs/heads/dev.zip"
    ZIP_FILE="/tmp/aoc-dev.zip"
    
    if command -v curl &>/dev/null; then
      curl -fsSL "$ZIP_URL" -o "$ZIP_FILE"
    elif command -v wget &>/dev/null; then
      wget -q "$ZIP_URL" -O "$ZIP_FILE"
    else
      fail "Neither curl nor wget available. Please install one and try again."
    fi
    
    if command -v unzip &>/dev/null; then
      unzip -q "$ZIP_FILE" -d /tmp
      mv /tmp/aoc-dev/* "$INSTALL_DIR/"
      rm -f "$ZIP_FILE"
    else
      fail "unzip not found. Please install it and try again."
    fi
  fi

  ok "Repository cloned/extracted"
fi

# ─── Step 4: Install dependencies ─────────────────

echo ""
echo -e "${BOLD}Installing dependencies...${RESET}"
echo ""
cd "$INSTALL_DIR"
npm install --no-fund --no-audit
ok "Dependencies installed"

# ─── Step 5: Configure .env ───────────────────────

echo ""
echo -e "${BOLD}Configuration${RESET}"
echo ""

SKIP_ENV=0
if [ -f .env ]; then
  echo "  Existing .env file found."
  ANSWER=$(ask "  Overwrite it? (y/N): ")
  if [[ ! "$ANSWER" =~ ^[Yy] ]]; then
    ok "Keeping existing .env"
    SKIP_ENV=1
  fi
fi

if [ "$SKIP_ENV" != "1" ]; then
  echo ""
  echo "  You'll need a Telegram bot token. If you don't have one:"
  echo "  1. Open Telegram and search for @BotFather"
  echo "  2. Send /newbot and follow the prompts"
  echo "  3. Copy the token it gives you"
  echo ""

  BOT_TOKEN=$(ask "  Telegram bot token: ")
  if [ -z "$BOT_TOKEN" ]; then
    fail "Bot token is required. Get one from @BotFather on Telegram."
  fi

  echo ""
  echo "  Optional features (press Enter to skip any):"
  echo ""

  GROQ_KEY=$(ask "  Groq API key (voice transcription — https://console.groq.com): ")
  ELEVENLABS_KEY=$(ask "  ElevenLabs API key (voice replies — https://elevenlabs.io): ")

  ELEVENLABS_VOICE=""
  if [ -n "$ELEVENLABS_KEY" ]; then
    ELEVENLABS_VOICE=$(ask "  ElevenLabs voice ID: ")
  fi

  GOOGLE_KEY=$(ask "  Google API key (video analysis — https://aistudio.google.com): ")

  cat > .env << EOF
# AOS Configuration — generated by install.sh

# Telegram bot token (from @BotFather)
TELEGRAM_BOT_TOKEN=${BOT_TOKEN}

# Your Telegram chat ID
# After starting the bot, send /chatid to it and paste the number here
ALLOWED_CHAT_ID=

# Voice transcription (Groq Whisper) — optional
GROQ_API_KEY=${GROQ_KEY}

# Voice replies (ElevenLabs TTS) — optional
ELEVENLABS_API_KEY=${ELEVENLABS_KEY}
ELEVENLABS_VOICE_ID=${ELEVENLABS_VOICE}

# Video analysis (Google Gemini) — optional
GOOGLE_API_KEY=${GOOGLE_KEY}

# Logging
LOG_LEVEL=info
NODE_ENV=production
EOF

  chmod 600 .env
  ok ".env configured"
fi

# ─── Step 6: Build ────────────────────────────────

echo ""
echo -e "${BOLD}Building...${RESET}"
echo ""
npm run build
ok "TypeScript compiled"

# ─── Step 7: Create global aos command ────────────

echo ""
echo -e "${BOLD}Creating global aos command...${RESET}"
echo ""

mkdir -p "$BIN_DIR"

# Create aos shell wrapper
cat > "$BIN_DIR/aos" << 'EOF'
#!/usr/bin/env bash
INSTALL_DIR="$HOME/.local/share/aos"
cd "$INSTALL_DIR"
exec node "$INSTALL_DIR/dist/cli.js" "$@"
EOF

chmod +x "$BIN_DIR/aos"
ok "aos command created"

# Add bin directory to PATH (update shell configs)
UPDATE_SHELL_CONFIG() {
  local config_file="$1"
  local export_line="export PATH=\"\$HOME/.local/bin:\$PATH\""
  
  if [ ! -f "$config_file" ]; then
    echo "$export_line" >> "$config_file"
    ok "Added to $config_file"
    return
  fi
  
  if ! grep -q "\.local/bin" "$config_file"; then
    echo "$export_line" >> "$config_file"
    ok "Added to $config_file"
  fi
}

if [ -f "$HOME/.bashrc" ]; then
  UPDATE_SHELL_CONFIG "$HOME/.bashrc"
fi

if [ -f "$HOME/.zshrc" ]; then
  UPDATE_SHELL_CONFIG "$HOME/.zshrc"
fi

if [ -f "$HOME/.profile" ]; then
  UPDATE_SHELL_CONFIG "$HOME/.profile"
fi

warn "Shell configuration updated — you may need to restart your terminal"

# ─── Done ─────────────────────────────────────────

echo ""
echo -e "${BOLD}${GREEN}═══════════════════════════════════════${RESET}"
echo -e "${BOLD}${GREEN}  Installation complete!${RESET}"
echo -e "${BOLD}${GREEN}═══════════════════════════════════════${RESET}"
echo ""
echo -e "  ${BOLD}What to do now:${RESET}"
echo ""
echo "  1. Start the bot:"
echo -e "     ${BOLD}aos start${RESET}"
echo ""
echo "  2. Open Telegram and send /chatid to your bot"
echo ""
echo "  3. Copy the chat ID and add it to .env:"
echo -e "     ${BOLD}ALLOWED_CHAT_ID=<your_chat_id>${RESET}"
echo ""
echo "  4. Restart the bot:"
echo -e "     ${BOLD}aos stop && aos start${RESET}"
echo ""
echo "  5. Check status:"
echo -e "     ${BOLD}aos status${RESET}"
echo ""
echo "  6. View live logs:"
echo -e "     ${BOLD}aos logs${RESET}"
echo ""
echo "  7. Customize CLAUDE.md with your AI's personality"
echo ""
echo "  8. Send a message — you're live!"
echo ""
