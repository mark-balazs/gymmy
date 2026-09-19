import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CATALOGUE, addDays, mondayOf } from '@athletic/domain';
import { DEMO_WEEKS, demoGoals, demoHistory, type DemoPlanEntry } from './demo-history';

/**
 * The demo account is meant to be shown to somebody, so the thing worth
 * asserting is that it arrives *looking used* — onboarded, with a plan, and
 * with weeks of history behind it. An empty demo cannot show the coverage grid
 * ticking, the progress line, the strength numbers or a goal being judged.
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
  let seedNewUser: typeof import('./seed-user').seedNewUser;

  const HISTORY = ['programEntries', 'setLogs', 'bodyLogs', 'goals'] as const;
  let first: Record<string, number>;

  beforeAll(async () => {
    process.env.DEMO_EMAIL = email;
    ({ db } = await import('@/lib/db'));
    schema = await import('@/lib/db/schema');
    ({ seedNewUser } = await import('./seed-user'));

    await db.insert(schema.users).values({ id: userId, name: 'Demo test', email });
    await seedNewUser(userId, email);
    first = await counts();
  });

  afterAll(async () => {
    // Cascades to everything seeded above.
    await db.delete(schema.users).where(sql`${schema.users.id} = ${userId}`);
  });

  const rows = async (table: 'profiles' | 'programEntries' | 'setLogs' | 'bodyLogs' | 'goals') => {
    const t = schema[table];
    return db
      .select()
      .from(t as never)
      .where(sql`${(t as { userId: unknown }).userId} = ${userId}`);
  };

  const counts = async (): Promise<Record<string, number>> =>
    Object.fromEntries(await Promise.all(HISTORY.map(async (t) => [t, (await rows(t)).length])));

  /** The plan as `seedDemoHistory` reads it back: this account's own entries,
   *  named through the catalogue. */
  const seededPlan = async (): Promise<DemoPlanEntry[]> => {
    const byId = new Map(CATALOGUE.map((c) => [c.id, c]));
    const entries = (await rows('programEntries')) as {
      sessionIndex: number;
      exerciseId: string | null;
      sets: number;
    }[];
    return entries.flatMap((e) => {
      const c = e.exerciseId ? byId.get(e.exerciseId) : undefined;
      if (!c) return [];
      return [
        {
          sessionIndex: e.sessionIndex,
          exerciseId: c.id,
          name: c.name,
          patternKey: c.pattern,
          sets: e.sets,
        },
      ];
    });
  };

  it('skips onboarding, because a demo should open on the app', async () => {
    const [profile] = (await rows('profiles')) as { onboarded: boolean; split: string }[];
    expect(profile?.onboarded).toBe(true);
    expect(profile?.split).toBe('sevenPattern');
  });

  it('seeds the week the demo history was authored against', async () => {
    /* Not just a week: this one. The demo's arcs are written against named
       lifts — `demo-loads` says which stalls and which slid — so the seed has
       to take the pool's own order (variety 0), not the per-account shuffle a
       real account gets. Under the shuffle the demo still gets a week and
       still logs sets, onto other lifts, and `demo-history.test.ts` cannot
       notice: it builds its plan by hand and never calls the seed. */
    const name = new Map(CATALOGUE.map((c) => [c.id, c.name]));
    const planned = ((await rows('programEntries')) as { exerciseId: string }[]).map((e) =>
      name.get(e.exerciseId),
    );
    expect(planned).toEqual(
      expect.arrayContaining([
        'Barbell Bench Press',
        'Reverse Lunge',
        'Overhead Tricep Extension',
        'Step-Up',
        'Chest-Supported Row',
      ]),
    );
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

    /* And the history sits where the block says it does. The profile's block
       is set DEMO_WEEKS back so the Week tab can page into the logs; a block
       starting anywhere else leaves weeks of history on no page at all, and
       the counts above cannot see that — they hold for any five months. */
    const monday = mondayOf(new Date());
    const [profile] = (await rows('profiles')) as { blockStart: string }[];
    expect(profile!.blockStart).toBe(addDays(monday, -7 * DEMO_WEEKS));
    expect(dates[0]).toBe(profile!.blockStart);
    // Up to last week and not into this one, which is the week still to train.
    expect(dates.at(-1)! < monday && dates.at(-1)! >= addDays(monday, -7)).toBe(true);
  });

  it('stores exactly the sets the generator produced', async () => {
    /* The shape of the history is `demo-history.test.ts`'s job. What only this
       file can see is the trip into the database — a weight rounded on the way
       in, a history dated from the wrong Monday — so every stored set is held
       against the generator's own output for the plan this account was given.
       That also rules out one number logged for everything, which is what this
       used to check by counting distinct weights, and which per-pattern
       fallback loads would have passed. */
    type Logged = {
      date: string;
      exerciseId: string;
      setNo: number;
      weight: number | null;
      reps: number | null;
      rir: number | null;
    };
    const key = (s: Logged) =>
      `${s.date}|${s.exerciseId}|${s.setNo}|${s.weight}|${s.reps}|${s.rir}`;
    const plan = await seededPlan();
    const stored = (await rows('setLogs')) as Logged[];
    expect(stored.map(key).sort()).toEqual(
      demoHistory(plan, mondayOf(new Date())).sets.map(key).sort(),
    );
  });

  it('arrives with the goals the Progress page needs', async () => {
    /* Without a goal the app says nothing evaluative, which leaves the goal
       card and the verdict card blank on the one account made to show them.
       Which goals, and why, is `demo-history.test.ts`; this is the half it
       cannot see — that they reached the table, on the lifts this account was
       given, with the numbers the generator chose. */
    const plan = await seededPlan();
    const monday = mondayOf(new Date());

    type Goal = {
      exerciseId: string;
      baseline: number;
      target: number;
      startedOn: string;
      targetDate: string;
    };
    const pick = ({ exerciseId, baseline, target, startedOn, targetDate }: Goal) => ({
      exerciseId,
      baseline,
      target,
      startedOn,
      targetDate,
    });
    const byLift = (a: Goal, b: Goal) => a.exerciseId.localeCompare(b.exerciseId);

    const got = (await rows('goals')) as Goal[];
    expect(got).toHaveLength(2);
    const bench = CATALOGUE.find((c) => c.name === 'Barbell Bench Press')!.id;
    expect(got.map((g) => g.exerciseId)).toContain(bench);

    /* Held to the generator with the stored goals' own lifts put first. The
       climbing goal goes on whichever steady lift `demoGoals` meets first, and
       the seed reads the plan back with no ORDER BY, so that is Postgres's
       choice: read in the order of the entries index instead of the heap, the
       same seed picks the Trap Bar Deadlift rather than the Goblet Squat. A
       second read here could disagree with the seed over nothing but a query
       plan — it did, once in about a hundred runs. Putting the stored lifts
       first asks what does not depend on that: are these the goals the
       generator makes for these lifts? A lift it would never pick still
       fails, because it walks straight past it. */
    const chosen = new Set(got.map((g) => g.exerciseId));
    const theirsFirst = [
      ...plan.filter((e) => chosen.has(e.exerciseId)),
      ...plan.filter((e) => !chosen.has(e.exerciseId)),
    ];
    const expected = demoGoals(theirsFirst, demoHistory(plan, monday).sets, monday);
    expect(got.map(pick).sort(byLift)).toEqual(expected.map(pick).sort(byLift));
  });

  it('writes nothing twice when seeded again', async () => {
    /* Two seeds can overlap — createUser still running when the first sync
       finds the account empty, or two devices at once — and for the demo the
       bulk of what both would write is its history. Every row id is derived
       from what the row represents, so the second run lands on the first run's
       rows; a random id anywhere in here doubles the history. `seed-user.test`
       re-seeds only an ordinary account, which writes none of these tables.
       Last in the file, so everything above reads the first seed alone. */
    await seedNewUser(userId, email);
    expect(await counts()).toEqual(first);
  });
});
