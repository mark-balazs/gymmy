'use client';

import { ViewTransition } from 'react';
import type { ReactNode } from 'react';

/**
 * One tab's content, and the thing that slides when you move between tabs.
 *
 * This lives in each page rather than in the layout, and that is not a
 * preference: a layout persists across navigation, so its enter and exit
 * animations never fire. Only something that genuinely unmounts can be animated
 * out.
 *
 * `default: 'none'` matters as much as the two directions. Without it every
 * navigation that carries no type — the browser's back button, a
 * `router.refresh()`, a Suspense reveal — would slide sideways too, which says
 * "you moved left" about something that was not a move at all.
 *
 * The flex column lives here rather than on `<main>` because this is the
 * element being animated, and a gap applied outside it would leave the cards
 * sliding independently of the box that is supposed to be carrying them.
 */
const DIRECTIONAL = {
  'nav-forward': 'nav-forward',
  'nav-back': 'nav-back',
  default: 'none',
} as const;

export function Page({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter={DIRECTIONAL} exit={DIRECTIONAL} default="none">
      <div data-page className="flex flex-col gap-3.5">
        {children}
      </div>
    </ViewTransition>
  );
}
