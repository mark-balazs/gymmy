---
id: save-status-visible
status: current
decided: "7ddf6b1; owner 2026-09-19 (GYM-54, GYM-55)"
appears:
  repo: ["docs/README.md#invariants", "e2e/flows/05-offline.md#expected", "apps/web/src/components/app-shell.tsx"]
  copy: ["sync.idle", "sync.syncing", "sync.offline", "sync.error", "sync.storage", "sync.pending.one", "sync.pending.other"]
  tests: ["e2e/tests/write-failure.spec.ts", "e2e/tests/offline.spec.ts"]
  confluence: ["934608916", "934477845", "934543380", "934543437", "934445158"]
---

Every save reports its own failure. The header's sync dot is green when saved, amber offline and red when a change is saved on this device but not synced yet; a change not saved on this device at all shows a magenta warning triangle instead, so the two never look alike. Decided, not built yet: that warning stays until the person dismisses it (GYM-55).
