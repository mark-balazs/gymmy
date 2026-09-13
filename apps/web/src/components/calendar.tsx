'use client';

/**
 * The last few weeks, at a glance.
 *
 * Home answers "what now?"; this answers "how has it been going?" without
 * making anybody open a chart. A filled square is a day you trained, and the
 * shape of a month of them says more about consistency than any number the app
 * could print — a run of empty Mondays is legible here and invisible everywhere
 * else in the app.
 *
 * Tapping a day opens what happened on it: the sets, the strength score as at
 * that week, and what you weighed. All three are read out of the logs rather
 * than out of the plan, because the plan is rebuilt whenever somebody changes
 * split and a day in September has to keep saying what happened in September.
 */

import { useMemo, useState } from 'react';
import { Sheet, cn } from '@/components/ui';
import { useProfile, useSnapshot, useT, useToday } from '@/lib/client/hooks';
import {
  addDays,
  bodyWeightOn,
  dayDetail,
  DEFAULT_PREFS,
  mondayOf,
  setsPerDay,
  strengthAt,
} from '@athletic/domain';

/** Eight weeks: enough to see a habit, and it still fits a phone at 7 columns. */
const WEEKS = 8;

const dayName = (iso: string, lang: string): string =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(lang, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

export function Calendar() {
  const { ix } = useSnapshot();
  const profile = useProfile();
  const tr = useT();
  const today = useToday();
  const [open, setOpen] = useState<string | null>(null);

  const unit = profile?.unit ?? DEFAULT_PREFS.unit;

  const { days, counts } = useMemo(() => {
    // Whole weeks, Monday-aligned, ending with the week containing today — so
    // the columns are weekdays and a column really is "every Tuesday".
    const start = addDays(mondayOf(today), -7 * (WEEKS - 1));
    const end = addDays(start, WEEKS * 7 - 1);
    return {
      days: Array.from({ length: WEEKS * 7 }, (_, i) => addDays(start, i)),
      counts: setsPerDay(ix, start, end),
    };
  }, [ix, today]);

  const detail = useMemo(() => (open ? dayDetail(ix, open) : null), [ix, open]);
  const score = useMemo(
    () =>
      open
        ? strengthAt(ix, mondayOf(open), {
            unit,
            sex: profile?.sex ?? DEFAULT_PREFS.sex,
            birthYear: profile?.birthYear ?? null,
          })
        : null,
    [ix, open, unit, profile?.sex, profile?.birthYear],
  );

  const weekdays = useMemo(
    () =>
      days.slice(0, 7).map((d) =>
        new Date(`${d}T12:00:00`).toLocaleDateString(tr.lang, {
          weekday: 'narrow',
        }),
      ),
    [days, tr.lang],
  );

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <div
          aria-hidden
          className="grid grid-cols-7 gap-1 text-center text-[10px] text-[var(--color-muted)]"
        >
          {weekdays.map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>

        <div role="list" className="grid grid-cols-7 gap-1">
          {days.map((date) => {
            const sets = counts.get(date) ?? 0;
            const isToday = date === today;
            const future = date > today;
            return (
              <button
                key={date}
                type="button"
                role="listitem"
                disabled={sets === 0}
                onClick={() => setOpen(date)}
                aria-label={
                  sets
                    ? tr.t('cal.dayTrained', { day: dayName(date, tr.lang), n: sets })
                    : tr.t('cal.dayEmpty', { day: dayName(date, tr.lang) })
                }
                className={cn(
                  'aspect-square rounded-[7px] text-[10px] font-semibold',
                  'transition-transform duration-150 active:scale-[0.9]',
                  sets > 0
                    ? 'cursor-pointer bg-[var(--color-accent)] text-[var(--color-accent-ink)]'
                    : 'text-[var(--color-muted)]',
                  // A day that has not happened yet is not a day you missed.
                  sets === 0 && !future && 'bg-[var(--color-surface-2)]',
                  sets === 0 && future && 'border border-dashed border-[var(--color-line)]',
                  isToday && 'ring-2 ring-[var(--color-accent-2)]',
                )}
                style={sets > 0 ? { opacity: Math.min(1, 0.55 + sets * 0.06) } : undefined}
              >
                {date.slice(-2).replace(/^0/, '')}
              </button>
            );
          })}
        </div>
      </div>

      {open && (
        <Sheet title={dayName(open, tr.lang)} open onClose={() => setOpen(null)}>
          <div className="flex gap-3">
            <Stat
              label={tr.t('prog.strength')}
              value={score?.score != null ? String(score.score) : '—'}
            />
            <Stat
              label={tr.t('prog.bodyWeight')}
              value={bodyWeightOn(ix, open) ? `${bodyWeightOn(ix, open)} ${unit}` : '—'}
            />
            <Stat label={tr.t('cal.sets')} value={detail ? String(detail.sets) : '0'} />
          </div>

          {detail ? (
            <div className="flex flex-col gap-2">
              {detail.exercises.map(({ exercise, pattern, logs }) => (
                <div
                  key={exercise.id}
                  className="rounded-[11px] border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 py-2.5"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-sm font-semibold">
                      {tr.exercise(exercise)}
                    </span>
                    <span className="shrink-0 text-[11px] text-[var(--color-muted)]">
                      {tr.pattern(pattern)}
                    </span>
                  </div>
                  <ul className="num mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[var(--color-muted)]">
                    {logs.map((l) => (
                      <li key={l.id}>
                        {l.weight ?? 0} {unit} × {l.reps ?? 0}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--color-muted)]">{tr.t('cal.nothing')}</p>
          )}
        </Sheet>
      )}
    </>
  );
}

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
    <span className="truncate text-[11px] text-[var(--color-muted)]">{label}</span>
    <span className="num text-lg font-bold">{value}</span>
  </div>
);
