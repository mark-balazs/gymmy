---
id: save-status-visible
status: current
decided: "7ddf6b1; owner 2026-09-19 (GYM-54, GYM-55); owner 2026-09-20 (GYM-57)"
appears:
  repo: ["docs/README.md#invariants", "docs/architecture.md#how-a-set-gets-saved", "docs/architecture.md#offline-and-recovery", "e2e/flows/05-offline.md#expected", "apps/web/src/components/app-shell.tsx"]
  copy: ["sync.idle", "sync.syncing", "sync.offline", "sync.error", "sync.storage", "sync.storageWarn", "sync.dismiss", "sync.pending.one", "sync.pending.other", "sync.signedOut.one", "sync.signedOut.other", "sync.signedOutIdle"]
  tests: ["e2e/tests/write-failure.spec.ts", "e2e/tests/offline.spec.ts", "e2e/tests/recovery.spec.ts", "apps/web/src/lib/client/sync.test.ts"]
  confluence: ["934608916", "934477845", "934543380", "934543437", "934445158", "934445118", "934477826"]
---

Every save reports its own failure. The header's sync dot is green when saved or a change is waiting its turn, grey while syncing, amber offline and red when a sync attempt failed or the session has ended; the change is still safe on this device and goes with the next sync that works. A session that has ended reads "Sign in to send 3 changes", never "offline", because waiting will not fix it. A change not saved on this device at all shows a magenta warning triangle instead, so the two never look alike, and a one-line warning in the header that stays until the person dismisses it, through any sync and across a reload.
