import { readFileSync, renameSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import {
  GROQ_API_KEY,
  ELEVENLABS_API_KEY,
  ELEVENLABS_VOICE_ID,
} from './config.js';
import { logger } from './logger.js';

const log = logger.child({ component: 'voice' });

/**
 * Check which voice capabilities are available based on API key configuration.
 */
export function voiceCapabilities(): { stt: boolean; tts: boolean } {
  return {
    stt: !!GROQ_API_KEY,
    tts: !!(ELEVENLABS_API_KEY && ELEVENLABS_VOICE_ID),
  };
}

/**
 * Transcribe an audio file using Groq Whisper API.
 * Handles .oga -> .ogg rename required by Groq.
 */
export async function transcribeAudio(filePath: string): Promise<string> {
  if (!GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY not configured');
  }

  // Rename .oga to .ogg if needed (same codec, Groq requires .ogg extension)
  let actualPath = filePath;
  if (filePath.endsWith('.oga')) {
    actualPath = filePath.replace(/\.oga$/, '.ogg');
    renameSync(filePath, actualPath);
  }

  const fileBuffer = readFileSync(actualPath);
  const filename = basename(actualPath);

  // Build multipart/form-data manually
  const boundary =
    '----FormBoundary' + Math.random().toString(36).substring(2);
  const parts: Buffer[] = [];

  // File part
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: audio/ogg\r\n\r\n`,
    ),
  );
  parts.push(fileBuffer);
  parts.push(Buffer.from('\r\n'));

  // Model part
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-large-v3\r\n`,
    ),
  );

  // Response format part
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\njson\r\n`,
    ),
  );

  // Closing boundary
  parts.push(Buffer.from(`--${boundary}--\r\n`));

  const body = Buffer.concat(parts);

  const response = await fetch(
    'https://api.groq.com/openai/v1/audio/transcriptions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    log.error(
      { status: response.status, error: errorText },
      'Groq transcription failed',
    );
    throw new Error(`Groq transcription failed: ${response.status}`);
  }

  const data = (await response.json()) as { text: string };
  log.info({ textLength: data.text.length }, 'Audio transcribed successfully');
  return data.text;
}

/**
 * Synthesize text to speech using ElevenLabs API.
 * Returns MP3 audio as a Buffer.
 */
export async function synthesizeSpeech(text: string): Promise<Buffer> {
  if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) {
    throw new Error('ElevenLabs API key or voice ID not configured');
  }

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    log.error(
      { status: response.status, error: errorText },
      'ElevenLabs TTS failed',
    );
    throw new Error(`ElevenLabs TTS failed: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  log.info({ bytes: arrayBuffer.byteLength }, 'Speech synthesized');
  return Buffer.from(arrayBuffer);
}
