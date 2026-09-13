'use client';

import { useMemo, useState } from 'react';
import { Button, Card, InfoButton, Sheet, Summary, cn } from '@/components/ui';
import { LineChart, type ChartPoint } from '@/components/chart';
import { useProfile, useSnapshot, useT, useToday } from '@/lib/client/hooks';
import { fireAndForget, logBodyWeight } from '@/lib/client/mutations';
import { trendText } from '@/lib/client/format';
import {
  DEFAULT_PREFS,
  bodyWeightOn,
  mondayOf,
  programExercises,
  progressFor,
  strengthSeries,
  trend,
} from '@athletic/domain';
import type { SeriesPoint } from '@athletic/domain';

/** "12 Mar" — short enough for an axis end, unambiguous enough to place. */
const shortDay = (iso: string, lang: string): string =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(lang === 'hu' ? 'hu-HU' : 'en-GB', {
    day: 'numeric',
    month: 'short',
  });

/**
 * Marks the weeks that set a new best.
 *
 * A running maximum rather than "equal to the overall best", so the second time
 * you match a number it is not celebrated again — a personal best is the week
 * you first got there.
 */
function withPeaks(series: SeriesPoint[], lang: string): ChartPoint[] {
  let best = -Infinity;
  return series.map((p) => {
    const peak = p.value !== null && p.value > best;
    if (peak) best = p.value!;
    return { label: shortDay(p.weekOf, lang), value: p.value, peak };
  });
}

export default function ProgressPage() {
  const { ix } = useSnapshot();
  const profile = useProfile();
  const tr = useT();
  const today = useToday();

  const [weight, setWeight] = useState('');
  const [explain, setExplain] = useState(false);

  const blockStart = profile?.blockStart ?? mondayOf(new Date());
  const days = profile?.days ?? DEFAULT_PREFS.days;
  const unit = profile?.unit ?? DEFAULT_PREFS.unit;
  const weeks = profile?.blockWeeks ?? DEFAULT_PREFS.blockWeeks;
  const sex = profile?.sex ?? DEFAULT_PREFS.sex;

  const strength = useMemo(
    () => strengthSeries(ix, blockStart, weeks, { unit, sex }),
    [ix, blockStart, weeks, unit, sex],
  );

  /** Everything trained: what the plan currently holds, then anything logged
   *  that has since dropped out of it — history does not disappear because the
   *  week was rebuilt. Built by concatenation rather than by pushing into the
   *  array `programExercises` returned, which also drops an O(n²) lookup. */
  const trained = useMemo(() => {
    const logged = new Set(ix.logs.map((l) => l.exerciseId));
    const planned = programExercises(ix, days).filter((e) => logged.has(e.id));
    const inPlan = new Set(planned.map((e) => e.id));
    const dropped = ix.exercises.filter((e) => logged.has(e.id) && !inPlan.has(e.id));
    return [...planned, ...dropped];
  }, [ix, days]);

  const scored = strength.filter((s) => s.score !== null);
  const current = scored.at(-1) ?? null;
  // Eight weeks back is the same window the score itself looks over, so the
  // comparison is against a genuinely different stretch of training.
  const earlier = scored.at(-9) ?? scored[0] ?? null;
  const delta = current && earlier && earlier !== current ? current.score! - earlier.score! : null;
  const bodyWeight = bodyWeightOn(ix, today);

  if (trained.length === 0) {
    return (
      <Card>
        <p className="text-[var(--color-muted)]">{tr.t('prog.empty')}</p>
      </Card>
    );
  }

  return (
    <>
      <Card className="flex flex-col gap-3">
        <div className="flex items-center gap-1">
          <h2 className="flex-1 text-[17px] font-semibold">{tr.t('prog.strength')}</h2>
          <InfoButton label={tr.t('prog.strengthWhat')} onClick={() => setExplain(true)} />
        </div>

        {current ? (
          <div className="flex items-baseline gap-3">
            {/* The one hero number on the page. Proportional figures: tabular
                digits make a three-digit number look loose at this size. */}
            <span className="text-[44px] leading-none font-bold">{current.score}</span>
            {delta !== null && (
              <span
                className={cn(
                  'text-sm font-semibold',
                  delta > 0 && 'text-[var(--color-accent)]',
                  delta < 0 && 'text-[var(--color-bad)]',
                  delta === 0 && 'text-[var(--color-muted)]',
                )}
              >
                {delta > 0 ? '+' : ''}
                {Math.round(delta)}{' '}
                <span className="font-normal text-[var(--color-muted)]">
                  {tr.t('prog.vsWeeks', { n: 8 })}
                </span>
              </span>
            )}
          </div>
        ) : (
          <Summary tone="idle">
            {bodyWeight ? tr.t('prog.needLifts') : tr.t('prog.needWeight')}
          </Summary>
        )}

        {scored.length > 1 && (
          <LineChart
            points={strength.map((s) => ({ label: shortDay(s.weekOf, tr.lang), value: s.score }))}
            unit=""
            label={tr.t('prog.scoreOverTime')}
            tableLabel={tr.t('prog.table')}
            labelHeader={tr.t('prog.week')}
            valueHeader={tr.t('prog.score')}
          />
        )}

        <form
          className="flex items-end gap-2 border-t border-[var(--color-line)] pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(weight.replace(',', '.'));
            if (!Number.isFinite(n) || n <= 0) return;
            fireAndForget(logBodyWeight(today, n));
            setWeight('');
          }}
        >
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-xs font-semibold text-[var(--color-muted)]">
              {tr.t('prog.bodyWeight')}
              {bodyWeight ? ` · ${bodyWeight} ${unit}` : ''}
            </span>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              placeholder={tr.t('prog.weightToday', { unit })}
              aria-label={tr.t('prog.weightToday', { unit })}
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="num min-h-[var(--spacing-tap)] w-full min-w-0 rounded-[11px] border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3"
            />
          </label>
          <Button type="submit" disabled={weight.trim() === ''}>
            {tr.t('common.save')}
          </Button>
        </form>
      </Card>

      {trained.map((e) => {
        const p = progressFor(ix, e.id, blockStart, weeks);
        const t = trend(ix, e.id, blockStart, weeks);
        const points = withPeaks(p.series, tr.lang);
        return (
          <Card key={e.id} className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex-1 truncate text-[17px] font-semibold">{e.name}</h2>
              <span
                className={cn(
                  'text-[15px] font-bold',
                  t.dir === 'up' && 'text-[var(--color-accent)]',
                  t.dir === 'down' && 'text-[var(--color-bad)]',
                  (t.dir === 'flat' || t.dir === 'none') && 'text-[var(--color-muted)]',
                )}
              >
                {t.dir === 'up' ? '▲' : t.dir === 'down' ? '▼' : '—'}
              </span>
            </div>

            <Summary tone={t.dir === 'up' ? 'good' : t.dir === 'down' ? 'gap' : 'near'}>
              {trendText(tr, t)}
            </Summary>

            {p.bestSet && (
              <p className="num text-[13px] text-[var(--color-muted)]">
                {tr.t('prog.bestSet', {
                  w: p.bestSet.weight ?? 0,
                  unit,
                  r: p.bestSet.reps ?? 0,
                })}{' '}
                · {tr.plural(p.totalSets, 'set')}
              </p>
            )}

            <LineChart
              points={points}
              unit={unit}
              label={tr.t('prog.overTime')}
              tableLabel={tr.t('prog.table')}
              labelHeader={tr.t('prog.week')}
              valueHeader={tr.t('prog.value')}
            />
            {points.some((c) => c.peak) && (
              <p className="text-[11px] text-[var(--color-muted)]">{tr.t('prog.prs')}</p>
            )}
          </Card>
        );
      })}

      <Sheet title={tr.t('prog.strengthWhat')} open={explain} onClose={() => setExplain(false)}>
        <p className="text-sm leading-relaxed">{tr.t('prog.strengthBody')}</p>
        <p className="text-sm leading-relaxed text-[var(--color-muted)]">
          {tr.t('prog.strengthNot')}
        </p>
        {current && (
          <div className="flex flex-col gap-1">
            {current.parts.map((part) => (
              <div key={part.key} className="flex items-baseline justify-between gap-3 text-sm">
                <span>{tr.t(`pattern.${part.key}` as never)}</span>
                <span className={cn('num', part.best === 0 && 'text-[var(--color-bad)]')}>
                  {part.best ? `${Math.round(part.best)} ${unit}` : '—'}
                </span>
              </div>
            ))}
          </div>
        )}
      </Sheet>
    </>
  );
}
