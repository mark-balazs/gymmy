/**
 * Building the week, and reading back what was done in it.
 *
 *  1. Build a whole week from three plain answers, guaranteeing that every
 *     counted pattern is covered.
 *  2. Report the last session on a lift, so the Train screen can show it.
 *
 * **There is deliberately nothing here that says what to lift next.** This file
 * used to apply double progression and hand out a target — add weight, chase a
 * rep — and that is advice about load given to somebody training alone by
 * software that cannot see them. See `lastSession` below, and Decision log
 * D-014.
 *
 * Everything here returns structured data, never a finished sentence — the UI
 * owns the wording so every language reads naturally rather than being
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
import type { Bias, Exercise, Pattern, ProgramEntry, Slot, Where } from './types';

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
 * of those is a legitimate thing to have done and a poor thing to be
 * *prescribed*: a generated slot arrives asking for three sets of six to twelve,
 * which is not what anybody does with a medicine ball, and a week built out of
 * them would read as a programme nobody wrote.
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
 * What you did last time. Not what to do next.
 *
 * This replaces a double-progression engine that told people to add weight or
 * chase another rep. The rule itself was defensible — it only ever said "add
 * weight" after *you* reported reps left in the tank at the top of the range —
 * and it still had to go, because a defensible rule is not the same thing as
 * standing to give the instruction.
 *
 * gymmy cannot see your form breaking down, cannot see that you slept badly,
 * did not know about the shoulder, and is not qualified to say "put more on the
 * bar" to somebody training alone. Load is the one variable where being
 * confidently wrong hurts a person rather than a number. So the app records
 * what happened, measures what it honestly can, and stops there.
 *
 * What remains is a fact with a date on it: the heaviest set of your last
 * session on this lift, and how many reps it took. The Train screen prefills it
 * so repeating a session costs no typing, and captions it as history rather
 * than as a target. **Prefilling last time's number is a record; telling you to
 * beat it is advice.** That distinction is the whole of this change.
 *
 * See Decision log D-014.
 */
export interface LastSession {
  date: string;
  /** The heaviest weight in that session, or null if none was recorded. */
  weight: number | null;
  /** The fewest reps at that weight — the working set, not the easiest one. */
  reps: number | null;
}

export function lastSession(ix: Indexed, exerciseId: string): LastSession | null {
  const logs = allLogs(ix).filter((l) => l.exerciseId === exerciseId);
  if (!logs.length) return null;

  const date = logs
    .map((l) => l.date)
    .sort()
    .at(-1)!;
  const sets = logs.filter((l) => l.date === date);

  const weights = sets.map((l) => num(l.weight)).filter((w) => w > 0);
  const weight = weights.length ? Math.max(...weights) : null;

  /* The fewest reps at the top weight, matching what the old engine read. A
     back-off set is not what you would repeat, and the max would flatter a
     session whose first set was its easiest. */
  const atTop = weight === null ? sets : sets.filter((l) => num(l.weight) === weight);
  const reps = atTop.length ? Math.min(...atTop.map((l) => num(l.reps))) || null : null;

  return { date, weight, reps };
}

/** Convenience for callers holding a raw snapshot rather than an index. */
export const indexOf = index;
