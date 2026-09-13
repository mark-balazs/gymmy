'use client';

/**
 * The first screen, and the only one that answers "what now?".
 *
 * Landing straight on Train assumed you had already decided to train. This asks
 * nothing and reports three things you would otherwise have to go and find:
 * what today's session is, whether the week is on track, and which lifts have
 * earned more weight.
 *
 * The last of those is not a new calculation. Double progression already
 * decides it per exercise the moment you open one; surfacing it here only means
 * you no longer have to scroll the whole session to discover it.
 */

import Link from 'next/link';
import { useMemo } from 'react';
import { Card, Chip, Summary, buttonClass, cn } from '@/components/ui';
import { Page } from '@/components/page';
import { useProfile, useSnapshot, useT, useToday } from '@/lib/client/hooks';
import { fmtDay } from '@/lib/client/format';
import {
  mondayOf,
  nextSession,
  readyToProgress,
  sessionPlan,
  slotsForSession,
  weekCoverage,
  DEFAULT_PREFS,
  sessionLabel,
} from '@athletic/domain';

export default function HomePage() {
  const { ix } = useSnapshot();
  const profile = useProfile();
  const tr = useT();
  const today = useToday();
  const days = profile?.days ?? DEFAULT_PREFS.days;
  const unit = profile?.unit ?? DEFAULT_PREFS.unit;

  const session = useMemo(() => nextSession(ix, today, days), [ix, today, days]);
  const plan = useMemo(() => sessionPlan(ix, days, today, session), [ix, days, today, session]);
  const cov = useMemo(() => weekCoverage(ix, mondayOf(today)), [ix, today]);
  const progress = useMemo(() => readyToProgress(ix, days), [ix, days]);

  const dayKey = slotsForSession(ix, session)[0]?.dayKey ?? null;
  const done = plan.reduce((a, p) => a + p.done, 0);
  const total = plan.reduce((a, p) => a + p.target, 0);
  const started = done > 0;
  const exercises = plan.filter((p) => p.exercise);

  return (
    <Page>
      <Card className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-[17px] font-semibold">
            {started ? tr.t('home.resume') : tr.t('home.today')}
          </h2>
          <span className="num text-xs text-[var(--color-muted)]">{fmtDay(today)}</span>
        </div>

        {exercises.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">{tr.t('train.nothingPlanned')}</p>
        ) : (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-[26px] leading-none font-bold">
                {tr.t('common.day', { n: sessionLabel(session) })}
              </span>
              {dayKey && <Chip tone="info">{tr.day(dayKey)}</Chip>}
            </div>

            <div className="flex flex-col gap-1">
              {exercises.map((p) => (
                <div key={p.key} className="flex items-center gap-2 text-sm">
                  <span
                    className={cn(
                      'h-1.5 w-1.5 shrink-0 rounded-full',
                      p.done >= p.target && p.target > 0
                        ? 'bg-[var(--color-accent)]'
                        : 'bg-[var(--color-line)]',
                    )}
                  />
                  <span className="flex-1 truncate">{tr.exercise(p.exercise)}</span>
                </div>
              ))}
            </div>

            <Link href="/train" className={buttonClass('primary', 'w-full')}>
              {started ? tr.t('home.continue', { done, total }) : tr.t('home.start')}
            </Link>
          </>
        )}
      </Card>

      {progress.length > 0 && (
        <Card className="flex flex-col gap-2.5">
          <h2 className="text-[17px] font-semibold">{tr.t('home.readyTitle')}</h2>
          <p className="text-sm text-[var(--color-muted)]">{tr.t('home.readyBody')}</p>
          <div className="flex flex-col gap-1.5">
            {progress.map(({ exercise, suggestion }) => (
              <div
                key={exercise.id}
                /* Violet, like the strength score: this is a statement about
                   what you are capable of, not about work already ticked off. */
                className="flex items-center justify-between gap-2 rounded-[11px] bg-[var(--color-accent-2-bg)] px-3 py-2"
              >
                <span className="flex-1 truncate text-sm font-semibold">
                  {tr.exercise(exercise)}
                </span>
                <span className="num text-sm font-semibold text-[var(--color-accent-2)]">
                  {tr.t('home.goTo', { w: `${suggestion.weight ?? 0} ${unit}` })}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-[17px] font-semibold">{tr.t('home.thisWeek')}</h2>
          <Link href="/week" className="text-xs font-semibold text-[var(--color-accent)]">
            {tr.t('home.seeWeek')}
          </Link>
        </div>

        <Summary tone={cov.complete ? 'good' : cov.sessions === 0 ? 'idle' : 'near'}>
          {cov.sessions === 0
            ? tr.t('week.noneYet')
            : tr.t('home.covered', { hit: cov.hit, total: cov.total })}
        </Summary>

        <div className="flex gap-1.5" aria-label={tr.t('week.coverage')}>
          {cov.cells.map((c) => (
            <span
              key={c.pattern.id}
              title={tr.pattern(c.pattern)}
              className={cn(
                'h-1.5 flex-1 rounded-full',
                c.sets > 0 ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-line)]',
              )}
            />
          ))}
        </div>
      </Card>
    </Page>
  );
}
