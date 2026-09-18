'use client';

/**
 * The screen you use with one hand, mid-set, with a phone you keep putting down.
 *
 * Everything needed to record a set is on the card itself. Logging used to open
 * a sheet, which meant five interactions per set — open, weight, reps, effort,
 * save — and around seventy-five across a session. So the card starts filled in
 * with **what you did last time**, and repeating a session costs one tap.
 *
 * That prefill is a record, not a recommendation. The card used to show a
 * target worked out by double progression — "add weight, back to 5" — and the
 * app no longer tells anybody what to lift. See Decision log D-014.
 */

import { useMemo, useState } from 'react';
import { Button, Card, Chip, Segmented, Stepper, cn } from '@/components/ui';
import { Page } from '@/components/page';
import { ExerciseSheet } from '@/components/exercise-sheet';
import { ExercisePicker } from '@/components/exercise-picker';
import { useProfile, useSnapshot, useT, useToday, type Translator } from '@/lib/client/hooks';
import { fireAndForget, logSet, removeSet } from '@/lib/client/mutations';
import { EFFORTS, fmtDay } from '@/lib/client/format';
import { DEFAULT_PREFS, lastSession, loadClassOf, toEntered, toStored } from '@athletic/domain';
import {
  OFF_PLAN_SESSION,
  mondayOf,
  nextSession,
  oneOffs,
  sessionLabel,
  sessionPlan,
  sessionsDone,
  type Exercise,
  type Indexed,
} from '@athletic/domain';
import type { Key } from '@/lib/i18n';
import type { LastSession, PlanRow } from '@athletic/domain';

export default function TrainPage() {
  const { ix } = useSnapshot();
  const profile = useProfile();
  const tr = useT();
  const today = useToday();
  const days = profile?.days ?? DEFAULT_PREFS.days;
  const unit = profile?.unit ?? DEFAULT_PREFS.unit;

  const [date, setDate] = useState(today);
  const [day, setDay] = useState(0);
  /** Which date the default was chosen for, so it is chosen once and not re-run. */
  const [pickedFor, setPickedFor] = useState<string | null>(null);

  /**
   * Which session to open on, given what has already been logged.
   *
   * `nextSession`, the same function Home uses. This page used to keep its own
   * copy of that rule — despite `nextSession`'s docstring saying that two copies
   * "would drift and quietly disagree about what today is" — and the copy is
   * exactly where an off-plan set would have been misread as day 23.
   */
  const suggestedDay = useMemo(() => nextSession(ix, date, days), [ix, date, days]);

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
  const finished = useMemo(() => sessionsDone(ix, days, mondayOf(date)), [ix, days, date]);

  /**
   * One exercise open at a time, because that is how a session is actually
   * done: three sets, ticked off, on to the next. Five cards each carrying
   * steppers, an effort control, a button and a dot row is a screen you have to
   * scroll to use.
   *
   * `openKey` follows the app's own idea of what is next, and stops following
   * it the moment you choose something else. `autoKey` is what makes that work:
   * it records the last first-unfinished exercise, so opening a *finished* card
   * to add a fourth set sticks — logging that set does not change which card is
   * first-unfinished, so nothing overrides you.
   *
   * Nothing is open once every exercise is finished. A session you have
   * completed should read as a list of ticks, not re-open its first card.
   */
  const nextUp = plan.find((r) => r.exercise && !(r.target > 0 && r.done >= r.target))?.key ?? null;
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [autoKey, setAutoKey] = useState<string | null>(null);
  if (autoKey !== nextUp) {
    setAutoKey(nextUp);
    setOpenKey(nextUp);
  }

  const done = plan.reduce((a, p) => a + p.done, 0);
  const total = plan.reduce((a, p) => a + p.target, 0);

  /**
   * Training that is not a day of the plan: a class, a test, anything else.
   *
   * What has been logged comes from the logs — so it survives a reload and
   * shows on every device — and `picked` holds only what was chosen in the last
   * few seconds and has no set yet. It is keyed by date so that switching date
   * cannot carry a half-started card into a different day.
   *
   * Kept apart from `plan` rather than merged into it. A merged row with no
   * target is never "complete", so it would become `nextUp` and re-open itself
   * after the day was finished, and it would push the day's counter to "13 of
   * 12 sets". It still shares `openKey`, so only one card is ever open.
   */
  const [picked, setPicked] = useState<{ date: string; ids: string[] }>({ date, ids: [] });
  const [picking, setPicking] = useState(false);
  const offPlan = useMemo(() => {
    const logged = oneOffs(ix, date);
    const seen = new Set(logged.map((o) => o.exercise.id));
    const fresh = (picked.date === date ? picked.ids : [])
      .filter((id) => !seen.has(id))
      .flatMap((id) => {
        const exercise = ix.exerciseById.get(id);
        return exercise ? [{ exercise, done: 0, logs: [] }] : [];
      });
    return [...logged, ...fresh];
  }, [ix, date, picked]);

  const pick = (exercise: Exercise) => {
    setPicking(false);
    /* Picking a lift that is already on the open day means the planned card,
       not an off-plan copy of it: the sets belong to the day, and logging them
       outside it would leave the day's own card unticked. */
    const planned = plan.find((r) => r.exercise?.id === exercise.id);
    if (planned) {
      setOpenKey(planned.key);
      return;
    }
    setPicked((p) => ({
      date,
      ids: p.date === date ? [...new Set([...p.ids, exercise.id])] : [exercise.id],
    }));
    setOpenKey(`off:${exercise.id}`);
  };

  return (
    <Page>
      <Card className="flex flex-col gap-3">
        <Segmented
          value={day}
          onChange={(next) => {
            // An explicit choice sticks for this date; the auto-pick does not
            // get to override it later.
            setDay(next);
            setPickedFor(date);
          }}
          doneLabel={tr.t('common.done')}
          options={Array.from({ length: days }, (_, i) => ({
            value: i,
            label: tr.t('common.day', { n: sessionLabel(i) }),
            done: finished[i] ?? false,
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

      {!plan.some((p) => p.exercise) && (
        <Card>
          <p className="text-[var(--color-muted)]">{tr.t('train.nothingPlanned')}</p>
        </Card>
      )}

      {plan.map((row) =>
        row.exercise ? (
          <ExerciseCard
            // Remounting on any of these re-seeds the inputs from history.
            // Deliberately *not* keyed on the logs, nor on whether the card is
            // open: the numbers must hold still between sets and across a
            // collapse, or every set after the first costs taps again.
            key={`${row.key}|${date}|${row.exercise.id}`}
            row={row}
            ix={ix}
            tr={tr}
            date={date}
            session={sessionLabel(day)}
            unit={unit}
            open={openKey === row.key}
            onOpen={() => setOpenKey(row.key)}
          />
        ) : null,
      )}

      {/* Below the planned cards, where the decision put it: the screen that is
          already open in the gym, with its date picker already there for
          logging a past session. Labelled rather than headed — a heading here
          would be the first h2 on the page after a finished day, and the page's
          own tooling reads that as the open exercise. */}
      {offPlan.length > 0 && (
        <div className="flex flex-col gap-1 px-1">
          <p className="text-[10.5px] font-bold tracking-wider text-[var(--color-muted)] uppercase">
            {tr.t('train.offPlan')}
          </p>
          <p className="text-xs text-[var(--color-muted)]">{tr.t('train.offPlanNote')}</p>
        </div>
      )}
      {offPlan.map((row) => (
        <ExerciseCard
          key={`off:${row.exercise.id}|${date}`}
          row={{ ...row, target: 0 }}
          ix={ix}
          tr={tr}
          date={date}
          session={OFF_PLAN_SESSION}
          unit={unit}
          open={openKey === `off:${row.exercise.id}`}
          onOpen={() => setOpenKey(`off:${row.exercise.id}`)}
        />
      ))}

      <Button variant="ghost" className="w-full" onClick={() => setPicking(true)}>
        + {tr.t('train.logOther')}
      </Button>

      {picking && (
        <ExercisePicker
          title={tr.t('train.logOther')}
          /* The whole library, including the movements the generator never
             programs — thrusters, wall balls, the things a class is made of.
             Logging those is precisely what this is for, which is why the swap
             sheet's filter is not reused here: it excludes exactly them. */
          exercises={ix.exercises}
          patterns={ix.patterns}
          onPick={pick}
          onClose={() => setPicking(false)}
        />
      )}
    </Page>
  );
}

/** Identity of a past session, for spotting when the history behind it moved. */
const seedOf = (s: LastSession | null): string => `${s?.date}|${s?.weight}|${s?.reps}`;

/**
 * What a card needs from its row — and all it needs.
 *
 * Narrower than `PlanRow` on purpose, so an off-plan exercise can be a card
 * without pretending to be a row of the program: it has no slot, no entry and no
 * target, and a fake one would put "0 of 0 sets" on screen.
 */
type CardRow = Pick<PlanRow, 'exercise' | 'done' | 'target' | 'logs'>;

function ExerciseCard({
  row,
  ix,
  tr,
  date,
  session,
  unit,
  open,
  onOpen,
}: {
  row: CardRow;
  ix: Indexed;
  tr: Translator;
  date: string;
  /** The label each set is logged under: the open day's letter, or
   *  `OFF_PLAN_SESSION` for training that is not a day of the plan. */
  session: string;
  unit: string;
  open: boolean;
  onOpen: () => void;
}) {
  const offPlan = session === OFF_PLAN_SESSION;
  const exercise = row.exercise!;

  const s = useMemo(() => lastSession(ix, exercise.id), [ix, exercise.id]);

  /**
   * The weight box holds **what you type**, which is not always what is
   * stored: for a pair of dumbbells you enter one and both are recorded. See
   * `load.ts` for why that is the convention and where it comes from.
   *
   * The conversion lives at this boundary and nowhere else. Every other surface
   * — the history line below, the calendar, the charts, the score — reads the
   * stored load, so there is exactly one number in the system and exactly one
   * place it is converted, in view of the caption that explains it.
   */
  const load = loadClassOf(exercise.name);
  /** Ties the measuring note to the weight box, so a screen reader hears it on
   *  focus rather than only if it happens to read past the control. */
  const howId = `how-${exercise.id}`;
  const [weight, setWeight] = useState<number | null>(() =>
    toEntered(exercise.name, s?.weight ?? null),
  );
  const [reps, setReps] = useState<number | null>(() => s?.reps ?? null);
  const [rir, setRir] = useState<number>(2);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(false);
  const [seeded, setSeeded] = useState(() => seedOf(s));

  /**
   * The inputs follow last time's numbers up until the first set, then hold
   * still.
   *
   * Both halves matter. Holding still is the whole point of the redesign — if
   * the numbers moved after every set, straight sets would cost taps again. But
   * holding from *mount* was too early: the history comes from logs in
   * IndexedDB, which arrive a tick after the first paint, so the card would
   * freeze onto empty inputs and stay there for an exercise with months behind
   * it.
   */
  const seed = seedOf(s);
  if (row.done === 0 && seeded !== seed) {
    setSeeded(seed);
    setWeight(toEntered(exercise.name, s?.weight ?? null));
    setReps(s?.reps ?? null);
  }

  const complete = row.target > 0 && row.done >= row.target;
  /* An off-plan card has no target, so it shows only what was done — hollow
     dots would be a promise of sets nobody asked for. A planned card keeps its
     old rule, including the three-dot fallback. */
  const dots = offPlan ? row.done : Math.max(row.target, row.done) || 3;

  /**
   * Progress as dots: filled for a set done, hollow for one still to do.
   *
   * Shared by both states, which is the point — closed, it is the only thing on
   * the row besides the name, and open, it sits beside the log button. The same
   * mark means the same thing in both, so collapsing a card loses nothing you
   * were reading.
   */
  const dotRow = (
    <div aria-hidden className="flex shrink-0 gap-1.5">
      {Array.from({ length: dots }, (_, i) => (
        <span
          key={i}
          className={cn(
            'h-2.5 w-2.5 rounded-full transition-all duration-300 ease-[var(--ease-spring)]',
            i < row.done
              ? 'scale-110 bg-[var(--color-accent)] shadow-[0_0_10px_-1px_var(--color-accent)]'
              : 'bg-[var(--color-line)]',
          )}
        />
      ))}
    </div>
  );

  const save = async () => {
    if (saving) return;
    // Guarded because the button stays put after a tap — on a laggy phone a
    // double tap would otherwise log the set twice.
    setSaving(true);
    try {
      // Reported by the write layer if it fails; the button simply frees up
      // again so the set can be tried once more.
      await logSet({
        date,
        session,
        exerciseId: exercise.id,
        setNo: row.done + 1,
        weight: toStored(exercise.name, weight),
        reps,
        rir,
      });
    } catch {
      /* Already surfaced in the sync badge. */
    } finally {
      setSaving(false);
    }
  };

  /**
   * Closed: the name and the dots, and nothing else.
   *
   * The component stays mounted rather than being swapped out — a weight you
   * typed and have not logged yet lives in this component's state, and
   * unmounting would throw it away and then re-seed from history on the way
   * back, silently changing the number under somebody mid-session.
   */
  if (!open) {
    return (
      <Card className={cn('transition-opacity duration-300', complete && 'opacity-60')}>
        <button
          type="button"
          onClick={onOpen}
          aria-expanded={false}
          className="flex min-h-[var(--spacing-tap)] w-full cursor-pointer items-center gap-3 text-left"
        >
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-[15px] font-semibold',
              complete && 'text-[var(--color-muted)]',
            )}
          >
            {tr.exercise(exercise)}
          </span>
          {/* The tick is the signal and the fade only reinforces it — a muted
              name and a normal one are the same name to a lot of people. */}
          {complete && (
            <span aria-hidden className="shrink-0 text-sm text-[var(--color-accent)]">
              ✓
            </span>
          )}
          {/* The dots are a picture of the count, so the count is also said.
              Without this the row announces as a bare exercise name and a
              screen reader learns nothing about progress from it.

              Its own phrasing rather than `train.ofSets`, which is the *day's*
              counter at the top of the screen — the same words on both would
              have the page saying "0 of 3 sets" six times with nothing to say
              which one is the whole day. */}
          <span className="sr-only">
            {offPlan
              ? tr.plural(row.done, 'set')
              : tr.t('train.rowDone', { done: row.done, total: row.target })}
          </span>
          {dotRow}
        </button>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        'flex flex-col gap-2.5 transition-opacity duration-300',
        complete && 'opacity-70',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {/* The name is the affordance: needing to know what a movement is
              happens while reading its name, not on a separate library screen. */}
          <button
            type="button"
            onClick={() => setDetail(true)}
            aria-label={tr.t('ex.about', { name: tr.exercise(exercise) })}
            className="flex max-w-full min-w-0 cursor-pointer items-center gap-1.5 text-left"
          >
            <h2 className="truncate text-[17px] font-semibold">{tr.exercise(exercise)}</h2>
            <span
              aria-hidden
              className="grid h-4 w-4 shrink-0 place-items-center rounded-full border border-[var(--color-line)] text-[10px] font-bold text-[var(--color-muted)]"
            >
              i
            </span>
          </button>
          {/* History, stated as history. The numbers in the steppers below are
              these numbers, so repeating a session is one tap — but nothing
              here says to beat them. */}
          <p className="mt-0.5 text-xs text-[var(--color-muted)]">
            {s
              ? tr.t('train.lastTime', {
                  w: s.weight ? `${s.weight} ${unit}` : '—',
                  r: s.reps ?? 0,
                  d: fmtDay(s.date),
                })
              : tr.t('train.noHistory')}
          </p>
        </div>
        {complete && <Chip tone="ok">✓</Chip>}
      </div>

      <div className="flex items-end gap-2">
        <label className="min-w-0 flex-1">
          <span className="mb-1 block text-[10.5px] font-bold tracking-wider text-[var(--color-muted)] uppercase">
            {unit}
          </span>
          <Stepper
            value={weight}
            onChange={setWeight}
            step={2.5}
            label="weight"
            describedBy={howId}
          />
        </label>
        <label className="min-w-0 flex-1">
          <span className="mb-1 block text-[10.5px] font-bold tracking-wider text-[var(--color-muted)] uppercase">
            {tr.t('common.reps')}
          </span>
          <Stepper value={reps} onChange={setReps} step={1} max={100} label="reps" />
        </label>
      </div>

      {/* What the number in the box actually means.

          The app asked for a "weight" for months without ever saying what it was
          counting — which for two dumbbells is a factor of two, and once stored
          there is nothing to say which side of it a row is on. This is the line
          that fixes it, and it is attached to the input rather than hidden in
          the exercise sheet because it is only useful at the moment of typing.

          For a pair it names the figure that will be recorded, so the doubling
          happens in view: type 30 and it says 60. That is what every other
          screen will show, so nothing is a surprise later. */}
      <p id={howId} className="-mt-1 text-xs text-[var(--color-muted)]">
        {load === 'dumbbellPair'
          ? weight === null
            ? tr.t('load.dumbbellPairEmpty')
            : tr.t('load.dumbbellPair', { w: `${toStored(exercise.name, weight)} ${unit}` })
          : tr.t(`load.${load}` as Key)}
      </p>

      {/* Kept visible rather than tucked behind a tap. The estimate behind the
          strength score and every chart reads it — a set at nothing-left and a
          set with three to spare are different measurements — and anything
          hidden gets left at its default, which would quietly feed that
          estimate a guess every set. */}
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
        {dotRow}
      </div>

      {detail && <ExerciseSheet exercise={exercise} onClose={() => setDetail(false)} />}

      {row.logs.length > 0 && (
        <div className="flex flex-col">
          {row.logs.map((l) => (
            <div
              key={l.id}
              className="animate-pop flex items-center justify-between border-t border-[var(--color-line)] py-1.5 text-[13px] first:border-t-0"
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
                onClick={() => fireAndForget(removeSet(l.id))}
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
