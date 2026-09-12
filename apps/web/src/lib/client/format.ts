/**
 * Turns structured domain results into sentences.
 *
 * The domain layer deliberately returns data, not prose, so that both languages
 * can phrase things naturally instead of stitching fragments together.
 */

import type { Translator } from './hooks';
import type { Suggestion, Trend } from '@athletic/domain';

export function suggestionText(tr: Translator, s: Suggestion, unit: string): string {
  const w = s.detail.lastWeight ? `${s.detail.lastWeight} ${unit}` : '';
  const r = s.detail.lastReps ?? 0;

  switch (s.kind) {
    case 'first':
      return s.detail.timed
        ? tr.t('sug.firstCarry')
        : tr.t('sug.firstReps', { n: s.detail.targetReps ?? 6 });
    case 'up':
      return tr.t('sug.up', { w, r, n: s.detail.targetReps ?? 6 });
    case 'hold':
      return s.detail.timed ? tr.t('sug.carry', { w }) : tr.t('sug.hold', { w, r });
    case 'rep':
      return tr.t('sug.rep', { w, r });
  }
}

export function targetText(tr: Translator, s: Suggestion, unit: string): string {
  if (s.reps === null) return s.weight ? `${s.weight} ${unit}` : tr.t('train.pickLoad');
  return `${s.weight ? `${s.weight} ${unit}` : '—'} × ${s.reps}`;
}

export function trendText(tr: Translator, t: Trend): string {
  if (t.points === 0) return tr.t('trend.none');
  if (t.points === 1) return tr.t('trend.one');
  if (t.dir === 'up') return tr.t('trend.up', { pct: t.pct });
  if (t.dir === 'down') return tr.t('trend.down');
  if (t.stalledWeeks >= 3) return tr.t('trend.flatFor', { n: t.stalledWeeks });
  return tr.t('trend.flat');
}

export const EFFORTS = [0, 1, 2, 4] as const;

export const fmtDay = (iso: string): string => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};
