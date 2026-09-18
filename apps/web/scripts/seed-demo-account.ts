/**
 * Creates the demo account, without signing in as it.
 *
 * The demo account is normally born the way every account is born: somebody
 * signs in, Auth.js creates the user, and the `createUser` event seeds it. That
 * is the right design — an account cannot exist until somebody authenticates —
 * but it makes "put the demo back" a manual errand involving a throwaway inbox
 * and a six-digit code, which is a poor way to maintain a fixture that gets
 * deleted and recreated on purpose.
 *
 * So this does the same two steps directly: insert the user row, then run the
 * *same* `seedNewUser` the event runs. Nothing here is a parallel
 * implementation — if the seeding changes, this changes with it, which is the
 * only version of a script like this worth having.
 *
 *     DATABASE_URL='postgres://…' npm run seed:demo -w @athletic/web
 *
 * Add `--force` to replace an account that is already there. That deletes it
 * first, which cascades through every table it owns.
 *
 * It refuses to touch an address that is not the demo one. Seeding five months
 * of invented training into a real person's account would be difficult to
 * explain and impossible to undo.
 */

import { randomUUID } from 'node:crypto';

/* Set before anything imports `@/env` or the database client, so an explicit
   DATABASE_URL wins over whatever a local .env happens to hold. The same
   precedence `drizzle.config.ts` uses for remote migrations. */
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required. Nothing was done.');
  process.exit(1);
}

process.env.AUTH_SECRET ??= 'x'.repeat(32);
process.env.AUTH_GOOGLE_ID ??= 'unused-by-this-script';
process.env.AUTH_GOOGLE_SECRET ??= 'unused-by-this-script';

const force = process.argv.includes('--force');

async function main(): Promise<void> {
  const { db } = await import('../src/lib/db');
  const schema = await import('../src/lib/db/schema');
  const { demoEmail } = await import('../src/lib/db/seed-demo');
  const { seedNewUser } = await import('../src/lib/db/seed-user');
  const { eq, sql } = await import('drizzle-orm');

  const email = demoEmail();

  /* `--force` deletes an account, and which account is decided by an
     environment variable — so a stray `DEMO_EMAIL` pointed at a real address
     would delete a real person's training and replace it with five months of
     invented sets. Neither half of that is recoverable.

     So the destructive path is limited to the built-in demo address unless
     somebody says out loud that they mean a different one. Seeding a *new*
     account is harmless and stays unguarded. */
  const DEFAULT_DEMO = 'demo-gymmy@yopmail.com';
  if (force && email !== DEFAULT_DEMO && process.env.ALLOW_NON_DEMO !== '1') {
    console.error(`\nRefusing to --force against ${email}.`);
    console.error(`That is not the demo address, and --force deletes the account first.`);
    console.error(`Set ALLOW_NON_DEMO=1 if you genuinely mean it.`);
    process.exit(1);
  }

  const where = new URL(url!.replace(/^postgres(ql)?:/, 'http:'));
  console.log(`database: ${where.hostname}${where.pathname}`);
  console.log(`account:  ${email}`);

  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email));

  if (existing && !force) {
    const rows = (
      await db.execute(sql`SELECT count(*)::int AS n FROM set_logs WHERE user_id = ${existing.id}`)
    ).rows as { n: number }[];
    console.log(`\nAlready there, with ${rows[0]?.n ?? 0} sets. Nothing was done.`);
    console.log('Pass --force to delete it and seed a fresh one.');
    return;
  }

  if (existing) {
    console.log('\nReplacing the existing account (--force).');
    /* The two tables keyed on the address rather than the user row go first, so
       the irreversible step is last — the same order `delete-account.ts` uses
       and for the same reason. */
    await db
      .delete(schema.verificationTokens)
      .where(eq(schema.verificationTokens.identifier, email));
    await db.delete(schema.signInAttempts).where(eq(schema.signInAttempts.email, email));
    await db.delete(schema.users).where(eq(schema.users.id, existing.id));
  }

  const id = randomUUID();
  await db.insert(schema.users).values({ id, email, name: 'gymmy demo' });
  await seedNewUser(id, email);

  /* Reported rather than assumed. The failure this guards against is a seed
     that writes sets but no bodyweight, which leaves the Progress tab with no
     strength score at all — the exact way the demo has been wrong before. */
  const counts = (
    await db.execute(sql`
      SELECT
        (SELECT count(*)::int FROM set_logs   WHERE user_id = ${id}) AS sets,
        (SELECT count(*)::int FROM body_logs  WHERE user_id = ${id}) AS weights,
        (SELECT count(*)::int FROM exercises  WHERE user_id = ${id}) AS exercises,
        (SELECT count(*)::int FROM program_entries WHERE user_id = ${id}) AS entries,
        (SELECT count(*)::int FROM goals      WHERE user_id = ${id}) AS goals,
        (SELECT sex FROM profiles WHERE user_id = ${id})              AS sex,
        (SELECT min(date) FROM set_logs WHERE user_id = ${id})        AS first_set
    `)
  ).rows[0] as Record<string, unknown>;

  console.log('\nSeeded:');
  console.table([counts]);

  /* Goals are checked for the same reason bodyweight is. Without one the app
     says nothing evaluative about any lift — correct on a real account, and on
     the demo it silently hides both the goal card and the verdict card that
     depends on it. */
  const ok =
    Number(counts.sets) > 500 &&
    Number(counts.weights) > 15 &&
    Number(counts.goals) > 0 &&
    counts.sex === 'male';
  if (!ok) {
    console.error(
      '\nThat does not look right — a demo needs sets, weekly bodyweights, a sex and a goal,',
    );
    console.error('or the Progress tab has no score and nothing to say about any lift.');
    process.exit(1);
  }

  /* And the thing the demo actually exists to show, computed from the rows just
     written by the same function the Progress tab calls. Counting sets is not
     enough: an account can have five months of training and no score at all,
     which is precisely how this fixture has been wrong before. */
  const series = await strengthOf(id);
  const scored = series.filter((n): n is number => n !== null);
  const low = Math.min(...scored);
  const high = Math.max(...scored);

  console.log(
    `\nStrength score: ${scored.length} weeks scored, ${low} → ${high} ` +
      `(+${Math.round((high / low - 1) * 100)}%)`,
  );

  if (scored.length < 15) {
    console.error('\nToo few weeks carry a score. Check the bodyweight rows.');
    process.exit(1);
  }
  console.log('\nDone. Sign in as the demo address to see it.');
}

/**
 * The strength score, week by week, for a freshly seeded account.
 *
 * Reads the rows back and runs the real `strengthSeries` over them rather than
 * trusting the generator — the question being answered is whether what is *in
 * the database* produces a history, which is not the same question.
 */
async function strengthOf(userId: string): Promise<(number | null)[]> {
  const { db } = await import('../src/lib/db');
  const schema = await import('../src/lib/db/schema');
  const { eq } = await import('drizzle-orm');
  const { index, strengthSeries, mondayOf } = await import('@athletic/domain');

  const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : (v as string));
  const live = <T extends Record<string, unknown>>(rows: T[]) =>
    rows.map((r) => ({ ...r, updatedAt: iso(r.updatedAt), deletedAt: null }));

  const [patterns, exercises, logs, weights] = await Promise.all([
    db.select().from(schema.patterns).where(eq(schema.patterns.userId, userId)),
    db.select().from(schema.exercises).where(eq(schema.exercises.userId, userId)),
    db.select().from(schema.setLogs).where(eq(schema.setLogs.userId, userId)),
    db.select().from(schema.bodyLogs).where(eq(schema.bodyLogs.userId, userId)),
  ]);

  const ix = index({
    patterns: live(patterns),
    exercises: live(exercises),
    slots: [],
    splitPeriods: [],
    entries: [],
    logs: live(logs),
    refSets: [],
    bodyLogs: live(weights),
    profile: null,
  } as never);

  const from = mondayOf([...weights.map((w) => w.date)].sort()[0]!);
  return strengthSeries(ix, from, 22, { unit: 'kg', sex: 'male', birthYear: null }).map(
    (p) => p.index,
  );
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
