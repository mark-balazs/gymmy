/**
 * Translation runtime.
 *
 * `plural()` consults the language's own rule via Intl.PluralRules rather than
 * appending an "s" — Hungarian takes no plural after a numeral, so "3 sorozat"
 * is correct and "3 sorozatok" is not.
 */

import type { DayKey, Lang, Pattern, PatternKey, Slot, SlotKey, SplitKey } from '@athletic/domain';
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

/** "Push", "Legs", "Full body" — what a day is called in a given split. */
export const dayName = (lang: Lang, key: DayKey | null | undefined): string =>
  key ? translate(lang, `day.${key}` as Key) : '';

export const splitName = (lang: Lang, key: SplitKey): string =>
  translate(lang, `split.${key}` as Key);

export function detectLang(): Lang {
  if (typeof navigator === 'undefined') return 'en';
  const tags = navigator.languages ?? [navigator.language ?? 'en'];
  return tags.some((l) => l.toLowerCase().startsWith('hu')) ? 'hu' : 'en';
}
