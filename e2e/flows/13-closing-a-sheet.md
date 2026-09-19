# 13 — Closing a sheet

**Spec:** [`../tests/sheets.spec.ts`](../tests/sheets.spec.ts)

## Why this flow exists

The owner: "swiping and other user actions need to feel premium and
satisfying." Sheets — the panels that slide up from the bottom for an
exercise, a picker, a confirmation — came in smoothly and vanished in one
frame, and the grab handle on top did nothing. On a phone, people expect to
pull a sheet down to put it away.

So a sheet now leaves the way it came, and can be dragged down (GYM-17). The
keypad leaves the same way; it cannot be dragged, because it is tapped fast and
a thumb sliding off a key must not throw the number away.

## What the person does

1. Opens a sheet — "About" on an exercise, "Log something else", a
   confirmation.
2. Closes it with ✕, a tap outside it or Escape, and it sinks and fades out.
3. Or pulls it down from anywhere on it. It follows the finger; let go far
   enough down, or with a flick, and it carries on off the screen. Let go
   early and it springs back.
4. Scrolled down a long list, pulling down scrolls the list back up. Only at
   the top does it move the sheet. At the top, a swipe up scrolls the list,
   even if the finger first wobbled down.

## What these tests hold

- **It plays its exit before it goes**: a frame after Close it is still in the
  page, moving, and already `inert` and hidden from a screen reader; then it is
  gone and focus is back on the button that opened it. The keypad too.
- **It follows the finger**: a hundred pixels of drag moves it a hundred
  pixels.
- **A wobble is not a drag**: 4 px down, then 8, moves nothing, and lifting
  the finger still picks the lift under it.
- **Past a quarter of its height it closes**, even let go slowly; **a flick
  closes it**, however short; **a short, slow drag springs back**.
- **Pulled up, it resists** and comes back.
- **Two fingers do not drag it.**
- **Scrolled down, a drag scrolls** rather than closing it.
- **At the top of a list, a wobble down then a swipe up scrolls the list.**
  The sheet holds the page still for the 2 px down, leaves a move back up
  alone, and lets go once the finger is past 10 px going up. It used to keep
  its claim, stretch up and stop the list scrolling.
- **A sideways swipe on it does not change the tab** behind it.
- **Under reduced motion it only fades**, where it was let go.
- **Each opening is a new one**: a keypad opened again while the last is still
  leaving starts with nothing typed.

Chrome never shows the page a move of a few pixels, so the two wobble tests
make those moves inside the page, for a finger put down through Chrome; the
rest of each gesture is Chrome's own. An iPhone does send such moves, so only
an iPhone could hit the stretch; Android and this suite never could.

Not covered here, and listed for a real phone: how it feels at 120 Hz, iOS
Safari (WebKit is not in the suite), a fling that coasts into the top of a
list not turning into a dismissal, and the wobble cases with a real thumb on
an iPhone.
