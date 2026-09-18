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

  /* ----------------------------------------------- added without photographs */
  d(
    'Bodyweight Squat',
    'Arms out in front for balance, sit down between your knees and stand back up. Keep your heels on the floor the whole way down.',
    false,
  ),
  d(
    'DB Squat',
    'Dumbbells hanging at your sides, sit straight down between your knees and stand back up. Keep your chest tall so the weights stay beside you, not in front.',
    false,
  ),
  d(
    'Sumo Deadlift',
    'Feet wide with toes turned out, hands inside your knees, stand up with the bar. Push your knees out over your toes the whole way; letting them cave in is the usual fault.',
    false,
  ),
  d(
    'Nordic Curl',
    'Kneel with your ankles held down and lower yourself forward, fighting the fall with your hamstrings. Keep a straight line from knees to head; bending at the hips is how it gets cheated.',
    false,
  ),
  d(
    'Barbell Reverse Lunge',
    'Bar across your upper back, step backwards into the lunge and drive back up through the front foot. Stay tall, because the bar pulls you forward if you let it.',
    false,
  ),
  d(
    'Close-Grip Bench Press',
    'A bench press with your hands shoulder-width apart and elbows tucked to your sides, which shifts the work onto the triceps. Any narrower only strains your wrists.',
    false,
  ),
  d(
    'Incline Barbell Press',
    'Bench set at about thirty degrees, lower the bar to just below your collarbone and press it back up over your shoulders. The steeper the bench, the more it becomes a shoulder press.',
    false,
  ),
  d(
    'Push Press',
    'Bar on your shoulders, dip briefly at the knees and drive up, pressing the bar overhead as your legs finish. Dip straight down; letting your chest tip forward sends the bar out in front.',
    false,
  ),
  d(
    'T-Bar Row',
    'Straddle the bar, hinge over with a flat back and row the handle to your stomach. Keep your chest still; standing up to move the weight is the usual cheat.',
    false,
  ),
  d(
    'Weighted Pull-Up',
    'A pull-up with extra weight hung from a belt or held between your feet. Same rules: start every rep from a dead hang and pull your chest towards the bar.',
    false,
  ),
  d(
    'Hanging Knee Raise',
    'Hang from a bar and draw your knees up towards your chest, then lower them without swinging. Curl your hips up at the top; lifting only the knees leaves your abs out of it.',
    false,
  ),
  d(
    'Barbell Shrug',
    "Hold the bar at arm's length and lift your shoulders towards your ears, then lower them. Straight up and down; rolling your shoulders adds nothing.",
    false,
  ),
  d(
    'Preacher Curl',
    'Upper arms flat on the angled pad, curl the bar up and lower it until your arms are nearly straight. The pad stops you swinging, so the biceps do all the work.',
    false,
  ),
  d(
    'Skull Crusher',
    'Lying on a bench, lower the weight towards your forehead by bending only at the elbows, then straighten your arms. Keep your upper arms still, pointing at the ceiling.',
    false,
  ),
  d(
    'Seated Calf Raise',
    'Sit with your knees under the pad, lower your heels as far as they go, then rise onto your toes. Bent knees take the big calf muscle out of it, so the deeper one underneath does the work.',
    false,
  ),
  d(
    'Power Clean',
    'Pull the bar from the floor, jump as it reaches the top of your thighs, and catch it on the front of your shoulders above a full squat. Arms stay straight until the jump is done; bending them early steals the power.',
    false,
  ),
  d(
    'Power Snatch',
    'Wide grip, pull the bar from the floor and jump as it reaches your hips, catching it overhead on locked arms above a full squat. Keep it brushing your body: a bar that swings out in front has to be chased.',
    false,
  ),
  d(
    'Clean and Jerk',
    'Two lifts: clean the bar from the floor to your shoulders and stand up, then dip, drive and lock it out overhead. Settle the bar and your feet before the jerk rather than rushing it out of the clean.',
    false,
  ),
  d(
    'Push Jerk',
    'Bar on the front of your shoulders, dip at the knees, drive up and push yourself under it, catching it on locked arms with your knees still bent. Dip straight down; if your chest tips forward, so does the bar.',
    false,
  ),
  d(
    'Overhead Squat',
    'Wide grip, bar locked out overhead, squat down and stand back up. Keep pushing up into the bar the whole way down — the moment your arms go soft, it drifts forward.',
    false,
  ),
  d(
    'Front Rack Lunge',
    'Bar on the front of your shoulders, elbows high, step into a lunge and stand back up. Keep the elbows up — when they drop, your chest follows and the bar rolls forward.',
    false,
  ),
  d(
    'Thruster',
    'Front squat the bar and use the drive out of the bottom to send it straight overhead in one motion. If you stand first and then press, it is two lifts rather than one.',
    false,
  ),
  d(
    'DB Snatch',
    'Pull one dumbbell from between your feet and snap your hips to send it overhead, catching it on a straight arm in one movement. Your hips throw it; the arm only keeps it close and punches up at the end.',
    false,
  ),
  d(
    "Devil's Press",
    'Do a burpee with your hands on two dumbbells, then swing both from between your legs to overhead in one go. The swing is a hinge: back flat, hips doing the throwing.',
    false,
  ),
  d(
    'Kettlebell Snatch',
    'Swing the bell back between your legs, then snap your hips and guide it straight up to lock out overhead in one movement. Punch your hand through as it rises, so the bell rolls onto your forearm instead of crashing into it.',
    false,
  ),
  d(
    'Wall Ball',
    'Hold a medicine ball at your chest, squat, and drive up to throw it at a mark high on the wall. The throw comes from your legs — your arms only steer it.',
    false,
  ),
  d(
    'Box Jump',
    'Jump from both feet onto a box, land softly, and stand all the way up on top. Step back down rather than jumping off — it spares your ankles and Achilles.',
    false,
  ),
  d(
    'Chest-to-Bar Pull-Up',
    'A pull-up that finishes with your chest touching the bar, not just your chin clearing it. Drive your elbows down and back, and lead with your chest rather than craning your neck.',
    false,
  ),
  d(
    'Ring Row',
    'Lean back under a pair of rings, body straight from head to heels, and row your chest up between your hands. Keep your hips in line, so your whole body rises together.',
    false,
  ),
  d(
    'Handstand Push-Up',
    'Upside down with your feet against a wall, lower until your head touches the floor, then press back up. Your head lands a little in front of your hands, so the three make a triangle rather than a line.',
    false,
  ),
  d(
    'Ring Dip',
    'A dip on gymnastic rings. They move where bars stay put, so keep them pressed close to your sides and turn your palms forward at the top to stop them drifting apart.',
    false,
  ),
  d(
    'Toes-to-Bar',
    'Hang from a bar and lift your feet until your toes touch it between your hands. Curl your hips up towards the bar rather than just kicking your legs — your trunk does the lifting.',
    false,
  ),
  d(
    'GHD Sit-Up',
    'Feet locked into a glute-ham developer, lean back until your torso is past parallel, then sit up and reach for your feet. Snap your knees straight to come up, rather than heaving with your neck.',
    false,
  ),
  d(
    'Turkish Get-Up',
    'Lie down with a kettlebell pressed straight up over one shoulder, then get up to standing and back down. Keep your arm locked and your eyes on the bell the whole way.',
    false,
  ),
  d(
    'Sandbag Carry',
    'Hug a sandbag high against your chest and walk. It shifts and sags as you go, so the job is keeping it high and staying upright instead of leaning back under it.',
    false,
  ),
]);
