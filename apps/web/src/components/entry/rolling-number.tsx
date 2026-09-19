'use client';

/**
 * A number whose changed digits roll in from the direction it moved.
 *
 * Going up, the new digit rises from below, like an odometer; going down, it
 * drops in from above. Only the digits that changed move — 60.0 to 62.5 rolls
 * the 0 and the 0 and leaves the 6 standing — which is what makes a quick drag
 * across the ruler read as a dial turning rather than a label being swapped.
 *
 * Kept off React's hot path: the text renders as it always did, and the roll
 * is a Web Animation started on the changed cells after the commit. A new
 * change cancels the one in flight, so a fast flick never queues rolls up; and
 * each lasts well under the time between two stops on a slow drag. With
 * reduced motion the digits simply change.
 *
 * Lines up from the right: the scale gives every value the same decimals, so
 * the columns match from the end even when a digit is added in front (97.5 to
 * 100.0).
 *
 * Not for a screen reader to read: each digit is a box of its own, and it
 * reads them one at a time — "1", "5" (GYM-18). Hide it (`aria-hidden`) or put
 * it in a control named by its label, and say the words in an `sr-only` span.
 */

import { useLayoutEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { cn } from '@/components/ui';
import { duration, easing, reducedMotion } from '@/components/motion';

export function RollingNumber({
  text,
  value,
  className,
  style,
}: {
  /** What is shown. */
  text: string;
  /** The number behind it, for the direction; null when the text is not one. */
  value: number | null;
  className?: string;
  style?: CSSProperties;
}) {
  const box = useRef<HTMLSpanElement>(null);
  const last = useRef({ text, value });

  useLayoutEffect(() => {
    const before = last.current;
    last.current = { text, value };
    const el = box.current;
    if (!el || before.text === text || before.value === null || value === null) return;
    if (value === before.value || typeof el.animate !== 'function' || reducedMotion()) return;

    const from = value > before.value ? 60 : -60;
    const timing = { duration: duration('--dur-fast'), easing: easing('--ease-out') };
    const cells = el.children;
    for (let k = 1; k <= text.length; k++) {
      if (text[text.length - k] === before.text[before.text.length - k]) continue;
      const cell = cells[text.length - k];
      if (!(cell instanceof HTMLElement)) continue;
      for (const running of cell.getAnimations()) running.cancel();
      cell.animate(
        [
          { transform: `translateY(${from}%)`, opacity: 0 },
          { transform: 'translateY(0)', opacity: 1 },
        ],
        timing,
      );
    }
  }, [text, value]);

  return (
    <span ref={box} className={cn('inline-flex overflow-hidden', className)} style={style}>
      {[...text].map((c, i) => (
        <span key={i} className="inline-block">
          {c}
        </span>
      ))}
    </span>
  );
}
