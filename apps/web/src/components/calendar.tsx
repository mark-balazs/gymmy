'use client';

/**
 * A month, the way a calendar is a month.
 *
 * This was eight rolling weeks ending with the current one, which is a fine
 * heatmap and a poor calendar: the columns were weekdays but the rows belonged
 * to no month, so "the 3rd" appeared twice on screen in different places and
 * there was no way to look at March. A calendar is the one widget where people
 * already know exactly what they are getting, and giving them something else
 * that looks like it is worse than giving them something that looks different.
 *
 * So: a real month grid, Monday-first, with the neighbouring days left blank
 * rather than greyed — a faint 31st of the previous month is one more thing to
 * read past on a phone.
 *
 * Tapping a day opens what happened on it: the sets, the strength score as at
 * that week, and what you weighed. All three are read out of the logs rather
 * than out of the plan, because the plan is rebuilt whenever somebody changes
 * split and a day in September has to keep saying what happened in September.
 */

import { useMemo, useState } from 'react';
import { Sheet, cn } from '@/components/ui';
import { useProfile, useSnapshot, useT, useToday } from '@/lib/client/hooks';
import { fmtIndex } from '@/lib/client/format';
import {
  bodyWeightOn,
  dayDetail,
  DEFAULT_PREFS,
  mondayOf,
  setsPerDay,
  strengthAt,
} from '@athletic/domain';

/** A Monday, used only to name the weekday columns in the user's language. */
const A_MONDAY = '2024-01-01';

const dayName = (iso: string, lang: string): string =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(lang, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

/** The first of the month a date falls in. */
const monthOf = (iso: string): string => `${iso.slice(0, 7)}-01`;

const shiftMonth = (monthIso: string, by: number): string => {
  const [y, m] = monthIso.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1 + by, 1)).toISOString().slice(0, 10);
};

/** Day 0 of the *next* month is the last day of this one. */
const lengthOf = (monthIso: string): number => {
  const [y, m] = monthIso.split('-').map(Number);
  return new Date(Date.UTC(y!, m!, 0)).getUTCDate();
};

/** Monday-first column index, because a week here starts on a Monday
 *  everywhere else in the app too. */
const mondayIndex = (monthIso: string): number =>
  (new Date(`${monthIso}T12:00:00Z`).getUTCDay() + 6) % 7;

export function Calendar() {
  const { ix } = useSnapshot();
  const profile = useProfile();
  const tr = useT();
  const today = useToday();
  const [month, setMonth] = useState(() => monthOf(today));
  const [open, setOpen] = useState<string | null>(null);

  const unit = profile?.unit ?? DEFAULT_PREFS.unit;

  const { days, counts, leading } = useMemo(() => {
    const length = lengthOf(month);
    const last = `${month.slice(0, 8)}${String(length).padStart(2, '0')}`;
    return {
      days: Array.from(
        { length },
        (_, i) => `${month.slice(0, 8)}${String(i + 1).padStart(2, '0')}`,
      ),
      counts: setsPerDay(ix, month, last),
      leading: mondayIndex(month),
    };
  }, [ix, month]);

  /* There is no point paging into months that cannot have anything in them, in
     either direction: forward is the future, and back is before the account
     existed. A disabled arrow says that; an empty grid makes you find out. */
  const earliest = ix.logs[0]?.date;
  const canGoBack = !earliest || month > monthOf(earliest);
  const canGoForward = month < monthOf(today);

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
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(`${A_MONDAY}T12:00:00Z`);
        d.setUTCDate(d.getUTCDate() + i);
        return d.toLocaleDateString(tr.lang, { weekday: 'narrow' });
      }),
    [tr.lang],
  );

  const monthLabel = new Date(`${month}T12:00:00`).toLocaleDateString(tr.lang, {
    month: 'long',
    year: 'numeric',
  });

  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <Arrow
            dir="prev"
            label={tr.t('cal.prevMonth')}
            disabled={!canGoBack}
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
          />
          {/* Polite rather than assertive: paging through months should not
              interrupt whatever a screen reader is already saying. */}
          <span aria-live="polite" className="text-sm font-semibold">
            {monthLabel}
          </span>
          <Arrow
            dir="next"
            label={tr.t('cal.nextMonth')}
            disabled={!canGoForward}
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
          />
        </div>

        <div
          aria-hidden
          className="grid grid-cols-7 gap-1 text-center text-[10px] text-[var(--color-muted)]"
        >
          {weekdays.map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>

        <div role="list" className="grid grid-cols-7 gap-1">
          {/* The days of the month before this one. Present so the columns line
              up, and empty so there is nothing to read in them. */}
          {Array.from({ length: leading }, (_, i) => (
            <span key={`pad-${i}`} aria-hidden />
          ))}

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
                    ? tr.count('cal.dayTrained', sets, { day: dayName(date, tr.lang) })
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
                {Number(date.slice(-2))}
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
              value={score?.index != null ? fmtIndex(score.index) : '—'}
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

const Arrow = ({
  dir,
  label,
  disabled,
  onClick,
}: {
  dir: 'prev' | 'next';
  label: string;
  disabled: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    aria-label={label}
    disabled={disabled}
    onClick={onClick}
    className={cn(
      'grid h-9 w-9 shrink-0 place-items-center rounded-[10px]',
      'text-[var(--color-muted)] transition-transform duration-150',
      'not-disabled:cursor-pointer not-disabled:hover:bg-[var(--color-surface-2)]',
      'not-disabled:active:scale-90 disabled:opacity-25',
    )}
  >
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d={dir === 'prev' ? 'M14.5 5 7.5 12l7 7' : 'M9.5 5l7 7-7 7'} />
    </svg>
  </button>
);

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
    <span className="truncate text-[11px] text-[var(--color-muted)]">{label}</span>
    <span className="num text-lg font-bold">{value}</span>
  </div>
);
