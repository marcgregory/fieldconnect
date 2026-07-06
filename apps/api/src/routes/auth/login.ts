import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { loginSchema } from '@fieldconnect/shared';
import { findByEmail } from '../../db/queries/users';
import * as refreshTokenQueries from '../../db/queries/refresh-tokens';

export async function loginRoutes(app: FastifyInstance) {
  app.post('/api/v1/auth/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: parsed.error.errors[0].message,
      });
    }

    const { email, password } = parsed.data;
    const user = await findByEmail(email);

    if (!user) {
      return reply.status(401).send({
        success: false,
        error: 'Invalid email or password',
      });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return reply.status(401).send({
        success: false,
        error: 'Invalid email or password',
      });
    }

    // Issue a refresh token (30-day persistent session)
    const refreshToken = await refreshTokenQueries.create(
      user.id,
      request.headers['user-agent']?.slice(0, 500),
      request.ip,
    );

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
