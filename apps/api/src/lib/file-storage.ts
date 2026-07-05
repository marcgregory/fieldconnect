import path from 'path';
import fs from 'fs/promises';
import { randomUUID } from 'crypto';

const UPLOADS_DIR = path.resolve(__dirname, '..', '..', 'uploads');

/**
 * Save an uploaded file to disk.
 * Returns the relative file path (e.g., "schedule-uuid/filename-uuid.jpg").
 */
export async function saveUpload(
  scheduleId: string,
  originalName: string,
  buffer: Buffer,
): Promise<string> {
  const dir = path.join(UPLOADS_DIR, scheduleId);
  await fs.mkdir(dir, { recursive: true });

  // Generate unique filename to prevent collisions
  const ext = path.extname(originalName) || '.bin';
  const safeName = `${randomUUID()}${ext}`;
  const filePath = path.join(dir, safeName);

  await fs.writeFile(filePath, buffer);

  return `${scheduleId}/${safeName}`;
}

/**
 * Delete a file from disk by its relative path.
 */
export async function deleteUpload(relativePath: string): Promise<void> {
  const fullPath = path.join(UPLOADS_DIR, relativePath);
  try {
    await fs.unlink(fullPath);
  } catch {
    // File may not exist — ignore
  }
}

/**
 * Get the full filesystem path for a relative upload path.
 */
export function getUploadPath(relativePath: string): string {
  return path.join(UPLOADS_DIR, relativePath);
}
