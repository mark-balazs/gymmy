'use client';

/**
 * Gate for the signed-in app.
 *
 * The onboarding check has to run on the client, because the profile lives in
 * IndexedDB. On a fresh device that store is empty until the first sync lands,
 * so "no profile yet" means *loading*, not "needs onboarding" — getting that
 * backwards would throw a returning user back through setup.
 *
 * It is also what makes every page's first render a real one. The local
 * database is read once for the whole app (`lib/client/live.ts`), this layout
 * holds that read open for as long as the app is on screen, and no page is
 * drawn until it has landed. So a tab mounted by a navigation already has its
 * data in the frame the slide carries, and nothing chosen on a first render —
 * the day Train opens on — is chosen from an empty database.
 */

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Recovery } from '@/components/recovery';
import { useProfile, useSnapshotStatus, useSyncStatus, useT } from '@/lib/client/hooks';
import { startSync, sync } from '@/lib/client/sync';

/** Long enough that a slow first sync is not mistaken for a wedged app, short
 *  enough that nobody sits staring at a spinner wondering. */
const STUCK_AFTER_MS = 12_000;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const read = useSnapshotStatus();
  const profile = useProfile();
  const status = useSyncStatus();
  const router = useRouter();
  const { t } = useT();
  const [stuck, setStuck] = useState(false);

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

  const waiting = !profile && read !== 'failed';

  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => setStuck(true), STUCK_AFTER_MS);
    return () => clearTimeout(timer);
  }, [waiting]);

  // A read that failed is not waited on: the page's own read throws it into
  // `error.tsx`, which says so and offers to try again.
  if (read === 'failed') return <AppShell>{children}</AppShell>;

  if (!profile) {
    /**
     * An error boundary cannot help here: nothing has thrown. The profile
     * simply never arrives — a sync that cannot reach the server, a local store
     * that will not open — and the honest failure mode of "wait for it" is
     * waiting forever, which is what being stuck on a loading screen is.
     *
     * So waiting is given a deadline, after which the screen stops pretending
     * and offers a way out.
     */
    if (stuck) {
      return (
        <Recovery
          title={t('err.stuckTitle')}
          // In words, in place of the general line; the raw error, if there is
          // one, goes behind Details like any other.
          body={t('err.stuckDetail')}
          detail={status.error ?? status.storageFailure ?? undefined}
          onRetry={() => {
            setStuck(false);
            void sync();
          }}
        />
      );
    }

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
