'use client';

/**
 * Swiping left and right between the tabs, with the page following the finger.
 *
 * The owner: "swiping and other user actions need to feel premium and
 * satisfying." The swipe used to be a trigger — nothing moved until the finger
 * lifted, then the slide played. Now the page is the finger's for the length of
 * the drag, and letting go either finishes the move from where the page is or
 * springs it back:
 *
 *  - **Sideways or not is decided once**, after `LOCK_PX` of movement: steeper
 *    than level is a scroll, and the page never moves for it.
 *  - **Sideways, the page moves with the finger**, the transform written
 *    straight onto `[data-page]` — no CSS variable on the way, which would make
 *    the browser restyle every card on every frame — and `will-change` only
 *    while a finger is down. Past the first or last tab it resists.
 *  - **Letting go** moves to the next tab after a flick or a long drag
 *    (`commits`), and the move carries on from where the page is, at the
 *    finger's speed (`finishMs`, the `swipe` transition type in
 *    `globals.css`). Otherwise the page springs back — a CSS transition, so a
 *    finger landing on it mid-way catches it where it is.
 *
 * Left to others: a touch that starts in the edge strip (`EDGE_PX` — the
 * phone's own Back), inside `[data-no-swipe]` (a chart, the ruler, the
 * keypad) or in a dialog, and a second finger, which ends the gesture and
 * sends the page back. Touch only: a mouse drag across a page is selecting
 * text. Only on a tab itself — a screen inside one (the split editor) holds
 * unsaved work a stray thumb would throw away.
 *
 * Under reduced motion nothing moves under the finger: the same gesture still
 * changes tab, and the change is the crossfade every move gets then.
 *
 * The arithmetic is `swipe.ts`, unit-tested; what the browser makes of it is
 * `navigation.spec.ts`.
 */

import { useEffect } from 'react';
import { duration, reducedMotion } from './motion';
import { EDGE_PX, axisOf, commits, finishMs, follow, releaseSpeed, type Sample } from './swipe';
import { TABS, tabIndex } from './tabs';

/** How long a page that was let go of waits for its move to land before it
 *  gives up and comes back. A move lands in a frame or two; this is for one
 *  that fails. */
const GIVE_UP_MS = 1500;

interface Drag {
  x0: number;
  y0: number;
  /** Where the page already was when the finger landed — mid-way through a
   *  spring back it was caught from. */
  base: number;
  axis: 'x' | 'y' | null;
  /** Where the finger was when the drag turned out to be sideways. The page
   *  follows from there, so it does not jump by the distance it took to tell. */
  lockAt: number;
  samples: Sample[];
  page: HTMLElement | null;
  /** Reduced motion: the gesture counts, the page does not move. */
  still: boolean;
}

const place = (page: HTMLElement, x: number) => {
  page.style.transform = `translate3d(${x}px, 0, 0)`;
};

const clear = (page: HTMLElement) => {
  page.style.transform = '';
  page.style.transition = '';
  page.style.willChange = '';
};

export function useSwipeTabs(pathname: string, move: (href: string, types?: string[]) => void) {
  useEffect(() => {
    const index = tabIndex(pathname);
    if (index < 0) return;

    let drag: Drag | null = null;
    /** A page springing back, and how to stop it. */
    let settling: { page: HTMLElement; stop: () => void } | null = null;

    const springBack = (page: HTMLElement) => {
      page.style.transition = 'transform var(--dur-base) var(--ease-out)';
      place(page, 0);
      const stop = () => {
        page.removeEventListener('transitionend', onEnd);
        page.removeEventListener('transitioncancel', onEnd);
        window.clearTimeout(timer);
        if (settling?.page === page) settling = null;
      };
      const onEnd = (e: TransitionEvent) => {
        if (e.target !== page || e.propertyName !== 'transform') return;
        stop();
        clear(page);
      };
      page.addEventListener('transitionend', onEnd);
      page.addEventListener('transitioncancel', onEnd);
      const timer = window.setTimeout(
        () => {
          stop();
          clear(page);
        },
        duration('--dur-base') + 100,
      );
      settling = { page, stop };
    };

    /** Catches a page mid-spring where it is, and says where that is. */
    const grab = (page: HTMLElement): number => {
      if (settling?.page !== page) return 0;
      const x = new DOMMatrixReadOnly(getComputedStyle(page).transform).m41;
      settling.stop();
      page.style.transition = 'none';
      page.style.willChange = 'transform';
      place(page, x);
      return x;
    };

    const cancel = () => {
      const d = drag;
      drag = null;
      if (d?.axis === 'x' && d.page && !d.still) springBack(d.page);
    };

    const start = (e: TouchEvent) => {
      // A second finger is a pinch or a mistake, never a swipe.
      if (e.touches.length !== 1) return cancel();
      const touch = e.touches[0]!;
      const target = e.target as Element | null;
      if (target?.closest?.('[data-no-swipe], [role="dialog"]')) return;
      if (touch.clientX < EDGE_PX || touch.clientX > window.innerWidth - EDGE_PX) return;

      const page = document.querySelector<HTMLElement>('[data-page]');
      const still = reducedMotion();
      const base = page && !still ? grab(page) : 0;
      drag = {
        x0: touch.clientX,
        y0: touch.clientY,
        base,
        // A page caught mid-spring was being moved sideways; it still is.
        axis: base !== 0 ? 'x' : null,
        lockAt: touch.clientX,
        samples: [{ x: touch.clientX, t: e.timeStamp }],
        page,
        still,
      };
    };

    const follows = (e: TouchEvent) => {
      const d = drag;
      if (!d) return;
      if (e.touches.length !== 1) return cancel();
      const touch = e.touches[0]!;

      if (!d.axis) {
        const axis = axisOf(touch.clientX - d.x0, touch.clientY - d.y0);
        if (!axis) return;
        if (axis === 'y') {
          drag = null; // a scroll, and none of ours
          return;
        }
        d.axis = 'x';
        d.lockAt = touch.clientX;
        if (d.page && !d.still) {
          d.page.style.transition = 'none';
          d.page.style.willChange = 'transform';
        }
      }

      // Sideways: the page must not scroll under the finger as well.
      if (e.cancelable) e.preventDefault();
      d.samples.push({ x: touch.clientX, t: e.timeStamp });
      if (d.samples.length > 12) d.samples.shift();
      if (!d.page || d.still) return;
      const moved = d.base + (touch.clientX - d.lockAt);
      const canGo = !!TABS[index + (moved < 0 ? 1 : -1)];
      place(d.page, follow(moved, window.innerWidth, canGo));
    };

    const end = (e: TouchEvent) => {
      const d = drag;
      drag = null;
      if (!d || d.axis !== 'x') return;
      const touch = e.changedTouches[0];
      const x = touch?.clientX ?? d.samples[d.samples.length - 1]!.x;
      d.samples.push({ x, t: e.timeStamp });

      const moved = d.base + (x - d.lockAt);
      const width = window.innerWidth;
      const speed = releaseSpeed(d.samples);
      // Left drags the next tab into view, as every phone has taught.
      const next = TABS[index + (moved < 0 ? 1 : -1)];

      if (!next || !commits(moved, speed, width, true)) {
        if (d.page && !d.still) springBack(d.page);
        return;
      }
      if (!d.page || d.still) return move(next.href);

      /* The rest of the slide, at the finger's speed. The page is left where
         the finger let go of it: the transition takes its picture of the old
         page from here, and `swipe` carries it on to the edge. */
      const root = document.documentElement.style;
      root.setProperty(
        '--swipe-ms',
        `${finishMs(moved, speed, width, duration('--dur-page'), duration('--dur-press'))}ms`,
      );
      root.setProperty('--swipe-rest', `${Math.max(0, width - Math.abs(moved))}px`);
      move(next.href, ['swipe']);
      const page = d.page;
      window.setTimeout(() => {
        if (page.isConnected) springBack(page);
      }, GIVE_UP_MS);
    };

    document.addEventListener('touchstart', start, { passive: true });
    // Not passive: once a drag is sideways it has to stop the page scrolling.
    document.addEventListener('touchmove', follows, { passive: false });
    document.addEventListener('touchend', end, { passive: true });
    document.addEventListener('touchcancel', cancel, { passive: true });
    return () => {
      document.removeEventListener('touchstart', start);
      document.removeEventListener('touchmove', follows);
      document.removeEventListener('touchend', end);
      document.removeEventListener('touchcancel', cancel);
      settling?.stop();
    };
  }, [pathname, move]);
}
