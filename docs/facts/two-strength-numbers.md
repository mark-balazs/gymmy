---
id: two-strength-numbers
status: current
decided: "D-015; owner, week of 2026-09-14"
supersedes: single-strength-score
superseded_by:
appears:
  repo: ["README.md#two-strength-numbers", "docs/training-model.md#the-two-strength-numbers", "docs/training-model.md#strengthat--gymmys-own-index", "docs/training-model.md#true-of-both"]
  copy: ["prog.strength", "prog.strengthWhat", "prog.strengthNot", "prog.dots", "prog.dotsWhat", "prog.dotsBody", "prog.dotsNot"]
  tests: ["packages/domain/test/strength.test.ts", "e2e/tests/progress.spec.ts", "e2e/tests/calendar.spec.ts"]
  confluence: ["934608897", "934543418", "934608916", "934608935", "934543399", "934445118", "934576168", "934838294"]
---

Progress shows two strength numbers: gymmy's strength index ('am I getting stronger?') and DOTS ('how do I compare?'). Both come from eight weeks of estimates and read higher than a meet total, which the screen says; the index shows in the tens with one decimal, DOTS as a whole number in the hundreds.
