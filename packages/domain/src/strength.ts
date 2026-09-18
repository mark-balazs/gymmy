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
 *    be arguing against the rest of the product. On our own scale. Not
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
 * to follow the lift-specific exponents a federation analysis gives for the
 * squat, bench and deadlift. It cannot be followed, for a reason that has
 * nothing to do with whether those figures are right: there is nothing
 * comparable published for a lunge or a row. Inventing two of five would be the
 * same mistake as the twelve-rep ceiling — a number justified by our own
 * programming rather than by evidence. So the index uses the conventional
 * two-thirds exponent once, over the sum.
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

import { addDays, allLogs, blockWeeks, type DecoratedLog, type Indexed } from './model';
import { loadClassOf, loadRuleOf } from './load';
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

/** How far back a lift still counts. Long enough that a deload or a holiday
 *  does not register; short enough that the number describes you now. */
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

/**
 * The exponent the index divides bodyweight by.
 *
 * Two-thirds, from geometric similarity: muscle force goes with
 * cross-sectional area, which is a length squared, while mass is a length
 * cubed — so strength should scale with mass to the two-thirds. It is the
 * conventional allometric normalisation in the exercise-science literature
 * rather than anything of ours.
 *
 * **This is the weakest-sourced number in this file, and it is labelled as
 * such.** The DOTS coefficients above were checked digit by digit against a
 * reference implementation and against live scores. This one was not: the
 * verification pass that was meant to pin it down never ran. What is known is
 * that it is contested — measured exponents in trained populations do not land
 * neatly on 0.667, and whether a single exponent can serve every movement is an
 * open argument.
 *
 * It is still the right choice here, because the alternatives are worse rather
 * than because it is settled: a plain bodyweight multiple is wrong at both ends,
 * and five per-lift exponents would mean inventing two. It also only ever
 * touches the index, which is explicitly not comparable between people — so an
 * exponent that is off does not make anybody's number wrong against a
 * reference, it only bends our own scale. That is the entire reason the
 * unverified constant is on this side of the split.
 *
 * Recorded as a known gap in `docs/README.md`.
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

/** The logs both numbers are computed from: the eight weeks ending with
 *  `weekOf`, and only those with an estimate behind them. */
const inWindow = (logs: DecoratedLog[], weekOf: string): DecoratedLog[] => {
  const from = addDays(weekOf, -7 * STRENGTH_WINDOW_WEEKS);
  const until = addDays(weekOf, 6);
  return logs.filter((l) => l.date >= from && l.date <= until && l.e1rm !== null && l.exercise);
};

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

/* ------------------------------------------------------------------ DOTS */

export interface DotsPoint {
  weekOf: string;
  /**
   * Null unless all three competition lifts have been trained in the window
   * and bodyweight is known.
   *
   * Strict on purpose, and the same principle as everywhere else here: a total
   * missing a lift is not a smaller total, it is not a total. Filling the gap
   * with a zero would report somebody who has never benched as weak rather than
   * as unmeasured, and filling it with a guess would produce a number that no
   * longer agrees with the calculator it exists to agree with.
   */
  score: number | null;
  bodyWeight: number | null;
  /** Best estimated one-rep max per competition lift, in `COMPETITION_LIFTS`
   *  order. Zero means it has not been trained in the window. */
  lifts: { name: string; best: number }[];
  /** The three-lift total, in the profile's unit. Null when one is missing. */
  total: number | null;
}

function dotsFrom(
  logs: DecoratedLog[],
  bodyWeight: number | null,
  weekOf: string,
  who: StrengthOf,
): DotsPoint {
  const best = new Map<string, number>();
  for (const log of inWindow(logs, weekOf)) {
    const name = log.exercise!.name;
    if (!(COMPETITION_LIFTS as readonly string[]).includes(name)) continue;
    if (log.e1rm! > (best.get(name) ?? 0)) best.set(name, log.e1rm!);
  }

  const lifts = COMPETITION_LIFTS.map((name) => ({ name, best: best.get(name) ?? 0 }));
  const complete = lifts.every((l) => l.best > 0);
  const total = complete ? lifts.reduce((sum, l) => sum + l.best, 0) : null;

  return {
    weekOf,
    bodyWeight,
    lifts,
    total,
    score:
      total && bodyWeight
        ? // No age factor. See the header: plain DOTS has none, and adding one
          // is precisely what would make a public calculator disagree with us.
          Math.round(toKg(total, who.unit) * dotsCoefficient(toKg(bodyWeight, who.unit), who.sex))
        : null,
  };
}

/** A DOTS score for the eight weeks ending with `weekOf`. */
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
  /** Best estimated one-rep max per scored pattern, in `SCORED_PATTERNS` order. */
  parts: { key: PatternKey; best: number }[];
}

function indexFrom(
  logs: DecoratedLog[],
  patternOf: Map<string, PatternKey>,
  bodyWeight: number | null,
  weekOf: string,
  who: StrengthOf,
): StrengthPoint {
  const best = new Map<PatternKey, number>();
  for (const log of inWindow(logs, weekOf)) {
    const key = patternOf.get(log.exercise!.patternId);
    if (!key || !SCORED_PATTERNS.includes(key)) continue;
    if (log.e1rm! > (best.get(key) ?? 0)) best.set(key, log.e1rm!);
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
 * It looks back over a window rather than taking your best ever, so it
 * describes what you can do *now* — a squat from last spring should not still
 * be counted as strength you have today.
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
