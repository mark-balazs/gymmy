/**
 * What the number in the weight box means, per exercise.
 *
 * The app has always asked for "weight" and never said what it was counting.
 * For a barbell that is nearly harmless — everyone means the bar plus the
 * plates. For two dumbbells it is a **factor of two**, and there is no way to
 * tell from a stored row which side of it the person was on. A dumbbell bench
 * press logged as 30 is either 30 or 60, and the app confidently drew a chart
 * through both readings.
 *
 * ## Where the convention comes from
 *
 * Not from us. The strength literature's rule is **total external mass lifted
 * as performed** — both dumbbells for a bilateral lift, one for a unilateral
 * one. Farias et al. 2017 (JSCR 31(7):1879-1887) state it verbatim: "the sum of
 * the 2 dumbbells combined". Heinecke et al. 2021 settle both halves in one
 * protocol, "unilateral (45.5 kg) and bilateral dumbbell (90.9 kg)". Every
 * same-subject dumbbell-to-barbell ratio in the literature sits at 0.79-0.93;
 * reading those dumbbell figures per-hand would put dumbbells at 1.45-1.73x the
 * barbell load, inverting the one thing this literature is unanimous about.
 *
 * Three qualifications, because the tidy version of that paragraph would be a
 * lie:
 *
 *  - **No standards body defines it.** Most papers state nothing at all.
 *    Neither CERT nor the Toigo & Boutellier descriptor set has an item for
 *    load accounting, so a paper can score full marks and still be ambiguous by
 *    2x. We are picking a convention and citing precedent, not inheriting one.
 *  - **Every consumer app uses the opposite one.** Strength Level mandates
 *    per-hand; Fitbod states per-hand across 303,494 sets; Strong assumes
 *    per-hand and doubles it. So people arrive already typing one dumbbell.
 *  - **"A dumbbell number means both" is wrong as a blanket rule.** It would
 *    define every single-arm row and suitcase carry in the library incorrectly,
 *    which is why the class is per exercise rather than per equipment type.
 *
 * So: **entered per dumbbell, because that is what people already do and what
 * they can read off the implement; stored combined, because that is what the
 * research means.** The conversion is arithmetic on a stated input, not a claim
 * about effective load.
 *
 * ## What a class does *not* license
 *
 * `mass` is the honest part, and it is false more often than is comfortable. A
 * machine's stack setting is not a mass: McMillin 2024 measured -48% to +70%
 * at the handle across a single stroke. A cable's pulley ratio is not readable
 * by the user and is not reported anywhere in the literature — "pulley ratio"
 * returns no exercise-science papers at all. A sled's resistance is surface
 * friction. A landmine's load at the hands is a fraction of the sleeve that
 * depends on the bar's angle. These numbers are worth logging and worth
 * charting against themselves; they are not worth summing with a barbell load,
 * and anything that compares people has to leave them out.
 *
 * Nothing here is stored per user. A convention is a fact about the movement,
 * not about somebody's account, so it is looked up from this table by name and
 * a correction ships with the code rather than needing a migration.
 */

/**
 * How an exercise is loaded — and therefore what one entered number means.
 *
 * This is the app's assumption about the usual way to load the movement, not a
 * claim that it is the only way. That is exactly why every class carries copy
 * that says out loud what to type: somebody doing walking lunges with one
 * kettlebell can see that we expected a dumbbell in each hand.
 */
export type LoadClass =
  /** Everything on the bar, the bar included. */
  | 'barbell'
  /** A dumbbell in each hand. Entered per dumbbell, stored combined. */
  | 'dumbbellPair'
  /** One implement, in one hand or both. Entered and stored as it is. */
  | 'dumbbellOne'
  /** A stack setting or a pin number. A position, not a mass. */
  | 'machine'
  /** You are the load. Anything entered is what you added to yourself. */
  | 'bodyweight'
  /** The implement carries part of the load to the floor or a pivot, so what
   *  you load is not what reaches your hands. */
  | 'partial';

export interface LoadRule {
  /** What one entered number is multiplied by on the way into storage. */
  readonly factor: 1 | 2;
  /**
   * Whether the stored number is an external mass in kilograms that can
   * honestly be compared with another exercise's, or summed with it.
   *
   * False does not mean "do not log it". Charting a stack setting against
   * itself is perfectly sound — the machine does not change between Tuesdays.
   * It means the number must not cross into anything absolute or anything that
   * compares one person with another.
   */
  readonly mass: boolean;
}

export const LOAD_RULES: Record<LoadClass, LoadRule> = {
  barbell: { factor: 1, mass: true },
  dumbbellPair: { factor: 2, mass: true },
  dumbbellOne: { factor: 1, mass: true },
  machine: { factor: 1, mass: false },
  bodyweight: { factor: 1, mass: false },
  partial: { factor: 1, mass: false },
};

/**
 * The class of every seeded exercise. `load.test.ts` asserts the two lists
 * agree, in both directions, so an exercise cannot be added without one and an
 * entry cannot outlive the exercise it describes.
 *
 * Where the movement is genuinely loaded more than one way, this records the
 * commoner version and the on-screen copy makes it checkable. The lunges are
 * the clearest case: a dumbbell in each hand is the default, and somebody
 * holding a single kettlebell will be told that is not what we assumed.
 */
export const EXERCISE_LOADS: Record<string, LoadClass> = {
  /* squat */
  'Goblet Squat': 'dumbbellOne',
  'Leg Press': 'machine',
  'Barbell Back Squat': 'barbell',
  'Barbell Front Squat': 'barbell',
  'Hack Squat': 'machine',
  'Zercher Squat': 'barbell',
  'Box Squat': 'barbell',
  // The carriage takes some of it and no study reports how much, so the plates
  // are not the load — the same problem as a landmine, on rails.
  'Smith Machine Squat': 'machine',

  /* hinge */
  'Romanian Deadlift': 'barbell',
  'Conventional Deadlift': 'barbell',
  // Hex bar mass is unstandardised and never reported: the two comparison
  // studies disagree by about 8% and neither states it. Still a mass, still
  // yours to compare with your own — just not to the kilo against somebody else.
  'Trap Bar Deadlift': 'barbell',
  'Hip Thrust': 'barbell',
  'Good Morning': 'barbell',
  'Back Extension': 'bodyweight',
  'Kettlebell Swing': 'dumbbellOne',
  'Single-Leg RDL': 'dumbbellOne',
  'Cable Pull-Through': 'machine',

  /* lunge */
  'Walking Lunge': 'dumbbellPair',
  'Reverse Lunge': 'dumbbellPair',
  'Bulgarian Split Squat': 'dumbbellPair',
  'Step-Up': 'dumbbellPair',
  'Split Squat': 'dumbbellPair',
  'Curtsy Lunge': 'dumbbellPair',
  // The one lunge usually held at the chest rather than at the sides.
  'Lateral Lunge': 'dumbbellOne',

  /* push */
  'DB Bench Press': 'dumbbellPair',
  'Barbell Bench Press': 'barbell',
  'Overhead Press': 'barbell',
  'DB Shoulder Press': 'dumbbellPair',
  'Incline DB Press': 'dumbbellPair',
  'Push-Up': 'bodyweight',
  Dip: 'bodyweight',
  'Machine Chest Press': 'machine',
  'Landmine Press': 'partial',

  /* pull */
  'Lat Pulldown': 'machine',
  'Pull-Up': 'bodyweight',
  'Chin-Up': 'bodyweight',
  'Seated Cable Row': 'machine',
  'Barbell Row': 'barbell',
  'DB Row': 'dumbbellOne',
  'Chest-Supported Row': 'dumbbellPair',
  'Face Pull': 'machine',
  'Inverted Row': 'bodyweight',

  /* rotate */
  'Pallof Press': 'machine',
  'Cable Woodchop': 'machine',
  'Landmine Rotation': 'partial',
  'Half-Kneeling Chop': 'machine',
  'Russian Twist': 'dumbbellOne',
  'Bird Dog': 'bodyweight',
  'Dead Bug': 'bodyweight',
  'Side Plank': 'bodyweight',

  /* carry */
  "Farmer's Carry": 'dumbbellPair',
  'Suitcase Carry': 'dumbbellOne',
  'Front Rack Carry': 'dumbbellPair',
  'Overhead Carry': 'dumbbellPair',
  'Sled Push': 'partial',
  'Sled Drag': 'partial',
  "Waiter's Walk": 'dumbbellOne',

  /* isolation */
  'Lateral Raise': 'dumbbellPair',
  'Cable Curl': 'machine',
  'DB Curl': 'dumbbellPair',
  'Hammer Curl': 'dumbbellPair',
  'Tricep Pushdown': 'machine',
  // One dumbbell in both hands, which is how the movement is taught.
  'Overhead Tricep Extension': 'dumbbellOne',
  'Leg Extension': 'machine',
  'Leg Curl': 'machine',
  'Calf Raise': 'bodyweight',
  'Cable Abduction': 'machine',
  'Glute Kickback': 'bodyweight',
  'Rear Delt Fly': 'dumbbellPair',
  'Chest Fly': 'dumbbellPair',
  /* added with the conventional gaps */
  'Bodyweight Squat': 'bodyweight',
  'DB Squat': 'dumbbellPair',
  'Sumo Deadlift': 'barbell',
  'Nordic Curl': 'bodyweight',
  'Barbell Reverse Lunge': 'barbell',
  'Close-Grip Bench Press': 'barbell',
  'Incline Barbell Press': 'barbell',
  'Push Press': 'barbell',
  'T-Bar Row': 'partial',
  'Weighted Pull-Up': 'bodyweight',
  'Hanging Knee Raise': 'bodyweight',
  'Barbell Shrug': 'barbell',
  'Preacher Curl': 'barbell',
  'Skull Crusher': 'dumbbellPair',
  'Seated Calf Raise': 'machine',

  /* conditioning — logged, never programmed */
  'Power Clean': 'barbell',
  'Power Snatch': 'barbell',
  'Clean and Jerk': 'barbell',
  'Push Jerk': 'barbell',
  'Overhead Squat': 'barbell',
  'Front Rack Lunge': 'barbell',
  Thruster: 'barbell',
  'DB Snatch': 'dumbbellOne',
  "Devil's Press": 'dumbbellPair',
  'Kettlebell Snatch': 'dumbbellOne',
  'Wall Ball': 'dumbbellOne',
  'Box Jump': 'bodyweight',
  'Chest-to-Bar Pull-Up': 'bodyweight',
  'Ring Row': 'bodyweight',
  'Handstand Push-Up': 'bodyweight',
  'Ring Dip': 'bodyweight',
  'Toes-to-Bar': 'bodyweight',
  'GHD Sit-Up': 'bodyweight',
  'Turkish Get-Up': 'dumbbellOne',
  'Sandbag Carry': 'dumbbellOne',
};

/**
 * The class for an exercise, by name.
 *
 * Falls back to `dumbbellOne` — one implement, stored exactly as typed — for
 * anything not in the table. That is the class that changes nothing: factor
 * one, so no number is silently doubled, and the honest reading of a weight
 * somebody typed against a movement we know nothing about. `mass` stays true
 * because refusing to score an unknown exercise would be a second guess on top
 * of the first.
 */
export const loadClassOf = (name: string): LoadClass => EXERCISE_LOADS[name] ?? 'dumbbellOne';

export const loadRuleOf = (name: string): LoadRule => LOAD_RULES[loadClassOf(name)];

/**
 * What goes into storage, given what somebody typed.
 *
 * One direction of a pair that must stay exact. Both are multiplications by a
 * small integer rather than anything rounded, so `toStored(toEntered(x)) === x`
 * for every value the app can hold — which is the property that stops a weight
 * drifting downwards every time a card is opened and logged again.
 */
export const toStored = (name: string, entered: number | null): number | null =>
  entered === null ? null : entered * loadRuleOf(name).factor;

/** What to show in the box, given what is stored. The inverse of `toStored`. */
export const toEntered = (name: string, stored: number | null): number | null =>
  stored === null ? null : stored / loadRuleOf(name).factor;

/* ------------------------------------------------------------- the cutover */

/**
 * The day the convention above started being applied.
 *
 * Every dumbbell-pair row logged before this was written under **no convention
 * at all** — the app asked for "weight" and never said what it counted — so a
 * 30 could be one dumbbell or both, and nothing stored says which. The gap is
 * exactly 2x and it is not recoverable.
 *
 * **A constant, deliberately, and not a column on the profile.** The first plan
 * here was a per-account cutover date, on the reasoning that history is a
 * per-account thing. It is not, in this case: the convention lives in the
 * client bundle and ships to everybody in the same deploy, so every account
 * crosses over on the same day. A column would have carried the identical value
 * in every row, at the cost of a migration, a sync field, a spec change and a
 * diagram — the whole "add a column" tax for data with one possible value.
 *
 * The one case this gets wrong is a device still running the previous build,
 * which keeps writing the old meaning for a day or two after the date. A column
 * would not have fixed that either: it would have been written server-side at
 * deploy time, by which point the stale client is already the problem. So the
 * inaccuracy is inherent to a lazily-updating PWA rather than to this shape.
 *
 * Nothing is rewritten. A retroactive doubling would be right for some rows and
 * wrong by a factor of two for others, with no signal to separate them, which is
 * precisely the class of precise-looking correction with nothing underneath it
 * that this codebase has already had to undo once.
 */
export const LOAD_CONVENTION_FROM = '2026-09-17';

/**
 * Whether an exercise's history straddles the day its convention changed.
 *
 * The only place the cutover is visible to anybody is a chart: a dumbbell-pair
 * movement logged per hand before the date and combined after it shows a jump
 * on that day which is bookkeeping, not training. This is what lets the detail
 * sheet say so, once, under the chart where the jump is.
 *
 * It takes the dates actually on the chart rather than a flag on the account, so
 * it is true only for a history that really crosses over. The demo's generated
 * past sits entirely on one side of the date and correctly says nothing;
 * somebody who trained through the change is told.
 *
 * Nothing is hidden or corrected because of it. The convention cancels in any
 * same-exercise comparison — both ends of a trend that sits entirely on one side
 * are on the same side of the factor — so the only honest intervention is to
 * say what happened at the join.
 *
 * (This replaced a per-row `conventionKnown`, written for a gate on the strength
 * index that was designed and then not built: the index never leaves its owner,
 * and every same-exercise comparison inside it cancels the factor anyway.)
 */
export const conventionChanged = (
  name: string,
  dates: string[],
  cutover: string = LOAD_CONVENTION_FROM,
): boolean =>
  loadClassOf(name) === 'dumbbellPair' &&
  dates.some((d) => d < cutover) &&
  dates.some((d) => d >= cutover);
