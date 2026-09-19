/**
 * The numbers behind setting a weight and a rep count without a keyboard.
 *
 * The Train card used to ask for both through number inputs, and on a phone a
 * number input means the system keyboard: it takes half the screen, it shoves
 * the card up to make room, and it does it between sets. So the card now sets
 * both numbers with its own controls — buttons, a ruler, or a picture of the
 * bar — and every one of them needs the same few facts: how far a number can
 * sensibly go, how big one step is, what plates a gym has, and what an empty
 * bar weighs.
 *
 * Those are facts about gyms and equipment, not about React, so they live here
 * where they can be tested without a browser.
 *
 * ## Every number here is an *entered* one
 *
 * Per dumbbell for a pair, as `load.ts` explains, because that is the number on
 * the handle. The conversion to what is stored happens at the card, exactly as
 * it did for the old inputs, so nothing below has to know about it.
 *
 * ## What none of this does
 *
 * **Change a number the person already has.** Every range and step here is a
 * convenience for moving a value, never a rule about which values are allowed.
 * A 61.25 in last week's history is shown as 61.25 even though no ruler tick
 * and no set of plates lands on it. `scaleValues` takes such numbers as extras
 * precisely so a control can show them rather than round them away. The keypad reaches anything, which is what lets a range stay short
 * enough to flick through.
 */

import type { LoadClass } from './load';
import type { Unit } from './types';

/* Which of the controls a person sees — `EntryMode` — is a profile setting, so
   it lives in `types.ts` with the rest of the profile's enums. */

/** A ruler's reach: its lowest and highest tick, and the distance between two. */
export interface EntryScale {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

/** Two decimal places, the resolution every number on the card is kept at.
 *  The trailing `+ 0` turns a `-0` into a plain zero, so a total that lands
 *  exactly on the bar has nothing left over rather than a signed nothing. */
const round2 = (v: number): number => Math.round(v * 100) / 100 + 0;

/**
 * How far the ruler reaches for each class, in each unit.
 *
 * **Every range is a trade.** A longer ruler reaches more people and costs
 * everybody more flicking: at a 2.5 kg step, each extra 100 kg is forty more
 * ticks to travel. So each range covers what people train with rather than
 * what the equipment could hold, and the keypad takes over past the ends.
 *
 * The pound scales are the kilo ones translated to what a pound gym stocks, not
 * converted to the decimal: a 45 lb bar, not 44.09.
 */
const WEIGHT_SCALES: Record<LoadClass, Record<Unit, EntryScale>> = {
  /* From the empty bar, because a loaded barbell cannot weigh less than its
     bar. The 2.5 kg step is the smallest change most gyms can make — a 1.25 kg
     plate, on both sides. 300 kg clears a strong deadlift with room to spare.
     In pounds: the 45 lb bar, a 2.5 lb plate a side, and 660, the 300 kg
     ceiling. The bottom here is the standard bar; `weightScale` moves it to the
     bar actually in use. */
  barbell: { kg: { min: 20, max: 300, step: 2.5 }, lb: { min: 45, max: 660, step: 5 } },
  /* Per hand. One kilo apart because a rack is: the light end goes 1, 2, 3, 4
     and the heavier end in twos, and a one-kilo ruler has every number either
     part of the rack uses. Sixty covers a commercial rack; a heavier pair is a
     keypad away. Pound racks go up in fives. */
  dumbbellPair: { kg: { min: 1, max: 60, step: 1 }, lb: { min: 5, max: 150, step: 5 } },
  /* The same rack with a higher ceiling: one implement held in both hands — a
     goblet squat, a swing — goes heavier than one in each hand, and kettlebells
     run on past the top of a dumbbell rack. */
  dumbbellOne: { kg: { min: 1, max: 80, step: 1 }, lb: { min: 5, max: 175, step: 5 } },
  /* From zero, because a sled or a carriage with nothing added is a real
     setting. Stacks differ machine to machine — 5 kg plates on one, 7 kg on
     another — and no single step lands on all of them, so this takes the
     barbell's fine one: a stack in fives is two ticks a plate, and anything
     odder is a keypad away. The top is a loaded leg press. */
  machine: { kg: { min: 0, max: 300, step: 2.5 }, lb: { min: 0, max: 660, step: 5 } },
  /* What you added to yourself, so zero is the usual answer and the default.
     80 kg on a belt is past what nearly anybody hangs for a set of pull-ups or
     dips; 2.5 kg is a small plate on the chain. */
  bodyweight: { kg: { min: 0, max: 80, step: 2.5 }, lb: { min: 0, max: 180, step: 5 } },
  /* Landmines, T-bars and sleds are loaded with ordinary plates, so they get
     the plate step and the machine's reach — a sled gets pushed with a lot on
     it. Zero for an empty sleeve or sled. */
  partial: { kg: { min: 0, max: 300, step: 2.5 }, lb: { min: 0, max: 660, step: 5 } },
};

/**
 * The ruler for a weight, by how the exercise is loaded.
 *
 * A barbell's ruler starts at `bar` when one is given — the bar picked on the
 * bar chip, or the one the exercise is usually done on — for the same reason
 * the table starts at the standard bar: nothing loaded on a bar weighs less
 * than the bar. Started at 20 regardless, a preacher curl on a 10 kg EZ bar
 * would have its empty bar as a lone stop under the ruler, and 12.5 to 17.5 —
 * where most people curl — reachable only by typing. Every other class has no
 * bar and ignores it.
 */
export function weightScale(cls: LoadClass, unit: Unit, bar?: number): EntryScale {
  const scale = WEIGHT_SCALES[cls][unit];
  return cls === 'barbell' && bar !== undefined && Number.isFinite(bar) && bar > 0
    ? { ...scale, min: bar }
    : scale;
}

/**
 * The ruler for reps. The same in both units, because a rep is a rep.
 *
 * One to fifty. Nobody logs a set of none, and past fifty a set is an endurance
 * test the keypad reaches faster than a flick would. It also has to hold a
 * finisher, whose "reps" are the metres of a carry: the plans program those at
 * thirty to forty.
 */
export const REPS_SCALE: EntryScale = { min: 1, max: 50, step: 1 };

/**
 * Every value a ruler stops at: the grid, plus the numbers it must not lose.
 *
 * The extras are the value on the card now and the value from last time. Both
 * can sit off the grid (a 61.25 from the keypad, a 12.5 kg dumbbell on a
 * one-kilo ruler) or past either end (a 15 kg set logged on a 20 kg bar, a
 * 320 kg deadlift typed on a ruler that stops at 300), and **both are added
 * rather than snapped**: a control that quietly moved
 * last week's number to the nearest tick would be changing the one thing the
 * card promises to carry over untouched. `null`, `undefined` and anything not
 * finite are skipped, so an empty card or an exercise with no history can be
 * passed as it is.
 *
 * Nothing is clamped either. The extras come from what the card holds and what
 * `logSet` stored, and both are already inside its limits.
 *
 * Ascending, without duplicates, at two decimal places — so a grid point and an
 * extra that are the same number stay one stop however each was computed.
 */
export function scaleValues(scale: EntryScale, ...extras: (number | null | undefined)[]): number[] {
  const out = new Set<number>();
  const n = Math.round((scale.max - scale.min) / scale.step);
  for (let i = 0; i <= n; i++) out.add(round2(scale.min + i * scale.step));
  for (const x of extras) {
    if (typeof x === 'number' && Number.isFinite(x)) out.add(round2(x));
  }
  return [...out].sort((a, b) => a - b);
}

/**
 * What one tap on `−` or `+` moves the weight by.
 *
 * The next thing you would actually load, so the usual change is a single tap.
 * For anything carrying plates that is the smallest pair of them — 1.25 kg a
 * side on a barbell — or one small plate on a belt, a sleeve or a stack, which
 * is two taps to the next 5 kg plate. Dumbbells go in twos because a kilo rack
 * does past its light end — 10, 12, 14 — so one tap is the next pair along.
 * Pound gyms go up in fives across the board: a 2.5 lb plate a side, and 5 lb
 * between dumbbells.
 *
 * Reps always move by one; that is `REPS_SCALE.step`.
 */
export function buttonStep(cls: LoadClass, unit: Unit): number {
  if (unit === 'lb') return 5;
  return cls === 'dumbbellPair' || cls === 'dumbbellOne' ? 2 : 2.5;
}

/**
 * The plates on offer for one side of a bar, heaviest first — the order you
 * reach for them.
 *
 * Kilos run from 25 down to 1.25, what a gym's plate tree holds: 50s are too
 * rare to offer, and the fractional change plates below 1.25 too rare to be
 * worth a button. Pounds are the iron a pound gym stocks — 45, 35, 25, 10, 5
 * and 2.5.
 */
export const PLATES: Record<Unit, readonly number[]> = {
  kg: [25, 20, 15, 10, 5, 2.5, 1.25],
  lb: [45, 35, 25, 10, 5, 2.5],
};

/**
 * The bars the bar chip offers, in the order it offers them.
 *
 * The men's Olympic bar first because it is the default, then the women's bar,
 * then a technique or EZ bar, then a trap bar; in pounds the same four bars in
 * the round figures a pound gym uses. The choice is remembered per exercise on
 * the device, not synced — it is a fact about somebody's gym, not a record of
 * training.
 */
export const BAR_CHOICES: Record<Unit, readonly number[]> = {
  kg: [20, 15, 10, 25],
  lb: [45, 35, 25, 55],
};

/** The bar most barbell work is done on. */
const DEFAULT_BAR: Record<Unit, number> = { kg: 20, lb: 45 };

/**
 * The exercises usually done on something other than a standard bar, by
 * catalogue name.
 *
 * Only two, and both are about the usual kit rather than certainties: trap bars
 * vary well either side of 25 kg and are rarely labelled, and a preacher curl
 * can be done on a straight bar. That is what the bar chip is for. Every name
 * here must be `barbell` in `EXERCISE_LOADS` — `entry.test.ts` checks it, so a
 * rename cannot orphan an entry and a bar cannot end up on a dumbbell.
 */
export const BAR_WEIGHTS: Record<string, Record<Unit, number>> = {
  'Trap Bar Deadlift': { kg: 25, lb: 55 },
  // An EZ bar, which is how the movement is usually set up.
  'Preacher Curl': { kg: 10, lb: 25 },
};

/** What the empty bar weighs for an exercise, before anybody picks otherwise.
 *  The standard bar for anything not listed, including a name we do not know. */
export const barWeightOf = (name: string, unit: Unit): number =>
  BAR_WEIGHTS[name]?.[unit] ?? DEFAULT_BAR[unit];

/** Slack for comparing a remainder against a plate. Totals are two-decimal
 *  numbers that binary floating point cannot hold exactly, so 61.25 − 20 can
 *  come out a hair under a plate that fits it. */
const EPSILON = 1e-9;

/**
 * The plates on each side that make up a total, as somebody would load them.
 *
 * Greedy, heaviest first, which is how people load a bar and, for these plate
 * sets, also the fewest plates. `leftover` is what is still missing **per
 * side** once the smallest plate is too big, at two decimal places. It is not
 * zero for two reasons, and the card says which rather than hiding either:
 *
 *  - **The total is not in plates** — 61.25 on a 20 kg bar is 20 a side and
 *    0.63 over, because the smallest plate is 1.25. The total stays 61.25.
 *  - **The total is below the bar** — the leftover is negative, and there are
 *    no plates at all.
 */
export function platesFor(
  total: number,
  bar: number,
  unit: Unit,
): { perSide: number[]; leftover: number } {
  let rest = (total - bar) / 2;
  const perSide: number[] = [];
  for (const p of PLATES[unit]) {
    while (rest >= p - EPSILON) {
      perSide.push(p);
      rest -= p;
    }
  }
  return { perSide, leftover: round2(rest) };
}

/** The total for the plates on one side: the bar, and both sides. */
export const plateTotal = (perSide: readonly number[], bar: number): number =>
  round2(bar + 2 * perSide.reduce((a, b) => a + b, 0));

/**
 * The weight a card starts on when there is no history for the exercise.
 *
 * Something plausible to adjust from, never a recommendation. The empty bar for
 * a barbell, because nothing loads lighter and it is where everybody starts. A
 * light dumbbell for either dumbbell class. A plate or two for a stack or a
 * sled. Nothing for bodyweight, which the card logs as no added weight. A
 * weight from history always wins; the card only asks this when there is none.
 */
export function startWeight(cls: LoadClass, unit: Unit, name: string): number {
  switch (cls) {
    case 'barbell':
      return barWeightOf(name, unit);
    case 'dumbbellPair':
    case 'dumbbellOne':
      return unit === 'kg' ? 10 : 20;
    case 'machine':
    case 'partial':
      return unit === 'kg' ? 20 : 45;
    case 'bodyweight':
      return 0;
  }
}

/** Where reps start when the plan gives nothing usable: the middle of the
 *  usual strength-and-size range. */
const DEFAULT_START_REPS = 8;

/**
 * The rep count a card starts on when there is no history: the bottom of the
 * plan's range.
 *
 * The bottom because it is the floor the set is meant to clear, and going up is
 * one tap. The range is read the way the coach reads it, so "6-12" starts at 6
 * and a finisher's "30-40m" at 30 — metres, which is what a carry's reps are.
 * Anything that does not read as a range, or reads as starting at zero, starts
 * at eight.
 */
export function startReps(repRange: string | null | undefined): number {
  const m = /(\d+)\s*-\s*(\d+)/.exec(repRange ?? '');
  const low = m ? Number(m[1]) : 0;
  return low > 0 ? low : DEFAULT_START_REPS;
}
