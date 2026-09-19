import { describe, expect, it } from 'vitest';
import {
  ALLOMETRIC_EXPONENT,
  COMPETITION_LIFTS,
  SCORED_PATTERNS,
  addDays,
  ageFactor,
  ageInWeek,
  competitionLiftsAreMasses,
  dotsAt,
  dotsCoefficient,
  index,
  mondayOf,
  strengthAt,
  strengthSeries,
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

    expect(honest.index).not.toBeNull();
    expect(withMetcon.index).toBe(honest.index);
    // The 5-rep day's estimate, not the 30-rep set's 200.
    expect(withMetcon.parts.find((p) => p.key === 'hinge')!.best).toBe(163.3);
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

  it('is the same number whatever sex the profile says', () => {
    // Sex is asked for DOTS and only DOTS. The index compares you with nobody,
    // so it has no curve to pick, and "prefer not to say" must not cost
    // somebody the one number that never needed the answer.
    const ix = index(build(fullWeek(), [body(80, thisWeek)]));
    const idx = (['male', 'female', 'unspecified'] as const).map(
      (sex) => strengthAt(ix, thisWeek, { unit: 'kg', sex }).index,
    );
    expect(idx[0]).not.toBeNull();
    expect(new Set(idx).size).toBe(1);
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

  it('looks back eight weeks exactly: the Monday seven weeks back, and not the Sunday before', () => {
    /* It is meant to describe what you can do now. A squat from last spring is
       not strength you still have. Pinned on both sides of the edge rather than
       at "three weeks in, twelve out", which any window from four weeks to
       eleven passed. The scored week is one of the eight, so the window opens
       on the Monday seven weeks back (day −49); the Sunday before it (day −50)
       is a ninth week. It used to count, and every document said eight
       (GYM-46). */
    const idxAt = (d: number) =>
      strengthAt(
        index(build(fullWeek(100, addDays(thisWeek, d)), [body(80, addDays(thisWeek, d))])),
        thisWeek,
        { unit: 'kg', sex: 'male' },
      ).index;
    expect(idxAt(-49)).not.toBeNull();
    expect(idxAt(-50)).toBeNull();
  });

  it('goes up when the lifts go up at the same bodyweight', () => {
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

  it('is not moved by a carry or a rotation', () => {
    /* Only the five loaded patterns are scored. A carry's "reps" are metres and
       rotation is trained light on purpose, so an estimate from either says
       nothing about strength. Every other test here builds its data from
       SCORED_PATTERNS, so adding a pattern to that list passed them all. */
    const byName = (name: string, weight: number, reps: number): SetLog => ({
      ...set('squat', weight, addDays(thisWeek, 1)),
      exerciseId: snap.exercises.find((e) => e.name === name)!.id,
      reps,
    });
    const who = { unit: 'kg', sex: 'male' } as const;
    const base = strengthAt(index(build(fullWeek(), [body(80, thisWeek)])), thisWeek, who);
    const extra = strengthAt(
      index(
        build(
          [...fullWeek(), byName('Russian Twist', 20, 8), byName("Farmer's Carry", 100, 8)],
          [body(80, thisWeek)],
        ),
      ),
      thisWeek,
      who,
    );
    expect(extra.index).toBe(base.index);
    expect(base.parts.map((p) => p.key)).toEqual(['squat', 'hinge', 'lunge', 'push', 'pull']);
  });

  it('divides each week by what you weighed that week, not since', () => {
    /* A later weigh-in must not rescore an earlier week, for the same reason a
       split change does not. Every other test puts its bodyweight at or before
       the week it scores, so reading the latest weigh-in whatever its date
       passed them all. */
    const W0 = addDays(thisWeek, -14);
    const bodies = [body(80, W0), body(100, addDays(W0, 14))];
    const s = strengthSeries(index(build(fullWeek(100, addDays(W0, 1)), bodies)), W0, 3, {
      unit: 'kg',
      sex: 'male',
    });
    expect(s.map((p) => p.bodyWeight)).toEqual([80, 80, 100]);
    expect(s[0]!.index!).toBeGreaterThan(s[2]!.index!);
  });

  it('allows for age, at the age you were that week', () => {
    /* The allowance starts at 40, follows the anchors in between and stops
       rising at 90. A week is scored at the age you were in it: today's age
       would restate every past week on each birthday, which is the retroactive
       rewrite the temporal rule forbids. Before this, only "1950 scores above
       2000" guarded any of it, and every rising curve passes that. */
    expect(ageFactor(null)).toBe(1);
    expect(ageFactor(39)).toBe(1);
    expect(ageFactor(40)).toBe(1);
    expect(ageFactor(45)).toBeCloseTo(1.065, 6);
    expect(ageFactor(50)).toBeCloseTo(1.13, 6);
    expect(ageFactor(90)).toBe(2.6);
    expect(ageFactor(95)).toBe(2.6);

    expect(ageInWeek(null, '2026-01-05')).toBeNull();
    expect(ageInWeek(1976, '2025-12-29')).toBe(49);
    expect(ageInWeek(1976, '2026-01-05')).toBe(50);

    // Across a new year, only the week in the new year gets the older allowance.
    const s = strengthSeries(
      index(build(fullWeek(100, '2025-12-16'), [body(80, '2025-12-15')])),
      '2025-12-22',
      3,
      { unit: 'kg', sex: 'male', birthYear: 1976 },
    );
    expect(s[0]!.index).not.toBeNull();
    expect(s[1]!.index).toBe(s[0]!.index);
    expect(s[2]!.index!).toBeGreaterThan(s[1]!.index!);
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
       740.6449, so the coefficient is 0.6750874 and the score is 339.

       Two more figures any DOTS calculator will confirm: a 450 kg total at
       83 kg scores 304, and 500 DOTS at 83 kg is a 740.6 kg total. */
    expect(dotsCoefficient(83, 'male')).toBeCloseTo(0.6750874, 7);
    expect(scoreOf(meet()).total).toBeCloseTo(501.7, 1);
    expect(scoreOf(meet()).score).toBe(339);
  });

  it('uses the published curve for each sex', () => {
    /* The female polynomial was pinned nowhere: a typo in one of its
       coefficients passed the whole suite. 500 over the female curve at 57 kg
       is 1.1456952. "Prefer not to say" has no curve of its own: the type
       refuses it, and `dotsAt` answers `missing: 'sex'`, tested with the rest
       of `missing`. */
    expect(dotsCoefficient(80, 'female')).toBeGreaterThan(dotsCoefficient(80, 'male'));
    expect(dotsCoefficient(57, 'female')).toBeCloseTo(1.1456952, 6);
  });

  it('coefficient falls with bodyweight, but less steeply than a raw multiple', () => {
    // A plain "total ÷ bodyweight" flatters a light lifter and punishes a heavy
    // one, because strength does not scale linearly with mass. The published
    // curve is the whole reason for not doing that.
    const light = dotsCoefficient(60, 'male');
    const heavy = dotsCoefficient(120, 'male');
    expect(light).toBeGreaterThan(heavy);

    // …but not *so* much that the heavier lifter is written off.
    expect(heavy / light).toBeGreaterThan(0.5);
  });

  it('holds bodyweight inside the range the curve was fitted to', () => {
    /* Outside 40-210 kg (men) and 40-150 kg (women) the polynomial misbehaves:
       unclamped, the female coefficient at 250 kg is 2.73 against 0.77, so an
       implausible bodyweight would nearly quadruple the score. */
    expect(dotsCoefficient(200, 'female')).toBe(dotsCoefficient(150, 'female'));
    expect(dotsCoefficient(250, 'male')).toBe(dotsCoefficient(210, 'male'));
    expect(dotsCoefficient(30, 'male')).toBe(dotsCoefficient(40, 'male'));
    expect(scoreOf(meet(), { sex: 'female' }, 250).score).toBe(
      scoreOf(meet(), { sex: 'female' }, 150).score,
    );
  });

  it('looks back over the same eight weeks as the index', () => {
    // Both sides of the edge, as in the index's own window test: day −49 is the
    // first day of the eight weeks, day −50 the last day of a ninth.
    const at = (d: number) => {
      const date = addDays(thisWeek, d);
      const logs = COMPETITION_LIFTS.map((name, i) => lift(name, [150, 100, 180][i]!, date));
      return dotsAt(index({ ...snap, logs, bodyLogs: [bw(83, date)] }), thisWeek, {
        unit: 'kg',
        sex: 'male',
      }).missing;
    };
    expect(at(-49)).toBeNull();
    expect(at(-50)).toBe('lifts');
  });

  it('reads the bodyweight of the week it scores, not a later one', () => {
    // The DOTS half of the index's "what you weighed that week" test.
    const W0 = addDays(thisWeek, -14);
    const logs = COMPETITION_LIFTS.map((name, i) =>
      lift(name, [150, 100, 180][i]!, addDays(W0, 1)),
    );
    const ix = index({ ...snap, logs, bodyLogs: [bw(80, W0), bw(100, addDays(W0, 14))] });
    expect(dotsAt(ix, W0, { unit: 'kg', sex: 'male' }).bodyWeight).toBe(80);
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
       or landmine variant, fails here. And all three are `barbell`: recorded
       bar included, exactly as a meet weighs them, because this is the one
       score whose convention has to match the sport's. */
    expect(competitionLiftsAreMasses()).toBe(true);
    expect(COMPETITION_LIFTS).toHaveLength(3);
  });

  describe('when there is no score, it says which thing is missing', () => {
    it('gives no score without a sex answer, rather than a midpoint no calculator makes', () => {
      /* Every account starts at "prefer not to say", and onboarding never asks,
         so the midpoint of the two curves was quietly the default: at 83 kg it
         read 18% above a man's real DOTS and 14% below a woman's. A DOTS that
         cannot be checked has lost the one property it exists to have. */
      const point = scoreOf(meet(), { sex: 'unspecified' });
      expect(point.score).toBeNull();
      expect(point.missing).toBe('sex');
      // Everything else was there — the total is still reported.
      expect(point.total).toBeCloseTo(501.7, 1);
    });

    it('tells a lift trained too light to estimate apart from one never trained', () => {
      /* Found by review. A bench done only at twelve reps with two in reserve
         is above the ceiling, so it produces no estimate — and the screen said
         "still missing: Barbell Bench Press" to somebody who benched that week.
         Trained and estimable are two facts, and they get two sentences. */
      const lightBench = [
        lift('Barbell Back Squat', 150),
        { ...lift('Barbell Bench Press', 60), reps: 12, rir: 2 },
        lift('Conventional Deadlift', 180),
      ];
      const point = scoreOf(lightBench);
      expect(point.missing).toBe('estimate');
      const bench = point.lifts.find((l) => l.name === 'Barbell Bench Press')!;
      expect(bench.trained).toBe(true);
      expect(bench.best).toBe(0);

      // Never trained at all is the other case, and it outranks this one.
      const noBench = [lift('Barbell Back Squat', 150), lift('Conventional Deadlift', 180)];
      expect(scoreOf(noBench).missing).toBe('lifts');
      expect(scoreOf(noBench).lifts.find((l) => l.name === 'Barbell Bench Press')!.trained).toBe(
        false,
      );
    });

    it('asks for the lifts first, then a heavier set, then bodyweight, then sex', () => {
      /* The screen shows one sentence from `missing`, so its order is the order
         somebody is asked. Every other case here has bodyweight on record, so
         the order among the four was not pinned: each of them missing at once,
         one step at a time. */
      const noBody = (logs: SetLog[], sex: StrengthOf['sex'] = 'male') =>
        dotsAt(index({ ...snap, logs, bodyLogs: [] }), thisWeek, { unit: 'kg', sex }).missing;
      const lightBench = meet().map((l, i) => (i === 1 ? { ...l, reps: 12, rir: 2 } : l));

      expect(noBody(meet().slice(0, 2))).toBe('lifts');
      expect(noBody(lightBench)).toBe('estimate');
      expect(noBody(meet(), 'unspecified')).toBe('bodyweight');
      expect(noBody(meet())).toBe('bodyweight');
      expect(scoreOf(meet()).missing).toBeNull();
    });
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
       in the hundreds; the index is in the tens, with a decimal. Both numbers
       come from the same training here, so this holds for what the screen
       shows rather than for a figure worked out by hand. */
    const logs = COMPETITION_LIFTS.map((name, k) => ({
      ...forPattern('squat', [150, 100, 180][k]!),
      exerciseId: snap.exercises.find((e) => e.name === name)!.id,
    }));
    const ix = index({ ...snap, logs, bodyLogs: [bw(83)] });
    const who = { unit: 'kg', sex: 'male' } as const;
    expect(strengthAt(ix, thisWeek, who).index!).toBeLessThan(100);
    const dots = dotsAt(ix, thisWeek, who).score!;
    expect(dots).toBeGreaterThanOrEqual(100);
    expect(Number.isInteger(dots)).toBe(true);
  });
});
