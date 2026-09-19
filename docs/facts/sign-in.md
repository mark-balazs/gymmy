---
id: sign-in
status: current
decided: "Confluence 934576149; 5736c24"
appears:
  repo: ["docs/architecture.md#the-system-and-what-it-talks-to", "e2e/flows/08-a-full-journey.md#preconditions", "e2e/flows/08-a-full-journey.md#notes", "docs/testing.md#fragilities-worth-knowing", "docs/openapi.yaml#/paths/~1api~1auth~1email-code", "docs/openapi.yaml#/paths/~1api~1auth~1callback~1resend", "README.md#known-gaps"]
  copy: ["app.signIn"]
  tests: ["e2e/tests/email-signin.spec.ts", "apps/web/src/lib/email-otp.test.ts", "apps/web/src/lib/sign-in-throttle.test.ts", "e2e/tests/journey.spec.ts"]
  confluence: ["934608916", "934379522", "934576149", "934445078", "934379542"]
---

Sign-in has no password: Continue with Google, or a six-digit email code (valid 10 minutes, once) shown only when RESEND_API_KEY is set. Code requests are limited per address and per client, and every outcome looks the same, so nobody can find out who has an account.
