/**
 * Password reset service façade (Sprint 6, Phase 3).
 *
 * Centralizes the workflow of "issue a reset token, dispatch the email,
 * log the audit event" so that the forgot-password and reset-password routes
 * stay small and consistent. Also owns the URL-building policy for reset links.
 *
 * Three entry points:
 *
 *   - `sendPasswordResetEmail`            — async, throws on send failure
 *   - `sendPasswordResetEmailFireAndForget` — async, logs and swallows send failures
 *   - `sendPasswordChangedEmail`          — async, fire-and-forget notification after success
 *   - `buildResetUrl`                     — pure URL builder
 */

import { getEmailService, renderTemplate } from '../lib/email';
import * as passwordResetTokenQueries from '../db/queries/password-reset-tokens';
import * as authAuditLog from '../db/queries/auth-audit-logs';

export function buildResetUrl(token: string): string {
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  return `${appUrl}/reset-password/${encodeURIComponent(token)}`;
}

/**
 * Issue a fresh password-reset token, send the email, and log the audit event.
 *
 * Fires and-forget internally — the caller never blocks on the email provider.
 * If the send fails, the warning is logged and the audit row still records the
 * attempt (the token is in the DB, the user can request again).
 */
export async function sendPasswordResetEmail(
  user: { id: string; email: string; name: string },
  ipAddress?: string,
): Promise<{ ok: boolean; reason?: string }> {
  // Single-active rule: supersede any prior active tokens for this user.
  await passwordResetTokenQueries.invalidateAllForUser(user.id);

  const token = await passwordResetTokenQueries.create(user.id);
  const resetUrl = buildResetUrl(token);

  const message = renderTemplate('password-reset', {
    name: user.name,
    resetUrl,
    expiresInMinutes: 60,
  });
  message.to = user.email;

  const result = await getEmailService().send(message);
  if (!result.ok) {
    // eslint-disable-next-line no-console
    console.warn(
      `[password-reset] send failed for user ${user.id}: ${result.error ?? 'unknown error'}`,
    );
  }

  await authAuditLog.log(
    user.id,
    'password_reset_requested',
    { email: user.email, ok: result.ok },
    ipAddress,
  );

  return { ok: result.ok, reason: result.error };
}

/**
 * Same as `sendPasswordResetEmail` but never throws and is not awaited.
 */
export function sendPasswordResetEmailFireAndForget(
  user: { id: string; email: string; name: string },
  ipAddress?: string,
): void {
  sendPasswordResetEmail(user, ipAddress).catch((err) => {
    // eslint-disable-next-line no-console
    console.error(`[password-reset] unhandled error for user ${user.id}:`, err);
  });
}

/**
 * Send the "your password was changed" confirmation email.
 * Fire-and-forget — the reset-password route should not block on it.
 */
export function sendPasswordChangedEmailFireAndForget(
  user: { id: string; email: string; name: string },
  ipAddress?: string,
): void {
  const loginUrl = (process.env.APP_URL || 'http://localhost:3000') + '/login';

  sendPasswordChanged(user, loginUrl, ipAddress).catch((err) => {
    // eslint-disable-next-line no-console
    console.error(`[password-reset] password-changed send failed for user ${user.id}:`, err);
  });
}

async function sendPasswordChanged(
  user: { id: string; email: string; name: string },
  loginUrl: string,
  ipAddress?: string,
): Promise<void> {
  const message = renderTemplate('password-changed', {
    name: user.name,
    loginUrl,
  });
  message.to = user.email;

  const result = await getEmailService().send(message);
  if (!result.ok) {
    // eslint-disable-next-line no-console
    console.warn(
      `[password-reset] password-changed send failed for user ${user.id}: ${result.error ?? 'unknown error'}`,
    );
  }

  await authAuditLog.log(
    user.id,
    'password_changed_notification_sent',
    { email: user.email, ok: result.ok },
    ipAddress,
  );
}
