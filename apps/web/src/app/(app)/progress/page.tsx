'use client';

import { useMemo } from 'react';
import { Card, Summary, cn } from '@/components/ui';
import { useProfile, useSnapshot, useT } from '@/lib/client/hooks';
import { trendText } from '@/lib/client/format';
import { mondayOf, programExercises, progressFor, trend } from '@athletic/domain';
import type { SeriesPoint } from '@athletic/domain';

/** Hand-drawn so there is no chart library to ship, cache or keep current. */
function Spark({ points }: { points: SeriesPoint[] }) {
  const vals = points.filter((p): p is { weekOf: string; value: number } => p.value !== null);
  if (vals.length < 2) return null;

  const W = 320;
  const H = 76;
  const min = Math.min(...vals.map((v) => v.value));
  const max = Math.max(...vals.map((v) => v.value));
  const lo = min === max ? min - 5 : min - (max - min) * 0.15;
  const hi = min === max ? max + 5 : max + (max - min) * 0.15;
  const x = (i: number) => (i / Math.max(1, points.length - 1)) * W;
  const y = (v: number) => H - ((v - lo) / (hi - lo)) * H;

  // Gaps break the line rather than implying progress in a week with no sets.
  let d = '';
  let pen = false;
  points.forEach((p, i) => {
    if (p.value === null) {
      pen = false;
      return;
    }
    d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`;
    pen = true;
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-[76px] w-full">
      <path
        d={d}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function ProgressPage() {
  const { ix } = useSnapshot();
  const profile = useProfile();
  const tr = useT();

  const days = profile?.days ?? 3;
  const blockStart = profile?.blockStart ?? mondayOf(new Date());
  const weeks = profile?.blockWeeks ?? 8;
  const unit = profile?.unit ?? 'kg';

  const trained = useMemo(() => {
    const logged = new Set(ix.logs.map((l) => l.exerciseId));
    const pool = programExercises(ix, days);
    for (const e of ix.exercises) {
      if (logged.has(e.id) && !pool.some((p) => p.id === e.id)) pool.push(e);
    }
    return pool.filter((e) => logged.has(e.id));
  }, [ix, days]);

  if (trained.length === 0) {
    return (
      <Card>
        <p className="text-[var(--color-muted)]">{tr.t('prog.empty')}</p>
      </Card>
    );
  }

  return (
    <>
      {trained.map((e) => {
        const p = progressFor(ix, e.id, blockStart, weeks);
        const t = trend(ix, e.id, blockStart, weeks);
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

            <Spark points={p.series} />
          </Card>
        );
      })}
    </>
  );
}
