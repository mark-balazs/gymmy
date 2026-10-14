import { describe, expect, it, vi } from 'vitest';
import {
  CODE_LENGTH,
  codeEmail,
  generateCode,
  normaliseCode,
  normaliseEmail,
  sendCodeLogged,
} from './email-otp';

describe('sign-in codes', () => {
  it('is always the full width, including when it starts with a zero', () => {
    // `String(randomInt(0, 1e10))` drops leading zeros, which would silently
    // produce shorter codes about a tenth of the time — and a 9-digit code
    // typed into a field that wants every digit never matches.
    for (let i = 0; i < 500; i++) {
      const code = generateCode();
      expect(code).toHaveLength(CODE_LENGTH);
      expect(code).toMatch(/^\d+$/);
    }
  });

  it('does not repeat itself', () => {
    const seen = new Set(Array.from({ length: 300 }, () => generateCode()));
    // Collisions are all but impossible in 300 draws from ten billion; a constant
    // or near-constant generator is what this is looking for.
    expect(seen.size).toBeGreaterThan(250);
  });

  it('uses every digit in every position', () => {
    /* The code is the whole secret behind an account, so how many codes there
       are is the thing worth asserting. Drawing from a hundred million and
       padding to ten keeps the length right and repeats rarely enough to pass
       the test above, while making a code a hundred times easier to guess —
       and it leaves the first two digits always zero. False failure here is
       below 100 × 0.9^2000: never. */
    const codes = Array.from({ length: 2000 }, () => generateCode());
    for (let i = 0; i < CODE_LENGTH; i++) {
      expect(new Set(codes.map((c) => c[i])).size, `position ${i}`).toBe(10);
    }
  });

  it('accepts a code however it was pasted', () => {
    expect(normaliseCode('123 456')).toBe('123456');
    expect(normaliseCode('123-456')).toBe('123456');
    expect(normaliseCode(' 123456\n')).toBe('123456');
    // As the email shows it, or grouped by a person copying it out.
    expect(normaliseCode('12345 67890')).toBe('1234567890');
  });

  it('treats an address as the same however it was typed', () => {
    // The address is the account key, so Mark@…, mark@… and " mark@… " must
    // not become three accounts.
    expect(normaliseEmail('  Mark@Dextra.DEV ')).toBe('mark@dextra.dev');
  });

  it('asks mail apps not to turn the code into a phone link', () => {
    // A tapped call link is no use, and a long press offers to call instead of
    // to copy.
    expect(codeEmail('1234567890').html).toContain(
      '<meta name="format-detection" content="telephone=no">',
    );
  });
});

describe('sending a sign-in code', () => {
  it('logs a failed send instead of throwing it', async () => {
    /* Auth.js stores the code beside the send. A throw would answer before the
       store, and the delete of older codes behind it, had run: the old code
       left alive, and an error page for a person whose code may still arrive. */
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(
        sendCodeLogged(
          { apiKey: 'k', from: 'from@example.test', to: 'to@example.test', code: '1' },
          () => Promise.reject(new Error('resend 403: domain not verified')),
        ),
      ).resolves.toBeUndefined();
      expect(logged).toHaveBeenCalledWith('[sign-in] send failed', expect.any(Error));
    } finally {
      logged.mockRestore();
    }
  });
});
