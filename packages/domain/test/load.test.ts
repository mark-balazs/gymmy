import { describe, expect, it } from 'vitest';
import {
  CATALOGUE,
  EXERCISE_LOADS,
  LOAD_CONVENTION_FROM,
  LOAD_RULES,
  addDays,
  conventionChanged,
  loadClassOf,
  loadRuleOf,
  toEntered,
  toStored,
  type LoadClass,
} from '../src';

/**
 * The convention is the one piece of this app that changes what a stored number
 * *means*, so it is the one place where a quiet mistake is unrecoverable: a row
 * written under the wrong factor cannot be told apart from a correct one later.
 * These tests are mostly about that — exactness, coverage, and the direction of
 * the multiplication.
 */
describe('load conventions', () => {
  it('classifies every catalogue exercise, retired ones included, and nothing else', () => {
    /* Both directions. A missing entry would silently fall back to "one
       implement, stored as typed" — the safe default, but a wrong answer
       presented as confidently as a right one. A stale entry is the reverse
       problem: it describes a movement that is not in the catalogue at all,
       and it would outlive the rename that orphaned it.

       Held to the catalogue, not to the seeded view of it. A retired exercise
       keeps its chart, so it keeps its class: held to the seeded list, the
       first legal retirement failed here, and the way back to green was
       deleting the class — which reads a pair's ×2 history back at ÷1. */
    const catalogued = CATALOGUE.map((c) => c.name).sort();
    expect(Object.keys(EXERCISE_LOADS).sort()).toEqual(catalogued);
  });

  it('doubles a pair of dumbbells and nothing else', () => {
    // The entire factor-of-two decision, in one assertion. Every other class
    // stores exactly what was typed, so this is the only place a number moves.
    const doubling = (Object.keys(LOAD_RULES) as LoadClass[]).filter(
      (k) => LOAD_RULES[k].factor === 2,
    );
    expect(doubling).toEqual(['dumbbellPair']);

    expect(toStored('DB Bench Press', 30)).toBe(60);
    expect(toStored('Barbell Bench Press', 60)).toBe(60);
    expect(toStored('DB Row', 30)).toBe(30);
    expect(toStored('Goblet Squat', 24)).toBe(24);
  });

  it('round-trips exactly, in both orders', () => {
    /* Not a nicety. The Train card prefills from history and logs again, so an
       inexact pair would walk a weight downwards a little every session — a
       drift with no event anywhere to explain it. Integers and halves because
       those are the numbers plates and dumbbells come in. */
    for (const name of ['DB Bench Press', 'Barbell Bench Press', 'Lat Pulldown']) {
      for (const v of [0, 2.5, 7.5, 20, 22.5, 47.5, 100, 137.5]) {
        expect(toEntered(name, toStored(name, v))).toBe(v);
        expect(toStored(name, toEntered(name, v))).toBe(v);
      }
    }
  });

  it('passes null through rather than turning it into a zero', () => {
    // An empty weight box is "not said", the same as everywhere else in this
    // app. Zero would be a claim that the movement was done unloaded.
    expect(toStored('DB Bench Press', null)).toBeNull();
    expect(toEntered('DB Bench Press', null)).toBeNull();
  });

  it('refuses to call a stack setting a mass', () => {
    /* The honest half, and the one with teeth in it: these numbers must never
       reach anything absolute or anything that compares two people. McMillin
       2024 measured -48% to +70% at the handle of a single machine across one
       stroke, so the pin number is a position, not a kilogram. */
    expect(loadRuleOf('Lat Pulldown').mass).toBe(false);
    expect(loadRuleOf('Leg Press').mass).toBe(false);
    expect(loadRuleOf('Cable Curl').mass).toBe(false);
    // Nor a sled's load, which is fought by friction we never measure, nor a
    // landmine's sleeve, which reaches the hands as a fraction set by the angle.
    expect(loadRuleOf('Sled Push').mass).toBe(false);
    expect(loadRuleOf('Landmine Press').mass).toBe(false);
    // And bodyweight, where the entered number is only what was added.
    expect(loadRuleOf('Pull-Up').mass).toBe(false);

    // Free weights are, which is the whole point of drawing the line here.
    expect(loadRuleOf('Barbell Bench Press').mass).toBe(true);
    expect(loadRuleOf('DB Bench Press').mass).toBe(true);
  });

  it('treats an unknown exercise as one implement, stored as typed', () => {
    // The fallback has to be the class that changes nothing: a name we do not
    // recognise is the one case where doubling would be pure invention.
    expect(loadClassOf('Something We Have Never Heard Of')).toBe('dumbbellOne');
    expect(toStored('Something We Have Never Heard Of', 30)).toBe(30);
  });

  it('splits the carries by how many implements they use', () => {
    /* The reason the class is per exercise and not per equipment type. "A
       dumbbell number means both" would define every one of these wrongly, and
       the library has both kinds side by side under one pattern. */
    expect(loadClassOf("Farmer's Carry")).toBe('dumbbellPair');
    expect(loadClassOf('Suitcase Carry')).toBe('dumbbellOne');
    expect(loadClassOf('Overhead Carry')).toBe('dumbbellPair');
    expect(loadClassOf("Waiter's Walk")).toBe('dumbbellOne');
    // Same split on the rows: one hand supported, one dumbbell.
    expect(loadClassOf('DB Row')).toBe('dumbbellOne');
    expect(loadClassOf('Chest-Supported Row')).toBe('dumbbellPair');
  });

  /** Sessions a week apart, straddling the cutover, at the given values. Real
   *  dates: string-built ones ran to a 2026-09-31 that no calendar has. */
  const around = (before: number[], after: number[]) => [
    ...before.map((value, i) => ({ date: addDays('2026-08-10', 7 * i), value })),
    ...after.map((value, i) => ({ date: addDays('2026-09-17', 7 * i), value })),
  ];

  it('speaks when a pair of dumbbells steps up across the cutover', () => {
    // Entered per hand before, stored doubled after: the step the convention
    // makes, and the one somebody reading the chart deserves an explanation for.
    expect(conventionChanged('DB Bench Press', around([30, 30, 31], [60, 62, 62]))).toBe(true);
    // The cutover day itself is on the new side: a session logged that day was
    // logged doubled.
    expect(
      conventionChanged('DB Bench Press', [
        { date: '2026-09-10', value: 30 },
        { date: '2026-09-17', value: 60 },
      ]),
    ).toBe(true);
    // And that day is the one the docs name. Nothing else fails if it moves.
    expect(LOAD_CONVENTION_FROM).toBe('2026-09-17');
  });

  it('needs the later sessions at least half as high again', () => {
    /* The rule as written down, pinned on the line itself. A step from 40 to 60
       is exactly half as high again and is the convention's; 59 is not. Any
       looser bracket let a threshold of 1.2 or 2.0, or a strict comparison,
       through. */
    expect(conventionChanged('DB Bench Press', around([40, 40, 40], [60, 60, 60]))).toBe(true);
    expect(conventionChanged('DB Bench Press', around([40, 40, 40], [59, 59, 59]))).toBe(false);
  });

  it('says nothing when the dates cross but nothing jumped', () => {
    /* The case the first version got wrong. It answered yes for any history
       that merely crossed the date, and promised the demo "correctly says
       nothing" because its generated past sat on one side — which held for four
       days, until the demo's history, dated relative to today, crossed too. The
       demo is generated under the new convention throughout, and so is anybody
       who already entered both dumbbells: there is no step to explain. */
    expect(conventionChanged('DB Bench Press', around([60, 61, 62], [62, 63, 64]))).toBe(false);
    // Ordinary progress is not the convention either, however good a week.
    expect(conventionChanged('DB Bench Press', around([50, 52, 54], [58, 60, 62]))).toBe(false);
  });

  it('needs sessions on both sides to say anything', () => {
    expect(conventionChanged('DB Bench Press', around([30, 30], []))).toBe(false);
    expect(conventionChanged('DB Bench Press', around([], [60, 60]))).toBe(false);
    expect(conventionChanged('DB Bench Press', [])).toBe(false);
  });

  it('says nothing about a class whose meaning never moved', () => {
    /* Exactly one class changed meaning, so exactly one class can show the
       step. A barbell was always the bar and the plates, and a single dumbbell
       was always one — so even a genuine doubling on one of those is training,
       or a typo, and never the convention. */
    for (const name of ['Barbell Bench Press', 'DB Row', 'Lat Pulldown', 'Pull-Up']) {
      expect(conventionChanged(name, around([30, 30, 30], [60, 60, 60]))).toBe(false);
    }
  });
});
