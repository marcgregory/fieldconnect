import type { FastifyInstance, FastifyRequest } from 'fastify';
import bcrypt from 'bcryptjs';
import { loginSchema } from '@fieldconnect/shared';
import { findByEmail } from '../../db/queries/users';
import * as refreshTokenQueries from '../../db/queries/refresh-tokens';
import * as loginAttempts from '../../db/queries/login-attempts';
import * as authAuditLog from '../../db/queries/auth-audit-logs';

/**
 * A bcrypt hash of a high-entropy dummy string, pre-computed once at module
 * load. When the login email is not found, we compare the submitted password
 * against this hash instead of short-circuiting, so both the "unknown email"
 * and "wrong password" paths take the same bcrypt time.
 */
const DUMMY_HASH = bcrypt.hashSync('__dummy_no_match__' + Math.random(), 10);

/**
 * Resolve the real client IP for rate-limiting purposes.
 *
 * Priority:
 *   1. X-Real-IP header — set by the Next.js BFF proxy (/api/auth/login)
 *      which extracts the first IP from the Render-proxy-supplied
 *      X-Forwarded-For chain. This prevents spoofing because an attacker's
 *      forged X-Forwarded-For only reaches Next.js, not the API directly.
 *   2. request.ip — fallback when the request arrives directly (dev mode,
 *      health checks, etc.) or from another trusted path.
 */
function resolveClientIp(request: FastifyRequest): string {
  const realIp = request.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.length > 0) {
    return realIp;
  }
  return request.ip;
}

export async function loginRoutes(app: FastifyInstance) {
  app.post('/api/v1/auth/login', async (request, reply) => {
    const ipAddress = resolveClientIp(request);

    // ── 1. Per-IP rate limit ─────────────────────────────────────────────
    // Check BEFORE parsing the body so we never waste cpu on body validation
    // for a request that's already over the limit. Must be a separate query
    // from the increment-on-failure (which happens later) — this is a read
    // at a different time, so we need to simulate the increment to reserve
    // the slot. Actually, rateLimit.check() increments atomically, so we
    // charge the IP right here regardless of success/failure. The threshold
    // (10 per 5 min) is generous enough that a single successful login every
    // few minutes from one IP won't exhaust it.
    const ipLimit = await loginAttempts.checkIpLimit(ipAddress);
    if (!ipLimit.allowed) {
      await authAuditLog.log(null, 'login_rate_limited', { ip: ipAddress }, ipAddress);
      return reply.status(429).send({
        success: false,
        code: 'RATE_LIMITED',
        error: 'Too many login attempts. Please try again later.',
        retryAfter: Math.ceil((ipLimit.resetAt.getTime() - Date.now()) / 1000),
      });
    }

    // ── 2. Parse + validate body ──────────────────────────────────────────
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      // Schema errors are NOT login attempts — don't increment rate-limit.
      return reply.status(400).send({
        success: false,
        error: parsed.error.errors[0].message,
      });
    }

    const { email, password } = parsed.data;
    const normalizedEmail = email.toLowerCase();

    // ── 3. Account lockout check ─────────────────────────────────────────
    // Checked BEFORE the user lookup so we don't reveal whether an email
    // exists — both non-existent and locked emails return 429.
    const lockout = await loginAttempts.checkLockout(normalizedEmail);
    if (lockout.locked) {
      await authAuditLog.log(null, 'login_blocked_locked', { email: normalizedEmail }, ipAddress);
      // Return the generic RATE_LIMITED code so an attacker cannot distinguish a
      // locked account from a non-existent email. The enforcement is different
      // (15-min per-email timeout vs 5-min per-IP sliding window), but the
      // public error is identical.
      return reply.status(429).send({
        success: false,
        code: 'RATE_LIMITED',
        error: 'Too many login attempts. Please try again later.',
        retryAfter: lockout.remainingSeconds,
      });
    }

    // ── 4. User lookup + timing-safe password comparison ─────────────────
    // Always call bcrypt.compare with the same shape, regardless of whether
    // the user was found, so the path is indistinguishable from the outside.
    const user = await findByEmail(normalizedEmail);
    const hashToCompare = user ? user.password_hash : DUMMY_HASH;
    const valid = await bcrypt.compare(password, hashToCompare);

    if (!user || !valid) {
      // ── 5. Invalid credentials (unknown email or wrong password) ────────
      // Both paths converge here with the same response shape. The IP rate
      // limit was already charged above; now we also charge the per-account
      // failure counter.
      await loginAttempts.recordFailure({ email: normalizedEmail, ip: ipAddress });
      await authAuditLog.log(
        user?.id ?? null,
        'login_failed',
        { email: normalizedEmail },
        ipAddress,
      );
      return reply.status(401).send({
        success: false,
        error: 'Invalid email or password',
      });
    }

    // ── 6. Unverified email ──────────────────────────────────────────────
    // Do NOT count as a failure — the user has valid credentials but is
    // blocked by a separate policy. The IP rate-limit slot was already
    // charged (step 1), which is acceptable.
    if (!user.email_verified_at) {
      await authAuditLog.log(user.id, 'login_blocked_unverified', undefined, ipAddress);
      return reply.status(403).send({
        success: false,
        code: 'EMAIL_NOT_VERIFIED',
        error: 'Please verify your email before signing in.',
        canResend: true,
      });
    }

    // ── 7. Success ───────────────────────────────────────────────────────
    // Clear the lockout state (if any) and issue a refresh token.
    await loginAttempts.recordSuccess(normalizedEmail);
    await authAuditLog.log(user.id, 'login_success', undefined, ipAddress);

    const refreshToken = await refreshTokenQueries.create(
      user.id,
      request.headers['user-agent']?.slice(0, 500),
      ipAddress,
    );

    // Note: The IP rate-limit slot consumed in step 1 is not refunded on
    // success. This is intentional — the threshold (10/5min) is generous
    // and a successful login is a rare-enough event that the cost is nil.
    // Refunding would add a DELETE or decrement query for negligible gain.

    return {
      success: true,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  });
}
