import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  EVIDENCE,
  GOAL_HORIZONS,
  MAX_LIVE_GOALS,
  MIN_DISTANCE,
  addDays,
  checkGoal,
  goalProgress,
  growingExercises,
  isLive,
  liveGoals,
  outcomeOf,
  recentGainOf,
  suggestBaseline,
  type Goal,
  type GoalOutcome,
  type GoalRequest,
  type SetLog,
} from '../src';
import { index } from '../src/model';
import { seedSnapshot } from './fixture';

const snap = seedSnapshot();
const bench = snap.exercises[0]!;

const goal = (over: Partial<Goal> = {}): Goal => ({
  id: 'g1',
  updatedAt: '2026-07-01T00:00:00.000Z',
  deletedAt: null,
  exerciseId: bench.id,
  baseline: 100,
  target: 110,
  startedOn: '2026-07-01',
  targetDate: '2026-10-01',
  retiredAt: null,
  ...over,
});

/**
 * A single all-out rep that estimates to exactly `e1rm`.
 *
 * Goals are set in estimated one-rep maxes, and Epley never returns the bar
 * weight even for one rep — a single rep at RIR 0 estimates 3.3% above it. So
 * the fixture works backwards from the number the goal is written in, rather
 * than quietly testing against a figure 3% off the one in the assertion.
 */
const log = (date: string, e1rm: number): SetLog => ({
  id: `l-${date}-${e1rm}`,
  updatedAt: `${date}T12:00:00.000Z`,
  deletedAt: null,
  exerciseId: bench.id,
  date,
  session: 'A',
  setNo: 1,
  weight: (e1rm * 30) / 31,
  reps: 1,
  rir: 0,
  note: '',
});

const ixWith = (over: { logs?: SetLog[]; goals?: Goal[] }) =>
  index({ ...snap, logs: over.logs ?? [], goals: over.goals ?? [] });

const request = (over: Partial<GoalRequest> = {}): GoalRequest => ({
  baseline: 100,
  target: 110,
  startedOn: '2026-07-01',
  targetDate: '2026-10-01',
  liveCount: 0,
  ownRecentGain: null,
  ...over,
});

describe('the permission a goal grants', () => {
  it('runs until its date and then stops, without being renewed', () => {
    /* The resting state is silence, and it has to be deliberately interrupted
       rather than deliberately restored. A goal nobody thought about again
       expires and the app goes quiet on that lift by itself. */
    const g = goal({ targetDate: '2026-10-01' });
    expect(isLive(g, '2026-09-30')).toBe(true);
    expect(isLive(g, '2026-10-01')).toBe(true); // The last day still counts.
    expect(isLive(g, '2026-10-02')).toBe(false);
  });

  it('stops the moment it is retired, whatever the date says', () => {
    const g = goal({ retiredAt: '2026-08-01T00:00:00.000Z' });
    expect(isLive(g, '2026-08-02')).toBe(false);
  });

  it('names the lifts the app may judge, and nothing else', () => {
    const ix = ixWith({ goals: [goal()] });
    /* By canonical id. The fixture's rows are an account's pre-catalogue rows,
       and the set holds the ids `index()` reads them as — so comparing against
       the raw id would not merely fail here, it would make the next line pass
       whatever the code did: a raw id is never in a set of canonical ones. */
    expect([...growingExercises(ix, '2026-09-14')]).toEqual([ix.exerciseIdOf(bench.id)]);
    // The second exercise is trained just as hard and was never volunteered.
    expect(growingExercises(ix, '2026-09-14').has(ix.exerciseIdOf(snap.exercises[1]!.id))).toBe(
      false,
    );
    // And after the date, nothing at all.
    expect(growingExercises(ix, '2026-11-01').size).toBe(0);
  });

  it('keeps expired goals rather than deleting them', () => {
    // They are what the app has to look back on to say how a goal went.
    const ix = ixWith({ goals: [goal({ targetDate: '2026-08-01' })] });
    expect(ix.goals).toHaveLength(1);
    expect(liveGoals(ix, '2026-09-14')).toEqual([]);
  });
});

describe('goalProgress', () => {
  it('measures from the day the goal was set, not from all history', () => {
    /* Somebody who benched 120 in March and set a goal from 100 in July has
       not already finished. The old lift is real and it is not this goal. */
    const ix = ixWith({ logs: [log('2026-03-02', 120), log('2026-07-08', 102)] });
    const p = goalProgress(goal(), ix, '2026-09-14');
    expect(p.current).toBe(102);
    expect(p.achieved).toBe(false);
  });

  it('never reads as going backwards from its own baseline', () => {
    // No sessions since it was set, so there is nothing to show but the
    // starting point. A negative share would be the app inventing a decline.
    const p = goalProgress(goal(), ixWith({}), '2026-09-14');
    expect(p.current).toBe(100);
    expect(p.share).toBe(0);
  });

  it('holds a small change apart from the noise of retesting the same lift', () => {
    /* The most useful number in the file. A repeated one-rep max moves about
       4.2% on its own, so 103 out of 110 is not progress that happened — and
       the card must not imply it while the real thing looks identical. */
    const barely = goalProgress(goal(), ixWith({ logs: [log('2026-08-01', 103)] }), '2026-09-14');
    expect(barely.share).toBeGreaterThan(0);
    expect(barely.moved).toBe(false);

    const really = goalProgress(goal(), ixWith({ logs: [log('2026-08-01', 106)] }), '2026-09-14');
    expect(really.moved).toBe(true);

    // 4.5% is past the retest CV and short of the 5% goal floor, and it is the
    // CV that decides. 103 and 106 fall on the same side of both.
    const between = goalProgress(
      goal(),
      ixWith({ logs: [log('2026-08-01', 104.5)] }),
      '2026-09-14',
    );
    expect(between.moved).toBe(true);

    // Which is to say: the threshold is the published CV, not a round number.
    expect(EVIDENCE.retestCv).toBeCloseTo(0.042);
  });

  it('counts the target as reached whatever the date says', () => {
    const p = goalProgress(goal(), ixWith({ logs: [log('2026-07-20', 112)] }), '2026-09-14');
    expect(p.achieved).toBe(true);
    expect(p.daysLeft).toBeGreaterThan(0);
  });

  it('reports the days left, and keeps counting once they run out', () => {
    expect(goalProgress(goal(), ixWith({}), '2026-09-14').daysLeft).toBe(17);
    expect(goalProgress(goal(), ixWith({}), '2026-10-08').daysLeft).toBe(-7);
  });
});

describe('the guardrails', () => {
  it('refuses a target too small to be told from noise', () => {
    // 103 from 100 is inside the 4.2% retest CV: reaching it would prove
    // nothing, and the app would be congratulating somebody for a Tuesday.
    const check = checkGoal(request({ target: 103 }));
    expect(check.allowed).toBe(false);
    expect(check.reason).toBe('tooSmall');
    // And it offers something that would work instead, rather than just no.
    expect(check.suggestedTarget).toBeGreaterThanOrEqual(105);
  });

  it('accepts the smallest target that clears the noise', () => {
    expect(checkGoal(request({ target: 105 })).allowed).toBe(true);
  });

  it('never offers a target it would then refuse', () => {
    /* The goal sheet opens on `suggestedTarget` and the "too small" line offers
       it too. Rounded to the nearest 0.5 it fell under +5% about half the
       time — 101 offered 106 — and the app refused its own number. So: up to
       the sheet's step, and no further. One step lower must be refused, or the
       app is asking for more than the rule needs. */
    const offered = (baseline: number) =>
      checkGoal(request({ baseline, target: 0 })).suggestedTarget;
    for (const baseline of [100, 101, 41, 57.3, 20.1]) {
      const target = offered(baseline);
      const check = checkGoal(request({ baseline, target }));
      expect(check.allowed, `${baseline} → ${target}`).toBe(true);
      expect(check.reason, `${baseline} → ${target}`).toBeNull();
      expect(checkGoal(request({ baseline, target: target - 0.5 })).reason).toBe('tooSmall');
    }
    expect([100, 101, 41, 57.3, 20.1].map(offered)).toEqual([105, 106.5, 43.5, 60.5, 21.5]);

    // Every baseline the app can produce (one decimal) up to 300, not only the
    // five that were caught.
    for (let tenths = 10; tenths <= 3000; tenths++) {
      const baseline = tenths / 10;
      expect(
        checkGoal(request({ baseline, target: offered(baseline) })).allowed,
        `${baseline}`,
      ).toBe(true);
    }
  });

  it('never warns about the target it offers, and still warns one step above', () => {
    /* The owner, 2026-09-19: "The target the app fills in never shows the
       warning. If you change it to something higher yourself, the warning
       still appears." Rounding the offer up to the sheet's 0.5 step carries a
       light lift past the warning line, so the sheet warned about its own
       number. */
    const ask = (baseline: number, weeks: number, gain: number | null, target: number) =>
      checkGoal(
        request({
          baseline,
          target,
          targetDate: addDays('2026-07-01', 7 * weeks),
          ownRecentGain: gain,
        }),
      );
    const offered = (baseline: number, weeks: number, gain: number | null) =>
      ask(baseline, weeks, gain, 0).suggestedTarget;

    // 13 with no history: the offer is 14, +7.7% against a 7.5% line.
    expect(offered(13, 12, null)).toBe(14);
    expect(ask(13, 12, null, 14).warning).toBeNull();
    expect(ask(13, 12, null, 14.5).warning).toBe('ambitious');
    // 9.5 gaining 20% in six months, over eight weeks: the line is 9.2% and
    // the offer 10.5 is +10.5%.
    expect(offered(9.5, 8, 0.2)).toBe(10.5);
    expect(ask(9.5, 8, 0.2, 10.5).warning).toBeNull();
    expect(ask(9.5, 8, 0.2, 11).warning).toBe('ambitious');

    // The round trip's baselines plus light ones, on every horizon the sheet
    // offers, with no history, a flat one and a fast one.
    for (const baseline of [100, 101, 41, 57.3, 20.1, 13, 9.5]) {
      for (const weeks of GOAL_HORIZONS) {
        for (const gain of [null, 0, 0.05, 0.2]) {
          const check = ask(baseline, weeks, gain, offered(baseline, weeks, gain));
          const label = `${baseline} over ${weeks} weeks, gain ${gain}`;
          expect(check.allowed, label).toBe(true);
          expect(check.warning, label).toBeNull();
        }
      }
    }

    /* Every one-decimal baseline to 300 on the short horizons, with no
       history: the line sits at 1.5 × 5%. The offer never warns, and wherever
       it is past the line — so it used to warn — one step above it does. */
    const line = MIN_DISTANCE * 1.5;
    let heaviest = 0;
    for (let tenths = 10; tenths <= 3000; tenths++) {
      const baseline = tenths / 10;
      for (const weeks of [8, 12]) {
        const offer = offered(baseline, weeks, null);
        expect(ask(baseline, weeks, null, offer).warning, `${baseline}`).toBeNull();
        if ((offer - baseline) / baseline > line) {
          heaviest = baseline;
          expect(ask(baseline, weeks, null, offer + 0.5).warning, `${baseline} + 0.5`).toBe(
            'ambitious',
          );
        }
      }
    }
    // Only light lifts are affected, as training-model.md says.
    expect(heaviest).toBe(18.6);
  });

  it('refuses a run too short to accumulate anything', () => {
    /* Strength is added when a session goes well, not on a schedule — so the
       horizon has to hold enough good sessions for the increments to add up
       to more than the retest CV. Six weeks cannot. */
    const check = checkGoal(request({ targetDate: '2026-08-12' }));
    expect(check.allowed).toBe(false);
    expect(check.reason).toBe('tooShort');
  });

  it('draws the horizon at exactly eight and fifty-two weeks', () => {
    // Both documented edges, from a start of 2026-07-01. The cases above sit at
    // six weeks and sixty-one, which a threshold anywhere between passes. The
    // eight-week target is ambitious, so only `allowed` is asserted there.
    expect(checkGoal(request({ targetDate: '2026-08-25' })).reason).toBe('tooShort');
    expect(checkGoal(request({ targetDate: '2026-08-26' })).allowed).toBe(true);
    expect(checkGoal(request({ targetDate: '2027-06-30' })).allowed).toBe(true);
    expect(checkGoal(request({ targetDate: '2027-07-07' })).reason).toBe('tooLong');
  });

  it('refuses a horizon longer than a year', () => {
    const check = checkGoal(request({ targetDate: '2027-09-01', target: 130 }));
    expect(check.allowed).toBe(false);
    expect(check.reason).toBe('tooLong');
  });

  it('will not let you ask to be pushed on everything', () => {
    expect(checkGoal(request({ liveCount: MAX_LIVE_GOALS - 1 })).allowed).toBe(true);
    const full = checkGoal(request({ liveCount: MAX_LIVE_GOALS }));
    expect(full.allowed).toBe(false);
    expect(full.reason).toBe('tooMany');
  });

  it('warns about an ambitious target without refusing it', () => {
    /* 100 to 160 in three months is far beyond anything observed in a trained
       lifter. The app says so and still allows it: a goal somebody has
       rejected as not theirs performs worse than no goal at all, so the
       decision stays with the person who has to do the training. */
    const check = checkGoal(request({ target: 160 }));
    expect(check.allowed).toBe(true);
    expect(check.warning).toBe('ambitious');
    expect(check.reason).toBeNull();
    expect(check.impliedWeeklyPct).toBeGreaterThan(4);
  });

  it('judges ambition against this person, not against a population', () => {
    /* A novice adding 6% every six months and a ten-year lifter adding 1% are
       both normal, and no single threshold describes both. So the reference is
       their own trailing rate, doubled — a goal is allowed to be harder than
       the recent past. The identical request is fine for one and flagged for
       the other, which is the whole point. */
    const fast = checkGoal(request({ target: 125, ownRecentGain: 0.4 }));
    const slow = checkGoal(request({ target: 125, ownRecentGain: 0.01 }));
    expect(fast.warning).toBeNull();
    expect(slow.warning).toBe('ambitious');
    expect(slow.allowed).toBe(true);
  });

  it('does not draw an expected line and measure anybody against it', () => {
    /* The correction that matters most in this file. An earlier version gave
       every goal a linear pace and a "behind by" flag, and no major body
       publishes a percent-per-week rate of gain — every published figure is an
       increment applied after a session that went well. A field like that
       reappearing means the app has started inventing a standard again. */
    const p = goalProgress(goal(), ixWith({ logs: [log('2026-07-08', 101)] }), '2026-09-14');
    expect(Object.keys(p).sort()).toEqual(
      ['achieved', 'current', 'daysLeft', 'goal', 'moved', 'share'].sort(),
    );
  });
});

describe('what the app offers before you type anything', () => {
  it('starts the baseline from the recent past, not from a career best', () => {
    // Eight weeks, matching the strength score's window: a personal best from
    // two years ago is not where this block of training begins.
    const ix = ixWith({
      logs: [
        log('2024-05-01', 140),
        log('2026-08-06', 98),
        log('2026-08-13', 99),
        log('2026-08-20', 100),
      ],
    });
    expect(suggestBaseline(ix, bench.id, '2026-09-14')).toBe(100);
  });

  it('has no baseline to offer for a lift with no history', () => {
    expect(suggestBaseline(ixWith({}), bench.id, '2026-09-14')).toBe(0);
  });

  it('will not build a baseline on one session', () => {
    /* The same argument as the minimum distance, at the other end of the
       comparison. A single set carries the whole retest variation, so a goal
       5% above it can have its target inside the error bar of its own starting
       point — and the app would then hold somebody to it for a quarter. */
    const one = ixWith({ logs: [log('2026-08-20', 100)] });
    expect(suggestBaseline(one, bench.id, '2026-09-14')).toBe(0);

    const two = ixWith({ logs: [log('2026-08-13', 100), log('2026-08-20', 100)] });
    expect(suggestBaseline(two, bench.id, '2026-09-14')).toBe(0);

    const three = ixWith({
      logs: [log('2026-08-06', 100), log('2026-08-13', 100), log('2026-08-20', 100)],
    });
    expect(suggestBaseline(three, bench.id, '2026-09-14')).toBe(100);
  });

  it('counts sessions of this lift, not sessions in general', () => {
    // Three training days, one of them this lift. The other two say nothing
    // about where this lift is.
    const other = snap.exercises[1]!.id;
    const logs = [
      log('2026-08-06', 100),
      { ...log('2026-08-13', 100), exerciseId: other, id: 'o1' },
      { ...log('2026-08-20', 100), exerciseId: other, id: 'o2' },
    ];
    expect(suggestBaseline(ixWith({ logs }), bench.id, '2026-09-14')).toBe(0);
  });

  it('will not call fewer than six sessions a rate', () => {
    // Guessing one would put a number in front of somebody that the app made
    // up, and it is the number the ambition warning is measured against.
    const thin = ixWith({ logs: [log('2026-08-01', 100), log('2026-08-08', 105)] });
    expect(recentGainOf(thin, bench.id, '2026-09-14')).toBeNull();

    // One short of the six the next test reads a rate from: two sessions
    // refused and six accepted let any threshold from three to six through.
    const five = [100, 100, 100, 110, 110].map((w, i) =>
      log(`2026-0${6 + Math.floor(i / 3)}-${String(1 + (i % 3) * 7).padStart(2, '0')}`, w),
    );
    expect(recentGainOf(ixWith({ logs: five }), bench.id, '2026-09-14')).toBeNull();
  });

  it('reads a real trailing gain off the sessions', () => {
    // Six sessions, split down the middle: 100 in the earlier half, 110 in the
    // later one. Ten percent, which is what it should report.
    const logs = [100, 100, 100, 110, 110, 110].map((w, i) =>
      log(`2026-0${6 + Math.floor(i / 3)}-${String(1 + (i % 3) * 7).padStart(2, '0')}`, w),
    );
    const gain = recentGainOf(ixWith({ logs }), bench.id, '2026-09-14');
    expect(gain).toBeCloseTo(0.1, 3);
  });

  it('never reports a trailing loss as a negative rate', () => {
    // It feeds a ceiling on ambition. A negative one would make every goal
    // look ambitious for somebody coming back from a layoff, which is exactly
    // the person who should be left alone.
    const logs = [120, 120, 118, 110, 108, 105].map((w, i) =>
      log(`2026-0${6 + Math.floor(i / 3)}-${String(1 + (i % 3) * 7).padStart(2, '0')}`, w),
    );
    expect(recentGainOf(ixWith({ logs }), bench.id, '2026-09-14')).toBe(0);
  });
});

describe('how a goal ends', () => {
  it('calls a reached target reached', () => {
    const p = goalProgress(goal(), ixWith({ logs: [log('2026-08-01', 111)] }), '2026-10-02');
    expect(outcomeOf(p)).toBe('achieved');
  });

  it('credits the distance covered rather than calling it a failure', () => {
    const p = goalProgress(goal(), ixWith({ logs: [log('2026-08-01', 106)] }), '2026-10-02');
    expect(outcomeOf(p)).toBe('partly');
  });

  it('calls it part of the way only once the lift moved past retest noise', () => {
    /* The owner's example: 100 → 110, ended at 102. A fifth of the distance,
       and still inside the 4.2% a retest wanders on its own, so the card must
       not say "still added 2 kg". Both sides of the line are pinned: 104 is
       under it, 104.5 is over. */
    const end = (e1rm: number) =>
      outcomeOf(goalProgress(goal(), ixWith({ logs: [log('2026-08-01', e1rm)] }), '2026-10-02'));
    expect(end(102)).toBe('flat');
    expect(end(104)).toBe('flat');
    expect(end(104.5)).toBe('partly');

    /* And the same line decides the other way. A far target that the lift
       really moved toward — 4.5% up, under a twentieth of the way to 200 — is
       part of the way, not "did not move". */
    const far = goal({ target: 200 });
    const p = goalProgress(far, ixWith({ logs: [log('2026-08-01', 104.5)] }), '2026-10-02');
    expect(p.share).toBeLessThan(0.05);
    expect(outcomeOf(p)).toBe('partly');
  });

  it('says flat when nothing moved, and has no word for failed', () => {
    const p = goalProgress(goal(), ixWith({}), '2026-10-02');
    expect(outcomeOf(p)).toBe('flat');
    const barely = goalProgress(goal(), ixWith({ logs: [log('2026-08-01', 100.5)] }), '2026-10-02');
    expect(outcomeOf(barely)).toBe('flat');
    // The word itself, held at compile time: checked by `npm run typecheck`,
    // not at runtime, so "failed" cannot come back without failing the build.
    expectTypeOf<GoalOutcome>().toEqualTypeOf<'achieved' | 'partly' | 'flat'>();
  });
});
