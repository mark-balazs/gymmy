---
id: split-presets
status: current
decided: "d37556d (splits.ts)"
appears:
  repo: ["README.md#splits-and-coverage", "docs/training-model.md#splits", "e2e/flows/07-choosing-a-split.md#the-presets", "e2e/flows/07-choosing-a-split.md#understanding-one-before-choosing-it", "e2e/flows/07-choosing-a-split.md#steps--at-first-run", "packages/domain/src/splits.ts"]
  copy: ["set.split", "onboard.q0.title", "split.sevenPattern", "split.sevenPatternH", "split.pushPullLegs", "split.pushPullLegsH", "split.upperLower", "split.upperLowerH", "split.custom", "split.minDays.one", "split.minDays.other", "split.info", "split.about", "split.range", "split.complete", "split.completeBody", "split.sevenPatternWhy", "split.pushPullLegsWhy", "split.upperLowerWhy"]
  tests: ["packages/domain/test/splits.test.ts", "packages/domain/test/model.test.ts", "e2e/tests/splits.spec.ts", "e2e/tests/custom-split.spec.ts"]
  confluence: ["934608916", "934608935", "934543418"]
---

Four split choices: seven patterns (2–4 days, complete means all seven), Push/Pull/Legs (3–6 days) and Upper/Lower (2–6 days), both complete with push, pull, squat, hinge and lunge, or your own. Only the seven-pattern split asks for rotation and carry, and a day count a split cannot cover is not offered.
