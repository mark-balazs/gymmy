'use client';

/**
 * Opens and closes a block smoothly, and mounts it only while it is open.
 *
 * Built for the exercise cards on Train. Swapping a card's body in and out
 * made the page below it jump by a card's height in one frame, which on a
 * phone reads as the screen lurching; animating the height instead lets the
 * eye follow where things went.
 *
 * **Rows, not height.** A grid row going from `0fr` to `1fr` animates to the
 * content's real height without anybody measuring it, so nothing here reads
 * the DOM and a body that changes size while open — a set logged, a keypad
 * value — simply follows. The inner box needs `min-height: 0` and hidden
 * overflow while it moves, or it refuses to shrink below its content.
 *
 * **Unmounted once closed.** Only after the closing transition ends, so it
 * still animates out — then gone, which keeps "one open card, one set of
 * inputs" literally true for a screen reader and for the tests that count
 * them. The card's state lives above this, so unmounting loses nothing. While
 * it closes it is `inert` and hidden from assistive technology already: a
 * card on its way out is not somewhere to type.
 *
 * **Reduced motion.** The global rule shortens every transition to 0.01 ms
 * rather than removing it, so `transitionend` still fires and the sequence
 * below runs the same way, only instantly. A 400 ms fallback covers a
 * transition that never starts at all — a browser without `@starting-style`,
 * a tab in the background.
 */

import { useEffect, useEffectEvent, useState } from 'react';
import type { ReactNode, TransitionEvent } from 'react';
import { cn } from '@/components/ui';

/** Past the 280 ms transition with room to spare, and short enough that a
 *  missed event is a hitch rather than a hang. */
const FALLBACK_MS = 400;

export function Collapse({
  open,
  onOpened,
  children,
}: {
  open: boolean;
  /**
   * Called once the opening has finished — the moment the block has its full
   * height, which is when scrolling it into view lands in the right place.
   * Not called for a block that was open from the start, which never moved.
   */
  onOpened?: () => void;
  children: ReactNode;
}) {
  /** Whether the children are in the DOM — open, or still closing. */
  const [present, setPresent] = useState(open);
  const [wasOpen, setWasOpen] = useState(open);
  /** Opening and not finished yet. Starts false: open on arrival is not an opening. */
  const [opening, setOpening] = useState(false);

  /* Adjusted while rendering rather than in an effect, as React recommends for
     state that follows a prop — an effect would render the closed frame first
     and only then start opening. */
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setPresent(true);
      setOpening(true);
    }
  }

  const finishOpening = () => {
    if (!opening) return;
    setOpening(false);
    onOpened?.();
  };
  const fallback = useEffectEvent(() => {
    if (open) finishOpening();
    else setPresent(false);
  });

  useEffect(() => {
    if (open ? !opening : !present) return;
    const t = window.setTimeout(() => fallback(), FALLBACK_MS);
    return () => window.clearTimeout(t);
  }, [open, opening, present]);

  /* Only the grid's own row transition counts — a button inside that fades
     its background would otherwise end the opening early. */
  const ours = (e: TransitionEvent<HTMLDivElement>) =>
    e.target === e.currentTarget && e.propertyName === 'grid-template-rows';

  if (!present) return null;
  return (
    <div
      inert={!open}
      aria-hidden={open ? undefined : true}
      onTransitionEnd={(e) => {
        if (!ours(e)) return;
        if (open) finishOpening();
        else setPresent(false);
      }}
      onTransitionCancel={(e) => {
        // Cancelled while closing means it was removed or reversed; reversed
        // is handled by the opening's own end, so only closing acts on it.
        if (ours(e) && !open) setPresent(false);
      }}
      className={cn(
        'grid transition-[grid-template-rows] duration-[280ms] ease-[var(--ease-out-soft)]',
        open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        // Mounted open, it starts from nothing — `@starting-style` gives a new
        // element a first frame to transition from, without a render to wait
        // on. Left off for a block that was open on arrival.
        opening && 'starting:grid-rows-[0fr]',
      )}
    >
      {/* Clipped only while moving. Once open the clip goes, or it would cut
          the focus rings and shadows of whatever sits against its edges. */}
      <div className={cn('min-h-0', open && !opening ? 'overflow-visible' : 'overflow-hidden')}>
        {children}
      </div>
    </div>
  );
}
