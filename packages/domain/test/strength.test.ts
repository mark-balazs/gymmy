import { describe, expect, it } from 'vitest';
import {
  dotsCoefficient,
  index,
  mondayOf,
  addDays,
  strengthAt,
  SCORED_PATTERNS,
} from '../src/model';
import type { BodyLog, PatternKey, SetLog, Snapshot } from '../src/types';
import { seedSnapshot } from './fixture';

/**
 * The strength score is the one number in the app that compares you to a
 * reference rather than to yourself, so the properties it must hold are worth
 * pinning down: it has to be fair across bodyweights, honest about what it has
 * not seen, and completely indifferent to which unit you happen to read in.
 */
describe('strength score', () => {
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

    expect(withMetcon.score).toBe(honest.score);

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

    expect(lb.score).toBe(kg.score);
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

    expect(one.score!).toBeLessThan(all.score!);
    expect(one.parts.filter((p) => p.best === 0)).toHaveLength(SCORED_PATTERNS.length - 1);
  });

  it('says nothing rather than guessing when bodyweight is unknown', () => {
    // The score is a ratio. Inventing the denominator would invent the answer.
    const point = strengthAt(index(build(fullWeek(), [])), thisWeek, {
      unit: 'kg',
      sex: 'male',
    });
    expect(point.score).toBeNull();
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
    expect(stale.score).toBeNull();

    // The same lift inside the window does count.
    const recent = addDays(thisWeek, -7 * 3);
    const fresh = strengthAt(index(build(fullWeek(100, recent), [body(80, recent)])), thisWeek, {
      unit: 'kg',
      sex: 'male',
    });
    expect(fresh.score).toBeGreaterThan(0);
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
    expect(heavier.score!).toBeGreaterThan(lighter.score!);
  });
});
