# Flow 07 — Choosing a split

**Who:** somebody who already trains a particular way and wants the app to fit
their week rather than the other way round.

**Why it matters:** most people arrive with a split they already believe in.
Refusing to accommodate that is how an app gets abandoned in week one.

The load-bearing decision is what happens to **coverage**. A split does not just
organise the week — it *defines what a complete week is*. If you train push/pull,
your week is complete when you have pushed and pulled. Scoring it against seven
movement patterns would mark you down for work you never set out to do, and a
coverage view that is permanently red is a coverage view people stop reading.

So the seven-pattern method is one option among several, not a rule imposed on
everyone. It is the option that demands rotation and carries, because that is
what it is *for*.

## Preconditions

- A signed-in user
- The default library seeded (7 patterns, 5 slots per day, 70 exercises)

## The presets

| Split | Days shaped as | A complete week | Allowed days | Default |
| --- | --- | --- | --- | --- |
| Seven movement patterns | full body, every session | squat, hinge, lunge, push, pull, **rotate, carry** | 2–4 | 3 |
| Push / Pull / Legs | push, pull, legs — cycled | push, pull, squat, hinge, lunge | 3–6 | 3 |
| Upper / Lower | upper, lower — alternating | push, pull, squat, hinge, lunge | 2–6 | 4 |
| Custom | whatever the user edited | inherited from the split it grew out of | — | — |

Push/pull/legs and upper/lower still *generate* a midline finisher into every
day, so you do get carries and rotation. They are simply a bonus rather than a
box you are failed for leaving empty.

Push/pull/legs starts at three days on purpose. At two, a whole day type never
happens and the week cannot be covered, so the option is withheld rather than
offered and then quietly under-delivered.

## Steps — at first run

1. Land on `/onboarding`. The **first** question is "How should your week be
   shaped?", not "how often" — the split constrains the day options, so asking
   it second would mean offering a day count and then taking it back.
2. Choose **Push / Pull / Legs**.
3. The next screen offers **3, 4, 5, 6** days. The 2-day option is simply not
   there.
4. Finish the remaining questions and tap **Start training**.

## Steps — changing your mind later

1. Go to **Settings**.
2. Pick a different split and tap **Rebuild my week**.
3. Confirm on the sheet that warns the plan will be regenerated.

## Expected

- Day counts on offer always match the chosen split; an impossible combination
  is never selectable.
- The Week tab shows **exactly the tiles that split asks for** — seven for the
  seven-pattern method, five for the other two — and the generated week covers
  all of them.
- Each day is labelled with what it is — Push, Pull, Legs — on the Week tab.
- Swapping an exercise on a pinned slot only offers that pattern: a push day's
  main lift will not silently become a row.
- After a rebuild, **logged history survives**. Sets reference exercises, not
  slots, so changing how the week is arranged cannot destroy what you lifted.

## Historisation — the part that is easy to get wrong

Changing split must not rewrite the past. Train the seven-pattern method for
three months, switch to push/pull/legs, and those three months still have to
read as seven-pattern weeks — same sets, same tiles, same verdict. The new split
applies from the switch onward and no further back.

This is why a switch **appends a `SplitPeriod`** rather than editing a field.
Each period records the split, the day count and a frozen copy of the coverage
goal, so a week is always scored against what was in force at the time — even if
we later change what a preset means, or the user renames a pattern.

### Expected

- Paging back to a week trained under an earlier split shows **that split's**
  tiles and verdict, unchanged by anything chosen since.
- That week is labelled "Scored as …", so the changed tile count reads as
  deliberate rather than as a glitch.
- The sets logged in it are untouched.
- An account with no recorded periods at all — history from before this existed
  — keeps being scored against every counted pattern, which is how those weeks
  were scored when they were logged. Opening its first period backfills the old
  one first, so a first-ever switch cannot retroactively rescore anything.

### Boundaries

A period starts on a **Monday**, because a week is the unit of coverage.
Switching split on a Thursday applies to the whole of that week rather than
leaving it scored half one way and half the other. Weeks already finished are
never touched.

## Notes

Presets are not a special mode. Each one materialises into ordinary `Slot` rows
and nothing downstream knows a preset was involved — which is what lets a
hand-edited "custom" split behave identically to a built-in one.

A custom split **inherits** the coverage goal it grew out of: rearranging your
week is not the same as changing what you are training for. The one exception is
subtractive — if an edit leaves no slot capable of holding a pattern, that
pattern stops being demanded, because a box that can never be ticked is worse
than no box.

The Settings picker shows **Custom** once the user has one, but does not offer
it as something to switch *to*: a custom split is the arrangement you already
have, so there is nothing to apply.
