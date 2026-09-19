---
id: never-a-dead-end
status: current
decided: "f5598c9; Confluence 934608897"
appears:
  repo: ["docs/architecture.md#offline-and-recovery", "docs/README.md#invariants", "docs/data.md#seeding", "docs/openapi.yaml#/paths/~1api~1sync"]
  copy: ["err.title", "err.body", "err.retry", "err.reload", "err.reset", "err.resetQ", "err.resetSafe", "err.resetPending.one", "err.resetPending.other", "err.resetGo", "err.stuckTitle", "err.stuckDetail"]
  tests: ["e2e/tests/recovery.spec.ts", "e2e/tests/boot-watchdog.spec.ts"]
  confluence: ["934608897", "934608916", "934445118", "934477826", "934477845", "934445178"]
---

The app never leaves a person stuck: a crash offers a reset, a stuck loading screen gives up after 12 seconds, a boot watchdog shows a message even if the app fails to load, and the server repairs an account that was never set up. Known exceptions, being specced from their root causes (GYM-57): a change the server rejects blocks syncing until sign-out, and a half-finished setup is not repaired.
