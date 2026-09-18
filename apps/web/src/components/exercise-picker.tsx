'use client';

/**
 * Choosing an exercise from the library.
 *
 * Grouped by movement pattern, in the app's own pattern order, and searchable.
 * That is not polish. The only exercise list the app had before was the swap
 * sheet: an uncapped column of full-width buttons in database order, which the
 * library reached in UUID order because nothing sorted it. That was tolerable
 * at a handful of legal swaps per slot and useless for choosing from the whole
 * catalogue — which is what logging something outside the plan needs, and what
 * the swap sheet will need too as the library grows.
 *
 * Search matches the name in your language *and* the English one, with accents
 * ignored, so "fekvo" finds "Fekvőtámasz" and somebody who only knows a
 * movement by its gym-English name still finds it in Hungarian.
 */

import { useMemo, useState } from 'react';
import { Button, Sheet } from '@/components/ui';
import { useT } from '@/lib/client/hooks';
import type { Exercise, Pattern } from '@athletic/domain';

/** Lower-case with diacritics stripped: "Fekvőtámasz" → "fekvotamasz". */
const fold = (s: string): string =>
  s
    .normalize('NFD')
    // Every combining mark: decomposition splits "ő" into "o" plus one of these.
    .replace(/\p{M}/gu, '')
    .toLowerCase();

export function ExercisePicker({
  title,
  note,
  exercises,
  patterns,
  onPick,
  onClose,
}: {
  title: string;
  /** A line above the search, for what the list means — the swap sheet says
   *  why these are the options and not others. */
  note?: string;
  exercises: Exercise[];
  patterns: Pattern[];
  onPick: (exercise: Exercise) => void;
  onClose: () => void;
}) {
  const tr = useT();
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    const q = fold(query.trim());
    const matches = (e: Exercise) =>
      !q || fold(tr.exercise(e)).includes(q) || fold(e.name).includes(q);

    const out: { key: string; name: string; items: Exercise[] }[] = [];
    // Sorted by the name on screen, in the language on screen: the device's
    // store hands rows back in id order, which reads as no order at all.
    const byName = (a: Exercise, b: Exercise) =>
      tr.exercise(a).localeCompare(tr.exercise(b), tr.lang);

    for (const pattern of patterns) {
      const items = exercises.filter((e) => e.patternId === pattern.id && matches(e)).sort(byName);
      if (items.length) out.push({ key: pattern.id, name: tr.pattern(pattern), items });
    }
    const known = new Set(patterns.map((p) => p.id));
    const rest = exercises.filter((e) => !known.has(e.patternId) && matches(e)).sort(byName);
    if (rest.length) out.push({ key: 'other', name: tr.t('prog.other'), items: rest });
    return out;
  }, [exercises, patterns, query, tr]);

  return (
    <Sheet title={title} open onClose={onClose}>
      {note && <p className="text-sm text-[var(--color-muted)]">{note}</p>}
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={tr.t('picker.search')}
        aria-label={tr.t('picker.search')}
        className="min-h-[var(--spacing-tap)] w-full rounded-[11px] border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3"
      />
      {groups.length === 0 ? (
        <p className="text-sm text-[var(--color-muted)]">
          {tr.t('picker.none', { q: query.trim() })}
        </p>
      ) : (
        groups.map((g) => (
          <section key={g.key} className="flex flex-col gap-1.5">
            {/* h3, not h2: the sheet title is already the h2, and the Train
                page's own tooling reads the first h2 in the page as the open
                exercise's name. */}
            <h3 className="text-[10.5px] font-bold tracking-wider text-[var(--color-muted)] uppercase">
              {g.name}
            </h3>
            {g.items.map((e) => (
              <Button key={e.id} className="w-full justify-start" onClick={() => onPick(e)}>
                {tr.exercise(e)}
              </Button>
            ))}
          </section>
        ))
      )}
    </Sheet>
  );
}
