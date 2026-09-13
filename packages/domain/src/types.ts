/**
 * Domain types.
 *
 * Every syncable record carries the same three fields so the sync engine can
 * treat them uniformly: a client-generated `id`, an `updatedAt` for last-write
 * -wins, and a soft `deletedAt` (a hard delete cannot be replicated to a device
 * that is currently offline — it would simply reappear on the next push).
 */

export const ROLES = ['Lower', 'Upper', 'Midline', 'Accessory'] as const;
export type Role = (typeof ROLES)[number];

export const SLOT_ROLES = ['Any', ...ROLES] as const;
export type SlotRole = (typeof SLOT_ROLES)[number];

export type Where = 'gym' | 'home';
export type Unit = 'kg' | 'lb';
export type Lang = 'en' | 'hu';

export const BIASES = ['none', 'shoulders', 'arms', 'glutes', 'back', 'chest'] as const;
export type Bias = (typeof BIASES)[number];

export const PATTERN_KEYS = [
  'squat',
  'hinge',
  'lunge',
  'push',
  'pull',
  'rotate',
  'carry',
  'isolation',
] as const;
export type PatternKey = (typeof PATTERN_KEYS)[number];

export const SLOT_KEYS = [
  'bigLower',
  'bigUpper',
  'main',
  'secondary',
  'accessory',
  'isolation',
  'finisher',
] as const;
export type SlotKey = (typeof SLOT_KEYS)[number];

/** How the week is organised — and, with it, what counts as a complete week.
 *  A push/pull split is complete at push and pull; it is not marked down for
 *  missing a carry it never claimed to train. */
export const SPLIT_KEYS = ['sevenPattern', 'pushPullLegs', 'upperLower', 'custom'] as const;
export type SplitKey = (typeof SPLIT_KEYS)[number];

export const DAY_KEYS = ['full', 'push', 'pull', 'legs', 'upper', 'lower'] as const;
export type DayKey = (typeof DAY_KEYS)[number];

/** Shared by every replicated record. */
export interface Synced {
  id: string;
  /** ISO timestamp from the writing device. Drives last-write-wins. */
  updatedAt: string;
  /** Soft delete — see the note at the top of this file. */
  deletedAt: string | null;
}

export interface Pattern extends Synced {
  /** Stable identity for translation. Null once the user renames it, at which
   *  point their wording wins over any built-in translation. */
  key: PatternKey | null;
  name: string;
  role: Role;
  /** False for Isolation: taggable, but never a coverage box. */
  counts: boolean;
  position: number;
}

export interface Exercise extends Synced {
  name: string;
  patternId: string;
  where: Where;
  /** Bias tags — 'shoulders', 'arms', … used when generating a program. */
  tags: string[];
  /** One or two sentences on how to do it. Editable, so it is stored per user
   *  rather than looked up from a table the user cannot change. */
  description: string;
  /** Same-origin paths, so the service worker caches them with everything else.
   *  Empty where no honest photograph of the movement was available. */
  images: string[];
}

export interface Slot extends Synced {
  key: SlotKey | null;
  name: string;
  requiredRole: SlotRole;
  position: number;
  /** Which session this slot belongs to. Null means every session, which is
   *  what a full-body split uses; a push/pull/legs split pins each day. */
  sessionIndex: number | null;
  /** Narrower than `requiredRole` when set: the slot must be filled from one of
   *  these patterns. Null falls back to the role constraint. */
  patternKeys: PatternKey[] | null;
  /** Labels the day this slot belongs to — "Push", "Legs", "Full body". */
  dayKey: DayKey | null;
}

/**
 * One stretch of time spent training a particular split.
 *
 * Append-only. Switching split closes nothing and rewrites nothing — it opens a
 * new period, and every week before it keeps being scored exactly as it was
 * scored at the time. That is the whole point: three months of seven-pattern
 * weeks must still read as seven-pattern weeks after you move to push/pull.
 *
 * `patternKeys` is frozen at creation rather than looked up from the preset,
 * so history survives us changing a preset's definition in a later release, and
 * survives the user renaming or retiring a pattern.
 */
export interface SplitPeriod extends Synced {
  split: SplitKey;
  days: number;
  /** Monday of the week the split took effect. Runs until the next period. */
  startWeek: string;
  /** What a complete week meant while this split was in effect. */
  patternKeys: PatternKey[];
}

export interface ProgramEntry extends Synced {
  sessionIndex: number;
  slotId: string;
  exerciseId: string | null;
  sets: number;
  repRange: string;
  startWeight: number | null;
  note: string;
}

export interface SetLog extends Synced {
  /** yyyy-mm-dd, local to the user. */
  date: string;
  /** 'A' | 'B' | … derived from the session index. */
  session: string;
  exerciseId: string;
  setNo: number;
  weight: number | null;
  reps: number | null;
  /** Reps in reserve. Stored as a number, never shown as one. */
  rir: number | null;
  note: string;
}

export interface RefSet extends Synced {
  date: string;
  exerciseId: string;
  weight: number | null;
  reps: number | null;
  note: string;
}

/** Singleton per user; `id` equals the user id. */
export interface Profile extends Synced {
  onboarded: boolean;
  split: SplitKey;
  days: number;
  where: Where;
  bias: Bias;
  blockStart: string;
  blockWeeks: number;
  unit: Unit;
  lang: Lang;
}

/** Everything the client holds. Also the shape of an export file. */
export interface Snapshot {
  patterns: Pattern[];
  exercises: Exercise[];
  slots: Slot[];
  splitPeriods: SplitPeriod[];
  entries: ProgramEntry[];
  logs: SetLog[];
  refSets: RefSet[];
  profile: Profile | null;
}

export const TABLES = [
  'patterns',
  'exercises',
  'slots',
  'splitPeriods',
  'entries',
  'logs',
  'refSets',
  'profile',
] as const;
export type TableName = (typeof TABLES)[number];

/* ----------------------------------------------------------------- derived */

export interface ProgramRow {
  key: string;
  session: number;
  sessionLabel: string;
  slot: Slot;
  entry: ProgramEntry | null;
  exercise: Exercise | null;
  pattern: Pattern | null;
  check: CheckResult;
}

export interface CheckResult {
  ok: boolean | null;
  /** Empty when there is nothing to say. */
  reason: 'ok' | 'no-pattern' | 'wrong-role' | null;
  want?: SlotRole;
  got?: Role;
}

export interface CoverageCell {
  pattern: Pattern;
  sets: number;
}

export interface WeekCoverage {
  weekOf: string;
  cells: CoverageCell[];
  hit: number;
  total: number;
  sessions: number;
  complete: boolean;
  /** Which split this week was scored under. Past weeks keep the split they
   *  were trained under, so the UI can say so rather than quietly restating
   *  old history in terms of a split that did not exist yet. */
  split: SplitKey | null;
}

export type SuggestionKind = 'first' | 'rep' | 'up' | 'hold';

export interface Suggestion {
  kind: SuggestionKind;
  weight: number | null;
  reps: number | null;
  /** Structured so the UI can translate it; never a pre-built sentence. */
  detail: {
    lastWeight?: number;
    lastReps?: number;
    targetReps?: number;
    timed?: boolean;
  };
}

export type TrendDir = 'up' | 'down' | 'flat' | 'none';

export interface Trend {
  dir: TrendDir;
  pct: number;
  /** Weeks since the best result, when the trend is flat. */
  stalledWeeks: number;
  points: number;
}
