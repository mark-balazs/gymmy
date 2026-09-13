'use client';

/**
 * Which way a number went, and by how much.
 *
 * The strength score used to say "+6 vs 8 weeks ago" — nine characters of
 * context repeated on a card you look at daily, on a phone where the width was
 * needed by the number itself. The arrow carries the sign, so the digits do not
 * have to, and the same mark now appears against every lift: one glance down
 * the list tells you what is going up and what is not, which no amount of
 * "+2.5 kg" in a column ever quite did.
 *
 * Colour is never the only signal — the arrow's direction says the same thing —
 * because a red and a green number are the same number to a good share of
 * people, and this is the one place in the app tempted to rely on that.
 *
 * The sentence it replaced survives as the accessible name and as the tooltip.
 * A bare "↑ 6" is meaningless read out on its own.
 */

import { cn } from '@/components/ui';

const ARROW = {
  up: 'M5 15.5 12 8.5l7 7',
  down: 'M5 8.5 12 15.5l7-7',
  flat: 'M5 12h14',
} as const;

export function Delta({
  value,
  label,
  className,
}: {
  /** Signed. Rounded by the caller, which knows whether it is kilos or points. */
  value: number;
  /** The sentence the arrow and the number are short for. */
  label: string;
  className?: string;
}) {
  const dir = value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        'num inline-flex shrink-0 items-center gap-0.5 font-semibold',
        dir === 'up' && 'text-[var(--color-accent)]',
        dir === 'down' && 'text-[var(--color-bad)]',
        dir === 'flat' && 'text-[var(--color-muted)]',
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-[1.05em] w-[1.05em]"
      >
        <path d={ARROW[dir]} />
      </svg>
      {/* Unsigned: a minus beside a downward arrow is the same fact twice, and
          it reads as a double negative for a moment before it does not. */}
      {Math.abs(value)}
    </span>
  );
}
