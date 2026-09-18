# Flow 04 — What the card offers you

**Spec:** [`../tests/progression.spec.ts`](../tests/progression.spec.ts)

**Who:** somebody returning for their second session of the same lift.

**Why it matters:** this flow used to be called *Progressive overload*, and it
asserted the opposite of what it asserts now. The Train card worked out a target
by double progression — "add weight, back to 6", "go for one more" — and these
steps checked that it did.

It does not any more. Telling somebody training alone to put more on the bar is
advice about load from software that cannot see their form, their sleep or their
shoulder, and a defensible rule is not the same thing as standing to give the
instruction. The card is prefilled with **what you did last time**, captioned as
history. See Decision log D-014.

## Preconditions

- An onboarded user
- A previous session logged for a known exercise

## Steps

1. Log sets of a lift — say `60 kg × 8`, effort *"2 more"*.
2. Move to a later date, staying on the same day of the split.
3. Open `/train` and read the card.

## Expected — the record is there

- The weight and reps are prefilled with **60 kg × 8**: the same numbers, so
  repeating the session costs one tap.
- A line reads *"Last time 60 kg × 8 · <date>"* — stated as history.
- Of several sets, the working set is used, not the easiest one.
- With no history, the card says so plainly.

## Expected — the advice is gone

This half is the one that matters: it is what fails if a suggestion engine ever
comes back. Phrased against the copy rather than the mechanism, so a new engine
with new wording cannot slip past a test that only checked the old function was
deleted.

- Three sets at the top of the old range with reps to spare — the exact state
  that used to produce "add weight" — prefill **60 × 12** and say nothing else.
  No "add weight", no "go for one more", no "reps to spare".
- A set taken to failure draws no comment.
- Easy sets are not called "too easy".
- Home offers no lifts that have "earned more weight".

## Moving the date

Moving three days forward from a Monday lands on Day B, a different exercise
with no history and a correctly blank card. So the steps move the date *and*
return to Day A. Without that the test passed four days in seven and failed the
other three, which is the worst kind of test to own.
