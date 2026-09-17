/** Small shared formatters. */

export const EFFORTS = [0, 1, 2, 4] as const;

export const fmtDay = (iso: string): string => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};
