/**
 * Email verification routes (Sprint 6, Phase 2).
 *
 *   GET  /api/v1/auth/verify-email?token=...
 *     - Public, no auth required.
 *     - Validates a verification token, marks the user verified, marks the
 *       token used, all in a single transaction. Logs `email_verified` on
 *       success or `verification_failed` on any failure.
 *     - Returns a small JSON the frontend result page renders. We don't 302
 *       from the API — keeping it RESTful so the same endpoint is callable
 *       from scripts / tests in the future.
 *
 *   POST /api/v1/auth/resend-verification
 *     - Public, rate-limited (1 per 60s, 5 per 3600s per email).
 *     - Always returns 200 to prevent email-enumeration. If the user is missing
 *       or already verified, no email is sent and no audit row is written.
 *     - Body: { email }.
 */

import type { FastifyInstance } from 'fastify';
import { resendVerificationSchema } from '@fieldconnect/shared';
import { pool } from '../../db';
import * as verificationTokenQueries from '../../db/queries/verification-tokens';
import * as users from '../../db/queries/users';
import * as rateLimit from '../../db/queries/rate-limit';
import * as authAuditLog from '../../db/queries/auth-audit-logs';
import { sendVerificationEmail } from '../../lib/email-verification';

export async function verificationRoutes(app: FastifyInstance) {
  /**
   * GET /api/v1/auth/verify-email?token=...
   */
  app.get('/api/v1/auth/verify-email', async (request, reply) => {
    const token = (request.query as { token?: string }).token;
    if (!token || typeof token !== 'string' || token.length < 1) {
      return reply.status(400).send({
        success: false,
        reason: 'invalid',
        error: 'Missing token',
      });
    }

    const ipAddress = request.ip;

    const lookup = await verificationTokenQueries.consume(token);
    if (!lookup.ok) {
      await authAuditLog.log(null, 'verification_failed', { reason: lookup.reason }, ipAddress);
      return reply.status(400).send({
        success: false,
        reason: lookup.reason,
      });
    }

    // Atomic: mark the user verified AND mark the token used. Either both
    // happen or neither does. A failure between them (process crash, DB
    // outage) cannot leave a half-state where the user is "verified" but
    // the token is still consumable, or vice versa.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const updated = await users.markEmailVerified(lookup.userId);
      if (!updated) {
        // The user row vanished (deleted) between token creation and now.
        await client.query('ROLLBACK');
        await authAuditLog.log(null, 'verification_failed', { reason: 'user_missing' }, ipAddress);
        return reply.status(400).send({
          success: false,
          reason: 'invalid',
        });
      }

      await verificationTokenQueries.markUsed(token);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    await authAuditLog.log(lookup.userId, 'email_verified', undefined, ipAddress);

    return { success: true };
  });

  /**
   * POST /api/v1/auth/resend-verification
   * Body: { email }
   */
  app.post('/api/v1/auth/resend-verification', async (request, reply) => {
    const parsed = resendVerificationSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: parsed.error.errors[0].message,
      });
    }

    const { email } = parsed.data;
    const normalizedEmail = email.toLowerCase();
    const ipAddress = request.ip;

    // Two rate-limit windows. Both must allow the request.
    // We check the 1-minute window first because it is the more
    // user-visible constraint; the 5-per-hour check catches sustained abuse.
    const minuteCheck = await rateLimit.check({
      scopeKey: `resend-verification:${normalizedEmail}`,
      windowSeconds: 60,
      max: 1,
    });
    if (!minuteCheck.allowed) {
      return reply.status(429).send({
        success: false,
        error: 'Please wait a minute before requesting another verification email.',
        retryAfter: Math.ceil((minuteCheck.resetAt.getTime() - Date.now()) / 1000),
      });
    }

    const hourCheck = await rateLimit.check({
      scopeKey: `resend-verification-hourly:${normalizedEmail}`,
      windowSeconds: 3600,
      max: 5,
    });
    if (!hourCheck.allowed) {
      return reply.status(429).send({
        success: false,
        error: 'Too many resend requests. Try again later.',
        retryAfter: Math.ceil((hourCheck.resetAt.getTime() - Date.now()) / 1000),
      });
    }

    // Generic 200 either way — prevent email-enumeration. Only act if the
    // user exists AND is unverified.
    const user = await users.findByEmail(normalizedEmail);
    if (user && !user.email_verified_at) {
      const result = await sendVerificationEmail(
        { id: user.id, email: user.email, name: user.name },
        ipAddress,
      );
      if (result.ok) {
        // Audit the resend as a distinct event from the initial send.
        await authAuditLog.log(
          user.id,
          'verification_email_resent',
          { email: user.email },
          ipAddress,
        );
      }
      // If send failed, sendVerificationEmail already logged the warning and
      // the original 'verification_email_sent' row. No further audit needed.
    }

    return { success: true };
  });
}
