# 12 — Moving around the app

**Specs:** [`../tests/opening-a-tab.spec.ts`](../tests/opening-a-tab.spec.ts),
[`../tests/navigation.spec.ts`](../tests/navigation.spec.ts)

## Why this flow exists

The owner: "switching tabs need smooth animation. swiping and other user
actions need to feel premium and satisfying."

A move between tabs is the most repeated thing anybody does in the app, so it is
where cheapness shows first. It showed in four ways: a tab slid in empty and its
content popped in after the slide; Train, choosing its day from that empty
first render, opened on Day A after every reload; the page did nothing under the
finger until it was lifted; and Back walked through every tab looked at.

## What the person does

1. Opens the app, or reloads it. Train opens on the day already started today,
   or else the first day not trained this week.
2. Taps another tab. The new page slides in already holding its content, from
   the side the tab is on.
3. Or drags the page sideways. It moves with the thumb (stiffening past the
   first or last tab). Let go past a third of the screen, or with a flick, and
   it carries on out at the thumb's speed as the next tab arrives; let go short
   and it springs back.
4. Opens a screen inside a tab — Settings → Build your own — and comes back out
   with the phone's Back or the screen's own back link. Both slide back.
5. Presses Back on a tab. The app closes (or the browser goes to the page before
   it), however many tabs were visited.

## What these tests hold

- **Train opens on the right day** whether it is loaded or navigated to: with
  Day A trained earlier this week, on Day B; with a set logged on Day B today, on
  Day B again after a reload (the report in GYM-13).
- **The page that slides in is the real one:** Progress's first rendered frame
  already lists the lifts, not "Log a few sessions…", and Settings slides in
  instead of appearing after the slide as a bare "Loading…".
- **The page follows the finger**, read between touch moves: 80 px of drag is
  the page 80 px across, with `will-change` on only while the finger is down;
  a short drag let go slowly springs back to nothing; past the first tab it
  gives less than half the drag; a drag past a third of the screen moves on,
  and the leaving page's picture is taken where the finger left it (so it
  does not snap home first) under the `swipe` transition; a quick 80 px flick
  moves on too. A touch from the screen's edge, two fingers, and — with
  reduced motion — the page itself do not move; with reduced motion the swipe
  still changes tab. The old swipe tests (direction, a scroll that wandered,
  the split editor, a chart's `data-no-swipe`) still hold.
- **Tabs add nothing to Back**, switched by tap or by swipe: after three tab
  changes, one Back leaves.
- **A screen inside a tab** is one Back deep: Back (or its own back link) slides
  back out to its tab, and the next Back leaves. Leaving it for another tab
  leaves that tab alone in the history, not the screen and its tab under it.
- **Every move slides its way**: Home's links and the avatar forward, Week's
  "Train this" back, into the split editor forward and out of it back — by the
  browser's Back too, which Next.js would otherwise restore with no movement at
  all.
