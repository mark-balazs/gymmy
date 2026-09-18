# 10 — Logging something outside the plan

**Spec:** [`../tests/one-off.spec.ts`](../tests/one-off.spec.ts)

## Why this flow exists

Reported as feedback: somebody did a CrossFit class — different every week — and
had nowhere to put it. Every set the app could record belonged to a day of the
plan.

The decision, settled before any code: **one "Log something else" button, below
the planned cards on Train.** Pick an exercise from the library, log sets, done.
No session to name or create. The sets count as training like any other — they
tick coverage and they count as a session in the week. Only catalogue exercises
can be picked for now; missing movements get added to the library rather than
typed in.

## What the person does

1. Opens Train. Below today's planned cards is **+ Log something else**.
2. Taps it. A sheet lists the whole library, grouped by movement pattern, with a
   search box. It includes the conditioning movements the generator never puts
   in anybody's week — those are exactly what a class is made of.
3. Picks one. A card for it opens under a small **Outside the plan** label, with
   a line saying it still counts as training this week.
4. Logs sets on it exactly as on any other card.

## What these tests hold

Mostly what must **not** happen, because an extra set is easy to log and hard to
keep in its lane:

- **The day's counter does not move.** Two extra sets are not two sets of Day A.
- **The day is not ticked off.**
- **Train does not open on a different day afterwards.** Read back as a letter,
  the reserved label is day 23, clamped to the last day — the bug the design had
  to avoid. The test reloads and checks Day A is still the one selected.
- **Picking a lift the open day already plans opens that day's card**, rather
  than an off-plan copy sitting underneath it.

## Deliberately not covered here

- **Coverage and the session count.** Held in the domain suite
  (`one-off.test.ts`), where the week can be built exactly; a browser adds
  nothing but time.
- **Retiring `refSets`**, which this feature supersedes. That was its own change,
  and takes two deploys because dropping the table in the same deploy as the
  code would fail every sync for the length of the build. The part a browser can
  see — the device deleting its store — is `device-upgrade.spec.ts`.
