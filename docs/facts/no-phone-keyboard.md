---
id: no-phone-keyboard
status: current
decided: "31a6519; owner, week of 2026-09-14"
appears:
  repo: ["e2e/flows/11-entering-a-set.md#why-this-flow-exists", "e2e/flows/11-entering-a-set.md#what-these-tests-hold", "docs/training-model.md#what-the-train-card-offers-you", "docs/architecture.md#the-layers-and-what-may-import-what", "docs/architecture.md#how-a-set-gets-saved", "docs/data.md#what-is-stored", "docs/openapi.yaml#/components/schemas/Profile"]
  copy: ["set.entryTitle", "set.entryButtons", "set.entryRuler", "set.entryHint", "set.plateLoader", "set.plateLoaderHint", "entry.typeWeight", "entry.typeReps", "entry.weight", "entry.reps", "entry.done", "entry.cancel", "entry.delete", "entry.bar", "entry.barPick", "entry.addPlate", "entry.removePlate", "entry.barSplit", "entry.emptyBar", "entry.notInPlates", "entry.belowBar", "entry.none", "entry.more", "entry.less"]
  tests: ["e2e/tests/entry-modes.spec.ts", "packages/domain/test/entry.test.ts", "packages/domain/test/prefs.test.ts", "e2e/tests/bad-input.spec.ts"]
  confluence: ["934608916", "934445118", "934445138"]
---

Train never opens the phone's keyboard: weight and reps are set with Buttons (default) or a Ruler, and tapping a number opens gymmy's own keypad. 'Load the bar' (on by default) shows barbell weight as plates. Every weight on a scale is written with the same decimals (60.0, 62.5; whole kilos stay whole) on every control, so the number keeps its width as it changes.
