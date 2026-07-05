import Fastify from 'fastify';
import cors from '@fastify/cors';
import { healthRoutes } from './routes/health';
import { loginRoutes } from './routes/auth/login';
import { registerRoutes } from './routes/auth/register';

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

  // Health check routes
  await app.register(healthRoutes);

  // Auth routes
  await app.register(loginRoutes);
  await app.register(registerRoutes);

  // Start server
  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`FieldConnect API running on http://${HOST}:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
