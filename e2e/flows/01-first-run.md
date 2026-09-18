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
6. A preview appears: "Here is your week", listing Day 1, Day 2 and Day 3 with
   five exercises each.
7. Tap **Start training**.

## Expected

- Exactly three days are previewed, five exercises apiece.
- Landing on `/train` afterwards, not back on onboarding.
- Re-opening the app goes straight to `/train` — onboarding does not repeat.
- On the Week tab, the seven pattern tiles are all present.
- The generated plan covers **every** counted pattern. This is the guarantee
  the repair pass in `buildProgram` exists to provide, and the unit tests
  already cover all 36 combinations; here we confirm it survives the round trip
  through the UI and the database.

## Notes

The user is never asked about slots, roles or movement patterns. Those still
exist and remain editable, but they are derived from these four answers.
