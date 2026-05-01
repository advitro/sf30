/**
 * License API Tests — SF30 V2.0 (Offline ECDSA Verification)
 */

import {
  activateLicense,
  validateLicense,
  requestTrial,
  fetchRevocationList,
} from '../../../src/shared/license-api';

describe('License API', () => {
  const TEST_FP = 'a'.repeat(64);
  const TEST_FP_WRONG = 'b'.repeat(64);
  let keypair: CryptoKeyPair | null = null;
  let publicKeyBase64 = '';

  beforeAll(async () => {
    keypair = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify']
    );
    const spki = await crypto.subtle.exportKey('spki', keypair.publicKey);
    publicKeyBase64 = arrayBufferToBase64(spki);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (globalThis as Record<string, unknown>).__LICENSE_PUBLIC_KEY__ = publicKeyBase64;
    (global as Record<string, unknown>).__LICENSE_PUBLIC_KEY__ = publicKeyBase64;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete (globalThis as Record<string, unknown>).__LICENSE_PUBLIC_KEY__;
    delete (global as Record<string, unknown>).__LICENSE_PUBLIC_KEY__;
  });

  // ── Helpers ──

  async function signLicense(
    payload: Record<string, unknown>
  ): Promise<string> {
    if (!keypair) throw new Error('Keypair not generated');
    const payloadJson = JSON.stringify(payload);
    const payloadB64 = toBase64url(new TextEncoder().encode(payloadJson));
    const sig = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      keypair.privateKey,
      new TextEncoder().encode(payloadJson)
    );
    const sigB64 = toBase64url(sig);
    return `sf30.${payloadB64}.${sigB64}`;
  }

  function makePayload(overrides: Record<string, unknown> = {}) {
    return {
      fp: TEST_FP,
      t: 'pro',
      e: Math.floor(Date.now() / 1000) + 86400 * 30,
      n: 'testnonce',
      ...overrides,
    };
  }

  // ── activateLicense ──

  describe('activateLicense', () => {
    it('should return success on valid key', async () => {
      const key = await signLicense(makePayload());
      const result = await activateLicense({
        key,
        fingerprint: 'fp-data',
        fingerprintHash: TEST_FP,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.tier).toBe('pro');
        expect(result.data.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
      }
    });

    it('should return error when public key is not configured', async () => {
      delete (globalThis as Record<string, unknown>).__LICENSE_PUBLIC_KEY__;
      const result = await activateLicense({
        key: 'sf30.xxx.yyy',
        fingerprint: 'fp',
        fingerprintHash: TEST_FP,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('License public key not configured');
      }
    });

    it('should return error on invalid key format', async () => {
      const result = await activateLicense({
        key: 'not-a-valid-key',
        fingerprint: 'fp',
        fingerprintHash: TEST_FP,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Invalid license key format');
      }
    });

    it('should return error on fingerprint mismatch', async () => {
      const key = await signLicense(makePayload());
      const result = await activateLicense({
        key,
        fingerprint: 'fp',
        fingerprintHash: TEST_FP_WRONG,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Device fingerprint mismatch');
      }
    });

    it('should return error on expired license', async () => {
      const key = await signLicense(
        makePayload({ e: Math.floor(Date.now() / 1000) - 100 })
      );
      const result = await activateLicense({
        key,
        fingerprint: 'fp',
        fingerprintHash: TEST_FP,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('License expired');
      }
    });

    it('should return error on tampered signature', async () => {
      const key = await signLicense(makePayload());
      const tampered = key.slice(0, -5) + 'XXXXX';
      const result = await activateLicense({
        key: tampered,
        fingerprint: 'fp',
        fingerprintHash: TEST_FP,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Invalid license signature');
      }
    });
  });

  // ── validateLicense ──

  describe('validateLicense', () => {
    it('should return validation result for valid key', async () => {
      const key = await signLicense(makePayload({ t: 'basic' }));
      const result = await validateLicense({
        key,
        fingerprintHash: TEST_FP,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.tier).toBe('basic');
      }
    });

    it('should return error for invalid tier', async () => {
      const key = await signLicense(makePayload({ t: 'enterprise' }));
      const result = await validateLicense({
        key,
        fingerprintHash: TEST_FP,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Invalid license tier');
      }
    });
  });

  // ── requestTrial ──

  describe('requestTrial', () => {
    it('should return error (trial not available)', async () => {
      const result = await requestTrial(
        { fingerprintHash: TEST_FP },
        'secret'
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Trial not available');
      }
    });
  });

  // ── fetchRevocationList ──

  describe('fetchRevocationList', () => {
    it('should return null (serverless)', async () => {
      const result = await fetchRevocationList('secret');
      expect(result).toBeNull();
    });
  });
});

// ── Encoding Helpers ──

function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function toBase64url(buffer: ArrayBuffer | Uint8Array): string {
  return arrayBufferToBase64(buffer)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
