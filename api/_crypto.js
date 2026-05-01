// AES-256-GCM symmetric encryption for access tokens.
// Requires TOKEN_ENCRYPTION_KEY env var: 64 hex chars (32 bytes).
// Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
//
// Encrypted format stored in DB: "<iv_hex>:<authTag_hex>:<ciphertext_hex>"
// The auth tag makes decryption fail loudly if the ciphertext was tampered with.

import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

const ALGORITHM = 'aes-256-gcm';

function getKey() {
  const hex = process.env.TOKEN_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)');
  }
  return Buffer.from(hex, 'hex');
}

// Returns "<iv>:<authTag>:<ciphertext>" — all hex, colon-separated.
export function encrypt(plaintext) {
  const key = getKey();
  const iv = randomBytes(12); // 96-bit IV recommended for GCM
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

// Accepts the "<iv>:<authTag>:<ciphertext>" format produced by encrypt().
// Throws if the key is wrong or the ciphertext was modified.
export function decrypt(encoded) {
  const key = getKey();
  const parts = encoded.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted token format');
  const [ivHex, authTagHex, cipherHex] = parts;
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(cipherHex, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}
