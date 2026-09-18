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
  Goal,
  SetLog,
  Slot,
  Snapshot,
  SplitPeriod,
  Sex,
  Trend,
  Unit,
  WeekCoverage,
} from './types';
import { CATALOGUE, type CatalogueExercise } from './catalogue';
import { EXERCISE_DETAILS } from './details';

/* --------------------------------------------------------------- helpers */

export const live = <T extends { deletedAt: string | null }>(rows: T[]): T[] =>
  rows.filter((r) => r.deletedAt === null);

export const sessionLabel = (i: number): string => String.fromCharCode(65 + i);

/**
 * The session label a one-off set is logged under: training that is not a day
 * of the plan.
 *
 * **An ordinary `set_logs` row, not a new table or column.** A new synced table
 * opens a window where a device on the previous build silently misses rows, and
 * a new column is the documented trap where adding a field does not move the
 * change sequence. A reserved label needs neither, and everything that reads
 * logs without caring about the session — coverage, the strength numbers,
 * goals, the charts, "last time" — picks these sets up with no change at all,
 * which is the decision ("training is training") working as intended.
 *
 * What does care is anything that turns a label back into a day number, and
 * both of those go through `planDayOf`, which says no to this one. It also
 * counts as a session in the week's session count. That was a deliberate choice
 * and the inflation it causes was accepted: extra sets on each of three planned
 * days read as six sessions.
 *
 * `X` because it can never be a plan day — plans top out at six days, `A`–`F` —
 * and because it is one character, well inside the four the wire allows. Never
 * change it: every set ever logged off-plan carries it.
 */
export const OFF_PLAN_SESSION = 'X';

/**
 * Which day of the plan a stored label names, or null if it names none.
 *
 * The only sanctioned way back from a label to a number. There used to be two
 * hand-rolled copies of `charCodeAt(0) - 65`, and a label outside `A`–`Z` would
 * have produced a negative day — Train selecting no tab at all, Home offering
 * "Day *".
 */
export function planDayOf(label: string): number | null {
  if (label.length !== 1 || label === OFF_PLAN_SESSION) return null;
  const day = label.charCodeAt(0) - 65;
  return day >= 0 && day < 26 ? day : null;
}

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
 * The most **reps to failure** an estimate will be made from.
 *
 * Epley is linear in reps and never stops being linear, so inverted it claims a
 * 21-rep set was 58% of a maximum and a 30-rep set exactly half of one. Real
 * rep-max curves flatten, so the error is not noise — it runs one way, upward,
 * and it grows with the rep count. A 30-rep deadlift at 100 kg reads as a 200 kg
 * single; nothing in the app would question it, and the strength score would
 * carry it for eight weeks and then report its departure as a decline.
 *
 * **Ten, and counted against reps *plus* reps in reserve.** Both halves of that
 * are corrections to the first version of this ceiling, which was twelve and
 * counted reps alone:
 *
 *  - Twelve came from `REP_RANGE.big`, this app's own prescribed range. That is
 *    not a published bound and the literature's is lower — Brzycki's own 1993
 *    article says under ten, Reynolds et al. 2006 say "no more than 10", and
 *    Mayhew et al. 1995 found all six common equations significantly biased
 *    above ten. Nobody publishes a ceiling at twelve.
 *  - Counting reps alone was simply inconsistent with the estimator beneath it.
 *    `est1RM` feeds Epley `reps + rir`, so a twelve-rep set with four in
 *    reserve was handed in as a sixteen-rep effort by a guard that had just
 *    checked it was under twelve. The ceiling has to bound the quantity that is
 *    actually used.
 *
 * The cost is deliberate and large: at the effort control's default of two in
 * reserve, only sets of eight or fewer produce an estimate, and on the demo
 * account this takes the estimable share of logged sets from 77% to 39%. That
 * is the honest reading of a method validated on sets taken to failure at ten
 * reps or fewer. Everything else still counts as training, still fills the
 * week, and is charted by the weight on the bar instead.
 *
 * Note also what no source supports at all: treating `reps + rir` as equivalent
 * to reps to failure. Every validation study took subjects to momentary
 * failure, and the substitution is itself off by about one rep (Halperin et al.
 * 2022). This ceiling bounds that substitution; it does not vindicate it.
 */
export const MAX_EST_REPS_TO_FAILURE = 10;

/**
 * Epley, adjusted for reps in reserve.
 *
 * Without the RIR term a set taken to failure and a set left with three in the
 * tank look identical, which makes the whole progress view lie. This is the one
 * number that lets sessions of different intensity be compared.
 *
 * Null above `MAX_EST_REPS_TO_FAILURE`, exactly as it is null for a set with no
 * weight: not an error, and not a zero — the app simply has no maximum to
 * estimate from that set, and says so by having nothing to say.
 *
 * The ceiling is checked against the same `reps + rir` Epley is handed, not
 * against `reps` alone. Guarding one quantity and estimating from another is how
 * a twelve-rep set with four in reserve used to pass a check for twelve and then
 * be estimated from as a sixteen.
 */
export function est1RM(
  weight: number | null,
  reps: number | null,
  rir: number | null,
): number | null {
  const w = num(weight);
  const r = num(reps);
  if (!w || !r) return null;
  if (r + num(rir) > MAX_EST_REPS_TO_FAILURE) return null;
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
  /** Lifts the user has asked to be held to, live ones and expired alike;
   *  `liveGoals()` narrows to the ones still running. */
  goals: Goal[];
  patternById: Map<string, Pattern>;
  exerciseById: Map<string, Exercise>;
  slotById: Map<string, Slot>;
  /**
   * The id an exercise is known by now, given any id it has ever had.
   *
   * Every row `index()` returns is already canonical. This is for ids that
   * arrive from outside it — a goal read straight from the store, an id carried
   * in from another screen — so that an account's pre-catalogue id and the
   * catalogue id it maps to find the same history. Identity for anything it does
   * not recognise.
   */
  exerciseIdOf: (id: string) => string;
}

/** How a stored name is matched to a catalogue name: case and edge spaces
 *  ignored, which is the same rule plans use to match names across accounts. */
const nameKey = (name: string): string => name.trim().toLowerCase();

/** One fixed stamp for rows that come from code rather than from sync. */
const CATALOGUE_STAMP = '1970-01-01T00:00:00.000Z';

/**
 * Everything a screen reads, from one snapshot of the store.
 *
 * `catalogue` is a parameter only so a test can hand in a variant — the library
 * with one movement tagged off-plan, say. Every real caller takes the default.
 */
export function index(
  snap: Snapshot,
  catalogue: readonly CatalogueExercise[] = CATALOGUE,
): Indexed {
  const patterns = live(snap.patterns).sort((a, b) => a.position - b.position);
  const patternIdByKey = new Map(patterns.flatMap((p) => (p.key ? [[p.key, p.id] as const] : [])));

  /* The library is the catalogue, in this account's own pattern ids — so the
     `Exercise` shape, and every one of the places that reads `patternId`, is
     unchanged. A catalogue entry whose pattern this account does not have is
     left out rather than attached to nothing. */
  const fromCatalogue: Exercise[] = catalogue.flatMap((c) => {
    const patternId = patternIdByKey.get(c.pattern);
    if (!patternId) return [];
    const details = EXERCISE_DETAILS[c.name];
    return [
      {
        id: c.id,
        updatedAt: CATALOGUE_STAMP,
        deletedAt: null,
        name: c.name,
        patternId,
        where: c.where,
        tags: [...c.tags],
        description: details?.description ?? '',
        images: details?.images ?? [],
      },
    ];
  });

  /* The account's own rows, from before the catalogue, become aliases: each one
     the catalogue knows by name maps its old id to the catalogue's. Built from
     every row, soft-deleted ones included — a deleted row's sets still exist
     and still have to resolve. Nothing is written: this is read-side only, and
     every write path takes its rows from the store, never from here. */
  const catalogueIdByName = new Map(catalogue.map((c) => [nameKey(c.name), c.id]));
  const alias = new Map<string, string>();
  for (const row of snap.exercises) {
    const id = catalogueIdByName.get(nameKey(row.name));
    if (id && id !== row.id) alias.set(row.id, id);
  }
  const canon = <T extends { exerciseId: string | null }>(row: T): T =>
    row.exerciseId !== null && alias.has(row.exerciseId)
      ? { ...row, exerciseId: alias.get(row.exerciseId)! }
      : row;

  /* A row the catalogue does not know stays an exercise in its own right, so its
     history can never be orphaned. None exist today — nothing in the app has
     ever created one — but a guess about "none" is not something to build a
     silent data loss on.

     Fields added after a device last synced are simply absent from the rows
     already in its IndexedDB — the server only re-sends rows whose seq moved,
     and adding a column does not move it — so they are defaulted here, at the
     single point every consumer reads through. */
  const own = live(snap.exercises)
    .filter((e) => !catalogueIdByName.has(nameKey(e.name)))
    .map((e) => ({ ...e, description: e.description ?? '', images: e.images ?? [] }));

  /* Retired entries resolve — their history keeps its name and its chart — but
     are never offered: not to the generator, the swap sheet or the picker, all
     of which read `exercises`. */
  const retired = new Set(catalogue.filter((c) => c.retired).map((c) => c.id));
  const resolvable = [...fromCatalogue, ...own];
  const exercises = resolvable.filter((e) => !retired.has(e.id));

  const slots = live(snap.slots).sort((a, b) => a.position - b.position);
  return {
    patterns,
    exercises,
    slots,
    splitPeriods: live(snap.splitPeriods ?? []).sort((a, b) =>
      a.startWeek < b.startWeek ? -1 : a.startWeek > b.startWeek ? 1 : 0,
    ),
    entries: live(snap.entries).map(canon),
    goals: live(snap.goals ?? []).map(canon),
    /**
     * Chronological, and that is load-bearing rather than tidy.
     *
     * These arrive in IndexedDB primary-key order — which is to say in order of
     * random UUID, which is no order at all. Anything reading "the last N" or
     * "the latest" off this array was reading an arbitrary sample: the bug that
     * exposed it has since been removed with the progression advice, but the
     * invariant outlived it and `ordering.test.ts` now asserts it directly.
     */
    logs: live(snap.logs)
      .map(canon)
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) || a.session.localeCompare(b.session) || a.setNo - b.setNo,
      ),
    bodyLogs: live(snap.bodyLogs ?? []).sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
    ),
    patternById: new Map(patterns.map((p) => [p.id, p])),
    // Everything that can resolve, retired entries included: a lift you stopped
    // being offered is still a lift you have history for.
    exerciseById: new Map(resolvable.map((e) => [e.id, e])),
    exerciseIdOf: (id: string) => alias.get(id) ?? id,
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

  /* Only sets logged against a day of the plan say which day you were on. An
     off-plan set is training, but it is not Day anything — and read back as a
     letter it would have been day 23, clamped to the last day, so one extra set
     logged first thing would have opened the wrong session all morning. */
  const startedToday = logs
    .filter((l) => l.date === date)
    .map((l) => planDayOf(l.session))
    .filter((d): d is number => d !== null);
  if (startedToday.length) {
    return Math.min(Math.min(...startedToday), days - 1);
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

/** One exercise trained outside the plan on a given date, with its sets. */
export interface OneOff {
  exercise: Exercise;
  done: number;
  logs: DecoratedLog[];
}

/**
 * What was trained on `date` outside the plan: every exercise with sets logged
 * under `OFF_PLAN_SESSION`, in the order they were first logged.
 *
 * Read from the logs alone, never from the program. That is deliberate and it is
 * the thing an earlier design got wrong: deriving "unplanned" from "not in any
 * program entry" would reclassify history the moment somebody rebuilt their
 * week — last month's extra deadlifts would turn into planned ones. Here a set is
 * off-plan because of how it was logged, and that never changes afterwards.
 *
 * Grouped by exercise across the whole date rather than by day tab, because an
 * off-plan set has no day tab. Which tab happens to be open when you look is
 * irrelevant to it.
 */
export function oneOffs(ix: Indexed, date: string): OneOff[] {
  const byExercise = new Map<string, OneOff>();
  // Oldest write first, so the exercises appear in the order they were started;
  // a Map keeps first-insertion order.
  const logs = allLogs(ix)
    .filter((l) => l.date === date && l.session === OFF_PLAN_SESSION && l.exercise)
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  for (const log of logs) {
    const exercise = log.exercise!;
    const entry = byExercise.get(exercise.id) ?? { exercise, done: 0, logs: [] };
    entry.logs.push(log);
    entry.done += 1;
    byExercise.set(exercise.id, entry);
  }
  // Within one exercise, by set number — which is what the card lists them by.
  for (const entry of byExercise.values()) entry.logs.sort((a, b) => a.setNo - b.setNo);
  return [...byExercise.values()];
}

/**
 * Which of the week's sessions are finished, so the day tabs can tick them off.
 *
 * Week-wide rather than date-scoped, which is the difference between this and
 * `sessionPlan`. "Has Day B been done?" is a question about the week — you
 * trained it on Tuesday and you are looking at the app on Thursday — so
 * counting only the selected date would show every day as unfinished the moment
 * you paged the date forward.
 *
 * A day with nothing planned is **not** finished. Nothing to do is not the same
 * as done, and `done >= target` is trivially true when the target is zero, so
 * an empty day would otherwise arrive pre-ticked.
 */
export function sessionsDone(ix: Indexed, sessions: number, weekOf: string): boolean[] {
  const rows = programRows(ix, sessions);
  const weekLogs = allLogs(ix).filter((l) => l.weekOf === weekOf);

  return Array.from({ length: sessions }, (_, session) => {
    const label = sessionLabel(session);
    const planned = rows.filter(
      (r) => r.session === session && r.exercise && num(r.entry?.sets) > 0,
    );
    if (!planned.length) return false;

    const logs = weekLogs.filter((l) => l.session === label);
    return planned.every(
      (r) => logs.filter((l) => l.exerciseId === r.exercise!.id).length >= num(r.entry?.sets),
    );
  });
}
