/**
 * Goals, and the permission they grant.
 *
 * The app used to tell everybody what was not progressing. "No higher than June
 * 29, and 9 sessions since then" is true, and it is also an accusation nobody
 * asked for — aimed at somebody who may be maintaining deliberately, coming
 * back from an injury, or training because it makes their week better. The
 * failure mode is not a wrong number. It is a person reading that their bench
 * press has let them down and training less as a result.
 *
 * So evaluation is opt-in, one lift at a time. **A goal is consent**: it names
 * the lift, the number, and the date it stops mattering. Without one the app
 * describes — here is what you lifted, here is the line — and offers no verdict
 * on whether it was enough.
 *
 * Three things keep that consent honest, and all three are in this file:
 *
 *  - **It expires.** A goal ends on its date and is never renewed
 *    automatically, so silence is the resting state and has to be deliberately
 *    interrupted rather than deliberately restored.
 *  - **It is bounded by evidence.** A target implying a rate of gain the
 *    literature does not support is refused, not because the app knows better
 *    than the user but because agreeing to it would mean holding somebody to
 *    something that was never going to happen. See `GUARDRAILS`.
 *  - **There are only so many.** You cannot ask to be pushed on everything.
 */

import { addDays, daysBetween, est1RM, isoDate, type Indexed } from './model';
import type { Goal, SetLog } from './types';

/* --------------------------------------------------------------- reading */

/** Whether this goal is still running on `today`. */
export const isLive = (goal: Goal, today: string): boolean =>
  goal.retiredAt === null && goal.targetDate >= today;

/** The goals still in force. Expired ones are kept — they are history. */
export const liveGoals = (ix: Indexed, today: string): Goal[] =>
  ix.goals.filter((g) => isLive(g, today));

/**
 * The lifts the app has been given permission to judge.
 *
 * Everything downstream that produces a verdict about progression asks this
 * first. An empty set means the app says nothing evaluative at all, which is
 * the state every account starts in and returns to.
 */
export const growingExercises = (ix: Indexed, today: string): Set<string> =>
  new Set(liveGoals(ix, today).map((g) => g.exerciseId));

/** The best estimated one-rep max for a lift, over the sets given. */
export function bestE1RM(logs: SetLog[], exerciseId: string): number {
  let best = 0;
  for (const l of logs) {
    if (l.exerciseId !== exerciseId || l.deletedAt !== null) continue;
    const e = est1RM(l.weight, l.reps, l.rir);
    if (e !== null && e > best) best = e;
  }
  return Math.round(best * 10) / 10;
}

/* -------------------------------------------------------------- progress */

export interface GoalProgress {
  goal: Goal;
  /** Best estimated one-rep max since the goal was set. */
  current: number;
  /** How much of the distance has been covered, 0 to 1. Can exceed 1. */
  share: number;
  /** Whole days until the target date. Negative once it has passed. */
  daysLeft: number;
  /** True once the target has been reached, whatever the date says. */
  achieved: boolean;
  /**
   * Whether the lift has moved by more than a retest of the same lift would
   * move on its own — 4.2% being the median coefficient of variation for a
   * repeated one-rep max (see `EVIDENCE`).
   *
   * **There is deliberately no "expected by now" here.** An earlier version
   * carried a linear pace and the share of it you had covered, which is the
   * one shape the literature does not support: progression is per-successful-
   * session and gated on performance, never a rate per calendar week. Holding
   * somebody to a straight line would have been the app inventing a standard
   * and then measuring them against it.
   */
  moved: boolean;
}

export function goalProgress(goal: Goal, ix: Indexed, today: string): GoalProgress {
  const since = ix.logs.filter((l) => l.date >= goal.startedOn);
  // Canonical, so a goal handed in straight from the store — still carrying an
  // account's pre-catalogue id — finds the same sets `index()` renamed.
  const current = Math.max(bestE1RM(since, ix.exerciseIdOf(goal.exerciseId)), goal.baseline);

  const distance = goal.target - goal.baseline;
  const share = distance > 0 ? (current - goal.baseline) / distance : 1;

  return {
    goal,
    current,
    share,
    daysLeft: daysBetween(today, goal.targetDate),
    achieved: current >= goal.target,
    moved: goal.baseline > 0 && (current - goal.baseline) / goal.baseline > EVIDENCE.retestCv,
  };
}

/* ------------------------------------------------------------ guardrails */

/**
 * What the evidence actually supports — and, just as importantly, what it does
 * not.
 *
 * The first version of this file held people to a linear pace: a goal implied
 * so many kilos a week, and being behind that line earned a nudge. **That shape
 * is not in the literature.** Every published progression figure is a
 * *per-successful-session* increment gated on performance, not a rate per
 * calendar week:
 *
 *  - The ACSM position stand recommends a **2-10% load increase per exercise**,
 *    applied once the lifter can already exceed the target reps — not on a
 *    schedule. (Progression Models in Resistance Training for Healthy Adults,
 *    Med Sci Sports Exerc 2009;41(3):687-708.)
 *  - The "2-for-2 rule" and its absolute kilo increments are practitioner
 *    convention from a textbook table, not a research finding. They are not
 *    quoted to the user as evidence, because they are not.
 *  - The nearest thing to a weekly cap from a major body is the IOC consensus
 *    statement's caution about load increases beyond roughly 10% a week — and
 *    that is about training load in athletes, not a one-rep-max target.
 *    (Soligard et al., Br J Sports Med 2016;50:1030-1041.)
 *
 * So the app does not draw an expected line and measure people against it. It
 * checks two things a goal genuinely can be wrong about — whether the change
 * asked for is big enough to detect, and whether the time allowed is long
 * enough to accumulate one — and then gets out of the way.
 */
export const EVIDENCE = {
  /**
   * Median within-subject coefficient of variation for a retested one-rep max:
   * **4.2%** across 32 studies, pooled n = 1595 (upper body 4.1%, lower body
   * 4.7%). Grgic, Lazinica, Schoenfeld & Pedisic, "Test-Retest Reliability of
   * the One-Repetition Maximum (1RM) Strength Assessment: a Systematic
   * Review", Sports Medicine - Open 2020;6:31.
   *
   * This is the single most useful number here. It means a 3% "gain" is not a
   * gain, and neither is a 3% "decline" — and an app that reports either as
   * progress or as a problem is reporting its own noise.
   */
  retestCv: 0.042,
  /**
   * Observed cumulative gain in lifters who were **already trained** when
   * measurement began: roughly 7.5-12.5% above baseline over the first year,
   * and only about 12.5-20% above baseline after ten. Steele et al., Research
   * Quarterly for Exercise and Sport, doi:10.1080/02701367.2022.2070592.
   *
   * Strength against training time is well described by strength proportional
   * to log(time), so the increment shrinks continuously rather than stopping.
   * Untrained and novice lifters move very much faster than this, which is why
   * it is not used as a hard limit — only as the thing a warning explains.
   */
  trainedFirstYearGain: 0.1,
} as const;

/**
 * The smallest distance worth calling a goal: **5%** over the baseline.
 *
 * Just above the 4.2% retest CV, so a goal that is reached is a goal that
 * actually happened rather than a good day on the platform.
 */
export const MIN_DISTANCE = 0.05;

/**
 * The shortest horizon: eight weeks.
 *
 * Not a number from a study, and the comment says so. It follows from two that
 * are: progression is per-successful-session, and a detectable change has to
 * clear the retest CV — so the horizon has to hold enough sessions for enough
 * increments to add up to more than noise. Below two months it cannot.
 */
export const MIN_WEEKS = 8;
/** Beyond this a "goal" is a hope, and the app would be nagging for a year. */
export const MAX_WEEKS = 52;
/** You cannot ask to be pushed on everything. Three is a focus; eight is a mood. */
export const MAX_LIVE_GOALS = 3;

export interface GoalCheck {
  /** False only when the goal is not measurable or not possible to run. */
  allowed: boolean;
  /**
   * Set when the goal is allowed but the rate it implies is a long way beyond
   * what this person has actually been doing, or beyond what the literature
   * observes.
   *
   * A warning rather than a refusal, deliberately. Goal-setting research is
   * clear that commitment is what makes a goal work at all, and that a goal
   * somebody has rejected as not theirs performs *worse* than no goal — so the
   * app says what it knows and leaves the decision where it belongs. (Locke &
   * Latham, "Building a Practically Useful Theory of Goal Setting and Task
   * Motivation", American Psychologist 2002;57(9):705-717.)
   */
  warning: 'ambitious' | null;
  reason: 'tooSmall' | 'tooShort' | 'tooLong' | 'tooMany' | null;
  /** A target that would clear every check, for the app to offer instead. */
  suggestedTarget: number;
  /** Percent a week the goal implies, for the warning to quote. */
  impliedWeeklyPct: number;
}

export interface GoalRequest {
  baseline: number;
  target: number;
  startedOn: string;
  targetDate: string;
  /** How many goals are already running, excluding this one. */
  liveCount: number;
  /**
   * This person's own gain on this lift over the last few months, as a
   * fraction — 0.08 for eight percent. Null when there is not enough history,
   * in which case the literature figure is used instead.
   *
   * Preferred over any population constant when it exists: a novice and a
   * ten-year lifter differ by more than a single threshold can express, and
   * their own trailing rate is the only measurement of which they are.
   */
  ownRecentGain: number | null;
}

export function checkGoal(req: GoalRequest): GoalCheck {
  const weeks = Math.max(0, daysBetween(req.startedOn, req.targetDate) / 7);
  const distance = req.baseline > 0 ? (req.target - req.baseline) / req.baseline : 0;

  /* The reference the warning is measured against: what this person has
     actually been doing, doubled, because a goal should be allowed to be
     harder than the recent past. With no history to go on, the observed
     first-year figure for trained lifters stands in — generously, since a
     newer lifter will beat it. */
  const reference =
    req.ownRecentGain !== null ? req.ownRecentGain * 2 : EVIDENCE.trainedFirstYearGain;
  const affordable = Math.max(MIN_DISTANCE, (reference * weeks) / 52);

  const suggestedTarget =
    Math.round(req.baseline * (1 + Math.max(MIN_DISTANCE, affordable)) * 2) / 2;
  const impliedWeeklyPct = weeks > 0 ? Math.round((distance / weeks) * 1000) / 10 : 0;

  const refuse = (reason: GoalCheck['reason']): GoalCheck => ({
    allowed: false,
    warning: null,
    reason,
    suggestedTarget,
    impliedWeeklyPct,
  });

  if (req.liveCount >= MAX_LIVE_GOALS) return refuse('tooMany');
  if (weeks < MIN_WEEKS) return refuse('tooShort');
  if (weeks > MAX_WEEKS) return refuse('tooLong');
  // Not a judgement about ambition — a change this small cannot be told apart
  // from testing the same lift twice.
  if (distance < MIN_DISTANCE) return refuse('tooSmall');

  return {
    allowed: true,
    warning: distance > affordable * 1.5 ? 'ambitious' : null,
    reason: null,
    suggestedTarget,
    impliedWeeklyPct,
  };
}

/**
 * This person's own gain on a lift over the trailing months, as a fraction.
 *
 * Null when there is not enough to go on: two sessions is not a rate, and
 * guessing one would put a number in front of somebody that the app invented.
 */
export function recentGainOf(ix: Indexed, rawId: string, today: string): number | null {
  const exerciseId = ix.exerciseIdOf(rawId);
  const from = addDays(today, -168); // Six months.
  const logs = ix.logs.filter((l) => l.exerciseId === exerciseId && l.date >= from);
  const dates = [...new Set(logs.map((l) => l.date))].sort();
  if (dates.length < 6) return null;

  const half = Math.floor(dates.length / 2);
  const early = bestE1RM(
    logs.filter((l) => l.date <= dates[half - 1]!),
    exerciseId,
  );
  const late = bestE1RM(
    logs.filter((l) => l.date >= dates[half]!),
    exerciseId,
  );
  if (early <= 0) return null;
  return Math.max(0, (late - early) / early);
}

/* ---------------------------------------------------------------- ending */

/**
 * What to say when a goal's date has passed.
 *
 * Never "failed". The date arriving is not a verdict on the person, and a goal
 * that ran out with two thirds of the distance covered describes two months of
 * real training. The app reports what happened and offers another go.
 */
export type GoalOutcome = 'achieved' | 'partly' | 'flat';

export function outcomeOf(p: GoalProgress): GoalOutcome {
  if (p.achieved) return 'achieved';
  return p.share > 0.05 ? 'partly' : 'flat';
}

/**
 * How many separate sessions a baseline has to rest on.
 *
 * The same argument as `MIN_DISTANCE`, applied to the other end of the
 * comparison. A single set carries the full retest variation, so a goal set 5%
 * above one measurement can be a goal whose target sits inside the error bar of
 * its own starting point. Three sessions is not a confidence interval, but it
 * is the difference between a number and a guess.
 */
export const MIN_BASELINE_SESSIONS = 3;

/**
 * A goal starting from where the lift is now — or 0 when the app does not yet
 * know where that is, in which case the answer is to train it a few more times
 * rather than to offer a baseline it would then hold somebody to.
 */
export function suggestBaseline(ix: Indexed, rawId: string, today: string): number {
  const exerciseId = ix.exerciseIdOf(rawId);
  // Eight weeks, matching the window the strength score uses: long enough that
  // one bad session does not set the bar low, recent enough to be true now.
  const from = addDays(today, -56);
  const logs = ix.logs.filter((l) => l.date >= from && l.exerciseId === exerciseId);
  const sessions = new Set(logs.map((l) => l.date)).size;
  if (sessions < MIN_BASELINE_SESSIONS) return 0;
  return bestE1RM(logs, exerciseId);
}

export const todayIso = (d: Date | string = new Date()): string => isoDate(d);
