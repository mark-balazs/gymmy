import type { NextRequest } from 'next/server';
import { handlers } from '@/lib/auth';
import { fromAnotherSite } from '@/lib/sign-in-throttle';

export const runtime = 'nodejs';

/**
 * Auth.js's own routes, with a code check from another site refused before it
 * is counted (`fromAnotherSite`). Google's callback arrives from another site
 * by design, so only the email code's is held to it.
 */
export async function GET(req: NextRequest): Promise<Response> {
  if (isAction(new URL(req.url), 'callback', 'resend') && fromAnotherSite(req.headers)) {
    return refusedLikeAWrongCode(req);
  }
  return handlers.GET(req);
}

/**
 * Auth.js's own routes, less one: `POST /api/auth/signin/resend`.
 *
 * That route emails a sign-in code to any address for anyone holding a CSRF
 * token, which `/api/auth/csrf` hands to every caller. It sits beside the
 * limits on asking for a code rather than behind them, so it would let anyone
 * mail an address without limit and stack up codes to guess at. The app never
 * calls it over HTTP: `/api/auth/email-code` asks through next-auth's
 * server-side `signIn`, which runs Auth.js in the same process.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  if (isAction(url, 'signin', 'resend')) return new Response('Not Found', { status: 404 });
  if (isAction(url, 'callback', 'resend') && fromAnotherSite(req.headers)) {
    return refusedLikeAWrongCode(req);
  }
  return handlers.POST(req);
}

/** Where Auth.js sends a code that is wrong, used or expired. */
function refusedLikeAWrongCode(req: NextRequest): Response {
  return Response.redirect(new URL('/api/auth/error?error=Verification', req.url), 302);
}

/**
 * Read the way Auth.js reads an action: the path after `/api/auth`, split on
 * slashes with empty parts dropped. Also decoded, which can only catch more.
 */
function isAction(url: URL, name: string, provider: string): boolean {
  const rest = url.pathname.replace(/^\/api\/auth/, '');
  let decoded = rest;
  try {
    decoded = decodeURIComponent(rest);
  } catch {
    // A malformed escape cannot name the route for Auth.js either.
  }
  return [rest, decoded].some((path) => {
    const [action, id] = path.split('/').filter(Boolean);
    return action === name && id === provider;
  });
}
