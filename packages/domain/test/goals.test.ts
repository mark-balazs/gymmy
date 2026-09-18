import { describe, expect, it } from 'vitest';
import {
  EVIDENCE,
  MAX_LIVE_GOALS,
  checkGoal,
  goalProgress,
  growingExercises,
  isLive,
  liveGoals,
  outcomeOf,
  recentGainOf,
  suggestBaseline,
  type Goal,
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

  it('refuses a run too short to accumulate anything', () => {
    /* Strength is added when a session goes well, not on a schedule — so the
       horizon has to hold enough good sessions for the increments to add up
       to more than the retest CV. Six weeks cannot. */
    const check = checkGoal(request({ targetDate: '2026-08-12' }));
    expect(check.allowed).toBe(false);
    expect(check.reason).toBe('tooShort');
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

  it('will not call two sessions a rate', () => {
    // Guessing one would put a number in front of somebody that the app made
    // up, and it is the number the ambition warning is measured against.
    const thin = ixWith({ logs: [log('2026-08-01', 100), log('2026-08-08', 105)] });
    expect(recentGainOf(thin, bench.id, '2026-09-14')).toBeNull();
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

  it('says flat when nothing moved, and has no word for failed', () => {
    const p = goalProgress(goal(), ixWith({}), '2026-10-02');
    expect(outcomeOf(p)).toBe('flat');
    expect(['achieved', 'partly', 'flat']).toContain(outcomeOf(p));
  });
});
