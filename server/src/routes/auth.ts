import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';
import { authenticate } from '../auth/guards.js';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const dummyHash = await bcrypt.hash('not-a-real-account-password', 10);

interface LoginBody {
  email: string;
  password: string;
}

interface RegisterBody {
  name: string;
  email: string;
  department: string;
  password: string;
}

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post<{ Body: RegisterBody }>(
    '/auth/register',
    {
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'email', 'department', 'password'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 150 },
            email: { type: 'string', format: 'email', maxLength: 254 },
            department: { type: 'string', minLength: 1, maxLength: 120 },
            password: { type: 'string', minLength: 12, maxLength: 200 },
          },
        },
      },
    },
    async (request, reply) => {
      const name = request.body.name.trim();
      const email = request.body.email.trim().toLowerCase();
      const department = request.body.department.trim();

      if (!name || !department) {
        return reply.code(400).send({ error: 'Name and department cannot be blank.' });
      }

      const userId = `USR-${randomUUID()}`;
      const passwordHash = await bcrypt.hash(request.body.password, 12);

      try {
        const result = await pool.query<{
          user_id: string;
          name: string;
          email: string;
          role: 'employee';
          department: string;
          manager_id: string | null;
        }>(
          `INSERT INTO users (user_id, name, email, role, department, password_hash)
           VALUES ($1, $2, $3, 'employee', $4, $5)
           RETURNING user_id, name, email, role, department, manager_id`,
          [userId, name, email, department, passwordHash],
        );

        const account = result.rows[0];
        if (!account) throw new Error('Registration did not return a user record.');

        const accessToken = app.jwt.sign(
          {
            sub: account.user_id,
            role: account.role,
            name: account.name,
            email: account.email,
            department: account.department,
            managerId: account.manager_id,
          },
          { expiresIn: '30m' },
        );

        return reply.code(201).send({
          accessToken,
          tokenType: 'Bearer',
          expiresIn: 1800,
          user: {
            userId: account.user_id,
            name: account.name,
            email: account.email,
            role: account.role,
            department: account.department,
            managerId: account.manager_id,
          },
        });
      } catch (error) {
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
          return reply.code(409).send({ error: 'An account with this email already exists.' });
        }
        throw error;
      }
    },
  );

  app.post<{ Body: LoginBody }>(
    '/auth/login',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email', maxLength: 254 },
            password: { type: 'string', minLength: 1, maxLength: 200 },
          },
        },
      },
    },
    async (request, reply) => {
      const email = request.body.email.trim().toLowerCase();
      const result = await pool.query<{
        user_id: string;
        name: string;
        email: string;
        role: 'employee' | 'hr' | 'super_admin';
        department: string;
        manager_id: string | null;
        password_hash: string | null;
        is_active: boolean;
        failed_login_attempts: number;
        locked_until: Date | null;
      }>(
        `SELECT user_id, name, email, role, department, manager_id, password_hash,
                is_active, failed_login_attempts, locked_until
         FROM users WHERE lower(email) = $1`,
        [email],
      );
      const account = result.rows[0];

      if (!account) {
        await bcrypt.compare(request.body.password, dummyHash);
        return reply.code(401).send({ error: 'Invalid email or password.' });
      }

      if (!account.is_active || (account.locked_until && account.locked_until > new Date())) {
        await bcrypt.compare(request.body.password, account.password_hash ?? dummyHash);
        return reply.code(401).send({ error: 'Invalid email or password.' });
      }

      const passwordMatches = account.password_hash
        ? await bcrypt.compare(request.body.password, account.password_hash)
        : await bcrypt.compare(request.body.password, dummyHash);

      if (!passwordMatches || !account.password_hash) {
        await pool.query(
          `UPDATE users
           SET failed_login_attempts = failed_login_attempts + 1,
               locked_until = CASE
                 WHEN failed_login_attempts + 1 >= $2 THEN NOW() + ($3 * INTERVAL '1 minute')
                 ELSE NULL
               END,
               updated_at = NOW()
           WHERE user_id = $1`,
          [account.user_id, MAX_FAILED_ATTEMPTS, LOCK_MINUTES],
        );
        return reply.code(401).send({ error: 'Invalid email or password.' });
      }

      await pool.query(
        'UPDATE users SET failed_login_attempts = 0, locked_until = NULL, updated_at = NOW() WHERE user_id = $1',
        [account.user_id],
      );

      const user = {
        sub: account.user_id,
        role: account.role,
        name: account.name,
        email: account.email,
        department: account.department,
        managerId: account.manager_id,
      };
      const accessToken = app.jwt.sign(user, { expiresIn: '30m' });

      return {
        accessToken,
        tokenType: 'Bearer',
        expiresIn: 1800,
        user: {
          userId: account.user_id,
          name: account.name,
          email: account.email,
          role: account.role,
          department: account.department,
          managerId: account.manager_id,
        },
      };
    },
  );

  app.get('/auth/me', { preHandler: authenticate }, async (request) => ({
    userId: request.user.sub,
    name: request.user.name,
    email: request.user.email,
    role: request.user.role,
    department: request.user.department,
    managerId: request.user.managerId,
  }));
}
