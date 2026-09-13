# Testing

## Three layers, and which one a change belongs in

| Layer | Runs | Covers | Cost |
| --- | --- | --- | --- |
| `packages/domain/test` | Vitest, no IO | Every training rule | Instant |
| `apps/web/src/**/*.test.ts` | Vitest, **real Postgres** | Anything that is SQL | ~1s |
| `e2e/tests` | Playwright, production build, Pixel 7 | What a person does | ~25s for all of it |

Put logic in the domain layer and test it there. The domain has no dependencies,
so those tests need no fixtures, no database and no browser — which is why there
are ~140 of them and they run in under 200ms.

A test that would need a mocked database belongs in `apps/web` against the real
one instead. The seeding tests are there because the thing being tested *is* the
SQL — idempotence is a property of the ids and the conflict clauses, and a mock
would prove nothing about either.

## The e2e suite has two layers of its own

**Most specs bypass authentication**, inserting a user and a session row directly
(`e2e/fixtures/auth.ts`). Fast, independent, and no test-only code path in the
production build.

**Flow 08 does not bypass anything**, and it exists because that trade had a cost.
Email sign-in was broken from the day it shipped — the code was posted in the
request body and Auth.js reads it from the query string — and the suite stayed
green the whole time, because asking for a code was covered and entering one was
not.

> **If a step only ever happens on the way in, a fixture cannot cover it.**

Account creation, server-side seeding, the first sync onto an empty device and
the sign-out wipe all belong to the journeys in `journey.spec.ts`.

Flows are written up in [`e2e/flows`](../e2e/flows) *before* the tests that cover
them, and the README there maps each flow to its spec.

## The discipline that actually catches things

Adding a test is not the bar. **Break the fix and watch the test fail.**

Every significant fix in this codebase was verified that way, and it has twice
revealed that a test proved nothing:

- the sync-paging fix — reverted, the test failed, so the cursor bug is caught;
- the historisation guard — made periods retroactive, and *only* the new test
  failed, so nothing else was covering it;
- the email sign-in fix — reverted to a POST, and the three original
  "requesting a code" tests stayed green, which is precisely how it shipped;
- the seed repair — disabled, and the account hung on a loading screen;
- the coverage repair pass — disabled, and **nothing failed**, which is recorded
  as a known gap rather than pretended away.

Say in the commit message when you have done this. It is the difference between
a test and a decoration.

## Running it

```bash
docker compose up -d db
npm run db:migrate
npm run build        # e2e serves the last production build — always build first
npm test
```

Two ways the suite lies to you if you skip that:

- **`next start` serves the previous build.** A UI change tests the old one and
  passes for the wrong reason.
- **`reuseExistingServer` is on outside CI.** A `next dev` server left on :3000
  gets reused, and the service worker does not register in development — so the
  offline and PWA-update specs fail for a reason that has nothing to do with your
  change.

## Fragilities worth knowing

- **The sign-in throttle is shared.** It buckets by `x-forwarded-for`, which no
  test sends, so the whole suite shares one bucket. Any test asserting on an
  un-throttled response must call `resetSignInThrottle()` first.
- **Tab-bar locators must be `exact: true`.** A card whose description mentions
  "week" will otherwise match `link named "Week"`.
- **Charts need two weeks of data** before they render anything, so a test that
  locates one has to seed history *and* log something today.
