#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { initDatabase, createTask, listTasks, deleteTask, pauseTask, resumeTask, getTask } from './db.js';
import { computeNextRun, isValidCron } from './scheduler.js';

const args = process.argv.slice(2);
const command = args[0];

function printUsage(): void {
  console.log(`
AOS Schedule CLI — Manage scheduled tasks

Usage:
  aos schedule create "<prompt>" "<cron>" <chat_id>   Create a new task
  aos schedule list [--chat-id <id>]                  List all tasks
  aos schedule delete <task_id>                       Delete a task
  aos schedule pause <task_id>                        Pause a task
  aos schedule resume <task_id>                       Resume a paused task

Examples:
  aos schedule create "Summarize my emails" "0 9 * * *" 123456789
  aos schedule list
  aos schedule pause abc-123
  `);
}

function formatDate(epoch: number | null): string {
  if (!epoch) return 'never';
  return new Date(epoch * 1000).toISOString().replace('T', ' ').slice(0, 19);
}

function run(): void {
  // Initialize database (reads config, connects to SQLite)
  initDatabase();

  switch (command) {
    case 'create': {
      const prompt = args[1];
      const cron = args[2];
      const chatId = args[3];

      if (!prompt || !cron || !chatId) {
        console.error('Error: create requires "<prompt>" "<cron>" <chat_id>');
        console.error('Example: aos schedule create "Daily briefing" "0 9 * * *" 123456789');
        process.exit(1);
      }

      if (!isValidCron(cron)) {
        console.error(`Error: Invalid cron expression "${cron}"`);
        console.error('Format: minute hour day-of-month month day-of-week');
        console.error('Examples: "0 9 * * *" (daily 9am), "0 */4 * * *" (every 4 hours)');
        process.exit(1);
      }

      const id = randomUUID().slice(0, 8);
      // isValidCron already passed above — non-null is safe here
      const nextRun = computeNextRun(cron)!;
      createTask(id, chatId, prompt, cron, nextRun);
      console.log(`Task created: ${id}`);
      console.log(`  Prompt: ${prompt}`);
      console.log(`  Schedule: ${cron}`);
      console.log(`  Next run: ${formatDate(nextRun)}`);
      break;
    }

    case 'list': {
      const chatIdFilter = args[1] === '--chat-id' ? args[2] : undefined;
      const tasks = listTasks(chatIdFilter);

      if (tasks.length === 0) {
        console.log('No scheduled tasks found.');
        break;
      }

      // ASCII table output
      console.log(
        'ID'.padEnd(10) +
          'Status'.padEnd(10) +
          'Schedule'.padEnd(18) +
          'Next Run'.padEnd(22) +
          'Prompt',
      );
      console.log('-'.repeat(80));

      for (const t of tasks) {
        const promptPreview =
          t.prompt.length > 30 ? t.prompt.substring(0, 27) + '...' : t.prompt;
        console.log(
          t.id.substring(0, 8).padEnd(10) +
            t.status.padEnd(10) +
            t.schedule.padEnd(18) +
            formatDate(t.next_run).padEnd(22) +
            promptPreview,
        );
      }
      break;
    }

    case 'delete': {
      const taskId = args[1];
      if (!taskId) {
        console.error('Error: delete requires <task_id>');
        process.exit(1);
      }
      deleteTask(taskId);
      console.log(`Task ${taskId} deleted.`);
      break;
    }

    case 'pause': {
      const taskId = args[1];
      if (!taskId) {
        console.error('Error: pause requires <task_id>');
        process.exit(1);
      }
      pauseTask(taskId);
      console.log(`Task ${taskId} paused.`);
      break;
    }

    case 'resume': {
      const taskId = args[1];
      if (!taskId) {
        console.error('Error: resume requires <task_id>');
        process.exit(1);
      }
      const task = getTask(taskId);
      if (!task) {
        console.error(`Task ${taskId} not found.`);
        process.exit(1);
      }
      const nextRun = computeNextRun(task.schedule) ?? Math.floor(Date.now() / 1000) + 60;
      resumeTask(taskId, nextRun);
      console.log(`Task ${taskId} resumed. Next run: ${formatDate(nextRun)}`);
      break;
    }

    default:
      printUsage();
      break;
  }
}

run();
