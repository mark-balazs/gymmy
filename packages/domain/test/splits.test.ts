import { describe, expect, it } from 'vitest';
import { buildProgram } from '../src/coach';
import { index, programCoverage, programRows, slotsForSession } from '../src/model';
import { countsForIndex } from '../src/strength';
import {
  allowedDays,
  buildSlots,
  coversFor,
  currentSlotDrafts,
  findSplit,
  reachablePatterns,
  SPLITS,
  splitDays,
  type SlotDraft,
} from '../src/splits';
import type { PatternKey, Snapshot } from '../src/types';
import { seedSnapshot, withEntries } from './fixture';

describe('split presets', () => {
  /**
   * The promise a split makes is that it delivers what it claims to. Each preset
   * declares its own coverage set — push/pull/legs is complete at push, pull and
   * the three leg patterns — and the generated week must satisfy that set at
   * every day count, equipment choice and bias, with no gap the user has to
   * notice for themselves. That half is held by `coach.test.ts`, "never costs a
   * week its coverage, whatever the offset", over every preset, day count,
   * location and bias at several varieties. What stays here is the other half:
   * every slot's own constraint.
   */
  for (const preset of SPLITS) {
    for (const days of allowedDays(preset.key)) {
      for (const where of ['gym', 'home'] as const) {
        it(`${preset.key} @ ${days} days (${where}) respects every slot constraint`, () => {
          const snap = seedSnapshot(preset.key, days);
          const draft = buildProgram(index(snap), { days, where, bias: 'none' });
          const built = withEntries(snap, draft);

          const bad = programRows(built, days).filter((r) => r.check.ok === false);
          expect(bad.map((b) => `${b.slot.key}:${b.exercise?.name}`)).toEqual([]);
        });
      }
    }
  }

  it('fills every slot for every preset', () => {
    for (const preset of SPLITS) {
      const days = preset.defaultDays;
      const snap = seedSnapshot(preset.key, days);
      const draft = buildProgram(index(snap), { days, where: 'gym', bias: 'none' });
      const built = withEntries(snap, draft);
      expect(programRows(built, days).every((r) => r.exercise)).toBe(true);
    }
  });
});

describe('split structure', () => {
  it('gives each day its own slots', () => {
    const snap = seedSnapshot('pushPullLegs', 3);
    const ix = index(snap);
    const day0 = slotsForSession(ix, 0);
    const day1 = slotsForSession(ix, 1);

    expect(day0).toHaveLength(5);
    expect(day1).toHaveLength(5);
    // Pinned to their own day, not shared.
    expect(day0.map((s) => s.id)).not.toEqual(day1.map((s) => s.id));
    expect(day0[0]!.patternKeys).toEqual(['push']);
    expect(day1[0]!.patternKeys).toEqual(['pull']);
  });

  it('cycles day templates when asked for more days than it defines', () => {
    const days = splitDays(findSplit('pushPullLegs')!, 5).map((d) => d.key);
    expect(days).toEqual(['push', 'pull', 'legs', 'push', 'pull']);
  });

  it('withholds day counts a split cannot cover', () => {
    // Two days of push/pull/legs would miss a whole day type, so the option is
    // not offered rather than silently producing an uncovered week.
    expect(allowedDays('pushPullLegs')).not.toContain(2);
    expect(allowedDays('upperLower')).toContain(2);
    expect(allowedDays('sevenPattern')).toContain(2);
  });

  it('labels each slot with the day it belongs to', () => {
    const slots = buildSlots(findSplit('upperLower')!, 4);
    expect(slots.filter((s) => s.sessionIndex === 0).every((s) => s.dayKey === 'upper')).toBe(true);
    expect(slots.filter((s) => s.sessionIndex === 1).every((s) => s.dayKey === 'lower')).toBe(true);
  });

  it('materialises the full-body day once per session', () => {
    // Not shared: "shared" in the model means a slot with no sessionIndex,
    // which applies to every day, and only slots seeded before splits existed
    // are like that. Every preset, full-body included, pins each slot to a day.
    const slots = buildSlots(findSplit('sevenPattern')!, 3);
    expect(slots.every((s) => s.dayKey === 'full')).toBe(true);
    expect(slots).toHaveLength(15);
    for (const session of [0, 1, 2])
      expect(slots.filter((s) => s.sessionIndex === session).map((s) => s.key)).toEqual([
        'bigLower',
        'bigUpper',
        'accessory',
        'isolation',
        'finisher',
      ]);
  });
});

describe('a split defines what a complete week means', () => {
  it('only the seven-pattern split demands rotation and carry', () => {
    // These two are the ones almost nobody trains, and catching that is the
    // method's whole claim — but it is a claim that split makes, not a rule
    // imposed on someone who chose push/pull/legs.
    expect(findSplit('sevenPattern')!.covers).toContain('rotate');
    expect(findSplit('sevenPattern')!.covers).toContain('carry');

    for (const key of ['pushPullLegs', 'upperLower'] as const) {
      expect(findSplit(key)!.covers).not.toContain('rotate');
      expect(findSplit(key)!.covers).not.toContain('carry');
    }
  });

  it('every preset can actually reach everything it asks for', () => {
    // A coverage set naming a pattern no slot can hold would be a box that can
    // never be ticked.
    for (const preset of SPLITS) {
      const snap = seedSnapshot(preset.key, preset.defaultDays);
      const counted = snap.patterns.filter((p) => p.counts);
      const reach = new Set(reachablePatterns(snap.slots, counted));
      expect(preset.covers.filter((k) => !reach.has(k))).toEqual([]);
    }
  });
});

describe('a hand-built split', () => {
  /** Ids and timestamps are not part of an arrangement; everything else is. */
  const shape = (s: SlotDraft) => ({
    key: s.key,
    requiredRole: s.requiredRole,
    position: s.position,
    sessionIndex: s.sessionIndex,
    patternKeys: s.patternKeys,
    dayKey: s.dayKey,
  });

  it('reads the week back exactly as it was materialised', () => {
    // The editor opens on the week you already train. If this drifts even
    // slightly it opens on something you are *not* training — and the first
    // save would then apply that instead of what you meant to change.
    for (const preset of SPLITS) {
      const days = preset.defaultDays;
      const snap = seedSnapshot(preset.key, days);
      expect(currentSlotDrafts(index(snap), days).map(shape), preset.key).toEqual(
        buildSlots(preset, days).map(shape),
      );
    }
  });

  it('still delivers a covered week after the slots are rearranged', () => {
    /*
     * Pin every unconstrained slot of a seven-pattern week to push. Rotation
     * and carry then have nowhere left to go, so the goal has to narrow to what
     * the week can still reach — and the generator has to cover all of *that*.
     *
     * This is the guarantee a hand-built split could most plausibly lose: the
     * presets are proven covered by construction, an arrangement somebody typed
     * in is not.
     */
    const snap = seedSnapshot('sevenPattern', 3);
    const counted = snap.patterns.filter((p) => p.counts);

    const drafts: SlotDraft[] = currentSlotDrafts(index(snap), 3).map((s) =>
      s.requiredRole === 'Lower' || s.requiredRole === 'Upper'
        ? s
        : { ...s, requiredRole: 'Any', patternKeys: ['push'] },
    );

    const covers = coversFor('custom', drafts, counted, [...findSplit('sevenPattern')!.covers]);
    expect(covers).not.toContain('rotate');
    expect(covers).not.toContain('carry');
    expect(covers).toContain('push');

    const custom: Snapshot = {
      ...snap,
      slots: drafts.map((s, i) => ({
        ...s,
        id: `custom-slot-${i}`,
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      })),
      splitPeriods: [{ ...snap.splitPeriods[0]!, split: 'custom', patternKeys: covers }],
    };

    const draft = buildProgram(index(custom), { days: 3, where: 'gym', bias: 'none' });
    const built = withEntries(custom, draft);

    // Nothing the week still asks for is missing…
    expect(programCoverage(built, 3).filter((c) => c.sets === 0)).toEqual([]);
    // …and the pins are honoured rather than papered over to achieve it.
    expect(programRows(built, 3).filter((r) => r.check.ok === false)).toEqual([]);
  });

  /** One day of hand-built slots, in order, and the week they have to cover. */
  const oneDay = (
    slots: { id: string; patternKeys: PatternKey[] | null }[],
    goal: PatternKey[],
    variety = 0,
  ) => {
    const base = seedSnapshot('sevenPattern', 1);
    const custom: Snapshot = {
      ...base,
      slots: slots.map((s, i) => ({
        id: s.id,
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        key: 'accessory',
        name: 'accessory',
        requiredRole: 'Any',
        position: i,
        sessionIndex: 0,
        patternKeys: s.patternKeys,
        dayKey: null,
      })),
      splitPeriods: [{ ...base.splitPeriods[0]!, split: 'custom', days: 1, patternKeys: goal }],
    };
    return withEntries(
      custom,
      buildProgram(index(custom), { days: 1, where: 'gym', bias: 'none', variety }),
    );
  };

  it('forces in a pattern the rotation alone would leave out', () => {
    /* The case above is covered by the rotation on its own, so switching the
       repair pass off left the whole suite green. Here it cannot be: one day
       of [squat|pull], [push|pull], [push]. The rotation fills squat, push,
       push and strands pull. Only the repair puts pull in, and it has to
       overwrite the second push rather than the only squat. */
    const built = oneDay(
      [
        { id: 'r0', patternKeys: ['squat', 'pull'] },
        { id: 'r1', patternKeys: ['push', 'pull'] },
        { id: 'r2', patternKeys: ['push'] },
      ],
      ['squat', 'push', 'pull'],
    );
    expect(
      programCoverage(built, 1)
        .filter((c) => c.sets === 0)
        .map((c) => c.pattern.key),
    ).toEqual([]);
    expect(programRows(built, 1).filter((r) => r.check.ok === false)).toEqual([]);
    expect(programRows(built, 1).map((r) => r.pattern?.key)).toEqual(['squat', 'pull', 'push']);
  });

  it('repairs only into a slot that allows the pattern', () => {
    /* A pinned squat slot, then a free one; the week asks for squat and carry.
       The rotation gives the free slot a hinge, so carry is missing, and the
       one legal place for it is the free slot. A repair that ignored the pins
       would overwrite the squat, which is first in the list, and create the
       violation it exists to prevent. The case above cannot tell: there the
       preferred slot happens to be a legal one too. */
    const built = oneDay(
      [
        { id: 'b', patternKeys: ['squat'] },
        { id: 'a', patternKeys: null },
      ],
      ['squat', 'carry'],
    );
    const keyOf = (id: string) => programRows(built, 1).find((r) => r.slot.id === id)?.pattern?.key;
    expect(keyOf('b')).toBe('squat');
    expect(keyOf('a')).toBe('carry');
  });

  it('does not cost a movement its lift the index counts', () => {
    /* [squat|pull], [push|pull], [push]: the rotation fills squat, push, push,
       and the repair overwrites the first push — push's main slot — with the
       missing pull. The second push, picked as an ordinary slot, may be a
       Push-Up, a Machine Chest Press or a Landmine Press, none of which the
       index counts; it is push's main slot now, so it gets the same
       preference. And the pull forced in is the pattern's only slot, so it
       counts too. Checked over every offset, because which push lands second
       depends on it. */
    const notCounted: string[] = [];
    for (let v = 0; v < 997; v++) {
      const rows = programRows(
        oneDay(
          [
            { id: 'r0', patternKeys: ['squat', 'pull'] },
            { id: 'r1', patternKeys: ['push', 'pull'] },
            { id: 'r2', patternKeys: ['push'] },
          ],
          ['squat', 'push', 'pull'],
          v,
        ),
        1,
      );
      expect(rows.map((r) => r.pattern?.key)).toEqual(['squat', 'pull', 'push']);
      for (const r of rows)
        if (!countsForIndex(r.exercise!.name)) notCounted.push(`${v}:${r.exercise!.name}`);
    }
    expect(notCounted.slice(0, 5)).toEqual([]);
  });
});

describe('coversFor', () => {
  const snap = seedSnapshot('sevenPattern', 3);
  const counted = snap.patterns.filter((p) => p.counts);

  it('takes a preset at its word', () => {
    expect(coversFor('pushPullLegs', snap.slots, counted, []).sort()).toEqual(
      ['hinge', 'lunge', 'pull', 'push', 'squat'].sort(),
    );
  });

  it('lets a custom split keep the goal it already had', () => {
    // Rearranging your week is not the same as changing what you train for.
    const inherited = ['push', 'pull'] as const;
    expect(coversFor('custom', snap.slots, counted, [...inherited])).toEqual([...inherited]);
  });

  it('stops asking for a pattern no remaining slot can hold', () => {
    // A week built only from pinned slots — no free "anything goes" slot and no
    // midline finisher — genuinely cannot reach a carry, so demanding one would
    // leave a box that is impossible to tick.
    const ppl = seedSnapshot('pushPullLegs', 3);
    const pinnedOnly = ppl.slots.filter((s) => s.patternKeys?.length);
    expect(reachablePatterns(pinnedOnly, counted)).not.toContain('carry');

    const covers = coversFor('custom', pinnedOnly, counted, ['squat', 'push', 'carry']);
    expect(covers).toEqual(['squat', 'push']);
  });

  it('keeps a free slot in mind before dropping anything', () => {
    // The seven-pattern skeleton has accessory and isolation slots that accept
    // any pattern, so nothing is unreachable and nothing gets dropped.
    expect(coversFor('custom', snap.slots, counted, ['squat', 'push', 'carry'])).toEqual([
      'squat',
      'push',
      'carry',
    ]);
  });
});
