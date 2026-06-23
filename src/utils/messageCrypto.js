// End-to-end message encryption using ECDH key agreement + AES-256-GCM.
//
// Flow:
//   1. Each user generates an ECDH P-256 keypair on first use — stored in localStorage.
//   2. Public keys are uploaded to Supabase so the other party can fetch them.
//   3. Both sides derive the SAME shared AES key: ECDH(myPrivKey, theirPubKey).
//   4. Messages are encrypted/decrypted with that shared key — the server only ever
//      sees ciphertext and can never read message content.
//
// Storage format: "ivB64.ctB64" combined into a single `payload` column.
// Legacy messages have separate `ciphertext` and `iv` columns — decryptMessage handles both.

const ECDH_PARAMS = { name: 'ECDH', namedCurve: 'P-256' };
const AES_PARAMS  = { name: 'AES-GCM', length: 256 };
const LS_KEY      = 'ecdhKeyPair';

// Returns { privateKey, publicKey, publicKeyJwk }
// Generates a new keypair on first call; rehydrates from localStorage on subsequent calls.
export async function getOrCreateKeyPair() {
  const stored = localStorage.getItem(LS_KEY);
  if (stored) {
    const { privateKeyJwk, publicKeyJwk } = JSON.parse(stored);
    const [privateKey, publicKey] = await Promise.all([
      crypto.subtle.importKey('jwk', privateKeyJwk, ECDH_PARAMS, false, ['deriveKey']),
      crypto.subtle.importKey('jwk', publicKeyJwk,  ECDH_PARAMS, true,  []),
    ]);
    return { privateKey, publicKey, publicKeyJwk };
  }

  const keyPair = await crypto.subtle.generateKey(ECDH_PARAMS, true, ['deriveKey']);
  const [privateKeyJwk, publicKeyJwk] = await Promise.all([
    crypto.subtle.exportKey('jwk', keyPair.privateKey),
    crypto.subtle.exportKey('jwk', keyPair.publicKey),
  ]);
  localStorage.setItem(LS_KEY, JSON.stringify({ privateKeyJwk, publicKeyJwk }));
  return { privateKey: keyPair.privateKey, publicKey: keyPair.publicKey, publicKeyJwk };
}

// Import a JWK public key object → CryptoKey (for ECDH)
export async function importPublicKey(jwk) {
  return crypto.subtle.importKey('jwk', jwk, ECDH_PARAMS, false, []);
}

// Derive a symmetric AES-GCM key from ECDH key agreement.
export async function deriveSharedKey(myPrivateKey, theirPublicKey) {
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: theirPublicKey },
    myPrivateKey,
    AES_PARAMS,
    false,
    ['encrypt', 'decrypt']
  );
}

// Encrypt plaintext → { payload: "ivB64.ctB64" } — single string for compact DB storage.
export async function encryptMessage(sharedKey, plaintext) {
  const iv        = crypto.getRandomValues(new Uint8Array(12));
  const encoded   = new TextEncoder().encode(plaintext);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, sharedKey, encoded);
  const ivB64     = btoa(String.fromCharCode(...iv));
  const ctB64     = btoa(String.fromCharCode(...new Uint8Array(encrypted)));
  return { payload: `${ivB64}.${ctB64}` };
}

// Decrypt a message. Accepts the new combined "ivB64.ctB64" payload string,
// or the legacy two-argument (ciphertext, iv) form for old messages.
export async function decryptMessage(sharedKey, payloadOrCt, legacyIv) {
  let ivBuf, ctBuf;
  if (legacyIv !== undefined) {
    ivBuf = Uint8Array.from(atob(legacyIv),    c => c.charCodeAt(0));
    ctBuf = Uint8Array.from(atob(payloadOrCt), c => c.charCodeAt(0));
  } else {
    const dot = payloadOrCt.indexOf('.');
    ivBuf = Uint8Array.from(atob(payloadOrCt.slice(0, dot)),  c => c.charCodeAt(0));
    ctBuf = Uint8Array.from(atob(payloadOrCt.slice(dot + 1)), c => c.charCodeAt(0));
  }
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBuf }, sharedKey, ctBuf);
  return new TextDecoder().decode(plain);
}
