import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readEnvFile } from './env.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read env once at module load
const env = readEnvFile();

// Path constants
export const PROJECT_ROOT = join(__dirname, '..');
export const STORE_DIR = join(PROJECT_ROOT, 'store');
export const DB_PATH = env['AOS_DB_PATH'] ?? join(STORE_DIR, 'aos.db');
export const UPLOADS_DIR = join(
  env['WORKSPACE_DIR'] ?? PROJECT_ROOT,
  'workspace',
  'uploads',
);

// Telegram
export const TELEGRAM_BOT_TOKEN = env['TELEGRAM_BOT_TOKEN'] ?? '';
export const ALLOWED_CHAT_ID = env['ALLOWED_CHAT_ID'] ?? '';
export const ALLOWED_CHAT_IDS: string[] = env['ALLOWED_CHAT_IDS']
  ? env['ALLOWED_CHAT_IDS'].split(',').map((s) => s.trim())
  : [];

// Voice / Media API keys
export const GROQ_API_KEY = env['GROQ_API_KEY'] ?? '';
export const ELEVENLABS_API_KEY = env['ELEVENLABS_API_KEY'] ?? '';
export const ELEVENLABS_VOICE_ID = env['ELEVENLABS_VOICE_ID'] ?? '';
export const GOOGLE_API_KEY = env['GOOGLE_API_KEY'] ?? '';

// Numeric constants
export const MAX_MESSAGE_LENGTH = 4096;
export const TYPING_REFRESH_MS = 4000;
export const SCHEDULER_POLL_MS = parseInt(
  env['SCHEDULER_POLL_INTERVAL'] ?? '60000',
  10,
);
export const MEMORY_DECAY_RATE = parseFloat(
  env['MEMORY_DECAY_RATE'] ?? '0.98',
);
export const MEMORY_MIN_SALIENCE = parseFloat(
  env['MEMORY_MIN_SALIENCE'] ?? '0.1',
);
export const MAX_MEMORY_RESULTS = parseInt(
  env['MAX_MEMORY_RESULTS'] ?? '8',
  10,
);

// Workspace directory (where CLAUDE.md lives)
export const WORKSPACE_DIR = env['WORKSPACE_DIR'] ?? PROJECT_ROOT;

// Log level
export const LOG_LEVEL = env['LOG_LEVEL'] ?? 'info';
export const NODE_ENV = env['NODE_ENV'] ?? 'development';
