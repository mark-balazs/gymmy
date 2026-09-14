'use client';

/**
 * The way into the coach area, for the accounts that have one.
 *
 * Not a sixth tab. The five tabs are the week as it is lived — what is due,
 * what you are doing, how it went — and writing plans for other people is not
 * part of anybody's week. It belongs with the other account-level things.
 *
 * Whether to show it is asked of the server rather than of the local replica,
 * because the role is a fact about the account rather than about the training,
 * and the replica has never carried it. A failed ask renders nothing, which is
 * the right answer offline: the area behind this link needs a connection to do
 * anything at all.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Card, buttonClass } from '@/components/ui';
import { useT } from '@/lib/client/hooks';

export function CoachLink() {
  const { t } = useT();
  const [isTrainer, setIsTrainer] = useState(false);

  useEffect(() => {
    let live = true;
    void fetch('/api/auth/session')
      .then((r) => (r.ok ? r.json() : null))
      .then((s: { user?: { role?: string } } | null) => {
        if (live) setIsTrainer(s?.user?.role === 'trainer');
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  if (!isTrainer) return null;

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-[17px] font-semibold">{t('coach.title')}</h2>
      <p className="text-sm text-[var(--color-muted)]">{t('coach.openBody')}</p>
      <Link href="/coach" className={buttonClass('default', 'w-full')}>
        {t('coach.open')}
      </Link>
    </Card>
  );
}
