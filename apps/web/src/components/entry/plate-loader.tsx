'use client';

/**
 * Load the bar: tap the plates you put on one side, and gymmy adds up the bar
 * and both sides.
 *
 * It is how a barbell is actually thought about. Nobody standing at a rack
 * thinks "102.5"; they think "a twenty, a fifteen and a two-and-a-half" and do
 * the sum in their head, which is exactly the step this takes away. The bar is
 * drawn with both sides loaded because that is what is in front of them, and a
 * plate on the bar is tapped to take it off again.
 *
 * **The total is the value; the plates are a picture of it.** What the card
 * holds and logs is one number, as it is in every other mode. So a total that
 * plates cannot make — last week's 61.25 on a 20 kg bar, a number typed on the
 * keypad — is shown exactly and logged exactly, with a note of what is left
 * over a side, rather than rounded to something that fits the drawing. The
 * card must never change a number nobody touched.
 *
 * **The plates you tapped stay the plates you tapped.** A twenty and two fives
 * is thirty a side, and so is a twenty-five and a five; recomputing the
 * picture from the total after every tap would swap one for the other under
 * your thumb. The arrangement is kept for as long as it still adds up to the
 * total, and only a total that changed some other way — the keypad, the
 * history arriving — is laid out afresh, heaviest first.
 */

import { useId, useState } from 'react';
import { formatOnScale, platesFor, plateTotal } from '@athletic/domain';
import type { Unit } from '@athletic/domain';
import { cn } from '@/components/ui';
import { useT } from '@/lib/client/hooks';
import { Keypad, formatAmount } from './keypad';

/** More than any record lift needs, and about what fits on a drawn sleeve
 *  before the plates are slivers. */
const MAX_PLATES = 12;

const round2 = (n: number) => Math.round(n * 100) / 100 + 0;

/**
 * What a plate looks like, by its weight in kilos.
 *
 * The competition colours, which most gyms' bumper plates copy — red 25, blue
 * 20, yellow 15, green 10, white 5 — and the black and chrome of the change
 * plates. Colour is a help, never the only signal: every plate is also its
 * size and, on the buttons, its number. Fixed rather than themed, because a
 * blue plate is blue under any light. Pound plates take the look of the kilo
 * plate nearest them, so a 45 is a blue twenty.
 */
const LOOKS: { from: number; color: string; height: number; width: number }[] = [
  { from: 22, color: '#d64545', height: 60, width: 15 },
  { from: 17.5, color: '#2f6fd6', height: 60, width: 14 },
  { from: 12.5, color: '#e0b020', height: 53, width: 13 },
  { from: 7.5, color: '#2f9e5b', height: 45, width: 12 },
  { from: 3.75, color: '#f4f4f1', height: 33, width: 10 },
  { from: 1.9, color: '#33363b', height: 26, width: 9 },
  { from: 0, color: '#c3c7cd', height: 22, width: 8 },
];

const lookOf = (w: number, unit: Unit) => {
  const kg = unit === 'lb' ? w * 0.45359237 : w;
  return LOOKS.find((l) => kg >= l.from) ?? LOOKS[LOOKS.length - 1]!;
};

/** A mid-grey edge that reads on both themes, so the white plate is not lost on
 *  a white card and the black one on a dark one. */
const EDGE = 'inset 0 0 0 1px rgb(128 128 128 / 0.55)';

/** Stable keys for a stack: the second twenty is always `20-1`, so adding a
 *  plate animates that plate in and leaves the rest where they are. */
const keyed = (perSide: readonly number[]) => {
  const seen = new Map<number, number>();
  return perSide.map((w) => {
    const n = seen.get(w) ?? 0;
    seen.set(w, n + 1);
    return `${w}-${n}`;
  });
};

export interface PlateLoaderProps {
  /** The total — bar and both sides — as the card holds it. */
  value: number;
  /** What the empty bar weighs. The caller remembers it per exercise. */
  bar: number;
  unit: Unit;
  /** One side's plates on offer, heaviest first — `PLATES[unit]`. */
  plates: readonly number[];
  /** The bars the chip offers — `BAR_CHOICES[unit]`. */
  barChoices: readonly number[];
  onChange: (total: number) => void;
  onBarChange: (bar: number) => void;
  /** Id of the note that says what the number means — the load caption. */
  describedBy?: string;
  /** The decimals the total is written with — the barbell ruler's
   *  `scalePlaces` — so the total reads 60.0 here as it does on the ruler. */
  places?: number;
}

export function PlateLoader({
  value,
  bar,
  unit,
  plates,
  barChoices,
  onChange,
  onBarChange,
  describedBy,
  places,
}: PlateLoaderProps) {
  const tr = useT();
  const id = useId();
  const [mine, setMine] = useState<readonly number[]>([]);
  const [picking, setPicking] = useState(false);
  const [opener, setOpener] = useState<HTMLElement | null>(null);

  /* The tapped arrangement while it still explains the total — anything left
     over must be less than the smallest plate, or a plate would have gone on —
     and otherwise the total laid out heaviest first. */
  const smallest = Math.min(...plates);
  const rest = round2((value - plateTotal(mine, bar)) / 2);
  const load =
    mine.length > 0 && rest >= 0 && rest < smallest - 1e-9
      ? { perSide: mine, leftover: rest }
      : platesFor(value, bar, unit);
  const perSide = load.perSide;
  /** Over a side and not in plates — shown, and rounded for showing only. */
  const extra = Math.max(0, load.leftover);
  const below = load.leftover < 0;
  const full = perSide.length >= MAX_PLATES;

  /*
   * Every tap moves the total by exactly what it put on or took off, rather
   * than re-adding the picture. The picture's leftover is rounded to two places
   * for the note, and 61.25 on a 20 kg bar is 0.625 a side over: rebuilt from
   * the rounded note, one plate later the card would log 66.26 for 66.25. The
   * difference also carries the leftover through every tap, which is right —
   * it stands for something really on the bar that gymmy has no button for.
   */
  const add = (p: number) => {
    setMine([...perSide, p].sort((a, b) => b - a));
    // Below the bar nothing is loaded yet, so the first plate goes on the bar.
    onChange(round2((below ? bar : value) + 2 * p));
  };
  const remove = (i: number) => {
    setMine(perSide.filter((_, j) => j !== i));
    onChange(round2(value - 2 * (perSide[i] ?? 0)));
  };

  /**
   * A different bar under the same plates, so the total moves by the
   * difference — that is what swapping the bar does in the gym.
   *
   * Except below the bar, where there are no plates to keep and the total is
   * the only thing anybody said: 15 on a 20 kg bar, switched to a 10 kg bar,
   * is still 15 — now a 2.5 a side.
   */
  const pickBar = (next: number) => {
    setPicking(false);
    if (next === bar) return;
    onBarChange(next);
    if (below) return;
    setMine(perSide);
    onChange(round2(value - bar + next));
  };

  const bars = [...new Set([...barChoices, bar])].sort((a, b) => a - b);
  const keys = keyed(perSide);
  const side = round2(perSide.reduce((a, b) => a + b, 0));
  const split = below
    ? tr.t('entry.belowBar')
    : perSide.length === 0
      ? tr.t('entry.emptyBar')
      : tr.t('entry.barSplit', { bar: formatAmount(bar), side: formatAmount(side) });

  const totalId = `${id}-total`;
  const splitId = `${id}-split`;
  const noteId = `${id}-note`;
  const pickId = `${id}-bars`;
  const described = [totalId, splitId, extra > 0 && noteId, describedBy].filter(Boolean).join(' ');

  const plate = (w: number) => {
    const look = lookOf(w, unit);
    return { height: look.height, background: look.color, boxShadow: EDGE };
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          aria-label={tr.t('entry.typeWeight')}
          aria-describedby={described}
          // For tests: the exact total, whatever the plates say.
          data-value={value}
          onClick={(e) => setOpener(e.currentTarget)}
          className="press -ml-2 flex min-h-[var(--spacing-tap)] min-w-0 cursor-pointer flex-col items-start rounded-[11px] px-2 py-1 text-left hover:bg-[var(--color-surface-2)]"
        >
          <span id={totalId} className="num text-[28px] leading-tight font-bold">
            {/* Seen with the scale's decimals, heard as anybody says it. */}
            <span aria-hidden>
              {places === undefined ? formatAmount(value) : formatOnScale(value, places)}
            </span>
            <span className="sr-only">{formatAmount(value)}</span>{' '}
            <span className="text-sm font-semibold text-[var(--color-muted)]">{unit}</span>
          </span>
          <span id={splitId} className="num text-xs text-[var(--color-muted)]">
            {split}
          </span>
          {extra > 0 && (
            <span id={noteId} className="num text-xs text-[var(--color-warn)]">
              {tr.t('entry.notInPlates', { w: formatAmount(extra), unit })}
            </span>
          )}
        </button>
        <button
          type="button"
          aria-expanded={picking}
          aria-controls={pickId}
          onClick={() => setPicking((p) => !p)}
          className={cn(
            'inline-flex min-h-[var(--spacing-tap)] shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3.5',
            'border border-[var(--color-line)] bg-[var(--color-surface-2)] text-sm font-semibold whitespace-nowrap',
            'press hover:bg-[var(--color-surface-3)]',
          )}
        >
          {tr.t('entry.bar', { w: formatAmount(bar), unit })}
          <span
            aria-hidden
            className={cn(
              'text-[10px] transition-transform duration-(--dur-fast) ease-(--ease-out) motion-reduce:transition-none',
              picking && 'rotate-180',
            )}
          >
            ▾
          </span>
        </button>
      </div>

      {picking && (
        <div
          id={pickId}
          role="group"
          aria-label={tr.t('entry.barPick')}
          className="animate-fade flex gap-1.5 rounded-xl bg-[var(--color-surface-2)] p-1"
        >
          {bars.map((b) => (
            <button
              key={b}
              type="button"
              aria-pressed={b === bar}
              onClick={() => pickBar(b)}
              className={cn(
                'num min-h-[var(--spacing-tap)] min-w-0 flex-1 cursor-pointer rounded-[10px] text-sm font-semibold',
                'press',
                b === bar
                  ? 'bg-[var(--color-surface)] text-[var(--color-accent)] shadow-[var(--shadow-card)]'
                  : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]',
              )}
            >
              {formatAmount(b)} {unit}
            </button>
          ))}
        </div>
      )}

      {/* The bar, both sides. Collars at ±32 px from the middle and plates from
          ±40, which leaves each sleeve about 85 px on a 320 px phone — six big
          plates at full thickness, and past that they narrow to fit. */}
      <div className="relative h-16">
        <div
          aria-hidden
          className="absolute top-1/2 left-[calc(50%-32px)] h-1.5 w-16 -translate-y-1/2 bg-[var(--color-muted)] opacity-70"
        />
        <div
          aria-hidden
          className="absolute top-1/2 right-[calc(50%+32px)] left-1 h-2.5 -translate-y-1/2 rounded-l-full bg-[var(--color-muted)]"
        />
        <div
          aria-hidden
          className="absolute top-1/2 right-1 left-[calc(50%+32px)] h-2.5 -translate-y-1/2 rounded-r-full bg-[var(--color-muted)]"
        />
        <div
          aria-hidden
          className="absolute top-1/2 right-[calc(50%+32px)] h-5 w-2 -translate-y-1/2 rounded-sm bg-[var(--color-muted)]"
        />
        <div
          aria-hidden
          className="absolute top-1/2 left-[calc(50%+32px)] h-5 w-2 -translate-y-1/2 rounded-sm bg-[var(--color-muted)]"
        />

        {/* The far side mirrors the near one. Tappable too, since a thumb goes
            to whichever plate is closer, but hidden from assistive technology:
            the buttons on the right already say everything once. */}
        <div
          aria-hidden
          className="absolute inset-y-0 right-[calc(50%+40px)] left-1 flex flex-row-reverse items-center gap-px"
        >
          {perSide.map((w, i) => (
            <span
              key={keys[i]}
              onClick={() => remove(i)}
              className="flex h-full min-w-[3px] shrink cursor-pointer items-center"
              style={{ width: lookOf(w, unit).width }}
            >
              <span className="animate-pop block w-full rounded-[3px]" style={plate(w)} />
            </span>
          ))}
        </div>
        <div className="absolute inset-y-0 right-1 left-[calc(50%+40px)] flex items-center gap-px">
          {perSide.map((w, i) => (
            <button
              key={keys[i]}
              type="button"
              aria-label={tr.t('entry.removePlate', { w: formatAmount(w), unit })}
              onClick={() => remove(i)}
              // The whole height of the drawing is the target, not just the
              // plate: the small plates are a few pixels wide and half as tall.
              className="flex h-full min-w-[3px] shrink cursor-pointer items-center"
              style={{ width: lookOf(w, unit).width }}
            >
              <span
                aria-hidden
                className="animate-pop block w-full rounded-[3px]"
                style={plate(w)}
              />
            </button>
          ))}
        </div>
      </div>

      {/* One row, whatever the unit: seven kilo plates share a 256 px card at
          about 33 px each, full tap height. The number is the label; the swatch
          only says which plate on the bar is which. */}
      <div className="flex gap-1">
        {plates.map((p) => (
          <button
            key={p}
            type="button"
            aria-label={tr.t('entry.addPlate', { w: formatAmount(p), unit })}
            disabled={full}
            onClick={() => add(p)}
            className={cn(
              'flex min-h-[var(--spacing-tap)] min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-1 rounded-[10px]',
              'press border border-[var(--color-line)] bg-[var(--color-surface-2)]',
              'disabled:cursor-not-allowed disabled:opacity-40',
            )}
          >
            <span
              aria-hidden
              className="h-1.5 w-4 rounded-full"
              style={{ background: lookOf(p, unit).color, boxShadow: EDGE }}
            />
            <span aria-hidden className="num text-[12.5px] leading-none font-semibold">
              {formatAmount(p)}
            </span>
          </button>
        ))}
      </div>

      <Keypad
        open={opener !== null}
        opener={opener}
        title={tr.t('entry.weight')}
        unit={unit}
        value={value}
        places={places}
        decimals
        onDone={(v) => {
          // A typed total is laid out afresh: whatever was tapped before no
          // longer describes it.
          setMine([]);
          onChange(v);
        }}
        onClose={() => setOpener(null)}
      />
    </div>
  );
}
