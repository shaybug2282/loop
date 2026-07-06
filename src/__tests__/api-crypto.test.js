// Unit tests for the server-side AES-256-GCM helpers (api/_crypto.js).
// A throwaway key is injected via env before the module is used.
import { randomBytes } from 'crypto';
import { encrypt, decrypt } from '../../api/_crypto';

beforeAll(() => {
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('hex');
});

describe('encrypt / decrypt', () => {
  it('round-trips plaintext', () => {
    const secret = 'ya29.someverysecretaccesstoken';
    expect(decrypt(encrypt(secret))).toBe(secret);
  });

  it('round-trips unicode content', () => {
    const text = 'héllo wörld — 日本語 🎉';
    expect(decrypt(encrypt(text))).toBe(text);
  });

  it('produces the iv:authTag:ciphertext hex format', () => {
    const parts = encrypt('x').split(':');
    expect(parts).toHaveLength(3);
    expect(parts[0]).toMatch(/^[0-9a-f]{24}$/);  // 12-byte IV
    expect(parts[1]).toMatch(/^[0-9a-f]{32}$/);  // 16-byte auth tag
  });

  it('produces a different ciphertext each call (random IV)', () => {
    expect(encrypt('same')).not.toBe(encrypt('same'));
  });

  it('throws on tampered ciphertext (GCM auth)', () => {
    const enc = encrypt('secret');
    const [iv, tag, ct] = enc.split(':');
    const flipped = ct[0] === '0' ? '1' + ct.slice(1) : '0' + ct.slice(1);
    expect(() => decrypt(`${iv}:${tag}:${flipped}`)).toThrow();
  });

  it('throws on malformed input', () => {
    expect(() => decrypt('not-encrypted')).toThrow('Invalid encrypted token format');
  });

  it('throws when the key is missing or malformed', () => {
    const saved = process.env.TOKEN_ENCRYPTION_KEY;
    process.env.TOKEN_ENCRYPTION_KEY = 'tooshort';
    expect(() => encrypt('x')).toThrow(/64-char hex/);
    process.env.TOKEN_ENCRYPTION_KEY = saved;
  });
});
