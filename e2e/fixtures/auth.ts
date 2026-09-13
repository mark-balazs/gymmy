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

import { randomUUID } from 'node:crypto';
import pg from 'pg';
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
 * Creates a user with the same default content `seedNewUser` produces on first
 * sign-in, plus a live session. Each test gets its own, so parallel tests
 * cannot interfere and each one starts from a real first-run state.
 */
export interface CreateUserOptions {
  onboarded?: boolean;
  split?: Exclude<SplitKey, 'custom'>;
  days?: number;
  /**
   * Seeds a stretch of training already completed under a different split,
   * so the historised coverage can be exercised end to end. Without this a
   * test can only ever see the split that is in force right now.
   */
  /** Extra logged sets, to push a single table past one sync page. */
  bulkLogs?: number;
  history?: {
    split: Exclude<SplitKey, 'custom'>;
    weeksBack: number;
    /** Readonly so a caller can declare the list with `as const`. */
    exercises: readonly string[];
  };
}

export async function createUser(opts: CreateUserOptions = {}): Promise<TestUser> {
  const client = await db().connect();
  try {
    await client.query('BEGIN');

    const id = randomUUID();
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

    const exercises: Exercise[] = SEED_EXERCISES.map((x) => ({
      ...meta,
      id: randomUUID(),
      name: x.name,
      patternId: patternIds.get(x.pattern)!,
      where: x.where,
      tags: x.tags,
      description: x.description,
      images: x.images,
    }));

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
    const blockStart = history ? weeksAgo(history.weeksBack) : mondayOf();

    const onboarded = opts.onboarded ?? false;
    await client.query(
      `INSERT INTO profiles (id, user_id, updated_at, deleted_at, seq, onboarded, split, days, "where", bias, block_start, block_weeks, unit, lang, theme)
       VALUES ($1,$2,$3,NULL,nextval('change_seq'),$4,$5,$6,'gym','none',$7,8,'kg','en','system')`,
      [id, id, now, onboarded, split, days, blockStart],
    );

    const insertPeriod = async (
      periodSplit: Exclude<SplitKey, 'custom'>,
      startWeek: string,
      periodDays: number,
    ) => {
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

      const byName = new Map(exercises.map((e) => [e.name, e]));
      const logDate = addDays(weeksAgo(history.weeksBack), 1);
      let setNo = 0;
      for (const name of history.exercises) {
        const ex = byName.get(name);
        if (!ex) throw new Error(`history exercise not seeded: ${name}`);
        await client.query(
          `INSERT INTO set_logs (id, user_id, updated_at, deleted_at, seq, date, session, exercise_id, set_no, weight, reps, rir, note)
           VALUES ($1,$2,$3,NULL,nextval('change_seq'),$4,'A',$5,$6,40,8,2,'')`,
          [randomUUID(), id, now, logDate, ex.id, ++setNo],
        );
      }
    }

    await insertPeriod(split, mondayOf(), days);

    // An onboarded user has already been through setup, so they have a plan.
    if (onboarded) {
      const snapshot: Snapshot = {
        patterns,
        slots,
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
        refSets: [],
        profile: null,
      };
      const draft = buildProgram(index(snapshot), { days, where: 'gym', bias: 'none' });
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
      const first = exercises[0]!;
      const values: string[] = [];
      const params: unknown[] = [id, now, first.id];
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
