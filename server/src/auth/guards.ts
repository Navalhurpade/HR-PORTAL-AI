import type { FastifyReply, FastifyRequest } from 'fastify';
import { pool } from '../db/pool.js';
import type { UserRole } from './types.js';

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch {
    return reply.code(401).send({ error: 'Authentication required.' });
  }

  const result = await pool.query<{
    user_id: string;
    name: string;
    email: string;
    role: UserRole;
    department: string;
    manager_id: string | null;
    is_active: boolean;
  }>(
    `SELECT user_id, name, email, role, department, manager_id, is_active
     FROM users WHERE user_id = $1`,
    [request.user.sub],
  );
  const user = result.rows[0];

  if (!user?.is_active) {
    return reply.code(401).send({ error: 'Authentication required.' });
  }

  request.user = {
    sub: user.user_id,
    role: user.role,
    name: user.name,
    email: user.email,
    department: user.department,
    managerId: user.manager_id,
  };
}

export function requireRoles(...roles: UserRole[]) {
  return async function authorize(request: FastifyRequest, reply: FastifyReply) {
    if (!roles.includes(request.user.role)) {
      return reply.code(403).send({ error: 'You do not have permission to perform this action.' });
    }
  };
}
