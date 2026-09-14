import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { CoachScreen } from '@/components/coach-screen';

/**
 * The coach area.
 *
 * A server component purely so the role check happens before anything renders:
 * a client-side gate on a route like this is a suggestion, and somebody typing
 * the URL should get the same answer as somebody who never saw the link.
 *
 * The check here is a *rendering* decision only. Every write still re-reads the
 * role in the API, because a database session lasts ninety days and a role that
 * was taken away should not keep working for the rest of them.
 *
 * Not a tab. Five tabs are the week as it is lived, and coaching is not part of
 * anybody's week — it is reached from Settings, by the few accounts that have
 * it.
 */
export default async function CoachPage() {
  const session = await auth();
  if (!session?.user) redirect('/sign-in');
  if (session.user.role !== 'trainer') redirect('/settings');

  return <CoachScreen />;
}
