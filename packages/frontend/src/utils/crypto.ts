// ═══════════════════════════════════════════════════════════════════
// Shared AES-256-GCM Encryption Utilities
// Used by both AI key encryption and Dev Mode GitHub PAT encryption.
// Key is derived from userId + app salt using PBKDF2 so:
// - Same user on any device → same key (cross-device cloud sync)
// - Different users → different keys (isolation)
// - Database breach → encrypted blobs, not plaintext
// ═══════════════════════════════════════════════════════════════════

const ENCRYPTION_APP_SALT = '0colors-shared-encryption-v1-salt';

export async function deriveEncryptionKey(userId: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(userId + ENCRYPTION_APP_SALT), 'PBKDF2', false, ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('0colors-pbkdf2-fixed-salt'), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptString(plaintext: string, key: CryptoKey): Promise<string> {
  if (!plaintext) return '';
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, enc.encode(plaintext),
  );
  // Combine iv + ciphertext → base64
  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode(...combined));
}

export async function decryptString(encrypted: string, key: CryptoKey): Promise<string> {
  if (!encrypted) return '';
  try {
    const raw = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));
    const iv = raw.slice(0, 12);
    const ciphertext = raw.slice(12);
    const plainBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv }, key, ciphertext,
    );
    return new TextDecoder().decode(plainBuf);
  } catch (e: any) {
    console.log(`[Crypto] Decryption failed (key may have changed): ${e?.message}`);
    return ''; // Return empty — user will need to re-enter
  }
}

/**
 * High-level helper: encrypt a GitHub PAT for storage.
 * Returns the encrypted base64 string.
 */
export async function encryptPAT(pat: string, userId: string): Promise<string> {
  const key = await deriveEncryptionKey(userId);
  return encryptString(pat, key);
}

/**
 * High-level helper: decrypt a stored GitHub PAT.
 * Returns plaintext PAT or empty string on failure.
 */
export async function decryptPAT(encrypted: string, userId: string): Promise<string> {
  const key = await deriveEncryptionKey(userId);
  return decryptString(encrypted, key);
}
