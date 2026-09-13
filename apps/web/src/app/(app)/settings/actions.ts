'use server';

import { auth, signOut } from '@/lib/auth';
import { deleteAccount } from '@/lib/db/delete-account';

/**
 * Ends the session.
 *
 * A plain `<form action="/api/auth/signout" method="post">` silently did
 * nothing: Auth.js requires a CSRF token on that route, and a hand-written form
 * has none, so the POST was rejected and the button appeared inert.
 */
export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: '/sign-in' });
}

/**
 * Deletes the account and everything in it.
 *
 * The session is ended *before* the data goes, and on purpose. `signOut` both
 * clears the cookie and removes the session row, and doing it first means a
 * failure halfway through leaves somebody signed out of an account that still
 * exists — they sign in again and press the button again. The other order can
 * leave a browser holding a cookie for a user row that no longer exists, which
 * every request then has to treat as an error rather than as a visitor.
 *
 * `redirect: false` because the redirect has to come after the deletion, not
 * instead of it: `signOut` normally throws its redirect, and anything written
 * below it would never run.
 */
export async function deleteAccountAction(): Promise<void> {
  const session = await auth();
  const userId = session?.user?.id;
  // Not an error worth showing: whatever this cookie was for is already gone.
  if (!userId) return;

  const email = session.user?.email ?? null;
  await signOut({ redirect: false });
  await deleteAccount(userId, email);
}
