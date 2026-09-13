/**
 * What the Progress tab *says*, as opposed to what it draws.
 *
 * The old page drew one chart per exercise and left the reading to you: fifteen
 * near-identical lines, and the one that had gone backwards looked exactly like
 * the fourteen that had not. Everything here exists to turn that pile into a
 * few sentences — what regressed, what has stopped moving, what you have not
 * touched in a month — so the charts become the evidence rather than the
 * message.
 *
 * Two decisions run through all of it.
 *
 * **Not every movement has a one-rep max.** A carry is logged by distance, so
 * its "reps" are metres and an estimated 1RM from them is not a number about
 * strength at all. Rotation is trained light and anti-rotational by design.
 * Isolation work lives at ten to fifteen reps, where Epley is outside the range
 * it was fitted for. `metricFor` is what stops the page captioning four of its
 * charts "Best estimated 1RM" for movements where that phrase is meaningless.
 *
 * **A verdict is only offered when the comparison is fair.** `est1RM` scores an
 * unrated set as though it were taken to failure, which makes it read about 5%
 * *lower* than the same set with two reps in reserve recorded. So somebody who
 * simply stops rating their sets looks like they are regressing. Every verdict
 * here carries `confident`, and the page drops the verdict rather than softening
 * it when the two ends of a comparison disagree about whether effort was
 * recorded. Saying nothing is the honest answer; a hedge is still an accusation.
 */

import {
  addDays,
  decorate,
  mondayOf,
  num,
  programExercises,
  type DecoratedLog,
  type Indexed,
} from './model';
import type { Exercise, Pattern, PatternKey } from './types';

/* ------------------------------------------------------------- the metric */

/** What a given movement's progress is even measured in. */
export type ProgressMetric = 'e1rm' | 'weight' | null;

/** Patterns where an estimated one-rep max is a meaningful number. */
const LOADED: PatternKey[] = ['squat', 'hinge', 'lunge', 'push', 'pull'];

export function metricFor(pattern: Pattern | null | undefined): ProgressMetric {
  if (!pattern?.key) return null;
  if (LOADED.includes(pattern.key)) return 'e1rm';
  // Isolation progresses, but at 10-15 reps Epley is extrapolating well past
  // where it fits — the heaviest set is the honest number.
  if (pattern.key === 'isolation') return 'weight';
  // Carry and rotate: reps are metres or seconds. There is nothing to plot.
  return null;
}

/* ------------------------------------------------------------ the series */

export interface SessionPoint {
  /** One point per training *day*, which is what makes the line continuous
   *  without inventing anything: there are no empty buckets to break it. */
  date: string;
  value: number;
  sets: number;
  /** A new running best as at this date. */
  peak: boolean;
  /** Every set behind this value recorded reps in reserve. */
  rated: boolean;
}

function sessionsOf(logs: DecoratedLog[], metric: ProgressMetric): SessionPoint[] {
  if (!metric) return [];

  const byDate = new Map<string, DecoratedLog[]>();
  for (const l of logs) {
    const list = byDate.get(l.date);
    if (list) list.push(l);
    else byDate.set(l.date, [l]);
  }

  let best = -Infinity;
  const out: SessionPoint[] = [];

  for (const date of [...byDate.keys()].sort()) {
    const day = byDate.get(date)!;
    const values = day
      .map((l) => (metric === 'e1rm' ? l.e1rm : num(l.weight) || null))
      .filter((v): v is number => v !== null && v > 0);
    if (!values.length) continue;

    const value = Math.max(...values);
    // Rated-ness follows the sets that produced the number, not the whole day:
    // a rated top set next to an unrated back-off set is still a fair reading.
    const behind = day.filter(
      (l) => (metric === 'e1rm' ? l.e1rm : num(l.weight) || null) === value,
    );
    const peak = value > best;
    if (peak) best = value;

    out.push({
      date,
      value,
      sets: day.length,
      peak,
      rated: behind.every((l) => l.rir !== null),
    });
  }
  return out;
}

/* ----------------------------------------------------------- the verdicts */

export interface Drawdown {
  best: number;
  bestDate: string;
  latest: number;
  latestDate: string;
  /** Negative when the latest session is below the best. */
  delta: number;
  pct: number;
  /**
   * Both ends agree about whether effort was recorded.
   *
   * False means the comparison is between a rated and an unrated number, which
   * differ by about 5% for reasons that have nothing to do with strength.
   */
  confident: boolean;
}

export function drawdownOf(sessions: SessionPoint[]): Drawdown | null {
  if (sessions.length < 2) return null;
  const best = sessions.reduce((a, b) => (b.value > a.value ? b : a));
  const latest = sessions[sessions.length - 1]!;
  if (best === latest) return null;

  return {
    best: best.value,
    bestDate: best.date,
    latest: latest.value,
    latestDate: latest.date,
    delta: Math.round((latest.value - best.value) * 10) / 10,
    pct: Math.round(((latest.value - best.value) / best.value) * 100),
    confident: best.rated === latest.rated,
  };
}

const DAY_MS = 86_400_000;
const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);

/* ------------------------------------------------------------ the summary */

export interface ExerciseProgress {
  exercise: Exercise;
  pattern: Pattern | null;
  metric: ProgressMetric;
  sessions: SessionPoint[];
  /** The heaviest set in the window, for the row's subtitle. */
  topSet: DecoratedLog | null;
  totalSets: number;
  lastDate: string | null;
  daysSince: number | null;
  drawdown: Drawdown | null;
  /** Sessions logged since the best one — a stall of one session is noise. */
  sessionsSinceBest: number;
  /** Still part of the current plan, as opposed to logged and since dropped. */
  inPlan: boolean;
}

/**
 * Everything the page needs, from one pass over the logs.
 *
 * The previous version called `progressFor` and then `trend` per exercise, and
 * each of those decorated the entire log table again — thirty full passes for
 * fifteen exercises, tens of thousands of objects on an account with a few
 * months behind it. This decorates once and buckets by exercise.
 */
export function progressSummary(
  ix: Indexed,
  opts: { from: string; to: string; sessions: number },
): ExerciseProgress[] {
  const byExercise = new Map<string, DecoratedLog[]>();
  for (const log of ix.logs) {
    if (log.date < opts.from || log.date > opts.to) continue;
    const list = byExercise.get(log.exerciseId);
    if (list) list.push(decorate(ix, log));
    else byExercise.set(log.exerciseId, [decorate(ix, log)]);
  }

  // Plan order first, then anything logged that has since left the plan —
  // history does not disappear because the week was rebuilt.
  const planned = programExercises(ix, opts.sessions).filter((e) => byExercise.has(e.id));
  const inPlan = new Set(planned.map((e) => e.id));
  const ordered = [
    ...planned,
    ...ix.exercises.filter((e) => byExercise.has(e.id) && !inPlan.has(e.id)),
  ];

  return ordered.map((exercise) => {
    const logs = byExercise.get(exercise.id) ?? [];
    const pattern = ix.patternById.get(exercise.patternId) ?? null;
    const metric = metricFor(pattern);
    const sessions = sessionsOf(logs, metric);

    const topSet = logs.reduce<DecoratedLog | null>(
      (best, l) => (!best || num(l.weight) > num(best.weight) ? l : best),
      null,
    );
    const lastDate = sessions.length
      ? sessions[sessions.length - 1]!.date
      : (logs
          .map((l) => l.date)
          .sort()
          .at(-1) ?? null);

    const bestIndex = sessions.length
      ? sessions.reduce((bi, s, i) => (s.value > sessions[bi]!.value ? i : bi), 0)
      : -1;

    return {
      exercise,
      pattern,
      metric,
      sessions,
      topSet,
      totalSets: logs.length,
      lastDate,
      daysSince: lastDate ? daysBetween(lastDate, opts.to) : null,
      drawdown: drawdownOf(sessions),
      sessionsSinceBest: bestIndex < 0 ? 0 : sessions.length - 1 - bestIndex,
      inPlan: inPlan.has(exercise.id),
    };
  });
}

/* ----------------------------------------------------------- the triage */

export type AttentionKind = 'regressed' | 'stalled' | 'dormant';

export interface Attention {
  kind: AttentionKind;
  progress: ExerciseProgress;
  /** Whole weeks since the best session, for 'regressed' and 'stalled'. */
  weeksSinceBest: number;
}

/** Below this a drop is week-to-week noise rather than a direction. */
const REGRESSION_PCT = -5;
/** A stall needs both time and attempts: four weeks away is a holiday, and
 *  four weeks of trying without moving is a plateau. */
const STALL_WEEKS = 4;
const STALL_SESSIONS = 3;
/** Three weeks without touching something that is still in your plan. */
const DORMANT_DAYS = 21;

/**
 * The handful of lifts worth looking at, worst first.
 *
 * Deliberately short. A list of fifteen things needing attention is a list
 * nobody acts on, and the empty state — "nothing needs a look" — is the most
 * useful thing this page can say on most days.
 */
export function attention(summary: ExerciseProgress[], asOf: string, limit = 3): Attention[] {
  const out: Attention[] = [];

  for (const progress of summary) {
    if (!progress.metric) continue; // carries and rotation have no verdict to give
    const { drawdown, sessionsSinceBest, daysSince, inPlan } = progress;

    const weeksSinceBest = drawdown
      ? Math.max(0, Math.round(daysBetween(mondayOf(drawdown.bestDate), mondayOf(asOf)) / 7))
      : 0;

    // A drop we cannot attribute to training is not reported at all. See the
    // note at the top of this file: hedging it would still be an accusation.
    if (drawdown && drawdown.confident && drawdown.pct <= REGRESSION_PCT) {
      out.push({ kind: 'regressed', progress, weeksSinceBest });
      continue;
    }
    if (
      drawdown?.confident &&
      weeksSinceBest >= STALL_WEEKS &&
      sessionsSinceBest >= STALL_SESSIONS
    ) {
      out.push({ kind: 'stalled', progress, weeksSinceBest });
      continue;
    }
    if (inPlan && daysSince !== null && daysSince >= DORMANT_DAYS) {
      out.push({ kind: 'dormant', progress, weeksSinceBest });
    }
  }

  const order: AttentionKind[] = ['regressed', 'stalled', 'dormant'];
  return out
    .sort(
      (a, b) =>
        order.indexOf(a.kind) - order.indexOf(b.kind) ||
        (a.progress.drawdown?.pct ?? 0) - (b.progress.drawdown?.pct ?? 0),
    )
    .slice(0, limit);
}

/* ------------------------------------------------------- pattern presence */

export interface PatternWeek {
  weekOf: string;
  /** Sets logged in this pattern that week. */
  sets: number;
  /** Whether the split in force that week even asked for this pattern. */
  wanted: boolean;
}

/**
 * The app's thesis on a time axis: seven rows, one per movement, week by week.
 *
 * Weeks the split did not ask for a pattern are marked rather than blamed —
 * that is the same historisation rule the coverage view obeys, and without it
 * somebody on push/pull/legs would see two permanently empty rows.
 */
export function patternWeeks(
  ix: Indexed,
  weeks: string[],
  wantedFor: (weekOf: string) => PatternKey[],
): { pattern: Pattern; weeks: PatternWeek[] }[] {
  const counted = ix.patterns.filter((p) => p.counts);
  const seen = new Map<string, number>();

  for (const log of ix.logs) {
    const exercise = ix.exerciseById.get(log.exerciseId);
    const key = exercise ? ix.patternById.get(exercise.patternId)?.key : null;
    if (!key) continue;
    const bucket = `${mondayOf(log.date)}|${key}`;
    seen.set(bucket, (seen.get(bucket) ?? 0) + 1);
  }

  return counted.map((pattern) => ({
    pattern,
    weeks: weeks.map((weekOf) => ({
      weekOf,
      sets: seen.get(`${weekOf}|${pattern.key}`) ?? 0,
      wanted: !!pattern.key && wantedFor(weekOf).includes(pattern.key),
    })),
  }));
}

/** The last `n` weeks, oldest first, ending with the week containing `asOf`. */
export const recentWeeks = (asOf: string, n: number): string[] =>
  Array.from({ length: n }, (_, i) => mondayOf(addDays(mondayOf(asOf), -7 * (n - 1 - i))));
