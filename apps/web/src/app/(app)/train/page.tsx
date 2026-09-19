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

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Button, Card, Chip, Segmented, cn } from '@/components/ui';
import { Page } from '@/components/page';
import { ExerciseSheet } from '@/components/exercise-sheet';
import { ExercisePicker } from '@/components/exercise-picker';
import { Collapse } from '@/components/entry/collapse';
import { PlateLoader } from '@/components/entry/plate-loader';
import { Ruler } from '@/components/entry/ruler';
import { ValueStepper } from '@/components/entry/value-stepper';
import {
  useProfile,
  useRememberedBar,
  useSnapshot,
  useT,
  useToday,
  type Translator,
} from '@/lib/client/hooks';
import { fireAndForget, logSet, rememberBar, removeSet } from '@/lib/client/mutations';
import { EFFORTS, fmtDay } from '@/lib/client/format';
import {
  BAR_CHOICES,
  PLATES,
  REPS_SCALE,
  barWeightOf,
  buttonStep,
  lastSession,
  loadClassOf,
  prefs,
  scaleValues,
  startReps,
  startWeight,
  toEntered,
  toStored,
  weightScale,
} from '@athletic/domain';
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
import type { EntryMode, LastSession, PlanRow, Unit } from '@athletic/domain';

export default function TrainPage() {
  const { ix } = useSnapshot();
  const profile = useProfile();
  const tr = useT();
  const today = useToday();
  /* Through `prefs()`, not off the row: a profile synced before the entry
     settings existed has no `entryMode` or `plateLoader` at all. */
  const { days, unit, entryMode, plateLoader } = prefs(profile);

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
   *
   * `advancedTo` is the card the app moved on to by itself when the one before
   * it was finished. That card is scrolled into view once it has opened, since
   * it is where the thumb goes next and it can open below the fold. Nothing
   * else scrolls: the first card on arrival is already at the top, and a card
   * somebody tapped is already where they are looking — moving the page under
   * a deliberate tap would be the screen jumping again.
   */
  const nextUp = plan.find((r) => r.exercise && !(r.target > 0 && r.done >= r.target))?.key ?? null;
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [autoKey, setAutoKey] = useState<string | null>(null);
  const [advancedTo, setAdvancedTo] = useState<string | null>(null);
  if (autoKey !== nextUp) {
    // Null before: the first pick on arrival, not a move from one card on.
    setAdvancedTo(autoKey === null ? null : nextUp);
    setAutoKey(nextUp);
    setOpenKey(nextUp);
  }
  /** Opening a card by hand. Clears `advancedTo`, so tapping back to the card
   *  the app once moved to does not scroll the page a second time. */
  const choose = (key: string) => {
    setAdvancedTo(null);
    setOpenKey(key);
  };

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
    /* A lift picked while one day was open, and never logged, is dropped the
       moment a day that plans it is opened — otherwise it sits as an empty
       off-plan card under the day's own card for the same lift, the duplicate
       picking was built to prevent. Logged sets are never dropped: those really
       were done outside the plan. */
    const plannedHere = new Set(plan.flatMap((r) => (r.exercise ? [r.exercise.id] : [])));
    const fresh = (picked.date === date ? picked.ids : [])
      .filter((id) => !seen.has(id) && !plannedHere.has(id))
      .flatMap((id) => {
        const exercise = ix.exerciseById.get(id);
        return exercise ? [{ exercise, done: 0, logs: [] }] : [];
      });
    return [...logged, ...fresh];
  }, [ix, date, picked, plan]);

  const pick = (exercise: Exercise) => {
    setPicking(false);
    /* Picking a lift that is already on the open day means the planned card,
       not an off-plan copy of it: the sets belong to the day, and logging them
       outside it would leave the day's own card unticked. */
    const planned = plan.find((r) => r.exercise?.id === exercise.id);
    if (planned) {
      choose(planned.key);
      return;
    }
    setPicked((p) => ({
      date,
      ids: p.date === date ? [...new Set([...p.ids, exercise.id])] : [exercise.id],
    }));
    choose(`off:${exercise.id}`);
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
            repRange={row.entry?.repRange ?? null}
            ix={ix}
            tr={tr}
            date={date}
            session={sessionLabel(day)}
            unit={unit}
            entryMode={entryMode}
            plateLoader={plateLoader}
            open={openKey === row.key}
            reveal={advancedTo === row.key}
            onOpen={() => choose(row.key)}
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
          // No plan, so no range to start the reps from.
          repRange={null}
          ix={ix}
          tr={tr}
          date={date}
          session={OFF_PLAN_SESSION}
          unit={unit}
          entryMode={entryMode}
          plateLoader={plateLoader}
          open={openKey === `off:${row.exercise.id}`}
          reveal={false}
          onOpen={() => choose(`off:${row.exercise.id}`)}
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

/**
 * The most dots a row draws.
 *
 * An off-plan card has no target, so its row grows with every set — and a class
 * logged as twenty sets of burpees pushed the exercise's name off the collapsed
 * card and then out of the card entirely. Past this, the count is written out.
 */
const MAX_DOTS = 8;

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
  repRange,
  ix,
  tr,
  date,
  session,
  unit,
  entryMode,
  plateLoader,
  open,
  reveal,
  onOpen,
}: {
  row: CardRow;
  /** The plan's rep range for this slot, which a card with no history starts
   *  its reps from. Null off the plan. */
  repRange: string | null;
  ix: Indexed;
  tr: Translator;
  date: string;
  /** The label each set is logged under: the open day's letter, or
   *  `OFF_PLAN_SESSION` for training that is not a day of the plan. */
  session: string;
  unit: Unit;
  /** How the numbers are set — Settings → Logging sets. */
  entryMode: EntryMode;
  /** Whether a barbell lift gets the picture of the bar instead. */
  plateLoader: boolean;
  open: boolean;
  /** Scroll the card into view once it has opened: the app moved on to it. */
  reveal: boolean;
  onOpen: () => void;
}) {
  const offPlan = session === OFF_PLAN_SESSION;
  const exercise = row.exercise!;

  const s = useMemo(() => lastSession(ix, exercise.id), [ix, exercise.id]);

  /**
   * The weight on the card holds **what you enter**, which is not always what
   * is stored: for a pair of dumbbells you enter one and both are recorded. See
   * `load.ts` for why that is the convention and where it comes from.
   *
   * The conversion lives at this boundary and nowhere else. Every other surface
   * — the history line below, the calendar, the charts, the score — reads the
   * stored load, so there is exactly one number in the system and exactly one
   * place it is converted, in view of the caption that explains it.
   */
  const load = loadClassOf(exercise.name);
  /** Ties the measuring note to the weight control, so a screen reader hears
   *  it on focus rather than only if it happens to read past the control. */
  const howId = `how-${exercise.id}`;

  /**
   * The empty bar, for a barbell lift: picked on the bar chip, remembered on
   * this device, and otherwise the bar the exercise is usually done on.
   *
   * The pick is also held here, so the chip, the picture and the total change
   * in the same render — the stored copy arrives a read later, and for that
   * read the plates would be drawn on the old bar. Held with its unit, so a
   * unit change mid-session never reads 20 kg back as 20 lb.
   */
  const remembered = useRememberedBar(exercise.id, unit);
  const [chosen, setChosen] = useState<{ unit: Unit; bar: number } | null>(null);
  const bar =
    (chosen?.unit === unit ? chosen.bar : null) ?? remembered ?? barWeightOf(exercise.name, unit);
  const chooseBar = (next: number) => {
    setChosen({ unit, bar: next });
    fireAndForget(rememberBar(exercise.id, unit, next));
  };

  /**
   * Where the numbers start: last time, and failing that something plausible
   * to adjust from — never a blank.
   *
   * There is no empty state any more, because there is no box to leave empty:
   * every control sets a number. So a lift with no history starts on its bar,
   * a light dumbbell, a plate or two on a stack, or nothing added for
   * bodyweight — and the reps on the bottom of the plan's range. A number from
   * history always wins, field by field.
   */
  const lastWeight = toEntered(exercise.name, s?.weight ?? null);
  const startW = () => (load === 'barbell' ? bar : startWeight(load, unit, exercise.name));
  const startR = () => s?.reps ?? startReps(repRange);
  const [weight, setWeight] = useState<number>(() => lastWeight ?? startW());
  const [reps, setReps] = useState<number>(startR);
  const [rir, setRir] = useState<number>(2);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(false);

  /**
   * The numbers follow last time's up until the first set, then hold still.
   *
   * Both halves matter. Holding still is the whole point of the redesign — if
   * the numbers moved after every set, straight sets would cost taps again. But
   * holding from *mount* was too early: the history comes from logs in
   * IndexedDB, which arrive a tick after the first paint, so the card would
   * freeze onto empty numbers and stay there for an exercise with months
   * behind it.
   *
   * A remembered bar arrives the same way, so a barbell lift with no weight in
   * its history also waits for that read. Only for the read, though — whether
   * it has finished, not which bar it found. Picking a bar on the chip moves
   * the total by the difference; re-seeding on the pick would throw away the
   * plates that were on it.
   */
  const waitingForBar = lastWeight === null && load === 'barbell' && remembered === undefined;
  const seed = `${seedOf(s)}|${waitingForBar}`;
  const [seeded, setSeeded] = useState(seed);
  if (row.done === 0 && seeded !== seed) {
    setSeeded(seed);
    setWeight(lastWeight ?? startW());
    setReps(startR());
  }

  const complete = row.target > 0 && row.done >= row.target;
  /* An off-plan card has no target, so it shows only what was done — hollow
     dots would be a promise of sets nobody asked for. A planned card keeps its
     old rule, including the three-dot fallback. */
  const dots = offPlan ? Math.min(row.done, MAX_DOTS) : Math.max(row.target, row.done) || 3;

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
      {/* Past the cap, the rest as a number rather than more dots. */}
      {offPlan && row.done > MAX_DOTS && (
        <span className="num text-xs leading-none font-semibold text-[var(--color-accent)]">
          +{row.done - MAX_DOTS}
        </span>
      )}
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
        // Nothing added to yourself is no added weight, and is stored that way
        // — the bodyweight card shows it as "None", and always has logged it
        // as empty.
        weight: load === 'bodyweight' && weight === 0 ? null : toStored(exercise.name, weight),
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
   * Once the card has opened by itself, bring all of it into view — the next
   * exercise can open below the fold, with its log button under the tab bar.
   *
   * `nearest`, so a card already on screen does not move. Every card is sized
   * to fit between the header and the tab bar of a 640 px phone; on a smaller
   * one, or in landscape, a card that still does not fit is brought in by its
   * **bottom**, not its top — the controls and the log button are what the
   * next set needs, and the name was on screen a moment ago in the row that
   * just opened. Smooth unless the person has asked for less motion, which CSS
   * cannot switch off for a script-driven scroll.
   */
  const card = useRef<HTMLDivElement>(null);
  const bringIntoView = () => {
    const el = card.current;
    if (!el) return;
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    const style = getComputedStyle(el);
    const room =
      window.innerHeight - parseFloat(style.scrollMarginTop) - parseFloat(style.scrollMarginBottom);
    const fits = el.getBoundingClientRect().height <= room;
    el.scrollIntoView({ block: fits ? 'nearest' : 'end', behavior: still ? 'auto' : 'smooth' });
  };

  /**
   * A card opened by a tap stays where it was tapped.
   *
   * Opening one card closes another, and when the one closing is above, the
   * page under the thumb slides up by that card's height. Chrome hides this
   * with scroll anchoring; Safari has none, so on an iPhone the card you just
   * tapped would jump away from your finger — the jumping this whole change
   * was meant to end. So the card's position is taken at the tap and held for
   * the length of the other card's closing, one frame at a time. Where the
   * browser has already anchored, the drift is zero and this does nothing.
   *
   * Only for a tap: a card that opened by itself is brought into view instead.
   */
  const tapTop = useRef<number | null>(null);
  const openByTap = () => {
    tapTop.current = card.current?.getBoundingClientRect().top ?? null;
    onOpen();
  };
  useLayoutEffect(() => {
    const from = tapTop.current;
    tapTop.current = null;
    if (!open || from === null) return;
    const until = performance.now() + 450;
    let frame = 0;
    const hold = () => {
      const el = card.current;
      if (!el) return;
      const drift = el.getBoundingClientRect().top - from;
      if (Math.abs(drift) >= 1) window.scrollBy({ top: drift, behavior: 'instant' });
      if (performance.now() < until) frame = requestAnimationFrame(hold);
    };
    hold();
    return () => cancelAnimationFrame(frame);
  }, [open]);

  /* ------------------------------------------------------------ the numbers */

  /**
   * Which control sets each number — Settings decides, once, for every card.
   *
   * A barbell lift with the plate loader on gets the picture of the bar, since
   * "which plates did you put on" is the question somebody at a rack can answer
   * without doing sums. Everything else, and the reps always, gets buttons or a
   * ruler. Whichever it is, each number has a button named "Type weight" or
   * "Type reps" that opens the keypad, so nothing is ever out of reach and the
   * tests can reach every mode the same way.
   *
   * The ruler for a barbell starts at its bar, and each ruler also stops at the
   * number on the card and at last time's, wherever those fall — a ruler that
   * rounded last week's 61.25 to 60 would be changing a number nobody touched.
   */
  const plates = plateLoader && load === 'barbell';
  const scale = weightScale(load, unit, load === 'barbell' ? bar : undefined);
  const noneLabel = load === 'bodyweight' ? tr.t('entry.none') : undefined;
  const lastReps = s?.reps ?? null;

  const weightControl = plates ? (
    <PlateLoader
      value={weight}
      bar={bar}
      unit={unit}
      plates={PLATES[unit]}
      barChoices={BAR_CHOICES[unit]}
      onChange={setWeight}
      onBarChange={chooseBar}
      describedBy={howId}
    />
  ) : entryMode === 'ruler' ? (
    <Ruler
      values={scaleValues(scale, weight, lastWeight)}
      value={weight}
      onChange={setWeight}
      label="weight"
      unit={unit}
      describedBy={howId}
      typeLabel={tr.t('entry.typeWeight')}
      decimals
      min={scale.min}
      max={scale.max}
      noneLabel={noneLabel}
    />
  ) : (
    <ValueStepper
      value={weight}
      onChange={setWeight}
      step={buttonStep(load, unit)}
      min={scale.min}
      max={scale.max}
      label="weight"
      unit={unit}
      describedBy={howId}
      typeLabel={tr.t('entry.typeWeight')}
      decimals
      noneLabel={noneLabel}
    />
  );

  const repsControl =
    entryMode === 'ruler' ? (
      <Ruler
        values={scaleValues(REPS_SCALE, reps, lastReps)}
        value={reps}
        onChange={setReps}
        label="reps"
        unit=""
        typeLabel={tr.t('entry.typeReps')}
        decimals={false}
        min={REPS_SCALE.min}
        max={REPS_SCALE.max}
      />
    ) : (
      <ValueStepper
        value={reps}
        onChange={setReps}
        step={REPS_SCALE.step}
        min={REPS_SCALE.min}
        max={REPS_SCALE.max}
        label="reps"
        unit=""
        typeLabel={tr.t('entry.typeReps')}
        decimals={false}
      />
    );

  /* A caption over a pair of buttons. A `div`, not the `label` it used to be:
     a label forwards a tap on its text to the first control inside it, which
     is now the "−" button. The ruler and the bar carry their own. */
  const captioned = (caption: string, control: ReactNode) => (
    <div className="min-w-0 flex-1">
      <span className="mb-1 block text-[10.5px] font-bold tracking-wider text-[var(--color-muted)] uppercase">
        {caption}
      </span>
      {control}
    </div>
  );

  /* What the number actually means.

     The app asked for a "weight" for months without ever saying what it was
     counting — which for two dumbbells is a factor of two, and once stored
     there is nothing to say which side of it a row is on. This is the line
     that fixes it, and it is attached to the weight control rather than hidden
     in the exercise sheet because it is only useful at the moment of setting.

     For a pair it names the figure that will be recorded, so the doubling
     happens in view: set 30 and it says 60. That is what every other screen
     will show, so nothing is a surprise later. */
  const how = (
    <p id={howId} className="-mt-1 text-xs text-[var(--color-muted)]">
      {load === 'dumbbellPair'
        ? tr.t('load.dumbbellPair', { w: `${toStored(exercise.name, weight)} ${unit}` })
        : tr.t(`load.${load}` as Key)}
    </p>
  );

  return (
    <Card
      ref={card}
      className={cn(
        // Clear of the sticky header (46 px) and the tab bar (62 px) when
        // scrolled to, with a few pixels of air. Measured, not generous: at
        // 4.5rem each the margins alone made a 518 px card "taller than the
        // screen" on a 640 px phone, and the scroll then hid its log button.
        'scroll-mt-[calc(env(safe-area-inset-top)+3.25rem)] scroll-mb-[calc(env(safe-area-inset-bottom)+4.25rem)]',
        'transition-opacity duration-300',
        complete && (open ? 'opacity-70' : 'opacity-60'),
      )}
    >
      {open ? (
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
            {/* History, stated as history. The numbers below start as these
                numbers, so repeating a session is one tap — but nothing here
                says to beat them. */}
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
      ) : (
        /* Closed: the name and the dots, and nothing else. A row, not a
           heading — the open card's name is the page's only exercise heading,
           which is how both screen-reader users and the tests find it. */
        <button
          type="button"
          onClick={openByTap}
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
      )}

      {/* The body opens and closes rather than swapping in and out, so the
          cards below slide instead of jumping by a card's height. It is
          unmounted once closed; what it shows lives in this component, so a
          number set and not logged yet survives the collapse — re-seeding it
          from history on the way back would silently change it. */}
      <Collapse open={open} onOpened={reveal ? bringIntoView : undefined}>
        <div className="flex flex-col gap-2 pt-2">
          {plates || entryMode === 'ruler' ? (
            <>
              {weightControl}
              {how}
              {entryMode === 'ruler' ? repsControl : captioned(tr.t('common.reps'), repsControl)}
            </>
          ) : (
            <>
              <div className="flex items-end gap-2">
                {captioned(unit, weightControl)}
                {captioned(tr.t('common.reps'), repsControl)}
              </div>
              {how}
            </>
          )}

          {/* Kept visible rather than tucked behind a tap. The estimate behind
              the strength score and every chart reads it — a set at
              nothing-left and a set with three to spare are different
              measurements — and anything hidden gets left at its default,
              which would quietly feed that estimate a guess every set. */}
          <Segmented
            value={rir}
            onChange={setRir}
            options={EFFORTS.map((v) => ({
              value: v as number,
              label: tr.t(`effort.${v}s` as Key),
            }))}
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
        </div>
      </Collapse>

      {open && detail && <ExerciseSheet exercise={exercise} onClose={() => setDetail(false)} />}
    </Card>
  );
}
