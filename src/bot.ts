import { Bot, InputFile } from 'grammy';
import type { Context } from 'grammy';
import { randomUUID } from 'node:crypto';
import {
  TELEGRAM_BOT_TOKEN,
  MAX_MESSAGE_LENGTH,
  TYPING_REFRESH_MS,
} from './config.js';
import {
  getSession,
  setSession,
  clearSession,
  getMemoriesForDisplay,
  createTask,
  listTasks,
  deleteTask,
  pauseTask,
  resumeTask,
  getDb,
  getStats,
} from './db.js';
import { runAgent } from './agent.js';
import { buildMemoryContext, saveConversationTurn } from './memory.js';
import { isAuthorised, redactSecrets } from './security.js';
import {
  downloadMedia,
  buildPhotoMessage,
  buildDocumentMessage,
  buildVideoMessage,
} from './media.js';
import { transcribeAudio, synthesizeSpeech, voiceCapabilities } from './voice.js';
import { computeNextRun, isValidCron } from './scheduler.js';
import { logger } from './logger.js';

const log = logger.child({ component: 'bot' });

// In-memory voice mode toggle per chat
const voiceEnabledChats = new Set<string>();

// --- Markdown-to-HTML Formatter ---

export function formatForTelegram(text: string): string {
  if (!text) return '';

  // Extract code blocks and protect them
  const codeBlocks: string[] = [];
  let processed = text.replace(
    /```(\w*)\n?([\s\S]*?)```/g,
    (_match, lang: string, code: string) => {
      const idx = codeBlocks.length;
      const escapedCode = escapeHtml(code.trimEnd());
      codeBlocks.push(
        lang
          ? `<pre><code class="language-${lang}">${escapedCode}</code></pre>`
          : `<pre>${escapedCode}</pre>`,
      );
      return `%%CODEBLOCK_${idx}%%`;
    },
  );

  // Escape HTML entities in non-code content
  processed = escapeHtml(processed);

  // Apply markdown conversions BEFORE restoring code blocks
  // so code block contents are not affected

  // Headings: # Heading -> <b>Heading</b>
  processed = processed.replace(/^#{1,6}\s+(.+)$/gm, '<b>$1</b>');

  // Bold: **text** or __text__
  processed = processed.replace(
    /\*\*(.+?)\*\*/g,
    '<b>$1</b>',
  );
  processed = processed.replace(
    /__(.+?)__/g,
    '<b>$1</b>',
  );

  // Italic: *text* or _text_ (but not inside words with underscores)
  processed = processed.replace(
    /(?<!\w)\*([^*\n]+?)\*(?!\w)/g,
    '<i>$1</i>',
  );
  processed = processed.replace(
    /(?<!\w)_([^_\n]+?)_(?!\w)/g,
    '<i>$1</i>',
  );

  // Inline code: `code`
  processed = processed.replace(
    /`([^`\n]+?)`/g,
    (_match, code: string) => `<code>${code}</code>`,
  );

  // Strikethrough: ~~text~~
  processed = processed.replace(/~~(.+?)~~/g, '<s>$1</s>');

  // Links: [text](url)
  processed = processed.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2">$1</a>',
  );

  // Checkboxes
  processed = processed.replace(/^- \[ \]/gm, '\u2610');
  processed = processed.replace(/^- \[x\]/gm, '\u2611');

  // Strip horizontal rules
  processed = processed.replace(/^(-{3,}|\*{3,})$/gm, '');

  // Strip remaining raw HTML tags (not our formatted ones)
  processed = processed.replace(
    /<(?!\/?(?:b|i|code|pre|s|a|u)\b)[^>]+>/g,
    '',
  );

  // Restore code blocks AFTER all markdown conversions
  processed = processed.replace(
    /%%CODEBLOCK_(\d+)%%/g,
    (_match, idx: string) => codeBlocks[parseInt(idx, 10)],
  );

  return processed.trim();
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// --- Message Splitting ---

export function splitMessage(text: string, limit = MAX_MESSAGE_LENGTH): string[] {
  if (!text) return [];
  if (text.length <= limit) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > limit) {
    // Find last newline before the limit
    let splitAt = remaining.lastIndexOf('\n', limit);

    // If no newline found, find last space
    if (splitAt <= 0) {
      splitAt = remaining.lastIndexOf(' ', limit);
    }

    // If still no good split point, force split at limit
    if (splitAt <= 0) {
      splitAt = limit;
    }

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }

  if (remaining) {
    chunks.push(remaining);
  }

  return chunks;
}

// --- Send Helper with HTML fallback ---

async function sendReply(
  ctx: Context,
  text: string,
): Promise<void> {
  const redacted = redactSecrets(text);
  const formatted = formatForTelegram(redacted);
  const chunks = splitMessage(formatted);

  for (const chunk of chunks) {
    try {
      await ctx.reply(chunk, { parse_mode: 'HTML' });
    } catch {
      // HTML parse error — fallback to plain text
      try {
        const plain = chunk.replace(/<[^>]+>/g, '');
        await ctx.reply(plain);
      } catch (err) {
        log.error({ err, chatId: ctx.chat?.id }, 'Failed to send message');
      }
    }
  }
}

// --- Send function for scheduler (takes chatId + text) ---
let botInstance: Bot | undefined;

export async function sendToChat(chatId: string, text: string): Promise<void> {
  if (!botInstance) throw new Error('Bot not initialized');
  const redacted = redactSecrets(text);
  const formatted = formatForTelegram(redacted);
  const chunks = splitMessage(formatted);

  for (const chunk of chunks) {
    try {
      await botInstance.api.sendMessage(chatId, chunk, {
        parse_mode: 'HTML',
      });
    } catch {
      try {
        const plain = chunk.replace(/<[^>]+>/g, '');
        await botInstance.api.sendMessage(chatId, plain);
      } catch (err) {
        log.error({ err, chatId }, 'Failed to send scheduled message');
      }
    }
  }
}

// --- Core Message Handler ---

async function handleMessage(
  ctx: Context,
  rawText: string,
  forceVoiceReply = false,
): Promise<void> {
  const chatId = String(ctx.chat?.id);
  if (!chatId) return;

  // Auth check
  if (!isAuthorised(chatId)) return;

  // Typing indicator
  let typingInterval: ReturnType<typeof setInterval> | undefined;
  const sendTyping = async () => {
    try {
      await ctx.api.sendChatAction(chatId, 'typing');
    } catch {
      // Typing indicator errors are non-critical
    }
  };

  try {
    await sendTyping();
    typingInterval = setInterval(sendTyping, TYPING_REFRESH_MS);

    // Build memory context
    const memoryContext = buildMemoryContext(chatId, rawText);
    const fullMessage = memoryContext
      ? `${memoryContext}\n\n${rawText}`
      : rawText;

    // Get session
    const sessionId = getSession(chatId) ?? undefined;

    // Run agent
    const result = await runAgent(fullMessage, sessionId, sendTyping);

    // Persist session
    if (result.newSessionId) {
      setSession(chatId, result.newSessionId);
    }

    // Save conversation turn to memory
    if (result.text) {
      saveConversationTurn(chatId, rawText, result.text);
    }

    // Send response
    if (result.text) {
      const caps = voiceCapabilities();
      const shouldVoice =
        caps.tts &&
        (forceVoiceReply || voiceEnabledChats.has(chatId));

      if (shouldVoice) {
        try {
          const audio = await synthesizeSpeech(result.text);
          await ctx.replyWithVoice(new InputFile(audio, 'response.mp3'));
        } catch (err) {
          log.warn({ err }, 'TTS failed, falling back to text');
          await sendReply(ctx, result.text);
        }
      } else {
        await sendReply(ctx, result.text);
      }
    } else {
      await sendReply(ctx, 'No response received. Try again or /newchat to start fresh.');
    }
  } finally {
    if (typingInterval) {
      clearInterval(typingInterval);
    }
  }
}

// --- Bot Factory ---

export function createBot(): Bot {
  if (!TELEGRAM_BOT_TOKEN) {
    throw new Error(
      'TELEGRAM_BOT_TOKEN not set. Run "aos setup" or add it to .env',
    );
  }

  const bot = new Bot(TELEGRAM_BOT_TOKEN);
  botInstance = bot;

  // --- Commands ---

  bot.command('start', async (ctx) => {
    const chatId = String(ctx.chat.id);
    if (!isAuthorised(chatId)) return;

    await ctx.reply(
      `<b>AOS — Alfred Operating System</b>

Your personal AI assistant, powered by Claude Code.

<b>Commands:</b>
/newchat — Start a fresh conversation
/chatid — Show your chat ID
/memory — View stored memories
/forget — Clear session (alias for /newchat)
/voice — Toggle voice replies
/schedule — Manage scheduled tasks
/backup — Download database backup
/start — Show this message

Send any text message and I'll process it through Claude Code with full tool access.`,
      { parse_mode: 'HTML' },
    );
  });

  bot.command('chatid', async (ctx) => {
    await ctx.reply(String(ctx.chat.id));
  });

  bot.command('newchat', async (ctx) => {
    const chatId = String(ctx.chat.id);
    if (!isAuthorised(chatId)) return;
    clearSession(chatId);
    await ctx.reply('Session cleared. Next message starts a fresh conversation.');
  });

  bot.command('forget', async (ctx) => {
    const chatId = String(ctx.chat.id);
    if (!isAuthorised(chatId)) return;
    clearSession(chatId);
    await ctx.reply('Session cleared. Next message starts a fresh conversation.');
  });

  bot.command('memory', async (ctx) => {
    const chatId = String(ctx.chat.id);
    if (!isAuthorised(chatId)) return;

    const memories = getMemoriesForDisplay(chatId, 10);
    if (memories.length === 0) {
      await ctx.reply('No memories stored yet.');
      return;
    }

    const lines = memories.map((m, i) => {
      const content =
        m.content.length > 100
          ? m.content.substring(0, 97) + '...'
          : m.content;
      return `${i + 1}. [${m.sector}] (${m.salience.toFixed(2)}) ${content}`;
    });

    await ctx.reply(`<b>Stored Memories</b>\n\n${lines.join('\n')}`, {
      parse_mode: 'HTML',
    });
  });

  bot.command('voice', async (ctx) => {
    const chatId = String(ctx.chat.id);
    if (!isAuthorised(chatId)) return;

    const caps = voiceCapabilities();
    if (!caps.tts) {
      await ctx.reply(
        'Voice replies not configured. Set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID in .env',
      );
      return;
    }

    if (voiceEnabledChats.has(chatId)) {
      voiceEnabledChats.delete(chatId);
      await ctx.reply('Voice replies disabled. Responses will be text.');
    } else {
      voiceEnabledChats.add(chatId);
      await ctx.reply('Voice replies enabled. Responses will be audio.');
    }
  });

  bot.command('schedule', async (ctx) => {
    const chatId = String(ctx.chat.id);
    if (!isAuthorised(chatId)) return;

    const text = ctx.message?.text ?? '';
    const parts = text.replace(/^\/schedule\s*/, '').trim();

    if (!parts || parts === 'help') {
      await ctx.reply(
        `<b>Schedule Commands</b>

/schedule list — Show all tasks
/schedule create "&lt;prompt&gt;" "&lt;cron&gt;" — Create task
/schedule pause &lt;id&gt; — Pause a task
/schedule resume &lt;id&gt; — Resume a task
/schedule delete &lt;id&gt; — Delete a task

Cron examples: "0 9 * * *" (daily 9am), "0 */4 * * *" (every 4h)`,
        { parse_mode: 'HTML' },
      );
      return;
    }

    if (parts.startsWith('list')) {
      const tasks = listTasks(chatId);
      if (tasks.length === 0) {
        await ctx.reply('No scheduled tasks.');
        return;
      }

      const lines = tasks.map((t) => {
        const prompt =
          t.prompt.length > 40
            ? t.prompt.substring(0, 37) + '...'
            : t.prompt;
        const next = new Date(t.next_run * 1000)
          .toISOString()
          .slice(0, 16)
          .replace('T', ' ');
        return `<code>${t.id.substring(0, 8)}</code> [${t.status}] ${t.schedule}\n  ${prompt}\n  Next: ${next}`;
      });

      await ctx.reply(lines.join('\n\n'), { parse_mode: 'HTML' });
      return;
    }

    if (parts.startsWith('create')) {
      // Parse: create "prompt" "cron"
      const match = parts.match(/create\s+"([^"]+)"\s+"([^"]+)"/);
      if (!match) {
        await ctx.reply(
          'Usage: /schedule create "prompt text" "cron expression"\nExample: /schedule create "Morning briefing" "0 9 * * *"',
        );
        return;
      }

      const [, prompt, cron] = match;
      if (!isValidCron(cron)) {
        await ctx.reply(`Invalid cron expression: "${cron}"\nFormat: minute hour day month weekday`);
        return;
      }

      const id = randomUUID().slice(0, 8);
      // isValidCron already passed above — non-null is safe here
      const nextRun = computeNextRun(cron)!;
      createTask(id, chatId, prompt, cron, nextRun);

      const nextDate = new Date(nextRun * 1000)
        .toISOString()
        .slice(0, 16)
        .replace('T', ' ');
      await ctx.reply(`Task created: ${id}\nPrompt: ${prompt}\nSchedule: ${cron}\nNext run: ${nextDate}`);
      return;
    }

    if (parts.startsWith('pause')) {
      const taskId = parts.replace('pause', '').trim();
      if (!taskId) {
        await ctx.reply('Usage: /schedule pause <task_id>');
        return;
      }
      pauseTask(taskId);
      await ctx.reply(`Task ${taskId} paused.`);
      return;
    }

    if (parts.startsWith('resume')) {
      const taskId = parts.replace('resume', '').trim();
      if (!taskId) {
        await ctx.reply('Usage: /schedule resume <task_id>');
        return;
      }
      const nextRun = Math.floor(Date.now() / 1000) + 60;
      resumeTask(taskId, nextRun);
      await ctx.reply(`Task ${taskId} resumed.`);
      return;
    }

    if (parts.startsWith('delete')) {
      const taskId = parts.replace('delete', '').trim();
      if (!taskId) {
        await ctx.reply('Usage: /schedule delete <task_id>');
        return;
      }
      deleteTask(taskId);
      await ctx.reply(`Task ${taskId} deleted.`);
      return;
    }

    await ctx.reply('Unknown schedule command. Use /schedule for help.');
  });

  bot.command('backup', async (ctx) => {
    const chatId = String(ctx.chat.id);
    if (!isAuthorised(chatId)) return;

    try {
      const db = getDb();
      const backupPath = db.name + '.backup';
      await db.backup(backupPath);
      await ctx.replyWithDocument(new InputFile(backupPath, 'aos-backup.db'));
    } catch (err) {
      log.error({ err }, 'Backup failed');
      await ctx.reply('Backup failed. Check logs for details.');
    }
  });

  // --- Media Handlers ---

  bot.on('message:voice', async (ctx) => {
    const chatId = String(ctx.chat.id);
    if (!isAuthorised(chatId)) return;

    const caps = voiceCapabilities();
    if (!caps.stt) {
      await ctx.reply(
        'Voice transcription not configured. Set GROQ_API_KEY in .env',
      );
      return;
    }

    try {
      const file = await ctx.getFile();
      const localPath = await downloadMedia(
        TELEGRAM_BOT_TOKEN,
        file.file_id,
        'voice.oga',
      );

      const transcript = await transcribeAudio(localPath);
      await handleMessage(ctx, `[Voice transcribed]: ${transcript}`, true);
    } catch (err) {
      log.error({ err, chatId }, 'Voice processing failed');
      await ctx.reply(
        'Could not transcribe voice. Check that GROQ_API_KEY is set in .env',
      );
    }
  });

  bot.on('message:photo', async (ctx) => {
    const chatId = String(ctx.chat.id);
    if (!isAuthorised(chatId)) return;

    try {
      const photos = ctx.message.photo;
      const largest = photos[photos.length - 1];
      const localPath = await downloadMedia(
        TELEGRAM_BOT_TOKEN,
        largest.file_id,
        'photo.jpg',
      );

      const caption = ctx.message.caption;
      const message = buildPhotoMessage(localPath, caption);
      await handleMessage(ctx, message);
    } catch (err) {
      log.error({ err, chatId }, 'Photo processing failed');
      await ctx.reply('Failed to process photo.');
    }
  });

  bot.on('message:document', async (ctx) => {
    const chatId = String(ctx.chat.id);
    if (!isAuthorised(chatId)) return;

    try {
      const doc = ctx.message.document;
      const localPath = await downloadMedia(
        TELEGRAM_BOT_TOKEN,
        doc.file_id,
        doc.file_name,
      );

      const caption = ctx.message.caption;
      const message = buildDocumentMessage(
        localPath,
        doc.file_name ?? 'document',
        caption,
      );
      await handleMessage(ctx, message);
    } catch (err) {
      log.error({ err, chatId }, 'Document processing failed');
      await ctx.reply('Failed to process document.');
    }
  });

  bot.on('message:video', async (ctx) => {
    const chatId = String(ctx.chat.id);
    if (!isAuthorised(chatId)) return;

    try {
      const video = ctx.message.video;
      const localPath = await downloadMedia(
        TELEGRAM_BOT_TOKEN,
        video.file_id,
        'video.mp4',
      );

      const caption = ctx.message.caption;
      const message = buildVideoMessage(localPath, caption);
      await handleMessage(ctx, message);
    } catch (err) {
      log.error({ err, chatId }, 'Video processing failed');
      await ctx.reply('Failed to process video.');
    }
  });

  // --- Text Message Handler ---

  bot.on('message:text', async (ctx) => {
    const chatId = String(ctx.chat.id);
    if (!isAuthorised(chatId)) return;

    const text = ctx.message.text;

    // Special non-slash commands
    if (text.toLowerCase() === 'convolife') {
      await handleMessage(ctx, text);
      return;
    }

    if (text.toLowerCase() === 'checkpoint') {
      await handleMessage(ctx, text);
      return;
    }

    await handleMessage(ctx, text);
  });

  // Error handler
  bot.catch((err) => {
    log.error({ err: err.error, ctx: err.ctx?.chat?.id }, 'Bot error');
  });

  return bot;
}
