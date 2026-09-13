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

**Update the documentation after you implement.** There are two sets and they
are not duplicates. Both are part of the change, not a follow-up.

### 1. `docs/` — for whoever next edits the code

The map later sessions read before touching anything. A change that moves a
boundary, adds a table, or breaks an assumption written down there has not
landed until the map says so. The README's "Known gaps" section is part of this
— an entry that is no longer true is worse than no entry.

### 2. Confluence — for everyone else

[gymmy — documentation](https://dextra.atlassian.net/wiki/spaces/~712020296b34b54b84454489d16860c808e925/pages/934445059)
is the product, architecture, infrastructure, operations and decision
documentation, read by people who will never open this repository.

**It goes stale silently.** Nothing in CI can check it, and nobody notices for
months — by which point somebody has acted on a page that describes an app we no
longer ship. So it is a step in the work, in the same commit, every time.

Use this table to find the page. If your change is in the left column, the right
column is not optional:

| If your change… | Update |
| --- | --- |
| adds or removes a screen, or rearranges one | **Product → Feature reference** |
| changes what a feature *does* (not how it looks) | **Product → Feature reference** |
| touches a pattern, split, progression rule, the strength score, or a verdict threshold | **Product → How the training model works** |
| targets a new kind of user, or drops a use case | **Product → Who it is for** |
| changes the pitch, the promises, or what gymmy refuses to be | **Product → What gymmy is** |
| adds or drops an external system | **Architecture → C1** |
| adds a container, or moves a responsibility between client and server | **Architecture → C2** |
| gives a component a new responsibility | **Architecture → C3** |
| changes one of the load-bearing shapes, or adds a new shape mistake worth recording | **Architecture → C4** |
| adds a table, or changes what a column means | **Architecture → Data model** |
| changes a route, the sync envelope, a status code, or a rate limit | **API** (overview, `/api/sync`, or Authentication) |
| adds an environment variable, changes hosting, or changes a CI job | **Infrastructure** |
| changes a deploy, migration or support procedure — or you hit a failure that took real work to diagnose | **Runbooks** |
| settles a question that would be a project to reverse | **Decision log** (append; never edit an entry — mark it superseded) |

Every page ends with an **"update this page when"** note. If yours is not in the
table, that note is the tiebreak. If it is genuinely neither, it probably does
not need a Confluence change — say so rather than guessing.

**Prose, not a changelog.** These pages say what is true now and why, in the
same voice as the rest. Do not append "as of March we also…"; rewrite the
sentence that is now wrong.

## Before you say it works

`npm run format && npm run lint && npm run typecheck && npm run build && npm test`

`npm test` runs the domain, web and e2e suites. The e2e suite serves the last
**production build**, so an untested UI change will silently test the previous
one — build first, always. It also reuses anything already listening on :3000,
so stop a dev server before running it.

And the part no command checks: **is the documentation current?** Both sets.

@AGENTS.md
