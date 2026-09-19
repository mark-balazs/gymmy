'use client';

/**
 * The app frame: header, tab bar, and the sync indicator.
 *
 * The sync state is shown rather than hidden, because "saved on this device"
 * versus "saved everywhere" is a distinction the user genuinely needs when they
 * are standing in a basement with no signal.
 */

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { cn } from '@/components/ui';
import { Avatar } from '@/components/avatar';
import { NavLink, useHistorySlides, useMove } from '@/components/navigate';
import { useSwipeTabs } from '@/components/swipe-tabs';
import { TABS } from '@/components/tabs';
import { useProfile, useSyncStatus, useT } from '@/lib/client/hooks';
import { dismissStorageFailure, startSync } from '@/lib/client/sync';
import type { Key } from '@/lib/i18n';

function SyncBadge() {
  const { t, count } = useT();
  const status = useSyncStatus();
  /* A write that never landed outranks anything the sync says, and stays until
     the person dismisses the warning under the header. */
  const lost = status.storageFailure !== null;

  const label = lost
    ? t('sync.storage')
    : status.state === 'syncing'
      ? t('sync.syncing')
      : status.state === 'offline'
        ? t('sync.offline')
        : status.state === 'error'
          ? t('sync.error')
          : status.pending > 0
            ? count('sync.pending', status.pending)
            : t('sync.idle');

  const dot =
    status.state === 'error'
      ? 'bg-[var(--color-bad)]'
      : status.state === 'offline'
        ? 'bg-[var(--color-warn)]'
        : status.state === 'syncing'
          ? 'bg-[var(--color-muted)] animate-pulse'
          : 'bg-[var(--color-accent)]';

  /* The dot alone. The words beside it were a running commentary on something
     that is almost always fine — "All saved", every screen, all day — and they
     cost the header the width the title needed. The colour is the whole
     message: green is fine (a change waiting its turn included), grey is
     saving, amber is offline, red wants you.
     The label is kept for screen readers and as a hover tooltip, because a
     bare coloured dot is meaningless without one. `sr-only` rather than a live
     region: this changes on every sync, and announcing each one would be a
     stream of interruptions to say nothing happened.

     A storage failure is not a dot at all. Red means a sync attempt failed —
     the change is safe on this device and goes with the next sync that works,
     so it sorts itself out; this means the change was saved nowhere, and a
     person who reads it as the milder one loses a set believing it is
     queued. So it gets its own colour and a shape — a warning triangle — that
     no sync state ever uses, and still reads as different to somebody who
     cannot tell the colours apart. `data-state` names what is showing, and
     `data-sync` what the sync is doing underneath it. */
  return (
    <span
      className="flex items-center"
      title={label}
      data-state={lost ? 'storage' : status.state}
      data-sync={status.state}
    >
      {lost ? (
        <StorageIcon className="h-4 w-4" />
      ) : (
        <span className={cn('h-2.5 w-2.5 rounded-full', dot)} aria-hidden />
      )}
      <span className="sr-only">{label}</span>
    </span>
  );
}

/**
 * The storage warning, in words, under the title — until the person taps it
 * away.
 *
 * The one state that needs a sentence: the dot has no hover on a phone, and a
 * triangle alone does not say that a set is gone. It sits in the sticky header
 * so scrolling cannot hide it, and nothing but the button removes it — a sync
 * that succeeds a second later has no bearing on a write that never landed,
 * and a reload brings it back (`sync.ts` keeps it in localStorage).
 * `role="alert"` announces it once, when it appears.
 */
function StorageWarning() {
  const { t } = useT();
  const status = useSyncStatus();
  if (status.storageFailure === null) return null;

  return (
    <div
      role="alert"
      className="animate-pop mx-auto mt-2.5 flex max-w-[760px] items-center gap-2 rounded-[12px] border border-[var(--color-storage)]/50 bg-[var(--color-surface)] py-1 pr-1 pl-3"
    >
      <StorageIcon className="h-4 w-4 shrink-0" />
      <p className="min-w-0 flex-1 text-[13px] leading-snug font-semibold">
        {t('sync.storageWarn')}
      </p>
      <button
        type="button"
        aria-label={t('sync.dismiss')}
        onClick={dismissStorageFailure}
        className="press-deep grid h-[var(--spacing-tap)] w-[var(--spacing-tap)] shrink-0 cursor-pointer place-items-center rounded-[10px] text-[var(--color-muted)]"
      >
        <svg
          viewBox="0 0 16 16"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>
    </div>
  );
}

/** A filled warning triangle in the storage colour, its "!" cut out of it. */
function StorageIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 16 16" className={cn('text-[var(--color-storage)]', className)} aria-hidden>
      <path
        d="M8 1.75 14.75 13.75H1.25z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M8 6v3.6" stroke="var(--color-bg)" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="8" cy="11.7" r="0.95" fill="var(--color-bg)" />
    </svg>
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
    <NavLink
      href="/settings"
      aria-label={t('nav.you')}
      className="press-deep block h-8 w-8 shrink-0 rounded-full"
    >
      <Avatar src={profile?.avatar} />
    </NavLink>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useT();
  const move = useMove();

  useSwipeTabs(pathname, move);
  useHistorySlides(pathname);

  useEffect(() => {
    startSync();
  }, []);

  const active = TABS.find((tab) => pathname.startsWith(tab.href)) ?? TABS[0]!;
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
        <StorageWarning />
      </header>

      {/* The flex column moved into `Page`: that is the element which slides,
          and spacing applied outside it would leave the cards travelling
          independently of the box carrying them. */}
      <main className="mx-auto max-w-[760px] p-4">{children}</main>

      <nav
        style={{ viewTransitionName: 'app-nav' }}
        className="safe-bottom fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-[var(--color-line)]/70 bg-[var(--color-surface)]/80 backdrop-blur-xl"
      >
        {TABS.map((tab) => {
          const on = pathname.startsWith(tab.href);
          // Tapping a tab is the same movement as swiping to it, so it gets
          // the same direction (from `NavLink`) rather than a different
          // animation for the same journey.
          return (
            <NavLink
              key={tab.href}
              href={tab.href}
              aria-current={on ? 'page' : undefined}
              className={cn(
                'relative flex h-[62px] flex-col items-center justify-center gap-0.5 text-[10.5px] font-semibold',
                'transition-colors duration-(--dur-fast) ease-(--ease-out)',
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
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
