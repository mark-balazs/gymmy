'use client';

/**
 * A sideways ruler: drag it or flick it, and it glides and settles on a stop.
 *
 * **Its own physics, not native scrolling.** The obvious build is a scroller
 * with CSS scroll-snap, and on an iPhone that moves exactly one stop per flick
 * however hard you flick (WebKit bug 243582) — a ruler you have to flick forty
 * times. So the strip is moved by hand: pointer events while a finger is down,
 * a decaying glide after it lets go, and a short ease onto the nearest stop.
 * It behaves the same on every phone because none of it is the browser's.
 *
 * **A vertical scroll that starts on it scrolls the page, and never changes the
 * number.** `touch-action: pan-y` hands vertical movement to the browser, which
 * cancels the pointer the moment it starts scrolling. The ruler only moves once
 * a touch has gone further sideways than down, and if the browser cancels after
 * that anyway, the ruler puts back the number it started with. It is also
 * `data-no-swipe`, so a sideways drag here does not change tab.
 *
 * **The stops are whatever the caller passes**, evenly spaced by position
 * rather than by value. That is what lets last week's 61.25 sit between 60 and
 * 62.5 as a stop of its own instead of being rounded away — see `scaleValues`.
 * Position during a gesture lives in a ref and is drawn straight onto the
 * strip, so a flick costs no renders beyond one per stop crossed.
 *
 * For assistive technology the track is a `spinbutton`, driven by the arrow,
 * Page, Home and End keys. Some screen readers cannot adjust a custom
 * spinbutton at all, which is why the number above it is a button that opens
 * the keypad, and why Buttons stays the default.
 */

import { memo, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { formatOnScale, scalePlaces } from '@athletic/domain';
import { cn } from '@/components/ui';
import { useT } from '@/lib/client/hooks';
import { Keypad, formatAmount } from './keypad';
import { curve, reducedMotion as reduced } from './motion';
import { RollingNumber } from './rolling-number';

/** Pixels between two neighbouring stops — wide enough to aim at with a slow
 *  drag, narrow enough that a 2.5 kg change is a small movement. */
const GAP = 14;
/** Sideways travel before a touch is a drag. Below it, it is a tap or the
 *  first pixels of a vertical scroll, and the ruler stays where it is. */
const SLOP = 6;
/** Release speed, in px/ms, below which letting go settles rather than glides. */
const FLICK = 0.15;
/** Per-millisecond decay of a glide, and the speed at which it gives up and
 *  eases onto a stop. Tuned by hand in the prototype until a hard flick crossed
 *  about thirty stops and a lazy one two or three. */
const FRICTION = 0.994;
const REST = 0.03;
/** Long enough to be seen settling, short enough that the next tap is not
 *  waiting on it. The settle runs on `--ease-spring`, so it lands with a small
 *  give rather than a hard stop; every motion here stays under a quarter of a
 *  second, so none of it is still running when the next touch comes. */
const SNAP_MS = 200;
const TWEEN_MS = 200;

type Mode = 'idle' | 'drag' | 'glide' | 'snap' | 'tween';

interface Drag {
  id: number;
  x0: number;
  y0: number;
  /** Strip position when the drag took hold. */
  p0: number;
  /** Past the slop and sideways: from here on the ruler follows the finger. */
  moving: boolean;
  /** Recent [time, x] pairs, for the speed at release. */
  samples: [number, number][];
  /** The value and stop before the gesture, to put back if it is cancelled. */
  from: number | null;
  index: number;
  /** Came down on a ruler that was still gliding: a tap that stops it. */
  caught: boolean;
}

/** Everything the gesture needs between frames. A ref, never state: it changes
 *  sixty times a second and nothing about it needs a render. */
interface Physics {
  list: readonly number[];
  /** Pixels along the strip; stop `i` sits at `i * GAP`. */
  pos: number;
  /** The stop last reported, so each is reported once as it is crossed. */
  shown: number;
  mode: Mode;
  raf: number;
  /** Where a tween is heading, so a repeat of the same value does not restart it. */
  target: number;
  drag: Drag | null;
  placed: boolean;
  buzzAt: number;
  el: HTMLDivElement | null;
  /** The tick under the needle, marked so its label stands out. */
  marked: Element | null;
  report: (v: number) => void;
  settled: () => void;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const easeOut = (k: number) => 1 - (1 - k) ** 3;
const lastPos = (ph: Physics) => Math.max(0, (ph.list.length - 1) * GAP);
const indexAt = (ph: Physics, pos: number) =>
  clamp(Math.round(pos / GAP), 0, Math.max(0, ph.list.length - 1));

/** The stop closest to a value. The value is normally one of them — the caller
 *  adds it — but a caller that forgets gets the nearest, not a crash. */
function nearest(list: readonly number[], v: number): number {
  let best = 0;
  for (let i = 1; i < list.length; i++) {
    if (Math.abs(list[i]! - v) < Math.abs(list[best]! - v)) best = i;
  }
  return best;
}

/** `by` stops up or down from a value, which need not be a stop itself: from
 *  61.25 on a list without it, one up is 62.5 and one down is 60. */
function stepFrom(list: readonly number[], v: number, by: number): number {
  if (by > 0) {
    const i = list.findIndex((x) => x > v + 1e-9);
    return i === -1 ? list.length - 1 : Math.min(list.length - 1, i + by - 1);
  }
  const i = list.findLastIndex((x) => x < v - 1e-9);
  return i === -1 ? 0 : Math.max(0, i + by + 1);
}

const isMultiple = (v: number, of: number) => Math.abs(v / of - Math.round(v / of)) < 1e-6;

/** The spacing of the grid under the extras — the commonest gap between stops. */
function gridStep(list: readonly number[]): number {
  const seen = new Map<number, number>();
  let best = 1;
  let most = 0;
  for (let i = 1; i < list.length; i++) {
    const d = Math.round((list[i]! - list[i - 1]!) * 100) / 100;
    const n = (seen.get(d) ?? 0) + 1;
    seen.set(d, n);
    if (n > most) [best, most] = [d, n];
  }
  return best;
}

/** Which values get a number under them: round ones, at least four stops
 *  apart, so the labels never touch — every 10 kg, every 5 reps, every 20 lb. */
const labelEvery = (step: number): number =>
  [5, 10, 20, 25, 50, 100, 250].find((c) => c >= step * 4 && isMultiple(c, step)) ?? step * 5;

/* ------------------------------------------------------------- the motion */

function place(ph: Physics) {
  if (ph.el) ph.el.style.transform = `translate3d(${-ph.pos}px, 0, 0)`;
}

/**
 * Mark the tick under the needle, so its label can stand up out of the scale.
 *
 * An attribute set straight on the element, not state: it changes once per
 * stop crossed, and re-rendering a hundred ticks to move one highlight would
 * put React on the hot path of a flick. The label's own CSS transition does the
 * easing, so nothing here waits on it.
 */
function mark(ph: Physics) {
  const tick = ph.el?.children[ph.shown] ?? null;
  if (tick === ph.marked) return;
  ph.marked?.removeAttribute('data-on');
  tick?.setAttribute('data-on', '');
  ph.marked = tick;
}

/** A tiny tick per stop, where the platform has one — Android only; iOS has no
 *  web vibration at all. Throttled, or a fast glide is a buzz. */
function buzz(ph: Physics) {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  const now = performance.now();
  if (now - ph.buzzAt < 40) return;
  ph.buzzAt = now;
  try {
    navigator.vibrate(4);
  } catch {
    /* Refused without a user gesture; a missing tick is no loss. */
  }
}

/** Moved by a hand: draw it, and report the stop under the needle as it changes. */
function follow(ph: Physics) {
  place(ph);
  const i = indexAt(ph, ph.pos);
  if (i === ph.shown) return;
  ph.shown = i;
  mark(ph);
  const v = ph.list[i];
  if (v === undefined) return;
  ph.report(v);
  buzz(ph);
}

function halt(ph: Physics) {
  cancelAnimationFrame(ph.raf);
  ph.raf = 0;
}

function settle(ph: Physics) {
  ph.raf = 0;
  ph.mode = 'idle';
  ph.settled();
}

function snap(ph: Physics) {
  halt(ph);
  const from = ph.pos;
  const to = indexAt(ph, from) * GAP;
  if (reduced() || Math.abs(to - from) < 0.5) {
    ph.pos = to;
    follow(ph);
    settle(ph);
    return;
  }
  ph.mode = 'snap';
  const t0 = performance.now();
  const spring = curve('--ease-spring');
  const frame = (t: number) => {
    const k = clamp((t - t0) / SNAP_MS, 0, 1);
    // A snap is never more than half a stop, so the spring's overshoot cannot
    // carry the needle onto the next one.
    ph.pos = from + (to - from) * spring(k);
    follow(ph);
    if (k < 1) ph.raf = requestAnimationFrame(frame);
    else settle(ph);
  };
  ph.raf = requestAnimationFrame(frame);
}

function glide(ph: Physics, speed: number) {
  halt(ph);
  ph.mode = 'glide';
  const end = lastPos(ph);
  let v = speed;
  let prev = performance.now();
  const frame = (t: number) => {
    const dt = Math.max(0, t - prev);
    prev = t;
    ph.pos = clamp(ph.pos + v * dt, 0, end);
    v *= FRICTION ** dt;
    follow(ph);
    if (Math.abs(v) > REST && ph.pos > 0 && ph.pos < end) ph.raf = requestAnimationFrame(frame);
    else snap(ph);
  };
  ph.raf = requestAnimationFrame(frame);
}

/** Moved by the value — a key, the keypad: draw only. The number already
 *  changed; the ruler is catching up with it, not choosing it. */
function tween(ph: Physics, to: number) {
  halt(ph);
  ph.mode = 'tween';
  ph.target = to;
  const from = ph.pos;
  const t0 = performance.now();
  const frame = (t: number) => {
    const k = clamp((t - t0) / TWEEN_MS, 0, 1);
    ph.pos = from + (to - from) * easeOut(k);
    place(ph);
    if (k < 1) ph.raf = requestAnimationFrame(frame);
    else {
      ph.raf = 0;
      ph.mode = 'idle';
    }
  };
  ph.raf = requestAnimationFrame(frame);
}

/* ------------------------------------------------------------ the picture */

const sameList = (a: readonly number[], b: readonly number[]) =>
  a === b || (a.length === b.length && a.every((v, i) => v === b[i]));

/**
 * A hundred-odd ticks that only change when the stops do. Compared by content,
 * because the caller builds a fresh array every render and the ruler renders
 * once per stop crossed.
 *
 * Labels are written with the scale's decimals, like the readout. The one
 * under the needle — `data-on`, set by `mark` — grows and darkens on the
 * spring curve while the rest stay muted, so the scale reads like a dial
 * turning under a fixed pointer. Size and colour only: nothing that moves
 * layout, so it costs no reflow in the middle of a flick.
 *
 * With reduced motion it darkens and does not grow. Zeroing the transition —
 * what the stylesheet does for everything — is not enough here: the label
 * would still jump to 1.25× and back at every stop, which is exactly the
 * scaling the setting asks to be spared.
 */
const Ticks = memo(
  function Ticks({
    list,
    every,
    places,
  }: {
    list: readonly number[];
    every: number;
    places: number;
  }) {
    return list.map((v, i) => {
      const major = isMultiple(v, every);
      return (
        <span
          key={v}
          className={cn(
            'group absolute bottom-0 w-0.5 -translate-x-1/2 rounded-full bg-[var(--color-muted)]',
            major ? 'h-[22px] opacity-80 data-[on]:opacity-100' : 'h-3 opacity-45',
          )}
          style={{ left: i * GAP }}
        >
          {major && (
            <span
              data-label
              className={cn(
                /* Above the needle's tip (32 px), not beside it: with every
                   value written to the scale's decimals a label is wide
                   enough — "100.0", "60.00" — to reach the needle one stop
                   away. Grown to 1.25× it still clears the top at 56 px. */
                'num absolute bottom-[33px] left-1/2 origin-bottom -translate-x-1/2 text-xs font-semibold whitespace-nowrap text-[var(--color-muted)]',
                'transition-[scale,color] duration-200 ease-[var(--ease-spring)]',
                'group-data-[on]:font-bold group-data-[on]:text-[var(--color-ink)] motion-safe:group-data-[on]:scale-125',
              )}
            >
              {formatOnScale(v, places)}
            </span>
          )}
        </span>
      );
    });
  },
  (a, b) => a.every === b.every && a.places === b.places && sameList(a.list, b.list),
);

/* ------------------------------------------------------------ the control */

const KEY_STEPS: Record<string, number> = {
  ArrowRight: 1,
  ArrowUp: 1,
  ArrowLeft: -1,
  ArrowDown: -1,
  PageUp: 5,
  PageDown: -5,
};

export interface RulerProps {
  /** Every stop, ascending — `scaleValues(scale, current, lastTime)`. */
  values: readonly number[];
  value: number | null;
  onChange: (v: number) => void;
  /** Which number this is. Picks the caption and the keypad's title. */
  label: 'weight' | 'reps';
  /** Shown after the number; empty for reps. */
  unit: string;
  /** Id of the note that says what the number means — the load caption. */
  describedBy?: string;
  /** The readout button's name: "Type weight", "Type reps". */
  typeLabel: string;
  /** Whether the keypad's point key works. */
  decimals: boolean;
  /** The scale's ends, announced as the spinbutton's range. Widened to take in
   *  a stop past either end, so the announced range never excludes the value. */
  min: number;
  max: number;
  /** What nothing reads as — "None" for the added weight on a bodyweight lift. */
  noneLabel?: string;
}

export function Ruler({
  values,
  value,
  onChange,
  label,
  unit,
  describedBy,
  typeLabel,
  decimals,
  min,
  max,
  noneLabel,
}: RulerProps) {
  const tr = useT();
  const captionId = useId();
  const valueId = useId();
  const [opener, setOpener] = useState<HTMLElement | null>(null);
  /**
   * The stops a gesture started with, held until it settles.
   *
   * The caller's list contains the current value, so it changes as the ruler
   * moves: drag off a typed 61 and 61 drops out of the list, every stop above
   * it shifts down one place, and the needle would suddenly be pointing at a
   * different number mid-drag. Frozen, the list only changes once the ruler is
   * at rest, where the needle is re-anchored by value rather than by position.
   */
  const [frozen, setFrozen] = useState<readonly number[] | null>(null);
  const list = frozen ?? values;
  const strip = useRef<HTMLDivElement>(null);
  const phys = useRef<Physics>({
    list,
    pos: 0,
    shown: -1,
    mode: 'idle',
    raf: 0,
    target: 0,
    drag: null,
    placed: false,
    buzzAt: 0,
    el: null,
    marked: null,
    report: onChange,
    settled: () => {},
  });

  /* One count of decimals for the whole scale, and the widest value on it, so
     the readout is one width from end to end. Read from the frozen list during
     a gesture, so neither can change under a moving finger. */
  const places = useMemo(() => scalePlaces(list), [list]);
  const widest = useMemo(
    () => Math.max(1, ...list.map((v) => formatOnScale(v, places).length)),
    [list, places],
  );

  /* The latest of everything the frames call out to. Declared first, so it
     has run before the effect below positions anything. */
  useLayoutEffect(() => {
    const ph = phys.current;
    ph.el = strip.current;
    ph.report = onChange;
    ph.settled = () => setFrozen(null);
  });

  /**
   * Put the strip where the value is — whenever the value or the stops change
   * while no hand is on the ruler.
   *
   * A layout effect so the first paint is already in place. A change of value
   * eases across (an arrow key, the keypad); a change of stops alone jumps,
   * because the needle stays on the same number and only the ticks around it
   * moved. During a gesture it does nothing: the gesture is the source of the
   * value then, and re-anchoring runs when it settles and unfreezes the list.
   */
  useLayoutEffect(() => {
    const ph = phys.current;
    if (ph.mode === 'drag' || ph.mode === 'glide' || ph.mode === 'snap') return;
    const before = ph.list[ph.shown];
    ph.list = list;
    const i = nearest(list, value ?? min);
    ph.shown = i;
    const to = i * GAP;
    mark(ph);
    if (!ph.placed || before === list[i] || reduced()) {
      halt(ph);
      ph.mode = 'idle';
      ph.pos = to;
      ph.placed = true;
      place(ph);
    } else if (ph.mode !== 'tween' || ph.target !== to) {
      tween(ph, to);
    }
  }, [list, value, min]);

  useEffect(() => {
    const ph = phys.current;
    return () => halt(ph);
  }, []);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const ph = phys.current;
    const caught = ph.mode === 'glide' || ph.mode === 'snap';
    halt(ph);
    if (ph.mode === 'tween') {
      // Finish catching up at once, so the drag starts from the value.
      ph.pos = ph.target;
      ph.mode = 'idle';
      place(ph);
    }
    // A glide caught by a finger stays the hand's until it is let go.
    if (caught) ph.mode = 'drag';
    ph.drag = {
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      p0: ph.pos,
      moving: false,
      samples: [[e.timeStamp, e.clientX]],
      from: value,
      index: ph.shown,
      caught,
    };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const ph = phys.current;
    const d = ph.drag;
    if (!d || e.pointerId !== d.id) return;
    if (!d.moving) {
      const dx = e.clientX - d.x0;
      const dy = e.clientY - d.y0;
      // Not yet sideways enough to be the ruler's. It may still become a
      // page scroll, and until it is decided nothing moves.
      if (Math.abs(dx) < SLOP || Math.abs(dx) < Math.abs(dy)) return;
      d.moving = true;
      d.x0 = e.clientX;
      d.p0 = ph.pos;
      ph.mode = 'drag';
      try {
        // Keeps a mouse drag alive past the ruler's edge.
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* The pointer is already gone; the up or cancel will follow. */
      }
      setFrozen(ph.list);
    }
    ph.pos = clamp(d.p0 - (e.clientX - d.x0), 0, lastPos(ph));
    d.samples.push([e.timeStamp, e.clientX]);
    if (d.samples.length > 8) d.samples.shift();
    follow(ph);
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const ph = phys.current;
    const d = ph.drag;
    if (!d || e.pointerId !== d.id) return;
    ph.drag = null;
    // A tap on a still ruler does nothing — the number above it is what opens
    // the keypad. A tap that caught a glide lets it settle where it stopped.
    if (!d.moving) {
      if (d.caught) snap(ph);
      return;
    }
    // Speed over the last tenth of a second only: a finger that stopped and
    // then lifted meant to stop, however fast it was going before.
    const recent = d.samples.filter(([t]) => e.timeStamp - t <= 100);
    const a = recent[0];
    const b = recent[recent.length - 1];
    const speed = a && b && b[0] > a[0] ? -(b[1] - a[1]) / (b[0] - a[0]) : 0;
    if (Math.abs(speed) > FLICK && !reduced()) glide(ph, speed * 1.1);
    else snap(ph);
  };

  const onPointerCancel = (e: PointerEvent<HTMLDivElement>) => {
    const ph = phys.current;
    const d = ph.drag;
    if (!d || e.pointerId !== d.id) return;
    ph.drag = null;
    if (!d.moving) {
      if (d.caught) snap(ph);
      return;
    }
    // The browser took the gesture — the page is scrolling. Whatever the ruler
    // did on the way is undone, because a scroll never changes a number.
    halt(ph);
    const changed = ph.shown !== d.index;
    ph.pos = d.index * GAP;
    ph.shown = d.index;
    place(ph);
    mark(ph);
    const back = d.from ?? ph.list[d.index];
    if (changed && back !== undefined) ph.report(back);
    settle(ph);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const by = KEY_STEPS[e.key];
    const at = value ?? list[nearest(list, min)] ?? min;
    let i: number;
    if (by !== undefined) i = stepFrom(list, at, by);
    else if (e.key === 'Home') i = 0;
    else if (e.key === 'End') i = list.length - 1;
    else return;
    e.preventDefault();
    const v = list[i];
    if (v !== undefined && v !== value) onChange(v);
  };

  const empty = value === null || (noneLabel !== undefined && value === 0);
  // On screen, every value on the scale has the same decimals: 60.0, 62.5.
  const shown = empty ? (noneLabel ?? '—') : formatOnScale(value, places);
  // Heard, the number as anybody would say it: "60 kilograms", not "60.0".
  const said = empty ? shown : formatAmount(value);
  const spoken = empty || !unit ? said : `${said} ${unit}`;
  const word = tr.t(label === 'weight' ? 'entry.weight' : 'entry.reps');

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between gap-2">
        <span
          id={captionId}
          className="text-[10.5px] font-bold tracking-wider text-[var(--color-muted)] uppercase"
        >
          {word}
        </span>
        <button
          type="button"
          aria-label={typeLabel}
          aria-describedby={valueId}
          // For tests: the number without the unit or the "None".
          data-value={value ?? ''}
          onClick={(e) => setOpener(e.currentTarget)}
          className="-mr-1 inline-flex min-h-[var(--spacing-tap)] min-w-[var(--spacing-tap)] cursor-pointer items-baseline justify-end gap-1 rounded-[11px] px-2 transition-[transform,background-color] duration-150 hover:bg-[var(--color-surface-2)] active:scale-[0.97]"
        >
          {/* Tabular figures and a box as wide as the widest value on the
              scale, right-aligned: the number changes, the space it takes does
              not, and the unit beside it never moves. */}
          <RollingNumber
            text={shown}
            value={empty ? null : value}
            className="num justify-end self-center text-[24px] leading-none font-bold"
            style={{ minWidth: `${widest}ch` }}
          />
          {unit && !empty && (
            <span
              aria-hidden
              className="self-center text-[13px] font-semibold text-[var(--color-muted)]"
            >
              {unit}
            </span>
          )}
        </button>
        <span id={valueId} className="sr-only">
          {spoken}
        </span>
      </div>

      <div
        role="spinbutton"
        tabIndex={0}
        aria-labelledby={captionId}
        aria-describedby={describedBy}
        aria-valuenow={value ?? undefined}
        aria-valuemin={Math.min(min, list[0] ?? min)}
        aria-valuemax={Math.max(max, list[list.length - 1] ?? max)}
        aria-valuetext={spoken}
        // A sideways drag here moves the ruler; it must not also change tab.
        data-no-swipe
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onKeyDown={onKeyDown}
        className="relative h-[56px] cursor-grab touch-pan-y rounded-[12px] bg-[var(--color-surface-2)] select-none active:cursor-grabbing"
      >
        {/* The fade is on an inner layer: a mask on the track itself would
            also mask its focus ring. */}
        <div
          aria-hidden
          className="absolute inset-0 overflow-hidden rounded-[12px] [mask-image:linear-gradient(90deg,transparent,#000_18%,#000_82%,transparent)]"
        >
          <div ref={strip} className="absolute inset-y-0 left-1/2 will-change-transform">
            <Ticks list={list} every={labelEvery(gridStep(list))} places={places} />
          </div>
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-1/2 h-8 w-[3px] -translate-x-1/2 rounded-full bg-[var(--color-accent)]"
        />
      </div>

      <Keypad
        open={opener !== null}
        opener={opener}
        title={word}
        unit={unit}
        value={value}
        places={places}
        decimals={decimals}
        onDone={onChange}
        onClose={() => setOpener(null)}
      />
    </div>
  );
}
