# 12 — Moving around the app

**Specs:** [`../tests/opening-a-tab.spec.ts`](../tests/opening-a-tab.spec.ts)

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
2. Taps another tab. The new page slides in already holding its content.

## What these tests hold

- **Train opens on the right day** whether it is loaded or navigated to: with
  Day A trained earlier this week, on Day B; with a set logged on Day B today, on
  Day B again after a reload (the report in GYM-13).
- **The page that slides in is the real one:** Progress's first rendered frame
  already lists the lifts, not "Log a few sessions…", and Settings slides in
  instead of appearing after the slide as a bare "Loading…".
