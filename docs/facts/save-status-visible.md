---
id: save-status-visible
status: current
decided: "7ddf6b1"
appears:
  repo: ["docs/README.md#invariants", "e2e/flows/05-offline.md#expected", "apps/web/src/components/app-shell.tsx"]
  copy: ["sync.idle", "sync.syncing", "sync.offline", "sync.error", "sync.storage", "sync.pending"]
  tests: ["e2e/tests/write-failure.spec.ts", "e2e/tests/offline.spec.ts"]
  confluence: ["934608916", "934477845", "934543380", "934543437", "934445158"]
---

Every save reports its own failure. The header's sync dot (green saved, amber offline, red needs attention) is meant to keep 'not saved on this device' apart from 'not synced yet', but today both show the same red. Decided, not built yet: a storage failure gets its own colour and icon (GYM-54), and its warning stays until the person dismisses it (GYM-55).
