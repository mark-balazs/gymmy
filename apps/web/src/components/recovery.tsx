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
  detail,
  onRetry,
}: {
  title: string;
  detail?: string;
  onRetry?: () => void;
}) {
  const { t } = useT();
  const status = useSyncStatus();
  const [confirming, setConfirming] = useState(false);
  const [resetting, setResetting] = useState(false);

  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <Card className="flex w-full max-w-[420px] flex-col gap-3">
        <h1 className="text-[19px] font-bold">{title}</h1>
        <p className="text-sm text-[var(--color-muted)]">{t('err.body')}</p>

        {detail && (
          // Shown rather than hidden: when someone reports this, the message is
          // the only thing that makes the report actionable.
          <p className="num rounded-[11px] bg-[var(--color-surface-2)] px-3 py-2 text-xs break-words text-[var(--color-muted)]">
            {detail}
          </p>
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
              {status.pending > 0
                ? t('err.resetPending', { n: status.pending })
                : t('err.resetSafe')}
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
