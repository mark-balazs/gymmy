/** Builds a realistic snapshot from the seed data, without touching a database. */

import { index, mondayOf, type Indexed } from '../src/model';
import { SEED_EXERCISES, SEED_PATTERNS } from '../src/seed';
import { buildSlots, findSplit } from '../src/splits';
import type {
  Exercise,
  Pattern,
  SetLog,
  Slot,
  Snapshot,
  SplitKey,
  SplitPeriod,
} from '../src/types';

let n = 0;
const id = (prefix: string) => `${prefix}-${++n}`;
const now = new Date().toISOString();

export function seedSnapshot(
  split: Exclude<SplitKey, 'custom'> = 'sevenPattern',
  days = 3,
): Snapshot {
  const patterns: Pattern[] = SEED_PATTERNS.map((p, i) => ({
    id: id('pat'),
    updatedAt: now,
    deletedAt: null,
    key: p.key,
    name: p.key,
    role: p.role,
    counts: p.counts,
    position: i,
  }));
  const byKey = new Map(patterns.map((p) => [p.key, p.id]));

  const exercises: Exercise[] = SEED_EXERCISES.map((x) => ({
    id: id('ex'),
    updatedAt: now,
    deletedAt: null,
    name: x.name,
    patternId: byKey.get(x.pattern)!,
    where: x.where,
    tags: x.tags,
    description: x.description,
    images: x.images,
  }));

  // Materialised from the real preset, so the tests exercise the same slot
  // shape the app ships rather than a hand-written approximation.
  const slots: Slot[] = buildSlots(findSplit(split)!, days).map((s) => ({
    ...s,
    id: id('slot'),
    updatedAt: now,
    deletedAt: null,
  }));

  // The opening period, exactly as a real account gets one at sign-up.
  const splitPeriods: SplitPeriod[] = [
    {
      id: id('period'),
      updatedAt: now,
      deletedAt: null,
      split,
      days,
      startWeek: mondayOf(new Date()),
      patternKeys: [...findSplit(split)!.covers],
    },
  ];

  return {
    patterns,
    exercises,
    slots,
    splitPeriods,
    entries: [],
    logs: [],
    refSets: [],
    bodyLogs: [],
    profile: {
      id: 'profile-1',
      updatedAt: now,
      deletedAt: null,
      onboarded: true,
      split,
      days,
      where: 'gym',
      bias: 'none',
      blockStart: mondayOf(new Date()),
      blockWeeks: 8,
      unit: 'kg',
      lang: 'en',
      theme: 'system',
      heightCm: null,
      sex: 'unspecified',
    },
  };
}

export const seedIndex = (): Indexed => index(seedSnapshot());

export function withEntries(
  snap: Snapshot,
  drafts: Omit<import('../src/types').ProgramEntry, 'id' | 'updatedAt' | 'deletedAt'>[],
): Indexed {
  return index({
    ...snap,
    entries: drafts.map((d) => ({ ...d, id: id('entry'), updatedAt: now, deletedAt: null })),
  });
}

/** A split period, for testing how a week is scored at a point in time. */
export function period(
  split: Exclude<SplitKey, 'custom'>,
  startWeek: string,
  days = 3,
): SplitPeriod {
  return {
    id: id('period'),
    updatedAt: now,
    deletedAt: null,
    split,
    days,
    startWeek,
    patternKeys: [...findSplit(split)!.covers],
  };
}

export function logsFor(
  exerciseId: string,
  sets: { weight: number; reps: number; rir: number }[],
  date = '2026-09-07',
): SetLog[] {
  return sets.map((s, i) => ({
    id: id('log'),
    updatedAt: now,
    deletedAt: null,
    date,
    session: 'A',
    exerciseId,
    setNo: i + 1,
    weight: s.weight,
    reps: s.reps,
    rir: s.rir,
    note: '',
  }));
}
