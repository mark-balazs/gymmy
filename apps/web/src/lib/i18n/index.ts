/**
 * Translation runtime.
 *
 * `plural()` consults the language's own rule via Intl.PluralRules rather than
 * appending an "s" — Hungarian takes no plural after a numeral, so "3 sorozat"
 * is correct and "3 sorozatok" is not.
 */

import { LANG_CODES } from '@athletic/domain';

export { exerciseName } from '@athletic/domain';
import type {
  DayKey,
  Lang,
  Pattern,
  PatternKey,
  Slot,
  SlotKey,
  SlotRole,
  SplitKey,
} from '@athletic/domain';
import { dicts, type Key } from './dict';

export { LANGS } from './dict';
export type { Key };

export type Params = Record<string, string | number>;

const fill = (s: string, params?: Params): string =>
  params ? s.replace(/\{(\w+)\}/g, (m, k: string) => String(params[k] ?? m)) : s;

export function translate(lang: Lang, key: Key, params?: Params): string {
  const dict = dicts[lang] ?? dicts.en;
  // Fall back to English rather than rendering a raw key at the user.
  const value = dict[key] ?? dicts.en[key];
  return fill(value ?? key, params);
}

export function pluralise(lang: Lang, n: number, noun: 'set' | 'session'): string {
  const rule = new Intl.PluralRules(lang).select(n);
  const key = (rule === 'one' ? `plural.${noun}.one` : `plural.${noun}.other`) as Key;
  return translate(lang, key, { n });
}

/** Built-in names translate; a name the user typed themselves always wins. */
export function patternName(lang: Lang, p: Pattern | null | undefined): string {
  if (!p) return '';
  return p.key ? translate(lang, `pattern.${p.key as PatternKey}` as Key) : p.name;
}

export function slotName(lang: Lang, s: Slot | null | undefined): string {
  if (!s) return '';
  return s.key ? translate(lang, `slot.${s.key as SlotKey}` as Key) : s.name;
}

/**
 * What a slot will accept, in words.
 *
 * Mirrors the precedence the generator itself applies — a pattern list is
 * narrower than a role and wins wherever both are set — so the label a user
 * reads while arranging their week is the rule that will actually be enforced
 * when it is generated.
 */
export function slotHolds(
  lang: Lang,
  slot: { requiredRole: SlotRole | null; patternKeys: PatternKey[] | null },
): string {
  if (slot.patternKeys?.length) {
    return slot.patternKeys.map((k) => translate(lang, `pattern.${k}` as Key)).join(' · ');
  }
  return translate(lang, `role.${slot.requiredRole ?? 'Any'}` as Key);
}

/** "Push", "Legs", "Full body" — what a day is called in a given split. */
export const dayName = (lang: Lang, key: DayKey | null | undefined): string =>
  key ? translate(lang, `day.${key}` as Key) : '';

export const splitName = (lang: Lang, key: SplitKey): string =>
  translate(lang, `split.${key}` as Key);

/**
 * The first of the browser's preferred languages we actually ship.
 *
 * Walked in *their* order, not ours: somebody whose list is [fr-CA, en] wants
 * French, and scanning our languages against their list instead would hand them
 * English because English happens to come first in our array.
 */
export function detectLang(): Lang {
  if (typeof navigator === 'undefined') return 'en';
  const tags = navigator.languages ?? [navigator.language ?? 'en'];
  for (const tag of tags) {
    const base = tag.toLowerCase().split('-')[0];
    const hit = LANG_CODES.find((code) => code === base);
    if (hit) return hit;
  }
  return 'en';
}
