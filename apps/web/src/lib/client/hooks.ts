'use client';

/**
 * Reactive reads.
 *
 * `useLiveQuery` re-renders whenever IndexedDB changes, including changes
 * written by the sync engine — so a set logged on your phone appears on your
 * laptop without any manual refresh plumbing.
 */

import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { barKey, getMeta, local, snapshot } from './db';
import { onSyncStatus, type SyncStatus } from './sync';
import { exerciseName, index, type Indexed } from '@athletic/domain';
import {
  count,
  dayName,
  detectLang,
  patternName,
  pluralise,
  slotHolds,
  slotName,
  splitName,
  translate,
  type CountKey,
  type Key,
  type Params,
} from '@/lib/i18n';
import type {
  DayKey,
  Lang,
  Pattern,
  PatternKey,
  Profile,
  Slot,
  SlotRole,
  Snapshot,
  SplitKey,
  Unit,
} from '@athletic/domain';

const EMPTY: Snapshot = {
  patterns: [],
  exercises: [],
  slots: [],
  splitPeriods: [],
  entries: [],
  logs: [],
  bodyLogs: [],
  goals: [],
  profile: null,
};

export function useSnapshot(): { snap: Snapshot; ix: Indexed; ready: boolean } {
  const snap = useLiveQuery(() => snapshot(), [], undefined);
  const value = snap ?? EMPTY;
  const ix = useMemo(() => index(value), [value]);
  return { snap: value, ix, ready: snap !== undefined };
}

export function useProfile(): Profile | null {
  const rows = useLiveQuery(() => local.profile.toArray(), [], undefined);
  return rows?.[0] ?? null;
}

/**
 * The bar picked for a lift on this device, following it as it changes.
 *
 * Three answers, and the difference between the first two matters: `undefined`
 * while it is still being read, `null` once read and nothing was ever picked,
 * or the bar. Train starts a new lift on its bar, so it has to know when "no
 * choice yet" is a fact rather than a read in flight.
 */
export function useRememberedBar(exerciseId: string, unit: Unit): number | null | undefined {
  return useLiveQuery(
    () => getMeta<number | null>(barKey(exerciseId, unit), null),
    [exerciseId, unit],
  );
}

/** Nothing to subscribe to: the browser's language list does not change
 *  mid-session, so the snapshot is read once and never invalidated. */
const noSubscribe = () => () => {};

/**
 * Language follows the profile once loaded, the browser before that.
 *
 * The browser half has to go through `useSyncExternalStore` rather than
 * `useState(detectLang)`. `detectLang` reads `navigator`, which does not exist
 * on the server — so the server renders English while the client renders
 * Hungarian, and React throws a hydration mismatch on the first paint of every
 * Hungarian session. The third argument is the server snapshot, which React
 * also uses for the initial hydration render; detection applies on the pass
 * after that, so both sides start from the same markup.
 */
export function useLang(): Lang {
  const profile = useProfile();
  const detected = useSyncExternalStore<Lang>(noSubscribe, detectLang, () => 'en');
  return profile?.lang ?? detected;
}

export interface Translator {
  t: (key: Key, params?: Params) => string;
  /** A sentence holding a number, in that number's form — "1 change", "3 changes". */
  count: (stem: CountKey, n: number, params?: Params) => string;
  plural: (n: number, noun: 'set' | 'session') => string;
  pattern: (p: Pattern | null | undefined) => string;
  exercise: (e: { name: string } | null | undefined) => string;
  slot: (s: Slot | null | undefined) => string;
  holds: (s: { requiredRole: SlotRole | null; patternKeys: PatternKey[] | null }) => string;
  day: (k: DayKey | null | undefined) => string;
  split: (k: SplitKey) => string;
  lang: Lang;
}

export function useT(): Translator {
  const lang = useLang();
  return useMemo(
    () => ({
      lang,
      t: (key: Key, params?: Params) => translate(lang, key, params),
      count: (stem: CountKey, n: number, params?: Params) => count(lang, stem, n, params),
      plural: (n: number, noun: 'set' | 'session') => pluralise(lang, n, noun),
      pattern: (p: Pattern | null | undefined) => patternName(lang, p),
      exercise: (e: { name: string } | null | undefined) => exerciseName(lang, e),
      slot: (s: Slot | null | undefined) => slotName(lang, s),
      holds: (s: { requiredRole: SlotRole | null; patternKeys: PatternKey[] | null }) =>
        slotHolds(lang, s),
      day: (k: DayKey | null | undefined) => dayName(lang, k),
      split: (k: SplitKey) => splitName(lang, k),
    }),
    [lang],
  );
}

export function useSyncStatus(): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>({
    state: 'idle',
    pending: 0,
    lastSyncedAt: null,
    error: null,
    storageFailure: null,
  });
  useEffect(() => onSyncStatus(setStatus), []);
  return status;
}

/** Local date, not UTC — a set logged at 23:00 belongs to today. */
export function useToday(): string {
  return useMemo(() => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }, []);
}

export function useDisclosure(initial = false) {
  const [open, setOpen] = useState(initial);
  return {
    open,
    show: useCallback(() => setOpen(true), []),
    hide: useCallback(() => setOpen(false), []),
  };
}
