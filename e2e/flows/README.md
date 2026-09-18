# End-to-end user flows

Each flow below describes something a real person does with the app, written
before the test that covers it. Every file maps to one spec in `../tests`.

| Flow | Spec | What it proves |
| --- | --- | --- |
| [01 — First run](./01-first-run.md) | `first-run.spec.ts` | Four questions produce a complete, covered week |
| [02 — Logging a session](./02-logging-a-session.md) | `logging.spec.ts` | A set can be logged and shows the right derived numbers |
| [03 — Weekly coverage](./03-weekly-coverage.md) | `coverage.spec.ts` | Gaps are visible, and isolation never fills one |
| [04 — What the card offers you](./04-progression.md) | `progression.spec.ts` | The card shows last time as history, and gives no advice about what to lift |
| [05 — Training offline](./05-offline.md) | `offline.spec.ts` | The core action works with no network, and recovers |
| [06 — Language](./06-language.md) | `language.spec.ts` | Hungarian is complete and grammatically correct |
| [07 — Choosing a split](./07-choosing-a-split.md) | `splits.spec.ts`, `custom-split.spec.ts` | Familiar splits are available without giving up coverage, and you can build your own |
| [08 — A full journey](./08-a-full-journey.md) | `journey.spec.ts` | A stranger can sign up, train, leave and come back |
| [09 — What the weight box is counting](./09-load-convention.md) | `load-convention.spec.ts` | The app says what it measures, and a dumbbell pair is stored combined |
| [10 — Logging something outside the plan](./10-something-else.md) | `one-off.spec.ts` | A class or a test can be logged without ticking, or moving, a planned day |

Other specs cover narrower ground against the same fixtures: `settings`,
`exercise-detail`, `email-signin`, `sync-paging`, `write-failure`, `recovery`,
`boot-watchdog` and `pwa-update`.

## Two layers, on purpose

**Most specs bypass authentication.** Driving Google's real OAuth consent screen
in CI is slow, brittle and depends on a third party's uptime, so
`fixtures/auth.ts` inserts a user and a database-backed session row and sets the
session cookie directly. The app cannot tell the difference, and no test-only
code path ships.

**Flow 08 does not bypass anything**, and it exists because that trade had a
cost nobody had paid attention to. Email sign-in was broken from the day it
shipped — the code went in the request body, Auth.js reads it from the query
string — and the suite stayed green, because asking for a code was covered and
entering one was not. A fixture that starts from a session row can never catch
that.

So: **if a step only ever happens on the way in, a fixture cannot cover it.**
Account creation, the server-side seeding of a new account's rows, the first sync
onto an empty device and the sign-out wipe all belong to the journeys. Everything
else stays fast and focused.

**Each test gets its own user.** Tests run in parallel against one database, so
a shared account would make them interfere. A fresh user per test also means
each one starts from the real first-run state rather than someone else's
leftovers.

**Assertions target behaviour, not markup.** Where practical the tests look for
what the user would read — "1 / 7", "62.5 kg × 6" — so a restyle does not break
them but a broken calculation does.

## Running

```bash
docker compose up -d db          # Postgres
npm run db:migrate               # schema
npm run build                    # e2e runs against a production build
npm run test:e2e
```

`npm run test:e2e -w @athletic/e2e -- --ui` opens the Playwright inspector.
