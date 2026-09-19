'use client';

/**
 * The tick for something finished — an exercise on Train, a day's tab.
 *
 * A stroke rather than the ✓ character, so that it can draw itself at the
 * moment it is earned (`draw`), and look the same in every font. Drawn once:
 * a tick that is already there when the screen appears — a day finished
 * yesterday, a reload — is simply there. The caller decides which, because
 * only the caller knows whether it just changed.
 *
 * Decorative: whatever carries it also says "done" in words for a screen
 * reader.
 */

// clsx itself rather than `cn` from ui.tsx, which draws a day's tab with this.
import { clsx as cn } from 'clsx';

export function Tick({
  draw = false,
  onDrawn,
  className,
}: {
  /** Draw it now. Under reduced motion it fades in whole instead. */
  draw?: boolean;
  /** When the drawing has finished — so the caller can stop asking for it,
   *  and a remount (a card reopened) does not draw it a second time. */
  onDrawn?: () => void;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={cn('inline-block shrink-0', className)}>
      <path
        d="M3.4 8.7 6.6 11.8 12.7 4.6"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray={1}
        className={draw ? 'animate-draw' : undefined}
        onAnimationEnd={onDrawn}
      />
    </svg>
  );
}
