/**
 * Sign-in by six-digit code, sent over Resend.
 *
 * A code rather than a magic link, for two reasons that both come from this
 * being a phone app. You are signing in on the device you are already holding,
 * so a code is typed in place while a link bounces you out to a mail client and
 * back. And links get followed by things that are not the user — corporate
 * scanners and mail previewers prefetch them, silently burning a one-time token
 * before it reaches anyone.
 */

import { randomInt } from 'node:crypto';

export const CODE_LENGTH = 6;
/** Long enough to fetch a phone from another room, short enough to matter. */
export const CODE_TTL_SECONDS = 10 * 60;

/**
 * `randomInt` rather than `Math.random`: this is the entire secret behind an
 * account, and a predictable one is the same as no code at all.
 */
export const generateCode = (): string =>
  String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0');

export const normaliseEmail = (raw: string): string => raw.trim().toLowerCase();

/** Digits only, so a pasted "123 456" or "123-456" still works. */
export const normaliseCode = (raw: string): string => raw.replace(/\D/g, '');

export function codeEmail(code: string): { subject: string; text: string; html: string } {
  const subject = `${code} is your gymmy sign-in code`;
  const text = [
    `Your gymmy sign-in code is ${code}.`,
    '',
    'It expires in 10 minutes and can be used once.',
    'If you did not ask to sign in, you can ignore this email.',
  ].join('\n');

  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f6f9;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#0e1620">
<div style="max-width:420px;margin:0 auto;background:#fff;border-radius:16px;padding:28px">
<h1 style="margin:0 0 8px;font-size:19px">Your sign-in code</h1>
<p style="margin:0 0 20px;font-size:14px;color:#5b6878">Enter this in gymmy to finish signing in.</p>
<div style="font-size:34px;font-weight:700;letter-spacing:8px;text-align:center;padding:16px;border-radius:12px;background:#eef2f7">${code}</div>
<p style="margin:20px 0 0;font-size:13px;color:#5b6878">It expires in 10 minutes and can be used once. If you did not ask to sign in, ignore this email.</p>
</div></body></html>`;

  return { subject, text, html };
}

/**
 * Posted straight to Resend's REST API rather than through their SDK: one
 * `fetch` against a documented endpoint is less to install, less to keep
 * current, and less to audit than a dependency that does the same thing.
 */
export async function sendCode(opts: {
  apiKey: string;
  from: string;
  to: string;
  code: string;
}): Promise<void> {
  const { subject, text, html } = codeEmail(opts.code);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${opts.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ from: opts.from, to: [opts.to], subject, text, html }),
  });

  if (!res.ok) {
    // The body carries Resend's reason — an unverified domain, a bad key. It
    // goes to the server log, never to the caller: a stranger probing this
    // endpoint learns nothing about the account it belongs to.
    const detail = await res.text().catch(() => '');
    throw new Error(`resend ${res.status}: ${detail.slice(0, 300)}`);
  }
}
