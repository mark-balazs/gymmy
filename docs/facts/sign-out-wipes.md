---
id: sign-out-wipes
status: current
decided: "d7cc5b7; Confluence 934543437"
appears:
  repo: ["e2e/flows/08-a-full-journey.md#steps--signing-up-and-coming-back", "e2e/flows/08-a-full-journey.md#expected", "docs/data.md#what-is-stored", "docs/testing.md#the-e2e-suite-has-two-layers-of-its-own"]
  copy: ["app.signOut"]
  tests: ["e2e/tests/journey.spec.ts"]
  confluence: ["934543418", "934576149", "934543380", "934543437", "934445158"]
---

Signing out tries one last sync, then wipes the device regardless, so the next person on that phone inherits nothing; signing out while offline loses sets that had not synced. So support must never tell someone whose training is missing to sign out, reinstall or clear site data: each wipes the device, which may hold the only copy.
