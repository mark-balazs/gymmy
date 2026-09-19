# Flow 02 — Logging a session

**Who:** somebody mid-workout, phone in one hand, resting between sets.

**Why it matters:** this is the app's core action. Everything else is reporting
on data this flow produces. It has to be fast, forgiving and need no typing at
all — the card sets its numbers with its own controls, described in
[flow 11](./11-entering-a-set.md).

## Preconditions

- An onboarded user with a generated week

## Steps

1. Open `/train`. The app has already picked the day — the first session not
   yet trained this week — so no choice is required to begin.
2. The first card is open, its numbers filled in from last time or from a
   sensible start, with *"Nothing logged for this yet"* under the name.
3. Set **60** and **8** with the controls, or tap a number for the keypad.
4. Choose effort: **2 more**.
5. Tap **Log set 1**.

## Expected

- The set appears under the card as `60 kg × 8`, with its effort chip in words —
  never `RIR`. Reps in reserve is stored as a number and never shown as one;
  logged as *Maxed*, the chip reads *"Nothing left"*.
- The day counter reads `1 of N sets`, and one dot fills.
- The button reads **Log set 2**, and the numbers hold still for it — they do
  not follow history once a set is done.
- A double tap on the button logs one set, not two.
- Deleting the set returns the counter to `0 of N sets`, and the delete reaches
  the server and every other device.
- The third set folds the card and opens the next.

## Notes

Effort is four buttons rather than a 0–10 field. The underlying value is still
reps-in-reserve, and the estimated 1RM depends on it, but nobody is asked to
learn the term.
