'use client';

/**
 * What the user sees when something has gone wrong, and what they can do next.
 *
 * The options escalate deliberately, cheapest first: try the thing again, then
 * reload, then throw away everything this device is holding. Only the last one
 * can lose work, so it is last, it is styled as the danger it is, and it says
 * how many unsynced changes are about to go — an unqualified "reset" invites
 * people to tap it first and find out afterwards.
 */

import { useState } from 'react';
import { Button, Card } from '@/components/ui';
import { useSyncStatus, useT } from '@/lib/client/hooks';
import { resetDevice } from '@/lib/client/recover';

export function Recovery({
  title,
  body,
  detail,
  onRetry,
}: {
  title: string;
  /** What is wrong, in words — "only this device has a problem" by default. */
  body?: string;
  /** The raw error, for a bug report. */
  detail?: string;
  onRetry?: () => void;
}) {
  const { t, count } = useT();
  const status = useSyncStatus();
  const [confirming, setConfirming] = useState(false);
  const [resetting, setResetting] = useState(false);

  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <Card className="flex w-full max-w-[420px] flex-col gap-3">
        <h1 className="text-[19px] font-bold">{title}</h1>
        {/* The reassurance is what keeps people off the red button — so it is
            only given when it is true. With changes still waiting to sync,
            "safe on the server" is not, and the reset below says what would
            go. */}
        <p className="text-sm text-[var(--color-muted)]">
          {body ?? t('err.body')}
          {status.pending === 0 && ` ${t('err.bodySynced')}`}
        </p>

        {detail && (
          // One tap away, not second on the screen: it is a developer's message
          // ("Cannot read properties of undefined"), there for the report that
          // makes this fixable. Native, so it stays selectable and copyable.
          <details className="text-xs text-[var(--color-muted)]">
            <summary className="cursor-pointer">{t('err.details')}</summary>
            <p className="num mt-1.5 rounded-[11px] bg-[var(--color-surface-2)] px-3 py-2 break-words">
              {detail}
            </p>
          </details>
        )}

        {onRetry && (
          <Button variant="primary" onClick={onRetry}>
            {t('err.retry')}
          </Button>
        )}

        <Button onClick={() => window.location.reload()}>{t('err.reload')}</Button>

        {!confirming ? (
          <Button variant="danger" onClick={() => setConfirming(true)}>
            {t('err.reset')}
          </Button>
        ) : (
          <div className="flex flex-col gap-2 rounded-[11px] border border-[var(--color-bad)]/40 p-3">
            <p className="text-sm font-semibold">{t('err.resetQ')}</p>
            <p className="text-xs text-[var(--color-muted)]">
              {status.pending > 0 ? count('err.resetPending', status.pending) : t('err.resetSafe')}
            </p>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => setConfirming(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                disabled={resetting}
                onClick={() => {
                  setResetting(true);
                  void resetDevice();
                }}
              >
                {t('err.resetGo')}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </main>
  );
}
