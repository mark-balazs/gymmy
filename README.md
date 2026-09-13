# gymmy

A local-first training app that tracks whether your week is actually complete.
Log a set in a basement with no signal; it syncs when you surface.

```bash
cp .env.example .env                  # then fill in AUTH_* values
docker compose up -d db               # Postgres on :5433
npm ci
npm run db:migrate
npm run dev                           # http://localhost:3000
```

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | Next.js 16, App Router, React 19 | Server routes for auth and sync, static shell for the rest |
| Language | TypeScript, `strict` + `noUncheckedIndexedAccess` | An unchecked array index is a real source of runtime bugs |
| Styling | Tailwind v4, CSS custom properties | Tokens live in one `@theme` block; dark by default |
| Database | Postgres — Neon in production, Docker locally | The driver switches on the hostname; same Drizzle code either way |
| ORM | Drizzle + drizzle-kit migrations | SQL-shaped, no generated client, migrations are readable |
| Auth | Auth.js v5, Google, database sessions | A session row can be revoked; a JWT cannot until it expires |
| Local store | Dexie (IndexedDB) | The client's source of truth, not a cache |
| Validation | Zod, at the env and the wire | The client is never trusted |
| Tests | Vitest (domain), Playwright (flows) | Pure logic unit-tested; everything else through a real browser |

## Layout

```
apps/web            Next.js app — UI, auth, sync endpoint, database schema
packages/domain     the training logic: types, model, coach, seed
e2e                 user-flow write-ups and Playwright tests
legacy/             the pre-Next vanilla build, kept for reference
```

`@athletic/domain` has **no runtime dependencies at all**. That is enforced
structurally rather than by convention — React, Next and the DOM simply are not
installed there — which keeps the rules testable in isolation and runnable on
either side of the wire.

## Splits and coverage

A **split** decides how the week is organised *and* what a complete week means.
Those are the same question: a push/pull week is complete once you have pushed
and pulled. Scoring it against seven movement patterns would mark it down for
work it never set out to do, and a coverage view that is permanently red is one
people stop reading.

So the seven-movement-pattern method is one option among several rather than a
rule imposed on everyone. It is the option that demands rotation and carries,
because that is what it is for.

| Split | A complete week | Days |
| --- | --- | --- |
| Seven movement patterns | squat, hinge, lunge, push, pull, rotate, carry | 2–4 |
| Push / Pull / Legs | push, pull, squat, hinge, lunge | 3–6 |
| Upper / Lower | push, pull, squat, hinge, lunge | 2–6 |
| Custom | inherited from the split it grew out of | — |

Each preset materialises into ordinary `Slot` rows, so nothing downstream knows
a preset was involved — which is what lets a hand-edited split behave exactly
like a built-in one.

Settings → **Build your own** opens the slot editor, which is the only way to
produce a custom split. It starts from the week you already train, because
arranging one from nothing is a much harder question than adjusting one. Each
slot is pinned to specific movements or constrained to a role, days can be added
and removed, and the editor shows what the arrangement will make a complete week
*before* it is saved: editing slots can genuinely put a movement out of reach,
and `coversFor` will then stop asking for it rather than leave a box that can
never be ticked.

### Coverage is historised

Changing split must not rewrite the past. Three months of seven-pattern weeks
still read as seven-pattern weeks after you move to push/pull; the new split
applies from the switch onward and no further back.

A switch therefore **appends a `SplitPeriod`** rather than editing a field.
Each period records the split, the day count and a *frozen copy* of the coverage
goal, so a week is scored against what was in force at the time — even if a
preset's definition changes in a later release, or the user renames a pattern.
Periods start on a Monday, because a week is the unit of coverage.

Opening the first period on an account that pre-dates them backfills the old one
first; without that, a first-ever switch would hand every earlier week the new
split and silently rescore all of it.

## Offline-first

This is the reason for most of the architecture's complexity, so it is worth
being explicit about what it buys.

Reads never touch the network. Writes land in IndexedDB and are queued in an
outbox; the UI updates from the local write and never awaits a request. One
endpoint, `POST /api/sync`, does both directions in a single round trip — push
what is queued, pull anything newer than the cursor.

Two details that are easy to get wrong:

- **Ordering comes from one shared Postgres sequence**, not timestamps. Every
  synced row takes its `seq` from `change_seq`, which gives changes across all
  tables a single total order. Comparing wall clocks between devices could not:
  they drift.
- **Server changes are applied before the outbox is re-applied on top.**
  Otherwise a pull could overwrite a set logged while the request was in flight,
  and to the user the app would simply have lost their work.

Conflicts resolve last-write-wins per record. That is a deliberate choice, not a
shortcut: the dominant write is a set log — an immutable fact, appended once,
from one phone. A CRDT would be substantial machinery for a problem this data
shape does not have.

Deletes are soft. A hard delete cannot replicate to a device that is currently
offline; it would simply reappear on that device's next push.

## Commands

```bash
npm run dev              # app against the local database
npm run build            # production build
npm run typecheck        # both workspaces
npm test                 # domain unit tests
npm run test:e2e         # Playwright flows (needs db + build)
npm run lint
npm run format
npm run db:generate      # new migration from schema changes
npm run db:migrate
docker compose --profile full up --build   # everything containerised
```

## Environment

`.env` at the repo root is read by Docker Compose and drizzle-kit.
`apps/web/.env.local` is read by Next — it does **not** read the monorepo root.
Both are gitignored; `.env.example` documents every variable.

`src/env.ts` parses the environment once at import and fails with the offending
variable named, rather than surfacing later as an undefined connection string
mid-request. `SKIP_ENV_VALIDATION=1` bypasses it for builds that only typecheck.

### The demo account

Signing in as `demo-gymmy@yopmail.com` (override with `DEMO_EMAIL`) creates an
account that arrives already onboarded, on the seven-movement-pattern split,
with six weeks of history behind it. An empty account demonstrates nothing: no
coverage ticks, no progress line, and "ready for more weight" cannot appear at
all without history to derive it from.

Seeding happens at account creation, through the same `seedNewUser` path as
everyone else — a demo running on code you do not ship is a demo of the wrong
thing. It also means resetting the demo is `DELETE FROM "user"` for that address,
followed by signing in again.

## Deploying to Vercel

1. Push to GitHub and import the repository. Vercel detects the monorepo; set
   the root directory to `apps/web`.
2. Create a Neon database and set `DATABASE_URL` to the **pooled** connection
   string. The driver switches to Neon's HTTP transport automatically.
3. Set `AUTH_SECRET`, `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`. `AUTH_URL` is
   set by Vercel.
4. Add `https://your-domain/api/auth/callback/google` as an authorised redirect
   URI in Google Cloud Console.
5. Nothing else: `vercel-build` runs `drizzle-kit migrate` before `next build`,
   so every deploy applies pending migrations and a failed one fails the deploy.

## Tests

`packages/domain` covers the rules — 133 assertions, including every preset at
every allowed day count against both equipment settings and every bias, each
asserted to produce a week with no uncovered pattern, no empty slot and no role
violation; plus the historised coverage, which is checked by reading the same
week before and after a split change and requiring the verdict to be identical.

`e2e` covers the flows a person actually performs, written up in
[`e2e/flows`](./e2e/flows) before the tests that cover them. It runs in two
layers, and the split is deliberate.

Most specs **bypass authentication**, seeding a session row rather than driving
Google's consent screen — fast, independent, and no test-only code path in the
production build. But a suite that always starts from a session row can never
see the front door, and that cost came due: email sign-in was broken from the
day it shipped (the code was posted in the request body; Auth.js reads it from
the query string) while the suite stayed green, because asking for a code was
covered and entering one was not.

So [flow 08](./e2e/flows/08-a-full-journey.md) seeds nothing but the code that
would have arrived by email and walks the whole thing: sign up, get set up,
train, sign out, come back, and find the same training on a second device. The
rule is **if a step only ever happens on the way in, a fixture cannot cover
it** — account creation, the server-side seeding of the default library, the
first sync onto an empty device, the sign-out wipe.

## Known gaps

- **No drag-and-drop in the split editor.** Slots reorder with ↑/↓ buttons.
  That is deliberate for now — dragging inside a scrolling column on a phone is
  its own engineering problem — but it is the obvious next improvement.
- **Single user.** Multi-tenancy is enforced at the query level (`userId` on
  every row and index), but there is no signup funnel, billing, rate limiting or
  account deletion yet.
- `middleware.ts` triggers a Next 16 deprecation warning in favour of `proxy.ts`.
  It still works; the rename is untested against the live OAuth flow, so it is
  deliberately not done blind.
- The service worker caches the shell and static assets but has no precache
  manifest, so a deploy is picked up on the next navigation rather than instantly.
