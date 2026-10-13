import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required. Copy .env.example to .env and configure PostgreSQL.');
}

const databaseUrl = new URL(connectionString);
const caCertPath = process.env.CA_CERT_PATH;
const ssl = caCertPath
  ? {
      rejectUnauthorized: true,
      ca: readFileSync(resolve(process.cwd(), caCertPath), 'utf8'),
    }
  : undefined;

// Keep TLS settings in the Pool options so pg's connection-string sslmode
// cannot replace the explicitly configured CA certificate.
if (ssl) {
  databaseUrl.searchParams.delete('sslmode');
}

export const pool = new Pool({
  connectionString: databaseUrl.toString(),
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ssl,
});

pool.on('error', (error) => {
  console.error('Unexpected PostgreSQL pool error:', error);
});
