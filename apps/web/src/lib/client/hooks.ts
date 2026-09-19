'use client';

/**
 * Reactive reads.
 *
 * They re-render whenever IndexedDB changes, including changes written by the
 * sync engine — so a set logged on your phone appears on your laptop without
 * any manual refresh plumbing.
 */

import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { barKey, getMeta, snapshot } from './db';
import { fromLiveQuery, shared, type LiveState, type Source } from './live';
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

/** Whether two reads of the profile row say the same thing. */
const sameRow = (a: Profile | null, b: Profile | null): boolean =>
  a === b || (!!a && !!b && JSON.stringify(a) === JSON.stringify(b));

/**
 * The local database as the domain reads it, with the profile kept as the
 * same object for as long as it says the same thing.
 *
 * Every write re-reads every table, and a re-read hands back new objects. The
 * profile is the one row nearly every component reads (the language, through
 * `useT`), so without this every set logged would re-render every component
 * on the screen for a profile that did not change.
 */
const snapshotSource: Source<Snapshot> = (next, fail) => {
  let profile: Profile | null = null;
  return fromLiveQuery(snapshot)((snap) => {
    if (sameRow(profile, snap.profile)) snap = { ...snap, profile };
    else profile = snap.profile;
    next(snap);
  }, fail);
};

/**
 * One live read of the whole local database, for the whole app — see
 * `live.ts` for why it is shared rather than read per screen. The profile is
 * read from it too, rather than by a query of its own, so a page never renders
 * a profile and a snapshot from two different moments.
 */
const live = shared(snapshotSource);
const NOTHING: LiveState<Snapshot> = { value: undefined, error: null };
const useLive = () => useSyncExternalStore(live.subscribe, live.get, () => NOTHING);

/** The derived index, worked out once per read rather than once per screen. */
const indexes = new WeakMap<Snapshot, Indexed>();
const indexOf = (snap: Snapshot): Indexed => {
  let ix = indexes.get(snap);
  if (!ix) indexes.set(snap, (ix = index(snap)));
  return ix;
};

export function useSnapshot(): { snap: Snapshot; ix: Indexed; ready: boolean } {
  const { value, error } = useLive();
  if (error) {
    /* For the error boundary, as `useLiveQuery` did: a store that will not
       open is a screen offering "Try again", not an empty one pretending. The
       failed read is over, so a fresh one is started here — the next render,
       which is what "Try again" does, then reads its result. */
    live.retry();
    throw error;
  }
  const snap = value ?? EMPTY;
  return { snap, ix: indexOf(snap), ready: value !== undefined };
}

/**
 * Where the first read is: still going, landed, or failed. For the `(app)`
 * layout, which draws no page until it has landed — and on a failure draws
 * them anyway, so the page's own read throws into the error screen, which
 * offers a way out.
 */
export function useSnapshotStatus(): 'loading' | 'ready' | 'failed' {
  const { value, error } = useLive();
  return error ? 'failed' : value === undefined ? 'loading' : 'ready';
}

export function useProfile(): Profile | null {
  return useSyncExternalStore(
    live.subscribe,
    () => live.get().value?.profile ?? null,
    () => null,
  );
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
