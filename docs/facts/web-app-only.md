---
id: web-app-only
status: current
decided: "Confluence 949551107; owner, week of 2026-09-14"
supersedes:
superseded_by:
appears:
  repo: ["docs/architecture.md#the-pieces-that-run", "docs/architecture.md#offline-and-recovery", "docs/data.md#rollout-windows-what-a-device-one-build-behind-sees", "README.md#known-gaps", "apps/web/src/components/sw-register.tsx"]
  copy: []
  tests: ["e2e/tests/pwa-update.spec.ts", "e2e/tests/offline.spec.ts"]
  confluence: ["934445059", "934608916", "934445098", "934379562", "934445158", "949551107"]
---

gymmy is an installable web app with no App Store or Play Store version, so app-store fees (EU, from 1 October 2026) never apply. An installed copy updates itself after a deploy, reloading the next time it is out of view, with no store update.
