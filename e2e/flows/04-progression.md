# Flow 04 — Progressive overload

**Who:** somebody returning for their second session of the same lift.

**Why it matters:** this is what the app does *for* you. Double progression used
to be a rule you read and applied yourself. Now it is a target on screen, and
the rule is never mentioned.

## Preconditions

- An onboarded user
- A previous session logged for a known exercise

## Steps

1. Log three sets of a lift at `60 kg × 8` with effort *"2 more"*.
2. Move to a later date.
3. Open `/train` and read the target on that exercise.

## Expected

- The target reads **60 kg × 9** — same weight, one more rep.
- The supporting line reads *"Last time 60 kg × 8 — go for one more"*.

## Reaching the top of the range

1. Log three sets at `60 kg × 12` with effort *"2 more"*.
2. Move to a later date and re-read the target.

- The target reads **62.5 kg × 6** — weight up, reps back to the bottom.

## Nothing left in the tank

Logging `60 kg × 12` with effort *"Nothing left"* must **not** add weight. It
suggests repeating instead: a set that already failed is not a set to load
further. Getting this backwards would push someone into a grinding rep on a
weight they cannot control, which is where people get hurt.

## Notes

The rule is never shown. The unit tests in `@athletic/domain` cover the
arithmetic exhaustively; these tests confirm the number that reaches the screen
is the number the engine computed, through the database and the sync layer.
