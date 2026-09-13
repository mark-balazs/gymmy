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

## Understanding one before choosing it

A one-line hint is not enough to choose on. The thing worth explaining is not
what a split is called, it is **what it will then hold you to** — so every
preset carries an "i" beside it, in onboarding and in Settings alike, opening a
sheet that states the days it makes, what goes in each slot, the day counts it
works at, and the coverage set it will call a complete week.

Everything in that sheet is read off the preset itself rather than written out a
second time in prose, so the explanation cannot drift from the split it is
explaining.

The button is a **sibling** of the option, never nested inside it: a button
within a button is neither valid markup nor operable with a keyboard. Reading
about a split must not select it.

### Expected

- Push / Pull / Legs never mentions rotation or carry as part of a complete week.
- The seven-pattern split does — that is what it is for.
- Closing the sheet leaves the question unanswered and nothing selected.

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

## Building your own

**Custom** is not an option you tick, because there is nothing to apply until
the week has actually been arranged. It is a place you go: Settings → **Build
your own** → `/settings/split`.

1. The editor opens on **the week you already train**, not a blank page.
   Arranging a week from nothing is a far harder question than adjusting one,
   and a preset is a perfectly good first draft of one.
2. Tapping a slot opens a sheet: what it is called, the role it falls back on,
   and the specific movements it can be pinned to. Pins win over the role,
   exactly as the generator itself decides it.
3. Slots reorder with ↑/↓ and are added or removed per day; days are added and
   removed at the bottom. A day always keeps at least one slot.
4. Before saving, the editor states **what this arrangement will make a complete
   week** — and names anything that has dropped out of reach.
5. Saving regenerates the plan against the new skeleton and lands on the Week
   tab, which is the whole point of having saved.

### Expected

- The editor opens showing the day count and slots actually in force.
- A slot pinned to a movement says so on its row before anything is committed.
- Saving marks the split **Custom** in Settings and syncs — a skeleton that
  never reaches the server would leave every other device generating against
  the old one.
- The coverage goal is **inherited**, not reset: a custom split grown out of the
  seven-pattern method still asks for all seven.
- Equipment and bias remain changeable afterwards. Rebuilding a custom week
  keeps the arrangement and regenerates against it; anything else would leave
  somebody who arranged their own week unable to say "I train at home now".
- Weeks trained before the switch keep their own goal, exactly as for a preset
  switch. This is the same `SplitPeriod` append, reached a different way.
