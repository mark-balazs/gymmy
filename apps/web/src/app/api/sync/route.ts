/**
 * The one endpoint the client talks to.
 *
 * A single round trip does both directions: push local mutations, pull anything
 * newer than the client's cursor. Fewer round trips matters on a phone with one
 * bar of signal, which is the environment this app is actually used in.
 */

import { NextResponse } from 'next/server';
import { and, asc, eq, gt, sql } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { profiles, SYNC_TABLES, type SyncTableName } from '@/lib/db/schema';
import { seedNewUser } from '@/lib/db/seed-user';
import { pushRequest, SYNC_LIMIT, type PullResponse } from '@/lib/sync/protocol';
import { rowSchemas } from '@/lib/sync/rows';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const nextSeq = sql<number>`nextval('change_seq')`;

export async function POST(req: Request): Promise<NextResponse> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const parsed = pushRequest.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid request', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { since, accountId, mutations } = parsed.data;

  /**
   * Data on a phone belongs to an account, and says so.
   *
   * A device that still holds the previous person's rows — a sign-out wipe that
   * failed, or a second tab that was never told — used to push them up under
   * whoever signed in next, and pull that account's history down beside them
   * (GYM-74). Nothing here is written or returned until the two agree.
   *
   * `null` is a device that has never had an answer: it is adopted, and the
   * response names the account so it can stamp itself.
   */
  if (accountId !== null && accountId !== userId) {
    return NextResponse.json({ error: 'another account' }, { status: 409 });
  }

  /* ---- push ---- */

  for (const m of mutations) {
    const table = SYNC_TABLES[m.table as SyncTableName];
    const schema = rowSchemas[m.table];
    const row = schema.safeParse(m.row);
    if (!row.success) {
      return NextResponse.json(
        { error: `invalid row for ${m.table}`, issues: row.error.issues },
        { status: 400 },
      );
    }

    const { id, updatedAt, deletedAt, ...rest } = row.data as Record<string, unknown> & {
      id: string;
      updatedAt: string;
      deletedAt: string | null;
    };

    const values = {
      ...rest,
      id,
      userId,
      updatedAt: new Date(updatedAt),
      deletedAt: deletedAt ? new Date(deletedAt) : null,
      seq: nextSeq,
    };

    /**
     * Only the fields the change actually carried are written over an existing
     * row.
     *
     * The schema fills in a default for every field a request leaves out, which
     * is what lets a phone one build behind push at all. But on an *update* that
     * default is not a fallback, it is a value — so a build that predates a
     * column reset it: changing the language on an old phone took somebody off
     * their trainer's plan and put their entry mode back to buttons (GYM-69).
     *
     * A new row still takes the whole parsed shape, defaults included, because
     * its columns have to hold something. `seq` and `updatedAt` are always
     * written: they are what orders the change, not part of it.
     */
    const sent = new Set(Object.keys(m.row));
    const patch = Object.fromEntries(
      Object.entries(values).filter(([k]) => k === 'seq' || k === 'updatedAt' || sent.has(k)),
    );

    await db
      .insert(table)
      .values(values as never)
      .onConflictDoUpdate({
        target: [table.userId, table.id],
        set: patch as never,
        // Last-write-wins: an older edit arriving late must not clobber a newer
        // one. Without this, a phone that was offline for a week would overwrite
        // everything done since with stale data on its first sync.
        setWhere: sql`${table.updatedAt} <= ${new Date(updatedAt)}`,
      });
  }

  /* ---- pull ---- */

  let payload = await pull(userId, since);

  /**
   * An account with no profile row was never set up, and the app cannot open
   * without one.
   *
   * First-run seeding happens in Auth.js's `createUser` event, which fires
   * exactly once per account and cannot be made to fire again. Without a
   * repair, a single failed seed leaves someone signed in, syncing perfectly,
   * and with no profile — which the app can only render as a loading screen
   * that never resolves.
   *
   * **The test is the profile, not an empty pull, and it is not tied to the
   * cursor.** It used to be "asked from zero and got nothing back", which
   * catches a seed that wrote *nothing* and misses every seed that died
   * partway: the patterns come back, the cursor moves past zero, and the
   * condition can never be true again — permanently stuck, at any cursor, on
   * every device (GYM-70). Seeding is now one transaction, so a half-written
   * account should not arise again; the repair does not assume that, because
   * the accounts already in that state have to be able to recover too.
   *
   * This is the one place every device touches on every visit, so it is where
   * the repair belongs. Seeding writes stable ids and ignores conflicts, so
   * two devices arriving at once cannot produce two libraries.
   *
   * The cost is one indexed lookup per sync, and only when the pull did not
   * already carry the profile — a device syncing from scratch, or after any
   * change to the profile row, pays nothing.
   */
  if (!payload.changes.profile?.length && !(await hasProfile(userId))) {
    console.warn(`[sync] account ${userId} has no profile; seeding now`);
    await seedNewUser(userId, session.user?.email);
    payload = await pull(userId, since);
  }

  return NextResponse.json(payload);
}

/**
 * Whether the account has a profile row at all — soft-deleted ones included.
 *
 * Deliberately not filtered by `deletedAt`: a row that exists is a seed that
 * ran, and writing a fresh profile over a deleted one would resurrect an
 * account the person asked to be rid of. The question here is only "was this
 * account ever set up", and a row of any kind answers it.
 */
async function hasProfile(userId: string): Promise<boolean> {
  const found = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  return found.length > 0;
}

/**
 * Everything newer than `since`, one page per table.
 *
 * Each table is paged independently, which makes advancing the cursor subtle.
 *
 * Taking the highest seq across all tables loses data outright: if logs fill
 * their page at seq 1_000 while the profile row sits at 5_000, a cursor of
 * 5_000 means every log between the two is never requested again. It is
 * silent, permanent, and shows up as a device that is simply missing history.
 *
 * So a table that filled its page holds the cursor down to the last row it
 * actually sent, and the client is told to come back. Rows above that from
 * other tables get re-sent next round, which costs a little bandwidth and
 * nothing else — applying them again is idempotent.
 */
async function pull(userId: string, since: number): Promise<PullResponse> {
  const changes: Record<string, unknown[]> = {};
  let lowestTruncated: number | null = null;
  let highestSent = since;

  for (const [name, table] of Object.entries(SYNC_TABLES)) {
    const rows = await db
      .select()
      .from(table)
      .where(and(eq(table.userId, userId), gt(table.seq, since)))
      .orderBy(asc(table.seq))
      .limit(SYNC_LIMIT);

    if (!rows.length) continue;
    changes[name] = rows.map(serialise);

    const maxSeq = rows.reduce((m, r) => Math.max(m, Number(r.seq)), since);
    highestSent = Math.max(highestSent, maxSeq);

    if (rows.length === SYNC_LIMIT) {
      lowestTruncated = lowestTruncated === null ? maxSeq : Math.min(lowestTruncated, maxSeq);
    }
  }

  return {
    cursor: lowestTruncated ?? highestSent,
    changes,
    accountId: userId,
    serverTime: new Date().toISOString(),
    hasMore: lowestTruncated !== null,
  };
}

/** Dates leave as ISO strings; `seq` and `userId` are server-side concerns and
 *  are not part of the client's model. */
function serialise(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === 'userId' || k === 'seq') continue;
    out[k] = v instanceof Date ? v.toISOString() : v;
  }
  return out;
}
