---
id: local-first
status: current
decided: "D-001"
appears:
  repo: ["README.md#offline-first", "docs/README.md#invariants", "docs/architecture.md#the-pieces-that-run", "docs/architecture.md#how-a-set-gets-saved", "e2e/flows/05-offline.md#flow-05--training-offline", "e2e/flows/05-offline.md#expected", "docs/openapi.yaml#/info"]
  copy: ["sync.offline", "sync.pending"]
  tests: ["e2e/tests/offline.spec.ts", "e2e/tests/journey.spec.ts", "e2e/tests/logging.spec.ts"]
  confluence: ["934445059", "934608897", "934543418", "934608916", "934543399", "934543361", "934379522", "934445098", "934445118", "934445138", "934477845", "934543380", "934445078", "934379542", "934445178"]
---

The phone holds all of a person's training and every screen reads from it, never waiting on the network; the server is a copy that catches up. Logging a set never fails for lack of signal, and sets logged offline sync later.

Gyms often have no signal; working offline is the normal case, not a fallback.
