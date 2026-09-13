# Data

## Two stores, one shape

Every synced record carries `id`, `updatedAt` and a soft `deletedAt`, declared
once in `types.ts` as `Synced` and once in `schema.ts` as the `synced` column
spread. The soft delete is not squeamishness: a hard delete cannot replicate to a
device that is currently offline — it would simply reappear on the next push.

`TABLES` in `types.ts` is the list everything else is derived from: the Dexie
stores, `DOMAIN_TABLES`, `SYNC_TABLES`, and the Zod schemas in
`lib/sync/rows.ts`. **Adding a table means touching all of those**, plus a Dexie
version bump, plus a migration. The typechecker catches most of it; the Dexie
bump it does not.

| Table | Notes |
| --- | --- |
| `patterns` | The seven, plus isolation. `counts: false` means "not a coverage box" |
| `exercises` | The library. `description` and `images` were added later — see the normalisation note below |
| `slots` | The week's skeleton. Editing these by hand is what makes a split custom |
| `splitPeriods` | Append-only. The whole historisation model |
| `entries` (`program_entries`) | The generated plan: which exercise fills which slot |
| `logs` (`set_logs`) | The dominant write. One row per set |
| `refSets` | Reference sets, outside the plan |
| `bodyLogs` | Bodyweight, dated. Denominator of the strength score |
| `profile` | One row per user; `id` equals `userId` |

Server-side every table has a composite primary key `(user_id, id)` and a `seq`
index. `seq` comes from one shared Postgres sequence, `change_seq`, so a single
cursor orders changes across every table.

## Adding a field to an existing table

There is a trap here that has already bricked the app once.

The server only re-sends rows whose `seq` moved, and **adding a column does not
move it**. So a device that synced before the column existed keeps rows without
the key, forever, and `row.newField.length` throws — taking the whole screen
down with it.

Two things are therefore required:

1. **Default it in `index()`** in `model.ts`, which is the single point every
   consumer reads through. That is where `description ?? ''` and `images ?? []`
   live.
2. **Backfill in the migration** if existing rows need a real value, and bump
   their `seq` if devices must re-fetch them.

## Sync protocol

`lib/sync/protocol.ts` is the wire contract, imported by both sides.
Last-write-wins per record on `updatedAt` — a deliberate choice, not a shortcut:
this is a single-user app whose dominant write is an immutable set log from one
phone, and a CRDT would be substantial machinery for a problem this data shape
does not have.

The client is not trusted. `userId` and `seq` are never accepted from the wire —
the server sets both — so a client cannot write into another account or forge its
position in the change order. Every row is validated per table by
`lib/sync/rows.ts` before it is written.

## Migrations

`drizzle-kit`, generated into `apps/web/drizzle/`. `vercel-build` runs
`drizzle-kit migrate` before `next build`, so a deploy migrates.

Use the *unpooled* URL for migrations. A pooler in transaction mode can reject or
mis-sequence DDL, and `drizzle.config.ts` prefers `DATABASE_URL_UNPOOLED` for
exactly that reason.

## Seeding

`lib/db/seed-user.ts` creates a new account's default content: the patterns, the
slot skeleton, the 70 exercises, the opening `SplitPeriod` and an un-onboarded
profile.

**It is idempotent, and that is load-bearing.** Auth.js fires `createUser`
exactly once per account, so a failure there used to be permanent: the user row
already existed, the event would never fire again, and the account was left
signed in and forever empty — which this app can only render as a loading screen
that never resolves. So:

- every row's id is `seedId(userId, kind, key)` — derived, not random;
- every insert is `onConflictDoNothing`, and the profile is never overwritten so
  a retry cannot reset settings;
- the `createUser` event is **best-effort**, logging rather than throwing;
- **`/api/sync` repairs it**: a device asking from cursor 0 and getting nothing
  back means the account has no rows, so it is seeded then and there. That is
  the one endpoint every device touches on every visit, and it costs nothing on
  a normal sync because the emptiness is read off the pull already done.

### The demo account

Signing in as `DEMO_EMAIL` (default `demo-gymmy@yopmail.com`) seeds five months
of history, a bodyweight series, a sex and a height — everything the Progress tab
needs to have something to show.

Loads come from `demo-loads.ts`, **one entry per exercise**. They used to be per
*pattern*, which logged a goblet squat at 90 kg and drew the same staircase on
all seventy charts. Progress is quick early and flattens, rounds to real plate
jumps (which produces uneven plateaus by itself), and is interrupted by a deload
every sixth week, a bad session about one in ten, a missed session and a week
off. Bodyweight movements carry a fraction of bodyweight and progress in reps.

All of it is derived rather than random — the same account seeded twice produces
identical history, which is what keeps the seed safe to re-run.
