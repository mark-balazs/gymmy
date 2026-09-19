import { describe, expect, it } from 'vitest';
import { CATALOGUE, buildProgram, dayDetail, index, setsPerDay } from '../src';
import { logsFor, seedSnapshot } from './fixture';

/**
 * What a given day contained.
 *
 * The claim worth testing is that this is built from the **logs** and not from
 * the plan. The plan is rebuilt whenever somebody changes split, so a day in
 * September that read itself off the plan would silently start describing
 * whatever the week looks like now — including exercises that were not invented
 * yet when those sets were done.
 */
describe('dayDetail', () => {
  const snap = seedSnapshot();
  const squat = snap.exercises.find((e) => e.name === 'Goblet Squat')!;
  const bench = snap.exercises.find((e) => e.name === 'Barbell Bench Press')!;

  const on = (date: string) =>
    index({
      ...snap,
      logs: [
        ...logsFor(squat.id, [{ weight: 60, reps: 8, rir: 2 }], date),
        ...logsFor(
          bench.id,
          [
            { weight: 80, reps: 5, rir: 1 },
            { weight: 80, reps: 4, rir: 0 },
          ],
          date,
        ),
      ],
    });

  it('says nothing about a day with no training', () => {
    expect(dayDetail(on('2026-09-07'), '2026-09-08')).toBeNull();
  });

  it('groups the sets by exercise', () => {
    // The order here comes from input order, since every set shares one stamp;
    // the order itself is held by "lists the exercises in the order they were
    // started", below.
    const day = dayDetail(on('2026-09-07'), '2026-09-07')!;
    expect(day.sets).toBe(3);
    expect(day.exercises.map((e) => e.exercise.name)).toEqual([
      'Goblet Squat',
      'Barbell Bench Press',
    ]);
    expect(day.exercises[1]!.logs).toHaveLength(2);
    expect(day.exercises[0]!.pattern?.key).toBe('squat');
  });

  it('names which day of the plan it was', () => {
    // The plan's label, not the weekday: 2026-09-07 is a Monday and it is 'A'.
    expect(dayDetail(on('2026-09-07'), '2026-09-07')!.session).toBe('A');
  });

  it('declines to name a day that held two sessions', () => {
    // Two sessions in one date is unusual but legal, and calling it "day A"
    // would be picking one arbitrarily.
    const ix = index({
      ...snap,
      logs: [
        ...logsFor(squat.id, [{ weight: 60, reps: 8, rir: 2 }], '2026-09-07'),
        ...logsFor(bench.id, [{ weight: 80, reps: 5, rir: 1 }], '2026-09-07').map((l) => ({
          ...l,
          session: 'B',
        })),
      ],
    });
    expect(dayDetail(ix, '2026-09-07')!.session).toBeNull();
  });

  it('lists the exercises in the order they were started', () => {
    /* The trap this exists for: the index sorts logs by date, session and then
     * *set number*, so every first set comes before every second set and the
     * order exercises appear in is whatever the store happened to return.
     * Here the store returns the bench sets first while the squat was actually
     * performed first — reading first-appearance would get it backwards. */
    const at = (exerciseId: string, setNo: number, minute: number) => ({
      id: `${exerciseId}-${setNo}`,
      updatedAt: `2026-09-07T18:${String(minute).padStart(2, '0')}:00.000Z`,
      deletedAt: null,
      date: '2026-09-07',
      session: 'A',
      exerciseId,
      setNo,
      weight: 60,
      reps: 8,
      rir: 2,
      note: '',
    });

    const ix = index({
      ...snap,
      logs: [at(bench.id, 1, 30), at(bench.id, 2, 34), at(squat.id, 1, 10), at(squat.id, 2, 14)],
    });

    expect(dayDetail(ix, '2026-09-07')!.exercises.map((e) => e.exercise.name)).toEqual([
      'Goblet Squat',
      'Barbell Bench Press',
    ]);
  });

  it('still shows an exercise that has since left the plan, even once retired', () => {
    /* The plan is rebuilt on every split change; the history is not. The first
       version of this had no plan at all, so "left the plan" was never set up.
       Here the bench is out of the week and retired from the library, which is
       the case that goes wrong if a day reads `exercises`, the list of what is
       still offered, instead of `exerciseById`, everything that resolves. */
    const retiring = CATALOGUE.map((c) =>
      c.name === 'Barbell Bench Press' ? { ...c, retired: true as const } : c,
    );
    const plan = buildProgram(index(snap, retiring), { days: 3, where: 'gym', bias: 'none' });
    const ix = index(
      {
        ...snap,
        entries: plan.map((d, i) => ({
          ...d,
          id: `entry-${i}`,
          updatedAt: '2026-09-01T00:00:00.000Z',
          deletedAt: null,
        })),
        logs: [
          ...logsFor(squat.id, [{ weight: 60, reps: 8, rir: 2 }], '2026-09-07'),
          ...logsFor(
            bench.id,
            [
              { weight: 80, reps: 5, rir: 1 },
              { weight: 80, reps: 4, rir: 0 },
            ],
            '2026-09-07',
          ),
        ],
      },
      retiring,
    );
    expect(ix.entries.some((e) => e.exerciseId === ix.exerciseIdOf(bench.id))).toBe(false);
    expect(ix.exercises.some((e) => e.name === 'Barbell Bench Press')).toBe(false);
    const day = dayDetail(ix, '2026-09-07')!;
    expect(day.exercises.find((e) => e.exercise.name === 'Barbell Bench Press')?.logs).toHaveLength(
      2,
    );
  });
});

describe('setsPerDay', () => {
  const snap = seedSnapshot();
  const squat = snap.exercises[0]!;
  const ix = index({
    ...snap,
    logs: [
      ...logsFor(squat.id, [{ weight: 60, reps: 8, rir: 2 }], '2026-09-01'),
      ...logsFor(
        squat.id,
        [
          { weight: 60, reps: 8, rir: 2 },
          { weight: 60, reps: 7, rir: 1 },
        ],
        '2026-09-03',
      ),
      ...logsFor(squat.id, [{ weight: 62.5, reps: 6, rir: 2 }], '2026-09-20'),
    ],
  });

  it('counts a day at a time', () => {
    const counts = setsPerDay(ix, '2026-09-01', '2026-09-10');
    expect(counts.get('2026-09-01')).toBe(1);
    expect(counts.get('2026-09-03')).toBe(2);
  });

  it('leaves untrained days out rather than storing a zero', () => {
    // The calendar asks "did anything happen here" — an absent key is that
    // answer, and a map full of zeroes for every untrained day is not.
    const counts = setsPerDay(ix, '2026-09-01', '2026-09-10');
    expect(counts.has('2026-09-02')).toBe(false);
  });

  it('respects the window', () => {
    const counts = setsPerDay(ix, '2026-09-01', '2026-09-10');
    expect(counts.has('2026-09-20')).toBe(false);
    expect(setsPerDay(ix, '2026-09-01', '2026-09-30').get('2026-09-20')).toBe(1);
    // The calendar passes the month's last day as `to`, so the end is inside.
    expect(setsPerDay(ix, '2026-09-01', '2026-09-20').get('2026-09-20')).toBe(1);
  });
});
