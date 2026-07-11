/**
 * Email verification service façade (Sprint 6, Phase 2).
 *
 * Centralizes the workflow of "issue a verification token, dispatch the email,
 * log the audit event" so that the register and resend routes stay small and
 * consistent. Also owns the URL-building policy for verification links.
 *
 * Three entry points:
 *
 *   - `sendVerificationEmail`        — async, throws on send failure
 *   - `sendVerificationEmailFireAndForget` — async, logs and swallows send failures
 *   - `buildVerifyUrl`               — pure URL builder
 *
 * The fire-and-forget variant is used by /register so a Resend outage doesn't
 * fail a perfectly good user creation. The user can resend from the pending page.
 */

import { getEmailService, renderTemplate } from './email';
import * as verificationTokenQueries from '../db/queries/verification-tokens';
import * as authAuditLog from '../db/queries/auth-audit-logs';

export function buildVerifyUrl(token: string): string {
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  return `${appUrl}/verify-email/result?token=${encodeURIComponent(token)}`;
}

/**
 * Issue a fresh verification token, send the email, and log the audit event.
 *
 * Caller-supplied failures from the email provider are returned as a flag
 * (the throw is reserved for programmer errors like missing APP_URL). Routes
 * that don't care about send success should use the fire-and-forget variant.
 */
export async function sendVerificationEmail(
  user: { id: string; email: string; name: string },
  ipAddress?: string,
): Promise<{ ok: boolean; reason?: string }> {
  // Single-active rule: supersede any prior active tokens for this user.
  // The rows are not deleted — they remain auditable.
  await verificationTokenQueries.invalidateAllForUser(user.id);

  const token = await verificationTokenQueries.create(user.id);
  const verifyUrl = buildVerifyUrl(token);

  const message = renderTemplate('verify-email', { name: user.name, verifyUrl });
  message.to = user.email;

  const result = await getEmailService().send(message);
  if (!result.ok) {
    // eslint-disable-next-line no-console
    console.warn(
      `[email-verification] send failed for user ${user.id}: ${result.error ?? 'unknown error'}`,
    );
    // Audit still records the attempt — the token exists, the user can resend.
  }

  await authAuditLog.log(
    user.id,
    'verification_email_sent',
    { email: user.email, ok: result.ok },
    ipAddress,
  );

  return { ok: result.ok, reason: result.error };
}

/**
 * Same as `sendVerificationEmail` but never throws. Used by the register route
 * so a Resend outage doesn't fail a perfectly valid user creation — the user
 * row + verification token are already persisted and the user can resend.
 */
export function sendVerificationEmailFireAndForget(
  user: { id: string; email: string; name: string },
  ipAddress?: string,
): void {
  sendVerificationEmail(user, ipAddress).catch((err) => {
    // eslint-disable-next-line no-console
    console.error(
      `[email-verification] unhandled error for user ${user.id}:`,
      err,
    );
  });
}
