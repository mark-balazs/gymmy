import { describe, expect, it } from 'vitest';
import {
  BAR_CHOICES,
  BAR_WEIGHTS,
  EXERCISE_LOADS,
  LOAD_RULES,
  PLATES,
  REPS_SCALE,
  barWeightOf,
  buttonStep,
  loadClassOf,
  plateTotal,
  platesFor,
  scaleValues,
  startReps,
  startWeight,
  weightScale,
  type LoadClass,
  type Unit,
} from '../src';

/**
 * The controls that replaced the number inputs on Train are only as honest as
 * the numbers under them. Two properties matter more than any single figure:
 * **nothing the person already has is snapped to something else**, and **the
 * total on a picture of the bar is exactly the bar plus both sides**. Most of
 * what follows is one or the other.
 */

const CLASSES = Object.keys(LOAD_RULES) as LoadClass[];
const UNITS: Unit[] = ['kg', 'lb'];
/** Every seeded exercise that is loaded on a bar. */
const BARBELLS = Object.entries(EXERCISE_LOADS)
  .filter(([, cls]) => cls === 'barbell')
  .map(([name]) => name);

describe('entry scales', () => {
  it('reaches what each class is trained with, per unit', () => {
    /* The table from the brief, written out so a change to it is a change to
       this test. Entered units throughout — per hand for a pair. */
    const table: Record<LoadClass, Record<Unit, [number, number, number]>> = {
      barbell: { kg: [20, 300, 2.5], lb: [45, 660, 5] },
      dumbbellPair: { kg: [1, 60, 1], lb: [5, 150, 5] },
      dumbbellOne: { kg: [1, 80, 1], lb: [5, 175, 5] },
      machine: { kg: [0, 300, 2.5], lb: [0, 660, 5] },
      bodyweight: { kg: [0, 80, 2.5], lb: [0, 180, 5] },
      partial: { kg: [0, 300, 2.5], lb: [0, 660, 5] },
    };
    for (const cls of CLASSES) {
      for (const unit of UNITS) {
        const [min, max, step] = table[cls][unit];
        expect(weightScale(cls, unit), `${cls} ${unit}`).toEqual({ min, max, step });
      }
    }
    expect(REPS_SCALE).toEqual({ min: 1, max: 50, step: 1 });
  });

  it('ends every ruler on a tick, inside what logSet will store', () => {
    /* A range whose top is not a whole number of steps from its bottom would
       leave the last tick short of the stated max. And a ruler that could reach
       past `logSet`'s clamps (0–2000 stored, 0–1000 reps) would offer a number
       the write layer then quietly changes — the pair doubles on the way in, so
       its per-hand ceiling is what has to fit. */
    for (const cls of CLASSES) {
      for (const unit of UNITS) {
        const s = weightScale(cls, unit);
        const ticks = (s.max - s.min) / s.step;
        expect(Number.isInteger(ticks), `${cls} ${unit}`).toBe(true);
        expect(s.min).toBeGreaterThanOrEqual(0);
        expect(s.max * LOAD_RULES[cls].factor).toBeLessThanOrEqual(2000);
      }
    }
    expect(REPS_SCALE.min).toBeGreaterThanOrEqual(0);
    expect(REPS_SCALE.max).toBeLessThanOrEqual(1000);
  });

  it('starts the barbell ruler on the standard bar', () => {
    // Nothing loaded on a standard bar weighs less than the bar.
    for (const unit of UNITS) expect(weightScale('barbell', unit).min).toBe(barWeightOf('', unit));
  });

  it('starts a barbell ruler on the bar actually in use', () => {
    /* A lighter bar must not leave its own weight as a lone stop under a ruler
       that starts at 20: on a 10 kg EZ bar, 12.5 to 17.5 is where most people
       curl. The top and the step stay; every tick still loads exactly. */
    for (const unit of UNITS) {
      const standard = weightScale('barbell', unit);
      for (const bar of BAR_CHOICES[unit]) {
        const s = weightScale('barbell', unit, bar);
        expect(s, `${bar} ${unit}`).toEqual({ ...standard, min: bar });
        expect(Number.isInteger((s.max - s.min) / s.step), `${bar} ${unit}`).toBe(true);
        for (const total of scaleValues(s)) {
          expect(platesFor(total, bar, unit).leftover, `${total} on ${bar} ${unit}`).toBe(0);
        }
      }
    }
    const curl = scaleValues(weightScale('barbell', 'kg', barWeightOf('Preacher Curl', 'kg')));
    expect(curl.slice(0, 4)).toEqual([10, 12.5, 15, 17.5]);
  });

  it('gives a bar only to a barbell', () => {
    for (const cls of CLASSES.filter((c) => c !== 'barbell')) {
      for (const unit of UNITS) {
        expect(weightScale(cls, unit, 10), `${cls} ${unit}`).toEqual(weightScale(cls, unit));
      }
    }
    // And a bar that is not a weight changes nothing.
    for (const bar of [0, NaN, Infinity]) {
      expect(weightScale('barbell', 'kg', bar)).toEqual(weightScale('barbell', 'kg'));
    }
  });
});

describe('scaleValues', () => {
  it('is the grid, first tick to last', () => {
    const kg = scaleValues(weightScale('barbell', 'kg'));
    expect(kg[0]).toBe(20);
    expect(kg[1]).toBe(22.5);
    expect(kg.at(-1)).toBe(300);
    expect(kg).toHaveLength(113);

    const lb = scaleValues(weightScale('barbell', 'lb'));
    expect(lb.slice(0, 3)).toEqual([45, 50, 55]);
    expect(lb.at(-1)).toBe(660);
    expect(lb).toHaveLength(124);

    expect(scaleValues(REPS_SCALE)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
  });

  it('keeps a number that is off the grid instead of snapping it', () => {
    /* The whole reason extras exist. A 61.25 from the keypad and a 12.5 kg
       dumbbell on a one-kilo ruler are both real numbers somebody lifted;
       moving either to the nearest tick would change a pre-filled weight
       without anybody touching it. */
    const bar = scaleValues(weightScale('barbell', 'kg'), 61.25);
    expect(bar).toContain(61.25);
    expect(bar.indexOf(61.25)).toBe(bar.indexOf(60) + 1);
    expect(bar.indexOf(62.5)).toBe(bar.indexOf(61.25) + 1);

    const pair = scaleValues(weightScale('dumbbellPair', 'kg'), 12.5);
    expect(pair.slice(10, 14)).toEqual([11, 12, 12.5, 13]);

    const reps = scaleValues(REPS_SCALE, 7.5);
    expect(reps).toContain(7.5);
  });

  it('keeps a number past either end instead of clamping it', () => {
    // A 10 kg EZ bar sits under a ruler that starts at 20, and a 320 kg
    // deadlift over one that stops at 300. Both stay, in order.
    const v = scaleValues(weightScale('barbell', 'kg'), 10, 320);
    expect(v[0]).toBe(10);
    expect(v[1]).toBe(20);
    expect(v.at(-2)).toBe(300);
    expect(v.at(-1)).toBe(320);
    // Sixty reps is a keypad entry, and the ruler still has it afterwards.
    expect(scaleValues(REPS_SCALE, 60).at(-1)).toBe(60);
  });

  it('holds each value once, ascending', () => {
    // The current value and last time's are usually the same number, and
    // usually on the grid. Neither may become a second stop.
    const grid = scaleValues(weightScale('machine', 'kg'));
    expect(scaleValues(weightScale('machine', 'kg'), 60, 60, 20)).toEqual(grid);
    const v = scaleValues(weightScale('machine', 'kg'), 61.25, 61.25, 1.3);
    expect(v).toHaveLength(grid.length + 2);
    expect(v).toEqual([...v].sort((a, b) => a - b));
    expect(new Set(v).size).toBe(v.length);
  });

  it('rounds to two decimals, so arithmetic noise is not a new stop', () => {
    /* 0.1 × 3 is 0.30000000000000004 in floating point. Unrounded, a value
       computed that way and the grid's 0.3 would be two stops a hair apart. */
    const tenths = scaleValues({ min: 0, max: 1, step: 0.1 });
    expect(tenths).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]);
    expect(scaleValues({ min: 0, max: 1, step: 0.1 }, 0.1 + 0.2)).toEqual(tenths);
    expect(scaleValues(REPS_SCALE, 61.254).at(-1)).toBe(61.25);
    expect(scaleValues(REPS_SCALE, 61.256).at(-1)).toBe(61.26);
  });

  it('skips an extra that is not a number', () => {
    // An empty card and an exercise with no history pass null; neither is a
    // weight of zero.
    const grid = scaleValues(weightScale('dumbbellOne', 'lb'));
    expect(scaleValues(weightScale('dumbbellOne', 'lb'), null, undefined, NaN, Infinity)).toEqual(
      grid,
    );
    expect(grid[0]).toBe(5);
  });
});

describe('buttonStep', () => {
  it('moves by the next thing you would load', () => {
    const kg: Record<LoadClass, number> = {
      barbell: 2.5,
      dumbbellPair: 2,
      dumbbellOne: 2,
      machine: 2.5,
      bodyweight: 2.5,
      partial: 2.5,
    };
    for (const cls of CLASSES) {
      expect(buttonStep(cls, 'kg'), cls).toBe(kg[cls]);
      expect(buttonStep(cls, 'lb'), cls).toBe(5);
    }
    expect(REPS_SCALE.step).toBe(1);
  });

  it('is one pair of the smallest plates on a barbell', () => {
    /* The step and the plate list have to agree, or a tap on + gives a total
       the picture of the bar cannot draw. */
    for (const unit of UNITS) {
      expect(buttonStep('barbell', unit)).toBe(2 * Math.min(...PLATES[unit]));
      expect(weightScale('barbell', unit).step).toBe(buttonStep('barbell', unit));
    }
  });
});

describe('plates and bars', () => {
  it('lists the plates heaviest first, in both units', () => {
    expect(PLATES.kg).toEqual([25, 20, 15, 10, 5, 2.5, 1.25]);
    expect(PLATES.lb).toEqual([45, 35, 25, 10, 5, 2.5]);
    for (const unit of UNITS) {
      expect([...PLATES[unit]]).toEqual([...PLATES[unit]].sort((a, b) => b - a));
    }
  });

  it('knows the bar for the exercises not done on a standard one', () => {
    expect(barWeightOf('Barbell Back Squat', 'kg')).toBe(20);
    expect(barWeightOf('Barbell Back Squat', 'lb')).toBe(45);
    expect(barWeightOf('Trap Bar Deadlift', 'kg')).toBe(25);
    expect(barWeightOf('Trap Bar Deadlift', 'lb')).toBe(55);
    expect(barWeightOf('Preacher Curl', 'kg')).toBe(10);
    expect(barWeightOf('Preacher Curl', 'lb')).toBe(25);
    // A name we do not know gets the standard bar, not a guess.
    expect(barWeightOf('Something We Have Never Heard Of', 'kg')).toBe(20);
    expect(barWeightOf('Something We Have Never Heard Of', 'lb')).toBe(45);
    expect(BAR_CHOICES).toEqual({ kg: [20, 15, 10, 25], lb: [45, 35, 25, 55] });
  });

  it('names only barbell exercises, and every odd bar is named', () => {
    /* Both directions, as load.test.ts does for the classes. One way: a name in
       the bar table must be a barbell exercise in the catalogue, or a rename
       leaves it describing nothing and the exercise silently falls back to a
       20 kg bar. The other: every catalogue exercise whose bar is not the
       standard one is in the table — nothing else decides a bar weight. */
    for (const name of Object.keys(BAR_WEIGHTS)) {
      expect(EXERCISE_LOADS[name], name).toBe('barbell');
    }
    for (const unit of UNITS) {
      const odd = Object.keys(EXERCISE_LOADS).filter(
        (name) => barWeightOf(name, unit) !== barWeightOf('', unit),
      );
      expect(odd.sort()).toEqual(Object.keys(BAR_WEIGHTS).sort());
      for (const name of odd) expect(loadClassOf(name), name).toBe('barbell');
    }
  });

  it('offers every default bar on the bar chip', () => {
    // Otherwise the chip would open with nothing selected on an exercise whose
    // bar we chose ourselves.
    for (const unit of UNITS) {
      for (const name of BARBELLS) expect(BAR_CHOICES[unit]).toContain(barWeightOf(name, unit));
    }
  });
});

describe('platesFor', () => {
  it('loads greedily, heaviest first, per side', () => {
    expect(platesFor(100, 20, 'kg')).toEqual({ perSide: [25, 15], leftover: 0 });
    expect(platesFor(60, 20, 'kg')).toEqual({ perSide: [20], leftover: 0 });
    expect(platesFor(142.5, 20, 'kg')).toEqual({ perSide: [25, 25, 10, 1.25], leftover: 0 });
    expect(platesFor(22.5, 20, 'kg')).toEqual({ perSide: [1.25], leftover: 0 });
    expect(platesFor(57.5, 20, 'kg')).toEqual({ perSide: [15, 2.5, 1.25], leftover: 0 });
    // The same total on a trap bar is five kilos less on the plates.
    expect(platesFor(105, 25, 'kg')).toEqual({ perSide: [25, 15], leftover: 0 });
  });

  it('is the empty bar, with nothing over, when the total is the bar', () => {
    expect(platesFor(20, 20, 'kg')).toEqual({ perSide: [], leftover: 0 });
  });

  it('is not thrown by a total a hair under what the plates make', () => {
    /* A number that has been through arithmetic elsewhere can arrive a few
       ulps short: 22.499999999999996 is 22.5 to anybody reading it. Compared
       exactly, the last 1.25 would not fit and the card would claim 1.25 a
       side "not in plates" on a bar that is plainly loaded. What is left is a
       plain zero, not -0 — which `toEqual` would tell apart. */
    const r = platesFor(22.499999999999996, 20, 'kg');
    expect(r).toEqual({ perSide: [1.25], leftover: 0 });
    expect(Object.is(r.leftover, 0)).toBe(true);
  });

  it('says what the plates cannot make, per side, at two decimals', () => {
    /* 61.25 from history on a 20 kg bar: 20.625 a side, of which the plates
       make 20. The card shows 61.25 and notes the rest; nothing snaps. */
    expect(platesFor(61.25, 20, 'kg')).toEqual({ perSide: [20], leftover: 0.63 });
    expect(platesFor(21, 20, 'kg')).toEqual({ perSide: [], leftover: 0.5 });
    expect(platesFor(101, 20, 'kg')).toEqual({ perSide: [25, 15], leftover: 0.5 });
  });

  it('goes negative below the bar, with no plates', () => {
    expect(platesFor(15, 20, 'kg')).toEqual({ perSide: [], leftover: -2.5 });
    expect(platesFor(0, 20, 'kg')).toEqual({ perSide: [], leftover: -10 });
    expect(platesFor(40, 45, 'lb')).toEqual({ perSide: [], leftover: -2.5 });
  });

  it('loads pounds from the pound plates', () => {
    expect(platesFor(135, 45, 'lb')).toEqual({ perSide: [45], leftover: 0 });
    expect(platesFor(225, 45, 'lb')).toEqual({ perSide: [45, 45], leftover: 0 });
    expect(platesFor(185, 45, 'lb')).toEqual({ perSide: [45, 25], leftover: 0 });
    expect(platesFor(155, 45, 'lb')).toEqual({ perSide: [45, 10], leftover: 0 });
    expect(platesFor(60, 45, 'lb')).toEqual({ perSide: [5, 2.5], leftover: 0 });
    // There is no 1.25 lb plate, so that much a side is left over.
    expect(platesFor(47.5, 45, 'lb')).toEqual({ perSide: [], leftover: 1.25 });
    // And no 15 or 20, so 20 a side is two tens.
    expect(platesFor(85, 45, 'lb')).toEqual({ perSide: [10, 10], leftover: 0 });
  });

  it('draws every tick of the barbell ruler exactly, on every bar offered', () => {
    /* The property that makes the picture trustworthy: for any total the ruler
       or the buttons can produce, on any bar the chip offers, the plates add
       back up to that total with nothing left over — no drift from the
       floating-point arithmetic of subtracting plates one at a time. */
    for (const unit of UNITS) {
      for (const bar of BAR_CHOICES[unit]) {
        for (const total of scaleValues(weightScale('barbell', unit))) {
          if (total < bar) continue;
          const { perSide, leftover } = platesFor(total, bar, unit);
          expect(leftover, `${total} on ${bar} ${unit}`).toBe(0);
          expect(plateTotal(perSide, bar), `${total} on ${bar} ${unit}`).toBe(total);
          expect(perSide).toEqual([...perSide].sort((a, b) => b - a));
        }
      }
    }
  });
});

describe('plateTotal', () => {
  it('is the bar plus both sides', () => {
    expect(plateTotal([], 20)).toBe(20);
    expect(plateTotal([25, 15], 20)).toBe(100);
    expect(plateTotal([1.25], 20)).toBe(22.5);
    expect(plateTotal([45, 45], 45)).toBe(225);
    expect(plateTotal([25, 15], 25)).toBe(105);
  });

  it('rounds to two decimals', () => {
    // 2 × (0.1 + 0.2) is 0.6000000000000001 unrounded.
    expect(plateTotal([0.1, 0.2], 0)).toBe(0.6);
  });
});

describe('where a card starts with no history', () => {
  it('starts each class on a plausible weight, per unit', () => {
    expect(startWeight('barbell', 'kg', 'Barbell Back Squat')).toBe(20);
    expect(startWeight('barbell', 'lb', 'Barbell Back Squat')).toBe(45);
    expect(startWeight('barbell', 'kg', 'Trap Bar Deadlift')).toBe(25);
    expect(startWeight('barbell', 'lb', 'Trap Bar Deadlift')).toBe(55);
    expect(startWeight('barbell', 'kg', 'Preacher Curl')).toBe(10);
    expect(startWeight('barbell', 'lb', 'Preacher Curl')).toBe(25);
    for (const cls of ['dumbbellPair', 'dumbbellOne'] as const) {
      expect(startWeight(cls, 'kg', 'DB Curl')).toBe(10);
      expect(startWeight(cls, 'lb', 'DB Curl')).toBe(20);
    }
    for (const cls of ['machine', 'partial'] as const) {
      expect(startWeight(cls, 'kg', 'Leg Press')).toBe(20);
      expect(startWeight(cls, 'lb', 'Leg Press')).toBe(45);
    }
    // Bodyweight starts on nothing added, which the card logs as null.
    expect(startWeight('bodyweight', 'kg', 'Pull-Up')).toBe(0);
    expect(startWeight('bodyweight', 'lb', 'Pull-Up')).toBe(0);
  });

  it('starts an unknown exercise as one implement', () => {
    const name = 'Something We Have Never Heard Of';
    expect(startWeight(loadClassOf(name), 'kg', name)).toBe(10);
    expect(startWeight(loadClassOf(name), 'lb', name)).toBe(20);
  });

  it('starts on a tick of its own ruler', () => {
    /* A start weight off the grid would be a number nobody chose sitting
       between two ticks. A barbell's ruler is the one on its own bar, as Train
       builds it, so an EZ bar's 10 kg is the ruler's first tick. */
    for (const [name, cls] of Object.entries(EXERCISE_LOADS)) {
      for (const unit of UNITS) {
        const w = startWeight(cls, unit, name);
        const ruler = scaleValues(weightScale(cls, unit, barWeightOf(name, unit)));
        expect(ruler.includes(w), `${name} ${unit}: ${w}`).toBe(true);
      }
    }
  });

  it('starts reps at the bottom of the plan range', () => {
    expect(startReps('6-12')).toBe(6);
    expect(startReps('10-15')).toBe(10);
    expect(startReps(' 8 - 10 ')).toBe(8);
    expect(startReps('12-15 reps')).toBe(12);
    // A finisher's range is metres, and it is read the same way.
    expect(startReps('30-40m')).toBe(30);
  });

  it('starts reps at eight when the range says nothing usable', () => {
    for (const r of ['', '8', 'AMRAP', 'max', '0-5', null, undefined]) {
      expect(startReps(r), String(r)).toBe(8);
    }
  });
});
