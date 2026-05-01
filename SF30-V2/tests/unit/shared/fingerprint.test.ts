/**
 * Fingerprint Tests — SF30 V2.0
 */

import {
  getDeviceFingerprint,
  getFingerprintHash,
  clearFingerprintCache,
} from '../../../src/shared/fingerprint';

describe('Fingerprint', () => {
  let storageData: Record<string, unknown> = {};

  beforeEach(() => {
    storageData = {};
    // Mock canvas 2D context
    const mockContext = {
      textBaseline: '',
      font: '',
      fillStyle: '',
      fillRect: jest.fn(),
      fillText: jest.fn(),
    };
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      mockContext as unknown as CanvasRenderingContext2D
    );
    jest.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,test');

    // Mock chrome.storage.local
    jest.spyOn(chrome.storage.local, 'set').mockImplementation((items) => {
      Object.assign(storageData, items);
      return Promise.resolve();
    });
    jest.spyOn(chrome.storage.local, 'get').mockImplementation((keys) => {
      const result: Record<string, unknown> = {};
      const keyArray = Array.isArray(keys) ? keys : typeof keys === 'string' ? [keys] : Object.keys(storageData);
      for (const key of keyArray) {
        if (key in storageData) {result[key] = storageData[key];}
      }
      return Promise.resolve(result);
    });
    jest.spyOn(chrome.storage.local, 'remove').mockImplementation((keys) => {
      const keyArray = Array.isArray(keys) ? keys : [keys];
      for (const key of keyArray) {
        delete storageData[key];
      }
      return Promise.resolve();
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getDeviceFingerprint', () => {
    it('should generate a fingerprint string', async () => {
      const result = await getDeviceFingerprint();
      expect(result.fingerprint).toBeTruthy();
      expect(typeof result.fingerprint).toBe('string');
      expect(result.fingerprint.length).toBeGreaterThan(10);
    });

    it('should generate a fingerprint hash', async () => {
      const result = await getDeviceFingerprint();
      expect(result.fingerprintHash).toBeTruthy();
      expect(typeof result.fingerprintHash).toBe('string');
      expect(result.fingerprintHash).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex
    });

    it('should return cached fingerprint on subsequent calls', async () => {
      const first = await getDeviceFingerprint();
      const second = await getDeviceFingerprint();
      expect(second.fingerprint).toBe(first.fingerprint);
      expect(second.fingerprintHash).toBe(first.fingerprintHash);
    });
  });

  describe('getFingerprintHash', () => {
    it('should return hash when fingerprint exists', async () => {
      await getDeviceFingerprint();
      const hash = await getFingerprintHash();
      expect(hash).toBeTruthy();
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('clearFingerprintCache', () => {
    it('should clear cached fingerprint', async () => {
      await getDeviceFingerprint();
      expect(storageData['sg_v2_device_fp']).toBeDefined();
      await clearFingerprintCache();
      expect(storageData['sg_v2_device_fp']).toBeUndefined();
      expect(storageData['sg_v2_device_fp_hash']).toBeUndefined();
    });
  });
});
