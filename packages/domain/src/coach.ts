/**
 * The part that used to be the user's job.
 *
 *  1. Build a whole week from three plain answers, guaranteeing that every
 *     counted pattern is covered.
 *  2. Work out what to lift today by applying double progression to history.
 *
 * Everything here returns structured data, never a finished sentence — the UI
 * owns the wording so both languages read naturally rather than being
 * assembled from fragments.
 */

import {
  allLogs,
  coveragePatterns,
  index,
  num,
  programRows,
  slotsForSession,
  type Indexed,
} from './model';
import type { Bias, Exercise, Pattern, ProgramEntry, Slot, Suggestion, Where } from './types';

export interface BuildInput {
  days: number;
  where: Where;
  bias: Bias;
}

/** An entry without its sync fields; the caller stamps those on. */
export type DraftEntry = Omit<ProgramEntry, keyof import('./types').Synced>;

const pick = <T>(list: T[], i: number): T | null =>
  list.length ? (list[((i % list.length) + list.length) % list.length] as T) : null;

/**
 * A movement the app will record but will never put in somebody's week.
 *
 * The library is about to gain conditioning work — thrusters, wall balls,
 * burpees, box jumps — so that a CrossFit class can be logged at all. Every one
 * of those is a legitimate thing to have done and a terrible thing to be
 * *prescribed*: the generator hands a slot a rep range of 6-12 and double
 * progression tells you to add weight when it felt easy, which is meaningless
 * advice about a medicine ball that weighs nine kilos forever.
 *
 * It is a tag rather than a column because `tags` is already a string array on
 * the wire, in Dexie and in Postgres — so this costs no migration, no schema
 * change and no version bump, and an older row that has never heard of it
 * simply does not carry it.
 *
 * It bounds the *generator* and nothing else. A trainer may still name one of
 * these in a plan deliberately, and anybody may log one.
 */
export const OFF_PLAN = 'offPlan';

/** Matched on pattern identity, never on name — names are translated and
 *  renameable, so name matching would break the generator in any non-English UI. */
function pool(
  ix: Indexed,
  pattern: Pattern | null,
  where: Where | null,
  tag: string | null,
): Exercise[] {
  if (!pattern) return [];
  return ix.exercises.filter((e) => {
    if (e.patternId !== pattern.id) return false;
    // In the base filter, not the `tag` argument: `pool` is called again with a
    // null tag whenever a bias leaves a pattern empty, and an off-plan movement
    // must not come back through that fallback.
    if (e.tags.includes(OFF_PLAN)) return false;
    if (where === 'home' && e.where !== 'home') return false;
    if (tag && !e.tags.includes(tag)) return false;
    return true;
  });
}

interface PatternSets {
  counted: Pattern[];
  lower: Pattern[];
  upper: Pattern[];
  mid: Pattern[];
  isolation: Pattern | null;
}

function patternSets(ix: Indexed): PatternSets {
  const counted = coveragePatterns(ix);
  return {
    counted,
    lower: counted.filter((p) => p.role === 'Lower'),
    upper: counted.filter((p) => p.role === 'Upper'),
    mid: counted.filter((p) => p.role === 'Midline'),
    isolation: ix.patterns.find((p) => !p.counts) ?? null,
  };
}

const REP_RANGE = { big: '6-12', accessory: '6-12', isolation: '10-15', finisher: '30-40m' };

/**
 * Build `days` sessions that between them touch every counted pattern.
 *
 * Patterns rotate across days so the week is varied, then a repair pass forces
 * in anything the rotation missed. That repair pass is the reason coverage is a
 * guarantee rather than a hope — without it, an unlucky combination of days,
 * equipment and bias could silently ship a week with a hole in it.
 */
export function buildProgram(ix: Indexed, input: BuildInput): DraftEntry[] {
  const pats = patternSets(ix);
  const slots = ix.slots;
  const entries = new Map<string, DraftEntry>();
  const used = new Set<string>();

  /** Patterns a slot will accept. A pattern constraint beats a role constraint:
   *  a push day needs a push, not merely something upper-body. */
  const accepts = (slot: Slot): Pattern[] => {
    if (slot.patternKeys?.length) {
      return ix.patterns.filter((p) => p.key && slot.patternKeys!.includes(p.key));
    }
    if (slot.key === 'isolation') return pats.isolation ? [pats.isolation] : pats.counted;
    const role = slot.requiredRole ?? 'Any';
    return role === 'Any' ? ix.patterns : ix.patterns.filter((p) => p.role === role);
  };

  const repRangeFor = (slot: Slot): string =>
    slot.key === 'finisher'
      ? REP_RANGE.finisher
      : slot.key === 'isolation'
        ? REP_RANGE.isolation
        : REP_RANGE.big;

  const choose = (pattern: Pattern | null, tag: string | null, seed: number): Exercise | null => {
    let list = pool(ix, pattern, input.where, tag);
    if (!list.length) list = pool(ix, pattern, input.where, null);
    if (!list.length) list = pool(ix, pattern, null, null);
    const fresh = list.filter((e) => !used.has(e.id));
    const chosen = pick(fresh.length ? fresh : list, seed);
    if (chosen) used.add(chosen.id);
    return chosen;
  };

  const has = (pattern: Pattern): boolean =>
    [...entries.values()].some((e) => {
      const ex = e.exerciseId ? ix.exerciseById.get(e.exerciseId) : null;
      return ex?.patternId === pattern.id;
    });

  for (let d = 0; d < input.days; d++) {
    slotsForSession(ix, d).forEach((slot, position) => {
      const candidates = accepts(slot);

      // Prefer a pattern the week has not touched yet, then rotate by day and
      // position. That rotation is what makes the Midline finisher alternate
      // rotation and carry across the week rather than picking one and
      // stranding the other.
      const missing = candidates.find((p) => p.counts && !has(p));
      const pattern = missing ?? pick(candidates, d + position);

      const tag = slot.key === 'isolation' && input.bias !== 'none' ? input.bias : null;
      const exercise = choose(pattern, tag, d + position);

      entries.set(`${d}:${slot.id}`, {
        sessionIndex: d,
        slotId: slot.id,
        exerciseId: exercise?.id ?? null,
        sets: 3,
        repRange: repRangeFor(slot),
        startWeight: null,
        note: '',
      });
    });
  }

  repair(ix, entries, pats, input, used, has, accepts);
  return [...entries.values()];
}

/**
 * Forces any untouched pattern into a slot that will accept it.
 *
 * This is what makes coverage a guarantee rather than a hope. Two rules matter:
 * it only ever writes into a slot whose own constraint permits the pattern — so
 * the repair cannot create the violation it exists to prevent — and it prefers
 * to overwrite a slot whose pattern is already covered elsewhere, so plugging
 * one gap does not open another.
 *
 * If no slot accepts the pattern, the split genuinely cannot cover it at this
 * number of days. That is prevented up front by each preset's `minDays`.
 */
function repair(
  ix: Indexed,
  entries: Map<string, DraftEntry>,
  pats: PatternSets,
  input: BuildInput,
  used: Set<string>,
  has: (p: Pattern) => boolean,
  accepts: (slot: Slot) => Pattern[],
): void {
  const patternOf = (entry: DraftEntry | undefined): Pattern | null => {
    const ex = entry?.exerciseId ? ix.exerciseById.get(entry.exerciseId) : null;
    return ex ? (ix.patternById.get(ex.patternId) ?? null) : null;
  };

  for (const pattern of pats.counted) {
    if (has(pattern)) continue;

    let list = pool(ix, pattern, input.where, null);
    if (!list.length) list = pool(ix, pattern, null, null);
    if (!list.length) continue;
    const exercise = list.find((e) => !used.has(e.id)) ?? list[0]!;

    // Every slot across the week that would legally take this pattern.
    const candidates: { day: number; slot: Slot }[] = [];
    for (let d = 0; d < input.days; d++) {
      for (const slot of slotsForSession(ix, d)) {
        if (accepts(slot).some((p) => p.id === pattern.id)) candidates.push({ day: d, slot });
      }
    }
    if (!candidates.length) continue;

    const target =
      // Prefer a slot whose current pattern appears more than once in the week.
      candidates.find(({ day, slot }) => {
        const current = patternOf(entries.get(`${day}:${slot.id}`));
        if (!current) return true;
        const uses = [...entries.values()].filter((e) => patternOf(e)?.id === current.id).length;
        return uses > 1;
      }) ?? candidates[0]!;

    const key = `${target.day}:${target.slot.id}`;
    const existing = entries.get(key);
    entries.set(key, {
      sessionIndex: target.day,
      slotId: target.slot.id,
      sets: existing?.sets ?? 3,
      repRange: existing?.repRange ?? REP_RANGE.accessory,
      startWeight: existing?.startWeight ?? null,
      note: existing?.note ?? '',
      exerciseId: exercise.id,
    });
    used.add(exercise.id);
  }
}

/** Legal alternatives for "swap this exercise". */
export function swapOptions(
  ix: Indexed,
  sessions: number,
  sessionIndex: number,
  slotId: string,
  where: Where,
): Exercise[] {
  const row = programRows(ix, sessions).find(
    (r) => r.session === sessionIndex && r.slot.id === slotId,
  );
  const slot = row?.slot;
  const current = row?.pattern ?? null;

  return ix.exercises.filter((e) => {
    const pattern = ix.patternById.get(e.patternId);
    if (!pattern) return false;
    // The swap sheet offers alternatives for a planned slot, so it is bound by
    // the same rule as the generator that filled it.
    if (e.tags.includes(OFF_PLAN)) return false;
    if (where === 'home' && e.where !== 'home') return false;

    // A pinned slot (a push day's main lift) only offers that pattern.
    if (slot?.patternKeys?.length) {
      return !!pattern.key && slot.patternKeys.includes(pattern.key);
    }
    if (!slot || slot.requiredRole === 'Any') {
      // A free slot offers like-for-like, so the week's coverage cannot shift.
      return current ? pattern.id === current.id : true;
    }
    return pattern.role === slot.requiredRole;
  });
}

/* ------------------------------------------------------------ progression */

function parseRange(repRange: string | undefined): [number, number] {
  const m = /(\d+)\s*-\s*(\d+)/.exec(repRange ?? '');
  return m ? [Number(m[1]), Number(m[2])] : [6, 12];
}

const isTimed = (repRange: string | undefined): boolean => {
  const s = repRange ?? '';
  return /\d\s*-\s*\d+\s*m|min|sec/i.test(s) && !/rep/i.test(s);
};

/**
 * Double progression, applied for you.
 *
 * Reach the top of the rep range on every set with something left in the tank
 * and the weight goes up while reps drop back to the bottom. Otherwise chase one
 * more rep at the same weight. The rule is never shown to the user; the target is.
 */
export function suggest(
  ix: Indexed,
  exerciseId: string,
  entry: { repRange?: string; startWeight?: number | null } | null,
): Suggestion {
  const [lo, hi] = parseRange(entry?.repRange);
  const timed = isTimed(entry?.repRange);
  const logs = allLogs(ix).filter((l) => l.exerciseId === exerciseId);

  if (!logs.length) {
    return {
      kind: 'first',
      weight: entry?.startWeight ?? null,
      reps: timed ? null : lo,
      detail: { targetReps: lo, timed },
    };
  }

  const lastDate = logs
    .map((l) => l.date)
    .sort()
    .at(-1)!;
  const lastSets = logs.filter((l) => l.date === lastDate);
  const topWeight = Math.max(...lastSets.map((l) => num(l.weight)));
  const atTop = lastSets.filter((l) => num(l.weight) === topWeight);
  const minReps = Math.min(...atTop.map((l) => num(l.reps)));
  const minRir = Math.min(...atTop.map((l) => num(l.rir)));
  const detail = { lastWeight: topWeight, lastReps: minReps, timed };

  if (timed) return { kind: 'hold', weight: topWeight || null, reps: null, detail };

  if (minReps >= hi && minRir >= 2) {
    return {
      kind: 'up',
      weight: Math.round((topWeight + 2.5) * 10) / 10,
      reps: lo,
      detail: { ...detail, targetReps: lo },
    };
  }

  // Nothing left in the tank means the weight is already at its limit; repeating
  // it beats adding load onto a set that already failed.
  if (minRir === 0) return { kind: 'hold', weight: topWeight, reps: minReps, detail };

  return { kind: 'rep', weight: topWeight, reps: Math.min(hi, minReps + 1), detail };
}

export interface Progression {
  exercise: Exercise;
  suggestion: Suggestion;
}

/**
 * Everything in the current plan that has earned more weight.
 *
 * Double progression already decides this per exercise the moment you open it;
 * this only gathers the verdicts up so the home screen can say so before you go
 * looking. Nothing new is computed — if this and the Train card ever disagreed,
 * one of them would be lying.
 */
export function readyToProgress(ix: Indexed, sessions: number): Progression[] {
  const seen = new Set<string>();
  const out: Progression[] = [];

  for (const row of programRows(ix, sessions)) {
    if (!row.exercise || seen.has(row.exercise.id)) continue;
    seen.add(row.exercise.id);
    const suggestion = suggest(ix, row.exercise.id, row.entry);
    if (suggestion.kind === 'up') out.push({ exercise: row.exercise, suggestion });
  }
  return out;
}

/** Are the working sets actually hard enough? The method's central complaint. */
export function effortCheck(ix: Indexed): boolean {
  const recent = allLogs(ix)
    .filter((l) => l.rir !== null)
    .slice(-15);
  if (recent.length < 6) return false;
  const easy = recent.filter((l) => num(l.rir) >= 4).length;
  return easy / recent.length >= 0.5;
}

/** Convenience for callers holding a raw snapshot rather than an index. */
export const indexOf = index;
