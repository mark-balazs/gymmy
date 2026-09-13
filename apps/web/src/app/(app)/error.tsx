'use client';

/**
 * Catches a render crash anywhere in the signed-in app.
 *
 * Without this, a throw in one card unmounts the whole tree and leaves a blank
 * screen with no way forward — which is exactly what happened when the exercise
 * detail sheet met a row synced before its fields existed.
 */

import { Recovery } from '@/components/recovery';
import { useT } from '@/lib/client/hooks';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useT();
  return <Recovery title={t('err.title')} detail={error.message} onRetry={reset} />;
}
