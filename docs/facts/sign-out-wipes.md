---
id: sign-out-wipes
status: current
decided: "d7cc5b7; Confluence 934543437"
appears:
  repo: ["e2e/flows/08-a-full-journey.md#steps--signing-up-and-coming-back", "e2e/flows/08-a-full-journey.md#expected", "docs/data.md#what-is-stored", "docs/testing.md#the-e2e-suite-has-two-layers-of-its-own"]
  copy: ["app.signOut", "set.leaveOffline", "set.unsentQ", "set.unsent.one", "set.unsent.other", "set.unsentBody", "set.unsentGo"]
  tests: ["e2e/tests/journey.spec.ts", "apps/web/src/lib/client/sync.test.ts"]
  confluence: ["934543418", "934576149", "934543380", "934543437", "934445158"]
---

Signing out stops the sync, pushes until the queue is empty, then wipes the device, so the next person on that phone inherits nothing. It is refused while offline, and anything it could not send is counted on screen and thrown away only on a second tap. Support must still never tell someone whose training is missing to reinstall or clear site data: each wipes the device, which may hold the only copy.
