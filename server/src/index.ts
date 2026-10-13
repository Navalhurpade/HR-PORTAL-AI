import 'dotenv/config';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { randomBytes } from 'node:crypto';
import { pool } from './db/pool.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerChatRoute } from './routes/chat.js';
import { registerLeaveRoutes } from './routes/leaves.js';
import { registerUserRoutes } from './routes/users.js';

const app = Fastify({ logger: true });
const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '127.0.0.1';
const allowedOrigins = (process.env.CLIENT_ORIGIN ?? 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((origin) => origin.trim());
const jwtSecret =
  process.env.JWT_SECRET ?? (process.env.NODE_ENV === 'production' ? '' : randomBytes(48).toString('base64url'));

if (jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be configured with at least 32 characters in production.');
}

if (!process.env.JWT_SECRET) {
  app.log.warn(
    'JWT_SECRET is not configured; using an ephemeral development secret. Tokens expire when the server restarts.',
  );
}

await app.register(cors, {
  origin: allowedOrigins,
});
await app.register(rateLimit, { global: false });
await app.register(jwt, { secret: jwtSecret });

await app.register(registerAuthRoutes);
await app.register(registerChatRoute);
await app.register(registerLeaveRoutes);
await app.register(registerUserRoutes);

app.get('/health', async (_request, reply) => {
  try {
    await pool.query('SELECT 1');
    return { status: 'ok', database: 'connected' };
  } catch (error) {
    app.log.error(error, 'Database health check failed');
    return reply.code(503).send({ status: 'error', database: 'unavailable' });
  }
});

app.addHook('onClose', async () => {
  await pool.end();
});

try {
  await pool.query('SELECT 1');
  app.log.info('PostgreSQL connection established successfully.');
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error, 'Unable to connect to PostgreSQL or start the API.');
  await app.close();
  process.exitCode = 1;
}
