import { describe, expect, it } from 'vitest';
import { index } from '../src/model';
import {
  planFill,
  planIsStale,
  planOf,
  planSessions,
  planSlotKey,
  planToDrafts,
  unresolvedExercises,
  type PlanShape,
  type PlanSlot,
} from '../src/plans';
import { seedSnapshot } from './fixture';

/**
 * A plan has to survive crossing from one account into another, and almost
 * everything that can go wrong there goes wrong silently.
 *
 * The one that would have hurt most: exercise rows are keyed
 * `sha256(userId, 'exercise', name)`, so the trainer's id for a bench press is
 * a string that matches nothing in the athlete's library. A plan built around
 * ids would apply without an error and produce a week with no exercises in it.
 * These assert that a plan travels by *name*, and that a name this account does
 * not have costs the athlete that exercise rather than that session.
 */

const ix = index(seedSnapshot());

const slot = (over: Partial<PlanSlot> = {}): PlanSlot => ({
  sessionIndex: 0,
  position: 0,
  key: 'main',
  name: 'main',
  requiredRole: 'Any',
  patternKeys: ['push'],
  dayKey: 'push',
  exerciseName: null,
  sets: 3,
  repRange: '5-8',
  ...over,
});

const plan = (slots: PlanSlot[]): PlanShape => ({
  name: "Coach's block",
  description: '',
  days: 3,
  where: 'gym',
  slots,
});

describe('planToDrafts', () => {
  it('hands installSkeleton the same shape a preset does', () => {
    // Which is the whole point: a shared plan is a third caller of the one
    // funnel, not a second way of putting a week into effect.
    const drafts = planToDrafts(plan([slot({ sessionIndex: 0, position: 0 })]));
    expect(drafts).toEqual([
      {
        key: 'main',
        name: 'main',
        requiredRole: 'Any',
        position: 0,
        sessionIndex: 0,
        patternKeys: ['push'],
        dayKey: 'push',
      },
    ]);
  });

  it('orders by session and then position, whatever order it arrived in', () => {
    const drafts = planToDrafts(
      plan([
        slot({ sessionIndex: 1, position: 1 }),
        slot({ sessionIndex: 0, position: 1 }),
        slot({ sessionIndex: 1, position: 0 }),
        slot({ sessionIndex: 0, position: 0 }),
      ]),
    );
    expect(drafts.map((d) => planSlotKey(d.sessionIndex, d.position))).toEqual([
      '0:0',
      '0:1',
      '1:0',
      '1:1',
    ]);
  });
});

describe('planFill', () => {
  it('resolves the trainer’s exercise against this account’s own library', () => {
    const fill = planFill(plan([slot({ exerciseName: 'Barbell Bench Press' })]), ix);
    const mine = ix.exercises.find((x) => x.name === 'Barbell Bench Press')!;
    expect(fill.get('0:0')?.exerciseId).toBe(mine.id);
  });

  it('matches a name the way a person would', () => {
    const fill = planFill(plan([slot({ exerciseName: '  barbell BENCH press ' })]), ix);
    expect(fill.get('0:0')?.exerciseId).not.toBeNull();
  });

  it('keeps the sets and reps when the exercise cannot be found', () => {
    /* The claim in the doc comment, asserted: a plan written around a machine
       you do not have should cost you that exercise, not that session. An
       exercise id from the trainer's account is exactly this case — it matches
       nothing, because ids are derived from a user id. */
    const fill = planFill(
      plan([slot({ exerciseName: 'Reverse Hyper Machine', sets: 4, repRange: '8-12' })]),
      ix,
    );
    expect(fill.get('0:0')).toEqual({ exerciseId: null, sets: 4, repRange: '8-12' });
  });

  it('leaves a slot the trainer deliberately left open to the generator', () => {
    const fill = planFill(plan([slot({ exerciseName: null })]), ix);
    expect(fill.get('0:0')?.exerciseId).toBeNull();
  });
});

describe('unresolvedExercises', () => {
  it('names what this account is missing, once each and sorted', () => {
    const p = plan([
      slot({ position: 0, exerciseName: 'Barbell Bench Press' }),
      slot({ position: 1, exerciseName: 'Reverse Hyper Machine' }),
      slot({ position: 2, exerciseName: 'Belt Squat' }),
      slot({ position: 3, exerciseName: 'Reverse Hyper Machine' }),
      slot({ position: 4, exerciseName: null }),
    ]);
    expect(unresolvedExercises(p, ix)).toEqual(['Belt Squat', 'Reverse Hyper Machine']);
  });

  it('says nothing when the whole plan lands', () => {
    const p = plan([
      slot({ position: 0, exerciseName: 'Goblet Squat' }),
      slot({ position: 1, exerciseName: 'Barbell Row' }),
    ]);
    expect(unresolvedExercises(p, ix)).toEqual([]);
  });
});

describe('planOf', () => {
  it('reads a plan that is in effect', () => {
    expect(planOf({ planId: 'plan-1', planVersion: 3 })).toEqual({ id: 'plan-1', version: 3 });
  });

  it('treats a profile that predates the columns as having no plan', () => {
    /* The trap this function exists for. The server only re-sends a row whose
       `seq` moved and adding a column does not move it, so a device that synced
       earlier holds a profile with no `planId` key at all. Read directly,
       `profile.planId !== null` is true on those devices — `undefined !== null`
       — and the app goes hunting for a plan nobody ever applied. */
    expect(planOf({} as { planId?: string | null })).toBeNull();
    expect(planOf(null)).toBeNull();
  });

  it('refuses half a plan', () => {
    // Either both or neither. A version with no plan cannot be offered an
    // update, and a plan with no version cannot be compared against one.
    expect(planOf({ planId: 'plan-1', planVersion: null })).toBeNull();
    expect(planOf({ planId: null, planVersion: 3 })).toBeNull();
  });
});

describe('planIsStale', () => {
  it('is true only when the trainer has published something newer', () => {
    const on = { id: 'p', version: 2 };
    expect(planIsStale(on, 3)).toBe(true);
    expect(planIsStale(on, 2)).toBe(false);
    // A version behind the one applied is not an update; it is a stale read.
    expect(planIsStale(on, 1)).toBe(false);
    expect(planIsStale(null, 9)).toBe(false);
  });
});

describe('planSessions', () => {
  it('counts the days a plan actually describes, not the days it claims', () => {
    // The cadence a trainer typed and the skeleton they built can disagree, and
    // the skeleton is the one that becomes somebody's week.
    const p = plan([
      slot({ sessionIndex: 0, position: 0 }),
      slot({ sessionIndex: 0, position: 1 }),
      slot({ sessionIndex: 2, position: 0 }),
    ]);
    expect(planSessions(p)).toBe(2);
  });
});
