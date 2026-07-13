import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import path from 'path';
import fs from 'fs';
import { healthRoutes } from './routes/health';
import { loginRoutes } from './routes/auth/login';
import { registerRoutes } from './routes/auth/register';
import { tokenRoutes } from './routes/auth/token';
import { refreshRoutes } from './routes/auth/refresh';
import { verificationRoutes } from './routes/auth/verification';
import { passwordResetRoutes } from './routes/auth/password-reset';
import { sessionRoutes } from './routes/auth/sessions';
import { authAuditRoutes } from './routes/auth/audit-logs';
import { projectRoutes } from './routes/projects';
import { timeEntryRoutes } from './routes/time-entries';
import { technicianRoutes } from './routes/technicians';
import { scheduleRoutes } from './routes/schedules';
// Report routes
import { reportRoutes } from './routes/reports';
import { dashboardRoutes } from './routes/dashboard';
import { completionReportRoutes } from './routes/reports/completion-report';
// Activity feed routes
import { activityRoutes } from './routes/activity';
import { registerAuth } from './middleware/auth';
import { initWebSocket } from './websocket';
import { assertEmailConfigValid } from './lib/email';

const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '0.0.0.0';

// Upload directory — ensure it exists
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export async function buildApp() {
  const app = Fastify({
    // Quiet logger in test mode; verbose in dev/prod.
    logger: process.env.NODE_ENV === 'test'
      ? false
      : {
          transport: {
            target: 'pino-pretty',
            options: { colorize: true },
          },
        },
    // trustProxy: true — Fastify reads X-Forwarded-For from the Render proxy
    // to resolve the real client IP. On Render the proxy is the only ingress
    // and overwrites any client-supplied X-Forwarded-For, so spoofing is not
    // possible. In local dev there is no proxy and request.ip returns ::1/127.0.0.1.
    // The login endpoint additionally accepts X-Real-IP from the Next.js BFF
    // proxy for defense-in-depth against spoofing.
    trustProxy: true,
  });

  // NOTE: Helmet is NOT registered here. The API serves JSON, not HTML, so
  // Content-Security-Policy (an HTML-level defense against XSS) does not apply
  // to API responses. We apply CSP to the Next.js frontend instead (see the
  // next.config.js async headers).
  //
  // The remaining security headers (HSTS, noSniff, referrerPolicy, etc.) are
  // set at the Fastify level below, after route registration, using a global
  // onSend hook. This ensures every API response carries them regardless of
  // content type.
  //
  // See: https://fastify.dev/docs/latest/Reference/Hooks/#onsend

  // CORS — allow the Next.js frontend
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  });

  // ── Security Headers ───────────────────────────────────────────────
  // Apply standard security headers to every API response.
  // CSP is intentionally omitted here — see the comment above the CORS block.
  app.addHook('onSend', async (_request, reply, payload) => {
    // X-Content-Type-Options: nosniff — prevent MIME-type sniffing
    reply.header('X-Content-Type-Options', 'nosniff');

    // X-Frame-Options: DENY — prevent rendering in <frame>/<iframe>
    // (defense against clickjacking). API responses are JSON, not HTML,
    // but setting this consistently across all endpoints is harmless
    // defense-in-depth.
    reply.header('X-Frame-Options', 'DENY');

    // Referrer-Policy: strict-origin-when-cross-origin — send full URL
    // on same-origin, origin-only cross-origin, nothing when downgrading
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Permissions-Policy — disable unused browser features. Camera and
    // geolocation are needed for field technicians (photo uploads, GPS
    // clock-in). Fullscreen and wake-lock are PWA features.
    reply.header(
      'Permissions-Policy',
      'camera=(self), geolocation=(self), fullscreen=(self), screen-wake-lock=(self)',
    );

    // Cross-Origin-Resource-Policy: same-origin — prevent other origins
    // from embedding our resources (defense against cross-origin leaks)
    reply.header('Cross-Origin-Resource-Policy', 'same-origin');

    // Cross-Origin-Opener-Policy: same-origin — isolate the browsing
    // context from cross-origin popups (Spectre mitigation)
    reply.header('Cross-Origin-Opener-Policy', 'same-origin');

    // Origin-Agent-Cluster: ?1 — request a separate memory/process
    // space from other same-origin pages (performance + security)
    reply.header('Origin-Agent-Cluster', '?1');

    // X-DNS-Prefetch-Control: off — disable speculative DNS prefetching
    // by the browser (privacy)
    reply.header('X-DNS-Prefetch-Control', 'off');

    // Cache-Control: no-store — prevent authenticated API responses from
    // being cached by the browser or any intermediate proxies. Every API
    // route requires authentication (except health checks), so caching
    // user-specific data is a data-exposure risk. This also covers auth
    // endpoints (login, refresh, token, logout) and CSV/XLS exports.
    reply.header('Cache-Control', 'no-store');

    // HSTS — only in production. Tell browsers to always use HTTPS.
    if (process.env.NODE_ENV === 'production') {
      reply.header(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains; preload',
      );
    }

    return payload;
  });

  // Auth middleware (parses JWT, populates request.user)
  registerAuth(app);

  // Multipart support for file uploads
  await app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10 MB
      files: 1,
    },
  });

  // Serve static uploads with secure headers
  await app.register(fastifyStatic, {
    root: UPLOADS_DIR,
    prefix: '/uploads/',
    decorateReply: false,
    // Force download rather than inline rendering (prevents XSS via SVG, etc.)
    setHeaders(res) {
      res.setHeader('Content-Disposition', 'attachment');
      res.setHeader('X-Content-Type-Options', 'nosniff');
    },
  });

  // Health check routes
  await app.register(healthRoutes);

  // Auth routes
  await app.register(loginRoutes);
  await app.register(registerRoutes);
  await app.register(tokenRoutes);
  await app.register(refreshRoutes);
  await app.register(verificationRoutes);
  await app.register(passwordResetRoutes);
  await app.register(sessionRoutes);
  await app.register(authAuditRoutes);

  // Project routes
  await app.register(projectRoutes);

  // Time entry routes
  await app.register(timeEntryRoutes);

  // Technician routes
  await app.register(technicianRoutes);

  // Schedule routes
  await app.register(scheduleRoutes);

  // Report routes
  await app.register(reportRoutes);
  await app.register(dashboardRoutes);
  await app.register(completionReportRoutes);

  // Activity feed
  await app.register(activityRoutes);

  return app;
}

async function main() {
  // Validate email config at boot. A typo in EMAIL_PROVIDER (e.g. "resent")
  // would otherwise surface only on the first email send, deep inside a
  // request handler. Fail fast instead.
  try {
    assertEmailConfigValid();
  } catch (err) {
    console.error('Email configuration is invalid:', (err as Error).message);
    process.exit(1);
  }

  const app = await buildApp();

  // Start server
  try {
    await app.listen({ port: PORT, host: HOST });

    // Initialize WebSocket after the server is listening
    const httpServer = app.server;
    initWebSocket(httpServer);

    console.log(`FieldConnect API running on http://${HOST}:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
