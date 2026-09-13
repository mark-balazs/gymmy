'use server';

import { signOut } from '@/lib/auth';

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
