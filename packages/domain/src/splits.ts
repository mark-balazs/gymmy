/**
 * Split presets.
 *
 * A split decides how the week is organised *and* what a complete week means.
 * Those are the same question: a push/pull week is complete when you have
 * pushed and pulled. Scoring it against seven patterns would mark it down for
 * missing work it never claimed to do, which makes the coverage view useless
 * to anyone who did not pick the seven-pattern method.
 *
 * So each preset states its own `covers` set. The seven-pattern split is the
 * one that demands all seven — that is what it is for, not a universal rule.
 *
 * Each preset materialises into ordinary Slot rows, so nothing downstream needs
 * to know a preset was involved. Editing those slots afterwards is what makes a
 * split "custom" — there is no separate mode.
 */

import type { DayKey, PatternKey, Role, SlotKey, SlotRole, SplitKey } from './types';

export interface SlotTemplate {
  key: SlotKey;
  /** Broad constraint, used when any exercise of a role will do. */
  role?: Role | 'Any';
  /** Narrow constraint. Wins over `role` when present. */
  patterns?: PatternKey[];
}

export interface SplitDayTemplate {
  key: DayKey;
  slots: SlotTemplate[];
}

export interface SplitPreset {
  key: Exclude<SplitKey, 'custom'>;
  /** Cycled when the user trains more days than the split defines. */
  days: SplitDayTemplate[];
  /** What a complete week means under this split. This is the coverage set. */
  covers: PatternKey[];
  minDays: number;
  maxDays: number;
  defaultDays: number;
}

/** The three lower-body patterns, trained by any split with a legs or lower day. */
const LEGS: PatternKey[] = ['squat', 'hinge', 'lunge'];

/* The finisher is always role-constrained rather than pinned to one pattern, so
 * the generator can alternate rotation and carry across the week. Pinning it
 * would strand whichever of the two lost. */
const FINISHER: SlotTemplate = { key: 'finisher', role: 'Midline' };
const ISOLATION: SlotTemplate = { key: 'isolation', role: 'Any' };

const FULL_BODY: SplitDayTemplate = {
  key: 'full',
  slots: [
    { key: 'bigLower', role: 'Lower' },
    { key: 'bigUpper', role: 'Upper' },
    { key: 'accessory', role: 'Any' },
    ISOLATION,
    FINISHER,
  ],
};

const PUSH_DAY: SplitDayTemplate = {
  key: 'push',
  slots: [
    { key: 'main', patterns: ['push'] },
    { key: 'secondary', patterns: ['push'] },
    { key: 'accessory', patterns: ['push'] },
    ISOLATION,
    FINISHER,
  ],
};

const PULL_DAY: SplitDayTemplate = {
  key: 'pull',
  slots: [
    { key: 'main', patterns: ['pull'] },
    { key: 'secondary', patterns: ['pull'] },
    { key: 'accessory', patterns: ['pull'] },
    ISOLATION,
    FINISHER,
  ],
};

/** All three lower patterns in one day, so a three-day week still covers them. */
const LEGS_DAY: SplitDayTemplate = {
  key: 'legs',
  slots: [
    { key: 'main', patterns: ['squat'] },
    { key: 'secondary', patterns: ['hinge'] },
    { key: 'accessory', patterns: ['lunge'] },
    ISOLATION,
    FINISHER,
  ],
};

const UPPER_DAY: SplitDayTemplate = {
  key: 'upper',
  slots: [
    { key: 'main', patterns: ['push'] },
    { key: 'secondary', patterns: ['pull'] },
    { key: 'accessory', patterns: ['push', 'pull'] },
    ISOLATION,
    FINISHER,
  ],
};

const LOWER_DAY: SplitDayTemplate = {
  key: 'lower',
  slots: [
    { key: 'main', patterns: ['squat'] },
    { key: 'secondary', patterns: ['hinge'] },
    { key: 'accessory', patterns: ['lunge'] },
    ISOLATION,
    FINISHER,
  ],
};

export const SPLITS: SplitPreset[] = [
  {
    key: 'sevenPattern',
    days: [FULL_BODY],
    // The only split that asks for all seven. Rotation and carry are the two
    // most people never train, and catching that is the method's whole claim.
    covers: [...LEGS, 'push', 'pull', 'rotate', 'carry'],
    // Full body reaches every pattern in a single session, so two is enough.
    minDays: 2,
    maxDays: 4,
    defaultDays: 3,
  },
  {
    key: 'pushPullLegs',
    days: [PUSH_DAY, PULL_DAY, LEGS_DAY],
    // Push, pull and the three leg patterns — what this split actually sets out
    // to train. The midline finisher is still generated into the week, but it
    // is a bonus rather than a box you are failed for leaving empty.
    covers: ['push', 'pull', ...LEGS],
    // Below three days a whole day type is missed and the week cannot be
    // covered — so the option is withheld rather than silently under-delivering.
    minDays: 3,
    maxDays: 6,
    defaultDays: 3,
  },
  {
    key: 'upperLower',
    days: [UPPER_DAY, LOWER_DAY],
    covers: ['push', 'pull', ...LEGS],
    minDays: 2,
    maxDays: 6,
    defaultDays: 4,
  },
];

export const findSplit = (key: SplitKey): SplitPreset | null =>
  SPLITS.find((s) => s.key === key) ?? null;

/** Patterns a single slot is able to hold. */
export function slotReach(
  slot: { patternKeys: PatternKey[] | null; requiredRole: SlotRole },
  counted: { key: PatternKey | null; role: Role }[],
): PatternKey[] {
  if (slot.patternKeys?.length) return slot.patternKeys;
  const role = slot.requiredRole ?? 'Any';
  return counted
    .filter((p) => p.key && (role === 'Any' || p.role === role))
    .map((p) => p.key as PatternKey);
}

/**
 * What a set of slots can actually reach.
 *
 * Used to keep a coverage goal achievable: a hand-edited split that no longer
 * has a slot capable of holding a carry should stop asking for one, rather than
 * showing a box that can never be ticked.
 */
export function reachablePatterns(
  slots: { patternKeys: PatternKey[] | null; requiredRole: SlotRole }[],
  counted: { key: PatternKey | null; role: Role }[],
): PatternKey[] {
  const out = new Set<PatternKey>();
  for (const s of slots) for (const k of slotReach(s, counted)) out.add(k);
  return [...out];
}

/**
 * The coverage set to record when a split takes effect.
 *
 * A preset states its own. A custom split — one the user built by editing slots
 * — inherits the goal it already had, because rearranging your week is not the
 * same as changing what you are training for. The intersection with what the
 * slots can reach is a safety net, so an edit that removes the only slot
 * capable of holding a pattern also stops demanding it.
 */
export function coversFor(
  split: SplitKey,
  slots: { patternKeys: PatternKey[] | null; requiredRole: SlotRole }[],
  counted: { key: PatternKey | null; role: Role }[],
  inherited: PatternKey[],
): PatternKey[] {
  const wanted = findSplit(split)?.covers ?? inherited;
  const reach = new Set(reachablePatterns(slots, counted));
  const out = wanted.filter((k) => reach.has(k));
  // Never hand back an empty goal: a week with nothing to cover would read as
  // permanently complete, which is worse than falling back to what was asked.
  return out.length ? out : wanted;
}

/** Day templates for `days` sessions, cycling the preset. */
export const splitDays = (preset: SplitPreset, days: number): SplitDayTemplate[] =>
  Array.from({ length: days }, (_, i) => preset.days[i % preset.days.length]!);

export interface SlotDraft {
  key: SlotKey;
  name: string;
  requiredRole: SlotRole;
  position: number;
  sessionIndex: number;
  patternKeys: PatternKey[] | null;
  dayKey: DayKey;
}

/**
 * Materialises a preset into concrete slots, one set per session.
 *
 * Everything downstream reads plain Slot rows, so a custom split — slots the
 * user edited by hand — behaves identically to a preset.
 */
export function buildSlots(preset: SplitPreset, days: number): SlotDraft[] {
  const out: SlotDraft[] = [];
  splitDays(preset, days).forEach((day, sessionIndex) => {
    day.slots.forEach((slot, position) => {
      out.push({
        key: slot.key,
        name: slot.key,
        requiredRole: slot.patterns ? 'Any' : ((slot.role ?? 'Any') as SlotRole),
        position,
        sessionIndex,
        patternKeys: slot.patterns ?? null,
        dayKey: day.key,
      });
    });
  });
  return out;
}

/** Clamped to what the split can actually deliver a covered week for. */
export function allowedDays(key: SplitKey, fallback = 3): number[] {
  const preset = findSplit(key);
  if (!preset) return [2, 3, 4];
  const out: number[] = [];
  for (let d = preset.minDays; d <= Math.min(preset.maxDays, 6); d++) out.push(d);
  return out.length ? out : [fallback];
}
