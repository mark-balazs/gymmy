---
id: train-screen
status: current
decided: "cbb4db0"
appears:
  repo: ["e2e/flows/02-logging-a-session.md#steps", "e2e/flows/11-entering-a-set.md#what-the-person-does", "e2e/flows/06-language.md#expected", "e2e/flows/01-first-run.md#steps"]
  copy: ["title.train", "common.day", "train.ofSets.one", "train.ofSets.other", "train.rowDone", "train.logSet", "train.addAnother", "train.nothingPlanned", "train.dayDone"]
  tests: ["e2e/tests/train-accordion.spec.ts", "packages/domain/test/model.test.ts", "packages/domain/test/one-off.test.ts", "e2e/tests/entry-modes.spec.ts", "e2e/tests/logging.spec.ts"]
  confluence: ["934608916"]
---

Train has a tab per plan day (Day A up to Day F) and opens on the first day not yet trained this week. One exercise card is open at a time and finishing it opens the next; a day is ticked once every planned set is done that week, on any date.
