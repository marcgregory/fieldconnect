import Fastify from 'fastify';
import cors from '@fastify/cors';
import { healthRoutes } from './routes/health';
import { loginRoutes } from './routes/auth/login';
import { registerRoutes } from './routes/auth/register';
import { projectRoutes } from './routes/projects';
import { timeEntryRoutes } from './routes/time-entries';
import { technicianRoutes } from './routes/technicians';
import { scheduleRoutes } from './routes/schedules';
import { registerAuth } from './middleware/auth';
import { initWebSocket } from './websocket';

const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '0.0.0.0';

async function main() {
  const app = Fastify({
    logger: {
      transport: {
        target: 'pino-pretty',
        options: { colorize: true },
      },
    },
  });

  // CORS — allow the Next.js frontend
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  });

  // Auth middleware (parses JWT, populates request.user)
  registerAuth(app);

  // Health check routes
  await app.register(healthRoutes);

  // Auth routes
  await app.register(loginRoutes);
  await app.register(registerRoutes);

  // Project routes
  await app.register(projectRoutes);

  // Time entry routes
  await app.register(timeEntryRoutes);

  // Technician routes
  await app.register(technicianRoutes);

  // Schedule routes
  await app.register(scheduleRoutes);

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
