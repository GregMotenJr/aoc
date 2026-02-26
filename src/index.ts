#!/usr/bin/env node

import { mkdirSync } from 'node:fs';
import { TELEGRAM_BOT_TOKEN, STORE_DIR, UPLOADS_DIR } from './config.js';
import { initDatabase, closeDatabase } from './db.js';
import { acquireLock, releaseLock } from './security.js';
import { createBot, sendToChat } from './bot.js';
import { initScheduler, stopScheduler } from './scheduler.js';
import { runDecaySweep } from './memory.js';
import { cleanupOldUploads } from './media.js';
import { logger } from './logger.js';

const log = logger.child({ component: 'main' });

const BANNER = `
  ╔═══════════════════════════════════╗
  ║     AOS — Alfred Operating System     ║
  ║   Personal AI Assistant Runtime   ║
  ╚═══════════════════════════════════╝
`;

let shuttingDown = false;

async function main(): Promise<void> {
  console.log(BANNER);
  log.info('AOS starting...');

  // Check required config
  if (!TELEGRAM_BOT_TOKEN) {
    console.error('\nTELEGRAM_BOT_TOKEN not set.');
    console.error('Run "aos setup" or add it to your .env file.');
    console.error('Get a token from @BotFather on Telegram.\n');
    process.exit(1);
  }

  // Acquire PID lock
  acquireLock();

  // Ensure directories exist
  mkdirSync(STORE_DIR, { recursive: true });
  mkdirSync(UPLOADS_DIR, { recursive: true });

  // Initialize database
  initDatabase();

  // Run initial decay sweep and schedule daily
  runDecaySweep();
  const decayInterval = setInterval(runDecaySweep, 24 * 60 * 60 * 1000);

  // Cleanup old uploads
  cleanupOldUploads();

  // Create and start bot
  const bot = createBot();

  // Initialize scheduler with send function
  initScheduler(sendToChat);

  // Signal handlers for graceful shutdown
  const shutdown = async (signal: string) => {
    if (shuttingDown) {
      log.warn('Force shutdown');
      process.exit(1);
    }
    shuttingDown = true;
    log.info({ signal }, 'Shutting down gracefully...');

    clearInterval(decayInterval);
    stopScheduler();

    try {
      await bot.stop();
    } catch {
      // Bot may already be stopped
    }

    closeDatabase();
    releaseLock();

    log.info('Shutdown complete');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Start bot
  try {
    await bot.start({
      onStart: () => {
        log.info('AOS running — connected to Telegram');
      },
    });
  } catch (err) {
    log.fatal({ err }, 'Failed to start bot');
    closeDatabase();
    releaseLock();
    process.exit(1);
  }
}

main().catch((err) => {
  log.fatal({ err }, 'Unhandled error in main');
  releaseLock();
  process.exit(1);
});
