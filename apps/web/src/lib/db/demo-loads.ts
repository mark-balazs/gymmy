/**
 * What the demo account lifts, exercise by exercise.
 *
 * The first version of this assigned weights per *movement pattern*, which is
 * how a goblet squat ended up being logged at 90 kg and every chart in the app
 * came out as the same staircase. A goblet squat and a back squat are both the
 * squat pattern and their loads differ by three times; the pattern is the wrong
 * unit for this entirely.
 *
 * So: one entry per exercise, for a roughly 80 kg intermediate who has been
 * training a while. Numbers are chosen to be *unremarkable* — the point is that
 * nothing in the demo makes a lifter raise an eyebrow.
 *
 *   start   working weight in kilos on day one
 *   reps    the working rep target
 *   inc     the smallest jump available — 2.5 kg on a barbell, 2 kg on
 *           dumbbells, 5 kg on a stack, 1 kg on the small stuff
 *   gain    how much is added across the whole block, as a fraction. Heavy
 *           compounds move least: adding 20% to a five-month-old bench is
 *           already a good run, and the 100%+ the pattern-based version
 *           produced was fantasy.
 *   bw      fraction of bodyweight the movement carries, for the ones where the
 *           load *is* you. `start` is then the added weight, and `repGain` is
 *           how many reps are earned across the block — which is how these
 *           actually progress.
 *   arc     what happened to this lift over the block. Absent means it simply
 *           went up, which is the boring majority.
 *
 * The arc is the fix for a demo where nothing ever went wrong. Every lift used
 * to be `start × (1 + gain × curve(week))`, one shared monotone curve, so no
 * lift could stall, slide, appear late or be quietly dropped — and those are
 * precisely the four things the Progress page exists to point out. On the one
 * account we show people, its lead section had nothing to say.
 */

/**
 * How a lift went, beyond simply going up.
 *
 * This shapes what gets *logged* and nothing else. No arc is stored, synced or
 * read back: what lands in the database is ordinary set rows, indistinguishable
 * from sets a person typed in, and every number the Progress page shows is
 * derived from those rows the same way it is for a real account. A demo whose
 * charts were fed from a curve the app does not otherwise have would be a demo
 * of something we do not ship.
 */
export type DemoArc =
  /** Moved for a while, then stopped. The most common thing that happens to a
   *  lift, and the one the old generator could not produce at all. */
  | { kind: 'stall'; from: number }
  /** Peaked, went backwards — a tweak, a layoff, a technique reset — and is
   *  clawing its way back. */
  | { kind: 'regress'; peak: number; drop: number }
  /** Trained about two weeks in three, so the line has real gaps in it. */
  | { kind: 'irregular' }
  /** Not in the routine until partway through the block. */
  | { kind: 'late'; from: number }
  /** Still in the plan, but untouched for weeks. */
  | { kind: 'abandoned'; after: number };

export interface DemoLoad {
  start: number;
  reps: number;
  inc: number;
  gain: number;
  bw?: number;
  repGain?: number;
  arc?: DemoArc;
}

/** Fallbacks, by pattern, for anything not listed. */
export const BY_PATTERN: Record<string, DemoLoad> = {
  squat: { start: 60, reps: 8, inc: 2.5, gain: 0.2 },
  hinge: { start: 80, reps: 6, inc: 2.5, gain: 0.2 },
  lunge: { start: 18, reps: 10, inc: 2, gain: 0.3 },
  push: { start: 45, reps: 8, inc: 2.5, gain: 0.2 },
  pull: { start: 50, reps: 10, inc: 2.5, gain: 0.22 },
  rotate: { start: 12, reps: 12, inc: 2.5, gain: 0.25 },
  carry: { start: 24, reps: 30, inc: 4, gain: 0.3 },
  isolation: { start: 12, reps: 12, inc: 2, gain: 0.3 },
};

export const DEMO_LOADS: Record<string, DemoLoad> = {
  /* ------------------------------------------------------------- squat -- */
  'Goblet Squat': { start: 28, reps: 10, inc: 2, gain: 0.28 },
  'Leg Press': { start: 160, reps: 10, inc: 10, gain: 0.25 },
  'Barbell Back Squat': { start: 95, reps: 5, inc: 2.5, gain: 0.11 },
  'Barbell Front Squat': { start: 70, reps: 5, inc: 2.5, gain: 0.12 },
  'Hack Squat': { start: 100, reps: 8, inc: 5, gain: 0.24 },
  'Zercher Squat': { start: 60, reps: 6, inc: 2.5, gain: 0.2 },
  'Box Squat': { start: 85, reps: 5, inc: 2.5, gain: 0.12 },
  'Smith Machine Squat': { start: 90, reps: 8, inc: 5, gain: 0.22 },

  /* ------------------------------------------------------------- hinge -- */
  'Romanian Deadlift': { start: 80, reps: 8, inc: 2.5, gain: 0.15 },
  'Conventional Deadlift': { start: 120, reps: 5, inc: 5, gain: 0.1 },
  'Trap Bar Deadlift': { start: 130, reps: 5, inc: 5, gain: 0.1 },
  'Hip Thrust': { start: 100, reps: 10, inc: 5, gain: 0.28 },
  'Good Morning': { start: 50, reps: 8, inc: 2.5, gain: 0.22 },
  'Back Extension': { start: 15, reps: 12, inc: 2.5, gain: 0.3 },
  'Kettlebell Swing': { start: 24, reps: 15, inc: 4, gain: 0.33 },
  'Single-Leg RDL': { start: 20, reps: 10, inc: 2, gain: 0.3 },
  'Cable Pull-Through': { start: 35, reps: 12, inc: 5, gain: 0.28 },

  /* ------------------------------------------------------------- lunge -- */
  'Walking Lunge': { start: 20, reps: 10, inc: 2, gain: 0.3 },
  'Reverse Lunge': {
    start: 20,
    reps: 10,
    inc: 2,
    // Enough rungs on the rack that the slide below has somewhere to land: at
    // four dumbbells' worth of range a 'regression' is one pair of bells.
    gain: 0.35,
    // Something went in the knee around week thirteen.
    arc: { kind: 'regress', peak: 13, drop: 0.6 },
  },
  'Bulgarian Split Squat': { start: 16, reps: 8, inc: 2, gain: 0.35 },
  'Step-Up': {
    start: 16,
    reps: 10,
    inc: 2,
    gain: 0.35,
    // Added to the routine two months in, so its line starts mid-chart.
    arc: { kind: 'late', from: 14 },
  },
  'Split Squat': { start: 20, reps: 8, inc: 2, gain: 0.3 },
  'Curtsy Lunge': { start: 14, reps: 10, inc: 2, gain: 0.35 },
  'Lateral Lunge': { start: 14, reps: 10, inc: 2, gain: 0.35 },

  /* -------------------------------------------------------------- push -- */
  'DB Bench Press': { start: 26, reps: 8, inc: 2, gain: 0.25 },
  'Barbell Bench Press': {
    start: 70,
    reps: 5,
    inc: 2.5,
    gain: 0.12,
    // Ran for two and a half months and then sat there. Everybody's bench.
    arc: { kind: 'stall', from: 10 },
  },
  'Overhead Press': { start: 45, reps: 5, inc: 2.5, gain: 0.12 },
  'DB Shoulder Press': { start: 20, reps: 8, inc: 2, gain: 0.28 },
  'Incline DB Press': { start: 22, reps: 8, inc: 2, gain: 0.27 },
  'Machine Chest Press': { start: 60, reps: 10, inc: 5, gain: 0.25 },
  'Landmine Press': { start: 30, reps: 8, inc: 2.5, gain: 0.27 },
  // The load is you. Reps are where the progress shows.
  'Push-Up': { start: 0, reps: 12, inc: 2.5, gain: 0, bw: 0.65, repGain: 9 },
  Dip: { start: 0, reps: 8, inc: 2.5, gain: 0, bw: 1, repGain: 6 },

  /* -------------------------------------------------------------- pull -- */
  'Lat Pulldown': { start: 60, reps: 10, inc: 5, gain: 0.25 },
  'Seated Cable Row': { start: 60, reps: 10, inc: 5, gain: 0.25 },
  'Barbell Row': { start: 60, reps: 8, inc: 2.5, gain: 0.15 },
  'DB Row': { start: 28, reps: 10, inc: 2, gain: 0.25 },
  'Chest-Supported Row': {
    start: 25,
    reps: 10,
    inc: 2,
    gain: 0.25,
    // The one that gets skipped when the session runs long.
    arc: { kind: 'irregular' },
  },
  'Face Pull': { start: 25, reps: 15, inc: 2.5, gain: 0.28 },
  'Pull-Up': { start: 0, reps: 6, inc: 2.5, gain: 0, bw: 1, repGain: 5 },
  'Chin-Up': { start: 0, reps: 7, inc: 2.5, gain: 0, bw: 1, repGain: 5 },
  'Inverted Row': { start: 0, reps: 12, inc: 2.5, gain: 0, bw: 0.6, repGain: 8 },

  /* ------------------------------------------------------------ rotate -- */
  'Pallof Press': { start: 15, reps: 12, inc: 2.5, gain: 0.25 },
  'Cable Woodchop': { start: 15, reps: 12, inc: 2.5, gain: 0.25 },
  'Landmine Rotation': { start: 20, reps: 10, inc: 2.5, gain: 0.25 },
  'Half-Kneeling Chop': { start: 12, reps: 12, inc: 2.5, gain: 0.25 },
  'Russian Twist': { start: 10, reps: 16, inc: 2, gain: 0.3 },
  // Weighted variations, which is what somebody two years in is doing.
  'Bird Dog': { start: 4, reps: 12, inc: 1, gain: 0.3 },
  'Dead Bug': { start: 5, reps: 12, inc: 1, gain: 0.3 },
  'Side Plank': { start: 8, reps: 10, inc: 2, gain: 0.3 },

  /* ------------------------------------------------------------- carry -- */
  // Reps are metres for these — the plan writes them as a 30-40m range.
  "Farmer's Carry": { start: 32, reps: 40, inc: 4, gain: 0.3 },
  'Suitcase Carry': { start: 28, reps: 40, inc: 4, gain: 0.28 },
  'Front Rack Carry': { start: 24, reps: 30, inc: 4, gain: 0.3 },
  'Overhead Carry': { start: 16, reps: 30, inc: 2, gain: 0.3 },
  'Sled Push': { start: 60, reps: 20, inc: 10, gain: 0.35 },
  'Sled Drag': { start: 50, reps: 20, inc: 10, gain: 0.35 },
  "Waiter's Walk": { start: 12, reps: 30, inc: 2, gain: 0.33 },

  /* --------------------------------------------------------- isolation -- */
  'Lateral Raise': { start: 8, reps: 14, inc: 1, gain: 0.35 },
  'Cable Curl': { start: 20, reps: 12, inc: 2.5, gain: 0.28 },
  'DB Curl': { start: 12, reps: 12, inc: 2, gain: 0.3 },
  'Hammer Curl': { start: 14, reps: 12, inc: 2, gain: 0.28 },
  'Tricep Pushdown': { start: 25, reps: 14, inc: 2.5, gain: 0.28 },
  'Overhead Tricep Extension': {
    start: 15,
    reps: 12,
    inc: 2.5,
    gain: 0.3,
    // Still on the plan. Has not been touched since week sixteen.
    arc: { kind: 'abandoned', after: 16 },
  },
  'Leg Extension': { start: 45, reps: 12, inc: 5, gain: 0.28 },
  'Leg Curl': { start: 40, reps: 12, inc: 5, gain: 0.28 },
  'Calf Raise': { start: 60, reps: 15, inc: 5, gain: 0.3 },
  'Cable Abduction': { start: 15, reps: 15, inc: 2.5, gain: 0.3 },
  'Glute Kickback': { start: 12, reps: 15, inc: 2, gain: 0.3 },
  'Rear Delt Fly': { start: 8, reps: 15, inc: 1, gain: 0.35 },
  'Chest Fly': { start: 14, reps: 12, inc: 2, gain: 0.28 },
};
