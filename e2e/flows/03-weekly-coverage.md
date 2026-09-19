# Flow 03 — Weekly coverage

**Who:** somebody checking, mid-week, whether they have missed anything.

**Why it matters:** this is the one view no other training app offers. Apps
organise around muscle groups, which structurally cannot show a gap in a
category they do not model — carries and rotation are exactly the two that
quietly disappear.

## Preconditions

- An onboarded user on the **seven-pattern** split
- No sets logged yet this week

Which tiles appear is a property of the split — see
[flow 07](./07-choosing-a-split.md). This flow uses the seven-pattern split, so
there are seven of them; on push/pull/legs there would be five, and the rules
below hold just the same.

## Steps

1. Open `/week`.
2. Read the summary line: *"Nothing logged this week yet."*
3. Log one squat-pattern set (via `/train`).
4. Return to `/week`.

## Expected

- Seven tiles, one per pattern this split asks for, labelled in the active
  language.
- Before logging: every tile shows `–`, and the summary reports gaps.
- After one squat set: the **Squat** tile shows a tick, the other six still
  show `–`, and the summary names the gaps.
- The session count reads `1 session` — singular, not `1 sessions`.

## The isolation rule

Logging *only* an isolation exercise — a curl, say — must **not** tick any tile.
Accessories sit on top of the patterns, never instead of them, under every
split. If a week of curls could read as coverage, the whole check would be
decorative.

This is asserted explicitly — a curl is logged and the week read back, with all
seven tiles still gaps — because it is the kind of rule that a well-meaning
refactor silently breaks.

## Which weeks you can page through

The tab opens on **this week**, and the back arrow reaches every week back to
the one the account began in. A new account can also page ahead through its
first eight weeks.

The pages are built around today by `weekPages` in the domain. The block on the
profile (`blockStart`, `blockWeeks`) is written once, when the account is made,
and never moves on. Paging through that block alone lost this week from week
nine, and the tab opened on the account's first week with no way forward. The
test that guards this signs in as an account ten weeks old.

## Weeks keep their own meaning

A week is scored against the split that was in force **that week**, not the one
in force today. Paging back to a week trained under a different split shows that
split's tiles and says so. See [flow 07](./07-choosing-a-split.md).
