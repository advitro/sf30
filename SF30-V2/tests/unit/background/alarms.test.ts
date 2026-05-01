/**
 * Background Alarm Handler Tests — SF30 V2.0
 */

import { MSG_TYPES, TIMING, ALARMS } from '@shared/constants';

jest.mock('@shared/license-api', () => ({
  activateLicense: jest.fn(),
  validateLicense: jest.fn(),
  requestTrial: jest.fn(),
  fetchRevocationList: jest.fn(),
}));

jest.mock('@shared/security', () => ({
  validateMessageSender: jest.fn().mockReturnValue(true),
  validateMessageStructure: jest.fn().mockReturnValue({ valid: true }),
  generateInstallSecret: jest.fn().mockResolvedValue('secret'),
  getInstallSecret: jest.fn().mockResolvedValue('secret'),
  verifyServiceWorkerIntegrity: jest.fn().mockResolvedValue(true),
}));

jest.mock('@shared/fingerprint', () => ({
  getDeviceFingerprint: jest.fn().mockResolvedValue({ fingerprint: 'fp', fingerprintHash: 'fphash' }),
}));

jest.mock('@shared/telegram', () => ({
  queueTelegramMessage: jest.fn().mockResolvedValue(undefined),
  flushTelegramQueue: jest.fn().mockResolvedValue({ sent: 0, failed: 0 }),
  setTelegramConfig: jest.fn().mockResolvedValue(undefined),
}));

describe('Background Alarm Handlers', () => {
  let storageData: Record<string, unknown> = {};
  let sendMessageSpy: jest.SpyInstance;
  let tabsSendMessageSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.useRealTimers();
    storageData = {};

    (chrome as unknown as Record<string, unknown>).scripting = {
      executeScript: jest.fn().mockResolvedValue([]),
    };
    (chrome as unknown as Record<string, unknown>).alarms = {
      create: jest.fn().mockResolvedValue(undefined),
      clearAll: jest.fn().mockResolvedValue(true),
      clear: jest.fn().mockResolvedValue(true),
      onAlarm: { addListener: jest.fn() },
    };

    jest.spyOn(chrome.storage.local, 'set').mockImplementation((items) => {
      Object.assign(storageData, items);
      return Promise.resolve();
    });
    jest.spyOn(chrome.storage.local, 'get').mockImplementation((keys) => {
      const result: Record<string, unknown> = {};
      const keyArray = Array.isArray(keys)
        ? keys
        : typeof keys === 'string'
          ? [keys]
          : Object.keys(storageData);
      for (const key of keyArray) {
        if (key in storageData) {result[key] = storageData[key];}
      }
      return Promise.resolve(result);
    });

    sendMessageSpy = jest.spyOn(chrome.runtime, 'sendMessage').mockResolvedValue({});
    jest.spyOn(chrome.tabs, 'query').mockResolvedValue([{ id: 1, url: 'https://atoz.amazon.work/' } as unknown as chrome.tabs.Tab]);
    tabsSendMessageSpy = jest.spyOn(chrome.tabs, 'sendMessage').mockResolvedValue({});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  async function importAlarmHandlers() {
    const {
      handleTokenCheck,
      handleHeartbeat,
      handleTelegramFlush,
      handleRevocationSync,
      handleBurstStart,
      handleCleanup,
      handleMessage,
      setupAlarms,
    } = await import('../../../src/background/index');
    return { handleTokenCheck, handleHeartbeat, handleTelegramFlush, handleRevocationSync, handleBurstStart, handleCleanup, handleMessage, setupAlarms };
  }

  async function importStore() {
    const { getStore, resetStore } = await import('@core/store');
    resetStore();
    return getStore();
  }

  describe('handleTokenCheck', () => {
    it('should disable extension when license is expired', async () => {
      storageData['sg_v2_consent_given'] = true;
      storageData['sg_v2_consent_license'] = true;
      const store = await importStore();
      store.dispatch({
        type: 'SET_LICENSE',
        payload: { key: 'SG-TEST', valid: true, exp: Math.floor(Date.now() / 1000) - 100 },
      });

      const { handleTokenCheck } = await importAlarmHandlers();
      await handleTokenCheck();

      expect(store.getState().enabled).toBe(false);
      expect(store.getState().license.valid).toBe(false);
      expect(sendMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: MSG_TYPES.KILL_SWITCH })
      );
    });

    it('should skip when consent not given', async () => {
      const store = await importStore();
      store.dispatch({
        type: 'SET_LICENSE',
        payload: { key: 'SG-TEST', valid: true, exp: Math.floor(Date.now() / 1000) - 100 },
      });

      const { handleTokenCheck } = await importAlarmHandlers();
      await handleTokenCheck();

      expect(store.getState().enabled).toBe(false); // unchanged (default)
    });
  });

  describe('handleHeartbeat', () => {
    it('should regenerate fingerprint if missing', async () => {
      storageData['sg_v2_consent_given'] = true;
      storageData['sg_v2_consent_license'] = true;
      const store = await importStore();
      const { handleHeartbeat } = await importAlarmHandlers();
      await handleHeartbeat();

      expect(store.getState().device.fingerprint).toBe('fp');
      expect(sendMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: MSG_TYPES.STATE_CHANGED })
      );
    });

    it('should validate license if due', async () => {
      storageData['sg_v2_consent_given'] = true;
      storageData['sg_v2_consent_license'] = true;
      const { validateLicense } = await import('@shared/license-api');
      (validateLicense as jest.Mock).mockResolvedValue({
        ok: true,
        data: { tier: 'pro', exp: 1893456000, revoked: false },
      });

      const store = await importStore();
      store.dispatch({
        type: 'SET_DEVICE',
        payload: { fingerprint: 'fp', fingerprintHash: 'fphash' },
      });
      store.dispatch({
        type: 'SET_LICENSE',
        payload: {
          key: 'SG-TEST',
          valid: true,
          lastVerified: Math.floor(Date.now() / 1000) - 4000,
          tier: 'basic',
        },
      });

      const { handleHeartbeat } = await importAlarmHandlers();
      await handleHeartbeat();

      expect(validateLicense).toHaveBeenCalled();
      expect(store.getState().license.lastVerified).toBeGreaterThan(0);
    });

    it('should revoke license when validation shows revoked', async () => {
      storageData['sg_v2_consent_given'] = true;
      storageData['sg_v2_consent_license'] = true;
      const { validateLicense } = await import('@shared/license-api');
      (validateLicense as jest.Mock).mockResolvedValue({
        ok: true,
        data: { revoked: true },
      });

      const store = await importStore();
      store.dispatch({
        type: 'SET_DEVICE',
        payload: { fingerprint: 'fp', fingerprintHash: 'fphash' },
      });
      store.dispatch({
        type: 'SET_LICENSE',
        payload: {
          key: 'SG-TEST',
          valid: true,
          lastVerified: Math.floor(Date.now() / 1000) - 4000,
        },
      });

      const { handleHeartbeat } = await importAlarmHandlers();
      await handleHeartbeat();

      expect(store.getState().enabled).toBe(false);
      expect(store.getState().license.revoked).toBe(true);
      expect(sendMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MSG_TYPES.KILL_SWITCH,
          payload: expect.objectContaining({ reason: 'revoked' }),
        })
      );
    });
  });

  describe('handleTelegramFlush', () => {
    it('should skip when consent not given', async () => {
      const { flushTelegramQueue } = await import('@shared/telegram');
      const { handleTelegramFlush } = await importAlarmHandlers();
      await handleTelegramFlush();
      expect(flushTelegramQueue).not.toHaveBeenCalled();
    });

    it('should flush queue when consent given', async () => {
      storageData['sg_v2_consent_given'] = true;
      storageData['sg_v2_consent_telegram'] = true;
      const { flushTelegramQueue } = await import('@shared/telegram');
      const { handleTelegramFlush } = await importAlarmHandlers();
      await handleTelegramFlush();
      expect(flushTelegramQueue).toHaveBeenCalled();
    });
  });

  describe('handleRevocationSync', () => {
    it('should be a no-op in serverless mode', async () => {
      const store = await importStore();
      store.dispatch({
        type: 'SET_LICENSE',
        payload: { key: 'SG-REVOKED', valid: true },
      });
      store.dispatch({ type: 'SET_ENABLED', payload: true });

      const { handleRevocationSync } = await importAlarmHandlers();
      await handleRevocationSync();

      // Serverless mode: revocation sync does nothing
      expect(store.getState().enabled).toBe(true);
      expect(store.getState().license.revoked).toBeFalsy();
    });
  });

  describe('handleBurstStart', () => {
    it('should enter burst mode and restore after 10 seconds', async () => {
      jest.useFakeTimers();
      storageData['sg_v2_consent_given'] = true;
      const store = await importStore();
      store.dispatch({ type: 'SET_ENABLED', payload: true });

      const { handleBurstStart } = await importAlarmHandlers();
      await handleBurstStart();

      expect(store.getState().runtime.burstRemaining).toBe(10);
      expect(tabsSendMessageSpy).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          type: MSG_TYPES.SET_SPEED,
          payload: expect.objectContaining({ turbo: true }),
        })
      );

      await jest.advanceTimersByTimeAsync(10000);

      expect(store.getState().runtime.burstRemaining).toBe(0);
      jest.useRealTimers();
    });

    it('should do nothing when paused', async () => {
      const store = await importStore();
      store.dispatch({ type: 'SET_ENABLED', payload: true });
      store.dispatch({ type: 'SET_PAUSED', payload: true });

      const { handleBurstStart } = await importAlarmHandlers();
      await handleBurstStart();

      expect(store.getState().runtime.burstRemaining).toBe(0);
      expect(tabsSendMessageSpy).not.toHaveBeenCalled();
    });
  });

  describe('handleCleanup', () => {
    it('should remove old error logs', async () => {
      const oldLog = {
        timestamp: Date.now() - TIMING.ERROR_LOG_MAX_AGE_DAYS * 24 * 60 * 60 * 1000 - 1000,
        category: 'test',
        message: 'old',
      };
      const newLog = { timestamp: Date.now(), category: 'test', message: 'new' };
      storageData['sg_v2_error_log'] = [oldLog, newLog];

      const { handleCleanup } = await importAlarmHandlers();
      await handleCleanup();

      const logs = storageData['sg_v2_error_log'] as Array<{ message: string }>;
      expect(logs).toHaveLength(1);
      expect(logs[0].message).toBe('new');
    });
  });

  describe('setupAlarms period accuracy', () => {
    it('should create alarms with correct periodInMinutes', async () => {
      const { setupAlarms } = await importAlarmHandlers();
      await setupAlarms();

      expect(chrome.alarms.create).toHaveBeenCalledWith(
        ALARMS.TOKEN_CHECK,
        expect.objectContaining({ periodInMinutes: 2 })
      );
      expect(chrome.alarms.create).toHaveBeenCalledWith(
        ALARMS.HEARTBEAT,
        expect.objectContaining({ periodInMinutes: 10 })
      );
      expect(chrome.alarms.create).toHaveBeenCalledWith(
        ALARMS.CLEANUP,
        expect.objectContaining({ periodInMinutes: 60 })
      );
      expect(chrome.alarms.create).toHaveBeenCalledWith(
        ALARMS.TELEGRAM_FLUSH,
        expect.objectContaining({ periodInMinutes: 1 })
      );
      expect(chrome.alarms.create).toHaveBeenCalledWith(
        ALARMS.REVOCATION_SYNC,
        expect.objectContaining({ periodInMinutes: 360 })
      );
    });
  });

  describe('burst mode duration timing', () => {
    it('should maintain burst for exactly 10000ms', async () => {
      jest.useFakeTimers();
      storageData['sg_v2_consent_given'] = true;
      const store = await importStore();
      store.dispatch({ type: 'SET_ENABLED', payload: true });

      const { handleBurstStart } = await importAlarmHandlers();
      await handleBurstStart();

      expect(store.getState().runtime.burstRemaining).toBe(10);

      // Just before the duration expires
      await jest.advanceTimersByTimeAsync(9999);
      expect(store.getState().runtime.burstRemaining).toBe(10);

      // Exactly at the duration boundary
      await jest.advanceTimersByTimeAsync(1);
      expect(store.getState().runtime.burstRemaining).toBe(0);

      jest.useRealTimers();
    });

    it('should restore normal speed after burst expires', async () => {
      jest.useFakeTimers();
      storageData['sg_v2_consent_given'] = true;
      const store = await importStore();
      store.dispatch({ type: 'SET_ENABLED', payload: true });

      const { handleBurstStart } = await importAlarmHandlers();
      await handleBurstStart();

      expect(tabsSendMessageSpy).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          type: MSG_TYPES.SET_SPEED,
          payload: expect.objectContaining({ turbo: true }),
        })
      );

      await jest.advanceTimersByTimeAsync(10000);

      expect(store.getState().runtime.burstRemaining).toBe(0);
      expect(tabsSendMessageSpy).toHaveBeenLastCalledWith(
        1,
        expect.objectContaining({
          type: MSG_TYPES.SET_SPEED,
          payload: expect.objectContaining({ turbo: false }),
        })
      );

      jest.useRealTimers();
    });
  });

  describe('rate limit backoff', () => {
    it('should set rateLimited state and nextDue on RATE_LIMITED message', async () => {
      const store = await importStore();
      const { handleMessage } = await importAlarmHandlers();

      const before = Date.now();
      const result = await handleMessage(
        { type: MSG_TYPES.RATE_LIMITED, payload: { limited: true } },
        { id: chrome.runtime.id }
      );
      const after = Date.now();

      expect(result.ok).toBe(true);
      expect(store.getState().runtime.rateLimited).toBe(true);
      expect(store.getState().runtime.nextDue).toBeGreaterThanOrEqual(before + TIMING.RATE_LIMIT_DURATION_MS);
      expect(store.getState().runtime.nextDue).toBeLessThanOrEqual(after + TIMING.RATE_LIMIT_DURATION_MS);
    });

    it('should use custom retryAfter when provided', async () => {
      const store = await importStore();
      const { handleMessage } = await importAlarmHandlers();

      const result = await handleMessage(
        { type: MSG_TYPES.RATE_LIMITED, payload: { limited: true, retryAfter: 15000 } },
        { id: chrome.runtime.id }
      );

      expect(result.ok).toBe(true);
      const expectedNextDue = Date.now() + 15000;
      expect(store.getState().runtime.nextDue).toBeGreaterThanOrEqual(expectedNextDue - 100);
      expect(store.getState().runtime.nextDue).toBeLessThanOrEqual(expectedNextDue + 100);
    });

    it('should clear rateLimited state when limited is false', async () => {
      const store = await importStore();
      store.dispatch({ type: 'SET_RUNTIME', payload: { rateLimited: true, nextDue: Date.now() + 30000 } });
      const { handleMessage } = await importAlarmHandlers();

      const result = await handleMessage(
        { type: MSG_TYPES.RATE_LIMITED, payload: { limited: false } },
        { id: chrome.runtime.id }
      );

      expect(result.ok).toBe(true);
      expect(store.getState().runtime.rateLimited).toBe(false);
      expect(store.getState().runtime.nextDue).toBeNull();
    });
  });

  describe('jitter constant', () => {
    it('should have POLL_JITTER_MS defined as 200', () => {
      expect(TIMING.POLL_JITTER_MS).toBe(200);
    });

    it('should have RATE_LIMIT_POLL_MS defined as 5000', () => {
      expect(TIMING.RATE_LIMIT_POLL_MS).toBe(5000);
    });
  });
});
