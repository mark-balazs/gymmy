---
id: split-history
status: current
decided: "D-004"
appears:
  repo: ["README.md#coverage-is-historised", "docs/README.md#invariants", "docs/training-model.md#historisation", "e2e/flows/07-choosing-a-split.md#historisation--the-part-that-is-easy-to-get-wrong", "e2e/flows/07-choosing-a-split.md#expected-2", "e2e/flows/07-choosing-a-split.md#boundaries", "e2e/flows/03-weekly-coverage.md#weeks-keep-their-own-meaning", "docs/data.md#what-is-stored", "docs/openapi.yaml#/components/schemas/SplitPeriod"]
  copy: ["week.scoredAs", "week.scoredAsWhy", "onboard.q0.sub", "split.editIntro", "prog.patternsBody", "prog.cellNotAsked.one", "prog.cellNotAsked.other"]
  tests: ["packages/domain/test/model.test.ts", "packages/domain/test/insights.test.ts", "e2e/tests/splits.spec.ts", "e2e/tests/custom-split.spec.ts"]
  confluence: ["934445059", "934608897", "934543418", "934608916", "934608935", "934543399", "934445118", "934477826", "934445138"]
---

Changing split starts a period from this Monday (a second change that week replaces it) and never edits an older one; each period freezes what counted as a complete week. Every week is scored against the split in force that week, marked 'Scored as' and that split's name when it differs.

The past is never rewritten: changing split in March leaves January as it was trained.
