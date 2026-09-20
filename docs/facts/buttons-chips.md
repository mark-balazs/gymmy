---
id: buttons-chips
status: current
decided: "GYM-82, owner 2026-09-19"
appears:
  repo: ["docs/training-model.md#what-the-train-card-offers-you", "e2e/flows/11-entering-a-set.md#why-this-flow-exists", "e2e/flows/11-entering-a-set.md#what-these-tests-hold"]
  copy: ["entry.recentWeights", "entry.repsInRange"]
  tests: ["packages/domain/test/coach.test.ts", "packages/domain/test/entry.test.ts", "e2e/tests/entry-modes.spec.ts"]
  confluence: ["934608916"]
---

In Buttons mode each Train card has one-tap chips: under the weight, the last four distinct weights logged on that lift, newest first, and no row at all until it has been trained, because a chip is never a weight the person has not lifted; under the reps, every number in the exercise's rep range, a carry's metres stepping in fives. The chip holding the number on screen reads as pressed, tapping one sets the number without opening the keypad, and the rows scroll sideways rather than wrapping. The −/+ buttons stay, Ruler and Load the bar have no chips, and there is no setting to switch them off.

The owner's reason: in the gym the reps change every set and weight jumps take many taps, so one tap should set the number.
