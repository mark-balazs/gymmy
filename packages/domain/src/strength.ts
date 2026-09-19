/**
 * The two numbers that measure you rather than record what you did.
 *
 * There used to be one, and it was a category error. It summed the best
 * estimated one-rep max across **five** movement patterns and then scaled the
 * result with DOTS — a curve fitted to the **three**-lift powerlifting total.
 * Changing the numerator while keeping the reference gives a ratio between two
 * quantities that do not measure the same thing, and the error is not small: at
 * 83 kg, a real 450 kg squat/bench/deadlift total scores 304, while a
 * five-pattern sum of 650 kg scores 439. Forty-four percent of that came from
 * counting more lifts. Anyone who checked us against a public calculator would
 * have found us wrong, and been right.
 *
 * The fix is not to pick one of the two. They answer different questions and
 * both are worth asking:
 *
 *  - **`dotsAt` — a real DOTS.** Squat, bench and deadlift, on the bar, nothing
 *    else. The formula is the published one and the coefficient is the
 *    published one, so a public calculator agrees with the arithmetic. This is
 *    the only number here that means anything to anybody but you.
 *  - **`strengthAt` — gymmy's own index.** All five loaded patterns, with a
 *    pattern you have never trained counting as zero, because covering the
 *    whole body is this app's entire thesis and a score that ignored it would
 *    be arguing against the rest of the product. Real weights only — barbell,
 *    dumbbell and kettlebell lifts, plus pull-ups, chin-ups and dips at
 *    bodyweight plus what was added (`indexEstimate`). On our own scale. Not
 *    comparable to anybody else's, and it does not pretend to be.
 *
 * ## Where they deliberately differ
 *
 * **Only the index carries the age allowance.** Plain DOTS is a function of
 * total, bodyweight and sex, full stop; masters coefficients (McCulloch for
 * 40+, Foster for juniors) are a separate multiplier a federation applies on
 * top, and when OpenPowerlifting applies one it produces a differently *named*
 * score. Public calculators do not ask for age — rpetraining and Strength Level
 * have no age field at all, and the ones that offer it label the result an
 * age-adjusted score. So multiplying our DOTS by a masters factor would put us
 * roughly 13% out at 50, 34% at 60 and 65% at 70 against every calculator
 * somebody might check us with, which is the single property that number exists
 * to have. The allowance is real and worth keeping, so it lives on the index —
 * our scale, our justification.
 *
 * **The index uses one exponent, not one per lift.** An earlier plan here was
 * to follow per-lift exponents for the squat, bench and deadlift. Two reasons
 * it does not, and the second is the stronger:
 *
 *  - **No exponent has been derived for a lunge or a row.** The one row study
 *    found applies an *assumed* two-thirds rather than deriving anything, and
 *    inventing two of five would be the same mistake as the twelve-rep ceiling.
 *  - **The per-lift figures are not solid enough to build on.** The ones first
 *    considered — squat 0.515, bench 0.345, deadlift 0.394 — are Table 3 of
 *    Montenegro, Wicker & Donath 2026 (Front Physiol 17:1847605): an academic
 *    study, not a federation analysis as this comment once said, and each value
 *    comes from the twenty all-time strongest lifters per sex, chosen by the
 *    very quantity being fitted, with no confidence intervals. The women's
 *    deadlift in the same table is 0.691 against the men's 0.394, and other
 *    studies disagree (Dooman & Vanderburgh 2000: bench 0.57, squat 0.60).
 *
 * So the index uses the conventional two-thirds, once, over the sum.
 *
 * ## What neither of them is
 *
 * **A meet total.** A competition total is three singles on one day, under
 * commands, judged. Both numbers here are built from `est1RM` over an
 * eight-week window, so they read high of what anybody would actually total —
 * the formula is real, the inputs are estimates from training. That caveat
 * belongs on screen, not only here.
 *
 * **A percentile.** There is no table of other people in this file. DOTS gives
 * a comparable *scale*, not a ranking, and the index is not comparable at all.
 */

import { addDays, allLogs, blockWeeks, est1RM, type DecoratedLog, type Indexed } from './model';
import { LOAD_CONVENTION_FROM, isWholeBody, loadClassOf, loadRuleOf } from './load';
import type { PatternKey, Sex, Unit } from './types';

/**
 * The patterns gymmy's own index is computed from.
 *
 * The five loaded ones, and deliberately not all seven. A carry is logged by
 * distance, so its "reps" are metres and a one-rep max estimated from them is
 * not a number about strength at all; rotation is trained light and
 * anti-rotational by design. Including either would move the index for reasons
 * that have nothing to do with getting stronger.
 */
export const SCORED_PATTERNS: PatternKey[] = ['squat', 'hinge', 'lunge', 'push', 'pull'];

/**
 * Whether a lift can add to the index at all: a real weight (a load class with
 * `mass: true`), or a pull-up, chin-up or dip (`WHOLE_BODY`), counted at
 * bodyweight plus what was added. Decision log D-022.
 *
 * One answer for two readers. `indexEstimate` below takes a set's estimate only
 * from these, and the generator gives each scored movement's main slot one of
 * these (`buildProgram`), so the week it builds is one this index can read.
 */
export const countsForIndex = (name: string): boolean => isWholeBody(name) || loadRuleOf(name).mass;

/**
 * The three lifts a DOTS score is defined on.
 *
 * Named exactly, and strictly. A front squat is not a competition squat and a
 * trap bar is not a competition deadlift — both are fine lifts and neither is
 * what the curve was fitted to. Accepting a substitute would quietly break the
 * one property this number has, which is that somebody can check it.
 *
 * **Strictness is our choice, not the formula's.** DOTS was built for the full
 * squat-bench-deadlift total, but nothing in its definition restricts the input:
 * OpenPowerlifting happily scores a bench-only entry from the bench alone. What
 * that buys is a number that is still *arithmetically* DOTS and no longer
 * comparable with anybody's total, which is the failure mode this whole file
 * exists to undo. So the restriction is ours, deliberately, and it is here
 * rather than in the arithmetic.
 *
 * All three are `barbell` in `load.ts`, so no stack setting or half-a-landmine
 * can reach the only figure here that compares one person with another.
 * `strength.test.ts` asserts that rather than trusting it.
 */
export const COMPETITION_LIFTS = [
  'Barbell Back Squat',
  'Barbell Bench Press',
  'Conventional Deadlift',
] as const;

/** How far back a lift still counts, in Monday weeks: the week being scored
 *  and the seven before it. Long enough that a deload or a holiday does not
 *  register; short enough that the number describes you now. */
const STRENGTH_WINDOW_WEEKS = 8;

const LB_PER_KG = 2.2046226218;

/** Everything here is computed in kilos, because the formulae below are. */
export const toKg = (weight: number, unit: Unit): number =>
  unit === 'lb' ? weight / LB_PER_KG : weight;

/**
 * DOTS — the bodyweight-and-sex normalisation used across competitive
 * powerlifting.
 *
 * A plain bodyweight multiple is badly unfair at the ends: strength scales with
 * roughly the two-thirds power of mass, so dividing by bodyweight flatters a
 * light lifter and punishes a heavy one for existing. DOTS is a fitted curve
 * that corrects for both bodyweight and sex, and it is widely implemented and
 * checkable — which beats anything invented here.
 *
 * It is worth being precise about "published", because this file used to
 * overclaim it: DOTS has **no peer-reviewed derivation** and no stated sample
 * size or fit statistics. It is also **not** the IPF's formula — IPF GL Points
 * is. What it has is ubiquity and a fixed definition, which is enough to make
 * it checkable and not enough to make it authoritative.
 *
 * Coefficients are the fourth-order polynomials, evaluated as
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
 * The multiplier a three-lift total is scaled by.
 *
 * Only the two published curves. There used to be a third, the midpoint, for
 * "prefer not to say" — a number no DOTS calculator gives; see `dotsFrom` for
 * why that answer now leaves the score blank instead. The type keeps it out.
 */
export function dotsCoefficient(bodyWeightKg: number, sex: Exclude<Sex, 'unspecified'>): number {
  return sex === 'male'
    ? dotsFor(DOTS.male, DOTS.maleRange, bodyWeightKg)
    : dotsFor(DOTS.female, DOTS.femaleRange, bodyWeightKg);
}

/**
 * The exponent the index divides bodyweight by.
 *
 * Two-thirds, from geometric similarity: muscle force goes with
 * cross-sectional area, which is a length squared, while mass is a length
 * cubed — so strength should scale with mass to the two-thirds.
 *
 * **Established precedent, verified.** The theory is Åstrand & Rodahl
 * (*Textbook of Work Physiology*, 3rd ed., 1986, pp. 399–405). Jaric 2002
 * (Sports Med 32:615–631) recommends b = 0.67 for force measures in routine
 * strength testing, as do Jaric, Mirkov & Markovic 2005 (JSCR 19:467–474);
 * Vanderburgh 1999 (JEPonline 2(4)) calls strength ÷ mass^(2/3) "probably the
 * single best adjustment technique". Citing it is following the literature.
 * (Not Hill 1950, which is sometimes credited with it and is about speed and
 * jump height; and Batterham & George 1997 is weightlifting, not powerlifting.)
 *
 * **What it is not: the measured value for trained lifters.** Those come out
 * lower — about 0.45 to 0.60 for totals. Montenegro, Wicker & Donath 2026 fit
 * 0.550 for men and 0.500 for women across 308,530 tested raw powerlifters;
 * Dooman & Vanderburgh 2000 give bench 0.57 and squat 0.60. Against those, two
 * thirds over-corrects a little: it divides a heavier lifter by slightly more
 * than the data says it should.
 *
 * Why it stays anyway: this only touches the index, which is never compared
 * between people. The one place the over-correction shows is somebody's own
 * chart when their bodyweight moves — putting on weight costs the index a
 * little more than it should — and a measured exponent would trade a
 * well-understood default for a population-specific fit that the same
 * literature says changes with sex, level, body composition and the lift.
 */
export const ALLOMETRIC_EXPONENT = 2 / 3;

/**
 * Masters age allowance — applied to gymmy's index, never to DOTS.
 *
 * Strength declines with age, and a number that ignores that tells a
 * 62-year-old they are getting weaker for doing something remarkable.
 * Competitive lifting handles this with an age factor applied on top of the
 * bodyweight coefficient — the McCulloch/Foster family of tables — which
 * multiplies upward from about 40.
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

/** Unit and sex come from the profile, which the index deliberately does not
 *  carry — every other function here is a pure read over synced rows. */
export interface StrengthOf {
  unit: Unit;
  sex: Sex;
  /** Optional. Without it there is no age allowance, which is the right
   *  behaviour for somebody who has not said. */
  birthYear?: number | null;
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

/* ------------------------------------------------------------ the window */

/**
 * Everything trained in the eight weeks ending with `weekOf`, estimable or not:
 * from the Monday seven weeks back to the Sunday of `weekOf`'s own week.
 *
 * Seven, not eight, because `weekOf` is itself one of the eight. Going back a
 * full eight Mondays made the window nine weeks, and made Progress's "eight
 * weeks ago" share a week with now (GYM-46). `strength.test.ts` pins both
 * edges for both numbers: day −49 counts, day −50 does not.
 */
const trainedIn = (logs: DecoratedLog[], weekOf: string): DecoratedLog[] => {
  const from = addDays(weekOf, -7 * (STRENGTH_WINDOW_WEEKS - 1));
  const until = addDays(weekOf, 6);
  return logs.filter((l) => l.date >= from && l.date <= until && l.exercise);
};

/** The logs DOTS is computed from: the window, and only those with an
 *  estimate behind them. The index uses the same window but makes its own
 *  estimates, because a pull-up's estimate counts bodyweight (`indexEstimate`). */
const inWindow = (logs: DecoratedLog[], weekOf: string): DecoratedLog[] =>
  trainedIn(logs, weekOf).filter((l) => l.e1rm !== null);

const patternOfExercise = (ix: Indexed): Map<string, PatternKey> => {
  const byId = new Map<string, PatternKey>();
  for (const p of ix.patterns) if (p.key) byId.set(p.id, p.key);
  const out = new Map<string, PatternKey>();
  // All resolvable exercises, retired ones included: their sets still count.
  for (const e of ix.exerciseById.values()) {
    const key = byId.get(e.patternId);
    if (key) out.set(e.patternId, key);
  }
  return out;
};

/* ------------------------------------------------------------------ DOTS */

export interface DotsPoint {
  weekOf: string;
  /**
   * Null unless all three competition lifts have been trained in the window,
   * bodyweight is known and sex has been answered — exactly when `missing` is
   * null. DOTS publishes no curve for "prefer not to say", and a midpoint of
   * the two would be a number no other DOTS calculator gives.
   *
   * Strict on purpose, and the same principle as everywhere else here: a total
   * missing a lift is not a smaller total, it is not a total. Filling the gap
   * with a zero would report somebody who has never benched as weak rather than
   * as unmeasured, and filling it with a guess would produce a number that no
   * longer agrees with the calculator it exists to agree with.
   */
  score: number | null;
  bodyWeight: number | null;
  /**
   * Per competition lift, in `COMPETITION_LIFTS` order: the best estimated
   * one-rep max, and whether it was trained in the window at all.
   *
   * Two separate facts, because they want two different sentences. `best` is
   * zero both for a lift never done and for one done only above the rep
   * ceiling, where there is nothing to estimate from — and telling somebody who
   * benched on Tuesday that their bench is "still missing" is telling them to go
   * and do the training they already did.
   */
  lifts: { name: string; best: number; trained: boolean }[];
  /** The three-lift total, in the profile's unit. Null when one is missing. */
  total: number | null;
  /**
   * Why there is no score, or null when there is one — in the order the screen
   * should ask for them. A lift never trained; a lift trained but never heavy
   * enough to estimate; no bodyweight; no answer about sex.
   */
  missing: 'lifts' | 'estimate' | 'bodyweight' | 'sex' | null;
}

function dotsFrom(
  logs: DecoratedLog[],
  bodyWeight: number | null,
  weekOf: string,
  who: StrengthOf,
): DotsPoint {
  const isLift = (name: string) => (COMPETITION_LIFTS as readonly string[]).includes(name);
  const trained = new Set(
    trainedIn(logs, weekOf)
      .map((l) => l.exercise!.name)
      .filter(isLift),
  );
  const best = new Map<string, number>();
  for (const log of inWindow(logs, weekOf)) {
    const name = log.exercise!.name;
    if (!isLift(name)) continue;
    if (log.e1rm! > (best.get(name) ?? 0)) best.set(name, log.e1rm!);
  }

  const lifts = COMPETITION_LIFTS.map((name) => ({
    name,
    best: best.get(name) ?? 0,
    trained: trained.has(name),
  }));
  const complete = lifts.every((l) => l.best > 0);
  const total = complete ? lifts.reduce((sum, l) => sum + l.best, 0) : null;

  /* No score without a sex answer, rather than the midpoint of the two curves.
     The midpoint is a number no public calculator produces, and a DOTS that
     cannot be checked has lost the one property it exists to have. Every
     account starts at "prefer not to say" and onboarding never asks, so the
     midpoint was quietly the default — 18% above a man's real DOTS at 83 kg.
     "Prefer not to say" stays a first-class answer; it just does not come with
     a DOTS attached. The index, which never compares anybody, does not ask. */
  const missing: DotsPoint['missing'] = lifts.some((l) => !l.trained)
    ? 'lifts'
    : !complete
      ? 'estimate'
      : !bodyWeight
        ? 'bodyweight'
        : who.sex === 'unspecified'
          ? 'sex'
          : null;

  return {
    weekOf,
    bodyWeight,
    lifts,
    total,
    missing,
    score:
      missing === null && who.sex !== 'unspecified' && total && bodyWeight
        ? // No age factor. See the header: plain DOTS has none, and adding one
          // is precisely what would make a public calculator disagree with us.
          Math.round(toKg(total, who.unit) * dotsCoefficient(toKg(bodyWeight, who.unit), who.sex))
        : null,
  };
}

/** A DOTS score for the eight weeks ending with `weekOf`'s week — the same
 *  window as the index. */
export const dotsAt = (ix: Indexed, weekOf: string, who: StrengthOf): DotsPoint =>
  dotsFrom(allLogs(ix), bodyWeightOn(ix, addDays(weekOf, 6)), weekOf, who);

/* --------------------------------------------------------- gymmy's index */

export interface StrengthPoint {
  weekOf: string;
  /**
   * gymmy's own index: the five-pattern total over bodyweight to the
   * two-thirds, with the age allowance on top.
   *
   * Null where bodyweight for that week is unknown — it is a ratio, and
   * inventing the denominator would invent the answer.
   */
  index: number | null;
  bodyWeight: number | null;
  /** Best estimated one-rep max per scored pattern, in `SCORED_PATTERNS` order,
   *  from the lifts `indexEstimate` counts. */
  parts: { key: PatternKey; best: number }[];
}

/**
 * What one set adds to the index: its estimated one-rep max, or null when it
 * adds nothing.
 *
 * **Real weights only** (Decision log D-022). A barbell, dumbbell or kettlebell
 * set — a load class with `mass: true` — counts its own estimate. A pull-up,
 * chin-up or dip (`WHOLE_BODY` in `load.ts`) counts at bodyweight plus what was
 * added, estimated by the same rule as everything else, so an unweighted
 * pull-up has a number and a weighted one is no longer only the belt. Anything
 * else — a machine, a landmine, a push-up — adds nothing: its number is not a
 * mass, and summing a pin position with a kilogram answers nothing. It still
 * charts against itself on its own lift.
 *
 * The bodyweight is the one the index divides by: the latest on record up to
 * the end of the scored week. So the pull-up and the denominator always agree,
 * and a week with no bodyweight has no index for any lift to be missing from.
 *
 * **A pull-up, chin-up or dip logged before `LOAD_CONVENTION_FROM` adds
 * nothing.** Until then the box said only "Weight (kg)", and some people typed
 * their bodyweight into it — so an old 80 is either 80 kg added or the person
 * themselves, and bodyweight on top of the second would count them twice.
 * Nothing stored says which, so the row is left out rather than guessed at.
 */
const indexEstimate = (log: DecoratedLog, bodyWeight: number | null): number | null => {
  const name = log.exercise!.name;
  if (!countsForIndex(name)) return null;
  if (!isWholeBody(name)) return log.e1rm;
  if (log.date < LOAD_CONVENTION_FROM) return null;
  return bodyWeight ? est1RM(bodyWeight + (log.weight ?? 0), log.reps, log.rir) : null;
};

function indexFrom(
  logs: DecoratedLog[],
  patternOf: Map<string, PatternKey>,
  bodyWeight: number | null,
  weekOf: string,
  who: StrengthOf,
): StrengthPoint {
  const best = new Map<PatternKey, number>();
  for (const log of trainedIn(logs, weekOf)) {
    const key = patternOf.get(log.exercise!.patternId);
    if (!key || !SCORED_PATTERNS.includes(key)) continue;
    const estimate = indexEstimate(log, bodyWeight);
    if (estimate !== null && estimate > (best.get(key) ?? 0)) best.set(key, estimate);
  }

  const parts = SCORED_PATTERNS.map((key) => ({ key, best: best.get(key) ?? 0 }));
  // A pattern never trained contributes zero rather than being skipped, so the
  // index reflects coverage as well as load — which is the whole method, and
  // the reason this number exists beside a three-lift one.
  const total = parts.reduce((sum, p) => sum + p.best, 0);

  return {
    weekOf,
    bodyWeight,
    parts,
    index:
      bodyWeight && total
        ? Math.round(
            (toKg(total, who.unit) / toKg(bodyWeight, who.unit) ** ALLOMETRIC_EXPONENT) *
              ageFactor(ageInWeek(who.birthYear, weekOf)) *
              10,
          ) / 10
        : null,
  };
}

/**
 * How much you move across the whole body, relative to you.
 *
 * One decimal place, and an order of magnitude below a DOTS score, because the
 * two sit on the same screen and two three-digit numbers that mean different
 * things get read as the same number twice. 34.2 and 304 are obviously not the
 * same kind of thing, which is the point.
 *
 * It looks back over eight weeks (`trainedIn`) rather than taking your best
 * ever, so it describes what you can do *now* — a squat from last spring should
 * not still be counted as strength you have today.
 */
export const strengthAt = (ix: Indexed, weekOf: string, who: StrengthOf): StrengthPoint =>
  indexFrom(allLogs(ix), patternOfExercise(ix), bodyWeightOn(ix, addDays(weekOf, 6)), weekOf, who);

/** The index week by week across a block. */
export function strengthSeries(
  ix: Indexed,
  blockStart: string,
  weeks: number,
  who: StrengthOf,
): StrengthPoint[] {
  const logs = allLogs(ix);
  const patterns = patternOfExercise(ix);
  return blockWeeks(blockStart, weeks).map((weekOf) =>
    indexFrom(logs, patterns, bodyWeightOn(ix, addDays(weekOf, 6)), weekOf, who),
  );
}

/** Guard: nothing whose stored number is not an external mass may reach the one
 *  score that compares people. Held by `strength.test.ts`. */
export const competitionLiftsAreMasses = (): boolean =>
  COMPETITION_LIFTS.every((n) => loadRuleOf(n).mass && loadClassOf(n) === 'barbell');
