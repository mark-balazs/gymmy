import { describe, expect, it } from 'vitest';
import { OFF_PLAN, buildProgram, lastSession, swapOptions } from '../src/coach';
import { index, programCoverage, programRows, type Indexed } from '../src/model';
import { BIASES, type Bias, type PatternKey, type Where } from '../src/types';
import { logsFor, seedIndex, seedSnapshot, withEntries } from './fixture';

describe('program generation', () => {
  const snap = seedSnapshot();
  const ix = index(snap);

  /* The whole method rests on covering all seven patterns. If an unlucky
   * combination of days, equipment and bias could drop one, the app would be
   * quietly failing at the only thing it claims to do — so check every case. */
  for (const days of [2, 3, 4]) {
    for (const where of ['gym', 'home'] as const) {
      for (const bias of BIASES) {
        it(`covers every pattern: ${days} days, ${where}, ${bias}`, () => {
          const draft = buildProgram(ix, { days, where, bias });
          const built = withEntries(snap, draft);
          const missing = programCoverage(built, days).filter((c) => c.sets === 0);
          expect(missing.map((m) => m.pattern.key)).toEqual([]);
        });
      }
    }
  }

  it('fills every slot', () => {
    const draft = buildProgram(ix, { days: 3, where: 'gym', bias: 'none' });
    const built = withEntries(snap, draft);
    expect(programRows(built, 3).every((r) => r.exercise)).toBe(true);
  });

  it('never offers gym-only equipment to a home program', () => {
    const draft = buildProgram(ix, { days: 4, where: 'home', bias: 'none' });
    const built = withEntries(snap, draft);
    const gymOnly = programRows(built, 4)
      .filter((r) => r.exercise?.where === 'gym')
      .map((r) => r.exercise!.name);
    expect(gymOnly).toEqual([]);
  });

  it('respects each slot’s required role', () => {
    const draft = buildProgram(ix, { days: 3, where: 'gym', bias: 'none' });
    const built = withEntries(snap, draft);
    const bad = programRows(built, 3).filter((r) => r.check.ok === false);
    expect(bad).toEqual([]);
  });

  for (const bias of ['shoulders', 'arms', 'glutes'] as const) {
    it(`actually biases towards ${bias}`, () => {
      const draft = buildProgram(ix, { days: 3, where: 'gym', bias });
      const built = withEntries(snap, draft);
      const hit = programRows(built, 3).filter((r) => r.exercise?.tags.includes(bias));
      expect(hit.length).toBeGreaterThan(0);
    });
  }

  it('does not depend on pattern names, which are translated', () => {
    // Rename every pattern to its Hungarian equivalent. Generation must be
    // unaffected — matching on names would silently produce an empty week.
    const renamed = {
      ...snap,
      patterns: snap.patterns.map((p) => ({ ...p, name: `HU-${p.key}` })),
    };
    const draft = buildProgram(index(renamed), { days: 3, where: 'gym', bias: 'none' });
    const built = withEntries(renamed, draft);
    expect(programCoverage(built, 3).filter((c) => c.sets === 0)).toEqual([]);
  });
});

describe('movements the app records but never prescribes', () => {
  /* The library is gaining conditioning work so a CrossFit class can be logged
     at all. Every one of those is fine to have done and poor to be handed: a
     generated slot asks for three sets of six to twelve, which is not what
     anybody does with a medicine ball, and a week built out of them reads as a
     programme nobody wrote.

     Every test here tags **the exercise the generator actually chose**, read
     back from an untagged run, rather than tagging a pool and asserting the
     survivor. The first version did the latter and passed with the guard
     switched off: the generator picks a squat pool by an index that barely
     moves, so it was choosing Goblet Squat either way and the test was
     agreeing with a coincidence. */
  const base = seedSnapshot();
  const plain = index(base);

  const chosenFor = (
    ix: Indexed,
    key: PatternKey,
    opts: { where: Where; bias: Bias; days: number },
  ) => {
    const patternId = ix.patterns.find((p) => p.key === key)!.id;
    return buildProgram(ix, opts)
      .map((d) => (d.exerciseId ? ix.exerciseById.get(d.exerciseId) : null))
      .filter((e): e is NonNullable<typeof e> => !!e && e.patternId === patternId);
  };

  /** The same library with `names` marked off-plan. */
  const tagging = (names: string[]) =>
    index({
      ...base,
      exercises: base.exercises.map((e) =>
        names.includes(e.name) ? { ...e, tags: [...e.tags, OFF_PLAN] } : e,
      ),
    });

  it('picks something else once the movement it wanted is off-plan', () => {
    for (const days of [2, 3, 4]) {
      const opts = { days, where: 'gym' as const, bias: 'none' as const };
      const before = chosenFor(plain, 'squat', opts);
      expect(before.length).toBeGreaterThan(0);

      const banned = [...new Set(before.map((e) => e.name))];
      const after = chosenFor(tagging(banned), 'squat', opts);

      // Still a squat in the week, and not one of the ones we just refused.
      expect(after.length).toBe(before.length);
      expect(after.some((e) => banned.includes(e.name))).toBe(false);
    }
  });

  it('does not let a bias fallback smuggle one back in', () => {
    /* The reason the filter sits in `pool`'s base rather than in its tag
       argument: `pool` is called a second time with a null tag whenever a bias
       leaves a pattern empty, and that second call is exactly where an off-plan
       movement would reappear — for the user who asked for a bias, which is
       nobody's idea of a guard. */
    for (const bias of BIASES) {
      const opts = { days: 3, where: 'gym' as const, bias };
      const banned = [...new Set(chosenFor(plain, 'squat', opts).map((e) => e.name))];
      const after = chosenFor(tagging(banned), 'squat', opts);
      expect(after.some((e) => banned.includes(e.name))).toBe(false);
    }
  });

  it('stops offering one as a swap for a planned slot', () => {
    const draft = buildProgram(plain, { days: 3, where: 'gym', bias: 'none' });
    const built = withEntries(base, draft);
    const row = programRows(built, 3).find((r) => r.pattern?.key === 'squat')!;

    const before = swapOptions(built, 3, row.session, row.slot.id, 'gym');
    const victim = before.find((e) => e.name !== row.exercise?.name)!;
    expect(victim).toBeDefined();

    const taggedIx = tagging([victim.name]);
    const builtTagged = withEntries(
      { ...base, exercises: taggedIx.exercises },
      buildProgram(taggedIx, { days: 3, where: 'gym', bias: 'none' }),
    );
    const rowTagged = programRows(builtTagged, 3).find((r) => r.pattern?.key === 'squat')!;
    const after = swapOptions(builtTagged, 3, rowTagged.session, rowTagged.slot.id, 'gym');

    expect(before.map((e) => e.name)).toContain(victim.name);
    expect(after.map((e) => e.name)).not.toContain(victim.name);
  });

  it('never satisfies the coverage guarantee with something it refuses to pick', () => {
    // The guard must not be able to leave a pattern uncovered, nor to look
    // covered by an exercise the generator would never choose.
    const banned = [
      ...new Set(
        chosenFor(plain, 'squat', { days: 3, where: 'gym', bias: 'none' }).map((e) => e.name),
      ),
    ];
    const taggedIx = tagging(banned);
    const built = withEntries(
      { ...base, exercises: taggedIx.exercises },
      buildProgram(taggedIx, { days: 3, where: 'gym', bias: 'none' }),
    );
    expect(programCoverage(built, 3).filter((c) => c.sets === 0)).toEqual([]);
  });
});

describe('what you did last time', () => {
  /* The replacement for a double-progression engine that handed out targets.
     Everything here is a question about the past, and there is deliberately no
     test asserting what to do next — that is the point of the change, and a
     test named "suggests more weight" reappearing here would undo it. */
  const base = seedSnapshot();
  const squat = index(base).exercises.find((e) => e.name === 'Goblet Squat')!;

  const withLogs = (sets: { weight: number; reps: number; rir: number }[], date?: string) =>
    index({ ...base, logs: logsFor(squat.id, sets, date) });

  it('has nothing to say about a lift never trained', () => {
    // Not a zero and not a starting weight to aim at. Nothing.
    expect(lastSession(index(base), squat.id)).toBeNull();
  });

  it('reports the heaviest weight of the most recent session', () => {
    const ix = index({
      ...base,
      logs: [
        ...logsFor(squat.id, [{ weight: 80, reps: 5, rir: 0 }], '2026-08-01'),
        ...logsFor(squat.id, [{ weight: 60, reps: 8, rir: 2 }], '2026-09-10'),
      ],
    });
    const last = lastSession(ix, squat.id);
    // The recent session, not the best one — this is history, not a record book.
    expect(last).toEqual({ date: '2026-09-10', weight: 60, reps: 8 });
  });

  it('takes the fewest reps at the top weight, not the easiest set', () => {
    /* A session of 60×10, 60×8, 50×12 is repeated as 60×8. The max reps would
       flatter the session and the back-off set is not what you would repeat. */
    const last = lastSession(
      withLogs([
        { weight: 60, reps: 10, rir: 2 },
        { weight: 60, reps: 8, rir: 0 },
        { weight: 50, reps: 12, rir: 2 },
      ]),
      squat.id,
    );
    expect(last).toMatchObject({ weight: 60, reps: 8 });
  });

  it('survives a set logged without a weight', () => {
    // Bodyweight work, or a set somebody half-filled in. Neither should throw
    // and neither should invent a number.
    const last = lastSession(withLogs([{ weight: 0, reps: 12, rir: 2 }]), squat.id);
    expect(last?.weight).toBeNull();
    expect(last?.reps).toBe(12);
  });

  it('finds the latest session without relying on the logs being sorted', () => {
    /* IndexedDB hands rows back in UUID order, so "the last session" cannot be
       "the last row". `index()` does sort, which means a test going through it
       cannot tell whether this function is order-independent on its own — it
       would need both to break before it failed. So the index is built and then
       its logs are deliberately scrambled, bypassing that sort.

       It matters because this is what prefills the weight on the Train card. A
       wrong answer here is not a wrong chart; it is somebody being handed a
       heavier bar than they lifted last time, which is the exact class of
       mistake this whole change exists to remove. */
    const ordered = [
      ...logsFor(squat.id, [{ weight: 50, reps: 8, rir: 2 }], '2026-07-01'),
      ...logsFor(squat.id, [{ weight: 70, reps: 6, rir: 1 }], '2026-09-01'),
    ];
    const unsorted: Indexed = {
      ...index({ ...base, logs: ordered }),
      logs: [...ordered].reverse(),
    };
    expect(lastSession(unsorted, squat.id)).toEqual({ date: '2026-09-01', weight: 70, reps: 6 });
  });
});
