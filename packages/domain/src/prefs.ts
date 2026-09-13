/**
 * What the app assumes before a profile has loaded — in one place.
 *
 * These defaults were written out at nine call sites (`profile?.days ?? 3` and
 * friends), which is nine chances for them to disagree and one guaranteed miss
 * the day any of them changes. The profile arrives from IndexedDB a tick after
 * the first render, so *every* screen needs an answer for that tick; the answer
 * should just not be re-invented each time.
 */

import type { Bias, Lang, Profile, SplitKey, Theme, Unit, Where } from './types';

export interface Prefs {
  split: SplitKey;
  days: number;
  where: Where;
  bias: Bias;
  unit: Unit;
  lang: Lang;
  theme: Theme;
  blockWeeks: number;
}

export const DEFAULT_PREFS: Prefs = {
  split: 'sevenPattern',
  days: 3,
  where: 'gym',
  bias: 'none',
  unit: 'kg',
  lang: 'en',
  theme: 'system',
  blockWeeks: 8,
};

/** The profile's settings, with the defaults filled in for anything absent. */
export const prefs = (profile: Profile | null | undefined): Prefs =>
  profile
    ? {
        split: profile.split ?? DEFAULT_PREFS.split,
        days: profile.days ?? DEFAULT_PREFS.days,
        where: profile.where ?? DEFAULT_PREFS.where,
        bias: profile.bias ?? DEFAULT_PREFS.bias,
        unit: profile.unit ?? DEFAULT_PREFS.unit,
        lang: profile.lang ?? DEFAULT_PREFS.lang,
        theme: profile.theme ?? DEFAULT_PREFS.theme,
        blockWeeks: profile.blockWeeks ?? DEFAULT_PREFS.blockWeeks,
      }
    : DEFAULT_PREFS;
