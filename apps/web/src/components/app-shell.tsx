'use client';

/**
 * The app frame: header, tab bar, and the sync indicator.
 *
 * The sync state is shown rather than hidden, because "saved on this device"
 * versus "saved everywhere" is a distinction the user genuinely needs when they
 * are standing in a basement with no signal.
 */

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { cn } from '@/components/ui';
import { Avatar } from '@/components/avatar';
import { useProfile, useSyncStatus, useT } from '@/lib/client/hooks';
import { startSync } from '@/lib/client/sync';
import type { Key } from '@/lib/i18n';

/**
 * The tab bar.
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
const TABS = [
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
] as const;

/** Far enough that it cannot be a tap, and clearly sideways rather than a
 *  scroll that drifted. */
const SWIPE_PX = 64;
const SIDEWAYS = 1.5;

/**
 * Swipe left and right between the tabs.
 *
 * Touch only — a mouse drag across a page means selecting text, and hijacking
 * it would break that everywhere. Three things are deliberately excluded:
 *
 *  - anything inside `[data-no-swipe]`, because a chart you drag to inspect and
 *    a carousel both need the horizontal axis more than the tab bar does;
 *  - a gesture that is mostly vertical, which is a scroll that wandered;
 *  - any route that is not a tab root. `/settings/split` holds an unsaved
 *    draft, and navigating away from it on a stray thumb movement would throw
 *    that away silently.
 */
function useSwipeTabs(pathname: string): void {
  const router = useRouter();

  useEffect(() => {
    const index = TABS.findIndex((t) => t.href === pathname);
    if (index < 0) return;

    let x0 = 0;
    let y0 = 0;
    let tracking = false;

    const start = (e: TouchEvent) => {
      const touch = e.touches[0];
      tracking =
        e.touches.length === 1 &&
        !!touch &&
        !(e.target as Element | null)?.closest?.('[data-no-swipe]');
      if (!touch) return;
      x0 = touch.clientX;
      y0 = touch.clientY;
    };

    const end = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const touch = e.changedTouches[0];
      if (!touch) return;

      const dx = touch.clientX - x0;
      const dy = touch.clientY - y0;
      if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy) * SIDEWAYS) return;

      // Left drags the next tab into view, which is the direction every phone
      // has taught people to expect.
      const forward = dx < 0;
      const next = TABS[forward ? index + 1 : index - 1];
      // The type is what the slide direction is read from; without it the
      // navigation happens with no animation at all.
      if (next) router.push(next.href, { transitionTypes: [forward ? 'nav-forward' : 'nav-back'] });
    };

    document.addEventListener('touchstart', start, { passive: true });
    document.addEventListener('touchend', end, { passive: true });
    return () => {
      document.removeEventListener('touchstart', start);
      document.removeEventListener('touchend', end);
    };
  }, [pathname, router]);
}

function SyncBadge() {
  const { t } = useT();
  const status = useSyncStatus();

  const label =
    status.state === 'storage'
      ? t('sync.storage')
      : status.state === 'syncing'
        ? t('sync.syncing')
        : status.state === 'offline'
          ? t('sync.offline')
          : status.state === 'error'
            ? t('sync.error')
            : status.pending > 0
              ? t('sync.pending', { n: status.pending })
              : t('sync.idle');

  const dot =
    status.state === 'storage'
      ? 'bg-[var(--color-bad)]'
      : status.state === 'error'
        ? 'bg-[var(--color-bad)]'
        : status.state === 'offline'
          ? 'bg-[var(--color-warn)]'
          : status.state === 'syncing'
            ? 'bg-[var(--color-muted)] animate-pulse'
            : 'bg-[var(--color-accent)]';

  /* The dot alone. The words beside it were a running commentary on something
     that is almost always fine — "All saved", every screen, all day — and they
     cost the header the width the title needed. The colour is the whole
     message: green is fine, amber is offline, red wants you, and the one state
     that genuinely needs a sentence has a screen of its own.
     The label is kept for screen readers and as a hover tooltip, because a
     bare coloured dot is meaningless without one. `sr-only` rather than a live
     region: this changes on every sync, and announcing each one would be a
     stream of interruptions to say nothing happened. */
  return (
    <span className="flex items-center" title={label}>
      <span className={cn('h-2.5 w-2.5 rounded-full', dot)} aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/**
 * Your picture, top right, going to Settings.
 *
 * Settings is already a tab, so this is not the only way in — it is the way
 * people look for without thinking, and it is the only place in the frame that
 * is *yours* rather than the app's. It stays a link rather than becoming a
 * menu: one destination, and a menu holding a single item is a tap nobody
 * wanted.
 *
 * **Named "Your profile", not "Settings"**, even though both go to the same
 * page. Two links with one name is an ambiguity in the accessibility tree
 * before it is one in a test — "Settings, link. Settings, link." tells somebody
 * navigating by name nothing about which is which, and the honest distinction
 * is that this one is about *you* and the tab is about the app.
 */
function ProfileLink() {
  const profile = useProfile();
  const { t } = useT();

  return (
    <Link
      href="/settings"
      aria-label={t('nav.you')}
      className="block h-8 w-8 shrink-0 rounded-full transition-transform duration-150 active:scale-95"
    >
      <Avatar src={profile?.avatar} />
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useT();

  useSwipeTabs(pathname);

  useEffect(() => {
    startSync();
  }, []);

  const active = TABS.find((tab) => pathname.startsWith(tab.href)) ?? TABS[0];
  const titleKey = active.key.replace('tab.', 'title.') as Key;

  return (
    <div className="pb-[calc(62px+env(safe-area-inset-bottom))]">
      {/* Named so it can be pinned during a slide. A header that travels with
          the content leaves the reader without a fixed point, and the whole
          viewport appears to move rather than the page inside it. */}
      <header
        style={{ viewTransitionName: 'app-header' }}
        className="safe-top sticky top-0 z-20 border-b border-[var(--color-line)]/70 bg-[var(--color-bg)]/75 px-4 pt-3 pb-3 backdrop-blur-xl"
      >
        <div className="mx-auto flex max-w-[760px] items-center justify-between">
          <h1 className="text-[22px] font-bold tracking-[-0.02em]">{t(titleKey)}</h1>
          <div className="flex items-center gap-3">
            <SyncBadge />
            <ProfileLink />
          </div>
        </div>
      </header>

      {/* The flex column moved into `Page`: that is the element which slides,
          and spacing applied outside it would leave the cards travelling
          independently of the box carrying them. */}
      <main className="mx-auto max-w-[760px] p-4">{children}</main>

      <nav
        style={{ viewTransitionName: 'app-nav' }}
        className="safe-bottom fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-[var(--color-line)]/70 bg-[var(--color-surface)]/80 backdrop-blur-xl"
      >
        {TABS.map((tab, i) => {
          const on = pathname.startsWith(tab.href);
          // Tapping a tab is the same movement as swiping to it, so it gets
          // the same direction rather than a different animation for the same
          // journey.
          const forward = i > TABS.indexOf(active);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              transitionTypes={[forward ? 'nav-forward' : 'nav-back']}
              aria-current={on ? 'page' : undefined}
              className={cn(
                'relative flex h-[62px] flex-col items-center justify-center gap-0.5 text-[10.5px] font-semibold',
                'transition-colors duration-200',
                on ? 'text-[var(--color-accent)]' : 'text-[var(--color-muted)]',
              )}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
                aria-hidden
              >
                <path d={tab.icon} />
              </svg>
              {t(tab.key)}
              {on && (
                <span
                  aria-hidden
                  className="absolute top-0 h-0.5 w-8 rounded-full bg-[image:var(--gradient-accent)]"
                />
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
