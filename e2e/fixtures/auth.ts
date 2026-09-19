/**
 * Test authentication.
 *
 * Driving Google's real consent screen in CI would be slow, brittle and
 * dependent on a third party staying up. Instead we insert a user and a
 * database-backed session row and set the session cookie directly.
 *
 * That is honest rather than a shortcut: sessions genuinely are database rows,
 * so the app cannot tell the difference — and it leaves no test-only branch in
 * the production build.
 */

import { createHash, randomUUID } from 'node:crypto';
import pg from 'pg';
import { CATALOGUE } from '../../packages/domain/src/catalogue';
import { SEED_EXERCISES, SEED_PATTERNS } from '../../packages/domain/src/seed';
import { buildProgram } from '../../packages/domain/src/coach';
import { index } from '../../packages/domain/src/model';
import { buildSlots, findSplit } from '../../packages/domain/src/splits';
import type { Exercise, Pattern, Slot, Snapshot, SplitKey } from '../../packages/domain/src/types';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://athletic:athletic@localhost:5432/athletic';

export interface TestUser {
  id: string;
  email: string;
  sessionToken: string;
}

let pool: pg.Pool | null = null;
const db = (): pg.Pool => (pool ??= new pg.Pool({ connectionString: DATABASE_URL, max: 4 }));

export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = null;
}

/** Monday of the current week, matching the app's own week boundary. */
function mondayOf(d = new Date()): string {
  const x = new Date(d);
  x.setHours(12, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function weeksAgo(n: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - n * 7);
  return mondayOf(d);
}

/**
 * The day the `history` option logs its first set: the Tuesday of the week
 * `weeksBack` weeks ago.
 *
 * Exported so a test can navigate to the day the fixture actually wrote rather
 * than re-deriving it. The calendar spec used to go to "21 days ago", which is
 * a different month from that Tuesday on about three weeks a year.
 */
export function historyStart(weeksBack: number): string {
  return addDays(weeksAgo(weeksBack), 1);
}

/** The catalogue's id for an exercise named in a fixture, or a loud failure. */
function catalogueId(name: string): string {
  const entry = CATALOGUE.find((c) => c.name === name);
  if (!entry) throw new Error(`not in the catalogue: ${name}`);
  return entry.id;
}

/** A set logged on a fixed date, at the load that is stored. */
export interface DatedSet {
  exercise: string;
  /** ISO date. Absolute, not relative to today. */
  date: string;
  /** The stored figure — both dumbbells for a pair, as the Train card records. */
  weight: number;
  reps: number;
  rir: number;
}

export interface CreateUserOptions {
  /**
   * A user and a session and nothing else — no patterns, slot skeleton, split
   * period or profile. This is what an account looks like when first-run
   * seeding failed: Auth.js writes the user row before it fires the event that
   * seeds, and that event never fires twice. Used to prove the app repairs it
   * rather than sitting on a loading screen forever.
   */
  bare?: boolean;
  /**
   * The account's id, for a test that needs to know it before the account
   * exists — the generator's per-account offset is derived from it. Must be
   * fresh on every run: the e2e database is never reset.
   */
  id?: string;
  onboarded?: boolean;
  /**
   * Also writes the copied exercise rows every account had before the library
   * became the catalogue, each under a random id, and logs `history` and
   * `bulkLogs` against those ids.
   *
   * Off by default, because no account created today has them. On, it is the
   * shape of an account from before the catalogue that has rebuilt its week
   * since: program entries at `ex-…` ids, history at the old ones. `index()`
   * reads the old rows as aliases by name, and a spec opting in is what keeps
   * that path walked end to end.
   */
  legacyLibrary?: boolean;
  /**
   * No split periods at all — an account from before periods existed. The
   * table arrived without a backfill, so an account that has not switched
   * split since has none, and its first switch has to write one for the weeks
   * behind it.
   */
  noPeriods?: boolean;
  /**
   * Sets on fixed dates, for behaviour tied to a date rather than to "three
   * weeks ago" — the dumbbell convention's cutover is one.
   */
  sets?: readonly DatedSet[];
  /**
   * The profile's answer about sex. Every real account starts at
   * 'unspecified' and onboarding never asks, which is why it is the default —
   * and why DOTS, which needs one of the two curves, asks for it rather than
   * showing a midpoint no calculator produces.
   */
  sex?: 'male' | 'female' | 'unspecified';
  split?: Exclude<SplitKey, 'custom'>;
  days?: number;
  /** Extra logged sets, to push a single table past one sync page. */
  bulkLogs?: number;
  /**
   * Starts the training block *this* week even though the history is older.
   * The Progress tab used to window itself by the block and showed such an
   * account nothing at all. (A real block never moves: it starts the week the
   * account was made. Without this option the fixture starts it at the history.)
   */
  blockStartsNow?: boolean;
  /**
   * Seeds a stretch of training already completed under a different split,
   * so the historised coverage can be exercised end to end. Without this a
   * test can only ever see the split that is in force right now.
   */
  history?: {
    split: Exclude<SplitKey, 'custom'>;
    weeksBack: number;
    /** Readonly so a caller can declare the list with `as const`. */
    exercises: readonly string[];
    /**
     * Per-session weights, oldest first, in place of the default 40 + 2.5 a
     * week — for a lift that has to have gone *down*.
     */
    weights?: readonly number[];
    /**
     * Weekly sessions per exercise, oldest first. One by default, which is all
     * most specs need — they are checking that old weeks keep reading against
     * the split they were trained under, and one set proves that.
     *
     * Ask for more when the behaviour under test needs a lift to have a
     * *history* rather than a data point: a goal will not offer a baseline
     * built on fewer than three sessions, for the same reason it refuses a
     * target inside the retest noise.
     */
    sessions?: number;
  };
}

/**
 * Creates an account with what `seedNewUser` writes on first sign-in — the
 * seven patterns and isolation, the slot skeleton, an opening split period and
 * a profile — plus a live session. Each test gets its own, so parallel tests
 * cannot interfere and each one starts from a real first-run state.
 *
 * **No exercise rows**, because a new account has none: the library is the
 * catalogue, in code, and every set and program entry names a catalogue id.
 * This used to copy the whole library in under random ids, which left every
 * fixture account in a shape no account created today has, and only the
 * journey spec — which signs up for real — ever saw the real one. The old shape
 * is still available as `legacyLibrary`, because accounts from before the
 * catalogue still exist.
 */
export async function createUser(opts: CreateUserOptions = {}): Promise<TestUser> {
  const client = await db().connect();
  try {
    await client.query('BEGIN');

    const id = opts.id ?? randomUUID();
    const email = `e2e-${id.slice(0, 8)}@example.test`;
    await client.query('INSERT INTO "user" (id, name, email) VALUES ($1, $2, $3)', [
      id,
      'E2E User',
      email,
    ]);

    const sessionToken = randomUUID();
    const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000);
    await client.query(
      'INSERT INTO session ("sessionToken", "userId", expires) VALUES ($1, $2, $3)',
      [sessionToken, id, expires],
    );

    if (opts.bare) {
      await client.query('COMMIT');
      return { id, email, sessionToken };
    }

    const now = new Date();
    const iso = now.toISOString();
    const meta = { updatedAt: iso, deletedAt: null };

    // Built in memory first so the real generator can run over them, rather
    // than hand-writing a plan the app would never actually produce.
    const patterns: Pattern[] = SEED_PATTERNS.map((p, i) => ({
      ...meta,
      id: randomUUID(),
      key: p.key,
      name: p.key,
      role: p.role,
      counts: p.counts,
      position: i,
    }));
    const patternIds = new Map(patterns.map((p) => [p.key!, p.id]));

    const split = opts.split ?? 'sevenPattern';
    const preset = findSplit(split)!;
    const days = opts.days ?? preset.defaultDays;

    // Materialised from the real preset, so tests exercise the slot shape the
    // app actually ships rather than a hand-written approximation.
    const slots: Slot[] = buildSlots(preset, days).map((s) => ({
      ...meta,
      ...s,
      id: randomUUID(),
    }));

    // Only for an account from before the catalogue — see `legacyLibrary`.
    const exercises: Exercise[] = opts.legacyLibrary
      ? SEED_EXERCISES.map((x) => ({
          ...meta,
          id: randomUUID(),
          name: x.name,
          patternId: patternIds.get(x.pattern)!,
          where: x.where,
          tags: x.tags,
          description: x.description,
          images: x.images,
        }))
      : [];
    const legacyIds = new Map(exercises.map((e) => [e.name, e.id]));
    /** The id a set is logged under: the old row's on a legacy account, the
     *  catalogue's on every other. */
    const exerciseIdOf = (name: string): string => {
      const legacy = legacyIds.get(name);
      if (opts.legacyLibrary && !legacy) throw new Error(`history exercise not seeded: ${name}`);
      return legacy ?? catalogueId(name);
    };

    for (const p of patterns) {
      await client.query(
        `INSERT INTO patterns (id, user_id, updated_at, deleted_at, seq, key, name, role, counts, position)
         VALUES ($1,$2,$3,NULL,nextval('change_seq'),$4,$5,$6,$7,$8)`,
        [p.id, id, now, p.key, p.name, p.role, p.counts, p.position],
      );
    }
    for (const s of slots) {
      await client.query(
        `INSERT INTO slots (id, user_id, updated_at, deleted_at, seq, key, name, required_role, position, session_index, pattern_keys, day_key)
         VALUES ($1,$2,$3,NULL,nextval('change_seq'),$4,$5,$6,$7,$8,$9,$10)`,
        [
          s.id,
          id,
          now,
          s.key,
          s.name,
          s.requiredRole,
          s.position,
          s.sessionIndex,
          s.patternKeys ? JSON.stringify(s.patternKeys) : null,
          s.dayKey,
        ],
      );
    }
    for (const x of exercises) {
      await client.query(
        `INSERT INTO exercises (id, user_id, updated_at, deleted_at, seq, name, pattern_id, "where", tags, description, images)
         VALUES ($1,$2,$3,NULL,nextval('change_seq'),$4,$5,$6,$7,$8,$9)`,
        [
          x.id,
          id,
          now,
          x.name,
          x.patternId,
          x.where,
          JSON.stringify(x.tags),
          x.description,
          JSON.stringify(x.images),
        ],
      );
    }

    // A block that starts far enough back for the seeded history to be
    // reachable with the Week tab's back arrow.
    const history = opts.history;
    const blockStart = history && !opts.blockStartsNow ? weeksAgo(history.weeksBack) : mondayOf();

    const onboarded = opts.onboarded ?? false;
    await client.query(
      `INSERT INTO profiles (id, user_id, updated_at, deleted_at, seq, onboarded, split, days, "where", bias, block_start, block_weeks, unit, lang, theme, sex)
       VALUES ($1,$2,$3,NULL,nextval('change_seq'),$4,$5,$6,'gym','none',$7,8,'kg','en','system',$8)`,
      [id, id, now, onboarded, split, days, blockStart, opts.sex ?? 'unspecified'],
    );

    const insertPeriod = async (
      periodSplit: Exclude<SplitKey, 'custom'>,
      startWeek: string,
      periodDays: number,
    ) => {
      if (opts.noPeriods) return;
      await client.query(
        `INSERT INTO split_periods (id, user_id, updated_at, deleted_at, seq, split, days, start_week, pattern_keys)
         VALUES ($1,$2,$3,NULL,nextval('change_seq'),$4,$5,$6,$7)`,
        [
          randomUUID(),
          id,
          now,
          periodSplit,
          periodDays,
          startWeek,
          JSON.stringify(findSplit(periodSplit)!.covers),
        ],
      );
    };

    if (history) {
      // The earlier split, plus real sets logged under it. These weeks must keep
      // reading against that split's goal no matter what is chosen later.
      await insertPeriod(history.split, weeksAgo(history.weeksBack), days);

      const start = historyStart(history.weeksBack);
      let setNo = 0;
      for (const name of history.exercises) {
        const exerciseId = exerciseIdOf(name);
        for (let week = 0; week < (history.sessions ?? 1); week++) {
          /* A week apart and 2.5 kg up each time — a lift that is being
             trained rather than the same set copied, so anything reading a
             trend off it reads a real one. */
          await client.query(
            `INSERT INTO set_logs (id, user_id, updated_at, deleted_at, seq, date, session, exercise_id, set_no, weight, reps, rir, note)
             VALUES ($1,$2,$3,NULL,nextval('change_seq'),$4,'A',$5,$6,$7,8,2,'')`,
            [
              randomUUID(),
              id,
              now,
              addDays(start, week * 7),
              exerciseId,
              ++setNo,
              history.weights?.[week] ?? 40 + week * 2.5,
            ],
          );
        }
      }
    }

    for (const [i, s] of (opts.sets ?? []).entries()) {
      await client.query(
        `INSERT INTO set_logs (id, user_id, updated_at, deleted_at, seq, date, session, exercise_id, set_no, weight, reps, rir, note)
         VALUES ($1,$2,$3,NULL,nextval('change_seq'),$4,'A',$5,$6,$7,$8,$9,'')`,
        [randomUUID(), id, now, s.date, exerciseIdOf(s.exercise), i + 1, s.weight, s.reps, s.rir],
      );
    }

    await insertPeriod(split, mondayOf(), days);

    // An onboarded user has already been through setup, so they have a plan.
    if (onboarded) {
      const snapshot: Snapshot = {
        patterns,
        slots,
        // What was written: none, or the legacy rows, which `index()` reads as
        // aliases — either way the week comes out in catalogue ids.
        exercises,
        // The current period, so the generator aims at this split's coverage
        // set rather than falling back to every counted pattern.
        splitPeriods: [
          {
            id: randomUUID(),
            updatedAt: iso,
            deletedAt: null,
            split,
            days,
            startWeek: mondayOf(),
            patternKeys: [...preset.covers],
          },
        ],
        entries: [],
        logs: [],
        bodyLogs: [],
        goals: [],
        profile: null,
      };
      // Variety 0, like the demo: the specs name the lifts this week holds.
      const draft = buildProgram(index(snapshot), { days, where: 'gym', bias: 'none', variety: 0 });
      for (const e of draft) {
        await client.query(
          `INSERT INTO program_entries (id, user_id, updated_at, deleted_at, seq, session_index, slot_id, exercise_id, sets, rep_range, start_weight, note)
           VALUES ($1,$2,$3,NULL,nextval('change_seq'),$4,$5,$6,$7,$8,NULL,'')`,
          [randomUUID(), id, now, e.sessionIndex, e.slotId, e.exerciseId, e.sets, e.repRange],
        );
      }
    }

    if (opts.bulkLogs) {
      // One row per statement would take minutes; this is a fixture, not a
      // demonstration of how the app writes.
      const values: string[] = [];
      const params: unknown[] = [id, now, exerciseIdOf(SEED_EXERCISES[0]!.name)];
      for (let i = 0; i < opts.bulkLogs; i++) {
        const d = addDays(weeksAgo(8), i % 30);
        params.push(randomUUID(), d, (i % 20) + 1);
        const base = params.length - 3;
        values.push(
          `($${base + 1},$1,$2,NULL,nextval('change_seq'),$${base + 2},'A',$3,$${base + 3},50,8,2,'')`,
        );
      }
      await client.query(
        `INSERT INTO set_logs (id, user_id, updated_at, deleted_at, seq, date, session, exercise_id, set_no, weight, reps, rir, note)
         VALUES ${values.join(',')}`,
        params,
      );
      /* And the profile moved above every one of them, as it is in production
         the moment any setting changes. Written before the logs, it sat below
         them, where a cursor run to the highest seq on the page could not
         overshoot anything — so the paging spec passed against the very bug it
         exists for. */
      await client.query(`UPDATE profiles SET seq = nextval('change_seq') WHERE user_id = $1`, [
        id,
      ]);
    }

    await client.query('COMMIT');
    return { id, email, sessionToken };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Writes the first thing `seedNewUser` writes — the pattern rows, under the ids
 * it derives — and nothing after it.
 *
 * What a seed that died halfway leaves behind: the server writes one statement
 * at a time with no transaction around them, so a timeout between two inserts
 * is a real state. The ids are `seedId`'s own, so a repair that runs the seed
 * again lands on these rows rather than beside them; with random ids a working
 * repair would write eight more patterns, and a test could pass over a doubled
 * set.
 */
export async function seedPatternsOnly(userId: string): Promise<void> {
  const seedId = (kind: string, key: string): string =>
    createHash('sha256').update(`${userId}\u0000${kind}\u0000${key}`).digest('hex').slice(0, 32);
  for (const [i, p] of SEED_PATTERNS.entries()) {
    await db().query(
      `INSERT INTO patterns (id, user_id, updated_at, deleted_at, seq, key, name, role, counts, position)
       VALUES ($1,$2,now(),NULL,nextval('change_seq'),$3,$3,$4,$5,$6)`,
      [seedId('pattern', p.key), userId, p.key, p.role, p.counts, i],
    );
  }
}

/**
 * Puts a known sign-in code in the database, as if it had just been emailed.
 *
 * The alternative is reading the real code out of a real inbox, which makes the
 * test depend on a third party being up. This is the same row Auth.js writes
 * itself: it stores the code hashed with the secret, never in the clear, so a
 * database dump is not a pile of working sign-in codes.
 */
export async function seedSignInCode(email: string, code: string): Promise<void> {
  const secret = process.env.AUTH_SECRET ?? 'e2e-secret-e2e-secret-e2e-secret-32ch';
  const token = createHash('sha256').update(`${code}${secret}`).digest('hex');

  await db().query(
    'INSERT INTO "verificationToken" (identifier, token, expires) VALUES ($1, $2, $3)',
    [email, token, new Date(Date.now() + 10 * 60 * 1000)],
  );
}

/**
 * Clears the sign-in rate limiter.
 *
 * The per-client limit buckets by `x-forwarded-for`, and every test in this
 * suite arrives with none — so they all share one bucket, and enough sign-in
 * traffic in fifteen minutes makes the *next* test see a 429 it did nothing to
 * earn. Any test that asserts on the un-throttled response has to start from a
 * known state rather than inherit whatever the run before it left behind.
 */
export async function resetSignInThrottle(): Promise<void> {
  await db().query('DELETE FROM sign_in_attempts');
}

/** Cookie shape Auth.js looks for over plain HTTP. */
export const sessionCookie = (user: TestUser, origin: string) => ({
  name: 'authjs.session-token',
  value: user.sessionToken,
  domain: new URL(origin).hostname,
  path: '/',
  httpOnly: true,
  secure: false,
  sameSite: 'Lax' as const,
  expires: Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
});

/**
 * How many rows a table still holds for an account.
 *
 * Deletion is the one thing the UI cannot demonstrate: a screen that no longer
 * shows your training looks identical whether the rows are gone or merely
 * hidden. This looks.
 */
export async function rowCount(table: string, userId: string): Promise<number> {
  const r = await db().query(`SELECT count(*)::int AS n FROM "${table}" WHERE user_id = $1`, [
    userId,
  ]);
  return (r.rows[0] as { n: number } | undefined)?.n ?? 0;
}

/**
 * The sets the *server* holds for an account — what actually synced.
 *
 * A badge that says "All saved" only says the device's queue is empty, and an
 * empty queue is exactly what a device that lost its queue looks like too. The
 * server is the one witness that cannot be fooled by that.
 */
export async function serverSets(
  userId: string,
): Promise<{ id: string; weight: number | null; reps: number | null; session: string }[]> {
  const r = await db().query(
    `SELECT id, weight, reps, session FROM set_logs WHERE user_id = $1 AND deleted_at IS NULL`,
    [userId],
  );
  return r.rows as { id: string; weight: number | null; reps: number | null; session: string }[];
}

/**
 * A trainer, a published plan, and a share aimed at somebody.
 *
 * Written straight into the database rather than driven through the coach UI,
 * for the same reason every other fixture here is: the test is about what the
 * athlete does with a plan, and getting there through eleven taps of somebody
 * else's screen would make it fail for reasons that are not the point.
 */
export async function shareAPlanWith(
  athleteId: string,
  opts: {
    name?: string;
    days?: number;
    /** Slot 0 of session 0, by name. Anything the seeded library has. */
    exerciseName?: string | null;
    viaGroup?: boolean;
  } = {},
): Promise<{ planId: string; trainerId: string }> {
  const client = await db().connect();
  try {
    await client.query('BEGIN');

    const trainerId = randomUUID();
    await client.query(`INSERT INTO "user" (id, name, email, role) VALUES ($1,$2,$3,'trainer')`, [
      trainerId,
      'Coach Ann',
      `coach-${trainerId.slice(0, 8)}@example.test`,
    ]);

    const planId = randomUUID();
    const days = opts.days ?? 3;
    await client.query(
      `INSERT INTO plans (id, owner_id, name, description, days, "where", version, published_at)
       VALUES ($1,$2,$3,$4,$5,'gym',1,now())`,
      [planId, trainerId, opts.name ?? 'Coach block', 'Four weeks of pressing', days],
    );

    /* A real skeleton from the real preset, so the plan installs a week the
       coverage rules recognise rather than a hand-written approximation. */
    const preset = findSplit('sevenPattern')!;
    const slots = buildSlots(preset, days);
    for (const s of slots) {
      const first = s.sessionIndex === 0 && s.position === 0;
      await client.query(
        `INSERT INTO plan_slots
           (id, plan_id, session_index, position, key, name, required_role, pattern_keys, day_key, exercise_name, sets, rep_range)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          randomUUID(),
          planId,
          s.sessionIndex,
          s.position,
          s.key,
          s.name,
          s.requiredRole,
          s.patternKeys ? JSON.stringify(s.patternKeys) : null,
          s.dayKey,
          first ? (opts.exerciseName ?? null) : null,
          first ? 5 : 3,
          '5-8',
        ],
      );
    }

    if (opts.viaGroup) {
      const groupId = randomUUID();
      await client.query(`INSERT INTO user_groups (id, owner_id, name) VALUES ($1,$2,$3)`, [
        groupId,
        trainerId,
        'Tuesday squad',
      ]);
      await client.query(`INSERT INTO group_members (group_id, user_id) VALUES ($1,$2)`, [
        groupId,
        athleteId,
      ]);
      await client.query(`INSERT INTO plan_shares (id, plan_id, group_id) VALUES ($1,$2,$3)`, [
        randomUUID(),
        planId,
        groupId,
      ]);
    } else {
      await client.query(
        `INSERT INTO plan_shares (id, plan_id, target_user_id) VALUES ($1,$2,$3)`,
        [randomUUID(), planId, athleteId],
      );
    }

    await client.query('COMMIT');
    return { planId, trainerId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Publishes a new edition, which is what an athlete is then offered. */
export async function publishNewVersion(planId: string): Promise<void> {
  await db().query(`UPDATE plans SET version = version + 1, updated_at = now() WHERE id = $1`, [
    planId,
  ]);
}

/** What the profile row says about the plan in effect. */
export async function planInEffect(
  userId: string,
): Promise<{ planId: string | null; planVersion: number | null }> {
  const r = await db().query(
    `SELECT plan_id, plan_version FROM profiles WHERE user_id = $1 LIMIT 1`,
    [userId],
  );
  const row = r.rows[0] as { plan_id: string | null; plan_version: number | null } | undefined;
  return { planId: row?.plan_id ?? null, planVersion: row?.plan_version ?? null };
}

/** The language the *server* holds on the profile — what another device gets. */
export async function profileLang(userId: string): Promise<string | null> {
  const r = await db().query('SELECT lang FROM profiles WHERE user_id = $1 LIMIT 1', [userId]);
  return (r.rows[0] as { lang: string } | undefined)?.lang ?? null;
}

/** The height the server holds, in centimetres. */
export async function profileHeight(userId: string): Promise<number | null> {
  const r = await db().query('SELECT height_cm FROM profiles WHERE user_id = $1 LIMIT 1', [userId]);
  const v = (r.rows[0] as { height_cm: number | string | null } | undefined)?.height_cm;
  return v === null || v === undefined ? null : Number(v);
}

/** Live split periods the server holds that start on a given Monday. */
export async function periodsStarting(userId: string, week: string): Promise<number> {
  const r = await db().query(
    `SELECT count(*)::int AS n FROM split_periods
      WHERE user_id = $1 AND start_week = $2 AND deleted_at IS NULL`,
    [userId, week],
  );
  return (r.rows[0] as { n: number } | undefined)?.n ?? 0;
}

/**
 * The week the server holds, as "session:slot position" → exercise id.
 *
 * Keyed by position rather than by slot id: onboarding writes its own slots,
 * so the ids are the device's, while the position is what the generator
 * decides by.
 */
export async function installedWeek(userId: string): Promise<Record<string, string>> {
  const r = await db().query(
    `SELECT e.session_index, s.position, e.exercise_id
       FROM program_entries e JOIN slots s ON s.id = e.slot_id AND s.user_id = e.user_id
      WHERE e.user_id = $1 AND e.deleted_at IS NULL AND s.deleted_at IS NULL`,
    [userId],
  );
  const out: Record<string, string> = {};
  for (const row of r.rows as { session_index: number; position: number; exercise_id: string }[])
    out[`${row.session_index}:${row.position}`] = row.exercise_id;
  return out;
}

/** Today's Monday, as the fixture and the app both reckon it. */
export const thisMonday = (): string => mondayOf();
