# Flow 02 — Logging a session

**Who:** somebody mid-workout, phone in one hand, resting between sets.

**Why it matters:** this is the app's core action. Everything else is reporting
on data this flow produces. It has to be fast, forgiving and require no typing
beyond two numbers.

## Preconditions

- An onboarded user with a generated week

## Steps

1. Open `/train`. The app has already picked the day — the first session not
   yet trained this week — so no choice is required to begin.
2. The first exercise card shows a **Today** target. With no history it reads
   guidance rather than a number: *"First time — find a weight you can do 6 with
   about 2 left in the tank"*.
3. Tap **Log set 1**.
4. In the sheet, set weight to **60** and reps to **8**.
5. Choose effort: **2 more**.
6. Tap **Save set 1**.

## Expected

- The sheet closes and the set appears under the exercise as `60 kg × 8`.
- The set counter moves from `0/3` to `1/3`, and one progress dot fills.
- The button now reads **Log set 2**.
- The effort chip reads *"2 more"* — never `RIR 2`. Reps in reserve is stored as
  a number and never shown as one.
- Deleting the set removes it and returns the counter to `0/3`.

## Notes

Effort is four buttons rather than a 0–10 field. The underlying value is still
reps-in-reserve, and the estimated 1RM depends on it, but nobody is asked to
learn the term.
