---
id: sign-in
status: current
decided: "Confluence 934576149; 5736c24; GYM-124; per address and connection, so nobody elsewhere can lock an owner out: asked for by the owner on 2026-10-11; ten-digit codes chosen by the owner on 2026-10-12, who asked for existing mechanisms to be checked (GYM-154); put live without trying them on a phone, the owner's answer on 2026-10-24: 'Ten digits now' (GYM-180)"
appears:
  repo: ["docs/architecture.md#the-system-and-what-it-talks-to", "e2e/flows/08-a-full-journey.md#preconditions", "e2e/flows/08-a-full-journey.md#notes", "docs/testing.md#fragilities-worth-knowing", "docs/openapi.yaml#/paths/~1api~1auth~1email-code", "docs/openapi.yaml#/paths/~1api~1auth~1callback~1resend", "README.md#known-gaps"]
  copy: ["app.signIn"]
  tests: ["e2e/tests/email-signin.spec.ts", "apps/web/src/lib/email-otp.test.ts", "apps/web/src/lib/sign-in-throttle.test.ts", "e2e/tests/journey.spec.ts"]
  confluence: ["934379522", "934576149", "934445078", "934379542", "994672734"]
---

Sign-in has no password: Continue with Google, or a ten-digit email code (valid 10 minutes, once) shown only when RESEND_API_KEY is set. Only the newest code works, though two codes asked for at the same moment can rarely both work. Trying codes is limited per address and connection (five tries in 15 minutes, ten a day) and per connection (30 in 15 minutes), never per address alone, so nobody elsewhere can use up the owner's tries; asking for codes is limited per address (two in five minutes) and per connection (20 in 15 minutes). Every outcome looks the same, so nobody can find out who has an account.
