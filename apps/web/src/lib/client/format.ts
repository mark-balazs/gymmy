/** Small shared formatters. */

export const EFFORTS = [0, 1, 2, 4] as const;

export const fmtDay = (iso: string): string => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

/**
 * The strength index, as every screen writes it: one decimal, trailing zero
 * included. It lands in the tens where a DOTS lands in the hundreds, and the
 * decimal is half of telling them apart — written "34", the week it happens to
 * be round is the week it looks like the other number. One function, so
 * Progress and the calendar cannot drift apart again.
 */
export const fmtIndex = (index: number): string => index.toFixed(1);
