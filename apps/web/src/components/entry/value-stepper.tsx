'use client';

/**
 * `[−] 60 kg [+]` — the Buttons way of setting a number on Train, and the
 * default.
 *
 * It replaces a stepper whose middle was a number input, which is to say the
 * phone's keyboard: tapping the number to fix it slid the keyboard up and the
 * card jumped out from under the thumb. The middle is now a button that opens
 * gymmy's own keypad, and the `−`/`+` either side do what they always did.
 *
 * The `−`/`+` are real buttons rather than a swipeable number because they are
 * what a screen reader can actually drive: TalkBack cannot adjust a custom
 * spinbutton, so a control that only responded to gestures would leave a blind
 * lifter with the keypad as the only way in.
 */

import { useId, useState } from 'react';
import { formatOnScale } from '@athletic/domain';
import { useT } from '@/lib/client/hooks';
import { Keypad, formatAmount } from './keypad';

const side =
  'grid h-[var(--spacing-tap)] cursor-pointer place-items-center rounded-[11px] border border-[var(--color-line)] ' +
  'bg-[var(--color-surface-2)] text-xl font-semibold press ' +
  'disabled:cursor-not-allowed disabled:opacity-40';

export interface ValueStepperProps {
  value: number | null;
  onChange: (v: number) => void;
  /** What one tap of `−` or `+` moves by — `buttonStep` for a weight, 1 for reps. */
  step: number;
  /**
   * The reach of `−` and `+`, and only of them.
   *
   * A typed number is kept as typed even outside it, because a number somebody
   * typed is what they lifted; the keypad has no minus key, so it is never
   * negative, and `logSet` holds the rest of the line. And a value that is
   * already outside is never pushed the wrong way by a tap: `−` on a number
   * below `min` does nothing rather than jump up to it.
   */
  min: number;
  max: number;
  /** Which number this is. Picks the words the buttons and the keypad use. */
  label: 'weight' | 'reps';
  /** Shown after the number; empty for reps. */
  unit: string;
  /** Id of the note that says what the number means — the load caption. */
  describedBy?: string;
  /** The middle button's name: "Type weight", "Type reps". Every control on the
   *  card has one, which is what lets a test reach the keypad in any mode. */
  typeLabel: string;
  /** Whether the keypad's point key works. */
  decimals: boolean;
  /**
   * The decimals the number is written with — `scalePlaces` of the ruler's
   * stops for the same lift — so 60.0 on the ruler is 60.0 here too, and the
   * number keeps its shape as `−` and `+` move it. Without it, a number is
   * written at its own length.
   */
  places?: number;
  /**
   * What nothing reads as, when nothing is a real answer — "None" for the
   * weight on a bodyweight lift, where 0 and empty both mean no added weight.
   * Without it an empty value shows as a dash and 0 as 0.
   */
  noneLabel?: string;
}

export function ValueStepper({
  value,
  onChange,
  step,
  min,
  max,
  label,
  unit,
  describedBy,
  typeLabel,
  decimals,
  places,
  noneLabel,
}: ValueStepperProps) {
  const tr = useT();
  const valueId = useId();
  /** Set while the keypad is open, to the button that opened it. */
  const [opener, setOpener] = useState<HTMLElement | null>(null);

  const word = tr.t(label === 'weight' ? 'entry.weight' : 'entry.reps');
  /* Lower case in the buttons' names: a screen reader does not voice case, and
     it keeps the English names "weight −" and "reps +" that people and tests
     already address these buttons by. */
  const spoken = word.toLocaleLowerCase(tr.lang);

  const current = value ?? 0;
  const empty = value === null || (noneLabel !== undefined && value === 0);
  const shown = empty
    ? (noneLabel ?? '—')
    : places === undefined
      ? formatAmount(current)
      : formatOnScale(current, places);
  // Heard as anybody would say it: "60 kg", not "60.0 kg".
  const said = empty ? shown : formatAmount(current);

  const bump = (dir: 1 | -1) => {
    const next = Math.round((current + dir * step) * 100) / 100;
    // Bounded by the range or by where it already is, whichever is wider.
    const lo = Math.min(min, current);
    const hi = Math.max(max, current);
    onChange(Math.min(hi, Math.max(lo, next)));
  };

  return (
    <div className="grid grid-cols-[var(--spacing-tap)_minmax(0,1fr)_var(--spacing-tap)] items-center gap-1.5">
      <button
        type="button"
        aria-label={tr.t('entry.less', { label: spoken })}
        disabled={current <= min}
        onClick={() => bump(-1)}
        className={side}
      >
        −
      </button>
      <button
        type="button"
        aria-label={typeLabel}
        // The value itself, then what it means. The name stays the plain
        // "Type weight" so it is addressable, and the number is still heard.
        aria-describedby={describedBy ? `${valueId} ${describedBy}` : valueId}
        // For tests: the number without the unit or the "None".
        data-value={value ?? ''}
        onClick={(e) => setOpener(e.currentTarget)}
        /* A size container, so the number can shrink with the space it has.
           Two of these share a card's width on Train, and at 360 px the
           middle is barely three digits wide. */
        className="press @container flex min-h-[var(--spacing-tap)] w-full min-w-0 cursor-pointer items-center justify-center rounded-[11px] border border-[var(--color-line)] bg-[var(--color-surface-2)] px-1"
      >
        <span aria-hidden className="flex min-w-0 items-baseline justify-center gap-1">
          <span className="num text-[length:min(17px,36cqi)] font-semibold whitespace-nowrap">
            {shown}
          </span>
          {unit && !empty && (
            /* Dropped when it would crowd the number: the unit is in the
               caption above and in what a screen reader hears. */
            <span className="text-xs font-semibold text-[var(--color-muted)] @max-[4.5rem]:hidden">
              {unit}
            </span>
          )}
        </span>
      </button>
      <button
        type="button"
        aria-label={tr.t('entry.more', { label: spoken })}
        disabled={current >= max}
        onClick={() => bump(1)}
        className={side}
      >
        +
      </button>
      <span id={valueId} className="sr-only">
        {empty || !unit ? said : `${said} ${unit}`}
      </span>
      <Keypad
        open={opener !== null}
        opener={opener}
        title={word}
        unit={unit}
        value={value}
        places={places}
        decimals={decimals}
        onDone={onChange}
        onClose={() => setOpener(null)}
      />
    </div>
  );
}
