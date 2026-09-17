import { describe, expect, it } from 'vitest';
import { allLogs, index } from '../src/model';
import { lastSession } from '../src/coach';
import type { SetLog, Snapshot } from '../src/types';
import { seedSnapshot } from './fixture';

/**
 * Logs come out of IndexedDB in primary-key order, and the primary key is a
 * random UUID — so they arrive in no order at all.
 *
 * Everything that reasons about "recently" was therefore reasoning about an
 * arbitrary sample. `effortCheck` asks whether your recent sets have been too
 * easy; sampling the whole history at random meant its verdict could not
 * improve when your training did, and it would keep telling somebody who had
 * fixed the problem months ago that their sets were still too light.
 */
describe('logs are read in the order they happened', () => {
  const base = seedSnapshot('sevenPattern', 3);
  const exerciseId = base.exercises[0]!.id;

  let n = 0;
  const set = (date: string, rir: number): SetLog => ({
    id: `log-${++n}`,
    updatedAt: date,
    deletedAt: null,
    date,
    session: 'A',
    exerciseId,
    setNo: 1,
    weight: 60,
    reps: 8,
    rir,
    note: '',
  });

  /** Easy sets months ago, hard sets lately — somebody who fixed it. */
  const history: SetLog[] = [
    ...Array.from({ length: 15 }, (_, i) => set(`2026-01-${String(i + 1).padStart(2, '0')}`, 4)),
    ...Array.from({ length: 15 }, (_, i) => set(`2026-06-${String(i + 1).padStart(2, '0')}`, 0)),
  ];

  /**
   * Handed back newest-first, which a UUID-keyed store is as likely to do as
   * any other order. Reversed rather than shuffled on purpose: a shuffle leaves
   * the last fifteen a coin toss, so the test would pass roughly half the time
   * on the very bug it exists to catch.
   */
  const scrambled = [...history].reverse();

  const snap: Snapshot = { ...base, logs: scrambled };

  it('sorts them by date regardless of how they arrived', () => {
    const dates = allLogs(index(snap)).map((l) => l.date);
    expect(dates).toEqual([...dates].sort());
  });
});
