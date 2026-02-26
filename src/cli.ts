#!/usr/bin/env node

import { execSync, spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  writeFileSync,
  chmodSync,
  readdirSync,
} from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir, platform } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(__dirname, '..');
const IS_WINDOWS = platform() === 'win32';

const GREEN = '\x1b[0;32m';
const YELLOW = '\x1b[0;33m';
const RED = '\x1b[0;31m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

const ok = (msg: string) => console.log(`${GREEN}✓${RESET} ${msg}`);
const warn = (msg: string) => console.log(`${YELLOW}⚠${RESET} ${msg}`);
const fail = (msg: string) => { console.log(`${RED}✗${RESET} ${msg}`); process.exit(1); };

function ask(prompt: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/** Run a command via shell (works on Windows + Linux/macOS) */
function run(
  cmd: string,
  args: string[],
  opts: { cwd?: string; stdio?: 'inherit' | 'pipe' } = {},
): { status: number | null; stdout: string } {
  const result = spawnSync(cmd, args, {
    cwd: opts.cwd,
    stdio: opts.stdio ?? 'inherit',
    shell: true, // Required for Windows (.cmd wrappers like npm)
  });
  return {
    status: result.status,
    stdout: result.stdout?.toString().trim() ?? '',
  };
}

/** Silently check if a command exists */
function commandExists(cmd: string): boolean {
  try {
    const check = IS_WINDOWS ? `where ${cmd}` : `command -v ${cmd}`;
    execSync(check, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// ─── Template files to copy into new project ─────
const TEMPLATE_FILES = [
  'src',
  'scripts',
  'tests',
  'tsconfig.json',
  'vitest.config.ts',
  '.env.example',
  '.gitignore',
  'CLAUDE.md',
];

// ─── Commands ────────────────────────────────────

async function init(targetDir?: string): Promise<void> {
  console.log(`
${BOLD}╔═══════════════════════════════════════╗
║   AOS — Alfred Operating System       ║
║   Project Setup                       ║
╚═══════════════════════════════════════╝${RESET}
`);

  // Determine project directory
  const projectName = targetDir || 'aos';
  const projectDir = resolve(process.cwd(), projectName);

  if (existsSync(projectDir) && readdirSync(projectDir).length > 0) {
    const answer = await ask(`  ${projectName}/ already exists and is not empty. Continue? (y/N): `);
    if (!/^[Yy]/.test(answer)) {
      console.log('Aborted.');
      process.exit(0);
    }
  }

  mkdirSync(projectDir, { recursive: true });

  // ─── Step 1: Check prerequisites ────────────────

  console.log(`${BOLD}Checking prerequisites...${RESET}\n`);

  const nodeVersion = parseInt(process.version.slice(1), 10);
  if (nodeVersion < 20) {
    fail(`Node.js ${process.version} found — AOS requires v20+. Update at https://nodejs.org`);
  }
  ok(`Node.js ${process.version}`);

  if (commandExists('claude')) {
    ok('Claude CLI installed');
  } else {
    warn('Claude CLI not found — install later with: npm i -g @anthropic-ai/claude-code');
  }

  // ─── Step 2: Scaffold project ───────────────────

  console.log(`\n${BOLD}Creating project in ${projectName}/...${RESET}\n`);

  // Copy template files from the installed package
  for (const item of TEMPLATE_FILES) {
    const src = join(PACKAGE_ROOT, item);
    const dest = join(projectDir, item);
    if (!existsSync(src)) continue;
    cpSync(src, dest, { recursive: true, force: false });
  }

  // Create required directories
  mkdirSync(join(projectDir, 'store'), { recursive: true });
  mkdirSync(join(projectDir, 'workspace', 'uploads'), { recursive: true });

  // Write a fresh package.json for the user's project
  const userPackageJson = {
    name: projectName,
    version: '1.0.0',
    private: true,
    description: 'My AOS instance — personal AI assistant powered by Claude Code',
    type: 'module',
    main: 'dist/index.js',
    scripts: {
      build: 'tsc',
      start: 'node dist/index.js',
      dev: 'tsx src/index.ts',
      status: 'tsx scripts/status.ts',
      schedule: 'node dist/schedule-cli.js',
      test: 'vitest run',
      typecheck: 'tsc --noEmit',
    },
    engines: { node: '>=20' },
    dependencies: {
      '@anthropic-ai/claude-agent-sdk': '^0.1.0',
      'better-sqlite3': '^11.0.0',
      'cron-parser': '^4.9.0',
      'grammy': '^1.30.0',
      'pino': '^9.0.0',
    },
    devDependencies: {
      '@types/better-sqlite3': '^7.6.0',
      '@types/node': '^22.0.0',
      'pino-pretty': '^13.0.0',
      'tsx': '^4.0.0',
      'typescript': '^5.7.0',
      'vitest': '^3.0.0',
    },
  };

  writeFileSync(
    join(projectDir, 'package.json'),
    JSON.stringify(userPackageJson, null, 2) + '\n',
  );

  ok('Project files created');

  // ─── Step 3: Install dependencies ───────────────

  console.log(`\n${BOLD}Installing dependencies...${RESET}\n`);

  const installResult = run('npm', ['install', '--no-fund', '--no-audit'], {
    cwd: projectDir,
  });

  if (installResult.status !== 0) {
    console.log('');
    if (IS_WINDOWS) {
      console.log(`${YELLOW}Tip:${RESET} If better-sqlite3 failed to build, you may need build tools.`);
      console.log('  Run this in an Administrator PowerShell and try again:');
      console.log(`  ${BOLD}npm install -g windows-build-tools${RESET}`);
      console.log('');
    }
    fail('npm install failed — check errors above');
  }
  ok('Dependencies installed');

  // ─── Step 4: Configure .env ─────────────────────

  console.log(`\n${BOLD}Configuration${RESET}\n`);
  console.log('  You\'ll need a Telegram bot token. If you don\'t have one:');
  console.log('  1. Open Telegram and search for @BotFather');
  console.log('  2. Send /newbot and follow the prompts');
  console.log('  3. Copy the token it gives you');
  console.log('');

  const botToken = await ask('  Telegram bot token: ');
  if (!botToken) {
    fail('Bot token is required. Get one from @BotFather on Telegram.');
  }

  console.log('');
  console.log(`  Optional features ${DIM}(press Enter to skip any)${RESET}:`);
  console.log('');

  const groqKey = await ask('  Groq API key (voice transcription — https://console.groq.com): ');
  const elevenLabsKey = await ask('  ElevenLabs API key (voice replies — https://elevenlabs.io): ');
  const elevenLabsVoice = elevenLabsKey ? await ask('  ElevenLabs voice ID: ') : '';
  const googleKey = await ask('  Google API key (video analysis — https://aistudio.google.com): ');

  const envContent = `# AOS Configuration

# Telegram bot token (from @BotFather)
TELEGRAM_BOT_TOKEN=${botToken}

# Your Telegram chat ID
# After starting the bot, send /chatid to it and paste the number here
ALLOWED_CHAT_ID=

# Voice transcription (Groq Whisper) — optional
GROQ_API_KEY=${groqKey}

# Voice replies (ElevenLabs TTS) — optional
ELEVENLABS_API_KEY=${elevenLabsKey}
ELEVENLABS_VOICE_ID=${elevenLabsVoice}

# Video analysis (Google Gemini) — optional
GOOGLE_API_KEY=${googleKey}

# Logging
LOG_LEVEL=info
NODE_ENV=production
`;

  const envPath = join(projectDir, '.env');
  writeFileSync(envPath, envContent);
  try { chmodSync(envPath, 0o600); } catch { /* chmod not supported on Windows */ }
  ok('.env configured');

  // ─── Step 5: Build ─────────────────────────────

  console.log(`\n${BOLD}Building...${RESET}\n`);

  const buildResult = run('npm', ['run', 'build'], { cwd: projectDir });

  if (buildResult.status !== 0) {
    fail('Build failed — check errors above');
  }
  ok('TypeScript compiled');

  // ─── Step 6: systemd service (Linux only) ───────

  let systemdOk = false;
  if (process.platform === 'linux') {
    console.log(`\n${BOLD}Setting up background service...${RESET}\n`);

    const serviceDir = join(homedir(), '.config', 'systemd', 'user');
    const servicePath = join(serviceDir, 'aos.service');
    mkdirSync(serviceDir, { recursive: true });

    const nodeExec = process.execPath;
    const serviceContent = `[Unit]
Description=AOS — Alfred Operating System
After=network.target

[Service]
Type=simple
ExecStart=${nodeExec} ${join(projectDir, 'dist', 'index.js')}
WorkingDirectory=${projectDir}
Restart=always
RestartSec=5
Environment=NODE_ENV=production
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
PrivateTmp=true
ReadWritePaths=${join(projectDir, 'store')} ${join(projectDir, 'workspace')}

[Install]
WantedBy=default.target
`;

    try {
      writeFileSync(servicePath, serviceContent);
      execSync('systemctl --user daemon-reload', { encoding: 'utf-8' });
      execSync('systemctl --user enable aos', { encoding: 'utf-8' });
      ok('systemd service installed and enabled');
      systemdOk = true;
    } catch {
      warn('Could not set up systemd service (non-critical)');
    }
  }

  // ─── Done ──────────────────────────────────────

  const startCmd = systemdOk ? 'systemctl --user start aos' : 'npm start';
  const restartNote = systemdOk
    ? `  4. Restart:  ${BOLD}systemctl --user restart aos${RESET}`
    : `  4. Restart the bot (Ctrl+C, then npm start)`;

  console.log(`
${BOLD}${GREEN}═══════════════════════════════════════${RESET}
${BOLD}${GREEN}  AOS is ready!${RESET}
${BOLD}${GREEN}═══════════════════════════════════════${RESET}

  ${BOLD}Next steps:${RESET}

  ${BOLD}cd ${projectName}${RESET}

  1. Start:    ${BOLD}${startCmd}${RESET}
  2. Send ${BOLD}/chatid${RESET} to your bot on Telegram
  3. Add the ID to .env: ${BOLD}ALLOWED_CHAT_ID=<your_id>${RESET}
${restartNote}
  5. Customize ${BOLD}CLAUDE.md${RESET} with your AI's personality
  6. Send a message — you're live!
`);
}

function start(): void {
  const distIndex = join(process.cwd(), 'dist', 'index.js');
  if (!existsSync(distIndex)) {
    if (existsSync(join(process.cwd(), 'src', 'index.ts'))) {
      console.log('Building first...');
      run('npm', ['run', 'build'], { cwd: process.cwd() });
    } else {
      fail('Not in an AOS project directory. Run "aos init" to create one first.');
    }
  }

  spawnSync('node', ['dist/index.js'], {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: true,
  });
}

function status(): void {
  const statusScript = join(process.cwd(), 'scripts', 'status.ts');
  if (!existsSync(statusScript)) {
    fail('Not in an AOS project directory. Run "aos init" to create one first.');
  }

  run('npx', ['tsx', statusScript], { cwd: process.cwd() });
}

function printHelp(): void {
  console.log(`
${BOLD}AOS — Alfred Operating System${RESET}
Personal AI assistant powered by Claude Code

${BOLD}Usage:${RESET}
  aos init [directory]   Create a new AOS project
  aos start              Start the bot (from project directory)
  aos status             Health check (from project directory)
  aos help               Show this message

${BOLD}Quick start:${RESET}
  aos init my-assistant
  cd my-assistant
  aos start

${BOLD}More info:${RESET}
  https://github.com/GregMotenJr/aoc
`);
}

// ─── Main ────────────────────────────────────────

const command = process.argv[2];

switch (command) {
  case 'init':
  case 'setup':
  case 'create':
    init(process.argv[3]).catch((err) => {
      fail(`Setup failed: ${err instanceof Error ? err.message : String(err)}`);
    });
    break;
  case 'start':
  case 'run':
    start();
    break;
  case 'status':
    status();
    break;
  case 'help':
  case '--help':
  case '-h':
    printHelp();
    break;
  case undefined:
    printHelp();
    break;
  default:
    console.log(`Unknown command: ${command}\n`);
    printHelp();
    process.exit(1);
}
