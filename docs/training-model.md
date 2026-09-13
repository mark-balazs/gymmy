# The training model

This is the part of the codebase that is a *claim about training*, not a
technical choice. Change it carefully.

## Patterns

Seven movement patterns — squat, hinge, lunge, push, pull, rotate, carry — plus
**isolation**, which is taggable but has `counts: false` and is therefore never a
coverage box. The thesis of the app is that most people train four of the seven
and never notice; rotation and carries are the two that go missing.

A pattern has a stable `key` for translation and a `name` the user can overwrite.
`patternName()` prefers the key's translation and falls back to the user's
wording — so renaming something keeps *your* word for it in every language.

## Splits

A split decides **how the week is organised and what a complete week means**, and
those are the same question. A push/pull week is complete once you have pushed
and pulled; scoring it against seven patterns would mark it down for work it
never set out to do, and a permanently red coverage view is one people stop
reading.

So each preset in `splits.ts` declares its own `covers` set. Only
`sevenPattern` demands rotation and carries — that is what it is *for*, not a
rule imposed on someone who chose push/pull/legs.

Presets materialise into ordinary `Slot` rows via `buildSlots()`. Nothing
downstream knows a preset was involved, which is exactly what lets a hand-built
split behave identically to a built-in one. `applySplit` and `applyCustomSplit`
both go through one `installSkeleton` for the same reason.

`minDays` is a promise, not a preference: below it a whole day type never
happens and the week cannot be covered, so the option is withheld rather than
offered and then quietly under-delivered.

## Coverage

`buildProgram` guarantees that a generated week touches every pattern the current
period asks for. The rotation heuristic does most of it and a **repair pass**
forces in anything missed — writing only into a slot whose own constraint permits
the pattern, so the repair cannot create the violation it exists to prevent.

> **Known gap:** disabling the repair pass entirely does not currently fail any
> test — the heuristic alone covers the seeded library. The guarantee is
> asserted but not *proven*. A case that forces the repair to matter would be a
> genuine addition.

## Historisation

**The one invariant that matters most.** Three months of seven-pattern weeks
still read as seven-pattern weeks after you move to push/pull.

A switch **appends a `SplitPeriod`**; it never edits one. Each period records the
split, the day count, and a *frozen copy* of the coverage goal — frozen so that
history survives us changing what a preset means in a later release, and
survives the user renaming a pattern.

- `periodFor(ix, weekOf)` — the latest period starting on or before that week.
- A week earlier than every period gets the earliest one, which is the closest
  honest answer available.
- Periods start on a **Monday**, because a week is the unit of coverage.
  Switching on a Thursday applies to the whole of that week.
- Opening the *first* period on an account that pre-dates periods **backfills**
  the old one first. Without that, a first-ever switch hands every earlier week
  the new split and silently rescores all of it.

`coversFor()` narrows a goal to what the slots can actually reach, so an edit
that removes the only slot capable of holding a carry stops demanding one — a box
that can never be ticked is worse than no box.

## The strength score

One number for "how much do I move, relative to me", in
`model.ts` under `SCORED_PATTERNS`.

It is the sum of the best estimated one-rep max in each of the **five loaded**
patterns, scaled by **DOTS** — the published bodyweight-and-sex curve used in
competitive powerlifting.

- **DOTS rather than a bodyweight multiple.** Strength does not scale linearly
  with mass; dividing by bodyweight flatters a light lifter and punishes a heavy
  one. The curve is published, stable and checkable.
- **`sex` is asked for this and only this.** "Prefer not to say" takes the
  midpoint of the two curves and is a first-class answer.
- **Five patterns, not seven.** A carry is logged by distance, so its "reps" are
  metres and a 1RM estimated from them is not a number about strength. Rotation
  is trained light and anti-rotational by design.
- **An eight-week trailing window**, because it describes what you can do *now*.
  A pattern never trained counts as zero, so coverage moves the score too.
- **Null rather than a guess** when bodyweight is unknown. It is a ratio;
  inventing the denominator invents the answer.

Bodyweight is its own dated record (`bodyLogs`) rather than a profile field: the
score divides by what you weighed *that week*, and one current value would
rewrite what every past week meant every time you stepped on a scale.

`est1RM` is Epley **adjusted for reps in reserve** — without the RIR term a set
taken to failure and a set with three left look identical, which makes the whole
progress view lie.

## Double progression

`suggest()` is the rule, and it is never shown to the user — the *target* is.
Reach the top of the rep range on every set with something left in the tank and
the weight goes up while reps drop to the bottom. Nothing left in the tank means
repeat before adding. Otherwise chase one more rep.
