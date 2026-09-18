import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Erasure has to be complete, and "complete" is not something you can assert by
 * listing the tables you remembered.
 *
 * So this does not check a hand-written list. It asks Postgres which columns
 * could point at a person — everything with a foreign key to `user`, plus the
 * `email` and `identifier` of the two tables keyed on the address instead —
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
  const planId = randomUUID();
  const groupId = randomUUID();
  const eventId = randomUUID();

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
    /* A library row of the kind every account created before the catalogue
       still carries. Seeding no longer writes them, but those accounts will be
       deleted too, and their rows have to go with them — so this test keeps
       asserting it rather than quietly dropping the check. */
    await db.insert(schema.exercises).values({
      id: 'legacy-row',
      userId,
      updatedAt: new Date(),
      deletedAt: null,
      seq: sql`nextval('change_seq')`,
      name: 'Goblet Squat',
      patternId: 'legacy-pattern',
      where: 'home',
      tags: [],
      description: '',
      images: [],
    });

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

    /* The trainer side, for the same reason: seeding writes none of it, so
       without this the new tables would be *discovered* by the scan below and
       then proved against zero rows, which proves nothing. This account is both
       a trainer who owns a plan and a group, and a member of that group with a
       plan shared to them — so every one of the five references is exercised. */
    await db.insert(schema.plans).values({ id: planId, ownerId: userId, name: 'Block one' });
    await db.insert(schema.userGroups).values({ id: groupId, ownerId: userId, name: 'Tuesdays' });
    await db.insert(schema.groupMembers).values({ groupId, userId });
    await db.insert(schema.planShares).values({ planId, targetUserId: userId });
    await db.insert(schema.planEvents).values({
      id: eventId,
      actorId: userId,
      action: 'plan.published',
      planId,
      planName: 'Block one',
    });

    /* Two ways of finding a column that could name a person, and both are
       needed.

       The foreign keys are the reliable half: anything referencing `user(id)`
       points at somebody, whatever it happens to be called. That half used to
       be a list of column *names* — `user_id`, `email`, `identifier` — which
       worked only for as long as every such column was called `user_id`. The
       trainer tables broke that assumption four times over (`owner_id`,
       `actor_id`, `target_user_id`), and a naming convention is a poor thing to
       rest an erasure guarantee on: a table added with the "wrong" name would
       have been silently skipped, and the test would have gone on passing.

       The name-based half stays for the two tables keyed on the address rather
       than the user row, which have no foreign key to find. */
    const byForeignKey = await db.execute(sql`
      SELECT src.relname AS table_name, att.attname AS column_name
      FROM pg_constraint c
      JOIN pg_class src ON src.oid = c.conrelid
      JOIN pg_class tgt ON tgt.oid = c.confrelid
      JOIN pg_namespace n ON n.oid = src.relnamespace
      JOIN unnest(c.conkey) AS k(attnum) ON true
      JOIN pg_attribute att ON att.attrelid = src.oid AND att.attnum = k.attnum
      WHERE c.contype = 'f' AND tgt.relname = 'user' AND n.nspname = 'public'
      ORDER BY 1, 2
    `);
    const byName = await db.execute(sql`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name IN ('email', 'identifier')
      ORDER BY table_name, column_name
    `);

    const rows = [...byForeignKey.rows, ...byName.rows] as {
      table_name: string;
      column_name: string;
    }[];
    const seen = new Set<string>();
    holders = rows.flatMap((r) => {
      const key = `${r.table_name}.${r.column_name}`;
      // The `user` table itself is checked separately, by id *and* address.
      if (r.table_name === 'user' || seen.has(key)) return [];
      seen.add(key);
      return [{ table: r.table_name, column: r.column_name }];
    });
  });

  afterAll(async () => {
    // Harmless if the test did its job; the safety net if it did not.
    await db.delete(schema.users).where(sql`${schema.users.id} = ${userId}`);
    // The audit event deliberately outlives its actor and its plan, so it is
    // the one row this test has to clear up after itself.
    await db.delete(schema.planEvents).where(sql`${schema.planEvents.id} = ${eventId}`);
  });

  const countsFor = async (): Promise<Record<string, number>> => {
    const out: Record<string, number> = {};
    for (const { table, column } of holders) {
      // The address-keyed pair are the only ones compared against an email;
      // everything else was found by its foreign key to the user row.
      const value = column === 'email' || column === 'identifier' ? email : userId;
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
    expect(before['exercises.user_id']).toBe(1);
    // The two that do not cascade, and so are the ones worth proving.
    expect(before['verificationToken.identifier']).toBe(1);
    expect(before['sign_in_attempts.email']).toBe(1);
    // And the trainer side, which the scan finds by foreign key rather than
    // by a column called user_id.
    expect(before['plans.owner_id']).toBe(1);
    expect(before['user_groups.owner_id']).toBe(1);
    expect(before['group_members.user_id']).toBe(1);
    expect(before['plan_shares.target_user_id']).toBe(1);
    expect(before['plan_events.actor_id']).toBe(1);
  });

  it('leaves nothing behind in any table that could name them', async () => {
    await deleteAccount(userId, email);
    expect(await countsFor()).toEqual({});
  });

  it('keeps the audit trail, with the person gone from it', async () => {
    /* The one deliberate exception, and the reason `plan_events` sets null
       rather than cascading. Erasure has to remove the person; it does not have
       to remove the fact that some plan was shared with forty people in March.
       The event survives with the names it recorded at the time and no way back
       to who did it — which is what an auditable record and a right to erasure
       both look like at once. */
    const r = await db.execute(
      sql`SELECT actor_id, action, plan_name FROM plan_events WHERE id = ${eventId}`,
    );
    expect(r.rows).toHaveLength(1);
    const row = r.rows[0] as { actor_id: string | null; action: string; plan_name: string | null };
    expect(row.actor_id).toBeNull();
    expect(row.action).toBe('plan.published');
    expect(row.plan_name).toBe('Block one');
  });

  it('can be asked twice without complaining', async () => {
    // A double tap, or a retry after a timeout that actually succeeded. Neither
    // should surface as an error to somebody who has just deleted their account.
    await expect(deleteAccount(userId, email)).resolves.toBeUndefined();
  });
});
