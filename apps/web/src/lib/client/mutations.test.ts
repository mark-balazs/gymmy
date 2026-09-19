import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SEED_PATTERNS,
  buildSlots,
  findSplit,
  index,
  type Pattern,
  type ProgramEntry,
  type Slot,
} from '@athletic/domain';
import { rowSchemas } from '@/lib/sync/rows';
import { boundSet, intIn, numIn, setEntryExercise } from './mutations';

/* The device's database and the sync queue, for the writes below: the rows
   `setEntryExercise` reads, and every row it writes. Nothing here reaches
   IndexedDB or the network. */
const store = vi.hoisted(() => ({
  entries: [] as unknown[],
  written: [] as { table: string; row: unknown }[],
}));
vi.mock('./db', () => ({
  barKey: () => 'bar',
  setMeta: async () => undefined,
  local: {
    entries: { toArray: async () => store.entries },
    table: (table: string) => ({
      put: async (row: unknown) => void store.written.push({ table, row }),
    }),
  },
}));
vi.mock('./sync', () => ({
  enqueue: async () => undefined,
  reportStorageFailure: () => undefined,
}));

/**
 * The bounds `logSet` holds a set to before it is written.
 *
 * Tested here rather than through the browser because the browser can no
 * longer reach most of them. The card used to take its numbers from inputs, so
 * `bad-input.spec.ts` typed "-20" and "8.5" and watched the set reach the
 * server anyway. gymmy's own keypad has no minus key and no point for reps, so
 * neither can be typed any more — but the guarantee is still needed, because
 * the keypad takes four digits, an off-plan card can be logged past its
 * hundredth set, and whatever the next control is will have its own way of
 * producing a number nobody expected.
 *
 * What the guarantee *is* — a row the server will accept — is checked against
 * the server's own validator rather than against a copy of its bounds, so the
 * two cannot drift apart. The browser half, that the keypad's largest number
 * still syncs, is `bad-input.spec.ts`.
 */

describe('intIn', () => {
  it('keeps a whole number in range as it is', () => {
    expect(intIn(8, 0, 1000)).toBe(8);
    expect(intIn(0, 0, 1000)).toBe(0);
    expect(intIn(1000, 0, 1000)).toBe(1000);
  });

  it('rounds to the nearest whole number rather than truncating', () => {
    expect(intIn(8.5, 0, 1000)).toBe(9);
    expect(intIn(8.49, 0, 1000)).toBe(8);
    expect(intIn(7.6, 0, 1000)).toBe(8);
  });

  it('clamps to the range at both ends', () => {
    expect(intIn(-20, 0, 1000)).toBe(0);
    expect(intIn(9999, 0, 1000)).toBe(1000);
    expect(intIn(0, 1, 100)).toBe(1);
    expect(intIn(150, 1, 100)).toBe(100);
  });

  it('keeps a fraction just past either end inside the range', () => {
    /* Named for what it can show. This used to claim it pinned clamping
       *after* rounding, but with whole-number bounds the two orders agree on
       every input, so no test can see which one runs — only that the answer
       lands in range. The .6s are the ones that round outward; a .4 rounds
       back in on its own and would pass with no clamp at all. */
    expect(intIn(1000.4, 0, 1000)).toBe(1000);
    expect(intIn(-0.4, 0, 1000)).toBe(0);
    expect(intIn(1000.6, 0, 1000)).toBe(1000);
    expect(intIn(-0.6, 0, 1000)).toBe(0);
  });

  it('answers null for nothing, and for anything that is not a finite number', () => {
    expect(intIn(null, 0, 1000)).toBeNull();
    expect(intIn(Number.NaN, 0, 1000)).toBeNull();
    expect(intIn(Number.POSITIVE_INFINITY, 0, 1000)).toBeNull();
    expect(intIn(Number.NEGATIVE_INFINITY, 0, 1000)).toBeNull();
  });
});

describe('numIn', () => {
  it('keeps a fraction, because a weight has one', () => {
    expect(numIn(61.25, 0, 2000)).toBe(61.25);
    expect(numIn(0.5, 0, 2000)).toBe(0.5);
  });

  it('clamps to the range at both ends', () => {
    expect(numIn(-20, 0, 2000)).toBe(0);
    expect(numIn(19998, 0, 2000)).toBe(2000);
    expect(numIn(2000, 0, 2000)).toBe(2000);
  });

  it('answers null for nothing, and for anything that is not a finite number', () => {
    expect(numIn(null, 0, 2000)).toBeNull();
    expect(numIn(Number.NaN, 0, 2000)).toBeNull();
    expect(numIn(Number.POSITIVE_INFINITY, 0, 2000)).toBeNull();
  });
});

describe('boundSet', () => {
  /** Everything else a set row carries, as `logSet` stamps it. */
  const row = (n: {
    setNo: number;
    weight: number | null;
    reps: number | null;
    rir: number | null;
  }) => ({
    id: '5b0b7c1e-0000-4000-8000-000000000001',
    updatedAt: '2026-09-18T08:00:00.000Z',
    deletedAt: null,
    note: '',
    date: '2026-09-18',
    session: 'A',
    exerciseId: 'ex-1',
    ...boundSet(n),
  });

  /**
   * The worst the card can hand over, and some it cannot yet.
   *
   * The first two are the keypad's own ceiling — four digits — for a single
   * weight and for a dumbbell pair, which the card doubles before logging. The
   * rest are what the old inputs let through and what an off-plan card reaches
   * by being logged all afternoon.
   */
  const hostile = [
    { setNo: 1, weight: 9999, reps: 9999, rir: 2 },
    { setNo: 1, weight: 9999 * 2, reps: 8, rir: 2 },
    { setNo: 1, weight: -20, reps: 8.5, rir: 2 },
    { setNo: 150, weight: 60, reps: 8, rir: 25 },
    { setNo: 0, weight: 60, reps: -3, rir: -1 },
    { setNo: 1.5, weight: Number.NaN, reps: Number.POSITIVE_INFINITY, rir: 2.5 },
  ];

  it.each(hostile)('makes a row the server accepts, from %o', (input) => {
    const result = rowSchemas.logs.safeParse(row(input));
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
  });

  it('moves each number to the nearest one the server accepts', () => {
    const pick = (n: (typeof hostile)[number]) => {
      const b = boundSet(n);
      return [b.setNo, b.weight, b.reps, b.rir];
    };
    expect(pick(hostile[0]!)).toEqual([1, 2000, 1000, 2]);
    expect(pick(hostile[1]!)).toEqual([1, 2000, 8, 2]);
    expect(pick(hostile[2]!)).toEqual([1, 0, 9, 2]);
    expect(pick(hostile[3]!)).toEqual([100, 60, 8, 20]);
    expect(pick(hostile[4]!)).toEqual([1, 60, 0, 0]);
    // Not a number is no number, which the server takes as an empty field.
    expect(pick(hostile[5]!)).toEqual([2, null, null, 3]);
  });

  it('leaves an ordinary set exactly as it was', () => {
    const set = { setNo: 3, weight: 61.25, reps: 8, rir: 2, date: '2026-09-18', note: 'x' };
    expect(boundSet(set)).toEqual(set);
    // Nothing added to yourself stays nothing, rather than becoming zero.
    expect(boundSet({ setNo: 1, weight: null, reps: 12, rir: null })).toEqual({
      setNo: 1,
      weight: null,
      reps: 12,
      rir: null,
    });
  });
});

describe('setEntryExercise', () => {
  /* A swap on the Week tab. The owner: "the unit follows the exercise's
     movement pattern in EVERY slot". It used to spread the stored row, so a
     rotation finisher swapped for a carry kept "8-12" and the card started
     at eight metres; and a slot with no row got "6-12" whatever it held. The
     rule itself is `rangeAfterSwap`, tested in the domain; this holds the one
     write that has to use it. */
  const stamp = '2026-09-19T08:00:00.000Z';
  const patterns: Pattern[] = SEED_PATTERNS.map((p, i) => ({
    id: `pat-${p.key}`,
    updatedAt: stamp,
    deletedAt: null,
    key: p.key,
    name: p.key,
    role: p.role,
    counts: p.counts,
    position: i,
  }));
  const slots: Slot[] = buildSlots(findSplit('sevenPattern')!, 3).map((s, i) => ({
    ...s,
    id: `slot-${i}`,
    updatedAt: stamp,
    deletedAt: null,
  }));
  const ix = index({
    patterns,
    slots,
    exercises: [],
    splitPeriods: [],
    entries: [],
    logs: [],
    bodyLogs: [],
    goals: [],
    profile: null,
  });
  const finisher = slots.find((s) => s.sessionIndex === 0 && s.key === 'finisher')!;
  const idOf = (name: string) => ix.exercises.find((e) => e.name === name)!.id;
  const stored = (exercise: string, repRange: string): ProgramEntry => ({
    id: 'entry-1',
    updatedAt: stamp,
    deletedAt: null,
    sessionIndex: 0,
    slotId: finisher.id,
    exerciseId: idOf(exercise),
    sets: 4,
    repRange,
    startWeight: null,
    note: 'from the plan',
  });
  const written = () => {
    expect(store.written.map((w) => w.table)).toEqual(['entries']);
    return store.written[0]!.row as ProgramEntry;
  };

  beforeEach(() => {
    store.entries = [];
    store.written = [];
  });

  it('gives a swap to another movement that movement’s range', async () => {
    store.entries = [stored('Russian Twist', '8-12')];
    await setEntryExercise(ix, 0, finisher.id, idOf("Farmer's Carry"));
    const row = written();
    expect(row.repRange).toBe('30-40m');
    // The same row, changed only where the swap changes it.
    expect(row).toMatchObject({ id: 'entry-1', sets: 4, note: 'from the plan' });
    expect(row.exerciseId).toBe(idOf("Farmer's Carry"));
  });

  it('keeps the stored range when the movement stays, so a trainer’s survives', async () => {
    store.entries = [stored('Russian Twist', '6-10')];
    await setEntryExercise(ix, 0, finisher.id, idOf('Pallof Press'));
    expect(written().repRange).toBe('6-10');
  });

  it('gives a slot with no row yet its movement’s range', async () => {
    await setEntryExercise(ix, 0, finisher.id, idOf("Farmer's Carry"));
    const row = written();
    expect(row.repRange).toBe('30-40m');
    expect(row).toMatchObject({ sessionIndex: 0, slotId: finisher.id, sets: 3 });
  });
});
