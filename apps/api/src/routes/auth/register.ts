import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { registerSchema } from '@fieldconnect/shared';
import { findByEmail, createUser } from '../../db/queries/users';

export async function registerRoutes(app: FastifyInstance) {
  app.post('/api/v1/auth/register', async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: parsed.error.errors[0].message,
      });
    }

    const { email, name, password, role } = parsed.data;

    const existing = await findByEmail(email);
    if (existing) {
      return reply.status(409).send({
        success: false,
        error: 'An account with this email already exists',
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await createUser({ email, name, passwordHash, role });

    return reply.status(201).send({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  });
}
