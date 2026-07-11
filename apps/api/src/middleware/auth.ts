import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { jwtVerify, type JWTPayload } from 'jose';

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string;
      email: string;
      name: string;
      role: string;
    };
  }
}

const getSecret = (): Uint8Array => {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error('NEXTAUTH_SECRET environment variable is not set');
  }
  return new TextEncoder().encode(secret);
};

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

function extractPayload(payload: JWTPayload): AuthUser | null {
  const id = (payload.sub || payload.id) as string | undefined;
  if (!id) return null;
  return {
    id,
    email: (payload.email as string) || '',
    name: (payload.name as string) || '',
    role: (payload.role as string) || '',
  };
}

/**
 * Attempts to verify JWT from the Authorization header.
 * Sets request.user on success. Does NOT block — routes use requireRole() to enforce.
 */
export async function authHook(request: FastifyRequest, _reply: FastifyReply) {
  const url = request.url;
  // Skip auth only for public endpoints
  if (
    url.startsWith('/api/v1/health') ||
    url === '/api/v1/auth/login' ||
    url === '/api/v1/auth/register' ||
    url === '/api/v1/auth/refresh' ||
    url.startsWith('/api/v1/auth/verify-email') ||
    url === '/api/v1/auth/resend-verification' ||
    url === '/api/v1/auth/forgot-password' ||
    url.startsWith('/api/v1/auth/reset-password')
  ) {
    return;
  }

  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return;
  }

  const token = authHeader.substring(7);
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ['HS256'],
    });
    const user = extractPayload(payload);
    if (user) {
      request.user = user;
    }
  } catch {
    // Invalid token — user stays undefined
  }
}

/**
 * Returns a preHandler that rejects unauthenticated or wrong-role requests.
 * Use as a route preHandler: { preHandler: [requireRole('admin')] }
 */
export function requireRole(...roles: string[]) {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    if (!request.user) {
      return reply.status(401).send({
        success: false,
        error: 'Authentication required',
      });
    }

    if (roles.length > 0 && !roles.includes(request.user.role)) {
      return reply.status(403).send({
        success: false,
        error: `Access denied. Required role: ${roles.join(' or ')}`,
      });
    }
  };
}

/**
 * Register the global auth hook on the Fastify instance.
 * Must be called after app is created, before routes are registered.
 */
export function registerAuth(app: FastifyInstance) {
  app.decorateRequest('user', undefined);
  app.addHook('onRequest', authHook);
}
