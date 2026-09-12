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

  const changes: Record<string, unknown[]> = {};
  let cursor = since;

  for (const [name, table] of Object.entries(SYNC_TABLES)) {
    const rows = await db
      .select()
      .from(table)
      .where(and(eq(table.userId, userId), gt(table.seq, since)))
      .orderBy(asc(table.seq))
      .limit(SYNC_LIMIT);

    if (rows.length) {
      changes[name] = rows.map(serialise);
      for (const r of rows) cursor = Math.max(cursor, Number(r.seq));
    }
  }

  const payload: PullResponse = {
    cursor,
    changes,
    serverTime: new Date().toISOString(),
  };
  return NextResponse.json(payload);
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
