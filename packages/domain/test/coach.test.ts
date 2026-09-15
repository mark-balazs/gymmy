import { describe, expect, it } from 'vitest';
import { OFF_PLAN, buildProgram, suggest, swapOptions } from '../src/coach';
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
     at all. Every one of those is fine to have done and wrong to be handed: a
     slot comes with a 6-12 rep range and double progression telling you to add
     weight when it felt easy, which is meaningless advice about a medicine ball
     that weighs nine kilos forever.

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

describe('double progression', () => {
  const ix = seedIndex();
  const squat = ix.exercises.find((e) => e.name === 'Goblet Squat')!;
  const entry = { repRange: '6-12', startWeight: null };
  const withLogs = (sets: { weight: number; reps: number; rir: number }[]) =>
    index({ ...seedSnapshot(), logs: logsFor(squat.id, sets) });

  it('asks for a starting weight when there is no history', () => {
    const s = suggest(ix, squat.id, entry);
    expect(s.kind).toBe('first');
    expect(s.reps).toBe(6);
  });

  it('chases one more rep mid-range', () => {
    const base = seedSnapshot();
    const ex = index(base).exercises.find((e) => e.name === 'Goblet Squat')!;
    const s = suggest(
      index({ ...base, logs: logsFor(ex.id, [{ weight: 60, reps: 8, rir: 2 }]) }),
      ex.id,
      entry,
    );
    expect(s).toMatchObject({ kind: 'rep', weight: 60, reps: 9 });
  });

  it('adds weight and drops to the bottom of the range at the top with reps to spare', () => {
    const base = seedSnapshot();
    const ex = index(base).exercises.find((e) => e.name === 'Goblet Squat')!;
    const s = suggest(
      index({
        ...base,
        logs: logsFor(ex.id, [
          { weight: 60, reps: 12, rir: 2 },
          { weight: 60, reps: 12, rir: 2 },
        ]),
      }),
      ex.id,
      entry,
    );
    expect(s).toMatchObject({ kind: 'up', weight: 62.5, reps: 6 });
  });

  it('repeats rather than adding load after a set taken to failure', () => {
    const base = seedSnapshot();
    const ex = index(base).exercises.find((e) => e.name === 'Goblet Squat')!;
    const s = suggest(
      index({ ...base, logs: logsFor(ex.id, [{ weight: 60, reps: 12, rir: 0 }]) }),
      ex.id,
      entry,
    );
    expect(s.kind).toBe('hold');
  });

  it('judges the whole session by its weakest set, not its best', () => {
    const base = seedSnapshot();
    const ex = index(base).exercises.find((e) => e.name === 'Goblet Squat')!;
    const s = suggest(
      index({
        ...base,
        logs: logsFor(ex.id, [
          { weight: 60, reps: 12, rir: 2 },
          { weight: 60, reps: 9, rir: 1 },
        ]),
      }),
      ex.id,
      entry,
    );
    expect(s).toMatchObject({ kind: 'rep', reps: 10 });
  });

  it('does not prescribe reps for a timed carry', () => {
    const base = seedSnapshot();
    const ex = index(base).exercises.find((e) => e.name === "Farmer's Carry")!;
    const s = suggest(
      index({ ...base, logs: logsFor(ex.id, [{ weight: 24, reps: 30, rir: 3 }]) }),
      ex.id,
      { repRange: '30-40m', startWeight: null },
    );
    expect(s.kind).toBe('hold');
    expect(s.reps).toBeNull();
  });
});
