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
import { projectRoutes } from './routes/projects';
import { timeEntryRoutes } from './routes/time-entries';
import { technicianRoutes } from './routes/technicians';
import { scheduleRoutes } from './routes/schedules';
// Report routes
import { reportRoutes } from './routes/reports';
import { dashboardRoutes } from './routes/dashboard';
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

  const app = Fastify({
    logger: {
      transport: {
        target: 'pino-pretty',
        options: { colorize: true },
      },
    },
    trustProxy: true,
  });

  // CORS — allow the Next.js frontend
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
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

  // Serve static uploads
  await app.register(fastifyStatic, {
    root: UPLOADS_DIR,
    prefix: '/uploads/',
    decorateReply: false,
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

  // Activity feed
  await app.register(activityRoutes);

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

main();
