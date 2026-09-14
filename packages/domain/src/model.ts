/**
 * Pure derived values. No IO, no DOM, no framework — which is why these are the
 * functions the test suite leans on hardest, and why they can run identically on
 * the client and the server.
 *
 * Soft-deleted records are filtered out here, once, so no caller has to remember.
 */

import type {
  BodyLog,
  CheckResult,
  CoverageCell,
  Exercise,
  Pattern,
  PatternKey,
  ProgramEntry,
  ProgramRow,
  RefSet,
  Goal,
  SetLog,
  Slot,
  Snapshot,
  SplitPeriod,
  Sex,
  Suggestion,
  Trend,
  Unit,
  WeekCoverage,
} from './types';

/* --------------------------------------------------------------- helpers */

export const live = <T extends { deletedAt: string | null }>(rows: T[]): T[] =>
  rows.filter((r) => r.deletedAt === null);

export const sessionLabel = (i: number): string => String.fromCharCode(65 + i);

export function num(v: unknown): number {
  if (v === '' || v === null || v === undefined) return 0;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/** yyyy-mm-dd in local time. Deliberately not toISOString(), which is UTC and
 *  silently shifts the date for anyone east or west of Greenwich at the edges. */
export function isoDate(d: Date | string): string {
  const x = typeof d === 'string' ? new Date(d) : d;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
}

/** The Monday of the week containing `d`. Weeks are the unit of coverage. */
export function mondayOf(d: Date | string): string {
  const x = typeof d === 'string' ? new Date(`${d}T12:00:00`) : new Date(d);
  x.setHours(12, 0, 0, 0);
  const day = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - day);
  return isoDate(x);
}

/** Whole days from one yyyy-mm-dd to another. Negative if `to` is earlier. */
export const daysBetween = (from: string, to: string): number =>
  Math.round(
    (new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 86_400_000,
  );

export function addDays(isoStr: string, n: number): string {
  const d = new Date(`${isoStr}T12:00:00`);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

/**
 * Epley, adjusted for reps in reserve.
 *
 * Without the RIR term a set taken to failure and a set left with three in the
 * tank look identical, which makes the whole progress view lie. This is the one
 * number that lets sessions of different intensity be compared.
 */
export function est1RM(
  weight: number | null,
  reps: number | null,
  rir: number | null,
): number | null {
  const w = num(weight);
  const r = num(reps);
  if (!w || !r) return null;
  return Math.round(w * (1 + (r + num(rir)) / 30) * 10) / 10;
}

export const volume = (weight: number | null, reps: number | null): number | null =>
  num(weight) && num(reps) ? num(weight) * num(reps) : null;

/* --------------------------------------------------------------- indexes */

export interface Indexed {
  patterns: Pattern[];
  exercises: Exercise[];
  slots: Slot[];
  /** Oldest first. */
  bodyLogs: BodyLog[];
  /** Oldest first. */
  splitPeriods: SplitPeriod[];
  entries: ProgramEntry[];
  logs: SetLog[];
  refSets: RefSet[];
  /** Lifts the user has asked to be held to, live ones and expired alike;
   *  `liveGoals()` narrows to the ones still running. */
  goals: Goal[];
  patternById: Map<string, Pattern>;
  exerciseById: Map<string, Exercise>;
  slotById: Map<string, Slot>;
}

export function index(snap: Snapshot): Indexed {
  const patterns = live(snap.patterns).sort((a, b) => a.position - b.position);
  /* Fields added after a device last synced are simply absent from the rows
   * already in its IndexedDB — the server only re-sends rows whose seq moved,
   * and adding a column does not move it. Defaulting them here, at the single
   * point every consumer reads through, is what stops `images.length` throwing
   * on a row written before images existed. */
  const exercises = live(snap.exercises).map((e) => ({
    ...e,
    description: e.description ?? '',
    images: e.images ?? [],
  }));
  const slots = live(snap.slots).sort((a, b) => a.position - b.position);
  return {
    patterns,
    exercises,
    slots,
    splitPeriods: live(snap.splitPeriods ?? []).sort((a, b) =>
      a.startWeek < b.startWeek ? -1 : a.startWeek > b.startWeek ? 1 : 0,
    ),
    entries: live(snap.entries),
    goals: live(snap.goals ?? []),
    /**
     * Chronological, and that is load-bearing rather than tidy.
     *
     * These arrive in IndexedDB primary-key order — which is to say in order of
     * random UUID, which is no order at all. Anything reading "the last N" off
     * this array was reading an arbitrary N: `effortCheck` asks whether your
     * *recent* sets have been too easy and was sampling the whole history at
     * random, so its verdict could not improve when your training did.
     */
    logs: live(snap.logs).sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.session.localeCompare(b.session) || a.setNo - b.setNo,
    ),
    refSets: live(snap.refSets),
    bodyLogs: live(snap.bodyLogs ?? []).sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
    ),
    patternById: new Map(patterns.map((p) => [p.id, p])),
    exerciseById: new Map(exercises.map((e) => [e.id, e])),
    slotById: new Map(slots.map((s) => [s.id, s])),
  };
}

/* ------------------------------------------------------------- coverage */

/**
 * The split in effect during a given week.
 *
 * The latest period that started on or before it. A week earlier than every
 * period — history logged before this device knew about periods at all — gets
 * the earliest one, which is the closest honest answer available.
 */
export function periodFor(ix: Indexed, weekOf: string): SplitPeriod | null {
  if (!ix.splitPeriods.length) return null;
  let found: SplitPeriod | null = null;
  for (const p of ix.splitPeriods) {
    if (p.startWeek <= weekOf) found = p;
  }
  return found ?? ix.splitPeriods[0]!;
}

/** The period currently in effect. */
export const currentPeriod = (ix: Indexed): SplitPeriod | null =>
  ix.splitPeriods.length ? ix.splitPeriods[ix.splitPeriods.length - 1]! : null;

/**
 * What a complete week meant at a given point in time.
 *
 * This is the function the whole historisation rests on. Coverage is a property
 * of the split you were training at the time, so a week is always scored
 * against the goal that was in force *that* week — switching split in March
 * cannot retroactively fail your January.
 *
 * With no periods recorded (an account from before splits existed) it falls
 * back to every counted pattern, which is exactly how those weeks were scored
 * when they were logged.
 */
export function coveragePatterns(ix: Indexed, weekOf?: string): Pattern[] {
  const counted = ix.patterns.filter((p) => p.counts);
  const period = weekOf ? periodFor(ix, weekOf) : currentPeriod(ix);
  if (!period) return counted;

  const wanted = new Set<PatternKey>(period.patternKeys);
  const out = counted.filter((p) => p.key && wanted.has(p.key));
  // A period naming only patterns the user has since deleted would otherwise
  // leave a week with nothing to cover, which reads as permanently complete.
  return out.length ? out : counted;
}

/* --------------------------------------------------------------- program */

/**
 * Which slots a given exercise may legally occupy.
 *
 * The slot itself cannot be derived from the exercise — the same pattern
 * legitimately fills different slots depending on the day. What *is* derivable
 * is whether a choice is legal, which is what this checks.
 */
export function checkRow(
  slot: Slot,
  pattern: Pattern | null,
  exercise: Exercise | null,
): CheckResult {
  if (!exercise) return { ok: null, reason: null };
  if (!pattern) return { ok: false, reason: 'no-pattern' };

  // A pattern constraint is narrower than a role one and wins where present:
  // a push/pull/legs day needs a push, not merely something upper-body.
  if (slot.patternKeys?.length) {
    return pattern.key && slot.patternKeys.includes(pattern.key)
      ? { ok: true, reason: 'ok' }
      : { ok: false, reason: 'wrong-role', want: slot.requiredRole, got: pattern.role };
  }

  const want = slot.requiredRole ?? 'Any';
  if (want === 'Any' || pattern.role === want) return { ok: true, reason: 'ok' };
  return { ok: false, reason: 'wrong-role', want, got: pattern.role };
}

/**
 * Slots belonging to one session.
 *
 * A split pins slots to a day. Slots with no `sessionIndex` apply to every
 * session, which is how a full-body week works and how anything seeded before
 * splits existed continues to behave.
 */
export function slotsForSession(ix: Indexed, session: number): Slot[] {
  const pinned = ix.slots.filter((s) => s.sessionIndex === session);
  const shared = ix.slots.filter((s) => s.sessionIndex === null);
  return (pinned.length ? pinned : shared).slice().sort((a, b) => a.position - b.position);
}

/**
 * Which session to open on for a given date.
 *
 * Resuming beats advancing. If anything was logged on this date, go back to
 * that session — a locked phone or a reload mid-workout must not abandon a
 * half-finished day. Otherwise offer the first session not yet trained this
 * week.
 *
 * Lives here rather than in the page that first needed it because the home
 * screen has to name the same session the Train tab will open; two copies of
 * this rule would drift and quietly disagree about what today is.
 */
export function nextSession(ix: Indexed, date: string, days: number): number {
  const logs = allLogs(ix);

  const startedToday = logs.filter((l) => l.date === date).map((l) => l.session);
  if (startedToday.length) {
    const earliest = Math.min(...startedToday.map((l) => l.charCodeAt(0) - 65));
    return Math.min(earliest, days - 1);
  }

  const week = mondayOf(date);
  const trained = new Set(logs.filter((l) => l.weekOf === week).map((l) => l.session));
  for (let i = 0; i < days; i++) {
    if (!trained.has(sessionLabel(i))) return i;
  }
  return 0;
}

export function programRows(ix: Indexed, sessions: number): ProgramRow[] {
  const byKey = new Map(ix.entries.map((e) => [`${e.sessionIndex}:${e.slotId}`, e]));
  const rows: ProgramRow[] = [];

  for (let session = 0; session < sessions; session++) {
    for (const slot of slotsForSession(ix, session)) {
      const key = `${session}:${slot.id}`;
      const entry = byKey.get(key) ?? null;
      const exercise = entry?.exerciseId ? (ix.exerciseById.get(entry.exerciseId) ?? null) : null;
      const pattern = exercise ? (ix.patternById.get(exercise.patternId) ?? null) : null;
      rows.push({
        key,
        session,
        sessionLabel: sessionLabel(session),
        slot,
        entry,
        exercise,
        pattern,
        check: checkRow(slot, pattern, exercise),
      });
    }
  }
  return rows;
}

/** Does the configured plan touch every coverage pattern at least once? */
export function programCoverage(ix: Indexed, sessions: number): CoverageCell[] {
  const rows = programRows(ix, sessions);
  return coveragePatterns(ix).map((pattern) => ({
    pattern,
    sets: rows.filter((r) => r.pattern?.id === pattern.id).length,
  }));
}

/** Distinct exercises in the plan, in plan order. */
export function programExercises(ix: Indexed, sessions: number): Exercise[] {
  const seen = new Set<string>();
  const out: Exercise[] = [];
  for (const r of programRows(ix, sessions)) {
    if (r.exercise && !seen.has(r.exercise.id)) {
      seen.add(r.exercise.id);
      out.push(r.exercise);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ logs */

export interface DecoratedLog extends SetLog {
  exercise: Exercise | null;
  pattern: Pattern | null;
  weekOf: string;
  e1rm: number | null;
  vol: number | null;
}

export function decorate(ix: Indexed, log: SetLog): DecoratedLog {
  const exercise = ix.exerciseById.get(log.exerciseId) ?? null;
  const pattern = exercise ? (ix.patternById.get(exercise.patternId) ?? null) : null;
  return {
    ...log,
    exercise,
    pattern,
    weekOf: mondayOf(log.date),
    e1rm: est1RM(log.weight, log.reps, log.rir),
    vol: volume(log.weight, log.reps),
  };
}

export const allLogs = (ix: Indexed): DecoratedLog[] => ix.logs.map((l) => decorate(ix, l));

export function blockWeeks(blockStart: string, weeks: number): string[] {
  const start = mondayOf(blockStart);
  return Array.from({ length: weeks }, (_, i) => addDays(start, i * 7));
}

export function weekCoverage(ix: Indexed, weekOf: string): WeekCoverage {
  const logs = allLogs(ix).filter((l) => l.weekOf === weekOf);
  // Scored against the goal that was in force that week, not today's.
  const pats = coveragePatterns(ix, weekOf);
  const cells: CoverageCell[] = pats.map((pattern) => ({
    pattern,
    sets: logs.filter((l) => l.pattern?.id === pattern.id).length,
  }));
  const hit = cells.filter((c) => c.sets > 0).length;
  const sessions = new Set(logs.map((l) => `${l.date}|${l.session}`)).size;
  return {
    weekOf,
    cells,
    hit,
    total: pats.length,
    sessions,
    complete: pats.length > 0 && hit === pats.length,
    split: periodFor(ix, weekOf)?.split ?? null,
  };
}

/* -------------------------------------------------------------- progress */

export interface SeriesPoint {
  weekOf: string;
  value: number | null;
}

export interface Progress {
  series: SeriesPoint[];
  bestE1rm: number | null;
  heaviest: number | null;
  totalSets: number;
  lastDate: string | null;
  bestSet: DecoratedLog | null;
}

export function progressFor(
  ix: Indexed,
  exerciseId: string,
  blockStart: string,
  weeks: number,
): Progress {
  const all = blockWeeks(blockStart, weeks);
  const logs = allLogs(ix).filter((l) => l.exerciseId === exerciseId);

  const series: SeriesPoint[] = all.map((weekOf) => {
    const inWeek = logs.filter((l) => l.weekOf === weekOf && l.e1rm !== null);
    return {
      weekOf,
      value: inWeek.length ? Math.max(...inWeek.map((l) => l.e1rm as number)) : null,
    };
  });

  const e1rms = logs.map((l) => l.e1rm).filter((v): v is number => v !== null);
  const weights = logs.map((l) => num(l.weight)).filter((v) => v > 0);
  const bestSet = logs.reduce<DecoratedLog | null>(
    (best, l) => (!best || (l.e1rm ?? 0) > (best.e1rm ?? 0) ? l : best),
    null,
  );

  return {
    series,
    bestE1rm: e1rms.length ? Math.max(...e1rms) : null,
    heaviest: weights.length ? Math.max(...weights) : null,
    totalSets: logs.length,
    lastDate: logs.length
      ? (logs
          .map((l) => l.date)
          .sort()
          .at(-1) ?? null)
      : null,
    bestSet,
  };
}

export const trend = (ix: Indexed, exerciseId: string, blockStart: string, weeks: number): Trend =>
  trendOf(progressFor(ix, exerciseId, blockStart, weeks).series);

/** The verdict, from a series that has already been built. Separated so the
 *  summary pass can reuse it rather than rebuilding every series a second
 *  time — which is what reading `trend()` per exercise used to cost. */
export function trendOf(series: SeriesPoint[]): Trend {
  const pts = series.filter((p): p is { weekOf: string; value: number } => p.value !== null);

  if (pts.length === 0) return { dir: 'none', pct: 0, stalledWeeks: 0, points: 0 };
  if (pts.length === 1) return { dir: 'none', pct: 0, stalledWeeks: 0, points: 1 };

  const first = pts[0]!.value;
  const latest = pts.at(-1)!.value;
  const delta = latest - first;
  const pct = first ? Math.round((delta / first) * 100) : 0;
  const best = Math.max(...pts.map((p) => p.value));
  const stalledWeeks = pts.length - 1 - pts.findIndex((p) => p.value === best);

  if (delta > 0.5) return { dir: 'up', pct, stalledWeeks, points: pts.length };
  if (delta < -0.5) return { dir: 'down', pct, stalledWeeks, points: pts.length };
  return { dir: 'flat', pct, stalledWeeks, points: pts.length };
}

/* -------------------------------------------------------- strength score */

/**
 * The patterns a strength score is computed from.
 *
 * The five loaded ones, and deliberately not all seven. A carry is logged by
 * distance, so its "reps" are metres and a one-rep max estimated from them is
 * not a number about strength at all; rotation is trained light and
 * anti-rotational by design. Including either would move the score for reasons
 * that have nothing to do with getting stronger.
 */
export const SCORED_PATTERNS: PatternKey[] = ['squat', 'hinge', 'lunge', 'push', 'pull'];

/** How far back a lift still counts. Long enough that a deload or a holiday
 *  does not register; short enough that the score describes you now. */
const STRENGTH_WINDOW_WEEKS = 8;

const LB_PER_KG = 2.2046226218;

/** Everything here is computed in kilos, because the formula below is. */
export const toKg = (weight: number, unit: Unit): number =>
  unit === 'lb' ? weight / LB_PER_KG : weight;

/**
 * DOTS — the bodyweight-and-sex normalisation used across competitive
 * powerlifting, and the reason this score is not just "total divided by
 * bodyweight".
 *
 * A plain bodyweight multiple is badly unfair at the ends: strength scales with
 * roughly the two-thirds power of mass, so dividing by bodyweight flatters a
 * light lifter and punishes a heavy one for existing. DOTS is a fitted curve
 * that corrects for both bodyweight and sex, and it is published, stable and
 * checkable — which beats anything invented here.
 *
 * Coefficients are the published fourth-order polynomials, evaluated as
 * `500 / (Ax⁴ + Bx³ + Cx² + Dx + E)` with x in kilos.
 */
const DOTS = {
  male: [-0.000001093, 0.0007391293, -0.1918759221, 24.0900756, -307.75076],
  /** Official clamp: the curve is fitted within this range and misbehaves
   *  outside it, so an implausible bodyweight cannot produce an absurd score. */
  maleRange: [40, 210],
  female: [-0.0000010706, 0.0005158568, -0.1126655495, 13.6175032, -57.96288],
  femaleRange: [40, 150],
} as const;

const dotsFor = (c: readonly number[], range: readonly number[], bw: number): number => {
  const x = Math.min(Math.max(bw, range[0]!), range[1]!);
  return 500 / (c[0]! * x ** 4 + c[1]! * x ** 3 + c[2]! * x ** 2 + c[3]! * x + c[4]!);
};

/**
 * Masters age allowance.
 *
 * Strength declines with age, and a score that ignores that tells a 62-year-old
 * they are getting weaker for doing something remarkable. Competitive lifting
 * handles this with an age factor applied on top of the bodyweight coefficient
 * — the McCulloch/Foster family of tables — which multiplies the score upward
 * from about 40.
 *
 * **This is an interpolation, not the federation table.** The published tables
 * give a coefficient per single year of age; these are anchor points across the
 * same curve with straight lines between them, which tracks it closely enough
 * for a training app and is honest about being an approximation. If an exact
 * table is ever wanted, it drops straight in here and nothing else changes.
 *
 * Below 40 there is no adjustment. Junior factors exist but are far less
 * settled between federations, and inventing one would be worse than treating
 * a 25-year-old as the baseline they already are.
 */
const AGE_ANCHORS: [age: number, factor: number][] = [
  [40, 1.0],
  [50, 1.13],
  [60, 1.34],
  [70, 1.65],
  [80, 2.05],
  [90, 2.6],
];

export function ageFactor(age: number | null): number {
  if (age === null || age < 40) return 1;
  const last = AGE_ANCHORS[AGE_ANCHORS.length - 1]!;
  if (age >= last[0]) return last[1];

  for (let i = 0; i < AGE_ANCHORS.length - 1; i++) {
    const [a0, f0] = AGE_ANCHORS[i]!;
    const [a1, f1] = AGE_ANCHORS[i + 1]!;
    if (age <= a1) return f0 + ((age - a0) / (a1 - a0)) * (f1 - f0);
  }
  return 1;
}

/**
 * How old you were in a given week — not how old you are now.
 *
 * Scoring January at today's age would quietly restate the past every birthday,
 * which is the same mistake the split periods exist to prevent.
 */
export function ageInWeek(birthYear: number | null | undefined, weekOf: string): number | null {
  if (!birthYear) return null;
  const year = Number(weekOf.slice(0, 4));
  return Number.isFinite(year) ? year - birthYear : null;
}

/**
 * The multiplier a total is scaled by.
 *
 * 'unspecified' takes the midpoint of the two curves rather than defaulting to
 * one of them. Saying nothing has to stay a usable answer — the alternative is
 * an app that quietly assumes, and gets it wrong half the time.
 */
export function dotsCoefficient(bodyWeightKg: number, sex: Sex): number {
  const male = dotsFor(DOTS.male, DOTS.maleRange, bodyWeightKg);
  const female = dotsFor(DOTS.female, DOTS.femaleRange, bodyWeightKg);
  if (sex === 'male') return male;
  if (sex === 'female') return female;
  return (male + female) / 2;
}

export interface StrengthPoint {
  weekOf: string;
  /** Null where bodyweight for that week is unknown: the score is a ratio, and
   *  inventing the denominator would invent the answer. */
  score: number | null;
  bodyWeight: number | null;
  /** Best estimated one-rep max per scored pattern, in `SCORED_PATTERNS` order. */
  parts: { key: PatternKey; best: number }[];
}

/** The most recent bodyweight recorded on or before `date`. */
export function bodyWeightOn(ix: Indexed, date: string): number | null {
  let found: number | null = null;
  // `ix.bodyLogs` is sorted oldest first, so the last match is the latest one.
  for (const b of ix.bodyLogs) {
    if (b.date <= date && b.weight > 0) found = b.weight;
  }
  return found;
}

function scoreFrom(
  logs: DecoratedLog[],
  patternOfExercise: Map<string, PatternKey>,
  bodyWeight: number | null,
  weekOf: string,
  unit: Unit,
  sex: Sex,
  birthYear: number | null | undefined,
): StrengthPoint {
  const from = addDays(weekOf, -7 * STRENGTH_WINDOW_WEEKS);
  const until = addDays(weekOf, 6);

  const best = new Map<PatternKey, number>();
  for (const log of logs) {
    if (log.date < from || log.date > until) continue;
    if (log.e1rm === null || !log.exercise) continue;
    const key = patternOfExercise.get(log.exercise.patternId);
    if (!key || !SCORED_PATTERNS.includes(key)) continue;
    if (log.e1rm > (best.get(key) ?? 0)) best.set(key, log.e1rm);
  }

  const parts = SCORED_PATTERNS.map((key) => ({ key, best: best.get(key) ?? 0 }));
  // A pattern never trained contributes zero rather than being skipped, so the
  // score reflects coverage as well as load — which is the whole method.
  const total = parts.reduce((sum, p) => sum + p.best, 0);

  return {
    weekOf,
    bodyWeight,
    parts,
    score:
      bodyWeight && total
        ? Math.round(
            toKg(total, unit) *
              dotsCoefficient(toKg(bodyWeight, unit), sex) *
              ageFactor(ageInWeek(birthYear, weekOf)),
          )
        : null,
  };
}

const patternOfExercise = (ix: Indexed): Map<string, PatternKey> => {
  const byId = new Map<string, PatternKey>();
  for (const p of ix.patterns) if (p.key) byId.set(p.id, p.key);
  const out = new Map<string, PatternKey>();
  for (const e of ix.exercises) {
    const key = byId.get(e.patternId);
    if (key) out.set(e.patternId, key);
  }
  return out;
};

/**
 * How much you move, relative to you.
 *
 * The sum of your best estimated one-rep max across the five loaded patterns,
 * divided by what you weigh — "three and a half times my own bodyweight, across
 * five movements".
 *
 * Two decisions worth stating plainly. It is **not a percentile**: there is no
 * table of other people in here, because this app is about your own performance
 * and a number telling you where you rank against strangers is a different
 * product. And it looks back over a window rather than taking your best ever,
 * so it describes what you can do *now* — a squat from last spring should not
 * still be counted as strength you have today.
 */
export const strengthAt = (ix: Indexed, weekOf: string, who: StrengthOf): StrengthPoint =>
  scoreFrom(
    allLogs(ix),
    patternOfExercise(ix),
    bodyWeightOn(ix, addDays(weekOf, 6)),
    weekOf,
    who.unit,
    who.sex,
    who.birthYear,
  );

/** Unit and sex come from the profile, which the index deliberately does not
 *  carry — every other function here is a pure read over synced rows. */
export interface StrengthOf {
  unit: Unit;
  sex: Sex;
  /** Optional. Without it there is no age allowance, which is the right
   *  behaviour for somebody who has not said. */
  birthYear?: number | null;
}

/** The score week by week across a block. Decorates the logs once rather than
 *  once per week, which is the difference between instant and noticeable. */
export function strengthSeries(
  ix: Indexed,
  blockStart: string,
  weeks: number,
  who: StrengthOf,
): StrengthPoint[] {
  const logs = allLogs(ix);
  const patterns = patternOfExercise(ix);
  return blockWeeks(blockStart, weeks).map((weekOf) =>
    scoreFrom(
      logs,
      patterns,
      bodyWeightOn(ix, addDays(weekOf, 6)),
      weekOf,
      who.unit,
      who.sex,
      who.birthYear,
    ),
  );
}

/* ----------------------------------------------------- planned vs actual */

export interface PlanRow extends ProgramRow {
  done: number;
  target: number;
  logs: DecoratedLog[];
}

export function sessionPlan(
  ix: Indexed,
  sessions: number,
  date: string,
  sessionIndex: number,
): PlanRow[] {
  const rows = programRows(ix, sessions).filter((r) => r.session === sessionIndex);
  const label = sessionLabel(sessionIndex);
  const dayLogs = allLogs(ix).filter((l) => l.date === date && l.session === label);

  return rows.map((r) => {
    const logs = dayLogs.filter((l) => l.exerciseId === r.exercise?.id);
    return { ...r, done: logs.length, target: num(r.entry?.sets), logs };
  });
}

export interface DecoratedRef extends RefSet {
  exercise: Exercise | null;
  pattern: Pattern | null;
  e1rm: number | null;
}

export function refSetRows(ix: Indexed): DecoratedRef[] {
  return ix.refSets
    .map((r) => {
      const exercise = ix.exerciseById.get(r.exerciseId) ?? null;
      return {
        ...r,
        exercise,
        pattern: exercise ? (ix.patternById.get(exercise.patternId) ?? null) : null,
        e1rm: est1RM(r.weight, r.reps, 0),
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}
