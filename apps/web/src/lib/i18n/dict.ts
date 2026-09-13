/**
 * The dictionary index.
 *
 * Each language lives in its own file under `locales/`. English is the source
 * of truth — `Key` is derived from it — and every other locale is typed
 * `Record<Key, string>`, so a missing or misspelled key is a compile error
 * rather than a phrase that silently falls back to English in production.
 *
 * Adding a language is three steps: write `locales/<code>.ts`, add the code to
 * `LANG_CODES` in the domain, and add a row here. The typechecker enforces the
 * rest.
 */

import type { Lang } from '@athletic/domain';
import { en } from './locales/en';
import { hu } from './locales/hu';
import type { Key } from './locales/en';

export { en };
export type { Key };

/**
 * Shown in the picker, each in its own language.
 *
 * "Deutsch", not "German" — somebody looking for their own language scans for
 * the word they would use for it, not the word English uses.
 */
export const LANGS: { id: Lang; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'hu', label: 'Magyar' },
];

export const dicts: Record<Lang, Record<Key, string>> = { en, hu };
