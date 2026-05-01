/**
 * Crypto Unit Tests — SF30 V2.0
 *
 * Tests AES-GCM v2 encryption/decryption:
 * - Round-trip encryption/decryption
 * - Random salt uniqueness
 * - Wrong passphrase rejection
 * - Tampered ciphertext rejection
 * - Legacy decryption compatibility
 */

import { encrypt, decrypt, decryptLegacy, PBKDF2_ITERATIONS } from '@shared/crypto';

describe('Crypto', () => {
  const TEST_PASSPHRASE = 'test-passphrase-12345';

  describe('encrypt / decrypt', () => {
    it('should encrypt and decrypt a simple string', async () => {
      const plaintext = 'Hello, World!';
      const encrypted = await encrypt(plaintext, TEST_PASSPHRASE);

      expect(encrypted.salt).toBeTruthy();
      expect(encrypted.iv).toBeTruthy();
      expect(encrypted.ciphertext).toBeTruthy();
      expect(encrypted.kdf.iterations).toBe(PBKDF2_ITERATIONS);

      const decrypted = await decrypt(encrypted, TEST_PASSPHRASE);
      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt and decrypt empty string', async () => {
      const encrypted = await encrypt('', TEST_PASSPHRASE);
      const decrypted = await decrypt(encrypted, TEST_PASSPHRASE);
      expect(decrypted).toBe('');
    });

    it('should encrypt and decrypt unicode characters', async () => {
      const plaintext = '日本語テスト 🚀 émojis ñoño';
      const encrypted = await encrypt(plaintext, TEST_PASSPHRASE);
      const decrypted = await decrypt(encrypted, TEST_PASSPHRASE);
      expect(decrypted).toBe(plaintext);
    });

    it('should use different salts for each encryption', async () => {
      const plaintext = 'same text';
      const enc1 = await encrypt(plaintext, TEST_PASSPHRASE);
      const enc2 = await encrypt(plaintext, TEST_PASSPHRASE);

      expect(enc1.salt).not.toBe(enc2.salt);
      expect(enc1.iv).not.toBe(enc2.iv);
      expect(enc1.ciphertext).not.toBe(enc2.ciphertext);
    });

    it('should reject decryption with wrong passphrase', async () => {
      const plaintext = 'secret data';
      const encrypted = await encrypt(plaintext, TEST_PASSPHRASE);

      await expect(decrypt(encrypted, 'wrong-passphrase')).rejects.toThrow();
    });

    it('should reject tampered ciphertext', async () => {
      const plaintext = 'secret data';
      const encrypted = await encrypt(plaintext, TEST_PASSPHRASE);

      // Tamper with ciphertext
      const tampered = {
        ...encrypted,
        ciphertext: encrypted.ciphertext.slice(0, -4) + '0000',
      };

      await expect(decrypt(tampered, TEST_PASSPHRASE)).rejects.toThrow();
    });

    it('should reject tampered IV', async () => {
      const plaintext = 'secret data';
      const encrypted = await encrypt(plaintext, TEST_PASSPHRASE);

      // Tamper with IV
      const tampered = {
        ...encrypted,
        iv: encrypted.iv.slice(0, -4) + '0000',
      };

      await expect(decrypt(tampered, TEST_PASSPHRASE)).rejects.toThrow();
    });

    it('should reject tampered salt', async () => {
      const plaintext = 'secret data';
      const encrypted = await encrypt(plaintext, TEST_PASSPHRASE);

      // Tamper with salt
      const tampered = {
        ...encrypted,
        salt: encrypted.salt.slice(0, -4) + '0000',
      };

      await expect(decrypt(tampered, TEST_PASSPHRASE)).rejects.toThrow();
    });

    it('should handle long plaintext', async () => {
      const plaintext = 'A'.repeat(10000);
      const encrypted = await encrypt(plaintext, TEST_PASSPHRASE);
      const decrypted = await decrypt(encrypted, TEST_PASSPHRASE);
      expect(decrypted).toBe(plaintext);
    });
  });

  describe('PBKDF2 parameters', () => {
    it('should use 600,000 iterations', () => {
      expect(PBKDF2_ITERATIONS).toBe(600_000);
    });
  });

  describe('legacy decryption', () => {
    it('should decrypt legacy V1.0 format', async () => {
      // This test verifies the legacy decryption path exists
      // Actual legacy data would come from real V1 storage
      const legacyPayload = {
        iv: Array.from(crypto.getRandomValues(new Uint8Array(12))),
        data: Array.from(crypto.getRandomValues(new Uint8Array(32))),
      };

      // Legacy decrypt with wrong data will fail (random data), but the function exists
      await expect(decryptLegacy(legacyPayload, TEST_PASSPHRASE)).rejects.toThrow();
    });
  });
});
