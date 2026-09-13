import { NextResponse } from 'next/server';
import { z } from 'zod';
import { env } from '@/env';
import { signIn } from '@/lib/auth';
import { normaliseEmail } from '@/lib/email-otp';
import { checkAndRecord, clientKey } from '@/lib/sign-in-throttle';

const body = z.object({ email: z.string().email().max(320) });

/**
 * Requests a sign-in code.
 *
 * Separate from Auth.js's own sign-in route so the throttle sits in front of
 * the send rather than beside it.
 *
 * Everything here answers the same way to everyone. Whether the address has an
 * account, whether it was rate limited, and whether the send failed are all
 * invisible from outside — each of those is a fact about somebody else's
 * account, and an endpoint that leaks it becomes a way to enumerate users.
 */
export async function POST(req: Request): Promise<NextResponse> {
  if (!env.RESEND_API_KEY) return NextResponse.json({ ok: true });

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
