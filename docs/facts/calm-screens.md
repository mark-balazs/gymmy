---
id: calm-screens
status: current
decided: "owner 2026-09-18/19; GYM-19, GYM-20, GYM-21"
appears:
  repo: ["docs/architecture.md#motion", "docs/architecture.md#sheets", "e2e/flows/13-closing-a-sheet.md"]
  copy: []
  tests: ["e2e/tests/info-tip.spec.ts", "e2e/tests/motion.spec.ts", "e2e/tests/sheets.spec.ts", "e2e/tests/logging-moments.spec.ts", "apps/web/src/components/motion.test.ts"]
  confluence: ["934608916", "934445118"]
---

Explanations sit behind an ⓘ; only what prevents a wrong entry, lost data or a blank screen stays on screen. On/off settings are the phone's own switches, sheets slide away and can be pulled down to close, and all movement uses one short set of timings; with reduced motion on, only brief fades remain.
