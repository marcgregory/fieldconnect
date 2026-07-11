/**
 * Preview / console email provider — for development and tests.
 *
 * - Always logs a one-line summary to stdout.
 * - When `writeFiles` is true (provider name `preview`), also writes the
 *   rendered HTML to `.emails/{timestamp}-{category}.html` for browser
 *   inspection. The directory is created on first send.
 * - Filenames never include recipient addresses, tokens, or user data.
 * - File-write failures are swallowed — preview is a dev convenience, not
 *   a delivery path. The console log line still appears.
 */

import fs from 'fs';
import path from 'path';
import type { EmailMessage, EmailProvider, EmailProviderName, SendResult } from './provider';

const PREVIEW_DIR = path.resolve(process.cwd(), '.emails');

function safeCategory(category: string): string {
  // EmailCategory values are already kebab-case, but be defensive in case
  // a future category carries characters that are awkward in filenames.
  return category.replace(/[^a-z0-9-]/gi, '').toLowerCase();
}

function timestampForFilename(): string {
  // 2026-07-11T12-05-01-234Z (colons are problematic on Windows)
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export interface PreviewProviderOptions {
  /** When true, write rendered HTML to `.emails/...`. Set false for `console` mode. */
  writeFiles: boolean;
}

export class PreviewProvider implements EmailProvider {
  readonly name: EmailProviderName;

  constructor(private readonly options: PreviewProviderOptions) {
    this.name = options.writeFiles ? 'preview' : 'console';
  }

  private writePreviewFile(message: EmailMessage): string | null {
    if (!this.options.writeFiles) return null;

    try {
      if (!fs.existsSync(PREVIEW_DIR)) {
        fs.mkdirSync(PREVIEW_DIR, { recursive: true });
      }
      const filename = `${timestampForFilename()}-${safeCategory(message.category)}.html`;
      const fullPath = path.join(PREVIEW_DIR, filename);
      fs.writeFileSync(fullPath, message.html, 'utf8');
      return path.join('.emails', filename);
    } catch (err) {
      // Never fail the caller — preview is a dev convenience.
      // eslint-disable-next-line no-console
      console.warn(
        `[email:${this.name}] failed to write preview file: ${(err as Error).message}`,
      );
      return null;
    }
  }

  async send(message: EmailMessage): Promise<SendResult> {
    const file = this.writePreviewFile(message);

    // In production-like logging, never print tokens or sensitive links.
    // The provider does not receive raw tokens — it receives already-built
    // URLs from templates. We still log subject + recipient only.
    // eslint-disable-next-line no-console
    console.log(
      `[email:${this.name}] ${message.category} → ${message.to} — ${message.subject}` +
        (file ? ` (file: ${file})` : ''),
    );

    return { ok: true, messageId: `preview-${Date.now()}` };
  }
}
