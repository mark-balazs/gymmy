import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildSlots, findSplit, mondayOf } from '@athletic/domain';

/**
 * Seeding has to survive being run again.
 *
 * Auth.js fires `createUser` exactly once per account. When seeding lived only
 * there, a single failure was permanent — the user row was already written, the
 * event would never fire again, and the account was left signed in and forever
 * empty, which the app can only render as a loading screen that never resolves.
 *
 * The repair is for `/api/sync` to seed an account that turns up with nothing,
 * and that is only safe if seeds that overlap — `createUser` still running when
 * the first sync finds the account empty, or two devices at once — converge on
 * exactly one set of rows.
 *
 * Runs against the real database because that is what is being tested: the
 * convergence is a property of the ids and the conflict clauses, not of
 * anything a mock would exercise.
 */
describe('seeding is safe to run again', () => {
  const userId = randomUUID();
  const email = `reseed-${randomUUID().slice(0, 8)}@example.test`;

  let db: typeof import('@/lib/db').db;
  let schema: typeof import('@/lib/db/schema');

  const rowsOf = async (
    table:
      | 'patterns'
      | 'exercises'
      | 'slots'
      | 'splitPeriods'
      | 'profiles'
      | 'programEntries'
      | 'setLogs'
      | 'bodyLogs'
      | 'goals',
  ) => {
    const t = schema[table];
    return db
      .select()
      .from(t as never)
      .where(sql`${(t as { userId: unknown }).userId} = ${userId}`);
  };
  const count = async (table: Parameters<typeof rowsOf>[0]) => (await rowsOf(table)).length;

  let first: Record<string, number>;

  beforeAll(async () => {
    // Deliberately not the demo address: this is about the ordinary path every
    // real account takes.
    process.env.DEMO_EMAIL = `someone-else-${randomUUID().slice(0, 8)}@example.test`;
    ({ db } = await import('@/lib/db'));
    schema = await import('@/lib/db/schema');
    const { seedNewUser } = await import('./seed-user');

    await db.insert(schema.users).values({ id: userId, name: 'Reseed test', email });

    await seedNewUser(userId, email);
    first = {
      patterns: await count('patterns'),
      exercises: await count('exercises'),
      slots: await count('slots'),
      splitPeriods: await count('splitPeriods'),
      profiles: await count('profiles'),
    };

    // The retry. In production this is `/api/sync` finding an empty account —
    // here it is the same call, made a second time.
    await seedNewUser(userId, email);
  });

  afterAll(async () => {
    await db.delete(schema.users).where(sql`${schema.users.id} = ${userId}`);
  });

  it('wrote the account’s structure the first time — and no library', () => {
    expect(first.patterns).toBe(8);
    /* Zero, deliberately. The library is the catalogue in code, which every
       account reads; copying it into each new account is what used to stop an
       added exercise from reaching anybody who already had one. */
    expect(first.exercises).toBe(0);
    // The default split at its default length: the whole skeleton, not some.
    const split = findSplit('sevenPattern')!;
    expect(first.slots).toBe(buildSlots(split, split.defaultDays).length);
    expect(first.profiles).toBe(1);
    /* And one opening period, from this week. Coverage is scored against the
       period in force, so an account without one is scored against a guess —
       and nothing else here would notice: the re-seed check below compares a
       table the first run never wrote with itself, zero against zero. */
    expect(first.splitPeriods).toBe(1);
  });

  it('opens that period on the week the account starts', async () => {
    const [period] = (await rowsOf('splitPeriods')) as { startWeek: string }[];
    expect(period?.startWeek).toBe(mondayOf(new Date()));
  });

  it('writes no second copy of anything', async () => {
    // Every row is keyed by what it represents rather than by a fresh UUID, so
    // the second run lands on the rows the first one wrote.
    for (const table of ['patterns', 'exercises', 'slots', 'splitPeriods', 'profiles'] as const) {
      expect(await count(table), table).toBe(first[table]);
    }
  });

  it('gives an ordinary account a blank profile and no history', async () => {
    /* The path every real account takes, asserted rather than assumed: not
       onboarded, nothing about the person filled in for them, a block starting
       this week, and none of the demo's history. The demo is this same function
       behind one flag, so a slip either way lands here — a real account that
       arrives onboarded with a sex it never chose has skipped the questions its
       strength score needs, and one that arrives with five months of logs has
       somebody else's training in it. Ahead of the next test, which edits the
       profile. */
    const [profile] = await rowsOf('profiles');
    expect(profile).toMatchObject({
      onboarded: false,
      sex: 'unspecified',
      heightCm: null,
      blockWeeks: 8,
      blockStart: mondayOf(new Date()),
    });
    for (const t of ['programEntries', 'setLogs', 'bodyLogs', 'goals'] as const) {
      expect(await rowsOf(t), t).toHaveLength(0);
    }
  });

  it('leaves an edited profile alone', async () => {
    // The retry must not reset somebody's settings back to the defaults. The
    // profile is the row most likely to have been changed since.
    await db
      .update(schema.profiles)
      .set({ onboarded: true, days: 5, unit: 'lb' })
      .where(sql`${schema.profiles.userId} = ${userId}`);

    const { seedNewUser } = await import('./seed-user');
    await seedNewUser(userId, email);

    const [profile] = (await db
      .select()
      .from(schema.profiles)
      .where(sql`${schema.profiles.userId} = ${userId}`)) as {
      onboarded: boolean;
      days: number;
      unit: string;
    }[];

    expect(profile?.onboarded).toBe(true);
    expect(profile?.days).toBe(5);
    expect(profile?.unit).toBe('lb');
  });
});

/**
 * A seed that dies partway leaves nothing behind (GYM-70).
 *
 * This was the state that stranded people: four separate inserts, a timeout
 * between two of them, and an account left with patterns and no profile — which
 * the app can only render as a loading screen, and which the old repair could
 * never reach, because the patterns came back and moved the cursor past zero.
 *
 * The failure is injected rather than waited for, because a database timeout is
 * not something a test can arrange: the third statement throws, exactly as a
 * dropped connection would, and the question is what is left afterwards.
 */
describe('a seed that fails partway', () => {
  const userId = randomUUID();
  const email = `halfseed-${randomUUID().slice(0, 8)}@example.test`;

  let db: typeof import('@/lib/db').db;
  let schema: typeof import('@/lib/db/schema');

  const count = async (table: 'patterns' | 'slots' | 'splitPeriods' | 'profiles') => {
    const t = schema[table];
    const rows = await db
      .select()
      .from(t as never)
      .where(sql`${(t as { userId: unknown }).userId} = ${userId}`);
    return rows.length;
  };

  beforeAll(async () => {
    process.env.DEMO_EMAIL = `someone-else-${randomUUID().slice(0, 8)}@example.test`;
    ({ db } = await import('@/lib/db'));
    schema = await import('@/lib/db/schema');
    await db.insert(schema.users).values({ id: userId, name: 'Half seed', email });
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await db.delete(schema.users).where(sql`${schema.users.id} = ${userId}`);
  });

  it('leaves the account exactly as empty as it found it', async () => {
    const real = db.transaction.bind(db);
    /* Wraps the real transaction and breaks the third statement inside it —
       the slots, with the patterns and the opening period already written.
       Nothing is mocked away: the rows really are attempted, and the rollback
       really is Postgres's. */
    vi.spyOn(db, 'transaction').mockImplementation((async (
      run: (tx: Record<string, unknown>) => Promise<unknown>,
    ) =>
      real(async (tx) => {
        const handle = tx as unknown as Record<string, unknown>;
        const insert = (handle.insert as (t: unknown) => unknown).bind(handle);
        let n = 0;
        handle.insert = (t: unknown) => {
          if (++n === 3) throw new Error('seed timed out');
          return insert(t);
        };
        return run(handle);
      })) as never);

    const { seedNewUser } = await import('./seed-user');
    const failure = await seedNewUser(userId, email).then(
      () => null,
      (e: unknown) => e as Error,
    );

    // Nothing at all — not the patterns that were written before the failure.
    for (const table of ['patterns', 'slots', 'splitPeriods', 'profiles'] as const) {
      expect(await count(table), table).toBe(0);
    }
    // And the caller is told, rather than left believing the account is ready.
    expect(failure?.message).toContain('seed timed out');
  });
});
