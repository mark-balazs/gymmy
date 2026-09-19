---
id: save-status-visible
status: current
decided: "7ddf6b1; owner 2026-09-19 (GYM-54, GYM-55)"
appears:
  repo: ["docs/README.md#invariants", "docs/architecture.md#how-a-set-gets-saved", "e2e/flows/05-offline.md#expected", "apps/web/src/components/app-shell.tsx"]
  copy: ["sync.idle", "sync.syncing", "sync.offline", "sync.error", "sync.storage", "sync.storageWarn", "sync.dismiss", "sync.pending.one", "sync.pending.other"]
  tests: ["e2e/tests/write-failure.spec.ts", "e2e/tests/offline.spec.ts", "apps/web/src/lib/client/sync.test.ts"]
  confluence: ["934608916", "934477845", "934543380", "934543437", "934445158", "934445118", "934477826"]
---

Every save reports its own failure. The header's sync dot is green when saved or a change is just waiting its turn, grey while syncing, amber offline and red when a sync attempt failed; the change is still safe on this device and goes with the next sync that works. A change not saved on this device at all shows a magenta warning triangle and a line of warning under the header instead, so the two never look alike, and that warning stays until the person dismisses it, whatever the sync does next and across a reload.
