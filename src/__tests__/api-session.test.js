// Unit tests for the session-token helpers (api/_lib.js) that every API
// router's identity gate rests on. A throwaway key is injected via env.
import { randomBytes } from 'crypto';
import { signSession, verifySession, parseCookies, requireUser } from '../../api/_lib';

const IDENTITY = { userId: '5f4c1a2b-0000-4000-8000-123456789abc', googleId: '108234567890123456789' };

beforeAll(() => {
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('hex');
  delete process.env.SESSION_SECRET;
});

describe('signSession / verifySession', () => {
  it('round-trips identity', () => {
    expect(verifySession(signSession(IDENTITY))).toEqual(IDENTITY);
  });

  it('produces payload.signature (base64url, no padding)', () => {
    const parts = signSession(IDENTITY).split('.');
    expect(parts).toHaveLength(2);
    for (const p of parts) expect(p).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('rejects a tampered payload', () => {
    const [payload, sig] = signSession(IDENTITY).split('.');
    const other = Buffer.from(JSON.stringify({
      uid: 'attacker-uuid', gid: '999', exp: Math.floor(Date.now() / 1000) + 3600,
    })).toString('base64url');
    expect(verifySession(`${other}.${sig}`)).toBeNull();
    expect(verifySession(`${payload}x.${sig}`)).toBeNull();
  });

  it('rejects a tampered or truncated signature', () => {
    const token = signSession(IDENTITY);
    const [payload, sig] = token.split('.');
    const flipped = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);
    expect(verifySession(`${payload}.${flipped}`)).toBeNull();
    expect(verifySession(`${payload}.${sig.slice(0, -2)}`)).toBeNull();
  });

  it('rejects an expired token and accepts one within its TTL', () => {
    const now = Date.now();
    const token = signSession(IDENTITY, { now, ttlSeconds: 60 });
    expect(verifySession(token, { now: now + 30_000 })).toEqual(IDENTITY);
    expect(verifySession(token, { now: now + 61_000 })).toBeNull();
  });

  it('rejects garbage input', () => {
    for (const bad of [null, undefined, '', 'no-dot', 'a.b', '..', 42]) {
      expect(verifySession(bad)).toBeNull();
    }
  });

  it('rejects tokens signed with a different key', () => {
    const token = signSession(IDENTITY);
    const saved = process.env.TOKEN_ENCRYPTION_KEY;
    process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('hex');
    expect(verifySession(token)).toBeNull();
    process.env.TOKEN_ENCRYPTION_KEY = saved;
    expect(verifySession(token)).toEqual(IDENTITY);
  });
});

describe('parseCookies', () => {
  it('parses multiple cookies with spaces and = in values', () => {
    expect(parseCookies('a=1; loop_session=abc.def; b=x=y')).toEqual({
      a: '1', loop_session: 'abc.def', b: 'x=y',
    });
  });

  it('tolerates a missing or malformed header', () => {
    expect(parseCookies(undefined)).toEqual({});
    expect(parseCookies('')).toEqual({});
    expect(parseCookies('junk; ;=;')).toEqual({});
  });
});

describe('requireUser', () => {
  const reqWith = cookie => ({ headers: cookie === undefined ? {} : { cookie } });

  it('returns the identity for a valid session cookie', () => {
    const token = signSession(IDENTITY);
    expect(requireUser(reqWith(`loop_session=${token}`))).toEqual(IDENTITY);
  });

  it('returns null with no cookie header, wrong cookie name, or bad token', () => {
    expect(requireUser(reqWith(undefined))).toBeNull();
    expect(requireUser(reqWith('other=value'))).toBeNull();
    expect(requireUser(reqWith('loop_session=forged.token'))).toBeNull();
    expect(requireUser({})).toBeNull();
  });
});
