// End-to-end message encryption using ECDH key agreement + AES-256-GCM.
//
// Flow:
//   1. Each user generates an ECDH P-256 keypair on first use — stored in localStorage.
//   2. Public keys are uploaded to Supabase so the other party can fetch them.
//   3. Both sides derive the SAME shared AES key: ECDH(myPrivKey, theirPubKey).
//   4. Messages are encrypted/decrypted with that shared key — the server only ever
//      sees ciphertext and can never read message content.

const ECDH_PARAMS = { name: 'ECDH', namedCurve: 'P-256' };
const AES_PARAMS  = { name: 'AES-GCM', length: 256 };
const LS_KEY      = 'ecdhKeyPair';

// Returns { privateKey (CryptoKey), publicKey (CryptoKey), publicKeyJwk (object) }
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
// Both sides derive the same key: ECDH(A_priv, B_pub) === ECDH(B_priv, A_pub)
export async function deriveSharedKey(myPrivateKey, theirPublicKey) {
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: theirPublicKey },
    myPrivateKey,
    AES_PARAMS,
    false,
    ['encrypt', 'decrypt']
  );
}

// Encrypt plaintext string → { ciphertext: base64, iv: base64 }
export async function encryptMessage(sharedKey, plaintext) {
  const iv        = crypto.getRandomValues(new Uint8Array(12));
  const encoded   = new TextEncoder().encode(plaintext);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, sharedKey, encoded);
  return {
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    iv:         btoa(String.fromCharCode(...iv)),
  };
}

// Decrypt { ciphertext: base64, iv: base64 } → plaintext string
export async function decryptMessage(sharedKey, ciphertext, iv) {
  const cipherBuf = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
  const ivBuf     = Uint8Array.from(atob(iv),         c => c.charCodeAt(0));
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBuf }, sharedKey, cipherBuf);
  return new TextDecoder().decode(decrypted);
}
