/**
 * Email provider abstraction.
 *
 * Every email FieldConnect sends (verification, password reset, invitation,
 * welcome, and future transactional mail) goes through an `EmailProvider`.
 * Swapping the underlying transport (Resend, SES, Mailgun, ...) is a
 * one-line change in `config.ts` — call sites never touch the SDK directly.
 */

export type EmailProviderName = 'resend' | 'preview' | 'console';

/**
 * Categories are stable identifiers used for:
 * - preview-file names (e.g. `.emails/2026-07-11-verify-email.html`)
 * - structured logging
 * - future audit log row tagging
 *
 * Add a new category when adding a new template, never reuse one.
 */
export type EmailCategory =
  | 'verify-email'
  | 'password-reset'
  | 'invitation'
  | 'welcome';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  category: EmailCategory;
}

export interface SendResult {
  ok: boolean;
  /** Provider-assigned message ID (when supported). */
  messageId?: string;
  /** Human-readable error message on failure. */
  error?: string;
}

export interface EmailProvider {
  readonly name: EmailProviderName;
  send(message: EmailMessage): Promise<SendResult>;
}
