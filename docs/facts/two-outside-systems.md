---
id: two-outside-systems
status: current
decided: "Confluence 934379522 (C1); 5736c24"
appears:
  repo: ["docs/architecture.md#the-system-and-what-it-talks-to", "docs/openapi.yaml#/tags"]
  copy: ["app.signIn", "app.signInWhy"]
  tests: []
  confluence: ["934379522", "934445078", "934379542", "934608974"]
---

gymmy talks to exactly two outside systems, both only for sign-in: Google and Resend (the code email). There is no analytics, crash reporter, push service, payment provider, object storage or feature flags, and training data is never sent to any third party.
