import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Seeding has to survive being run again.
 *
 * Auth.js fires `createUser` exactly once per account. When seeding lived only
 * there, a single failure was permanent — the user row was already written, the
 * event would never fire again, and the account was left signed in and forever
 * empty, which the app can only render as a loading screen that never resolves.
 *
 * The repair is for `/api/sync` to seed any account that turns up with nothing,
 * and that is only safe if running the seed twice — or over a library that was
 * half written when the first attempt died — converges on exactly one library.
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

  const count = async (table: 'patterns' | 'exercises' | 'slots' | 'splitPeriods' | 'profiles') => {
    const t = schema[table];
    const rows = await db
      .select()
      .from(t as never)
      .where(sql`${(t as { userId: unknown }).userId} = ${userId}`);
    return rows.length;
  };

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

  it('wrote a library the first time', () => {
    expect(first.patterns).toBe(8);
    expect(first.exercises).toBeGreaterThan(50);
    expect(first.slots).toBeGreaterThan(0);
    expect(first.profiles).toBe(1);
  });

  it('writes no second copy of anything', async () => {
    // Every row is keyed by what it represents rather than by a fresh UUID, so
    // the second run lands on the rows the first one wrote.
    for (const table of ['patterns', 'exercises', 'slots', 'splitPeriods', 'profiles'] as const) {
      expect(await count(table), table).toBe(first[table]);
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
