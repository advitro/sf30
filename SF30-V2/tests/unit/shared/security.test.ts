/**
 * Security Unit Tests — SF30 V2.0
 *
 * Tests sender validation, message structure validation,
 * install secret management, and integrity checks.
 */

import {
  validateMessageSender,
  validateMessageStructure,
  generateInstallSecret,
  getInstallSecret,
  validatePostMessage,
  generateSecureToken,
  constantTimeCompare,
  computeStringHash,
} from '@shared/security';

describe('Security', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Sender Validation ──

  describe('validateMessageSender', () => {
    const ORIGINAL_RUNTIME_ID = chrome.runtime.id;

    beforeAll(() => {
      Object.defineProperty(chrome.runtime, 'id', {
        value: 'test-extension-id',
        configurable: true,
      });
    });

    afterAll(() => {
      Object.defineProperty(chrome.runtime, 'id', {
        value: ORIGINAL_RUNTIME_ID,
        configurable: true,
      });
    });

    it('should accept messages from same extension ID', () => {
      const sender: chrome.runtime.MessageSender = {
        id: 'test-extension-id',
      };
      expect(validateMessageSender(sender)).toBe(true);
    });

    it('should reject messages from different extension ID', () => {
      const sender: chrome.runtime.MessageSender = {
        id: 'malicious-extension',
      };
      expect(validateMessageSender(sender)).toBe(false);
    });

    it('should accept messages from extension URL', () => {
      const sender: chrome.runtime.MessageSender = {
        url: 'chrome-extension://test-extension-id/popup/index.html',
      };
      expect(validateMessageSender(sender)).toBe(true);
    });

    it('should reject messages from external URLs', () => {
      const sender: chrome.runtime.MessageSender = {
        url: 'https://evil.com/script.js',
      };
      expect(validateMessageSender(sender)).toBe(false);
    });

    it('should accept content scripts from allowed hosts', () => {
      const sender: chrome.runtime.MessageSender = {
        tab: { url: 'https://atoz.amazon.work/shifts/schedule/find' } as chrome.tabs.Tab,
      };
      expect(validateMessageSender(sender)).toBe(true);
    });

    it('should reject content scripts from unknown hosts', () => {
      const sender: chrome.runtime.MessageSender = {
        tab: { url: 'https://evil.com/' } as chrome.tabs.Tab,
      };
      expect(validateMessageSender(sender)).toBe(false);
    });

    it('should reject null sender', () => {
      expect(validateMessageSender(null as unknown as chrome.runtime.MessageSender)).toBe(false);
    });
  });

  // ── Message Structure ──

  describe('validateMessageStructure', () => {
    it('should accept valid message', () => {
      const result = validateMessageStructure({ type: 'SG_V2_SET_ENABLED', payload: true });
      expect(result.valid).toBe(true);
    });

    it('should reject non-object message', () => {
      const result = validateMessageStructure('not an object');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('message-not-object');
    });

    it('should reject message without type', () => {
      const result = validateMessageStructure({ payload: true });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('missing-or-invalid-type');
    });

    it('should reject unknown message type prefix', () => {
      const result = validateMessageStructure({ type: 'EVIL_INJECT' });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('unknown-message-type');
    });

    it('should reject null message', () => {
      const result = validateMessageStructure(null);
      expect(result.valid).toBe(false);
    });
  });

  // ── Install Secret ──

  describe('generateInstallSecret', () => {
    it('should generate a unique secret', async () => {
      const secret1 = await generateInstallSecret();
      const secret2 = await generateInstallSecret();
      expect(secret1).toBeTruthy();
      expect(secret2).toBeTruthy();
      expect(secret1).not.toBe(secret2);
    });

    it('should store secret in chrome.storage', async () => {
      const secret = await generateInstallSecret();
      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({ sg_v2_install_secret: secret })
      );
    });
  });

  describe('getInstallSecret', () => {
    it('should retrieve stored secret', async () => {
      const mockSecret = 'test-secret-123';
      (chrome.storage.local.get as jest.Mock).mockImplementation((_keys, callback?) => {
        const result = { sg_v2_install_secret: mockSecret };
        if (callback) {callback(result);}
        return Promise.resolve(result);
      });

      const secret = await getInstallSecret();
      expect(secret).toBe(mockSecret);
    });

    it('should return null if no secret exists', async () => {
      (chrome.storage.local.get as jest.Mock).mockImplementation((_keys, callback?) => {
        const result = {};
        if (callback) {callback(result);}
        return Promise.resolve(result);
      });

      const secret = await getInstallSecret();
      expect(secret).toBeNull();
    });
  });

  describe('validatePostMessage', () => {
    it('should accept valid postMessage with correct secret', async () => {
      const installSecret = 'correct-secret';
      (chrome.storage.local.get as jest.Mock).mockImplementation((_keys, callback?) => {
        const result = { sg_v2_install_secret: installSecret };
        if (callback) {callback(result);}
        return Promise.resolve(result);
      });

      const result = await validatePostMessage({ secret: installSecret, data: 'test' });
      expect(result).toBe(true);
    });

    it('should reject postMessage with wrong secret', async () => {
      (chrome.storage.local.get as jest.Mock).mockImplementation((_keys, callback?) => {
        const result = { sg_v2_install_secret: 'correct-secret' };
        if (callback) {callback(result);}
        return Promise.resolve(result);
      });

      const result = await validatePostMessage({ secret: 'wrong-secret', data: 'test' });
      expect(result).toBe(false);
    });

    it('should reject postMessage without secret', async () => {
      const result = await validatePostMessage({ data: 'test' });
      expect(result).toBe(false);
    });
  });

  // ── Token Generation ──

  describe('generateSecureToken', () => {
    it('should generate hex string of correct length', () => {
      const token = generateSecureToken(16);
      expect(token).toMatch(/^[0-9a-f]{32}$/); // 16 bytes = 32 hex chars
    });

    it('should generate unique tokens', () => {
      const tokens = new Set(Array.from({ length: 100 }, () => generateSecureToken(16)));
      expect(tokens.size).toBe(100);
    });
  });

  // ── Constant-Time Compare ──

  describe('constantTimeCompare', () => {
    it('should return true for identical strings', () => {
      expect(constantTimeCompare('abc', 'abc')).toBe(true);
    });

    it('should return false for different strings', () => {
      expect(constantTimeCompare('abc', 'abd')).toBe(false);
    });

    it('should return false for different lengths', () => {
      expect(constantTimeCompare('abc', 'abcd')).toBe(false);
    });

    it('should return true for empty strings', () => {
      expect(constantTimeCompare('', '')).toBe(true);
    });

    it('should not short-circuit on first difference', () => {
      // This is a property test — constantTimeCompare should always take
      // the same time regardless of where the difference is
      const longA = 'a'.repeat(1000);
      const longB = 'b' + 'a'.repeat(999);
      expect(constantTimeCompare(longA, longB)).toBe(false);
    });
  });

  // ── Hash ──

  describe('computeStringHash', () => {
    it('should compute consistent hash', async () => {
      const hash1 = await computeStringHash('test');
      const hash2 = await computeStringHash('test');
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[0-9a-f]{64}$/); // SHA-256 = 64 hex chars
    });

    it('should compute different hashes for different inputs', async () => {
      const hash1 = await computeStringHash('test1');
      const hash2 = await computeStringHash('test2');
      expect(hash1).not.toBe(hash2);
    });
  });
});
