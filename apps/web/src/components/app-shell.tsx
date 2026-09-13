'use client';

/**
 * The app frame: header, tab bar, and the sync indicator.
 *
 * The sync state is shown rather than hidden, because "saved on this device"
 * versus "saved everywhere" is a distinction the user genuinely needs when they
 * are standing in a basement with no signal.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { cn } from '@/components/ui';
import { useSyncStatus, useT } from '@/lib/client/hooks';
import { startSync } from '@/lib/client/sync';
import type { Key } from '@/lib/i18n';

const TABS = [
  {
    href: '/home',
    key: 'tab.home',
    icon: 'M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  },
  { href: '/train', key: 'tab.train', icon: 'M4 7h16M4 12h10M4 17h7M17 14v6M14 17h6' },
  { href: '/week', key: 'tab.week', icon: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z' },
  { href: '/progress', key: 'tab.progress', icon: 'M4 19V5M4 19h16M8 16v-5M12 16V8M16 16v-3' },
  {
    href: '/settings',
    key: 'tab.settings',
    icon: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 13a7.5 7.5 0 000-2l2-1.5-2-3.4-2.3 1a7 7 0 00-1.8-1L14.9 3H9.1l-.4 2.9a7 7 0 00-1.8 1l-2.3-1-2 3.4L4.6 11a7.5 7.5 0 000 2l-2 1.5 2 3.4 2.3-1a7 7 0 001.8 1l.4 2.9h5.8l.4-2.9a7 7 0 001.8-1l2.3 1 2-3.4z',
  },
] as const;

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

  return (
    <span className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
      <span className={cn('h-2 w-2 rounded-full', dot)} aria-hidden />
      {label}
    </span>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useT();

  useEffect(() => {
    startSync();
  }, []);

  const active = TABS.find((tab) => pathname.startsWith(tab.href)) ?? TABS[0];
  const titleKey = active.key.replace('tab.', 'title.') as Key;

  return (
    <div className="pb-[calc(62px+env(safe-area-inset-bottom))]">
      <header className="safe-top sticky top-0 z-20 border-b border-[var(--color-line)]/70 bg-[var(--color-bg)]/75 px-4 pt-3 pb-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[760px] items-center justify-between">
          <h1 className="text-[22px] font-bold tracking-[-0.02em]">{t(titleKey)}</h1>
          <SyncBadge />
        </div>
      </header>

      <main className="mx-auto flex max-w-[760px] flex-col gap-3.5 p-4">{children}</main>

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-[var(--color-line)]/70 bg-[var(--color-surface)]/80 backdrop-blur-xl">
        {TABS.map((tab) => {
          const on = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
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
