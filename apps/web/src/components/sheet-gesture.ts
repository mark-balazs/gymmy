/**
 * How a sheet moves under a finger, and how it leaves.
 *
 * **Drag down to dismiss**, by the rules Vaul (the drawer most web apps copy)
 * settled on, because each one is there for a reason:
 *
 * - The sheet only takes a downward drag when what is under the finger is
 *   scrolled to its top, and has not scrolled in the last 100 ms. Otherwise
 *   the drag is a scroll: a list half-way down would close instead of
 *   scrolling back up, and a fling that coasts into the top would carry on
 *   into a dismissal nobody asked for.
 * - It decides whose gesture it is on the first move. Browsers stop letting a
 *   page cancel a touch once they have started scrolling, so a sheet that
 *   waited ten pixels to make up its mind would find the page already moving
 *   under it. At the top, a finger going down has nothing to scroll anyway.
 *   But it only starts moving past `SLOP`, so a tap that wobbled is still a
 *   tap, and never a flick.
 * - Until `SLOP` it holds the page still only for a move its own way, and at
 *   `SLOP` it asks again, for the way the finger actually went. At the top of
 *   a list, a wobble down and then a swipe up is a scroll: the list gets it,
 *   and the sheet does not stretch. (Chrome never shows the page a move that
 *   small; iOS Safari does.)
 * - Sideways is not its business — a chart that scrubs, a row of chips.
 * - Pulled up past where it rests, it gives, with the resistance iOS uses: it
 *   follows less the further it goes, and never runs away.
 * - A second finger ends the drag and the sheet goes back; a pinch is not a
 *   dismissal.
 * - Let go, it closes on speed (a flick, however short) or distance (a quarter
 *   of its height, unless thrown back up); otherwise it springs back, and a
 *   finger can catch it on the way.
 *
 * The transform is written straight onto the panel — no CSS variable, which
 * would restyle every element inside on every frame — and `will-change` is set
 * only while a finger is down.
 *
 * **Leaving** continues from wherever the sheet is. After a drag it carries on
 * at the finger's speed, taking the rest of the distance ÷ that speed, capped
 * at `--dur-sheet-out`; otherwise it is the entrance backwards, fading as it
 * sinks by `--rise`. Under reduced motion both are a fade where it stands, and
 * a spring back is a jump.
 */

import { duration, easing, reducedMotion } from './motion';

/** Faster than this downward, in px/ms, and letting go closes it. Vaul's. */
export const FLICK = 0.4;
/** Dragged past this share of its height, letting go closes it. Vaul's. */
export const CLOSE_AT = 0.25;
/** A scroll this recent means the finger is still scrolling, not dragging. */
export const SCROLL_GUARD_MS = 100;
/** How much of the drag the release speed is read from. */
export const SAMPLE_MS = 100;
/** A finger that has moved less than this is still tapping. */
export const SLOP = 10;

/**
 * How far a sheet moves when pulled `distance` past where it rests: iOS's
 * rubber band. It starts at about half the finger's movement and approaches
 * `dimension` without ever reaching it.
 */
export function rubberBand(distance: number, dimension: number): number {
  if (distance <= 0 || dimension <= 0) return 0;
  return (1 - 1 / ((distance * 0.55) / dimension + 1)) * dimension;
}

export interface Sample {
  /** `performance.now()` when the finger was here. */
  t: number;
  y: number;
}

/**
 * The finger's speed as it let go, in px/ms, positive downward: the movement
 * over the last `SAMPLE_MS`, measured up to the moment of letting go — so a
 * finger that stopped before lifting has no speed, however fast it was going
 * before.
 */
export function releaseVelocity(samples: Sample[], now: number): number {
  const recent = samples.filter((s) => now - s.t <= SAMPLE_MS);
  if (recent.length < 2) return 0;
  const first = recent[0]!;
  const last = recent[recent.length - 1]!;
  const dt = now - first.t;
  return dt > 0 ? (last.y - first.y) / dt : 0;
}

/** Whether letting go here closes the sheet. `offset` is how far down it is. */
export function dismisses(offset: number, velocity: number, height: number): boolean {
  if (offset <= 0) return false;
  if (velocity > FLICK) return true;
  return offset > height * CLOSE_AT && velocity > -FLICK;
}

/** How long the rest of a flick takes: the distance left at the finger's speed, capped. */
export function finishMs(remaining: number, velocity: number, cap: number): number {
  return velocity > 0 ? Math.min(remaining / velocity, cap) : cap;
}

/* --------------------------------------------------------------- the DOM */

const at = (y: number) => `translate3d(0, ${y}px, 0)`;

/** How far down the panel is, from its transform (a running animation included). */
export function offsetOf(el: HTMLElement): number {
  const t = getComputedStyle(el).transform;
  if (!t || t === 'none') return 0;
  return new DOMMatrixReadOnly(t).m42;
}

const opacityOf = (el: HTMLElement) => Number(getComputedStyle(el).opacity) || 0;

/** Whether this browser has the Web Animations API (all current ones do). */
const canAnimate = (el: HTMLElement) => typeof el.animate === 'function';

/**
 * Plays a sheet out, from wherever it is now. `fling` is the finger's speed if
 * a drag let it go; `shade` is what dims the page. The promise settles once
 * the exit has played: resolved, or rejected if something cancelled it.
 */
export function leave(
  panel: HTMLElement,
  shade: HTMLElement,
  fling: number | null,
): { finished: Promise<unknown> } {
  if (!canAnimate(panel)) return { finished: Promise.resolve() };
  const from = offsetOf(panel);
  const panelOpacity = opacityOf(panel);
  const shadeOpacity = opacityOf(shade);
  const out = duration('--dur-sheet-out');
  const still = reducedMotion();

  let anims: Animation[];
  if (fling !== null && !still) {
    // Carried on at the finger's speed, down past the bottom of the screen.
    const to = panel.offsetHeight + 16;
    const ms = finishMs(Math.max(0, to - from), fling, out);
    const timing = { duration: ms, easing: easing('--ease-drawer'), fill: 'forwards' as const };
    anims = [
      panel.animate([{ transform: at(from) }, { transform: at(to) }], timing),
      shade.animate([{ opacity: shadeOpacity }, { opacity: 0 }], timing),
    ];
  } else {
    // The entrance backwards: sinking by `--rise` as it fades. `--rise` is
    // nothing under reduced motion, so there it only fades.
    const rise = still
      ? 0
      : parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--rise')) || 0;
    const timing = { duration: out, easing: easing('--ease-in'), fill: 'forwards' as const };
    anims = [
      panel.animate(
        [
          { transform: at(from), opacity: panelOpacity },
          { transform: at(from + rise), opacity: 0 },
        ],
        timing,
      ),
      shade.animate([{ opacity: shadeOpacity }, { opacity: 0 }], timing),
    ];
  }
  return { finished: Promise.all(anims.map((a) => a.finished)) };
}

/**
 * Takes the sheet off any animation and holds it where it is, by inline
 * style, as a finger takes it: off the entrance, so a drag that starts early
 * is not fighting it, and off a spring back, so a finger can catch it on the
 * way. Returns the offset it was at.
 */
export function hold(panel: HTMLElement, shade: HTMLElement): number {
  const y = offsetOf(panel);
  const panelOpacity = opacityOf(panel);
  const shadeOpacity = opacityOf(shade);
  for (const a of [...panel.getAnimations(), ...shade.getAnimations()]) a.cancel();
  panel.style.transform = at(y);
  panel.style.opacity = String(panelOpacity);
  shade.style.opacity = String(shadeOpacity);
  return y;
}

/** Back to rest from wherever it is held: `--dur-base`, or at once under reduced motion. */
export function settle(panel: HTMLElement, shade: HTMLElement): void {
  const y = offsetOf(panel);
  const panelOpacity = opacityOf(panel);
  const shadeOpacity = opacityOf(shade);
  panel.style.transform = '';
  panel.style.opacity = '';
  shade.style.opacity = '';
  panel.style.willChange = '';
  if (reducedMotion() || !canAnimate(panel)) return;
  if (y === 0 && panelOpacity === 1 && shadeOpacity === 1) return;
  const timing = { duration: duration('--dur-base'), easing: easing('--ease-out') };
  panel.animate(
    [
      { transform: at(y), opacity: panelOpacity },
      { transform: at(0), opacity: 1 },
    ],
    timing,
  );
  shade.animate([{ opacity: shadeOpacity }, { opacity: 1 }], timing);
}

/**
 * Lets a finger drag the panel down to dismiss it. `onDismiss` gets the
 * finger's speed; the caller closes the sheet, and `leave` carries it off.
 * If the caller does not close it after all, it springs back. Returns the
 * function that takes the listeners off.
 */
export function dragToDismiss(
  panel: HTMLElement,
  shade: HTMLElement,
  onDismiss: (velocity: number) => void,
): () => void {
  /*
   * idle     no finger down
   * pending  a finger is down and has not moved
   * claimed  the first move made it the sheet's, but not past `SLOP` yet:
   *          the sheet does not move, so a tap that wobbled is still a tap.
   *          A move the sheet could take holds the page still; one it could
   *          not is left to the page. Past `SLOP` it is asked again, for the
   *          way the finger went: `drag` if that is the sheet's, else `off`
   * drag     the sheet follows the finger
   * off      not the sheet's gesture, until every finger is up
   */
  let phase: 'idle' | 'pending' | 'claimed' | 'drag' | 'off' = 'idle';
  let finger = -1;
  let x0 = 0;
  let y0 = 0;
  let origin = 0;
  let base = 0;
  let offset = 0;
  let target: Element | null = null;
  let samples: Sample[] = [];
  let lastScroll = -Infinity;

  const find = (list: TouchList) => {
    for (let i = 0; i < list.length; i++) if (list[i]!.identifier === finger) return list[i]!;
    return null;
  };

  /**
   * Whether a drag going `dy` (down is positive) is the sheet's.
   * Anything between the finger and the panel that can scroll that way gets
   * it instead: down, when it is not at its top; up, always — there is more
   * below.
   */
  const claims = (dy: number): boolean => {
    for (let el = target; el && el !== panel; el = el.parentElement) {
      if (!(el instanceof HTMLElement)) continue;
      const scrolls =
        el.scrollHeight > el.clientHeight + 1 &&
        /(auto|scroll|overlay)/.test(getComputedStyle(el).overflowY);
      if (!scrolls) continue;
      if (dy < 0 || el.scrollTop > 0) return false;
    }
    return !(dy > 0 && performance.now() - lastScroll < SCROLL_GUARD_MS);
  };

  const place = (y: number) => {
    offset = y;
    panel.style.transform = at(y);
    const height = panel.offsetHeight || 1;
    shade.style.opacity = String(1 - Math.min(1, Math.max(0, y) / height));
  };

  const release = (mayDismiss: boolean) => {
    phase = 'off';
    const v = releaseVelocity(samples, performance.now());
    if (mayDismiss && dismisses(offset, v, panel.offsetHeight)) {
      panel.style.willChange = '';
      onDismiss(v);
      // Closing is the caller's call. One that keeps it open gets it back.
      requestAnimationFrame(() => {
        if (panel.isConnected && panel.closest('[data-state="open"]')) settle(panel, shade);
      });
      return;
    }
    settle(panel, shade);
  };

  const onStart = (e: TouchEvent) => {
    if (e.touches.length > 1) {
      if (phase === 'drag') release(false);
      phase = 'off';
      return;
    }
    const t = e.touches[0];
    if (!t) return;
    finger = t.identifier;
    x0 = t.clientX;
    y0 = t.clientY;
    target = e.target instanceof Element ? e.target : null;
    samples = [];
    phase = 'pending';
  };

  const onMove = (e: TouchEvent) => {
    if (phase !== 'pending' && phase !== 'claimed' && phase !== 'drag') return;
    const t = find(e.touches);
    if (!t) return;
    const dx = t.clientX - x0;
    const dy = t.clientY - y0;
    if (phase === 'pending') {
      if (dx === 0 && dy === 0) return;
      if (Math.abs(dx) > Math.abs(dy) || !claims(dy)) {
        phase = 'off';
        return;
      }
      phase = 'claimed';
    }
    if (phase === 'claimed') {
      // Turned sideways before it went anywhere: let the page have it.
      if (Math.abs(dx) > Math.abs(dy)) {
        phase = 'off';
        return;
      }
      /* Asked again, for the way the finger is going now. The first move only
         says which way it started: at the top of a list, a wobble down makes
         the claim, and a swipe up after it is still the list's. */
      const owns = claims(dy);
      if (Math.abs(dy) < SLOP) {
        if (owns && e.cancelable) e.preventDefault();
        return;
      }
      if (!owns) {
        phase = 'off';
        return;
      }
      phase = 'drag';
      // From here, not from where the finger landed: the sheet moves with
      // the finger rather than jumping to catch up with it.
      origin = t.clientY;
      base = hold(panel, shade);
      panel.style.willChange = 'transform';
    }
    if (e.cancelable) e.preventDefault();
    const raw = base + (t.clientY - origin);
    place(raw >= 0 ? raw : -rubberBand(-raw, panel.offsetHeight));
    samples.push({ t: performance.now(), y: t.clientY });
    if (samples.length > 16) samples.shift();
  };

  const onEnd = (e: TouchEvent) => {
    // Only once the last finger is up; a gesture a second finger joined has
    // already been let go.
    if (e.touches.length > 0) return;
    if (phase === 'drag') release(e.type === 'touchend');
    phase = 'idle';
  };

  const onScroll = () => {
    lastScroll = performance.now();
  };

  panel.addEventListener('touchstart', onStart, { passive: true });
  // Not passive: once the sheet has the drag, the page must not scroll too.
  panel.addEventListener('touchmove', onMove, { passive: false });
  panel.addEventListener('touchend', onEnd);
  panel.addEventListener('touchcancel', onEnd);
  // Scroll does not bubble; captured, it is heard from any scroller inside.
  panel.addEventListener('scroll', onScroll, { capture: true, passive: true });
  return () => {
    panel.removeEventListener('touchstart', onStart);
    panel.removeEventListener('touchmove', onMove);
    panel.removeEventListener('touchend', onEnd);
    panel.removeEventListener('touchcancel', onEnd);
    panel.removeEventListener('scroll', onScroll, { capture: true });
    panel.style.willChange = '';
  };
}
