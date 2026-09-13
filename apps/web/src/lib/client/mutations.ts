/**
 * Every write goes through here.
 *
 * One place stamps `updatedAt`, writes to IndexedDB and queues for sync, so no
 * screen can accidentally save something the server will never hear about.
 * Nothing here awaits the network — the UI updates from the local write.
 */

import { local } from './db';
import { enqueue, reportStorageFailure } from './sync';
import type {
  Bias,
  Exercise,
  Pattern,
  ProgramEntry,
  Profile,
  RefSet,
  SetLog,
  Slot,
  TableName,
  Where,
  Snapshot,
  SplitKey,
  SplitPeriod,
  PatternKey,
} from '@athletic/domain';
import type { DraftEntry, SlotDraft } from '@athletic/domain';
import { buildProgram, buildSlots, coversFor, findSplit, index, mondayOf } from '@athletic/domain';

const now = (): string => new Date().toISOString();
const id = (): string => crypto.randomUUID();

/**
 * Every write goes through here, and so does every failure.
 *
 * The throw is preserved so a caller running a multi-step change can stop
 * rather than carry on over a half-written state; `fireAndForget` exists for
 * the callers that genuinely have nothing to do about it, and makes that
 * decision visible instead of leaving a floating promise to reject unhandled.
 */
async function put<T extends { id: string }>(table: TableName, row: T): Promise<T> {
  try {
    await local.table(table).put(row as never);
    await enqueue(table, row);
    return row;
  } catch (err) {
    reportStorageFailure(err);
    throw err;
  }
}

/** For writes whose failure is already surfaced and where the caller has no
 *  better answer than carrying on. Never used to hide an error. */
export function fireAndForget(p: Promise<unknown>): void {
  void p.catch(() => undefined);
}

/* --------------------------------------------------------------- logging */

export async function logSet(input: {
  date: string;
  session: string;
  exerciseId: string;
  setNo: number;
  weight: number | null;
  reps: number | null;
  rir: number | null;
  note?: string;
}): Promise<SetLog> {
  return put<SetLog>('logs', {
    id: id(),
    updatedAt: now(),
    deletedAt: null,
    note: '',
    ...input,
  });
}

/** Soft delete — a hard delete could not replicate to an offline device. */
export async function removeSet(setId: string): Promise<void> {
  const row = await local.logs.get(setId);
  if (!row) return;
  await put<SetLog>('logs', { ...row, deletedAt: now(), updatedAt: now() });
}

export async function addRefSet(input: {
  date: string;
  exerciseId: string;
  weight: number | null;
  reps: number | null;
  note?: string;
}): Promise<RefSet> {
  return put<RefSet>('refSets', {
    id: id(),
    updatedAt: now(),
    deletedAt: null,
    note: '',
    ...input,
  });
}

export async function removeRefSet(refId: string): Promise<void> {
  const row = await local.refSets.get(refId);
  if (!row) return;
  await put<RefSet>('refSets', { ...row, deletedAt: now(), updatedAt: now() });
}

/* --------------------------------------------------------------- program */

export async function setEntryExercise(
  sessionIndex: number,
  slotId: string,
  exerciseId: string | null,
): Promise<void> {
  const existing = (await local.entries.toArray()).find(
    (e) => e.sessionIndex === sessionIndex && e.slotId === slotId && e.deletedAt === null,
  );
  const row: ProgramEntry = existing
    ? { ...existing, exerciseId, updatedAt: now() }
    : {
        id: id(),
        updatedAt: now(),
        deletedAt: null,
        sessionIndex,
        slotId,
        exerciseId,
        sets: 3,
        repRange: '6-12',
        startWeight: null,
        note: '',
      };
  await put('entries', row);
}

/** Replace the whole generated grid. Logs are never touched. */
export async function applyProgram(draft: DraftEntry[], days: number): Promise<void> {
  const existing = await local.entries.toArray();
  const byKey = new Map(existing.map((e) => [`${e.sessionIndex}:${e.slotId}`, e]));
  const keep = new Set<string>();

  for (const d of draft) {
    const key = `${d.sessionIndex}:${d.slotId}`;
    keep.add(key);
    const prev = byKey.get(key);
    await put<ProgramEntry>('entries', {
      id: prev?.id ?? id(),
      updatedAt: now(),
      deletedAt: null,
      ...d,
    });
  }

  // Anything outside the new shape is retired, not orphaned.
  for (const e of existing) {
    const key = `${e.sessionIndex}:${e.slotId}`;
    if (!keep.has(key) && e.deletedAt === null) {
      await put<ProgramEntry>('entries', { ...e, deletedAt: now(), updatedAt: now() });
    }
  }

  await patchProfile({ days });
}

/* --------------------------------------------------------------- profile */

export async function patchProfile(patch: Partial<Omit<Profile, 'id'>>): Promise<Profile> {
  const rows = await local.profile.toArray();
  const existing = rows[0];
  const next: Profile = {
    id: existing?.id ?? id(),
    updatedAt: now(),
    deletedAt: null,
    onboarded: existing?.onboarded ?? false,
    split: existing?.split ?? 'sevenPattern',
    days: existing?.days ?? 3,
    where: existing?.where ?? 'gym',
    bias: existing?.bias ?? 'none',
    blockStart: existing?.blockStart ?? new Date().toISOString().slice(0, 10),
    blockWeeks: existing?.blockWeeks ?? 8,
    unit: existing?.unit ?? 'kg',
    lang: existing?.lang ?? 'en',
    theme: existing?.theme ?? 'system',
    ...patch,
  };
  return put('profile', next);
}

/* ---------------------------------------------------------- split periods */

const countedOf = (snap: Snapshot) => snap.patterns.filter((p) => p.counts && p.deletedAt === null);

/**
 * Records that a split took effect, without disturbing what came before.
 *
 * Two things make the history hold:
 *
 *  - **It appends.** A switch inserts a period; it never edits an older one. So
 *    a week is always read back against the goal that was in force at the time.
 *  - **It backfills first.** An account that pre-dates periods has weeks that
 *    were scored against every counted pattern. Opening the first period
 *    without saying so would make `periodFor` hand those old weeks the *new*
 *    split — which is exactly the retroactive rescoring this exists to prevent.
 *
 * The start is snapped to a Monday because a week is the unit of coverage;
 * switching on a Thursday applies to the whole of that week rather than leaving
 * it scored half one way and half the other.
 */
async function openPeriod(
  snap: Snapshot,
  opts: { split: SplitKey; days: number; slots: Slot[] },
): Promise<void> {
  const counted = countedOf(snap);
  const existing = (await local.splitPeriods.toArray()).filter((p) => p.deletedAt === null);
  const previous = existing
    .slice()
    .sort((a, b) => (a.startWeek < b.startWeek ? -1 : 1))
    .at(-1);

  const allKeys = counted.map((p) => p.key).filter((k): k is PatternKey => !!k);

  if (!previous) {
    const logs = snap.logs.filter((l) => l.deletedAt === null);
    const earliest = logs.map((l) => l.date).sort()[0];
    if (earliest) {
      // Everything already logged was scored against the old rules; say so
      // explicitly rather than letting the new split inherit those weeks.
      const priorSplit = snap.profile?.split ?? 'sevenPattern';
      await put<SplitPeriod>('splitPeriods', {
        id: id(),
        updatedAt: now(),
        deletedAt: null,
        split: priorSplit,
        days: snap.profile?.days ?? 3,
        startWeek: mondayOf(earliest),
        patternKeys: findSplit(priorSplit)?.covers ?? allKeys,
      });
    }
  }

  const patternKeys = coversFor(opts.split, opts.slots, counted, previous?.patternKeys ?? allKeys);

  const startWeek = mondayOf(new Date());
  // Switching twice in the same week replaces that week's period rather than
  // stacking two with the same start, which would make the order arbitrary.
  const sameWeek = existing.find((p) => p.startWeek === startWeek);

  await put<SplitPeriod>('splitPeriods', {
    id: sameWeek?.id ?? id(),
    updatedAt: now(),
    deletedAt: null,
    split: opts.split,
    days: opts.days,
    startWeek,
    patternKeys,
  });
}

/**
 * Installs a slot skeleton: replaces the old one, regenerates the plan and
 * records the switch so past weeks keep their own meaning.
 *
 * Old slots are retired rather than deleted, and their program entries with
 * them, because entries reference slot ids — leaving them behind would strand
 * exercises against slots that no longer exist. Logged sets are untouched: they
 * reference exercises, not slots, so history survives a split change intact.
 *
 * Presets and hand-built splits both come through here, with nothing but the
 * drafts differing. That is deliberate — the moment a custom split took a
 * second code path it would start behaving differently from a preset in ways
 * nobody would think to test.
 */
async function installSkeleton(
  snap: Snapshot,
  opts: { split: SplitKey; days: number; where: Where; bias: Bias; drafts: SlotDraft[] },
): Promise<void> {
  const existingSlots = await local.slots.toArray();
  for (const s of existingSlots) {
    if (s.deletedAt === null)
      await put<Slot>('slots', { ...s, deletedAt: now(), updatedAt: now() });
  }
  const existingEntries = await local.entries.toArray();
  for (const e of existingEntries) {
    if (e.deletedAt === null) {
      await put<ProgramEntry>('entries', { ...e, deletedAt: now(), updatedAt: now() });
    }
  }

  const slots: Slot[] = opts.drafts.map((s) => ({
    ...s,
    id: id(),
    updatedAt: now(),
    deletedAt: null,
  }));
  for (const s of slots) await put('slots', s);

  // The period is recorded *before* the plan is generated, not after: the
  // generator guarantees coverage against whatever the current period asks for,
  // so running it first would build a week aimed at the split being left behind.
  await openPeriod(snap, { split: opts.split, days: opts.days, slots });
  const splitPeriods = (await local.splitPeriods.toArray()).filter((p) => p.deletedAt === null);

  // Generate against the new skeleton, not the stale one still in the snapshot.
  const draft = buildProgram(index({ ...snap, slots, splitPeriods, entries: [] }), {
    days: opts.days,
    where: opts.where,
    bias: opts.bias,
  });
  for (const d of draft) {
    await put<ProgramEntry>('entries', { id: id(), updatedAt: now(), deletedAt: null, ...d });
  }

  await patchProfile({ split: opts.split, days: opts.days, where: opts.where, bias: opts.bias });
}

/** Switches to one of the built-in splits. */
export async function applySplit(
  snap: Snapshot,
  opts: { split: SplitKey; days: number; where: Where; bias: Bias },
): Promise<void> {
  const preset = findSplit(opts.split);
  if (!preset) return;
  await installSkeleton(snap, { ...opts, drafts: buildSlots(preset, opts.days) });
}

/**
 * Puts a hand-built week into effect.
 *
 * Editing the skeleton is what makes a split "custom" — there is no separate
 * mode to enter, and `installSkeleton` records a period from this week on, so a
 * custom split inherits the coverage goal it already had rather than inventing
 * a new one. Rearranging your week is not the same as changing what you are
 * training for; `coversFor` narrows that inherited goal only where the new
 * arrangement genuinely cannot reach a pattern any more.
 *
 * An empty skeleton is refused rather than applied: a week with no slots
 * generates no plan, and the screen it leaves behind looks like data loss.
 */
export async function applyCustomSplit(
  snap: Snapshot,
  opts: { drafts: SlotDraft[]; days: number; where: Where; bias: Bias },
): Promise<void> {
  if (!opts.drafts.length) return;
  await installSkeleton(snap, { ...opts, split: 'custom' });
}

export const setLang = (lang: Profile['lang']) => patchProfile({ lang });
export const setUnit = (unit: Profile['unit']) => patchProfile({ unit });
export const setTheme = (theme: Profile['theme']) => patchProfile({ theme });
export const setTrainingPrefs = (p: { days: number; where: Where; bias: Bias }) => patchProfile(p);

/* ------------------------------------------------------------- library -- */

export async function upsertExercise(row: Exercise): Promise<void> {
  await put('exercises', { ...row, updatedAt: now() });
}

export async function upsertPattern(row: Pattern): Promise<void> {
  await put('patterns', { ...row, updatedAt: now() });
}
