import { describe, expect, it } from 'vitest';
import {
  ALLOMETRIC_EXPONENT,
  COMPETITION_LIFTS,
  SCORED_PATTERNS,
  addDays,
  competitionLiftsAreMasses,
  dotsAt,
  dotsCoefficient,
  index,
  mondayOf,
  strengthAt,
  type StrengthOf,
} from '../src';
import type { BodyLog, PatternKey, SetLog, Snapshot } from '../src/types';
import { seedSnapshot } from './fixture';

/**
 * gymmy's own index — and, in the first half of this block, the properties both
 * numbers share, because they were one number when these tests were written.
 *
 * It has to be fair across bodyweights, honest about what it has not seen, and
 * completely indifferent to which unit you happen to read in. What it no longer
 * is: a comparison with a reference. That job moved to DOTS, below, and only
 * DOTS may make it.
 */
describe('strength index', () => {
  const snap = seedSnapshot('sevenPattern', 3);
  const thisWeek = mondayOf(new Date());

  const patternId = (key: PatternKey) => snap.patterns.find((p) => p.key === key)!.id;
  const exerciseOf = (key: PatternKey) =>
    snap.exercises.find((e) => e.patternId === patternId(key))!;

  let n = 0;
  const set = (key: PatternKey, weight: number, date: string): SetLog => ({
    id: `s-${++n}`,
    updatedAt: date,
    deletedAt: null,
    date,
    session: 'A',
    exerciseId: exerciseOf(key).id,
    setNo: 1,
    weight,
    reps: 5,
    rir: 0,
    note: '',
  });

  const body = (weight: number, date: string): BodyLog => ({
    id: `b-${weight}-${date}`,
    updatedAt: date,
    deletedAt: null,
    date,
    weight,
    note: '',
  });

  const build = (logs: SetLog[], bodyLogs: BodyLog[]): Snapshot => ({ ...snap, logs, bodyLogs });

  /** One solid lift in every scored pattern, this week. */
  const fullWeek = (weight = 100, date = addDays(thisWeek, 1)) =>
    SCORED_PATTERNS.map((k) => set(k, weight, date));

  it('a conditioning workout cannot inflate it', () => {
    /* The reason the estimate has a rep ceiling at all. Somebody does a
       CrossFit class — thirty deadlifts at 100 kg, twenty-one thrusters at 40 —
       and logs it honestly. Epley, being linear in reps forever, would read
       that first one as a 200 kg single: a personal best on a movement they
       have never maxed, carried by the score for eight weeks, and then reported
       as a *decline* when it ages out of the window.

       A number the app puts on screen as a headline has to survive its owner
       training in a way the app did not plan. */
    const heavy = set('hinge', 140, addDays(thisWeek, 1)); // a real 5-rep set
    const metcon = { ...set('hinge', 100, addDays(thisWeek, 2)), reps: 30, id: 'metcon' };

    const honest = strengthAt(index(build([heavy], [body(80, thisWeek)])), thisWeek, {
      unit: 'kg',
      sex: 'male',
    });
    const withMetcon = strengthAt(index(build([heavy, metcon], [body(80, thisWeek)])), thisWeek, {
      unit: 'kg',
      sex: 'male',
    });

    expect(withMetcon.index).toBe(honest.index);

    // And the reason it matters: unchecked, that one set claims a 200 kg max
    // against a genuine 163 kg estimate from the heavy day.
    expect(100 * (1 + 30 / 30)).toBeGreaterThan(140 * (1 + 5 / 30));
  });

  it('counts a set of ten to failure, and no longer counts the app’s own twelve', () => {
    /* This test asserted the opposite premise until the ceiling moved: that
       twelve reps must keep scoring *because* the app programmes twelve. That
       argument is about our programming, not about the estimate's validity, and
       the published bounds are all at ten or below — so the honest resolution
       was to move the ceiling rather than keep the range it flattered.

       The consequence is deliberate and it is this: a twelve-rep set now scores
       nothing at all. It still counts as training, still fills the week's
       coverage, and still charts by the weight on the bar. It simply does not
       get turned into a one-rep maximum. */
    const scoreOf = (reps: number, rir: number) =>
      strengthAt(
        index(
          build(
            [{ ...set('hinge', 100, addDays(thisWeek, 1)), reps, rir, id: `r${reps}-${rir}` }],
            [body(80, thisWeek)],
          ),
        ),
        thisWeek,
        { unit: 'kg', sex: 'male' },
      );

    expect(scoreOf(10, 0).parts.find((p) => p.key === 'hinge')!.best).toBeGreaterThan(0);
    expect(scoreOf(11, 0).parts.find((p) => p.key === 'hinge')!.best).toBe(0);
    expect(scoreOf(12, 0).parts.find((p) => p.key === 'hinge')!.best).toBe(0);

    /* And reps in reserve count against it, which is what the score cares
       about most: eight with four left is a twelve-rep effort by Epley's own
       arithmetic, and it used to be scored as one. */
    expect(scoreOf(8, 2).parts.find((p) => p.key === 'hinge')!.best).toBeGreaterThan(0);
    expect(scoreOf(8, 4).parts.find((p) => p.key === 'hinge')!.best).toBe(0);
  });

  it('is fair across bodyweights rather than a raw multiple', () => {
    // A plain "total ÷ bodyweight" flatters a light lifter and punishes a heavy
    // one, because strength does not scale linearly with mass. The published
    // curve is the whole reason for not doing that.
    const light = dotsCoefficient(60, 'male');
    const heavy = dotsCoefficient(120, 'male');
    expect(light).toBeGreaterThan(heavy);

    // …but not *so* much that the heavier lifter is written off.
    expect(heavy / light).toBeGreaterThan(0.5);
  });

  it('uses a different reference per sex, with unspecified between them', () => {
    const male = dotsCoefficient(80, 'male');
    const female = dotsCoefficient(80, 'female');
    const neither = dotsCoefficient(80, 'unspecified');

    expect(female).toBeGreaterThan(male);
    expect(neither).toBeGreaterThan(male);
    expect(neither).toBeLessThan(female);
  });

  it('reads the same whichever unit you happen to use', () => {
    // 100 kg is 220.46 lb, and the score is a property of the training, not of
    // the label on the plates.
    const kg = strengthAt(index(build(fullWeek(100), [body(80, thisWeek)])), thisWeek, {
      unit: 'kg',
      sex: 'male',
    });
    const lb = strengthAt(
      index(build(fullWeek(100 * 2.2046226218), [body(80 * 2.2046226218, thisWeek)])),
      thisWeek,
      { unit: 'lb', sex: 'male' },
    );

    expect(lb.index).toBe(kg.index);
  });

  it('counts a movement you have not trained as zero', () => {
    // Coverage is half the method, so a week of nothing but squats should not
    // score like a week that touched everything.
    const all = strengthAt(index(build(fullWeek(), [body(80, thisWeek)])), thisWeek, {
      unit: 'kg',
      sex: 'male',
    });
    const one = strengthAt(
      index(build([set('squat', 100, addDays(thisWeek, 1))], [body(80, thisWeek)])),
      thisWeek,
      { unit: 'kg', sex: 'male' },
    );

    expect(one.index!).toBeLessThan(all.index!);
    expect(one.parts.filter((p) => p.best === 0)).toHaveLength(SCORED_PATTERNS.length - 1);
  });

  it('says nothing rather than guessing when bodyweight is unknown', () => {
    // The score is a ratio. Inventing the denominator would invent the answer.
    const point = strengthAt(index(build(fullWeek(), [])), thisWeek, {
      unit: 'kg',
      sex: 'male',
    });
    expect(point.index).toBeNull();
    expect(point.bodyWeight).toBeNull();
  });

  it('stops counting a lift you have not repeated in months', () => {
    // It is meant to describe what you can do now. A squat from last spring is
    // not strength you still have.
    const old = addDays(thisWeek, -7 * 12);
    const stale = strengthAt(index(build(fullWeek(100, old), [body(80, old)])), thisWeek, {
      unit: 'kg',
      sex: 'male',
    });
    expect(stale.index).toBeNull();

    // The same lift inside the window does count.
    const recent = addDays(thisWeek, -7 * 3);
    const fresh = strengthAt(index(build(fullWeek(100, recent), [body(80, recent)])), thisWeek, {
      unit: 'kg',
      sex: 'male',
    });
    expect(fresh.index).toBeGreaterThan(0);
  });

  it('goes up when the lifts go up and down when bodyweight does not explain it', () => {
    const lighter = strengthAt(index(build(fullWeek(100), [body(80, thisWeek)])), thisWeek, {
      unit: 'kg',
      sex: 'male',
    });
    const heavier = strengthAt(index(build(fullWeek(120), [body(80, thisWeek)])), thisWeek, {
      unit: 'kg',
      sex: 'male',
    });
    expect(heavier.index!).toBeGreaterThan(lighter.index!);
  });
});

/**
 * The DOTS score, which is the only number in this app that means anything to
 * anybody but its owner.
 *
 * That is the whole reason it is strict and narrow. It used to be neither: the
 * app fed a five-pattern sum into a curve fitted to the three-lift powerlifting
 * total, which is a ratio between two quantities that do not measure the same
 * thing. These tests are mostly about keeping the definition closed.
 *
 * The expected values here were verified outside this codebase, against the
 * OpenPowerlifting reference implementation and against live scores from it, so
 * a failure means one of the coefficient, the window or the estimator moved —
 * not that the expectation needs adjusting to match.
 */
describe('DOTS', () => {
  const snap = seedSnapshot('sevenPattern', 3);
  const thisWeek = mondayOf(new Date());
  const day = addDays(thisWeek, 1);

  let d = 0;
  const lift = (name: string, weight: number, date = day): SetLog => ({
    id: `d-${++d}`,
    updatedAt: date,
    deletedAt: null,
    date,
    session: 'A',
    exerciseId: snap.exercises.find((e) => e.name === name)!.id,
    setNo: 1,
    weight,
    reps: 5,
    rir: 0,
    note: '',
  });

  const bw = (weight: number, date: string): BodyLog => ({
    id: `bw-${weight}-${date}`,
    updatedAt: date,
    deletedAt: null,
    date,
    weight,
    note: '',
  });

  const meet = (weights: number[] = [150, 100, 180]) =>
    COMPETITION_LIFTS.map((name, i) => lift(name, weights[i]!));

  const scoreOf = (logs: SetLog[], who: Partial<StrengthOf> = {}, body = 83) =>
    dotsAt(index({ ...snap, logs, bodyLogs: [bw(body, thisWeek)] }), thisWeek, {
      unit: 'kg',
      sex: 'male',
      ...who,
    });

  it('agrees with the published arithmetic', () => {
    /* 150, 100 and 180 for five at nothing-left estimate to 175, 116.7 and 210,
       a total of 501.7. The male DOTS polynomial at 83 kg evaluates to
       740.6449, so the coefficient is 0.6750874 and the score is 339. */
    expect(dotsCoefficient(83, 'male')).toBeCloseTo(0.6750874, 7);
    expect(scoreOf(meet()).total).toBeCloseTo(501.7, 1);
    expect(scoreOf(meet()).score).toBe(339);
  });

  it('lands on the anchors a public calculator would give', () => {
    // Two figures checkable against any DOTS calculator: a 450 kg total at
    // 83 kg scores 304, and 500 DOTS is a 740.6 kg total at that bodyweight
    // (which is the polynomial's own value, since score = total x 500/P(bw)).
    expect(Math.round(450 * dotsCoefficient(83, 'male'))).toBe(304);
    expect(500 / dotsCoefficient(83, 'male')).toBeCloseTo(740.6, 1);
  });

  it('records what the old score was inflating by', () => {
    /* Not a regression test — a record of why this file exists. The
       five-pattern sum the app used to feed DOTS came to about 650 kg where a
       real total was 450, so the headline number ran 44% above the lifter's
       actual DOTS for no reason but counting more lifts.

       The inflation is exactly 4/9 and bodyweight-independent, because the
       coefficient cancels. That is what makes it a property of the method
       rather than of one lifter. */
    const real = 450 * dotsCoefficient(83, 'male');
    const inflated = 650 * dotsCoefficient(83, 'male');
    expect(Math.round(real)).toBe(304);
    expect(Math.round(inflated)).toBe(439);
    expect(inflated / real - 1).toBeCloseTo(4 / 9, 10);
    // Bodyweight-independent, on a different bodyweight and the other curve.
    const other = (t: number) => t * dotsCoefficient(57, 'female');
    expect(other(650) / other(450) - 1).toBeCloseTo(4 / 9, 10);
  });

  it('is null until all three lifts are there', () => {
    /* A total missing a lift is not a smaller total, it is not a total. Scoring
       two lifts would report somebody who has never benched as weak rather than
       as unmeasured — and would stop agreeing with the calculator. */
    for (let skip = 0; skip < 3; skip++) {
      const partial = meet().filter((_, i) => i !== skip);
      expect(scoreOf(partial).score).toBeNull();
      expect(scoreOf(partial).total).toBeNull();
      // The lifts that were done are still reported, so the screen can say
      // which one is missing rather than only that something is.
      expect(scoreOf(partial).lifts.filter((l) => l.best > 0)).toHaveLength(2);
    }
  });

  it('refuses a lift that is not the competition lift', () => {
    /* A front squat is not a competition squat and a trap bar is not a
       competition deadlift. Both are good lifts; neither is what the curve was
       fitted to, and accepting one would break the only property this number
       has.

       Worth stating that this strictness is ours rather than the formula's —
       DOTS itself will scale any total you hand it, which is precisely how a
       number stays arithmetically correct and stops meaning anything. */
    const substituted = [
      lift('Barbell Front Squat', 150),
      lift('Barbell Bench Press', 100),
      lift('Trap Bar Deadlift', 180),
    ];
    expect(scoreOf(substituted).score).toBeNull();
    expect(scoreOf(substituted).lifts.filter((l) => l.best > 0)).toHaveLength(1);
  });

  it('is not moved by anything outside the three lifts', () => {
    // The category error as a test: a hard lunge and a heavy row must not touch
    // a powerlifting total, however much they belong in the week.
    const alone = scoreOf(meet()).score;
    const withExtras = scoreOf([...meet(), lift('Walking Lunge', 60), lift('Barbell Row', 100)]);
    expect(withExtras.score).toBe(alone);
  });

  it('carries no age allowance, unlike our own index', () => {
    /* The deliberate split, and the one verified against outside sources
       directly: plain DOTS is a function of total, bodyweight and sex and
       nothing else, masters coefficients are a separate multiplier, and public
       calculators do not ask for age. Applying one here would put us ~34% out
       at 60 against anything somebody checks us with. */
    expect(scoreOf(meet(), { birthYear: 1950 }).score).toBe(
      scoreOf(meet(), { birthYear: 2000 }).score,
    );

    // …while the index, which is ours and comparable to nobody, does carry it.
    const idxAt = (birthYear: number) =>
      strengthAt(index({ ...snap, logs: meet(), bodyLogs: [bw(83, thisWeek)] }), thisWeek, {
        unit: 'kg',
        sex: 'male',
        birthYear,
      }).index!;
    expect(idxAt(1950)).toBeGreaterThan(idxAt(2000));
  });

  it('reads the same whichever unit the plates are labelled in', () => {
    // Both inputs have to be converted, not just the total — a pounds caller
    // whose bodyweight stayed in pounds would land on the wrong coefficient.
    const LB = 2.2046226218;
    const inLb = dotsAt(
      index({
        ...snap,
        logs: meet([150 * LB, 100 * LB, 180 * LB]),
        bodyLogs: [bw(83 * LB, thisWeek)],
      }),
      thisWeek,
      { unit: 'lb', sex: 'male' },
    );
    expect(inLb.score).toBe(scoreOf(meet()).score);
  });

  it('only ever sees numbers that are actually masses', () => {
    /* Enforced rather than assumed. A stack setting is not a kilogram — the
       measured resistance at a machine's handle swings from -48% to +70% across
       one stroke — so nothing of that kind may reach the one figure here that
       compares two people. Adding a fourth lift, or swapping one for a machine
       or landmine variant, fails here. */
    expect(competitionLiftsAreMasses()).toBe(true);
    expect(COMPETITION_LIFTS).toHaveLength(3);
  });
});

describe('gymmy own index', () => {
  const snap = seedSnapshot('sevenPattern', 3);
  const thisWeek = mondayOf(new Date());

  const bw = (weight: number): BodyLog => ({
    id: `ibw-${weight}`,
    updatedAt: thisWeek,
    deletedAt: null,
    date: thisWeek,
    weight,
    note: '',
  });

  let i = 0;
  const forPattern = (key: PatternKey, weight: number): SetLog => ({
    id: `i-${++i}`,
    updatedAt: thisWeek,
    deletedAt: null,
    date: addDays(thisWeek, 1),
    session: 'A',
    exerciseId: snap.exercises.find(
      (e) => e.patternId === snap.patterns.find((p) => p.key === key)!.id,
    )!.id,
    setNo: 1,
    weight,
    reps: 5,
    rir: 0,
    note: '',
  });

  const idxOf = (weight: number, body: number) =>
    strengthAt(
      index({
        ...snap,
        logs: SCORED_PATTERNS.map((k) => forPattern(k, weight)),
        bodyLogs: [bw(body)],
      }),
      thisWeek,
      { unit: 'kg', sex: 'male' },
    ).index!;

  it('scales bodyweight by two-thirds, not by one', () => {
    /* The replacement for DOTS on this number, and the reason it is a different
       quantity rather than a rebranded one. Doubling bodyweight with the same
       lifts divides the index by 2^(2/3) = 1.587, not by 2 — which is the whole
       point of an allometric exponent. A plain multiple would punish a heavy
       lifter for existing. */
    expect(ALLOMETRIC_EXPONENT).toBeCloseTo(0.6667, 4);
    expect(idxOf(100, 80) / idxOf(100, 160)).toBeCloseTo(2 ** ALLOMETRIC_EXPONENT, 2);
    expect(idxOf(100, 80) / idxOf(100, 160)).toBeLessThan(2);
  });

  it('does not touch the DOTS curve at all', () => {
    /* The bug this file was split to fix. If the index still ran through
       `dotsCoefficient`, its ratio across two bodyweights would follow that
       curve rather than the exponent. They must not agree. */
    const viaDots = dotsCoefficient(80, 'male') / dotsCoefficient(160, 'male');
    expect(idxOf(100, 80) / idxOf(100, 160)).not.toBeCloseTo(viaDots, 2);
  });

  it('is an obviously different size from a DOTS score', () => {
    /* Not cosmetic. The two sit on the same screen, and two three-digit numbers
       that mean different things get read as the same number twice. A DOTS is
       in the hundreds; the index is in the tens, with a decimal. */
    expect(idxOf(100, 83)).toBeLessThan(100);
    expect(Math.round(450 * dotsCoefficient(83, 'male'))).toBeGreaterThan(100);
  });
});
