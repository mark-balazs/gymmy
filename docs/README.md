# The map

Read this before changing anything. It is written for whoever picks the codebase
up next — including a future session with no memory of this one.

The root [`README.md`](../README.md) says what gymmy *is* and how to run it. This
folder says how it is *built*, and which parts will bite you.

| Document | What it answers |
| --- | --- |
| [architecture.md](./architecture.md) | The layers, what may import what, and how a set gets from a thumb to Postgres |
| [training-model.md](./training-model.md) | Patterns, splits, coverage, historisation, load conventions, the two strength numbers, the triage |
| [data.md](./data.md) | Tables, migrations, the sync protocol, the local store, seeding |
| [openapi.yaml](./openapi.yaml) | **The HTTP contract.** Every endpoint, every row schema, every status code |
| [testing.md](./testing.md) | The three test layers and which one a change belongs in |
| [facts/](./facts/README.md) | **What is true about gymmy**, one file per rule, decision, plan or price, each saying where else it is stated |
| [fact-check.md](./fact-check.md) | The weekly check that compares the register with Confluence and the code, and files each mismatch |

`openapi.yaml` is the only document here a build can check: `openapi.test.ts`
holds it against the Zod schemas the server validates with, so it cannot quietly
fall behind the code the way prose does.

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

**The database stores what happened, never what it means.** A set row carries the
weight, the reps and the reps in reserve that were logged, and nothing else.
Every derived number — the estimated 1RM, the per-session series, drawdowns, the
strength numbers, the triage on Progress — is computed at read time from those
rows. Nothing pre-aggregated is stored, synced or seeded beside them. This is
why the demo generator emits sets rather than a curve: the Progress tab reads
that account back exactly as it reads a real one, so the two cannot drift, and a
disagreement between the charts and the logs is a bug you can see rather than
one the seed has papered over.

**A verdict is withheld rather than hedged.** `est1RM` scores an unrated set as
though it were taken to failure, so it reads about 5% *lower* than the same set
with two reps in reserve recorded — which means somebody who simply stops rating
their sets looks like they are regressing. Every comparison in
[insights.ts](../packages/domain/src/insights.ts) carries `confident`, and the
page drops the verdict when the two ends disagree about whether effort was
recorded. Saying nothing is the honest answer; a softened accusation is still an
accusation. The same rule is why a regression is measured against the best of
the last three sessions rather than the single most recent one: one bad Tuesday
is not a slide, and a page that tells you it is stops being believed.

**The app grades nothing it was not asked to grade.** Every progression
verdict — a lift that has slid, a lift that has stopped moving — is gated on the
user having set a goal on that lift, which is a row in `goals` with a number and
a date. With no goal the app draws the line and says nothing about whether it was
enough, because "your bench press needs a look" is a claim about what somebody
was trying to do and the app does not know that. The one ungated verdict is
dormancy: that is an observation about the plan they chose themselves. The
guardrails on setting a goal, and the studies behind them, are in
[training-model.md](./training-model.md#goals-and-the-permission-they-grant) —
including the linear "expected pace" that the first version shipped with and the
evidence does not support.

**The app must never be unrecoverable.** There is an error boundary, a stuck-load
deadline, a boot watchdog that runs without React, and a sync-time repair for an
account that was never seeded. Each exists because a real person got stuck.

## The other half of the documentation

This directory is for whoever is about to change the code. The product,
architecture (C4), infrastructure, runbooks and decision log live in Confluence,
for the people who will never open this repository:
[gymmy — documentation](https://dextra.atlassian.net/wiki/spaces/~712020296b34b54b84454489d16860c808e925/pages/934445059).

Neither is a summary of the other. When they disagree — with each other, with
the code, or with the [fact register](./facts/README.md) — nobody picks a
winner: the owner is asked. `CLAUDE.md` carries the routing table for which
Confluence page a given change belongs to — a Confluence page goes stale
silently, because nothing in CI can check it, which is why a weekly check
compares it with the register and files what it finds.

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

The [fact register](./facts/README.md) is the structured middle: one Markdown
file per fact, with front matter naming every doc section, copy key, test and
Confluence page that states it. It still travels in the same diff as the change,
`facts.test.ts` fails when a pointer stops resolving, and a script could turn it
into a graph without anyone maintaining one.
