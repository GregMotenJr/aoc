#!/usr/bin/env tsx

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const STORE_DIR = join(PROJECT_ROOT, 'store');
const DB_PATH = join(STORE_DIR, 'aos.db');
const PID_FILE = join(STORE_DIR, 'aos.pid');
const ENV_PATH = join(PROJECT_ROOT, '.env');

const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

function check(label: string, ok: boolean, detail?: string): void {
  const icon = ok ? `${GREEN}\u2713${RESET}` : `${RED}\u2717${RESET}`;
  console.log(`  ${icon} ${label}${detail ? ` — ${detail}` : ''}`);
}

function readEnv(): Record<string, string> {
  if (!existsSync(ENV_PATH)) return {};
  const result: Record<string, string> = {};
  for (const line of readFileSync(ENV_PATH, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    result[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return result;
}

function main(): void {
  console.log(`\n${BOLD}AOS Health Check${RESET}\n`);

  // Node version
  const nodeVersion = process.version;
  const major = parseInt(nodeVersion.slice(1), 10);
  check('Node.js', major >= 20, nodeVersion);

  // Claude CLI
  let claudeOk = false;
  try {
    execSync('claude --version 2>/dev/null', { encoding: 'utf-8' });
    claudeOk = true;
  } catch {
    // not found
  }
  check('Claude CLI', claudeOk);

  // .env file
  const envExists = existsSync(ENV_PATH);
  check('.env file', envExists);

  const env = readEnv();

  // Bot token
  const hasToken = !!env['TELEGRAM_BOT_TOKEN'];
  check('Telegram bot token', hasToken);

  // Chat ID
  const hasChatId = !!(env['ALLOWED_CHAT_ID'] || env['ALLOWED_CHAT_IDS']);
  check('Chat ID configured', hasChatId);

  // Optional features
  console.log(`\n${BOLD}Features${RESET}\n`);
  check('Voice STT (Groq)', !!env['GROQ_API_KEY']);
  check(
    'Voice TTS (ElevenLabs)',
    !!(env['ELEVENLABS_API_KEY'] && env['ELEVENLABS_VOICE_ID']),
  );
  check('Video analysis (Gemini)', !!env['GOOGLE_API_KEY']);

  // Process status
  console.log(`\n${BOLD}Process${RESET}\n`);

  let running = false;
  if (existsSync(PID_FILE)) {
    const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10);
    try {
      process.kill(pid, 0);
      running = true;
      check('AOS process', true, `PID ${pid}`);
    } catch {
      check('AOS process', false, `stale PID file (${pid})`);
    }
  } else {
    check('AOS process', false, 'no PID file');
  }

  // systemd service (Linux)
  if (process.platform === 'linux') {
    try {
      const status = execSync('systemctl --user is-active aos 2>/dev/null', {
        encoding: 'utf-8',
      }).trim();
      check('systemd service', status === 'active', status);
    } catch {
      check('systemd service', false, 'not installed or inactive');
    }
  }

  // Database
  console.log(`\n${BOLD}Database${RESET}\n`);

  if (existsSync(DB_PATH)) {
    const dbSize = statSync(DB_PATH).size;
    check('Database', true, `${(dbSize / 1024).toFixed(1)} KB`);
  } else {
    check('Database', false, 'not created yet');
  }

  // Uploads
  const uploadsDir = join(PROJECT_ROOT, 'workspace', 'uploads');
  if (existsSync(uploadsDir)) {
    check('Uploads directory', true);
  } else {
    check('Uploads directory', false, 'will be created on first upload');
  }

  console.log('');

  // Exit code
  const healthy = hasToken && hasChatId && envExists;
  process.exit(healthy ? 0 : 1);
}

main();
