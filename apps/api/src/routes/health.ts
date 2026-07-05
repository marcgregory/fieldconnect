import type { FastifyInstance } from 'fastify';
import { testConnection } from '../db';

export async function healthRoutes(app: FastifyInstance) {
  // Web health — is the API server running?
  app.get('/api/v1/health', async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      service: 'fieldconnect-api',
    };
  });

  // Database health — is the database reachable?
  app.get('/api/v1/health/db', async () => {
    const connected = await testConnection();
    return {
      status: connected ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
      database: connected ? 'connected' : 'disconnected',
    };
  });
}
