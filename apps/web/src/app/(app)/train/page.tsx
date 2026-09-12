'use client';

/**
 * The screen you use with one hand, mid-set, with a phone you keep putting down.
 *
 * Everything needed to record a set is on the card itself. Logging used to open
 * a sheet, which meant five interactions per set — open, weight, reps, effort,
 * save — and around seventy-five across a session. The weight and reps are
 * already known (that is what the coach is for), so the common case should cost
 * one tap and nothing else. Adjusting is there when the numbers are wrong, not
 * as a toll on every set.
 */

import { useMemo, useState } from 'react';
import { Button, Card, Chip, Segmented, Stepper, cn } from '@/components/ui';
import { useProfile, useSnapshot, useT, useToday, type Translator } from '@/lib/client/hooks';
import { logSet, removeSet } from '@/lib/client/mutations';
import { EFFORTS, suggestionText } from '@/lib/client/format';
import { effortCheck, suggest } from '@athletic/domain';
import { allLogs, mondayOf, sessionLabel, sessionPlan, type Indexed } from '@athletic/domain';
import type { Key } from '@/lib/i18n';
import type { PlanRow, Suggestion } from '@athletic/domain';

export default function TrainPage() {
  const { ix } = useSnapshot();
  const profile = useProfile();
  const tr = useT();
  const today = useToday();

  const [date, setDate] = useState(today);
  const [day, setDay] = useState(0);
  /** Which date the default was chosen for, so it is chosen once and not re-run. */
  const [pickedFor, setPickedFor] = useState<string | null>(null);

  const days = profile?.days ?? 3;
  const unit = profile?.unit ?? 'kg';

  /** Which session to open on, given what has already been logged. Pure. */
  const suggestedDay = useMemo(() => {
    const logs = allLogs(ix);

    // Resuming beats advancing. If something was already logged on this date,
    // go back to that session — a locked phone or a reload mid-workout must not
    // abandon a half-finished day.
    const startedToday = logs.filter((l) => l.date === date).map((l) => l.session);
    if (startedToday.length) {
      const earliest = Math.min(...startedToday.map((s) => s.charCodeAt(0) - 65));
      return Math.min(earliest, days - 1);
    }

    // Otherwise offer the first session not yet trained this week.
    const week = mondayOf(date);
    const trained = new Set(logs.filter((l) => l.weekOf === week).map((l) => l.session));
    for (let i = 0; i < days; i++) {
      if (!trained.has(sessionLabel(i))) return i;
    }
    return 0;
  }, [ix, date, days]);

  /**
   * Applied once per date, during render rather than in an effect.
   *
   * React supports adjusting state directly while rendering for exactly this
   * case, and it avoids the cascading re-render an effect would cause. The
   * guard is what matters: without it the suggestion would re-apply on every
   * change to the logs and move you to the next day the moment you logged your
   * first set — mid-session, without asking.
   */
  if (pickedFor !== date) {
    setDay(suggestedDay);
    setPickedFor(date);
  }

  const plan = useMemo(() => sessionPlan(ix, days, date, day), [ix, days, date, day]);
  const tooEasy = useMemo(() => effortCheck(ix), [ix]);

  const done = plan.reduce((a, p) => a + p.done, 0);
  const total = plan.reduce((a, p) => a + p.target, 0);

  return (
    <>
      <Card className="flex flex-col gap-3">
        <Segmented
          value={day}
          onChange={(next) => {
            // An explicit choice sticks for this date; the auto-pick does not
            // get to override it later.
            setDay(next);
            setPickedFor(date);
          }}
          options={Array.from({ length: days }, (_, i) => ({
            value: i,
            label: tr.t('common.day', { n: i + 1 }),
          }))}
        />
        <div className="flex items-center justify-between gap-3">
          <input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value || today);
              // A new date gets a fresh auto-pick.
              setPickedFor(null);
            }}
            className="min-h-[var(--spacing-tap)] max-w-[180px] rounded-[11px] border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3"
          />
          <span className="num text-sm text-[var(--color-muted)]">
            {total ? tr.t('train.ofSets', { done, total }) : tr.plural(done, 'set')}
          </span>
        </div>
      </Card>

      {tooEasy && (
        <Card className="border-[var(--color-warn)]/45">
          <h3 className="text-sm font-semibold">{tr.t('train.tooEasy')}</h3>
          <p className="mt-1 text-sm text-[var(--color-muted)]">{tr.t('train.tooEasyBody')}</p>
        </Card>
      )}

      {!plan.some((p) => p.exercise) && (
        <Card>
          <p className="text-[var(--color-muted)]">{tr.t('train.nothingPlanned')}</p>
        </Card>
      )}

      {plan.map((row) =>
        row.exercise ? (
          <ExerciseCard
            // Remounting on any of these re-seeds the inputs from the coach.
            // Deliberately *not* keyed on the logs: the numbers must hold still
            // between sets, or every set after the first costs taps again.
            key={`${row.key}|${date}|${row.exercise.id}`}
            row={row}
            ix={ix}
            tr={tr}
            date={date}
            day={day}
            unit={unit}
          />
        ) : null,
      )}
    </>
  );
}

/** Identity of a suggestion, for spotting when the coach has changed its mind. */
const seedOf = (s: Suggestion): string => `${s.kind}|${s.weight}|${s.reps}`;

function ExerciseCard({
  row,
  ix,
  tr,
  date,
  day,
  unit,
}: {
  row: PlanRow;
  ix: Indexed;
  tr: Translator;
  date: string;
  day: number;
  unit: string;
}) {
  const exercise = row.exercise!;

  const s = useMemo(() => suggest(ix, exercise.id, row.entry), [ix, exercise.id, row.entry]);

  const [weight, setWeight] = useState<number | null>(() => s.weight);
  const [reps, setReps] = useState<number | null>(() => s.reps);
  const [rir, setRir] = useState<number>(2);
  const [saving, setSaving] = useState(false);
  const [seeded, setSeeded] = useState(() => seedOf(s));

  /**
   * The inputs follow the coach right up until the first set, then hold still.
   *
   * Both halves matter. Holding still is the whole point of the redesign — if
   * the numbers moved after every set, straight sets would cost taps again. But
   * holding from *mount* was too early: the suggestion is derived from logs in
   * IndexedDB, which arrive a tick after the first paint, so the card would
   * freeze onto "first time, pick a weight" and stay there for an exercise with
   * months of history behind it.
   */
  const seed = seedOf(s);
  if (row.done === 0 && seeded !== seed) {
    setSeeded(seed);
    setWeight(s.weight);
    setReps(s.reps);
  }

  const complete = row.target > 0 && row.done >= row.target;
  const dots = Math.max(row.target, row.done) || 3;

  const save = async () => {
    if (saving) return;
    // Guarded because the button stays put after a tap — on a laggy phone a
    // double tap would otherwise log the set twice.
    setSaving(true);
    try {
      await logSet({
        date,
        session: sessionLabel(day),
        exerciseId: exercise.id,
        setNo: row.done + 1,
        weight,
        reps,
        rir,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className={cn('flex flex-col gap-2.5', complete && 'opacity-75')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[17px] font-semibold">{exercise.name}</h2>
          <p className="mt-0.5 text-xs text-[var(--color-muted)]">{suggestionText(tr, s, unit)}</p>
        </div>
        {complete && <Chip tone="ok">✓</Chip>}
      </div>

      <div className="flex items-end gap-2">
        <label className="min-w-0 flex-1">
          <span className="mb-1 block text-[10.5px] font-bold tracking-wider text-[var(--color-muted)] uppercase">
            {unit}
          </span>
          <Stepper value={weight} onChange={setWeight} step={2.5} label="weight" />
        </label>
        <label className="min-w-0 flex-1">
          <span className="mb-1 block text-[10.5px] font-bold tracking-wider text-[var(--color-muted)] uppercase">
            {tr.t('common.reps')}
          </span>
          <Stepper value={reps} onChange={setReps} step={1} max={100} label="reps" />
        </label>
      </div>

      {/* Kept visible rather than tucked behind a tap. It is the one input the
          progression rule genuinely needs, and anything hidden gets left at its
          default — which would quietly feed the coach a guess every set. */}
      <Segmented
        value={rir}
        onChange={setRir}
        options={EFFORTS.map((v) => ({ value: v as number, label: tr.t(`effort.${v}s` as Key) }))}
      />

      <div className="flex items-center gap-3">
        <Button
          variant={complete ? 'default' : 'primary'}
          className="flex-1"
          disabled={saving}
          onClick={() => void save()}
        >
          {complete ? tr.t('train.addAnother') : tr.t('train.logSet', { n: row.done + 1 })}
        </Button>
        <div className="flex gap-1.5" aria-label={`${row.done}/${row.target}`}>
          {Array.from({ length: dots }, (_, i) => (
            <span
              key={i}
              className={cn(
                'h-2.5 w-2.5 rounded-full',
                i < row.done ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-line)]',
              )}
            />
          ))}
        </div>
      </div>

      {row.logs.length > 0 && (
        <div className="flex flex-col">
          {row.logs.map((l) => (
            <div
              key={l.id}
              className="flex items-center justify-between border-t border-[var(--color-line)] py-1.5 text-[13px] first:border-t-0"
            >
              <span className="num text-[var(--color-muted)]">
                {l.weight ?? 0} {unit} × {l.reps ?? 0}
                <span className="ml-2 rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[11px]">
                  {tr.t(`effort.${(l.rir ?? 2) >= 4 ? 4 : (l.rir ?? 2)}` as Key)}
                </span>
              </span>
              <Button
                variant="danger"
                className="min-h-8 px-2 text-xs"
                aria-label={tr.t('common.delete')}
                onClick={() => void removeSet(l.id)}
              >
                ✕
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
