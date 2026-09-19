'use client';

/**
 * Progress.
 *
 * The version this replaces was a column of fifteen cards, one per exercise,
 * each with the same chart in it. That is a page which has offloaded all of the
 * reading onto the reader: the lift that had gone backwards looked exactly like
 * the fourteen that had not, and finding it meant scrolling through all of
 * them. Nobody does that twice.
 *
 * So the shape here is triage first, evidence on request:
 *
 *  1. **Worth knowing** — at most three lifts, in words. Present only when
 *     there is something to say: something you planned and have not done, or a
 *     lift you have asked to be pushed on that has stopped moving. On an
 *     account with no goals the card is usually absent entirely, which is the
 *     point of it — see below.
 *  2. **What you are pushing** — the live goals, only when there are any.
 *  3. **The two strength numbers** — gymmy's own index across the five loaded
 *     patterns, plus a real DOTS from the three competition lifts. The only
 *     full chart on the page at rest.
 *  4. **What you have trained** — twelve weeks by seven movements, which is the
 *     app's actual thesis on a time axis.
 *  5. **Every lift** — one compact row each, grouped by movement, with a
 *     sparkline. The full chart, and the way to set a goal, are one tap away.
 *
 * The card at the top used to be headed "Needs a look" and, on a quiet week,
 * said "nothing needs a look — everything you train is moving". Both were the
 * app grading somebody's training against an assumption it had made up. The
 * shipped version only evaluates a lift the user has volunteered, via a goal,
 * and the empty state is the card not being there at all.
 */

import { useMemo, useState } from 'react';
import { Button, Card, Chip, InfoButton, Sheet, Summary, cn } from '@/components/ui';
import { Page } from '@/components/page';
import { LineChart, Sparkline, type ChartPoint } from '@/components/chart';
import { Delta } from '@/components/delta';
import { GoalCard, GoalForm, useGoalCards } from '@/components/goal';
import { useProfile, useSnapshot, useT, useToday } from '@/lib/client/hooks';
import { fmtIndex } from '@/lib/client/format';
import { fireAndForget, logBodyWeight } from '@/lib/client/mutations';
import {
  DEFAULT_PREFS,
  addDays,
  attention,
  bodyWeightOn,
  coveragePatterns,
  mondayOf,
  patternWeeks,
  growingExercises,
  progressSummary,
  recentWeeks,
  LOAD_CONVENTION_FROM,
  conventionChanged,
  SCORED_PATTERNS,
  dotsAt,
  strengthSeries,
  type Attention,
  type ExerciseProgress,
} from '@athletic/domain';
import type { Key } from '@/lib/i18n';

/** How far back the page looks unless you ask for everything. */
const WINDOW_WEEKS = 12;
/** Rows in the presence grid. Twelve weeks fits a phone at 7px a column. */
const GRID_WEEKS = 12;

/** "12 Mar" — short enough for an axis end, unambiguous enough to place. */
const shortDay = (iso: string, lang: string): string =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(lang, { day: 'numeric', month: 'short' });

const toPoints = (p: ExerciseProgress, lang: string): ChartPoint[] =>
  p.sessions.map((s) => ({
    date: s.date,
    value: s.value,
    label: shortDay(s.date, lang),
    peak: s.peak,
  }));

export default function ProgressPage() {
  const { ix } = useSnapshot();
  const profile = useProfile();
  const tr = useT();
  const today = useToday();

  const [weight, setWeight] = useState('');
  const [explain, setExplain] = useState(false);
  const [dots, setDots] = useState(false);
  const [allTime, setAllTime] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);

  const days = profile?.days ?? DEFAULT_PREFS.days;
  const unit = profile?.unit ?? DEFAULT_PREFS.unit;
  const sex = profile?.sex ?? DEFAULT_PREFS.sex;
  const birthYear = profile?.birthYear ?? null;

  /**
   * The window everything on this page covers.
   *
   * Twelve weeks by default rather than the whole history: a year of sessions
   * squeezed into 340 pixels is a hairball, and "how am I doing" is a question
   * about the recent past. All time is one tap away for when it is not.
   *
   * It used to be the *block* — `blockStart` plus `blockWeeks` — which quietly
   * hid everything. A block is the account's first eight weeks and never moves
   * on, so from week nine it showed nothing recent at all, and anyone whose
   * block began after their training did saw charts with fewer than two points
   * in range and a strength score that never moved.
   */
  const { from, recentFrom } = useMemo(() => {
    const earliest = ix.logs[0]?.date;
    const recent = addDays(mondayOf(today), -7 * (WINDOW_WEEKS - 1));
    // Never earlier than the training itself, so a young account is not
    // compared against weeks it did not exist for.
    const recentFrom = earliest && earliest > recent ? mondayOf(earliest) : recent;
    return { from: allTime && earliest ? mondayOf(earliest) : recentFrom, recentFrom };
  }, [ix.logs, today, allTime]);

  const summary = useMemo(
    () => progressSummary(ix, { from, to: today, sessions: days }),
    [ix, from, today, days],
  );

  /**
   * The triage is always about the last twelve weeks, whatever the charts are
   * showing.
   *
   * Asking to *see* more history is not the same as asking to be judged
   * against more of it: with the verdicts derived from the display window, a
   * tap on "All time" quietly rewrote them — a lift you had already brought
   * back would start reading as regressed again the moment a two-year-old
   * personal best came into range.
   */
  /* The lifts the user has asked to be held to. Empty for almost everybody,
     and empty means the page offers no opinion on whether anything is
     growing — it draws the lines and leaves the reading to them. */
  const growing = useMemo(() => growingExercises(ix, today), [ix, today]);

  const triage = useMemo(
    () =>
      attention(
        from === recentFrom
          ? summary
          : progressSummary(ix, { from: recentFrom, to: today, sessions: days }),
        today,
        { limit: 3, growing },
      ),
    [ix, summary, from, recentFrom, today, days, growing],
  );

  const weeksBack = useMemo(
    () => Math.max(1, Math.round((Date.parse(today) - Date.parse(from)) / (7 * 86_400_000)) + 1),
    [from, today],
  );
  const strength = useMemo(
    () => strengthSeries(ix, from, weeksBack, { unit, sex, birthYear }),
    [ix, from, weeksBack, unit, sex, birthYear],
  );

  const grid = useMemo(
    () =>
      patternWeeks(ix, recentWeeks(today, GRID_WEEKS), (weekOf) =>
        coveragePatterns(ix, weekOf).flatMap((p) => (p.key ? [p.key] : [])),
      ),
    [ix, today],
  );

  /** Grouped by movement, in the app's own pattern order, so the list reads as
   *  the week does rather than as an alphabet. */
  const groups = useMemo(() => {
    const out: { key: string; name: string; items: ExerciseProgress[] }[] = [];
    for (const pattern of ix.patterns) {
      const items = summary.filter((p) => p.pattern?.id === pattern.id);
      if (items.length) out.push({ key: pattern.id, name: tr.pattern(pattern), items });
    }
    const rest = summary.filter((p) => !p.pattern);
    if (rest.length) out.push({ key: 'other', name: tr.t('prog.other'), items: rest });
    return out;
  }, [summary, ix.patterns, tr]);

  const scored = strength.filter((s) => s.index !== null);
  const current = scored.at(-1) ?? null;
  // Eight weeks back is the same window the index itself looks over, so the
  // comparison is against a genuinely different stretch of training.
  const earlier = scored.at(-9) ?? scored[0] ?? null;
  const delta = current && earlier && earlier !== current ? current.index! - earlier.index! : null;
  /* The second number, and the only one that means anything to anybody else.
     Almost always null on a real account — it needs all three competition
     lifts — so it is a row inside the card rather than a card of its own, and
     it says which lift is still missing instead of just going quiet. */
  const indexCrossesCutover = useMemo(
    () =>
      summary.some(
        (p) =>
          p.pattern?.key &&
          SCORED_PATTERNS.includes(p.pattern.key) &&
          conventionChanged(p.exercise.name, p.sessions),
      ),
    [summary],
  );
  const dotsNow = useMemo(
    () => dotsAt(ix, mondayOf(today), { unit, sex, birthYear }),
    [ix, today, unit, sex, birthYear],
  );
  const bodyWeight = bodyWeightOn(ix, today);
  const goals = useGoalCards();
  const open = summary.find((p) => p.exercise.id === detail) ?? null;

  if (!summary.length) {
    return (
      <Page>
        <Card>
          <p className="text-[var(--color-muted)]">{tr.t('prog.empty')}</p>
        </Card>
      </Page>
    );
  }

  return (
    <Page>
      {/* 1 — what the app has actually been asked to watch.
          Absent when there is nothing to report AND nothing has been
          volunteered: an empty card headed with a judgement is still a
          judgement, and on most accounts this is every week. Once a goal
          exists, the empty state earns its place — the app was asked to
          watch, so "nothing to flag" is it answering. */}
      {(triage.length > 0 || growing.size > 0) && (
        <Card className="flex flex-col gap-2.5">
          <h2 className="text-[17px] font-semibold">{tr.t('prog.needsLook')}</h2>
          {triage.length === 0 ? (
            <Summary tone="idle">{tr.t('prog.allClear')}</Summary>
          ) : (
            <div role="list" className="flex flex-col gap-1">
              {triage.map((a) => (
                <TriageRow key={a.progress.exercise.id} item={a} onOpen={setDetail} />
              ))}
            </div>
          )}
        </Card>
      )}

      {/* 2 — the consent record. Nothing here means the app is not evaluating
          anything, and that is the state it ships in. */}
      {goals.length > 0 && <GoalCard items={goals} unit={unit} onOpen={setDetail} />}

      {/* 3 — the one card that is entirely the second voice: it measures you
          rather than recording what you did. */}
      <Card className="flex flex-col gap-3 border-[var(--color-accent-2)]/35 bg-[var(--color-accent-2-bg)]">
        <div className="flex items-center gap-1">
          <h2 className="flex-1 text-[17px] font-semibold">{tr.t('prog.strength')}</h2>
          <InfoButton label={tr.t('prog.strengthWhat')} onClick={() => setExplain(true)} />
        </div>

        {current ? (
          <div className="flex items-baseline gap-3">
            {/* The one hero number on the page. Proportional figures: tabular
                digits make a three-digit number look loose at this size. */}
            {/* One decimal, always — including a trailing zero; `fmtIndex`
                says why, and the calendar's day sheet uses the same one. */}
            <span className="text-[44px] leading-none font-bold text-[var(--color-accent-2)]">
              {fmtIndex(current.index!)}
            </span>
            {delta !== null && (
              <Delta
                value={Math.round(delta * 10) / 10}
                label={deltaLabel(tr, Math.round(delta * 10) / 10, tr.t('prog.agoWeeks', { n: 8 }))}
                className="text-base"
              />
            )}
          </div>
        ) : (
          <Summary tone="idle">
            {bodyWeight ? tr.t('prog.needLifts') : tr.t('prog.needWeight')}
          </Summary>
        )}

        {/* The index sums the best of each pattern, so a pair of dumbbells that
            doubled at the cutover lifts the whole number that week — a review
            measured +27% for a home user with nothing changed in their
            training. Same note as the lift's own chart, whenever a lift feeding
            the index shows the step. */}
        {indexCrossesCutover && (
          <p className="text-[11px] text-[var(--color-muted)]">
            {tr.t('prog.conventionChanged', { date: shortDay(LOAD_CONVENTION_FROM, tr.lang) })}
          </p>
        )}
        {scored.length > 1 && (
          <LineChart
            points={scored.map((s) => ({
              date: s.weekOf,
              value: s.index!,
              label: shortDay(s.weekOf, tr.lang),
            }))}
            unit=""
            tone="secondary"
            label={tr.t('prog.scoreOverTime')}
            // The same shape as the hero number above it, trailing zero and all.
            decimals={1}
            tableLabel={tr.t('prog.table')}
            labelHeader={tr.t('prog.week')}
            valueHeader={tr.t('prog.score')}
          />
        )}

        {/* The second number.

            Inside this card rather than beside it, because the two are the same
            kind of thing measured two ways and separating them into cards would
            invite reading one as more real than the other. Smaller than the
            hero because it is the narrower claim: three lifts, not five.

            It also never silently disappears. A DOTS needs all three
            competition lifts and most people will not have them, so the empty
            state names the ones still missing — a blank space teaches nobody
            what would fill it. */}
        <div className="flex items-center gap-2 border-t border-[var(--color-line)] pt-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-bold tracking-wider text-[var(--color-muted)] uppercase">
                {tr.t('prog.dots')}
              </span>
              <span className="num text-[22px] leading-none font-bold">{dotsNow.score ?? '—'}</span>
            </div>
            {/* Null for four different reasons, and each wants its own sentence —
                the domain says which, so the screen never has to guess from
                what happens to be empty. Two of them were found the hard way:
                with no bodyweight the old "still missing" line listed nothing
                and trailed off into a full stop, and a bench trained only above
                the rep ceiling was reported as "still missing" to somebody who
                had benched that week. */}
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              {dotsNow.missing === 'lifts'
                ? tr.t('prog.dotsNeed', {
                    what: dotsNow.lifts
                      .filter((l) => !l.trained)
                      .map((l) => tr.exercise({ name: l.name }))
                      .join(', '),
                  })
                : dotsNow.missing === 'estimate'
                  ? tr.t('prog.dotsEstimate', {
                      what: dotsNow.lifts
                        .filter((l) => l.trained && l.best === 0)
                        .map((l) => tr.exercise({ name: l.name }))
                        .join(', '),
                    })
                  : dotsNow.missing === 'bodyweight'
                    ? tr.t('prog.needWeight')
                    : dotsNow.missing === 'sex'
                      ? tr.t('prog.dotsNeedsSex')
                      : tr.t('prog.dotsFrom', {
                          total: `${Math.round(dotsNow.total ?? 0)} ${unit}`,
                        })}
            </p>
          </div>
          <InfoButton label={tr.t('prog.dotsWhat')} onClick={() => setDots(true)} />
        </div>

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

      {/* 4 — the app's thesis on a time axis. */}
      <Card className="flex flex-col gap-2">
        <h2 className="text-[17px] font-semibold">{tr.t('prog.patterns')}</h2>
        <PatternGrid grid={grid} thisWeek={mondayOf(today)} />
        <p className="text-[11px] text-[var(--color-muted)]">{tr.t('prog.patternsBody')}</p>
      </Card>

      {/* 5 — everything, compactly. */}
      <Card className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[17px] font-semibold">{tr.t('prog.allLifts')}</h2>
          <Button
            variant="ghost"
            className="min-h-8 px-2 text-xs text-[var(--color-muted)]"
            aria-pressed={allTime}
            onClick={() => setAllTime((v) => !v)}
          >
            {allTime ? tr.t('prog.windowAll') : tr.t('prog.window', { n: WINDOW_WEEKS })}
          </Button>
        </div>

        {groups.map((group) => (
          <section key={group.key} className="flex flex-col gap-1">
            <h3 className="text-xs font-semibold tracking-wide text-[var(--color-muted)] uppercase">
              {group.name}
            </h3>
            {group.items.map((p) => (
              <LiftRow key={p.exercise.id} progress={p} unit={unit} onOpen={setDetail} />
            ))}
          </section>
        ))}
      </Card>

      {open && <DetailSheet progress={open} unit={unit} onClose={() => setDetail(null)} />}

      <Sheet title={tr.t('prog.strengthWhat')} open={explain} onClose={() => setExplain(false)}>
        <p className="text-sm leading-relaxed">{tr.t('prog.strengthBody')}</p>
        <p className="text-sm leading-relaxed text-[var(--color-muted)]">
          {tr.t('prog.strengthNot')}
        </p>
        {current && (
          <div className="flex flex-col gap-1">
            {current.parts.map((part) => (
              <div key={part.key} className="flex items-baseline justify-between gap-3 text-sm">
                <span>{tr.t(`pattern.${part.key}` as Key)}</span>
                <span className={cn('num', part.best === 0 && 'text-[var(--color-bad)]')}>
                  {part.best ? `${Math.round(part.best)} ${unit}` : '—'}
                </span>
              </div>
            ))}
          </div>
        )}
      </Sheet>

      {/* The DOTS explainer. Its "what this is not" paragraph is doing more
          work than the index's: this is the number somebody might quote, and it
          is estimated from training rather than totalled on a platform, so the
          gap between it and a real meet total has to be stated where they read
          the figure and not only in the code. */}
      <Sheet title={tr.t('prog.dotsWhat')} open={dots} onClose={() => setDots(false)}>
        <p className="text-sm leading-relaxed">{tr.t('prog.dotsBody')}</p>
        <p className="text-sm leading-relaxed text-[var(--color-muted)]">{tr.t('prog.dotsNot')}</p>
        <div className="flex flex-col gap-1">
          {dotsNow.lifts.map((l) => (
            <div key={l.name} className="flex items-baseline justify-between gap-3 text-sm">
              <span>{tr.exercise({ name: l.name })}</span>
              <span className={cn('num', l.best === 0 && 'text-[var(--color-bad)]')}>
                {l.best ? `${Math.round(l.best)} ${unit}` : '—'}
              </span>
            </div>
          ))}
        </div>
      </Sheet>
    </Page>
  );
}

/* ------------------------------------------------------------------ parts */

/**
 * What a verdict says, in words.
 *
 * Dated rather than counted in weeks. "Three weeks ago" has to round, and a
 * rounded zero reads as "your best, set 0 weeks ago" — while the date it is
 * rounding is both shorter and exact.
 */
function verdictOf(item: Attention, tr: ReturnType<typeof useT>): string {
  const { progress } = item;
  const when = (iso: string | null | undefined) => (iso ? shortDay(iso, tr.lang) : '');
  switch (item.kind) {
    case 'regressed':
      return tr.t('prog.vRegressed', {
        pct: Math.abs(progress.drawdown?.pct ?? 0),
        date: when(progress.drawdown?.bestDate),
      });
    case 'stalled':
      return tr.t('prog.vStalled', {
        date: when(progress.drawdown?.bestDate),
        s: tr.plural(progress.sessionsSinceBest, 'session'),
      });
    case 'dormant':
      return tr.t('prog.vDormant', { date: when(progress.lastDate) });
  }
}

function TriageRow({ item, onOpen }: { item: Attention; onOpen: (id: string) => void }) {
  const tr = useT();
  const { progress } = item;
  return (
    <button
      type="button"
      role="listitem"
      onClick={() => onOpen(progress.exercise.id)}
      aria-label={tr.t('prog.open', { name: tr.exercise(progress.exercise) })}
      className="flex cursor-pointer items-center gap-3 rounded-[11px] border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 py-2.5 text-left"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold">{tr.exercise(progress.exercise)}</span>
          <Chip tone={item.kind === 'regressed' ? 'bad' : 'info'}>
            {tr.t(`prog.k${item.kind}` as Key)}
          </Chip>
        </div>
        <p className="mt-0.5 text-xs text-[var(--color-muted)]">{verdictOf(item, tr)}</p>
      </div>
      <Sparkline points={toPoints(progress, tr.lang)} />
    </button>
  );
}

/** Up, down or level — and by how much — for whatever the caller measured. */
function deltaLabel(
  tr: ReturnType<typeof useT>,
  value: number,
  ago: string,
  unit?: string,
): string {
  const by = `${Math.abs(value)}${unit ? ` ${unit}` : ''}`;
  if (value > 0) return tr.t('prog.deltaUp', { by, ago });
  if (value < 0) return tr.t('prog.deltaDown', { by, ago });
  return tr.t('prog.deltaFlat', { by, ago });
}

function LiftRow({
  progress,
  unit,
  onOpen,
}: {
  progress: ExerciseProgress;
  unit: string;
  onOpen: (id: string) => void;
}) {
  const tr = useT();
  const latest = progress.sessions.at(-1);
  const first = progress.sessions[0];
  /* Across what is actually on screen, which is what the sparkline beside it
     draws. Measuring from an all-time first session while showing twelve weeks
     would put a number next to a line that disagrees with it. One session is
     not a change, so it has no arrow rather than a zero. */
  const moved =
    latest && first && first !== latest ? Math.round((latest.value - first.value) * 10) / 10 : null;
  return (
    <button
      type="button"
      onClick={() => onOpen(progress.exercise.id)}
      aria-label={tr.t('prog.open', { name: tr.exercise(progress.exercise) })}
      className="flex min-h-[var(--spacing-tap)] cursor-pointer items-center gap-2.5 rounded-[11px] px-1 text-left"
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">{tr.exercise(progress.exercise)}</div>
        <div className="num text-[11px] text-[var(--color-muted)]">
          {latest
            ? `${Math.round(latest.value * 10) / 10} ${unit} · ${tr.plural(progress.totalSets, 'set')}`
            : tr.plural(progress.totalSets, 'set')}
        </div>
      </div>
      {moved !== null && (
        <Delta
          value={moved}
          label={deltaLabel(tr, moved, tr.t('prog.agoFirst'), unit)}
          className="text-xs"
        />
      )}
      {/* Carries and rotation have no line to draw — see `metricFor`. The row
          still exists, because the sets were still done. */}
      <Sparkline points={toPoints(progress, tr.lang)} />
    </button>
  );
}

function PatternGrid({
  grid,
  thisWeek,
}: {
  grid: {
    pattern: import('@athletic/domain').Pattern;
    weeks: import('@athletic/domain').PatternWeek[];
  }[];
  /** The week in progress, which is not a week you have missed. */
  thisWeek: string;
}) {
  const tr = useT();
  return (
    // A real table: twelve unlabelled squares a row is exactly the content a
    // screen reader needs row and column headers for.
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <caption className="sr-only">{tr.t('prog.patterns')}</caption>
        <tbody>
          {grid.map(({ pattern, weeks }) => (
            <tr key={pattern.id}>
              <th
                scope="row"
                className="w-0 py-[3px] pr-2 text-left text-[11px] font-medium whitespace-nowrap text-[var(--color-muted)]"
              >
                {tr.pattern(pattern)}
              </th>
              {weeks.map((w) => {
                /* The week you are in has not finished, and scoring it as a
                   miss means every Monday morning opens on a full red column
                   for work that is not late yet. */
                const pending = w.sets === 0 && w.weekOf === thisWeek;
                return (
                  <td key={w.weekOf} className="p-[1.5px]">
                    <div
                      title={`${w.weekOf} · ${w.sets}`}
                      aria-label={tr.t(
                        pending
                          ? 'prog.cellThisWeek'
                          : w.wanted
                            ? 'prog.cellSets'
                            : 'prog.cellNotAsked',
                        { n: w.sets },
                      )}
                      className={cn(
                        'h-4 w-full min-w-3 rounded-[3px]',
                        pending && 'border border-[var(--color-line)]',
                        !pending && w.sets === 0 && w.wanted && 'bg-[var(--color-bad-bg)]',
                        // Not asked for that week is marked, not blamed — the
                        // same historisation rule the coverage view obeys.
                        !pending &&
                          w.sets === 0 &&
                          !w.wanted &&
                          'border border-dashed border-[var(--color-line)]',
                        w.sets > 0 && 'bg-[var(--color-accent)]',
                      )}
                      style={
                        w.sets > 0 ? { opacity: Math.min(1, 0.35 + w.sets * 0.12) } : undefined
                      }
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DetailSheet({
  progress,
  unit,
  onClose,
}: {
  progress: ExerciseProgress;
  unit: string;
  onClose: () => void;
}) {
  const tr = useT();
  const points = toPoints(progress, tr.lang);
  const d = progress.drawdown;

  return (
    <Sheet title={tr.exercise(progress.exercise)} open onClose={onClose}>
      {progress.metric === null ? (
        <p className="text-sm text-[var(--color-muted)]">{tr.t('prog.noMetric')}</p>
      ) : points.length < 2 ? (
        <p className="text-sm text-[var(--color-muted)]">{tr.t('prog.oneSession')}</p>
      ) : (
        <>
          <LineChart
            points={points}
            unit={unit}
            tone="secondary"
            label={tr.t(progress.metric === 'e1rm' ? 'prog.overTime' : 'prog.overTimeWeight')}
            tableLabel={tr.t('prog.table')}
            labelHeader={tr.t('prog.session')}
            valueHeader={tr.t('prog.value')}
          />
          {points.some((p) => p.peak) && (
            <p className="text-[11px] text-[var(--color-muted)]">{tr.t('prog.prs')}</p>
          )}
          <p className="text-[11px] text-[var(--color-muted)]">{tr.t('prog.gapNote')}</p>
          {/* The one place the dumbbell cutover is visible to anybody. Logged per
              hand before it and combined after, a pair shows a jump on that day
              that is bookkeeping rather than training — so the chart says so,
              under the chart, and only when the step is actually on it. */}
          {conventionChanged(progress.exercise.name, points) && (
            <p className="text-[11px] text-[var(--color-muted)]">
              {tr.t('prog.conventionChanged', {
                date: shortDay(LOAD_CONVENTION_FROM, tr.lang),
              })}
            </p>
          )}
        </>
      )}

      <dl className="flex flex-col gap-1 border-t border-[var(--color-line)] pt-3 text-sm">
        {progress.topSet && (
          <Row
            k={tr.t('prog.bestSetLabel')}
            v={tr.t('prog.bestSetValue', {
              w: progress.topSet.weight ?? 0,
              unit,
              r: progress.topSet.reps ?? 0,
            })}
          />
        )}
        <Row k={tr.t('prog.setsLogged')} v={String(progress.totalSets)} />
        {progress.lastDate && (
          <Row k={tr.t('prog.lastTrained')} v={shortDay(progress.lastDate, tr.lang)} />
        )}
        {d && (
          <Row
            k={tr.t('prog.best')}
            v={`${Math.round(d.best * 10) / 10} ${unit} · ${shortDay(d.bestDate, tr.lang)}`}
          />
        )}
        {/* Withheld rather than hedged when the two ends of the comparison
            disagree about whether effort was recorded — an unrated set scores
            about 5% lower for reasons that are not about strength. */}
        {d && !d.confident && (
          <p className="mt-1 text-[11px] text-[var(--color-muted)]">{tr.t('prog.unrated')}</p>
        )}
      </dl>

      {/* The only place a goal can be set, because it is the only place the
          baseline is already on screen. A lift with no metric has no number to
          set one against — carries are metres. */}
      {progress.metric !== null && (
        <GoalForm exercise={progress.exercise} unit={unit} onSaved={onClose} />
      )}
    </Sheet>
  );
}

const Row = ({ k, v }: { k: string; v: string }) => (
  <div className="flex items-baseline justify-between gap-3">
    <dt className="text-[var(--color-muted)]">{k}</dt>
    <dd className="num font-semibold">{v}</dd>
  </div>
);
