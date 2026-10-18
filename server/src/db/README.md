# Database migrations

Run `npm run db:migrate` from `server/` to apply numbered SQL migrations in lexicographic order. Applied filenames are recorded in `schema_migrations`, so the command can safely be run again to apply only pending migrations.

Create a new, sequentially numbered SQL file for schema changes. Do not edit a migration after it has been applied to a shared database; add a follow-up migration instead. The company-document migrations require PostgreSQL with the pgvector extension available.

`npm run db:check` checks connectivity using the `DATABASE_URL` (and optional `CA_CERT_PATH`) configured in `server/.env`.