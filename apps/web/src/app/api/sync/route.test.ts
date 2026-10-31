import { randomUUID } from 'node:crypto';
import { eq, inArray, sql } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { seedId } from '@/lib/db/seed-user';
import { patterns, users } from '@/lib/db/schema';
import { POST } from './route';

/* Whoever the route believes is signed in. The session is the one thing
   stubbed — Auth.js cannot load outside Next — and everything behind it, the
   validation, the upsert and the pull, runs against the real database. The
   route is Auth.js's wrapper around its handler, so the stub wraps too: it
   hands the handler the session on `req.auth`, or none when `who.id` is empty,
   and adds a cookie to the answer as Auth.js does, renewed for a session and
   cleared for one that has ended. That the renewed cookie reaches the phone
   is the browser suite's to hold (e2e/tests/staying-signed-in.spec.ts). */
const who = vi.hoisted(() => ({ id: '' }));
vi.mock('@/lib/auth', () => ({
  auth:
    (handler: (req: unknown, ctx: unknown) => Promise<Response>) =>
    async (req: Request, ctx: unknown) => {
      const session = who.id ? { user: { id: who.id } } : null;
      const answer = await handler(Object.assign(req, { auth: session }), ctx);
      const withCookie = new Response(answer.body, answer);
      withCookie.headers.append(
        'set-cookie',
        session ? 'authjs.session-token=renewed; Path=/' : 'authjs.session-token=; Max-Age=0',
      );
      return withCookie;
    },
}));
const callRoute = async (req: Request) =>
  (await POST(req as NextRequest, { params: Promise.resolve({}) })) as Response;

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
  /** An account whose first-run seed died after its very first statement. */
  const c = randomUUID();

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
    return callRoute(
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
      { id: c, name: 'Sync C', email: `sync-c-${c.slice(0, 8)}@example.test` },
    ]);
  });

  afterAll(async () => {
    // Cascades to every row pushed above.
    await db.delete(users).where(inArray(users.id, [a, b, c]));
  });

  it("renews the phone's sign-in with every answer, and leaves an ended one's cookie alone", async () => {
    /* A phone whose sign-in has ended (the account deleted on another phone)
       keeps its cookie, so the app still opens there and can sign out, which
       empties it. Auth.js would clear the cookie; the route takes that back. */
    const signedIn = await post(a, []);
    expect(signedIn.status).toBe(200);
    expect(signedIn.headers.get('set-cookie')).toContain('renewed');

    const ended = await post('', []);
    expect(ended.status).toBe(401);
    expect(ended.headers.get('set-cookie')).toBeNull();
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

  /**
   * The repair, for the account shape that could never reach it (GYM-70).
   *
   * A seed that died partway leaves rows — so the first pull is not empty, the
   * cursor moves past zero, and a repair keyed on "asked from zero and got
   * nothing back" can never fire for that account again. The device asks from
   * a real cursor, every time, for ever, and gets no profile: a loading screen
   * on every phone the person signs in on.
   *
   * So the question is the profile, and the cursor does not come into it.
   */
  it('seeds an account that has rows but no profile, whatever its cursor', async () => {
    // What a half-written seed leaves: the first statement's rows, under the
    // ids the seed derives, and nothing after them.
    await db.insert(patterns).values({
      /* The seed's own helper, not a copy of it: how a seeded id is derived
         has changed once already, and a test that re-derives it by hand stops
         planting the row the repair would collide with — it just plants a
         ninth pattern and still passes its first assertion. */
      id: seedId(c, 'pattern', 'squat'),
      userId: c,
      updatedAt: new Date(),
      deletedAt: null,
      seq: sql`nextval('change_seq')`,
      key: 'squat',
      name: 'squat',
      role: 'lower',
      counts: true,
      position: 0,
    });

    /* A device that has already pulled everything there is — the state the old
       repair defined itself out of. Not an invented number: the rows the
       repair writes have to come back *above* this cursor, or the device is
       told about a profile it will never receive. */
    const seen = await db.execute(sql`SELECT last_value::bigint AS n FROM change_seq`);
    const since = Number((seen.rows[0] as { n: string | number }).n);

    who.id = c;
    const res = await callRoute(
      new Request('http://localhost/api/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ since, mutations: [] }),
      }),
    );
    expect(res.status).toBe(200);

    // The device gets the profile in this very answer, which is the only thing
    // that unsticks it.
    const payload = (await res.json()) as { changes: { profile?: unknown[] } };
    expect(payload.changes.profile).toHaveLength(1);

    // Finished, not duplicated: the row written before is the row kept.
    const kept = await db.select().from(patterns).where(eq(patterns.userId, c));
    expect(kept).toHaveLength(8);
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

  it('stores the moment a goal ended, so ending one never blocks the sync', async () => {
    /* GYM-123. Every time crosses the wire as text, and a goal's end time
       lands in a timestamp column. Only `updatedAt` and `deletedAt` used to be
       made dates on the way in, so ending a goal threw inside Drizzle: a 500 on
       every retry, and the phone that sent it never synced again. Both ways it
       reaches the server are here: a goal ended after it was synced, and the
       ticket's own case, a goal set and stopped offline, which goes up as two
       changes in one push, ahead of a bodyweight logged afterwards. */
    const goal = (id: string) => ({
      id,
      updatedAt: at(10),
      deletedAt: null,
      exerciseId: 'ex-1',
      target: 110,
      baseline: 100,
      startedOn: '2026-09-18',
      targetDate: '2026-11-13',
      retiredAt: null,
    });
    const endedAt = async (id: string) => {
      const stored = await db.execute(
        sql`SELECT retired_at FROM goals WHERE user_id = ${a} AND id = ${id}`,
      );
      const row = stored.rows[0] as { retired_at: string | Date | null } | undefined;
      return row?.retired_at ? new Date(row.retired_at).toISOString() : null;
    };

    const later = randomUUID();
    await push(a, [{ table: 'goals', row: goal(later) }]);
    const after = await push(a, [
      { table: 'goals', row: { ...goal(later), updatedAt: at(11), retiredAt: at(11) } },
    ]);
    expect(await endedAt(later)).toBe(at(11));
    // And another phone, pulling from scratch, sees it ended rather than running.
    const goals = (after.changes as { goals?: { id: string; retiredAt: string | null }[] }).goals;
    expect(goals?.find((g) => g.id === later)?.retiredAt).toBe(at(11));

    const offline = randomUUID();
    const weighed = randomUUID();
    await push(a, [
      { table: 'goals', row: goal(offline) },
      { table: 'goals', row: { ...goal(offline), updatedAt: at(12), retiredAt: at(12) } },
      {
        table: 'bodyLogs',
        row: { id: weighed, updatedAt: at(13), deletedAt: null, date: '2026-09-18', weight: 80 },
      },
    ]);
    expect(await endedAt(offline)).toBe(at(12));
    const body = await db.execute(
      sql`SELECT weight FROM body_logs WHERE user_id = ${a} AND id = ${weighed}`,
    );
    expect(body.rows).toHaveLength(1);
  });
});
