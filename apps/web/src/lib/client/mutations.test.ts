import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SEED_PATTERNS,
  buildSlots,
  findSplit,
  index,
  type Pattern,
  type ProgramEntry,
  type Slot,
  type Snapshot,
} from '@athletic/domain';
import { rowSchemas } from '@/lib/sync/rows';
import {
  RefusedWrite,
  applySplit,
  boundSet,
  intIn,
  logBodyWeight,
  logSet,
  numIn,
  setEntryExercise,
  setHeight,
  setName,
} from './mutations';

/* The device's database and the sync queue, for the writes below: the rows the
   mutations read, every row they write, and every change that reached the
   queue. Nothing here touches IndexedDB or the network.

   `inTx` is Dexie's guarantee in miniature — whatever the body wrote is undone
   if it throws — which is what lets the tests below watch a half-written action
   leave nothing behind without standing up a real IndexedDB. */
const store = vi.hoisted(() => ({
  tables: {
    patterns: [],
    exercises: [],
    slots: [],
    splitPeriods: [],
    entries: [],
    logs: [],
    bodyLogs: [],
    goals: [],
    profile: [],
  } as Record<string, Record<string, unknown>[]>,
  written: [] as { table: string; row: unknown }[],
  queued: [] as { table: string; row: unknown }[],
  /** Queue writes throw once this many have succeeded — the device filling up
   *  between a row and the change that says it has to be sent. */
  failQueueAfter: Number.POSITIVE_INFINITY,
  queueCalls: 0,
}));

vi.mock('./db', () => {
  const table = (name: string) => ({
    toArray: async () => store.tables[name]!.slice(),
    get: async (id: string) => store.tables[name]!.find((r) => r.id === id),
    put: async (row: Record<string, unknown>) => {
      const rows = store.tables[name]!;
      const at = rows.findIndex((r) => r.id === row.id);
      if (at === -1) rows.push(row);
      else rows[at] = row;
      store.written.push({ table: name, row });
    },
  });
  return {
    barKey: () => 'bar',
    setMeta: async () => undefined,
    getMeta: async (_key: string, fallback: unknown) => fallback,
    ACCOUNT_KEY: 'account',
    inTx: async (fn: () => Promise<unknown>) => {
      const rows = Object.fromEntries(
        Object.entries(store.tables).map(([k, v]) => [k, v.map((r) => ({ ...r }))]),
      );
      const written = store.written.slice();
      const queued = store.queued.slice();
      try {
        return await fn();
      } catch (err) {
        store.tables = rows;
        store.written = written;
        store.queued = queued;
        throw err;
      }
    },
    local: {
      table,
      ...Object.fromEntries(Object.keys(store.tables).map((n) => [n, table(n)])),
    },
  };
});

vi.mock('./sync', () => ({
  enqueue: async (table: string, row: unknown) => {
    if (store.queueCalls >= store.failQueueAfter) throw new Error('QuotaExceededError');
    store.queueCalls += 1;
    store.queued.push({ table, row });
  },
  reportStorageFailure: () => undefined,
}));

/** A device with nothing on it and a queue that works. */
function reset(): void {
  for (const name of Object.keys(store.tables)) store.tables[name] = [];
  store.written = [];
  store.queued = [];
  store.failQueueAfter = Number.POSITIVE_INFINITY;
  store.queueCalls = 0;
}

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

  beforeEach(reset);

  it('gives a swap to another movement that movement’s range', async () => {
    store.tables.entries = [stored('Russian Twist', '8-12') as unknown as Record<string, unknown>];
    await setEntryExercise(ix, 0, finisher.id, idOf("Farmer's Carry"));
    const row = written();
    expect(row.repRange).toBe('30-40m');
    // The same row, changed only where the swap changes it.
    expect(row).toMatchObject({ id: 'entry-1', sets: 4, note: 'from the plan' });
    expect(row.exerciseId).toBe(idOf("Farmer's Carry"));
  });

  it('keeps the stored range when the movement stays, so a trainer’s survives', async () => {
    store.tables.entries = [stored('Russian Twist', '6-10') as unknown as Record<string, unknown>];
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

/**
 * One set of rules, applied before the first local write.
 *
 * A value the server refuses used to be written, queued, and only then turned
 * down — and because a refusal fails the whole push, that one row sat at the
 * head of every retry and the device neither pushed nor pulled again until
 * somebody signed out and lost the queue with it (GYM-73). A height typed key
 * by key was the likeliest way in: 180 passes through 1 and 18.
 *
 * The browser half — the fields that produce these numbers, and the set logged
 * afterwards reaching the server — is `bad-input.spec.ts`.
 */
describe('a write the server would refuse', () => {
  beforeEach(reset);

  it('never reaches the device or the queue', async () => {
    await expect(setHeight(18)).rejects.toBeInstanceOf(RefusedWrite);
    expect(store.written).toEqual([]);
    expect(store.queued).toEqual([]);
    expect(store.tables.profile).toEqual([]);
  });

  it('says the table, the field and the rule, and never the value', async () => {
    const err = (await setHeight(18).catch((e: unknown) => e)) as RefusedWrite;
    expect(err.table).toBe('profile');
    expect(err.about('heightCm')).toBe(true);
    expect(err.problems).toEqual([{ field: 'heightCm', rule: 'too_small' }]);
    expect(err.message).not.toContain('18');
  });

  it('lets a height inside the range through', async () => {
    await setHeight(180);
    expect(store.queued.map((q) => q.table)).toEqual(['profile']);
    expect((store.tables['profile']![0] as { heightCm: number }).heightCm).toBe(180);
  });

  it('turns down a bodyweight a dropped digit produced', async () => {
    await expect(logBodyWeight('2026-09-20', 7)).rejects.toBeInstanceOf(RefusedWrite);
    expect(store.tables.bodyLogs).toEqual([]);
    expect(store.queued).toEqual([]);
  });

  it('judges only the fields the change touched', async () => {
    /* A row that arrived from a phone predating the check. Renaming yourself
       must still work, or the fix would be a second way to be stuck. */
    store.tables['profile'] = [
      {
        id: 'p1',
        updatedAt: '2026-09-01T00:00:00.000Z',
        deletedAt: null,
        onboarded: true,
        split: 'sevenPattern',
        days: 3,
        where: 'gym',
        bias: 'none',
        blockStart: '2026-09-01',
        blockWeeks: 8,
        unit: 'kg',
        lang: 'en',
        theme: 'system',
        entryMode: 'buttons',
        plateLoader: true,
        heightCm: 18,
        sex: 'unspecified',
        name: '',
        birthYear: null,
        avatar: null,
        planId: null,
        planVersion: null,
      },
    ];
    await expect(setName('Sam')).resolves.toBeTruthy();
    expect((store.tables['profile']![0] as { name: string }).name).toBe('Sam');
  });

  it('merges a patch into the row rather than rebuilding it', async () => {
    /* `{...defaults, ...existing, ...patch}`. The row used to be listed out
       field by field, and a field missed off that list was dropped by every
       unrelated write — editing your name took you off your trainer's plan. */
    store.tables['profile'] = [
      {
        id: 'p1',
        updatedAt: '2026-09-01T00:00:00.000Z',
        deletedAt: null,
        onboarded: true,
        split: 'upperLower',
        days: 4,
        where: 'home',
        bias: 'none',
        blockStart: '2026-09-14',
        blockWeeks: 8,
        unit: 'lb',
        lang: 'hu',
        theme: 'dark',
        entryMode: 'ruler',
        plateLoader: false,
        heightCm: 181,
        sex: 'male',
        name: '',
        birthYear: 1990,
        avatar: null,
        planId: 'plan-1',
        planVersion: 3,
      },
    ];
    await setName('Sam');
    expect(store.tables['profile']![0]).toMatchObject({
      id: 'p1',
      name: 'Sam',
      planId: 'plan-1',
      planVersion: 3,
      entryMode: 'ruler',
      plateLoader: false,
      unit: 'lb',
      lang: 'hu',
      theme: 'dark',
      heightCm: 181,
      birthYear: 1990,
      split: 'upperLower',
      days: 4,
      where: 'home',
    });
  });
});

/**
 * One local transaction per action.
 *
 * A row and the queue entry that says it has to be sent are one change. Until
 * they were written together the gap between them was reachable — a reload
 * during a service-worker update, a store that filled up between the two — and
 * it left a set saved on the phone that the server would never hear about, or
 * a split half installed: slots retired with nothing to replace them.
 */
describe('an action that fails partway', () => {
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
  const oldSlots: Slot[] = buildSlots(findSplit('sevenPattern')!, 3).map((s, i) => ({
    ...s,
    id: `old-${i}`,
    updatedAt: stamp,
    deletedAt: null,
  }));
  const snap = (): Snapshot => ({
    patterns,
    exercises: [],
    slots: oldSlots,
    splitPeriods: [],
    entries: [],
    logs: [],
    bodyLogs: [],
    goals: [],
    profile: null,
  });

  beforeEach(reset);

  it('leaves no set on the phone when its queue entry cannot be written', async () => {
    store.failQueueAfter = 0;
    await expect(
      logSet({
        date: '2026-09-20',
        session: 'A',
        exerciseId: 'ex-goblet-squat',
        setNo: 1,
        weight: 60,
        reps: 8,
        rir: 2,
      }),
    ).rejects.toThrow('QuotaExceededError');
    expect(store.tables.logs).toEqual([]);
  });

  it('installs a whole split or none of it', async () => {
    store.tables.slots = oldSlots.map((s) => ({ ...s }) as unknown as Record<string, unknown>);
    // Two of the old slots retire, and then the device stops taking changes.
    store.failQueueAfter = 2;

    await expect(
      applySplit(snap(), { split: 'upperLower', days: 4, where: 'gym', bias: 'none' }),
    ).rejects.toThrow('QuotaExceededError');

    expect(store.written).toEqual([]);
    expect(store.queued).toEqual([]);
    // Every old slot is still live: nothing was retired, nothing replaced it.
    expect(store.tables.slots.map((s) => s.deletedAt)).toEqual(oldSlots.map(() => null));
    expect(store.tables.splitPeriods).toEqual([]);
    expect(store.tables.profile).toEqual([]);
  });
});
