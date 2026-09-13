'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Sheet, Summary, cn } from '@/components/ui';
import { Page } from '@/components/page';
import { useProfile, useSnapshot, useT } from '@/lib/client/hooks';
import { setEntryExercise } from '@/lib/client/mutations';
import { DEFAULT_PREFS, swapOptions, type Exercise } from '@athletic/domain';
import { blockWeeks, mondayOf, programRows, weekCoverage } from '@athletic/domain';
import { fmtDay } from '@/lib/client/format';
import { ExerciseSheet } from '@/components/exercise-sheet';

export default function WeekPage() {
  const { ix } = useSnapshot();
  const profile = useProfile();
  const tr = useT();
  const router = useRouter();
  const days = profile?.days ?? DEFAULT_PREFS.days;
  const where = profile?.where ?? DEFAULT_PREFS.where;
  const blockLen = profile?.blockWeeks ?? DEFAULT_PREFS.blockWeeks;

  const weeks = useMemo(
    () => blockWeeks(profile?.blockStart ?? mondayOf(new Date()), blockLen),
    [profile?.blockStart, blockLen],
  );
  const thisWeek = mondayOf(new Date());
  const [week, setWeek] = useState(() => (weeks.includes(thisWeek) ? thisWeek : weeks[0]!));
  const idx = Math.max(0, weeks.indexOf(week));

  const cov = useMemo(() => weekCoverage(ix, week), [ix, week]);
  const rows = useMemo(() => programRows(ix, days), [ix, days]);
  const [swap, setSwap] = useState<{ session: number; slotId: string; name: string } | null>(null);
  // Planning the week is exactly when you need to know what a movement is —
  // more so than mid-session, when you are already doing it.
  const [detail, setDetail] = useState<Exercise | null>(null);

  const missing = cov.cells
    .filter((c) => c.sets === 0)
    .map((c) => tr.pattern(c.pattern).toLowerCase());
  const summary =
    cov.sessions === 0
      ? { tone: 'idle' as const, text: tr.t('week.noneYet') }
      : cov.complete
        ? {
            tone: 'good' as const,
            text: tr.t('week.complete', { n: cov.total, s: tr.plural(cov.sessions, 'session') }),
          }
        : missing.length === 1
          ? { tone: 'near' as const, text: tr.t('week.oneGap', { name: missing[0]! }) }
          : {
              tone: 'gap' as const,
              text: tr.t('week.gaps', { n: missing.length, list: missing.join(', ') }),
            };

  return (
    <Page>
      <Card className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Button
            className="min-h-9 px-3"
            disabled={idx <= 0}
            aria-label={tr.t('common.back')}
            onClick={() => setWeek(weeks[idx - 1]!)}
          >
            ‹
          </Button>
          <div className="flex-1 text-center">
            <div className="font-semibold">
              {week === thisWeek ? tr.t('common.thisWeek') : tr.t('common.week', { n: idx + 1 })}
            </div>
            <div className="num text-xs text-[var(--color-muted)]">{fmtDay(week)}</div>
          </div>
          <Button
            className="min-h-9 px-3"
            disabled={idx >= weeks.length - 1}
            aria-label={tr.t('common.week', { n: idx + 2 })}
            onClick={() => setWeek(weeks[idx + 1]!)}
          >
            ›
          </Button>
        </div>

        <Summary tone={summary.tone}>{summary.text}</Summary>

        {/* Grouped as a list: unlabelled, these read to a screen reader as seven
            loose "✓ Squat" fragments with nothing tying them together. */}
        <div
          role="list"
          aria-label={tr.t('week.coverage')}
          className="grid grid-cols-[repeat(auto-fit,minmax(86px,1fr))] gap-1.5"
        >
          {cov.cells.map((c) => (
            <div
              key={c.pattern.id}
              role="listitem"
              className={cn(
                'rounded-xl px-2 py-2.5 text-center',
                c.sets > 0
                  ? 'bg-[var(--color-good-bg)] text-[var(--color-accent)]'
                  : 'bg-[var(--color-bad-bg)] text-[var(--color-bad)]',
              )}
            >
              <div className="text-lg font-bold">{c.sets > 0 ? '✓' : '–'}</div>
              <div className="truncate text-[11px] font-semibold">{tr.pattern(c.pattern)}</div>
            </div>
          ))}
        </div>

        <p className="text-xs text-[var(--color-muted)]">
          {cov.split === 'sevenPattern' || cov.split === null
            ? tr.t('week.explain')
            : tr.t('week.explainSplit', { split: tr.split(cov.split) })}
        </p>

        {/* Only worth saying when it differs from what you train now: a past
            week keeps the goal it was trained under, and without this the
            tile count silently changing as you page back looks like a bug. */}
        {cov.split && cov.split !== (profile?.split ?? cov.split) && (
          <p className="text-xs text-[var(--color-muted)]">
            <span className="font-semibold">
              {tr.t('week.scoredAs', { split: tr.split(cov.split) })}
            </span>{' '}
            {tr.t('week.scoredAsWhy')}
          </p>
        )}
      </Card>

      <Card>
        <h2 className="text-[17px] font-semibold">{tr.t('week.yourWeek')}</h2>
        {Array.from({ length: days }, (_, d) => (
          <div key={d} className="mt-3 border-t border-[var(--color-line)] pt-3 first:border-t-0">
            <div className="flex items-center justify-between">
              <h3 className="flex items-baseline gap-2 text-sm font-semibold">
                {tr.t('common.day', { n: d + 1 })}
                {/* What kind of day this is — "Push", "Legs". Without it a split
                    the user deliberately chose is invisible once they leave
                    onboarding. Full-body days say so too, rather than going
                    unlabelled and reading as an omission. */}
                <span className="text-xs font-normal text-[var(--color-muted)]">
                  {tr.day(rows.find((r) => r.session === d)?.slot.dayKey ?? null)}
                </span>
              </h3>
              <Button
                variant="ghost"
                className="min-h-8 px-2 text-xs text-[var(--color-muted)]"
                onClick={() => router.push('/train')}
              >
                {tr.t('week.trainThis')}
              </Button>
            </div>
            <div className="mt-1.5 flex flex-col gap-1">
              {rows
                .filter((r) => r.session === d && r.exercise)
                .map((r) => (
                  <div key={r.key} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
                    <button
                      type="button"
                      onClick={() => setDetail(r.exercise)}
                      aria-label={tr.t('ex.about', { name: r.exercise!.name })}
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left"
                    >
                      <span className="truncate text-sm">{r.exercise!.name}</span>
                      <span
                        aria-hidden
                        className="grid h-4 w-4 shrink-0 place-items-center rounded-full border border-[var(--color-line)] text-[10px] font-bold text-[var(--color-muted)]"
                      >
                        i
                      </span>
                    </button>
                    <Button
                      variant="ghost"
                      className="min-h-8 px-2 text-xs text-[var(--color-muted)]"
                      onClick={() =>
                        setSwap({ session: d, slotId: r.slot.id, name: r.exercise!.name })
                      }
                    >
                      {tr.t('week.swap')}
                    </Button>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </Card>

      {detail && <ExerciseSheet exercise={detail} onClose={() => setDetail(null)} />}

      {swap && (
        <Sheet
          title={tr.t('week.swapTitle', { name: swap.name })}
          open
          onClose={() => setSwap(null)}
        >
          <p className="text-sm text-[var(--color-muted)]">{tr.t('week.swapBody')}</p>
          {swapOptions(ix, days, swap.session, swap.slotId, where).map((e) => (
            <Button
              key={e.id}
              className="w-full justify-start"
              onClick={async () => {
                await setEntryExercise(swap.session, swap.slotId, e.id);
                setSwap(null);
              }}
            >
              {e.name}
            </Button>
          ))}
        </Sheet>
      )}
    </Page>
  );
}
