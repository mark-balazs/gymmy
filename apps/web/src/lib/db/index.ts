/**
 * Database client, with two drivers.
 *
 * Neon's serverless driver speaks HTTP, which is what makes it viable in
 * Vercel's functions — a TCP pool would exhaust connections as the function
 * count scales. But it cannot talk to a plain Postgres over TCP, so the local
 * Docker database would be unreachable with it.
 *
 * So: HTTP for Neon, node-postgres for everything else, chosen from the URL.
 * Both are Drizzle, so the query code above this line is identical either way.
 */

import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { neon } from '@neondatabase/serverless';
import { Pool } from 'pg';
import { env } from '@/env';
import * as schema from './schema';

const isNeon = /neon\.tech|neon\.build/.test(env.DATABASE_URL);

/** Reused across hot reloads in dev; a new pool per reload exhausts Postgres. */
const globalForDb = globalThis as unknown as { __pgPool?: Pool };

function build() {
  if (isNeon) return drizzleNeon(neon(env.DATABASE_URL), { schema });

  const pool = globalForDb.__pgPool ?? new Pool({ connectionString: env.DATABASE_URL, max: 5 });
  if (env.NODE_ENV !== 'production') globalForDb.__pgPool = pool;
  return drizzlePg(pool, { schema });
}

export const db = build();
export type Db = typeof db;
export { schema, isNeon };
