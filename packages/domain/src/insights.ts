/**
 * What the Progress tab *says*, as opposed to what it draws.
 *
 * The old page drew one chart per exercise and left the reading to you: fifteen
 * near-identical lines, and the one that had gone backwards looked exactly like
 * the fourteen that had not. Everything here exists to turn that pile into a
 * few sentences, so the charts become the evidence rather than the message.
 *
 * Three decisions run through all of it.
 *
 * **The app does not volunteer an opinion about whether you are growing.** It
 * used to: every account got told what had stalled and what had slipped. That
 * is a judgement nobody asked for, and aimed at somebody maintaining on
 * purpose, returning from an injury, or training because it makes their week
 * better, it costs motivation rather than buying any. So the two progression
 * verdicts are gated on a live goal for that lift — see `attention` and
 * `goals.ts`. Without one this file still computes the drawdown and the
 * sessions-since-best, because the *chart* is honest description; it simply
 * does not hand them to anybody as a verdict.
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
  daysBetween,
  decorate,
  mondayOf,
  num,
  planDayOf,
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
  /** The best of the last few sessions — what you are lifting *now*. */
  form: number;
  formDate: string;
  /** Negative when recent form sits below the best. */
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

/**
 * How many sessions count as "lately".
 *
 * The first version of this compared the single most recent session against the
 * all-time best, so one heavy-legs Tuesday read as a regression — and a page
 * that tells you that is a page you stop believing. Three sessions is enough
 * that a bad day is outvoted, and short enough that a real slide still shows.
 */
const FORM_SESSIONS = 3;

/**
 * How far below your best you are training now, or null if you are at it.
 *
 * "At it" includes *near* it: when the best session is itself one of the last
 * few, there is nothing to report, because the thing you would be compared
 * against is your own current form.
 */
export function drawdownOf(sessions: SessionPoint[]): Drawdown | null {
  if (sessions.length < 2) return null;

  const bestIndex = sessions.reduce((bi, s, i) => (s.value > sessions[bi]!.value ? i : bi), 0);
  if (bestIndex >= sessions.length - FORM_SESSIONS) return null;

  const best = sessions[bestIndex]!;
  const form = sessions.slice(-FORM_SESSIONS).reduce((x, y) => (y.value > x.value ? y : x));

  return {
    best: best.value,
    bestDate: best.date,
    form: form.value,
    formDate: form.date,
    delta: Math.round((form.value - best.value) * 10) / 10,
    pct: Math.round(((form.value - best.value) / best.value) * 100),
    confident: best.rated === form.rated,
  };
}

const DAY_MS = 86_400_000;

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
    // Every exercise that can resolve, not just the ones still offered: a
    // retired movement is no longer in the library, and its history still is.
    ...[...ix.exerciseById.values()].filter((e) => byExercise.has(e.id) && !inPlan.has(e.id)),
  ];

  return ordered.map((exercise) => {
    const logs = byExercise.get(exercise.id) ?? [];
    const pattern = ix.patternById.get(exercise.patternId) ?? null;

    /* A loaded pattern is charted by estimated 1RM — unless nothing it has
       logged can produce one. That happens now that `est1RM` refuses to
       estimate above `MAX_EST_REPS_TO_FAILURE`: a movement only ever trained
       for high reps would otherwise get the right axis label over an empty
       chart.
       Falling back to the weight on the bar is the same demotion isolation
       already gets, and for the same reason.

       Only when there is *nothing* to plot. A lift with both heavy days and
       high-rep days keeps its estimate and simply does not plot the high-rep
       ones, which is the honest reading of both. */
    const wanted = metricFor(pattern);
    const preferred = sessionsOf(logs, wanted);
    const demoted = wanted === 'e1rm' && preferred.length === 0;
    const metric = demoted ? 'weight' : wanted;
    const sessions = demoted ? sessionsOf(logs, 'weight') : preferred;

    const topSet = logs.reduce<DecoratedLog | null>(
      (best, l) => (!best || num(l.weight) > num(best.weight) ? l : best),
      null,
    );
    /* The last day this was *trained*, never the last day it could be plotted.
       Those used to be the same date and are not any more: a set above
       the ceiling is real training that produces no point on the chart. Read
       off the chart instead, this freezes on the last heavy day and the lift
       drifts into "not trained in three weeks" while somebody is in the gym
       doing it — and dormancy is the one verdict that needs no goal, so the
       app would say it unprompted. */
    const lastDate =
      logs
        .map((l) => l.date)
        .sort()
        .at(-1) ?? null;

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
/**
 * A stall needs both time and attempts.
 *
 * Both numbers started far lower and the result was useless: nine lifts out of
 * eleven came back "stalled" on an account that was training perfectly well.
 * A month without a personal best is not a plateau — it is a month. Worse, any
 * lift loaded off a 5 kg stack *cannot* move more often than that, so a short
 * threshold flags the machines every time and says nothing about the lifter.
 * Two months and six attempts is the point at which the lift, rather than the
 * calendar, is the thing that has stopped.
 */
const STALL_WEEKS = 8;
const STALL_SESSIONS = 6;
/** Three weeks without touching something that is still in your plan. */
const DORMANT_DAYS = 21;

/** Worst first, by whatever "worst" means for that kind. */
const severity: Record<AttentionKind, (a: Attention, b: Attention) => number> = {
  regressed: (a, b) => (a.progress.drawdown?.pct ?? 0) - (b.progress.drawdown?.pct ?? 0),
  stalled: (a, b) => b.weeksSinceBest - a.weeksSinceBest,
  dormant: (a, b) => (b.progress.daysSince ?? 0) - (a.progress.daysSince ?? 0),
};

/**
 * The handful of lifts worth looking at.
 *
 * Deliberately short, and deliberately *mixed*: taken a kind at a time rather
 * than strictly worst-first, because three stalls in a row would hide the lift
 * you have not touched since July, and those are different problems with
 * different answers. A list of fifteen things needing attention is a list
 * nobody acts on, and the empty state — "nothing needs a look" — is the most
 * useful thing this page can say on most days.
 */
export function attention(
  summary: ExerciseProgress[],
  asOf: string,
  opts: {
    limit?: number;
    /**
     * The lifts the user has asked to be held to — one live goal each.
     *
     * **Progression verdicts are gated on this, and that is the point of it.**
     * "Down 13% on your best" and "no higher than June, nine sessions since"
     * are both true and neither was asked for. Told to somebody who is
     * maintaining on purpose, coming back from an injury, or training because
     * it makes their week better, they are an accusation the app invented — and
     * the cost is not a wrong number, it is a person training less.
     *
     * So the default is empty, and the default is silence. Set a goal on a lift
     * and the app will tell you when it stops moving; do not and it will show
     * you the line and say nothing about whether it was enough.
     */
    growing?: ReadonlySet<string>;
  } = {},
): Attention[] {
  const limit = opts.limit ?? 3;
  const growing = opts.growing ?? new Set<string>();
  const found: Record<AttentionKind, Attention[]> = { regressed: [], stalled: [], dormant: [] };

  for (const progress of summary) {
    if (!progress.metric) continue; // carries and rotation have no verdict to give
    const { drawdown, sessionsSinceBest, daysSince, inPlan } = progress;
    /* Dormancy survives without a goal; the two progression verdicts do not.
       "This is in your week and you have not done it in three weeks" is an
       observation about the plan the user themselves chose — it makes no claim
       about whether they should be getting stronger, and it is the one thing
       here somebody would want to know regardless. */
    const mayJudge = growing.has(progress.exercise.id);

    const weeksSinceBest = drawdown
      ? Math.max(0, Math.round(daysBetween(mondayOf(drawdown.bestDate), mondayOf(asOf)) / 7))
      : 0;

    // A drop we cannot attribute to training is not reported at all. See the
    // note at the top of this file: hedging it would still be an accusation.
    if (mayJudge && drawdown && drawdown.confident && drawdown.pct <= REGRESSION_PCT) {
      found.regressed.push({ kind: 'regressed', progress, weeksSinceBest });
      continue;
    }
    /* Dormancy is checked before the stall, and the order is load-bearing. A
       stall says "you keep turning up and it will not move", and that claim
       requires you to have turned up — so a lift nobody has touched in three
       weeks cannot be stuck, whatever its last few sessions looked like. Run
       the other way round and a lift abandoned during a flat patch is reported
       as "no higher than July, 0 sessions since", which is both nonsense and
       hides the only thing worth saying about it: it is still in your week and
       you are not doing it. */
    if (inPlan && daysSince !== null && daysSince >= DORMANT_DAYS) {
      found.dormant.push({ kind: 'dormant', progress, weeksSinceBest });
      continue;
    }
    if (
      mayJudge &&
      drawdown?.confident &&
      weeksSinceBest >= STALL_WEEKS &&
      sessionsSinceBest >= STALL_SESSIONS
    ) {
      found.stalled.push({ kind: 'stalled', progress, weeksSinceBest });
    }
  }

  const order: AttentionKind[] = ['regressed', 'stalled', 'dormant'];
  for (const kind of order) found[kind].sort(severity[kind]);

  const out: Attention[] = [];
  for (let round = 0; out.length < limit; round++) {
    const before = out.length;
    for (const kind of order) {
      const next = found[kind][round];
      if (next) out.push(next);
      if (out.length >= limit) break;
    }
    if (out.length === before) break;
  }
  return out;
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

/* --------------------------------------------------------------- the days */

/** How many sets were logged on each date in a range. The calendar's fill. */
export function setsPerDay(ix: Indexed, from: string, to: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const log of ix.logs) {
    if (log.date < from || log.date > to) continue;
    out.set(log.date, (out.get(log.date) ?? 0) + 1);
  }
  return out;
}

export interface TrainedDay {
  date: string;
  /** Which day of the week's plan this was — 'A', 'B', 'C'. Null if the sets
   *  disagree, which happens when two sessions were logged on one date, and
   *  null for a day of training outside the plan, which is no day of it. */
  session: string | null;
  sets: number;
  /** In the order they were started. See the note on ordering below. */
  exercises: { exercise: Exercise; pattern: Pattern | null; logs: DecoratedLog[] }[];
}

/**
 * What was actually trained on one date.
 *
 * Built from the logs rather than from the plan, and that is the whole point:
 * the plan says what you were *meant* to do, and it is rebuilt whenever you
 * change split. A day in September must still show what happened in September,
 * including an exercise that has since left your week entirely.
 *
 * **Ordering needs saying.** The index sorts logs by date, then session, then
 * set number — so every first set comes before every second set, and the order
 * exercises appear in is whatever the underlying store happened to give back.
 * Taking first-appearance from that reads as a shuffle. `updatedAt` is the
 * moment a set was logged, which for a real account *is* the order it was
 * performed in, so that is what decides it. Where those tie — a seeded history
 * that stamps a whole day at once — the plan's own order is the tiebreak: it is
 * display order only, and the alternative is arbitrary.
 */
export function dayDetail(ix: Indexed, date: string): TrainedDay | null {
  const logs = ix.logs.filter((l) => l.date === date);
  if (!logs.length) return null;

  const byExercise = new Map<string, DecoratedLog[]>();
  const startedAt = new Map<string, string>();
  for (const log of logs) {
    const list = byExercise.get(log.exerciseId);
    if (list) list.push(decorate(ix, log));
    else byExercise.set(log.exerciseId, [decorate(ix, log)]);

    const seen = startedAt.get(log.exerciseId);
    if (!seen || log.updatedAt < seen) startedAt.set(log.exerciseId, log.updatedAt);
  }

  const planned = new Map(ix.entries.map((e, i) => [e.exerciseId ?? '', i]));
  const order = [...byExercise.keys()].sort(
    (a, b) =>
      (startedAt.get(a) ?? '').localeCompare(startedAt.get(b) ?? '') ||
      (planned.get(a) ?? Infinity) - (planned.get(b) ?? Infinity),
  );

  const sessions = new Set(logs.map((l) => l.session));
  const only = sessions.size === 1 ? [...sessions][0]! : null;

  return {
    date,
    // Through `planDayOf`, like every other reading of a label: an off-plan
    // day would otherwise report itself as a day of the plan called 'X'.
    session: only !== null && planDayOf(only) !== null ? only : null,
    sets: logs.length,
    exercises: order.flatMap((id) => {
      const exercise = ix.exerciseById.get(id);
      if (!exercise) return [];
      return [
        {
          exercise,
          pattern: ix.patternById.get(exercise.patternId) ?? null,
          logs: byExercise.get(id) ?? [],
        },
      ];
    }),
  };
}
