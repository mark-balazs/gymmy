import { describe, expect, it } from 'vitest';
import { CATALOGUE } from '../src/catalogue';
import { buildProgram } from '../src/coach';
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
 * Catalogue ids are shared by every account now, but an account from before the
 * catalogue still has its own ids on every row it stored, read as aliases by
 * index(). An id taken from one account can still mean nothing in another, and
 * a plan built on ids would apply cleanly into an empty week. A name resolves
 * against either. These assert that a plan travels by *name*, and that a name
 * this account does not have costs the athlete that exercise rather than that
 * session.
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
    // The exact id: `not.toBeNull()` also passed for undefined and for a wrong one.
    const fill = planFill(plan([slot({ exerciseName: '  barbell BENCH press ' })]), ix);
    expect(fill.get('0:0')?.exerciseId).toBe('ex-barbell-bench-press');
  });

  it('keeps the sets and reps when the exercise cannot be found', () => {
    /* The claim in the doc comment, asserted: a plan written around a machine
       you do not have should cost you that exercise, not that session. */
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

  it('honours an off-plan movement the trainer chose, and never installs a retired one', () => {
    /* Off-plan bounds the generator and nothing else: a trainer may name a
       thruster on purpose, and it lands. A retired entry is never offered or
       programmed again, a plan included, and the warning before applying has
       to say so. No plan test named either before. */
    const retiredIx = index(
      seedSnapshot(),
      CATALOGUE.map((c) =>
        c.name === 'Barbell Back Squat' ? { ...c, retired: true as const } : c,
      ),
    );
    const p = plan([
      slot({ position: 0, exerciseName: 'Thruster' }),
      slot({ position: 1, exerciseName: 'Barbell Back Squat' }),
    ]);
    const fill = planFill(p, retiredIx);
    expect(fill.get('0:0')?.exerciseId).toBe('ex-thruster');
    expect(fill.get('0:1')?.exerciseId).toBeNull();
    expect(unresolvedExercises(p, retiredIx)).toEqual(['Barbell Back Squat']);
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
    // The warning shown before applying must agree with what planFill installs,
    // so a name written the way a person would is not flagged as missing.
    const p = plan([
      slot({ position: 0, exerciseName: 'Goblet Squat' }),
      slot({ position: 1, exerciseName: 'Barbell Row' }),
      slot({ position: 2, exerciseName: '  barbell BENCH press ' }),
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

describe('a plan whose day numbers have a gap', () => {
  /* The API takes any day number from 0 to 13, so a plan can arrive as days 0
     and 2 with nothing at 1. The coach screen never builds one; a direct POST
     or PUT can. Installed as written, the week was two days long — Day A and
     an empty Day B — and the trainer's day at 2 was never generated. */
  const gapped = plan([
    slot({ sessionIndex: 0, position: 0, exerciseName: 'Barbell Bench Press' }),
    slot({ sessionIndex: 0, position: 1, exerciseName: 'Barbell Row' }),
    slot({ sessionIndex: 2, position: 0, exerciseName: 'Goblet Squat', sets: 5 }),
  ]);

  it('installs every day it describes, even when the trainer skipped a number', () => {
    /* What `installSkeleton` does, in the order it does it: the drafts become
       slots, the generator fills `planSessions` days, and the plan's choices
       land on top by day and position. */
    const base = seedSnapshot();
    const slots = planToDrafts(gapped).map((d, i) => ({
      ...d,
      id: `plan-slot-${i}`,
      updatedAt: '2026-09-01T00:00:00.000Z',
      deletedAt: null,
    }));
    const days = planSessions(gapped);
    const draft = buildProgram(index({ ...base, slots, entries: [] }), {
      days,
      where: 'gym',
      bias: 'none',
    });
    const fill = planFill(gapped, index(base));
    const byId = new Map(slots.map((s) => [s.id, s]));
    const week = draft.map((d) => {
      const want = fill.get(planSlotKey(d.sessionIndex, byId.get(d.slotId)!.position));
      return { ...d, ...(want ? { exerciseId: want.exerciseId ?? d.exerciseId } : {}) };
    });

    expect(days).toBe(2);
    const named = (session: number) =>
      week
        .filter((e) => e.sessionIndex === session)
        .map((e) => ix.exerciseById.get(e.exerciseId ?? '')?.name);
    expect(named(0)).toEqual(['Barbell Bench Press', 'Barbell Row']);
    expect(named(1)).toEqual(['Goblet Squat']);
  });

  it('numbers the days in order, and keys each fill to the day it lands on', () => {
    expect(planToDrafts(gapped).map((d) => d.sessionIndex)).toEqual([0, 0, 1]);
    expect([...planFill(gapped, ix).keys()].sort()).toEqual(['0:0', '0:1', '1:0']);
    expect(planFill(gapped, ix).get('1:0')?.sets).toBe(5);
  });
});
