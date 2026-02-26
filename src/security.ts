import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { ALLOWED_CHAT_ID, ALLOWED_CHAT_IDS, STORE_DIR } from './config.js';
import { logger } from './logger.js';

const log = logger.child({ component: 'security' });
const PID_FILE = join(STORE_DIR, 'aos.pid');

// --- Chat ID Authorization ---

export function isAuthorised(chatId: string): boolean {
  // First-run mode: no chat IDs configured, accept everyone
  if (!ALLOWED_CHAT_ID && ALLOWED_CHAT_IDS.length === 0) {
    log.warn(
      { chatId },
      'No ALLOWED_CHAT_ID configured — first-run mode, accepting all messages. Set ALLOWED_CHAT_ID in .env',
    );
    return true;
  }

  if (chatId === ALLOWED_CHAT_ID) return true;
  if (ALLOWED_CHAT_IDS.includes(chatId)) return true;

  log.warn({ chatId }, 'Unauthorized message — silently dropped');
  return false;
}

// --- Outbound Secret Redaction ---

const SECRET_PATTERNS: RegExp[] = [
  /sk-[a-zA-Z0-9]{20,}/g,
  /ghp_[a-zA-Z0-9]{36}/g,
  /xoxb-[0-9-]+/g,
  /Bearer\s+[a-zA-Z0-9._\-]{20,}/g,
  /password\s*[:=]\s*\S+/gi,
  /token\s*[:=]\s*\S+/gi,
  /[A-Z_]{3,}=\S{10,}/g,
];

export function redactSecrets(text: string): string {
  let result = text;
  for (const pattern of SECRET_PATTERNS) {
    // Reset lastIndex since we're reusing global regexes
    pattern.lastIndex = 0;
    result = result.replace(pattern, '[REDACTED]');
  }
  return result;
}

// --- PID Lock Management ---

export function acquireLock(): void {
  mkdirSync(STORE_DIR, { recursive: true });

  if (existsSync(PID_FILE)) {
    const oldPid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10);
    if (!isNaN(oldPid)) {
      try {
        // Check if process is alive
        process.kill(oldPid, 0);
        // Process is alive — kill it
        log.info({ oldPid }, 'Killing stale AOS instance');
        process.kill(oldPid, 'SIGTERM');
        // Give it a moment to die
        const deadline = Date.now() + 3000;
        while (Date.now() < deadline) {
          try {
            process.kill(oldPid, 0);
          } catch {
            break; // Process is dead
          }
        }
      } catch {
        // Process is dead — stale PID file, overwrite
        log.info({ oldPid }, 'Removing stale PID file');
      }
    }
  }

  writeFileSync(PID_FILE, String(process.pid), 'utf-8');
  log.info({ pid: process.pid }, 'PID lock acquired');
}

export function releaseLock(): void {
  try {
    if (existsSync(PID_FILE)) {
      const storedPid = readFileSync(PID_FILE, 'utf-8').trim();
      if (storedPid === String(process.pid)) {
        unlinkSync(PID_FILE);
        log.info('PID lock released');
      }
    }
  } catch (err) {
    log.warn({ err }, 'Failed to release PID lock');
  }
}
