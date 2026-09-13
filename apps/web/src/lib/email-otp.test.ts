import { describe, expect, it } from 'vitest';
import { CODE_LENGTH, generateCode, normaliseCode, normaliseEmail } from './email-otp';

describe('sign-in codes', () => {
  it('is always the full width, including when it starts with a zero', () => {
    // `String(randomInt(0, 1e6))` drops leading zeros, which would silently
    // produce shorter codes about a tenth of the time — and a 5-digit code
    // typed into a 6-digit field never matches.
    for (let i = 0; i < 500; i++) {
      const code = generateCode();
      expect(code).toHaveLength(CODE_LENGTH);
      expect(code).toMatch(/^\d+$/);
    }
  });

  it('does not repeat itself', () => {
    const seen = new Set(Array.from({ length: 300 }, () => generateCode()));
    // Birthday collisions are expected in 300 draws from a million; a constant
    // or near-constant generator is what this is looking for.
    expect(seen.size).toBeGreaterThan(250);
  });

  it('accepts a code however it was pasted', () => {
    expect(normaliseCode('123 456')).toBe('123456');
    expect(normaliseCode('123-456')).toBe('123456');
    expect(normaliseCode(' 123456\n')).toBe('123456');
  });

  it('treats an address as the same however it was typed', () => {
    // The address is the account key, so Mark@…, mark@… and " mark@… " must
    // not become three accounts.
    expect(normaliseEmail('  Mark@Dextra.DEV ')).toBe('mark@dextra.dev');
  });
});
