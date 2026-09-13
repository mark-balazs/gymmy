import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Erasure has to be complete, and "complete" is not something you can assert by
 * listing the tables you remembered.
 *
 * So this does not check a hand-written list. It asks Postgres what tables
 * exist and which of them have a column that could point at a person — a
 * `user_id`, an `email`, the `identifier` a sign-in code is issued against —
 * and then insists that none of them still holds a row matching the account
 * after it is deleted. A table added later without a cascade fails this without
 * anybody having to remember to come back and extend it, which is the only
 * version of this test worth having: the failure mode being guarded against is
 * precisely somebody forgetting.
 *
 * Runs against the real database because the deletion *is* SQL — most of it is
 * `ON DELETE CASCADE`, which a mock would not have.
 */
describe('deleting an account', () => {
  const email = `delete-test-${randomUUID().slice(0, 8)}@example.test`;
  const userId = randomUUID();

  let db: typeof import('@/lib/db').db;
  let schema: typeof import('@/lib/db/schema');
  let deleteAccount: typeof import('./delete-account').deleteAccount;

  /** Every (table, column) pair in the database that could name a person. */
  let holders: { table: string; column: string }[] = [];

  beforeAll(async () => {
    // Seeded as the demo account so there is a full five months of history to
    // delete — an empty account would pass a cascade test that a real one fails.
    process.env.DEMO_EMAIL = email;
    ({ db } = await import('@/lib/db'));
    schema = await import('@/lib/db/schema');
    ({ deleteAccount } = await import('./delete-account'));
    const { seedNewUser } = await import('./seed-user');

    await db.insert(schema.users).values({ id: userId, name: 'Delete test', email });
    await seedNewUser(userId, email);

    /* The two tables that hold the address without hanging off the user row. Neither
       is written by seeding — a sign-in code is issued before anyone knows
       whether there is an account behind the address — so without these the
       erasure assertion would be passing on tables it never populated. */
    await db.insert(schema.verificationTokens).values({
      identifier: email,
      token: randomUUID(),
      expires: new Date(Date.now() + 600_000),
    });
    await db.insert(schema.signInAttempts).values({ email, client: '203.0.113.9' });

    const found = await db.execute(sql`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name IN ('user_id', 'email', 'identifier')
      ORDER BY table_name, column_name
    `);
    holders = (found.rows as { table_name: string; column_name: string }[]).map((r) => ({
      table: r.table_name,
      column: r.column_name,
    }));
  });

  afterAll(async () => {
    // Harmless if the test did its job; the safety net if it did not.
    await db.delete(schema.users).where(sql`${schema.users.id} = ${userId}`);
  });

  const countsFor = async (): Promise<Record<string, number>> => {
    const out: Record<string, number> = {};
    for (const { table, column } of holders) {
      const value = column === 'user_id' ? userId : email;
      const r = await db.execute(
        sql`SELECT count(*)::int AS n FROM ${sql.identifier(table)} WHERE ${sql.identifier(column)} = ${value}`,
      );
      const n = (r.rows[0] as { n: number } | undefined)?.n ?? 0;
      if (n > 0) out[`${table}.${column}`] = n;
    }
    const user = await db.execute(
      sql`SELECT count(*)::int AS n FROM "user" WHERE id = ${userId} OR email = ${email}`,
    );
    const n = (user.rows[0] as { n: number } | undefined)?.n ?? 0;
    if (n > 0) out['user'] = n;
    return out;
  };

  it('is worth testing — the account really is in there first', async () => {
    // Without this the erasure assertion below would pass just as happily
    // against an account that was never written.
    const before = await countsFor();
    expect(before['user']).toBe(1);
    expect(before['set_logs.user_id']).toBeGreaterThan(100);
    expect(before['profiles.user_id']).toBe(1);
    expect(before['exercises.user_id']).toBeGreaterThan(10);
    // The two that do not cascade, and so are the ones worth proving.
    expect(before['verificationToken.identifier']).toBe(1);
    expect(before['sign_in_attempts.email']).toBe(1);
  });

  it('leaves nothing behind in any table that could name them', async () => {
    await deleteAccount(userId, email);
    expect(await countsFor()).toEqual({});
  });

  it('can be asked twice without complaining', async () => {
    // A double tap, or a retry after a timeout that actually succeeded. Neither
    // should surface as an error to somebody who has just deleted their account.
    await expect(deleteAccount(userId, email)).resolves.toBeUndefined();
  });
});
