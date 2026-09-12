# End-to-end user flows

Each flow below describes something a real person does with the app, written
before the test that covers it. Every file maps to one spec in `../tests`.

| Flow | Spec | What it proves |
| --- | --- | --- |
| [01 — First run](./01-first-run.md) | `first-run.spec.ts` | Four questions produce a complete, covered week |
| [02 — Logging a session](./02-logging-a-session.md) | `logging.spec.ts` | A set can be logged and shows the right derived numbers |
| [03 — Weekly coverage](./03-weekly-coverage.md) | `coverage.spec.ts` | Gaps are visible, and isolation never fills one |
| [04 — Progressive overload](./04-progression.md) | `progression.spec.ts` | The app tells you what to lift next, and the rule is right |
| [05 — Training offline](./05-offline.md) | `offline.spec.ts` | The core action works with no network, and recovers |
| [06 — Language](./06-language.md) | `language.spec.ts` | Hungarian is complete and grammatically correct |
| [07 — Choosing a split](./07-choosing-a-split.md) | `splits.spec.ts` | Familiar splits are available without giving up coverage |

## Conventions

**Authentication is bypassed, not simulated.** Driving Google's real OAuth
consent screen in CI is slow, brittle and depends on a third party's uptime.
Instead `fixtures/auth.ts` inserts a user and a database-backed session row and
sets the session cookie directly. This tests our session handling honestly —
the app cannot tell the difference — while leaving no test-only code path in the
production build.

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
