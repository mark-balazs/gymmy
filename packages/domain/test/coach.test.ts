import { describe, expect, it } from 'vitest';
import { buildProgram, suggest } from '../src/coach';
import { index, programCoverage, programRows } from '../src/model';
import { BIASES } from '../src/types';
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
