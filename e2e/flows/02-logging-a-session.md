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

## What a set feels like

Covered by `logging-moments.spec.ts`. Only what the set changed moves, once,
and nothing runs longer than a quarter of a second:

- The **Log set** button stays lit while it saves — it never dims.
- The new row grows in, its numbers briefly in the accent colour; the dot it
  filled pops; the day's count ticks up. The second set moves the second row
  and dot, not the first again, and a card opened again replays nothing.
- A number set with **−**/**+**, or a plate put on the bar, rolls the way it
  moved.
- Finishing an exercise draws the tick on its row. Finishing the day draws the
  tick on its tab and says *"Day A done"* — once, and not again when the day is
  opened later.
- On Android, each saved set gives a short buzz and the day's last set one
  longer one. A set the phone could not save gives none.
- Under reduced motion nothing moves or swells; the colour still fades and a
  tick fades in whole.

## Notes

Effort is four buttons rather than a 0–10 field. The underlying value is still
reps-in-reserve, and the estimated 1RM depends on it, but nobody is asked to
learn the term.
