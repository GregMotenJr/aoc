import pkg from 'cron-parser';
const { parseExpression } = pkg as unknown as { parseExpression: typeof import('cron-parser').parseExpression };
import { runAgent } from './agent.js';
import {
  getDueTasks,
  updateTaskAfterRun,
  disableTask,
  getTask,
} from './db.js';
import { SCHEDULER_POLL_MS } from './config.js';
import { logger } from './logger.js';

const log = logger.child({ component: 'scheduler' });

type Sender = (chatId: string, text: string) => Promise<void>;

let pollInterval: ReturnType<typeof setInterval> | undefined;
let sendFn: Sender;

const THREE_STRIKE_LIMIT = 3;

/**
 * Compute the next run time from a cron expression.
 * Returns Unix epoch seconds, or null if the expression is invalid.
 */
export function computeNextRun(cronExpression: string): number | null {
  try {
    const interval = parseExpression(cronExpression);
    return Math.floor(interval.next().getTime() / 1000);
  } catch (err) {
    log.error({ cronExpression, err }, 'Invalid cron expression in computeNextRun — skipping');
    return null;
  }
}

/**
 * Validate a cron expression. Returns true if valid.
 */
export function isValidCron(cronExpression: string): boolean {
  if (!cronExpression.trim()) return false;
  if (cronExpression.trim().split(/\s+/).length !== 5) return false;
  try {
    parseExpression(cronExpression);
    return true;
  } catch {
    return false;
  }
}

/**
 * Run all due tasks. Each task runs independently — one failure doesn't block others.
 */
async function runDueTasks(): Promise<void> {
  const tasks = getDueTasks();
  if (tasks.length === 0) return;

  log.info({ count: tasks.length }, 'Running due tasks');

  for (const task of tasks) {
    const promptPreview =
      task.prompt.length > 60
        ? task.prompt.substring(0, 57) + '...'
        : task.prompt;

    try {
      // Pre-execution notification
      await sendFn(
        task.chat_id,
        `Running scheduled task: ${promptPreview}`,
      );

      // Execute via Claude Code
      const result = await runAgent(task.prompt);
      const nextRun = computeNextRun(task.schedule);

      // Send result
      if (result.text) {
        await sendFn(task.chat_id, result.text);
      }

      if (nextRun === null) {
        disableTask(task.id);
        await sendFn(task.chat_id, `Scheduled task "${promptPreview}" has an invalid cron expression and has been auto-disabled.`);
        log.error({ taskId: task.id, schedule: task.schedule }, 'Task auto-disabled — invalid cron expression');
      } else {
        updateTaskAfterRun(task.id, result.text ?? 'No response', nextRun);
        log.info({ taskId: task.id, nextRun }, 'Task completed successfully');
      }
    } catch (err) {
      log.error(
        { err, taskId: task.id, category: 'SchedulerError' },
        'Task execution failed',
      );

      const nextRun = computeNextRun(task.schedule);
      if (nextRun !== null) {
        updateTaskAfterRun(
          task.id,
          `Error: ${err instanceof Error ? err.message : String(err)}`,
          nextRun,
          true,
        );
      } else {
        disableTask(task.id);
        log.error({ taskId: task.id, schedule: task.schedule }, 'Task auto-disabled — invalid cron expression on error path');
      }

      // Three-strike auto-disable
      const updated = getTask(task.id);
      if (updated && updated.fail_count >= THREE_STRIKE_LIMIT) {
        disableTask(task.id);
        await sendFn(
          task.chat_id,
          `Scheduled task "${promptPreview}" has failed ${THREE_STRIKE_LIMIT} times consecutively and has been auto-disabled. Use /schedule resume ${task.id} to re-enable.`,
        );
        log.warn(
          { taskId: task.id },
          'Task auto-disabled after 3 consecutive failures',
        );
      } else {
        await sendFn(
          task.chat_id,
          `Scheduled task "${promptPreview}" failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }
}

/**
 * Start the scheduler polling loop.
 */
export function initScheduler(send: Sender): void {
  sendFn = send;
  pollInterval = setInterval(() => {
    runDueTasks().catch((err) => {
      log.error({ err }, 'Scheduler poll error');
    });
  }, SCHEDULER_POLL_MS);

  log.info({ pollMs: SCHEDULER_POLL_MS }, 'Scheduler started');
}

/**
 * Stop the scheduler polling loop.
 */
export function stopScheduler(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = undefined;
    log.info('Scheduler stopped');
  }
}
