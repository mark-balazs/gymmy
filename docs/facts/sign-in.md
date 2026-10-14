---
id: sign-in
status: current
decided: "Confluence 934576149; 5736c24; GYM-124; per address and connection, so nobody elsewhere can lock an owner out: asked for by the owner on 2026-10-11; ten-digit codes chosen by the owner on 2026-10-12, who asked for existing mechanisms to be checked (GYM-154)"
appears:
  repo: ["docs/architecture.md#the-system-and-what-it-talks-to", "e2e/flows/08-a-full-journey.md#preconditions", "e2e/flows/08-a-full-journey.md#notes", "docs/testing.md#fragilities-worth-knowing", "docs/openapi.yaml#/paths/~1api~1auth~1email-code", "docs/openapi.yaml#/paths/~1api~1auth~1callback~1resend", "README.md#known-gaps"]
  copy: ["app.signIn"]
  tests: ["e2e/tests/email-signin.spec.ts", "apps/web/src/lib/email-otp.test.ts", "apps/web/src/lib/sign-in-throttle.test.ts", "e2e/tests/journey.spec.ts"]
  confluence: ["934379522", "934576149", "934445078", "934379542", "994672734"]
---

Sign-in has no password: Continue with Google, or a ten-digit email code (valid 10 minutes, once) shown only when RESEND_API_KEY is set. Only the newest code works. Trying codes is limited per address and connection (five tries in 15 minutes, ten a day), so nobody elsewhere can use up the owner's tries, and asking for them per address (two in five minutes) and per connection. Every outcome looks the same, so nobody can find out who has an account.
