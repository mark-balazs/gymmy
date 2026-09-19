'use client';

/**
 * Every move between the app's screens: which way it slides, and what it does
 * to the browser's history.
 *
 * Two rules, both from `tabs.ts`:
 *
 *  - **Every move slides, and the direction means something** — a tab to the
 *    right is forward, going into a screen is forward, coming out is back. A
 *    move that forgets its direction does not slide at all, which is why no
 *    link to another screen is a bare `<Link>`: they are `NavLink`s, or call
 *    `useMove()`.
 *  - **Tabs do not stack up in history.** Moving between tabs replaces the
 *    entry, so the phone's Back leaves the app rather than walking back
 *    through every tab you looked at. Going into a screen inside a tab (the
 *    split editor, Coaching) adds an entry, so Back comes out of it; leaving
 *    that screen by any other way steps back out of it first.
 *
 * The browser's own Back and Forward are handled here too (`useHistorySlides`).
 * Next.js restores them without a transition, so they would never slide; this
 * takes them over and replays them as a typed move.
 */

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, type ComponentProps } from 'react';
import { POPSTATE_HOOK } from './history-first';
import { directionOf, historyFor, parentOf } from './tabs';

/**
 * The screen inside a tab that this page load opened, while it is on screen.
 * Only then is the history entry under it known to be its tab; after a reload
 * it could be anything, and stepping back would leave the app.
 */
let opened: string | null = null;

/** Where to go once a step back out of a screen has landed. */
let thenGo: { href: string; types: string[] } | null = null;

/**
 * Moves to `href` with its direction, and with the history rule for the move.
 * `types` adds transition types to the direction — a swipe adds `swipe`.
 */
export function useMove(): (href: string, types?: string[]) => void {
  const router = useRouter();
  const pathname = usePathname();

  return useCallback(
    (href: string, types: string[] = []) => {
      const from = pathname;
      if (href === from) return;
      const direction = directionOf(from, href);
      const transitionTypes = direction ? [direction, ...types] : types;

      switch (historyFor(from, href, opened === from)) {
        case 'push':
          opened = href;
          router.push(href, { transitionTypes });
          return;
        case 'back':
          /* Out of a screen this load opened: the entry under it is its tab.
             Step back onto it and, if the destination is somewhere else,
             replace it there (`useHistorySlides` does both) — so leaving the
             split editor for Week leaves one entry, Week, not three. */
          opened = null;
          thenGo = href === parentOf(from) ? null : { href, types: transitionTypes };
          window.history.back();
          return;
        case 'replace':
          router.replace(href, { transitionTypes });
      }
    },
    [router, pathname],
  );
}

/**
 * A link to another of the app's screens. A real `<a href>` — it prefetches,
 * opens in a new tab with a modifier, and is a link to a screen reader — whose
 * ordinary click moves through `useMove`.
 */
export function NavLink({
  href,
  ...props
}: Omit<ComponentProps<typeof Link>, 'href' | 'replace' | 'transitionTypes' | 'onNavigate'> & {
  href: string;
}) {
  const move = useMove();
  return (
    <Link
      href={href}
      onNavigate={(e) => {
        e.preventDefault();
        move(href);
      }}
      {...props}
    />
  );
}

/**
 * Back and Forward, as moves.
 *
 * Next.js restores a history entry synchronously, outside any transition, so
 * a `<ViewTransition>` never sees it: Back from the split editor simply
 * swapped the page. This hears the event first — through the listener the
 * root layout inlines ahead of every bundle (`history-first.ts`) — stops
 * Next's own listener, and navigates to the same place as a typed replace
 * instead: the entry the browser moved to stays where it is, and the move
 * slides the way it went.
 *
 * Left alone: an entry Next did not write (`__NA`), a move with no direction
 * (the same screen, or one outside the app), and a Back the phone has already
 * animated itself — iOS's edge swipe draws its own slide, and a second one on
 * top of it would play the move twice.
 */
export function useHistorySlides(pathname: string): void {
  const router = useRouter();
  const at = useRef(pathname);

  useEffect(() => {
    at.current = pathname;
  }, [pathname]);

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const from = at.current;
      const to = window.location.pathname;
      const next = thenGo;
      thenGo = null;
      // Forward again into a screen from its own tab: the entry under it is
      // that tab once more.
      opened = parentOf(to) === from ? to : null;

      const state = e.state as { __NA?: boolean } | null;
      if (!state?.__NA) return;

      if (next) {
        e.stopImmediatePropagation();
        router.replace(next.href, { transitionTypes: next.types });
        return;
      }

      if ((e as PopStateEvent & { hasUAVisualTransition?: boolean }).hasUAVisualTransition) return;
      const direction = directionOf(from, to);
      if (!direction) return;
      e.stopImmediatePropagation();
      router.replace(`${to}${window.location.search}${window.location.hash}`, {
        transitionTypes: [direction],
      });
    };

    const hook = window as unknown as Record<string, unknown>;
    hook[POPSTATE_HOOK] = onPop;
    return () => {
      if (hook[POPSTATE_HOOK] === onPop) delete hook[POPSTATE_HOOK];
    };
  }, [router]);
}
