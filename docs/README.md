# The map

Read this before changing anything. It is written for whoever picks the codebase
up next — including a future session with no memory of this one.

The root [`README.md`](../README.md) says what gymmy *is* and how to run it. This
folder says how it is *built*, and which parts will bite you.

| Document | What it answers |
| --- | --- |
| [architecture.md](./architecture.md) | The layers, what may import what, and how a set gets from a thumb to Postgres |
| [training-model.md](./training-model.md) | Patterns, splits, coverage, historisation, the strength score |
| [data.md](./data.md) | Tables, migrations, the sync protocol, the local store, seeding |
| [testing.md](./testing.md) | The three test layers and which one a change belongs in |

## The shape in one paragraph

A Next.js app over an npm-workspace monorepo. `packages/domain` holds every
training rule as pure functions with **no dependencies at all** — no React, no
Next, no DOM — so they run identically on a phone and on the server and are
testable without either. `apps/web` is the app: React pages that read from
IndexedDB, a single sync endpoint, and Postgres behind it. `e2e` drives the whole
thing in a real browser.

## Invariants

These are the things that took real damage to learn. Breaking one is not a
regression in a feature, it is a regression in what the app *is*.

**The past is never rewritten.** Changing your split does not change what last
January meant. Coverage is scored against the `SplitPeriod` in force that week,
and periods are append-only. Any code that edits an existing period, or that
starts a new one earlier than this Monday, is wrong. See
[training-model.md](./training-model.md#historisation).

**The local database is the source of truth while you use the app.** Reads never
touch the network; writes land in IndexedDB and are queued. The server is a
replica that catches up, not a gatekeeper. A feature that cannot work offline
needs to say so out loud.

**Every write reports its failure.** `mutations.put` surfaces a storage failure
as a distinct state from a sync failure, because "saved here, not there yet" and
"not saved anywhere" are different facts and only one of them loses a set.

**Nothing user-visible is English-only by accident.** Copy goes through the
dictionary; pattern, slot, day and split names translate by key with the user's
own wording winning where they renamed something.

**The app must never be unrecoverable.** There is an error boundary, a stuck-load
deadline, a boot watchdog that runs without React, and a sync-time repair for an
account that was never seeded. Each exists because a real person got stuck.

## Why this is Markdown and not a graph

It was worth asking, and the answer is that a graph would make the documentation
harder to keep true.

The consumer here is a coding session, and what it actually does is read files,
grep them, and diff them in review. Markdown in the repo travels in the same
commit as the change it describes, so a reviewer sees the map go stale in the
same diff that made it stale. A separate graph store does not appear in that
diff at all, which is exactly how documentation rots — and a graph rots quietly,
because there is no paragraph to read and notice is wrong.

The genuinely useful half of the idea is here anyway: each document is one
concept with stable headings, and they link to each other and into the code. That
is a graph you can read, grep and review.

Where a graph would actually earn its place is **derived** from the source —
imports, tables, routes — by a script, so it cannot disagree with the code. That
is a worthwhile thing to build and a different thing from this.
