import { describe, expect, it } from 'vitest';
import { allLogs, index } from '../src/model';
import type { SetLog, Snapshot } from '../src/types';
import { seedSnapshot } from './fixture';

/**
 * Logs come out of IndexedDB in primary-key order, and the primary key is a
 * random UUID — so they arrive in no order at all.
 *
 * `index()` sorts them by date, then session, then set number, and the screens
 * rely on it rather than sorting again: Train lists a card's sets in index
 * order (`sessionPlan` → `row.logs`, `train/page.tsx`), and so does the day
 * sheet (`dayDetail`). Without the sort, both would show sets in UUID order.
 */
describe('logs are read in the order they happened', () => {
  const base = seedSnapshot('sevenPattern', 3);
  const exerciseId = base.exercises[0]!.id;

  let n = 0;
  const set = (date: string): SetLog => ({
    id: `log-${++n}`,
    updatedAt: date,
    deletedAt: null,
    date,
    session: 'A',
    exerciseId,
    setNo: 1,
    weight: 60,
    reps: 8,
    rir: 2,
    note: '',
  });

  /** Thirty sessions on thirty different dates. */
  const history: SetLog[] = [
    ...Array.from({ length: 15 }, (_, i) => set(`2026-01-${String(i + 1).padStart(2, '0')}`)),
    ...Array.from({ length: 15 }, (_, i) => set(`2026-06-${String(i + 1).padStart(2, '0')}`)),
  ];

  /**
   * Handed back newest-first, which a UUID-keyed store is as likely to do as
   * any other order. Reversed rather than shuffled on purpose: every pair is
   * out of order, so the sort cannot pass by luck.
   */
  const scrambled = [...history].reverse();

  const snap: Snapshot = { ...base, logs: scrambled };

  it('sorts them by date regardless of how they arrived', () => {
    const dates = allLogs(index(snap)).map((l) => l.date);
    expect(dates).toEqual([...dates].sort());
  });

  it('keeps one day in session and set order', () => {
    // Train lists a card's sets in index order; without these tiebreaks they
    // would come out in UUID order. Every date above is distinct, so only the
    // date key was ever checked.
    const at = (id: string, session: string, setNo: number): SetLog => ({
      ...set('2026-06-20'),
      id,
      session,
      setNo,
    });
    const ix = index({
      ...base,
      logs: [at('x1', 'B', 1), at('x2', 'A', 3), at('x3', 'A', 1), at('x4', 'A', 2)],
    });
    expect(allLogs(ix).map((l) => `${l.session}${l.setNo}`)).toEqual(['A1', 'A2', 'A3', 'B1']);
  });
});
