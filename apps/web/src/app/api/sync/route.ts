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
import { SYNC_TABLES, type SyncTableName } from '@/lib/db/schema';
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
  const { since, mutations } = parsed.data;

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

    await db
      .insert(table)
      .values(values as never)
      .onConflictDoUpdate({
        target: [table.userId, table.id],
        set: values as never,
        // Last-write-wins: an older edit arriving late must not clobber a newer
        // one. Without this, a phone that was offline for a week would overwrite
        // everything done since with stale data on its first sync.
        setWhere: sql`${table.updatedAt} <= ${new Date(updatedAt)}`,
      });
  }

  /* ---- pull ---- */

  let payload = await pull(userId, since);

  /**
   * A device asking from scratch and getting nothing back means the account has
   * no rows at all — first-run seeding never completed.
   *
   * That seeding happens in Auth.js's `createUser` event, which fires exactly
   * once per account and cannot be made to fire again. Without this, a single
   * failed seed leaves someone signed in, syncing perfectly, and permanently
   * empty — and an empty account has no profile, which the app can only render
   * as a loading screen that never resolves.
   *
   * This is the one place every device touches on every visit, so it is where
   * the repair belongs. Seeding writes stable ids and ignores conflicts, so
   * two devices arriving at once cannot produce two libraries, and a seed that
   * half-wrote is finished rather than duplicated.
   */
  if (since === 0 && Object.keys(payload.changes).length === 0) {
    console.warn(`[sync] empty account ${userId}; seeding now`);
    await seedNewUser(userId, session.user?.email);
    payload = await pull(userId, since);
  }

  return NextResponse.json(payload);
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
