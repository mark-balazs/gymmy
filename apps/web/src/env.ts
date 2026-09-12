/**
 * Environment validation.
 *
 * Parsed once at import. A missing or malformed variable fails the build or the
 * boot, loudly and with the variable named — rather than surfacing later as an
 * undefined connection string halfway through a request.
 */
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  /** Neon connection string. Pooled URL for the app, direct URL for migrations. */
  DATABASE_URL: z.string().url().startsWith('postgres'),

  /** `openssl rand -base64 32` */
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
  AUTH_GOOGLE_ID: z.string().min(1),
  AUTH_GOOGLE_SECRET: z.string().min(1),

  /** Set automatically by Vercel; needed locally for OAuth callbacks. */
  AUTH_URL: z.string().url().optional(),

  /** Local-only sign-in without Google. Inert outside development — the guard
   *  lives in lib/dev-auth.ts, which explains why it cannot ship. */
  AUTH_DEV_BYPASS: z.enum(['0', '1']).optional(),
});

export type Env = z.infer<typeof schema>;

/** Skipped during `next build` when no database is wired up yet, so the repo
 *  stays buildable before you have provisioned Neon. */
const SKIP = process.env.SKIP_ENV_VALIDATION === '1';

function load(): Env {
  if (SKIP) return process.env as unknown as Env;

  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${issues}\n\nSee .env.example.`);
  }
  return parsed.data;
}

export const env = load();
