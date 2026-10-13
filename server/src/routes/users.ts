import type { FastifyInstance } from 'fastify';
import { authenticate, requireRoles } from '../auth/guards.js';
import { pool } from '../db/pool.js';

export async function registerUserRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { q?: string; limit?: number; offset?: number } }>(
    '/users',
    {
      preHandler: [authenticate, requireRoles('hr', 'super_admin')],
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            q: { type: 'string', maxLength: 100 },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
            offset: { type: 'integer', minimum: 0, default: 0 },
          },
        },
      },
    },
    async (request) => {
      const result = await pool.query<{
        user_id: string;
        name: string;
        email: string;
        role: 'employee' | 'hr' | 'super_admin';
        department: string;
        manager_id: string | null;
      }>(
        `SELECT user_id, name, email, role, department, manager_id
         FROM users
         WHERE is_active = TRUE
           AND ($1::text IS NULL OR concat_ws(' ', name, email, department, user_id) ILIKE '%' || $1 || '%')
         ORDER BY name
         LIMIT $2 OFFSET $3`,
        [request.query.q?.trim() || null, request.query.limit ?? 50, request.query.offset ?? 0],
      );

      return {
        items: result.rows.map((user) => ({
          userId: user.user_id,
          name: user.name,
          email: user.email,
          role: user.role,
          department: user.department,
          managerId: user.manager_id,
        })),
        limit: request.query.limit ?? 50,
        offset: request.query.offset ?? 0,
      };
    },
  );
}
