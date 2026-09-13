/**
 * The mark: three ascending strides, leaning into the run.
 *
 * The same geometry as `app/icon.svg`, which is what the PWA icons are
 * generated from (`scripts/build-icons.mjs`). Kept as a component rather than
 * an `<img>` so it inherits `currentColor` and stays crisp at any size —
 * a logo that needs a colour variant per theme is a logo that will end up
 * wrong in one of them.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 26.5 14" fill="currentColor" aria-hidden className={className}>
      <g transform="skewX(-28)">
        <rect x="7.44" y="9.26" width="4.6" height="4.74" rx="1.3" />
        <rect x="14.64" y="5.38" width="4.6" height="8.62" rx="1.3" />
        <rect x="21.84" y="0" width="4.6" height="14" rx="1.3" />
      </g>
    </svg>
  );
}
