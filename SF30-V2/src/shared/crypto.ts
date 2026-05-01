/**
 * Crypto Utilities — SF30 V2.0
 *
 * AES-GCM encryption for credential storage with:
 * - Random salt per encryption (stored alongside ciphertext)
 * - PBKDF2 with 600,000 iterations (OWASP 2023 recommendation)
 * - 256-bit AES-GCM keys
 * - Unique IV per encryption operation
 *
 * NO dead HMAC code. NO fixed salts. NO weak iteration counts.
 */

// ── Constants ──

/** PBKDF2 iteration count — OWASP 2023 recommendation for SHA-256 */
export const PBKDF2_ITERATIONS = 600_000;

/** AES key length in bits */
export const AES_KEY_BITS = 256;

/** AES-GCM IV length in bytes */
export const IV_LENGTH_BYTES = 12;

/** Salt length in bytes */
export const SALT_LENGTH_BYTES = 16;

// ── Types ──

export interface EncryptedPayload {
  /** Base64-encoded salt */
  readonly salt: string;
  /** Base64-encoded IV */
  readonly iv: string;
  /** Base64-encoded ciphertext */
  readonly ciphertext: string;
  /** Key derivation parameters for future compatibility */
  readonly kdf: {
    readonly algorithm: 'PBKDF2';
    readonly hash: 'SHA-256';
    readonly iterations: number;
  };
}

// ── Key Derivation ──

/**
 * Derives an AES-GCM key from a passphrase using PBKDF2.
 *
 * @param passphrase — high-entropy passphrase (e.g., install secret + device fingerprint)
 * @param salt — random salt (must be stored alongside ciphertext)
 */
export async function deriveKey(
  passphrase: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const encoder = new TextEncoder();

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  // Create a copy of the salt to satisfy TypeScript's strict DOM types
  // (Uint8Array<ArrayBufferLike> vs Uint8Array<ArrayBuffer>)
  const saltCopy = new Uint8Array(salt);

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltCopy,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: AES_KEY_BITS },
    false,
    ['encrypt', 'decrypt']
  );
}

// ── Encryption ──

/**
 * Encrypts plaintext using AES-GCM with a random salt and IV.
 *
 * The salt is generated per-encryption and stored in the returned payload.
 * This allows decryption without a pre-shared salt.
 *
 * @param plaintext — string to encrypt
 * @param passphrase — high-entropy passphrase
 * @returns Encrypted payload with all parameters needed for decryption
 */
export async function encrypt(plaintext: string, passphrase: string): Promise<EncryptedPayload> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES));
  const key = await deriveKey(passphrase, salt);

  const encoder = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext)
  );

  return {
    salt: arrayBufferToBase64(salt.buffer),
    iv: arrayBufferToBase64(iv.buffer),
    ciphertext: arrayBufferToBase64(ciphertext),
    kdf: {
      algorithm: 'PBKDF2',
      hash: 'SHA-256',
      iterations: PBKDF2_ITERATIONS,
    },
  };
}

// ── Decryption ──

/**
 * Decrypts an AES-GCM ciphertext.
 *
 * @param payload — encrypted payload from encrypt()
 * @param passphrase — same passphrase used for encryption
 * @returns Decrypted plaintext string
 * @throws If decryption fails (wrong passphrase, tampered data, etc.)
 */
export async function decrypt(payload: EncryptedPayload, passphrase: string): Promise<string> {
  const salt = base64ToArrayBuffer(payload.salt);
  const iv = base64ToArrayBuffer(payload.iv);
  const ciphertext = base64ToArrayBuffer(payload.ciphertext);

  const key = await deriveKey(passphrase, new Uint8Array(salt));

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(iv) },
    key,
    new Uint8Array(ciphertext)
  );

  return new TextDecoder().decode(decrypted);
}

// ── Helper Functions ──

/**
 * Computes SHA-256 hash of a string.
 * Exported for use by security.ts and other modules.
 */
export async function computeHash(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const buffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  const array = Array.from(new Uint8Array(buffer));
  return array.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// ── Legacy Compatibility ──

/**
 * Decrypts legacy V1.0 ciphertext (fixed salt format).
 * Used only for migration — new data uses encrypt() above.
 *
 * @deprecated Remove after one major version cycle
 */
export async function decryptLegacy(encrypted: { iv: number[]; data: number[] }, passphrase: string): Promise<string> {
  const encoder = new TextEncoder();
  const fixedSalt = encoder.encode('sg-salt-v1-fixed');

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: fixedSalt, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );

  const iv = new Uint8Array(encrypted.iv);
  const data = new Uint8Array(encrypted.data);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );

  return new TextDecoder().decode(decrypted);
}
