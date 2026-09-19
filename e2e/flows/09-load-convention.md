# 09 — What the weight box is counting

**Spec:** [`../tests/load-convention.spec.ts`](../tests/load-convention.spec.ts)

## Why this flow exists

The app asked for a "weight" for months and never said what it counted. On a
barbell that is nearly harmless — everybody means the bar plus the plates. On
two dumbbells it is a **factor of two**, and once a row is stored there is
nothing in it to say which side of that the person was on. A dumbbell bench
press logged as 30 is either 30 or 60, and the app drew a confident chart
through both readings.

Reported from using the app, as a question rather than a bug: *if you are doing
a two dumbbell exercise, what is the weight? Do we enter one dumbbell or two?
Also, does the weight of the bar count?* Nothing on screen answered either.

## The convention

**Enter one dumbbell. Both get recorded.**

The entry side is what people already do and what they can read off the
implement — Strength Level, Fitbod and Strong are all per-hand, so somebody
arriving from any of them is already typing one. The stored side is what the
strength literature means by a dumbbell load: Farias et al. 2017 state it
verbatim as "the sum of the 2 dumbbells combined", and every same-subject
dumbbell-to-barbell ratio in that literature only makes sense read that way.

The class is **per exercise, not per equipment type**, because "a dumbbell
number means both" would define every single-arm row and suitcase carry
incorrectly. `packages/domain/src/load.ts` carries the table, the citations, and
the list of things a class explicitly does *not* license.

## What the person does

1. Opens Train. Whatever is on the card, the weight says what to type. Where
   the words stop a wrong entry they are a line under it: one dumbbell of a
   pair, and "Added weight only" on a bodyweight lift. The rest — the whole bar,
   the one dumbbell, the number on the machine, the plates loaded — is behind
   the ⓘ beside the weight ("What weight to enter"), and is what a screen
   reader hears on the weight. With Load the bar on, a barbell needs nothing:
   gymmy adds the bar and the plates up itself.
2. On a dumbbell-pair movement, types the weight of one dumbbell. The line
   immediately names the figure that will be recorded: type 20, it says 40.
3. Logs the set. The logged row reads **40 kg**, which is what every other
   screen shows and what the score is computed from. The box still reads 20, so
   the next identical set is one tap — and it reads 20 again when the card comes
   back from history after a reload, turning the stored 40 back into one
   dumbbell.
4. On Progress, a pair that was logged per hand before the cutover and both
   together after it says so, because the jump on that day is bookkeeping, not
   training: on the strength card behind the ⓘ beside the index's arrow, and
   under the lift's own chart in one visible line ("From 17 Sep, both dumbbells
   are counted"), with "not new strength" behind the chart's ⓘ. A lift that
   shows no jump says nothing.

## What these tests are for

The conversion happens at exactly one boundary — the weight box — and a unit
test of `toStored` cannot show that the box is on the right side of it. What has
to be true end to end is that *both* numbers are visible, and that nothing
doubles twice or not at all.

The measuring-note test is the one that answers the original complaint rather
than the dumbbell half of it: each kind of load carries its own note on the
card — the whole bar (with Load the bar off), "Added weight only" on a
bodyweight lift, the machine's number, alongside the pair and the single
dumbbell. A note behind the ⓘ is opened, not just found: a closed tip's text is
still in the page, so finding it would prove nothing. And it is checked as the
weight's description, which is how a screen reader meets it. Whether every
lift is in the table at all is held by the domain suite (`load.test.ts`); this
spec holds that each class's own note reaches the card. One more test holds
that the ⓘ, right above "−", never takes a tap meant for it.

The cutover note is checked on fixed dates either side of
`LOAD_CONVENTION_FROM`, with Progress switched to *All time* — on the default
twelve-week view the note correctly disappears once the cutover leaves it. The
account has a bodyweight from before the cutover (the `bodyWeights` fixture
option): the index's ⓘ lives beside its arrow, and a weigh-in dated today gives
the chart a second point only on some weekdays.

## Deliberately not covered here

- **History written before the convention.** It stays exactly as it was; see
  `LOAD_CONVENTION_FROM`. A retroactive doubling would be right for some rows
  and wrong by two for others, with nothing stored to separate them.
- **Whether a class is the *right* class for a movement.** That is a judgement
  recorded in `load.ts` and checked by the domain suite's coverage test, not
  something a browser can settle.
