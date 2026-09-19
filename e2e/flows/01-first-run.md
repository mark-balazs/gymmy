# Flow 01 — First run

**Who:** somebody who has just signed in for the first time.

**Why it matters:** this is the only screen standing between a new user and a
usable program. If it asks too much, or produces a week with a hole in it, the
app has failed at the thing it exists to do.

## Preconditions

- A signed-in user whose profile has `onboarded = false`
- The account seeded (7 patterns and isolation, 5 slots); the exercise library is the shared catalogue

## Steps

1. Open the app. Because the profile is not onboarded, land on `/onboarding`.
2. **"How should your week be shaped?"** — choose *Seven movement patterns*.
   This is asked first because it decides which day counts the next step can
   offer; see [flow 07](./07-choosing-a-split.md).
3. **"How often can you train?"** — choose *3 days*.
4. **"Where do you train?"** — choose *A gym*.
5. **"Anything you want to bring up?"** — choose *Shoulders*.
6. **"What do you weigh?"** — enter a bodyweight, or skip it.
7. A preview appears: "Here is your week", listing Day A, Day B and Day C with
   five exercises each.
8. Tap **Start training**.

## Expected

- Exactly three days are previewed, five exercises apiece.
- The week installed is the week previewed, day for day — with a bias chosen,
  because the bias is the one answer that acts only in the isolation slot.
- Two accounts that answer the same way get different exercises: each account
  has its own offset into the library, and setup passes it to the generator.
- Landing on `/train` afterwards, not back on onboarding.
- Re-opening the app goes straight to `/train` — onboarding does not repeat.
- The generated plan covers **every** counted pattern. This is the guarantee
  the repair pass in `buildProgram` exists to provide, and the unit tests
  already cover all 144 configurations; here we confirm it survives the round trip
  through the UI and the database, by mapping the installed week's exercises
  back to their patterns. That the Week tab shows the seven pattern tiles is
  held by `splits.spec.ts` ("the seven-pattern split is scored on all seven").
- With a bodyweight given, a strength index appears as soon as a lift it counts
  is trained — a real weight, or a pull-up, chin-up or dip; skipped, Progress
  says what is missing. Any account shows it after one set of Day A's first
  lift: that is the squat's main slot, and a scored movement's main slot
  prefers a lift the index counts.

- Each step says at most one short line under its question, and only where it
  changes the answer: the split can be changed later; pick what a normal week
  allows; the area you bring up gets a bit extra; bodyweight is needed for the
  strength score. "Where do you train?" says nothing — the equipment line under
  each answer is the explanation. Only 2 and 3 days carry a hint ("Still covers
  everything", "Recommended").
- The bodyweight box shows its unit beside it, and a screen reader hears it: the
  number is stored as typed, so someone who thinks in pounds must see "kg".

## Notes

The user is never asked about slots, roles or movement patterns. Those still
exist and remain editable, but they are derived from these answers.
