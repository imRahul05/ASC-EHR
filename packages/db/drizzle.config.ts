import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit tooling config (`pnpm db:generate` / `pnpm db:migrate`).
 *
 * Tooling-only exception to "env via parseEnv()": drizzle-kit loads this file
 * itself, so it reads DATABASE_URL directly. Defaults to the local
 * docker-compose database (dev-only credentials). App code never reads
 * process.env — it passes the parsed URL to `createDb({ url })`.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://asc:asc@localhost:5432/asc_ehr',
  },
  strict: true,
  verbose: false,
});
