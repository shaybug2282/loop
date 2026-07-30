import { seedWorld, DEMO_ME } from './demoFixtures';
import { getOrCreateKeyPair, deriveSharedKey, encryptMessage, decryptMessage } from '../utils/messageCrypto';

// State for demo mode: the seeded world, its mutations, and the throwaway key
// material that makes demo direct messages genuinely end-to-end encrypted.
//
// The world lives in sessionStorage — a visitor's changes survive a refresh but
// are gone when the tab closes, which is the right lifetime for a demo. The
// on/off flag lives in localStorage alongside the `user` / `googleUserId` keys
// the app already reads, so all three can be cleared together.

const FLAG_KEY  = 'loop_demo';
const WORLD_KEY = 'loop_demo_world';
const KEYS_KEY  = 'loop_demo_keys';

// isDemo — is demo mode currently on? Cheap enough to call anywhere.
// out: boolean
export const isDemo = () => {
  try { return localStorage.getItem(FLAG_KEY) === '1'; } catch { return false; }
};

// ── World persistence ────────────────────────────────────────────────────────

let world = null;

// loadWorld — the current demo world, seeding one if this is a fresh session.
// out: world object (see demoFixtures.seedWorld)
export function loadWorld() {
  if (world) return world;
  try {
    const raw = sessionStorage.getItem(WORLD_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.version === 1) { world = parsed; return world; }
    }
  } catch {}
  world = seedWorld();
  persist();
  return world;
}

// persist — write the world back to sessionStorage. Called after every
// mutation; quota errors are non-fatal (the demo just stops surviving refresh).
function persist() {
  try { sessionStorage.setItem(WORLD_KEY, JSON.stringify(world)); } catch {}
}

// mutate — apply `fn` to the world and persist. out: whatever `fn` returns.
export function mutate(fn) {
  const w = loadWorld();
  const result = fn(w);
  persist();
  return result;
}

// ── Demo identities' key material ────────────────────────────────────────────
//
// ECDH key agreement is symmetric: the key the UI derives from
// (myPrivate, friendPublic) is the same one derived from (friendPrivate,
// myPublic). So generating a real keypair per fixture friend lets the demo
// encrypt their messages such that the actual messaging UI decrypts them
// through its normal path — no "[encrypted]" placeholders, no special-casing
// inside ChatDirect.
//
// JWKs are persisted so a refresh keeps the same keys and existing demo
// messages stay readable.

let friendKeys = null; // { [friendId]: { privateKeyJwk, publicKeyJwk } }

const ECDH_PARAMS = { name: 'ECDH', namedCurve: 'P-256' };

// loadFriendKeys — generate (or restore) one ECDH keypair per fixture friend.
// out: Promise<{ [friendId]: { privateKeyJwk, publicKeyJwk } }>
async function loadFriendKeys() {
  if (friendKeys) return friendKeys;

  try {
    const raw = sessionStorage.getItem(KEYS_KEY);
    if (raw) { friendKeys = JSON.parse(raw); return friendKeys; }
  } catch {}

  const w = loadWorld();
  const entries = await Promise.all(w.friends.map(async f => {
    const pair = await crypto.subtle.generateKey(ECDH_PARAMS, true, ['deriveKey']);
    const [privateKeyJwk, publicKeyJwk] = await Promise.all([
      crypto.subtle.exportKey('jwk', pair.privateKey),
      crypto.subtle.exportKey('jwk', pair.publicKey),
    ]);
    return [f.id, { privateKeyJwk, publicKeyJwk }];
  }));

  friendKeys = Object.fromEntries(entries);
  try { sessionStorage.setItem(KEYS_KEY, JSON.stringify(friendKeys)); } catch {}
  return friendKeys;
}

// getFriendPublicKeyJwk — what /api/messages?op=public-key returns for a demo
// friend. out: Promise<JWK | null>
export async function getFriendPublicKeyJwk(friendId) {
  const keys = await loadFriendKeys();
  return keys[friendId]?.publicKeyJwk ?? null;
}

// sharedKeyWith — the AES key the messaging UI will independently derive for
// this friend, computed here from the friend's side of the exchange.
// out: Promise<CryptoKey>
async function sharedKeyWith(friendId) {
  const keys = await loadFriendKeys();
  const jwk  = keys[friendId];
  if (!jwk) throw new Error(`No demo key material for ${friendId}`);

  const [friendPrivate, { publicKey: myPublic }] = await Promise.all([
    crypto.subtle.importKey('jwk', jwk.privateKeyJwk, ECDH_PARAMS, false, ['deriveKey']),
    getOrCreateKeyPair(),
  ]);
  return deriveSharedKey(friendPrivate, myPublic);
}

// encryptThread — the stored plaintext thread with this friend, encrypted into
// the wire shape /api/messages?op=conversation returns.
// out: Promise<[{ id, sender_id, ciphertext, iv, created_at }]>
export async function encryptThread(friendId) {
  const w = loadWorld();
  const thread = w.dms[friendId] ?? [];
  if (!thread.length) return [];

  const key = await sharedKeyWith(friendId);
  return Promise.all(thread.map(async m => {
    const { ciphertext, iv } = await encryptMessage(key, m.text);
    return {
      id:         m.id,
      sender_id:  m.sender_id,
      ciphertext,
      iv,
      created_at: m.created_at,
      edited_at:  m.edited_at ?? null,
    };
  }));
}

// decryptIncoming — read a message the UI just encrypted and posted. The demo
// holds the friend's half of the exchange, so it derives the same key the UI
// used and recovers the plaintext to store. Without this, sent messages would
// round-trip as unreadable ciphertext the store has no key for.
// out: Promise<string>
export async function decryptIncoming(friendId, ciphertext, iv) {
  const key = await sharedKeyWith(friendId);
  return decryptMessage(key, ciphertext, iv);
}

// ── Entering and leaving ─────────────────────────────────────────────────────

// enterDemo — turn demo mode on and seed the identity keys the app's "signed
// in" gates read. Deliberately refuses when a real session is present rather
// than layering a fake world over someone's actual account.
// out: boolean (false when refused)
export function enterDemo() {
  try {
    if (localStorage.getItem('user') && !isDemo()) return false;
    localStorage.setItem(FLAG_KEY, '1');
    localStorage.setItem('googleUserId', DEMO_ME);
    const w = loadWorld();
    localStorage.setItem('user', JSON.stringify({
      id:      w.me.id,
      name:    w.me.name,
      email:   w.me.email,
      picture: w.me.picture_url,
    }));
    return true;
  } catch {
    return false;
  }
}

// exitDemo — clear every trace of the demo. The fetch patch is undone by
// demoFetch.uninstallDemoFetch; callers reload afterwards so no component is
// left holding demo state.
export function exitDemo() {
  world = null;
  friendKeys = null;
  try {
    sessionStorage.removeItem(WORLD_KEY);
    sessionStorage.removeItem(KEYS_KEY);
    localStorage.removeItem(FLAG_KEY);
    localStorage.removeItem('user');
    localStorage.removeItem('googleUserId');
  } catch {}
}

// DEMO_STORAGE_KEYS — the localStorage keys demo mode owns, so AuthContext's
// logout can clear them in the same sweep it clears real session keys.
export const DEMO_STORAGE_KEYS = [FLAG_KEY];
