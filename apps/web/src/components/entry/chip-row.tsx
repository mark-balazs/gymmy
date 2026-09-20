'use client';

/**
 * A row of one-tap numbers under a Buttons control — the weights this lift has
 * been logged at, and the reps its range asks for.
 *
 * It exists because of what a gym actually looks like: the reps change every
 * set, and moving a weight by 15 kg is six taps of `+`. The keypad reaches any
 * number but costs a sheet, and `−`/`+` cost a tap each. A chip costs one tap
 * and no sheet, so the common answers are one motion and the rest still work
 * exactly as before.
 *
 * **It offers, it does not advise.** The weights on it are ones the person has
 * lifted and the reps are the ones already written on the plan — see
 * `recentWeights` and `repChoices`, where that line is drawn.
 *
 * The row scrolls sideways rather than wrapping. A second line would push the
 * log button under the tab bar on a 360×640 phone, which the fit test in
 * `entry-modes.spec.ts` holds the card to; a row that scrolls costs nothing
 * when everything fits and clips instead of growing when it does not.
 */

import { useEffect, useRef } from 'react';
import { cn } from '@/components/ui';

export interface ChipOption {
  value: number;
  /** What the chip shows. */
  text: string;
  /** What a screen reader hears, where the drawn text is not enough on its
   *  own — "60 kg" for a bare 60. Left out, the drawn text is the name. */
  said?: string;
}

export function ChipRow({
  label,
  options,
  value,
  onChange,
}: {
  /** Names the group, so the chips are heard as a set rather than as loose
   *  numbers: "Recent weights, 60 kg, pressed". */
  label: string;
  options: ChipOption[];
  /** The number the card holds. Its chip reads as pressed. */
  value: number;
  onChange: (v: number) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  /* What the row is offering, as one string. The effect below keys on this
     rather than on `value`: the chip under the thumb must not slide away as it
     is tapped, but the card's number arrives from IndexedDB a tick after the
     first paint, together with the weights, and at that moment the pressed
     chip can be off the end of a scrolled row. */
  const offering = options.map((o) => o.value).join(',');

  useEffect(() => {
    const el = box.current;
    const chip = el?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!el || !chip) return;
    // Set outright rather than scrolled to: `scrollIntoView` would also scroll
    // the page, which is fighting the card for the same pixels while it opens.
    el.scrollLeft = Math.max(0, chip.offsetLeft - (el.clientWidth - chip.offsetWidth) / 2);
  }, [offering]);

  return (
    <div
      ref={box}
      role="group"
      aria-label={label}
      /* The padding is for the focus ring, pulled back out by the margin so
         the row still lines up with the control above it. No scrollbar: it is
         a thumb's row, and a bar would eat a third of its height.

         `contain: inline-size` is what makes the row scroll instead of push.
         Clipping the overflow is not enough on its own: the chips are
         `shrink-0` and never wrap, so the row's *intrinsic* width is still the
         whole strip, and that measurement travels up the card to a grid item
         with no `min-width: 0` on it — which on a phone widens the page until
         it scrolls sideways and every tap lands a few pixels off. Containment
         says the one true thing: this row's width comes from its parent and
         never from what is in it. */
      className={cn(
        '-mx-0.5 mt-1.5 flex gap-1.5 overflow-x-auto px-0.5 py-0.5 [contain:inline-size]',
        '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
      )}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            /* The drawn chip is the bare number — the unit is in the caption
               above and the row would not fit it twice. A screen reader has
               neither, so it hears the whole thing. */
            aria-label={o.said}
            onClick={() => onChange(o.value)}
            className={cn(
              'press num shrink-0 cursor-pointer rounded-full border px-3 py-1.5',
              'min-h-9 text-[13px] font-semibold whitespace-nowrap',
              on
                ? 'border-[var(--color-accent)] bg-[var(--color-good-bg)] text-[var(--color-accent)]'
                : 'border-[var(--color-line)] bg-[var(--color-surface-2)] text-[var(--color-ink)]',
            )}
          >
            {o.text}
          </button>
        );
      })}
    </div>
  );
}
