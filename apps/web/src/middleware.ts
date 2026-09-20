/**
 * Route protection.
 *
 * Only checks for a session cookie — the actual verification happens in the
 * route handlers and server components, where the database is reachable. The
 * middleware runtime cannot open a database connection, so treating this as the
 * security boundary would be a mistake; it is a redirect, not a gate.
 */

import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC = ['/sign-in', '/api/auth', '/manifest.webmanifest', '/icons', '/sw.js'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const hasSession =
    req.cookies.has('authjs.session-token') || req.cookies.has('__Secure-authjs.session-token');

  if (!hasSession) {
    /**
     * The API answers; it never redirects.
     *
     * A redirect is a sensible thing to do to a person and a terrible thing to
     * do to `fetch`. The sync follows it, gets the sign-in page back as `200`
     * with a body of HTML, and reports a parse error — so a session that ended
     * ninety days ago looked exactly like a bad connection, on full signal,
     * and the phone went on retrying for ever while the queue grew. Answering
     * `401` is what lets it stop and say "Sign in to send 3 changes".
     *
     * Documented in `docs/openapi.yaml` under every route's `401`.
     */
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const url = new URL('/sign-in', req.url);
    if (pathname !== '/') url.searchParams.set('from', pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  /* Static assets are skipped by extension. The exercise photographs are jpg,
   * which was missing here — so every one of them was redirected to /sign-in
   * and rendered as a broken image. Anything served straight off disk belongs
   * in this list: it is public either way, and running auth middleware per
   * image is cost for no benefit. */
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpe?g|webp|avif|gif|svg|ico|webmanifest)$).*)',
  ],
};
