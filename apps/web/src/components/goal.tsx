'use client';

/**
 * Goals — the only place the app is allowed to push.
 *
 * Everything else on Progress describes: here is what you lifted, here is the
 * line. A goal is the user handing over permission to be evaluated on one lift,
 * for a stated number, until a stated date. So this file has two jobs, and the
 * second one matters more than it looks:
 *
 *  1. Let somebody set one, with the guardrails in `@athletic/domain/goals`
 *     applied while they type rather than on submit — a refusal that arrives
 *     after you have committed to a number reads as the app disagreeing with
 *     you, and a limit shown as you approach it reads as the app helping.
 *  2. Make it obvious what has been consented to and trivial to withdraw.
 *     "Stop pushing this" is a primary control on the card, not something in a
 *     settings screen. A permission you cannot easily find and revoke is not
 *     really a permission.
 *
 * The tone rule for this file: the app never says a goal was failed. It says
 * what the number did.
 */

import { useMemo, useState } from 'react';
import { Button, Card, Chip, InfoButton, Sheet, Summary, cn } from '@/components/ui';
import { useSnapshot, useT, useToday } from '@/lib/client/hooks';
import { fireAndForget, retireGoal, setGoal } from '@/lib/client/mutations';
import {
  MAX_LIVE_GOALS,
  MAX_WEEKS,
  MIN_WEEKS,
  addDays,
  checkGoal,
  goalProgress,
  liveGoals,
  outcomeOf,
  recentGainOf,
  suggestBaseline,
  type Exercise,
  type Goal,
  type GoalProgress,
} from '@athletic/domain';

/** The horizons offered. Eight is the floor; a year is the ceiling. */
const WEEK_OPTIONS = [MIN_WEEKS, 12, 16, 24, MAX_WEEKS] as const;

/** How long an ended goal keeps its place on the card, waiting to be read. */
const LINGER_DAYS = 21;

const round = (n: number) => Math.round(n * 10) / 10;

/* ------------------------------------------------------------------ setting */

/**
 * The form, which lives in the per-lift detail sheet.
 *
 * Per-lift and nowhere else, deliberately: a goal needs a baseline, and the
 * only honest baseline is what this lift has actually been doing. A global
 * "add a goal" screen would have to ask which lift, then go and find the
 * number anyway, and would invite setting three at once.
 */
export function GoalForm({
  exercise,
  unit,
  onSaved,
}: {
  exercise: Exercise;
  unit: string;
  /**
   * Called once a goal has been written, so the sheet this lives in can close.
   *
   * Not optional politeness. The form hides itself the moment the goal exists,
   * and left open the sheet would sit there looking unchanged while the card
   * that acknowledges the goal is behind it, unread — the save would feel like
   * nothing happened, which is the worst possible feedback for the one action
   * in the app that grants the app permission to judge you.
   */
  onSaved?: () => void;
}) {
  const { ix } = useSnapshot();
  const tr = useT();
  const today = useToday();

  const [open, setOpen] = useState(false);
  const [why, setWhy] = useState(false);
  const [weeks, setWeeks] = useState<number>(12);
  const [typed, setTyped] = useState('');

  const live = useMemo(() => liveGoals(ix, today), [ix, today]);
  const mine = live.find((g) => g.exerciseId === exercise.id) ?? null;

  const baseline = useMemo(() => suggestBaseline(ix, exercise.id, today), [ix, exercise.id, today]);
  const ownRecentGain = useMemo(
    () => recentGainOf(ix, exercise.id, today),
    [ix, exercise.id, today],
  );

  const targetDate = addDays(today, weeks * 7);
  const check = useMemo(
    () =>
      checkGoal({
        baseline,
        target: Number(typed.replace(',', '.')) || 0,
        startedOn: today,
        targetDate,
        liveCount: live.length,
        ownRecentGain,
      }),
    [baseline, typed, today, targetDate, live, ownRecentGain],
  );

  /* Opening the form fills in a target that would pass every check, so the
     first thing on screen is a workable goal rather than an empty box the app
     then finds fault with. */
  const start = () => {
    setTyped(String(check.suggestedTarget));
    setOpen(true);
  };

  /* Already pushing this one. The controls live on the card rather than here —
     one place to withdraw a permission, not two — but the sheet still says so,
     because a lift with a goal on it that looks identical to one without is
     the app hiding the only thing on this screen the user chose. */
  if (mine) {
    const p = goalProgress(mine, ix, today);
    return (
      <p className="num border-t border-[var(--color-line)] pt-3 text-[11px] text-[var(--color-muted)]">
        {tr.t('goal.of', { current: round(p.current), target: round(mine.target), unit })} ·{' '}
        {tr.count('goal.daysLeft', Math.max(0, p.daysLeft))}
      </p>
    );
  }

  if (baseline <= 0) {
    return <p className="text-[11px] text-[var(--color-muted)]">{tr.t('goal.noHistory')}</p>;
  }

  if (!open) {
    return (
      <div className="flex flex-col gap-2 border-t border-[var(--color-line)] pt-3">
        <p className="text-[11px] leading-relaxed text-[var(--color-muted)]">
          {tr.t('goal.explain')}
        </p>
        <Button variant="ghost" className="self-start" onClick={start}>
          {tr.t('goal.set')}
        </Button>
      </div>
    );
  }

  const full = live.length >= MAX_LIVE_GOALS;

  return (
    <form
      className="flex flex-col gap-3 border-t border-[var(--color-line)] pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!check.allowed) return;
        fireAndForget(
          setGoal({
            exerciseId: exercise.id,
            target: Number(typed.replace(',', '.')),
            baseline,
            startedOn: today,
            targetDate,
          }),
        );
        setOpen(false);
        onSaved?.();
      }}
    >
      <div className="flex items-center gap-1">
        <span className="flex-1 text-sm font-semibold">{tr.t('goal.set')}</span>
        <InfoButton label={tr.t('goal.why')} onClick={() => setWhy(true)} />
      </div>

      {full ? (
        // Nothing to fill in — the limit is not about this lift.
        <Summary tone="idle">{tr.t('goal.tooMany')}</Summary>
      ) : (
        <>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-[var(--color-muted)]">
              {tr.t('goal.target', { unit })}
            </span>
            <input
              type="number"
              inputMode="decimal"
              step="0.5"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              aria-label={tr.t('goal.target', { unit })}
              aria-describedby="goal-note"
              className="num min-h-[var(--spacing-tap)] w-full rounded-[11px] border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3"
            />
            <span className="num text-[11px] text-[var(--color-muted)]">
              {tr.t('goal.nowAt', { n: round(baseline), unit })}
            </span>
          </label>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-xs font-semibold text-[var(--color-muted)]">
              {tr.t('goal.weeks')}
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {WEEK_OPTIONS.map((w) => (
                <button
                  key={w}
                  type="button"
                  aria-pressed={w === weeks}
                  onClick={() => setWeeks(w)}
                  className={cn(
                    'min-h-9 cursor-pointer rounded-full px-3 text-xs font-semibold',
                    w === weeks
                      ? 'bg-[var(--color-accent-2-bg)] text-[var(--color-accent-2)]'
                      : 'border border-[var(--color-line)] text-[var(--color-muted)]',
                  )}
                >
                  {tr.count('goal.weeksN', w)}
                </button>
              ))}
            </div>
          </fieldset>

          {/* One line, and it is either a refusal with a way out of it or a
              warning that changes nothing. Never both, never a list. */}
          <p
            id="goal-note"
            className={cn(
              'text-[11px] leading-relaxed',
              check.allowed ? 'text-[var(--color-muted)]' : 'text-[var(--color-bad)]',
            )}
          >
            {check.reason === 'tooSmall'
              ? tr.t('goal.tooSmall', { n: round(check.suggestedTarget), unit })
              : check.reason === 'tooShort'
                ? tr.count('goal.tooShort', MIN_WEEKS)
                : check.reason === 'tooLong'
                  ? tr.t('goal.tooLong')
                  : check.warning === 'ambitious'
                    ? tr.t('goal.ambitious', { pct: check.impliedWeeklyPct })
                    : tr.t('goal.explain')}
          </p>

          <div className="flex gap-2">
            <Button type="submit" disabled={!check.allowed}>
              {tr.t('goal.save')}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {tr.t('common.cancel')}
            </Button>
          </div>
        </>
      )}

      <Sheet title={tr.t('goal.why')} open={why} onClose={() => setWhy(false)}>
        <p className="text-sm leading-relaxed">{tr.t('goal.whyBody')}</p>
      </Sheet>
    </form>
  );
}

/* ------------------------------------------------------------------ reading */

/**
 * Every goal worth showing today: the live ones, and the recently ended ones
 * nobody has read yet.
 *
 * An ended goal lingers rather than vanishing on its date. The app asked for
 * two months of somebody's attention; disappearing in silence the morning it
 * expires is the one ending that says nothing at all.
 */
export function useGoalCards(): GoalProgress[] {
  const { ix } = useSnapshot();
  const today = useToday();
  return useMemo(() => {
    const cutoff = addDays(today, -LINGER_DAYS);
    return ix.goals
      .filter((g) => g.retiredAt === null && g.targetDate >= cutoff)
      .map((g) => goalProgress(g, ix, today))
      .sort((a, b) => a.goal.targetDate.localeCompare(b.goal.targetDate));
  }, [ix, today]);
}

export function GoalCard({
  items,
  unit,
  onOpen,
}: {
  items: GoalProgress[];
  unit: string;
  onOpen: (exerciseId: string) => void;
}) {
  const tr = useT();
  return (
    <Card className="flex flex-col gap-2.5">
      <h2 className="text-[17px] font-semibold">{tr.t('goal.yours')}</h2>
      {items.map((p) => (
        <GoalRow key={p.goal.id} progress={p} unit={unit} onOpen={onOpen} />
      ))}
    </Card>
  );
}

function GoalRow({
  progress,
  unit,
  onOpen,
}: {
  progress: GoalProgress;
  unit: string;
  onOpen: (exerciseId: string) => void;
}) {
  const { ix } = useSnapshot();
  const tr = useT();
  const { goal, current, share, daysLeft, achieved, moved } = progress;
  // By id from everything that resolves: a goal on a movement since retired
  // from the library still has to say what it was on.
  const exercise = ix.exerciseById.get(goal.exerciseId) ?? null;
  const ended = daysLeft < 0;

  return (
    <div className="flex flex-col gap-2 rounded-[11px] border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 py-2.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onOpen(goal.exerciseId)}
          className="min-w-0 flex-1 cursor-pointer truncate text-left text-sm font-semibold"
        >
          {exercise ? tr.exercise(exercise) : goal.exerciseId}
        </button>
        {achieved && <Chip tone="ok">{tr.t('goal.achieved')}</Chip>}
      </div>

      {/* The bar is capped at the target, but the number beside it is not: a
          lift that went past what was asked should read as past it. */}
      <div
        className="h-1.5 overflow-hidden rounded-full bg-[var(--color-line)]"
        role="img"
        aria-label={tr.t('goal.of', { current: round(current), target: round(goal.target), unit })}
      >
        <div
          className={cn(
            'h-full rounded-full',
            achieved ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-accent-2)]',
          )}
          style={{ width: `${Math.max(2, Math.min(100, share * 100))}%` }}
        />
      </div>

      <div className="num flex items-baseline justify-between gap-3 text-[11px] text-[var(--color-muted)]">
        <span>
          {tr.t('goal.of', { current: round(current), target: round(goal.target), unit })}
        </span>
        {!ended && <span>{tr.count('goal.daysLeft', daysLeft)}</span>}
      </div>

      {ended ? (
        <>
          {/* What happened, and never the word failed. */}
          <p className="text-[11px] leading-relaxed text-[var(--color-muted)]">
            {tr.t('goal.ended')}{' '}
            {achieved
              ? tr.t('goal.achieved')
              : outcomeOf(progress) === 'partly'
                ? tr.t('goal.partly', { n: round(current - goal.baseline), unit })
                : tr.t('goal.flat')}
          </p>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              className="min-h-9 self-start px-2 text-xs"
              onClick={() => fireAndForget(retireGoal(goal.id))}
            >
              {tr.t('common.done')}
            </Button>
            <Button
              variant="ghost"
              className="min-h-9 self-start px-2 text-xs"
              onClick={() => onOpen(goal.exerciseId)}
            >
              {tr.t('goal.again')}
            </Button>
          </div>
        </>
      ) : (
        <div className="flex items-center gap-2">
          {/* Only said when it is true by more than a retest of the same lift
              would move on its own. Anything smaller is the app's own noise. */}
          {moved && !achieved && (
            <span className="text-[11px] font-semibold text-[var(--color-accent)]">
              {tr.t('goal.nowAt', { n: round(current), unit })}
            </span>
          )}
          <Button
            variant="ghost"
            className="min-h-9 self-start px-2 text-xs text-[var(--color-muted)]"
            onClick={() => fireAndForget(retireGoal(goal.id))}
          >
            {tr.t('goal.stop')}
          </Button>
        </div>
      )}
    </div>
  );
}

export type { Goal };
