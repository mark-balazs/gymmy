# 11 — Entering a set without the phone's keyboard

**Spec:** [`../tests/entry-modes.spec.ts`](../tests/entry-modes.spec.ts)

## Why this flow exists

Reported from the gym floor: entering lifts was hard. The weight and reps were
number inputs, and a number input on a phone is the system keyboard — half the
screen, the browser scrolling the focused box above it, and the card jumping out
from under the thumb between sets.

The decision, settled before any code and tried by hand on a phone first: **no
keyboard on Train at all.** Every number is set with the card's own controls,
and a tap on any number opens gymmy's own keypad, which slides up from the
bottom and never moves the page. Three styles, chosen in Settings → **Logging
sets**:

- **Buttons** (the default) — `−` and `+` either side of the number.
- **Ruler** — drag or flick a ruler sideways; it glides and settles on a step.
  Sideways, so scrolling the page up and down can never change a number. Its
  range is realistic for the equipment: a barbell starts at the bar, and
  dumbbells go up in whole kilos — a pair to 60 per hand, a single dumbbell or
  kettlebell to 80. Every number on a ruler has the same
  decimals (60.0, 62.5; whole kilos stay whole) in a box of one width, so the
  number does not jump about as it moves, and its digits roll the way it moved.
  With reduced motion on, numbers just change: no rolling, and the label under
  the needle darkens without growing.
- **Load the bar** — for barbell lifts, on unless switched off: tap the plates
  you put on one side, and gymmy adds the bar and the other side. The bar weight
  is a chip, remembered per exercise on the device.

The card also opens and closes smoothly, and each style fits between the
header and the tab bar of a 640 px phone.

## What the person does

1. Opens Train. The first card is open, its numbers filled in from last time —
   or, the first time, from a sensible start: the empty bar, 10 kg dumbbells.
2. Adjusts with the controls, or taps the number and types it on the keypad.
3. Logs the set. When the exercise is finished, the next card opens by itself
   and scrolls into view, log button included.

## What these tests hold

- **Nothing on the card summons the keyboard** — no number input, no text field.
- **Every style reaches the keypad the same way**, through a button named "Type
  weight" or "Type reps". That is also how the other specs set numbers, so a
  style change cannot quietly break every test.
- **The keypad**: Done applies, Cancel and Escape do not, reps have no decimal
  point, focus goes in and comes back.
- **The ruler's range follows the equipment** (the Goblet Squat's single
  dumbbell runs 1–80 kg), and an arrow key moves one step.
- **The ruler's number keeps one shape**: dragged with a pointer through
  half-kilo stops and past 100, the readout stays `\d+.\d` in a box that never
  changes width, and the labels under the ticks follow the same rule. A
  whole-kilo ruler stays whole, a screen reader still hears "20 kg", and the
  buttons and the keypad write a barbell's 20 as 20.0 too.
- **Reduced motion means no growing**: with the setting on, the label under the
  needle darkens but stays its size, at rest and after a move; with it off, the
  same label grows to 1.25×.
- **Loading the bar**: a plate adds twice its weight, comes off with a tap, the
  bar chip moves the total, and a total plates cannot make is logged exactly.
  Each lift keeps its own bar, and a trap bar deadlift starts on its own 25 kg.
- **Where a number starts**: a lift never done starts on a light weight and the
  bottom of the plan's rep range — eight reps off the plan, where there is no
  range. A swap on the Week tab to another movement brings that movement's
  range: Day A's rotation finisher swapped for a Farmer's Carry starts at 30
  metres, not 8.
- **Pounds**: the card uses the pound dumbbells, bar and plates, and a bar
  remembered in kilograms is not read back as pounds.
- **The choice follows the account** to a second browser, like the unit does.
- **Bodyweight "None" is logged as no added weight.**
- **Nothing scrolls sideways** on a 360 px screen, in any style.
- **Moving between exercises**:
  - finishing one brings the next into view, log button above the tab bar;
  - on a phone too short for the card, the log button still shows — the card is
    brought in by its bottom;
  - a card opened by a tap stays where it was tapped. Tested with Chrome's
    scroll anchoring switched off, because Safari has none: with it on, the test
    would pass on Chrome's behaviour and prove nothing about an iPhone.

## Deliberately not covered here

- **The feel of the ruler's glide on a real phone.** Pointer physics can be
  driven from a test, but whether a flick feels right cannot; that was judged by
  hand on the prototype. The same goes for the digits rolling, the label under
  the needle growing, the spring as it settles and the haptic tick per stop
  (Android only; iOS has no web vibration) — and WebKit is not in the e2e
  matrix at all.
- **iOS VoiceOver's swipe to adjust** the ruler. It is wired to the arrow keys,
  which is what WebKit sends, and only a device can confirm it.
