import { randomUUID } from 'node:crypto';
import { inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { POST } from './route';

/* Whoever the route believes is signed in. The session is the one thing
   stubbed — Auth.js cannot load outside Next — and everything behind it, the
   validation, the upsert and the pull, runs against the real database. */
const who = vi.hoisted(() => ({ id: '' }));
vi.mock('@/lib/auth', () => ({ auth: async () => ({ user: { id: who.id } }) }));

type LogRow = { id: string; weight: number | null; deletedAt: string | null; updatedAt: string };

/**
 * The server's half of the conflict policy.
 *
 * Last-write-wins on `updatedAt`, per row, is the whole of it (see
 * `protocol.ts`), and it lives in one clause of one upsert. Nothing else
 * exercises that clause: the e2e specs that call this endpoint page and abort,
 * and never send the same row twice. Delete it and every test still passes,
 * while a phone that was offline for a week overwrites everything done since
 * on its first sync.
 *
 * So is the account boundary: every row is written under the session's user,
 * whatever the row claims. That rests on two guards, and each is tested where
 * it lives — the stripping in `rows.test.ts`, the route's own say here.
 */
describe('POST /api/sync', () => {
  const a = randomUUID();
  const b = randomUUID();

  const at = (hour: number) => `2026-09-18T${String(hour).padStart(2, '0')}:00:00.000Z`;
  const log = (id: string, over: Partial<LogRow> & Record<string, unknown>) => ({
    id,
    updatedAt: at(10),
    deletedAt: null,
    date: '2026-09-18',
    session: 'A',
    exerciseId: 'ex-1',
    setNo: 1,
    weight: 60,
    reps: 5,
    rir: 2,
    note: '',
    ...over,
  });

  const post = async (
    as: string,
    mutations: { table: string; row: Record<string, unknown> }[],
    accountId?: string | null,
  ) => {
    who.id = as;
    return POST(
      new Request('http://localhost/api/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          since: 0,
          ...(accountId === undefined ? {} : { accountId }),
          mutations: mutations.map((m) => ({ ...m, op: 'put' })),
        }),
      }),
    );
  };

  const push = async (as: string, mutations: { table: string; row: Record<string, unknown> }[]) => {
    const res = await post(as, mutations);
    expect(res.status).toBe(200);
    return (await res.json()) as {
      changes: { logs?: LogRow[]; profile?: Record<string, unknown>[] };
      accountId: string;
    };
  };

  const sync = async (as: string, rows: Record<string, unknown>[] = []) =>
    push(
      as,
      rows.map((row) => ({ table: 'logs', row })),
    );
  /** The row as the account's next pull from scratch would see it. */
  const pulled = async (as: string, id: string) =>
    (await sync(as)).changes.logs?.find((l) => l.id === id);

  beforeAll(async () => {
    await db.insert(users).values([
      { id: a, name: 'Sync A', email: `sync-a-${a.slice(0, 8)}@example.test` },
      { id: b, name: 'Sync B', email: `sync-b-${b.slice(0, 8)}@example.test` },
    ]);
  });

  afterAll(async () => {
    // Cascades to every row pushed above.
    await db.delete(users).where(inArray(users.id, [a, b]));
  });

  it('does not let an older edit arriving late clobber a newer one', async () => {
    const id = randomUUID();
    await sync(a, [log(id, { updatedAt: at(10), weight: 100 })]);
    // The phone that was offline since nine o'clock, syncing at last.
    await sync(a, [log(id, { updatedAt: at(9), weight: 50 })]);
    expect((await pulled(a, id))?.weight).toBe(100);

    // And a newer edit still lands, so the clause is not refusing everything.
    await sync(a, [log(id, { updatedAt: at(11), weight: 110 })]);
    expect((await pulled(a, id))?.weight).toBe(110);

    /* A delete is a write like any other, so an older undelete loses to it.
       If it did not, a set deleted on one phone would come back from the
       other the next time it synced. */
    await sync(a, [log(id, { updatedAt: at(12), deletedAt: at(12), weight: 110 })]);
    await sync(a, [log(id, { updatedAt: at(11), deletedAt: null, weight: 110 })]);
    expect((await pulled(a, id))?.deletedAt).toBe(at(12));
  });

  it('never takes the account or the sequence from the wire', async () => {
    const id = randomUUID();
    // Something of B's own first, so B's pull below is not an empty account
    // (which the route would stop to seed).
    await sync(b, [log(randomUUID(), {})]);

    const before = await db.execute(sql`SELECT coalesce(max(seq), 0)::bigint AS n FROM set_logs`);
    const maxSeq = Number((before.rows[0] as { n: string | number }).n);

    await sync(a, [log(id, { weight: 80, userId: b, seq: 1 })]);

    const stored = await db.execute(sql`SELECT user_id, seq FROM set_logs WHERE id = ${id}`);
    expect(stored.rows).toHaveLength(1);
    const row = stored.rows[0] as { user_id: string; seq: string | number };
    expect(row.user_id).toBe(a);
    expect(Number(row.seq)).toBeGreaterThan(maxSeq);
    expect(await pulled(b, id)).toBeUndefined();
  });

  it('writes only the fields a change carried, so an old build resets nothing', async () => {
    /* GYM-69. Every field added after launch is defaulted in `rows.ts`, which
       is what lets a phone one build behind push its profile at all. On an
       insert that default is a starting value; on an *update* it is a value,
       and it used to be written — so changing the language on an old phone
       took somebody off their trainer's plan and put their entry mode back.

       The shape below is the old build's exactly: the fields that have no
       default, and nothing else. */
    const id = randomUUID();
    const settled = {
      id,
      updatedAt: at(10),
      deletedAt: null,
      onboarded: true,
      split: 'upperLower',
      days: 4,
      where: 'gym',
      bias: 'none',
      blockStart: '2026-09-14',
      blockWeeks: 8,
      unit: 'kg',
      lang: 'en',
      theme: 'dark',
      entryMode: 'ruler',
      plateLoader: false,
      heightCm: 181,
      sex: 'male',
      name: 'Sam',
      birthYear: 1990,
      avatar: null,
      planId: 'plan-1',
      planVersion: 3,
    };
    await push(a, [{ table: 'profile', row: settled }]);

    await push(a, [
      {
        table: 'profile',
        row: {
          id,
          updatedAt: at(11),
          deletedAt: null,
          onboarded: true,
          split: 'upperLower',
          days: 4,
          where: 'gym',
          bias: 'none',
          blockStart: '2026-09-14',
          blockWeeks: 8,
          unit: 'kg',
          // The one thing that phone changed.
          lang: 'hu',
        },
      },
    ]);

    who.id = a;
    const back = (await push(a, [])).changes.profile?.find((p) => p.id === id);
    expect(back?.lang).toBe('hu');
    expect(back).toMatchObject({
      planId: 'plan-1',
      planVersion: 3,
      entryMode: 'ruler',
      plateLoader: false,
      theme: 'dark',
      heightCm: 181,
      sex: 'male',
      name: 'Sam',
      birthYear: 1990,
    });
  });

  it('refuses a device holding another account, and never writes what it sent', async () => {
    /* GYM-74. A phone that still holds the previous person's rows — a wipe
       that failed, a second tab that was never told — used to push them up
       under whoever signed in next. Now the device says whose data it is and
       the server refuses outright: nothing written, nothing returned. */
    const id = randomUUID();
    const res = await post(a, [{ table: 'logs', row: log(id, {}) }], b);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'another account' });

    const stored = await db.execute(sql`SELECT id FROM set_logs WHERE id = ${id}`);
    expect(stored.rows).toHaveLength(0);
  });

  it('names the account back, so a device can stamp itself', async () => {
    // A device that has never synced says nothing, and is adopted.
    const res = await post(a, [{ table: 'logs', row: log(randomUUID(), {}) }], null);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { accountId: string }).accountId).toBe(a);
    // And one that already agrees is let through.
    expect((await post(a, [], a)).status).toBe(200);
  });

  it('keeps two accounts’ rows apart when they share an id', async () => {
    /* Ids are made on the phone, so two accounts can send the same one. The
       key is (user, id): B writing that id — even later, which would win any
       last-write contest — makes a row of B's own and leaves A's alone. */
    const id = randomUUID();
    await sync(a, [log(id, { updatedAt: at(10), weight: 80 })]);
    await sync(b, [log(id, { updatedAt: at(13), weight: 99 })]);
    expect((await pulled(a, id))?.weight).toBe(80);
    expect((await pulled(b, id))?.weight).toBe(99);
  });
});
