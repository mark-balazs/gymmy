/**
 * Where an info tip goes, given the ⓘ it belongs to.
 *
 * Pure, so the geometry is tested without a browser (`place-tip.test.ts`).
 * JavaScript rather than CSS anchor positioning: iOS 17 and 18 have none, and
 * a CSS path with a JavaScript fallback would leave the fallback — the one
 * older iPhones use — untested, because the e2e suite runs Chromium only.
 *
 * Below the ⓘ when there is room, above it otherwise; never closer than 16 px
 * to either side of the screen; never taller than the space on its side,
 * scrolling inside itself if the text is longer. Measured from `bottom` when
 * it sits above, so the tip's own height never has to be known.
 */

export interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface Viewport {
  width: number;
  height: number;
}

/** The notch and the home bar, where the app draws under them (`viewportFit: 'cover'`). */
export interface Insets {
  top: number;
  bottom: number;
}

export type Side = 'below' | 'above';

export interface Placement {
  side: Side;
  left: number;
  width: number;
  /** Set when below: the tip's top edge. */
  top: number | null;
  /** Set when above: the distance from the tip's bottom edge to the screen's. */
  bottom: number | null;
  maxHeight: number;
  /** Where the caret sits, from the tip's left edge — under the ⓘ where possible. */
  caretX: number;
}

export const TIP = {
  /** About 3 short sentences a line at a time on a phone. */
  maxWidth: 288,
  /** From the sides of the screen. */
  edge: 16,
  /** From the top and bottom of the screen. */
  edgeY: 8,
  /** Between the ⓘ and the tip. */
  gap: 8,
  /** Enough room below for a tip of a few lines: take it even if above has more. */
  roomBelow: 140,
  /** The caret never closer than this to the tip's own corners. */
  caret: 12,
} as const;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

export function placeTip(
  anchor: Rect,
  view: Viewport,
  insets: Insets = { top: 0, bottom: 0 },
  /** The side it opened on: kept while it follows a scroll, so it never flips mid-read. */
  keep?: Side,
): Placement {
  const width = Math.max(0, Math.min(TIP.maxWidth, view.width - 2 * TIP.edge));
  const centre = (anchor.left + anchor.right) / 2;
  const left = clamp(centre - width / 2, TIP.edge, view.width - TIP.edge - width);

  const below = view.height - insets.bottom - TIP.edgeY - (anchor.bottom + TIP.gap);
  const above = anchor.top - TIP.gap - insets.top - TIP.edgeY;
  const side: Side = keep ?? (below >= TIP.roomBelow || below >= above ? 'below' : 'above');

  return {
    side,
    left,
    width,
    top: side === 'below' ? anchor.bottom + TIP.gap : null,
    bottom: side === 'above' ? view.height - anchor.top + TIP.gap : null,
    maxHeight: Math.max(0, side === 'below' ? below : above),
    caretX: clamp(centre - left, TIP.caret, width - TIP.caret),
  };
}
