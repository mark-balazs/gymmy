import { describe, expect, it } from 'vitest';
import { buildProgram, lastSession } from '../src/coach';
import { CATALOGUE, type CatalogueExercise } from '../src/catalogue';
import { PUBLISHED_IDS } from '../src/catalogue-ids';
import { index } from '../src/model';
import { progressSummary } from '../src/insights';
import type { Exercise, SetLog, Snapshot } from '../src/types';
import { logsFor, seedSnapshot } from './fixture';

/**
 * One library, authored in code, that every account gets — with no stored id
 * ever rewritten.
 *
 * These tests are about the two ways that can go wrong silently. An id that
 * changes or disappears orphans every set pointing at it, and the person sees
 * their training vanish. And an account's own pre-catalogue rows, which are now
 * only aliases, must keep resolving forever: their sets were logged against
 * those ids, some of them offline and not yet on the server.
 */

/** An account as it looked before the catalogue: its own rows, its own ids. */
const legacy = (): Snapshot => seedSnapshot('sevenPattern', 3);

/** The same account's row for a named exercise — the id its sets were logged
 *  against, which is not the catalogue's. */
const legacyRow = (snap: Snapshot, name: string): Exercise =>
  snap.exercises.find((e) => e.name === name)!;

describe('the published ids', () => {
  it('all still resolve, and every catalogue entry is registered', () => {
    /* The rule that makes "no id is ever rewritten" something the suite
       enforces. Deleting an entry from the catalogue fails here unless its id
       is also deleted from the append-only registry — which is the one edit
       that should never get through review. Adding one without registering it
       fails too, so an addition is always deliberate. */
    const ids = CATALOGUE.map((c) => c.id);
    expect(PUBLISHED_IDS.filter((id) => !ids.includes(id))).toEqual([]);
    expect(ids.filter((id) => !PUBLISHED_IDS.includes(id))).toEqual([]);
  });

  it('are unique, readable and fit the wire', () => {
    const ids = CATALOGUE.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(PUBLISHED_IDS).size).toBe(PUBLISHED_IDS.length);
    for (const id of ids) {
      expect(id).toMatch(/^ex-[a-z0-9]+(-[a-z0-9]+)*$/);
      // The server rejects an exercise id over 64 characters with a 400, which
      // would block a device's outbox for good.
      expect(id.length).toBeLessThanOrEqual(64);
    }
  });

  it('cannot collide with an id an account already has', () => {
    // Old ids were random UUIDs or 32 hex characters of a hash. A catalogue id
    // that looked like either could be mistaken for an account's own row.
    for (const id of CATALOGUE.map((c) => c.id)) {
      expect(id).not.toMatch(/^[0-9a-f]{32}$/);
      expect(id).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);
    }
  });

  it('has one entry per name', () => {
    // Names are the key every other table uses, and the alias match too.
    const names = CATALOGUE.map((c) => c.name.trim().toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('an account from before the catalogue', () => {
  it('resolves a set logged against a pre-catalogue exercise id', () => {
    /* The test the whole design rests on. The set was written with the
       account's own row id, months ago; the library is the catalogue now. Read
       through `index()`, it is the catalogue's Goblet Squat with its history —
       not an orphan pointing at nothing. */
    const snap = legacy();
    const old = legacyRow(snap, 'Goblet Squat');
    const logs = logsFor(old.id, [{ weight: 24, reps: 8, rir: 2 }]);
    const ix = index({ ...snap, logs });

    expect(old.id).not.toBe('ex-goblet-squat');
    expect(ix.logs[0]!.exerciseId).toBe('ex-goblet-squat');
    expect(ix.exerciseById.get(ix.logs[0]!.exerciseId)?.name).toBe('Goblet Squat');
  });

  it('merges history logged under the old id and the new one into one lift', () => {
    /* Sets from before the release carry the old id; sets after it carry the
       catalogue's. One lift, one history, one "last time". */
    const snap = legacy();
    const old = legacyRow(snap, 'Goblet Squat');
    const logs: SetLog[] = [
      ...logsFor(old.id, [{ weight: 24, reps: 8, rir: 2 }], '2026-09-01'),
      ...logsFor('ex-goblet-squat', [{ weight: 28, reps: 8, rir: 2 }], '2026-09-08'),
    ];
    const ix = index({ ...snap, logs });

    const summary = progressSummary(ix, { from: '2026-01-01', to: '2026-12-31', sessions: 3 });
    const goblet = summary.filter((p) => p.exercise.name === 'Goblet Squat');
    expect(goblet).toHaveLength(1);
    expect(goblet[0]!.totalSets).toBe(2);
    // Asked for by either id, the answer is the same session.
    expect(lastSession(ix, old.id)?.weight).toBe(28);
    expect(lastSession(ix, 'ex-goblet-squat')?.weight).toBe(28);
  });

  it('keeps resolving through a row that was soft-deleted', () => {
    // A deleted row's sets still exist, so its alias has to outlive it.
    const snap = legacy();
    const old = legacyRow(snap, 'Goblet Squat');
    const ix = index({
      ...snap,
      exercises: snap.exercises.map((e) =>
        e.id === old.id ? { ...e, deletedAt: '2026-09-01T00:00:00.000Z' } : e,
      ),
      logs: logsFor(old.id, [{ weight: 24, reps: 8, rir: 2 }]),
    });
    expect(ix.logs[0]!.exerciseId).toBe('ex-goblet-squat');
  });

  it('reads plan entries and goals through the same aliases', () => {
    const snap = legacy();
    const old = legacyRow(snap, 'Goblet Squat');
    const ix = index({
      ...snap,
      entries: [
        {
          id: 'e1',
          updatedAt: '2026-09-01',
          deletedAt: null,
          sessionIndex: 0,
          slotId: snap.slots[0]!.id,
          exerciseId: old.id,
          sets: 3,
          repRange: '6-12',
          startWeight: null,
          note: '',
        },
      ],
      goals: [
        {
          id: 'g1',
          updatedAt: '2026-09-01',
          deletedAt: null,
          retiredAt: null,
          exerciseId: old.id,
          baseline: 30,
          target: 33,
          startedOn: '2026-09-01',
          targetDate: '2026-12-01',
        },
      ],
    });
    expect(ix.entries[0]!.exerciseId).toBe('ex-goblet-squat');
    expect(ix.goals[0]!.exerciseId).toBe('ex-goblet-squat');
  });

  it('keeps a row the catalogue does not know as an exercise of its own', () => {
    /* None exist — nothing in the app has ever created one — but its history
       must not be orphaned on the strength of that guess. */
    const snap = legacy();
    const mine: Exercise = {
      ...snap.exercises[0]!,
      id: 'mine-1',
      name: 'Zottman Curl',
    };
    const ix = index({
      ...snap,
      exercises: [...snap.exercises, mine],
      logs: logsFor('mine-1', [{ weight: 10, reps: 10, rir: 2 }]),
    });
    expect(ix.exerciseById.get('mine-1')?.name).toBe('Zottman Curl');
    expect(ix.logs[0]!.exerciseId).toBe('mine-1');
  });
});

describe('a new account', () => {
  it('gets the whole library with no rows of its own', () => {
    // New accounts are no longer given a copy of the library at sign-up.
    const ix = index({ ...legacy(), exercises: [] });
    expect(ix.exercises).toHaveLength(CATALOGUE.filter((c) => !c.retired).length);
    // In this account's own pattern ids, so every `patternId` reader is unchanged.
    for (const e of ix.exercises) expect(ix.patternById.has(e.patternId)).toBe(true);
  });

  it('gets the same library, in the same order, however the device returns its rows', () => {
    /* Order is behaviour: the generator indexes into each pattern's pool. The
       device hands rows back in id order, and ids used to be per-account hashes,
       so every account's pool came out in a different order by accident. The
       library's order is the catalogue's now, whatever the store does. */
    const snap = legacy();
    const shuffled = { ...snap, exercises: [...snap.exercises].reverse() };
    expect(index(shuffled).exercises.map((e) => e.id)).toEqual(
      index(snap).exercises.map((e) => e.id),
    );
    expect(index(snap).exercises.map((e) => e.id)).toEqual(
      CATALOGUE.filter((c) => !c.retired).map((c) => c.id),
    );
  });
});

describe('retiring an exercise', () => {
  /* The only legal way to remove one. None is retired yet, so this is proved
     against a variant catalogue — before the first real retirement, not after. */
  const withRetired = (name: string): CatalogueExercise[] =>
    CATALOGUE.map((c) => (c.name === name ? { ...c, retired: true as const } : c));

  it('is never offered again, and still resolves', () => {
    const cat = withRetired('Goblet Squat');
    const ix = index(legacy(), cat);
    expect(ix.exercises.map((e) => e.name)).not.toContain('Goblet Squat');
    expect(ix.exerciseById.get('ex-goblet-squat')?.name).toBe('Goblet Squat');
  });

  it('is never programmed', () => {
    const cat = withRetired('Goblet Squat');
    for (const where of ['gym', 'home'] as const) {
      const ix = index(legacy(), cat);
      const draft = buildProgram(ix, { days: 3, where, bias: 'none' });
      expect(draft.map((d) => d.exerciseId)).not.toContain('ex-goblet-squat');
    }
  });

  it('keeps its history on the Progress page', () => {
    /* The reason `exerciseById` includes retired entries and `exercises` does
       not. Progress used to list "logged but no longer planned" lifts from
       `exercises`, which would have made a retired movement's history vanish
       the release it was retired. */
    const snap = legacy();
    const ix = index(
      { ...snap, logs: logsFor('ex-goblet-squat', [{ weight: 24, reps: 8, rir: 2 }]) },
      withRetired('Goblet Squat'),
    );
    const summary = progressSummary(ix, { from: '2026-01-01', to: '2026-12-31', sessions: 3 });
    expect(summary.map((p) => p.exercise.name)).toContain('Goblet Squat');
  });
});

describe('ids from outside index()', () => {
  it('maps any id it knows to the one in use, and leaves the rest alone', () => {
    const snap = legacy();
    const ix = index(snap);
    const old = legacyRow(snap, 'Barbell Bench Press');
    expect(ix.exerciseIdOf(old.id)).toBe('ex-barbell-bench-press');
    expect(ix.exerciseIdOf('ex-barbell-bench-press')).toBe('ex-barbell-bench-press');
    expect(ix.exerciseIdOf('something-else')).toBe('something-else');
  });
});
