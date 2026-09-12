import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

/* drizzle-kit runs with apps/web as its cwd, so a bare `dotenv/config` would
 * silently miss the repo-root .env and fall back to the placeholder below —
 * which fails as an opaque connection error rather than a missing variable. */
const root = fileURLToPath(new URL('../../', import.meta.url));
loadEnv({ path: `${root}.env` });
loadEnv({ path: `${root}apps/web/.env.local`, override: true });

const url = process.env.DATABASE_URL;
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
