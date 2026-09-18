# Flow 08 — A full journey

**Who:** somebody who has just heard about the app and has no account.

**Why it matters:** every other flow in this folder starts from a session row
inserted straight into the database. That is a deliberate trade — it keeps sixty
tests fast and independent — but it means the front door was never opened, and
neither was anything that hangs off it.

That gap was not theoretical. **Email sign-in was broken from the day it
shipped**: the form posted the code in the request body, and Auth.js reads it
off the query string, so it saw no token at all and answered with its own
"Server error" page. Every code ever entered failed. The suite was green the
whole time, because asking for a code was covered and entering one was not.

So this flow seeds nothing but the code that would have arrived by email, and
walks the rest.

## Preconditions

- `RESEND_API_KEY` set, so email sign-in is offered. Sending genuinely fails
  with the test key — that is fine and deliberate: the code is written to the
  database before it is sent, and the test reads it from there rather than from
  an inbox belonging to somebody else's service.
- No user, no profile, no library. The server creates all of it.

## Steps — signing up and coming back

1. Open `/sign-in`, enter an address, ask for a code.
2. Enter the code. The account does not exist yet, so this request is what
   creates the user *and* seeds the patterns and the slot skeleton. It seeds no
   exercises: the library is the shared catalogue. So this is also the one flow
   that runs an account with **no library rows of its own** end to end — every
   other spec's fixture writes the old per-account rows, which exercises the
   alias path instead.
3. Land in setup rather than on an empty Train tab. Answer the four questions.
4. Log a real set against a real generated exercise.
5. Check the Week tab: it is scored against the split that was chosen, not a
   default — five tiles for push/pull/legs.
6. Check Progress: the lift is there.
7. Sign out. Everything local is destroyed, so wait for the sync to settle
   first — anything that had not reached the server would be gone for good.
8. Sign in again. No setup this time, and the training comes back down onto a
   device that had been emptied.

## Steps — a second device

1. Sign up, set up and log a set on one device.
2. Open a genuinely separate browser context — its own storage, its own service
   worker, its own empty IndexedDB — and sign in to the same account.
3. The set is there.

## Expected

- A brand-new account can sign in at all. This is the assertion that was
  missing, and it is the one that matters most: nothing else works without it.
- The default library exists without anyone inserting it, which is only
  provable by letting the server do it.
- Onboarding runs once. Coming back lands on Train, not on setup.
- A set survives the device being wiped — the sign-out path destroys local
  storage, so anything that comes back afterwards came from the server.
- The same account on a different device shows the same training. A reload only
  proves IndexedDB kept it; a second device proves the sync did.

## Notes

**These do not replace the fixture-based specs, and should not.** A focused test
that needs three weeks of history under an earlier split has no business
spending twenty seconds signing in first, and sixty tests that each walk the
whole app would be slow enough that nobody runs them. The two layers do
different jobs:

| Layer | Starts from | Good for |
| --- | --- | --- |
| Fixture specs | A session row and pre-seeded state | Behaviour in one screen, awkward states, anything needing history |
| Journeys | Nothing but an email address | The seams between screens, and everything the server does on first contact |

The rule of thumb: **if a step only ever happens on the way in, a fixture cannot
cover it.** Account creation, server-side seeding, the first sync onto an empty
device and the sign-out wipe are all that kind of step.

**Throttling cannot make these flaky.** Requesting a code more often than the
limit answers `429`, and the form advances anyway — deliberately, so a stranger
cannot tell a rate limit from an unknown address. The code these tests use was
written to the database directly, so it stays valid either way.
