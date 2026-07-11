/**
 * Password reset routes (Sprint 6, Phase 3).
 *
 *   GET  /api/v1/auth/reset-password/:token
 *     - Public, no auth required.
 *     - Read-only token peek. Returns whether the token is valid, expired,
 *       used, or invalid — without consuming it. The reset-password/[token]
 *       page calls this on mount to choose which UI state to render.
 *
 *   POST /api/v1/auth/forgot-password
 *     - Public, rate-limited (1 per 5 min, 5 per hour per email).
 *     - Always returns 200 to prevent email enumeration. If the user is
 *       missing, no-op. If the user exists, issues a reset token and sends
 *       the email.
 *
 *   POST /api/v1/auth/reset-password
 *     - Public.
 *     - Body: { token, password }. Consumes the token, updates the password,
 *       revokes all refresh tokens for the user, and sends a confirmation
 *       email — all in one atomic transaction.
 */

import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { forgotPasswordSchema, resetPasswordSchema } from '@fieldconnect/shared';
import * as passwordResetTokenQueries from '../../db/queries/password-reset-tokens';
import * as users from '../../db/queries/users';
import * as refreshTokenQueries from '../../db/queries/refresh-tokens';
import * as sessions from '../../db/queries/sessions';
import * as rateLimit from '../../db/queries/rate-limit';
import * as authAuditLog from '../../db/queries/auth-audit-logs';
import { pool } from '../../db';
import { sendPasswordResetEmailFireAndForget, sendPasswordChangedEmailFireAndForget } from '../../services/password-reset';

export async function passwordResetRoutes(app: FastifyInstance) {
  /**
   * GET /api/v1/auth/reset-password/:token
   * Read-only peek — validates without consuming. The frontend calls this
   * on mount to choose between the form and the "expired" state.
   */
  app.get('/api/v1/auth/reset-password/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    if (!token || typeof token !== 'string' || token.length < 1) {
      return reply.status(400).send({
        success: false,
        valid: false,
        reason: 'invalid',
      });
    }

    const lookup = await passwordResetTokenQueries.peek(token);
    if (!lookup.ok) {
      return reply.status(200).send({
        success: true,
        valid: false,
        reason: lookup.reason,
      });
    }

    return { success: true, valid: true };
  });

  /**
   * POST /api/v1/auth/forgot-password
   * Body: { email }
   */
  app.post('/api/v1/auth/forgot-password', async (request, reply) => {
    const parsed = forgotPasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: parsed.error.errors[0].message,
      });
    }

    const { email } = parsed.data;
    const normalizedEmail = email.toLowerCase();
    const ipAddress = request.ip;

    // Two rate-limit windows. See resend-verification for the same pattern.
    // Stricter thresholds: 1 per 5 minutes, 5 per hour — password reset is
    // rarer and more sensitive than email resend.
    const minuteCheck = await rateLimit.check({
      scopeKey: `forgot-password:${normalizedEmail}`,
      windowSeconds: 300, // 5 min
      max: 1,
    });
    if (!minuteCheck.allowed) {
      return reply.status(429).send({
        success: false,
        error: 'Please wait a moment before requesting another reset link.',
        retryAfter: Math.ceil((minuteCheck.resetAt.getTime() - Date.now()) / 1000),
      });
    }

    const hourCheck = await rateLimit.check({
      scopeKey: `forgot-password-hourly:${normalizedEmail}`,
      windowSeconds: 3600,
      max: 5,
    });
    if (!hourCheck.allowed) {
      return reply.status(429).send({
        success: false,
        error: 'Too many reset requests. Try again later.',
        retryAfter: Math.ceil((hourCheck.resetAt.getTime() - Date.now()) / 1000),
      });
    }

    // Generic 200 regardless — prevent email enumeration. Only act if the
    // user exists AND is verified (unverified users can't log in, but they
    // can still reset — the email is the recovery path).
    const user = await users.findByEmail(normalizedEmail);
    if (user) {
      // Fire-and-forget: the email send happens in the background so the
      // caller gets an immediate 200. If Resend is down, the token is still
      // persisted and the user can request again after the rate-limit window.
      sendPasswordResetEmailFireAndForget(
        { id: user.id, email: user.email, name: user.name },
        ipAddress,
      );
    }

    return { success: true };
  });

  /**
   * POST /api/v1/auth/reset-password
   * Body: { token, password }
   */
  app.post('/api/v1/auth/reset-password', async (request, reply) => {
    const parsed = resetPasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: parsed.error.errors[0].message,
      });
    }

    const { token, password } = parsed.data;
    const ipAddress = request.ip;

    // 1. Validate the token without consuming — same peek used by the GET.
    const lookup = await passwordResetTokenQueries.peek(token);
    if (!lookup.ok) {
      await authAuditLog.log(
        null,
        'password_reset_failed',
        { reason: lookup.reason },
        ipAddress,
      );
      return reply.status(400).send({
        success: false,
        reason: lookup.reason,
      });
    }

    // 2. Atomic transaction: update password, mark token used, revoke all
    //    refresh tokens. If any operation fails, the entire reset is rolled
    //    back — no partial state.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const passwordHash = await bcrypt.hash(password, 12);

      const updated = await users.setPasswordHash(lookup.userId, passwordHash);
      if (!updated) {
        // The user row vanished between token creation and now (deleted).
        await client.query('ROLLBACK');
        await authAuditLog.log(null, 'password_reset_failed', { reason: 'user_missing' }, ipAddress);
        return reply.status(400).send({
          success: false,
          reason: 'invalid',
        });
      }

      await passwordResetTokenQueries.markUsed(token);
      await refreshTokenQueries.revokeAllFamiliesForUser(lookup.userId);
      await sessions.revokeAllForUser(lookup.userId);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // 3. Audit success.
    await authAuditLog.log(lookup.userId, 'password_reset_completed', undefined, ipAddress);
    await authAuditLog.log(
      lookup.userId,
      'all_sessions_revoked',
      { reason: 'password_reset' },
      ipAddress,
    );

    // 4. Send a "your password was changed" confirmation email
    //    (fire-and-forget — the route response doesn't block on it).
    const user = await users.findById(lookup.userId);
    if (user) {
      sendPasswordChangedEmailFireAndForget(
        { id: user.id, email: user.email, name: user.name },
        ipAddress,
      );
    }

    return { success: true };
  });
}
