# Working on gymmy

Start with [`docs/README.md`](./docs/README.md) — the architecture map, the
invariants that must not be broken, and where each thing lives.

## How to work here

**Plan before you implement.** Say what the solution is and which direction you
are taking technically — where the change belongs, what it touches, what it
rules out — before writing code. Most of the expensive mistakes in this codebase
have been shape mistakes rather than typos: seeding put somewhere it could only
run once, loads keyed on the wrong thing, a form posting where the framework was
reading from somewhere else. None of those were caught by writing the code more
carefully; they were caught by thinking about the shape first.

**Extend the tests as you go, not afterwards.** A change without a test that
would have failed before it is not finished. The discipline that has actually
caught things here is stronger than "add a test": **break the fix and watch the
test fail.** If disabling your change leaves the suite green, the test is
decoration. Say so in the commit when you have done it.

Note which layer the test belongs in — `packages/domain` for logic, `apps/web`
for anything touching the database, `e2e` for what a person does. And remember
that a fixture starting from a session row can never cover a step that only
happens on the way in; that is what `e2e/flows/08` exists for.

**Update the documentation after you implement.** `docs/` is the map later
sessions read before touching anything; a change that moves a boundary, adds a
table, or breaks an assumption written down there has not landed until the map
says so. The README's "Known gaps" section is part of this — an entry that is no
longer true is worse than no entry.

## Before you say it works

`npm run format && npm run lint && npm run typecheck && npm run build && npm test`

`npm test` runs the domain, web and e2e suites. The e2e suite serves the last
**production build**, so an untested UI change will silently test the previous
one — build first, always. It also reuses anything already listening on :3000,
so stop a dev server before running it.

@AGENTS.md
