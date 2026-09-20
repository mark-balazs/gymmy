---
id: never-a-dead-end
status: current
decided: "f5598c9; owner 2026-09-20 (GYM-57); Confluence 934608897"
appears:
  repo: ["docs/architecture.md#offline-and-recovery", "docs/README.md#invariants", "docs/data.md#seeding", "docs/openapi.yaml#/paths/~1api~1sync"]
  copy: ["err.title", "err.body", "err.retry", "err.reload", "err.reset", "err.resetQ", "err.resetSafe", "err.resetPending.one", "err.resetPending.other", "err.resetUnknown", "err.resetGo", "err.stuckTitle", "err.stuckDetail", "sync.signedOut.one", "sync.signedOut.other", "sync.signedOutIdle"]
  tests: ["e2e/tests/recovery.spec.ts", "e2e/tests/boot-watchdog.spec.ts", "apps/web/src/middleware.test.ts"]
  confluence: ["934608897", "934608916", "934445118", "934477826", "934477845", "934445178"]
---

The app never leaves a person stuck: a crash offers a reset, a stuck loading screen gives up after 12 seconds, a boot watchdog shows a message even if the app fails to load, the server repairs any account with no profile, and a session that has ended says "Sign in to send 3 changes" instead of looking like bad signal. No way out deletes training: the watchdog replaces only the app's own copy of itself, clears nothing at all when offline, and if a fresh copy does not help it stops and shows the error to send to support rather than wiping. The one screen that can still empty a device is the reset the person taps themselves, which says how many changes would go. Known exception, being specced from its root cause (GYM-57): a change the server rejects blocks syncing until sign-out.
