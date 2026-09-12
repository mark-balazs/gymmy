'use client';

/**
 * Gate for the signed-in app.
 *
 * The onboarding check has to run on the client, because the profile lives in
 * IndexedDB. On a fresh device that store is empty until the first sync lands,
 * so "no profile yet" means *loading*, not "needs onboarding" — getting that
 * backwards would throw a returning user back through setup.
 */

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { AppShell } from '@/components/app-shell';
import { useProfile, useSyncStatus, useT } from '@/lib/client/hooks';
import { startSync } from '@/lib/client/sync';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = useProfile();
  const status = useSyncStatus();
  const router = useRouter();
  const { t } = useT();

  // Must start above the profile gate, not inside AppShell. A fresh device has
  // no profile until the first sync lands, so starting it below this point
  // would deadlock: no profile means no shell, no shell means no sync, and the
  // app sits on "Loading…" forever.
  useEffect(() => {
    startSync();
  }, []);

  useEffect(() => {
    if (profile && !profile.onboarded) router.replace('/onboarding');
  }, [profile, router]);

  if (!profile) {
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <div className="flex flex-col gap-2">
          <p className="text-[var(--color-muted)]">{t('common.loading')}</p>
          {status.state === 'error' && (
            <p className="text-xs text-[var(--color-bad)]">{status.error}</p>
          )}
        </div>
      </div>
    );
  }

  if (!profile.onboarded) return null;

  return <AppShell>{children}</AppShell>;
}
