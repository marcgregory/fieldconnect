/**
 * Resend transactional email provider.
 *
 * - Reads `RESEND_API_KEY`, `EMAIL_FROM`, and `APP_URL` lazily on each send.
 * - Missing env yields a clear, debuggable error (not a generic SDK error).
 * - Wraps SDK result in our `SendResult` so callers don't depend on Resend types.
 */

import { Resend } from 'resend';
import type { EmailMessage, EmailProvider, SendResult } from './provider';

export class ResendProvider implements EmailProvider {
  readonly name = 'resend' as const;

  private getClient(): Resend {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error(
        'Email provider "resend" is configured but RESEND_API_KEY is missing.',
      );
    }
    return new Resend(apiKey);
  }

  private getFromAddress(): string {
    const from = process.env.EMAIL_FROM;
    if (!from) {
      throw new Error(
        'Email provider "resend" is configured but EMAIL_FROM is missing. ' +
          'Set it to a verified sender, e.g. "FieldConnect <noreply@fieldconnect.app>".',
      );
    }
    return from;
  }

  /** Validates that APP_URL is present (needed for template link generation). */
  assertAppUrl(): void {
    if (!process.env.APP_URL) {
      throw new Error(
        'Email provider "resend" is configured but APP_URL is missing. ' +
          'Set it to the public app origin, e.g. "https://fieldconnect.app".',
      );
    }
  }

  async send(message: EmailMessage): Promise<SendResult> {
    let client: Resend;
    let from: string;
    try {
      client = this.getClient();
      from = this.getFromAddress();
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }

    try {
      const { data, error } = await client.emails.send({
        from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      });

      if (error) {
        return { ok: false, error: error.message };
      }

      return { ok: true, messageId: data?.id };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }
}
