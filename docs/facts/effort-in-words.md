---
id: effort-in-words
status: current
decided: "D-014; 2cc3b1b"
supersedes:
superseded_by:
appears:
  repo: ["e2e/flows/02-logging-a-session.md#expected", "e2e/flows/02-logging-a-session.md#notes", "docs/training-model.md#what-the-train-card-offers-you", "docs/training-model.md#it-refuses-to-estimate-above-10-reps-to-failure", "docs/openapi.yaml#/components/schemas/SetLog"]
  copy: ["effort.q", "effort.0", "effort.1", "effort.2", "effort.4", "effort.0s", "effort.1s", "effort.2s", "effort.4s"]
  tests: ["e2e/tests/logging.spec.ts", "packages/domain/test/model.test.ts"]
  confluence: ["934608897", "934543418", "934608916", "934608935", "934543399"]
---

Each set records how it felt, chosen in words on the card: Nothing left, 1 more, 2 more or Easy (stored as 0, 1, 2 or 4 reps in reserve; default 2 more). It never shows a number or 'RIR', and the answer feeds only the one-rep-max estimate.
