---
id: train-last-time
status: current
decided: "D-014; c048e7a"
supersedes:
superseded_by:
appears:
  repo: ["docs/training-model.md#what-the-train-card-offers-you", "e2e/flows/04-progression.md#expected--the-record-is-there", "e2e/flows/11-entering-a-set.md#what-the-person-does", "e2e/flows/02-logging-a-session.md#steps"]
  copy: ["train.lastTime", "train.noHistory", "entry.emptyBar"]
  tests: ["packages/domain/test/coach.test.ts", "packages/domain/test/entry.test.ts", "packages/domain/test/one-off.test.ts", "e2e/tests/progression.spec.ts", "e2e/tests/entry-modes.spec.ts"]
  confluence: ["934445059", "934608897", "934543418", "934608916", "934608935", "934543399", "934445118"]
---

A Train card prefills last time: the heaviest weight in the latest session on that lift and the fewest reps at it, labelled as history ('Last time 60 kg × 8 · date'). With no history it starts at neutral numbers (empty bar, 10 kg dumbbells, 20 kg machine, no added weight), a starting point rather than advice.
