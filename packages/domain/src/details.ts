/**
 * What each seeded exercise is, in one or two sentences, plus photographs.
 *
 * The wording is deliberately ours rather than lifted from the image source:
 * that dataset's instructions run to five numbered steps of gym jargon, which
 * is the register this app spent its redesign getting away from. One cue that
 * fixes the mistake people actually make is worth more than a full description
 * nobody reads mid-set.
 *
 * Photographs come from the Free Exercise DB (public domain, the Unlicense) and
 * are vendored into `public/exercises/<slug>/` rather than hotlinked, so they
 * are same-origin — which means the service worker caches them and they survive
 * a basement with no signal, like everything else here.
 *
 * Thirteen exercises carry a description and no photographs. The dataset has no
 * faithful match for them, and showing a picture of a *different* movement
 * would be worse than showing none: the whole point of the picture is to settle
 * what the movement is.
 */

export interface ExerciseDetail {
  description: string;
  /** Empty when no honest photograph was available. */
  images: string[];
}

/** Matches the directory names produced when the images were vendored. */
export const detailSlug = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const d = (name: string, description: string, photos = true): [string, ExerciseDetail] => [
  name,
  {
    description,
    images: photos
      ? [`/exercises/${detailSlug(name)}/0.jpg`, `/exercises/${detailSlug(name)}/1.jpg`]
      : [],
  },
];

export const EXERCISE_DETAILS: Record<string, ExerciseDetail> = Object.fromEntries([
  /* ------------------------------------------------------------------ squat */
  d(
    'Goblet Squat',
    'Hold one weight at your chest and sit straight down between your knees. The weight up front keeps your chest tall, which is why it is the easiest squat to learn.',
  ),
  d(
    'Leg Press',
    'Push the platform away through your whole foot. Stop lowering when your lower back starts to lift off the pad.',
  ),
  d(
    'Barbell Back Squat',
    'Bar across your upper back, sit down and slightly back, drive up through mid-foot. The heaviest way most people can train the squat.',
  ),
  d(
    'Barbell Front Squat',
    'Bar resting on the front of your shoulders, elbows high. It punishes any forward lean, so it keeps you upright and honest.',
  ),
  d(
    'Hack Squat',
    'A squat on a machine with your back supported, so your legs give out before your torso does.',
  ),
  d(
    'Zercher Squat',
    'Bar held in the crooks of your elbows. Uncomfortable, but very hard to do with a rounded back.',
  ),
  d(
    'Box Squat',
    'Squat down to a box, pause, then stand. The pause removes the bounce and teaches you to sit back.',
  ),
  d(
    'Smith Machine Squat',
    'A squat on a fixed bar path. Useful when you train alone and want to push close to failure safely.',
  ),

  /* ------------------------------------------------------------------ hinge */
  d(
    'Romanian Deadlift',
    'Push your hips back with a soft knee and let the bar travel down your thighs. Stop when your hamstrings run out of stretch, not when the weight reaches the floor.',
  ),
  d(
    'Conventional Deadlift',
    'Pull the bar from the floor with your hips and shoulders rising together. The biggest test of the hinge there is.',
  ),
  d(
    'Trap Bar Deadlift',
    'Deadlift standing inside the bar with the handles at your sides. Easier on the lower back than a straight bar.',
  ),
  d(
    'Hip Thrust',
    'Shoulders on a bench, drive your hips up until your body makes a straight line. Squeeze at the top rather than arching your back.',
  ),
  d(
    'Good Morning',
    'Bar on your back, hinge forward with a flat back, then stand. Small weights go a long way here.',
  ),
  d(
    'Back Extension',
    'Hinge over the pad and raise your torso to straight — no further. A hinge you can do for higher reps without much load.',
  ),
  d(
    'Kettlebell Swing',
    'Snap your hips forward to throw the bell up to chest height. It is a hinge, not a squat, and your arms are only rope.',
  ),
  d(
    'Single-Leg RDL',
    'Hinge over one leg with the other reaching back as a counterweight. It exposes the left-to-right imbalance a two-leg hinge hides.',
  ),
  d(
    'Cable Pull-Through',
    'Face away from the cable and drive your hips forward against it. Teaches the hinge with no load on your spine at all.',
  ),

  /* ------------------------------------------------------------------ lunge */
  d(
    'Walking Lunge',
    'Step forward, drop the back knee towards the floor, then step through. Keep the front shin roughly upright.',
  ),
  d(
    'Reverse Lunge',
    'Step backwards into the lunge rather than forwards. Kinder to the knees and much easier to balance.',
  ),
  d(
    'Bulgarian Split Squat',
    'Back foot on a bench, drop straight down on the front leg. Brutal for how little weight it needs.',
    false,
  ),
  d(
    'Step-Up',
    'Step onto a box and stand up through the top leg, without pushing off the floor with the trailing one.',
  ),
  d(
    'Split Squat',
    'Feet split front and back, drop straight down and back up. Learn this before the Bulgarian version.',
  ),
  d(
    'Curtsy Lunge',
    'Step one leg behind and across the other. It reaches the side of the hip that straight-ahead lunges miss.',
    false,
  ),
  d(
    'Lateral Lunge',
    'Step wide to one side and sit into that hip, keeping the other leg straight. The only lunge that trains sideways.',
    false,
  ),

  /* ------------------------------------------------------------------- push */
  d(
    'DB Bench Press',
    'Press two dumbbells from your chest. The free path lets your shoulders find a position a bar forces on them.',
  ),
  d(
    'Barbell Bench Press',
    'Lower the bar to your chest under control and press it back up. Keep your shoulder blades pulled together throughout.',
  ),
  d(
    'Overhead Press',
    'Press the bar from your shoulders to overhead, finishing with it over your ears. Squeeze your glutes so you press rather than lean back.',
  ),
  d(
    'DB Shoulder Press',
    'Press two dumbbells overhead. Easier on the shoulders than a bar for most people.',
  ),
  d(
    'Incline DB Press',
    'Bench set at about thirty degrees, which shifts the work to the upper chest and front of the shoulder.',
  ),
  d(
    'Push-Up',
    'Whole body in one line, lower your chest to just off the floor. Ribs down — it is the hips sagging that ruins it.',
  ),
  d(
    'Dip',
    'Lower between the bars until your upper arms are about parallel, then press up. Lean forward for chest, stay upright for triceps.',
  ),
  d(
    'Machine Chest Press',
    'A chest press on a fixed path. Good for pushing hard when you are tired or training alone.',
  ),
  d(
    'Landmine Press',
    'Press a bar anchored at one end up and slightly forward. The middle ground between flat and overhead pressing.',
    false,
  ),

  /* ------------------------------------------------------------------- pull */
  d(
    'Lat Pulldown',
    'Pull the bar to your collarbone and let your elbows drive down. The pull-up, but loadable to the kilo.',
  ),
  d(
    'Pull-Up',
    'Hang with palms forward and pull your chest towards the bar. Start every rep from a dead hang.',
  ),
  d('Chin-Up', 'Palms facing you. Slightly easier than a pull-up, and considerably more biceps.'),
  d(
    'Seated Cable Row',
    'Pull the handle to your stomach and let your shoulder blades travel back. Stop your torso rocking to move the weight.',
  ),
  d('Barbell Row', 'Hinge over and row the bar to your stomach. Back flat, torso still.'),
  d(
    'DB Row',
    'One hand supported, row the dumbbell to your hip. Pull with your back rather than just your arm.',
  ),
  d(
    'Chest-Supported Row',
    'Row lying face down on an incline bench. It takes your lower back out of the movement entirely.',
    false,
  ),
  d(
    'Face Pull',
    'Pull a rope towards your face with your elbows high. The best small fix for shoulders rounded by pressing.',
  ),
  d(
    'Inverted Row',
    'Bar at hip height, body straight, pull your chest to the bar. A row that needs no weights at all.',
  ),

  /* ----------------------------------------------------------------- rotate */
  d(
    'Pallof Press',
    'Press a cable straight out in front while it tries to twist you. You are training not to rotate.',
  ),
  d(
    'Cable Woodchop',
    'Rotate and pull the cable diagonally across your body. Turn through your ribs, not your lower back.',
  ),
  d(
    'Landmine Rotation',
    'Swing the end of the bar side to side in an arc. Keep your hips fairly still so your trunk does the work.',
  ),
  d(
    'Half-Kneeling Chop',
    'Chop the cable across your body from one knee. Kneeling takes the legs away so the trunk cannot cheat.',
    false,
  ),
  d(
    'Russian Twist',
    'Sit leaning back and rotate side to side under control. Speed does nothing here.',
  ),
  d(
    'Bird Dog',
    'On hands and knees, extend the opposite arm and leg without letting your hips tilt. Harder and more useful than it looks.',
    false,
  ),
  d(
    'Dead Bug',
    'On your back, lower the opposite arm and leg while your lower back stays flat on the floor.',
  ),
  d(
    'Side Plank',
    'On one forearm, body straight from head to heels. It trains the side of your trunk, which almost nothing else does.',
    false,
  ),

  /* ------------------------------------------------------------------ carry */
  d(
    "Farmer's Carry",
    'Carry a heavy weight in each hand and walk. The simplest exercise here and one of the hardest to finish.',
  ),
  d(
    "Waiter's Walk",
    'Walk with one weight locked out overhead, arm by your ear. Start far lighter than you expect to need.',
    false,
  ),
  d(
    'Suitcase Carry',
    'Carry one weight at your side and walk without leaning. The whole exercise is refusing to tip.',
    false,
  ),
  d(
    'Front Rack Carry',
    'Carry the weight at your shoulders and walk tall. Very demanding on the upper back — and on breathing.',
    false,
  ),
  d(
    'Overhead Carry',
    'Walk with the weight locked out overhead. Ruthless about shoulder position and ribs staying down.',
    false,
  ),
  d(
    'Sled Push',
    'Drive a loaded sled forward with short, hard steps. All effort, almost no soreness the next day.',
  ),
  d('Sled Drag', 'Walk forward pulling a sled behind you. A carry your grip will not cut short.'),

  /* -------------------------------------------------------------- isolation */
  d(
    'Lateral Raise',
    'Raise the weights out to the sides to shoulder height. Light weight, and no swinging.',
  ),
  d(
    'Cable Curl',
    'Curl against a cable, so the biceps stay loaded through the whole range rather than just the middle.',
  ),
  d('DB Curl', 'Curl two dumbbells with your elbows staying at your sides.'),
  d(
    'Hammer Curl',
    'Curl with your palms facing each other. Hits the forearm and the outside of the upper arm.',
  ),
  d(
    'Tricep Pushdown',
    'Push the cable down by straightening your elbows, upper arms pinned to your sides.',
  ),
  d(
    'Overhead Tricep Extension',
    'Lower the weight behind your head and straighten your arms. The stretched position is the part that matters.',
  ),
  d(
    'Leg Extension',
    'Straighten your knees against the pad. Isolates the quads and asks nothing of anything else.',
  ),
  d(
    'Leg Curl',
    'Bend your knees against the pad. The hamstring work that hinging on its own does not cover.',
  ),
  d(
    'Calf Raise',
    'Rise onto your toes through a full range and lower slowly. Calves want reps and a real stretch.',
  ),
  d(
    'Cable Abduction',
    'Take one leg out to the side against a cable. Small muscles, but the ones that keep your hips level when you walk.',
    false,
  ),
  d(
    'Glute Kickback',
    'Drive one leg back against a cable and squeeze at the end. Do not arch your back to get further.',
  ),
  d(
    'Rear Delt Fly',
    'Pull the weights out and back with arms almost straight. The back of the shoulder, which pressing never reaches.',
  ),
  d(
    'Chest Fly',
    'Open your arms wide with a slight bend at the elbow, then bring them back together. Chase the stretch, not the weight.',
  ),
]);
