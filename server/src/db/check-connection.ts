import 'dotenv/config';
import { pool } from './pool.js';

try {
  await pool.query('SELECT 1');
  console.info('PostgreSQL connection established successfully.');
} catch (error) {
  console.error('PostgreSQL connection check failed. Verify DATABASE_URL and CA_CERT_PATH.');
  console.error(error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
