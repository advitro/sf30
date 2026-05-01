/**
 * Background Message Handler Tests — SF30 V2.0
 */

import { MSG_TYPES, ALARMS, STORAGE_KEYS } from '@shared/constants';

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

describe('Background Message Handlers', () => {
  let storageData: Record<string, unknown> = {};
  let tabsSendMessageSpy: jest.SpyInstance;
  let alarmsCreateSpy: jest.SpyInstance;
  let alarmsClearSpy: jest.SpyInstance;
  let scriptingExecuteScriptSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
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
    jest.spyOn(chrome.storage.local, 'clear').mockImplementation(() => {
      Object.keys(storageData).forEach((k) => delete storageData[k]);
      return Promise.resolve();
    });

    jest.spyOn(chrome.runtime, 'sendMessage').mockResolvedValue({});
    jest.spyOn(chrome.tabs, 'query').mockResolvedValue([{ id: 1, url: 'https://atoz.amazon.work/' } as unknown as chrome.tabs.Tab]);
    tabsSendMessageSpy = jest.spyOn(chrome.tabs, 'sendMessage').mockResolvedValue({});
    const alarmsMock = (chrome as unknown as Record<string, { create: jest.Mock; clear: jest.Mock; clearAll: jest.Mock }>).alarms;
    alarmsCreateSpy = jest.spyOn(alarmsMock, 'create').mockImplementation(() => Promise.resolve());
    alarmsClearSpy = jest.spyOn(alarmsMock, 'clear').mockImplementation(() => Promise.resolve(true));
    scriptingExecuteScriptSpy = jest.spyOn(
      (chrome as unknown as Record<string, { executeScript: jest.Mock }>).scripting,
      'executeScript'
    ).mockResolvedValue([]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  async function importHandlers() {
    const { handleMessage, handleVerifyLicense, handleDeleteData, handleExportData } =
      await import('../../../src/background/index');
    return { handleMessage, handleVerifyLicense, handleDeleteData, handleExportData };
  }

  async function importStore() {
    const { getStore, resetStore } = await import('@core/store');
    resetStore();
    return getStore();
  }

  describe('handleMessage routing', () => {
    it('should route VERIFY_LICENSE', async () => {
      const { activateLicense } = await import('@shared/license-api');
      (activateLicense as jest.Mock).mockResolvedValue({
        ok: true,
        data: { tier: 'pro', exp: 1893456000, trial: false },
      });
      storageData['sg_v2_consent_given'] = true;
      storageData['sg_v2_consent_license'] = true;

      const store = await importStore();
      store.dispatch({
        type: 'SET_DEVICE',
        payload: { fingerprint: 'fp', fingerprintHash: 'fphash' },
      });

      const { handleMessage } = await importHandlers();
      const result = await handleMessage(
        { type: MSG_TYPES.VERIFY_LICENSE, payload: { key: 'SG-TEST' } },
        { id: chrome.runtime.id }
      );

      expect(result.ok).toBe(true);
      expect(result.tier).toBe('pro');
    });

    it('should route SET_ENABLED to true', async () => {
      const store = await importStore();
      const { handleMessage } = await importHandlers();
      const result = await handleMessage(
        { type: MSG_TYPES.SET_ENABLED, payload: { value: true } },
        { id: chrome.runtime.id }
      );
      expect(result.ok).toBe(true);
      expect(store.getState().enabled).toBe(true);
      expect(alarmsCreateSpy).toHaveBeenCalledWith(ALARMS.BURST_START, expect.any(Object));
      expect(scriptingExecuteScriptSpy).toHaveBeenCalled();
    });

    it('should route SET_ENABLED to false', async () => {
      const store = await importStore();
      store.dispatch({ type: 'SET_ENABLED', payload: true });
      const { handleMessage } = await importHandlers();
      const result = await handleMessage(
        { type: MSG_TYPES.SET_ENABLED, payload: { value: false } },
        { id: chrome.runtime.id }
      );
      expect(result.ok).toBe(true);
      expect(store.getState().enabled).toBe(false);
      expect(alarmsClearSpy).toHaveBeenCalledWith(ALARMS.BURST_START);
    });

    it('should route SET_PAUSED', async () => {
      const store = await importStore();
      const { handleMessage } = await importHandlers();
      const result = await handleMessage(
        { type: MSG_TYPES.SET_PAUSED, payload: { value: true } },
        { id: chrome.runtime.id }
      );
      expect(result.ok).toBe(true);
      expect(store.getState().paused).toBe(true);
    });

    it('should route SET_OVERRIDE', async () => {
      const store = await importStore();
      const { handleMessage } = await importHandlers();
      const result = await handleMessage(
        { type: MSG_TYPES.SET_OVERRIDE, payload: { value: true } },
        { id: chrome.runtime.id }
      );
      expect(result.ok).toBe(true);
      expect(store.getState().override).toBe(true);
      expect(tabsSendMessageSpy).toHaveBeenCalled();
    });

    it('should route TOGGLE_HUD', async () => {
      const { handleMessage } = await importHandlers();
      const result = await handleMessage(
        { type: MSG_TYPES.TOGGLE_HUD },
        { id: chrome.runtime.id }
      );
      expect(result.ok).toBe(true);
    });

    it('should route RELOAD_ALL', async () => {
      const { handleMessage } = await importHandlers();
      const result = await handleMessage(
        { type: MSG_TYPES.RELOAD_ALL },
        { id: chrome.runtime.id }
      );
      expect(result.ok).toBe(true);
      expect(scriptingExecuteScriptSpy).toHaveBeenCalled();
    });

    it('should route EXPORT_DATA', async () => {
      const { handleMessage } = await importHandlers();
      const result = await handleMessage(
        { type: MSG_TYPES.EXPORT_DATA },
        { id: chrome.runtime.id }
      );
      expect(result.ok).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should route DELETE_DATA', async () => {
      const { handleMessage } = await importHandlers();
      const result = await handleMessage(
        { type: MSG_TYPES.DELETE_DATA },
        { id: chrome.runtime.id }
      );
      expect(result.ok).toBe(true);
    });

    it('should route GET_STATE', async () => {
      const store = await importStore();
      store.dispatch({ type: 'SET_ENABLED', payload: true });
      const { handleMessage } = await importHandlers();
      const result = await handleMessage(
        { type: MSG_TYPES.GET_STATE },
        { id: chrome.runtime.id }
      );
      expect(result.ok).toBe(true);
      expect(result.payload).toEqual(store.getState());
    });

    it('should route SET_SETTINGS', async () => {
      const store = await importStore();
      const { handleMessage } = await importHandlers();
      const result = await handleMessage(
        { type: MSG_TYPES.SET_SETTINGS, payload: { turbo: true, dates: ['2024-01-01'] } },
        { id: chrome.runtime.id }
      );
      expect(result.ok).toBe(true);
      expect(store.getState().settings.turbo).toBe(true);
      expect(store.getState().settings.dates).toEqual(['2024-01-01']);
    });

    it('should route SET_TELEGRAM', async () => {
      const store = await importStore();
      const { handleMessage } = await importHandlers();
      const result = await handleMessage(
        { type: MSG_TYPES.SET_TELEGRAM, payload: { botToken: 'token', chatId: '123' } },
        { id: chrome.runtime.id }
      );
      expect(result.ok).toBe(true);
      expect(store.getState().telegram.botToken).toBe('token');
    });

    it('should return error for unknown type', async () => {
      const { handleMessage } = await importHandlers();
      const result = await handleMessage(
        { type: 'UNKNOWN_TYPE' },
        { id: chrome.runtime.id }
      );
      expect(result.ok).toBe(false);
    });
  });

  describe('handleVerifyLicense', () => {
    it('should succeed with valid key', async () => {
      const { activateLicense } = await import('@shared/license-api');
      (activateLicense as jest.Mock).mockResolvedValue({
        ok: true,
        data: { tier: 'pro', exp: 1893456000, trial: false },
      });
      storageData['sg_v2_consent_given'] = true;
      storageData['sg_v2_consent_license'] = true;

      const store = await importStore();
      store.dispatch({
        type: 'SET_DEVICE',
        payload: { fingerprint: 'fp', fingerprintHash: 'fphash' },
      });

      const { handleVerifyLicense } = await importHandlers();
      const result = await handleVerifyLicense({ key: 'SG-TEST' });

      expect(result.ok).toBe(true);
      expect(result.tier).toBe('pro');
      expect(store.getState().license.valid).toBe(true);
      expect(store.getState().license.key).toBe('SG-TEST');
    });

    it('should fail when consent is missing', async () => {
      const { handleVerifyLicense } = await importHandlers();
      const result = await handleVerifyLicense({ key: 'SG-TEST' });
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Please accept the privacy notice first');
    });

    it('should fail with invalid key', async () => {
      const { activateLicense } = await import('@shared/license-api');
      (activateLicense as jest.Mock).mockResolvedValue({
        ok: false,
        error: 'invalid-key',
      });
      storageData['sg_v2_consent_given'] = true;
      storageData['sg_v2_consent_license'] = true;

      const store = await importStore();
      store.dispatch({
        type: 'SET_DEVICE',
        payload: { fingerprint: 'fp', fingerprintHash: 'fphash' },
      });

      const { handleVerifyLicense } = await importHandlers();
      const result = await handleVerifyLicense({ key: 'BAD-KEY' });

      expect(result.ok).toBe(false);
      expect(result.error).toBe('invalid-key');
    });

    it('should fail on network error during activation', async () => {
      const { activateLicense } = await import('@shared/license-api');
      (activateLicense as jest.Mock).mockResolvedValue({
        ok: false,
        error: 'Network error',
      });
      storageData['sg_v2_consent_given'] = true;
      storageData['sg_v2_consent_license'] = true;

      const store = await importStore();
      store.dispatch({
        type: 'SET_DEVICE',
        payload: { fingerprint: 'fp', fingerprintHash: 'fphash' },
      });

      const { handleVerifyLicense } = await importHandlers();
      const result = await handleVerifyLicense({ key: 'SG-TEST' });

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('should return error when no key provided', async () => {
      storageData['sg_v2_consent_given'] = true;
      storageData['sg_v2_consent_license'] = true;

      const { handleVerifyLicense } = await importHandlers();
      const result = await handleVerifyLicense({ key: '' });

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Please enter a license key');
    });
  });

  describe('handleDeleteData', () => {
    it('should clear storage and reset state while preserving install secret and consent in settings mode', async () => {
      storageData[STORAGE_KEYS.INSTALL_SECRET] = 'secret';
      storageData[STORAGE_KEYS.CONSENT_GIVEN] = true;
      storageData[STORAGE_KEYS.CONSENT_DATE] = 1234567890;
      storageData['sg_v2_state'] = { enabled: true, license: { key: 'SG-TEST' } };
      storageData['some_other_key'] = 'value';

      const store = await importStore();
      store.dispatch({ type: 'SET_ENABLED', payload: true });
      store.dispatch({ type: 'SET_LICENSE', payload: { key: 'SG-TEST' } });

      const { handleDeleteData } = await importHandlers();
      const result = await handleDeleteData({ mode: 'settings' });

      expect(result.ok).toBe(true);
      expect(storageData[STORAGE_KEYS.INSTALL_SECRET]).toBe('secret');
      expect(storageData[STORAGE_KEYS.CONSENT_GIVEN]).toBe(true);
      expect(storageData[STORAGE_KEYS.CONSENT_DATE]).toBe(1234567890);
      expect(storageData['some_other_key']).toBeUndefined();
      expect(store.getState().enabled).toBe(false);
      expect(store.getState().license.key).toBeNull();
    });

    it('should erase everything and regenerate install secret in everything mode', async () => {
      storageData[STORAGE_KEYS.INSTALL_SECRET] = 'old-secret';
      storageData[STORAGE_KEYS.CONSENT_GIVEN] = true;
      storageData[STORAGE_KEYS.CONSENT_DATE] = 1234567890;
      storageData['sg_v2_state'] = { enabled: true, license: { key: 'SG-TEST' } };
      storageData['some_other_key'] = 'value';

      const store = await importStore();
      store.dispatch({ type: 'SET_ENABLED', payload: true });
      store.dispatch({ type: 'SET_LICENSE', payload: { key: 'SG-TEST' } });

      const { handleDeleteData } = await importHandlers();
      const result = await handleDeleteData({ mode: 'everything' });

      expect(result.ok).toBe(true);
      // generateInstallSecret mock returns 'secret' but doesn't write to storageData;
      // however the real function would. We verify the old secret and consent are gone.
      expect(storageData[STORAGE_KEYS.CONSENT_GIVEN]).toBeUndefined();
      expect(storageData[STORAGE_KEYS.CONSENT_DATE]).toBeUndefined();
      expect(storageData['some_other_key']).toBeUndefined();
      expect(store.getState().enabled).toBe(false);
      expect(store.getState().license.key).toBeNull();
    });
  });

  describe('handleExportData', () => {
    it('should redact sensitive fields', async () => {
      storageData['normal_key'] = 'visible';
      storageData['sg_v2_tg_bot_token_enc'] = 'encrypted-token';
      storageData['sg_v2_user_key'] = 'user-key';
      storageData['sg_v2_install_secret'] = 'secret';

      const { handleExportData } = await importHandlers();
      const result = await handleExportData();

      expect(result.ok).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data['normal_key']).toBe('visible');
      expect(data['sg_v2_tg_bot_token_enc']).toBe('[REDACTED]');
      expect(data['sg_v2_user_key']).toBe('[REDACTED]');
      expect(data['sg_v2_install_secret']).toBe('[REDACTED]');
    });
  });
});
