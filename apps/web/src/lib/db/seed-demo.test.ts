import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * The demo account is meant to be shown to somebody, so the thing worth
 * asserting is that it arrives *looking used* — onboarded, with a plan, and
 * with weeks of history behind it. An empty demo cannot show the coverage grid
 * ticking, the progress line, or the weight suggestions, which are the three
 * things the app is for.
 *
 * Runs against the real database because that is what it is testing: the
 * seeding is SQL, and a mocked version of it would prove nothing.
 */
describe('seeding the demo account', () => {
  // Pointed at a throwaway address so the real demo account is never touched,
  // whatever database this happens to run against.
  const email = `demo-test-${randomUUID().slice(0, 8)}@example.test`;
  const userId = randomUUID();

  let db: typeof import('@/lib/db').db;
  let schema: typeof import('@/lib/db/schema');

  beforeAll(async () => {
    process.env.DEMO_EMAIL = email;
    ({ db } = await import('@/lib/db'));
    schema = await import('@/lib/db/schema');
    const { seedNewUser } = await import('./seed-user');

    await db.insert(schema.users).values({ id: userId, name: 'Demo test', email });
    await seedNewUser(userId, email);
  });

  afterAll(async () => {
    // Cascades to everything seeded above.
    await db.delete(schema.users).where(sql`${schema.users.id} = ${userId}`);
  });

  const rows = async (table: 'profiles' | 'programEntries' | 'setLogs' | 'bodyLogs') => {
    const t = schema[table];
    return db
      .select()
      .from(t as never)
      .where(sql`${(t as { userId: unknown }).userId} = ${userId}`);
  };

  it('skips onboarding, because a demo should open on the app', async () => {
    const [profile] = (await rows('profiles')) as { onboarded: boolean; split: string }[];
    expect(profile?.onboarded).toBe(true);
    expect(profile?.split).toBe('sevenPattern');
  });

  it('has a generated week to train', async () => {
    const entries = await rows('programEntries');
    expect(entries.length).toBeGreaterThan(0);
  });

  it('produces a strength score with a history behind it', async () => {
    /* The one screen the demo exists to show, asserted end to end rather than
       from the generator: seeded to the database, read back, and scored by the
       same `strengthSeries` the Progress tab calls.
       The generator tests prove the *sets* have a shape. They cannot prove the
       seeding wrote the two things a score needs — a sex and a dated bodyweight
       for every week — and without either of those the page correctly shows no
       number at all, which looks exactly like a demo with no history. */
    const { index, strengthSeries, mondayOf } = await import('@athletic/domain');

    const [profile] = (await rows('profiles')) as { sex: string; heightCm: number | null }[];
    expect(profile?.sex).toBe('male');

    const weights = (await rows('bodyLogs')) as { date: string; weight: number }[];
    // One a week across the block: the score divides by what you weighed *that*
    // week, so a single current reading would leave every past week unscored.
    expect(weights.length).toBeGreaterThan(15);

    const logs = (await rows('setLogs')) as Record<string, unknown>[];
    const exercises = (await db
      .select()
      .from(schema.exercises)
      .where(sql`${schema.exercises.userId} = ${userId}`)) as Record<string, unknown>[];
    const patterns = (await db
      .select()
      .from(schema.patterns)
      .where(sql`${schema.patterns.userId} = ${userId}`)) as Record<string, unknown>[];

    const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : (v as string));
    const ix = index({
      patterns: patterns.map((p) => ({ ...p, updatedAt: iso(p.updatedAt), deletedAt: null })),
      exercises: exercises.map((e) => ({ ...e, updatedAt: iso(e.updatedAt), deletedAt: null })),
      slots: [],
      splitPeriods: [],
      entries: [],
      logs: logs.map((l) => ({ ...l, updatedAt: iso(l.updatedAt), deletedAt: null })),
      bodyLogs: weights.map((b) => ({
        ...b,
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      })),
      profile: null,
    } as never);

    const from = mondayOf([...weights.map((w) => w.date)].sort()[0]!);
    const series = strengthSeries(ix, from, 22, { unit: 'kg', sex: 'male', birthYear: null });
    const scored = series.map((s) => s.index).filter((n): n is number => n !== null);

    // A history, not a number: most weeks scored, and the block went somewhere.
    expect(scored.length).toBeGreaterThan(15);
    expect(Math.min(...scored)).toBeGreaterThan(0);
    expect(Math.max(...scored) / Math.min(...scored)).toBeGreaterThan(1.08);
  });

  it('arrives with weeks of training already behind it', async () => {
    const logs = (await rows('setLogs')) as { date: string }[];
    expect(logs.length).toBeGreaterThan(100);

    const dates = [...new Set(logs.map((l) => l.date))].sort();
    // Spread across the block rather than dumped on one day.
    expect(dates.length).toBeGreaterThan(10);

    const earliest = new Date(dates[0]!);
    const weeksBack = (Date.now() - earliest.getTime()) / (7 * 24 * 3600 * 1000);
    expect(weeksBack).toBeGreaterThan(4);
  });

  it('logs weights that suit the movement, not one number for everything', async () => {
    // A deadlift and a lateral raise sharing a weight is the tell that the
    // generator lost track of which pattern it was filling.
    const logs = (await rows('setLogs')) as { weight: number | null }[];
    const distinct = new Set(logs.map((l) => l.weight));
    expect(distinct.size).toBeGreaterThan(3);
  });
});
