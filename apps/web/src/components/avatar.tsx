'use client';

/**
 * Your picture, wherever it appears.
 *
 * Shared because there are now two of them — a large one you tap to change in
 * Settings and a small one in the header — and the interesting part is the
 * *absence* case, which has to look the same in both. A silhouette rather than
 * a plus sign or an initial: a plus in a grey circle reads as a broken image
 * before it reads as an invitation, and an initial is wrong the moment somebody
 * has not told us their name, which is most people on their first day.
 *
 * The picture itself is a data URL held in the profile row, so there is nothing
 * for an image optimiser to fetch and `next/image` would only add a wrapper.
 */

import { cn } from '@/components/ui';

export function Avatar({ src, className }: { src?: string | null; className?: string }) {
  return (
    <span
      className={cn(
        'grid h-full w-full place-items-center overflow-hidden rounded-full',
        'border border-[var(--color-line)] bg-[var(--color-surface-2)]',
        className,
      )}
    >
      {src ? (
        /* eslint-disable-next-line @next/next/no-img-element -- a data URL:
           there is nothing for an image optimiser to fetch or transform. */
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <svg
          viewBox="0 0 24 24"
          aria-hidden
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="h-[52%] w-[52%] text-[var(--color-muted)]"
        >
          <circle cx="12" cy="9" r="3.4" />
          <path d="M4.8 20c0-3.7 3.2-5.6 7.2-5.6s7.2 1.9 7.2 5.6" strokeLinecap="round" />
        </svg>
      )}
    </span>
  );
}
