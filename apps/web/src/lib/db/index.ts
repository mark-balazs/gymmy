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

/** A drizzle statement as the builder hands it back: not yet run. */
type Statement = PromiseLike<unknown>;

/**
 * Runs a list of writes so that either all of them land or none do.
 *
 * **The two drivers need two different mechanisms, and this is the whole
 * reason it exists.** Neon's HTTP driver has no interactive transaction at all
 * — `db.transaction()` throws "No transactions support in neon-http driver" —
 * so production cannot use the obvious thing. What it does have is `batch()`,
 * which sends the statements together and Neon runs them in one transaction.
 * node-postgres has no `batch()` and a real `transaction()`. So: the caller
 * *builds* the statements against whatever handle it is given, and this picks
 * the mechanism.
 *
 * The consequence for callers is the one thing worth remembering: **there is
 * nothing to read between the statements.** A batch is sent in one go, so
 * anything a later statement needs has to be worked out before the first one.
 * That is not a limitation here — seeding derives every row from the account
 * id — and it is what makes the same code atomic on both drivers.
 *
 * Without it, a seed that timed out halfway left an account with patterns and
 * no profile, which the app can only render as a loading screen (GYM-70).
 */
export async function inOneTransaction(build: (on: Db) => Statement[]): Promise<void> {
  if (isNeon) {
    const statements = build(db) as unknown as Parameters<
      ReturnType<typeof drizzleNeon<typeof schema>>['batch']
    >[0];
    await (db as ReturnType<typeof drizzleNeon<typeof schema>>).batch(statements);
    return;
  }

  await (db as ReturnType<typeof drizzlePg<typeof schema>>).transaction(async (tx) => {
    for (const statement of build(tx as unknown as Db)) await statement;
  });
}
