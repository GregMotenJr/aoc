import {
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { UPLOADS_DIR, TELEGRAM_BOT_TOKEN } from './config.js';
import { logger } from './logger.js';

const log = logger.child({ component: 'media' });

/**
 * Ensure the uploads directory exists.
 */
export function ensureUploadsDir(): void {
  mkdirSync(UPLOADS_DIR, { recursive: true });
}

/**
 * Sanitize a filename to only allow safe characters.
 */
export function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '-');
}

/**
 * Download a file from Telegram API and save to uploads directory.
 * Returns the local file path.
 */
export async function downloadMedia(
  botToken: string,
  fileId: string,
  originalFilename?: string,
): Promise<string> {
  // Step 1: Get file path from Telegram
  const fileInfoUrl = `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`;
  const fileInfoRes = await fetch(fileInfoUrl);
  if (!fileInfoRes.ok) {
    throw new Error(`Failed to get file info: ${fileInfoRes.status}`);
  }

  const fileInfo = (await fileInfoRes.json()) as {
    ok: boolean;
    result: { file_path: string };
  };
  if (!fileInfo.ok || !fileInfo.result.file_path) {
    throw new Error('Invalid file info response from Telegram');
  }

  // Step 2: Download the file
  const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${fileInfo.result.file_path}`;
  const downloadRes = await fetch(downloadUrl);
  if (!downloadRes.ok) {
    throw new Error(`Failed to download file: ${downloadRes.status}`);
  }

  const buffer = Buffer.from(await downloadRes.arrayBuffer());

  // Step 3: Save to uploads directory
  const ext =
    originalFilename?.split('.').pop() ??
    fileInfo.result.file_path.split('.').pop() ??
    'bin';
  const baseName = originalFilename
    ? sanitizeFilename(originalFilename)
    : `file.${ext}`;
  const localFilename = `${Date.now()}_${baseName}`;
  const localPath = join(UPLOADS_DIR, localFilename);

  ensureUploadsDir();
  writeFileSync(localPath, buffer);

  log.info(
    { fileId, localPath, bytes: buffer.length },
    'Media file downloaded',
  );
  return localPath;
}

/**
 * Build a message for Claude about a photo the user sent.
 */
export function buildPhotoMessage(localPath: string, caption?: string): string {
  let msg = `The user sent a photo. It's saved at ${localPath}.`;
  if (caption) msg += ` Caption: ${caption}`;
  return msg;
}

/**
 * Build a message for Claude about a document the user sent.
 */
export function buildDocumentMessage(
  localPath: string,
  filename: string,
  caption?: string,
): string {
  let msg = `The user sent a document '${filename}'. It's saved at ${localPath}.`;
  if (caption) msg += ` Caption: ${caption}`;
  return msg;
}

/**
 * Build a message for Claude about a video the user sent.
 */
export function buildVideoMessage(
  localPath: string,
  caption?: string,
): string {
  let msg = `The user sent a video file. It's saved at ${localPath}. Please analyze this video using the Gemini API with the GOOGLE_API_KEY from your .env file.`;
  if (caption) msg += ` Caption: ${caption}`;
  return msg;
}

/**
 * Delete uploaded files older than maxAgeMs (default 24 hours).
 */
export function cleanupOldUploads(maxAgeMs = 24 * 60 * 60 * 1000): number {
  let deleted = 0;
  try {
    ensureUploadsDir();
    const files = readdirSync(UPLOADS_DIR);
    const cutoff = Date.now() - maxAgeMs;

    for (const file of files) {
      const filePath = join(UPLOADS_DIR, file);
      try {
        const stat = statSync(filePath);
        if (stat.mtimeMs < cutoff) {
          unlinkSync(filePath);
          deleted++;
        }
      } catch {
        // Skip files we can't stat
      }
    }
  } catch {
    // Uploads dir doesn't exist yet, nothing to clean
  }

  if (deleted > 0) {
    log.info({ deleted }, 'Old uploads cleaned up');
  }
  return deleted;
}
