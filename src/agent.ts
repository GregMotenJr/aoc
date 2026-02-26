import {
  query,
  type SDKMessage,
  type SDKSystemMessage,
  type SDKResultMessage,
} from '@anthropic-ai/claude-agent-sdk';
import { WORKSPACE_DIR } from './config.js';
import { logger } from './logger.js';

const log = logger.child({ component: 'agent' });

export interface AgentResult {
  text: string | null;
  newSessionId?: string;
  inputTokens?: number;
  outputTokens?: number;
}

export async function runAgent(
  message: string,
  sessionId?: string,
  onTyping?: () => void,
): Promise<AgentResult> {
  let typingInterval: ReturnType<typeof setInterval> | undefined;
  let newSessionId: string | undefined;
  let text: string | null = null;
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;

  try {
    // Start typing indicator refresh
    if (onTyping) {
      onTyping();
      typingInterval = setInterval(onTyping, 4000);
    }

    log.info(
      { sessionId, messageLength: message.length },
      'Running agent query',
    );

    const conversation = query({
      prompt: message,
      options: {
        cwd: WORKSPACE_DIR,
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        settingSources: ['project', 'user'],
        ...(sessionId ? { resume: sessionId } : {}),
      },
    });

    for await (const event of conversation) {
      // Capture session ID from system init event
      if (event.type === 'system' && 'subtype' in event && event.subtype === 'init') {
        const sysEvent = event as SDKSystemMessage;
        newSessionId = sysEvent.session_id;
        log.debug({ newSessionId }, 'Session initialized');
      }

      // Extract response text from result event
      if (event.type === 'result') {
        const resultEvent = event as SDKResultMessage;
        if ('result' in resultEvent) {
          text = resultEvent.result;
        }
        if ('usage' in resultEvent && resultEvent.usage) {
          inputTokens = resultEvent.usage.input_tokens;
          outputTokens = resultEvent.usage.output_tokens;
        }
      }
    }

    log.info(
      {
        newSessionId,
        responseLength: text?.length ?? 0,
        inputTokens,
        outputTokens,
      },
      'Agent query completed',
    );

    return { text, newSessionId, inputTokens, outputTokens };
  } catch (err) {
    log.error(
      { err, sessionId, category: 'AgentError' },
      'Agent query failed',
    );
    return {
      text: 'I ran into an error processing that. Try again or /newchat to start fresh.',
      newSessionId: undefined,
    };
  } finally {
    if (typingInterval) {
      clearInterval(typingInterval);
    }
  }
}
