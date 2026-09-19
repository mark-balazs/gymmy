# Architecture

## The system, and what it talks to

```mermaid
flowchart TB
    person["A person who trains<br/>two to four times a week, on a phone"]
    gymmy["<b>gymmy</b><br/>Builds the week, records what you lift,<br/>measures what has moved or stalled.<br/>Holds a full copy on the device."]
    google["Google<br/>OAuth identity"]
    resend["Resend<br/>sign-in code email (optional)"]

    person -->|"uses, often with no signal"| gymmy
    gymmy -->|"sign in with a Google account"| google
    gymmy -->|"send a six-digit code"| resend
```

Both external systems are on the **sign-in path only**. Once somebody is signed
in, gymmy depends on nobody: a total Google outage cannot stop an existing user
from training.

## The pieces that run

```mermaid
flowchart TB
    subgraph phone["The person's phone"]
        pwa["Web app (PWA)<br/>Next.js 16 · React 19"]
        idb[("IndexedDB<br/>full replica + outbox")]
        sw["Service worker<br/>network-first pages,<br/>cache-first assets"]
    end
    subgraph vercel["Vercel"]
        server["Next.js server<br/>route handlers · auth · seeding<br/>validates everything"]
    end
    db[("Neon Postgres<br/>one shared change sequence")]

    pwa <-->|"every read is local"| idb
    pwa -.->|registers| sw
    pwa -->|"HTTPS · POST /api/sync"| server
    server -->|"SQL over HTTP"| db
```

Two databases on purpose. The local one is what makes the app work in a
basement; the remote one is what makes it survive a lost phone. Neither is
redundant.

## The layers, and what may import what

```
packages/domain  ──►  (nothing)
apps/web         ──►  packages/domain
e2e              ──►  apps/web (over HTTP), packages/domain (for fixtures)
```

`packages/domain` has **no runtime dependencies**, and that is enforced
structurally rather than by convention: there is nothing in its `package.json` to
import, so a stray `import { useState }` fails to resolve. This is what lets the
same coverage rule run in a React component and in a server-side seed without a
second implementation to disagree with the first.

| Where | What lives there |
| --- | --- |
| `packages/domain/src/types.ts` | Every record shape, and the `TABLES` list the sync layer is generated from |
| `packages/domain/src/model.ts` | Pure derived values — coverage, progress, `index()` |
| `packages/domain/src/strength.ts` | The two strength numbers: gymmy's index and DOTS |
| `packages/domain/src/load.ts` | What the number in the weight box means per exercise — per hand, the bar, a machine setting |
| `packages/domain/src/entry.ts` | Setting a number on Train: each equipment's ruler range and step, the plates, the bars, where a first set starts |
| `packages/domain/src/coach.ts` | Program generation, and reading back the last session on a lift |
| `packages/domain/src/insights.ts` | What Progress and the calendar *say* — session series, drawdowns, the triage, a day |
| `packages/domain/src/splits.ts` | Split presets, slot materialisation, coverage sets |
| `packages/domain/src/plans.ts` | A plan as a portable thing: no ids from any account, exercises by name |
| `packages/domain/src/catalogue.ts` `catalogue-ids.ts` `details.ts` | The exercise library, shared by every account and authored in code; the append-only record of published ids; photos and descriptions |
| `packages/domain/src/seed.ts` | A new account's patterns and slot skeleton. `SEED_EXERCISES` is a view of the catalogue kept for older seeding code |
| `apps/web/src/lib/client/` | IndexedDB, the sync engine, every mutation |
| `apps/web/src/lib/db/` | Drizzle schema, per-account seeding, the demo |
| `apps/web/src/lib/db/demo-history.ts` | Pure: the demo account's training, as data points |
| `apps/web/src/lib/sync/` | The wire contract and per-table row validation |
| `apps/web/src/lib/db/plans.ts` | Plans, groups, shares, and who can see what. **Not** a replicated table |
| `apps/web/src/lib/api/plans.ts` | The session/trainer guard and the wire schema for the plan endpoints |
| `apps/web/src/app/(app)/` | The five tabs |
| `apps/web/src/components/` | The UI kit, the charts, the calendar, the sheets, the lightbox, the profile card, the recovery screens |
| `apps/web/src/components/entry/` | Train's number controls — buttons, the ruler, the plate loader, gymmy's keypad — and the card's open/close |

## How a set gets saved

```mermaid
sequenceDiagram
    autonumber
    actor P as Person
    participant UI as Screen
    participant M as mutations.put
    participant L as IndexedDB
    participant S as sync engine
    participant API as POST /api/sync

    P->>UI: taps "Log set"
    UI->>M: one write path, always
    M->>L: stamp updatedAt, write row, queue outbox
    L-->>UI: live query fires
    UI-->>P: the set is there (no network involved)
    Note over S: ~800ms debounce
    S->>API: outbox + highest seq seen
    API-->>S: rows newer than that, all tables
    S->>L: apply server rows
    S->>L: re-apply outbox on top
    Note over S,L: without that last step, a pull in flight<br/>overwrites a set logged while it travelled
```

1. A tap calls a function in `lib/client/mutations.ts`. **Every** write goes
   through `put()` there — it stamps `updatedAt`, writes to IndexedDB, and
   queues an outbox row. Nothing in the UI writes to Dexie directly, so no
   screen can save something the server will never hear about. The one write
   that skips `put()` does so on purpose: `rememberBar`, the bar weight picked
   on a barbell card, goes to the local `meta` table only — it describes a
   gym's equipment, not training, and is not meant to reach the server.
2. The UI re-renders from the local write. `useLiveQuery` is watching, so this
   is immediate and does not wait on anything.
3. `sync.ts` debounces ~800ms, then posts the outbox to `/api/sync` along with
   the client's cursor.
4. The server validates each row against `lib/sync/rows.ts`, upserts it with
   last-write-wins on `updatedAt`, assigns a `seq` from a shared Postgres
   sequence, and returns everything newer than the cursor.
5. The client applies the server's rows, **then re-applies anything still in the
   outbox on top**. Without that last step a pull in flight would overwrite a
   set logged while it was travelling, and it would look to the user like the
   app simply lost it.

If step 1's own write to IndexedDB fails, nothing was saved anywhere.
`put()` calls `reportStorageFailure`, which sets `storageFailure` on the sync
status: the header shows a magenta triangle and a one-line warning that stays
until the person dismisses it. It is a separate field, not a sync state,
because as a state the next sync replaced it within seconds — so no sync
outcome can clear it. It lives in memory: a reload or a sign-out clears it.

### The cursor is the subtle part

Each table is paged independently. Taking the highest `seq` across all of them
loses data outright: if logs fill their page at seq 1,000 while the profile sits
at 5,000, a cursor of 5,000 means every log in between is never requested again —
silently, permanently. So a table that filled its page **holds the cursor down**
to the last row it actually sent and the client is told to come straight back.
`e2e/tests/sync-paging.spec.ts` is the guard.

## Plans, and the one place two people share a row

Everything above assumes a row belongs to exactly one person who is the only one
who edits it. Every synced table is `primaryKey(userId, id)` cascading from
`user`, and that assumption is what last-write-wins, the full replica and the
cascade all rest on.

A trainer's plan breaks both halves of it: one person writes it, many read it.
So plans live **outside the sync set** — `plans`, `plan_slots`, `user_groups`,
`group_members`, `plan_shares` and `plan_events`, reached over a small read API
rather than replicated. Putting them in would mean a trainer closing their
account destroyed plans other people train on, and would hand last-write-wins
the job of refereeing two people editing one row, which
[the decision log](https://dextra.atlassian.net/wiki/spaces/~712020296b34b54b84454489d16860c808e925/pages/934543399)
names as the exact condition for revisiting it.

**What crosses into an athlete's data is not the plan but its effect.** Applying
one materialises ordinary `slots`, an appended `splitPeriod` and generated
`entries`, through the same `installSkeleton` a preset goes through — it is the
third caller alongside `applySplit` and `applyCustomSplit`. After that moment
nothing downstream knows a trainer was involved, which is exactly what keeps
historisation, offline and last-write-wins working untouched.

It is a **copy, taken once**. `profile.planId` and `planVersion` record what was
applied so a newer edition can be *offered*; the trainer never reaches into a
week somebody is standing in.

Traps worth knowing before touching any of it:

- **Plans carry exercises by name.** Catalogue ids are shared, but an account
  created before the catalogue still has its own ids on every stored row, read
  as aliases by `index()` — so a plan built on ids would still miss for them.
  A name resolves against either; one the athlete lacks costs them that
  exercise and not that session.
- **Read history through `exerciseById`, offer through `exercises`.** A
  retired catalogue entry is in the first and not the second. Listing history
  from `exercises` makes a retired movement's training vanish.
- **Read the plan through `planOf(profile)`.** The server does not re-send a row
  because a column was added, so a device that synced before `planId` existed
  has no such key and `profile.planId !== null` is `true` for an account that
  has never seen a plan.
- **A plan's day numbers can skip.** The API takes any day from 0 to 13, and
  the installer builds days from zero. `planToDrafts`, `planFill` and
  `planSessions` all renumber through one map (`denseSessions`), so days 0 and 2
  install as Day A and Day B. Renumber in only one of them and a day installs
  empty, or a trainer's choice lands on no slot.

Visibility is computed per request rather than stored on the plan: you own it,
or a live share points at you, directly or through a group you are in. Cached as
a flag, every membership change would have to find and rewrite every plan, and
the first one missed leaves somebody reading a plan they were removed from.

> **Known gap:** `installSkeleton` is a dozen writes with no wrapping
> transaction, and the profile is the last of them. Tear the page down partway —
> a navigation, a crash — and the week installs while the profile still names
> the old split, so Settings and the Week tab disagree until it is applied
> again. This predates plans and is true of `applySplit` too; it surfaced when
> an e2e test navigated the moment the button was clicked. Dexie has
> transactions; nothing here uses them yet.

## Offline and recovery

The service worker (`apps/web/sw-src.js`, stamped with the build id by
`scripts/build-sw.mjs`) is network-first for navigations and cache-first for
content-hashed assets. `/api/*` is never cached.

Four separate things stop the app becoming unusable, and each one exists because
something got somebody stuck:

- **`app/(app)/error.tsx`** — a render crash offers a reset instead of a blank
  screen.
- **The stuck-load deadline** in `app/(app)/layout.tsx` — "waiting for the
  profile" has an honest failure mode of waiting forever, so after 12s it stops
  pretending.
- **`components/boot-watchdog.tsx`** — plain DOM inlined in `<head>`, because if
  the bundle fails to load there is no React and no error boundary to help.
- **Seed repair in `/api/sync`** — an account with no rows gets seeded on the
  spot. See [data.md](./data.md#seeding).

## Moving between tabs

Tabs slide, and the direction carries meaning: left is forward, right is back.
Both the tab bar and a swipe produce the same movement, because they are the
same journey.

- `components/page.tsx` wraps each tab's content in React's `<ViewTransition>`.
  **It lives in the page, not the layout** — a layout persists across
  navigation, so its enter and exit animations never fire. Only something that
  genuinely unmounts can be animated out.
- The direction is a *transition type*: `transitionTypes` on the tab `<Link>`,
  and the same on `router.push` for a swipe. `default: 'none'` means a
  navigation carrying no type — the browser's back button, `router.refresh()`,
  a Suspense reveal — does not slide, because it was not a move.
- The header and the tab bar carry their own `viewTransitionName` and are
  pinned. Without a fixed reference the whole viewport appears to move rather
  than the page inside it.
- The flex column that spaces the cards lives on `[data-page]`, not on `<main>`.
  `<main>` persists; spacing applied there would leave the cards travelling
  independently of the box supposed to be carrying them.
- The per-card stagger is suppressed during a transition
  (`html:active-view-transition`) — two animations describing one event read as
  jitter.

`prefers-reduced-motion` zeroes the view-transition pseudo-elements explicitly:
they sit outside the `*` selector that handles everything else.

## Things that will surprise you

- **React Compiler is on.** It rejects a `useMemo` whose dependency comes through
  a cross-package call. Read `DEFAULT_PREFS.days` directly rather than calling
  `prefs(profile).days` inside a dependency array.
- **`next start` serves the last `next build`.** The e2e suite does not rebuild,
  so a UI change tests the *previous* build unless you build first.
- **`drizzle.config.ts` reads `.env.local` with `override: true`**, but captures
  an explicitly exported `DATABASE_URL` first — so `DATABASE_URL=<remote> npm run
  db:migrate` really does migrate the remote.
- **Auth.js reads email-callback params from the query string**, never the body.
  This broke email sign-in for the entire life of the feature.
