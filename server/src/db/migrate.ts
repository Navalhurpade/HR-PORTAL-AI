import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';
const migrationsDirectory = fileURLToPath(new URL('./migrations/', import.meta.url));

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      migration_name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const files = (await readdir(migrationsDirectory)).filter((file) => file.endsWith('.sql')).sort();

  for (const file of files) {
    const alreadyApplied = await pool.query('SELECT 1 FROM schema_migrations WHERE migration_name = $1', [file]);

    if (alreadyApplied.rowCount) {
      console.info(`Skipping ${file}; already applied.`);
      continue;
    }

    const sql = await readFile(new URL(`./migrations/${file}`, import.meta.url), 'utf8');
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (migration_name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.info(`Applied ${file}.`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
} finally {
  await pool.end();
}
