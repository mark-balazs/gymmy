/**
 * The five tabs, and where every other screen sits among them.
 *
 * Pure, so the rules of moving around the app — which way a move slides, and
 * which moves stack up in the browser's history — are unit-tested
 * (`tabs.test.ts`) rather than discovered in a browser.
 */

import type { Key } from '@/lib/i18n';

/**
 * The tab bar, in order.
 *
 * Each icon has to say what the tab *is* at twenty pixels, with a word beneath
 * it that is doing most of the work anyway. Two were saying the wrong thing:
 *
 *  - **Train** was a bulleted list with a plus — the universal icon for "add a
 *    row to a list". It described the mechanics of logging rather than the
 *    reason you opened the app, and it was the one icon nothing about it
 *    suggested a gym.
 *  - **Week** was a two-by-two grid, which every operating system on earth uses
 *    for "all apps". A week is a calendar; drawing it as a dashboard meant the
 *    icon had to be read twice.
 *
 * The other three are left alone. A house, a bar chart and a cog are not
 * original, and that is exactly why they work.
 */
export const TABS: readonly { href: string; key: Key; icon: string }[] = [
  {
    href: '/home',
    key: 'tab.home',
    icon: 'M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  },
  {
    href: '/train',
    key: 'tab.train',
    // A dumbbell: two collars, two plates, one bar.
    icon: 'M4.5 10v4M7.5 7.5v9M16.5 7.5v9M19.5 10v4M7.5 12h9',
  },
  {
    href: '/week',
    key: 'tab.week',
    // A calendar, divided into days rather than left as an empty page.
    icon: 'M4 6h16v14H4zM4 10h16M9 3v4M15 3v4M9 14v6M15 14v6',
  },
  { href: '/progress', key: 'tab.progress', icon: 'M4 19V5M4 19h16M8 16v-5M12 16V8M16 16v-3' },
  {
    href: '/settings',
    key: 'tab.settings',
    icon: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 13a7.5 7.5 0 000-2l2-1.5-2-3.4-2.3 1a7 7 0 00-1.8-1L14.9 3H9.1l-.4 2.9a7 7 0 00-1.8 1l-2.3-1-2 3.4L4.6 11a7.5 7.5 0 000 2l-2 1.5 2 3.4 2.3-1a7 7 0 001.8 1l.4 2.9h5.8l.4-2.9a7 7 0 001.8-1l2.3 1 2-3.4z',
  },
];

/**
 * Screens you go *into* from a tab, and the tab they come out to.
 *
 * `/coach` does not start with `/settings`, but it is reached from Settings and
 * Back from it lands there, so for moving around that is where it lives.
 */
const DRILL_INS: Record<string, string> = {
  '/settings/split': '/settings',
  '/coach': '/settings',
};

/** Which way a move slides: left is forward, right is back. */
export type Direction = 'nav-forward' | 'nav-back';

/** A tab's index if `path` is that tab itself, otherwise -1. */
export const tabIndex = (path: string): number => TABS.findIndex((t) => t.href === path);

export const isTabRoot = (path: string): boolean => tabIndex(path) >= 0;

/** The tab a screen inside one comes out to, or null for anything else. */
export const parentOf = (path: string): string | null => DRILL_INS[path] ?? null;

/** Where a screen sits: under which tab, and how far into it. Null outside the
 *  app's own screens (sign-in, onboarding), which a move never slides to. */
export function placeOf(path: string): { tab: number; depth: number } | null {
  const root = tabIndex(path);
  if (root >= 0) return { tab: root, depth: 0 };
  const parent = parentOf(path);
  if (parent) return { tab: tabIndex(parent), depth: 1 };
  return null;
}

/**
 * The direction a move from one screen to another slides in.
 *
 * Between tabs, their order on the bar: a tab to the right is forward. Within
 * a tab, depth: going in is forward, coming out is back. Null when there is
 * no move to show — the same screen, or one outside the app's own.
 */
export function directionOf(from: string, to: string): Direction | null {
  const a = placeOf(from);
  const b = placeOf(to);
  if (!a || !b) return null;
  if (a.tab !== b.tab) return b.tab > a.tab ? 'nav-forward' : 'nav-back';
  if (a.depth !== b.depth) return b.depth > a.depth ? 'nav-forward' : 'nav-back';
  return null;
}

/**
 * How a move treats the browser's history.
 *
 *  - `replace` — from one tab to another. Tabs are places side by side, not a
 *    trail: Back does not walk through every tab you glanced at, it leaves.
 *  - `push` — into a screen inside a tab. Back comes out of it again.
 *  - `back` — out of a screen inside a tab, when the entry under it is the tab
 *    it was opened from. Stepping back rather than adding the tab again on top
 *    is what keeps "Back leaves the app" true once you are out.
 *
 * `openedHere` says whether this page load opened `from` itself, which is the
 * only way to know what the entry under it is: after a reload, or a link from
 * outside, it could be anything — so then it is `replace`.
 */
export function historyFor(
  from: string,
  to: string,
  openedHere: boolean,
): 'replace' | 'push' | 'back' {
  if (isTabRoot(from) && isTabRoot(to)) return 'replace';
  if (parentOf(to) === from) return 'push';
  if (openedHere && parentOf(from)) return 'back';
  return 'replace';
}
