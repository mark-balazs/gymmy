import { NextResponse } from 'next/server';
import { z } from 'zod';
import { env } from '@/env';
import { signIn } from '@/lib/auth';
import { MAX_ADDRESS_LENGTH, normaliseEmail } from '@/lib/email-otp';
import { checkAndRecord, clientKey, fromAnotherSite } from '@/lib/sign-in-throttle';

const body = z.object({ email: z.string().email().max(MAX_ADDRESS_LENGTH) });

/**
 * Requests a sign-in code.
 *
 * Separate from Auth.js's own sign-in route so the throttle sits in front of
 * the send rather than beside it.
 *
 * Every answer has the same body. Whether the address has an account and
 * whether the send failed are invisible from outside — each of those is a fact
 * about somebody else's account, and an endpoint that leaks it becomes a way to
 * enumerate users. Only the status varies: 429 past a limit, 403 for an ask
 * this site's form never sends.
 */
export async function POST(req: Request): Promise<NextResponse> {
  if (!env.RESEND_API_KEY) return NextResponse.json({ ok: true });

  // Only this site's form asks, and it sends JSON. A page elsewhere could make
  // a visitor's browser ask, spending the visitor's asks on their own
  // connection; a JSON body from another site needs the browser's leave first,
  // which is never given. Refused before anything is counted. A type's case
  // means nothing, so "Application/JSON" is JSON too.
  const type = req.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  const json = type === 'application/json';
  if (fromAnotherSite(req.headers) || !json)
    return NextResponse.json({ ok: true }, { status: 403 });

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: true });

  const email = normaliseEmail(parsed.data.email);
  const gate = await checkAndRecord(email, clientKey(req.headers));

  if (!gate.allowed) {
    console.warn(`[sign-in] throttled by ${gate.reason}`);
    // 429 so the client can back off; the body still says nothing.
    return NextResponse.json({ ok: true }, { status: 429 });
  }

  try {
    await signIn('resend', { email, redirect: false });
  } catch (err) {
    // A bad key or an unverified sender belongs in the log, not the response.
    console.error('[sign-in] send failed', err);
  }

  return NextResponse.json({ ok: true });
}
