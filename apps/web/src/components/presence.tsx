'use client';

/**
 * Keeps something on screen while it leaves.
 *
 * A sheet is usually mounted by its caller — `{picking && <ExercisePicker …/>}`
 * — and the moment the caller stops rendering it, React takes it out of the
 * page. Nothing inside can play an exit once it is gone, which is why every
 * sheet used to vanish in one frame.
 *
 * `<Presence>` goes around that condition:
 *
 * ```tsx
 * <Presence>{picking && <ExercisePicker … />}</Presence>
 * ```
 *
 * When the child goes away, `Presence` keeps rendering the last one it had,
 * in the same place — so its context and its portal survive — and tells it
 * through `usePresence()` that it is no longer wanted. The child plays its exit
 * and calls `done()`; only then is it removed. The caller's own state is
 * already closed the whole time, so nothing waits on an animation: a tap on
 * the page behind lands at once.
 *
 * **Every opening is a new one.** Wanted again while it is still leaving, the
 * leaving one goes at once and a fresh one mounts, entrance and all — exactly
 * as it would have after the exit. A picker reopened in that moment starts with
 * an empty search, a keypad with nothing typed, as they always have.
 *
 * One child at a time, and only an element: anything else (`false`, `null`)
 * means "nothing wanted".
 */

import {
  Fragment,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import type { ReactElement, ReactNode } from 'react';

export interface PresenceState {
  /** Still wanted. False while the exit plays. */
  present: boolean;
  /** Call once the exit has finished; the child is then removed. */
  done: () => void;
}

/** Outside any `<Presence>`: always present, and nothing to report to. */
const ALWAYS: PresenceState = { present: true, done: () => {} };

const PresenceContext = createContext<PresenceState>(ALWAYS);

export function usePresence(): PresenceState {
  return useContext(PresenceContext);
}

/**
 * Hides any `<Presence>` above from what is rendered inside — a sheet wraps its
 * content in this, so a sheet opened from inside another sheet answers to its
 * own presence, not its parent's.
 */
export function PresenceBoundary({ children }: { children: ReactNode }) {
  return <PresenceContext value={ALWAYS}>{children}</PresenceContext>;
}

export function Presence({
  children,
  onExit,
}: {
  children: ReactNode;
  /** Called after a child's exit has finished and it has been removed. */
  onExit?: () => void;
}) {
  const live = isValidElement(children) ? (children as ReactElement) : null;
  /** The last element that was wanted: what is shown while it leaves. */
  const [kept, setKept] = useState<ReactElement | null>(live);
  const [wanted, setWanted] = useState(live !== null);
  /** Which opening this is; a new one mounts a new child. */
  const [opening, setOpening] = useState(0);

  /* Adjusted while rendering, as React recommends for state that follows a
     prop: an effect would render one frame with nothing in it first, and the
     child would be unmounted rather than kept. */
  if ((live !== null) !== wanted) {
    setWanted(live !== null);
    if (live) setOpening(opening + 1);
  }
  if (live && live !== kept) setKept(live);

  const leaving = !live && kept !== null;

  const done = useCallback(() => {
    setKept(null);
    onExit?.();
  }, [onExit]);

  const state = useMemo(() => ({ present: !leaving, done }), [leaving, done]);

  const shown = live ?? kept;
  if (!shown) return null;
  return (
    <PresenceContext value={state}>
      <Fragment key={opening}>{shown}</Fragment>
    </PresenceContext>
  );
}
