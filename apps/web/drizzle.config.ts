import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

/* drizzle-kit runs with apps/web as its cwd, so a bare `dotenv/config` would
 * silently miss the repo-root .env and fall back to the placeholder below —
 * which fails as an opaque connection error rather than a missing variable. */
const root = fileURLToPath(new URL('../../', import.meta.url));

/* Captured before the files load, because `.env.local` is read with
 * `override: true` and would otherwise win. An explicitly exported variable has
 * to beat a file here: migrating a remote database is done as
 * `DATABASE_URL=<remote> npm run db:migrate`, and silently applying that to
 * localhost instead — reporting success the whole way — is the kind of mistake
 * you only notice when production turns out to have no tables. */
const explicit = process.env.DATABASE_URL;

loadEnv({ path: `${root}.env` });
loadEnv({ path: `${root}apps/web/.env.local`, override: true });

const url = explicit ?? process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    'DATABASE_URL is not set. Copy .env.example to .env at the repo root.\n' +
      'For a local database: docker compose up -d db',
  );
}

export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url },
  verbose: true,
  strict: true,
});
